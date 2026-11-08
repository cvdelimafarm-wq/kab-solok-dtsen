// lib/keu/usulanSampel.ts  (murni, tanpa basis data)
//
// (8 Nov 2026, D4) Usulan "Jumlah petugas per peran" dan "Beban tugas" pada identifikasi lanjutan, DITURUNKAN dari sampel kegiatan yang tertaut:
//   model 1  : sub SLS yang dialokasikan (sigap_alokasi_wilayah), sampel = jumlah target_sampel;
//   model 2/3: objek sampel dari pusat (sigap_sampel_objek), sampel = jumlah kolom "jumlah".
// Prinsip: alokasi/objek adalah SUMBER; angka di sini hanya USULAN. Tidak menimpa apa pun tanpa klik "Terapkan"; selisih tetap tampil di kolom Awal/Gap.
// Batas beban per PPL dan rasio PML per PPL TIDAK ditebak: pengguna yang mengisinya.

export type SumberSampel = {
  /** Identifikasi tertaut ke sebuah kegiatan (keu_ident_kegiatan, belum dilepas). */
  tersambung: boolean;
  kegiatan_id: number | null;
  kegiatan_nama: string | null;
  /** null = belum ada sampel yang bisa dibaca (atau tabel belum ada). */
  model: 1 | 2 | 3 | null;
  satuan: "sub SLS" | "objek";
  /** Jumlah unit yang dibagi ke PPL: sub SLS aktif (model 1) atau objek aktif (model 2/3). */
  unit: number;
  /** Total sampel (jumlah target_sampel atau jumlah kolom "jumlah"); 0 bila belum terisi. */
  sampel: number;
  /** Akun PPL/PML berbeda yang SUDAH tercatat pada alokasi/objek. */
  plot_ppl: number;
  plot_pml: number;
};

export const SUMBER_KOSONG: SumberSampel = { tersambung: false, kegiatan_id: null, kegiatan_nama: null, model: null, satuan: "sub SLS", unit: 0, sampel: 0, plot_ppl: 0, plot_pml: 0 };

export type ParamUsulan = { unitPerPpl: number; pplPerPml: number };
export type UsulanPeran = { ppl: number; pml: number; sampel: number };

const MAKS_PARAM = 100000;

/** Isian teks pengguna -> parameter sah (bilangan bulat 1..100000). Tidak ada nilai bawaan. */
export function periksaParam(mentah: { unitPerPpl: string; pplPerPml: string }): { ok: true; nilai: ParamUsulan } | { ok: false; pesan: string } {
  const baca = (s: string): number | null => {
    const t = String(s ?? "").trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return n >= 1 && n <= MAKS_PARAM ? n : null;
  };
  const a = baca(mentah.unitPerPpl);
  const b = baca(mentah.pplPerPml);
  if (a === null) return { ok: false, pesan: "Isi batas beban per PPL (bilangan bulat 1 atau lebih)." };
  if (b === null) return { ok: false, pesan: "Isi jumlah PPL per PML (bilangan bulat 1 atau lebih)." };
  return { ok: true, nilai: { unitPerPpl: a, pplPerPml: b } };
}

/** PPL = ceil(unit / batas per PPL); PML = ceil(PPL / PPL per PML). Tanpa unit = 0 petugas. */
export function usulanPeran(s: Pick<SumberSampel, "unit" | "sampel">, p: ParamUsulan): UsulanPeran {
  const unit = Math.max(0, Math.floor(Number(s.unit) || 0));
  const ppl = unit === 0 ? 0 : Math.ceil(unit / Math.max(1, p.unitPerPpl));
  const pml = ppl === 0 ? 0 : Math.ceil(ppl / Math.max(1, p.pplPerPml));
  return { ppl, pml, sampel: Math.max(0, Math.floor(Number(s.sampel) || 0)) };
}

export type PeranIsi = { on: boolean; nOrg: number; nMit: number };
export type MinimalSlot = { org: number; mit: number };
export type HasilTerapkan = {
  /** Nilai baru nOrg/nMit per peran; null = peran tidak diubah. */
  ppl: { nOrg: number; nMit: number } | null;
  pml: { nOrg: number; nMit: number } | null;
  /** Jumlah sampel untuk beban tugas; null = tidak diubah. */
  sampel: number | null;
  catatan: string[];
};

/**
 * Menerapkan usulan: bagian ORGANIK dibiarkan (pegawai yang sudah pasti), Mitra = usulan - organik, tidak kurang dari jumlah baris petugas yang sudah ada (`minimal`).
 * Peran yang tidak dipakai (on=false) tidak diubah. Hasilnya hanya nilai; pemanggil yang menuliskannya ke isian.
 */
export function terapkanUsulan(
  peran: { ppl: PeranIsi; pml: PeranIsi },
  u: UsulanPeran,
  minimal: { ppl: MinimalSlot; pml: MinimalSlot },
  opsi: { beban: boolean },
): HasilTerapkan {
  const catatan: string[] = [];
  const satu = (nama: string, p: PeranIsi, target: number, min: MinimalSlot): { nOrg: number; nMit: number } | null => {
    if (!p.on) {
      catatan.push(`${nama} tidak dipakai pada survei ini, jadi tidak diubah.`);
      return null;
    }
    let mit = target - p.nOrg;
    if (mit < 0) {
      mit = 0;
      catatan.push(`${nama}: organik (${p.nOrg}) sudah melebihi usulan (${target}); Mitra diset 0, organik tidak diubah.`);
    }
    if (mit < min.mit) {
      mit = min.mit;
      catatan.push(`${nama}: Mitra ditahan di ${min.mit} karena sudah ada ${min.mit} baris petugas Mitra (kosongkan baris dulu bila ingin menurunkan).`);
    }
    return { nOrg: p.nOrg, nMit: mit };
  };
  return {
    ppl: satu("PPL", peran.ppl, u.ppl, minimal.ppl),
    pml: satu("PML", peran.pml, u.pml, minimal.pml),
    sampel: opsi.beban && u.sampel > 0 ? u.sampel : null,
    catatan,
  };
}

/** Kalimat ringkas sumber untuk kartu usulan. */
export function ringkasSumber(s: SumberSampel): string {
  if (!s.tersambung) return "Identifikasi ini belum ditautkan ke kegiatan (kartu Pelaksanaan), sehingga sampel belum bisa dibaca.";
  if (s.model === null || s.unit === 0) return `Kegiatan ${s.kegiatan_nama ?? ""} belum punya alokasi sub SLS atau daftar sampel.`.replace("  ", " ");
  const dasar = s.model === 1 ? `${s.unit} sub SLS dialokasikan` : `${s.unit} objek di daftar sampel`;
  const sam = s.sampel > 0 ? `, total ${s.sampel} sampel` : "";
  const plot = s.plot_ppl > 0 ? `. Sudah ditetapkan: ${s.plot_ppl} PPL, ${s.plot_pml} PML` : "";
  return `${s.kegiatan_nama ?? "Kegiatan"} (model ${s.model}): ${dasar}${sam}${plot}.`;
}
