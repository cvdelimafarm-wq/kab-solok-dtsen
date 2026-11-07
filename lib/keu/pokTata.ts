// lib/keu/pokTata.ts
//
// (7 Nov 2026, permintaan Iqbal: tab Anggaran dibuat seperti POK, ditambah kolom Realisasi | Sisa kebutuhan | Gap) Pohon POK satu RO:
// RO > Komponen > Sub komponen > Akun > Item, dengan jumlah pagu, realisasi, sisa kebutuhan, dan gap pada setiap tingkat. MURNI.
//
// Definisi (agar sama di seluruh tampilan):
//   Sisa pagu       = Pagu POK - Realisasi
//   Sisa kebutuhan  = RAB (kebutuhan ke depan yang BELUM dibayar); item yang ditandai Selesai = 0 (tidak ada kebutuhan lagi).
//                     (7 Nov 2026, koreksi) Sebelumnya RAB - Realisasi; keliru karena RAB per survei berisi kebutuhan periode yang belum dibayar
//                     (mis. Seruti TW IV, bulan 11-12), bukan total kebutuhan butir. Realisasi periode lain tidak boleh mengurangi RAB.
//   Kebutuhan       = Realisasi + Catatan SIGAP belum tercermin + Sisa kebutuhan (lib/keu/kebutuhan.ts).
//                     (langkah 3) Sisa kebutuhan = RAB dikurangi bagian yang sudah ditutup catatan pembayaran PJ Administrasi (lib/keu/pembayaran.ts).
//   Gap             = Sisa pagu - Catatan belum tercermin - Sisa kebutuhan = Pagu - Kebutuhan. Positif = pagu masih lebih (dana dapat dialihkan); negatif = kebutuhan melebihi pagu (kurang).
//   Catatan: RAB yang sudah dibayar baru dikeluarkan dari Sisa kebutuhan bila ditutup lewat catatan PJ Administrasi (tab Pembayaran). Selama belum dicatat,
//   RAB yang jatuh temponya sudah lewat dapat terhitung ganda dengan Realisasi; jumlahnya ditampilkan di Kartu Gap sebagai angka sementara.
// Item yang belum ber-RAB tidak punya sisa kebutuhan dan gap (tidak diketahui, bukan nol). Pada tingkat di atas item, sisa kebutuhan dan gap hanya
// dihitung bila SEMUA item di bawahnya diketahui; bila tidak, nilainya kosong dan jumlah item belum ber-RAB ditampilkan.

import type { ItemAnggaran, KomponenAnggaran } from "./ro";

export type Struktur = { detail_id: number; komponen_kode: string; komponen_nama: string; sub_kode: string; sub_nama: string };

export type SelItem = ItemAnggaran & { harga: number; sisaPagu: number; sisa: number | null; gap: number | null; dicatat: number };
/** `rab` = jumlah RAB belum dibayar butir yang sudah ber-RAB (butir selesai = 0); nBerRab = 0 berarti belum ada yang ber-RAB. */
export type Total = { pok: number; realisasi: number; sisaPagu: number; rab: number; nItem: number; nBerRab: number; sisa: number | null; gap: number | null; dicatat: number };
export type NodeAkun = { kode: string; nama: string; item: SelItem[]; total: Total };
export type NodeSub = { kode: string; nama: string; akun: NodeAkun[]; total: Total };
export type NodeKomponen = { kode: string; nama: string; sub: NodeSub[]; total: Total };
export type Pohon = { roKode: string; roNama: string; komponen: NodeKomponen[]; total: Total };

/** Nama komponen baku BPS bila basis data belum memuat struktur (cadangan). */
export const NAMA_KOMPONEN_BAKU: Record<string, string> = {
  "005": "Dukungan Penyelenggaraan Tugas dan Fungsi Unit", "051": "Persiapan", "052": "Pengumpulan Data", "053": "Pengolahan Data", "054": "Analisis", "055": "Diseminasi dan Evaluasi", "056": "Pelaporan",
};

/** Ada RAB yang berarti: item sudah ditandai selesai, atau punya RAB berstatus selain "belum". */
export const adaKebutuhan = (i: Pick<ItemAnggaran, "rab" | "statusRab" | "selesai">): boolean => i.selesai || (i.rab !== null && i.statusRab !== null && i.statusRab !== "belum");

export function hitungItem(i: ItemAnggaran): SelItem {
  const sisaPagu = i.pok - i.realisasi;
  const tahu = adaKebutuhan(i);
  // (langkah 3) RAB sisa = RAB dikurangi bagian yang sudah tertutup catatan pembayaran; catatan SIGAP yang belum tercermin di SAKTI ikut menjadi kebutuhan.
  const dicatat = i.dicatat ?? 0;
  const sisa = !tahu ? null : i.selesai ? 0 : Math.max(0, (i.rab ?? 0) - (i.rabTutup ?? 0));
  const harga = i.volume > 0 ? i.pok / i.volume : 0;
  return { ...i, harga, sisaPagu, sisa, dicatat, gap: sisa === null ? null : sisaPagu - dicatat - sisa };
}

export function jumlahkan(bagian: readonly Total[]): Total {
  const t: Total = { pok: 0, realisasi: 0, sisaPagu: 0, rab: 0, nItem: 0, nBerRab: 0, sisa: 0, gap: 0, dicatat: 0 };
  for (const b of bagian) {
    t.pok += b.pok; t.realisasi += b.realisasi; t.sisaPagu += b.sisaPagu; t.rab += b.rab; t.nItem += b.nItem; t.nBerRab += b.nBerRab; t.dicatat += b.dicatat;
    t.sisa = t.sisa === null || b.sisa === null ? null : t.sisa + b.sisa;
    t.gap = t.gap === null || b.gap === null ? null : t.gap + b.gap;
  }
  return t;
}
const totalItem = (item: readonly SelItem[]): Total => jumlahkan(item.map((i) => ({
  pok: i.pok, realisasi: i.realisasi, sisaPagu: i.sisaPagu, rab: i.sisa ?? 0, nItem: 1, nBerRab: i.sisa === null ? 0 : 1, sisa: i.sisa, gap: i.gap, dicatat: i.dicatat,
})));

/**
 * Menyusun pohon dari hasil susunAnggaran (Komponen > Akun > Item), struktur POK dari basis data (nama komponen dan sub komponen; boleh kosong), dan nama akun.
 * Tanpa struktur: satu sub komponen "A / TANPA SUB KOMPONEN" per komponen dan nama komponen baku.
 */
export function susunPohon(
  anggaran: readonly KomponenAnggaran[], struktur: readonly Struktur[] | null, namaAkun: ReadonlyMap<string, string>, ro: { kode: string; nama: string },
): Pohon {
  const peta = new Map<number, Struktur>((struktur ?? []).map((s) => [s.detail_id, s]));
  const komponen: NodeKomponen[] = anggaran.map((k) => {
    const namaKomp = (struktur ?? []).find((s) => s.komponen_kode === k.komponen)?.komponen_nama ?? NAMA_KOMPONEN_BAKU[k.komponen] ?? "";
    // item per sub komponen (kode sub + nama), lalu per akun di dalamnya
    const subPeta = new Map<string, { kode: string; nama: string; akun: Map<string, SelItem[]> }>();
    for (const a of k.akun) {
      for (const it of a.item) {
        const s = peta.get(it.detail_id);
        const kode = s?.sub_kode ?? "A"; const nama = s?.sub_nama ?? "TANPA SUB KOMPONEN";
        const sub = subPeta.get(kode) ?? { kode, nama, akun: new Map<string, SelItem[]>() };
        const daftar = sub.akun.get(a.akun) ?? [];
        daftar.push(hitungItem(it));
        sub.akun.set(a.akun, daftar);
        subPeta.set(kode, sub);
      }
    }
    const sub: NodeSub[] = [...subPeta.values()].sort((x, y) => x.kode.localeCompare(y.kode)).map((s) => {
      const akun: NodeAkun[] = [...s.akun.keys()].sort().map((kodeAkun) => {
        const item = s.akun.get(kodeAkun) ?? [];
        return { kode: kodeAkun, nama: namaAkun.get(kodeAkun.slice(0, 6)) ?? "", item, total: totalItem(item) };
      });
      return { kode: s.kode, nama: s.nama, akun, total: jumlahkan(akun.map((a) => a.total)) };
    });
    return { kode: k.komponen, nama: namaKomp, sub, total: jumlahkan(sub.map((s) => s.total)) };
  });
  return { roKode: ro.kode, roNama: ro.nama, komponen, total: jumlahkan(komponen.map((k) => k.total)) };
}

/** Volume untuk tampilan: sampai 2 desimal tanpa nol di belakang koma ("20", "1,5"). */
export const teksVolume = (v: number): string => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(v);

/** Teks gap: positif "+", negatif "-", kosong "-". Dipakai untuk membaca cepat; warna ditentukan tampilan. */
export const arahGap = (g: number | null): "lebih" | "kurang" | "pas" | "belum" => (g === null ? "belum" : g > 0 ? "lebih" : g < 0 ? "kurang" : "pas");
