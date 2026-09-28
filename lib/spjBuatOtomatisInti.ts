// lib/spjBuatOtomatisInti.ts
//
// (27 Sep 2026) Logic INTI "Buat Otomatis" (Kwitansi/Visum/Surat Pernyataan
// Kendaraan per SET, lihat lib/spjSetHariTugas.ts) DIPINDAHKAN ke sini dari
// app/api/penyisiran/spj/buat-otomatis/route.ts SUPAYA BISA DIPAKAI ULANG
// oleh app/api/penyisiran/spj/buat-otomatis-semua/route.ts (tombol "Jalankan
// untuk SEMUA petugas sekaligus") TANPA duplikasi -- ditemukan lewat laporan
// user "sebagian petugas seperti PPL Ilham tidak ada spj lain selain ST yang
// muncul" -> setelah dicek ke SELURUH petugas, ternyata BUKAN bug: Kwitansi/
// Visum/Surat Pernyataan memang belum pernah "Buat Otomatis"-kan utk mereka
// (tombolnya 3 buah TERPISAH di 3 tab berbeda, gampang ada yg kelewat,
// apalagi kalau Hari Tugas org itu baru ditandai/ditambah belakangan).
// Solusinya: 1 tombol baru yg menjalankan fungsi INI utk SEMUA kombinasi
// petugas+Surat Tugas yg ada di sistem sekaligus, bukan cuma 1-per-1 manual.
//
// SATU sumber logic ini dipakai BERSAMA oleh:
//  - app/api/penyisiran/spj/buat-otomatis/route.ts   (1 petugas, dipicu
//    tombol per-jenis dokumen di Administrasi SPJ / oleh petugas sendiri)
//  - app/api/penyisiran/spj/buat-otomatis-semua/route.ts (SEMUA petugas
//    sekaligus, KHUSUS pengelola, tombol baru "Jalankan utk semua petugas")
//
// Lihat komentar panjang yg SEBELUMNYA ada di kepala buat-otomatis/route.ts
// (riwayat keputusan 23-27 Sep 2026 soal mode SET, nominal Kwitansi, dst)--
// TIDAK diulang di sini spy tidak dobel, tapi semuanya MASIH BERLAKU PERSIS
// sama di fungsi ini (tidak ada perilaku yg berubah krn pemindahan ini).

import type { SupabaseClient } from "@supabase/supabase-js";
import { tabelAkun, SpjPetugasJenis } from "./spjAuth";
import { hitungKecamatanTugas } from "./spjWilayahTugas";
import { daftarHariKerjaPetugas } from "./spjHariKerja";
import { TEMPAT_KEDUDUKAN_DEFAULT } from "./spjPejabat";
import { terbilangRupiah } from "./spjFormat";
import {
  TARIF_TRANSLOK_PER_HARI_DEFAULT,
  hitungSetUntukSuratTugas,
  nominalKwitansiDefault,
  rencanakanPerbaikanSet,
  SetHariTugas,
  BarisSetExisting,
} from "./spjSetHariTugas";

export type JenisDokumenSet = "kwitansi" | "visum" | "surat_keterangan";
export const JENIS_DOKUMEN_SET: JenisDokumenSet[] = ["kwitansi", "visum", "surat_keterangan"];

export interface Peringatan {
  kode: string;
  jenis?: JenisDokumenSet;
  pesan: string;
  navigasi: { halaman: string; keterangan: string };
}

export interface HasilDokumen {
  jenis: JenisDokumenSet;
  dibuat: number;
  sudahAda: number;
  diperbaiki: number;
}

export interface PerbaikanSet {
  jenis: JenisDokumenSet;
  tanggalMulai: string;
  tanggalSelesai: string;
  rentangSebelum: { tanggalMulai: string; tanggalSelesai: string }[];
}

export interface HasilProsesPenugasan {
  ok: boolean;
  /** Pesan error KERAS (blm ada Hari Tugas / SET kosong / gagal query DB) -- kalau terisi, `hasil` bisa saja kosong/parsial. */
  error?: string;
  navigasi?: { halaman: string; keterangan: string };
  nomorSt?: string;
  set: { tanggalMulai: string; tanggalSelesai: string; jumlahHari: number }[];
  hasil: HasilDokumen[];
  peringatan: Peringatan[];
  perbaikan: PerbaikanSet[];
  ringkasanProses?: string;
}

export const NAV_HARI_TUGAS = {
  halaman: "Perencanaan Lapangan",
  keterangan: 'Tab "🗓 Identifikasi Hari Tugas" -- tandai tanggal kerja Anda dulu di sana.',
};
export const NAV_WILAYAH_TUGAS = {
  halaman: "Perencanaan Lapangan",
  keterangan: 'Tab "📋 Identifikasi Wilayah Sampel SLS" -- tautkan kecamatan wilayah tugas Anda dulu di sana.',
};

// supabase diketik "any" -- lihat catatan yg sama di lib/spjAuth.ts kenapa.
export async function prosesBuatOtomatisPenugasan(
  supabase: SupabaseClient<any, any, any>,
  params: {
    suratTugasId: number;
    targetJenis: SpjPetugasJenis;
    targetId: string;
    dokumenDipilih: JenisDokumenSet[];
    tarifPerHari?: number;
  }
): Promise<HasilProsesPenugasan> {
  const { suratTugasId, targetJenis, targetId, dokumenDipilih } = params;
  const tarifPerHari =
    Number.isFinite(params.tarifPerHari) && (params.tarifPerHari as number) > 0
      ? (params.tarifPerHari as number)
      : TARIF_TRANSLOK_PER_HARI_DEFAULT;

  const kosong = (): HasilProsesPenugasan => ({ ok: false, set: [], hasil: [], peringatan: [], perbaikan: [] });

  const { data: st, error: errSt } = await supabase
    .from("spj_surat_tugas")
    .select("id, nomor_st, tanggal_mulai, tanggal_selesai")
    .eq("id", suratTugasId)
    .maybeSingle();
  if (errSt) return { ...kosong(), error: errSt.message };
  if (!st) return { ...kosong(), error: "Surat Tugas tidak ditemukan." };

  const targetSession = { jenis: targetJenis, petugasId: targetId };
  const hariKerja = await daftarHariKerjaPetugas(supabase, targetSession);

  if (hariKerja.tanggal.length === 0) {
    return {
      ...kosong(),
      error:
        targetJenis === "penyisiran"
          ? "Belum ada tanggal yang ditandai di 🗓 Identifikasi Hari Tugas -- tandai dulu tanggal kerja sebelum membuat dokumen otomatis."
          : "Belum ada Surat Tugas yang tertaut sama sekali, sehingga tanggal kerja tidak dapat dihitung.",
      navigasi: NAV_HARI_TUGAS,
      nomorSt: st.nomor_st,
    };
  }

  const setRentang: SetHariTugas[] = hitungSetUntukSuratTugas(hariKerja.tanggal, st.tanggal_mulai, st.tanggal_selesai, "per_rentang");
  if (setRentang.length === 0) {
    return {
      ...kosong(),
      error: `Ada tanggal Hari Tugas yang ditandai (${hariKerja.tanggal[0]} s.d. ${hariKerja.tanggal[hariKerja.tanggal.length - 1]}), tapi tidak ada yang berada dalam rentang Surat Tugas ini (${st.tanggal_mulai} s.d. ${st.tanggal_selesai}). Periksa kembali tanggal yang ditandai atau rentang Surat Tugas.`,
      navigasi: NAV_HARI_TUGAS,
      nomorSt: st.nomor_st,
    };
  }

  const peringatan: Peringatan[] = [];
  const hasil: HasilDokumen[] = [];
  const perbaikan: PerbaikanSet[] = [];
  const db = supabase;

  async function perbaikiSetTidakKonsisten(
    tabel: "spj_kwitansi" | "spj_visum" | "spj_surat_pernyataan_kendaraan",
    jenis: JenisDokumenSet,
    terapkanUpdate: (setPenuh: SetHariTugas) => Record<string, unknown>
  ): Promise<{ error: string | null; jumlahDiperbaiki: number }> {
    const { data: existingRaw, error: errBaca } = await db
      .from(tabel)
      .select("id, tanggal_mulai_set, tanggal_selesai_set")
      .eq("surat_tugas_id", suratTugasId)
      .eq("petugas_jenis", targetJenis)
      .eq("petugas_id", targetId);
    if (errBaca) return { error: errBaca.message, jumlahDiperbaiki: 0 };

    const existing: BarisSetExisting[] = ((existingRaw ?? []) as { id: number; tanggal_mulai_set: string; tanggal_selesai_set: string }[]).map(
      (r) => ({ id: r.id, tanggalMulaiSet: r.tanggal_mulai_set, tanggalSelesaiSet: r.tanggal_selesai_set })
    );
    const rencana = rencanakanPerbaikanSet(setRentang, existing);

    let jumlahDiperbaiki = 0;
    for (const r of rencana) {
      if (r.status !== "perlu_diperbaiki" || r.idDipertahankan === null) continue;
      const { error: errUpdate } = await db.from(tabel).update(terapkanUpdate(r.set)).eq("id", r.idDipertahankan);
      if (errUpdate) return { error: errUpdate.message, jumlahDiperbaiki };
      if (r.idDihapus.length > 0) {
        const { error: errDelete } = await db.from(tabel).delete().in("id", r.idDihapus);
        if (errDelete) return { error: errDelete.message, jumlahDiperbaiki };
      }
      jumlahDiperbaiki++;
      perbaikan.push({ jenis, tanggalMulai: r.set.tanggalMulai, tanggalSelesai: r.set.tanggalSelesai, rentangSebelum: r.rentangSebelum });
    }
    return { error: null, jumlahDiperbaiki };
  }

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
      const { error: errPerbaikan, jumlahDiperbaiki } = await perbaikiSetTidakKonsisten("spj_kwitansi", "kwitansi", (s) => {
        const nominal = nominalKwitansiDefault(s.jumlahHari, tarifPerHari);
        return {
          tanggal_mulai_set: s.tanggalMulai,
          tanggal_selesai_set: s.tanggalSelesai,
          // "Tanggal" pd baris "Berdasarkan Surat Tugas" di Kwitansi
          // (lib/pdf/kwitansi.ts) adalah tanggal ST ITU SENDIRI -- SATU
          // nilai tetap utk SEMUA Kwitansi di bawah 1 ST yg sama, BUKAN
          // tanggal mulai batch/SET (`s.tanggalMulai`, bisa beda2 per SET).
          tanggal_spd: st.tanggal_mulai,
          jumlah_hari: s.jumlahHari,
          nominal_per_hari: tarifPerHari,
          nominal,
          terbilang: terbilangRupiah(nominal),
          untuk_perjalanan_dinas_pada: kecamatan.wilayahTugas,
        };
      });
      if (errPerbaikan) return { ok: false, error: errPerbaikan, set: [], hasil, peringatan, perbaikan };

      const baris = setRentang.map((s) => {
        const nominal = nominalKwitansiDefault(s.jumlahHari, tarifPerHari);
        return {
          surat_tugas_id: suratTugasId,
          petugas_jenis: targetJenis,
          petugas_id: targetId,
          nominal,
          terbilang: terbilangRupiah(nominal),
          untuk_perjalanan_dinas_pada: kecamatan.wilayahTugas,
          tanggal_spd: st.tanggal_mulai,
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
      if (errUpsert) return { ok: false, error: errUpsert.message, set: [], hasil, peringatan, perbaikan };
      const jumlahDibuat = dibuat?.length ?? 0;
      hasil.push({
        jenis: "kwitansi",
        dibuat: jumlahDibuat,
        diperbaiki: jumlahDiperbaiki,
        sudahAda: setRentang.length - jumlahDibuat - jumlahDiperbaiki,
      });
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

      const { error: errPerbaikan, jumlahDiperbaiki } = await perbaikiSetTidakKonsisten("spj_visum", "visum", (s) => ({
        tanggal_mulai_set: s.tanggalMulai,
        tanggal_selesai_set: s.tanggalSelesai,
        rencana_tujuan: kecamatan.wilayahTugas,
        tempat_kedudukan: tempatKedudukan,
        tanggal_berangkat: s.tanggalMulai,
        tanggal_tiba_tujuan: s.tanggalMulai,
        tanggal_berangkat_kembali: s.tanggalSelesai,
        tanggal_tiba_kembali: s.tanggalSelesai,
        updated_at: new Date().toISOString(),
      }));
      if (errPerbaikan) return { ok: false, error: errPerbaikan, set: [], hasil, peringatan, perbaikan };

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
      if (errUpsert) return { ok: false, error: errUpsert.message, set: [], hasil, peringatan, perbaikan };
      const jumlahDibuat = dibuat?.length ?? 0;
      hasil.push({
        jenis: "visum",
        dibuat: jumlahDibuat,
        diperbaiki: jumlahDiperbaiki,
        sudahAda: setRentang.length - jumlahDibuat - jumlahDiperbaiki,
      });
    }
  }

  if (dokumenDipilih.includes("surat_keterangan")) {
    const { error: errPerbaikan, jumlahDiperbaiki } = await perbaikiSetTidakKonsisten(
      "spj_surat_pernyataan_kendaraan",
      "surat_keterangan",
      (s) => ({
        tanggal_mulai_set: s.tanggalMulai,
        tanggal_selesai_set: s.tanggalSelesai,
        tanggal_pelaksanaan: s.tanggalSelesai,
      })
    );
    if (errPerbaikan) return { ok: false, error: errPerbaikan, set: [], hasil, peringatan, perbaikan };

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
    if (errUpsert) return { ok: false, error: errUpsert.message, set: [], hasil, peringatan, perbaikan };
    const jumlahDibuat = dibuat?.length ?? 0;
    hasil.push({
      jenis: "surat_keterangan",
      dibuat: jumlahDibuat,
      diperbaiki: jumlahDiperbaiki,
      sudahAda: setRentang.length - jumlahDibuat - jumlahDiperbaiki,
    });
  }

  const totalDiperbaiki = perbaikan.length;
  const totalDibuat = hasil.reduce((a, h) => a + h.dibuat, 0);
  const ringkasanProses =
    totalDiperbaiki === 0
      ? totalDibuat === 0
        ? "Tidak ada perubahan -- semua SET yang relevan sudah lengkap & konsisten dengan tanggal Hari Tugas saat ini."
        : `Langsung generate -- semua SET sudah konsisten, ${totalDibuat} baris dokumen baru dibuat.`
      : `Ditemukan ${totalDiperbaiki} SET yang belum konsisten dengan tanggal Hari Tugas saat ini (baris lama digabung/diperluas ulang) sebelum ${totalDibuat} baris dokumen baru dibuat.`;

  return {
    ok: true,
    nomorSt: st.nomor_st,
    set: setRentang.map((s) => ({ tanggalMulai: s.tanggalMulai, tanggalSelesai: s.tanggalSelesai, jumlahHari: s.jumlahHari })),
    hasil,
    peringatan,
    perbaikan,
    ringkasanProses,
  };
}
