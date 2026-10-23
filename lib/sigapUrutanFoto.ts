// lib/sigapUrutanFoto.ts  (murni; aman dipakai klien dan server)
//
// (23 Okt 2026) Aturan URUTAN JAM pada nomor foto Kamera SIGAP. Keputusan pemilik: satu-satunya penyebab peringatan ⚠ di panel
// "Nomor foto" adalah urutan nomor yang tidak sesuai urutan jam foto.
//   - Bentrok = foto bernomor LEBIH KECIL tercatat LEBIH AKHIR daripada foto bernomor lebih besar.
//   - Jam dibandingkan pada ketelitian MENIT (yang tampil di layar: "13.48"). Jam yang sama tidak dianggap salah.
//   - Hanya foto yang BENAR-BENAR menempati nomor dan punya jam (foto Kamera SIGAP) yang dinilai. Unggahan manual (tanpa jam),
//     nomor kosong, foto tahanan (belum menempati nomor), dan foto cadangan tidak dinilai.
//   - Fungsi "Urutkan sesuai jam" memakai aturan yang sama: sesudah diurutkan, tidak ada bentrok tersisa.
// Tidak ada kriteria lain (jarak, akurasi, cap waktu, dst.) di tampilan ini; kriteria itu tetap dipakai di tempat lain (SPJ, PeriksaFoto, dst.).

/** Isi satu nomor. `fotoId` null = unggahan manual; `ms` null = jam tidak diketahui. Nomor kosong tidak dimasukkan. */
export type IsiNomor = { slot: number; fotoId: number | null; ms: number | null };
/** `kecil` = nomor lebih kecil yang jamnya LEBIH AKHIR daripada nomor `besar`. */
export type Bentrok = { kecil: number; besar: number };
export type NilaiJam = { bentrok: Bentrok[]; jumlahBerjam: number };

const WIB_MS = 7 * 3_600_000;
const menit = (ms: number) => Math.floor(ms / 60_000);
const berjam = (x: IsiNomor) => x.ms !== null && Number.isFinite(x.ms);

/** "13.48" (WIB) dari epoch ms. */
export function jamWib(ms: number): string {
  return new Date(ms + WIB_MS).toISOString().slice(11, 16).replace(":", ".");
}

/** Peran singkat tiap nomor (untuk kisi dan kalimat konfirmasi). Jenis tidak dikenal/kosong = pendataan. */
const PERAN_PENDATAAN = ["Berangkat", "Tiba di lokasi", "Mendata", "Pulang", "Tiba di rumah"];
const PERAN_PELATIHAN = ["Berangkat", "Tiba di lokasi", "Pelatihan", "Pulang", "Tiba di kediaman"];
export function peranRingkas(jenis: string | null | undefined, slot: number): string {
  return (jenis === "pelatihan" ? PERAN_PELATIHAN : PERAN_PENDATAAN)[slot - 1] ?? `Foto ${slot}`;
}

/** Semua pasangan nomor yang urutan jamnya terbalik (nomor kecil lebih akhir dari nomor besar), diurut dari pasangan berdekatan. */
export function cariBentrok(isi: IsiNomor[]): Bentrok[] {
  const t = isi.filter(berjam).sort((a, b) => a.slot - b.slot);
  const hasil: Bentrok[] = [];
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      if (menit(t[i].ms as number) > menit(t[j].ms as number)) hasil.push({ kecil: t[i].slot, besar: t[j].slot });
    }
  }
  return hasil.sort((a, b) => a.besar - a.kecil - (b.besar - b.kecil) || a.kecil - b.kecil || a.besar - b.besar);
}

export const nilaiJam = (isi: IsiNomor[]): NilaiJam => ({ bentrok: cariBentrok(isi), jumlahBerjam: isi.filter(berjam).length });

/** Himpunan nomor yang diberi ⚠ (kedua nomor pada tiap pasangan bentrok). */
export function slotBermasalah(bentrok: Bentrok[]): Set<number> {
  const s = new Set<number>();
  for (const b of bentrok) {
    s.add(b.kecil);
    s.add(b.besar);
  }
  return s;
}

/** Alasan satu kalimat per pasangan; paling banyak `maks` baris, sisanya dihitung ("+N lagi"). */
export function alasanBentrok(bentrok: Bentrok[], isi: IsiNomor[], maks = 3): { baris: string[]; sisa: number } {
  const ms = new Map(isi.filter(berjam).map((x) => [x.slot, x.ms as number]));
  const baris = bentrok.slice(0, maks).map((b) => `Jam foto ${b.kecil} (${jamWib(ms.get(b.kecil) as number)}) lebih akhir dari foto ${b.besar} (${jamWib(ms.get(b.besar) as number)})`);
  return { baris, sisa: Math.max(0, bentrok.length - maks) };
}

/** "foto 4 dan 5" / "foto 3, 4, dan 5" dari kumpulan nomor bentrok. */
export function sebutFoto(bentrok: Bentrok[]): string {
  const n = [...slotBermasalah(bentrok)].sort((a, b) => a - b);
  if (n.length <= 1) return `foto ${n[0] ?? ""}`.trim();
  if (n.length === 2) return `foto ${n[0]} dan ${n[1]}`;
  return `foto ${n.slice(0, -1).join(", ")}, dan ${n[n.length - 1]}`;
}

/**
 * Kalimat akibat terhadap aturan jam untuk modal konfirmasi. `kata` = "ditukar" | "dipasang" | "dipindah" | "diurutkan".
 * null bila kurang dari dua foto berjam setelahnya (aturan jam tidak bisa dinilai, jadi tidak ada yang perlu dikatakan).
 * Penukaran tetap boleh dilakukan apa pun hasilnya.
 */
export function kalimatJam(sebelum: NilaiJam, sesudah: NilaiJam, kata: string): string | null {
  if (sesudah.jumlahBerjam < 2) return null;
  if (sesudah.bentrok.length === 0) {
    return sebelum.bentrok.length > 0 ? `Setelah ${kata}, urutan jam sesuai dan peringatan ⚠ hilang.` : `Setelah ${kata}, urutan jam tetap sesuai.`;
  }
  return sebelum.bentrok.length > 0
    ? `Urutan jam masih terbalik pada ${sebutFoto(sesudah.bentrok)}.`
    : `Urutan jam akan menjadi terbalik pada ${sebutFoto(sesudah.bentrok)}.`;
}

/** Isi nomor setelah isi nomor `a` dan `b` bertukar (salah satunya boleh kosong: berarti dipindahkan). */
export function tukarIsi(isi: IsiNomor[], a: number, b: number): IsiNomor[] {
  return isi.map((x) => (x.slot === a ? { ...x, slot: b } : x.slot === b ? { ...x, slot: a } : x));
}

/** Isi nomor setelah foto cadangan dipasang di `slot` (foto lama di nomor itu keluar ke cadangan). */
export function pasangIsi(isi: IsiNomor[], slot: number, baru: { fotoId: number; ms: number | null }): IsiNomor[] {
  return [...isi.filter((x) => x.slot !== slot), { slot, fotoId: baru.fotoId, ms: baru.ms }];
}

export type Langkah = [number, number];
export type Rencana = {
  /** Urutan penukaran (nomor, nomor) yang menghasilkan susunan akhir bila dijalankan berurutan. */
  langkah: Langkah[];
  /** Nomor yang isinya berubah: foto yang kini ada di `slot` semula berada di `dari`. */
  berubah: { slot: number; fotoId: number; dari: number }[];
  /** Isi nomor sesudah diurutkan. */
  akhir: IsiNomor[];
};

/**
 * "Urutkan sesuai jam": foto Kamera SIGAP yang menempati nomor diurutkan dari jam terawal ke terakhir pada nomor-nomor yang SAMA
 * (unggahan manual dan nomor kosong tidak bergeser). Jam sama (pada ketelitian menit) mempertahankan urutan lama.
 * Hasil ditulis sebagai rangkaian penukaran, sehingga dapat dijalankan dengan fungsi tukar yang sudah ada.
 */
export function rencanaUrutJam(isi: IsiNomor[]): Rencana {
  const cand = isi.filter((x) => x.fotoId !== null && berjam(x)).sort((a, b) => a.slot - b.slot);
  const posisi = cand.map((x) => x.slot);
  const target = [...cand].sort((a, b) => menit(a.ms as number) - menit(b.ms as number) || a.slot - b.slot);
  const sekarang = new Map<number, IsiNomor>(cand.map((x) => [x.slot, x]));
  const langkah: Langkah[] = [];
  for (let i = 0; i < posisi.length; i++) {
    const pos = posisi[i];
    const mau = target[i];
    if (sekarang.get(pos) === mau) continue;
    let j = -1;
    for (const [s, v] of sekarang) if (v === mau) j = s;
    const a = sekarang.get(pos) as IsiNomor;
    sekarang.set(pos, mau);
    sekarang.set(j, a);
    langkah.push([pos, j]);
  }
  const berubah = posisi.flatMap((slot, i) => (target[i].slot !== slot ? [{ slot, fotoId: target[i].fotoId as number, dari: target[i].slot }] : []));
  const lain = isi.filter((x) => !(x.fotoId !== null && berjam(x)));
  const akhir = [...lain, ...posisi.map((slot, i) => ({ ...target[i], slot }))].sort((a, b) => a.slot - b.slot);
  return { langkah, berubah, akhir };
}

/** Kunci perbandingan rencana (klien mengirim apa yang dilihatnya; server menolak bila keadaan sudah berubah). */
export const kunciLangkah = (l: Langkah[]): string => l.map(([a, b]) => `${a}-${b}`).join(",");
