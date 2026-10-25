// lib/keu/pelaksanaan.ts
//
// (25 Okt 2026, tahap 31) Jembatan identifikasi lanjutan -> pelaksanaan: usulan penugasan (acuan Delego), keselarasan jadwal dengan kegiatan, ringkasan laporan
// harian, agenda evaluasi, dan kesiapan Bendahara (biaya dibanding pagu, daftar syarat pencairan). Berkas ini MURNI (tanpa basis data): bahan dibaca lewat
// fungsi keu_pelaksanaan_bahan dan keu_usulan_penugasan (berkas 20261025zj), lalu diolah di sini. Semua hasil berupa PERINGATAN, tidak ada yang memblokir.

import { NAMA_AKUN, selisihHari, tglIndo, type Form } from "./identifikasi";
import { evaluasiDari, type Nada } from "./identifikasiHilir";
import type { BarisRincian, IsiLanjutan, StatusLanjutan } from "./lanjutan";

export type FungsiKegiatan = "pendataan" | "pelatihan" | "lain";
export const FUNGSI_KEGIATAN: readonly FungsiKegiatan[] = ["pendataan", "pelatihan", "lain"];
export const NAMA_FUNGSI: Record<FungsiKegiatan, string> = { pendataan: "Pendataan lapangan", pelatihan: "Pelatihan", lain: "Lainnya" };

const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const angka = (x: unknown, awal = 0): number => { const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN; return Number.isFinite(n) ? n : awal; };
const angkaAtauNull = (x: unknown): number | null => { const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN; return Number.isFinite(n) ? n : null; };
const teks = (x: unknown): string => (typeof x === "string" ? x : "");
const teksAtauNull = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);
const rp = (n: number): string => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

// ---------------------------------------------------------------------------------------------------------------------
// Tautan kegiatan
// ---------------------------------------------------------------------------------------------------------------------
/** Baris tampilan keu_v_ident_kegiatan. */
export type KegiatanTertaut = {
  id: number; ident_id: number; kegiatan_id: number; fungsi: FungsiKegiatan; disarankan: boolean; catatan: string; ditautkan_at: string; ditautkan_oleh_nama: string | null;
  kode: string; nama: string; kode_anggaran: string | null; jenis: string | null; aktif: boolean; mulai: string | null; selesai: string | null; n_penugasan: number;
};
/** Baris tampilan keu_v_kegiatan_calon. */
export type CalonKegiatan = {
  ident_id: number; kegiatan_id: number; kode: string; nama: string; kode_anggaran: string | null; jenis: string | null; aktif: boolean;
  mulai: string | null; selesai: string | null; disarankan: boolean; tertaut: boolean;
};

/** Calon yang belum ditautkan: yang disarankan (kode RO sama) di atas, lalu menurut nama. */
export function calonBelumTertaut(calon: CalonKegiatan[]): CalonKegiatan[] {
  return calon.filter((c) => !c.tertaut).sort((a, b) => Number(b.disarankan) - Number(a.disarankan) || Number(b.aktif) - Number(a.aktif) || a.nama.localeCompare(b.nama, "id"));
}

/** Fungsi tautan yang wajar untuk kegiatan itu, dari jenisnya (hanya usulan awal pada pilihan). */
export function fungsiBawaan(jenis: string | null | undefined): FungsiKegiatan {
  const j = (jenis ?? "").toLowerCase();
  return j === "pelatihan" ? "pelatihan" : j === "pendataan" ? "pendataan" : "lain";
}

// ---------------------------------------------------------------------------------------------------------------------
// Usulan penugasan
// ---------------------------------------------------------------------------------------------------------------------
export type StatusUsulan = "siap" | "sudah_ada" | "tarif_belum" | "ambigu" | "tidak_ada" | "peran_kosong" | "menyusul";
export const LABEL_USULAN: Record<StatusUsulan, { teks: string; nada: Nada; urut: number }> = {
  siap: { teks: "Siap diterapkan", nada: "hijau", urut: 1 },
  sudah_ada: { teks: "Sudah ditugaskan", nada: "biru", urut: 2 },
  tarif_belum: { teks: "Tarif peran belum ada", nada: "kuning", urut: 3 },
  ambigu: { teks: "Nama kembar", nada: "kuning", urut: 4 },
  tidak_ada: { teks: "Akun tidak ditemukan", nada: "merah", urut: 5 },
  peran_kosong: { teks: "Peran kosong", nada: "kuning", urut: 6 },
  menyusul: { teks: "Nama menyusul", nada: "abu", urut: 7 },
};
export type ButirUsulan = {
  urut: number; kode: string; nama: string; peran_lanjutan: string | null; peran_sigap: string | null; calon: number; akun_id: number | null; akun_nama: string | null;
  status: StatusUsulan; catatan: string;
};

export function normalisasiUsulan(x: unknown): ButirUsulan[] {
  if (!Array.isArray(x)) return [];
  const out: ButirUsulan[] = [];
  for (const e of x) {
    if (!adalahObjek(e)) continue;
    const status = teks(e.status) as StatusUsulan;
    if (!(status in LABEL_USULAN)) continue;
    out.push({
      urut: angka(e.urut), kode: teks(e.kode), nama: teks(e.nama), peran_lanjutan: teksAtauNull(e.peran_lanjutan), peran_sigap: teksAtauNull(e.peran_sigap),
      calon: angka(e.calon), akun_id: angkaAtauNull(e.akun_id), akun_nama: teksAtauNull(e.akun_nama), status, catatan: teks(e.catatan),
    });
  }
  return out;
}

/** Yang siap di atas, lalu yang perlu tindakan; di dalam status menurut urutan pada lanjutan. */
export const urutkanUsulan = (d: ButirUsulan[]): ButirUsulan[] => [...d].sort((a, b) => LABEL_USULAN[a.status].urut - LABEL_USULAN[b.status].urut || a.urut - b.urut);
export const kodeSiap = (d: ButirUsulan[]): string[] => d.filter((b) => b.status === "siap").map((b) => b.kode);

export function ringkasUsulan(d: ButirUsulan[]): { total: number; siap: number; sudahAda: number; perluTindakan: number; menyusul: number } {
  let siap = 0; let sudahAda = 0; let perlu = 0; let menyusul = 0;
  for (const b of d) {
    if (b.status === "siap") siap += 1;
    else if (b.status === "sudah_ada") sudahAda += 1;
    else if (b.status === "menyusul") menyusul += 1;
    else perlu += 1;
  }
  return { total: d.length, siap, sudahAda, perluTindakan: perlu, menyusul };
}

/** Hasil keu_usulan_terapkan. */
export type HasilTerap = { ditambah: number; dilewati: { kode: string; status: string; jumlah?: number }[]; lanjutan_ver: number };
export function normalisasiHasilTerap(x: unknown): HasilTerap | null {
  if (!adalahObjek(x)) return null;
  const dilewati = Array.isArray(x.dilewati) ? x.dilewati.filter(adalahObjek).map((e) => ({ kode: teks(e.kode), status: teks(e.status), ...(e.jumlah !== undefined ? { jumlah: angka(e.jumlah) } : {}) })) : [];
  return { ditambah: angka(x.ditambah), dilewati, lanjutan_ver: angka(x.lanjutan_ver) };
}
export function kalimatHasilTerap(h: HasilTerap): string {
  const lewat = h.dilewati.filter((d) => d.kode !== "*").length;
  const asing = h.dilewati.find((d) => d.kode === "*");
  return [`${h.ditambah} penugasan ditambahkan dari lanjutan versi ${h.lanjutan_ver}.`, lewat > 0 ? `${lewat} petugas dilewati (sudah ditugaskan atau perlu tindakan).` : "", asing ? `${asing.jumlah ?? 1} kode petugas tidak dikenal.` : ""].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------------------------------------------------
// Bahan pelaksanaan
// ---------------------------------------------------------------------------------------------------------------------
export type PetugasBahan = {
  akun_id: number; nama: string; peran: string | null; aktif: boolean; maks_hari: number | null; kelas: number | null;
  hari_kerja: number; laporan: number; lapor_pertama: string | null; lapor_terakhir: string | null;
};
export type KegiatanBahan = {
  id: number; kode: string; nama: string; kode_anggaran: string | null; jenis: string | null; aktif: boolean; mulai: string | null; selesai: string | null; fungsi: FungsiKegiatan;
  tarif: { peran: string; tarif: number; maks_hari: number | null }[]; rapat_evaluasi: number; presensi: number; petugas: PetugasBahan[];
};
export type RealisasiAkun = { akun: string; pagu: number; real_sd: number; sisa: number };
export type BahanPelaksanaan = {
  ident_id: number; ro_kode: string; tahun: number; dibuat_at: string; kegiatan: KegiatanBahan[]; realisasi: RealisasiAkun[]; realisasi_sampai: string | null;
};

export function normalisasiBahan(x: unknown): BahanPelaksanaan | null {
  if (!adalahObjek(x)) return null;
  const kegiatan: KegiatanBahan[] = [];
  for (const k of Array.isArray(x.kegiatan) ? x.kegiatan : []) {
    if (!adalahObjek(k)) continue;
    const fungsi = (FUNGSI_KEGIATAN as readonly string[]).includes(teks(k.fungsi)) ? (teks(k.fungsi) as FungsiKegiatan) : "lain";
    const petugas: PetugasBahan[] = [];
    for (const p of Array.isArray(k.petugas) ? k.petugas : []) {
      if (!adalahObjek(p)) continue;
      petugas.push({
        akun_id: angka(p.akun_id), nama: teks(p.nama), peran: teksAtauNull(p.peran), aktif: p.aktif !== false, maks_hari: angkaAtauNull(p.maks_hari), kelas: angkaAtauNull(p.kelas),
        hari_kerja: angka(p.hari_kerja), laporan: angka(p.laporan), lapor_pertama: teksAtauNull(p.lapor_pertama), lapor_terakhir: teksAtauNull(p.lapor_terakhir),
      });
    }
    kegiatan.push({
      id: angka(k.id), kode: teks(k.kode), nama: teks(k.nama), kode_anggaran: teksAtauNull(k.kode_anggaran), jenis: teksAtauNull(k.jenis), aktif: k.aktif !== false,
      mulai: teksAtauNull(k.mulai), selesai: teksAtauNull(k.selesai), fungsi,
      tarif: (Array.isArray(k.tarif) ? k.tarif : []).filter(adalahObjek).map((t) => ({ peran: teks(t.peran), tarif: angka(t.tarif), maks_hari: angkaAtauNull(t.maks_hari) })),
      rapat_evaluasi: angka(k.rapat_evaluasi), presensi: angka(k.presensi), petugas,
    });
  }
  const realisasi = (Array.isArray(x.realisasi) ? x.realisasi : []).filter(adalahObjek).map((r) => ({ akun: teks(r.akun), pagu: angka(r.pagu), real_sd: angka(r.real_sd), sisa: angka(r.sisa) }));
  return { ident_id: angka(x.ident_id), ro_kode: teks(x.ro_kode), tahun: angka(x.tahun), dibuat_at: teks(x.dibuat_at), kegiatan, realisasi, realisasi_sampai: teksAtauNull(x.realisasi_sampai) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Keselarasan jadwal kegiatan dengan jendela pendataan pada identifikasi
// ---------------------------------------------------------------------------------------------------------------------
export type Selaras = { nada: Nada; pesan: string };
type Jendela = { periode: string; mulai: string; selesai: string };

export function selarasJadwal(keg: Pick<KegiatanBahan, "mulai" | "selesai">, jadwal: Jendela[]): Selaras[] {
  if (!keg.mulai || !keg.selesai) return [{ nada: "kuning", pesan: "Periode kegiatan belum diatur di Kelola translok, jadi keselarasan dengan jadwal identifikasi belum dapat diperiksa." }];
  const lengkap = jadwal.filter((j) => j.mulai && j.selesai);
  if (lengkap.length === 0) return [{ nada: "abu", pesan: "Jadwal pendataan pada identifikasi belum lengkap." }];
  const irisan = lengkap
    .map((j) => ({ j, hari: Math.min(selisihHari(keg.selesai as string, j.mulai), selisihHari(j.selesai, keg.mulai as string), selisihHari(j.selesai, j.mulai), selisihHari(keg.selesai as string, keg.mulai as string)) + 1 }))
    .filter((x) => x.hari > 0)
    .sort((a, b) => b.hari - a.hari || a.j.mulai.localeCompare(b.j.mulai));
  if (irisan.length === 0) {
    return [{ nada: "kuning", pesan: `Periode kegiatan (${tglIndo(keg.mulai)} s.d. ${tglIndo(keg.selesai)}) tidak beririsan dengan jendela pendataan manapun pada identifikasi (${lengkap.map((j) => `${j.periode}: ${tglIndo(j.mulai)} s.d. ${tglIndo(j.selesai)}`).join("; ")}).` }];
  }
  const w = irisan[0].j;
  const dm = selisihHari(keg.mulai, w.mulai);
  const ds = selisihHari(keg.selesai, w.selesai);
  if (dm === 0 && ds === 0) return [{ nada: "hijau", pesan: `Periode kegiatan sama dengan jendela pendataan ${w.periode} (${tglIndo(w.mulai)} s.d. ${tglIndo(w.selesai)}).` }];
  const out: Selaras[] = [];
  if (dm < 0) out.push({ nada: "kuning", pesan: `Kegiatan dibuka ${-dm} hari lebih awal dari jendela pendataan ${w.periode} (rencana mulai ${tglIndo(w.mulai)}).` });
  if (dm > 0) out.push({ nada: "kuning", pesan: `Kegiatan dibuka ${dm} hari lebih lambat dari jendela pendataan ${w.periode} (rencana mulai ${tglIndo(w.mulai)}).` });
  if (ds < 0) out.push({ nada: "kuning", pesan: `Kegiatan berakhir ${-ds} hari lebih awal dari jendela pendataan ${w.periode} (rencana selesai ${tglIndo(w.selesai)}).` });
  if (ds > 0) out.push({ nada: "kuning", pesan: `Kegiatan berakhir ${ds} hari lebih lambat dari jendela pendataan ${w.periode} (rencana selesai ${tglIndo(w.selesai)}).` });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Laporan harian
// ---------------------------------------------------------------------------------------------------------------------
export type RingkasLaporan = {
  petugasAktif: number; tanpaHariKerja: number; hariKerja: number; laporan: number; kurangLapor: number; sudahBerakhir: boolean; sudahMulai: boolean; nada: Nada; catatan: string[];
};

export function ringkasLaporan(k: KegiatanBahan, hariIni: string): RingkasLaporan {
  const aktif = k.petugas.filter((p) => p.aktif);
  const sudahMulai = !!k.mulai && hariIni >= k.mulai;
  const sudahBerakhir = !!k.selesai && hariIni > k.selesai;
  const tanpa = aktif.filter((p) => p.hari_kerja === 0).length;
  const hariKerja = aktif.reduce((s, p) => s + p.hari_kerja, 0);
  const laporan = aktif.reduce((s, p) => s + p.laporan, 0);
  const kurang = sudahBerakhir ? aktif.filter((p) => p.laporan < p.hari_kerja).length : 0;
  const catatan: string[] = [];
  if (aktif.length === 0) catatan.push("Belum ada petugas aktif pada kegiatan ini.");
  if (sudahMulai && tanpa > 0 && aktif.length > 0) catatan.push(`${tanpa} petugas belum memilih hari kerja.`);
  if (kurang > 0) catatan.push(`${kurang} petugas memiliki laporan harian lebih sedikit dari hari kerja yang dipilih.`);
  if (!k.aktif) catatan.push("Kegiatan berstatus nonaktif.");
  const nada: Nada = aktif.length === 0 ? "abu" : kurang > 0 ? "merah" : sudahMulai && tanpa > 0 ? "kuning" : "hijau";
  return { petugasAktif: aktif.length, tanpaHariKerja: tanpa, hariKerja, laporan, kurangLapor: kurang, sudahBerakhir, sudahMulai, nada, catatan };
}

// ---------------------------------------------------------------------------------------------------------------------
// Evaluasi
// ---------------------------------------------------------------------------------------------------------------------
export function agendaEvaluasi(form: Form, kegiatan: KegiatanBahan[], hariIni: string): { butir: string[]; rapat: number; nada: Nada; pesan: string } {
  const butir = evaluasiDari(form);
  const rapat = kegiatan.reduce((s, k) => s + k.rapat_evaluasi, 0);
  if (kegiatan.length === 0) return { butir, rapat, nada: "abu", pesan: "Belum ada kegiatan tertaut, jadi rapat evaluasi belum dapat dipantau." };
  if (rapat > 0) return { butir, rapat, nada: "hijau", pesan: `${rapat} rapat evaluasi tercatat pada kegiatan tertaut.` };
  const berakhir = kegiatan.filter((k) => k.selesai && hariIni > k.selesai);
  if (berakhir.length > 0) return { butir, rapat, nada: "kuning", pesan: `Kegiatan ${berakhir.map((k) => k.nama).join(", ")} sudah berakhir tetapi belum ada rapat evaluasi tercatat.` };
  return { butir, rapat, nada: "abu", pesan: "Belum waktunya: rapat evaluasi diadakan sesudah pelaksanaan." };
}

// ---------------------------------------------------------------------------------------------------------------------
// Bendahara: biaya dibanding pagu, dan syarat pencairan
// ---------------------------------------------------------------------------------------------------------------------
export type StatusBiaya = "cukup" | "kurang" | "belum_dihitung" | "tanpa_pagu";
export type BarisBiaya = {
  akun: string; nama: string; kebutuhan: number; barisTerhitung: number; barisBelum: number; pagu: number | null; realSd: number | null; sisa: number | null;
  status: StatusBiaya; nada: Nada; catatan: string;
};

export function kesiapanBiaya(rincian: BarisRincian[], realisasi: RealisasiAkun[], sampai: string | null): { baris: BarisBiaya[]; adaLaporan: boolean; kurang: number } {
  const per = new Map<string, { kebutuhan: number; terhitung: number; belum: number }>();
  for (const b of rincian) {
    const x = per.get(b.akun) ?? { kebutuhan: 0, terhitung: 0, belum: 0 };
    if (b.jumlah === null) x.belum += 1; else { x.kebutuhan += b.jumlah; x.terhitung += 1; }
    per.set(b.akun, x);
  }
  const adaLaporan = realisasi.length > 0;
  const baris: BarisBiaya[] = [];
  for (const [akun, x] of [...per.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const r = realisasi.find((y) => y.akun === akun) ?? null;
    const nama = NAMA_AKUN[akun] ?? "Akun belanja";
    let status: StatusBiaya; let nada: Nada; let catatan: string;
    const sisaan = x.belum > 0 ? ` Belum termasuk ${x.belum} baris yang belum terhitung.` : "";
    if (x.terhitung === 0) { status = "belum_dihitung"; nada = "abu"; catatan = "Kebutuhan belum dapat dihitung (menunggu tarif atau jumlah hari)."; }
    else if (!r) {
      status = "tanpa_pagu"; nada = "kuning";
      catatan = adaLaporan ? `Akun ${akun} tidak ditemukan pada laporan realisasi RO ini.${sisaan}` : `Belum ada laporan realisasi diunggah, jadi pagu belum dapat dibandingkan.${sisaan}`;
    } else if (x.kebutuhan > r.sisa) {
      status = "kurang"; nada = "merah";
      catatan = `Kebutuhan terhitung ${rp(x.kebutuhan)} melebihi sisa pagu ${rp(r.sisa)}${sampai ? ` (laporan s.d. ${tglIndo(sampai)})` : ""}.${sisaan}`;
    } else {
      status = "cukup"; nada = "hijau";
      catatan = `Sisa pagu ${rp(r.sisa)} mencukupi kebutuhan terhitung${sampai ? ` (laporan s.d. ${tglIndo(sampai)})` : ""}.${sisaan}`;
    }
    baris.push({ akun, nama, kebutuhan: x.kebutuhan, barisTerhitung: x.terhitung, barisBelum: x.belum, pagu: r ? r.pagu : null, realSd: r ? r.real_sd : null, sisa: r ? r.sisa : null, status, nada, catatan });
  }
  return { baris, adaLaporan, kurang: baris.filter((b) => b.status === "kurang").length };
}

export type ButirPencairan = { butir: string; siap: boolean | null; ket: string };
export type MasukanPencairan = {
  isi: IsiLanjutan | null; status: StatusLanjutan | null; kebijakanVer: number | null; kegiatanTertaut: number; penugasanSigap: number; suratTerbit: number;
  biaya: { adaLaporan: boolean; kurang: number } | null;
};

/** Jumlah petugas yang sudah bernama pada lanjutan. */
export const petugasBernama = (isi: IsiLanjutan | null): number => (isi ? isi.petugas.filter((p) => !p.menyusul && p.nama.replace(/ /g, "") !== "").length : 0);

export function kesiapanPencairan(m: MasukanPencairan): ButirPencairan[] {
  const bernama = petugasBernama(m.isi);
  const out: ButirPencairan[] = [];
  out.push({ butir: "Identifikasi lanjutan Final", siap: m.status === "final", ket: m.status === null ? "Belum ada identifikasi lanjutan." : m.status === "final" ? "Semua isian Fix dan nama petugas lengkap." : "Masih Draf: ada isian Perkiraan atau nama menyusul." });
  out.push({ butir: "Lembar kebijakan berlaku", siap: m.kebijakanVer !== null, ket: m.kebijakanVer !== null ? `Lembar kebijakan versi ${m.kebijakanVer} dipakai.` : "Belum ada lembar kebijakan yang berlaku; batas kebijakan belum dapat dibaca." });
  out.push({ butir: "Kegiatan pelaksanaan tertaut", siap: m.kegiatanTertaut > 0, ket: m.kegiatanTertaut > 0 ? `${m.kegiatanTertaut} kegiatan tertaut.` : "Tautkan kegiatan agar penugasan dan laporan dapat dipantau." });
  out.push({
    butir: "Penugasan petugas di SIGAP", siap: bernama === 0 ? null : m.penugasanSigap >= bernama,
    ket: bernama === 0 ? "Belum ada petugas bernama pada lanjutan." : `${Math.min(m.penugasanSigap, bernama)} dari ${bernama} petugas bernama sudah punya penugasan.`,
  });
  out.push({
    butir: "Surat tugas atau SPK terbit", siap: bernama === 0 ? null : m.suratTerbit >= bernama,
    ket: bernama === 0 ? "Belum ada petugas bernama pada lanjutan." : `${Math.min(m.suratTerbit, bernama)} dari ${bernama} petugas bernama sudah memiliki dokumen terbit.`,
  });
  out.push({
    butir: "Sisa pagu mencukupi kebutuhan terhitung", siap: m.biaya === null || !m.biaya.adaLaporan ? null : m.biaya.kurang === 0,
    ket: m.biaya === null ? "Rincian biaya belum tersedia." : !m.biaya.adaLaporan ? "Belum ada laporan realisasi diunggah." : m.biaya.kurang === 0 ? "Tidak ada akun yang kebutuhannya melebihi sisa pagu." : `${m.biaya.kurang} akun kebutuhannya melebihi sisa pagu.`,
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Penanda kartu pada halaman pelaksanaan (untuk tautan di dalam halaman)
// ---------------------------------------------------------------------------------------------------------------------
export const ID_PL = { tautan: "pl-tautan", usulan: "pl-usulan", laporan: "pl-laporan", evaluasi: "pl-evaluasi", bendahara: "pl-bendahara" } as const;
