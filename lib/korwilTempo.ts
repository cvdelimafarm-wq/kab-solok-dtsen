// lib/korwilTempo.ts  (murni, tanpa database)
//
// (27 Okt 2026) Lembar Supervisi > Monitoring Lapangan: PERINGATAN tiap tim -- apakah pendataan tim akan selesai sebelum batas kegiatan?
// Dasar hitung (permintaan user: "sisa target pendataan tim" dan "target pendataan harian"):
//   sisa            = target tim - KK berhasil didata (angka yang sama dengan kartu tim)
//   hari tersisa    = hari kalender dari HARI INI sampai tanggal selesai kegiatan, dua-duanya dihitung (semua hari dianggap hari kerja: hari kerja PPL
//                     di SIGAP dipilih tiap hari, termasuk Sabtu/Minggu)
//   target harian   = sisa / hari tersisa, dibulatkan ke atas (juga per PPL)
//   kecepatan       = rata-rata KK berhasil didata tim per hari pada sampai 7 hari terakhir SEBELUM hari ini (hari ini belum selesai, jadi tidak dihitung);
//                     bila belum genap 7 hari data, dipakai mulai hari pertama ada KK didata
//   perkiraan selesai = hari ini + ceil(sisa / kecepatan) - 1
// Status (ambang = asumsi, cek aturan; semuanya di satu tempat di bawah):
//   selesai  : sisa 0
//   aman     : kecepatan >= target harian                      (perkiraan selesai paling lambat di batas)
//   waspada  : kecepatan >= 80% target harian                  (hampir, perlu dikejar)
//   warning  : kecepatan < 80% target harian, belum ada kecepatan, atau batas sudah lewat dan masih ada sisa

export const JENDELA_HARI = 7;
export const AMBANG_WASPADA = 0.8;

export type StatusTempo = "selesai" | "aman" | "waspada" | "warning";
export type Tempo = {
  status: StatusTempo;
  sisa: number;
  /** hari kalender tersisa termasuk hari ini; 0 bila batas sudah lewat */
  hariSisa: number;
  /** KK per hari agar selesai tepat di batas (tim) */
  targetHarian: number;
  /** targetHarian dibagi jumlah PPL, dibulatkan ke atas; null bila tim tanpa PPL */
  targetPerPpl: number | null;
  /** rata-rata KK berhasil didata per hari (jendela di atas) */
  kecepatan: number;
  /** jumlah hari yang dipakai menghitung kecepatan */
  hariDinilai: number;
  /** tanggal perkiraan selesai bila kecepatan tidak berubah; null bila kecepatan 0 */
  perkiraanSelesai: string | null;
  /** selisih hari antara perkiraan selesai dan batas (positif = terlambat); null bila perkiraan tidak ada */
  terlambatHari: number | null;
  selesai: string;
};

const MS_HARI = 86_400_000;
const epoch = (t: string): number => Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)));
export const selisihHari = (a: string, b: string): number => Math.round((epoch(b) - epoch(a)) / MS_HARI);
export const geserTanggal = (t: string, n: number): string => new Date(epoch(t) + n * MS_HARI).toISOString().slice(0, 10);

/**
 * @param harian KK berhasil didata tim per tanggal WIB (hanya tanggal yang ada isinya; hari tanpa catatan = 0)
 */
export function hitungTempo(m: { hariIni: string; selesai: string; target: number; realisasi: number; ppl: number; harian: Readonly<Record<string, number>> }): Tempo {
  const sisa = Math.max(0, m.target - m.realisasi);
  const hariSisa = Math.max(0, selisihHari(m.hariIni, m.selesai) + 1);

  // jendela: 7 hari penuh sebelum hari ini, dimulai paling awal pada hari pertama tim punya catatan
  const awalJendela = geserTanggal(m.hariIni, -JENDELA_HARI);
  const tanggalAda = Object.keys(m.harian).filter((t) => t < m.hariIni && (m.harian[t] ?? 0) > 0).sort();
  let kecepatan = 0;
  let hariDinilai = 0;
  if (tanggalAda.length > 0) {
    const mulai = tanggalAda[0] > awalJendela ? tanggalAda[0] : awalJendela;
    hariDinilai = selisihHari(mulai, m.hariIni); // hari mulai .. kemarin
    let jumlah = 0;
    for (let i = 0; i < hariDinilai; i++) jumlah += m.harian[geserTanggal(mulai, i)] ?? 0;
    kecepatan = hariDinilai > 0 ? jumlah / hariDinilai : 0;
  }
  const kec = Math.round(kecepatan * 10) / 10;

  const targetHarian = sisa === 0 ? 0 : hariSisa > 0 ? Math.ceil(sisa / hariSisa) : sisa;
  const targetPerPpl = m.ppl > 0 ? Math.ceil(targetHarian / m.ppl) : null;

  let perkiraanSelesai: string | null = null;
  let terlambatHari: number | null = null;
  if (sisa === 0) {
    perkiraanSelesai = m.hariIni;
    terlambatHari = 0;
  } else if (kecepatan > 0) {
    perkiraanSelesai = geserTanggal(m.hariIni, Math.ceil(sisa / kecepatan) - 1);
    terlambatHari = Math.max(0, selisihHari(m.selesai, perkiraanSelesai));
  }

  let status: StatusTempo;
  if (sisa === 0) status = "selesai";
  else if (hariSisa === 0 || kecepatan <= 0) status = "warning";
  else if (kecepatan >= targetHarian) status = "aman";
  else if (kecepatan >= AMBANG_WASPADA * targetHarian) status = "waspada";
  else status = "warning";

  return { status, sisa, hariSisa, targetHarian, targetPerPpl, kecepatan: kec, hariDinilai, perkiraanSelesai, terlambatHari, selesai: m.selesai };
}

export const LABEL_TEMPO: Record<StatusTempo, string> = { selesai: "Selesai", aman: "Aman", waspada: "Waspada", warning: "Warning" };

/** Ringkas kelompok: jumlah tim per status. */
export function ringkasTempo(daftar: readonly Pick<Tempo, "status">[]): Record<StatusTempo, number> {
  const r: Record<StatusTempo, number> = { selesai: 0, aman: 0, waspada: 0, warning: 0 };
  for (const t of daftar) r[t.status]++;
  return r;
}
