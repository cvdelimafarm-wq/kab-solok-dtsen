// lib/sigapTugasUtama.ts
//
// (8 Okt 2026) Beranda HP mengikuti mockup "Tugas utama + ikon cepat": SATU tugas paling mendesak ditampilkan di kartu atas, menu lain sebagai
// ikon cepat. Logika pemilihan murni di sini (tanpa React/DB) supaya mudah diuji. Skor menentukan siapa yang menang:
//   Pelatihan: kuis live 100 > tes sedang dikerjakan 98 > tes dibuka 92 > presensi sesi dibuka 90 > foto kurang pada hari pelatihan 80
//              > baca undangan 60 > pelajari instrumen 55 > tes menyusul 40 > semua selesai 10.
//   Kegiatan lain (dari kartu beranda): Transport Lokal 50/45 (masa tenggang), bencana 48, penyisiran 42, DTSEN operator 41.

import { keadaanHari, type RingkasHari } from "@/lib/sigapPresensi";

export type IkonKode = "motor" | "pedia" | "surat" | "langkah" | "tes" | "kuis" | "hadir" | "arsip" | "kelola" | "akses" | "kontrak" | "peta" | "grafik" | "periode" | "dtsen" | "bencana";
export type NadaLencana = "merah" | "emas" | "biru" | "hijau" | "abu";

export type TugasUtama = {
  skor: number;
  ikon: IkonKode;
  label: string;
  judul: string;
  uraian: string;
  lencana?: { teks: string; nada: NadaLencana };
  /** bar bersegmen: selesai dari total langkah */
  progres?: { selesai: number; total: number };
  href: string;
  aksi: string;
};

/** Bagian Hub (halaman Pelatihan) yang dipakai; Hub asli cocok secara struktur. */
export type HubTugas = {
  peserta: unknown | null;
  undangan: { tanggal_iso: string };
  tes: { jenis: string; judul?: string; status: string; buka_at: string; tutup_at: string; durasi_menit: number; jumlah_soal: number; sesi: { batas_at: string; terjawab: number } | null }[];
  langkah: { undangan_dibuka: boolean; instrumen_diunduh: boolean; foto: number; foto_total: number; slot: number[] } | null;
  presensi: { sudah: boolean; hari: RingkasHari } | null;
  kuis: { ada_ruang_aktif: boolean; sudah_gabung: boolean; kelas: number | null } | null;
  token_translok: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const wib = (ms: number) => new Date(ms + 7 * 3_600_000);
export const jamWibMs = (ms: number) => `${pad(wib(ms).getUTCHours())}.${pad(wib(ms).getUTCMinutes())}`;
const tglWib = (ms: number) => wib(ms).toISOString().slice(0, 10);

/** Detik -> "mm:ss" (di bawah 1 jam) atau "2 j 34 mnt". */
export function sisaTeks(detik: number): string {
  const s = Math.max(0, Math.floor(detik));
  if (s < 3600) return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  return `${Math.floor(s / 3600)} j ${pad(Math.floor((s % 3600) / 60))} mnt`;
}

const NAMA_TES: Record<string, string> = { pretest: "Pretest", posttest: "Posttest" };
const namaTes = (jenis: string) => NAMA_TES[jenis] ?? "Tes";

/** Tugas pelatihan paling mendesak untuk peserta; null bila bukan peserta. */
export function tugasUtamaPelatihan(hub: HubTugas, nowMs: number): TugasUtama | null {
  if (!hub.peserta) return null;
  const L = hub.langkah;
  const pre = hub.tes.find((t) => t.jenis === "pretest");
  const post = hub.tes.find((t) => t.jenis === "posttest");
  const fotoLengkap = !!L && L.foto_total > 0 && L.foto >= L.foto_total;
  const selesaiTes = (t?: { status: string }) => t?.status === "selesai";
  // progres umum: undangan, instrumen, pretest, presensi, posttest, foto
  const langkahSelesai = [!!L?.undangan_dibuka, !!L?.instrumen_diunduh, selesaiTes(pre), !!hub.presensi?.sudah, selesaiTes(post), fotoLengkap].filter(Boolean).length;
  const progres = { selesai: langkahSelesai, total: 6 };
  const dasar = { label: "LANGKAH PELATIHAN", progres, href: "/sigap/pelatihan" };
  const kandidat: TugasUtama[] = [];

  if (hub.kuis?.ada_ruang_aktif) {
    kandidat.push({
      ...dasar,
      skor: 100,
      ikon: "kuis",
      label: "SEDANG BERLANGSUNG",
      judul: hub.kuis.sudah_gabung ? "Adu Sigap sedang berlangsung" : "Adu Sigap dibuka, ayo gabung",
      uraian: hub.kuis.sudah_gabung ? "Anda sudah bergabung. Kembali ke layar kuis." : "Kuis langsung dipimpin pemandu. Jawab dari HP Anda.",
      lencana: { teks: "Live", nada: "hijau" },
      href: `/sigap/pelatihan/kuis?kelas=${hub.kuis.kelas ?? 1}&gabung=1`,
      aksi: hub.kuis.sudah_gabung ? "Masuk kembali ke kuis" : "Gabung kuis",
    });
  }

  for (const t of hub.tes) {
    const nm = namaTes(t.jenis);
    const buka = new Date(t.buka_at).getTime();
    const tutup = new Date(t.tutup_at).getTime();
    if (t.status === "mengerjakan" && t.sesi) {
      const sisa = (new Date(t.sesi.batas_at).getTime() - nowMs) / 1000;
      kandidat.push({
        ...dasar,
        skor: 98,
        ikon: "tes",
        label: "SEDANG ANDA KERJAKAN",
        judul: `Lanjutkan ${nm}`,
        uraian: `Terjawab ${t.sesi.terjawab} dari ${t.jumlah_soal} soal. Jawaban tersimpan otomatis.`,
        lencana: { teks: `sisa ${sisaTeks(sisa)}`, nada: sisa < 300 ? "merah" : "emas" },
        href: `/sigap/pelatihan/tes/${t.jenis}`,
        aksi: "Lanjutkan mengerjakan",
      });
    } else if (t.status === "buka") {
      kandidat.push({
        ...dasar,
        skor: 92,
        ikon: "tes",
        label: "TUGAS HARI INI",
        judul: `Kerjakan ${nm}`,
        uraian: `${t.jumlah_soal} soal, ${t.durasi_menit} menit sejak Mulai. Sesi ditutup pukul ${jamWibMs(tutup)} WIB.`,
        lencana: { teks: `tutup ${jamWibMs(tutup)}`, nada: (tutup - nowMs) / 1000 < 1800 ? "merah" : "emas" },
        href: `/sigap/pelatihan/tes/${t.jenis}`,
        aksi: `Mulai ${nm}`,
      });
    } else if (t.status === "belum_buka") {
      kandidat.push({
        ...dasar,
        skor: 40,
        ikon: "tes",
        label: "SEGERA",
        judul: `${nm} dibuka pukul ${jamWibMs(buka)}`,
        uraian: `${t.jumlah_soal} soal, ${t.durasi_menit} menit sejak Mulai.`,
        lencana: { teks: `dibuka ${jamWibMs(buka)}`, nada: "biru" },
        aksi: "Lihat langkah",
      });
    }
  }

  if (hub.presensi) {
    const kh = keadaanHari(hub.presensi.hari, nowMs);
    if (kh.aktif) {
      const banyak = kh.total > 1;
      kandidat.push({
        ...dasar,
        skor: 90,
        ikon: "hadir",
        label: "TUGAS HARI INI",
        judul: banyak ? `Presensi ${kh.aktif.nama} sudah dibuka` : "Presensi sudah dibuka",
        uraian: `Lakukan presensi setelah tiba di lokasi, sampai pukul ${jamWibMs(new Date(kh.aktif.tutup_at).getTime())} WIB. Aktifkan lokasi (GPS) HP.`,
        lencana: { teks: `sampai ${jamWibMs(new Date(kh.aktif.tutup_at).getTime())}`, nada: "emas" },
        aksi: "Buka presensi",
      });
    }
  }

  if (L && L.foto_total > 0 && !fotoLengkap && tglWib(nowMs) === hub.undangan.tanggal_iso) {
    const kurang = L.foto_total - L.foto;
    const akhirHari = Date.parse(`${hub.undangan.tanggal_iso}T23:59:00+07:00`);
    const sisa = (akhirHari - nowMs) / 1000;
    kandidat.push({
      ...dasar,
      skor: 80,
      ikon: "motor",
      label: "TUGAS HARI INI",
      judul: `Unggah ${kurang} foto lagi`,
      uraian: "Foto kegiatan pelatihan untuk Transport Lokal. Boleh satu per satu, batas 23.59 WIB.",
      lencana: sisa > 0 ? { teks: `sisa ${sisaTeks(sisa)}`, nada: sisa < 7200 ? "merah" : "emas" } : undefined,
      progres: { selesai: L.foto, total: L.foto_total },
      href: hub.token_translok ? `/sigap/translok/${hub.token_translok}` : "/sigap/pelatihan",
      aksi: L.foto > 0 ? "Lanjutkan unggah foto" : "Unggah foto",
    });
  }

  if (L && !L.undangan_dibuka) {
    kandidat.push({ ...dasar, skor: 60, ikon: "surat", label: "MULAI DARI SINI", judul: "Baca undangan pelatihan", uraian: "Kelas, jam, dan pakaian ada di sana. Cukup dibuka sekali.", href: "/sigap/pelatihan/undangan", aksi: "Buka undangan" });
  }
  if (L && !L.instrumen_diunduh) {
    kandidat.push({ ...dasar, skor: 55, ikon: "pedia", label: "PERSIAPAN", judul: "Pelajari instrumen", uraian: "Unduh kuesioner dan buku pedoman agar siap saat pretest.", href: "/sigap/pelatihan/instrumen", aksi: "Buka instrumen" });
  }

  if (kandidat.length === 0) {
    return { ...dasar, skor: 10, ikon: "langkah", label: "LANGKAH PELATIHAN", judul: langkahSelesai >= 6 ? "Semua langkah pelatihan selesai" : "Tidak ada yang mendesak sekarang", uraian: langkahSelesai >= 6 ? "Terima kasih telah mengikuti pelatihan dengan baik." : "Cek jadwal berikutnya di halaman Langkah Pelatihan.", lencana: langkahSelesai >= 6 ? { teks: "Selesai", nada: "hijau" } : undefined, aksi: "Lihat langkah" };
  }
  return kandidat.reduce((a, b) => (b.skor > a.skor ? b : a));
}

export type KartuRingkas = { kode: string; grup: string; judul: string; uraian: string; status?: { label: string; nada: string }; href?: string | null; sso?: string; label_aksi?: string };

const SKOR_KARTU: [RegExp, number, IkonKode][] = [
  [/^translok-/, 50, "motor"],
  [/^bencana$/, 48, "bencana"],
  [/^penyisiran$/, 42, "peta"],
  [/^dtsen-operator$/, 41, "dtsen"],
];

/** Ikon untuk kartu beranda mana pun. */
export function ikonKartu(kode: string): IkonKode {
  if (kode.startsWith("translok-") || kode === "admin-translok") return "motor";
  if (kode === "bencana" || kode === "admin-bencana" || kode === "pendataan") return "bencana"; // (11 Okt 2026) kartu Lembar Pendataan
  if (kode === "penyisiran" || kode === "admin-penyisiran") return "peta";
  if (kode === "pedia" || kode === "pedia-kelola") return "pedia";
  if (kode === "seruti" || kode === "admin-seruti") return "grafik";
  if (kode === "kontrak") return "kontrak";
  if (kode === "akses") return "akses";
  if (kode === "portal-admin") return "periode";
  if (kode === "dtsen-operator" || kode === "admin-dtsen") return "dtsen";
  if (kode === "pelatihan") return "langkah";
  if (kode === "pelatihan-undangan") return "surat";
  if (kode === "pelatihan-instrumen") return "arsip";
  if (kode === "pelatihan-kelola") return "kelola";
  if (kode.startsWith("admin-")) return "kelola";
  return "arsip";
}

const LENCANA_NADA: Record<string, NadaLencana> = { aktif: "hijau", tenggang: "emas", info: "biru", arsip: "abu", peringatan: "merah" };

/** Tugas utama dari kartu beranda (kegiatan selain pelatihan): kartu grup "tugas" yang aktif/masa tenggang. */
export function tugasDariKartu(kartu: KartuRingkas[]): TugasUtama | null {
  let terbaik: TugasUtama | null = null;
  for (const k of kartu) {
    if (k.grup !== "tugas" || (!k.href && !k.sso)) continue;
    const cocok = SKOR_KARTU.find(([re]) => re.test(k.kode));
    if (!cocok) continue;
    if (k.status?.nada === "arsip" || k.status?.nada === "info") continue; // arsip/belum mulai bukan tugas mendesak
    let skor = cocok[1];
    if (k.status?.nada === "tenggang") skor -= 5;
    if (terbaik && terbaik.skor >= skor) continue;
    terbaik = {
      skor,
      ikon: cocok[2],
      label: "TUGAS AKTIF",
      judul: k.judul,
      uraian: k.uraian,
      lencana: k.status ? { teks: k.status.label, nada: LENCANA_NADA[k.status.nada] ?? "biru" } : undefined,
      href: k.href ?? "/",
      aksi: k.label_aksi ?? "Buka",
    };
  }
  return terbaik;
}

/** Gabungkan: pelatihan dan kegiatan lain; skor tertinggi menang. */
export function pilihTugasUtama(...kandidat: (TugasUtama | null | undefined)[]): TugasUtama | null {
  const ada = kandidat.filter((x): x is TugasUtama => !!x);
  if (ada.length === 0) return null;
  return ada.reduce((a, b) => (b.skor > a.skor ? b : a));
}
