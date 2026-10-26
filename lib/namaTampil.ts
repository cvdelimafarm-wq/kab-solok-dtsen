// lib/namaTampil.ts
//
// (26 Okt 2026, uji Android per peran A4) SATU fungsi tampilan nama orang untuk semua layar. Data di database tidak diubah (ada yang
// "MINDA SUSANTI", ada yang "Minda Susanti"); yang dirapikan hanya tampilannya: huruf kapital di awal tiap kata, singkatan inisial ("M.")
// tetap kapital, gelar (sesudah koma, atau pola "S.Si", "S.Tr.Stat.", "SST") dibiarkan apa adanya.
// Hanya untuk NAMA ORANG. Nama wilayah (SLS, nagari) tetap memakai rapikanNama / judulKata.

const GELAR_TANPA_TITIK = new Set(["SST", "SE", "ST", "SH", "SKM", "MM", "SP", "SPD", "SSI", "MSI", "MPD", "MT", "ME", "MA", "SPSI", "SSOS", "STP", "SKOM", "SIP"]);

const adalahInisial = (k: string) => /^[A-Za-z]\.$/.test(k);
/** "S.Si", "M.Si", "S.Tr.Stat.", "S.E." (bukan inisial tunggal "M."): gelar bertitik. */
const adalahGelarBertitik = (k: string) => /^(?:[A-Za-z]{1,4}\.){1,}[A-Za-z]{0,6}\.?$/.test(k) && !adalahInisial(k) && /\.[A-Za-z]|[A-Za-z]{2,}\./.test(k);

function kapital(k: string): string {
  if (adalahInisial(k)) return k.toUpperCase();
  return k.toLowerCase().replace(/(^|-)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

/** Pisah "NAMA ORANG, S.Si" -> { kata: [nama...], gelar: "S.Si" }. Gelar tanpa koma ("... SST") ikut dipisah bila di akhir. */
function pecah(mentah: string | null | undefined): { kata: string[]; gelar: string } {
  const s = String(mentah ?? "").replace(/\s+/g, " ").trim();
  if (!s) return { kata: [], gelar: "" };
  const i = s.indexOf(",");
  const depan = (i >= 0 ? s.slice(0, i) : s).trim();
  const gelarKoma = i >= 0 ? s.slice(i + 1).replace(/\s*,\s*/g, ", ").trim() : "";
  const kata = depan.split(" ").filter(Boolean);
  const gelarKata: string[] = [];
  // gelar tanpa koma di ujung nama
  while (kata.length > 1) {
    const k = kata[kata.length - 1];
    if (adalahGelarBertitik(k) || GELAR_TANPA_TITIK.has(k.toUpperCase().replace(/\./g, "")) && k === k.toUpperCase() && k.length <= 4) gelarKata.unshift(kata.pop() as string);
    else break;
  }
  const gelar = [gelarKata.join(" "), gelarKoma].filter(Boolean).join(", ");
  return { kata, gelar };
}

/** "MINDA SUSANTI" -> "Minda Susanti"; "m. iqbal hadi, SST." -> "M. Iqbal Hadi, SST."; kosong -> "". */
export function namaTampil(mentah: string | null | undefined): string {
  const { kata, gelar } = pecah(mentah);
  const nama = kata.map(kapital).join(" ");
  return gelar ? `${nama}, ${gelar}` : nama;
}

/** Nama untuk sapaan/label pendek tanpa gelar: "M. Iqbal Hadi, SST." -> "M. Iqbal Hadi". */
export function namaTanpaGelar(mentah: string | null | undefined): string {
  return pecah(mentah).kata.map(kapital).join(" ");
}

/** Nama depan untuk sapaan ("Halo, Minda"); inisial di depan dilewati bila masih ada kata lain: "M. Iqbal Hadi" -> "Iqbal". */
export function namaDepanTampil(mentah: string | null | undefined): string {
  const { kata } = pecah(mentah);
  if (kata.length === 0) return "";
  const nyata = kata.find((k) => !adalahInisial(k));
  return kapital(nyata ?? kata[0]);
}

/** Dua kata pertama untuk chip/baris sempit: "M. Hafizh Dinu Aulia" -> "M. Hafizh"; gelar tidak ikut. */
export function namaSingkatTampil(mentah: string | null | undefined): string {
  return pecah(mentah).kata.slice(0, 2).map(kapital).join(" ");
}
