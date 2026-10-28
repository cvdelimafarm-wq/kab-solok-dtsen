// lib/keu/batangItem.ts
//
// (28 Okt 2026) Data untuk batang "satu item POK diisi beberapa survei": tiap survei menyumbang volume (atau rupiah) pada satu item POK, dan batang
// menunjukkan kontribusi tiap survei terhadap batas POK (garis hitam). Bagian yang melewati batas ditandai. Fungsi murni; gambarnya ada di
// app/sigap/kelola/perencanaan/identifikasi/BatangItem.tsx. Contoh: item 150 OK = 2 OK IMK bulanan + 100 OK IMK tahunan + 70 OK survei industri besar (lebih 22 OK).

export type Dasar = "volume" | "rupiah";
export type Sumbangan = { id: string; nama: string; volume: number; jumlah: number | null };
export type KapasitasItem = { volume: number; pagu: number };
export type StatusBatang = "kosong" | "kurang" | "pas" | "lebih";
export type Segmen = {
  id: string; nama: string; nilai: number; volume: number; jumlah: number | null;
  /** Letak dan lebar dalam persen sumbu; `lewat` = lebar bagian yang melewati batas POK (persen sumbu, dari ujung kanan segmen). */
  kiri: number; lebar: number; lewat: number; warna: number; bagian: number;
};
export type HasilBatang = {
  dasar: Dasar; kapasitas: number; total: number; sisa: number; lebih: number; status: StatusBatang;
  garis: number; sisaKiri: number; sisaLebar: number; segmen: Segmen[]; saran: string;
};

const EPS = 1e-6;
const HEADROOM = 1.06;

/** Susun batang. Sumbangan bernilai nol atau negatif diabaikan; nilai rupiah null dianggap nol pada dasar rupiah. */
export function susunBatang(kap: KapasitasItem, sumbangan: Sumbangan[], dasar: Dasar = "volume"): HasilBatang {
  const kapasitas = dasar === "volume" ? kap.volume : kap.pagu;
  const nilaiDari = (s: Sumbangan) => (dasar === "volume" ? s.volume : s.jumlah ?? 0);
  const pakai = sumbangan.filter((s) => nilaiDari(s) > 0);
  const total = pakai.reduce((a, s) => a + nilaiDari(s), 0);
  const skala = Math.max(total, kapasitas, EPS) * HEADROOM;
  const pct = (x: number) => +((x / skala) * 100).toFixed(3);
  let awal = 0;
  const segmen: Segmen[] = pakai.map((s, i) => {
    const nilai = nilaiDari(s);
    const akhir = awal + nilai;
    const lewat = Math.max(0, akhir - Math.max(awal, kapasitas));
    const r: Segmen = { id: s.id, nama: s.nama, nilai, volume: s.volume, jumlah: s.jumlah, kiri: pct(awal), lebar: pct(nilai), lewat: pct(lewat), warna: i, bagian: total > 0 ? nilai / total : 0 };
    awal = akhir;
    return r;
  });
  const lebih = Math.max(0, total - kapasitas);
  const sisa = Math.max(0, kapasitas - total);
  const status: StatusBatang = total <= EPS ? "kosong" : lebih > EPS ? "lebih" : sisa > EPS ? "kurang" : "pas";
  const saran = status === "lebih" ? "RAB melebihi POK. Tawarkan revisi: tambah volume item POK, geser dari item lain, atau kurangi rincian."
    : status === "kurang" ? "Sebagian POK belum dipakai RAB. Pertimbangkan menambah rincian atau merevisi POK (mengurangi volume item)."
    : status === "kosong" ? "Belum ada rincian survei pada item ini." : "RAB pas dengan POK.";
  return { dasar, kapasitas, total, sisa, lebih, status, garis: pct(kapasitas), sisaKiri: pct(total), sisaLebar: pct(sisa), segmen, saran };
}

/** Pengelompokan sumbangan dari baris RAB: satu sumbangan per survei (baris item yang sama dijumlahkan). */
export function sumbanganDariBaris(baris: { ident_id: number | null; nama: string; volume: number; jumlah: number | null }[]): Sumbangan[] {
  const peta = new Map<string, Sumbangan>();
  for (const b of baris) {
    const id = b.ident_id === null ? "lain" : `s${b.ident_id}`;
    const a = peta.get(id);
    if (!a) peta.set(id, { id, nama: b.ident_id === null ? "Lainnya (di luar identifikasi)" : b.nama, volume: b.volume, jumlah: b.jumlah });
    else peta.set(id, { ...a, volume: a.volume + b.volume, jumlah: a.jumlah === null || b.jumlah === null ? null : a.jumlah + b.jumlah });
  }
  return [...peta.values()];
}

export const PALET_BATANG = ["#2F6FEB", "#E0A800", "#16A085", "#8E5CD9", "#E8590C", "#0B7285", "#C2255C", "#5C7CFA"] as const;
