// lib/vanguard/sertifikasi/jeda.ts  (murni)
//
// (1 Nov 2026) VANGUARD V7d: aturan kapan petugas boleh memulai Ujian Sertifikasi atau Latihan (keputusan Iqbal 1 Nov):
//   - Selama BELUM pernah menyelesaikan sertifikasi: sertifikasi boleh dicoba 1 kali per hari (hari menurut WIB, dihitung dari saat DIMULAI).
//   - Setelah pernah menyelesaikan satu sertifikasi: sertifikasi baru terbuka lagi 5 hari setelah hari selesai terakhir; sebelum itu hanya LATIHAN (format sama, tidak mengubah sertifikat).
//   - Ujian yang DIBATALKAN (tingkat kosong) tidak dihitung selesai, tetapi tetap menghabiskan jatah sertifikasi hari itu.
//   - Latihan selalu boleh. Hanya satu ujian berjalan pada satu waktu; ujian yang tidak selesai dalam 12 jam dianggap kedaluwarsa.
// (Tafsiran atas pesan Iqbal; mudah diubah di konstanta di bawah.)

export const JEDA_ULANG_HARI = 5;
export const KEDALUWARSA_JAM = 12;
export type RiwayatUjian = { id: number; jenis: "sertifikasi" | "latihan"; mulai_at: string; selesai_at: string | null; /** null pada ujian yang dibatalkan (selesai_at terisi, tanpa skor) */ tingkat?: number | null };

const MS_HARI = 86_400_000;
const WIB = 7 * 3_600_000;
/** Nomor hari menurut WIB (bilangan bulat; hari berganti pukul 00.00 WIB). */
export const hariWibNomor = (iso: string | number | Date): number => Math.floor((new Date(iso).getTime() + WIB) / MS_HARI);
const awalHariWib = (nomor: number): Date => new Date(nomor * MS_HARI - WIB);

export type StatusUjian = {
  berjalan: RiwayatUjian | null;
  sertifikasiBoleh: boolean;
  alasan: string | null;
  /** ISO waktu sertifikasi berikutnya terbuka (bila sedang ditahan), selain itu null. */
  bukaLagi: string | null;
  sudahBersertifikat: boolean;
};

export function statusUjian(riwayat: RiwayatUjian[], sekarang: Date): StatusUjian {
  const ms = sekarang.getTime();
  const urut = [...riwayat].sort((a, b) => new Date(b.mulai_at).getTime() - new Date(a.mulai_at).getTime());
  const berjalan = urut.find((u) => !u.selesai_at && ms - new Date(u.mulai_at).getTime() < KEDALUWARSA_JAM * 3_600_000) ?? null;
  const selesai = urut.filter((u) => u.jenis === "sertifikasi" && !!u.selesai_at && u.tingkat !== null);
  const sudahBersertifikat = selesai.length > 0;
  if (!sudahBersertifikat) {
    const hariIni = hariWibNomor(sekarang);
    const sudahHariIni = urut.some((u) => u.jenis === "sertifikasi" && hariWibNomor(u.mulai_at) === hariIni);
    if (sudahHariIni) return { berjalan, sertifikasiBoleh: false, alasan: "Sertifikasi dapat dicoba satu kali per hari. Coba lagi besok, atau berlatih dulu.", bukaLagi: awalHariWib(hariIni + 1).toISOString(), sudahBersertifikat };
    return { berjalan, sertifikasiBoleh: true, alasan: null, bukaLagi: null, sudahBersertifikat };
  }
  const terakhir = selesai.reduce((a, b) => (new Date(b.selesai_at as string) > new Date(a.selesai_at as string) ? b : a));
  const buka = awalHariWib(hariWibNomor(terakhir.selesai_at as string) + JEDA_ULANG_HARI);
  if (ms < buka.getTime()) return { berjalan, sertifikasiBoleh: false, alasan: `Sertifikasi ulang terbuka lagi ${JEDA_ULANG_HARI} hari setelah ujian selesai. Sementara itu Anda bisa berlatih dengan format yang sama.`, bukaLagi: buka.toISOString(), sudahBersertifikat };
  return { berjalan, sertifikasiBoleh: true, alasan: null, bukaLagi: null, sudahBersertifikat };
}
