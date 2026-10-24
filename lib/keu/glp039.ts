// lib/keu/glp039.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- penguraian Excel Laporan Ketersediaan Dana Detail (GLP039) menjadi JSON untuk keu_realisasi_masuk.
// Murni (tanpa pustaka Excel dan tanpa DB): masukan = baris-baris sel (larik of larik, indeks 0 = baris 1 lembar), jadi dapat diuji.
// Dasar: parser acuan claude/referensi/parser-laporan-fa-detail-xlsx.py (diuji pada berkas contoh Kegiatan 2906: 52 item, Rp 395.774.000).
//
// Tata letak: hierarki dibaca dari kolom teks (indeks < 16): Program (GG), Kegiatan (GG.2906), KRO (BMA), RO (BMA.005), Komponen (051),
// Subkomponen (051.AB), Akun (521211), Item ("000252. uraian"). Angka (indeks >= 16) tujuh buah berurutan:
// [pagu, lock pagu, realisasi lalu, realisasi ini, realisasi s.d., persen, sisa]. Identitas: s.d. = lalu + ini; sisa = pagu - lock - s.d.
// Artefak halaman: baris catatan kaki "*Lock Pagu" dan "Hal ..." dilewati; baris sambungan uraian (teks tanpa kode, angka duplikat) digabung ke baris sebelumnya.

export const KOLOM_ANGKA_MULAI = 16;
export const BARIS_JUDUL = 8; // baris 1..8 = judul laporan
const TOLERANSI = 1; // rupiah

export type ItemGlp = {
  nomor_item: string; ro_kode: string; komponen_kode: string; akun_kode: string; uraian: string;
  pagu: number; lock_pagu: number; real_lalu: number; real_ini: number; real_sd: number; sisa: number;
};
export type HasilGlp = {
  ok: boolean;
  item: ItemGlp[];
  total: number[] | null;
  sampaiTanggal: string | null;
  judul: string[];
  galat: string[];
  peringatan: string[];
  ringkas: { nItem: number; nRo: number; pagu: number; lock: number; realisasi: number; sisa: number };
};

const BULAN: Record<string, number> = { januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, agt: 8, sep: 9, okt: 10, nov: 11, des: 12 };
const dua = (n: number) => String(n).padStart(2, "0");

/** Tanggal pertama yang tampak pada judul ("26 Juli 2026", "26/07/2026", "2026-07-26"); null bila tidak ada. Hanya saran: pengguna memeriksa sendiri. */
export function tanggalDariJudul(judul: string[]): string | null {
  for (const t of judul) {
    let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (m) return sahTanggal(+m[1], +m[2], +m[3]);
    m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t);
    if (m) return sahTanggal(+m[3], +m[2], +m[1]);
    m = /(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/.exec(t);
    if (m && BULAN[m[2].toLowerCase()]) return sahTanggal(+m[3], BULAN[m[2].toLowerCase()], +m[1]);
  }
  return null;
}
/** "Periode September 2026" -> hari terakhir bulan itu ("2026-09-30"). Saran bila judul tidak memuat tanggal lengkap; pengguna tetap memeriksa. */
export function akhirPeriodeDariJudul(judul: string[]): string | null {
  for (const t of judul) {
    const m = /Periode\s+([A-Za-z]{3,9})\s+(\d{4})/i.exec(t);
    if (m && BULAN[m[1].toLowerCase()]) {
      const mo = BULAN[m[1].toLowerCase()];
      const y = +m[2];
      return sahTanggal(y, mo, new Date(Date.UTC(y, mo, 0)).getUTCDate());
    }
  }
  return null;
}
function sahTanggal(y: number, mo: number, d: number): string | null {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? `${y}-${dua(mo)}-${dua(d)}` : null;
}

type Tingkat = "total" | "item" | "program" | "kegiatan" | "kro" | "ro" | "komponen" | "subkomp" | "akun";
type Baris = { lvl: Tingkat; kode: string; ura: string; nums: number[]; baris: number };

function tingkatDari(kode: string): Tingkat | null {
  if (/^[A-Z]{2}$/.test(kode)) return "program";
  if (/^[A-Z]{2}\.\d{4}$/.test(kode)) return "kegiatan";
  if (/^[A-Z]{3}$/.test(kode)) return "kro";
  if (/^[A-Z]{3}\.[A-Z0-9]{3}$/.test(kode)) return "ro";
  if (/^\d{3}$/.test(kode)) return "komponen";
  if (/^\d{3}\.\w{2}$/.test(kode)) return "subkomp";
  if (/^\d{6}$/.test(kode)) return "akun";
  return null;
}

const teks = (c: unknown): string => (typeof c === "string" ? c : typeof c === "number" || typeof c === "boolean" ? String(c) : c instanceof Date ? c.toISOString() : String(c ?? "")).trim();
const bulat = (n: number): number => Math.round(n);

export function uraiGlp039(rows: unknown[][]): HasilGlp {
  const judul: string[] = [];
  const galat: string[] = [];
  const peringatan: string[] = [];
  const keluar: Baris[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const n = idx + 1;
    const r = rows[idx] ?? [];
    const sel: [number, unknown][] = [];
    r.forEach((c, i) => { if (c !== null && c !== undefined && teks(c) !== "") sel.push([i, c]); });
    if (sel.length === 0) continue;
    const nums = sel.filter(([i, c]) => i >= KOLOM_ANGKA_MULAI && typeof c === "number" && Number.isFinite(c)).map(([, c]) => c as number);
    const txt = sel.filter(([i, c]) => i < KOLOM_ANGKA_MULAI || typeof c === "string").map(([i, c]) => [i, teks(c)] as [number, string]);
    if (n <= BARIS_JUDUL) { judul.push(txt.map(([, t]) => t).join(" ")); continue; }
    const first = txt[0]?.[1] ?? "";
    if (first.startsWith("*Lock Pagu") || first.startsWith("Hal ")) continue;
    if (first === "JUMLAH SELURUHNYA") { keluar.push({ lvl: "total", kode: "", ura: first, nums, baris: n }); continue; }
    const mi = /^(\d{6})\.\s*(.*)$/.exec(first);
    if (mi) { keluar.push({ lvl: "item", kode: mi[1], ura: mi[2], nums, baris: n }); continue; }
    const lvl = tingkatDari(first);
    if (lvl) { keluar.push({ lvl, kode: first, ura: txt.slice(1).map(([, t]) => t).join(" "), nums, baris: n }); continue; }
    // baris sambungan: teks digabung ke baris sebelumnya, angka diabaikan (duplikat)
    if (keluar.length) keluar[keluar.length - 1].ura += " " + txt.map(([, t]) => t).join(" ");
  }

  // konteks hierarki -> item
  const item: ItemGlp[] = [];
  let keg = "", ro = "", kom = "", akun = "";
  const lihat = new Set<string>();
  const akunJumlah = new Map<string, { baris: number; nums: number[] }>();
  const akunHitung = new Map<string, number[]>();
  let total: number[] | null = null;
  for (const b of keluar) {
    if (b.lvl === "kegiatan") keg = b.kode.split(".")[1];
    else if (b.lvl === "ro") { ro = `${keg}.${b.kode}`; kom = ""; akun = ""; }
    else if (b.lvl === "komponen") { kom = b.kode; akun = ""; }
    else if (b.lvl === "akun") {
      akun = b.kode;
      if (b.nums.length === 7) akunJumlah.set(`${ro}|${kom}|${akun}`, { baris: b.baris, nums: b.nums });
    } else if (b.lvl === "total") total = b.nums.length === 7 ? b.nums : null;
    else if (b.lvl === "item") {
      if (b.nums.length !== 7) { galat.push(`Baris ${b.baris} (item ${b.kode}): harus ada tujuh angka, ditemukan ${b.nums.length}.`); continue; }
      if (!ro || !kom || !akun) { galat.push(`Baris ${b.baris} (item ${b.kode}): RO, komponen, atau akun induknya tidak terbaca.`); continue; }
      if (lihat.has(b.kode)) { galat.push(`Baris ${b.baris}: nomor item ${b.kode} muncul lebih dari sekali.`); continue; }
      lihat.add(b.kode);
      const [pagu, lock, lalu, ini, sd, , sisa] = b.nums.map(bulat);
      if (Math.abs(sd - (lalu + ini)) > TOLERANSI) galat.push(`Item ${b.kode} (baris ${b.baris}): realisasi s.d. ${sd} tidak sama dengan lalu + ini (${lalu + ini}).`);
      if (Math.abs(sisa - (pagu - lock - sd)) > TOLERANSI) galat.push(`Item ${b.kode} (baris ${b.baris}): sisa ${sisa} tidak sama dengan pagu - lock - s.d. (${pagu - lock - sd}).`);
      if ([pagu, lock, lalu, ini, sd].some((x) => x < 0)) galat.push(`Item ${b.kode} (baris ${b.baris}): angka negatif.`);
      item.push({ nomor_item: b.kode, ro_kode: ro, komponen_kode: kom, akun_kode: akun, uraian: b.ura.replace(/\s+/g, " ").trim(), pagu, lock_pagu: lock, real_lalu: lalu, real_ini: ini, real_sd: sd, sisa });
      const k = `${ro}|${kom}|${akun}`;
      const a = akunHitung.get(k) ?? [0, 0, 0, 0, 0, 0, 0];
      [pagu, lock, lalu, ini, sd, 0, sisa].forEach((x, i) => { a[i] += x; });
      akunHitung.set(k, a);
    }
  }

  if (item.length === 0) galat.push("Tidak ada baris item yang terbaca. Pastikan berkas adalah Laporan Ketersediaan Dana Detail (GLP039) dan lembar pertama berisi laporan.");

  // pemeriksaan silang: jumlah item per akun, jumlah item terhadap total laporan
  for (const [k, a] of akunJumlah) {
    const h = akunHitung.get(k);
    if (!h) continue;
    if ([0, 1, 2, 3, 4, 6].some((i) => Math.abs(h[i] - a.nums[i]) > TOLERANSI * 2)) peringatan.push(`Jumlah item pada akun ${k.split("|").join(" / ")} (baris ${a.baris}) berbeda dengan baris akun di laporan.`);
  }
  if (total) {
    const s = [0, 0, 0, 0, 0, 0, 0];
    item.forEach((i) => [i.pagu, i.lock_pagu, i.real_lalu, i.real_ini, i.real_sd, 0, i.sisa].forEach((x, j) => { s[j] += x; }));
    if ([0, 1, 2, 3, 4, 6].some((j) => Math.abs(s[j] - bulat(total![j])) > TOLERANSI * 2)) galat.push(`Jumlah seluruh item (pagu ${s[0]}) tidak sama dengan baris JUMLAH SELURUHNYA (pagu ${bulat(total[0])}). Ada baris yang tidak terbaca.`);
  } else if (item.length > 0) peringatan.push("Baris JUMLAH SELURUHNYA tidak ditemukan; pemeriksaan jumlah total dilewati.");

  const ros = new Set(item.map((i) => i.ro_kode));
  const jumlah = (f: (i: ItemGlp) => number) => item.reduce((a, i) => a + f(i), 0);
  return {
    ok: galat.length === 0 && item.length > 0,
    item, total, sampaiTanggal: tanggalDariJudul(judul) ?? akhirPeriodeDariJudul(judul), judul, galat, peringatan,
    ringkas: { nItem: item.length, nRo: ros.size, pagu: jumlah((i) => i.pagu), lock: jumlah((i) => i.lock_pagu), realisasi: jumlah((i) => i.real_sd), sisa: jumlah((i) => i.sisa) },
  };
}
