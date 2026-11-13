// app/portal/luring.ts
//
// (14 Nov 2026, luring tingkat 1; docs/luring-aturan.md L10-L11) Pembantu klien untuk simpanan luring.
//  * buangKerangkaHalaman(): minta service worker membuang kerangka halaman tersimpan (saat keluar akun; HP bisa dipakai bergantian).
//  * catatDaring() / terakhirDaring(): waktu terakhir halaman berhasil memuat dengan sinyal, untuk pita "Tanpa sinyal · terakhir tersambung pukul ...".

const KUNCI_DARING = "sigap_terakhir_daring";

export function buangKerangkaHalaman(): void {
  try {
    navigator.serviceWorker?.controller?.postMessage({ tipe: "hapus-halaman" });
  } catch {
    /* tanpa service worker: tidak ada yang perlu dibuang */
  }
}

export function catatDaring(waktu: number = Date.now()): void {
  try {
    localStorage.setItem(KUNCI_DARING, String(waktu));
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

export function terakhirDaring(): number | null {
  try {
    const n = Number(localStorage.getItem(KUNCI_DARING));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** "pukul 14.05" (hari ini) atau "13 Nov pukul 14.05" (hari lain), zona WIB. */
export function teksTerakhir(ms: number, sekarang: number = Date.now()): string {
  const wib = (x: number) => new Date(x + 7 * 3_600_000);
  const a = wib(ms);
  const b = wib(sekarang);
  const jam = `${String(a.getUTCHours()).padStart(2, "0")}.${String(a.getUTCMinutes()).padStart(2, "0")}`;
  const samaHari = a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return samaHari ? `pukul ${jam}` : `${a.getUTCDate()} ${BULAN[a.getUTCMonth()]} pukul ${jam}`;
}
