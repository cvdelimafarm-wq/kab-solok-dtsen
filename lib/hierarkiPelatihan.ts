// lib/hierarkiPelatihan.ts  (murni, tanpa basis data)
//
// (2 Nov 2026) Pelatihan 5 tab, tahap A: hierarki pengguna pelatihan instruktur > korwil > PML > PPL dan aturan "siapa melihat siapa" (tab Monitoring).
// Atasan memantau bawahan; jenjang yang KOSONG dilompati: atasan efektif = atasan terdekat yang ada dan tidak disembunyikan (mis. PPL tanpa PML langsung
// ke korwil; Seruti tidak punya korwil sehingga PML berdiri sendiri). Peserta yang menolak undangan disembunyikan dari pohon (`tersembunyi`), bawahannya
// naik ke atasan berikutnya. Instruktur dibatasi KELAS-nya; panitia melihat semua kelas. Data diambil dari `sigap_pelatihan_hierarki`.

export type PeranPelatihan = "ppl" | "pml" | "korwil";

export type SimpulHierarki = {
  akun_id: number;
  nama: string;
  peran: PeranPelatihan;
  atasan_akun_id: number | null;
  kelas: number | null;
  /** true bila menolak undangan: tidak tampil di Monitoring dan dilewati sebagai perantara. */
  tersembunyi?: boolean;
};

export type Pengguna = { jenis: "peserta"; akun_id: number } | { jenis: "instruktur"; kelas: number | null } | { jenis: "panitia" };

export type BarisCakupan = {
  simpul: SimpulHierarki;
  /** 0 = baris paling atas yang tampil bagi pengguna. */
  kedalaman: number;
  /** true bila baris ini adalah pengguna sendiri. */
  diri: boolean;
  /** Atasan terdekat yang tampil dalam cakupan ini (null = tidak ada). */
  atasan_efektif: number | null;
};

const URUTAN_PERAN: Record<PeranPelatihan, number> = { korwil: 0, pml: 1, ppl: 2 };

export const LABEL_PERAN_PELATIHAN: Record<PeranPelatihan, string> = { korwil: "Korwil", pml: "PML", ppl: "PPL" };

const urutSimpul = (a: SimpulHierarki, b: SimpulHierarki) => URUTAN_PERAN[a.peran] - URUTAN_PERAN[b.peran] || a.nama.localeCompare(b.nama, "id") || a.akun_id - b.akun_id;

/** Atasan terdekat yang ada di `peta` dan tidak tersembunyi; null bila tidak ada. Aman terhadap siklus. */
export function atasanEfektif(akunId: number, peta: ReadonlyMap<number, SimpulHierarki>): number | null {
  const awal = peta.get(akunId);
  if (!awal) return null;
  const lihat = new Set<number>([akunId]);
  let idAtasan = awal.atasan_akun_id;
  while (idAtasan !== null) {
    if (lihat.has(idAtasan)) return null; // siklus
    lihat.add(idAtasan);
    const a = peta.get(idAtasan);
    if (!a) return null; // atasan bukan peserta pelatihan ini: rantai putus
    if (!a.tersembunyi) return a.akun_id;
    idAtasan = a.atasan_akun_id;
  }
  return null;
}

/**
 * Menyusun `simpul` (yang tidak tersembunyi) menjadi urutan baris pohon, mulai dari anak-anak `akar` (null = semua yang tidak punya atasan dalam daftar ini).
 * Atasan efektif dihitung hanya di dalam daftar yang diberikan, sehingga cakupan yang dipersempit (mis. satu kelas) tetap punya akar yang benar.
 */
export function susunPohon(simpul: readonly SimpulHierarki[], akar: number | null): BarisCakupan[] {
  const tampak = simpul.filter((s) => !s.tersembunyi);
  const peta = new Map(simpul.map((s) => [s.akun_id, s])); // yang tersembunyi tetap di peta: hanya menjadi perantara yang dilewati
  const anak = new Map<number | null, SimpulHierarki[]>();
  const efektif = new Map<number, number | null>();
  for (const s of tampak) {
    const a = atasanEfektif(s.akun_id, peta);
    efektif.set(s.akun_id, a);
    anak.set(a, [...(anak.get(a) ?? []), s]);
  }
  for (const daftar of anak.values()) daftar.sort(urutSimpul);
  const hasil: BarisCakupan[] = [];
  const sudah = new Set<number>();
  const turun = (induk: number | null, kedalaman: number) => {
    for (const s of anak.get(induk) ?? []) {
      if (sudah.has(s.akun_id)) continue; // jaga siklus
      sudah.add(s.akun_id);
      hasil.push({ simpul: s, kedalaman, diri: false, atasan_efektif: efektif.get(s.akun_id) ?? null });
      turun(s.akun_id, kedalaman + 1);
    }
  };
  turun(akar, 0);
  // simpul yang terkurung dalam siklus tidak terjangkau dari akar mana pun: tampilkan di akhir agar tidak hilang diam-diam
  if (akar === null) {
    for (const s of tampak.slice().sort(urutSimpul)) {
      if (!sudah.has(s.akun_id)) {
        sudah.add(s.akun_id);
        hasil.push({ simpul: s, kedalaman: 0, diri: false, atasan_efektif: null });
      }
    }
  }
  return hasil;
}

/** Siapa yang tampak bagi `pengguna` di tab Monitoring. Mengembalikan baris berurutan pohon (diri sendiri dahulu untuk peserta). */
export function cakupanLihat(pengguna: Pengguna, semua: readonly SimpulHierarki[]): BarisCakupan[] {
  if (pengguna.jenis === "panitia") return susunPohon(semua, null);
  if (pengguna.jenis === "instruktur") return susunPohon(semua.filter((s) => s.kelas === pengguna.kelas), null);
  const diri = semua.find((s) => s.akun_id === pengguna.akun_id && !s.tersembunyi);
  if (!diri) return [];
  const bawahan = susunPohon(semua, diri.akun_id).map((b) => ({ ...b, kedalaman: b.kedalaman + 1 }));
  return [{ simpul: diri, kedalaman: 0, diri: true, atasan_efektif: null }, ...bawahan];
}

export type MasalahHierarki = {
  /** Peserta yang rantai atasannya melingkar. */
  siklus: number[];
  /** Atasan yang tercatat tetapi bukan peserta pelatihan ini. */
  atasan_asing: number[];
  /** Peserta tanpa atasan efektif: hanya terlihat oleh instruktur dan panitia (PPL/PML saja; korwil memang di puncak). */
  tanpa_atasan: number[];
};

/** Pemeriksaan untuk layar Kelola (tab Tim & Peserta) dan SQL salin: bukan penghalang, hanya peringatan. */
export function periksaHierarki(semua: readonly SimpulHierarki[]): MasalahHierarki {
  const peta = new Map(semua.map((s) => [s.akun_id, s]));
  const siklus: number[] = [];
  const asing: number[] = [];
  const tanpa: number[] = [];
  for (const s of semua) {
    if (s.atasan_akun_id !== null && !peta.has(s.atasan_akun_id)) asing.push(s.akun_id);
    // siklus: telusuri sampai kembali ke diri sendiri
    const lihat = new Set<number>([s.akun_id]);
    let id = s.atasan_akun_id;
    while (id !== null) {
      if (id === s.akun_id) {
        siklus.push(s.akun_id);
        break;
      }
      if (lihat.has(id)) break;
      lihat.add(id);
      id = peta.get(id)?.atasan_akun_id ?? null;
    }
    if (s.peran !== "korwil" && atasanEfektif(s.akun_id, peta) === null) tanpa.push(s.akun_id);
  }
  return { siklus, atasan_asing: asing, tanpa_atasan: tanpa };
}

/** Ringkasan cakupan untuk judul kartu: "Anda + 6 PPL". */
export function ringkasCakupan(baris: readonly BarisCakupan[]): string {
  const per: Record<PeranPelatihan, number> = { korwil: 0, pml: 0, ppl: 0 };
  for (const b of baris) if (!b.diri) per[b.simpul.peran]++;
  const bagian = (Object.keys(URUTAN_PERAN) as PeranPelatihan[]).filter((p) => per[p] > 0).map((p) => `${per[p]} ${LABEL_PERAN_PELATIHAN[p]}`);
  const punyaDiri = baris.some((b) => b.diri);
  if (punyaDiri) return bagian.length ? `Anda + ${bagian.join(", ")}` : "Hanya Anda";
  return bagian.length ? bagian.join(", ") : "Belum ada peserta";
}
