// lib/keu/versi.ts
//
// (24 Okt 2026, tahap 18) Papan 7 mockup: "Sesudah revisi: versi berurutan, RPD, dan dampak". Tanpa React/DB.
//
// Tiga tab:
//  1. Versi berurutan: versi POK sistem (keu_pok_versi, diurut nomor revisi), total tiap versi, perbandingan dua versi per RO (dikelompokkan
//     per KRO) dan rincian baris yang berbeda (dipasangkan lewat kunci_stabil).
//  2. RPD sebelum dan sesudah: pagu tiap baris kertas kerja jadwal terpilih (Semula dan Menjadi) disebar ke bulan menurut pola pencairan
//     RAB (keu_v_rab_jadwal_item) baris yang sama (pok_kunci). Baris tanpa pola tidak ditebak: dihitung terpisah sebagai "belum ada pola".
//  3. Dampak ke Booked dan Realisasi: pagu Menjadi baris yang berubah dibandingkan dengan realisasi terbaru (keu_v_realisasi_terbaru).
//     Booked belum punya sumber data di sistem; kolomnya "-" dan tidak ikut perhitungan (dinyatakan terang di layar).

import { kroDariRo } from "./matriks";

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export const selisihTeks = (v: number): string => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${Math.abs(Math.round(v)).toLocaleString("id-ID")}`);
export const arahSelisih = (v: number): "naik" | "turun" | "nol" => (v > 0 ? "naik" : v < 0 ? "turun" : "nol");

// ---------------------------------------------------------------- tab 1: versi
export type VersiPok = { id: number; tahun: number; nomor_revisi: number; jenis: string | null; nomor_pok: string | null; tanggal_efektif: string | null; status: string; dibuat_at: string | null };
export type NodeVersi = { id: number; versi_id: number; induk_id: number | null; tingkat: string; kode: string; nama: string; pagu: number | string | null; ro_kode: string | null };
export type DetailVersi = { id: number; versi_id: number; akun_node_id: number; kunci_stabil: string; uraian: string; jumlah: number | string | null };

export const LABEL_STATUS_VERSI: Record<string, string> = { berlaku: "Berlaku", digantikan: "Tersimpan", draf: "Draf" };

/** Urut menurut nomor revisi lalu id (lama ke baru). */
export function urutVersi(v: VersiPok[]): VersiPok[] {
  return [...v].sort((a, b) => a.nomor_revisi - b.nomor_revisi || a.id - b.id);
}

/** Versi terbaru = status berlaku bila ada, bila tidak yang paling akhir. */
export function versiTerbaru(v: VersiPok[]): VersiPok | null {
  const u = urutVersi(v);
  return u.find((x) => x.status === "berlaku") ?? u[u.length - 1] ?? null;
}

export const labelVersi = (v: Pick<VersiPok, "nomor_revisi">): string => (v.nomor_revisi === 0 ? "POK semula" : `Revisi ${v.nomor_revisi}`);

/** Jumlah pagu tingkat program pada satu versi (bila tak ada simpul program: jumlah simpul RO). */
export function totalVersi(nodes: NodeVersi[], versiId: number): number {
  const ini = nodes.filter((n) => Number(n.versi_id) === versiId);
  const prog = ini.filter((n) => n.tingkat === "program");
  const pakai = prog.some((n) => n.pagu !== null) ? prog : ini.filter((n) => n.tingkat === "ro");
  return pakai.reduce((t, n) => t + num(n.pagu), 0);
}

export type PasanganVersi = { a: number; b: number; nama: string };
/** Pasangan berurutan, lalu pertama ke terakhir bila lebih dari dua versi (seperti papan 7). */
export function pasanganVersi(v: VersiPok[]): PasanganVersi[] {
  const u = urutVersi(v);
  const out: PasanganVersi[] = [];
  for (let i = 0; i + 1 < u.length; i++) out.push({ a: u[i].id, b: u[i + 1].id, nama: `${labelVersi(u[i])} ke ${u[i + 1].nomor_revisi}` });
  if (u.length > 2) out.push({ a: u[0].id, b: u[u.length - 1].id, nama: `${labelVersi(u[0])} ke ${u[u.length - 1].nomor_revisi}` });
  return out;
}

export type BarisRoVersi = { ro: string; nama: string; a: number; b: number; d: number; ada: "dua" | "hanyaA" | "hanyaB" };
export type KelompokKro = { kro: string; ro: BarisRoVersi[]; a: number; b: number; d: number };
export type BandingRo = { kelompok: KelompokKro[]; a: number; b: number; d: number; nBeda: number; nSemua: number };

const bersihNama = (s: string) => s.replace(/\[.*\]/, "").replace(" (contoh)", "").trim();

/** Total per RO pada dua versi, dikelompokkan per KRO. `semua` = tampilkan juga RO yang tidak berubah. Total diambil dari SEMUA RO. */
export function bandingRo(nodes: NodeVersi[], a: number, b: number, semua = false): BandingRo {
  const ambil = (id: number) => {
    const m = new Map<string, { nama: string; pagu: number }>();
    for (const n of nodes) {
      if (Number(n.versi_id) !== id || n.tingkat !== "ro" || !n.ro_kode) continue;
      const s = m.get(n.ro_kode);
      m.set(n.ro_kode, { nama: bersihNama(n.nama), pagu: (s?.pagu ?? 0) + num(n.pagu) });
    }
    return m;
  };
  const A = ambil(a), B = ambil(b);
  const kode = [...new Set([...A.keys(), ...B.keys()])].sort();
  const semuaBaris: BarisRoVersi[] = kode.map((ro) => {
    const x = A.get(ro), y = B.get(ro);
    return { ro, nama: (y ?? x)!.nama, a: x?.pagu ?? 0, b: y?.pagu ?? 0, d: (y?.pagu ?? 0) - (x?.pagu ?? 0), ada: x && y ? "dua" : x ? "hanyaA" : "hanyaB" };
  });
  const tampil = semuaBaris.filter((r) => semua || r.d !== 0 || r.ada !== "dua");
  const per = new Map<string, BarisRoVersi[]>();
  for (const r of tampil) { const k = kroDariRo(r.ro) ?? r.ro; per.set(k, [...(per.get(k) ?? []), r]); }
  const kelompok: KelompokKro[] = [...per.entries()].map(([kro, ro]) => ({ kro, ro, a: ro.reduce((t, r) => t + r.a, 0), b: ro.reduce((t, r) => t + r.b, 0), d: ro.reduce((t, r) => t + r.d, 0) }));
  const ta = semuaBaris.reduce((t, r) => t + r.a, 0), tb = semuaBaris.reduce((t, r) => t + r.b, 0);
  return { kelompok, a: ta, b: tb, d: tb - ta, nBeda: semuaBaris.filter((r) => r.d !== 0 || r.ada !== "dua").length, nSemua: semuaBaris.length };
}

export type BarisBeda = { kunci: string; ro: string; akun: string; uraian: string; a: number; b: number; d: number; status: "berubah" | "baru" | "hilang" };

/** Ro dan akun tiap rincian dicari dengan menelusuri induk simpul akun. */
export function petaRincian(nodes: NodeVersi[], details: DetailVersi[]): Map<number, Map<string, { ro: string; akun: string; uraian: string; jumlah: number }>> {
  const peta = new Map(nodes.map((n) => [Number(n.id), n]));
  const naik = (n: NodeVersi | undefined): { ro: string; akun: string } => {
    let akun = "", ro = "";
    let c = n;
    for (let i = 0; i < 10 && c; i++) {
      if (c.tingkat === "akun" && !akun) akun = c.kode;
      if (c.tingkat === "ro") { ro = c.ro_kode ?? ""; break; }
      c = c.induk_id === null ? undefined : peta.get(Number(c.induk_id));
    }
    return { ro, akun };
  };
  const out = new Map<number, Map<string, { ro: string; akun: string; uraian: string; jumlah: number }>>();
  for (const d of details) {
    const v = Number(d.versi_id);
    const { ro, akun } = naik(peta.get(Number(d.akun_node_id)));
    if (!out.has(v)) out.set(v, new Map());
    out.get(v)!.set(d.kunci_stabil, { ro: ro || d.kunci_stabil.split("/")[0], akun, uraian: d.uraian, jumlah: num(d.jumlah) });
  }
  return out;
}

/** Baris rincian yang berbeda antara dua versi (dipasangkan lewat kunci_stabil). */
export function bandingRincian(nodes: NodeVersi[], details: DetailVersi[], a: number, b: number): BarisBeda[] {
  const p = petaRincian(nodes, details);
  const A = p.get(a) ?? new Map(), B = p.get(b) ?? new Map();
  const kunci = [...new Set([...A.keys(), ...B.keys()])];
  const out: BarisBeda[] = [];
  for (const k of kunci) {
    const x = A.get(k), y = B.get(k);
    const va = x?.jumlah ?? 0, vb = y?.jumlah ?? 0;
    if (x && y && va === vb) continue;
    const r = (y ?? x)!;
    out.push({ kunci: k, ro: r.ro, akun: r.akun, uraian: r.uraian, a: va, b: vb, d: vb - va, status: x && y ? "berubah" : y ? "baru" : "hilang" });
  }
  return out.sort((u, v) => u.ro.localeCompare(v.ro) || u.akun.localeCompare(v.akun) || u.kunci.localeCompare(v.kunci));
}

// ---------------------------------------------------------------- tab 2: RPD
export type BarisKkVersi = {
  id: number; jadwal_id: number; ro_kode: string; detail_id: number | null; pok_kunci: string | null; akun_menjadi: string | null; uraian_menjadi: string | null;
  jumlah_semula: number | string | null; jumlah_menjadi: number | string | null; selisih: number | string | null; baru: boolean | null;
};
export type PolaJadwal = { pok_kunci: string | null; bulan: number | string; nilai: number | string | null };
export const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Pola per pok_kunci: 12 bobot yang berjumlah 1. Kunci tanpa nilai positif tidak masuk. */
export function polaPerKunci(pola: PolaJadwal[]): Map<string, number[]> {
  const mentah = new Map<string, number[]>();
  for (const p of pola) {
    const bln = Number(p.bulan);
    if (!p.pok_kunci || !Number.isInteger(bln) || bln < 1 || bln > 12) continue;
    const arr = mentah.get(p.pok_kunci) ?? Array(12).fill(0);
    arr[bln - 1] += Math.max(0, num(p.nilai));
    mentah.set(p.pok_kunci, arr);
  }
  const out = new Map<string, number[]>();
  for (const [k, arr] of mentah) { const t = arr.reduce((x, y) => x + y, 0); if (t > 0) out.set(k, arr.map((x) => x / t)); }
  return out;
}

/** Sebar satu jumlah ke 12 bulan menurut bobot; hasil bulat dan berjumlah tepat sama (selisih pembulatan ke bulan terbesar). */
export function sebarBulan(jumlah: number, bobot: number[]): number[] {
  const bulat = bobot.map((w) => Math.round(jumlah * w));
  const sisa = Math.round(jumlah) - bulat.reduce((x, y) => x + y, 0);
  if (sisa !== 0) { let k = 0; bobot.forEach((w, i) => { if (w > bobot[k]) k = i; }); bulat[k] += sisa; }
  return bulat;
}

export type BulanRpd = { bulan: string; no: number; a: number; b: number; d: number; geser: boolean };
export type HasilRpd = {
  bulan: BulanRpd[]; tanpaPola: { n: number; a: number; b: number; d: number }; total: { a: number; b: number; d: number };
  nBerpola: number; nBerubah: number; nBerubahTanpaPola: number; maks: number;
};

/** RPD per bulan. Baris berpola: seluruh jumlah Semula dan Menjadi disebar. Baris tanpa pola: hanya yang berubah dihitung ("belum ada pola"). */
export function hitungRpd(kk: BarisKkVersi[], pola: PolaJadwal[]): HasilRpd {
  const P = polaPerKunci(pola);
  const A = Array(12).fill(0), B = Array(12).fill(0);
  let nBerpola = 0, nBerubah = 0, nTP = 0, ta = 0, tb = 0;
  for (const r of kk) {
    const a = num(r.jumlah_semula), b = num(r.jumlah_menjadi);
    const berubah = a !== b || !!r.baru;
    if (berubah) nBerubah++;
    const w = r.pok_kunci ? P.get(r.pok_kunci) : undefined;
    if (w) {
      nBerpola++;
      sebarBulan(a, w).forEach((v, i) => (A[i] += v));
      sebarBulan(b, w).forEach((v, i) => (B[i] += v));
    } else if (berubah) { nTP++; ta += a; tb += b; }
  }
  const bulan: BulanRpd[] = NAMA_BULAN.map((n, i) => ({ bulan: n, no: i + 1, a: A[i], b: B[i], d: B[i] - A[i], geser: A[i] !== B[i] }));
  const sa = A.reduce((x, y) => x + y, 0) + ta, sb = B.reduce((x, y) => x + y, 0) + tb;
  return {
    bulan, tanpaPola: { n: nTP, a: ta, b: tb, d: tb - ta }, total: { a: sa, b: sb, d: sb - sa },
    nBerpola, nBerubah, nBerubahTanpaPola: nTP, maks: Math.max(1, ...A, ...B),
  };
}

// ---------------------------------------------------------------- tab 3: dampak
export type RealisasiVersi = { detail_id: number | null; real_sd: number | string | null };
export type StatusDampak = "aman" | "bawah" | "belum";
export type BarisDampak = { id: number; kode: string; ro: string; uraian: string; akun: string; menjadi: number; semula: number; realisasi: number | null; ruang: number | null; status: StatusDampak };
export const LABEL_DAMPAK: Record<StatusDampak, string> = { aman: "Aman", bawah: "Di bawah realisasi", belum: "Belum ada realisasi" };
export const WARNA_DAMPAK: Record<StatusDampak, "hijau" | "merah" | "abu"> = { aman: "hijau", bawah: "merah", belum: "abu" };

/** Baris yang berubah (atau baru) pada kertas kerja, dengan ruang = pagu Menjadi - realisasi. Booked belum punya sumber, sehingga tidak dihitung. */
export function hitungDampak(kk: BarisKkVersi[], real: RealisasiVersi[]): { baris: BarisDampak[]; nBawah: number; nBelum: number; nAman: number } {
  const R = new Map<number, number>();
  for (const x of real) if (x.detail_id !== null && x.detail_id !== undefined) R.set(Number(x.detail_id), (R.get(Number(x.detail_id)) ?? 0) + num(x.real_sd));
  const baris: BarisDampak[] = kk
    .filter((r) => num(r.jumlah_semula) !== num(r.jumlah_menjadi) || !!r.baru)
    .map((r) => {
      const menjadi = num(r.jumlah_menjadi);
      const rl = r.detail_id !== null && R.has(Number(r.detail_id)) ? R.get(Number(r.detail_id))! : null;
      const ruang = rl === null ? null : menjadi - rl;
      const status: StatusDampak = rl === null ? "belum" : menjadi < rl ? "bawah" : "aman";
      const kunci = (r.pok_kunci ?? "").split("/");
      return { id: r.id, kode: kunci.length > 2 ? `${kunci[1]}.${kunci[2]}` : "", ro: r.ro_kode, uraian: r.uraian_menjadi ?? "", akun: r.akun_menjadi ?? "", menjadi, semula: num(r.jumlah_semula), realisasi: rl, ruang, status };
    })
    .sort((a, b) => (a.status === "bawah" ? 0 : 1) - (b.status === "bawah" ? 0 : 1) || a.ro.localeCompare(b.ro) || a.id - b.id);
  return { baris, nBawah: baris.filter((x) => x.status === "bawah").length, nBelum: baris.filter((x) => x.status === "belum").length, nAman: baris.filter((x) => x.status === "aman").length };
}
