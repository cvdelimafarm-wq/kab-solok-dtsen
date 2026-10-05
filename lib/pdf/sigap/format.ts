// lib/pdf/sigap/format.ts
//
// (5 Okt 2026) Helper format utk generator PDF SPJ SIGAP Transport Lokal -- permintaan user.
// SALINAN fungsi murni dari lib/spjFormat.ts (modul penyisiran). Sengaja disalin, BUKAN di-import,
// karena lib/spjFormat.ts bergantung ke lib/spjAuth.ts (khusus penyisiran) dan aturan proyek:
// keluaran & dependensi modul penyisiran tidak boleh tersentuh oleh modul SIGAP.
// Bedanya: tanggal dibaca sbg UTC (bukan zona waktu server) supaya tidak bergeser di hosting.

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function tgl(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-10-05" -> "Senin, 5 Oktober 2026" */
export function formatTanggalIndoDenganHari(iso: string | null | undefined): string {
  const d = tgl(iso);
  if (!d) return iso || "-";
  return `${NAMA_HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${NAMA_BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "2026-10-05" -> "5 Oktober 2026" */
export function formatTanggalIndo(iso: string | null | undefined): string {
  const d = tgl(iso);
  if (!d) return iso || "-";
  return `${d.getUTCDate()} ${NAMA_BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Rentang tanggal: "3 s.d. 5 Oktober 2026" / "30 September s.d. 2 Oktober 2026" / 1 hari = 1 tanggal. */
export function formatRentangTanggalIndo(mulai: string | null | undefined, selesai: string | null | undefined): string {
  if (!mulai && !selesai) return "-";
  if (!selesai || mulai === selesai) return formatTanggalIndo(mulai ?? selesai);
  if (!mulai) return formatTanggalIndo(selesai);
  const a = tgl(mulai);
  const b = tgl(selesai);
  if (!a || !b) return `${mulai} s.d. ${selesai}`;
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()} s.d. ${b.getUTCDate()} ${NAMA_BULAN[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  }
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${a.getUTCDate()} ${NAMA_BULAN[a.getUTCMonth()]} s.d. ${b.getUTCDate()} ${NAMA_BULAN[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  }
  return `${formatTanggalIndo(mulai)} s.d. ${formatTanggalIndo(selesai)}`;
}

/** 170000 -> "170.000" */
export function formatRupiah(nominal: number): string {
  return Math.round(nominal)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const ROMAWI = new Set(["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]);
/** "GUNUNG TALANG" -> "Gunung Talang"; angka Romawi ("IX KOTO SUNGAI LASI") tetap kapital. */
export function judulKecamatan(nama: string | null | undefined): string {
  return String(nama ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const besar = w.toUpperCase();
      if (ROMAWI.has(besar)) return besar;
      return besar.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(" ");
}

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
const BELASAN = ["sepuluh", "sebelas", "dua belas", "tiga belas", "empat belas", "lima belas", "enam belas", "tujuh belas", "delapan belas", "sembilan belas"];
const PULUHAN = ["", "", "dua puluh", "tiga puluh", "empat puluh", "lima puluh", "enam puluh", "tujuh puluh", "delapan puluh", "sembilan puluh"];

function terbilangRatusan(n: number): string {
  if (n === 0) return "";
  if (n < 10) return SATUAN[n];
  if (n < 20) return BELASAN[n - 10];
  if (n < 100) {
    const s = n % 10;
    return `${PULUHAN[Math.floor(n / 10)]}${s ? " " + SATUAN[s] : ""}`;
  }
  const r = Math.floor(n / 100);
  const sisa = n % 100;
  return `${r === 1 ? "seratus" : `${SATUAN[r]} ratus`}${sisa ? " " + terbilangRatusan(sisa) : ""}`;
}

/** 340000 -> "Tiga ratus empat puluh ribu rupiah" */
export function terbilangRupiah(nominal: number): string {
  const n = Math.round(Math.abs(nominal));
  if (n === 0) return "Nol rupiah";
  const kelompok: [number, string][] = [
    [1_000_000_000_000, "triliun"],
    [1_000_000_000, "miliar"],
    [1_000_000, "juta"],
    [1_000, "ribu"],
  ];
  let sisa = n;
  const bagian: string[] = [];
  for (const [nilai, label] of kelompok) {
    const jumlah = Math.floor(sisa / nilai);
    if (jumlah > 0) {
      bagian.push(nilai === 1_000 && jumlah === 1 ? "seribu" : `${terbilangRatusan(jumlah)} ${label}`);
      sisa %= nilai;
    }
  }
  if (sisa > 0) bagian.push(terbilangRatusan(sisa));
  const gabungan = bagian.join(" ").trim();
  return `${gabungan.charAt(0).toUpperCase()}${gabungan.slice(1)} rupiah`;
}

// (5 Okt 2026) Font standar pdf-lib (Helvetica/Times) hanya bisa WinAnsi -- teks isian petugas
// (kendala, nama, lokasi) bisa memuat emoji/karakter lain yg membuat pdf-lib melempar galat.
// Karakter di luar WinAnsi diganti "?" dan baris baru dijadikan spasi, supaya PDF tetap terbentuk.
const WINANSI_EKSTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""));
export function teksAman(s: string | null | undefined): string {
  let out = "";
  for (const ch of String(s ?? "").replace(/[\r\n\t]+/g, " ")) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EKSTRA.has(ch)) out += ch;
    else if (c === 0x2212) out += "-";
    else if (c > 0xffff || (c >= 0xfe00 && c <= 0xfe0f) || c === 0x200d) continue; // emoji & penyambungnya dibuang
    else out += "?";
  }
  return out;
}
