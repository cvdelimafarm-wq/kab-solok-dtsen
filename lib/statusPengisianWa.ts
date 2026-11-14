// lib/statusPengisianWa.ts  (murni)
//
// (14 Nov 2026) Templat monitoring pemahaman, salin status untuk WA (K7), putusan Ketua Tim 14 Nov:
//  - yang disalin HANYA status pengisian tiap tahapan yang aktif (undangan, hadir, materi, pretest, posttest, ...); nilai, soal, dan jawaban tidak ikut;
//  - (14 Nov 2026, 15.46) putusan Ketua Tim: gambar memuat NAMA peserta, satu baris per orang dengan ✓/✗ tiap tahapan; rekap jumlah tetap di atas;
//  - bentuk: gambar tabel (tahapan, terisi, sudah, belum) + teks pengantar tetap; nama kegiatan, kelas, hari, tanggal, jam, dan tautan diisi otomatis.
// Hitungan dari baris Monitoring yang sama dengan kartu Ringkasan (data sudah disaring server menurut cakupan pemantau).

export type KodeTahapanWa = "undangan" | "hadir" | "materi" | "pretest" | "posttest";
export type BarisStatusWa = { nama?: string; kelas: number | null; undangan: string; hadir: boolean; pretest: { status: string }; posttest: { status: string }; materi?: { belum: number } | null };
export type StatusTahapanWa = { kode: KodeTahapanWa; label: string; terisi: string; sudah: number; belum: number };

export const LABEL_TAHAPAN_WA: Record<KodeTahapanWa, string> = { undangan: "Menerima undangan", hadir: "Kehadiran", materi: "Materi wajib", pretest: "Pretest", posttest: "Posttest" };
/** Label pendek untuk kolom tabel nama. */
export const LABEL_PENDEK_WA: Record<KodeTahapanWa, string> = { undangan: "Undangan", hadir: "Hadir", materi: "Materi", pretest: "Pretest", posttest: "Posttest" };

/** Tahapan yang tersedia untuk dipilih (materi hanya bila ada materi wajib). */
export function tahapanTersediaWa(baris: readonly BarisStatusWa[]): KodeTahapanWa[] {
  const ada: KodeTahapanWa[] = ["undangan", "hadir"];
  if (baris.some((b) => b.materi)) ada.push("materi");
  ada.push("pretest", "posttest");
  return ada;
}

/** Apakah satu orang sudah menyelesaikan satu tahapan. */
export function sudahTahap(b: BarisStatusWa, k: KodeTahapanWa): boolean {
  if (k === "undangan") return b.undangan === "terima";
  if (k === "hadir") return b.hadir;
  if (k === "materi") return !!b.materi && b.materi.belum === 0;
  return b[k].status === "selesai";
}

/** Tabel nama × tahapan untuk gambar WA: satu baris per orang (kelas terpilih), urut nama. */
export function tabelNamaWa(baris: readonly BarisStatusWa[], kelas: number | null, pilih: readonly KodeTahapanWa[]): { nama: string; sudah: boolean[] }[] {
  const xs = kelas === null ? baris : baris.filter((b) => b.kelas === kelas);
  return xs
    .map((b) => ({ nama: (b.nama ?? "").trim() || "-", sudah: pilih.map((k) => sudahTahap(b, k)) }))
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

export function hitungStatusWa(baris: readonly BarisStatusWa[], kelas: number | null, pilih: readonly KodeTahapanWa[]): { total: number; tahapan: StatusTahapanWa[] } {
  const xs = kelas === null ? baris : baris.filter((b) => b.kelas === kelas);
  const n = xs.length;
  const sudahDari = (k: KodeTahapanWa): number => xs.filter((b) => sudahTahap(b, k)).length;
  return {
    total: n,
    tahapan: pilih.map((k) => {
      const sudah = sudahDari(k);
      return { kode: k, label: LABEL_TAHAPAN_WA[k], terisi: `${n ? Math.round((sudah / n) * 100) : 0}%`, sudah, belum: n - sudah };
    }),
  };
}

/** Teks pengantar tetap (tanpa angka dan tanpa nama). */
export function teksPengantarWa(o: { kegiatan: string; kelas: number | null; waktu: Date; tautan: string }): string {
  const tgl = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(o.waktu);
  const jam = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(o.waktu).replace(":", ".");
  const hari = tgl.charAt(0).toUpperCase() + tgl.slice(1);
  return `*Status pengisian · ${o.kegiatan} · ${o.kelas === null ? "Semua kelas" : `Kelas ${o.kelas}`}*\n${hari} pukul ${jam} WIB\n\nYang belum, mohon segera melengkapi di SIGAP: ${o.tautan}`;
}
