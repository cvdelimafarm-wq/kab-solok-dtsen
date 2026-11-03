// lib/linimasaJadwal.ts  (murni; dipakai klien dan diuji)
//
// (3 Nov 2026) Model linimasa "Jadwal Anda" di tab Hari ini peserta pelatihan, dari sudut pandang PPL / PML: jadwal PELATIHAN dan jadwal PENDATAAN LAPANGAN pada satu
// sumbu tanggal (gaya Gantt): kolom hari (akhir pekan diarsir), penanda hari ini, batang pelatihan dan batang pendataan (Perkiraan = bergaris), hitung mundur ke agenda
// berikutnya, tahapan (Pelatihan -> Pendataan -> Selesai), dan satu kalimat fokus sesuai peran. Tanggal YYYY-MM-DD (WIB); `hariIni` diberikan pemanggil.

import { hariKe, ringkasPeriode, selisihHari, tambahHari, tanggalPendek, type PeriodeJadwalKartu } from "@/lib/jadwalPendataanTampil";

export type MasukanLinimasa = {
  hariIni: string;
  /** Jadwal kegiatan pelatihan (selesai kosong = satu hari). */
  pelatihan: { mulai: string; selesai?: string | null } | null;
  pendataan: readonly PeriodeJadwalKartu[];
  /** "ppl" | "pml" | "korwil" | lainnya / null */
  peran: string | null;
};

export type StatusAgenda = "belum" | "berjalan" | "selesai";

export type KolomHari = { tgl: string; angka: number; huruf: string; akhirPekan: boolean; hariIni: boolean };
export type Lajur = {
  kunci: string;
  jenis: "pelatihan" | "pendataan";
  label: string;
  /** indeks kolom (0..) tempat batang mulai, sudah dipotong ke jendela */
  mulaiIdx: number;
  panjang: number;
  mulai: string;
  selesai: string;
  hari: number;
  status: StatusAgenda;
  persen: number;
  perkiraan: boolean;
  ket: string;
  rentangPendek: string;
  mulaiTeks: string;
  selesaiTeks: string;
};
export type Berikutnya = { jenis: "belum" | "berjalan" | "selesai"; judul: string; angka: string; satuan: string; ket: string };
export type Fase = { kunci: string; label: string; status: StatusAgenda };
export type Linimasa = {
  hari: KolomHari[];
  bulan: { nama: string; kolom: number }[];
  indeksHariIni: number;
  lajur: Lajur[];
  berikutnya: Berikutnya;
  fase: Fase[];
  fokus: string;
  peranTeks: string | null;
};

const TGL = /^\d{4}-\d{2}-\d{2}$/;
const HURUF = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]; // Minggu .. Sabtu
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MAKS_KOLOM = 60;

export const PERAN_TEKS: Record<string, string> = { ppl: "PPL · Petugas Pendataan Lapangan", pml: "PML · Petugas Pemeriksa Lapangan", korwil: "Korwil · Koordinator Wilayah" };

type Agenda = { kunci: string; jenis: "pelatihan" | "pendataan"; label: string; mulai: string; selesai: string; perkiraan: boolean };

function kumpulAgenda(m: MasukanLinimasa): Agenda[] {
  const a: Agenda[] = [];
  if (m.pelatihan && TGL.test(m.pelatihan.mulai)) {
    const sel = m.pelatihan.selesai && TGL.test(m.pelatihan.selesai) && m.pelatihan.selesai >= m.pelatihan.mulai ? m.pelatihan.selesai : m.pelatihan.mulai;
    a.push({ kunci: "pelatihan", jenis: "pelatihan", label: "Pelatihan", mulai: m.pelatihan.mulai, selesai: sel, perkiraan: false });
  }
  const banyak = m.pendataan.length > 1;
  for (const p of m.pendataan) {
    if (!TGL.test(p.mulai) || !TGL.test(p.selesai) || p.selesai < p.mulai) continue;
    a.push({ kunci: `pendataan-${p.periode}`, jenis: "pendataan", label: banyak ? `Pendataan ${p.periode}` : "Pendataan lapangan", mulai: p.mulai, selesai: p.selesai, perkiraan: p.perkiraan });
  }
  return a.sort((x, y) => x.mulai.localeCompare(y.mulai) || x.kunci.localeCompare(y.kunci));
}

function fokusKalimat(peran: string | null, fase: "sebelum" | "pelatihan" | "jeda" | "pendataan" | "selesai", ke: number, dari: number): string {
  const pml = peran === "pml";
  switch (fase) {
    case "sebelum":
      return pml ? "Pahami materi dan instrumen sebagai pemeriksa: Anda mendampingi PPL dan memeriksa hasil isiannya." : "Siapkan diri: baca undangan, pelajari instrumen, dan latihan Vanguard sebelum pelatihan.";
    case "pelatihan":
      return "Hadir tepat waktu, isi presensi tiap sesi, lalu kerjakan pretest dan posttest.";
    case "jeda":
      return pml ? "Pelatihan selesai. Cek daftar PPL dan wilayah yang Anda periksa, serta siapkan perangkat." : "Pelatihan selesai. Cek wilayah tugas dan siapkan perangkat serta Kamera SIGAP untuk turun ke lapangan.";
    case "pendataan":
      return pml
        ? `Pendataan hari ke-${ke} dari ${dari}: pantau kemajuan PPL setiap hari, periksa isian yang janggal, dan bantu kendala lapangan.`
        : `Pendataan hari ke-${ke} dari ${dari}: selesaikan wilayah tugas sesuai jadwal dan unggah foto bukti dengan Kamera SIGAP.`;
    default:
      return "Seluruh jadwal sudah lewat. Terima kasih atas kerja Anda.";
  }
}

export function susunLinimasa(m: MasukanLinimasa): Linimasa | null {
  if (!TGL.test(m.hariIni)) return null;
  const agenda = kumpulAgenda(m);
  if (agenda.length === 0) return null;

  // jendela tanggal: dari (paling awal antara hari ini dan mulai) - 1 sampai (paling akhir antara hari ini dan selesai) + 1, maksimal 60 kolom
  let awal = agenda.reduce((a, x) => (x.mulai < a ? x.mulai : a), m.hariIni);
  let akhir = agenda.reduce((a, x) => (x.selesai > a ? x.selesai : a), m.hariIni);
  awal = tambahHari(awal, -1);
  akhir = tambahHari(akhir, 1);
  if (selisihHari(akhir, awal) + 1 > MAKS_KOLOM) {
    // terlalu panjang: pangkas dari kiri tetapi pertahankan hari ini bila masih dalam jendela
    awal = tambahHari(akhir, -(MAKS_KOLOM - 1));
    if (m.hariIni < awal) awal = tambahHari(m.hariIni, -1);
  }
  const n = Math.min(MAKS_KOLOM, selisihHari(akhir, awal) + 1);
  akhir = tambahHari(awal, n - 1);

  const hari: KolomHari[] = [];
  for (let i = 0; i < n; i++) {
    const tgl = tambahHari(awal, i);
    const w = hariKe(tgl);
    hari.push({ tgl, angka: Number(tgl.slice(8)), huruf: HURUF[w] ?? "", akhirPekan: w === 0 || w === 6, hariIni: tgl === m.hariIni });
  }
  const bulan: { nama: string; kolom: number }[] = [];
  for (const h of hari) {
    const nama = `${BULAN[Number(h.tgl.slice(5, 7)) - 1]} ${h.tgl.slice(0, 4)}`;
    const terakhir = bulan[bulan.length - 1];
    if (terakhir && terakhir.nama === nama) terakhir.kolom += 1;
    else bulan.push({ nama, kolom: 1 });
  }
  const indeksHariIni = hari.findIndex((h) => h.hariIni);

  const lajur: Lajur[] = [];
  for (const a of agenda) {
    const r = ringkasPeriode({ mulai: a.mulai, selesai: a.selesai }, m.hariIni);
    if (!r) continue;
    const dari = Math.max(0, selisihHari(a.mulai, awal));
    const sampai = Math.min(n - 1, selisihHari(a.selesai, awal));
    if (sampai < dari) continue;
    lajur.push({
      kunci: a.kunci,
      jenis: a.jenis,
      label: a.label,
      mulaiIdx: dari,
      panjang: sampai - dari + 1,
      mulai: a.mulai,
      selesai: a.selesai,
      hari: r.hari,
      status: r.status,
      persen: r.persen,
      perkiraan: a.perkiraan,
      ket: r.ket,
      rentangPendek: a.mulai === a.selesai ? tanggalPendek(a.mulai) : `${tanggalPendek(a.mulai)} – ${tanggalPendek(a.selesai)}`,
      mulaiTeks: r.mulaiTeks,
      selesaiTeks: r.selesaiTeks,
    });
  }
  if (lajur.length === 0) return null;

  // agenda berikutnya / yang sedang berjalan
  const jalan = lajur.find((l) => l.status === "berjalan");
  const depan = lajur.find((l) => l.status === "belum");
  let berikutnya: Berikutnya;
  if (jalan) {
    const ke = selisihHari(m.hariIni, jalan.mulai) + 1;
    const sisa = jalan.hari - ke;
    berikutnya = {
      jenis: "berjalan",
      judul: `${jalan.label} sedang berjalan`,
      angka: `${ke}/${jalan.hari}`,
      satuan: "hari",
      ket: sisa === 0 ? "Hari terakhir" : `${sisa} hari lagi sampai ${jalan.selesaiTeks}`,
    };
  } else if (depan) {
    const d = selisihHari(depan.mulai, m.hariIni);
    berikutnya = { jenis: "belum", judul: `${depan.label} dimulai`, angka: d === 1 ? "Besok" : String(d), satuan: d === 1 ? "" : "hari lagi", ket: depan.mulaiTeks };
  } else {
    berikutnya = { jenis: "selesai", judul: "Semua jadwal sudah selesai", angka: "✓", satuan: "", ket: "Terima kasih" };
  }

  // tahapan
  const adaPel = lajur.some((l) => l.jenis === "pelatihan");
  const pend = lajur.filter((l) => l.jenis === "pendataan");
  const statusGab = (ls: Lajur[]): StatusAgenda => (ls.every((l) => l.status === "selesai") ? "selesai" : ls.some((l) => l.status === "berjalan") || (ls.some((l) => l.status === "selesai") && ls.some((l) => l.status === "belum")) ? "berjalan" : "belum");
  const fase: Fase[] = [];
  if (adaPel) fase.push({ kunci: "pelatihan", label: "Pelatihan", status: statusGab(lajur.filter((l) => l.jenis === "pelatihan")) });
  if (pend.length) fase.push({ kunci: "pendataan", label: "Pendataan", status: statusGab(pend) });
  fase.push({ kunci: "selesai", label: "Selesai", status: fase.length > 0 && fase.every((f) => f.status === "selesai") ? "selesai" : "belum" });

  // fokus peran
  const peran = m.peran ? m.peran.toLowerCase() : null;
  const pel = lajur.find((l) => l.jenis === "pelatihan");
  const pen = pend.find((l) => l.status === "berjalan");
  let fokus: string;
  if (pen) fokus = fokusKalimat(peran, "pendataan", selisihHari(m.hariIni, pen.mulai) + 1, pen.hari);
  else if (pel && pel.status === "berjalan") fokus = fokusKalimat(peran, "pelatihan", 0, 0);
  else if (pel && pel.status === "belum") fokus = fokusKalimat(peran, "sebelum", 0, 0);
  else if (pend.some((l) => l.status === "belum")) fokus = fokusKalimat(peran, pel ? "jeda" : "sebelum", 0, 0);
  else fokus = fokusKalimat(peran, "selesai", 0, 0);

  return { hari, bulan, indeksHariIni, lajur, berikutnya, fase, fokus, peranTeks: peran && PERAN_TEKS[peran] ? PERAN_TEKS[peran] : null };
}
