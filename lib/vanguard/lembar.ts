// lib/vanguard/lembar.ts  (murni: menghasilkan teks HTML; tanpa DOM, DB, atau React)
//
// (1 Nov 2026) VANGUARD V2b: pembangun lembar kuesioner (kutipan Blok IV dan Blok V sampai VII) yang dipindahkan dari prototipe simulasi_v3_referensi.html
// agar tampilannya persis kuesioner (pita oranye, kotak digit, sel abu, tinta biru). Semua teks bersumber dari berkas kasus di repo dan angka hitungan engine,
// BUKAN dari masukan pengguna, sehingga aman disisipkan sebagai HTML. Masukan petugas hanya berupa bilangan bulat yang diformat menjadi kotak digit.
// Label kotak diambil dari registri sel (sel.ts), jadi pesan koreksi dan label di layar selalu sama.

import { AR, BR, D_ROWS, E_ROWS, F_ROWS, G_MAIN, G_SUB, labelSel } from "./sel";
import type { Blok, BarisUsaha, KasusPublik, KutipanIv, Nilai } from "./tipe";

const R = Math.round;

/** Kotak digit seperti di kuesioner. Pola: "b" = satu kotak, karakter lain = pemisah (titik/koma). Digit berlebih dipotong dari kiri. */
export function boxes(pattern: string, digits: string): string {
  const nb = (pattern.match(/b/g) ?? []).length;
  const d = String(digits).slice(-nb);
  const pad = d.padStart(nb, " ");
  let k = 0, out = "";
  for (const ch of pattern) {
    if (ch === "b") { const x = pad[k++]; out += `<u>${x === " " ? "" : x}</u>`; } else out += `<i class="sep">${ch}</i>`;
  }
  return out;
}
const MP = "b.bbb.bbb.bbb";
export function mny(n: number | undefined | null): string {
  if (n === undefined || n === null || n === 0) return boxes(MP, "");
  return (n < 0 ? '<s class="neg">−</s>' : "") + boxes(MP, String(Math.abs(R(n))));
}
const qty = (s: unknown): string => boxes("bbb,bb", String(s).replace(/[^0-9]/g, ""));
const val6 = (n: unknown): string => boxes("bbb.bbb", n === "" || n == null ? "" : String(n));

export type Status = Record<string, "ok" | "no">;
export type Konteks = { vals: Nilai; co: Record<string, number>; status: Status };

const attr = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const inC = (x: Konteks, id: string): string => {
  const lbl = labelSel(id);
  const st = x.status[id];
  return `<td class="in money${st ? " " + st : ""}" data-id="${id}" data-lbl="${attr(lbl)}" tabindex="0" role="button" aria-label="${attr(lbl)}">${mny(x.vals[id])}</td>`;
};
const coC = (x: Konteks, id: string): string => `<td class="co money" data-co="${id}">${mny(x.co[id])}</td>`;
const NA = '<td class="na"></td>';
const NUMROW = (n: number): string => `<tr class="numrow">${Array.from({ length: n }, (_, i) => `<th>(${i + 1})</th>`).join("")}</tr>`;
const paper = (h: string): string => `<div class="paper"><table class="frm">${h}</table></div>`;
const band = (t: string, n: number, main?: boolean): string => `<tr><th class="band${main ? " main" : ""}" colspan="${n}"><div>${t}</div></th></tr>`;

// ---------- Blok IV (kutipan, hanya baca) ----------
type Baris = Record<string, unknown>;
const s = (x: unknown): string => (x === undefined || x === null ? "" : String(x));
function ivTable1(rows: Baris[]): string {
  let h = band("BLOK IV.1. KONSUMSI DAN PENGELUARAN BAHAN MAKANAN, BAHAN MINUMAN, DAN ROKOK SEMINGGU TERAKHIR (KUTIPAN)", 10) +
    '<tr><th rowspan="2">No. urut</th><th rowspan="2">Kode COICOP</th><th rowspan="2">Rincian</th><th rowspan="2">Satuan standar</th><th colspan="2">Berasal dari pembelian (tunai/bon)</th><th colspan="2">Berasal dari produksi sendiri, pemberian, dsb.</th><th colspan="2">Jumlah konsumsi</th></tr><tr><th>Banyaknya (0,00)</th><th>Nilai (Rp)</th><th>Banyaknya (0,00)</th><th>Nilai (Rp)</th><th>Banyaknya (5)+(7)</th><th>Nilai (6)+(8)</th></tr>' +
    '<tr class="numrow"><th>(1)</th><th>(2)</th><th>(3)</th><th>(4)</th><th>(5)</th><th>(6)</th><th>(7)</th><th>(8)</th><th>(9)</th><th>(10)</th></tr>';
  for (const r of rows) {
    const b = r.beli as unknown[] | undefined, p = r.prod as unknown[] | undefined, j = r.jml as unknown[] | undefined;
    h += `<tr class="iv"><td class="rno">${s(r.no)}</td><td class="ctr">${s(r.kode)}</td><td class="lbl">${s(r.rin)}</td><td class="ctr">${s(r.sat)}</td>` +
      `<td class="money">${qty(b ? b[0] : "")}</td><td class="money">${val6(b ? b[1] : "")}</td><td class="money">${qty(p ? p[0] : "")}</td><td class="money">${val6(p ? p[1] : "")}</td><td class="money">${qty(j ? j[0] : "")}</td><td class="money">${val6(j ? j[1] : "")}</td></tr>`;
  }
  return paper(h);
}
function ivTable2(rows: Baris[]): string {
  let h = band("BLOK IV.2. PENGELUARAN UNTUK BARANG-BARANG BUKAN MAKANAN (KUTIPAN)", 6) +
    "<tr><th>No. urut</th><th>Kode COICOP</th><th>Rincian</th><th>(3) Dibayar tunai (OOP)</th><th>(4) Sebulan terakhir</th><th>(5) Setahun terakhir</th></tr>";
  const P = "bbb.bbb.bbb";
  const kotak = (v: unknown): string => (v != null ? boxes(P, String(v === 0 ? "0" : v)) : boxes(P, ""));
  for (const r of rows) {
    if (r.teks) h += `<tr class="iv"><td class="rno">${s(r.no)}</td><td class="ctr">${s(r.kode)}</td><td class="lbl">${s(r.rin)}</td><td colspan="3" class="ctr"><b>${s(r.teks)}</b></td></tr>`;
    else h += `<tr class="iv"><td class="rno">${s(r.no)}</td><td class="ctr">${s(r.kode)}</td><td class="lbl">${s(r.rin)}</td><td class="money">${kotak(r.oop)}</td><td class="money">${kotak(r.bln)}</td><td class="money">${kotak(r.thn)}</td></tr>`;
  }
  return paper(h);
}
export function kutipanIv(iv: KutipanIv | undefined): string {
  if (!iv) return "";
  if (iv.t === 1) return ivTable1(iv.rows ?? []);
  if (iv.t === 2) return ivTable2(iv.rows ?? []);
  let h = "";
  if (iv.iv1) h += ivTable1(iv.iv1);
  if (iv.iv2) h += ivTable2(iv.iv2);
  if (iv.sum) h += `<div class="sheet" style="padding:8px 10px;border-width:1px">${iv.sum.map((x) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px"><span>${x[0]}</span><b style="font-family:var(--mono)">Rp${x[1]}</b></div>`).join("")}</div>`;
  return h;
}

// ---------- Blok V sampai VII (isian petugas) ----------
function blkA(x: Konteks, m: BarisUsaha[] | undefined): string {
  let h = band("A. PENDAPATAN DARI UPAH/GAJI BAIK BERUPA UANG MAUPUN BARANG/JASA YANG DITERIMA SELAMA SETAHUN TERAKHIR (DALAM RUPIAH)", 7) +
    "<tr><th>No. Urut ART</th><th>Uraian Pekerjaan</th><th>Kategori Lapangan Usaha *)</th><th>Jenis Pekerjaan **)</th><th>Upah/gaji dalam bentuk uang (gaji, tunjangan, uang makan, dll.)</th><th>Upah/gaji dalam bentuk barang/jasa (rumah dinas, kendaraan dinas, makanan, dll.)</th><th>Lembur, Honorarium, THR, dll.</th></tr>" + NUMROW(7);
  for (let i = 1; i <= AR; i++) {
    const r = (m ?? [])[i - 1] ?? ({} as BarisUsaha);
    h += `<tr><td class="rno">${s(r.no)}</td><td class="txt">${s(r.uraian)}</td><td class="ctr">${s(r.kat)}</td><td class="ctr">${s(r.jenis)}</td>${inC(x, `a${i}_uang`)}${inC(x, `a${i}_barang`)}${inC(x, `a${i}_lembur`)}</tr>`;
  }
  return paper(h + `<tr><td colspan="4" class="jml">J u m l a h</td>${coC(x, "sumA_u")}${coC(x, "sumA_b")}${coC(x, "sumA_l")}</tr>`);
}
function blkB(x: Konteks, m: BarisUsaha[] | undefined): string {
  let h = band("B. PENDAPATAN DARI USAHA RUMAH TANGGA SELAMA SETAHUN TERAKHIR (DALAM RUPIAH)", 7) +
    "<tr><th>No. Urut ART</th><th>Uraian Kegiatan Usaha</th><th>Kategori Lapangan Usaha *)</th><th>Jenis Pekerjaan **)</th><th>Nilai Produksi</th><th>Biaya Produksi (bahan baku dan penolong, listrik, transportasi, upah/gaji, sewa bangunan, dll.)</th><th>Surplus Usaha/Mixed Income [Kolom (5) − (6)]</th></tr>" + NUMROW(7);
  for (let i = 1; i <= BR; i++) {
    const r = (m ?? [])[i - 1] ?? ({} as BarisUsaha);
    h += `<tr><td class="rno">${s(r.no)}</td><td class="txt">${s(r.uraian)}</td><td class="ctr">${s(r.kat)}</td><td class="ctr">${s(r.jenis)}</td>${inC(x, `b${i}_produksi`)}${inC(x, `b${i}_biaya`)}${coC(x, `b${i}_s`)}</tr>`;
  }
  return paper(h + `<tr><td colspan="4" class="jml">J u m l a h</td>${coC(x, "sumB_p")}${coC(x, "sumB_c")}${coC(x, "sumB_s")}</tr>`);
}
function blkC(x: Konteks): string {
  return paper(band("C. PENDAPATAN DARI PRODUKSI RUMAH TANGGA YANG DIKONSUMSI/DIGUNAKAN SENDIRI SELAMA SETAHUN TERAKHIR (DALAM RUPIAH)", 4) +
    "<tr><th>Rincian</th><th>Nilai Produksi</th><th>Biaya Produksi</th><th>Surplus Usaha/Mixed Income [(2) − (3)]</th></tr>" + NUMROW(4) +
    `<tr><td class="lbl st">1. Perkiraan sewa rumah milik sendiri</td>${inC(x, "c_sewaRumah_produksi")}${NA}${coC(x, "c_sewaRumah_s")}</tr>` +
    `<tr><td class="lbl st">2. Hasil pertanian, peternakan, perikanan, penggalian, industri, dll.</td>${inC(x, "c_hasilLain_produksi")}${inC(x, "c_hasilLain_biaya")}${coC(x, "c_hasilLain_s")}</tr>` +
    `<tr><td class="lbl st jml">Jumlah (Rincian 1 + 2)</td>${coC(x, "sumC_p")}${coC(x, "sumC_c")}${coC(x, "sumC_s")}</tr>`);
}
function blkD(x: Konteks): string {
  let h = band("D. PENDAPATAN KEPEMILIKAN SELAMA SETAHUN TERAKHIR (DALAM RUPIAH)", 3) + "<tr><th>Rincian</th><th>Diterima</th><th>Dibayar</th></tr>" + NUMROW(3);
  for (const [k, l] of D_ROWS) h += `<tr><td class="lbl st">${l}</td>${inC(x, `d_${k}_diterima`)}${k === "keuntunganSaham" ? NA : inC(x, `d_${k}_dibayar`)}</tr>`;
  return paper(h + `<tr><td class="lbl st jml">Jumlah (Rincian 1+2+3+4)</td>${coC(x, "sumD_t")}${coC(x, "sumD_b")}</tr>`);
}
function eRow(x: Konteks, k: string, l: string, sub?: boolean): string {
  return `<tr><td class="lbl st${sub ? " sub" : ""}">${l}</td>${inC(x, `e_${k}_uangD`)}${inC(x, `e_${k}_barangD`)}${inC(x, `e_${k}_uangB`)}${inC(x, `e_${k}_barangB`)}</tr>`;
}
function blkE(x: Konteks): string {
  let h = band("E. TRANSFER BERJALAN (SELAIN ASET) SELAMA SETAHUN TERAKHIR (DALAM RUPIAH)", 5) +
    '<tr><th rowspan="2">Penerimaan</th><th colspan="2">Transfer Diterima (dari)</th><th colspan="2">Transfer Dibayar/Diberikan (kepada)</th></tr><tr><th>Uang</th><th>Barang/Jasa</th><th>Uang</th><th>Barang/Jasa</th></tr>' + NUMROW(5) +
    `<tr><td class="lbl st">1. Pemerintah (Rincian a+b)</td>${coC(x, "e_pem_uD")}${coC(x, "e_pem_bD")}${coC(x, "e_pem_uB")}${coC(x, "e_pem_bB")}</tr>` +
    `<tr><td class="lbl st sub">a. Uang pensiun</td>${inC(x, "e_pensiun_uang")}${NA}${NA}${NA}</tr>` +
    eRow(x, "bantuan", "1.b Bantuan pemerintah (BPJS PBI, BLT, PKH, BOS, MBG, dll.), pembayaran zakat ke BAZNAS", true);
  for (const [k, l] of E_ROWS) h += eRow(x, k, l);
  return paper(h + `<tr><td class="lbl st jml">Jumlah (Rincian 1+2+3+4+5)</td>${coC(x, "sumE_uD")}${coC(x, "sumE_bD")}${coC(x, "sumE_uB")}${coC(x, "sumE_bB")}</tr>`);
}
function blkF(x: Konteks): string {
  let h = band("F. TRANSFER MODAL/ASET SELAMA SETAHUN TERAKHIR (DALAM RUPIAH)", 5) +
    '<tr><th rowspan="2">Rincian</th><th colspan="2">Transfer Diterima (dari)</th><th colspan="2">Transfer Dibayar/Diberikan (kepada)</th></tr><tr><th>Bangunan, alat produksi, kendaraan, dll</th><th>Lahan/tanah dan barang berharga</th><th>Bangunan, alat produksi, kendaraan, dll</th><th>Lahan/tanah dan barang berharga</th></tr>' + NUMROW(5);
  for (const [k, l] of F_ROWS) h += `<tr><td class="lbl st">${l}</td>${inC(x, `f_${k}_bangunanD`)}${inC(x, `f_${k}_lahanD`)}${k === "pemerintah" ? NA : inC(x, `f_${k}_bangunanB`)}${inC(x, `f_${k}_lahanB`)}</tr>`;
  return paper(h + `<tr><td class="lbl st jml">Jumlah (Rincian 1+2+3+4+5)</td>${coC(x, "sumF_bD")}${coC(x, "sumF_lD")}${coC(x, "sumF_bB")}${coC(x, "sumF_lB")}</tr>`);
}
function gRow(x: Konteks, k: string, l: string, sub: boolean, tanpaKurang?: boolean): string {
  return `<tr><td class="lbl st${sub ? " sub" : ""}">${l}</td>${inC(x, `g_${k}_tambah`)}${tanpaKurang ? NA : inC(x, `g_${k}_kurang`)}${coC(x, `g_${k}_n`)}</tr>`;
}
function blkG(x: Konteks): string {
  let h = band("G. PENAMBAHAN DAN PENGURANGAN ASET SELAMA SETAHUN TERAKHIR (DALAM RUPIAH)", 4) +
    "<tr><th>Rincian</th><th>Penambahan (pembelian, pemberian, pembuatan sendiri)</th><th>Pengurangan (penjualan, pemberian kepada pihak lain)</th><th>Neto [(2) − (3)]</th></tr>" + NUMROW(4) +
    `<tr><td class="lbl st"><b>1. Aset tetap untuk usaha rumah tangga (a+b+c+d+e)</b></td>${coC(x, "g_aset_t")}${coC(x, "g_aset_k")}${coC(x, "g_aset_n")}</tr>`;
  for (const [k, l] of G_SUB) h += gRow(x, k, l, true);
  for (const [k, l] of G_MAIN) h += gRow(x, k, l, false, k === "biayaPindahLahan");
  return paper(h + `<tr><td class="lbl st jml">Jumlah (Rincian 1+2+3+4+5)</td>${coC(x, "sumG_t")}${coC(x, "sumG_k")}${coC(x, "sumG_n")}</tr>`);
}
function blkVI(x: Konteks): string {
  const Lp = ["1. Upah dan gaji [V.A Jumlah (5)+(6)+(7)]", "2. Surplus usaha rumah tangga [V.B Jumlah (7)]", "3. Surplus produksi dikonsumsi sendiri [V.C Jumlah (4)]", "4. Pendapatan kepemilikan diterima [V.D Jumlah (2)]", "5. Transfer berjalan diterima [V.E Jumlah (2)+(3)]", "6. Transfer modal/aset diterima [V.F Jumlah (2)+(3)]"];
  const Lg = ["1. Pengeluaran konsumsi rumah tangga [IV.3.3 R.9 K.3 dikali 12]", "2. Pendapatan kepemilikan dibayar [V.D Jumlah (3)]", "3. Transfer berjalan dibayar [V.E Jumlah (4)+(5)]", "4. Transfer modal/aset dibayar [V.F Jumlah (4)+(5)]", "5. Total aset neto [V.G Jumlah (4)]"];
  let h = band("BLOK VI. REKAPITULASI PENERIMAAN DAN PENGELUARAN RUMAH TANGGA SELAMA SETAHUN TERAKHIR (DALAM RUPIAH)", 4) + "<tr><th>Rincian Penerimaan</th><th>Nilai</th><th>Rincian Pengeluaran</th><th>Nilai</th></tr>" + NUMROW(4);
  for (let i = 0; i < 6; i++) h += `<tr><td class="lbl st">${Lp[i]}</td>${coC(x, `vi_p${i + 1}`)}${i < 5 ? `<td class="lbl">${Lg[i]}</td>${i === 0 ? inC(x, "vi_g1") : coC(x, `vi_g${i + 1}`)}` : '<td class="na"></td><td class="na"></td>'}</tr>`;
  h += `<tr><td class="lbl st jml">J u m l a h</td>${coC(x, "vi_pt")}<td class="jml">J u m l a h</td>${coC(x, "vi_gt")}</tr><tr><td colspan="3" class="jml">Selisih Penerimaan dan Pengeluaran [Jumlah Kolom (2) − Jumlah Kolom (4)]</td>${coC(x, "vi_sel")}</tr>`;
  return paper(h);
}
const P_VII = ["1. Pengambilan uang tunai dan tabungan", "2. Meminjam uang", "3. Menerima pembayaran kredit barang (usaha rumah tangga)", "4. Kredit barang", "5. Lainnya (pengembalian piutang, menggadaikan barang, mendapat arisan, klaim asuransi jiwa/pendidikan, dll.)"];
const G_VII = ["1. Menyimpan uang tunai dan menabung", "2. Membayar hutang", "3. Memberikan kredit barang (usaha rumah tangga)", "4. Membayar kredit barang", "5. Lainnya (meminjamkan uang, menebus barang gadaian, membayar arisan, premi asuransi jiwa/pendidikan, dll.)"];
function blkVII(x: Konteks): string {
  let h = band("BLOK VII. TRANSAKSI KEUANGAN RUMAH TANGGA SELAMA SETAHUN TERAKHIR (DALAM RUPIAH)", 4) + "<tr><th>Rincian Penerimaan</th><th>Nilai</th><th>Rincian Pengeluaran</th><th>Nilai</th></tr>" + NUMROW(4);
  for (let i = 1; i <= 5; i++) h += `<tr><td class="lbl st">${P_VII[i - 1]}</td>${inC(x, `vii_p${i}`)}<td class="lbl">${G_VII[i - 1]}</td>${inC(x, `vii_g${i}`)}</tr>`;
  h += `<tr><td class="lbl st jml">J u m l a h</td>${coC(x, "vii_pt")}<td class="jml">J u m l a h</td>${coC(x, "vii_gt")}</tr><tr><td colspan="3" class="jml">Selisih Transaksi Keuangan Rincian Pengeluaran dan Penerimaan [Jumlah Kolom (4) − Jumlah Kolom (2)]</td>${coC(x, "vii_sel")}</tr>`;
  return paper(h);
}

const BLOK: Record<Blok, (x: Konteks, k: KasusPublik) => string> = {
  A: (x, k) => blkA(x, k.meta?.A), B: (x, k) => blkB(x, k.meta?.B), C: blkC, D: blkD, E: blkE, F: blkF, G: blkG, VI: blkVI, VII: blkVII,
};

/** Judul BLOK V (satu pita) yang mendahului blok A sampai G. */
export const pitaBlokV = (): string => `<div class="paper" style="border-bottom:0"><table class="frm">${band("BLOK V. PENDAPATAN, PENERIMAAN, DAN PENGELUARAN BUKAN KONSUMSI", 1, true)}</table></div>`;

/** Seluruh lembar isian sebuah kasus (tanpa kutipan Blok IV dan tanpa memo cerita). */
export function lembarBlok(k: KasusPublik, x: Konteks): string {
  const adaV = k.blok.some((b) => /^[A-G]$/.test(b));
  return (adaV ? pitaBlokV() : "") + k.blok.map((b) => BLOK[b](x, k)).join("");
}

/** Id kotak isian (data-id) yang muncul pada teks HTML lembar. Dipakai tes untuk memastikan lembar dan registri sel sama. */
export function idDiLembar(html: string): string[] {
  return [...html.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]);
}
