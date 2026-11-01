// lib/vanguard/keypad.ts  (murni)
//
// (1 Nov 2026) VANGUARD V2b: kalkulator lembar entri. Menggantikan `Function(...)` pada prototipe dengan pengurai ekspresi sendiri (tidak mengeksekusi kode):
// angka, + − × ÷, kurung, tanda minus di depan, koma sebagai desimal. Hasil tidak hingga atau ekspresi rusak = null.

export const TOMBOL = ["C", "(", ")", "⌫", "7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", "000", ",", "+"] as const;
/** Tombol pintas konversi Buku 4: nilai ditambahkan ke ekspresi apa adanya. */
export const FUNGSI = [{ teks: "×12", nilai: "×12" }, { teks: "×30/7×12", nilai: "×30÷7×12" }] as const;
export const MAKS_PANJANG_EKSPRESI = 200;

export function hitungEkspresi(masuk: string): number | null {
  const e = masuk.replace(/\s/g, "").replace(/\*/g, "×").replace(/\//g, "÷").replace(/-/g, "−");
  if (e === "") return 0;
  if (e.length > MAKS_PANJANG_EKSPRESI || !/^[0-9+−×÷().,]+$/.test(e)) return null;
  let i = 0;
  const gagal = Symbol("gagal");
  const angka = (): number | typeof gagal => {
    const m = /^[0-9]+(?:,[0-9]+)?|^,[0-9]+/.exec(e.slice(i));
    if (!m) return gagal;
    i += m[0].length;
    return Number(m[0].replace(",", "."));
  };
  const faktor = (depth: number): number | typeof gagal => {
    if (depth > 30) return gagal;
    if (e[i] === "−") { i++; const v = faktor(depth + 1); return v === gagal ? gagal : -v; }
    if (e[i] === "+") { i++; return faktor(depth + 1); }
    if (e[i] === "(") {
      i++;
      const v = jumlah(depth + 1);
      if (v === gagal || e[i] !== ")") return gagal;
      i++;
      return v;
    }
    return angka();
  };
  const hasil = (depth: number): number | typeof gagal => {
    let v = faktor(depth);
    if (v === gagal) return gagal;
    while (e[i] === "×" || e[i] === "÷") {
      const op = e[i++];
      const w = faktor(depth);
      if (w === gagal) return gagal;
      v = op === "×" ? v * w : v / w;
    }
    return v;
  };
  const jumlah = (depth: number): number | typeof gagal => {
    let v = hasil(depth);
    if (v === gagal) return gagal;
    while (e[i] === "+" || e[i] === "−") {
      const op = e[i++];
      const w = hasil(depth);
      if (w === gagal) return gagal;
      v = op === "+" ? v + w : v - w;
    }
    return v;
  };
  const v = jumlah(0);
  if (v === gagal || i !== e.length || !Number.isFinite(v)) return null;
  return v;
}

/** Menerapkan satu tombol pada ekspresi. */
export function tekanTombol(ekspresi: string, k: string): string {
  if (k === "C") return "";
  if (k === "⌫") return ekspresi.slice(0, -1);
  return (ekspresi + k).slice(0, MAKS_PANJANG_EKSPRESI);
}

/**
 * Tombol pada lembar entri dengan "mode ganti": saat kotak yang sudah berisi dibuka, ekspresi awal = nilai lama dan `ganti` = true.
 * Angka, kurung buka, dan koma menggantikan nilai lama (ketikan pertama = angka baru); operator (+ − × ÷) dan pintasan konversi melanjutkan nilai lama
 * (mis. 6000 lalu ×12). Hapus dan C membuang mode ganti. Tanpa ini ketikan baru menempel di belakang angka lama dan menghasilkan angka salah.
 */
export function tekanPad(ekspresi: string, ganti: boolean, k: string): { expr: string; ganti: boolean } {
  const menggantikan = ganti && /^(?:[0-9(,]|000)/.test(k);
  return { expr: tekanTombol(menggantikan ? "" : ekspresi, k), ganti: false };
}
