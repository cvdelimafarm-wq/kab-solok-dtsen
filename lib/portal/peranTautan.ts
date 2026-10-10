// lib/portal/peranTautan.ts  (murni, tanpa DB -- bisa dipakai server maupun diuji)
//
// (10 Okt 2026) Label peran di kepala Beranda ("Admin Anggaran", "Admin Aplikasi", dst.) kini bisa DITEKAN dan membuka lembar yang sesuai
// -- permintaan user: "list role ini bisa ditekan dan akan menavigasikan ke lembar yg sesuai".
// Tautan dihitung di server dari KODE peran + kartu pengelolaan yang memang boleh dilihat akun itu, jadi tidak pernah menunjuk ke
// halaman yang tidak boleh dibuka (bila kartunya tidak ada -> tautan null -> label tidak bisa ditekan).

export type KartuRingkas = { kode: string; href?: string | null; judul?: string };

/** Kartu pengelolaan yang menjadi tujuan tiap kode peran, berurutan: yang pertama tersedia dipakai. */
const TUJUAN: Record<string, string[]> = {
  admin_anggaran: ["admin-translok"],
  admin_aplikasi: ["portal-admin"],
  admin_bencana: ["admin-bencana"],
  admin_delego: ["admin-delego", "@/sigap/kelola/delego"], // href Delego di portal_aplikasi masih kosong -> pakai halaman kelola Delego
  admin_dtsen: ["admin-dtsen"],
  admin_penyisiran: ["admin-penyisiran"],
  admin_seruti: ["admin-seruti"],
  bendahara: ["admin-translok"],
  pj_kegiatan: ["admin-translok"],
  pengelola_psp: ["admin-bencana", "admin-translok"],
  // Instruktur & panitia pelatihan: halaman Kelola Pelatihan (kartu pelatihan-kelola dibuat di Beranda, bukan di server).
  instruktur_pelatihan: ["@/sigap/kelola/pelatihan"],
  panitia_pelatihan: ["@/sigap/kelola/pelatihan"],
};

/** Tujuan untuk satu kode peran, atau null bila tidak ada halaman yang sesuai/tersedia. Entri berawalan "@" = alamat langsung. */
export function tautanPeran(kodePeran: string, kartu: KartuRingkas[]): string | null {
  for (const t of TUJUAN[kodePeran] ?? []) {
    if (t.startsWith("@")) return t.slice(1);
    const k = kartu.find((x) => x.kode === t);
    if (k?.href) return k.href;
  }
  return null;
}

/** (11 Okt 2026) Nama ubin untuk alamat langsung (tanpa kartu server). */
const NAMA_ALAMAT: Record<string, string> = {
  "/sigap/kelola/pelatihan": "Kelola Pelatihan",
  "/sigap/kelola/delego": "Admin Delego",
};

export type ChipPeran = { label: string; href: string | null };

/**
 * (11 Okt 2026) Chip peran di kepala Beranda -- keputusan user "chip ikut nama ubin": label chip yang bisa ditekan = nama ubin tujuannya
 * (dulu "Admin Anggaran" -> ubin "Admin Transport Lokal", dua nama untuk satu halaman). Chip dengan tujuan sama digabung (dulu /bencana
 * muncul sebagai "Admin Bencana" dan "Pengelola PSP Pascabencana"). Peran tanpa halaman tetap tampil sebagai label biasa (nama peran).
 */
export function chipPeran(peran: { kode: string; nama: string }[], kartu: KartuRingkas[]): ChipPeran[] {
  const hasil: ChipPeran[] = [];
  const sudah = new Set<string>();
  for (const p of peran) {
    const href = tautanPeran(p.kode, kartu);
    if (!href) {
      if (!hasil.some((c) => !c.href && c.label === p.nama)) hasil.push({ label: p.nama, href: null });
      continue;
    }
    if (sudah.has(href)) continue;
    sudah.add(href);
    const judul = kartu.find((k) => k.href === href)?.judul ?? NAMA_ALAMAT[href] ?? p.nama;
    hasil.push({ label: judul, href });
  }
  return hasil;
}
