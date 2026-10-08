// lib/sigapNavigasi.ts
//
// (8 Okt 2026) Navigasi 3 layer & tombol Back (permintaan user: "tombol back sering terlalu jauh atau malah keluar dari aplikasi").
// Logika murni (tanpa React/DOM) supaya mudah diuji:
//   - indukDari(path)  : layer di atasnya (Layer 3 -> Layer 2 -> Beranda). Beranda "/" tidak punya induk.
//   - leluhur(path)    : rantai induk dari Beranda sampai sebelum path (dipakai bila halaman dibuka langsung, mis. dari notifikasi,
//                        sehingga riwayat browser kosong dan Back akan keluar aplikasi).
//   - perbaruiJejak()  : catatan urutan halaman yang dikunjungi (sessionStorage) untuk memutuskan "kembali" vs "ganti ke induk".

/** Buang query/hash dan garis miring penutup. */
export function bersihkanPath(p: string): string {
  const x = p.split("#")[0].split("?")[0];
  const t = x.length > 1 ? x.replace(/\/+$/, "") : x;
  return t || "/";
}

/** Induk (layer atas) sebuah halaman; null = Beranda atau halaman di luar struktur aplikasi (login, publik). */
export function indukDari(path: string): string | null {
  const p = bersihkanPath(path);
  if (p === "/") return null;
  if (p === "/sigap/masuk" || p.startsWith("/sigap/masuk/")) return null;
  if (p === "/sigap") return "/";
  if (p === "/sigap/pelatihan") return "/";
  if (p.startsWith("/sigap/pelatihan/kelola")) return "/";
  if (/^\/sigap\/pelatihan\/(undangan|instrumen|kuis)$/.test(p) || /^\/sigap\/pelatihan\/tes(\/|$)/.test(p)) return "/sigap/pelatihan";
  if (p.startsWith("/sigap/pelatihan/")) return "/sigap/pelatihan";
  if (p.startsWith("/sigap/pedia/") && p !== "/sigap/pedia") return "/sigap/pedia";
  if (p.startsWith("/sigap/") || p === "/penyisiran" || p.startsWith("/penyisiran/") || p === "/dashboard" || p.startsWith("/dashboard/") || p === "/seruti" || p.startsWith("/seruti/")) return "/";
  return null;
}

/** Rantai induk dari Beranda: ["/", "/sigap/pelatihan"] untuk /sigap/pelatihan/tes/pretest. Kosong bila tidak ada. */
export function leluhur(path: string): string[] {
  const rantai: string[] = [];
  let p = indukDari(path);
  let aman = 0;
  while (p && aman++ < 6) {
    rantai.unshift(p);
    p = indukDari(p);
  }
  return rantai;
}

/** Catat kunjungan baru. Halaman yang sama = abaikan; kembali ke halaman sebelumnya = buang yang teratas. */
export function perbaruiJejak(jejak: string[], path: string): string[] {
  const p = bersihkanPath(path);
  if (jejak.length === 0) return [p];
  if (jejak[jejak.length - 1] === p) return jejak;
  if (jejak.length >= 2 && jejak[jejak.length - 2] === p) return jejak.slice(0, -1);
  return [...jejak.slice(-29), p];
}

/** Aman memanggil router.back()? Hanya bila halaman sebelumnya di jejak memang induk yang dituju. */
export function bisaKembali(jejak: string[], induk: string): boolean {
  return jejak.length >= 2 && jejak[jejak.length - 2] === bersihkanPath(induk);
}
