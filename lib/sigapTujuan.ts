// lib/sigapTujuan.ts
//
// (14 Okt 2026) Tujuan "?lanjut=" sesudah masuk: HANYA alamat internal. Sebelumnya hanya menolak awalan "//", sehingga "/\host" (peramban menormalkan
// "\" menjadi "/") lolos dan dipakai window.location.replace = celah open redirect. Murni (tanpa DOM) supaya mudah diuji.

/** Alamat internal yang aman (diawali satu "/", tanpa "\", "..", karakter kontrol/spasi) atau null. */
export function bersihkanTujuan(l: string | null | undefined): string | null {
  if (!l || l.length > 300) return null;
  if (!l.startsWith("/") || l.startsWith("//")) return null;
  if (l.includes("\\") || l.includes("..") || /[\u0000- \u007f]/.test(l)) return null;
  try {
    const u = new URL(l, "http://internal.invalid");
    if (u.origin !== "http://internal.invalid") return null;
  } catch {
    return null;
  }
  return l;
}

/** "/?lanjut=<alamat sekarang>" bila alamat sekarang aman, selain itu "/" -- dipakai saat sesi berakhir supaya setelah masuk petugas kembali ke halaman yang sama. */
export function alamatMasukDengan(pathname: string, search: string): string {
  const aman = bersihkanTujuan(`${pathname}${search}`);
  return aman && aman !== "/" ? `/?lanjut=${encodeURIComponent(aman)}` : "/";
}
