// lib/penilaian360.ts
//
// (10 Nov 2026) Penilaian 360 antaranggota tim Pendataan Bencana (permintaan Iqbal): dalam SATU tim (kelompok) setiap orang menilai
// rekan satu tim tentang kinerja, kedisiplinan, sifat membangun tim, kerja sama, dan komunikasi. Berkas ini MURNI (tanpa database/jaringan):
// aturan siapa menilai siapa, pembacaan isian, dan perhitungan rekap. Penyimpanan: sigap_penilaian360 (skema-sql/20261110a_penilaian_360.sql).
//
// Aturan:
//  - Tim = kelompok di bencana_kelompok_tim: kortim + PML kelompok itu + PPL yang atasannya salah satu PML kelompok itu.
//  - Setiap orang menilai SEMUA rekan satu tim selain dirinya sendiri (maks ~20 orang). Boleh dicicil dan boleh diubah.
//  - Skor bulat 1-5 untuk kelima kriteria (semuanya wajib), catatan opsional maks 300 huruf.
//  - Orang yang dinilai TIDAK melihat nilai apa pun tentang dirinya; rekap hanya untuk admin (izin lihat survei PSP).

export type KodeKriteria = "kinerja" | "kedisiplinan" | "tim" | "kerjasama" | "komunikasi";

export const KRITERIA: readonly { kode: KodeKriteria; label: string; tanya: string }[] = [
  { kode: "kinerja", label: "Kinerja", tanya: "Mutu, ketepatan, dan kelengkapan hasil kerjanya di lapangan" },
  { kode: "kedisiplinan", label: "Kedisiplinan", tanya: "Tepat waktu, taat aturan dan jadwal, tertib melapor" },
  { kode: "tim", label: "Membangun tim", tanya: "Menjaga suasana tim, mau membantu dan membimbing rekan" },
  { kode: "kerjasama", label: "Kerja sama", tanya: "Mudah diajak bekerja bersama dan menyelesaikan tugas bersama" },
  { kode: "komunikasi", label: "Komunikasi", tanya: "Cepat tanggap, jelas menyampaikan kendala, terbuka pada masukan" },
];
export const KODE_KRITERIA: readonly KodeKriteria[] = KRITERIA.map((k) => k.kode);

export const SKOR_MIN = 1;
export const SKOR_MAKS = 5;
export const CATATAN_MAKS = 300;
export const LABEL_SKOR: Record<number, string> = { 1: "Kurang", 2: "Cukup", 3: "Baik", 4: "Sangat baik", 5: "Istimewa" };

export type Skor = Record<KodeKriteria, number>;
export type PeranTim = "kortim" | "pml" | "ppl";

export type BarisKelompok = { kelompok: number; peran: string; akun_id: number };
export type BarisPpl = { akun_id: number; atasan_akun_id: number | null };
export type AnggotaTim = { akun_id: number; peran: PeranTim };

export type Keanggotaan = { peran: PeranTim; kelompok: number[] };

/**
 * Peta keanggotaan semua orang: kelompok (satu, atau beberapa untuk kortim lintas kelompok seperti korwil) dan peran.
 * `kelompokTim` = baris aktif kortim/pml; `ppl` = penugasan PPL aktif beserta atasan PML-nya.
 */
export function petaKeanggotaan(kelompokTim: BarisKelompok[], ppl: BarisPpl[]): Map<number, Keanggotaan> {
  const peta = new Map<number, Keanggotaan>();
  const pmlKelompok = new Map<number, number>();
  const urutPeran: Record<string, number> = { kortim: 0, pml: 1 };
  for (const b of kelompokTim) {
    if (b.peran !== "kortim" && b.peran !== "pml") continue;
    const ada = peta.get(b.akun_id);
    if (!ada) peta.set(b.akun_id, { peran: b.peran, kelompok: [b.kelompok] });
    else {
      if (!ada.kelompok.includes(b.kelompok)) ada.kelompok.push(b.kelompok);
      if (urutPeran[b.peran] < urutPeran[ada.peran]) ada.peran = b.peran; // kortim lebih tinggi dari pml
    }
    if (b.peran === "pml" && !pmlKelompok.has(b.akun_id)) pmlKelompok.set(b.akun_id, b.kelompok);
  }
  for (const p of ppl) {
    if (p.atasan_akun_id == null || peta.has(p.akun_id)) continue; // orang ganda dihitung sekali
    const k = pmlKelompok.get(p.atasan_akun_id);
    if (k === undefined) continue; // PPL tanpa PML berkelompok tidak punya tim
    peta.set(p.akun_id, { peran: "ppl", kelompok: [k] });
  }
  for (const v of peta.values()) v.kelompok.sort((a, b) => a - b);
  return peta;
}

/**
 * Tim akun ini, tanpa dirinya. Null bila akun bukan anggota tim mana pun.
 *  - Satu kelompok: semua rekan satu kelompok (kortim, PML, PPL).
 *  - Kortim lintas kelompok (mis. korwil di semua kelompok): hanya kortim dan PML dari kelompok-kelompoknya (`lintas: true`),
 *    supaya daftar nilainya tidak berisi ratusan orang. Semua PPL tetap boleh menilai kortim kelompoknya.
 */
export function susunTim(akunId: number, kelompokTim: BarisKelompok[], ppl: BarisPpl[]): { kelompok: number; lintas: boolean; anggota: AnggotaTim[] } | null {
  const peta = petaKeanggotaan(kelompokTim, ppl);
  const saya = peta.get(akunId);
  if (!saya) return null;
  const lintas = saya.kelompok.length > 1;
  const urut: Record<PeranTim, number> = { kortim: 0, pml: 1, ppl: 2 };
  const anggota: AnggotaTim[] = [...peta.entries()]
    .filter(([id, v]) => id !== akunId && v.kelompok.some((k) => saya.kelompok.includes(k)) && (!lintas || v.peran !== "ppl"))
    .map(([id, v]) => ({ akun_id: id, peran: v.peran }))
    .sort((a, b) => urut[a.peran] - urut[b.peran] || a.akun_id - b.akun_id);
  return { kelompok: saya.kelompok[0], lintas, anggota };
}

export type HasilBaca = { ok: true; dinilai: number; skor: Skor; catatan: string | null } | { ok: false; pesan: string };

const bulat = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : null);

/** Membaca badan POST { dinilai, skor:{kinerja,...}, catatan? } dengan penilaian ketat. */
export function bacaPenilaian(badan: unknown): HasilBaca {
  if (!badan || typeof badan !== "object") return { ok: false, pesan: "Isi permintaan tidak sah." };
  const b = badan as Record<string, unknown>;
  const dinilai = bulat(b.dinilai);
  if (dinilai === null || dinilai <= 0) return { ok: false, pesan: "Rekan yang dinilai tidak sah." };
  const s = b.skor;
  if (!s || typeof s !== "object") return { ok: false, pesan: "Isi semua kriteria penilaian." };
  const skor = {} as Skor;
  for (const k of KRITERIA) {
    const v = bulat((s as Record<string, unknown>)[k.kode]);
    if (v === null || v < SKOR_MIN || v > SKOR_MAKS) return { ok: false, pesan: `Nilai "${k.label}" harus angka ${SKOR_MIN}-${SKOR_MAKS}.` };
    skor[k.kode] = v;
  }
  let catatan: string | null = null;
  if (b.catatan !== undefined && b.catatan !== null) {
    if (typeof b.catatan !== "string") return { ok: false, pesan: "Catatan tidak sah." };
    const t = b.catatan.replace(/\s+/g, " ").trim();
    if (t.length > CATATAN_MAKS) return { ok: false, pesan: `Catatan maksimal ${CATATAN_MAKS} huruf.` };
    catatan = t || null;
  }
  return { ok: true, dinilai, skor, catatan };
}

export type BarisNilai = { penilai_akun_id: number; dinilai_akun_id: number } & Skor;

/** Rata-rata semua kriteria satu baris (1 desimal tidak dibulatkan di sini). */
export const rataBaris = (b: Skor): number => KODE_KRITERIA.reduce((a, k) => a + b[k], 0) / KODE_KRITERIA.length;

export type RekapOrang = { akun_id: number; penilai: number; rata: number; per: Skor };

const bulat1 = (x: number) => Math.round(x * 10) / 10;

/** Rekap per orang yang dinilai: jumlah penilai, rata-rata tiap kriteria dan rata-rata keseluruhan (1 desimal). Urut rata tertinggi. */
export function rekapPerOrang(baris: BarisNilai[]): RekapOrang[] {
  const peta = new Map<number, BarisNilai[]>();
  for (const b of baris) {
    if (b.penilai_akun_id === b.dinilai_akun_id) continue; // penilaian diri tidak dihitung
    const l = peta.get(b.dinilai_akun_id) ?? [];
    l.push(b);
    peta.set(b.dinilai_akun_id, l);
  }
  const hasil: RekapOrang[] = [];
  for (const [akun, l] of peta) {
    const per = {} as Skor;
    for (const k of KODE_KRITERIA) per[k] = bulat1(l.reduce((a, b) => a + b[k], 0) / l.length);
    hasil.push({ akun_id: akun, penilai: new Set(l.map((x) => x.penilai_akun_id)).size, rata: bulat1(l.reduce((a, b) => a + rataBaris(b), 0) / l.length), per });
  }
  return hasil.sort((a, b) => b.rata - a.rata || a.akun_id - b.akun_id);
}

/** Kemajuan penilai: berapa dari total rekan yang sudah dinilai. */
export function kemajuan(anggotaId: number[], sudahId: number[]): { total: number; sudah: number; sisa: number; lengkap: boolean } {
  const sudah = new Set(sudahId);
  const dinilai = anggotaId.filter((id) => sudah.has(id)).length;
  return { total: anggotaId.length, sudah: dinilai, sisa: anggotaId.length - dinilai, lengkap: anggotaId.length > 0 && dinilai === anggotaId.length };
}
