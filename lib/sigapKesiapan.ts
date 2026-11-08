// lib/sigapKesiapan.ts
//
// (8 Nov 2026) Kartu Kesiapan Kelola Pelatihan: satu tempat untuk melihat apakah pelatihan siap. Fungsi MURNI (tanpa database) supaya mudah diuji;
// pemuat data ada di lib/sigapKesiapanDb.ts. Skema: claude/skema-matang-kelola-pelatihan-8nov.md bagian D dan skema-bentrokan-penugasan-kelola-pelatihan-8nov.md.
//
// Status butir: ok (hijau) · kuning (perlu perhatian) · merah (mendesak) · info (informatif, tidak dinilai).
// Butir WAJIB menentukan lencana "Siap": belum hijau = kuning, dan menjadi MERAH mulai H-3 (hari mulai pelatihan dikurangi 3 hari) atau bila pelatihan sudah mulai.

export type StatusButir = "ok" | "kuning" | "merah" | "info";

export type Butir = {
  kode: string;
  judul: string;
  status: StatusButir;
  /** Ikut menentukan lencana "Siap". */
  wajib: boolean;
  ringkas: string;
  rincian: string[];
  /** Tempat memperbaiki: tab Kelola Pelatihan (+ sub-tab bila ada). */
  tab: string;
  sub?: string;
};

export type HasilKesiapan = {
  butir: Butir[];
  wajibOk: number;
  wajibTotal: number;
  siap: boolean;
  /** Selisih hari dari hari ini (WIB) ke hari mulai; negatif = sudah lewat. */
  hariKe: number | null;
  mendesak: boolean;
};

export type MasukanKesiapan = {
  /** YYYY-MM-DD */
  mulai: string | null;
  selesai: string | null;
  penugasan: { akun_id: number; nama: string; peran: string; aktif: boolean; kelas: number | null }[];
  /** Hari kerja aktif milik kegiatan ini: akun x tanggal. */
  hariKerja: { akun_id: number; tanggal: string }[];
  /** Hari kerja akun yang sama pada tanggal pelatihan tetapi di kegiatan LAIN. */
  bentrok: { akun_id: number; nama: string; tanggal: string; kegiatan: string }[];
  /** Akun yang sudah menjawab undangan. */
  respons: number[];
  hierarki: { akun_id: number; atasan: number | null }[];
  kelas: number[];
  instruktur: { akun_id: number; kelas: number }[];
  tes: { jenis: string; jumlah_soal: number; aktif: boolean; buka_at: string; tutup_at: string }[];
  skema: { tersimpan: boolean; totalBobot: number | null };
  presensi: { titikAktif: number };
  materi: number;
  berkas: number;
  pengumuman: number;
  /** Peran yang tarifnya terpasang (tarif > 0) di kegiatan. */
  tarifPeran: string[];
  foto: { kelas: number; jumlah: number }[];
  undanganBernomor: number;
  sekarang: Date;
};

const BUKAN_PESERTA = new Set(["panitia", "instruktur"]);
export const FOTO_PER_HARI_PER_KELAS = 4;

/** YYYY-MM-DD menurut WIB. */
export function tanggalWib(d: Date): string {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}
const selisihHari = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Semua tanggal dari mulai sampai selesai (maks 31 hari). */
export function daftarTanggal(mulai: string | null, selesai: string | null): string[] {
  if (!mulai) return [];
  const akhir = selesai && selesai >= mulai ? selesai : mulai;
  const hasil: string[] = [];
  for (let i = 0; i < 31; i++) {
    const t = new Date(Date.parse(`${mulai}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    if (t > akhir) break;
    hasil.push(t);
  }
  return hasil;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function tglPendek(t: string): string {
  const [, m, d] = t.split("-");
  return `${Number(d)} ${BULAN[Number(m) - 1] ?? m}`;
}
const daftarNama = (nama: string[], maks = 6) => (nama.length <= maks ? nama.join(", ") : `${nama.slice(0, maks).join(", ")} dan ${nama.length - maks} lainnya`);

export function hitungKesiapan(m: MasukanKesiapan): HasilKesiapan {
  const hariIni = tanggalWib(m.sekarang);
  const hariKe = m.mulai ? selisihHari(hariIni, m.mulai) : null;
  const mendesak = hariKe !== null && hariKe <= 3;
  const tanggal = daftarTanggal(m.mulai, m.selesai);
  const jumlahHari = Math.max(1, tanggal.length);

  /** Butir wajib yang belum hijau: kuning, atau merah bila sudah mendesak. */
  const kurang = (wajib: boolean): StatusButir => (wajib && mendesak ? "merah" : "kuning");
  const butir: Butir[] = [];
  const tambah = (b: Butir) => butir.push(b);

  const aktif = m.penugasan.filter((p) => p.aktif);
  const peserta = aktif.filter((p) => !BUKAN_PESERTA.has(p.peran));
  const panitia = aktif.filter((p) => p.peran === "panitia");

  // 1. Peserta aktif
  {
    const nonaktif = m.penugasan.filter((p) => !p.aktif && !BUKAN_PESERTA.has(p.peran));
    tambah({
      kode: "peserta_aktif", judul: "Peserta aktif", wajib: false,
      status: nonaktif.length ? "kuning" : "ok",
      ringkas: nonaktif.length ? `${peserta.length} aktif, ${nonaktif.length} nonaktif` : `${peserta.length} peserta aktif`,
      rincian: nonaktif.map((p) => `${p.nama} (${p.peran.toUpperCase()}) nonaktif`),
      tab: "tim", sub: "pengaturan",
    });
  }

  // 2. Hari kerja pada tanggal pelatihan (bentrok dengan kegiatan lain dihitung di butir Bentrokan, bukan di sini)
  {
    const punya = new Set(m.hariKerja.map((h) => `${h.akun_id}|${h.tanggal}`));
    const bentrok = new Set(m.bentrok.map((h) => `${h.akun_id}|${h.tanggal}`));
    const diwajibkan = [...peserta, ...panitia];
    const lengkap = new Map<number, { nama: string; n: number }>();
    for (const p of diwajibkan) {
      for (const t of tanggal) {
        const k = `${p.akun_id}|${t}`;
        if (punya.has(k) || bentrok.has(k)) continue;
        const e = lengkap.get(p.akun_id) ?? { nama: p.nama, n: 0 };
        e.n += 1;
        lengkap.set(p.akun_id, e);
      }
    }
    const daftar = Array.from(lengkap.values());
    tambah({
      kode: "hari_kerja", judul: "Hari kerja pada tanggal pelatihan", wajib: true,
      status: daftar.length ? kurang(true) : "ok",
      ringkas: daftar.length ? `${daftar.length} orang belum punya hari kerja` : tanggal.length ? `Lengkap untuk ${tanggal.length} hari` : "Tanggal pelatihan belum diisi",
      rincian: daftar.map((e) => `${e.nama}: ${e.n} hari belum ada`),
      tab: "harikerja",
    });
  }

  // 3. Respons undangan
  {
    const jawab = new Set(m.respons);
    const belum = peserta.filter((p) => !jawab.has(p.akun_id));
    tambah({
      kode: "undangan_respons", judul: "Respons undangan", wajib: false,
      status: belum.length ? "kuning" : "ok",
      ringkas: belum.length ? `${belum.length} dari ${peserta.length} belum menjawab (boleh sampai hari H)` : `Semua ${peserta.length} sudah menjawab`,
      rincian: belum.map((p) => p.nama),
      tab: "notifikasi",
    });
  }

  // 4. Hierarki (PPL punya atasan)
  {
    const atasan = new Map(m.hierarki.map((h) => [h.akun_id, h.atasan]));
    const tanpa = peserta.filter((p) => p.peran === "ppl" && !atasan.get(p.akun_id));
    tambah({
      kode: "hierarki", judul: "Hierarki (atasan setiap PPL)", wajib: false,
      status: tanpa.length ? "kuning" : "ok",
      ringkas: tanpa.length ? `${tanpa.length} PPL belum punya atasan` : "Setiap PPL punya atasan",
      rincian: tanpa.map((p) => p.nama),
      tab: "tim", sub: "hierarki",
    });
  }

  // 5. Kelas dan instruktur
  {
    const kelas = m.kelas;
    const tanpaInstruktur = kelas.filter((k) => !m.instruktur.some((i) => i.kelas === k));
    const adaMasalah = kelas.length === 0 || tanpaInstruktur.length > 0;
    tambah({
      kode: "kelas_instruktur", judul: "Kelas dan instruktur", wajib: true,
      status: adaMasalah ? kurang(true) : "ok",
      ringkas: kelas.length === 0 ? "Belum ada kelas" : tanpaInstruktur.length ? `${tanpaInstruktur.length} kelas belum punya instruktur` : `${kelas.length} kelas, ${m.instruktur.length} instruktur`,
      rincian: tanpaInstruktur.map((k) => `Kelas ${k} belum punya instruktur`),
      tab: "tim", sub: "instruktur",
    });
  }

  // 6. Panitia
  tambah({
    kode: "panitia", judul: "Panitia ditetapkan", wajib: true,
    status: panitia.length ? "ok" : kurang(true),
    ringkas: panitia.length ? `${panitia.length} panitia: ${daftarNama(panitia.map((p) => p.nama))}` : "Belum ada panitia",
    rincian: [],
    tab: "tim", sub: "pengaturan",
  });

  // 7. Pretest dan Posttest tayang
  {
    const rincian: string[] = [];
    let masalah = false;
    for (const jenis of ["pretest", "posttest"]) {
      const t = m.tes.find((x) => x.jenis === jenis);
      const nama = jenis === "pretest" ? "Pretest" : "Posttest";
      if (!t) { masalah = true; rincian.push(`${nama}: belum dibuat`); continue; }
      const adaSoal = t.jumlah_soal > 0;
      const adaJadwal = Number.isFinite(Date.parse(t.buka_at)) && Number.isFinite(Date.parse(t.tutup_at)) && Date.parse(t.tutup_at) > Date.parse(t.buka_at);
      if (!adaSoal || !adaJadwal || !t.aktif) masalah = true;
      rincian.push(`${nama}: soal ${adaSoal ? `✓ (${t.jumlah_soal})` : "✗"} · jadwal ${adaJadwal ? "✓" : "✗"} · tampil ke peserta ${t.aktif ? "✓" : "✗ (saklar mati)"}`);
    }
    tambah({
      kode: "tes_tayang", judul: "Pretest dan Posttest siap tayang", wajib: true,
      status: masalah ? kurang(true) : "ok",
      ringkas: masalah ? "Ada tes yang belum memenuhi soal, jadwal, atau saklar tampil" : "Soal, jadwal, dan saklar tampil lengkap",
      rincian,
      tab: "soal",
    });
  }

  // 8. Jadwal tes sesuai tanggal dan urutan
  {
    const pre = m.tes.find((x) => x.jenis === "pretest");
    const post = m.tes.find((x) => x.jenis === "posttest");
    const rincian: string[] = [];
    let masalah = false;
    for (const [nama, t] of [["Pretest", pre], ["Posttest", post]] as const) {
      if (!t) continue;
      const hari = tanggalWib(new Date(t.buka_at));
      if (tanggal.length && !tanggal.includes(hari)) { masalah = true; rincian.push(`${nama} dibuka ${tglPendek(hari)}, di luar tanggal pelatihan`); }
    }
    if (pre && post) {
      if (pre.buka_at === post.buka_at && pre.tutup_at === post.tutup_at) { masalah = true; rincian.push("Pretest dan Posttest dibuka pada jam yang sama persis; Posttest sebaiknya sesudah Pretest"); }
      else if (Date.parse(post.buka_at) < Date.parse(pre.tutup_at)) { masalah = true; rincian.push("Posttest dibuka sebelum Pretest ditutup"); }
    }
    tambah({
      kode: "jadwal_tes", judul: "Jadwal tes sesuai tanggal dan urutan", wajib: false,
      status: masalah ? "kuning" : "ok",
      ringkas: masalah ? "Periksa jadwal Pretest dan Posttest" : "Jadwal sesuai",
      rincian,
      tab: "soal",
    });
  }

  // 9. Skema nilai akhir
  {
    const s = m.skema;
    const benar = s.totalBobot === null || Math.round(s.totalBobot) === 100;
    tambah({
      kode: "skema_nilai", judul: "Skema nilai akhir", wajib: false,
      status: !s.tersimpan ? "info" : benar ? "ok" : "kuning",
      ringkas: !s.tersimpan ? "Memakai skema bawaan (belum disimpan)" : benar ? "Tersimpan, total bobot 100%" : `Total bobot ${s.totalBobot}%, harus 100%`,
      rincian: [],
      tab: "soal",
    });
  }

  // 10. Presensi
  tambah({
    kode: "presensi", judul: "Titik presensi", wajib: true,
    status: m.presensi.titikAktif > 0 ? "ok" : kurang(true),
    ringkas: m.presensi.titikAktif > 0 ? `${m.presensi.titikAktif} titik aktif` : "Belum ada titik presensi aktif",
    rincian: [],
    tab: "persiapan", sub: "pengaturan",
  });

  // 11. Materi
  tambah({
    kode: "materi", judul: "Materi dan instrumen", wajib: false,
    status: m.materi + m.berkas > 0 ? "ok" : "info",
    ringkas: m.materi + m.berkas > 0 ? `${m.materi} materi, ${m.berkas} berkas` : "Belum ada materi atau berkas",
    rincian: [],
    tab: "persiapan", sub: "instrumen",
  });

  // 12. Pengumuman
  tambah({
    kode: "pengumuman", judul: "Pengumuman aktif", wajib: false,
    status: m.pengumuman > 0 ? "ok" : "info",
    ringkas: m.pengumuman > 0 ? `${m.pengumuman} pengumuman aktif` : "Tidak ada pengumuman aktif",
    rincian: [],
    tab: "notifikasi", sub: "pengumuman",
  });

  // 13. Tarif peran
  {
    const peranDipakai = Array.from(new Set([...aktif.map((p) => p.peran), ...(m.instruktur.length ? ["instruktur"] : [])]));
    const tanpaTarif = peranDipakai.filter((p) => !m.tarifPeran.includes(p));
    tambah({
      kode: "tarif", judul: "Tarif peran untuk SPJ", wajib: false,
      status: tanpaTarif.length ? "kuning" : "ok",
      ringkas: tanpaTarif.length ? `Peran tanpa tarif: ${tanpaTarif.map((p) => p.toUpperCase()).join(", ")}` : "Tarif terpasang untuk semua peran",
      rincian: [],
      tab: "administrasi",
    });
  }

  // 14. Foto pelaksanaan 4 per hari per kelas
  {
    const kelasDaftar = m.kelas.length ? m.kelas : [1];
    const target = FOTO_PER_HARI_PER_KELAS * jumlahHari;
    const rincian = kelasDaftar.map((k) => {
      const n = m.foto.find((f) => f.kelas === k)?.jumlah ?? 0;
      return `Kelas ${k}: ${n} dari ${target} foto`;
    });
    const kurangKelas = kelasDaftar.filter((k) => (m.foto.find((f) => f.kelas === k)?.jumlah ?? 0) < target);
    const sudahMulai = hariKe !== null && hariKe <= 0;
    tambah({
      kode: "foto_pelaksanaan", judul: "Foto pelaksanaan (4 per hari per kelas)", wajib: false,
      status: kurangKelas.length ? (sudahMulai ? "kuning" : "info") : "ok",
      ringkas: kurangKelas.length ? `Target ${target} foto per kelas; ${kurangKelas.length} kelas belum cukup` : "Foto pelaksanaan cukup",
      rincian,
      tab: "administrasi",
    });
  }

  // 15. Undangan bernomor
  tambah({
    kode: "undangan_nomor", judul: "Undangan bernomor tercatat", wajib: false,
    status: m.undanganBernomor > 0 ? "ok" : "kuning",
    ringkas: m.undanganBernomor > 0 ? `${m.undanganBernomor} nomor undangan tercatat di Arsip` : "Belum ada nomor undangan untuk pelatihan ini di Arsip",
    rincian: [],
    tab: "notifikasi",
  });

  // 16. Bentrokan jadwal
  {
    const rincian = m.bentrok.map((b) => `${b.nama}: ${tglPendek(b.tanggal)} bentrok dengan ${b.kegiatan}`);
    tambah({
      kode: "bentrokan", judul: "Bentrokan jadwal orang", wajib: true,
      status: m.bentrok.length ? kurang(true) : "ok",
      ringkas: m.bentrok.length ? `${m.bentrok.length} bentrokan belum diputuskan` : "Tidak ada bentrokan",
      rincian,
      tab: "harikerja",
    });
  }

  const wajib = butir.filter((b) => b.wajib);
  const wajibOk = wajib.filter((b) => b.status === "ok").length;
  return { butir, wajibOk, wajibTotal: wajib.length, siap: wajibOk === wajib.length, hariKe, mendesak };
}
