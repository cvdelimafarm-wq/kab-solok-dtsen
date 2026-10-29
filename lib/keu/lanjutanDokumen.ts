// lib/keu/lanjutanDokumen.ts
//
// (25 Okt 2026, tahap 29) Dokumen turunan identifikasi lanjutan: undangan pelatihan (per kelas), surat pengantar kegiatan ke nagari (satu surat),
// dan surat tugas atau SPK (per petugas). (29 Okt 2026) Surat tugas instruktur: jenis dokumen tetap "tugas" (tabel keu_ident_dokumen sudah menerimanya) dengan kunci berawalan "ins:"
// (per instruktur bernama pada kelas), sehingga tidak perlu SQL baru. Berkas ini MURNI: menyusun isi surat sebagai data terstruktur; tampilan dan cetak ada di layar dokumen.
// Penandatangan dipilih per dokumen dan nomor surat diisi manual (keputusan 25 Okt 2026). Format baku surat kantor belum ditetapkan, sehingga
// susunan di sini bersifat konsep yang dapat disesuaikan; dokumen baru berstatus "terbit" setelah lanjutan Final dan nomor, tanggal, dan penandatangan diisi.

import type { Form } from "./identifikasi";
import { jadwalPendataan, namaPetugas, NAMA_PERAN, NAMA_SUMBER, pesertaKelas, ringkasTanggalKelas, type IsiLanjutan, type JenisDokumen, type Instruktur, type Kelas, type KodePeran, type Petugas, type StatusLanjutan } from "./lanjutan";
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

/** Instruktur kelas yang sudah bernama: "Nama (Innas, Internal BPS, 3 jam)". Kosong bila belum ada. */
export function teksInstruktur(c: Kelas): string[] {
  return (c.instruktur ?? []).filter((i) => i.nama.trim() !== "").map((i) => {
    const ket = [i.level, i.asal, i.jam > 0 ? `${i.jam} jam` : ""].filter(Boolean).join(", ");
    return ket ? `${i.nama.trim()} (${ket})` : i.nama.trim();
  });
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
  const pengajar = teksInstruktur(c);
  if (pengajar.length > 0) d.rincian.push(["Pengajar", pengajar.join("; ")]);
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
  const ikut = p.peran === "" ? [] : k.isi.kelas.filter((c) => c.untuk.includes(p.peran as KodePeran));
  if (ikut.length > 0) {
    d.rincian.push(["Pelatihan yang diikuti", ikut.map((c) => {
      const pengajar = teksInstruktur(c);
      return `${c.nama.trim() || (c.sesi === "briefing" ? "Briefing" : "Pelatihan")}: ${rentangHariTanggal(c.mulai, c.selesai)}, ${tempatKelas(c)}${pengajar.length ? `, pengajar ${pengajar.join("; ")}` : ""}`;
    }).join(" | ")]);
  }
  d.isi = mitra
    ? ["Pihak Kedua berkewajiban melaksanakan pekerjaan sesuai peran dan jadwal di atas dengan penuh tanggung jawab dan mengikuti pedoman kegiatan.", "Honorarium dibayarkan sesuai tarif honor mitra yang berlaku di BPS Kabupaten Solok setelah pekerjaan diselesaikan dan dinyatakan baik, dengan batas honor sesuai ketentuan yang berlaku."]
    : ["Penugasan ini dilaksanakan sesuai peran dan jadwal di atas dengan penuh tanggung jawab dan mengikuti pedoman kegiatan."];
  d.penutup = mitra ? "Demikian perjanjian kerja ini dibuat untuk dilaksanakan sebagaimana mestinya." : "Demikian surat tugas ini dibuat untuk dilaksanakan sebagaimana mestinya.";
  if (p.menyusul || p.nama.trim() === "") d.hambatan.push(`${nm}: nama belum diisi`);
  if (jadwal.length === 0) d.hambatan.push("Jadwal pendataan belum lengkap");
  return d;
}

// ---------------------------------------------------------------------------------------------------------------------
// Surat tugas instruktur (29 Okt 2026)
// ---------------------------------------------------------------------------------------------------------------------
export const AWALAN_KUNCI_INSTRUKTUR = "ins:";
/** Kunci dokumen (1..40 huruf, batas basis data) untuk surat tugas seorang instruktur pada satu kelas: "ins:<id kelas>:<nama>". Tidak bergantung urutan daftar instruktur. */
export function kunciInstruktur(kelasId: string, nama: string): string {
  const slug = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${AWALAN_KUNCI_INSTRUKTUR}${slug(kelasId).slice(0, 12)}:${slug(nama)}`.slice(0, 40).replace(/-+$/, "");
}
/** Apakah kunci ini milik surat tugas instruktur (bukan petugas). */
export const kunciInstrukturDokumen = (kunci: string): boolean => kunci.startsWith(AWALAN_KUNCI_INSTRUKTUR);

export type EntriInstruktur = { kunci: string; label: string; kelas: Kelas; nama: string; entri: Instruktur[] };
/** Instruktur bernama per kelas; nama sama pada kelas yang sama digabung (jam dijumlahkan di surat). */
export function daftarInstruktur(isi: IsiLanjutan): EntriInstruktur[] {
  const peta = new Map<string, EntriInstruktur>();
  for (const c of isi.kelas) {
    for (const i of c.instruktur ?? []) {
      const nama = i.nama.trim().replace(/\s+/g, " ");
      if (nama === "") continue;
      const kunci = kunciInstruktur(c.id, nama);
      const ada = peta.get(kunci);
      if (ada) { ada.entri.push(i); continue; }
      peta.set(kunci, { kunci, label: "", kelas: c, nama, entri: [i] });
    }
  }
  return [...peta.values()].map((e) => {
    const jam = e.entri.reduce((t, i) => t + (i.jam > 0 ? i.jam : 0), 0);
    return { ...e, label: `Instruktur: ${e.nama} · ${e.kelas.nama.trim() || "Kelas"}${jam > 0 ? ` · ${jam} JP` : ""}` };
  });
}

/** Surat tugas untuk satu instruktur pada satu kelas: kelas, jadwal, tempat, dan alokasi JP. */
export function bangunTugasInstruktur(k: KonteksDokumen, e: EntriInstruktur, m: MetaSurat): Dokumen {
  const c = e.kelas;
  const kelasNama = c.nama.trim() || (c.sesi === "briefing" ? "Briefing" : "Pelatihan");
  const d = dasar("tugas", k, m, "SURAT TUGAS", `Penugasan instruktur ${kelasNama} ${k.namaSurvei}`);
  const jam = e.entri.reduce((t, i) => t + (i.jam > 0 ? i.jam : 0), 0);
  const level = [...new Set(e.entri.map((i) => i.level).filter(Boolean))];
  const asal = [...new Set(e.entri.map((i) => i.asal).filter(Boolean))];
  d.kepada = [e.nama];
  d.pembuka = "Yang bertanda tangan di bawah ini menugaskan:";
  d.rincian = [
    ["Nama", e.nama],
    ["Tugas", `Instruktur ${kelasNama}`],
    ["Level instruktur", level.length > 0 ? level.join(", ") : "(level belum dipilih)"],
    ["Asal instruktur", asal.length > 0 ? asal.join(", ") : "(asal belum dipilih)"],
    ["Kegiatan", `${k.namaSurvei} Tahun ${k.tahun}`],
    ["Hari/tanggal", rentangHariTanggal(c.mulai, c.selesai)],
    ["Tempat", tempatKelas(c)],
    ["Metode", c.metode || "(metode belum dipilih)"],
    ["Alokasi mengajar", jam > 0 ? `${jam} JP` : "(JP belum diisi)"],
  ];
  d.isi = ["Penugasan ini dilaksanakan dengan menyampaikan materi sesuai alokasi JP, jadwal, dan tempat di atas dengan penuh tanggung jawab serta mengikuti pedoman kegiatan.", "Honorarium instruktur dibayarkan sesuai ketentuan honor yang berlaku di BPS Kabupaten Solok setelah penugasan dilaksanakan."];
  d.penutup = "Demikian surat tugas ini dibuat untuk dilaksanakan sebagaimana mestinya.";
  if (!c.fix) d.hambatan.push(`${kelasNama} masih Perkiraan`);
  if (!valid(c.mulai) || !valid(c.selesai)) d.hambatan.push("Tanggal kelas belum lengkap");
  if (jam <= 0) d.hambatan.push(`${e.nama}: JP belum diisi`);
  if (level.length === 0) d.hambatan.push(`${e.nama}: level instruktur belum dipilih`);
  if (asal.length === 0) d.hambatan.push(`${e.nama}: asal instruktur belum dipilih`);
  return d;
}

/** Kunci dokumen yang tersedia: undangan per kelas, satu surat pengantar, surat tugas per petugas (dan per instruktur bernama). */
export function daftarKunci(jenis: JenisDokumen, isi: IsiLanjutan): { kunci: string; label: string }[] {
  if (jenis === "undangan") return isi.kelas.map((c) => ({ kunci: c.id, label: `${c.nama.trim() || "Kelas"} · ${ringkasTanggalKelas(c)}` }));
  if (jenis === "pengantar") return [{ kunci: "semua", label: "Surat pengantar untuk semua nagari" }];
  return [
    ...isi.petugas.map((p, i) => ({ kunci: p.id, label: `${namaPetugas(p, i + 1)} · ${p.status}${p.peran ? ` · ${NAMA_PERAN[p.peran]}` : ""}` })),
    ...daftarInstruktur(isi).map((e) => ({ kunci: e.kunci, label: e.label })),
  ];
}

/** Menyusun dokumen menurut jenis dan kunci; null bila kunci tidak ada. */
export function bangunDokumen(jenis: JenisDokumen, kunci: string, k: KonteksDokumen, m: MetaSurat): Dokumen | null {
  if (jenis === "undangan") { const c = k.isi.kelas.find((x) => x.id === kunci); return c ? bangunUndangan(k, c, m) : null; }
  if (jenis === "pengantar") return kunci === "semua" ? bangunPengantar(k, m) : null;
  if (kunciInstrukturDokumen(kunci)) { const e = daftarInstruktur(k.isi).find((x) => x.kunci === kunci); return e ? bangunTugasInstruktur(k, e, m) : null; }
  const i = k.isi.petugas.findIndex((x) => x.id === kunci);
  return i >= 0 ? bangunTugas(k, k.isi.petugas[i], i + 1, m) : null;
}
