// lib/keu/dokumenLanjutan.ts
//
// (29 Okt 2026) "Keluaran lanjutan" dari satu identifikasi: tiga dokumen cetak yang SELALU dibentuk dari data terbaru (tanpa simpanan, tanpa versi):
//   1. Laporan rencana pelaksanaan untuk Kepala (KPA): ringkasan, jadwal, petugas, biaya, pengadaan, hal yang perlu diperhatikan, lampiran.
//   2. Kebutuhan administrasi untuk PJ administrasi: dokumen pertanggungjawaban per akun (master keu_master_dok) beserta pihak dan tenggat.
//   3. Kerangka Acuan Kerja (KAK) terbaru: bagian yang dapat diturunkan diisi otomatis; latar belakang, tujuan, dasar hukum, keluaran, dan penutup diisi manual.
// Berkas ini MURNI (tanpa React/DB). Hasilnya model dokumen netral (Dokumen) yang dirender oleh halaman. Tenggat dan angka hanya penyajian; aturan resmi
// ditetapkan PPK atau pejabat berwenang (cek aturan).

import { tglIndo } from "./identifikasi";
import { alasanDraf, jumlahPetugas, jumlahRincian, KODE_PERAN, NAMA_PERAN, pesertaKelas, ringkasTanggalKelas, type BarisRincian, type IsiLanjutan } from "./lanjutan";
import type { IsiKeluaran } from "./keluaran";
import type { PeriodeJadwal } from "./rabSurvei";
import { rupiah } from "./ro";

// ---------------------------------------------------------------------------------------------------------------------
// Model dokumen
// ---------------------------------------------------------------------------------------------------------------------
export type Tabel = { kolom: string[]; baris: string[][]; /** Indeks kolom yang rata kanan (angka). */ kanan?: number[] };
export type Blok = { judul?: string; teks?: string[]; daftar?: string[]; tabel?: Tabel[]; /** Mulai halaman baru saat dicetak. */ halamanBaru?: boolean; /** Teks bertanda perlu diisi manual. */ manual?: boolean };
export type Dokumen = { kode: "laporan" | "administrasi" | "kak"; judul: string; subjudul: string; blok: Blok[]; tandaTangan: { jabatan: string; nama?: string }[] };

export type Identitas = { nama: string; roKode: string; tahun: number; identVer: number };
export type BarisDok = { sumber: "pola" | "skema"; kode: string; seksi_urut: number; seksi_huruf: string; seksi_judul: string; no: number; uraian: string; pihak: string[]; ket: string; gen: boolean; aktif?: boolean };

export type KonteksLanjutan = {
  identitas: Identitas;
  /** Jenis periode identifikasi (mis. "Triwulanan"). */
  jenisPeriode: string;
  isi: IsiLanjutan;
  /** Jendela pendataan per periode (jadwalPendataan). */
  jendela: PeriodeJadwal[];
  rincian: BarisRincian[];
  keluaran: IsiKeluaran;
  statusSurvei: "draf" | "siap";
  /** Versi paket keluaran terakhir yang diajukan (null = belum pernah). */
  paketVer: number | null;
  /** Master dokumen aktif. */
  dok: BarisDok[];
  /** Akun 6 digit -> kode pola dokumen (keu_master_akun.pola_kode), untuk akun tanpa skema khusus. */
  polaAkun: ReadonlyMap<string, string>;
  /** Teks tanggal cetak, mis. "29 Oktober 2026". */
  tanggalCetak: string;
};

const rp = (n: number): string => rupiah(Math.round(n));
const kosong = (s: string | null | undefined, g = "-"): string => (s && s.trim() !== "" ? s.trim() : g);
const urut = <T,>(a: T[], f: (x: T) => string | number): T[] => [...a].sort((x, y) => { const p = f(x), q = f(y); return p < q ? -1 : p > q ? 1 : 0; });

// ---------------------------------------------------------------------------------------------------------------------
// Bagian bersama
// ---------------------------------------------------------------------------------------------------------------------
export function tabelJadwal(k: KonteksLanjutan): Tabel[] {
  const t: Tabel[] = [];
  const kelas = k.isi.kelas;
  if (kelas.length > 0) {
    t.push({
      kolom: ["Kelas", "Sesi", "Periode", "Metode", "Tempat", "Tanggal", "OH", "Peserta", "Status"],
      baris: kelas.map((c) => [kosong(c.nama), c.sesi === "briefing" ? "Briefing" : "Pelatihan", kosong(c.periode), kosong(c.metode), [c.tempat, c.lokasi].filter(Boolean).join(": ") || "-", ringkasTanggalKelas(c), String(c.oh), String(pesertaKelas(k.isi, c)), c.fix ? "Fix" : "Perkiraan"]),
      kanan: [6, 7],
    });
  }
  if (k.jendela.length > 0) t.push({ kolom: ["Periode", "Pendataan mulai", "Pendataan selesai"], baris: k.jendela.map((p) => [p.periode, tglIndo(p.mulai), tglIndo(p.selesai)]) });
  return t;
}

export function tabelPeran(k: KonteksLanjutan): Tabel {
  const baris = KODE_PERAN.filter((kode) => k.isi.peran[kode]?.on).map((kode) => {
    const x = k.isi.peran[kode];
    const nama = k.isi.petugas.filter((p) => p.peran === kode);
    return [NAMA_PERAN[kode], String(x.nOrg), String(x.nMit), String(x.nOrg + x.nMit), String(nama.filter((p) => !p.menyusul).length), x.translok ? "Ya" : "Tidak", x.penginapan ? "Ya" : "Tidak", x.fix ? "Fix" : "Perkiraan"];
  });
  return { kolom: ["Peran", "Organik", "Mitra", "Jumlah", "Nama tercatat", "Translok", "Penginapan", "Status"], baris, kanan: [1, 2, 3, 4] };
}

export function tabelDaftarPetugas(k: KonteksLanjutan): Tabel {
  const urutan = new Map<string, number>(KODE_PERAN.map((p, i) => [p, i]));
  const p = [...k.isi.petugas].sort((a, b) => (urutan.get(a.peran) ?? 99) - (urutan.get(b.peran) ?? 99));
  return {
    kolom: ["No", "Nama", "Peran", "Status", "Sumber", "Keterangan"],
    baris: p.map((x, i) => [String(i + 1), x.menyusul || !x.nama.trim() ? "(nama menyusul)" : x.nama.trim(), x.peran ? NAMA_PERAN[x.peran] : "-", x.status, x.status === "Mitra" ? (x.sumber === "kepka" ? "Kepka" : x.sumber === "seleksi" ? "Seleksi" : "-") : "-", x.baru ? "Petugas baru" : ""]),
    kanan: [0],
  };
}

export function tabelAkunRab(k: KonteksLanjutan): Tabel {
  return { kolom: ["Akun", "Uraian akun", "Jumlah"], baris: k.keluaran.dana.akun.map((a) => [a.akun, kosong(a.nama), rp(a.total)]).concat([["", "Total RAB survei", rp(k.keluaran.dana.total)]]), kanan: [2] };
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Laporan rencana pelaksanaan (Kepala)
// ---------------------------------------------------------------------------------------------------------------------
/** Hal yang perlu diperhatikan Kepala. Hanya peringatan; tidak ada yang memblokir. */
export function perhatianLaporan(k: KonteksLanjutan): string[] {
  const h: string[] = [];
  const draf = alasanDraf(k.isi);
  if (draf.length > 0) h.push(`Identifikasi lanjutan masih Draf: ${draf.join("; ")}.`);
  const sus = jumlahPetugas(k.isi).menyusul;
  if (sus > 0 && draf.length === 0) h.push(`${sus} nama petugas masih menyusul.`);
  const r = jumlahRincian(k.rincian);
  if (r.belum > 0) h.push(`${r.belum} rincian biaya pada identifikasi lanjutan belum dapat dihitung (tarif atau volume belum ada).`);
  const selisih = k.keluaran.total - r.total;
  if (r.terhitung > 0 && Math.abs(selisih) >= 1) h.push(`Total RAB survei ${rp(k.keluaran.total)} ${selisih > 0 ? "lebih besar" : "lebih kecil"} ${rp(Math.abs(selisih))} dari perhitungan identifikasi lanjutan ${rp(r.total)}.`);
  if (k.keluaran.n === 0) h.push("Belum ada rincian RAB yang berasal dari survei ini.");
  if (k.statusSurvei !== "siap") h.push("RAB per survei belum ditandai Siap diajukan.");
  if (k.paketVer === null) h.push("Paket keluaran (dana, pembayaran, pengadaan) belum diajukan ke penerima.");
  if (k.keluaran.bayar.tanpaTanggal > 0) h.push(`${k.keluaran.bayar.tanpaTanggal} rincian (${rp(k.keluaran.bayar.totalTanpaTanggal)}) belum punya tanggal kegiatan sehingga tenggat pembayarannya belum dapat dihitung.`);
  const kurang = k.keluaran.pengadaan.filter((b) => b.kurangSpek.length > 0).length;
  if (kurang > 0) h.push(`${kurang} butir pengadaan belum lengkap spesifikasinya.`);
  const perk = k.keluaran.pengadaan.filter((b) => b.perkiraan).length;
  if (perk > 0) h.push(`${perk} butir pengadaan masih berdasarkan perkiraan.`);
  return h;
}

export function susunLaporanKepala(k: KonteksLanjutan): Dokumen {
  const p = jumlahPetugas(k.isi);
  const r = jumlahRincian(k.rincian);
  const draf = alasanDraf(k.isi).length > 0;
  const awal = k.jendela.length ? urut(k.jendela.map((x) => x.mulai), (x) => x)[0] : "";
  const akhir = k.jendela.length ? urut(k.jendela.map((x) => x.selesai), (x) => x).slice(-1)[0] : "";
  const kelompok = new Map<string, { jumlah: number; n: number; belum: number }>();
  for (const b of k.rincian) {
    const g = kelompok.get(b.kelompok) ?? { jumlah: 0, n: 0, belum: 0 };
    if (b.jumlah === null) g.belum += 1; else { g.jumlah += b.jumlah; g.n += 1; }
    kelompok.set(b.kelompok, g);
  }
  const blok: Blok[] = [
    {
      judul: "1. Ringkasan",
      tabel: [{
        kolom: ["Hal", "Isi"],
        baris: [
          ["Kegiatan", k.identitas.nama], ["RO", k.identitas.roKode], ["Tahun", String(k.identitas.tahun)], ["Jenis periode", k.jenisPeriode],
          ["Jendela pendataan", awal && akhir ? `${tglIndo(awal)} s.d. ${tglIndo(akhir)}` : "belum ditetapkan"],
          ["Pelatihan dan briefing", `${k.isi.kelas.length} kelas`],
          ["Petugas", `${p.total} orang (${p.organik} organik, ${p.mitra} mitra, ${p.menyusul} nama menyusul)`],
          ["Total RAB survei", rp(k.keluaran.total)],
          ["Status identifikasi lanjutan", draf ? "Draf (masih ada Perkiraan)" : "Final"],
        ],
      }],
    },
    { judul: "2. Jadwal", tabel: tabelJadwal(k), teks: tabelJadwal(k).length === 0 ? ["Jadwal belum diisi."] : undefined },
    { judul: "3. Susunan petugas", tabel: [tabelPeran(k)], teks: k.isi.wilayah.trim() ? [`Wilayah tugas: ${k.isi.wilayah.trim()}`] : undefined },
    {
      judul: "4. Biaya",
      tabel: [
        { kolom: ["Kelompok biaya (identifikasi lanjutan)", "Rincian terhitung", "Belum terhitung", "Jumlah"], baris: [...kelompok.entries()].map(([g, v]) => [g, String(v.n), String(v.belum), rp(v.jumlah)]).concat([["Total perhitungan", String(r.terhitung), String(r.belum), rp(r.total)]]), kanan: [1, 2, 3] },
        tabelAkunRab(k),
        ...(k.keluaran.bayar.perBulan.length ? [{ kolom: ["Bulan rencana pembayaran", "Rincian", "Jumlah"], baris: k.keluaran.bayar.perBulan.map((b) => [b.bulan, String(b.n), rp(b.total)]), kanan: [1, 2] }] : []),
      ],
      teks: [`Angka RAB berasal dari baris RAB survei yang tersimpan; perhitungan identifikasi lanjutan hanya pembanding.`],
    },
    {
      judul: "5. Pengadaan",
      tabel: k.keluaran.pengadaan.length ? [{ kolom: ["Butir", "Jenis", "Akun", "Nilai RAB", "Dibutuhkan", "Spesifikasi"], baris: k.keluaran.pengadaan.map((b) => [b.uraian, b.jenis, b.akun, b.nilaiRab !== null ? rp(b.nilaiRab) : b.digabung ? "digabung" : "-", b.butuhMulai ? tglIndo(b.butuhMulai) : "-", b.kurangSpek.length ? `Kurang: ${b.kurangSpek.join(", ")}` : "Lengkap"]), kanan: [3] }] : undefined,
      teks: k.keluaran.pengadaan.length ? undefined : ["Tidak ada barang atau jasa yang perlu diadakan."],
    },
  ];
  const h = perhatianLaporan(k);
  blok.push({ judul: "6. Hal yang perlu diperhatikan", daftar: h.length ? h : undefined, teks: h.length ? undefined : ["Tidak ada hal yang perlu dicatat."] });
  blok.push({ judul: "Lampiran A. Daftar petugas", tabel: [tabelDaftarPetugas(k)], halamanBaru: true, teks: k.isi.petugas.length ? undefined : ["Belum ada petugas tercatat."] });
  blok.push({ judul: "Lampiran B. Rincian RAB survei", halamanBaru: true, tabel: [lampiranRab(k)], teks: k.keluaran.n ? undefined : ["Belum ada rincian RAB."] });
  return {
    kode: "laporan", judul: "Laporan Rencana Pelaksanaan", subjudul: `${k.identitas.nama} · RO ${k.identitas.roKode} · Tahun ${k.identitas.tahun}`, blok,
    tandaTangan: [{ jabatan: "Ketua Tim" }, { jabatan: "Pejabat Pembuat Komitmen" }],
  };
}

/** Rincian RAB: akun > item > rincian dalam satu tabel datar. */
export function lampiranRab(k: KonteksLanjutan): Tabel {
  const baris: string[][] = [];
  for (const a of k.keluaran.dana.akun) {
    baris.push([`Akun ${a.akun}${a.nama ? ` · ${a.nama}` : ""}`, "", "", rp(a.total), ""]);
    for (const i of a.item) {
      baris.push([`   ${kosong(i.uraian, "(item tanpa nama)")}`, "", "", rp(i.total), ""]);
      for (const r of i.rincian) baris.push([`      ${r.ket}`, `${r.volume} ${r.satuan} × ${rp(r.harga)}`, "", rp(r.jumlah), `Bulan ${r.bulan} mgg ${r.minggu}`]);
    }
  }
  return { kolom: ["Akun / item / rincian", "Volume × harga", "", "Jumlah", "Cair"], baris, kanan: [3] };
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Kebutuhan administrasi (PJ administrasi)
// ---------------------------------------------------------------------------------------------------------------------
/** Aturan memilih seksi skema dari uraian rincian: [pola uraian rincian, pola judul seksi]. Tanpa kecocokan, semua seksi ditampilkan. */
const ATURAN_SEKSI: [RegExp, RegExp][] = [
  [/konsumsi|snack|makan|minum/i, /konsumsi/i],
  [/pulsa|paket data/i, /pulsa|paket data/i],
  [/spanduk/i, /spanduk/i],
  [/perlengkapan|atk|penggandaan|fotokopi|cetak/i, /perlengkapan|penggandaan/i],
  [/pengajar|instruktur|innas|inda/i, /pengajar/i],
  [/camat|kades|kepala desa|penunjuk jalan/i, /camat/i],
  [/tim pelaksana|ketua tim|wakil ketua|anggota tim/i, /tim pelaksana/i],
  [/organik|pns bps/i, /pns bps/i],
  [/mitra|pencacah|pengawas|ppl|pml/i, /mitra/i],
  [/lebih dari 8|>\s*8 jam|di atas 8/i, /lebih dari 8/i],
  [/translok|transport/i, /kurang dari 8/i],
  [/narasumber|moderator/i, /narasumber|moderator/i],
  [/sewa/i, /sewa/i],
];

/** Indeks seksi (menurut judul) yang cocok dengan uraian-uraian rincian; kosong bila tak ada aturan yang cocok. */
export function pilihSeksi(uraian: string[], judul: string[]): number[] {
  const dipilih = new Set<number>();
  for (const u of uraian) for (const [pu, ps] of ATURAN_SEKSI) if (pu.test(u)) judul.forEach((j, i) => { if (ps.test(j)) dipilih.add(i); });
  return [...dipilih].sort((a, b) => a - b);
}

type Seksi = { urut: number; huruf: string; judul: string; baris: BarisDok[] };
function seksiAkun(dok: BarisDok[], akun: string, pola: string | undefined): { seksi: Seksi[]; dari: "skema" | "pola" | "tidak ada" } {
  const ambil = (sumber: "skema" | "pola", kode: string): Seksi[] => {
    const m = new Map<number, Seksi>();
    for (const d of dok.filter((x) => x.sumber === sumber && x.kode === kode && x.aktif !== false)) {
      const s = m.get(d.seksi_urut) ?? { urut: d.seksi_urut, huruf: d.seksi_huruf, judul: d.seksi_judul, baris: [] };
      s.baris.push(d);
      m.set(d.seksi_urut, s);
    }
    return [...m.values()].sort((a, b) => a.urut - b.urut).map((s) => ({ ...s, baris: s.baris.sort((a, b) => a.no - b.no) }));
  };
  const s = ambil("skema", akun);
  if (s.length) return { seksi: s, dari: "skema" };
  const p = pola ? ambil("pola", pola) : [];
  return p.length ? { seksi: p, dari: "pola" } : { seksi: [], dari: "tidak ada" };
}

const PIHAK: string[] = ["Tim Kerja", "Perencanaan", "PPK", "PBJ", "Tata Usaha", "Bendahara"];

export function susunKebutuhanAdministrasi(k: KonteksLanjutan): Dokumen {
  const blok: Blok[] = [];
  const hitung = new Map<string, number>();
  let nDok = 0;
  const bagian: Blok[] = [];
  for (const a of k.keluaran.dana.akun) {
    const rinci = k.keluaran.bayar.rincian.filter((r) => r.akun === a.akun);
    const spj = urut(rinci.map((r) => r.tenggatSpj).filter((x): x is string => !!x), (x) => x)[0];
    const byr = urut(rinci.map((r) => r.tenggatBayar).filter((x): x is string => !!x), (x) => x)[0];
    const { seksi, dari } = seksiAkun(k.dok, a.akun, k.polaAkun.get(a.akun));
    const cocok = seksi.length > 1 ? pilihSeksi(rinci.map((r) => `${r.ket} ${r.kelompok}`).concat(a.item.map((i) => i.uraian)), seksi.map((s) => s.judul)) : seksi.map((_, i) => i);
    const tampil = cocok.length ? cocok.map((i) => seksi[i]) : seksi;
    const tabel: Tabel[] = tampil.map((s) => ({
      kolom: [s.judul ? `${s.huruf ? `${s.huruf}. ` : ""}${s.judul}` : "Dokumen", "Pihak", "Keterangan", "Dibuat SIGAP"],
      baris: s.baris.map((d) => { for (const ph of d.pihak) hitung.set(ph, (hitung.get(ph) ?? 0) + 1); nDok += 1; return [`${d.no}. ${d.uraian}`, d.pihak.join(", "), kosong(d.ket, ""), d.gen ? "Ya" : "Tidak"]; }),
    }));
    const teks = [
      `${rinci.length} rincian · ${rp(a.total)}${spj ? ` · tenggat SPJ paling awal ${tglIndo(spj)}` : ""}${byr ? ` · tenggat bayar paling awal ${tglIndo(byr)}` : ""}.`,
    ];
    if (dari === "tidak ada") teks.push("Master dokumen untuk akun ini belum ada; lengkapi di Master atau tanyakan ke PPK.");
    else if (dari === "pola") teks.push("Memakai pola umum jenis akun karena belum ada skema khusus (cek aturan).");
    else if (seksi.length > 1 && cocok.length === 0) teks.push("Akun ini punya beberapa skema dan jenis belanjanya belum dapat dipastikan; semua skema ditampilkan. Pilih yang sesuai (cek aturan).");
    else if (seksi.length > 1) teks.push(`Skema terpilih menurut uraian rincian (cek aturan). Skema lain pada akun ini: ${seksi.filter((_, i) => !cocok.includes(i)).map((s) => s.judul).join("; ") || "-"}.`);
    bagian.push({ judul: `Akun ${a.akun}${a.nama ? ` · ${a.nama}` : ""}`, teks, tabel });
  }
  blok.push({
    judul: "Ringkasan",
    tabel: [{
      kolom: ["Hal", "Isi"],
      baris: [
        ["Kegiatan", k.identitas.nama], ["RO", `${k.identitas.roKode} · Tahun ${k.identitas.tahun}`], ["Akun belanja", String(k.keluaran.dana.akun.length)], ["Total dokumen yang perlu disiapkan", String(nDok)],
        ...PIHAK.filter((p) => hitung.has(p)).map((p) => [`Dokumen dipegang ${p}`, String(hitung.get(p))]),
        ["Tenggat", `SPJ ${k.keluaran.bayar.hariSpj} hari kerja, bayar ${k.keluaran.bayar.hariBayar === null ? "tanpa batas menurut lembar kebijakan" : `${k.keluaran.bayar.hariBayar} hari kerja`} sesudah hari terakhir kegiatan (cek aturan)`],
      ],
    }],
    teks: k.keluaran.n === 0 ? ["Belum ada rincian RAB dari survei ini, jadi belum ada akun yang diturunkan."] : undefined,
  });
  blok.push(...bagian);
  return { kode: "administrasi", judul: "Kebutuhan Administrasi", subjudul: `${k.identitas.nama} · RO ${k.identitas.roKode} · Tahun ${k.identitas.tahun}`, blok, tandaTangan: [{ jabatan: "Ketua Tim" }, { jabatan: "PJ Administrasi" }] };
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. KAK terbaru
// ---------------------------------------------------------------------------------------------------------------------
export type TeksKak = { latar: string; tujuan: string; dasar: string; keluaran: string; penutup: string };
export const KAK_KOSONG: TeksKak = { latar: "", tujuan: "", dasar: "", keluaran: "", penutup: "" };
const BELUM = "[Belum diisi]";

/** Menormalkan teks manual KAK (dari simpanan peramban): hanya string, dipotong. */
export function bacaTeksKak(x: unknown): TeksKak {
  const o = typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {};
  const t = (v: unknown): string => (typeof v === "string" ? v.slice(0, 4000) : "");
  return { latar: t(o.latar), tujuan: t(o.tujuan), dasar: t(o.dasar), keluaran: t(o.keluaran), penutup: t(o.penutup) };
}
const paragraf = (s: string): string[] => (s.trim() ? s.split(/\n{1,}/).map((x) => x.trim()).filter(Boolean) : [BELUM]);

export function susunKak(k: KonteksLanjutan, t: TeksKak): Dokumen {
  const awal = k.jendela.length ? urut(k.jendela.map((x) => x.mulai), (x) => x)[0] : "";
  const akhir = k.jendela.length ? urut(k.jendela.map((x) => x.selesai), (x) => x).slice(-1)[0] : "";
  const p = jumlahPetugas(k.isi);
  const blok: Blok[] = [
    { judul: "1. Latar belakang", teks: paragraf(t.latar), manual: !t.latar.trim() },
    { judul: "2. Maksud dan tujuan", teks: paragraf(t.tujuan), manual: !t.tujuan.trim() },
    { judul: "3. Dasar hukum", teks: paragraf(t.dasar), manual: !t.dasar.trim() },
    {
      judul: "4. Ruang lingkup",
      tabel: [{ kolom: ["Hal", "Isi"], baris: [["Kegiatan", k.identitas.nama], ["Rincian Output (RO)", k.identitas.roKode], ["Tahun anggaran", String(k.identitas.tahun)], ["Jenis periode", k.jenisPeriode], ["Jendela pendataan", awal && akhir ? `${tglIndo(awal)} s.d. ${tglIndo(akhir)}` : "belum ditetapkan"], ["Wilayah tugas", kosong(k.isi.wilayah, "belum ditetapkan")]] }],
    },
    { judul: "5. Keluaran", teks: paragraf(t.keluaran), manual: !t.keluaran.trim() },
    { judul: "6. Jadwal", tabel: tabelJadwal(k), teks: tabelJadwal(k).length ? undefined : ["Jadwal belum diisi."] },
    { judul: "7. Organisasi pelaksana", tabel: [tabelPeran(k)], teks: [`Total ${p.total} petugas (${p.organik} organik, ${p.mitra} mitra).`] },
    { judul: "8. Anggaran", tabel: [tabelAkunRab(k)], teks: [`Beban anggaran: RO ${k.identitas.roKode}, tahun ${k.identitas.tahun}. Rincian pada RAB survei.`] },
    { judul: "9. Penutup", teks: paragraf(t.penutup), manual: !t.penutup.trim() },
  ];
  return { kode: "kak", judul: "Kerangka Acuan Kerja", subjudul: `${k.identitas.nama} · RO ${k.identitas.roKode} · Tahun ${k.identitas.tahun}`, blok, tandaTangan: [{ jabatan: "Ketua Tim" }, { jabatan: "Pejabat Pembuat Komitmen" }] };
}

/** Bagian KAK yang masih kosong dan perlu diisi manual (untuk pengingat di layar). */
export function kakBelumDiisi(t: TeksKak): string[] {
  const r: string[] = [];
  if (!t.latar.trim()) r.push("Latar belakang");
  if (!t.tujuan.trim()) r.push("Maksud dan tujuan");
  if (!t.dasar.trim()) r.push("Dasar hukum");
  if (!t.keluaran.trim()) r.push("Keluaran");
  if (!t.penutup.trim()) r.push("Penutup");
  return r;
}
