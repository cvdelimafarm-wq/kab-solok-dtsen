// lib/keu/pembayaran.ts
//
// (7 Nov 2026, langkah 3 rancangan "Kebutuhan, neraca RO, revisi") Catatan pembayaran PJ Administrasi: penutupan baris RAB, pengaruhnya pada Kebutuhan butir,
// antrean "jatuh tempo belum dicatat", dan pemeriksaan isian. MURNI (tanpa React dan basis data). Tabel: keu_pembayaran (skema-sql/20261107d_catat_pembayaran.sql).
//
// Aturan (disepakati Iqbal 7 Nov 2026: sementara dicatat manual di SIGAP; tautan Drive untuk bukti dukung/penatausahaan SPJ; pencocokan dengan SAKTI menyusul):
//   - Pembayaran resmi tetap lewat SAKTI. Catatan SIGAP berstatus "dicatat" (belum tampak di realisasi SAKTI) tetap dihitung sebagai kebutuhan agar tidak ada
//     kekurangan hitung; berstatus "tercermin" berarti sudah ada di Realisasi SAKTI, jadi tidak dihitung lagi (menghindari hitung ganda).
//   - Kebutuhan butir = Realisasi SAKTI + catatan belum tercermin + RAB sisa.
//   - RAB sisa butir = RAB butir dikurangi bagian yang sudah tertutup:
//       baris tertutup (ada catatan aktif ber-menutup, termasuk jenis "batal")      -> seluruh jumlah baris keluar dari RAB sisa;
//       baris terbuka dengan pembayaran sebagian (cicilan)                           -> jumlah yang sudah dibayar keluar dari RAB sisa;
//       pembayaran yang barisnya sudah tidak ada pada RAB yang tampil (RAB direvisi) -> jumlahnya mengurangi RAB sisa butir itu (tanpa menutup baris).
//   - Catatan yang dibatalkan tidak dihitung sama sekali.
//   - Jatuh tempo baris = jumlah jadwal cair yang minggunya sudah lewat, dikurangi yang sudah dibayar; baris yang sudah tertutup tidak pernah jatuh tempo.
//   - Item baru di RAB (belum ada di POK) tidak dapat dibayar; basis data menolaknya.

export type JenisBayar = "bayar" | "batal";
export type StatusBayar = "dicatat" | "tercermin";
export const LABEL_STATUS_BAYAR: Record<StatusBayar, string> = { dicatat: "Dicatat, belum tampak di SAKTI", tercermin: "Tercermin di SAKTI" };
export const LABEL_JENIS_BAYAR: Record<JenisBayar, string> = { bayar: "Dibayar", batal: "Tidak jadi dibayar" };

type Angka = number | string | null | undefined;
const num = (v: Angka): number => { const n = typeof v === "string" ? Number(v) : (v as number); return Number.isFinite(n) ? n : 0; };

/** Satu baris keu_pembayaran (kolom yang dipakai). */
export type BarisBayar = {
  id: number | string; rab_id: number | string; rab_item_id: number | string; rab_baris_id: number | string | null; pok_kunci: string;
  jenis: string; tanggal: string; jumlah: Angka; menutup: boolean; status: string; nomor_ref?: string | null; tautan?: string | null; catatan?: string | null;
  dibatalkan_at?: string | null; alasan_batal?: string | null; dicatat_oleh?: number | string | null; tercermin_at?: string | null;
};
/** Satu baris keu_v_rab_baris (kolom yang dipakai). pok_kunci kosong = item baru di RAB. */
export type BarisRabLepas = { baris_id: number | string; item_id: number | string; pok_kunci: string | null; ket?: string | null; jumlah: Angka; rab_id?: number | string };
/** Satu baris keu_v_rab_jadwal_item (kolom yang dipakai). */
export type JadwalRabLepas = { baris_id: number | string; bulan: number | string; minggu: number | string; nilai: Angka };

export const aktif = (b: Pick<BarisBayar, "dibatalkan_at">): boolean => !b.dibatalkan_at;

/** Tanggal hari ini menurut WIB, "YYYY-MM-DD". */
export const hariIniWib = (d: Date = new Date()): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export type PengaruhBayar = { tutup: number; dicatat: number };

/** Pengaruh catatan pembayaran aktif pada tiap butir POK (kunci = pok_kunci): jumlah RAB yang tertutup dan jumlah catatan belum tercermin. */
export function hitungPengaruh(baris: readonly BarisRabLepas[], bayar: readonly BarisBayar[]): Map<string, PengaruhBayar> {
  const hasil = new Map<string, PengaruhBayar>();
  const ambil = (k: string): PengaruhBayar => { let p = hasil.get(k); if (!p) { p = { tutup: 0, dicatat: 0 }; hasil.set(k, p); } return p; };
  const petaBaris = new Map<number, BarisRabLepas>(baris.map((b) => [Number(b.baris_id), b]));
  const dibayarBaris = new Map<number, number>();
  const tertutup = new Set<number>();
  for (const b of bayar) {
    if (!aktif(b) || !b.pok_kunci) continue;
    const j = b.jenis === "bayar" ? num(b.jumlah) : 0;
    if (b.jenis === "bayar" && b.status === "dicatat") ambil(b.pok_kunci).dicatat += j;
    const id = b.rab_baris_id === null || b.rab_baris_id === undefined ? null : Number(b.rab_baris_id);
    const br = id !== null ? petaBaris.get(id) : undefined;
    if (br && br.pok_kunci) {
      dibayarBaris.set(id as number, (dibayarBaris.get(id as number) ?? 0) + j);
      if (b.menutup) tertutup.add(id as number);
    } else if (j > 0) {
      ambil(b.pok_kunci).tutup += j; // barisnya tidak ada lagi: kurangi RAB butir sebesar yang sudah dibayar
    }
  }
  for (const [id, br] of petaBaris) {
    if (!br.pok_kunci) continue;
    const jml = num(br.jumlah);
    const sudah = tertutup.has(id) ? jml : Math.min(dibayarBaris.get(id) ?? 0, jml);
    if (sudah > 0) ambil(br.pok_kunci).tutup += sudah;
  }
  return hasil;
}

/** Sisa RAB satu baris: 0 bila tertutup, selain itu jumlah dikurangi yang sudah dibayar (tidak kurang dari 0). */
export function sisaBaris(jumlahBaris: Angka, bayarBaris: readonly Pick<BarisBayar, "jenis" | "jumlah" | "menutup" | "dibatalkan_at">[]): number {
  const a = bayarBaris.filter(aktif);
  if (a.some((b) => b.menutup)) return 0;
  const dibayar = a.reduce((s, b) => s + (b.jenis === "bayar" ? num(b.jumlah) : 0), 0);
  return Math.max(0, num(jumlahBaris) - dibayar);
}

// ---------------------------------------------------------------- jatuh tempo
const TGL = /^(\d{4})-(\d{2})-(\d{2})$/;
const dua = (n: number) => String(n).padStart(2, "0");

/** Hari terakhir minggu pencairan: minggu 1-3 berakhir tanggal 7, 14, 21; minggu 4 berakhir di akhir bulan. */
export function akhirMinggu(tahun: number, bulan: number, minggu: number): string {
  const hari = minggu >= 4 ? new Date(Date.UTC(tahun, bulan, 0)).getUTCDate() : Math.max(1, minggu) * 7;
  return `${String(tahun).padStart(4, "0")}-${dua(bulan)}-${dua(hari)}`;
}

/** Selisih hari b - a untuk tanggal "YYYY-MM-DD" (tidak sah -> 0). */
export function selisihHariTgl(a: string, b: string): number {
  const x = TGL.exec(a); const y = TGL.exec(b);
  if (!x || !y) return 0;
  return Math.round((Date.UTC(+y[1], +y[2] - 1, +y[3]) - Date.UTC(+x[1], +x[2] - 1, +x[3])) / 86400000);
}

export type JatuhTempo = { baris_id: number; item_id: number; pok_kunci: string; ket: string; jumlahBaris: number; sisa: number; tunggak: number; tertua: string; hari: number };

/**
 * Baris RAB yang seharusnya sudah cair tetapi belum dicatat. `selesai` = item RAB yang ditandai Selesai (tidak diusulkan lagi; dilewati).
 * Urut: paling lama menunggak dulu, lalu jumlah terbesar.
 */
export function antreanJatuhTempo(
  baris: readonly BarisRabLepas[], jadwal: readonly JadwalRabLepas[], bayar: readonly BarisBayar[], hariIni: string, tahun: number, selesai: ReadonlySet<number> = new Set(),
): JatuhTempo[] {
  const jadwalPer = new Map<number, JadwalRabLepas[]>();
  for (const j of jadwal) { const id = Number(j.baris_id); const l = jadwalPer.get(id) ?? []; l.push(j); jadwalPer.set(id, l); }
  const bayarPer = new Map<number, BarisBayar[]>();
  for (const b of bayar) { if (b.rab_baris_id === null || b.rab_baris_id === undefined) continue; const id = Number(b.rab_baris_id); const l = bayarPer.get(id) ?? []; l.push(b); bayarPer.set(id, l); }
  const hasil: JatuhTempo[] = [];
  for (const br of baris) {
    if (!br.pok_kunci || selesai.has(Number(br.item_id))) continue;
    const id = Number(br.baris_id);
    const bp = bayarPer.get(id) ?? [];
    const sisa = sisaBaris(br.jumlah, bp);
    if (sisa <= 0) continue;
    let tempo = 0; let tertua = "";
    for (const j of jadwalPer.get(id) ?? []) {
      const akhir = akhirMinggu(tahun, Number(j.bulan), Number(j.minggu));
      if (akhir < hariIni) { tempo += num(j.nilai); if (!tertua || akhir < tertua) tertua = akhir; }
    }
    if (tempo <= 0) continue;
    const dibayar = bp.filter(aktif).reduce((s, b) => s + (b.jenis === "bayar" ? num(b.jumlah) : 0), 0);
    const tunggak = Math.min(sisa, Math.max(0, tempo - dibayar));
    if (tunggak <= 0) continue;
    hasil.push({ baris_id: id, item_id: Number(br.item_id), pok_kunci: br.pok_kunci, ket: br.ket ?? "", jumlahBaris: num(br.jumlah), sisa, tunggak, tertua, hari: Math.max(0, selisihHariTgl(tertua, hariIni)) });
  }
  return hasil.sort((a, b) => b.hari - a.hari || b.tunggak - a.tunggak || a.baris_id - b.baris_id);
}

export type RingkasBayar = { nTunggak: number; jumlahTunggak: number; nBelumTercermin: number; jumlahBelumTercermin: number; nTanpaBukti: number; nDibatalkan: number; nAktif: number };
export function ringkasBayar(bayar: readonly BarisBayar[], antrean: readonly JatuhTempo[]): RingkasBayar {
  const a = bayar.filter(aktif);
  const bs = a.filter((b) => b.jenis === "bayar");
  const bt = bs.filter((b) => b.status === "dicatat");
  return {
    nTunggak: antrean.length, jumlahTunggak: antrean.reduce((s, t) => s + t.tunggak, 0),
    nBelumTercermin: bt.length, jumlahBelumTercermin: bt.reduce((s, b) => s + num(b.jumlah), 0),
    nTanpaBukti: bs.filter((b) => !(b.tautan ?? "").trim()).length, nDibatalkan: bayar.length - a.length, nAktif: a.length,
  };
}

// ---------------------------------------------------------------- isian
export const MAKS_REF = 100;
export const MAKS_TAUTAN = 500;
export const MAKS_CATATAN = 500;
export const MIN_ALASAN = 5;

/** Pesan galat tautan, atau null bila kosong (boleh) atau sah (http/https tanpa spasi). */
export function periksaTautan(t: string | null | undefined): string | null {
  const s = (t ?? "").trim();
  if (!s) return null;
  if (s.length > MAKS_TAUTAN) return `Tautan terlalu panjang (maks ${MAKS_TAUTAN} karakter).`;
  if (!/^https?:\/\/[^\s]+$/i.test(s)) return "Tautan harus diawali http:// atau https:// dan tanpa spasi (mis. tautan Google Drive).";
  return null;
}

export type IsianCatat = { jenis: JenisBayar; tanggal: string; jumlah: number | null; menutup: boolean; tercermin: boolean; nomorRef: string; tautan: string; catatan: string };

/** Daftar galat yang menghalangi simpan, dan peringatan yang tidak menghalangi. */
export function periksaIsian(f: IsianCatat, sisaBarisIni: number, hariIni: string): { galat: string[]; peringatan: string[] } {
  const galat: string[] = []; const peringatan: string[] = [];
  if (!TGL.test(f.tanggal)) galat.push("Tanggal wajib diisi.");
  else if (f.tanggal > hariIni) galat.push("Tanggal pembayaran tidak boleh di masa depan.");
  if (f.jenis === "bayar") {
    if (f.jumlah === null || !Number.isFinite(f.jumlah) || f.jumlah <= 0) galat.push("Jumlah pembayaran harus lebih dari nol.");
    else if (sisaBarisIni > 0 && f.jumlah > sisaBarisIni) peringatan.push("Jumlah melebihi sisa RAB baris ini. Pastikan sudah benar; selisihnya menambah kebutuhan butir.");
  } else if (f.catatan.trim().length < MIN_ALASAN) galat.push(`Alasan tidak jadi dibayar wajib diisi (minimal ${MIN_ALASAN} huruf).`);
  if (f.nomorRef.trim().length > MAKS_REF) galat.push(`Nomor referensi terlalu panjang (maks ${MAKS_REF} karakter).`);
  if (f.catatan.trim().length > MAKS_CATATAN) galat.push(`Catatan terlalu panjang (maks ${MAKS_CATATAN} karakter).`);
  const t = periksaTautan(f.tautan); if (t) galat.push(t);
  return { galat, peringatan };
}

/** Usul awal "sudah tampak di realisasi SAKTI": tanggal bayar sampai dengan tanggal unggahan realisasi terbaru. */
export const usulTercermin = (tanggal: string, sampaiTanggal: string | null | undefined): boolean => !!sampaiTanggal && TGL.test(tanggal) && tanggal <= sampaiTanggal;

/** Data insert keu_pembayaran. Kolom ber-pengaman (dicatat_oleh, pok_kunci dari item) diisi ulang basis data. */
export function isiCatat(p: { ro: string; rabId: number; itemId: number; barisId: number | null; pokKunci: string }, f: IsianCatat): Record<string, unknown> {
  const batal = f.jenis === "batal";
  return {
    ro_kode: p.ro, rab_id: p.rabId, rab_item_id: p.itemId, rab_baris_id: p.barisId, pok_kunci: p.pokKunci, jenis: f.jenis, tanggal: f.tanggal,
    jumlah: batal ? 0 : Math.round((f.jumlah ?? 0) * 100) / 100, menutup: batal ? true : f.menutup, status: batal ? "dicatat" : f.tercermin ? "tercermin" : "dicatat",
    nomor_ref: f.nomorRef.trim() || null, tautan: f.tautan.trim() || null, catatan: f.catatan.trim() || null,
  };
}
