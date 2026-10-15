// app/api/portal/perbaikan/route.ts
//
// (15 Okt 2026) "Perbaiki administrasi" Transport Lokal -- aksi petugas (aturan: lib/sigapPerbaikan.ts). Tanpa migrasi, tanpa menghapus data.
//   POST { aksi: "kirim_laporan", penugasan_id, tanggal, items: [{ kk_id, hasil, alasan?, kunci }] }
//        Mencatat hasil pendataan KK dengan waktu kejadian = tanggal hari kerja itu (fungsi DB bencana_pendataan_catat yang sudah ada). Syarat:
//        penugasan milik akun & kegiatan pendataan (laporan diambil dari pendataan), tanggal lampau & hari kerja aktif, jendela perbaikan (izin susulan) masih
//        berlaku, belum pernah dikirim untuk tanggal itu, dan KK belum punya hasil. Sekali kirim per tanggal.
//   POST { aksi: "tidak_bekerja", penugasan_id, tanggal }
//        Menandai hari itu BUKAN hari kerja (sigap_hari_kerja.uji_coba_sampai = sekarang). Foto/laporan yang sudah ada tidak dihapus.
// "Masuk sebagai" (akun super) hanya boleh melihat: ditolak.

import { NextRequest, NextResponse } from "next/server";
import { HK_AKTIF, hariIniWib, penugasanAkun } from "@/lib/sigap";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, catatAudit } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { catatHasil } from "@/lib/portal/pendataan";
import { sumberUntukPeran } from "@/lib/realisasiOtomatis";
import { AUDIT_KIRIM_LAPORAN, AUDIT_TIDAK_BEKERJA, periksaKirim, periksaTidakBekerja, waktuPerbaikan } from "@/lib/sigapPerbaikan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk menyimpan.', 403);
  try {
    const body = await req.json().catch(() => null);
    const aksi = String((body as Record<string, unknown> | null)?.aksi ?? "");
    const hariIni = hariIniWib();
    const sekarang = new Date();

    // ---- pemeriksaan bersama: penugasan milik akun, tanggal lampau & hari kerja aktif, jendela perbaikan berlaku
    async function periksaJendela(penugasanId: number, tanggal: string) {
      const pen = (await penugasanAkun(db!, akun!.id)).find((p) => p.id === penugasanId);
      if (!pen) return { error: galat("Anda tidak terdaftar pada kegiatan ini.", 403) } as const;
      if (pen.dikunci_at) return { error: galat("SPJ kegiatan ini sudah diverifikasi & dikunci admin.", 403) } as const;
      if (tanggal >= hariIni) return { error: galat("Perbaikan hanya untuk tanggal yang sudah lewat.") } as const;
      const { data: hk } = await db!.from("sigap_hari_kerja").select("id").eq("penugasan_id", pen.id).eq("tanggal", tanggal).or(HK_AKTIF()).maybeSingle();
      if (!hk) return { error: galat("Tanggal itu bukan hari kerja Anda.") } as const;
      const { data: izin } = await db!.from("sigap_izin_susulan").select("id, berlaku_sampai").eq("penugasan_id", pen.id).eq("tanggal", tanggal).gt("berlaku_sampai", sekarang.toISOString());
      if (!izin || izin.length === 0) return { error: galat("Waktu perbaikan untuk tanggal ini sudah habis atau belum diberikan.", 403) } as const;
      return { pen, izinId: izin.map((x) => x.id as number) } as const;
    }

    // ---------------- Kirim perbaikan laporan ----------------
    if (aksi === "kirim_laporan") {
      const cek = periksaKirim(body);
      if (!cek.ok) return galat(cek.pesan);
      const { penugasan_id, tanggal, items } = cek.isi;
      const j = await periksaJendela(penugasan_id, tanggal);
      if ("error" in j) return j.error;
      const { pen } = j;
      if (sumberUntukPeran(pen.kegiatan.kode, pen.peran) !== "pendataan") return galat("Laporan kegiatan ini tidak diambil dari Lembar Pendataan.");
      if (!pen.kegiatan.wajib_laporan) return galat("Kegiatan ini tidak memerlukan laporan harian.");

      // sekali per tanggal
      const { data: sudah } = await db.from("sigap_audit").select("id").eq("aksi", AUDIT_KIRIM_LAPORAN).contains("detail", { penugasan_id: pen.id, tanggal }).limit(1);
      if (sudah && sudah.length > 0) return galat("Perbaikan laporan untuk tanggal ini sudah pernah dikirim. Kesempatan hanya satu kali.", 409);

      // hanya KK yang belum punya hasil
      const ids = items.map((x) => x.kk_id);
      const { data: kkRows } = await db.from("bencana_pendataan_kk").select("id, hasil").in("id", ids).eq("aktif", true);
      const bolehIds = new Set((kkRows ?? []).filter((k) => k.hasil === null).map((k) => k.id as number));
      const layak = items.filter((x) => bolehIds.has(x.kk_id));
      const dilewati = items.length - layak.length;
      if (layak.length === 0) return galat("Semua KK yang ditandai sudah punya hasil atau tidak ditemukan. Tidak ada yang bisa dicatat.");

      const waktu = waktuPerbaikan(tanggal);
      let tercatat = 0;
      let ditolak = 0;
      let duplikat = 0;
      for (const x of layak) {
        const r = await catatHasil(db, akun.id, { kk_id: x.kk_id, hasil: x.hasil, alasan: x.alasan, waktu, kunci: x.kunci, pos: null });
        if (!r.ok) ditolak++;
        else if (r.duplikat) duplikat++;
        else tercatat++;
      }
      if (tercatat + duplikat === 0) return galat("Tidak ada KK yang berhasil dicatat (bukan wilayah tim Anda?). Kesempatan Anda belum terpakai.");

      await catatAudit(db, akun.id, AUDIT_KIRIM_LAPORAN, { penugasan_id: pen.id, tanggal, kk: layak.map((x) => x.kk_id), tercatat, dilewati, ditolak, duplikat });

      // jendela ditutup bila foto hari itu juga sudah lengkap; bila belum, tetap berlaku sampai batasnya untuk melengkapi foto
      const { data: foto } = await db.from("sigap_dokumentasi").select("slot").eq("penugasan_id", pen.id).eq("tanggal", tanggal);
      const nFoto = new Set((foto ?? []).map((f) => f.slot as number)).size;
      const fotoLengkap = nFoto >= pen.kegiatan.jumlah_foto;
      if (fotoLengkap) await db.from("sigap_izin_susulan").update({ berlaku_sampai: sekarang.toISOString() }).in("id", j.izinId);
      return NextResponse.json({ ok: true, tercatat: tercatat + duplikat, dilewati, ditolak, foto_lengkap: fotoLengkap });
    }

    // ---------------- Tanggal ... saya tidak bekerja ----------------
    if (aksi === "tidak_bekerja") {
      const cek = periksaTidakBekerja(body);
      if (!cek.ok) return galat(cek.pesan);
      const { penugasan_id, tanggal } = cek.isi;
      const j = await periksaJendela(penugasan_id, tanggal);
      if ("error" in j) return j.error;
      const { pen } = j;
      const { error } = await db.from("sigap_hari_kerja").update({ uji_coba_sampai: sekarang.toISOString() }).eq("penugasan_id", pen.id).eq("tanggal", tanggal).is("uji_coba_sampai", null);
      if (error) return galatServer("[api/portal/perbaikan tidak_bekerja]", error);
      await db.from("sigap_izin_susulan").update({ berlaku_sampai: sekarang.toISOString() }).in("id", j.izinId);
      // (riwayat hari kerja hanya menerima aksi tambah/hapus; jejak "tidak bekerja" dicatat di sigap_audit)
      await catatAudit(db, akun.id, AUDIT_TIDAK_BEKERJA, { penugasan_id: pen.id, tanggal });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (err) {
    return galatServer("[api/portal/perbaikan]", err);
  }
}
