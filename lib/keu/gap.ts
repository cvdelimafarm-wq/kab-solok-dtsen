// lib/keu/gap.ts
//
// (25 Okt 2026, tahap 32) Peringatan pelaksanaan dan laporan Gap: membandingkan RENCANA (identifikasi lanjutan, jadwal pendataan, kebutuhan biaya) dengan
// KENYATAAN pelaksanaan (penugasan, laporan harian, rapat evaluasi, sisa pagu) yang dibaca lewat keu_pelaksanaan_bahan. Berkas ini MURNI (tanpa basis data).
// Hasilnya daftar temuan bertingkat info/sedang/keras. Temuan tidak pernah memblokir apa pun; yang keras hanya diberitahukan kepada PPK sesudah disimpan.

import { selisihHari } from "./identifikasi";
import { KODE_PERAN, NAMA_PERAN, type BarisRincian, type IsiLanjutan, type KodePeran } from "./lanjutan";
import { type BahanPelaksanaan, type KegiatanBahan, agendaEvaluasi, kesiapanBiaya, ringkasLaporan, selarasJadwal } from "./pelaksanaan";
import type { Form } from "./identifikasi";
import type { Nada } from "./identifikasiHilir";

export type Tingkat = "info" | "sedang" | "keras";
export const TINGKAT: readonly Tingkat[] = ["keras", "sedang", "info"];
export const LABEL_TINGKAT: Record<Tingkat, { teks: string; nada: Nada; urut: number }> = {
  keras: { teks: "Keras", nada: "merah", urut: 1 },
  sedang: { teks: "Perlu perhatian", nada: "kuning", urut: 2 },
  info: { teks: "Informasi", nada: "abu", urut: 3 },
};
export type KategoriGap = "tautan" | "petugas" | "jadwal" | "laporan" | "biaya" | "evaluasi" | "kebijakan";
export const KATEGORI_GAP: readonly KategoriGap[] = ["tautan", "petugas", "jadwal", "laporan", "biaya", "evaluasi", "kebijakan"];
export const NAMA_KATEGORI: Record<KategoriGap, string> = {
  tautan: "Tautan kegiatan", petugas: "Jumlah petugas", jadwal: "Jadwal", laporan: "Laporan harian", biaya: "Biaya dan pagu", evaluasi: "Evaluasi", kebijakan: "Kebijakan",
};
export type JenisGap = "berjalan" | "akhir";
export const NAMA_JENIS_GAP: Record<JenisGap, string> = { berjalan: "Peringatan pelaksanaan", akhir: "Laporan Gap akhir" };

/** Satu temuan. `kunci` stabil antarpenyimpanan (dipakai untuk tanggapan); `tuju` = id kartu pada halaman Pelaksanaan (opsional). */
export type Temuan = { kunci: string; kategori: KategoriGap; tingkat: Tingkat; pesan: string; tuju: string | null };

const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const teks = (x: unknown): string => (typeof x === "string" ? x : "");

/** Mengubah larik JSON dari basis data menjadi temuan yang aman dipakai tampilan; yang tidak sah dibuang. */
export function normalisasiTemuan(x: unknown): Temuan[] {
  if (!Array.isArray(x)) return [];
  const out: Temuan[] = [];
  for (const e of x) {
    if (!adalahObjek(e)) continue;
    const tingkat = teks(e.tingkat) as Tingkat;
    const kategori = teks(e.kategori) as KategoriGap;
    if (!TINGKAT.includes(tingkat) || !KATEGORI_GAP.includes(kategori) || teks(e.kunci) === "" || teks(e.pesan) === "") continue;
    out.push({ kunci: teks(e.kunci), kategori, tingkat, pesan: teks(e.pesan), tuju: teks(e.tuju) || null });
  }
  return out;
}

export const urutkanTemuan = (t: Temuan[]): Temuan[] =>
  [...t].sort((a, b) => LABEL_TINGKAT[a.tingkat].urut - LABEL_TINGKAT[b.tingkat].urut || KATEGORI_GAP.indexOf(a.kategori) - KATEGORI_GAP.indexOf(b.kategori) || a.kunci.localeCompare(b.kunci));

export function hitungTingkat(t: Temuan[]): Record<Tingkat, number> {
  const h: Record<Tingkat, number> = { keras: 0, sedang: 0, info: 0 };
  for (const x of t) h[x.tingkat] += 1;
  return h;
}

/** Sidik jari temuan (kunci + tingkat + pesan), agar penyimpanan ulang yang tidak mengubah apa-apa dapat dikenali. */
export const sidikTemuan = (t: Temuan[]): string => urutkanTemuan(t).map((x) => `${x.kunci}|${x.tingkat}|${x.pesan}`).join("\n");

/** Temuan keras yang belum ada pada penyimpanan sebelumnya (kunci baru, atau tingkat naik menjadi keras). */
export function kerasBaru(sekarang: Temuan[], sebelumnya: Temuan[]): Temuan[] {
  const lama = new Map(sebelumnya.map((x) => [x.kunci, x.tingkat]));
  return sekarang.filter((x) => x.tingkat === "keras" && lama.get(x.kunci) !== "keras");
}

/** Batas panjang pesan yang diterima basis data (500 huruf); dipotong di sini agar sidik klien dan server sama. */
export const MAKS_PESAN = 500;
export function potongPesan(p: string): string {
  const huruf = Array.from(p);
  return huruf.length <= MAKS_PESAN ? p : `${huruf.slice(0, MAKS_PESAN - 1).join("")}…`;
}

// ---------------------------------------------------------------------------------------------------------------------
export type MasukanGap = {
  form: Form | null;
  isi: IsiLanjutan | null;
  pascaH15: boolean;
  bahan: BahanPelaksanaan | null;
  rincian: BarisRincian[];
  jadwal: { periode: string; mulai: string; selesai: string }[];
  hariIni: string;
};
export type BarisPeran = { peran: KodePeran; nama: string; rencana: number; aktual: number };
export type RingkasGap = {
  peran: BarisPeran[]; petugasRencana: number; petugasAktual: number; hariKerja: number; laporan: number;
  kebutuhan: number; sisaPagu: number | null; kegiatan: number; kegiatanBerakhir: number; rapatEvaluasi: number;
};

/** Peran lanjutan -> peran pada sigap_penugasan. Petugas entri tidak ditugaskan di lapangan, jadi tidak dibandingkan. */
const PERAN_SIGAP: Record<KodePeran, string | null> = { supervisor: "supervisor", kortim: "korwil", pml: "pml", ppl: "ppl", entri: null };

const pendataan = (b: BahanPelaksanaan): KegiatanBahan[] => b.kegiatan.filter((k) => k.fungsi === "pendataan");

export function ringkasGap(m: MasukanGap): RingkasGap {
  const keg = m.bahan ? pendataan(m.bahan) : [];
  const akunPerPeran = new Map<string, Set<number>>();
  let hariKerja = 0; let laporan = 0;
  for (const k of keg) {
    for (const p of k.petugas) {
      if (!p.aktif) continue;
      hariKerja += p.hari_kerja; laporan += p.laporan;
      if (p.peran) { const s = akunPerPeran.get(p.peran) ?? new Set<number>(); s.add(p.akun_id); akunPerPeran.set(p.peran, s); }
    }
  }
  const peran: BarisPeran[] = [];
  for (const kode of KODE_PERAN) {
    const ps = m.isi?.peran[kode];
    const sigap = PERAN_SIGAP[kode];
    if (!ps || sigap === null) continue;
    const rencana = ps.on ? ps.nOrg + ps.nMit : 0;
    const aktual = akunPerPeran.get(sigap)?.size ?? 0;
    // peran yang tidak direncanakan tetapi sudah ada penugasannya tetap dibandingkan (kelebihan)
    if (rencana === 0 && aktual === 0) continue;
    peran.push({ peran: kode, nama: NAMA_PERAN[kode], rencana, aktual });
  }
  const biaya = m.bahan ? kesiapanBiaya(m.rincian, m.bahan.realisasi, m.bahan.realisasi_sampai) : null;
  return {
    peran, petugasRencana: peran.reduce((s, p) => s + p.rencana, 0), petugasAktual: peran.reduce((s, p) => s + p.aktual, 0), hariKerja, laporan,
    kebutuhan: biaya ? biaya.baris.reduce((s, b) => s + b.kebutuhan, 0) : 0,
    sisaPagu: biaya && biaya.adaLaporan ? biaya.baris.reduce((s, b) => s + (b.sisa ?? 0), 0) : null,
    kegiatan: m.bahan?.kegiatan.length ?? 0,
    kegiatanBerakhir: m.bahan ? m.bahan.kegiatan.filter((k) => !!k.selesai && m.hariIni > k.selesai).length : 0,
    rapatEvaluasi: m.bahan ? m.bahan.kegiatan.reduce((s, k) => s + k.rapat_evaluasi, 0) : 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
export function hitungGap(m: MasukanGap): Temuan[] {
  const t: Temuan[] = [];
  const tambah = (kunci: string, kategori: KategoriGap, tingkat: Tingkat, pesan: string, tuju: string | null) => { t.push({ kunci, kategori, tingkat, pesan: potongPesan(pesan), tuju }); };
  if (!m.isi) {
    tambah("tautan:lanjutan", "tautan", "info", "Identifikasi lanjutan belum disimpan, jadi rencana petugas dan biaya belum dapat dibandingkan dengan pelaksanaan.", null);
    return t;
  }
  const bahan = m.bahan;
  const kegiatan = bahan?.kegiatan ?? [];
  const mulaiJendela = m.jadwal.filter((j) => j.mulai).map((j) => j.mulai).sort()[0] ?? null;
  const mulaiKegiatan = kegiatan.map((k) => k.mulai).filter((x): x is string => !!x).sort()[0] ?? null;
  const sudahMulai = (mulaiKegiatan ?? mulaiJendela) !== null && m.hariIni >= ((mulaiKegiatan ?? mulaiJendela) as string);

  if (m.pascaH15) tambah("kebijakan:pasca_h15", "kebijakan", "sedang", "Identifikasi lanjutan diubah sesudah H-15; perubahan ini perlu dievaluasi pada rapat evaluasi.", null);

  if (kegiatan.length === 0) {
    const kuning = mulaiJendela !== null && m.hariIni >= mulaiJendela;
    tambah("tautan:kosong", "tautan", kuning ? "sedang" : "info",
      kuning ? "Jendela pendataan sudah dimulai tetapi belum ada kegiatan SIGAP yang ditautkan, sehingga penugasan dan laporan harian tidak dapat dipantau." : "Belum ada kegiatan SIGAP yang ditautkan ke identifikasi ini.", "pl-tautan");
    return t;
  }
  const keg = bahan ? pendataan(bahan) : [];
  if (keg.length === 0) tambah("tautan:pendataan", "tautan", "info", "Tidak ada kegiatan tertaut berfungsi Pendataan lapangan, jadi jumlah petugas dan laporan harian tidak dibandingkan.", "pl-tautan");

  // jumlah petugas
  if (keg.length > 0) {
    for (const p of ringkasGap(m).peran) {
      if (p.aktual < p.rencana) {
        const kurang = p.rencana - p.aktual;
        const keras = sudahMulai && p.aktual < p.rencana * 0.8;
        tambah(`petugas:${p.peran}:kurang`, "petugas", sudahMulai ? (keras ? "keras" : "sedang") : "info",
          `${p.nama}: rencana ${p.rencana} orang, baru ${p.aktual} ditugaskan di SIGAP (kurang ${kurang}).${keras ? " Pelaksanaan sudah dimulai dan kekurangan melewati 20% rencana." : ""}`, "pl-usulan");
      } else if (p.aktual > p.rencana) {
        tambah(`petugas:${p.peran}:lebih`, "petugas", "sedang", `${p.nama}: rencana ${p.rencana} orang, tetapi ${p.aktual} ditugaskan di SIGAP (lebih ${p.aktual - p.rencana}); biaya dapat melampaui rencana.`, "pl-usulan");
      }
    }
  }

  for (const k of keg) {
    // jadwal
    selarasJadwal(k, m.jadwal).forEach((s, i) => { if (s.nada === "kuning") tambah(`jadwal:${k.id}:${i}`, "jadwal", "sedang", `${k.nama}: ${s.pesan}`, "pl-laporan"); });
    // laporan harian
    const r = ringkasLaporan(k, m.hariIni);
    if (r.kurangLapor > 0) tambah(`laporan:${k.id}:kurang`, "laporan", "keras", `${k.nama}: ${r.kurangLapor} petugas memiliki laporan harian lebih sedikit dari hari kerja yang dipilih.`, "pl-laporan");
    else if (r.sudahMulai && !r.sudahBerakhir && r.tanpaHariKerja > 0 && r.petugasAktif > 0) tambah(`laporan:${k.id}:hari`, "laporan", "sedang", `${k.nama}: ${r.tanpaHariKerja} petugas belum memilih hari kerja.`, "pl-laporan");
    if (r.sudahBerakhir && r.petugasAktif > 0 && r.laporan === 0) tambah(`laporan:${k.id}:nol`, "laporan", "keras", `${k.nama}: kegiatan sudah berakhir tanpa satu pun laporan harian.`, "pl-laporan");
    if (r.sudahMulai && r.petugasAktif === 0 && !r.sudahBerakhir) tambah(`laporan:${k.id}:tanpa_petugas`, "laporan", "sedang", `${k.nama}: kegiatan sudah dimulai tetapi belum ada petugas aktif.`, "pl-usulan");
  }

  // biaya
  if (bahan) {
    const b = kesiapanBiaya(m.rincian, bahan.realisasi, bahan.realisasi_sampai);
    if (!b.adaLaporan && m.rincian.length > 0) tambah("biaya:laporan", "biaya", "info", "Belum ada laporan realisasi RO ini, sehingga kebutuhan biaya belum dapat dibandingkan dengan pagu.", "pl-bendahara");
    for (const x of b.baris) {
      if (x.status === "kurang") tambah(`biaya:${x.akun}`, "biaya", "keras", `Akun ${x.akun} (${x.nama}): ${x.catatan}`, "pl-bendahara");
      else if (x.status === "tanpa_pagu" && b.adaLaporan) tambah(`biaya:${x.akun}`, "biaya", "sedang", `Akun ${x.akun} (${x.nama}): ${x.catatan}`, "pl-bendahara");
    }
  }

  // evaluasi
  if (m.form) {
    const a = agendaEvaluasi(m.form, kegiatan, m.hariIni);
    if (a.nada === "kuning") tambah("evaluasi:rapat", "evaluasi", "sedang", a.pesan, "pl-evaluasi");
  }
  return t;
}

/** Selisih hari dari hari ini ke akhir kegiatan paling akhir; null bila belum ada tanggal. Dipakai penanda "laporan akhir sudah layak". */
export function layakLaporanAkhir(bahan: BahanPelaksanaan | null, hariIni: string): { layak: boolean; alasan: string } {
  if (!bahan || bahan.kegiatan.length === 0) return { layak: false, alasan: "Belum ada kegiatan tertaut." };
  const selesai = bahan.kegiatan.map((k) => k.selesai).filter((x): x is string => !!x).sort();
  if (selesai.length < bahan.kegiatan.length) return { layak: false, alasan: "Periode sebagian kegiatan belum diatur." };
  const akhir = selesai[selesai.length - 1];
  if (hariIni <= akhir) return { layak: false, alasan: `Kegiatan terakhir berakhir ${selisihHari(akhir, hariIni) === 0 ? "hari ini" : `dalam ${selisihHari(akhir, hariIni)} hari`}; laporan Gap akhir disusun sesudah seluruh kegiatan berakhir.` };
  return { layak: true, alasan: "Seluruh kegiatan tertaut sudah berakhir." };
}
