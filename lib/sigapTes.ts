// lib/sigapTes.ts
//
// (7 Okt 2026) SIGAP > Pelatihan: pretest & posttest. Fungsi MURNI (tanpa database) yang dipakai
// bersama oleh server (API) dan klien (halaman kelola/pengerjaan): status menurut jam, skor,
// pembersihan jawaban, serta baca/validasi template Excel soal.
//
// Aturan waktu (dipilih user): hitung mundur per orang + batas tutup.
//   - Tes boleh DIMULAI hanya pada [buka_at, tutup_at).
//   - batas_at sesi = LEAST(mulai + durasi_menit, tutup_at)  -> yang telat mulai mendapat waktu lebih sedikit.
//   - Sesudah batas_at, jawaban yang tersimpan otomatis dinilai (finalisasi lazy di server).
// Hasil (skor + pembahasan benar/salah) baru tampil setelah tutup_at; sebelum itu hanya "jawaban tersimpan".

export const KODE_KEGIATAN_PELATIHAN = "pelatihan_psp_pascabencana_2026";

export type JenisTes = "pretest" | "posttest";
export const DAFTAR_JENIS_TES: JenisTes[] = ["pretest", "posttest"];
export const LABEL_JENIS_TES: Record<JenisTes, string> = { pretest: "Pretest", posttest: "Posttest" };

export function jenisTesValid(x: unknown): x is JenisTes {
  return x === "pretest" || x === "posttest";
}

export type Opsi = { kode: string; teks: string };
/** Soal lengkap (hanya utk admin & pembahasan sesudah tes ditutup). */
export type SoalLengkap = { nomor: number; teks: string; opsi: Opsi[]; kunci: string; bobot: number };
/** Soal yang dikirim ke peserta saat mengerjakan: TANPA kunci & bobot. */
export type SoalPeserta = { nomor: number; teks: string; opsi: Opsi[] };

export type TesBaris = {
  id: number;
  kegiatan_id: number;
  jenis: JenisTes;
  judul: string;
  buka_at: string;
  durasi_menit: number;
  tutup_at: string;
  aktif: boolean;
};

export type SesiBaris = {
  id: number;
  tes_id: number;
  akun_id: number;
  mulai_at: string;
  batas_at: string;
  selesai_at: string | null;
  jawaban: Record<string, string>;
  skor: number | null;
  benar: number | null;
  total: number | null;
  diubah_at: string;
};

/** Status tes bagi seorang peserta. */
export type StatusTes = "nonaktif" | "soal_belum_ada" | "belum_buka" | "buka" | "mengerjakan" | "selesai" | "terlewat";

export const LABEL_STATUS_TES: Record<StatusTes, string> = {
  nonaktif: "Tidak aktif",
  soal_belum_ada: "Soal belum tersedia",
  belum_buka: "Belum dibuka",
  buka: "Sedang dibuka",
  mengerjakan: "Sedang dikerjakan",
  selesai: "Selesai",
  terlewat: "Terlewat",
};

/** Toleransi (detik) utk simpan jawaban yg tiba sedikit setelah batas (jaringan lambat). */
export const TOLERANSI_DETIK = 5;

/** batas_at = LEAST(sekarang + durasi, tutup_at). */
export function hitungBatas(sekarang: Date, durasiMenit: number, tutupAt: string | Date): Date {
  const b = new Date(sekarang.getTime() + durasiMenit * 60_000);
  const t = new Date(tutupAt);
  return b.getTime() < t.getTime() ? b : t;
}

/** Sudah melewati batas (dgn toleransi opsional)? */
export function lewatBatas(sekarang: Date, batasAt: string | Date, toleransiDetik = 0): boolean {
  return sekarang.getTime() > new Date(batasAt).getTime() + toleransiDetik * 1000;
}

export function statusTes(
  tes: Pick<TesBaris, "aktif" | "buka_at" | "tutup_at">,
  jumlahSoal: number,
  sesi: Pick<SesiBaris, "batas_at" | "selesai_at"> | null,
  sekarang: Date
): StatusTes {
  if (sesi) {
    if (sesi.selesai_at || sekarang.getTime() >= new Date(sesi.batas_at).getTime()) return "selesai";
    return "mengerjakan";
  }
  if (!tes.aktif) return "nonaktif";
  if (jumlahSoal <= 0) return "soal_belum_ada";
  const t = sekarang.getTime();
  if (t < new Date(tes.buka_at).getTime()) return "belum_buka";
  if (t < new Date(tes.tutup_at).getTime()) return "buka";
  return "terlewat";
}

/** Hasil (skor & pembahasan) boleh ditampilkan setelah tes ditutup utk semua peserta. */
export function hasilBolehTampil(tes: Pick<TesBaris, "tutup_at">, sekarang: Date): boolean {
  return sekarang.getTime() >= new Date(tes.tutup_at).getTime();
}

/** Buang jawaban yg nomor/kodenya tidak ada di soal; kosong = dihapus. Kode disamakan ke huruf besar. */
export function bersihkanJawaban(input: unknown, soal: { nomor: number; opsi: Opsi[] }[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  const peta = new Map(soal.map((s) => [String(s.nomor), new Set(s.opsi.map((o) => o.kode))]));
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const kodeOpsi = peta.get(k);
    if (!kodeOpsi || typeof v !== "string") continue;
    const kode = v.trim().toUpperCase();
    if (kodeOpsi.has(kode)) out[k] = kode;
  }
  return out;
}

export type RincianJawab = { nomor: number; jawab: string | null; kunci: string; benar: boolean; bobot: number };
export type HasilSkor = { benar: number; total: number; skor: number; rincian: RincianJawab[] };

/** Skor = jumlah bobot soal benar / jumlah bobot semua soal x 100 (2 desimal). */
export function hitungSkor(soal: { nomor: number; kunci: string; bobot: number }[], jawaban: Record<string, string>): HasilSkor {
  let bobotBenar = 0;
  let bobotTotal = 0;
  let benar = 0;
  const rincian: RincianJawab[] = [];
  for (const s of soal) {
    const j = jawaban[String(s.nomor)] ?? null;
    const ok = j !== null && j === s.kunci;
    bobotTotal += s.bobot;
    if (ok) {
      bobotBenar += s.bobot;
      benar++;
    }
    rincian.push({ nomor: s.nomor, jawab: j, kunci: s.kunci, benar: ok, bobot: s.bobot });
  }
  const skor = bobotTotal > 0 ? Math.round((bobotBenar / bobotTotal) * 10000) / 100 : 0;
  return { benar, total: soal.length, skor, rincian };
}

// ======================================================================
// Template Excel soal
// ======================================================================

export const KODE_OPSI = ["A", "B", "C", "D", "E"] as const;
export const MAKS_SOAL = 100;
export const HEADER_TEMPLATE = ["No", "Soal", "A", "B", "C", "D", "E", "Kunci", "Bobot"];

/** Baris contoh utk template yang diunduh (lembar "Soal"). */
export function barisTemplate(): (string | number)[][] {
  return [
    HEADER_TEMPLATE,
    [1, "Contoh: Apa kepanjangan PSP dalam kegiatan ini?", "Pendataan Status Pemulihan", "Pendataan Sensus Penduduk", "Pemutakhiran Status Petugas", "Pencacahan Sampel Panel", "", "A", 1],
    [2, "Contoh: Aplikasi yang dipakai petugas untuk mengisi kuesioner adalah ...", "SIGAP", "FASIH", "Zoom", "WhatsApp", "", "B", 1],
  ];
}

export const PETUNJUK_TEMPLATE = [
  "Petunjuk pengisian template soal",
  "1. Isi lembar 'Soal' mulai baris ke-2 (baris 1 = judul kolom, jangan diubah). Hapus dua baris contoh sebelum diunggah.",
  "2. Kolom No = nomor soal (angka, unik). Kolom Soal = teks pertanyaan.",
  "3. Kolom A–E = pilihan jawaban. Minimal diisi A dan B; kolom yang kosong dianggap tidak ada (boleh hanya sampai C atau D).",
  "4. Kolom Kunci = huruf jawaban benar (A/B/C/D/E) dan harus menunjuk pilihan yang terisi.",
  "5. Kolom Bobot = nilai soal (angka > 0). Kosong dianggap 1.",
  `6. Maksimal ${MAKS_SOAL} soal per tes. Soal tidak dapat diganti setelah ada peserta yang mulai mengerjakan.`,
];

export type HasilBacaSoal = { soal: SoalLengkap[]; galat: string[] };

function teksSel(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\r\n?/g, "\n").trim();
}

/** Validasi kumpulan soal "mentah" (baris-baris sel Excel DAN/ATAU objek JSON dari klien). */
function rakitSoal(mentah: { baris: number; nomor: unknown; teks: unknown; opsi: unknown[]; kunci: unknown; bobot: unknown }[]): HasilBacaSoal {
  const galat: string[] = [];
  const soal: SoalLengkap[] = [];
  const nomorTerpakai = new Set<number>();
  for (const m of mentah) {
    const awal = `Baris ${m.baris}`;
    const nomor = Number(teksSel(m.nomor));
    if (!Number.isInteger(nomor) || nomor <= 0) {
      galat.push(`${awal}: nomor soal harus bilangan bulat > 0.`);
      continue;
    }
    if (nomorTerpakai.has(nomor)) {
      galat.push(`${awal}: nomor ${nomor} dipakai dua kali.`);
      continue;
    }
    nomorTerpakai.add(nomor);
    const teks = teksSel(m.teks);
    if (!teks) {
      galat.push(`${awal} (soal ${nomor}): teks soal kosong.`);
      continue;
    }
    const opsi: Opsi[] = [];
    KODE_OPSI.forEach((kode, i) => {
      const t = teksSel(m.opsi[i]);
      if (t) opsi.push({ kode, teks: t });
    });
    if (opsi.length < 2) {
      galat.push(`${awal} (soal ${nomor}): minimal dua pilihan jawaban (A dan B).`);
      continue;
    }
    const kunci = teksSel(m.kunci).toUpperCase();
    if (!opsi.some((o) => o.kode === kunci)) {
      galat.push(`${awal} (soal ${nomor}): kunci "${teksSel(m.kunci) || "kosong"}" tidak sesuai pilihan yang terisi (${opsi.map((o) => o.kode).join("/")}).`);
      continue;
    }
    const bobotTeks = teksSel(m.bobot);
    const bobot = bobotTeks === "" ? 1 : Number(bobotTeks.replace(",", "."));
    if (!Number.isFinite(bobot) || bobot <= 0 || bobot > 1000) {
      galat.push(`${awal} (soal ${nomor}): bobot harus angka > 0.`);
      continue;
    }
    soal.push({ nomor, teks, opsi, kunci, bobot });
  }
  if (soal.length === 0 && galat.length === 0) galat.push("Tidak ada soal yang terbaca. Isi mulai baris ke-2 lembar 'Soal'.");
  if (mentah.length > MAKS_SOAL) galat.push(`Terlalu banyak soal (${mentah.length}); maksimal ${MAKS_SOAL}.`);
  soal.sort((a, b) => a.nomor - b.nomor);
  return { soal, galat };
}

/**
 * Baca baris-baris lembar Excel (array of array, mis. XLSX.utils.sheet_to_json(ws,{header:1,defval:""})).
 * Baris judul dikenali bila sel pertamanya "No"; baris kosong dilewati.
 */
export function bacaBarisSoal(baris: unknown[][]): HasilBacaSoal {
  const mentah: Parameters<typeof rakitSoal>[0] = [];
  baris.forEach((r, i) => {
    const sel = Array.isArray(r) ? r : [];
    if (sel.every((c) => teksSel(c) === "")) return;
    if (i === 0 && teksSel(sel[0]).toLowerCase() === "no") return; // judul kolom
    mentah.push({ baris: i + 1, nomor: sel[0], teks: sel[1], opsi: sel.slice(2, 7), kunci: sel[7], bobot: sel[8] });
  });
  return rakitSoal(mentah);
}

/** Validasi ulang di server atas JSON dari klien: [{nomor,teks,opsi:[{kode,teks}],kunci,bobot}]. */
export function validasiSoalJson(input: unknown): HasilBacaSoal {
  if (!Array.isArray(input)) return { soal: [], galat: ["Format soal tidak valid."] };
  const mentah: Parameters<typeof rakitSoal>[0] = input.map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const opsiArr = Array.isArray(o.opsi) ? (o.opsi as Record<string, unknown>[]) : [];
    const opsi = KODE_OPSI.map((k) => opsiArr.find((p) => String(p?.kode ?? "").toUpperCase() === k)?.teks ?? "");
    return { baris: i + 1, nomor: o.nomor, teks: o.teks, opsi, kunci: o.kunci, bobot: o.bobot };
  });
  return rakitSoal(mentah);
}

// ======================================================================
// Info Undangan (sumber: Undangan B-409/13030/VS.230/2026 tanggal 6 Okt 2026)
// ======================================================================
export const UNDANGAN = {
  nomor: "B-409/13030/VS.230/2026",
  tanggal_surat: "6 Oktober 2026",
  hal: "Undangan Pelatihan Petugas Pendataan Pascabencana Sumatera 2026",
  hari_tanggal: "Kamis, 8 Oktober 2026",
  tanggal_iso: "2026-10-08",
  pukul: "08.00–16.00 WIB",
  tempat: "Mami Hotel",
  pakaian: "Pakaian sopan dan rapi: batik pada pembukaan dan penutupan; pakaian bebas dan rapi selama pelatihan berlangsung.",
  ketentuan: [
    "Hadir tepat waktu pada kelas yang telah ditetapkan dan mengikuti seluruh rangkaian kegiatan sesuai jadwal.",
    "Seluruh biaya pelaksanaan kegiatan dibebankan pada DIPA BPS Kabupaten Solok sesuai ketentuan yang berlaku.",
    "Seluruh peserta dibayarkan transpor lokal sehingga wajib melampirkan 5 (lima) foto dengan time stamp: saat akan berangkat, saat sampai di lokasi, saat mengikuti kegiatan, saat akan pulang, dan saat tiba kembali di domisili.",
    "Seluruh foto diunggah melalui aplikasi SIGAP (menu Transport Lokal).",
    "Informasi lebih lanjut dikoordinasikan dengan panitia pelaksana/petugas yang ditunjuk.",
  ],
  pdf: "/api/sigap/pelatihan/undangan",
  jadwal: [
    { waktu: "08.00–08.30", materi: ["Registrasi"], ket: "" },
    { waktu: "08.30–08.45", materi: ["Pembukaan"], ket: "Pimpinan" },
    { waktu: "08.45–09.15", materi: ["Penjelasan Umum Pendataan Status Pemulihan 2026", "Organisasi Lapangan"], ket: "Inda" },
    { waktu: "09.15–10.00", materi: ["FASIH"], ket: "" },
    { waktu: "10.00–10.15", materi: ["Istirahat"], ket: "" },
    { waktu: "10.15–11.00", materi: ["Kuesioner Keluarga: Blok I-II"], ket: "Inda" },
    { waktu: "11.00–12.30", materi: ["Kuesioner Keluarga: Blok III - Keterangan Perumahan", "Kondisi Ketenagakerjaan - Aset"], ket: "Inda" },
    { waktu: "12.30–13.30", materi: ["Istirahat"], ket: "" },
    { waktu: "13.30–14.15", materi: ["Kuesioner Keluarga: Blok III - Bantuan dan Mitigasi Bencana"], ket: "Inda" },
    { waktu: "14.15–15.45", materi: ["Kuesioner Keluarga: Blok III - Dampak Bencana"], ket: "Inda" },
    { waktu: "15.45–16.00", materi: ["Penutupan dan administrasi"], ket: "Pimpinan" },
  ],
  ttd: { jabatan: "Kepala BPS Kabupaten Solok", nama: "Bambang Suryanggono" },
} as const;
