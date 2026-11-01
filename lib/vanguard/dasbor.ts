// lib/vanguard/dasbor.ts  (murni: tanpa DB/React)
//
// (1 Nov 2026) VANGUARD V3a: olah baris rekaman (sigap_vanguard_percobaan dan sigap_vanguard_kesalahan) menjadi angka dasbor BPS Kabupaten Solok:
// ringkasan, kesalahan tersering dan fatal, peta panas kasus x jenis, per petugas, perkembangan, per hari, serta berkas CSV.
// Satu "pasangan" = satu petugas pada satu kasus. Peserta = akun dengan penugasan aktif di kegiatan itu (sebagai penyebut).

import { cariKasusPublik } from "./kasus/daftar";
import { hasilFinal, PENGATURAN_BAWAAN, type Pengaturan, type StatusFinal } from "./pengaturan";
import { labelSel } from "./sel";
import type { JenisKesalahan, Tingkat } from "./tipe";

export type BarisPercobaanDb = {
  akun_id: number; kasus: string; nomor: number; benar: boolean; bintang: number; jml_salah: number; jml_fatal: number; petunjuk: number;
  lihat_jawaban: boolean; durasi_dtk: number; dibuat_at: string;
  /** "latihan" | "uji"; tanpa nilai = latihan. */
  mode?: string;
};
export type BarisKesalahanDb = { akun_id: number; kasus: string; sel: string | null; jenis: JenisKesalahan; tingkat: Tingkat };
export type Peserta = { akun_id: number; nama: string; peran: string | null };

/** Menu izin yang membuka dasbor: pelatihan = pelatihan.kelola; selain itu (pendataan dan lainnya) = translok.monitoring. Cukup tingkat "lihat". */
export const menuDasbor = (jenis: string | null | undefined): string => (jenis === "pelatihan" ? "pelatihan.kelola" : "translok.monitoring");

export const DAFTAR_JENIS: JenisKesalahan[] = ["konversi_seminggu", "konversi_sebulan", "salah_letak", "harus_kosong", "jebakan", "kontrol_vii", "diskrepansi", "alternatif", "belum_diisi", "angka_meleset"];
export const LABEL_JENIS: Record<JenisKesalahan, string> = {
  konversi_seminggu: "Masih nilai seminggu (belum × 30/7 × 12)",
  konversi_sebulan: "Masih nilai sebulan (belum × 12)",
  salah_letak: "Nilai benar di kotak yang salah",
  harus_kosong: "Kotak yang seharusnya kosong terisi",
  jebakan: "Terjebak kasus khas",
  kontrol_vii: "VII Rincian 1 tidak sesuai tabel kontrol",
  diskrepansi: "Selisih Blok VI ≠ selisih Blok VII",
  alternatif: "Nilai keliru khas (salah konsep)",
  belum_diisi: "Kotak wajib belum diisi",
  angka_meleset: "Angka meleset",
};
export const LABEL_TINGKAT: Record<Tingkat, string> = { fatal: "Fatal", berat: "Berat", ringan: "Ringan" };
const URUT_TINGKAT: Record<Tingkat, number> = { fatal: 0, berat: 1, ringan: 2 };

const bagi = (a: number, b: number): number => (b > 0 ? a / b : 0);
const bulat1 = (x: number): number => Math.round(x * 10) / 10;
const persen = (a: number, b: number): number => Math.round(bagi(a, b) * 1000) / 10;
export const hariWib = (iso: string): string => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + 7 * 3_600_000).toISOString().slice(0, 10) : ""; };
const median = (a: number[]): number => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export type Ringkasan = {
  peserta: number; mencoba: number; persenMencoba: number; percobaan: number; rataPercobaanPerKasus: number;
  persenBenarTanpaPetunjuk: number; rataBintang: number; medianDurasiDtk: number; kasusDikerjakan: number; kesalahanTotal: number; kesalahanFatal: number;
  /** Peserta yang lulus menurut nilai lulus kegiatan; null bila kegiatan tidak memakai nilai lulus. */
  lulus: number | null; persenLulus: number | null;
  /** Hasil final tidak lulus (semua percobaan terpakai, nilai di bawah nilai lulus): tetap mendata dengan pendampingan khusus. Null bila tanpa nilai lulus. */
  tidakLulus: number | null;
  /** Belum final: belum lulus dan masih ada percobaan. Null bila tanpa nilai lulus. */
  belumFinal: number | null;
  kalkulatorPetugas: number; kalkulatorTotal: number;
};
export type BarisTersering = { kunci: string; label: string; jumlah: number; petugas: number; tingkat?: Tingkat };
export type BarisHeat = { kasus: string; judul: string; total: number; per: Partial<Record<JenisKesalahan, number>> };
export type BarisPetugas = {
  akun_id: number; nama: string; peran: string | null; percobaan: number; kasusDikerjakan: number; kasusBenar: number; bintang: number;
  persenBenarPertama: number; kelemahan: { jenis: JenisKesalahan; jumlah: number } | null; fatal: number; terakhir: string | null;
  /** Persen kasus bernilai (pada level yang dibuka) yang pernah benar; lulus = null bila tanpa nilai lulus. */
  persenBenar: number; lulus: boolean | null; kalkulator: number;
  /** Hasil final menurut aturan kegiatan (lihat hasilFinal di pengaturan.ts) dan keterangan remark untuk yang tidak lulus. */
  hasil: StatusFinal; remark: string | null;
};
export type Dasbor = {
  ringkasan: Ringkasan;
  jenis: BarisTersering[];
  jenisFatal: BarisTersering[];
  sel: BarisTersering[];
  kasus: BarisTersering[];
  heat: BarisHeat[];
  petugas: BarisPetugas[];
  perkembangan: { persenBenarPercobaanPertama: number; persenAkhirnyaBenar: number; rataPercobaanSampaiBenar: number; pasangan: number };
  perHari: { tgl: string; percobaan: number; benar: number }[];
};

const TOP = 10;
const urutDesc = (a: { jumlah: number; label: string }, b: { jumlah: number; label: string }) => b.jumlah - a.jumlah || a.label.localeCompare(b.label, "id");

/** `namaLain`: nama akun yang pernah mencoba tetapi bukan peserta aktif lagi (penyebut persen tetap peserta aktif). */
export type OpsiDasbor = { pengaturan?: Pengaturan; kalkulator?: Record<number, number> };
export function susunDasbor(peserta: Peserta[], perc: BarisPercobaanDb[], kes: BarisKesalahanDb[], namaLain: Record<number, string> = {}, opsi: OpsiDasbor = {}): Dasbor {
  const peng = opsi.pengaturan ?? PENGATURAN_BAWAAN;
  const kalk = opsi.kalkulator ?? {};
  const namaAkun = new Map(peserta.map((p) => [p.akun_id, p]));
  // ---- pasangan petugas x kasus ----
  type Pasangan = { akun: number; kasus: string; ada: number; pertamaBenar: boolean; benarNomor: number | null; benarPetunjuk: number; bintangTerbaik: number };
  const pas = new Map<string, Pasangan>();
  const urut = [...perc].sort((a, b) => a.nomor - b.nomor);
  for (const p of urut) {
    const k = `${p.akun_id}|${p.kasus}`;
    const x = pas.get(k) ?? { akun: p.akun_id, kasus: p.kasus, ada: 0, pertamaBenar: false, benarNomor: null, benarPetunjuk: 0, bintangTerbaik: 0 };
    x.ada += 1;
    if (p.nomor === 1 && p.benar) x.pertamaBenar = true;
    if (p.benar && x.benarNomor === null) { x.benarNomor = p.nomor; x.benarPetunjuk = p.petunjuk; }
    if (p.benar) x.bintangTerbaik = Math.max(x.bintangTerbaik, p.bintang);
    pas.set(k, x);
  }
  // Kelulusan: kegiatan bermode uji memakai BUKU UJI (hanya percobaan bermode "uji"); latihan sebelumnya tidak menghitung. Selain itu semua percobaan.
  // Per petugas per kasus: jumlah percobaan di buku itu dan sudah benar atau belum (dasar hasil final).
  const buku = new Map<number, Map<string, { kasus: string; percobaan: number; benar: boolean }>>();
  for (const p of perc) {
    if (peng.mode === "uji" && p.mode !== "uji") continue;
    const m = buku.get(p.akun_id) ?? buku.set(p.akun_id, new Map()).get(p.akun_id)!;
    const r = m.get(p.kasus) ?? { kasus: p.kasus, percobaan: 0, benar: false };
    r.percobaan += 1;
    if (p.benar) r.benar = true;
    m.set(p.kasus, r);
  }
  const semuaPasangan = [...pas.values()];
  const pasBenar = semuaPasangan.filter((x) => x.benarNomor !== null);
  const akunMencoba = new Set(perc.map((p) => p.akun_id));

  // ---- kesalahan ----
  const perJenis = new Map<JenisKesalahan, { n: number; akun: Set<number>; tingkat: Tingkat }>();
  const perJenisFatal = new Map<JenisKesalahan, { n: number; akun: Set<number> }>();
  const perSel = new Map<string, { n: number; akun: Set<number> }>();
  const perKasus = new Map<string, { n: number; akun: Set<number>; jenis: Map<JenisKesalahan, number> }>();
  for (const e of kes) {
    const j = perJenis.get(e.jenis) ?? { n: 0, akun: new Set<number>(), tingkat: e.tingkat };
    j.n += 1; j.akun.add(e.akun_id);
    if (URUT_TINGKAT[e.tingkat] < URUT_TINGKAT[j.tingkat]) j.tingkat = e.tingkat;
    perJenis.set(e.jenis, j);
    if (e.tingkat === "fatal") { const f = perJenisFatal.get(e.jenis) ?? { n: 0, akun: new Set<number>() }; f.n += 1; f.akun.add(e.akun_id); perJenisFatal.set(e.jenis, f); }
    if (e.sel) { const s = perSel.get(e.sel) ?? { n: 0, akun: new Set<number>() }; s.n += 1; s.akun.add(e.akun_id); perSel.set(e.sel, s); }
    const k = perKasus.get(e.kasus) ?? { n: 0, akun: new Set<number>(), jenis: new Map<JenisKesalahan, number>() };
    k.n += 1; k.akun.add(e.akun_id); k.jenis.set(e.jenis, (k.jenis.get(e.jenis) ?? 0) + 1);
    perKasus.set(e.kasus, k);
  }
  const judulKasus = (kode: string): string => cariKasusPublik(kode)?.judul ?? kode;
  const jenis: BarisTersering[] = [...perJenis].map(([j, v]) => ({ kunci: j, label: LABEL_JENIS[j] ?? j, jumlah: v.n, petugas: v.akun.size, tingkat: v.tingkat })).sort(urutDesc);
  const jenisFatal: BarisTersering[] = [...perJenisFatal].map(([j, v]) => ({ kunci: j, label: LABEL_JENIS[j] ?? j, jumlah: v.n, petugas: v.akun.size, tingkat: "fatal" as Tingkat })).sort(urutDesc);
  const sel: BarisTersering[] = [...perSel].map(([s, v]) => ({ kunci: s, label: labelSel(s), jumlah: v.n, petugas: v.akun.size })).sort(urutDesc).slice(0, TOP);
  const percobaanSalahPerKasus = new Map<string, number>();
  for (const p of perc) if (!p.benar) percobaanSalahPerKasus.set(p.kasus, (percobaanSalahPerKasus.get(p.kasus) ?? 0) + 1);
  const kasus: BarisTersering[] = [...percobaanSalahPerKasus].map(([k, n]) => ({ kunci: k, label: `${k} · ${judulKasus(k)}`, jumlah: n, petugas: new Set(perc.filter((p) => p.kasus === k && !p.benar).map((p) => p.akun_id)).size })).sort(urutDesc).slice(0, TOP);
  const heat: BarisHeat[] = [...perKasus].map(([k, v]) => ({ kasus: k, judul: judulKasus(k), total: v.n, per: Object.fromEntries(v.jenis) as Partial<Record<JenisKesalahan, number>> })).sort((a, b) => b.total - a.total || a.kasus.localeCompare(b.kasus)).slice(0, 20);

  // ---- per petugas ----
  const idPetugas = new Set<number>([...peserta.map((p) => p.akun_id), ...akunMencoba]);
  const petugas: BarisPetugas[] = [...idPetugas].map((id) => {
    const p = namaAkun.get(id);
    const miliknya = perc.filter((x) => x.akun_id === id);
    const pasMilik = semuaPasangan.filter((x) => x.akun === id);
    const jmlJenis = new Map<JenisKesalahan, number>();
    let fatal = 0;
    for (const e of kes) if (e.akun_id === id) { jmlJenis.set(e.jenis, (jmlJenis.get(e.jenis) ?? 0) + 1); if (e.tingkat === "fatal") fatal += 1; }
    const lemah = [...jmlJenis].sort((a, b) => b[1] - a[1] || DAFTAR_JENIS.indexOf(a[0]) - DAFTAR_JENIS.indexOf(b[0]))[0];
    const terakhir = miliknya.reduce<string | null>((m, x) => (m === null || x.dibuat_at > m ? x.dibuat_at : m), null);
    return {
      akun_id: id, nama: p?.nama ?? namaLain[id] ?? `Akun ${id}`, peran: p?.peran ?? null, percobaan: miliknya.length, kasusDikerjakan: pasMilik.length,
      kasusBenar: pasMilik.filter((x) => x.benarNomor !== null).length, bintang: pasMilik.reduce((a, x) => a + x.bintangTerbaik, 0),
      persenBenarPertama: persen(pasMilik.filter((x) => x.pertamaBenar).length, pasMilik.length),
      kelemahan: lemah ? { jenis: lemah[0], jumlah: lemah[1] } : null, fatal, terakhir,
      ...(() => { const h = hasilFinal(peng, [...(buku.get(id)?.values() ?? [])]); return { persenBenar: h.nilai, lulus: h.status === "tanpa_batas" ? null : h.status === "lulus", hasil: h.status, remark: h.remark }; })(),
      kalkulator: kalk[id] ?? 0,
    };
  }).sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  // ---- per hari (WIB) ----
  const hari = new Map<string, { percobaan: number; benar: number }>();
  for (const p of perc) { const t = hariWib(p.dibuat_at); if (!t) continue; const h = hari.get(t) ?? { percobaan: 0, benar: 0 }; h.percobaan += 1; if (p.benar) h.benar += 1; hari.set(t, h); }
  const perHari = [...hari].map(([tgl, v]) => ({ tgl, ...v })).sort((a, b) => a.tgl.localeCompare(b.tgl)).slice(-30);

  const ringkasan: Ringkasan = {
    peserta: peserta.length, mencoba: akunMencoba.size, persenMencoba: persen(akunMencoba.size, peserta.length), percobaan: perc.length,
    rataPercobaanPerKasus: bulat1(bagi(perc.length, semuaPasangan.length)),
    persenBenarTanpaPetunjuk: persen(pasBenar.filter((x) => x.benarPetunjuk === 0).length, pasBenar.length),
    rataBintang: bulat1(bagi(pasBenar.reduce((a, x) => a + x.bintangTerbaik, 0), pasBenar.length)),
    medianDurasiDtk: Math.round(median(perc.map((p) => p.durasi_dtk))), kasusDikerjakan: new Set(perc.map((p) => p.kasus)).size,
    kesalahanTotal: kes.length, kesalahanFatal: kes.filter((e) => e.tingkat === "fatal").length,
    lulus: peng.nilai_lulus === null ? null : petugas.filter((p) => p.lulus === true && namaAkun.has(p.akun_id)).length,
    persenLulus: peng.nilai_lulus === null ? null : persen(petugas.filter((p) => p.lulus === true && namaAkun.has(p.akun_id)).length, peserta.length),
    tidakLulus: peng.nilai_lulus === null ? null : petugas.filter((p) => p.hasil === "tidak_lulus" && namaAkun.has(p.akun_id)).length,
    belumFinal: peng.nilai_lulus === null ? null : peserta.length - petugas.filter((p) => (p.hasil === "lulus" || p.hasil === "tidak_lulus") && namaAkun.has(p.akun_id)).length,
    kalkulatorPetugas: petugas.filter((p) => p.kalkulator > 0).length,
    kalkulatorTotal: petugas.reduce((a, p) => a + p.kalkulator, 0),
  };
  return {
    ringkasan, jenis, jenisFatal, sel, kasus, heat, petugas,
    perkembangan: {
      persenBenarPercobaanPertama: persen(semuaPasangan.filter((x) => x.pertamaBenar).length, semuaPasangan.length),
      persenAkhirnyaBenar: persen(pasBenar.length, semuaPasangan.length),
      rataPercobaanSampaiBenar: bulat1(bagi(pasBenar.reduce((a, x) => a + (x.benarNomor ?? 0), 0), pasBenar.length)),
      pasangan: semuaPasangan.length,
    },
    perHari,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// CSV: sel yang diawali = + - @ diberi tanda kutip tunggal agar tidak dibaca sebagai rumus di Excel.
export function selCsv(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const barisCsv = (a: unknown[]): string => a.map(selCsv).join(",");
const csv = (kepala: string[], baris: unknown[][]): string => "﻿" + [barisCsv(kepala), ...baris.map(barisCsv)].join("\r\n") + "\r\n";

const HASIL_TEKS: Record<StatusFinal, string> = { tanpa_batas: "", berjalan: "Belum final", lulus: "Lulus", tidak_lulus: "Tidak lulus" };
export function csvSkor(d: Dasbor): string {
  return csv(
    ["Nama", "Peran", "Percobaan", "Kasus dikerjakan", "Kasus benar", "Bintang", "Benar di percobaan pertama (%)", "Kasus benar dari yang dibuka (%)", "Hasil final", "Remark", "Pemakaian kalkulator", "Kelemahan utama", "Jumlah kelemahan utama", "Kesalahan fatal", "Percobaan terakhir (UTC)"],
    d.petugas.map((p) => [p.nama, p.peran ?? "", p.percobaan, p.kasusDikerjakan, p.kasusBenar, p.bintang, p.persenBenarPertama, p.persenBenar, HASIL_TEKS[p.hasil], p.remark ?? "", p.kalkulator, p.kelemahan ? LABEL_JENIS[p.kelemahan.jenis] : "", p.kelemahan?.jumlah ?? "", p.fatal, p.terakhir ?? ""]),
  );
}
export function csvKesalahan(peserta: Peserta[], kes: BarisKesalahanDb[]): string {
  const nama = new Map(peserta.map((p) => [p.akun_id, p.nama]));
  return csv(
    ["Nama", "Kasus", "Judul kasus", "Kotak", "Jenis kesalahan", "Tingkat"],
    kes.map((e) => [nama.get(e.akun_id) ?? `Akun ${e.akun_id}`, e.kasus, judulKasusCsv(e.kasus), e.sel ? labelSel(e.sel) : "", LABEL_JENIS[e.jenis] ?? e.jenis, LABEL_TINGKAT[e.tingkat] ?? e.tingkat]),
  );
}
const judulKasusCsv = (k: string): string => cariKasusPublik(k)?.judul ?? "";
