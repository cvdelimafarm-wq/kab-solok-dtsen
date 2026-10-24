// lib/keu/peta.ts
//
// (24 Okt 2026, tahap 8) Peta KRO Satker (papan 8 mockup): kecukupan seluruh KRO sekaligus, putusan tingkat Satker (POK - RAB seluruh KRO),
// jalur yang mungkin menurut tangga wewenang, serta daftar kekurangan pagu per KRO untuk keputusan PPK (Terima semua / sebagian / Tunda)
// beserta pembagian sumber bagian yang diterima (DJPb, Eselon I, DJA). Tanpa React/DB.
//
// Sumber angka: struktur dan pagu dari simpul POK berlaku (program, kegiatan, KRO, RO); RAB dari RAB aktif tiap RO (pilihRab); POK pembanding
// per item = "Menjadi" kertas kerja bila item ada di kertas kerja jadwal terpilih, bila tidak POK berlaku (kunci_stabil). Hanya item yang sudah
// punya RAB yang dibandingkan; KRO tanpa RAB berstatus "Belum ada RAB" dan tidak ikut jumlah.

import { statusKecukupan, TOLERANSI_BAWAAN, FAKTOR_BAWAAN, type StatusKecukupan } from "./kecukupan";
import { kroDariRo } from "./matriks";

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const rp = (v: number) => `Rp ${Math.round(v).toLocaleString("id-ID")}`;
const sel = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${rp(Math.abs(v))}`);

// ---------------------------------------------------------------- struktur
export type NodePeta = { id: number; induk_id: number | null; tingkat: string; kode: string; nama: string; pagu: number | string | null; ro_kode: string | null };
export type KroPeta = { kro: string; nama: string; prog: string; progNama: string; keg: string; kegNama: string; ro: string[]; pagu: number; nDetail: number };

const bersih = (s: string) => s.replace(/\[.*\]/, "").trim();

/** Satu entri per KRO (kode lengkap "2906.BMA"). Kode KRO yang muncul dua kali pada POK (dua blok alokasi) digabung. Urut Kegiatan lalu KRO. */
export function susunPeta(nodes: NodePeta[], kunciDetail: string[]): KroPeta[] {
  const peta = new Map(nodes.map((x) => [Number(x.id), x]));
  const naik = (x: NodePeta, tingkat: string): NodePeta | null => {
    let c: NodePeta | undefined = x;
    for (let i = 0; i < 8 && c; i++) { if (c.tingkat === tingkat) return c; c = c.induk_id === null ? undefined : peta.get(Number(c.induk_id)); }
    return null;
  };
  const hasil = new Map<string, KroPeta>();
  const dipakai = new Set<number>();
  for (const k of nodes.filter((x) => x.tingkat === "kro")) {
    const keg = naik(k, "kegiatan"), prog = naik(k, "program");
    if (!keg) continue;
    const kunci = `${keg.kode}.${k.kode}`;
    const e = hasil.get(kunci) ?? { kro: kunci, nama: bersih(k.nama), prog: prog?.kode ?? "", progNama: prog?.nama ?? "", keg: keg.kode, kegNama: keg.nama, ro: [], pagu: 0, nDetail: 0 };
    hasil.set(kunci, e);
    if (!dipakai.has(Number(k.id))) { dipakai.add(Number(k.id)); e.pagu += num(k.pagu); }
  }
  for (const r of nodes.filter((x) => x.tingkat === "ro")) {
    const kro = naik(r, "kro"), keg = naik(r, "kegiatan");
    if (!kro || !keg) continue;
    const e = hasil.get(`${keg.kode}.${kro.kode}`);
    const kode = r.ro_kode ?? `${keg.kode}.${kro.kode}.${r.kode}`;
    if (e && !e.ro.includes(kode)) e.ro.push(kode);
  }
  const perRo = new Map<string, number>();
  for (const k of kunciDetail) { const ro = k.split("/")[0]; perRo.set(ro, (perRo.get(ro) ?? 0) + 1); }
  for (const e of hasil.values()) { e.ro.sort(); e.nDetail = e.ro.reduce((s, r) => s + (perRo.get(r) ?? 0), 0); }
  return [...hasil.values()].sort((a, b) => a.keg.localeCompare(b.keg) || a.kro.localeCompare(b.kro));
}

// ---------------------------------------------------------------- hitungan per KRO
export type RabPeta = { rab_id: number; ro_kode: string };
export type ItemPeta = { item_id: number; rab_id: number; pok_kunci: string | null; baru?: boolean; status: string; jumlah_rab: number | string; selesai: boolean };
export type DetailPeta = { kunci_stabil: string; jumlah: number | string };
export type KkPeta = { ro_kode: string; pok_kunci: string | null; jumlah_menjadi: number | string; rab_item_id: number | null; penggenap: boolean };

export type BarisPeta = KroPeta & {
  nAda: number; nTakPadan: number; Pc: number; R: number; K: number; st: StatusKecukupan;
  /** POK - RAB (pasti) dan POK - kebutuhan riil. */
  dPasti: number; dRiil: number;
  /** Kekurangan pagu = RAB - POK bila positif. */
  kurang: number;
  /** Sisa yang dapat menjadi sumber (status Cukup atau Lebih): POK - kebutuhan riil. */
  sisa: number;
};

export function hitungPeta(struktur: KroPeta[], rab: RabPeta[], item: ItemPeta[], detail: DetailPeta[], kk: KkPeta[], faktor: number, toleransi: number): BarisPeta[] {
  const f = faktor >= 0.5 && faktor <= 1 ? faktor : FAKTOR_BAWAAN;
  const t = toleransi >= 0 ? toleransi : TOLERANSI_BAWAAN;
  const roDariRab = new Map(rab.map((r) => [Number(r.rab_id), r.ro_kode]));
  const perDetail = new Map<string, number>();
  for (const d of detail) perDetail.set(d.kunci_stabil, (perDetail.get(d.kunci_stabil) ?? 0) + num(d.jumlah));
  const kkItem = new Map<number, number>(), kkKunci = new Map<string, number>();
  for (const b of kk) {
    if (b.penggenap) continue;
    const j = num(b.jumlah_menjadi);
    if (b.rab_item_id !== null) kkItem.set(Number(b.rab_item_id), (kkItem.get(Number(b.rab_item_id)) ?? 0) + j);
    if (b.pok_kunci) { const k = `${b.ro_kode}|${b.pok_kunci}`; kkKunci.set(k, (kkKunci.get(k) ?? 0) + j); }
  }
  type Acc = { nAda: number; nTak: number; Pc: number; R: number; kRaw: number };
  const per = new Map<string, Acc>();
  for (const it of item) {
    const ro = roDariRab.get(Number(it.rab_id));
    const kro = ro ? kroDariRo(ro) : null;
    if (!ro || !kro || it.status === "belum") continue;
    const a = per.get(kro) ?? { nAda: 0, nTak: 0, Pc: 0, R: 0, kRaw: 0 }; per.set(kro, a);
    const r = num(it.jumlah_rab);
    const dariKk = kkItem.get(Number(it.item_id)) ?? (it.pok_kunci ? kkKunci.get(`${ro}|${it.pok_kunci}`) : undefined);
    const pok = dariKk ?? (it.pok_kunci ? perDetail.get(it.pok_kunci) : undefined) ?? (it.baru ? 0 : undefined);
    if (pok === undefined) { a.nTak += 1; continue; }
    a.nAda += 1; a.Pc += pok; a.R += r; a.kRaw += it.selesai ? r : r / f;
  }
  return struktur.map((s) => {
    const a = per.get(s.kro) ?? { nAda: 0, nTak: 0, Pc: 0, R: 0, kRaw: 0 };
    const K = Math.round(a.kRaw);
    const st = statusKecukupan(a.Pc, a.R, K, t);
    return { ...s, nAda: a.nAda, nTakPadan: a.nTak, Pc: a.Pc, R: a.R, K, st, dPasti: a.Pc - a.R, dRiil: a.Pc - K, kurang: Math.max(0, a.R - a.Pc), sisa: st === "cukup" || st === "lebih" ? Math.max(0, a.Pc - K) : 0 };
  });
}

export type RingkasPeta = { P: number; R: number; K: number; dPasti: number; dRiil: number; pagu: number; nKro: number; nAda: number; keg: Map<string, { P: number; R: number; K: number }> };
export function ringkasPeta(baris: BarisPeta[]): RingkasPeta {
  const keg = new Map<string, { P: number; R: number; K: number }>();
  const tot = { P: 0, R: 0, K: 0, pagu: 0, nKro: baris.length, nAda: 0 };
  for (const b of baris) {
    tot.P += b.Pc; tot.R += b.R; tot.K += b.K; tot.pagu += b.pagu; if (b.nAda > 0) tot.nAda += 1;
    const g = keg.get(b.keg) ?? { P: 0, R: 0, K: 0 }; keg.set(b.keg, g);
    g.P += b.Pc; g.R += b.R; g.K += b.K;
  }
  return { ...tot, dPasti: tot.P - tot.R, dRiil: tot.P - tot.K, keg };
}

// ---------------------------------------------------------------- putusan Satker dan jalur
export type Vonis = { warna: "hijau" | "merah" | "abu"; label: string; teks: string };
export function vonisSatker(r: RingkasPeta, faktor: number): Vonis {
  if (r.nAda === 0) return { warna: "abu", label: "Belum dapat dinilai", teks: "Belum ada KRO yang punya RAB, jadi pagu Satker belum dapat dibandingkan dengan kebutuhan. Isi RAB tiap RO lebih dulu." };
  if (r.dPasti >= 0) {
    const f = String(faktor).replace(".", ",");
    return { warna: "hijau", label: "Pagu Satker cukup untuk seluruh RAB", teks: `POK − RAB seluruh KRO ${sel(r.dPasti)}. Kekurangan pada satu KRO dapat ditutup dari KRO lain tanpa pagu tambahan; DJA tidak diperlukan.${r.dRiil < 0 ? ` Namun terhadap kebutuhan riil (RAB ÷ ${f}) masih kurang ${rp(-r.dRiil)}: cadangan tipis.` : ""}` };
  }
  return { warna: "merah", label: "Pagu Satker tidak cukup untuk seluruh RAB", teks: `POK − RAB seluruh KRO ${sel(r.dPasti)}. Perlu pagu tambahan (jalur DJA, tidak dijamin) atau cakupan kegiatan dikurangi.` };
}

export type KelompokKegiatan = { keg: string; nama: string; kro: BarisPeta[]; P: number; R: number; K: number; ket: string };
/** Keterangan baris Kegiatan: KRO Kurang beserta KRO sumber (sisa) pada Kegiatan yang sama. */
export function ketKegiatan(arr: BarisPeta[]): string {
  const kurang = arr.filter((b) => b.st === "kurang"), sumber = arr.filter((b) => b.sisa > 0);
  if (kurang.length) {
    const nama = kurang.map((b) => b.kro).join(", ");
    return sumber.length
      ? `Kurang pada ${nama}; sisa pada ${sumber.map((b) => `${b.kro} (${rp(b.sisa)})`).join(", ")} dapat dipertimbangkan: Revisi DIPA jalur DJPb, tingkat 3.`
      : `Kurang pada ${nama}; tidak ada KRO lain dengan sisa pada Kegiatan ini. Cari antar-Kegiatan (Eselon I, tingkat 4) atau DJA.`;
  }
  return sumber.length ? `Ada sisa ${rp(sumber.reduce((s, b) => s + b.sisa, 0))} yang dapat menjadi sumber.` : "";
}
export function ketKro(b: BarisPeta): string {
  if (b.nAda === 0) return `Belum ada RAB untuk KRO ini (pagu ${rp(b.pagu)}). Tidak ikut jumlah.${b.nTakPadan ? ` ${b.nTakPadan} item RAB belum terpadan ke POK.` : ""}`;
  return `RAB mencakup ${b.nAda} dari ${b.nDetail} item POK; dibandingkan pada item ber-RAB saja (pagu KRO ${rp(b.pagu)}).${b.nTakPadan ? ` ${b.nTakPadan} item RAB belum terpadan ke POK sehingga dilewati.` : ""}`;
}

/** Kelompokkan baris per Kegiatan (urut kemunculan) dengan jumlahnya. */
export function kelompokKegiatan(baris: BarisPeta[]): KelompokKegiatan[] {
  const hasil: KelompokKegiatan[] = [];
  for (const b of baris) {
    let g = hasil.find((x) => x.keg === b.keg);
    if (!g) { g = { keg: b.keg, nama: b.kegNama, kro: [], P: 0, R: 0, K: 0, ket: "" }; hasil.push(g); }
    g.kro.push(b); g.P += b.Pc; g.R += b.R; g.K += b.K;
  }
  for (const g of hasil) g.ket = ketKegiatan(g.kro);
  return hasil;
}

export type JalurPeta = { judul: string; tingkat: string; teks: string };
export function jalurPeta(baris: BarisPeta[], r: RingkasPeta): JalurPeta[] {
  const kurang = baris.filter((b) => b.st === "kurang"), sisa = baris.filter((b) => b.sisa > 0);
  const adaPasangan = kelompokKegiatan(baris).some((g) => g.kro.some((b) => b.st === "kurang") && g.kro.some((b) => b.sisa > 0));
  return [
    { judul: "Dalam Kegiatan yang sama", tingkat: "Tingkat 3, DJPb", teks: `Pasangkan KRO Kurang dengan KRO Cukup atau Lebih pada Kegiatan yang sama. ${adaPasangan ? "Ada pasangan yang mungkin pada peta di bawah." : "Pada data saat ini belum ada pasangan dalam satu Kegiatan."}` },
    { judul: "Antar-Kegiatan", tingkat: "Tingkat 4, Eselon I", teks: kurang.length && sisa.length ? `KRO dengan sisa pada Kegiatan lain: ${sisa.slice(0, 4).map((b) => b.kro).join(", ")}${sisa.length > 4 ? `, dan ${sisa.length - 4} lainnya` : ""}. Perlu surat persetujuan pejabat Eselon I dan pengesahan Kanwil.` : "Tidak ada KRO Kurang, atau tidak ada KRO lain dengan sisa." },
    { judul: "Pagu tambahan atau antar-Program", tingkat: "Tingkat 5, DJA", teks: r.nAda === 0 || r.dPasti >= 0 ? "Tidak diperlukan selama jumlah seluruh KRO masih lebih dari atau sama dengan 0." : "Diperlukan, tetapi tidak dijamin. Lampirkan RAB sebagai dasar kebutuhan." },
  ];
}

// ---------------------------------------------------------------- tampilan PPK
export type KeputusanPeta = "" | "semua" | "sebagian" | "tunda";
export type DaftarKeputusan = Record<string, { m: KeputusanPeta; jum: number }>;
export type BarisPpk = {
  kro: string; nama: string; keg: string; prog: string; Pc: number; R: number; kurang: number; m: KeputusanPeta; jum: number;
  diterima: number; tertunda: number; menunggu: number; djpb: number; esl: number; dja: number; label: string;
};
export type TotalPpk = { kurang: number; diterima: number; ditunda: number; menunggu: number; djpb: number; eselon: number; dja: number };

export const LABEL_PPK: Record<KeputusanPeta, string> = { "": "Menunggu keputusan PPK", semua: "Diterima semua", sebagian: "Diterima sebagian", tunda: "Ditunda" };

/**
 * Daftar KRO yang kekurangan (RAB > POK) dengan keputusan PPK. Bagian yang diterima ditutup lebih dulu dari sisa KRO lain pada Kegiatan yang sama
 * (DJPb, tingkat 3), lalu dari KRO pada Kegiatan lain di Program yang sama (Eselon I, tingkat 4); sisanya menjadi usulan ke DJA (tingkat 5).
 * Sisa tiap KRO hanya dipakai sekali (urutan baris menentukan). Pembagian ini usulan sistem; keputusan akhir pada PPK dan pejabat berwenang.
 */
export function ppkDaftar(baris: BarisPeta[], dec: DaftarKeputusan): { rows: BarisPpk[]; total: TotalPpk } {
  const sisa = new Map<string, number>();
  for (const b of baris) if (b.sisa > 0) sisa.set(b.kro, b.sisa);
  const rows: BarisPpk[] = [];
  const total: TotalPpk = { kurang: 0, diterima: 0, ditunda: 0, menunggu: 0, djpb: 0, eselon: 0, dja: 0 };
  for (const b of baris) {
    if (b.kurang <= 0) continue;
    const d = dec[b.kro] ?? { m: "" as KeputusanPeta, jum: 0 };
    const diterima = d.m === "semua" ? b.kurang : d.m === "sebagian" ? Math.max(0, Math.min(b.kurang, Math.round(d.jum || 0))) : 0;
    const tertunda = d.m === "" ? 0 : b.kurang - diterima, menunggu = d.m === "" ? b.kurang : 0;
    let perlu = diterima, djpb = 0, esl = 0;
    if (perlu > 0) {
      for (const o of baris) if (perlu > 0 && o.kro !== b.kro && o.keg === b.keg && (sisa.get(o.kro) ?? 0) > 0) { const x = Math.min(perlu, sisa.get(o.kro)!); sisa.set(o.kro, sisa.get(o.kro)! - x); perlu -= x; djpb += x; }
      for (const o of baris) if (perlu > 0 && o.kro !== b.kro && o.keg !== b.keg && o.prog === b.prog && (sisa.get(o.kro) ?? 0) > 0) { const x = Math.min(perlu, sisa.get(o.kro)!); sisa.set(o.kro, sisa.get(o.kro)! - x); perlu -= x; esl += x; }
    }
    rows.push({ kro: b.kro, nama: b.nama, keg: b.keg, prog: b.prog, Pc: b.Pc, R: b.R, kurang: b.kurang, m: d.m, jum: d.jum || 0, diterima, tertunda, menunggu, djpb, esl, dja: perlu, label: LABEL_PPK[d.m] });
    total.kurang += b.kurang; total.diterima += diterima; total.ditunda += tertunda; total.menunggu += menunggu; total.djpb += djpb; total.eselon += esl; total.dja += perlu;
  }
  return { rows, total };
}

/** Teks sumber bagian yang diterima untuk satu baris PPK. */
export function teksSumber(r: BarisPpk): string {
  if (r.diterima > 0) {
    return [r.djpb > 0 ? `DJPb (KRO lain, Kegiatan sama) ${rp(r.djpb)}` : "", r.esl > 0 ? `Eselon I (Kegiatan lain, Program sama) ${rp(r.esl)}` : "", r.dja > 0 ? `DJA (tambah pagu atau antar-Program) ${rp(r.dja)}` : ""].filter(Boolean).join("; ");
  }
  return r.m === "" ? "Belum diputuskan" : r.m === "tunda" ? "Ditunda, tercatat di Buku selisih" : "";
}

/** Keputusan yang tersimpan (keu_kk_keputusan_kro) menjadi peta keputusan per KRO. */
export function keputusanDariBasis(rows: { kro: string; keputusan: string; jumlah: number | string | null }[]): DaftarKeputusan {
  const d: DaftarKeputusan = {};
  for (const r of rows) if (r.keputusan === "semua" || r.keputusan === "sebagian" || r.keputusan === "tunda") d[r.kro] = { m: r.keputusan, jum: num(r.jumlah) };
  return d;
}

export const urlPeta = (jadwal: number | null, dari?: string): string => {
  const q = new URLSearchParams();
  if (jadwal) q.set("jadwal", String(jadwal));
  if (dari) q.set("dari", dari);
  const s = q.toString();
  return `/sigap/revisi/peta${s ? `?${s}` : ""}`;
};
