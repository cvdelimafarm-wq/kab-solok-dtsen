// lib/keu/pemicu.ts
//
// (25 Okt 2026, tahap 22) Papan 3 mockup "Pemicu dan tingkat pergeseran": tabel pemicu P-01 sampai P-08, tingkat pergeseran 1 sampai 5, dan simulator
// contoh isian yang menghitung tingkat tertinggi lalu menyarankan jenis revisi. Tanpa React/DB. Aturan pemicu sama dengan fungsi basis data
// (keu_kk_pemicu pada 20261024f); aturan tingkat sama dengan papan 3. Contoh adalah ILUSTRASI: memakai kode RO nyata satker tetapi angkanya rekaan.
// Catatan: pada kertas kerja nyata data program tidak tersedia, sehingga sarankanJenis (matriks.ts) tidak membedakan antar-Kegiatan dari antar-Program.

export type KodeJenis = "pok" | "administrasi" | "dipa_djpb" | "dipa_dja";
export type RoMeta = { kode: string; kro: string; keg: string; prog: string };

export type BarisContoh = {
  id: number; ro: string; kom: string; akun: string; akunM: string; uraian: string; uraM: string;
  vol: number; volM: number; harga: number; hargaM: number;
  /** baris baru (belum ada di POK) */ baru?: boolean;
  /** pasangan pindah akun/redaksi: baris lama menunjuk pengganti, pengganti menunjuk baris lama */ pindahKe?: number; pindahDari?: number;
};
export const jum = (r: BarisContoh): number => r.vol * r.harga;
export const jumM = (r: BarisContoh): number => r.volM * r.hargaM;
const sd = (r: BarisContoh): number => jumM(r) - jum(r);

// ---------------------------------------------------------------- pemicu
export const NAMA_PEMICU: Record<string, string> = {
  "P-01": "Angka berubah", "P-02": "Redaksi item diganti", "P-03": "Akun item berubah", "P-04": "Akun ditambah",
  "P-05": "Akun dikurangi", "P-06": "Item ditambah", "P-07": "Item dikurangi", "P-08": "Item diubah (gabungan)",
};
export const KAPAN_PEMICU: Record<string, string> = {
  "P-01": "Volume atau harga satuan berubah, sedangkan uraian dan akun tetap.",
  "P-02": "Uraian item resmi diganti: item lama dikosongkan, lalu item baru dengan redaksi baru dibuat. Penandanya pada pasangan.",
  "P-03": "Item dipindahkan ke akun lain; uraian dan angka tetap. Penandanya pada pasangan.",
  "P-04": "Item baru dibuat pada akun yang belum ada di komponen itu.",
  "P-05": "Item dikosongkan dan tidak ada item lain yang tersisa pada akun itu.",
  "P-06": "Item baru dibuat pada akun yang sudah ada di komponen itu.",
  "P-07": "Item dikosongkan, tetapi akun itu masih punya item lain yang bernilai.",
  "P-08": "Lebih dari satu jenis perubahan pada satu item (angka, redaksi, akun).",
};

const cari = (rows: BarisContoh[], id: number | undefined) => rows.find((r) => r.id === id);
function kodePindah(a: BarisContoh | undefined, b: BarisContoh | undefined): string {
  if (!a || !b) return "P-03";
  let beda = 0, k = "P-03";
  if (!(Math.abs(b.volM + a.volM - a.vol) < 0.001 && b.hargaM === a.harga)) { beda++; k = "P-01"; }
  if (b.uraM !== a.uraian) { beda++; k = "P-02"; }
  if (a.akun !== b.akunM) { beda++; k = "P-03"; }
  return beda <= 1 ? k : "P-08";
}
/** Pemicu satu baris; kosong bila tidak berubah. Sama dengan fungsi basis data. */
export function pemicuBaris(rows: BarisContoh[], r: BarisContoh): string {
  if (r.pindahKe !== undefined) return kodePindah(r, cari(rows, r.pindahKe));
  if (r.pindahDari !== undefined) return kodePindah(cari(rows, r.pindahDari), r);
  if (r.baru) return rows.some((x) => !x.baru && x.ro === r.ro && x.kom === r.kom && x.akun === r.akunM) ? "P-06" : "P-04";
  if (jumM(r) === 0 && jum(r) > 0) {
    const sisa = rows.some((x) => x !== r && !x.baru && x.ro === r.ro && x.kom === r.kom && x.akun === r.akun && jumM(x) > 0);
    return sisa ? "P-07" : "P-05";
  }
  let n = 0, k = "";
  if (r.volM !== r.vol || r.hargaM !== r.harga) { n++; k = "P-01"; }
  if (r.uraM !== r.uraian) { n++; k = "P-02"; }
  if (r.akunM !== r.akun) { n++; k = "P-03"; }
  return n === 0 ? "" : n === 1 ? k : "P-08";
}

// ---------------------------------------------------------------- tingkat
export const TINGKAT = ["Tidak ada pergeseran", "Dalam satu RO", "Antar-RO dalam satu KRO", "Antar-KRO dalam satu Kegiatan", "Antar-Kegiatan", "Antar-Program"] as const;
export const JALUR_TINGKAT = [
  "-", "Revisi POK (wewenang KPA)", "Revisi POK (wewenang KPA)", "Revisi DIPA jalur DJPb", "Revisi DIPA jalur DJPb dengan surat persetujuan pejabat Eselon I", "Revisi DIPA jalur DJA",
] as const;

const terdampak = (rows: BarisContoh[]) => rows.filter((r) => sd(r) !== 0 || r.akunM !== r.akun || r.uraM !== r.uraian);
export function tingkatDari(rows: BarisContoh[], meta: Record<string, RoMeta>): 0 | 1 | 2 | 3 | 4 | 5 {
  const rs = terdampak(rows).filter((r) => sd(r) !== 0 || r.akunM !== r.akun);
  if (!rs.length) return 0;
  const u = (f: (m: RoMeta) => string) => new Set(rs.map((r) => f(meta[r.ro]))).size;
  if (u((m) => m.kode) === 1) return 1;
  if (u((m) => `${m.keg}/${m.kro}`) === 1) return 2;
  if (u((m) => m.keg) === 1) return 3;
  if (u((m) => m.prog) === 1) return 4;
  return 5;
}
/**
 * Dana melintasi jenis belanja (dua digit pertama akun) bila lebih dari satu jenis berubah netto, atau ada pasangan pindah antar-jenis.
 * `baris` = baris berubah pada pasangan (RO, jenis belanja) yang nettonya tidak nol; baris pada pasangan bernetto nol tetap jalur POK.
 */
export function lintasJenis(rows: BarisContoh[]): { ya: boolean; baris: BarisContoh[] } {
  const net: Record<string, number> = {}, perRoJenis: Record<string, number> = {};
  for (const r of rows) {
    net[r.akun.slice(0, 2)] = (net[r.akun.slice(0, 2)] ?? 0) - jum(r); net[r.akunM.slice(0, 2)] = (net[r.akunM.slice(0, 2)] ?? 0) + jumM(r);
    const k1 = `${r.ro}|${r.akun.slice(0, 2)}`, k2 = `${r.ro}|${r.akunM.slice(0, 2)}`;
    perRoJenis[k1] = (perRoJenis[k1] ?? 0) - jum(r); perRoJenis[k2] = (perRoJenis[k2] ?? 0) + jumM(r);
  }
  const nz = Object.keys(net).filter((k) => Math.round(net[k]) !== 0);
  const pasanganLintas = rows.filter((r) => { const a = cari(rows, r.pindahDari); return !!a && a.akun.slice(0, 2) !== r.akunM.slice(0, 2); });
  const ya = nz.length > 1 || pasanganLintas.length > 0;
  const baris = ya ? terdampak(rows).filter((r) => Math.round(perRoJenis[`${r.ro}|${r.akun.slice(0, 2)}`] ?? 0) !== 0 || Math.round(perRoJenis[`${r.ro}|${r.akunM.slice(0, 2)}`] ?? 0) !== 0) : [];
  return { ya, baris };
}

export const NAMA_JENIS: Record<KodeJenis, string> = { pok: "Revisi POK", administrasi: "Revisi Administrasi", dipa_djpb: "Revisi DIPA jalur DJPb", dipa_dja: "Revisi DIPA jalur DJA" };
export const KODE_TENGGAT: Record<KodeJenis, string> = { pok: "tenggat_pok", administrasi: "tenggat_pok", dipa_djpb: "tenggat_dipa_djpb", dipa_dja: "tenggat_dipa_dja" };

export type Saran = {
  jenis: KodeJenis | null; tingkat: 0 | 1 | 2 | 3 | 4 | 5; tingkatNama: string; alasan: string[]; penaik: number[]; pokSaja: number[]; lampiran: string[]; campuran: boolean;
};
/** Baris berubah pada kelompok (KRO, Kegiatan, atau Program) yang jumlahnya berubah netto: dana benar-benar melintasi batas kelompok itu. */
const barisNetto = (rows: BarisContoh[], meta: Record<string, RoMeta>, kunci: (m: RoMeta) => string): number[] => {
  const net: Record<string, number> = {};
  for (const r of rows) { const k = kunci(meta[r.ro]); net[k] = (net[k] ?? 0) + sd(r); }
  return rows.filter((r) => (sd(r) !== 0 || r.akunM !== r.akun) && Math.round(net[kunci(meta[r.ro])]) !== 0).map((r) => r.id);
};

/** Saran jenis revisi. Hanya saran: operator boleh memilih lain dan sistem hanya menandai. */
export function saranDari(rows: BarisContoh[], meta: Record<string, RoMeta>): Saran {
  const total = rows.reduce((a, r) => a + sd(r), 0);
  const tg = tingkatDari(rows, meta);
  const lj = lintasJenis(rows);
  const alasan: string[] = [], lampiran: string[] = [];
  let penaik: number[] = [];
  if (terdampak(rows).length === 0) return { jenis: null, tingkat: 0, tingkatNama: TINGKAT[0], alasan: ["Belum ada perubahan pada kolom Menjadi."], penaik: [], pokSaja: [], lampiran: [], campuran: false };
  let jenis: KodeJenis = "pok";
  if (total !== 0) {
    jenis = "dipa_dja"; alasan.push(`Pagu Satker berubah ${total > 0 ? "+" : "-"}${Math.abs(total).toLocaleString("id-ID")} (Pasal 120 ayat 2; Pasal 165). Revisi POK tidak sesuai (R-01).`);
    penaik = rows.filter((r) => sd(r) !== 0).map((r) => r.id);
  } else if (tg === 5) {
    jenis = "dipa_dja"; alasan.push("Pergeseran antar-Program (Lampiran IV.C angka 2.b dan 2.c). Bila hanya untuk kekurangan Belanja Operasional, jalurnya DJPb (Pasal 174 ayat 1 huruf a angka 1).");
    penaik = barisNetto(rows, meta, (m) => m.prog);
  } else if (lj.ya) {
    jenis = "dipa_djpb"; alasan.push("Antar-jenis belanja (dua digit pertama akun berbeda), volume RO tidak turun (Lampiran IV.C angka 2.q). Bila volume RO turun, jalur DJA (2.q dan 2.u).");
    for (const r of lj.baris) { penaik.push(r.id); if (r.pindahDari !== undefined) penaik.push(r.pindahDari); if (r.pindahKe !== undefined) penaik.push(r.pindahKe); }
  } else if (tg === 4) {
    jenis = "dipa_djpb"; alasan.push("Antar-Kegiatan: Revisi DIPA jalur DJPb dengan surat persetujuan pejabat Eselon I (Pasal 172 ayat 1 huruf a angka 2)."); lampiran.push("Surat persetujuan pejabat Eselon I");
    penaik = barisNetto(rows, meta, (m) => m.keg);
  } else if (tg === 3) {
    jenis = "dipa_djpb"; alasan.push("Antar-KRO dalam satu Kegiatan: jalur DJPb (Lampiran IV.C; Pasal 124 ayat 2 huruf b).");
    penaik = barisNetto(rows, meta, (m) => m.kro);
  } else {
    const hanyaRedaksi = terdampak(rows).every((r) => pemicuBaris(rows, r) === "P-02");
    if (hanyaRedaksi) alasan.push("Hanya redaksi item yang berubah (P-02): item lama dikosongkan dan item baru dibuat pada akun yang sama. Disarankan Revisi POK; bila hanya ralat atau rumusan non-anggaran, PPK dapat menetapkan Revisi Administrasi (Pasal 120 ayat 4).");
    else if (tg === 1) alasan.push("Pergeseran dalam satu RO tanpa mengubah sumber dana, pagu Satker, volume RO, dan jenis belanja: wewenang KPA (Pasal 173; Lampiran IV.C angka 5).");
    else if (tg === 2) alasan.push("Pergeseran antar-RO dalam satu KRO dan satu Kegiatan tanpa mengubah pagu Satker, volume RO, sumber dana, dan jenis belanja: wewenang KPA (Pasal 173 ayat 1 dan 3).");
  }
  const naik = new Set(penaik);
  const pokSaja = rows.filter((r) => (sd(r) !== 0 || r.akunM !== r.akun) && !naik.has(r.id)).map((r) => r.id);
  return { jenis, tingkat: tg, tingkatNama: TINGKAT[tg], alasan, penaik: [...naik], pokSaja, lampiran, campuran: jenis !== "pok" && naik.size > 0 && pokSaja.length > 0 };
}

// ---------------------------------------------------------------- contoh (ILUSTRASI)
export const META_CONTOH: Record<string, RoMeta> = {
  "2906.BMA.005": { kode: "2906.BMA.005", kro: "2906.BMA", keg: "2906", prog: "GG" },
  "2906.BMA.006": { kode: "2906.BMA.006", kro: "2906.BMA", keg: "2906", prog: "GG" },
  "2906.CAN.001": { kode: "2906.CAN.001", kro: "2906.CAN", keg: "2906", prog: "GG" },
  "2907.BMA.006": { kode: "2907.BMA.006", kro: "2907.BMA", keg: "2907", prog: "GG" },
  "2886.EBA.994": { kode: "2886.EBA.994", kro: "2886.EBA", keg: "2886", prog: "WA" },
};

let nomor = 0;
const b = (ro: string, akun: string, uraian: string, vol: number, harga: number, p: Partial<BarisContoh> = {}): BarisContoh =>
  ({ id: ++nomor, ro, kom: "052", akun, akunM: akun, uraian, uraM: uraian, vol, volM: vol, harga, hargaM: harga, ...p });

export type Skenario = { kode: string; nama: string; ket: string; rows: BarisContoh[] };
function bangun(): Skenario[] {
  const out: Skenario[] = [];
  const mk = (kode: string, nama: string, ket: string, f: () => BarisContoh[]) => { nomor = 0; out.push({ kode, nama, ket, rows: f() }); };
  mk("T00", "Dalam satu RO", "Volume konsumsi turun, volume transport naik di RO yang sama dan akun sejenis.", () => [
    b("2906.BMA.005", "521211", "Konsumsi rapat", 100, 50_000, { volM: 80 }),
    b("2906.BMA.005", "521211", "Konsumsi lapangan", 50, 40_000, { volM: 75 }),
  ]);
  mk("T01", "Antar-RO dalam KRO", "Dana 4 juta pindah dari RO 005 ke RO 006, KRO dan akun sejenis sama.", () => [
    b("2906.BMA.005", "521211", "Konsumsi rapat", 100, 50_000, { volM: 20 }),
    b("2906.BMA.006", "521211", "Konsumsi rapat", 50, 50_000, { volM: 130 }),
  ]);
  mk("T02", "Antar-KRO dalam Kegiatan", "Dana pindah dari KRO BMA ke KRO CAN pada Kegiatan 2906.", () => [
    b("2906.BMA.005", "521211", "Konsumsi rapat", 100, 50_000, { volM: 60 }),
    b("2906.CAN.001", "521211", "Konsumsi rapat", 40, 50_000, { volM: 80 }),
  ]);
  mk("T03", "Antar-Kegiatan", "Dana pindah dari Kegiatan 2906 ke Kegiatan 2907, satu Program.", () => [
    b("2906.BMA.005", "521211", "Konsumsi rapat", 100, 50_000, { volM: 60 }),
    b("2907.BMA.006", "521211", "Konsumsi rapat", 40, 50_000, { volM: 80 }),
  ]);
  mk("T05b", "Antar-Program", "Dana pindah dari Program GG ke Program WA.", () => [
    b("2906.BMA.005", "521211", "Konsumsi rapat", 100, 50_000, { volM: 60 }),
    b("2886.EBA.994", "521211", "Konsumsi rapat", 40, 50_000, { volM: 80 }),
  ]);
  mk("T04", "Lintas jenis belanja", "Dana akun 52 (barang) pindah ke akun 53 (modal) dalam satu RO.", () => [
    b("2906.BMA.005", "521211", "Konsumsi rapat", 100, 50_000, { volM: 40 }),
    b("2906.BMA.005", "532111", "Peralatan survei", 4, 1_000_000, { hargaM: 1_750_000 }),
  ]);
  mk("T06", "Pagu Satker naik", "Harga satuan naik tanpa sumber dana lain: pagu Satker bertambah.", () => [
    b("2906.BMA.005", "521211", "Konsumsi rapat", 100, 50_000, { hargaM: 60_000 }),
  ]);
  mk("T07", "Campuran POK + DJPb", "Satu geseran dalam KRO (jalur POK) dan satu geseran antar-jenis belanja (jalur DJPb).", () => [
    b("2906.BMA.005", "521211", "Konsumsi rapat", 100, 50_000, { volM: 80 }),
    b("2906.BMA.005", "521211", "Konsumsi lapangan", 50, 40_000, { volM: 75 }),
    b("2906.BMA.006", "524113", "Transport lokal", 100, 100_000, { volM: 90 }),
    b("2906.BMA.006", "532111", "Peralatan survei", 2, 500_000, { hargaM: 1_000_000 }),
  ]);
  mk("T15", "Redaksi saja", "Uraian diganti, angka dan akun tetap: item lama dikosongkan, item baru dengan redaksi baru dibuat.", () => {
    const lama = b("2906.BMA.005", "521211", "Konsumsi rapat DTSEN", 100, 50_000, { volM: 0, pindahKe: 2 });
    const baru = b("2906.BMA.005", "521211", "Konsumsi rapat koordinasi DTSEN", 0, 50_000, { volM: 100, baru: true, pindahDari: 1, uraM: "Konsumsi rapat koordinasi DTSEN" });
    return [lama, baru];
  });
  return out;
}
export const SKENARIO: Skenario[] = bangun();

// ---------------------------------------------------------------- tabel pemicu (contoh ilustrasi)
export type BarisPemicu = { kode: string; nama: string; kapan: string; contoh: string; semula: number; menjadi: number };
export function tabelPemicu(): BarisPemicu[] {
  const contoh = (kode: string, contohTeks: string, semula: number, menjadi: number): BarisPemicu => ({ kode, nama: NAMA_PEMICU[kode], kapan: KAPAN_PEMICU[kode], contoh: contohTeks, semula, menjadi });
  return [
    contoh("P-01", "521211 Konsumsi rapat: volume 100 menjadi 80 OH", 5_000_000, 4_000_000),
    contoh("P-02", "521211 Konsumsi rapat DTSEN diganti redaksi menjadi Konsumsi rapat koordinasi DTSEN", 5_000_000, 5_000_000),
    contoh("P-03", "Transport lokal dipindah dari akun 524113 ke akun 524114", 3_000_000, 3_000_000),
    contoh("P-04", "Akun 521213 belum ada di komponen 052: item Honor narasumber dibuat", 0, 1_500_000),
    contoh("P-05", "Satu-satunya item akun 521811 (Pengadaan ATK) dikosongkan", 1_084_000, 0),
    contoh("P-06", "Akun 521211 sudah ada: item Konsumsi lapangan ditambahkan", 0, 2_000_000),
    contoh("P-07", "Akun 521211 punya dua item; Konsumsi lapangan dikosongkan, Konsumsi rapat masih ada", 2_000_000, 0),
    contoh("P-08", "Item dipindah ke akun lain dan volumenya ikut berubah", 5_000_000, 4_200_000),
  ];
}
export const selisihPemicu = (x: { semula: number; menjadi: number }) => x.menjadi - x.semula;
