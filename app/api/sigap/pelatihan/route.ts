// app/api/sigap/pelatihan/route.ts
//
// (7 Okt 2026) SIGAP > Pelatihan -- beranda peserta: data undangan pribadi + status pretest/posttest.
// GET (Authorization: Bearer <sesi>) ->
//   { nama, peserta: {peran, kelas} | null, undangan, tes: [{jenis, judul, buka_at, tutup_at, durasi_menit,
//     status, jumlah_soal, sesi?, hasil_tertunda, skor?}], langkah: {undangan_dibuka, instrumen_diunduh, foto, foto_total}|null,
//   token_translok|null, sekarang, boleh_lihat_kelola, boleh_kelola }

import { NextRequest, NextResponse } from "next/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { UNDANGAN, statusTes } from "@/lib/sigapTes";
import { ringkasanKuisHub } from "@/lib/sigapKuisDb";
import { akunDariRequest, catatLangkah, dbAdmin, idKegiatanPelatihan, jumlahSoal, muatLangkah, muatPengaturanPresensi, muatPresensiAkun, muatTesDaftar, pesertaPelatihan, susunKeadaan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const sekarang = new Date();
    const [peserta, daftar, { izin }] = await Promise.all([pesertaPelatihan(db, akun.id, kegiatanId), muatTesDaftar(db, kegiatanId), izinAkun(db, akun.id)]);
    const nSoal = await jumlahSoal(db, daftar.map((t) => t.id));
    const tes = [];
    for (const t of daftar) {
      if (!t.aktif) continue;
      if (peserta) {
        const k = await susunKeadaan(db, t, akun.id, sekarang);
        tes.push({
          jenis: t.jenis,
          judul: t.judul,
          buka_at: t.buka_at,
          tutup_at: t.tutup_at,
          durasi_menit: t.durasi_menit,
          status: k.status,
          jumlah_soal: k.jumlah_soal,
          sesi: k.sesi,
          hasil_tertunda: k.hasil_tertunda,
          skor: k.hasil?.skor ?? null,
          benar: k.hasil?.benar ?? null,
          total: k.hasil?.total ?? null,
        });
      } else {
        tes.push({
          jenis: t.jenis,
          judul: t.judul,
          buka_at: t.buka_at,
          tutup_at: t.tutup_at,
          durasi_menit: t.durasi_menit,
          status: statusTes(t, nSoal.get(t.id) ?? 0, null, sekarang),
          jumlah_soal: nSoal.get(t.id) ?? 0,
          sesi: null,
          hasil_tertunda: false,
          skor: null,
          benar: null,
          total: null,
        });
      }
    }
    // (7 Okt 2026) Langkah Pelatihan: status undangan/instrumen/foto + token halaman Transport Lokal peserta.
    let langkah = null;
    let tokenTranslok: string | null = null;
    let presensi = null;
    let kuis = null;
    if (peserta) {
      // (7 Okt 2026) Kuis Live: ringkasan utk langkah "Kuis Live" (null = belum ada kuis -> langkah disembunyikan). Gagal -> null.
      kuis = await ringkasanKuisHub(db, kegiatanId, akun.id).catch(() => null);
      const [peng, pres] = await Promise.all([muatPengaturanPresensi(db, kegiatanId), muatPresensiAkun(db, kegiatanId, akun.id)]);
      presensi = peng ? { ...pres, pengaturan: peng } : null;
      langkah = await muatLangkah(db, akun.id, kegiatanId, peserta.penugasan_id, UNDANGAN.tanggal_iso);
      // (7 Okt 2026) akses pertama ke halaman Pelatihan dicatat utk monitoring "belum akses"
      if (!langkah.sudah_akses) await catatLangkah(db, akun.id, kegiatanId, "akses").catch(() => {});
      const { data: a } = await db.from("sigap_akun").select("token").eq("id", akun.id).maybeSingle();
      tokenTranslok = (a?.token as string | undefined) ?? null;
    }
    return NextResponse.json({
      nama: akun.nama,
      jenis_akun: akun.jenis,
      peserta,
      undangan: UNDANGAN,
      tes,
      langkah,
      presensi,
      kuis,
      token_translok: tokenTranslok,
      sekarang: sekarang.toISOString(),
      kegiatan_id: kegiatanId,
      boleh_lihat_kelola: boleh(izin, "pelatihan.kelola", "lihat", kegiatanId),
      boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId),
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
