// lib/keu/cekPagu.ts
//
// (25 Okt 2026) Pemeriksaan kesamaan PAGU PER AKUN PER RO antara dua sumber. Murni (tanpa React/DB), jadi mudah diuji.
//
// Dasar keputusan Bapak (25 Okt 2026):
//   - POK hanya diimpor di awal tahun anggaran. Sesudahnya revisi disahkan di SPAN dengan acuan kertas kerja; di SIGAP PPK menekan Sahkan dan
//     melampirkan PDF POK resmi dari SPAN.
//   - Selama tahun berjalan SIGAP hanya perlu memeriksa: apakah pagu tiap akun pada tiap RO SAMA dengan yang ada di POK. Tidak sampai tingkat
//     item/uraian, jadi tidak ada padanan baris baru/hilang.
//   - Bila berbeda: PERINGATAN (bukan penghalang) dan pengguna diarahkan ke kertas kerja untuk mengubahnya, karena yang dipakai seharusnya POK RESMI.
//
// "resmi" = sisi yang dianggap benar (laporan realisasi GLP039, atau PDF POK resmi SPAN). "sistem" = POK berlaku atau kolom Menjadi kertas kerja.

export type PaguAkun = { ro: string; akun: string; jumlah: number };
export type StatusCek = "sama" | "beda" | "hanya_resmi" | "hanya_sistem";
export type BarisCekPagu = { ro: string; akun: string; resmi: number; sistem: number; selisih: number; status: StatusCek };
export type HasilCekPagu = {
  baris: BarisCekPagu[];
  nSama: number; nBeda: number; nHanyaResmi: number; nHanyaSistem: number;
  totalResmi: number; totalSistem: number; selisihTotal: number;
  /** RO yang punya paling sedikit satu akun tak sama (urut kode). */
  roBermasalah: string[];
  /** RO yang tidak dibandingkan karena lingkup (ro_resmi: RO sistem tanpa padanan resmi; irisan: RO yang hanya ada di salah satu sisi). */
  roTakDibandingkan: string[];
  /** true bila semua akun yang dibandingkan sama. */
  sama: boolean;
};

const bulat = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const kunci = (ro: string, akun: string) => `${ro}\u0000${akun}`;

/** Menjumlahkan baris apa pun per (RO, akun). RO/akun kosong dilewati; jumlah bukan angka dianggap 0. Urut RO lalu akun. */
export function jumlahkanPaguAkun<T>(baris: readonly T[], ambil: (b: T) => { ro: unknown; akun: unknown; jumlah: unknown }): PaguAkun[] {
  const peta = new Map<string, PaguAkun>();
  for (const b of baris) {
    const x = ambil(b);
    const ro = String(x.ro ?? "").trim();
    const akun = String(x.akun ?? "").trim();
    if (!ro || !akun) continue;
    const k = kunci(ro, akun);
    const ada = peta.get(k);
    if (ada) ada.jumlah += bulat(x.jumlah);
    else peta.set(k, { ro, akun, jumlah: bulat(x.jumlah) });
  }
  return [...peta.values()].sort((a, b) => a.ro.localeCompare(b.ro) || a.akun.localeCompare(b.akun));
}

/** Baris laporan realisasi GLP039 (kolom pagu) -> pagu per RO+akun. */
export const paguDariGlp = (item: readonly { ro_kode: string; akun_kode: string; pagu: number | string }[]): PaguAkun[] =>
  jumlahkanPaguAkun(item, (i) => ({ ro: i.ro_kode, akun: i.akun_kode, jumlah: i.pagu }));

/** Baris POK berlaku (keu_v_adm_lembar) -> pagu per RO+akun. */
export const paguDariPok = (baris: readonly { ro_kode: string; akun_kode: string; jumlah: number | string }[]): PaguAkun[] =>
  jumlahkanPaguAkun(baris, (b) => ({ ro: b.ro_kode, akun: b.akun_kode, jumlah: b.jumlah }));

/** Baris kertas kerja (keu_v_kk_baris): kolom Menjadi pada akun Menjadi. Baris tanpa jumlah Menjadi dihitung 0. */
export const paguDariKertasKerja = (baris: readonly { ro_kode: string; akun_menjadi: string; jumlah_menjadi: number | string | null }[]): PaguAkun[] =>
  jumlahkanPaguAkun(baris, (b) => ({ ro: b.ro_kode, akun: b.akun_menjadi, jumlah: b.jumlah_menjadi }));

/** Baris PDF POK resmi (hasil bacaBerkasPok): RO = kegiatan.KRO.RO, mis. 2906.BMA.005. */
export const paguDariPdf = (baris: readonly { keg_kode: string; kro_kode: string; ro_sub: string; akun_kode: string; jumlah: number | string }[]): PaguAkun[] =>
  jumlahkanPaguAkun(baris, (b) => ({ ro: `${b.keg_kode}.${b.kro_kode}.${b.ro_sub}`, akun: b.akun_kode, jumlah: b.jumlah }));

export type OpsiCek = {
  /**
   * 'ro_resmi' (bawaan): sistem hanya dibandingkan untuk RO yang ada pada sisi resmi (laporan GLP039 dapat memuat satu kegiatan saja).
   * 'irisan': hanya RO yang ada pada KEDUA sisi (kertas kerja hanya memuat RO yang sudah dimuat). 'semua': semua RO.
   */
  lingkup?: "ro_resmi" | "irisan" | "semua";
  /** Selisih (rupiah) yang masih dianggap sama; bawaan 0. */
  toleransi?: number;
};

/** Membandingkan pagu per (RO, akun). Akun yang jumlahnya 0 pada kedua sisi tidak dianggap ada. */
export function bandingPaguAkun(resmi: readonly PaguAkun[], sistem: readonly PaguAkun[], opsi: OpsiCek = {}): HasilCekPagu {
  const lingkup = opsi.lingkup ?? "ro_resmi";
  const tol = Math.max(0, opsi.toleransi ?? 0);
  const roResmi = new Set(resmi.map((r) => r.ro));
  const roSistem = new Set(sistem.map((s) => s.ro));
  const roTakDibandingkan =
    lingkup === "ro_resmi" ? [...roSistem].filter((r) => !roResmi.has(r)).sort()
    : lingkup === "irisan" ? [...new Set([...roSistem, ...roResmi])].filter((r) => !(roResmi.has(r) && roSistem.has(r))).sort()
    : [];
  const dalamLingkup = (r: string) => (lingkup === "semua" ? true : lingkup === "irisan" ? roResmi.has(r) && roSistem.has(r) : true);

  const a = new Map<string, number>();
  for (const r of resmi) if (dalamLingkup(r.ro)) a.set(kunci(r.ro, r.akun), (a.get(kunci(r.ro, r.akun)) ?? 0) + r.jumlah);
  const b = new Map<string, number>();
  for (const s of sistem) {
    if (lingkup === "ro_resmi" && !roResmi.has(s.ro)) continue;
    if (!dalamLingkup(s.ro)) continue;
    b.set(kunci(s.ro, s.akun), (b.get(kunci(s.ro, s.akun)) ?? 0) + s.jumlah);
  }
  const semuaKunci = new Set([...a.keys(), ...b.keys()]);
  const baris: BarisCekPagu[] = [];
  for (const k of semuaKunci) {
    const [ro, akun] = k.split("\u0000");
    const r = a.get(k) ?? 0, s = b.get(k) ?? 0;
    if (r === 0 && s === 0) continue;
    const selisih = r - s;
    const status: StatusCek = Math.abs(selisih) <= tol ? "sama" : !a.has(k) || r === 0 ? "hanya_sistem" : !b.has(k) || s === 0 ? "hanya_resmi" : "beda";
    baris.push({ ro, akun, resmi: r, sistem: s, selisih, status });
  }
  baris.sort((x, y) => x.ro.localeCompare(y.ro) || x.akun.localeCompare(y.akun));
  const hitung = (st: StatusCek) => baris.filter((x) => x.status === st).length;
  const totalResmi = baris.reduce((t, x) => t + x.resmi, 0);
  const totalSistem = baris.reduce((t, x) => t + x.sistem, 0);
  const roBermasalah = [...new Set(baris.filter((x) => x.status !== "sama").map((x) => x.ro))].sort();
  return {
    baris, nSama: hitung("sama"), nBeda: hitung("beda"), nHanyaResmi: hitung("hanya_resmi"), nHanyaSistem: hitung("hanya_sistem"),
    totalResmi, totalSistem, selisihTotal: totalResmi - totalSistem, roBermasalah, roTakDibandingkan,
    sama: baris.every((x) => x.status === "sama"),
  };
}

export const LABEL_STATUS_CEK: Record<StatusCek, string> = {
  sama: "Sama", beda: "Beda jumlah", hanya_resmi: "Hanya di resmi", hanya_sistem: "Hanya di sistem",
};

/** Kalimat ringkas hasil (satu baris). */
export function ringkasCek(h: HasilCekPagu, namaResmi: string, namaSistem: string): string {
  const tak = h.baris.length - h.nSama;
  if (h.baris.length === 0) return `Tidak ada akun yang dapat dibandingkan antara ${namaResmi} dan ${namaSistem}.`;
  if (h.sama) return `Pagu ${h.baris.length} akun sama antara ${namaResmi} dan ${namaSistem}.`;
  return `${tak} dari ${h.baris.length} akun berbeda antara ${namaResmi} dan ${namaSistem} (${h.roBermasalah.length} RO).`;
}

/** Alamat kertas kerja untuk mengubah RO tertentu. Parameter ro menentukan KRO; jadwal opsional. */
export function tautanKertasKerja(ro: string, jadwalId?: number | null): string {
  const q = new URLSearchParams();
  if (jadwalId) q.set("jadwal", String(jadwalId));
  q.set("ro", ro);
  return `/sigap/revisi/kertas?${q.toString()}`;
}

/** Baris yang perlu dibenahi untuk satu RO (bukan 'sama'), urut akun. */
export const barisBermasalah = (h: HasilCekPagu, ro: string): BarisCekPagu[] => h.baris.filter((x) => x.ro === ro && x.status !== "sama");
