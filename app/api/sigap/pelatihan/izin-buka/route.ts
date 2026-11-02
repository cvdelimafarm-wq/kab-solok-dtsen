// app/api/sigap/pelatihan/izin-buka/route.ts
//
// (2 Nov 2026) Buka kunci tahapan pelatihan (tahap F2; rancangan-pelatihan-5-tab-hierarki 5.6, keputusan 12 dan 20: HIBRIDA).
//
// GET  (Bearer sesi; ?kegiatan=ID opsional)
//   -> { pengelola: boolean, kelas: number|null, menunggu: [{id, akun_id, nama, kelas, tahap, alasan, dibuat_at}] }   (pengelola = panitia, atau instruktur [dibatasi kelasnya])
// POST peserta   {aksi:"minta", tahap:"pretest"|"posttest", alasan}                    -> { ok }   (hanya bila pelatihan mengaktifkan pengajuan: sigap_pelatihan_aturan.izin_ajukan)
// POST pengelola {aksi:"putuskan", id, setuju:boolean}                                  -> { ok }
//                {aksi:"buka", akun_id, tahap:"pretest"|"posttest", alasan}             -> { ok }   (aksi langsung dari Monitoring)
// Izin berlaku sampai 23.59 WIB hari yang sama, hanya untuk satu orang dan satu tahapan, dan memberi jendela tes pribadi (lib/sigapTahapan.ts, tesDenganIzin).
// Panitia: semua kelas. Instruktur: hanya peserta kelasnya. Peserta lain / korwil / PML: tidak berwenang.
// (Tahap G) Setiap aksi mengirim notifikasi push: minta -> panitia + instruktur kelas; putuskan / buka -> peserta. Gagal kirim tidak mengubah hasil aksi (lib/sigapIzinPush.ts).

import { NextRequest, NextResponse } from "next/server";
import { catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";
import { tentukanPengguna } from "@/lib/sigapPelatihanBaruDb";
import { muatAturan } from "@/lib/sigapAturanDb";
import { periksaPermintaanIzin } from "@/lib/sigapTahapan";
import { ajukanIzin, ambilIzin, bukaLangsung, daftarMenunggu, putuskanIzin } from "@/lib/sigapTahapanDb";
import { beritahuIzinDibuka, beritahuIzinDiminta, beritahuIzinDiputuskan } from "@/lib/sigapIzinPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

type Pengelola = { jenis: "panitia" } | { jenis: "instruktur"; kelas: number | null };

/** Panitia / instruktur yang berwenang atas peserta berkelas `kelasPeserta`. */
const berwenang = (p: Pengelola, kelasPeserta: number | null): boolean => p.jenis === "panitia" || p.kelas === null || p.kelas === kelasPeserta;

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const { izin } = await izinAkun(db, akun.id);
    const pengguna = await tentukanPengguna(db, kegiatanId, akun.id, izin);
    if (pengguna.jenis === "peserta") return NextResponse.json({ pengelola: false, kelas: null, menunggu: [] });
    const kelas = pengguna.jenis === "instruktur" ? pengguna.kelas : null;
    return NextResponse.json({ pengelola: true, kelas, menunggu: await daftarMenunggu(db, kegiatanId, kelas) });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return galat("Permintaan tidak valid.");
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const sekarang = Date.now();

    if (body.aksi === "minta") {
      const peserta = await pesertaPelatihan(db, akun.id, kegiatanId);
      if (!peserta) return galat("Anda bukan peserta pelatihan ini.", 403);
      const aturan = await muatAturan(db, kegiatanId);
      if (!aturan.izin_ajukan) return galat("Pengajuan buka kunci tidak diaktifkan untuk pelatihan ini. Hubungi panitia atau instruktur.", 403);
      const v = periksaPermintaanIzin(body);
      if (!v.ok) return galat(v.pesan);
      const hasil = await ajukanIzin(db, kegiatanId, akun.id, v.izin.tahap, v.izin.alasan);
      if (!hasil.ok) return galat(hasil.pesan, 500);
      let diberitahu = 0;
      if (!hasil.sudah) {
        await catatAudit(db, akun.id, "pelatihan_izin_diminta", { kegiatan_id: kegiatanId, tahap: v.izin.tahap });
        // Tahap G: kabari panitia + instruktur kelasnya (pelengkap; tidak pernah menggagalkan permintaan)
        diberitahu = await beritahuIzinDiminta(db, kegiatanId, { id: akun.id, nama: akun.nama, kelas: peserta.kelas }, v.izin.tahap, v.izin.alasan, hasil.id);
      }
      return NextResponse.json({ ok: true, sudah_menunggu: !!hasil.sudah, diberitahu });
    }

    // ---- aksi pengelola ----
    const { izin } = await izinAkun(db, akun.id);
    const pengguna = await tentukanPengguna(db, kegiatanId, akun.id, izin);
    if (pengguna.jenis === "peserta") return galat("Hanya panitia dan instruktur yang dapat membuka kunci.", 403);
    const pengelola: Pengelola = pengguna.jenis === "panitia" ? { jenis: "panitia" } : { jenis: "instruktur", kelas: pengguna.kelas };

    if (body.aksi === "putuskan") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return galat("Permintaan tidak dikenal.");
      if (typeof body.setuju !== "boolean") return galat("Keputusan tidak valid.");
      const baris = await ambilIzin(db, kegiatanId, id);
      if (!baris) return galat("Permintaan tidak ditemukan.", 404);
      const target = await pesertaPelatihan(db, baris.akun_id, kegiatanId);
      if (!target || !berwenang(pengelola, target.kelas)) return galat("Permintaan ini bukan dari kelas Anda.", 403);
      const hasil = await putuskanIzin(db, kegiatanId, id, body.setuju, akun.nama, sekarang);
      if (!hasil.ok) return galat(hasil.pesan, hasil.pesan.includes("sudah diputuskan") ? 409 : 500);
      await catatAudit(db, akun.id, body.setuju ? "pelatihan_izin_disetujui" : "pelatihan_izin_ditolak", { kegiatan_id: kegiatanId, izin_id: id, akun_id: baris.akun_id, tahap: baris.tahap });
      const diberitahu = await beritahuIzinDiputuskan(db, baris.akun_id, body.setuju, baris.tahap, akun.nama, id, kegiatanId);
      return NextResponse.json({ ok: true, diberitahu });
    }

    if (body.aksi === "buka") {
      const akunId = Number(body.akun_id);
      if (!Number.isInteger(akunId) || akunId <= 0) return galat("Peserta tidak dikenal.");
      const v = periksaPermintaanIzin(body);
      if (!v.ok) return galat(v.pesan);
      const target = await pesertaPelatihan(db, akunId, kegiatanId);
      if (!target) return galat("Akun itu bukan peserta pelatihan ini.", 404);
      if (!berwenang(pengelola, target.kelas)) return galat("Peserta ini bukan dari kelas Anda.", 403);
      const hasil = await bukaLangsung(db, kegiatanId, akunId, v.izin.tahap, v.izin.alasan, akun.nama, sekarang);
      if (!hasil.ok) return galat(hasil.pesan, 500);
      await catatAudit(db, akun.id, "pelatihan_izin_dibuka", { kegiatan_id: kegiatanId, akun_id: akunId, tahap: v.izin.tahap, alasan: v.izin.alasan });
      const diberitahu = await beritahuIzinDibuka(db, akunId, v.izin.tahap, akun.nama, kegiatanId);
      return NextResponse.json({ ok: true, diberitahu });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
