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
  // (9 Okt 2026) Kegiatan induk: Layer 2 /sigap/kegiatan/<kode> -> Beranda; Layer 3 /sigap/kegiatan/<kode>/<tahap> -> Layer 2.
  // Pelatihan adalah halaman kerja tahap "Pelatihan" milik Pendataan Pascabencana -> naik ke garis waktu kegiatan itu.
  // (Transport Lokal "translok-<id>" tetap satu layer di bawah Beranda.)
  const tahap = /^\/sigap\/kegiatan\/([^/]+)\/[^/]+$/.exec(p);
  if (tahap) return `/sigap/kegiatan/${tahap[1]}`;
  if (p === "/sigap/pelatihan") return "/sigap/kegiatan/pascabencana";
  // (19 Okt 2026) Monitoring Korwil = halaman kerja tahap Pendataan Pascabencana
  if (p === "/sigap/korwil") return "/sigap/kegiatan/pascabencana";
  if (p.startsWith("/sigap/pelatihan/kelola")) return "/";
  // (9 Okt 2026) halaman pengelolaan /sigap/kelola/<modul> -- permintaan user. Detail (mis. /sigap/kelola/pedia/12) naik ke daftar modulnya.
  const kelola = /^\/sigap\/kelola\/([^/]+)\/.+/.exec(p);
  if (kelola) return `/sigap/kelola/${kelola[1]}`;
  // (23 Okt 2026) halaman penuh lama yang kini juga tersemat sebagai tab Kelola Pendataan -> induknya Kelola Pendataan
  if (p === "/sigap/kelola/foto" || p === "/sigap/kelola/identifikasi" || p === "/sigap/kelola/lapangan" || p === "/sigap/kelola/monitoring") return "/sigap/kelola/pendataan";
  if (p === "/sigap/kelola" || p.startsWith("/sigap/kelola/")) return "/";
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

// ---------------------------------------------------------------------------------------------------------------------------------------
// (23 Okt 2026, audit navigasi Tahap 1) Tujuan & label tombol "Kembali" yang SERAGAM. Dipakai komponen app/components/TombolKembali.tsx.
// Aturan tujuan (sama di semua halaman): ?dari= bila ada dan aman, kalau tidak induk logis halaman itu (indukDari), kalau tidak Beranda "/".
// ---------------------------------------------------------------------------------------------------------------------------------------

/**
 * Validasi ?dari=: hanya jalur INTERNAL (diawali "/"). Ditolak: kosong, "//..." (protokol-relatif), garis miring terbalik ("/\\evil" dibaca
 * peramban sebagai "//evil"), skema ("javascript:", "https:"), karakter kendali, segmen "..", dan alamat > 300 karakter.
 * Query/hash yang sah (mis. "/sigap/kelola/pendataan?tab=pemeriksaan") dipertahankan.
 */
export function dariAman(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const x = raw.trim();
  if (x.length === 0 || x.length > 300) return null;
  if (!x.startsWith("/") || x.startsWith("//")) return null;
  if (x.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(x)) return null;
  if (bersihkanPath(x).split("/").includes("..")) return null;
  return x;
}

/** Nama tujuan yang tampil di tombol Kembali ("‹ Kelola Pendataan"). Alamat di luar daftar -> "Halaman sebelumnya". */
export function labelTujuan(path: string): string {
  const p = bersihkanPath(path);
  if (p === "/") return "Beranda";
  const tetap: Record<string, string> = {
    "/sigap": "Beranda",
    "/sigap/kelola/pendataan": "Kelola Pendataan",
    "/sigap/kelola/translok": "Administrasi & SPJ",
    "/sigap/kelola/spj": "Administrasi & SPJ",
    "/sigap/kelola/perencanaan": "Perencanaan",
    "/sigap/kelola/pelatihan": "Kelola Pelatihan",
    "/sigap/kelola/pengadaan": "Pengadaan",
    "/sigap/kelola/akses": "Peran & Akses",
    "/sigap/kelola/aplikasi": "Kelola Aplikasi",
    "/sigap/kelola/pedia": "SIGAP PEDIA",
    "/sigap/kelola/delego": "Delego",
    "/sigap/kelola/foto": "Kelola Foto",
    "/sigap/kelola/identifikasi": "Monitoring Identifikasi",
    "/sigap/kelola/lapangan": "Monitoring Lapangan",
    "/sigap/kelola/monitoring": "Monitoring Lapangan",
    "/sigap/pelatihan": "Pelatihan",
    "/sigap/korwil": "Supervisi",
    "/sigap/pendataan": "Lembar Pendataan",
    "/sigap/identifikasi": "Lembar Identifikasi SLS",
    "/sigap/spdt": "Lembar SPDT NTP",
    "/sigap/foto": "Kamera SIGAP",
    "/bencana": "Pendataan Bencana",
  };
  if (tetap[p]) return tetap[p];
  if (/^\/sigap\/kegiatan\/[^/]+\/[^/]+$/.test(p)) return "Tahap kegiatan";
  if (/^\/sigap\/kegiatan\/translok-[^/]+$/.test(p)) return "Kegiatan";
  if (/^\/sigap\/kegiatan\/[^/]+$/.test(p)) return "Tahapan";
  return "Halaman sebelumnya";
}

/** Tujuan Kembali untuk halaman `pathSaatIni`: ?dari= (aman, bukan halaman ini sendiri) > induk logis > Beranda. */
export function tujuanKembali(dariRaw: string | null | undefined, pathSaatIni: string): { href: string; label: string } {
  const d = dariAman(dariRaw);
  const href = d && bersihkanPath(d) !== bersihkanPath(pathSaatIni) ? d : indukDari(pathSaatIni) ?? "/";
  return { href, label: labelTujuan(href) };
}

/** Tambahkan ?dari=<asal> ke alamat tujuan (menjaga query yang sudah ada). `asal` harus lolos dariAman; bila tidak, alamat dikembalikan apa adanya. */
export function denganDari(href: string, asal: string): string {
  const a = dariAman(asal);
  if (!a) return href;
  const [tanpaHash, hash] = href.split("#");
  const sambung = tanpaHash.includes("?") ? "&" : "?";
  return `${tanpaHash}${sambung}dari=${encodeURIComponent(a)}${hash ? `#${hash}` : ""}`;
}
