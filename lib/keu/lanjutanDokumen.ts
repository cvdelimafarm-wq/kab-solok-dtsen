// lib/keu/lanjutanDokumen.ts
//
// (25 Okt 2026, tahap 29) Dokumen turunan identifikasi lanjutan: undangan pelatihan (per kelas), surat pengantar kegiatan ke nagari (satu surat),
// dan surat tugas atau SPK (per petugas). Berkas ini MURNI: menyusun isi surat sebagai data terstruktur; tampilan dan cetak ada di layar dokumen.
// Penandatangan dipilih per dokumen dan nomor surat diisi manual (keputusan 25 Okt 2026). Format baku surat kantor belum ditetapkan, sehingga
// susunan di sini bersifat konsep yang dapat disesuaikan; dokumen baru berstatus "terbit" setelah lanjutan Final dan nomor, tanggal, dan penandatangan diisi.

import type { Form } from "./identifikasi";
import { jadwalPendataan, namaPetugas, NAMA_PERAN, NAMA_SUMBER, pesertaKelas, ringkasTanggalKelas, type IsiLanjutan, type JenisDokumen, type Kelas, type Petugas, type StatusLanjutan } from "./lanjutan";
import { namaJabatan } from "./kebijakan";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const valid = (d: string): boolean => /^\d{4}-\d\d-\d\d$/.test(d);
/** "2026-03-02" -> "2 Maret 2026"; kosong bila bukan tanggal. */
export function tanggalPanjang(d: string): string {
  if (!valid(d)) return "";
  const [y, m, t] = d.split("-").map(Number);
  return `${t} ${BULAN[m - 1] ?? "?"} ${y}`;
}
/** "2026-03-02" -> "Senin, 2 Maret 2026". */
export function hariTanggal(d: string): string {
  if (!valid(d)) return "";
  const dt = new Date(`${d}T00:00:00Z`);
  return `${HARI[dt.getUTCDay()]}, ${tanggalPanjang(d)}`;
}
/** Rentang hari/tanggal; satu hari bila mulai = selesai. */
export function rentangHariTanggal(mulai: string, selesai: string): string {
  if (!valid(mulai) || !valid(selesai)) return "(tanggal belum ditetapkan)";
  return mulai === selesai ? hariTanggal(mulai) : `${hariTanggal(mulai)} s.d. ${hariTanggal(selesai)}`;
}

export type Penandatangan = { nama: string; jabatan: string };
export type KonteksDokumen = {
  namaSurvei: string;
  tahun: number;
  isi: IsiLanjutan;
  form: Form;
  upd: Record<string, { mulai: string; selesai: string }> | null;
  status: StatusLanjutan;
};
export type MetaSurat = { nomor: string; tanggal: string; ttd: Penandatangan | null; terbit: boolean };

export type Dokumen = {
  jenis: JenisDokumen;
  judul: string;
  /** true = belum diterbitkan (konsep): ditampilkan dengan tanda air. */
  konsep: boolean;
  instansi: string[];
  nomor: string;
  tanggalSurat: string;
  lampiran: string;
  perihal: string;
  kepada: string[];
  pembuka: string;
  rincian: [string, string][];
  isi: string[];
  tabel: { judul: string; kepala: string[]; baris: string[][] } | null;
  penutup: string;
  ttd: Penandatangan;
  /** Hal yang menahan penerbitan (kosong = siap diterbitkan). */
  hambatan: string[];
};

const INSTANSI = ["BADAN PUSAT STATISTIK", "KABUPATEN SOLOK"];
const KOSONG_TTD: Penandatangan = { nama: "(penandatangan belum dipilih)", jabatan: "" };

function dasar(jenis: JenisDokumen, k: KonteksDokumen, m: MetaSurat, judul: string, perihal: string): Dokumen {
  return {
    jenis, judul, konsep: !m.terbit, instansi: INSTANSI, nomor: m.nomor.trim() || "(nomor belum diisi)", tanggalSurat: tanggalPanjang(m.tanggal) || "(tanggal belum diisi)",
    lampiran: "", perihal, kepada: [], pembuka: "", rincian: [], isi: [], tabel: null, penutup: "", ttd: m.ttd ?? KOSONG_TTD, hambatan: hambatanDasar(k),
  };
}
const hambatanDasar = (k: KonteksDokumen): string[] => (k.status === "final" ? [] : ["Identifikasi lanjutan masih Draf (ada isian Perkiraan atau nama yang menyusul)"]);

export function tempatKelas(c: Kelas): string {
  if (c.metode === "Daring") return "Secara daring (dalam jaringan)";
  const jenis = c.tempat || "(tempat belum dipilih)";
  const lok = c.lokasi.trim();
  return lok ? `${jenis}: ${lok}` : jenis;
}

/** Daftar peserta kelas: petugas bernama pada peran yang diikuti. */
export function pesertaBernama(isi: IsiLanjutan, c: Kelas): Petugas[] {
  return isi.petugas.filter((p) => p.peran !== "" && c.untuk.includes(p.peran) && p.nama.trim() !== "");
}

export function bangunUndangan(k: KonteksDokumen, c: Kelas, m: MetaSurat): Dokumen {
  const nama = c.nama.trim() || (c.sesi === "briefing" ? "Briefing" : "Pelatihan");
  const d = dasar("undangan", k, m, "UNDANGAN", `Undangan ${nama} ${k.namaSurvei}`);
  d.kepada = [`Yth. Peserta ${nama}`, "di tempat"];
  d.pembuka = `Dalam rangka persiapan pelaksanaan ${k.namaSurvei} Tahun ${k.tahun}, dengan hormat kami mengundang Bapak/Ibu/Saudara untuk mengikuti ${nama} yang akan diselenggarakan pada:`;
  const peserta = pesertaKelas(k.isi, c);
  d.rincian = [
    ["Hari/tanggal", rentangHariTanggal(c.mulai, c.selesai)],
    ["Tempat", tempatKelas(c)],
    ["Metode", c.metode || "(metode belum dipilih)"],
    ["Jumlah OH", c.oh > 0 ? `${c.oh} hari` : "(belum diisi)"],
    ["Peserta", `${peserta} orang (daftar terlampir)`],
  ];
  d.penutup = "Demikian undangan ini disampaikan. Atas perhatian dan kehadiran Bapak/Ibu/Saudara, kami ucapkan terima kasih.";
  const baris = pesertaBernama(k.isi, c);
  d.lampiran = baris.length > 0 ? "1 (satu) lembar daftar peserta" : "";
  d.tabel = baris.length > 0 ? { judul: `Daftar peserta ${nama}`, kepala: ["No", "Nama", "Peran", "Status"], baris: baris.map((p, i) => [String(i + 1), p.nama.trim(), NAMA_PERAN[p.peran as keyof typeof NAMA_PERAN], p.status]) } : null;
  if (!c.fix) d.hambatan.push(`${nama} masih Perkiraan`);
  if (!valid(c.mulai) || !valid(c.selesai)) d.hambatan.push("Tanggal kelas belum lengkap");
  return d;
}

export function bangunPengantar(k: KonteksDokumen, m: MetaSurat): Dokumen {
  const d = dasar("pengantar", k, m, "SURAT PENGANTAR", `Pemberitahuan pelaksanaan kegiatan ${k.namaSurvei} Tahun ${k.tahun}`);
  const wilayah = k.isi.wilayah.split(/\r?\n/).map((x) => x.trim()).filter((x) => x !== "");
  d.kepada = ["Yth. Wali Nagari", ...(wilayah.length > 0 ? wilayah : ["(wilayah tugas belum diisi)"]), "di tempat"];
  d.pembuka = `Dengan hormat, BPS Kabupaten Solok akan melaksanakan ${k.namaSurvei} Tahun ${k.tahun} di wilayah nagari Bapak/Ibu. Sehubungan dengan itu kami sampaikan hal-hal berikut.`;
  const jadwal = jadwalPendataan(k.form, k.tahun, k.upd).filter((j) => valid(j.mulai) && valid(j.selesai));
  d.rincian = [
    ["Kegiatan", `${k.namaSurvei} Tahun ${k.tahun}`],
    ["Jadwal pendataan", jadwal.length > 0 ? jadwal.map((j) => `${k.form.periode === "Tanpa periode" ? "" : `${j.periode}: `}${rentangHariTanggal(j.mulai, j.selesai)}`).join("; ") : "(jadwal belum lengkap)"],
  ];
  const nama = k.isi.petugas.filter((p) => p.nama.trim() !== "");
  d.rincian.push(["Petugas", `${nama.length} orang bernama (daftar terlampir)${k.isi.petugas.length > nama.length ? `; ${k.isi.petugas.length - nama.length} lainnya menyusul` : ""}`]);
  d.isi = ["Mohon kiranya Bapak/Ibu berkenan memberikan dukungan dan kemudahan kepada petugas dalam melaksanakan tugasnya, serta menginformasikan kegiatan ini kepada masyarakat setempat."];
  d.penutup = "Demikian surat pengantar ini disampaikan. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.";
  d.lampiran = nama.length > 0 ? "1 (satu) lembar daftar petugas" : "";
  d.tabel = nama.length > 0 ? { judul: "Daftar petugas", kepala: ["No", "Nama", "Peran", "Status"], baris: nama.map((p, i) => [String(i + 1), p.nama.trim(), p.peran === "" ? "Tim" : NAMA_PERAN[p.peran], p.status]) } : null;
  if (k.isi.wilayah.trim() === "") d.hambatan.push("Wilayah tugas belum diisi");
  if (jadwal.length === 0) d.hambatan.push("Jadwal pendataan belum lengkap");
  return d;
}

export function bangunTugas(k: KonteksDokumen, p: Petugas, urut: number, m: MetaSurat): Dokumen {
  const mitra = p.status === "Mitra";
  const nm = namaPetugas(p, urut);
  const d = dasar("tugas", k, m, mitra ? "SURAT PERJANJIAN KERJA (SPK)" : "SURAT TUGAS", mitra ? `Perjanjian kerja petugas ${k.namaSurvei}` : `Penugasan petugas ${k.namaSurvei}`);
  const peran = p.peran === "" ? "Tim pelaksana" : NAMA_PERAN[p.peran];
  const jadwal = jadwalPendataan(k.form, k.tahun, k.upd).filter((j) => valid(j.mulai) && valid(j.selesai));
  const jabatan = p.jabatan.map(namaJabatan);
  d.kepada = [nm];
  d.pembuka = mitra
    ? `Pada hari ini, yang bertanda tangan di bawah ini, ${m.ttd?.nama ?? "(penandatangan)"} selaku ${m.ttd?.jabatan || "(jabatan)"} (Pihak Pertama), dan ${nm} (Pihak Kedua), sepakat mengikatkan diri dalam perjanjian kerja sebagai berikut.`
    : `Yang bertanda tangan di bawah ini menugaskan:`;
  d.rincian = [
    ["Nama", nm],
    ["Status", mitra ? "Mitra statistik" : "Pegawai organik BPS"],
    ["Peran lapangan", peran],
    ...(jabatan.length > 0 ? [["Jabatan dalam tim", jabatan.join(", ")] as [string, string]] : []),
    ...(mitra ? [["Sumber mitra", NAMA_SUMBER[p.sumber] ?? p.sumber] as [string, string]] : []),
    ["Kegiatan", `${k.namaSurvei} Tahun ${k.tahun}`],
    ["Jadwal pendataan", jadwal.length > 0 ? jadwal.map((j) => `${k.form.periode === "Tanpa periode" ? "" : `${j.periode}: `}${rentangHariTanggal(j.mulai, j.selesai)}`).join("; ") : "(jadwal belum lengkap)"],
  ];
  d.isi = mitra
    ? ["Pihak Kedua berkewajiban melaksanakan pekerjaan sesuai peran dan jadwal di atas dengan penuh tanggung jawab dan mengikuti pedoman kegiatan.", "Honorarium dibayarkan sesuai tarif honor mitra yang berlaku di BPS Kabupaten Solok setelah pekerjaan diselesaikan dan dinyatakan baik, dengan batas honor sesuai ketentuan yang berlaku."]
    : ["Penugasan ini dilaksanakan sesuai peran dan jadwal di atas dengan penuh tanggung jawab dan mengikuti pedoman kegiatan."];
  d.penutup = mitra ? "Demikian perjanjian kerja ini dibuat untuk dilaksanakan sebagaimana mestinya." : "Demikian surat tugas ini dibuat untuk dilaksanakan sebagaimana mestinya.";
  if (p.menyusul || p.nama.trim() === "") d.hambatan.push(`${nm}: nama belum diisi`);
  if (jadwal.length === 0) d.hambatan.push("Jadwal pendataan belum lengkap");
  return d;
}

/** Kunci dokumen yang tersedia: undangan per kelas, satu surat pengantar, surat tugas per petugas. */
export function daftarKunci(jenis: JenisDokumen, isi: IsiLanjutan): { kunci: string; label: string }[] {
  if (jenis === "undangan") return isi.kelas.map((c) => ({ kunci: c.id, label: `${c.nama.trim() || "Kelas"} · ${ringkasTanggalKelas(c)}` }));
  if (jenis === "pengantar") return [{ kunci: "semua", label: "Surat pengantar untuk semua nagari" }];
  return isi.petugas.map((p, i) => ({ kunci: p.id, label: `${namaPetugas(p, i + 1)} · ${p.status}${p.peran ? ` · ${NAMA_PERAN[p.peran]}` : ""}` }));
}

/** Menyusun dokumen menurut jenis dan kunci; null bila kunci tidak ada. */
export function bangunDokumen(jenis: JenisDokumen, kunci: string, k: KonteksDokumen, m: MetaSurat): Dokumen | null {
  if (jenis === "undangan") { const c = k.isi.kelas.find((x) => x.id === kunci); return c ? bangunUndangan(k, c, m) : null; }
  if (jenis === "pengantar") return kunci === "semua" ? bangunPengantar(k, m) : null;
  const i = k.isi.petugas.findIndex((x) => x.id === kunci);
  return i >= 0 ? bangunTugas(k, k.isi.petugas[i], i + 1, m) : null;
}
