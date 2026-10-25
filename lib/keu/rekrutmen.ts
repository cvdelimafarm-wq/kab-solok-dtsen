// lib/keu/rekrutmen.ts
//
// (26 Okt 2026, tahap 34) Rekrutmen mitra: apa yang dibaca modul rekrutmen dari identifikasi lanjutan. Berkas ini MURNI (tanpa React/DB): mengubah daftar petugas
// berstatus mitra pada lanjutan menjadi kebutuhan per peran dan status per mitra (menunggu seleksi, menunggu nama dari kepka, siap SPK, SPK konsep, SPK terbit),
// beserta tenggat (SPK paling lambat sebelum pelatihan yang diikuti peran itu, atau sebelum pendataan bila tidak ada kelas).
//
// Prinsip (sama dengan tahap lain): hanya MEMBACA dan menyarankan. Tidak ada yang tertulis, tidak ada yang diblokir. Surat tugas atau SPK dibuat di layar dokumen
// lanjutan; halaman ini hanya menunjukkan mana yang sudah dan belum. Mitra sumber "kepka" = ditetapkan langsung oleh kepala kantor; "seleksi" = lewat seleksi mitra.

import { selisihHari } from "./identifikasi";
import type { Nada } from "./identifikasiHilir";
import { KODE_PERAN, NAMA_PERAN, tglValid, type IsiLanjutan, type KodePeran, type Petugas } from "./lanjutan";

export type StatusMitra = "menunggu_seleksi" | "menunggu_nama" | "peran_kosong" | "siap_spk" | "spk_konsep" | "spk_terbit";

export const LABEL_MITRA: Record<StatusMitra, { teks: string; nada: Nada; urut: number; tindakan: string }> = {
  menunggu_seleksi: { teks: "Menunggu seleksi", nada: "kuning", urut: 1, tindakan: "Calon belum ditetapkan lewat seleksi; isi nama pada lanjutan setelah seleksi selesai." },
  menunggu_nama: { teks: "Menunggu nama dari kepka", nada: "kuning", urut: 2, tindakan: "Nama mitra yang ditunjuk langsung belum diisi pada lanjutan." },
  peran_kosong: { teks: "Peran belum dipilih", nada: "kuning", urut: 3, tindakan: "Pilih peran mitra ini pada lanjutan." },
  siap_spk: { teks: "Siap dibuatkan SPK", nada: "biru", urut: 4, tindakan: "Buat surat tugas atau SPK pada layar dokumen lanjutan." },
  spk_konsep: { teks: "SPK konsep", nada: "biru", urut: 5, tindakan: "Lengkapi nomor, tanggal, dan penandatangan, lalu terbitkan." },
  spk_terbit: { teks: "SPK terbit", nada: "hijau", urut: 6, tindakan: "" },
};

/** Bentuk minimal baris dokumen yang dibutuhkan (tersedia dari keu_v_ident_dokumen). */
export type DokumenMin = { jenis: string; kunci: string; status: string };

export type BarisMitra = {
  urut: number;
  kode: string;
  nama: string;
  peran: KodePeran | "";
  sumber: "kepka" | "seleksi";
  baru: boolean;
  status: StatusMitra;
  /** Hari terakhir SPK semestinya terbit (hari mulai kelas pertama yang diikuti peran itu, atau mulai pendataan paling awal); null bila belum ada tanggal. */
  tenggat: string | null;
  /** Sisa hari sampai tenggat (negatif = lewat); null bila tanpa tenggat. */
  sisaHari: number | null;
  nada: Nada;
  catatan: string;
};

export type BarisPeranMitra = {
  kode: KodePeran;
  nama: string;
  /** Jumlah mitra yang dibutuhkan (peran dipakai: nMit; selain itu jumlah tercatat). */
  target: number;
  tercatat: number;
  bernama: number;
  kepka: number;
  seleksi: number;
  baru: number;
  spkTerbit: number;
  /** target - tercatat bila positif: mitra yang masih harus dicatat pada lanjutan. */
  kurang: number;
  /** tercatat - target bila positif: mitra tercatat melebihi kebutuhan. */
  lebih: number;
  perkiraan: boolean;
  tenggat: string | null;
};

export type RingkasRekrutmen = {
  aktif: boolean;
  mitra: BarisMitra[];
  peran: BarisPeranMitra[];
  total: number;
  spkTerbit: number;
  siapSpk: number;
  menungguSeleksi: number;
  menungguNama: number;
  baru: number;
  kurang: number;
  nada: Nada;
  catatan: string[];
};

const pangkas = (s: string): string => s.replace(/^ +| +$/g, "");
const sah = (t: string): string | null => (tglValid(t) ? t : null);
const awalTerkecil = (a: (string | null)[]): string | null => { const x = a.filter((t): t is string => t !== null).sort(); return x.length ? x[0] : null; };

/** Tenggat SPK satu peran: mulai kelas paling awal yang diikuti peran itu; bila tidak ada, mulai pendataan paling awal. */
export function tenggatPeran(isi: IsiLanjutan, peran: KodePeran | "", pendataan: { mulai: string }[]): string | null {
  if (peran !== "") {
    const t = awalTerkecil(isi.kelas.filter((k) => k.untuk.includes(peran)).map((k) => sah(k.mulai)));
    if (t) return t;
  }
  return awalTerkecil(pendataan.map((p) => sah(p.mulai)));
}

/** Status satu mitra dari isian lanjutan dan dokumen yang ada. */
export function statusMitra(p: Petugas, dokumen: DokumenMin[]): StatusMitra {
  const tanpaNama = p.menyusul || pangkas(p.nama) === "";
  if (tanpaNama) return p.sumber === "seleksi" ? "menunggu_seleksi" : "menunggu_nama";
  const dok = dokumen.find((d) => d.jenis === "tugas" && d.kunci === p.id);
  if (dok?.status === "terbit") return "spk_terbit";
  if (p.peran === "") return "peran_kosong";
  return dok ? "spk_konsep" : "siap_spk";
}

function nadaMitra(status: StatusMitra, sisa: number | null): Nada {
  if (status === "spk_terbit") return "hijau";
  if (sisa === null) return "abu";
  if (sisa < 0) return "merah";
  return sisa <= 14 ? "kuning" : status === "spk_konsep" || status === "siap_spk" ? "biru" : "abu";
}

const kata = (n: number, satu: string): string => `${n} ${satu}`;

export function ringkasRekrutmen(
  isi: IsiLanjutan, dokumen: DokumenMin[], pendataan: { mulai: string }[], hariIni: string,
): RingkasRekrutmen {
  const mitra: BarisMitra[] = [];
  isi.petugas.forEach((p, i) => {
    if (p.status !== "Mitra") return;
    const status = statusMitra(p, dokumen);
    const tenggat = tenggatPeran(isi, p.peran, pendataan);
    const sisaHari = tenggat ? selisihHari(tenggat, hariIni) : null;
    const nada = nadaMitra(status, sisaHari);
    let catatan = LABEL_MITRA[status].tindakan;
    if (status !== "spk_terbit" && sisaHari !== null && sisaHari < 0) catatan = `${catatan}${catatan ? " " : ""}Tenggat sudah lewat ${-sisaHari} hari.`.trim();
    mitra.push({
      urut: i + 1, kode: p.id, nama: pangkas(p.nama), peran: p.peran, sumber: p.sumber === "seleksi" ? "seleksi" : "kepka", baru: p.baru,
      status, tenggat, sisaHari, nada, catatan,
    });
  });

  const peran: BarisPeranMitra[] = [];
  for (const k of KODE_PERAN) {
    const x = isi.peran[k];
    const dari = mitra.filter((m) => m.peran === k);
    const target = x.on ? x.nMit : dari.length;
    if (target === 0 && dari.length === 0) continue;
    peran.push({
      kode: k, nama: NAMA_PERAN[k], target, tercatat: dari.length,
      bernama: dari.filter((m) => m.status !== "menunggu_seleksi" && m.status !== "menunggu_nama").length,
      kepka: dari.filter((m) => m.sumber === "kepka").length, seleksi: dari.filter((m) => m.sumber === "seleksi").length,
      baru: dari.filter((m) => m.baru).length, spkTerbit: dari.filter((m) => m.status === "spk_terbit").length,
      kurang: Math.max(0, target - dari.length), lebih: Math.max(0, dari.length - target), perkiraan: x.on && !x.fix,
      tenggat: tenggatPeran(isi, k, pendataan),
    });
  }

  const urut = [...mitra].sort((a, b) => LABEL_MITRA[a.status].urut - LABEL_MITRA[b.status].urut || (a.tenggat ?? "9999").localeCompare(b.tenggat ?? "9999") || a.urut - b.urut);
  const hitung = (s: StatusMitra) => mitra.filter((m) => m.status === s).length;
  const total = mitra.length;
  const spkTerbit = hitung("spk_terbit");
  const kurang = peran.reduce((s, r) => s + r.kurang, 0);
  const catatan: string[] = [];

  if (total === 0 && kurang === 0) {
    return { aktif: false, mitra: [], peran, total: 0, spkTerbit: 0, siapSpk: 0, menungguSeleksi: 0, menungguNama: 0, baru: 0, kurang: 0, nada: "abu", catatan: ["Tidak ada mitra pada identifikasi lanjutan: rekrutmen tidak aktif."] };
  }
  if (kurang > 0) catatan.push(`${kata(kurang, "mitra")} sesuai kebutuhan peran belum dicatat pada lanjutan.`);
  for (const r of peran) if (r.lebih > 0) catatan.push(`${r.nama}: mitra tercatat ${r.tercatat} melebihi kebutuhan ${r.target}.`);
  for (const r of peran) if (r.perkiraan && r.target > 0) catatan.push(`Jumlah mitra ${r.nama} masih Perkiraan.`);
  const baru = mitra.filter((m) => m.baru).length;
  if (baru > 0) catatan.push(`${kata(baru, "mitra")} ditandai baru: pastikan sudah terdaftar di master mitra sebelum SPK diterbitkan.`);
  const seleksi = hitung("menunggu_seleksi");
  if (seleksi > 0) catatan.push(`${kata(seleksi, "mitra")} masih menunggu hasil seleksi.`);
  const terlambat = mitra.filter((m) => m.status !== "spk_terbit" && m.sisaHari !== null && m.sisaHari < 0).length;
  if (terlambat > 0) catatan.push(`${kata(terlambat, "mitra")} sudah melewati tenggat SPK.`);
  if (mitra.some((m) => m.status !== "spk_terbit" && m.tenggat === null)) catatan.push("Sebagian tenggat belum dapat dihitung karena tanggal kelas atau jadwal pendataan belum lengkap.");

  const nada: Nada = terlambat > 0 ? "merah" : total > 0 && spkTerbit === total && kurang === 0 ? "hijau" : "kuning";
  return {
    aktif: true, mitra: urut, peran, total, spkTerbit, siapSpk: hitung("siap_spk") + hitung("spk_konsep"), menungguSeleksi: seleksi,
    menungguNama: hitung("menunggu_nama") + hitung("peran_kosong"), baru, kurang, nada, catatan,
  };
}

/** Kalimat tenggat untuk tampilan. */
export function teksTenggat(tenggat: string | null, sisaHari: number | null): string {
  if (tenggat === null || sisaHari === null) return "tenggat belum ada";
  const [y, m, d] = tenggat.split("-");
  const tgl = `${d}/${m}/${y}`;
  if (sisaHari < 0) return `${tgl} (lewat ${-sisaHari} hari)`;
  if (sisaHari === 0) return `${tgl} (hari ini)`;
  return `${tgl} (${sisaHari} hari lagi)`;
}
