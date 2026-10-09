// lib/sigapGerbangApp.ts
//
// (8 Okt 2026) Gerbang "wajib lewat aplikasi" -- permintaan user: "semuanya jika dibuka di HP maka wajib lewat aplikasi",
// berlaku langsung setelah deploy. Logika murni (tanpa React) supaya mudah diuji. Dipakai app/components/GerbangAplikasi.tsx.
//
// Yang dikunci: beranda portal ("/") dan seluruh /sigap/*, KECUALI tautan bertoken petugas (/sigap/translok/...) karena tautan itu
// dikirim lewat WhatsApp dan harus tetap bisa dibuka dari browser. Halaman modul lain (bencana, undangan, penyisiran, dashboard
// Wali Nagari) tidak ikut dikunci.
// Catatan: pemeriksaan ini di sisi browser. Ia mengarahkan pengguna HP ke aplikasi, bukan pengaman data (data tetap dijaga sesi/PIN).

export const KUNCI_IZIN_BROWSER = "sigap_izin_browser";
/** Lama izin darurat (kode dari panitia) berlaku di satu browser. */
export const LAMA_IZIN_BROWSER_MS = 12 * 3_600_000;

/** Apakah jalur ini wajib dibuka lewat aplikasi (bila perangkatnya HP). */
export function jalurWajibApp(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (p === "/") return true;
  if (p === "/sigap") return true;
  if (p.startsWith("/sigap/")) return !(p === "/sigap/translok" || p.startsWith("/sigap/translok/"));
  return false;
}

/** HP/tablet (Android, iPhone, iPad). iPadOS Safari mengaku "Macintosh" tetapi layarnya sentuh. */
export function perangkatSeluler(ua: string, maxTouchPoints = 0): boolean {
  if (/android|iphone|ipad|ipod/i.test(ua)) return true;
  return /macintosh/i.test(ua) && maxTouchPoints > 1;
}

export function perangkatIos(ua: string, maxTouchPoints = 0): boolean {
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && maxTouchPoints > 1);
}

/** Browser tertanam (WhatsApp/Facebook/Instagram/Line/WebView) yang tidak bisa memasang aplikasi. */
export function browserTertanam(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|Snapchat|Twitter|WhatsApp|; wv\)|WebView/i.test(ua);
}

/**
 * (9 Okt 2026) Jalur pemasangan menurut HP + browser -- permintaan user: "perbaiki agar semua masalah teratasi" dan
 * "utamakan tombol pintas seperti install". Menentukan tombol utama di halaman pasang:
 * - "android"          : Chrome/Samsung Internet/Edge/Opera Android -> tombol "Instal SIGAP" (dialog bawaan; cadangan: menu ⋮)
 * - "tertanam-android" : browser di dalam WhatsApp/FB/IG di Android -> tombol "Buka di Chrome"
 * - "ios-safari"       : iPhone Safari -> Bagikan › Tambahkan ke Layar Utama
 * - "ios-chrome"       : iPhone Chrome (iOS 16.4+ bisa) -> Bagikan di kolom alamat › Tambahkan ke Layar Utama
 * - "ios-lain"         : browser iPhone lain atau browser tertanam di iPhone -> salin tautan, buka di Safari
 */
export type JalurPasang = "android" | "tertanam-android" | "ios-safari" | "ios-chrome" | "ios-lain";

export function jalurPasang(ua: string, maxTouchPoints = 0): JalurPasang {
  const tertanam = browserTertanam(ua);
  if (perangkatIos(ua, maxTouchPoints)) {
    if (tertanam) return "ios-lain";
    if (/crios/i.test(ua)) return "ios-chrome";
    if (safariIos(ua)) return "ios-safari";
    return "ios-lain";
  }
  return tertanam ? "tertanam-android" : "android";
}

/** iPhone: hanya Safari yang bisa "Tambahkan ke Layar Utama" (Chrome/Firefox iOS tidak lagi tersedia untuk ini di sebagian versi; arahkan ke Safari). */
export function safariIos(ua: string): boolean {
  return /safari/i.test(ua) && !/crios|fxios|edgios|opios|fban|fbav|instagram|line\//i.test(ua);
}

/** Sedang berjalan sebagai aplikasi terpasang (bukan tab browser)? */
export function modeAplikasi(x: { standalone?: boolean; fullscreenAtauMinimal?: boolean; iosStandalone?: boolean; referrer?: string }): boolean {
  return !!x.standalone || !!x.fullscreenAtauMinimal || !!x.iosStandalone || (x.referrer ?? "").startsWith("android-app://");
}

/** Isi localStorage izin darurat -> masih berlaku? */
export function izinBrowserBerlaku(raw: string | null, sekarangMs: number): boolean {
  if (!raw) return false;
  try {
    const v = JSON.parse(raw) as { sampai?: unknown };
    return typeof v.sampai === "number" && v.sampai > sekarangMs && v.sampai - sekarangMs <= LAMA_IZIN_BROWSER_MS + 60_000;
  } catch {
    return false;
  }
}

/** Tautan Android yang membuka halaman ini langsung di Chrome (keluar dari browser tertanam). */
export function tautanBukaChrome(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.protocol !== "https:") return null;
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return null;
  }
}
