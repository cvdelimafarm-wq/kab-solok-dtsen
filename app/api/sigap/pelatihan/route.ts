// app/api/sigap/pelatihan/route.ts
//
// (7 Okt 2026) SIGAP > Pelatihan -- beranda peserta: data undangan pribadi + status pretest/posttest.
// GET (Authorization: Bearer <sesi>) ->
//   { nama, peserta: {peran, kelas} | null, undangan, presensi: {sudah, ..., hari: {tanggal, sesi_hari[]}, pengaturan} | null,
//     tes: [{jenis, judul, buka_at, tutup_at, durasi_menit,
//     status, jumlah_soal, sesi?, hasil_tertunda, skor?}], langkah: {undangan_dibuka, instrumen_diunduh, foto, foto_total}|null,
//   token_translok|null, sekarang, boleh_lihat_kelola, boleh_kelola }
// (2 Nov 2026) tiap tes peserta kini juga membawa: wajib_100, tuntas, aturan_versi, terkunci ({oleh, oleh_label, pesan, izin, boleh_minta} | null) -- blokir tahapan (lib/sigapTahapan.ts).

import { NextRequest, NextResponse } from "next/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { keadaanHari, susunHari } from "@/lib/sigapPresensi";
import { KOLOM_PENGUMUMAN, keBentukPeserta, tampilUntuk, type Pengumuman } from "@/lib/sigapPengumuman";
import { statusTes } from "@/lib/sigapTes";
import { muatAturan } from "@/lib/sigapAturanDb";
import { hitungTahapan, kunciUntuk, ringkasIzin, tesDenganIzin } from "@/lib/sigapTahapan";
import { izinBerlakuPerTahap, muatIzin, muatTahapanBatch, type BarisIzinLengkap } from "@/lib/sigapTahapanDb";
import { ringkasanKuisHub } from "@/lib/sigapKuisDb";
import { gerbangTertutup } from "@/lib/sigapPelatihanBaruDb";
import { formatTanggalIndo } from "@/lib/pdf/sigap/format";
import { gabungUndangan } from "@/lib/sigapSuratUndangan";
import { ringkasSuratAktif } from "@/lib/sigapSuratUndanganDb";
import { akunDariRequest, catatLangkah, dbAdmin, idKegiatanPelatihan, undanganUntuk, jumlahSoal, muatLangkah, muatPengaturanPresensi, muatRekamPresensi, muatTesDaftar, pesertaPelatihan, susunKeadaan } from "@/lib/sigapTesDb";

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
    const undanganDasar = await undanganUntuk(db, kegiatanId);
    const sekarang = new Date();
    const [peserta, daftar, { izin }] = await Promise.all([pesertaPelatihan(db, akun.id, kegiatanId), muatTesDaftar(db, kegiatanId), izinAkun(db, akun.id)]);
    // (9 Nov 2026) surat undangan unggahan kelas peserta (pelatihan selain PSP) menggantikan undangan turunan
    const undangan = gabungUndangan(undanganDasar, undanganDasar.turunan && peserta?.kelas ? await ringkasSuratAktif(db, kegiatanId, peserta.kelas) : null, formatTanggalIndo);
    // (3 Nov 2026) Gerbang undangan: peserta yang belum menerima undangan tidak mendapat tes, langkah, presensi, kuis, maupun pengumuman. Beranda memakai
    // `terkunci_undangan` untuk menampilkan satu tugas saja: "Respons undangan".
    if (peserta && (await gerbangTertutup(db, kegiatanId, akun.id, izin))) {
      return NextResponse.json({
        nama: akun.nama,
        jenis_akun: akun.jenis,
        peserta,
        undangan,
        tes: [],
        langkah: null,
        presensi: null,
        kuis: null,
        pengumuman: [],
        token_translok: null,
        sekarang: sekarang.toISOString(),
        kegiatan_id: kegiatanId,
        terkunci_undangan: true,
        boleh_lihat_kelola: boleh(izin, "pelatihan.kelola", "lihat", kegiatanId),
        boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId),
      });
    }
    const nSoal = await jumlahSoal(db, daftar.map((t) => t.id));
    // (2 Nov 2026) blokir tahapan + jendela pribadi dari izin buka kunci (hanya peserta). Tahan SQL belum dijalankan: blokir mati, tanpa izin.
    const sekarangMs = sekarang.getTime();
    let aturanIzinAjukan = false;
    let barisIzin: BarisIzinLengkap[] = [];
    let hasilTahap: ReturnType<typeof hitungTahapan> = [];
    if (peserta) {
      const aturan = await muatAturan(db, kegiatanId);
      aturanIzinAjukan = aturan.izin_ajukan;
      barisIzin = (await muatIzin(db, kegiatanId, [akun.id], sekarangMs)).peta.get(akun.id) ?? [];
      if (aturan.blokir_tahap) {
        const masukan = (await muatTahapanBatch(db, kegiatanId, [akun.id], sekarangMs, aturan)).masukan.get(akun.id);
        if (masukan) hasilTahap = hitungTahapan(masukan, true, barisIzin, sekarangMs);
      }
    }
    const izinPerTahap = izinBerlakuPerTahap(barisIzin, sekarangMs);
    // (10 Okt 2026) Keadaan tiap tes dihitung BERSAMAAN (tadinya satu per satu, tiap tes beberapa query) -- permintaan user: pindah layer terlalu lama.
    const tes = await Promise.all(
      daftar
        .filter((t) => t.aktif)
        .map(async (t) => {
          if (peserta) {
            const tEfektif = t.jenis === "pretest" || t.jenis === "posttest" ? tesDenganIzin(t, izinPerTahap[t.jenis], sekarangMs) : t;
            const k = await susunKeadaan(db, tEfektif, akun.id, sekarang);
            const kunci = t.jenis === "pretest" || t.jenis === "posttest" ? kunciUntuk(hasilTahap, t.jenis) : null;
            return {
              jenis: t.jenis,
              judul: t.judul,
              buka_at: tEfektif.buka_at,
              tutup_at: tEfektif.tutup_at,
              durasi_menit: t.durasi_menit,
              status: k.status,
              jumlah_soal: k.jumlah_soal,
              sesi: k.sesi,
              hasil_tertunda: k.hasil_tertunda,
              percobaan: k.percobaan,
              ulang_maks: k.ulang_maks,
              bisa_ulang: k.bisa_ulang,
              skor: k.hasil?.skor ?? null,
              benar: k.hasil?.benar ?? null,
              total: k.hasil?.total ?? null,
              wajib_100: k.wajib_100,
              tuntas: k.tuntas,
              aturan_versi: k.aturan_versi,
              terkunci: kunci ? { ...kunci, izin: ringkasIzin(barisIzin, t.jenis, sekarangMs), boleh_minta: aturanIzinAjukan } : null,
            };
          }
          return {
            jenis: t.jenis,
            judul: t.judul,
            buka_at: t.buka_at,
            tutup_at: t.tutup_at,
            durasi_menit: t.durasi_menit,
            status: statusTes(t, nSoal.get(t.id) ?? 0, null, sekarang),
            jumlah_soal: nSoal.get(t.id) ?? 0,
            sesi: null,
            hasil_tertunda: false,
            percobaan: 1,
            ulang_maks: t.jenis === "posttest" ? Math.max(1, t.ulang_maks ?? 1) : 1,
            bisa_ulang: false,
            skor: null,
            benar: null,
            total: null,
          };
        })
    );
    // (7 Okt 2026) Langkah Pelatihan: status undangan/instrumen/foto + token halaman Transport Lokal peserta.
    let langkah = null;
    let tokenTranslok: string | null = null;
    let presensi = null;
    let kuis = null;
    if (peserta) {
      // (10 Okt 2026) Lima pembacaan di bawah tidak saling bergantung -> BERSAMAAN (tadinya berurutan).
      // (7 Okt 2026) Kuis Live: ringkasan utk langkah "Kuis Live" (null = belum ada kuis -> langkah disembunyikan). Gagal -> null.
      const [kuisHasil, peng, rekam, langkahHasil, akunToken] = await Promise.all([
        ringkasanKuisHub(db, kegiatanId, akun.id, peserta.kelas ?? null).catch(() => null),
        muatPengaturanPresensi(db, kegiatanId),
        muatRekamPresensi(db, kegiatanId, akun.id),
        muatLangkah(db, akun.id, kegiatanId, peserta.penugasan_id, undangan.tanggal_iso),
        db.from("sigap_akun").select("token").eq("id", akun.id).maybeSingle(),
      ]);
      kuis = kuisHasil;
      if (peng) {
        // (8 Okt 2026) presensi per sesi: `hari` = sesi hari ini + catatan peserta; `sudah` = semua sesi hari ini tercatat (peringatan lokasi padam)
        const hari = susunHari(peng.jadwal, rekam, sekarang.getTime());
        const kead = keadaanHari(hari, sekarang.getTime());
        const pertama = hari.sesi_hari.find((x) => x.at) ?? null;
        presensi = { sudah: kead.lengkap, at: pertama?.at ?? null, jarak_m: pertama?.jarak_m ?? null, manual: !!pertama?.manual, titik_nama: pertama?.titik_nama ?? null, hari, pengaturan: peng };
      }
      langkah = langkahHasil;
      // (7 Okt 2026) akses pertama ke halaman Pelatihan dicatat utk monitoring "belum akses" (tidak ditunggu: tidak menghambat jawaban)
      if (!langkah.sudah_akses) void catatLangkah(db, akun.id, kegiatanId, "akses").catch(() => {});
      tokenTranslok = (akunToken.data?.token as string | undefined) ?? null;
    }
    // (8 Okt 2026) Modal pengumuman yang diatur panitia (Kelola Pelatihan > Pengumuman): hanya yang aktif, dalam jadwal, dan sesuai kelas/peran peserta.
    // Gagal baca (mis. tabel belum ada) -> tanpa modal; tidak boleh menghalangi halaman Langkah.
    let pengumuman: ReturnType<typeof keBentukPeserta>[] = [];
    if (peserta) {
      try {
        const { data } = await db.from("sigap_pengumuman").select(KOLOM_PENGUMUMAN).eq("kegiatan_id", kegiatanId).eq("aktif", true).order("urut").order("id").limit(50);
        pengumuman = ((data ?? []) as Pengumuman[]).filter((p) => tampilUntuk(p, peserta, sekarang)).map(keBentukPeserta);
      } catch {
        pengumuman = [];
      }
    }
    return NextResponse.json({
      nama: akun.nama,
      jenis_akun: akun.jenis,
      peserta,
      undangan,
      tes,
      langkah,
      presensi,
      kuis,
      pengumuman,
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
