// lib/laporanUmum.ts  (logika murni; aman diimpor klien dan server)
//
// (30 Okt 2026) Laporan Sementara untuk kegiatan selain Pascabencana (mis. SPDT NTP): sasaran lembar bantu tanpa status per KK. Angka dari fungsi SQL
// sigap_laporan_umum (migrasi 20261030f), seluruhnya dibatasi satu kegiatan. Struktur, penomoran, centang bab/elemen, cetak, dan Word memakai mesin
// yang sama dengan laporan PSP (lib/laporanSementara.ts: rakitLaporan, htmlLaporan; lib/laporanDocx.ts), jadi pilihan susunan, catatan penyusun, dan
// pemilih foto Lampiran B bekerja sama. Narasi hanya memuat angka yang bisa dihitung; penilaian ditulis penyusun di Word.

import {
  banding, bagianLampiranFoto, but, fmtAngka, fmtDesimal, fmtPersen, judulKecamatan, nilaiTeks, par, rakitLaporan, rataRata, tab, tanggalIndo, tanggalPendek, tanggalWib,
  type BagianLaporan, type Elemen, type Laporan, type OpsiFotoLaporan, type OpsiLaporan, type TabelLaporan,
} from "@/lib/laporanSementara";
import { labelPeran } from "@/lib/laporanFoto";

export type KecUmum = { kecamatan: string; kk: number; dibuka: number; nagari: number; ppl: number; pml: number };
export type NilaiUmum = { akun_id: number; nama: string; peran: string; hari_kerja: number; realisasi: number; foto: number; dibuka: number; qc_rata: number | null; qc_percobaan: number };

export type DataLaporanUmum = {
  dibuat_at: string;
  kegiatan: { id: number; nama: string; tanggal_mulai: string | null; tanggal_selesai: string | null; satuan: string; jenis: string | null } | null;
  petugas: Record<string, number>;
  surat_tugas: { n: number; penugasan_ber_st: number };
  sasaran: { kk: number; kecamatan: number; nagari: number; jorong: number; dibuka: number; pembuka: number; ppl: number; pml: number; per_kecamatan: KecUmum[]; harian: { tgl: string; n: number }[] };
  realisasi: { satuan: string; total: number; baris: number; hari: number; petugas: number; harian: { tgl: string; n: number; petugas: number }[] };
  dokumentasi: { foto: number; petugas: number; per_slot: { slot: number; n: number }[]; per_peran: { peran: string; n: number }[] };
  qc: { percobaan: number; petugas: number; rata_pertama: number | null; harian: { tgl: string; percobaan: number; peserta: number; rata: number | null }[] };
  dokumen_pml: { n: number; pml: number; per_pml: { nama: string; n: number }[] };
  petugas_nilai: NilaiUmum[];
};

// ---------------------------------------------------------------------------------------------------------------------------------
// Pembacaan data mentah (tak pernah melempar galat; nilai rusak -> 0 / null / kosong)
// ---------------------------------------------------------------------------------------------------------------------------------

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const numOrNull = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(rec) : []);
const teks = (v: unknown): string => (typeof v === "string" ? v : "");
const tgl = (v: unknown): string => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "");
const tglAtauNull = (v: unknown): string | null => tgl(v) || null;

export function bacaDataLaporanUmum(mentah: unknown): DataLaporanUmum {
  const r = rec(mentah);
  const k = rec(r.kegiatan);
  const st = rec(r.surat_tugas);
  const sa = rec(r.sasaran);
  const re = rec(r.realisasi);
  const dk = rec(r.dokumentasi);
  const qc = rec(r.qc);
  const dp = rec(r.dokumen_pml);
  const petugas: Record<string, number> = {};
  for (const [peran, n] of Object.entries(rec(r.petugas))) petugas[peran] = num(n);
  const kegiatan = Object.keys(k).length ? { id: num(k.id), nama: teks(k.nama), tanggal_mulai: tglAtauNull(k.tanggal_mulai), tanggal_selesai: tglAtauNull(k.tanggal_selesai), satuan: teks(k.satuan_realisasi) || "keluarga", jenis: teks(k.jenis) || null } : null;
  return {
    dibuat_at: teks(r.dibuat_at),
    kegiatan,
    petugas,
    surat_tugas: { n: num(st.n), penugasan_ber_st: num(st.penugasan_ber_st) },
    sasaran: {
      kk: num(sa.kk), kecamatan: num(sa.kecamatan), nagari: num(sa.nagari), jorong: num(sa.jorong), dibuka: num(sa.dibuka), pembuka: num(sa.pembuka), ppl: num(sa.ppl), pml: num(sa.pml),
      per_kecamatan: arr(sa.per_kecamatan).map((x) => ({ kecamatan: teks(x.kecamatan), kk: num(x.kk), dibuka: num(x.dibuka), nagari: num(x.nagari), ppl: num(x.ppl), pml: num(x.pml) })),
      harian: arr(sa.harian).map((x) => ({ tgl: tgl(x.tgl), n: num(x.n) })).filter((x) => x.tgl),
    },
    realisasi: {
      satuan: teks(re.satuan) || kegiatan?.satuan || "keluarga", total: num(re.total), baris: num(re.baris), hari: num(re.hari), petugas: num(re.petugas),
      harian: arr(re.harian).map((x) => ({ tgl: tgl(x.tgl), n: num(x.n), petugas: num(x.petugas) })).filter((x) => x.tgl),
    },
    dokumentasi: {
      foto: num(dk.foto), petugas: num(dk.petugas),
      per_slot: arr(dk.per_slot).map((x) => ({ slot: num(x.slot), n: num(x.n) })),
      per_peran: arr(dk.per_peran).map((x) => ({ peran: teks(x.peran), n: num(x.n) })),
    },
    qc: {
      percobaan: num(qc.percobaan), petugas: num(qc.petugas), rata_pertama: numOrNull(qc.rata_pertama),
      harian: arr(qc.harian).map((x) => ({ tgl: tgl(x.tgl), percobaan: num(x.percobaan), peserta: num(x.peserta), rata: numOrNull(x.rata) })).filter((x) => x.tgl),
    },
    dokumen_pml: { n: num(dp.n), pml: num(dp.pml), per_pml: arr(dp.per_pml).map((x) => ({ nama: teks(x.nama), n: num(x.n) })) },
    petugas_nilai: arr(r.petugas_nilai).map((x) => ({
      akun_id: num(x.akun_id), nama: teks(x.nama), peran: teks(x.peran), hari_kerja: num(x.hari_kerja), realisasi: num(x.realisasi), foto: num(x.foto), dibuka: num(x.dibuka),
      qc_rata: numOrNull(x.qc_rata), qc_percobaan: num(x.qc_percobaan),
    })),
  };
}

/** Jawaban API: laporan umum ditandai `ragam: "umum"`; selain itu laporan PSP. */
export const adalahLaporanUmum = (mentah: unknown): boolean => rec(mentah).ragam === "umum";

// ---------------------------------------------------------------------------------------------------------------------------------
// Temuan otomatis
// ---------------------------------------------------------------------------------------------------------------------------------

const lapangan = (d: DataLaporanUmum): NilaiUmum[] => d.petugas_nilai.filter((p) => p.peran === "pml" || p.peran === "ppl");

export function temuanUmum(d: DataLaporanUmum): string[] {
  const out: string[] = [];
  const ptg = lapangan(d);
  const ppl = ptg.filter((p) => p.peran === "ppl");
  if (d.realisasi.total > 0 && ppl.length > 0) {
    const nol = ppl.filter((p) => p.realisasi === 0).length;
    if (nol > 0) out.push(`${fmtAngka(nol)} dari ${fmtAngka(ppl.length)} PPL belum mencatat realisasi sama sekali.`);
  }
  const sa = d.sasaran;
  if (sa.kk > 0) {
    const belum = sa.kk - sa.dibuka;
    if (belum > 0) out.push(`${fmtAngka(belum)} dari ${fmtAngka(sa.kk)} keluarga sasaran (${fmtPersen(belum, sa.kk)} persen) belum dibuka koordinatnya oleh petugas.`);
    const kosong = sa.per_kecamatan.filter((k) => k.kk > 0 && k.dibuka === 0);
    if (kosong.length > 0) out.push(`Belum ada keluarga yang dibuka di ${kosong.map((k) => judulKecamatan(k.kecamatan)).join(", ")} (sasaran ${fmtAngka(kosong.reduce((s, k) => s + k.kk, 0))} keluarga).`);
  }
  if (ptg.length > 0 && d.qc.percobaan > 0) {
    const belumQc = ptg.filter((p) => p.qc_percobaan === 0).length;
    if (belumQc > 0) out.push(`${fmtAngka(belumQc)} dari ${fmtAngka(ptg.length)} petugas lapangan belum pernah mengerjakan QC Pemahaman.`);
  }
  const tanpaFoto = ptg.filter((p) => p.hari_kerja > 0 && p.foto === 0).length;
  if (tanpaFoto > 0) out.push(`${fmtAngka(tanpaFoto)} petugas sudah memilih hari kerja tetapi belum mengunggah foto dokumentasi.`);
  const akhir = d.kegiatan?.tanggal_selesai ?? null;
  const hariIni = tanggalWib(d.dibuat_at);
  if (akhir && hariIni && hariIni > akhir) out.push(`Periode kegiatan (sampai ${tanggalIndo(akhir)}) sudah lewat; data masih diperbarui.`);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Tabel
// ---------------------------------------------------------------------------------------------------------------------------------

const URUT_PERAN = ["pml", "ppl", "korwil", "supervisor"];
const urutPeran = (p: string): number => {
  const i = URUT_PERAN.indexOf(p);
  return i < 0 ? URUT_PERAN.length : i;
};

/** Tabel capaian per petugas (PML/PPL); null bila tidak ada petugas. `peran` menyaring: "semua" | "pml" | "ppl". */
export function tabelCapaianPetugas(d: DataLaporanUmum, peran: "semua" | "pml" | "ppl" = "semua"): TabelLaporan | null {
  const daftar = lapangan(d)
    .filter((p) => peran === "semua" || p.peran === peran)
    .sort((a, b) => urutPeran(a.peran) - urutPeran(b.peran) || banding(a.nama, b.nama));
  if (daftar.length === 0) return null;
  const adaSasaran = d.sasaran.kk > 0;
  const satuan = d.realisasi.satuan;
  const jumlah = (f: (p: NilaiUmum) => number) => daftar.reduce((s, p) => s + f(p), 0);
  const kepala = ["No", "Nama", "Peran", "Hari kerja", `Realisasi (${satuan})`, ...(adaSasaran ? ["KK dibuka"] : []), "Foto", "QC (percobaan pertama)", "Percobaan QC"];
  const baris = daftar.map((p, i) => [
    String(i + 1), p.nama, p.peran.toUpperCase(), fmtAngka(p.hari_kerja), fmtAngka(p.realisasi), ...(adaSasaran ? [fmtAngka(p.dibuka)] : []), fmtAngka(p.foto), nilaiTeks(p.qc_rata), fmtAngka(p.qc_percobaan),
  ]);
  const rata: ("k" | "n")[] = ["n", "k", "k", "n", "n", ...(adaSasaran ? (["n"] as const) : []), "n", "n", "n"];
  return {
    judul: "Capaian per petugas",
    kepala,
    baris,
    jumlah: ["", `Jumlah (${fmtAngka(daftar.length)} petugas)`, "", fmtAngka(jumlah((p) => p.hari_kerja)), fmtAngka(jumlah((p) => p.realisasi)), ...(adaSasaran ? [peran === "semua" ? fmtAngka(d.sasaran.dibuka) : "-"] : []), fmtAngka(jumlah((p) => p.foto)), nilaiTeks(rataRata(daftar.map((p) => p.qc_rata))), fmtAngka(jumlah((p) => p.qc_percobaan))],
    rata,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Penyusunan
// ---------------------------------------------------------------------------------------------------------------------------------

export function bangunBagianUmum(d: DataLaporanUmum, o: { peranNilai?: "semua" | "pml" | "ppl" } = {}, foto?: OpsiFotoLaporan): BagianLaporan[] {
  const tanggal = tanggalIndo(tanggalWib(d.dibuat_at));
  const nama = d.kegiatan?.nama ?? "kegiatan";
  const satuan = d.realisasi.satuan;
  const sa = d.sasaran;
  const re = d.realisasi;
  const pml = d.petugas.pml ?? 0;
  const ppl = d.petugas.ppl ?? 0;
  const adaSasaran = sa.kk > 0;
  const adaDokPml = d.dokumen_pml.n > 0;
  const temuan = temuanUmum(d);
  const mulai = d.kegiatan?.tanggal_mulai;
  const akhir = d.kegiatan?.tanggal_selesai;
  const periode = mulai && akhir ? ` Periode kegiatan ${tanggalIndo(mulai)} sampai ${tanggalIndo(akhir)}.` : "";
  const lainnya = Object.entries(d.petugas).filter(([p, n]) => p !== "pml" && p !== "ppl" && n > 0).map(([p, n]) => `${fmtAngka(n)} ${labelPeran(p)}`);

  const out: BagianLaporan[] = [];

  // ---- Ringkasan eksekutif
  const rg: Elemen[] = [par("ringkasan.pengantar", "Kalimat pembuka", `Laporan ini memotret pelaksanaan ${nama} di Kabupaten Solok sampai ${tanggal}.${periode} Seluruh angka diambil dari database SIGAP pada tanggal tersebut.`)];
  rg.push(but("ringkasan.penugasan", "Butir penugasan", [`Penugasan. ${fmtAngka(pml)} PML dan ${fmtAngka(ppl)} PPL bertugas${lainnya.length ? ` (serta ${lainnya.join(", ")})` : ""}; ${fmtAngka(d.surat_tugas.n)} surat tugas diterbitkan.`], "penugasan"));
  if (adaSasaran) rg.push(but("ringkasan.sasaran", "Butir sasaran", [`Sasaran. ${fmtAngka(sa.kk)} keluarga di ${fmtAngka(sa.kecamatan)} kecamatan dan ${fmtAngka(sa.nagari)} nagari; ${fmtAngka(sa.dibuka)} keluarga (${fmtPersen(sa.dibuka, sa.kk)} persen) sudah dibuka koordinatnya oleh petugas.`], "sasaran"));
  rg.push(
    but("ringkasan.pelaksanaan", "Butir pelaksanaan", [
      re.baris > 0
        ? `Pelaksanaan. ${fmtAngka(re.total)} ${satuan} terealisasi dalam ${fmtAngka(re.hari)} hari kerja oleh ${fmtAngka(re.petugas)} petugas.`
        : "Pelaksanaan. Belum ada realisasi yang tercatat.",
    ], "pelaksanaan"),
  );
  rg.push(but("ringkasan.dokumentasi", "Butir dokumentasi", [`Dokumentasi. ${fmtAngka(d.dokumentasi.foto)} foto dokumentasi dari ${fmtAngka(d.dokumentasi.petugas)} petugas.`], "dokumentasi"));
  if (d.qc.percobaan > 0) {
    rg.push(but("ringkasan.qc", "Butir QC Pemahaman", [`QC Pemahaman. ${fmtAngka(d.qc.percobaan)} percobaan oleh ${fmtAngka(d.qc.petugas)} petugas${d.qc.rata_pertama != null ? `; rata-rata nilai percobaan pertama ${fmtDesimal(d.qc.rata_pertama)}` : ""}.`], "dokumentasi"));
  }
  if (adaDokPml) rg.push(but("ringkasan.dokumenPml", "Butir dokumen pemeriksaan PML", [`Pemeriksaan. ${fmtAngka(d.dokumen_pml.n)} dokumen pemeriksaan diunggah oleh ${fmtAngka(d.dokumen_pml.pml)} PML.`], "dokumenPml"));
  rg.push(but("ringkasan.perhatian", "Butir hal yang perlu perhatian", [temuan.length > 0 ? `Yang perlu perhatian. ${temuan[0]}${temuan.length > 1 ? " Temuan lain ada pada bagian {{ref:perhatian|#}}." : ""}` : "Yang perlu perhatian. Tidak ada temuan otomatis."], "perhatian"));
  out.push({ kode: "ringkasan", judul: "Ringkasan eksekutif", jenis: "ringkasan", elemen: rg });

  // ---- 1. Penugasan petugas
  const peranRows = Object.entries(d.petugas).filter(([, n]) => n > 0).sort((a, b) => urutPeran(a[0]) - urutPeran(b[0]));
  const totalPetugas = peranRows.reduce((s, [, n]) => s + n, 0);
  out.push({
    kode: "penugasan",
    judul: "Penugasan petugas",
    jenis: "bab",
    elemen: [
      par("penugasan.uraian", "Uraian penugasan", `Kegiatan ini melibatkan ${fmtAngka(totalPetugas)} penugasan petugas. ${fmtAngka(d.surat_tugas.penugasan_ber_st)} di antaranya sudah memiliki surat tugas.`),
      tab("penugasan.tabel", "Tabel petugas per peran", {
        judul: "Jumlah petugas per peran",
        kepala: ["Peran", "Jumlah petugas"],
        baris: peranRows.map(([p, n]) => [labelPeran(p), fmtAngka(n)]),
        jumlah: ["Jumlah", fmtAngka(totalPetugas)],
        rata: ["k", "n"],
      }),
    ],
    sumber: "Penugasan dan surat tugas pada database SIGAP.",
  });

  // ---- 2. Wilayah dan sasaran (hanya bila kegiatan memuat daftar sasaran)
  if (adaSasaran) {
    const kec = sa.per_kecamatan;
    const el: Elemen[] = [
      par("sasaran.uraian", "Uraian sasaran", `Daftar sasaran memuat ${fmtAngka(sa.kk)} keluarga di ${fmtAngka(sa.jorong)} jorong, ${fmtAngka(sa.nagari)} nagari, dan ${fmtAngka(sa.kecamatan)} kecamatan. Petugas lapangan menandai keluarga yang sudah dikunjungi dengan membuka koordinatnya; hasil pencacahan per keluarga tidak dicatat di SIGAP, sehingga capaian dibaca dari keluarga yang dibuka. Sampai ${tanggal}, ${fmtAngka(sa.dibuka)} keluarga (${fmtPersen(sa.dibuka, sa.kk)} persen) sudah dibuka oleh ${fmtAngka(sa.pembuka)} petugas.`),
      tab("sasaran.tabel", "Tabel sasaran per kecamatan", {
        judul: "Sasaran dan keluarga yang dibuka per kecamatan",
        kepala: ["Kecamatan", "Nagari", "Keluarga sasaran", "Dibuka", "Persen dibuka", "PPL", "PML"],
        baris: kec.map((k) => [judulKecamatan(k.kecamatan), fmtAngka(k.nagari), fmtAngka(k.kk), fmtAngka(k.dibuka), fmtPersen(k.dibuka, k.kk), fmtAngka(k.ppl), fmtAngka(k.pml)]),
        jumlah: ["Jumlah", fmtAngka(sa.nagari), fmtAngka(sa.kk), fmtAngka(sa.dibuka), fmtPersen(sa.dibuka, sa.kk), fmtAngka(sa.ppl), fmtAngka(sa.pml)],
        rata: ["k", "n", "n", "n", "n", "n", "n"],
      }),
    ];
    const h14 = sa.harian.slice(-14);
    if (h14.length > 0) {
      el.push({ id: "sasaran.grafik", label: "Grafik keluarga dibuka per hari", jenis: "batang", batang: { judul: `Keluarga yang dibuka per hari (${fmtAngka(h14.length)} hari terakhir)`, satuan: "keluarga", data: h14.map((h) => ({ label: tanggalPendek(h.tgl), nilai: h.n })) } });
    }
    out.push({ kode: "sasaran", judul: "Wilayah dan sasaran", jenis: "bab", elemen: el, sumber: "Daftar sasaran lembar bantu dan catatan pembukaan koordinat pada database SIGAP; tanggal menurut WIB. Angka hari berjalan belum lengkap." });
  }

  // ---- 3. Pelaksanaan di lapangan
  const hari = re.harian;
  const pk: Elemen[] = [
    par(
      "pelaksanaan.uraian",
      "Uraian pelaksanaan",
      re.baris > 0
        ? `Petugas mencatat realisasi harian lewat SIGAP. Sampai ${tanggal} tercatat ${fmtAngka(re.total)} ${satuan} dalam ${fmtAngka(re.hari)} hari kerja oleh ${fmtAngka(re.petugas)} petugas, rata-rata ${fmtDesimal(re.hari > 0 ? re.total / re.hari : 0)} ${satuan} per hari.`
        : "Belum ada realisasi harian yang tercatat.",
    ),
  ];
  if (hari.length > 0) {
    pk.push(
      tab("pelaksanaan.tabel", "Tabel realisasi per hari", {
        judul: `Realisasi per hari (${satuan})`,
        kepala: ["Tanggal", `Realisasi (${satuan})`, "Petugas mencatat"],
        baris: hari.map((h) => [tanggalIndo(h.tgl), fmtAngka(h.n), fmtAngka(h.petugas)]),
        jumlah: ["Jumlah", fmtAngka(re.total), ""],
        rata: ["k", "n", "n"],
      }),
    );
    const h14 = hari.slice(-14);
    pk.push({ id: "pelaksanaan.grafik", label: "Grafik realisasi per hari", jenis: "batang", batang: { judul: `Realisasi per hari (${fmtAngka(h14.length)} hari terakhir)`, satuan, data: h14.map((h) => ({ label: tanggalPendek(h.tgl), nilai: h.n })) } });
  }
  out.push({ kode: "pelaksanaan", judul: "Pelaksanaan di lapangan", jenis: "bab", elemen: pk, sumber: "Realisasi harian petugas pada database SIGAP; tanggal menurut WIB. Angka hari berjalan belum lengkap." });

  // ---- 4. Dokumentasi dan QC
  const dk: Elemen[] = [
    par("dokumentasi.foto", "Uraian foto dokumentasi", `Setiap petugas mengunggah foto dokumentasi nomor 1 sampai 5 pada hari kerjanya. Tercatat ${fmtAngka(d.dokumentasi.foto)} foto dari ${fmtAngka(d.dokumentasi.petugas)} petugas${d.dokumentasi.per_peran.length ? ` (${d.dokumentasi.per_peran.map((x) => `${labelPeran(x.peran)} ${fmtAngka(x.n)}`).join(", ")})` : ""}.`),
  ];
  if (d.dokumentasi.per_slot.length > 0) {
    dk.push(tab("dokumentasi.tabel", "Tabel foto per nomor", { judul: "Jumlah foto per nomor foto", kepala: ["Nomor foto", "Jumlah foto"], baris: d.dokumentasi.per_slot.map((x) => [`Foto ${x.slot}`, fmtAngka(x.n)]), jumlah: ["Jumlah", fmtAngka(d.dokumentasi.per_slot.reduce((s, x) => s + x.n, 0))], rata: ["k", "n"] }));
  }
  dk.push(
    par(
      "dokumentasi.qc",
      "Uraian QC Pemahaman",
      d.qc.percobaan > 0
        ? `QC Pemahaman harian mencatat ${fmtAngka(d.qc.percobaan)} percobaan oleh ${fmtAngka(d.qc.petugas)} petugas${d.qc.rata_pertama != null ? `; rata-rata nilai percobaan pertama ${fmtDesimal(d.qc.rata_pertama)}` : ""}.`
        : "QC Pemahaman belum memiliki percobaan yang tercatat.",
    ),
  );
  if (d.qc.harian.length > 0) {
    dk.push(tab("dokumentasi.qcTabel", "Tabel QC per hari", { judul: "QC Pemahaman per hari", kepala: ["Tanggal", "Percobaan", "Peserta", "Rata-rata percobaan pertama"], baris: d.qc.harian.map((h) => [tanggalIndo(h.tgl), fmtAngka(h.percobaan), fmtAngka(h.peserta), nilaiTeks(h.rata)]), rata: ["k", "n", "n", "n"] }));
  }
  out.push({ kode: "dokumentasi", judul: "Dokumentasi dan QC Pemahaman", jenis: "bab", elemen: dk, sumber: "Foto dokumentasi nomor 1-5 dan percobaan QC Pemahaman pada database SIGAP." });

  // ---- 5. Dokumen pemeriksaan PML (hanya bila ada)
  if (adaDokPml) {
    out.push({
      kode: "dokumenPml",
      judul: "Dokumen pemeriksaan PML",
      jenis: "bab",
      elemen: [
        par("dokumenPml.uraian", "Uraian dokumen pemeriksaan", `PML mengunggah dokumen hasil pemeriksaan (PDF) ke SIGAP. Tercatat ${fmtAngka(d.dokumen_pml.n)} dokumen dari ${fmtAngka(d.dokumen_pml.pml)} PML.`),
        tab("dokumenPml.tabel", "Tabel dokumen per PML", { judul: "Dokumen pemeriksaan per PML", kepala: ["PML", "Dokumen"], baris: d.dokumen_pml.per_pml.map((x) => [x.nama, fmtAngka(x.n)]), jumlah: ["Jumlah", fmtAngka(d.dokumen_pml.n)], rata: ["k", "n"] }),
      ],
      sumber: "Dokumen pemeriksaan PML pada database SIGAP.",
    });
  }

  // ---- 6. Hal yang perlu perhatian
  out.push({
    kode: "perhatian",
    judul: "Hal yang perlu perhatian",
    jenis: "bab",
    elemen: temuan.length > 0 ? [but("perhatian.temuan", "Temuan otomatis", temuan)] : [par("perhatian.kosong", "Keterangan tanpa temuan", "Tidak ada temuan otomatis. Uraian penilaian dan tindak lanjut ditambahkan penyusun.")],
    sumber: "Dihitung dari angka pada bagian sebelumnya.",
  });

  // ---- Lampiran A: capaian per petugas
  const tabelPetugas = tabelCapaianPetugas(d, o.peranNilai ?? "semua");
  out.push({
    kode: "lampiranPetugas",
    judul: "Capaian per petugas",
    jenis: "lampiran",
    elemen: [
      par("lampiranPetugas.pengantar", "Keterangan capaian", `Hari kerja adalah hari yang dipilih petugas di SIGAP; realisasi dalam ${satuan}${adaSasaran ? "; KK dibuka adalah keluarga sasaran yang koordinatnya dibuka petugas; baris jumlah memakai keluarga unik, sehingga bisa lebih kecil dari jumlah kolom bila satu keluarga dibuka lebih dari satu petugas" : ""}. QC adalah rata-rata nilai percobaan pertama tiap hari QC Pemahaman. Tanda minus berarti belum ada nilai.`),
      ...(tabelPetugas ? [tab("lampiranPetugas.tabel", "Tabel capaian per petugas", tabelPetugas)] : [par("lampiranPetugas.kosong", "Keterangan data kosong", "Belum ada data petugas.")]),
    ],
    sumber: "Penugasan, hari kerja, realisasi, foto dokumentasi, pembukaan koordinat, dan percobaan QC Pemahaman pada database SIGAP.",
  });

  // ---- Lampiran B: foto dokumentasi (bawaan mati)
  out.push(bagianLampiranFoto(foto));
  return out;
}

/** Laporan umum lengkap sesuai opsi (centang bab/elemen, catatan, judul, penomoran) — mesin sama dengan laporan PSP. */
export function susunLaporanUmum(d: DataLaporanUmum, o: OpsiLaporan, foto?: OpsiFotoLaporan): Laporan {
  return rakitLaporan(bangunBagianUmum(d, { peranNilai: o.peranNilai }, foto), o, d.dibuat_at, d.kegiatan?.nama ?? "Kegiatan");
}

