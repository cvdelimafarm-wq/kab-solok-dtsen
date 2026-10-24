// lib/keu/ro.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- logika murni halaman /sigap/ro/<KODE> (tanpa React/DB) supaya mudah diuji:
// format angka, tab, pengelompokan anggaran (POK berlaku -> Komponen -> Akun -> Item) dengan realisasi dan RAB, ringkasan RO, penugasan.
// Sumber data (semua lewat GET /api/sigap/keu/baca): keu_v_adm_lembar (item POK berlaku per RO), keu_v_realisasi_terbaru,
// keu_v_rab_ringkas + keu_v_rab_item, keu_v_adm_ringkas + keu_v_adm_item, keu_v_kekurangan(_ro), keu_v_skor_ro, keu_v_penugasan_ro.

export const TAB_RO = ["ringkasan", "anggaran", "rab", "administrasi", "revisi", "kertas", "kekurangan", "tim"] as const;
export type TabRo = (typeof TAB_RO)[number];
export const LABEL_TAB: Record<TabRo, string> = { ringkasan: "Ringkasan", anggaran: "Anggaran", rab: "RAB", administrasi: "Administrasi", revisi: "Revisi", kertas: "Kertas kerja", kekurangan: "Kekurangan RAB", tim: "Tim dan akses" };

/** Alamat GET /api/sigap/keu/baca. `saring` = pasangan kolom->nilai (larik = salah satu dari; null = kosong). Urutan kunci dibuat tetap supaya simpanan klien konsisten. */
export function urlBaca(tampilan: string, saring: Record<string, string | number | null | (string | number)[]> = {}, opsi: { urut?: string; batas?: number; kolom?: string[] } = {}): string {
  const q = new URLSearchParams();
  q.set("tampilan", tampilan);
  for (const k of Object.keys(saring).sort()) {
    const v = saring[k];
    q.set(k, v === null ? "null" : Array.isArray(v) ? v.join("|") : String(v));
  }
  if (opsi.kolom?.length) q.set("kolom", opsi.kolom.join(","));
  if (opsi.urut) q.set("urut", opsi.urut);
  if (opsi.batas) q.set("batas", String(opsi.batas));
  return `/api/sigap/keu/baca?${q.toString()}`;
}

/** Tab dari ?tab=; nilai tak dikenal -> ringkasan. */
export function tabDari(q: string | null | undefined): TabRo {
  return (TAB_RO as readonly string[]).includes(q ?? "") ? (q as TabRo) : "ringkasan";
}

/** Kode RO sah: KRO.RO seperti 2906.BMA.005, 2902.FAN.ZZ1 atau kode sementara T-001. */
export function kodeRoSah(k: string | null | undefined): boolean {
  return /^(\d{4}\.[A-Z]{3}\.[A-Z0-9]{3}|T-\d{3})$/.test(k ?? "");
}

const fmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
/** 1234567 -> "1.234.567"; null/NaN -> "-". */
export function angka(n: number | string | null | undefined): string {
  const x = typeof n === "string" ? Number(n) : n;
  return x === null || x === undefined || !Number.isFinite(x) ? "-" : fmt.format(Math.round(x));
}
export const rupiah = (n: number | string | null | undefined): string => (angka(n) === "-" ? "-" : `Rp ${angka(n)}`);
/** Persentase satu desimal: 0.4567 -> "45,7%"; pembagi nol -> "-". */
export function persen(bagian: number, total: number): string {
  if (!total) return "-";
  return `${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format((bagian / total) * 100)}%`;
}
const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

// ---------- RAB mana yang ditampilkan ----------
export type BarisRabRingkas = { rab_id: number; ro_kode: string; nomor: number | string | null; status: string };
const STATUS_RAB_AKTIF = ["draf", "menunggu_ketua", "menunggu_ppk", "dikembalikan"];
/** RAB yang ditampilkan untuk satu RO: yang sedang disusun/diproses bila ada, bila tidak yang disetujui terbaru; selain itu null. */
export function pilihRab(daftar: BarisRabRingkas[], ro: string): BarisRabRingkas | null {
  const milik = daftar.filter((r) => r.ro_kode === ro);
  const aktif = milik.find((r) => STATUS_RAB_AKTIF.includes(r.status));
  if (aktif) return aktif;
  const sah = milik.filter((r) => r.status === "disetujui").sort((a, b) => Number(b.nomor ?? 0) - Number(a.nomor ?? 0) || b.rab_id - a.rab_id);
  return sah[0] ?? null;
}

// ---------- Anggaran ----------
export type BarisLembar = { detail_id: number; ro_kode: string; komponen_kode: string; akun_kode: string; kunci_stabil: string; nomor_item: string | null; uraian: string; volume: number | string; satuan: string; jumlah: number | string };
export type BarisRealisasi = { detail_id: number | null; real_sd: number | string; pagu: number | string };
export type BarisRabItem = { pok_kunci: string | null; baru: boolean; status: string; jumlah_rab: number | string; selesai: boolean };

export type ItemAnggaran = { detail_id: number; kunci: string; komponen: string; akun: string; nomor_item: string | null; uraian: string; volume: number; satuan: string; pok: number; realisasi: number; rab: number | null; statusRab: string | null; selesai: boolean };
export type AkunAnggaran = { akun: string; item: ItemAnggaran[]; pok: number; realisasi: number; rab: number };
export type KomponenAnggaran = { komponen: string; akun: AkunAnggaran[]; pok: number; realisasi: number; rab: number };

export const STATUS_RAB: Record<string, string> = { belum: "Belum ada RAB", sama: "RAB = Item", rinci: "RAB rinci", selesai: "Selesai (tidak diusulkan lagi)" };
export const STATUS_ADM: Record<string, string> = { tanpa_dokumen: "Tanpa dokumen", belum: "Belum dimulai", berjalan: "Berjalan", diperiksa: "Menunggu verifikasi", lengkap: "Lengkap" };
export const STATUS_KEK: Record<string, string> = { tercatat: "Tercatat", ditunda: "Ditunda", dipenuhi: "Dipenuhi", ditolak: "Ditolak", ditarik: "Ditarik" };

/** Susun POK berlaku RO menjadi Komponen -> Akun -> Item (urut kode), dengan realisasi (per detail_id) dan RAB (per kunci stabil). */
export function susunAnggaran(lembar: BarisLembar[], realisasi: BarisRealisasi[], rab: BarisRabItem[]): KomponenAnggaran[] {
  const real = new Map<number, number>();
  for (const r of realisasi) if (r.detail_id != null) real.set(r.detail_id, (real.get(r.detail_id) ?? 0) + num(r.real_sd));
  const rabPer = new Map<string, BarisRabItem>();
  for (const x of rab) if (x.pok_kunci && !x.baru) rabPer.set(x.pok_kunci, x);
  const peta = new Map<string, Map<string, ItemAnggaran[]>>();
  for (const b of lembar) {
    const r = rabPer.get(b.kunci_stabil);
    const item: ItemAnggaran = {
      detail_id: b.detail_id, kunci: b.kunci_stabil, komponen: b.komponen_kode, akun: b.akun_kode, nomor_item: b.nomor_item, uraian: b.uraian, volume: num(b.volume), satuan: b.satuan, pok: num(b.jumlah),
      realisasi: real.get(b.detail_id) ?? 0, rab: r ? num(r.jumlah_rab) : null, statusRab: r ? r.status : null, selesai: r?.selesai ?? false,
    };
    const akunPeta = peta.get(b.komponen_kode) ?? new Map<string, ItemAnggaran[]>();
    const daftar = akunPeta.get(b.akun_kode) ?? [];
    daftar.push(item);
    akunPeta.set(b.akun_kode, daftar);
    peta.set(b.komponen_kode, akunPeta);
  }
  const hasil: KomponenAnggaran[] = [];
  for (const komponen of [...peta.keys()].sort()) {
    const akunPeta = peta.get(komponen)!;
    const akun: AkunAnggaran[] = [...akunPeta.keys()].sort().map((a) => {
      const item = akunPeta.get(a)!.sort((x, y) => (x.nomor_item ?? "~").localeCompare(y.nomor_item ?? "~") || x.uraian.localeCompare(y.uraian));
      return { akun: a, item, pok: sum(item.map((i) => i.pok)), realisasi: sum(item.map((i) => i.realisasi)), rab: sum(item.filter((i) => !i.selesai).map((i) => i.rab ?? 0)) };
    });
    hasil.push({ komponen, akun, pok: sum(akun.map((a) => a.pok)), realisasi: sum(akun.map((a) => a.realisasi)), rab: sum(akun.map((a) => a.rab)) });
  }
  return hasil;
}
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

// ---------- Penugasan ----------
export type BarisPenugasan = { sumber: string; peran_kode: string; ro_kode: string | null; akun_id: number; akun_nama: string; berlaku_mulai: string; berlaku_sampai: string | null; aktif_hari_ini: boolean };
export type PenugasanRo = { ketua: string[]; adminRo: string[]; pbj: string[]; aksesAdministrasi: string[]; adaKetua: boolean };

/** Penugasan yang berlaku hari ini untuk RO itu (termasuk yang berlaku untuk semua RO, ro_kode kosong). Nama unik, urut abjad. */
export function penugasanRo(baris: BarisPenugasan[], ro: string): PenugasanRo {
  const aktif = baris.filter((b) => b.aktif_hari_ini && (b.ro_kode === ro || b.ro_kode === null));
  const nama = (kode: string) => [...new Set(aktif.filter((b) => b.peran_kode === kode).map((b) => b.akun_nama))].sort((a, b) => a.localeCompare(b));
  // KETUA/ADMINRO/PBJ dihitung hanya bila ro_kode = RO ini; penugasan tanpa ro_kode hanya dipakai untuk akses administrasi.
  const khusus = (kode: string) => [...new Set(aktif.filter((b) => b.peran_kode === kode && b.ro_kode === ro).map((b) => b.akun_nama))].sort((a, b) => a.localeCompare(b));
  const ketuaRo = khusus("KETUA");
  return {
    ketua: ketuaRo,
    adminRo: khusus("ADMINRO"),
    pbj: khusus("PBJ"),
    aksesAdministrasi: nama("AKSES_ADM"),
    adaKetua: ketuaRo.length > 0,
  };
}

// ---------- Ringkasan RO ----------
export type RingkasRo = {
  pok: number; realisasi: number; rabJumlah: number; nItem: number; nItemBerRab: number;
  skor: { total: number | null; kategori: string | null } | null;
  kekurangan: { nTerbuka: number; jumlahTerbuka: number };
  administrasi: { persenVerifikasi: number | null; nDok: number; nBelum: number };
};
type SkorRow = { total: number | string | null; kategori: string | null; ada_rab_sah: boolean };
type KekRow = { n_terbuka: number | string; jumlah_terbuka: number | string };
type AdmRow = { persen_terverifikasi: number | string | null; n_dok: number | string; n_belum: number | string };

export function ringkasRo(anggaran: KomponenAnggaran[], skor: SkorRow | null | undefined, kek: KekRow | null | undefined, adm: AdmRow | null | undefined): RingkasRo {
  const semua = anggaran.flatMap((k) => k.akun.flatMap((a) => a.item));
  return {
    pok: sum(anggaran.map((k) => k.pok)),
    realisasi: sum(anggaran.map((k) => k.realisasi)),
    rabJumlah: sum(anggaran.map((k) => k.rab)),
    nItem: semua.length,
    nItemBerRab: semua.filter((i) => i.rab !== null).length,
    skor: skor && skor.ada_rab_sah ? { total: skor.total === null ? null : num(skor.total), kategori: skor.kategori } : null,
    kekurangan: { nTerbuka: num(kek?.n_terbuka), jumlahTerbuka: num(kek?.jumlah_terbuka) },
    administrasi: { persenVerifikasi: adm && adm.persen_terverifikasi !== null ? num(adm.persen_terverifikasi) : null, nDok: num(adm?.n_dok), nBelum: num(adm?.n_belum) },
  };
}

export const WARNA_KATEGORI: Record<string, string> = { Baik: "bg-[#E3F6EC] text-[#0B6B3F]", Cukup: "bg-[#FFF4D6] text-[#8A6200]", Kurang: "bg-[#FDE8E8] text-[#9B1C23]" };
