// lib/keu/bukuselisih.ts
//
// (25 Okt 2026) Logika murni halaman Buku selisih seluruh Satker: mengelompokkan catatan kekurangan RAB yang masih terbuka per RO, per kelompok
// belanja, dan per prioritas. Sumber: keu_v_kekurangan (sudah mencakup semua RO); tanpa DB/React. Angka kekurangan adalah catatan operator
// (papan 15), bukan RAB dikurangi POK; selisih turunan RAB-POK ada di Peta KRO Satker dan Kertas kerja.

export type CatatanKek = {
  id: number; ro_kode: string; kro_kode: string; akun_kode: string; kelompok_kode: string | null; uraian: string; jumlah: number | string;
  prioritas_kode: string; prioritas_nama: string | null; prioritas_urut: number | string | null; status: string; terbuka: boolean; kali_ditunda: number | string | null;
};

export const KELOMPOK_BUKU = [
  { kode: "51", nama: "Belanja pegawai (51)" },
  { kode: "524", nama: "Perjalanan dinas (524)" },
  { kode: "52L", nama: "Belanja barang lain (52xxxx selain 524)" },
  { kode: "53", nama: "Belanja modal (53)" },
] as const;

const n = (x: number | string | null | undefined): number => (x === null || x === undefined ? 0 : Number(x) || 0);

export type RingkasBuku = {
  total: number; nCatatan: number; nRo: number; nDitunda: number;
  perKelompok: { kode: string; nama: string; jumlah: number; n: number }[];
  perPrioritas: { kode: string; nama: string; jumlah: number; n: number }[];
  perRo: { ro: string; jumlah: number; n: number; inti: number; baris: CatatanKek[] }[];
};

/** Hanya catatan terbuka. Urutan RO: kekurangan Inti terbesar dahulu, lalu jumlah terbesar, lalu kode. Urutan catatan: prioritas (urut kecil dahulu), jumlah terbesar. */
export function ringkasBuku(rows: CatatanKek[], saring: { kelompok?: string; prioritas?: string } = {}): RingkasBuku {
  const buka = rows.filter((r) => r.terbuka && (!saring.kelompok || (r.kelompok_kode ?? "") === saring.kelompok) && (!saring.prioritas || r.prioritas_kode === saring.prioritas));
  const urut = (r: CatatanKek) => (r.prioritas_urut === null || r.prioritas_urut === undefined ? 999 : n(r.prioritas_urut));
  const kel = new Map<string, { jumlah: number; n: number }>();
  const pri = new Map<string, { nama: string; urut: number; jumlah: number; n: number }>();
  const ro = new Map<string, CatatanKek[]>();
  for (const r of buka) {
    const k = kel.get(r.kelompok_kode ?? "lain") ?? { jumlah: 0, n: 0 }; k.jumlah += n(r.jumlah); k.n += 1; kel.set(r.kelompok_kode ?? "lain", k);
    const p = pri.get(r.prioritas_kode) ?? { nama: r.prioritas_nama ?? r.prioritas_kode, urut: urut(r), jumlah: 0, n: 0 }; p.jumlah += n(r.jumlah); p.n += 1; pri.set(r.prioritas_kode, p);
    ro.set(r.ro_kode, [...(ro.get(r.ro_kode) ?? []), r]);
  }
  const perRo = [...ro.entries()].map(([kode, baris]) => ({
    ro: kode, baris: [...baris].sort((a, b) => urut(a) - urut(b) || n(b.jumlah) - n(a.jumlah) || a.id - b.id),
    jumlah: baris.reduce((s, b) => s + n(b.jumlah), 0), n: baris.length, inti: baris.filter((b) => b.prioritas_kode === "inti").reduce((s, b) => s + n(b.jumlah), 0),
  })).sort((a, b) => b.inti - a.inti || b.jumlah - a.jumlah || a.ro.localeCompare(b.ro));
  return {
    total: buka.reduce((s, r) => s + n(r.jumlah), 0), nCatatan: buka.length, nRo: ro.size, nDitunda: buka.filter((r) => n(r.kali_ditunda) > 0 || r.status === "ditunda").length,
    perKelompok: KELOMPOK_BUKU.map((k) => ({ kode: k.kode, nama: k.nama, jumlah: kel.get(k.kode)?.jumlah ?? 0, n: kel.get(k.kode)?.n ?? 0 })),
    perPrioritas: [...pri.entries()].sort((a, b) => a[1].urut - b[1].urut).map(([kode, v]) => ({ kode, nama: v.nama, jumlah: v.jumlah, n: v.n })),
    perRo,
  };
}

export const KEPALA_BUKU = ["RO", "Akun", "Kelompok", "Uraian", "Prioritas", "Status", "Jumlah"] as const;

/** Larik-of-larik untuk Excel/CSV: judul, kepala, satu baris per catatan (urut RO lalu prioritas), jumlah total. Sesuai penyaring yang dipakai. */
export function lembarBuku(r: RingkasBuku, ket: string): (string | number)[][] {
  const isi = r.perRo.flatMap((x) => x.baris.map((b) => [x.ro, b.akun_kode, b.kelompok_kode ?? "", b.uraian, b.prioritas_nama ?? b.prioritas_kode, b.status, n(b.jumlah)] as (string | number)[]));
  return [["Buku selisih seluruh Satker (kekurangan RAB terbuka)"], [ket], [], [...KEPALA_BUKU], ...isi, ["Total", "", "", "", "", "", r.total]];
}
