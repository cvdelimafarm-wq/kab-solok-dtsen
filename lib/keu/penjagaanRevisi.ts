// lib/keu/penjagaanRevisi.ts
//
// (7 Nov 2026, tahap 4a) Penjagaan jendela revisi per jenis -- logika murni. Menghitung NERACA kertas kerja satu satker (selisih pagu per KRO, total
// satker, total akun 524xxx per KRO dan per satker) lalu menurunkan temuan MERAH (memblokir pengajuan) dan KUNING (peringatan) menurut jenis revisi
// yang ditetapkan PPK. Rancangan: claude/penjagaan-jendela-revisi-per-jenis-7nov.md (keputusan Iqbal 7 Nov 2026 09.56).
//
//   pok        : pagu tiap KRO tetap, total satker tetap, total 524xxx satker tetap (merah); 524xxx per KRO berubah = peringatan (seimbangkan
//                lewat substitusi silang dengan KRO lain).
//   administrasi: dijaga sama seperti POK (revisi administrasi tidak menggeser uang antar KRO).
//   dipa_djpb / dipa_dja: pagu KRO boleh berubah, wajib seimbang: jumlah selisih KRO = selisih total satker = transfer masuk dikurangi keluar
//                antar satker (dicatat nama satker + nilai, tanpa lampiran wajib); total satker boleh "dijaga tetap" (transfer bersih harus nol).
//                524xxx satker berubah = peringatan yang harus dijelaskan.
//   semua jenis: pagu baris tidak boleh di bawah Booked + Realisasi (merah).
//
// Aturan sebenarnya ditegakkan ULANG di basis data saat pengajuan (langkah SQL tahap 4b); modul ini mencegah kiriman sia-sia dan menampilkan kartu
// "Batas revisi ini" beserta neraca langsung. Volume RO dan sumber dana tidak ada pada data kertas kerja sehingga hanya diperiksa di basis data.

import { n, type BarisKk } from "./kk";
import { kroDariRo } from "./matriks";

export type JenisRevisi = "pok" | "administrasi" | "dipa_djpb" | "dipa_dja";
export type TingkatTemuan = "merah" | "kuning" | "info";
export type TemuanJaga = { tingkat: TingkatTemuan; kode: string; objek: string | null; pesan: string; nilai: number | null };

/** Transfer antar satker (cukup dicatat): arah masuk = tambahan dari satker lain, keluar = pelepasan ke satker lain. */
export type TransferSatker = { arah: "masuk" | "keluar"; satker: string; nilai: number };

export type BarisJaga = BarisKk & { booked?: number; real?: number };

export type NeracaKro = { kro: string; semula: number; menjadi: number; selisih: number; semula524: number; menjadi524: number; selisih524: number };
export type NeracaSatker = {
  perKro: NeracaKro[];
  semula: number; menjadi: number; selisih: number;
  semula524: number; menjadi524: number; selisih524: number;
  transferMasuk: number; transferKeluar: number; transferBersih: number;
};
export type HasilJaga = { jenis: JenisRevisi; neraca: NeracaSatker; temuan: TemuanJaga[]; memblokir: boolean; jumlahMerah: number; jumlahKuning: number };

export type OpsiJaga = { transfer?: readonly TransferSatker[]; jagaTotalTetap?: boolean };

export const NAMA_JENIS_JAGA: Record<JenisRevisi, string> = {
  pok: "Revisi POK", administrasi: "Revisi administrasi", dipa_djpb: "Revisi DIPA jalur DJPb", dipa_dja: "Revisi DIPA jalur DJA",
};

/** Teks kartu "Batas revisi ini" per jenis (ditampilkan ke ketua tim di modal dan di kertas kerja). */
export function batasRevisi(jenis: JenisRevisi): string[] {
  switch (jenis) {
    case "pok":
    case "administrasi":
      return [
        "Pagu tiap KRO tetap; dana hanya boleh bergeser antar akun, komponen, dan RO di dalam KRO yang sama.",
        "Pagu satker dan total belanja perjalanan (akun 524xxx) satker tetap sama.",
        "Bila 524xxx di satu KRO berubah, seimbangkan dengan KRO lain (naik di satu, turun di yang lain) lewat pertukaran dengan akun non-524 di KRO masing-masing.",
        "Pagu baris tidak boleh di bawah Booked ditambah Realisasi.",
      ];
    case "dipa_djpb":
    case "dipa_dja":
      return [
        "Pagu KRO boleh berubah, asal seimbang: subsidi dari KRO lain atau tambahan/pelepasan antar satker (catat nama satker dan nilainya).",
        "Pagu satker boleh berubah hanya sebesar tambahan dikurangi pelepasan antar satker; atau dijaga tetap.",
        "Perubahan total 524xxx satker perlu dijelaskan.",
        "Pagu baris tidak boleh di bawah Booked ditambah Realisasi.",
      ];
  }
}

const adalah524 = (akun: string | null | undefined): boolean => (akun ?? "").startsWith("524");
const rp = (v: number): string => `Rp ${Math.round(Math.abs(v)).toLocaleString("id-ID")}`;
const arah = (v: number): string => (v > 0 ? "naik" : "turun");

/** Neraca satker dari seluruh baris kertas kerja satker (semua RO), ditambah transfer antar satker yang dicatat. */
export function hitungNeracaSatker(baris: readonly BarisJaga[], transfer: readonly TransferSatker[] = []): NeracaSatker {
  const per = new Map<string, NeracaKro>();
  const ambil = (kro: string): NeracaKro => {
    let x = per.get(kro);
    if (!x) { x = { kro, semula: 0, menjadi: 0, selisih: 0, semula524: 0, menjadi524: 0, selisih524: 0 }; per.set(kro, x); }
    return x;
  };
  for (const b of baris) {
    const kro = b.kro ?? kroDariRo(b.ro_kode) ?? "(tanpa KRO)";
    const k = ambil(kro);
    const s = n(b.jumlah_semula), m = n(b.jumlah_menjadi);
    k.semula += s; k.menjadi += m;
    if (adalah524(b.akun_semula)) k.semula524 += s;
    if (adalah524(b.akun_menjadi)) k.menjadi524 += m;
  }
  const perKro = [...per.values()].sort((a, b) => (a.kro < b.kro ? -1 : 1));
  for (const k of perKro) { k.selisih = k.menjadi - k.semula; k.selisih524 = k.menjadi524 - k.semula524; }
  const jum = (f: (k: NeracaKro) => number) => perKro.reduce((t, k) => t + f(k), 0);
  const semula = jum((k) => k.semula), menjadi = jum((k) => k.menjadi);
  const semula524 = jum((k) => k.semula524), menjadi524 = jum((k) => k.menjadi524);
  const transferMasuk = transfer.filter((t) => t.arah === "masuk").reduce((t, x) => t + Math.max(0, n(x.nilai)), 0);
  const transferKeluar = transfer.filter((t) => t.arah === "keluar").reduce((t, x) => t + Math.max(0, n(x.nilai)), 0);
  return {
    perKro, semula, menjadi, selisih: menjadi - semula, semula524, menjadi524, selisih524: menjadi524 - semula524,
    transferMasuk, transferKeluar, transferBersih: transferMasuk - transferKeluar,
  };
}

/** Temuan penjagaan menurut jenis revisi. Selisih dibandingkan pada pembulatan rupiah (selisih di bawah Rp 1 diabaikan). */
export function jagaRevisi(jenis: JenisRevisi, baris: readonly BarisJaga[], opsi: OpsiJaga = {}): HasilJaga {
  const neraca = hitungNeracaSatker(baris, opsi.transfer ?? []);
  const temuan: TemuanJaga[] = [];
  const nol = (v: number) => Math.abs(v) < 1;
  const tambah = (tingkat: TingkatTemuan, kode: string, objek: string | null, pesan: string, nilai: number | null) => temuan.push({ tingkat, kode, objek, pesan, nilai });
  const ketat = jenis === "pok" || jenis === "administrasi";

  // J-05 (semua jenis): pagu baris tidak di bawah Booked + Realisasi.
  for (const b of baris) {
    const kunci = n(b.booked) + n(b.real);
    if (b.detail_id !== null && kunci > 0 && n(b.jumlah_menjadi) + 0.5 < kunci) {
      tambah("merah", "J-05", b.uraian_menjadi ?? b.uraian_semula ?? `baris ${b.id}`, `Jumlah Menjadi ${rp(n(b.jumlah_menjadi))} di bawah Booked + Realisasi ${rp(kunci)}.`, n(b.jumlah_menjadi) - kunci);
    }
  }

  if (ketat) {
    for (const k of neraca.perKro) {
      if (!nol(k.selisih)) tambah("merah", "J-01", k.kro, `Pagu KRO ${k.kro} ${arah(k.selisih)} ${rp(k.selisih)}. Pada ${NAMA_JENIS_JAGA[jenis]} pagu KRO harus tetap; pindahkan dana di dalam KRO yang sama atau minta jenis revisi DIPA.`, k.selisih);
    }
    if (!nol(neraca.selisih)) tambah("merah", "J-02", null, `Pagu satker ${arah(neraca.selisih)} ${rp(neraca.selisih)}. Pada ${NAMA_JENIS_JAGA[jenis]} pagu satker harus tetap.`, neraca.selisih);
    if (!nol(neraca.selisih524)) tambah("merah", "J-03", null, `Total belanja perjalanan 524xxx satker ${arah(neraca.selisih524)} ${rp(neraca.selisih524)}. Total 524xxx satker harus tetap; seimbangkan antar KRO.`, neraca.selisih524);
    const ada524 = neraca.perKro.filter((k) => !nol(k.selisih524));
    for (const k of ada524) {
      const lawan = ada524.filter((x) => x.kro !== k.kro && Math.sign(x.selisih524) === -Math.sign(k.selisih524)).map((x) => x.kro);
      tambah("kuning", "J-04", k.kro, `524xxx di KRO ${k.kro} ${arah(k.selisih524)} ${rp(k.selisih524)}; seimbangkan dengan KRO lain (berlawanan ${rp(k.selisih524)})${lawan.length ? `, mis. ${lawan.join(", ")} sudah ${arah(-k.selisih524)}` : ""}.`, k.selisih524);
    }
  } else {
    // DJPb / DJA: neraca harus nol: jumlah selisih KRO = selisih total satker = transfer masuk - keluar.
    const sumberKro = neraca.perKro.reduce((t, k) => t + k.selisih, 0);
    if (!nol(sumberKro - neraca.transferBersih)) {
      const sel = sumberKro - neraca.transferBersih;
      tambah("merah", "J-06", null, sel > 0
        ? `Pagu bertambah ${rp(sumberKro)} tetapi tambahan dari satker lain tercatat ${rp(neraca.transferBersih)}; kurang ${rp(sel)} sumber (catat tambahan satker lain atau turunkan KRO yang naik).`
        : `Pagu berkurang ${rp(sumberKro)} tetapi pelepasan ke satker lain tercatat ${rp(neraca.transferBersih)}; selisih ${rp(sel)} belum punya tujuan (catat pelepasan atau naikkan KRO lain).`, sel);
    }
    if (opsi.jagaTotalTetap === true && !nol(neraca.transferBersih)) tambah("merah", "J-02", null, `Total pagu satker dijaga tetap, tetapi transfer antar satker bersih ${rp(neraca.transferBersih)}.`, neraca.transferBersih);
    if (!nol(neraca.selisih524)) tambah("kuning", "J-07", null, `Total belanja perjalanan 524xxx satker ${arah(neraca.selisih524)} ${rp(neraca.selisih524)}; jelaskan alasan perubahannya.`, neraca.selisih524);
    for (const t of opsi.transfer ?? []) {
      if (t.satker.trim() === "" || !(n(t.nilai) > 0)) tambah("merah", "J-08", t.satker.trim() || null, "Catatan transfer antar satker perlu nama satker dan nilai lebih dari nol.", null);
    }
    for (const k of neraca.perKro) {
      if (!nol(k.selisih)) tambah("info", "J-09", k.kro, `Pagu KRO ${k.kro} ${arah(k.selisih)} ${rp(k.selisih)}; sumbernya KRO lain atau satker lain.`, k.selisih);
    }
  }

  const jumlahMerah = temuan.filter((x) => x.tingkat === "merah").length;
  const jumlahKuning = temuan.filter((x) => x.tingkat === "kuning").length;
  return { jenis, neraca, temuan, memblokir: jumlahMerah > 0, jumlahMerah, jumlahKuning };
}
