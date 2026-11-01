// lib/vanguard/kuesioner/templat.ts  (murni, HANYA server/tes: templat memuat rumus kunci)
//
// (1 Nov 2026) VANGUARD V7a: mesin angka acak untuk kasus K. Satu templat = cerita + catatan dengan penampung {nama}, parameter (tiap parameter punya >= 5 pilihan angka
// dan satu nilai "baku" = angka kasus aslinya), variabel turunan, dan kunci berupa rumus. Satu BENIH (bilangan bulat) menetapkan semua angka secara deterministik:
// benih 0 = angka baku (kasus asli); benih >= 1 = pilihan acak yang diulang sama persis untuk benih yang sama. Cerita DAN kunci dibangun di server dari benih,
// jadi kunci tidak pernah sampai ke perangkat petugas dan hasil bisa diulang untuk pembahasan.
//
// Rumus: + - * / ( ), angka, nama variabel, bulat(x) (setengah ke atas), bulat2(x) (2 desimal), min(a,b), max(a,b).
// Penampung teks: {nama} angka (koma desimal, titik ribuan); {nama:rp} "Rp25.000"; {nama:d2} dua desimal tetap "2,00".

export type ParameterT = { baku: number; pilihan: number[] };
export type KunciT = { r: number; art?: number; k1?: number | string; k2?: number | string; k3?: number | string; k4?: number | string; sumber?: number; nama?: string; satuan?: string };
export type TemplatK = {
  kode: string; level: "K"; judul: string;
  parameter: Record<string, ParameterT>;
  turunan: Record<string, string>;
  cerita: string; catatan: string[]; info: string[];
  kunci: KunciT[];
  jebakan: { r: number; k: string; m: string }[];
  petunjuk: string[]; pembahasan: string; rujukan: string;
};
export type SoalK = {
  kode: string; level: "K"; judul: string; benih: number; nilai: Record<string, number>;
  cerita: string; catatan: string[]; info: string[];
  kunci: { r: number; art?: number; k1?: number; k2?: number; k3?: number; k4?: number; sumber?: number; nama?: string; satuan?: string }[];
  jebakan: { r: number; k: string; m: string }[]; petunjuk: string[]; pembahasan: string; rujukan: string;
};

export const MIN_PILIHAN = 5;
export const MAKS_BENIH = 2_000_000_000;

/** Generator acak deterministik (mulberry32). */
export function acak(benih: number): () => number {
  let a = (benih >>> 0) || 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bulat = (x: number) => Math.round(x + Number.EPSILON);
const bulat2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Penghitung rumus sederhana (tanpa eval). */
export function hitungRumus(rumus: string, v: Record<string, number>): number {
  const s = rumus.replace(/\s+/g, "");
  let i = 0;
  const galat = (m: string): never => { throw new Error(`Rumus "${rumus}": ${m}`); };
  const FUNGSI: Record<string, (a: number[]) => number> = {
    bulat: (a) => bulat(a[0]), bulat2: (a) => bulat2(a[0]), min: (a) => Math.min(...a), max: (a) => Math.max(...a),
  };
  function ekspresi(): number {
    let h = suku();
    while (s[i] === "+" || s[i] === "-") { const op = s[i++]; const k = suku(); h = op === "+" ? h + k : h - k; }
    return h;
  }
  function suku(): number {
    let h = faktor();
    while (s[i] === "*" || s[i] === "/") { const op = s[i++]; const k = faktor(); h = op === "*" ? h * k : h / k; }
    return h;
  }
  function faktor(): number {
    if (s[i] === "-") { i++; return -faktor(); }
    if (s[i] === "(") { i++; const h = ekspresi(); if (s[i++] !== ")") galat("kurung tidak ditutup"); return h; }
    const angka = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (angka) { i += angka[0].length; return Number(angka[0]); }
    const nama = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (!nama) return galat(`karakter tak dikenal di posisi ${i}`);
    i += nama[0].length;
    if (s[i] === "(") {
      const f = FUNGSI[nama[0]]; if (!f) galat(`fungsi ${nama[0]} tidak dikenal`);
      i++; const arg: number[] = [];
      if (s[i] !== ")") { arg.push(ekspresi()); while (s[i] === ",") { i++; arg.push(ekspresi()); } }
      if (s[i++] !== ")") galat("kurung fungsi tidak ditutup");
      return f(arg);
    }
    if (!(nama[0] in v)) galat(`variabel ${nama[0]} tidak ada`);
    return v[nama[0]];
  }
  const hasil = ekspresi();
  if (i !== s.length) galat(`sisa tak terbaca di posisi ${i}`);
  return hasil;
}

const fmtAngka = (x: number) => x.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const fmtD2 = (x: number) => x.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Mengisi penampung {nama} dan {nama:rp}. Penampung tak dikenal = galat (templat salah ketik tertangkap tes). */
export function isiTeks(teks: string, v: Record<string, number>): string {
  return teks.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(?::(rp|d2))?\}/g, (_m, nama: string, f?: string) => {
    if (!(nama in v)) throw new Error(`Penampung {${nama}} tidak punya nilai`);
    return f === "rp" ? `Rp${fmtAngka(v[nama])}` : f === "d2" ? fmtD2(v[nama]) : fmtAngka(v[nama]);
  });
}

/** Menetapkan nilai semua parameter dari benih lalu menurunkan variabel turunan (berurutan). */
export function tetapkanNilai(t: Pick<TemplatK, "parameter" | "turunan">, benih: number): Record<string, number> {
  const v: Record<string, number> = {};
  const r = acak(benih);
  for (const nama of Object.keys(t.parameter)) {
    const p = t.parameter[nama];
    v[nama] = benih === 0 ? p.baku : p.pilihan[Math.floor(r() * p.pilihan.length)];
  }
  for (const [nama, rumus] of Object.entries(t.turunan)) v[nama] = hitungRumus(rumus, v);
  return v;
}

const angkaKunci = (x: number | string | undefined, v: Record<string, number>): number | undefined => (x === undefined ? undefined : typeof x === "number" ? x : hitungRumus(x, v));

export function susunSoalK(t: TemplatK, benih: number): SoalK {
  const nilai = tetapkanNilai(t, benih);
  const teks = (s: string) => isiTeks(s, nilai);
  const kunci = t.kunci.map((k) => {
    const o: SoalK["kunci"][number] = { r: k.r };
    if (k.art !== undefined) o.art = k.art;
    for (const f of ["k1", "k2", "k3", "k4"] as const) { const x = angkaKunci(k[f], nilai); if (x !== undefined) o[f] = x; }
    if (k.sumber !== undefined) o.sumber = k.sumber;
    if (k.nama !== undefined) o.nama = k.nama;
    if (k.satuan !== undefined) o.satuan = k.satuan;
    return o;
  });
  return {
    kode: t.kode, level: t.level, judul: t.judul, benih, nilai, cerita: teks(t.cerita), catatan: t.catatan.map(teks), info: t.info.map(teks), kunci,
    jebakan: t.jebakan.map((j) => ({ ...j, m: teks(j.m) })), petunjuk: t.petunjuk.map(teks), pembahasan: teks(t.pembahasan), rujukan: t.rujukan,
  };
}

/** Benih acak baru untuk soal baru (1..MAKS_BENIH). */
export const benihBaru = (): number => 1 + Math.floor(Math.random() * (MAKS_BENIH - 1));
/** Benih dari klien: bilangan bulat 0..MAKS_BENIH, selain itu null. */
export const bacaBenih = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= MAKS_BENIH ? x : null);
