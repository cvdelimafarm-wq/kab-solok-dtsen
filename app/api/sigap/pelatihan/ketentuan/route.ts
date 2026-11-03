// app/api/sigap/pelatihan/ketentuan/route.ts
//
// (2 Nov 2026) Pelatihan 5 tab: kartu undangan + ketentuan + jawaban terima/tolak.
//
// GET  (Bearer sesi; ?kegiatan=ID opsional) -> { kegiatan_id, instrumen_belum, tab_baru (berlaku), tab_pengaturan (true|false|null=otomatis), otomatis, kegiatan_selesai, ketentuan:{butir,versi,diubah}, undangan:{hari_tanggal,pukul,tempat,tanggal_iso,pdf},
//        peserta:{peran,kelas}|null, jadwal_pendataan:{sumber,periode:[{periode,mulai,selesai,perkiraan}]}|null, jadwal_pelatihan:{mulai,selesai}|null, respons, status, berubah, kartu:{judul,ket,tombol,nada}, kamera_href|null, boleh_kelola }
// POST {aksi:"respons", respons:"terima"|"tolak", alasan?}       (peserta)  -> { ok, status }
// POST {aksi:"simpan", butir?:string[], tab_baru?:boolean|null}  (izin pelatihan.kelola = kelola; null = kembali ke otomatis) -> { ok, ketentuan }
//
// Bawaan OTOMATIS: tampilan baru selama pelatihan belum selesai (pelatihan yang sudah selesai, mis. PSP, tetap tampilan lama). SQL belum dijalankan -> butir kosong, tetap 200.

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan, undanganUntuk } from "@/lib/sigapTesDb";
import { ketentuanBerubah, ketentuanDiubah, periksaRespons, statusUndangan, teksKartuUndangan } from "@/lib/ketentuanPelatihan";
import { muatKetentuan, muatRespons, muatTampilan, simpanKetentuan, simpanRespons, tentukanPengguna } from "@/lib/sigapPelatihanBaruDb";
import { tabPerPeran } from "@/lib/sigapAbsen";
import { muatStatusMateriBatch } from "@/lib/sigapMateriDb";
import { muatJadwalPendataanTertaut } from "@/lib/portal/jadwalPendataanTertaut";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const [tampilan, undangan, peserta, { izin }] = await Promise.all([
      muatTampilan(db, kegiatanId),
      undanganUntuk(db, kegiatanId),
      pesertaPelatihan(db, akun.id, kegiatanId),
      izinAkun(db, akun.id),
    ]);
    const ketentuan = tampilan.ketentuan;
    const pengguna = await tentukanPengguna(db, kegiatanId, akun.id, izin);
    const respons = peserta ? await muatRespons(db, kegiatanId, akun.id) : null;
    const status = statusUndangan(respons);
    const berubah = ketentuanBerubah(respons, ketentuan);
    // (2 Nov 2026) Tab "Kamera SIGAP" membuka halaman Kamera SIGAP kegiatan ini (/sigap/foto), sama dengan Pendataan Pascabencana -- bukan panduan Translok.
    // Kegiatan harus bermode "kamera" (sigap_foto_pengaturan_kegiatan); bila belum, halaman itu menjelaskannya.
    const kameraHref: string | null = peserta ? `/sigap/foto?kegiatan=${kegiatanId}` : null;
    // Tahap C: jumlah materi wajib (video / tautan) yang belum selesai -> penanda di ikon tab Instrumen. Gagal / SQL belum ada = 0.
    let instrumenBelum = 0;
    if (peserta && tampilan.tab_baru) {
      try {
        instrumenBelum = (await muatStatusMateriBatch(db, kegiatanId, [akun.id])).belum.get(akun.id) ?? 0;
      } catch {
        instrumenBelum = 0;
      }
    }
    // (3 Nov 2026) Jadwal pendataan dari Identifikasi survei yang tertaut (kartu "Jadwal pendataan" di Hari ini). Hanya untuk peserta; gagal / tanpa tautan = null.
    const jadwalPendataan = peserta ? await muatJadwalPendataanTertaut(db, kegiatanId) : null;
    // (3 Nov 2026) tanggal kegiatan pelatihan untuk linimasa "Jadwal Anda"; gagal membaca = null (kartu memakai tanggal undangan)
    let jadwalPelatihan: { mulai: string; selesai: string | null } | null = null;
    if (peserta) {
      try {
        const { data: kg } = await db.from("sigap_kegiatan").select("tanggal_mulai, tanggal_selesai").eq("id", kegiatanId).maybeSingle();
        const mulai = (kg as { tanggal_mulai?: string | null } | null)?.tanggal_mulai ?? null;
        const selesai = (kg as { tanggal_selesai?: string | null } | null)?.tanggal_selesai ?? null;
        if (mulai && /^\d{4}-\d{2}-\d{2}/.test(mulai)) jadwalPelatihan = { mulai: mulai.slice(0, 10), selesai: selesai && /^\d{4}-\d{2}-\d{2}/.test(selesai) ? selesai.slice(0, 10) : null };
      } catch {
        jadwalPelatihan = null;
      }
    }
    return NextResponse.json({
      kegiatan_id: kegiatanId,
      jadwal_pendataan: jadwalPendataan,
      jadwal_pelatihan: jadwalPelatihan,
      instrumen_belum: instrumenBelum,
      tab_baru: tampilan.tab_baru,
      tab_pengaturan: ketentuan.tab_pengaturan,
      otomatis: tampilan.otomatis,
      kegiatan_selesai: tampilan.kegiatan_selesai,
      ketentuan: { butir: ketentuan.butir, versi: ketentuan.versi, diubah: ketentuanDiubah(ketentuan) },
      undangan: { hari_tanggal: undangan.hari_tanggal, pukul: undangan.pukul, tempat: undangan.tempat, tanggal_iso: undangan.tanggal_iso, pdf: undangan.pdf },
      peserta,
      respons,
      status,
      berubah,
      kartu: teksKartuUndangan(status, berubah),
      kamera_href: kameraHref,
      tab: tabPerPeran(pengguna.jenis, !!peserta),
      boleh_lihat_kelola: boleh(izin, "pelatihan.kelola", "lihat", kegiatanId),
      boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId),
    });
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

    if (body.aksi === "respons") {
      const peserta = await pesertaPelatihan(db, akun.id, kegiatanId);
      if (!peserta) return galat("Anda bukan peserta pelatihan ini.", 403);
      const v = periksaRespons(body);
      if (!v.ok) return galat(v.pesan);
      const ketentuan = await muatKetentuan(db, kegiatanId);
      const hasil = await simpanRespons(db, kegiatanId, akun.id, v.respons, v.alasan, ketentuan.versi);
      if (!hasil.ok) return galat(hasil.pesan, 500);
      return NextResponse.json({ ok: true, status: v.respons === "terima" ? "diterima" : "ditolak" });
    }

    if (body.aksi === "simpan") {
      const { izin } = await izinAkun(db, akun.id);
      if (!boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return galat("Tidak punya izin mengelola pelatihan.", 403);
      if (body.butir !== undefined && !Array.isArray(body.butir)) return galat("Daftar ketentuan tidak valid.");
      if (body.tab_baru !== undefined && body.tab_baru !== null && typeof body.tab_baru !== "boolean") return galat("Pengaturan tampilan tidak valid.");
      const hasil = await simpanKetentuan(db, kegiatanId, { butir: body.butir, tab_baru: body.tab_baru }, akun.nama);
      if (!hasil.ok) return galat(hasil.pesan, 500);
      await catatAudit(db, akun.id, "pelatihan_ketentuan_simpan", { kegiatan_id: kegiatanId, tab_pengaturan: hasil.ketentuan.tab_pengaturan, versi: hasil.ketentuan.versi, jumlah_butir: hasil.ketentuan.butir.length });
      return NextResponse.json({ ok: true, ketentuan: hasil.ketentuan });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
