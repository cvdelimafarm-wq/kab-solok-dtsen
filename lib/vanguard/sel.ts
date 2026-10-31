// lib/vanguard/sel.ts  (murni)
//
// (1 Nov 2026) VANGUARD V1: daftar kotak isian (id sel STABIL + label) per blok. Meniru persis pembangun blok di prototipe simulasi_v3_referensi.html
// (data-id dan data-lbl), supaya engine dan tes tidak lagi bergantung pada DOM. Sel hitungan otomatis dan sel abu tidak termasuk (bukan isian).

import type { Blok, Kasus } from "./tipe";

export const AR = 2; // baris isian V.A
export const BR = 2; // baris isian V.B

export const D_ROWS: [string, string][] = [
  ["sewaLahan", "1 Sewa lahan"],
  ["keuntunganModal", "2 Keuntungan modal usaha RT (bagi hasil)"],
  ["keuntunganSaham", "3 Keuntungan saham (dividen)"],
  ["bunga", "4 Bunga (simpanan, pinjaman, dll.)"],
];
export const E_ROWS: [string, string][] = [
  ["badanUsaha", "2 Badan usaha"],
  ["rtLain", "3 Rumah tangga lain"],
  ["nirlaba", "4 Lembaga nirlaba"],
  ["luarNegeri", "5 Luar negeri"],
];
export const F_ROWS: [string, string][] = [
  ["pemerintah", "1 Pemerintah"],
  ["badanUsaha", "2 Badan usaha"],
  ["rtLain", "3 Rumah tangga"],
  ["nirlaba", "4 Lembaga nirlaba"],
  ["luarNegeri", "5 Luar negeri"],
];
export const G_SUB: [string, string][] = [
  ["bangunanUsaha", "a. Bangunan bukan tempat tinggal"],
  ["kendaraan", "b. Kendaraan"],
  ["mesin", "c. Mesin, perlengkapan, peralatan"],
  ["tanamanHewan", "d. Tanaman/hewan menghasilkan berulang"],
  ["lainnyaIP", "e. Lainnya (kekayaan intelektual)"],
];
export const G_MAIN: [string, string][] = [
  ["bangunanTinggal", "2 Bangunan tempat tinggal"],
  ["biayaPindahLahan", "3 Biaya pemindahan kepemilikan lahan"],
  ["lahan", "4 Lahan/tanah"],
  ["berharga", "5 Barang berharga"],
];

export type Sel = { id: string; label: string };

const P_VII = ["1. Pengambilan uang tunai dan tabungan", "2. Meminjam uang", "3. Menerima pembayaran kredit barang (usaha rumah tangga)", "4. Kredit barang", "5. Lainnya (pengembalian piutang, menggadaikan barang, mendapat arisan, klaim asuransi jiwa/pendidikan, dll.)"];
const G_VII = ["1. Menyimpan uang tunai dan menabung", "2. Membayar hutang", "3. Memberikan kredit barang (usaha rumah tangga)", "4. Membayar kredit barang", "5. Lainnya (meminjamkan uang, menebus barang gadaian, membayar arisan, premi asuransi jiwa/pendidikan, dll.)"];
const ringkasVII = (s: string) => s.replace(/^\d\. /, "").split(" (")[0];

function susunSel(): Record<Blok, Sel[]> {
  const r = { A: [], B: [], C: [], D: [], E: [], F: [], G: [], VI: [], VII: [] } as Record<Blok, Sel[]>;
  for (let i = 1; i <= AR; i++) {
    r.A.push({ id: `a${i}_uang`, label: `V.A · baris ${i} · (5) Upah/gaji uang` });
    r.A.push({ id: `a${i}_barang`, label: `V.A · baris ${i} · (6) Upah/gaji barang/jasa` });
    r.A.push({ id: `a${i}_lembur`, label: `V.A · baris ${i} · (7) Lembur, honorarium, THR` });
  }
  for (let i = 1; i <= BR; i++) {
    r.B.push({ id: `b${i}_produksi`, label: `V.B · baris ${i} · (5) Nilai produksi` });
    r.B.push({ id: `b${i}_biaya`, label: `V.B · baris ${i} · (6) Biaya produksi` });
  }
  r.C.push({ id: "c_sewaRumah_produksi", label: "V.C · 1 Perkiraan sewa rumah milik sendiri · (2) Nilai produksi" });
  r.C.push({ id: "c_hasilLain_produksi", label: "V.C · 2 Hasil pertanian dll. · (2) Nilai produksi" });
  r.C.push({ id: "c_hasilLain_biaya", label: "V.C · 2 Hasil pertanian dll. · (3) Biaya produksi" });
  for (const [k, l] of D_ROWS) {
    r.D.push({ id: `d_${k}_diterima`, label: `V.D · ${l} · (2) Diterima` });
    if (k !== "keuntunganSaham") r.D.push({ id: `d_${k}_dibayar`, label: `V.D · ${l} · (3) Dibayar` });
  }
  r.E.push({ id: "e_pensiun_uang", label: "V.E · 1.a Uang pensiun · (2) Uang diterima" });
  const barisE = (k: string, nm: string) => {
    r.E.push({ id: `e_${k}_uangD`, label: `${nm} · (2) Uang diterima` });
    r.E.push({ id: `e_${k}_barangD`, label: `${nm} · (3) Barang/jasa diterima` });
    r.E.push({ id: `e_${k}_uangB`, label: `${nm} · (4) Uang dibayar` });
    r.E.push({ id: `e_${k}_barangB`, label: `${nm} · (5) Barang/jasa dibayar` });
  };
  barisE("bantuan", "V.E · 1.b Bantuan pemerintah");
  for (const [k, l] of E_ROWS) barisE(k, `V.E · ${l}`);
  for (const [k, l] of F_ROWS) {
    const nm = `V.F · ${l}`;
    r.F.push({ id: `f_${k}_bangunanD`, label: `${nm} · (2) Diterima bangunan/alat/kendaraan` });
    r.F.push({ id: `f_${k}_lahanD`, label: `${nm} · (3) Diterima lahan/barang berharga` });
    if (k !== "pemerintah") r.F.push({ id: `f_${k}_bangunanB`, label: `${nm} · (4) Dibayar bangunan/alat/kendaraan` });
    r.F.push({ id: `f_${k}_lahanB`, label: `${nm} · (5) Dibayar lahan/barang berharga` });
  }
  const barisG = (k: string, l: string, tanpaKurang: boolean) => {
    const nm = `V.G · ${l}`;
    r.G.push({ id: `g_${k}_tambah`, label: `${nm} · (2) Penambahan` });
    if (!tanpaKurang) r.G.push({ id: `g_${k}_kurang`, label: `${nm} · (3) Pengurangan` });
  };
  for (const [k, l] of G_SUB) barisG(k, l, false);
  for (const [k, l] of G_MAIN) barisG(k, l, k === "biayaPindahLahan");
  r.VI.push({ id: "vi_g1", label: "VI · Pengeluaran 1 Konsumsi (IV.3.3 R.9 K.3 × 12)" });
  for (let i = 1; i <= 5; i++) {
    r.VII.push({ id: `vii_p${i}`, label: `VII · Penerimaan ${i} ${ringkasVII(P_VII[i - 1])}` });
    r.VII.push({ id: `vii_g${i}`, label: `VII · Pengeluaran ${i} ${ringkasVII(G_VII[i - 1])}` });
  }
  return r;
}

export const SEL_PER_BLOK: Record<Blok, Sel[]> = susunSel();
const PETA_LABEL = new Map<string, string>(Object.values(SEL_PER_BLOK).flat().map((s) => [s.id, s.label]));

/** Label kotak untuk pesan; id yang tidak dikenal dikembalikan apa adanya (sama dengan prototipe). */
export const labelSel = (id: string): string => PETA_LABEL.get(id) ?? id;
export const selDikenal = (id: string): boolean => PETA_LABEL.has(id);

/** Id kotak isian pada layar sebuah kasus, urut seperti pada layar. Kasus lengkap: VII Rincian 1 (vii_p1, vii_g1) tidak dinilai per kotak (dinilai lewat kontrol). */
export function idSelKasus(k: Pick<Kasus, "blok" | "lengkap">): string[] {
  const ids = k.blok.flatMap((b) => SEL_PER_BLOK[b]?.map((s) => s.id) ?? []);
  return k.lengkap ? ids.filter((id) => id !== "vii_p1" && id !== "vii_g1") : ids;
}
