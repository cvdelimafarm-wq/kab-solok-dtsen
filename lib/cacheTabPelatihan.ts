// lib/cacheTabPelatihan.ts
//
// (3 Nov 2026) Rencana PREFETCH untuk bilah tab pelatihan (Hari ini · Instrumen · Pelatihan · Absen · Kamera · Monitoring). Murni (tanpa React/jaringan) supaya bisa diuji.
// Selagi peserta membaca satu tab, kode halaman dan data tab LAIN diambil di belakang ke simpanan bersama (app/portal/dataBersama.ts), sehingga saat tab diketuk
// isinya langsung tampil. Yang SENGAJA tidak masuk daftar: tes (Pretest/Posttest), kuis live, kuis pra, dan pulsa -- semuanya harus selalu segar dari server.

export type TabRencana = { kode: string; href: string | null };
export type RencanaTab = { rute: string[]; data: string[] };

/** Data yang dibaca tiap tab, dalam urutan diambil. Alamat TANPA ?kegiatan= (pemanggil menambahkan lewat urlPelatihan). */
export const DATA_TAB: Record<string, string[]> = {
  "hari-ini": ["/api/sigap/pelatihan/ketentuan"],
  instrumen: ["/api/sigap/pelatihan/instrumen", "/api/sigap/pelatihan/materi"],
  pelatihan: ["/api/sigap/pelatihan", "/api/sigap/pelatihan/kelas"],
  monitoring: ["/api/sigap/pelatihan/monitoring"],
  absen: [], // sesi absen berubah menit ke menit dan punya filter sendiri: hanya kodenya yang disiapkan
  kamera: ["/api/sigap/foto/mode"], // alamat tanpa kegiatan: sama dengan yang dibuka halaman Kamera SIGAP
};

/** Alamat internal (diawali satu "/") saja yang boleh di-prefetch. */
const internal = (x: string | null | undefined): x is string => !!x && x.startsWith("/") && !x.startsWith("//");

/**
 * Rencana untuk tab yang sedang dibuka (`aktif`): semua tab LAIN yang punya tautan. Tab aktif tidak ikut (halamannya memuat sendiri).
 * `ubahUrl` menyesuaikan alamat data (mis. menambah ?kegiatan=ID); bawaannya apa adanya.
 */
export function rencanaTab(aktif: string, tab: TabRencana[], ubahUrl: (url: string) => string = (u) => u): RencanaTab {
  const rute: string[] = [];
  const data: string[] = [];
  const lihat = new Set<string>();
  for (const t of tab) {
    if (t.kode === aktif || !internal(t.href)) continue;
    if (!rute.includes(t.href)) rute.push(t.href);
    for (const d of DATA_TAB[t.kode] ?? []) {
      const u = d.startsWith("/api/sigap/pelatihan") ? ubahUrl(d) : d;
      if (!lihat.has(u)) {
        lihat.add(u);
        data.push(u);
      }
    }
  }
  return { rute, data };
}
