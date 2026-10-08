// lib/sigapTerlewat.ts
//
// (8 Okt 2026) SIGAP > Pelatihan: daftar kegiatan pelatihan yang TERLEWAT (waktunya sudah ditutup dan belum dikerjakan),
// dipakai peringatan merah di halaman Langkah: "kegiatan pelatihan Anda tidak lengkap". Fungsi murni (tanpa React/database).

export type LangkahTerlewat = { kode: string; judul: string; terlewat: boolean };
export type SesiPresensiRingkas = { nama: string; status: string };

/**
 * `langkah` = langkah di halaman Langkah (urut); `sesiPresensi` = sesi presensi hari ini beserta statusnya (null bila
 * presensi belum diatur). Presensi dicek PER SESI, jadi satu sesi yang lewat tetap tercatat walau sesi lain masih bisa.
 */
export function daftarTerlewat(langkah: LangkahTerlewat[], sesiPresensi: SesiPresensiRingkas[] | null): string[] {
  const hasil: string[] = [];
  for (const l of langkah) {
    if (l.kode === "hadir") {
      const lewat = (sesiPresensi ?? []).filter((s) => s.status === "terlewat");
      if (lewat.length === 0) continue;
      const banyak = (sesiPresensi ?? []).length > 1;
      hasil.push(banyak ? `Presensi ${lewat.map((s) => s.nama).join(", ")}` : "Presensi di lokasi pelatihan");
    } else if (l.terlewat) {
      hasil.push(l.judul.replace(/^(Kerjakan|Ikuti)\s+/, ""));
    }
  }
  return hasil;
}
