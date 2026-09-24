// app/api/penyisiran/spj/buat-otomatis/route.ts
//
// POST -> "Buat Otomatis": membuat Kwitansi/Visum/Surat Pernyataan Kendaraan
// LANGSUNG dari data yg SUDAH ADA di sistem (TANPA isi manual), sesuai
// permintaan user 23 Sep 2026 -- lihat lib/spjSetHariTugas.ts utk penjelasan
// lengkap model "SET tanggal" yg mendasari fitur ini.
//
// (24 Sep 2026, permintaan user -- GANTI aturan 23 Sep): mode SET SEMPAT
// dibuat TETAP per jenis dokumen (BUKAN lagi pilihan bebas `body.mode` spt
// sebelumnya -- field itu SUDAH TIDAK DIPAKAI lagi & diabaikan kalau masih
// dikirim client lama).
// (25 Sep 2026, GANTI BALIK permintaan 24 Sep): Kwitansi 1-lembar-per-hari
// ternyata TIDAK dipakai -- dibalik lagi ke "per_rentang" spt semula, SAMA
// PERSIS dgn Visum/Surat Pernyataan (bukan dihitung ulang terpisah lagi).
// Jadi SEKARANG semua 3 jenis dokumen (Kwitansi/Visum/Surat Pernyataan)
// pakai SATU SET RENTANG YANG SAMA (`setRentang` di bawah):
//   - Kwitansi  : 1 lembar per SET rentang (bisa >1 hari), nominal = tarif
//     per hari x JUMLAH HARI dlm SET itu (nominalKwitansiDefault) -- BUKAN
//     lagi selalu x1. Ini yg sempat salah di migrasi 23 Sep (nominal lama
//     tidak ikut dikali ulang saat SET diperluas) -- SEKARANG selalu
//     dihitung ulang dari jumlahHari SET yg aktual, jadi tidak akan
//     "nyangkut" lagi spt kasus Anike Putri/Mega Nana dulu.
//   - Visum     : tanggal ditag yg BERURUTAN digabung 1 SET, pecah jadi SET
//     baru begitu ada tanggal yg terputus.
//   - Surat Pernyataan Kendaraan: SET RENTANG YANG SAMA PERSIS dgn
//     Kwitansi/Visum -- supaya jumlah baris & rentang tanggalnya identik
//     ("Surat Pernyataan mengacu ke Visum"), dan jumlah salinan Surat Tugas
//     yg disisipkan saat Cetak SPJ gabungan otomatis ikut sama banyak dgn
//     jumlah Visum (lihat app/api/penyisiran/spj/cetak/route.ts).
//
// Sumber data per jenis dokumen (SEMUA sudah ada di sistem, TIDAK ada yg
// diketik ulang di sini):
//   - Kwitansi : nominal = TARIF_TRANSLOK_PER_HARI_DEFAULT (bisa dioverride
//     lewat body.tarif_per_hari) x jumlah hari dlm SET; tujuan ("untuk
//     perjalanan dinas dalam kota pada") dari hitungKecamatanTugas (SAMA
//     dgn Visum, lib/spjWilayahTugas.ts).
//   - Visum    : rencana_tujuan & tempat_kedudukan jg dari
//     hitungKecamatanTugas; tanggal berangkat/tiba dari batas SET rentang.
//   - Surat Pernyataan Kendaraan: tanggal_pelaksanaan = tanggal AKHIR SET
//     rentang (konsisten dgn migrasi 20260923_spj_dokumen_per_set_hari_tugas.sql
//     yg memakai tanggal akhir SET utk baris lama yg dipecah).
//
// SET yg SUDAH ADA (tanggal_mulai_set sama persis) TIDAK ditimpa -- endpoint
// ini HANYA membuat SET yg BELUM ada (upsert dgn ignoreDuplicates), supaya
// nilai yg sudah diedit manual pengguna tidak pernah tertimpa diam2 oleh
// klik "Buat Otomatis" berikutnya. Kalau prasyarat data BELUM lengkap (mis.
// belum ada tanggal Hari Tugas ditag, atau belum ada kecamatan wilayah
// tugas), endpoint MENOLAK jenis dokumen terkait & mengembalikan pesan
// error/peringatan YG JELAS + `navigasi` (menu tujuan) spy pengguna tahu ke
// mana harus melengkapi -- sesuai permintaan eksplisit user "sampaikan aja
// di pesan error/warning dan sertakan navigasinya".
//
// Non-pengelola (petugas/tetangga biasa) HANYA boleh membuat dokumen utk
// dirinya sendiri (field `petugas` di body diabaikan, sama spt pola akses
// menu SPJ lainnya -- lihat app/api/penyisiran/spj/cetak/route.ts).
// Pengelola (lolos pastikanPengelolaSpj) boleh menunjuk petugas lain lewat
// body.petugas -- supaya bisa membereskan dokumen SPJ petugas lain lgsg dari
// menu pengelola (Monitoring/Cetak SPJ), bukan cuma dari sesi petugas ybs.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj, tabelAkun, SpjPetugasJenis } from "@/lib/spjAuth";
import { hitungKecamatanTugas } from "@/lib/spjWilayahTugas";
import { daftarHariKerjaPetugas } from "@/lib/spjHariKerja";
import { TEMPAT_KEDUDUKAN_DEFAULT } from "@/lib/spjPejabat";
import { terbilangRupiah } from "@/lib/spjFormat";
import {
  TARIF_TRANSLOK_PER_HARI_DEFAULT,
  hitungSetUntukSuratTugas,
  nominalKwitansiDefault,
  SetHariTugas,
} from "@/lib/spjSetHariTugas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JenisDokumenSet = "kwitansi" | "visum" | "surat_keterangan";
const JENIS_DOKUMEN_SET: JenisDokumenSet[] = ["kwitansi", "visum", "surat_keterangan"];

interface Peringatan {
  kode: string;
  jenis?: JenisDokumenSet;
  pesan: string;
  navigasi: { halaman: string; keterangan: string };
}

interface HasilDokumen {
  jenis: JenisDokumenSet;
  dibuat: number;
  sudahAda: number;
}

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

const NAV_HARI_TUGAS = {
  halaman: "Perencanaan Lapangan",
  keterangan: "Tab \"🗓 Identifikasi Hari Tugas\" -- tandai tanggal kerja Anda dulu di sana.",
};
const NAV_WILAYAH_TUGAS = {
  halaman: "Perencanaan Lapangan",
  keterangan: "Tab \"📋 Identifikasi Wilayah Sampel SLS\" -- tautkan kecamatan wilayah tugas Anda dulu di sana.",
};

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });

  const suratTugasId = Number(body.surat_tugas_id);
  if (!Number.isFinite(suratTugasId)) {
    return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
  }

  // `body.mode` SUDAH TIDAK DIPAKAI lagi sejak 24 Sep 2026 (diabaikan kalau
  // masih dikirim client lama) -- mode SEKARANG tetap per jenis dokumen,
  // lihat komentar panjang di atas file ini.
  const dokumenMentah: unknown[] = Array.isArray(body.dokumen) ? body.dokumen : [];
  const dokumenDipilih = dokumenMentah.length > 0 ? JENIS_DOKUMEN_SET.filter((j) => dokumenMentah.includes(j)) : [...JENIS_DOKUMEN_SET];
  if (dokumenDipilih.length === 0) {
    return NextResponse.json({ error: "Pilih minimal 1 jenis dokumen." }, { status: 400 });
  }

  const tarifPerHariInput = Number(body.tarif_per_hari);
  const tarifPerHari = Number.isFinite(tarifPerHariInput) && tarifPerHariInput > 0 ? tarifPerHariInput : TARIF_TRANSLOK_PER_HARI_DEFAULT;

  // Target petugas: non-pengelola SELALU dipaksa dirinya sendiri (sama spt
  // pola akses menu SPJ lain, lihat komentar di atas file ini & di
  // app/api/penyisiran/spj/cetak/route.ts).
  let targetJenis: SpjPetugasJenis;
  let targetId: string;
  if (namaPengelola && body.petugas && typeof body.petugas === "object") {
    const j = (body.petugas as { jenis?: unknown }).jenis;
    const id = (body.petugas as { id?: unknown }).id;
    if (j !== "penyisiran" && j !== "tetangga") {
      return NextResponse.json({ error: "Jenis petugas tidak valid." }, { status: 400 });
    }
    targetJenis = j;
    targetId = String(id ?? "");
    if (!targetId) return NextResponse.json({ error: "Petugas tidak valid." }, { status: 400 });
  } else {
    targetJenis = session.jenis;
    targetId = String(session.petugasId);
  }

  // Pastikan Surat Tugas ini memang ditautkan ke petugas TARGET -- mencegah
  // membuat dokumen SPJ utk ST milik orang lain (jg berlaku ke pengelola --
  // body.petugas tetap harus benar2 ditautkan ke ST tsb).
  const { data: taut, error: errTaut } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("id")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", targetJenis)
    .eq("petugas_id", targetId)
    .maybeSingle();
  if (errTaut) return NextResponse.json({ error: errTaut.message }, { status: 500 });
  if (!taut) return NextResponse.json({ error: "Surat Tugas ini bukan milik petugas yang dimaksud." }, { status: 403 });

  const { data: st, error: errSt } = await supabase
    .from("spj_surat_tugas")
    .select("id, nomor_st, tanggal_mulai, tanggal_selesai")
    .eq("id", suratTugasId)
    .maybeSingle();
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });
  if (!st) return NextResponse.json({ error: "Surat Tugas tidak ditemukan." }, { status: 404 });

  const targetSession = { jenis: targetJenis, petugasId: targetId };
  const hariKerja = await daftarHariKerjaPetugas(supabase, targetSession);

  if (hariKerja.tanggal.length === 0) {
    return NextResponse.json(
      {
        error:
          targetJenis === "penyisiran"
            ? "Belum ada tanggal yang ditandai di 🗓 Identifikasi Hari Tugas -- tandai dulu tanggal kerja sebelum membuat dokumen otomatis."
            : "Belum ada Surat Tugas yang tertaut sama sekali, sehingga tanggal kerja tidak dapat dihitung.",
        navigasi: NAV_HARI_TUGAS,
      },
      { status: 400 }
    );
  }

  // SATU penghitungan SET rentang, dipakai bareng oleh Kwitansi/Visum/Surat
  // Pernyataan (lihat komentar besar di atas file ini) -- tanggal ditag yg
  // BERURUTAN digabung 1 SET, pecah jadi SET baru begitu ada tanggal yg
  // terputus.
  const setRentang: SetHariTugas[] = hitungSetUntukSuratTugas(hariKerja.tanggal, st.tanggal_mulai, st.tanggal_selesai, "per_rentang");
  if (setRentang.length === 0) {
    return NextResponse.json(
      {
        error: `Ada tanggal Hari Tugas yang ditandai (${hariKerja.tanggal[0]} s.d. ${hariKerja.tanggal[hariKerja.tanggal.length - 1]}), tapi tidak ada yang berada dalam rentang Surat Tugas ini (${st.tanggal_mulai} s.d. ${st.tanggal_selesai}). Periksa kembali tanggal yang ditandai atau rentang Surat Tugas.`,
        navigasi: NAV_HARI_TUGAS,
      },
      { status: 400 }
    );
  }

  const peringatan: Peringatan[] = [];
  const hasil: HasilDokumen[] = [];

  // Kecamatan domisili/wilayah tugas -- DIPAKAI BERSAMA oleh Kwitansi &
  // Visum (SATU sumber logic, lihat lib/spjWilayahTugas.ts). Utk jenis
  // "tetangga" SELALU null (tidak ada sumber data itu) -- kedua dokumen
  // dilewati utk jenis ini dgn peringatan yg jelas, BUKAN error keras yg
  // menggagalkan seluruh permintaan (dokumen lain yg dipilih tetap diproses).
  const kecamatan = await hitungKecamatanTugas(supabase, targetSession);

  const { data: akun } = await supabase.from(tabelAkun(targetJenis)).select("nama").eq("id", targetId).maybeSingle();
  const namaPembuat = (akun as { nama?: string | null } | null)?.nama ?? null;

  if (dokumenDipilih.includes("kwitansi")) {
    if (!kecamatan.wilayahTugas) {
      peringatan.push({
        kode: "wilayah_tugas_kosong",
        jenis: "kwitansi",
        pesan:
          targetJenis === "penyisiran"
            ? "Kwitansi dilewati: kecamatan wilayah tugas belum tertaut."
            : "Kwitansi dilewati: jenis Tetangga tidak punya sumber wilayah tugas otomatis -- isi manual lewat menu Administrasi SPJ.",
        navigasi: NAV_WILAYAH_TUGAS,
      });
    } else {
      // setRentang -- 1 lembar Kwitansi per SET rentang (bisa >1 hari),
      // nominal = tarifPerHari x jumlah hari SET itu (nominalKwitansiDefault
      // SELALU mengalikan ulang dari jumlahHari yg aktual -- lihat komentar
      // besar di atas file ini knp ini penting).
      const baris = setRentang.map((s) => {
        const nominal = nominalKwitansiDefault(s.jumlahHari, tarifPerHari);
        return {
          surat_tugas_id: suratTugasId,
          petugas_jenis: targetJenis,
          petugas_id: targetId,
          nominal,
          terbilang: terbilangRupiah(nominal),
          untuk_perjalanan_dinas_pada: kecamatan.wilayahTugas,
          tanggal_spd: s.tanggalMulai,
          tanggal_kwitansi: new Date().toISOString().slice(0, 10),
          created_by: namaPembuat,
          tanggal_mulai_set: s.tanggalMulai,
          tanggal_selesai_set: s.tanggalSelesai,
          nominal_per_hari: tarifPerHari,
          jumlah_hari: s.jumlahHari,
        };
      });
      const { data: dibuat, error: errUpsert } = await supabase
        .from("spj_kwitansi")
        .upsert(baris, { onConflict: "surat_tugas_id,petugas_jenis,petugas_id,tanggal_mulai_set", ignoreDuplicates: true })
        .select("tanggal_mulai_set");
      if (errUpsert) return NextResponse.json({ error: errUpsert.message }, { status: 500 });
      const jumlahDibuat = dibuat?.length ?? 0;
      hasil.push({ jenis: "kwitansi", dibuat: jumlahDibuat, sudahAda: setRentang.length - jumlahDibuat });
    }
  }

  if (dokumenDipilih.includes("visum")) {
    if (!kecamatan.wilayahTugas) {
      peringatan.push({
        kode: "wilayah_tugas_kosong",
        jenis: "visum",
        pesan:
          targetJenis === "penyisiran"
            ? "Visum dilewati: kecamatan wilayah tugas belum tertaut."
            : "Visum dilewati: jenis Tetangga tidak punya sumber wilayah tugas otomatis -- isi manual lewat menu Administrasi SPJ.",
        navigasi: NAV_WILAYAH_TUGAS,
      });
    } else {
      const tempatKedudukan = kecamatan.domisili || TEMPAT_KEDUDUKAN_DEFAULT;
      const baris = setRentang.map((s) => ({
        surat_tugas_id: suratTugasId,
        petugas_jenis: targetJenis,
        petugas_id: targetId,
        rencana_tujuan: kecamatan.wilayahTugas,
        tempat_kedudukan: tempatKedudukan,
        tanggal_berangkat: s.tanggalMulai,
        tanggal_tiba_tujuan: s.tanggalMulai,
        tanggal_berangkat_kembali: s.tanggalSelesai,
        tanggal_tiba_kembali: s.tanggalSelesai,
        tanggal_mulai_set: s.tanggalMulai,
        tanggal_selesai_set: s.tanggalSelesai,
        updated_at: new Date().toISOString(),
      }));
      const { data: dibuat, error: errUpsert } = await supabase
        .from("spj_visum")
        .upsert(baris, { onConflict: "surat_tugas_id,petugas_jenis,petugas_id,tanggal_mulai_set", ignoreDuplicates: true })
        .select("tanggal_mulai_set");
      if (errUpsert) return NextResponse.json({ error: errUpsert.message }, { status: 500 });
      const jumlahDibuat = dibuat?.length ?? 0;
      hasil.push({ jenis: "visum", dibuat: jumlahDibuat, sudahAda: setRentang.length - jumlahDibuat });
    }
  }

  if (dokumenDipilih.includes("surat_keterangan")) {
    // setRentang -- SAMA PERSIS dgn yg dipakai Visum (bukan dihitung ulang
    // terpisah), sesuai permintaan user "Surat Pernyataan mengacu ke
    // Visum". Tanggal pelaksanaan = tanggal AKHIR SET rentang (konsisten dgn
    // migrasi 20260923_spj_dokumen_per_set_hari_tugas.sql yg memakai tanggal
    // akhir SET utk baris lama yg dipecah). Tersedia utk KEDUA jenis petugas
    // (fallback rentang ST tetap menghasilkan SET yg valid utk jenis
    // "tetangga").
    const baris = setRentang.map((s) => ({
      surat_tugas_id: suratTugasId,
      petugas_jenis: targetJenis,
      petugas_id: targetId,
      tanggal_pelaksanaan: s.tanggalSelesai,
      tanggal_mulai_set: s.tanggalMulai,
      tanggal_selesai_set: s.tanggalSelesai,
    }));
    const { data: dibuat, error: errUpsert } = await supabase
      .from("spj_surat_pernyataan_kendaraan")
      .upsert(baris, { onConflict: "surat_tugas_id,petugas_jenis,petugas_id,tanggal_mulai_set", ignoreDuplicates: true })
      .select("tanggal_mulai_set");
    if (errUpsert) return NextResponse.json({ error: errUpsert.message }, { status: 500 });
    const jumlahDibuat = dibuat?.length ?? 0;
    hasil.push({ jenis: "surat_keterangan", dibuat: jumlahDibuat, sudahAda: setRentang.length - jumlahDibuat });
  }

  return NextResponse.json({
    ok: true,
    nomor_st: st.nomor_st,
    set: setRentang.map((s) => ({ tanggal_mulai: s.tanggalMulai, tanggal_selesai: s.tanggalSelesai, jumlah_hari: s.jumlahHari })),
    hasil,
    peringatan,
  });
}
