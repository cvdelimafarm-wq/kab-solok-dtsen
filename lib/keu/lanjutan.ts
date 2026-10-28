// lib/keu/lanjutan.ts
//
// (25 Okt 2026, tahap 29) Identifikasi lanjutan: perkiraan identifikasi awal menjadi data Fix (kelas pelatihan, jumlah dan nama petugas, jabatan,
// sumber mitra, translok dan penginapan). Berkas ini MURNI (tanpa basis data): bentuk isi, pemeriksa, penentu status Draf/Final, penyusun isi awal dari
// identifikasi awal, peringatan terhadap lembar kebijakan, alasan masih Draf, dan rincian biaya.
//
// Pemeriksa `periksaLanjutan` dan penentu `statusLanjutan` punya kembaran di basis data (keu_lanjutan_periksa, keu_lanjutan_status, berkas 20261025zf)
// dengan pesan yang SAMA PERSIS; kesamaannya dijaga tes lanjutan.test.ts (vektor bersama lanjutan.vektor.json) dan 51_uji_lanjutan.sql.
// Peringatan terhadap lembar kebijakan hanya di sini (tidak memblokir). Rancangan: "Skema Lengkap V1" bagian 4.

import { JABATAN, KODE_JABATAN, namaJabatan, strataUntuk, type IsiKebijakan, type KodeJabatan, type Param } from "./kebijakan";
import {
  ASAL_INSTRUKTUR, LEVEL_INSTRUKTUR, daftarPeriode, instrDari, jendelaPeriode, peranTerpakai, tanggalSesi, tempatHotel, tambahHari, selisihHari,
  type AsalInstruktur, type Form, type LevelInstruktur, type PeranForm, type TempatSesi,
} from "./identifikasi";

export const KODE_PERAN = ["supervisor", "kortim", "pml", "ppl", "entri"] as const;
export type KodePeran = (typeof KODE_PERAN)[number];
export const NAMA_PERAN: Record<KodePeran, string> = { supervisor: "Supervisor", kortim: "Kortim", pml: "PML", ppl: "PPL", entri: "Petugas entri" };

export const METODE_KELAS = ["", "Daring", "Luring", "Hybrid"] as const;
export type MetodeKelas = (typeof METODE_KELAS)[number];
export const TEMPAT_KELAS = ["", "Kantor", "Hotel dalam kota", "Hotel luar kota", "Lokasi lain"] as const;
export const PAKET_KELAS = ["", "fullday", "fullboard"] as const;
export type PaketKelas = (typeof PAKET_KELAS)[number];
export const SUMBER_MITRA = ["", "kepka", "seleksi"] as const;
export type SumberMitra = (typeof SUMBER_MITRA)[number];
export const NAMA_SUMBER: Record<string, string> = { "": "—", kepka: "Langsung dari kepka", seleksi: "Lewat seleksi" };

export type Kelas = {
  id: string;
  nama: string;
  sesi: "briefing" | "pelatihan";
  periode: string;
  metode: MetodeKelas;
  tempat: TempatSesi;
  /** Nama dan alamat tempat (mis. nama hotel); dipakai pada undangan. */
  lokasi: string;
  paket: PaketKelas;
  oh: number;
  mulai: string;
  selesai: string;
  untuk: KodePeran[];
  fix: boolean;
  /** (28 Okt 2026) Instruktur (pengajar atau narasumber) kelas ini. Boleh tidak ada pada isi lama; normalisasiLanjutan selalu mengisinya (daftar kosong). */
  instruktur?: Instruktur[];
};
/** Satu instruktur pada satu kelas: nama, level pasti (Innas atau Inda), asal, dan jam mengajar PER INSTRUKTUR pada kelas itu (cek aturan untuk tarif). */
export type Instruktur = { nama: string; level: LevelInstruktur; asal: AsalInstruktur; jam: number };
export const MAKS_INSTRUKTUR = 20;
export const instrukturKosongLj = (): Instruktur => ({ nama: "", level: "", asal: "", jam: 0 });
/** Lengkap = nama, level, asal terisi dan jam minimal 1. */
export const instrukturLengkap = (i: Instruktur): boolean => pangkas(i.nama) !== "" && i.level !== "" && i.asal !== "" && i.jam >= 1;
export type PeranLanjutan = { on: boolean; nOrg: number; nMit: number; translok: boolean; penginapan: boolean; fix: boolean };
export type Petugas = {
  id: string;
  nama: string;
  menyusul: boolean;
  peran: "" | KodePeran;
  status: "Organik" | "Mitra";
  sumber: SumberMitra;
  baru: boolean;
  jabatan: KodeJabatan[];
};
export type IsiLanjutan = { v: 1; wilayah: string; kelas: Kelas[]; peran: Record<KodePeran, PeranLanjutan>; petugas: Petugas[] };
export type StatusLanjutan = "draf" | "final";

// ---------------------------------------------------------------------------------------------------------------------
// Pembantu (harus berperilaku sama dengan SQL)
// ---------------------------------------------------------------------------------------------------------------------
const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const adalahTeks = (x: unknown): x is string => typeof x === "string";
const bulat = (x: unknown, min: number, maks: number): boolean => typeof x === "number" && Number.isFinite(x) && Number.isInteger(x) && x >= min && x <= maks;
/** char_length SQL = jumlah titik kode. */
const panjang = (s: string): number => Array.from(s).length;
/** btrim SQL tanpa argumen hanya memangkas spasi. */
const pangkas = (s: string): string => s.replace(/^ +| +$/g, "");

/** Tanggal "YYYY-MM-DD" yang benar-benar ada (kembaran keu_lanjutan_tgl). */
export function tglValid(v: string): boolean {
  if (!/^\d{4}-\d\d-\d\d$/.test(v) || v < "0001-01-01") return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pemeriksa isi. Pesan galat HARUS sama persis dengan keu_lanjutan_periksa di basis data.
// ---------------------------------------------------------------------------------------------------------------------
export function periksaLanjutan(isi: unknown): string[] {
  if (!adalahObjek(isi)) return ["Isi lanjutan harus berupa objek"];
  const g: string[] = [];
  const a = isi;

  if ("wilayah" in a && (!adalahTeks(a.wilayah) || panjang(a.wilayah) > 2000)) g.push("Wilayah tugas harus berupa teks maksimal 2000 huruf");

  // kelas
  const kelas = "kelas" in a ? a.kelas : [];
  if (!Array.isArray(kelas) || kelas.length > 60) g.push("Daftar kelas harus berupa daftar maksimal 60 kelas");
  else {
    const lihat: string[] = [];
    kelas.forEach((e, i) => {
      const n = i + 1;
      if (!adalahObjek(e)) { g.push(`Kelas ${n} tidak valid`); return; }
      const idk = e.id;
      if (!adalahTeks(idk) || panjang(pangkas(idk)) < 1 || panjang(pangkas(idk)) > 20) g.push(`Kelas ${n}: kode wajib (1 sampai 20 huruf)`);
      else if (lihat.includes(idk)) g.push(`Kelas ${n}: kode dobel`);
      else lihat.push(idk);
      if (e.sesi !== "briefing" && e.sesi !== "pelatihan") g.push(`Kelas ${n}: jenis sesi harus briefing atau pelatihan`);
      if ("nama" in e && !adalahTeks(e.nama)) g.push(`Kelas ${n}: nama harus berupa teks`);
      else if (panjang(adalahTeks(e.nama) ? e.nama : "") > 120) g.push(`Kelas ${n}: nama maksimal 120 huruf`);
      if ("periode" in e && !adalahTeks(e.periode)) g.push(`Kelas ${n}: periode harus berupa teks`);
      else if (panjang(adalahTeks(e.periode) ? e.periode : "") > 60) g.push(`Kelas ${n}: periode maksimal 60 huruf`);
      if ("lokasi" in e && !adalahTeks(e.lokasi)) g.push(`Kelas ${n}: lokasi harus berupa teks`);
      else if (panjang(adalahTeks(e.lokasi) ? e.lokasi : "") > 200) g.push(`Kelas ${n}: lokasi maksimal 200 huruf`);
      if (!adalahTeks(e.metode) || !(METODE_KELAS as readonly string[]).includes(e.metode)) g.push(`Kelas ${n}: metode tidak dikenal`);
      if (!adalahTeks(e.tempat) || !(TEMPAT_KELAS as readonly string[]).includes(e.tempat)) g.push(`Kelas ${n}: tempat tidak dikenal`);
      if (!adalahTeks(e.paket) || !(PAKET_KELAS as readonly string[]).includes(e.paket)) g.push(`Kelas ${n}: paket tidak dikenal`);
      if (!bulat(e.oh, 0, 60)) g.push(`Kelas ${n}: jumlah OH harus bilangan bulat 0 sampai 60`);
      let t1: string | null = null; let t2: string | null = null;
      if (!adalahTeks(e.mulai) || (e.mulai !== "" && !tglValid(e.mulai))) g.push(`Kelas ${n}: tanggal mulai tidak valid`);
      else if (e.mulai !== "") t1 = e.mulai;
      if (!adalahTeks(e.selesai) || (e.selesai !== "" && !tglValid(e.selesai))) g.push(`Kelas ${n}: tanggal selesai tidak valid`);
      else if (e.selesai !== "") t2 = e.selesai;
      if (t1 !== null && t2 !== null && t2 < t1) g.push(`Kelas ${n}: tanggal selesai sebelum tanggal mulai`);
      const u = e.untuk;
      if (!Array.isArray(u)) g.push(`Kelas ${n}: peserta (untuk) harus berupa daftar peran yang dikenal`);
      else if (u.some((x) => !adalahTeks(x) || !(KODE_PERAN as readonly string[]).includes(x))) g.push(`Kelas ${n}: peserta (untuk) harus berupa daftar peran yang dikenal`);
      if (typeof e.fix !== "boolean") g.push(`Kelas ${n}: penanda Fix harus ya atau tidak`);
      else if (e.fix === true) {
        const metode = adalahTeks(e.metode) ? e.metode : ""; const tempat = adalahTeks(e.tempat) ? e.tempat : ""; const paket = adalahTeks(e.paket) ? e.paket : "";
        if (metode === "") g.push(`Kelas ${n}: ditandai Fix tetapi metode belum dipilih`);
        if (!bulat(e.oh, 1, 60)) g.push(`Kelas ${n}: ditandai Fix tetapi jumlah OH belum diisi`);
        if ((adalahTeks(e.mulai) ? e.mulai : "") === "" || (adalahTeks(e.selesai) ? e.selesai : "") === "") g.push(`Kelas ${n}: ditandai Fix tetapi tanggal belum lengkap`);
        if ((metode === "Luring" || metode === "Hybrid") && tempat === "") g.push(`Kelas ${n}: ditandai Fix tetapi tempat belum dipilih`);
        if ((tempat === "Hotel dalam kota" || tempat === "Hotel luar kota") && paket === "") g.push(`Kelas ${n}: ditandai Fix tetapi paket belum dipilih`);
        if (Array.isArray(u) && u.length === 0) g.push(`Kelas ${n}: ditandai Fix tetapi peserta belum dipilih`);
      }
      if ("instruktur" in e) {
        const ins = e.instruktur;
        if (!Array.isArray(ins) || ins.length > MAKS_INSTRUKTUR) g.push(`Kelas ${n}: daftar instruktur harus berupa daftar maksimal 20 instruktur`);
        else {
          let lengkap = true;
          ins.forEach((y, j) => {
            const m = j + 1;
            if (!adalahObjek(y)) { g.push(`Kelas ${n}: instruktur ${m} tidak valid`); lengkap = false; return; }
            let nm = adalahTeks(y.nama) ? y.nama : null;
            if (nm === null || panjang(nm) > 120) { g.push(`Kelas ${n}: instruktur ${m}: nama harus berupa teks maksimal 120 huruf`); nm = ""; }
            const lv = y.level; const asl = y.asal;
            const lvSah = adalahTeks(lv) && (LEVEL_INSTRUKTUR as readonly string[]).includes(lv);
            const aslSah = adalahTeks(asl) && (ASAL_INSTRUKTUR as readonly string[]).includes(asl);
            if (!lvSah) g.push(`Kelas ${n}: instruktur ${m}: level tidak dikenal`);
            if (!aslSah) g.push(`Kelas ${n}: instruktur ${m}: asal tidak dikenal`);
            if (!bulat(y.jam, 0, 500)) g.push(`Kelas ${n}: instruktur ${m}: jam harus bilangan bulat 0 sampai 500`);
            if (pangkas(nm) === "" || !lvSah || lv === "" || !aslSah || asl === "" || !bulat(y.jam, 1, 500)) lengkap = false;
          });
          if (e.fix === true && ins.length > 0 && !lengkap) g.push(`Kelas ${n}: ditandai Fix tetapi instruktur belum lengkap`);
        }
      }
    });
  }

  // peran
  const pr = a.peran;
  if (!adalahObjek(pr)) g.push("Isian peran harus berupa objek");
  else {
    for (const k of KODE_PERAN) {
      const x = pr[k];
      if (!adalahObjek(x)) { g.push(`Peran ${k} tidak ada`); continue; }
      if (typeof x.on !== "boolean") g.push(`Peran ${k}: penanda pakai harus ya atau tidak`);
      if (!bulat(x.nOrg, 0, 10000)) g.push(`Peran ${k}: jumlah organik harus bilangan bulat 0 sampai 10000`);
      if (!bulat(x.nMit, 0, 10000)) g.push(`Peran ${k}: jumlah mitra harus bilangan bulat 0 sampai 10000`);
      if (typeof x.translok !== "boolean") g.push(`Peran ${k}: translok harus ya atau tidak`);
      if (typeof x.penginapan !== "boolean") g.push(`Peran ${k}: penginapan harus ya atau tidak`);
      if (typeof x.fix !== "boolean") g.push(`Peran ${k}: penanda Fix harus ya atau tidak`);
      else if (x.fix === true && x.on === true && bulat(x.nOrg, 0, 10000) && bulat(x.nMit, 0, 10000) && (x.nOrg as number) + (x.nMit as number) < 1) g.push(`Peran ${k}: ditandai Fix tetapi jumlah petugas 0`);
    }
  }

  // petugas
  const pt = "petugas" in a ? a.petugas : [];
  if (!Array.isArray(pt) || pt.length > 3000) g.push("Daftar petugas harus berupa daftar maksimal 3000 petugas");
  else {
    const lihat: string[] = []; const namaLihat: string[] = [];
    pt.forEach((e, i) => {
      const n = i + 1;
      if (!adalahObjek(e)) { g.push(`Petugas ${n} tidak valid`); return; }
      const idp = e.id;
      if (!adalahTeks(idp) || panjang(pangkas(idp)) < 1 || panjang(pangkas(idp)) > 20) g.push(`Petugas ${n}: kode wajib (1 sampai 20 huruf)`);
      else if (lihat.includes(idp)) g.push(`Petugas ${n}: kode dobel`);
      else lihat.push(idp);
      let nm = adalahTeks(e.nama) ? e.nama : null;
      if (nm === null || panjang(nm) > 120) { g.push(`Petugas ${n}: nama harus berupa teks maksimal 120 huruf`); nm = ""; }
      if (typeof e.menyusul !== "boolean") g.push(`Petugas ${n}: penanda menyusul harus ya atau tidak`);
      else if (e.menyusul === true) { if (pangkas(nm) !== "") g.push(`Petugas ${n}: tandai menyusul hanya bila nama kosong`); }
      else if (pangkas(nm) === "") g.push(`Petugas ${n}: nama wajib diisi atau tandai menyusul`);
      if (typeof e.baru !== "boolean") g.push(`Petugas ${n}: penanda baru harus ya atau tidak`);
      const per = e.peran;
      if (!adalahTeks(per) || (per !== "" && !(KODE_PERAN as readonly string[]).includes(per))) g.push(`Petugas ${n}: peran tidak dikenal`);
      const st = e.status;
      if (!adalahTeks(st) || (st !== "Organik" && st !== "Mitra")) g.push(`Petugas ${n}: status harus Organik atau Mitra`);
      else {
        const sm = e.sumber;
        if (!adalahTeks(sm) || !(SUMBER_MITRA as readonly string[]).includes(sm)) g.push(`Petugas ${n}: sumber mitra tidak dikenal`);
        else if (st === "Mitra" && sm === "") g.push(`Petugas ${n}: sumber mitra wajib dipilih (kepka atau seleksi)`);
        else if (st === "Organik" && sm !== "") g.push(`Petugas ${n}: sumber mitra hanya untuk mitra`);
      }
      const jb = e.jabatan;
      if (!Array.isArray(jb)) g.push(`Petugas ${n}: jabatan tidak dikenal`);
      else {
        const sudah: string[] = [];
        for (const j of jb) {
          if (!adalahTeks(j) || !(KODE_JABATAN as readonly string[]).includes(j) || sudah.includes(j)) { g.push(`Petugas ${n}: jabatan tidak dikenal`); break; }
          sudah.push(j);
        }
      }
      if (pangkas(nm) !== "") {
        const kunci = pangkas(nm).toLowerCase();
        if (namaLihat.includes(kunci)) g.push(`Nama petugas dobel: ${pangkas(nm)}`);
        else namaLihat.push(kunci);
      }
    });
  }
  return g;
}

/** Status data. Kembaran keu_lanjutan_status; isi harus sudah lolos periksaLanjutan. */
export function statusLanjutan(isi: IsiLanjutan): StatusLanjutan {
  return alasanDraf(isi).length === 0 ? "final" : "draf";
}

/** Alasan masih Draf (kosong = Final). Urutan tidak penting; hanya status yang dibandingkan dengan SQL. */
export function alasanDraf(isi: IsiLanjutan): string[] {
  const r: string[] = [];
  const kelas = isi.kelas ?? [];
  kelas.forEach((k, i) => { if (!k.fix) r.push(`${k.nama?.trim() || `Kelas ${i + 1}`} masih Perkiraan`); });
  const petugas = isi.petugas ?? [];
  const sus = petugas.filter((p) => p.menyusul).length;
  if (sus > 0) r.push(`${sus} nama petugas masih menyusul`);
  let nPakai = 0;
  for (const k of KODE_PERAN) {
    const x = isi.peran?.[k];
    if (!x?.on) continue;
    nPakai += 1;
    if (!x.fix) r.push(`Jumlah ${NAMA_PERAN[k]} masih Perkiraan`);
    const org = petugas.filter((p) => p.peran === k && p.status === "Organik").length;
    const mit = petugas.filter((p) => p.peran === k && p.status === "Mitra").length;
    if (org !== x.nOrg) r.push(`${NAMA_PERAN[k]}: organik tercatat ${org} dari ${x.nOrg}`);
    if (mit !== x.nMit) r.push(`${NAMA_PERAN[k]}: mitra tercatat ${mit} dari ${x.nMit}`);
  }
  if (kelas.length === 0 && nPakai === 0) r.push("Belum ada kelas maupun peran yang diisi");
  return r;
}

// ---------------------------------------------------------------------------------------------------------------------
// Isi awal dari identifikasi awal
// ---------------------------------------------------------------------------------------------------------------------
const tanpaNol = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Jumlah hari (inklusif) antara dua tanggal; 0 bila belum lengkap. */
export function hariKelas(mulai: string, selesai: string): number {
  if (!tglValid(mulai) || !tglValid(selesai) || selesai < mulai) return 0;
  return selisihHari(selesai, mulai) + 1;
}

/** Peran lapangan pada identifikasi awal -> bentuk lanjutan (Fix hanya bila identifikasi awal tidak menandainya Perkiraan dan jumlah > 0). */
function peranDari(f: Form, k: KodePeran): PeranLanjutan {
  const t = peranTerpakai(f).find((x) => x.id === k);
  if (!t) return { on: false, nOrg: 0, nMit: 0, translok: false, penginapan: false, fix: false };
  const p: PeranForm = t.p;
  const nOrg = p.status === "Mitra" ? 0 : tanpaNol(p.nOrg);
  const nMit = p.status === "Organik" ? 0 : tanpaNol(p.nMit);
  return { on: true, nOrg, nMit, translok: t.translok, penginapan: false, fix: !p.perk && nOrg + nMit >= 1 };
}

/** Isi lanjutan awal yang diturunkan dari identifikasi awal (sah). Semua kelas bertanda Perkiraan; nama petugas menyusul. */
export function awalLanjutan(f: Form, tahun: number): IsiLanjutan {
  const peran = {} as Record<KodePeran, PeranLanjutan>;
  for (const k of KODE_PERAN) peran[k] = peranDari(f, k);
  const aktif = KODE_PERAN.filter((k) => peran[k].on);
  const kelas: Kelas[] = [];
  if (!f.berbagi) {
    for (const [id, nama] of [["briefing", "Briefing"], ["pelatihan", "Pelatihan"]] as const) {
      const s = f.sesi[id];
      if (!s.on) continue;
      for (const P of daftarPeriode(f)) {
        const t = tanggalSesi(f, id, P, tahun);
        const mulai = tglValid(t.mulai) ? t.mulai : ""; const selesai = tglValid(t.selesai) ? t.selesai : "";
        const ins = s.pengajar ? instrDari(s) : null;
        const instruktur: Instruktur[] = ins && ins.jumlah >= 1
          ? Array.from({ length: Math.min(ins.jumlah, MAKS_INSTRUKTUR) }, (_, n) => {
            // jam pada identifikasi awal = TOTAL jam mengajar per kelas (semua instruktur); dibagi rata, sisanya ke instruktur pertama
            const total = Math.min(500, Math.max(0, Math.floor(ins.jam))); const banyak = Math.min(ins.jumlah, MAKS_INSTRUKTUR);
            return { nama: "", level: ins.level, asal: ins.asal, jam: Math.floor(total / banyak) + (n < total % banyak ? 1 : 0) };
          })
          : [];
        kelas.push({
          id: `k${kelas.length + 1}`, nama: daftarPeriode(f).length > 1 || f.periode !== "Tanpa periode" ? `${nama} ${P}` : nama, sesi: id, periode: P,
          metode: s.bentuk as MetodeKelas, tempat: s.tempat, lokasi: "", paket: "", oh: Math.min(60, hariKelas(mulai, selesai)), mulai, selesai, untuk: [...aktif], fix: false, instruktur,
        });
      }
    }
  }
  const petugas: Petugas[] = [];
  for (const k of KODE_PERAN) {
    const x = peran[k];
    for (let i = 0; i < x.nOrg; i++) petugas.push({ id: `p${petugas.length + 1}`, nama: "", menyusul: true, peran: k, status: "Organik", sumber: "", baru: false, jabatan: [] });
    for (let i = 0; i < x.nMit; i++) petugas.push({ id: `p${petugas.length + 1}`, nama: "", menyusul: true, peran: k, status: "Mitra", sumber: "kepka", baru: false, jabatan: [] });
  }
  return { v: 1, wilayah: "", kelas, peran, petugas };
}

/** Daftar instruktur dari isi mentah: bukan daftar -> kosong; maksimal 20; nilai tak dikenal diganti kosong atau nol. */
function normalisasiInstruktur(masuk: unknown): Instruktur[] {
  if (!Array.isArray(masuk)) return [];
  return masuk.filter(adalahObjek).slice(0, MAKS_INSTRUKTUR).map((y) => ({
    nama: adalahTeks(y.nama) ? Array.from(y.nama).slice(0, 120).join("") : "",
    level: (LEVEL_INSTRUKTUR as readonly string[]).includes(String(y.level)) ? (y.level as LevelInstruktur) : "",
    asal: (ASAL_INSTRUKTUR as readonly string[]).includes(String(y.asal)) ? (y.asal as AsalInstruktur) : "",
    jam: Math.min(500, tanpaNol(y.jam)),
  }));
}

/** Normalisasi isi dari basis data menjadi bentuk lengkap (nilai hilang diisi bawaan). */
export function normalisasiLanjutan(masuk: unknown): IsiLanjutan {
  const a = adalahObjek(masuk) ? masuk : {};
  const peran = {} as Record<KodePeran, PeranLanjutan>;
  const pr = adalahObjek(a.peran) ? a.peran : {};
  for (const k of KODE_PERAN) {
    const x = adalahObjek(pr[k]) ? pr[k] : {};
    peran[k] = { on: x.on === true, nOrg: tanpaNol(x.nOrg), nMit: tanpaNol(x.nMit), translok: x.translok === true, penginapan: x.penginapan === true, fix: x.fix === true };
  }
  const kelas: Kelas[] = (Array.isArray(a.kelas) ? a.kelas : []).filter(adalahObjek).map((e, i) => ({
    id: adalahTeks(e.id) ? e.id : `k${i + 1}`, nama: adalahTeks(e.nama) ? e.nama : "", sesi: e.sesi === "briefing" ? "briefing" : "pelatihan", periode: adalahTeks(e.periode) ? e.periode : "",
    metode: (METODE_KELAS as readonly string[]).includes(String(e.metode)) ? (e.metode as MetodeKelas) : "", tempat: (TEMPAT_KELAS as readonly string[]).includes(String(e.tempat)) ? (e.tempat as TempatSesi) : "",
    lokasi: adalahTeks(e.lokasi) ? e.lokasi : "", paket: (PAKET_KELAS as readonly string[]).includes(String(e.paket)) ? (e.paket as PaketKelas) : "", oh: tanpaNol(e.oh),
    mulai: adalahTeks(e.mulai) ? e.mulai : "", selesai: adalahTeks(e.selesai) ? e.selesai : "",
    untuk: Array.isArray(e.untuk) ? (e.untuk.filter((x) => (KODE_PERAN as readonly string[]).includes(String(x))) as KodePeran[]) : [], fix: e.fix === true,
    instruktur: normalisasiInstruktur(e.instruktur),
  }));
  const petugas: Petugas[] = (Array.isArray(a.petugas) ? a.petugas : []).filter(adalahObjek).map((e, i) => ({
    id: adalahTeks(e.id) ? e.id : `p${i + 1}`, nama: adalahTeks(e.nama) ? e.nama : "", menyusul: e.menyusul === true,
    peran: (KODE_PERAN as readonly string[]).includes(String(e.peran)) ? (e.peran as KodePeran) : "", status: e.status === "Mitra" ? "Mitra" : "Organik",
    sumber: (SUMBER_MITRA as readonly string[]).includes(String(e.sumber)) ? (e.sumber as SumberMitra) : "", baru: e.baru === true,
    jabatan: Array.isArray(e.jabatan) ? (e.jabatan.filter((x, j, arr) => (KODE_JABATAN as readonly string[]).includes(String(x)) && arr.indexOf(x) === j) as KodeJabatan[]) : [],
  }));
  return { v: 1, wilayah: adalahTeks(a.wilayah) ? a.wilayah : "", kelas, peran, petugas };
}

/** ID baru yang belum dipakai ("k3", "p17", ...). */
export function idBaru(awalan: "k" | "p", sudah: string[]): string {
  let n = sudah.length + 1;
  while (sudah.includes(`${awalan}${n}`)) n += 1;
  return `${awalan}${n}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Ringkasan dan peserta
// ---------------------------------------------------------------------------------------------------------------------
export function jumlahPetugas(isi: IsiLanjutan): { total: number; organik: number; mitra: number; menyusul: number; baru: number } {
  const p = isi.petugas;
  return { total: p.length, organik: p.filter((x) => x.status === "Organik").length, mitra: p.filter((x) => x.status === "Mitra").length, menyusul: p.filter((x) => x.menyusul).length, baru: p.filter((x) => x.baru).length };
}

/** Jumlah peserta kelas: untuk tiap peran yang diikuti, jumlah Fix (bila peran dipakai) atau jumlah petugas tercatat. */
export function pesertaKelas(isi: IsiLanjutan, k: Kelas): number {
  let n = 0;
  for (const kode of k.untuk) {
    const x = isi.peran[kode];
    n += x?.on ? x.nOrg + x.nMit : isi.petugas.filter((p) => p.peran === kode).length;
  }
  return n;
}

export const namaPetugas = (p: Petugas, urut: number): string => (pangkas(p.nama) !== "" ? pangkas(p.nama) : `Petugas ${urut} (nama menyusul)`);

// ---------------------------------------------------------------------------------------------------------------------
// Peringatan terhadap lembar kebijakan (tidak memblokir)
// ---------------------------------------------------------------------------------------------------------------------
export const ID_LJ = { status: "lj-status", wilayah: "lj-wilayah", kelas: "lj-kelas", peran: "lj-peran", petugas: "lj-petugas", rincian: "lj-rincian", dokumen: "lj-dokumen", pengecualian: "lj-pengecualian", riwayat: "lj-riwayat" } as const;

export type KonteksPeringatan = {
  lembar: IsiKebijakan | null;
  /** Versi identifikasi awal sekarang lebih baru daripada dasar penyimpanan terakhir. */
  dasarUsang: boolean;
  form: Form | null;
};

const param = (l: IsiKebijakan, k: string): Param | undefined => l.param.find((x) => x.k === k);

export function peringatanLanjutan(isi: IsiLanjutan, ktx: KonteksPeringatan): string[] {
  const w: string[] = [];
  if (ktx.dasarUsang) w.push("Identifikasi awal telah direvisi sejak lanjutan terakhir disimpan; periksa kembali kelas dan jumlah petugas, lalu simpan.");
  if (ktx.form) {
    for (const [id, nama] of [["briefing", "Briefing"], ["pelatihan", "Pelatihan"]] as const) {
      if (ktx.form.sesi[id].on && !ktx.form.berbagi && !isi.kelas.some((k) => k.sesi === id)) w.push(`Identifikasi awal memuat ${nama.toLowerCase()}, tetapi belum ada kelasnya.`);
    }
  }
  if (isi.wilayah.trim() === "") w.push("Wilayah tugas belum diisi (dibutuhkan surat pengantar ke nagari).");
  for (const k of isi.kelas) {
    const ins = k.instruktur ?? [];
    const sesiForm = ktx.form?.sesi[k.sesi];
    if (ins.length === 0 && sesiForm?.on && sesiForm.pengajar) w.push(`${k.nama || "Kelas"}: identifikasi awal memuat instruktur, tetapi belum diisi pada kelas ini.`);
    const kurang = ins.filter((i) => !instrukturLengkap(i)).length;
    if (kurang > 0) w.push(`${k.nama || "Kelas"}: ${kurang} instruktur belum lengkap (nama, level, asal, dan jam).`);
  }
  const l = ktx.lembar;
  if (!l) {
    w.push("Belum ada lembar kebijakan yang berlaku; susunan tim dan batas anggaran belum dapat diperiksa.");
    return w;
  }
  const rows = isi.petugas;
  const total = rows.length;
  const st = strataUntuk(l, total);
  if (st && total > 0) {
    for (const j of JABATAN) {
      const min = l.minimal[st.k]?.[j.k] ?? 0;
      const ada = rows.filter((p) => p.jabatan.includes(j.k)).length;
      if (ada < min) w.push(`${namaJabatan(j.k)}: minimal ${min} pada ${st.k} (${total} petugas), baru terisi ${ada}.`);
    }
    const boleh = new Set<string>(l.rangkap[st.k] ?? []);
    rows.forEach((p, i) => {
      const nm = namaPetugas(p, i + 1);
      if (p.jabatan.length > st.maks_jabatan) w.push(`${nm} memegang ${p.jabatan.length} jabatan; maksimal ${st.maks_jabatan} pada ${st.k}.`);
      if (p.jabatan.length > 1) {
        const lain = p.jabatan.filter((j) => !boleh.has(j));
        if (lain.length > 0) w.push(`${nm} merangkap ${lain.map(namaJabatan).join(", ")}, yang tidak boleh dirangkap pada ${st.k}.`);
      }
    });
    if (st.persen_baru !== null) {
      const baru = rows.filter((p) => p.baru).length;
      const persen = (baru * 100) / total;
      if (persen > st.persen_baru) w.push(`Petugas baru ${baru} dari ${total} (${Math.round(persen * 10) / 10}%) melebihi batas ${st.persen_baru}% pada ${st.k}.`);
    }
  }
  const maks = param(l, "maks_peserta_kelas");
  if (maks && typeof maks.kebijakan === "number") {
    for (const k of isi.kelas) {
      const n = pesertaKelas(isi, k);
      if (n > maks.kebijakan) w.push(`${k.nama || "Kelas"}: peserta ${n} melebihi batas kebijakan ${maks.kebijakan} per kelas${typeof maks.aturan === "number" && n > maks.aturan ? " dan melebihi aturan" : ""}.`);
    }
  }
  const hotel = param(l, "hotel_luar_kota");
  if (hotel && hotel.kebijakan === false) for (const k of isi.kelas) if (k.tempat === "Hotel luar kota") w.push(`${k.nama || "Kelas"}: hotel luar kota tidak diperkenankan oleh kebijakan kantor.`);
  return w;
}

/** Id kartu tujuan untuk butir peringatan atau alasan Draf (supaya dapat diklik). */
export function tujuanLanjutan(teks: string): string | null {
  const t = teks.toLowerCase();
  if (t.includes("wilayah tugas")) return ID_LJ.wilayah;
  if (t.includes("kelas") || t.includes("briefing") || t.includes("pelatihan") || t.includes("hotel") || t.includes("peserta")) return ID_LJ.kelas;
  if (t.includes("jumlah") && t.includes("perkiraan") || t.includes("organik tercatat") || t.includes("mitra tercatat")) return ID_LJ.peran;
  if (t.includes("petugas") || t.includes("jabatan") || t.includes("merangkap") || t.includes("memegang") || t.includes("minimal") || t.includes("nama")) return ID_LJ.petugas;
  if (t.includes("identifikasi awal")) return ID_LJ.status;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rincian biaya dan rencana realisasi
// ---------------------------------------------------------------------------------------------------------------------
export type BarisRincian = {
  kelompok: "Pelatihan" | "Translok dan penginapan" | "Honor" | "Rapat" | "Lain-lain";
  uraian: string;
  akun: string;
  volume: number | null;
  satuan: string;
  tarif: number | null;
  jumlah: number | null;
  /** Catatan mengapa tarif atau jumlah belum dapat dihitung. */
  catatan: string;
  /** true bila bersumber dari isian bertanda Perkiraan. */
  perk: boolean;
};

const angkaKeb = (l: IsiKebijakan | null, k: string): number | null => {
  const x = l ? param(l, k) : undefined;
  return x && typeof x.kebijakan === "number" ? x.kebijakan : null;
};

/**
 * Rincian kebutuhan dan biaya. Jumlah rupiah hanya dihitung bila volume dan tarif keduanya sudah diketahui dari identifikasi dan lembar kebijakan;
 * selain itu baris tetap tampil dengan catatan. Angka belum sah sampai identifikasi dan lembar kebijakan disahkan.
 */
export function rincianBiaya(isi: IsiLanjutan, f: Form | null, lembar: IsiKebijakan | null): BarisRincian[] {
  const out: BarisRincian[] = [];
  const tambah = (b: Omit<BarisRincian, "jumlah"> & { jumlah?: number | null }) => {
    const jumlah = b.jumlah !== undefined ? b.jumlah : b.volume !== null && b.tarif !== null ? b.volume * b.tarif : null;
    out.push({ ...b, jumlah });
  };
  const mitraPeserta = (k: Kelas) => k.untuk.reduce((s, x) => s + (isi.peran[x]?.on ? isi.peran[x].nMit : isi.petugas.filter((p) => p.peran === x && p.status === "Mitra").length), 0);
  const adaMitra = KODE_PERAN.some((k) => isi.peran[k].on && isi.peran[k].nMit > 0) || isi.petugas.some((p) => p.status === "Mitra");
  const paketBerkas = (kode: string) => { const x = lembar ? param(lembar, kode) : undefined; return !!x?.berkas; };

  for (const k of isi.kelas) {
    const peserta = pesertaKelas(isi, k);
    const nama = k.nama || (k.sesi === "briefing" ? "Briefing" : "Pelatihan");
    const oh = peserta * k.oh;
    if ((k.metode === "Luring" || k.metode === "Hybrid") && adaMitra) {
      if (tempatHotel(k.tempat)) {
        out.push({
          kelompok: "Pelatihan", uraian: `${nama}: paket ${k.paket || "fullday atau fullboard"} di ${k.tempat.toLowerCase()}`, akun: k.tempat === "Hotel luar kota" ? "524119" : "524114",
          volume: oh || null, satuan: "orang-hari", tarif: null, jumlah: null, perk: !k.fix,
          catatan: paketBerkas("paket_fullday") ? "Tarif mengacu tabel SBM paket." : "Tarif SBM paket belum tersedia (tabel rujukan belum diunggah).",
        });
      } else {
        out.push({ kelompok: "Pelatihan", uraian: `${nama}: konsumsi tanpa paket`, akun: "521211", volume: oh || null, satuan: "orang-hari", tarif: null, jumlah: null, perk: !k.fix, catatan: "Tarif konsumsi pelatihan belum diatur pada lembar kebijakan." });
      }
    }
    const sesiForm = f?.sesi[k.sesi];
    if ((k.metode === "Daring" || k.metode === "Hybrid") && sesiForm?.pulsa && adaMitra) {
      const tarif = angkaKeb(lembar, "pulsa_peserta"); const vol = mitraPeserta(k) || null;
      tambah({ kelompok: "Lain-lain", uraian: `${nama}: pulsa peserta (mitra)`, akun: "521211", volume: vol, satuan: "orang", tarif, perk: !k.fix, catatan: tarif === null ? "Tarif pulsa peserta belum ada pada lembar kebijakan." : vol === null ? "Jumlah peserta mitra belum diketahui." : "" });
    }
    const ins = k.instruktur ?? [];
    if (ins.length > 0) {
      // (28 Okt 2026) honor instruktur per kelas, level, dan asal; volume = jumlah jam seluruh instruktur kelompok itu; tarif belum ada pada lembar kebijakan.
      // Pada RAB baris kelas digabung menjadi (jumlah kelas x jam kelas) x tarif; pada POK hanya total jam x tarif (rumus ada pada rabSurvei.ts).
      const kelompok = new Map<string, Instruktur[]>();
      for (const i of ins) { const kunci = `${i.level}|${i.asal}`; kelompok.set(kunci, [...(kelompok.get(kunci) ?? []), i]); }
      for (const [, daftar] of kelompok) {
        const { level, asal } = daftar[0];
        const jam = daftar.reduce((t, i) => t + i.jam, 0);
        out.push({
          kelompok: "Honor", uraian: `${nama}: honor instruktur ${level || "(level belum dipilih)"}${asal ? `, ${asal}` : ""}`, akun: "522151",
          volume: jam >= 1 ? jam : null, satuan: "jam", tarif: null, jumlah: null, perk: !k.fix || daftar.some((i) => !instrukturLengkap(i)),
          catatan: `${daftar.length} instruktur, ${jam} jam. Tarif honor instruktur mengikuti ketentuan yang berlaku (belum ada pada lembar kebijakan); honor instruktur internal BPS memakai akun yang sama sementara (cek aturan).`,
        });
      }
    } else if (sesiForm?.pengajar) out.push({ kelompok: "Honor", uraian: `${nama}: honor pengajar atau narasumber eksternal`, akun: "522151", volume: null, satuan: "jam", tarif: null, jumlah: null, perk: !k.fix, catatan: "Jumlah jam dan tarif mengikuti ketentuan honor yang berlaku." });
  }

  const trLebih = angkaKeb(lembar, "uang_harian");
  for (const kode of KODE_PERAN) {
    const x = isi.peran[kode];
    if (!x.on) continue;
    const orang = x.nOrg + x.nMit;
    if (x.translok) {
      const tarif = angkaKeb(lembar, "translok_kurang_8");
      out.push({
        kelompok: "Translok dan penginapan", uraian: `Translok ${NAMA_PERAN[kode]} (kurang dari 8 jam)`, akun: "524113", volume: orang || null, satuan: "orang (jumlah hari menyusul)", tarif, jumlah: null, perk: !x.fix,
        catatan: tarif === null ? "Tarif translok belum ada pada lembar kebijakan." : "Jumlah hari translok per orang belum diidentifikasi; jumlah rupiah dihitung saat rencana realisasi.",
      });
      if (trLebih !== null) out.push({ kelompok: "Translok dan penginapan", uraian: `Translok ${NAMA_PERAN[kode]} (lebih dari 8 jam)`, akun: "524113", volume: orang || null, satuan: "orang (jumlah hari menyusul)", tarif: null, jumlah: null, perk: !x.fix, catatan: "Persen dari uang harian ditambah biaya riil (at cost); jumlah hari menyusul." });
    }
    if (x.penginapan) out.push({ kelompok: "Translok dan penginapan", uraian: `Penginapan ${NAMA_PERAN[kode]}`, akun: "524111", volume: orang || null, satuan: "orang (jumlah malam menyusul)", tarif: null, jumlah: null, perk: !x.fix, catatan: "Tarif mengacu SBM penginapan; tabel rujukan belum diunggah." });
  }

  if (f) {
    const konsumsi = angkaKeb(lembar, "konsumsi_rapat");
    for (const [id, nama] of [["persiapan", "persiapan"], ["pelaksanaan", "pelaksanaan"], ["evaluasi", "evaluasi"]] as const) {
      const r = f.rapat[id];
      const on = id === "evaluasi" ? true : r.on;
      const dibayar = id === "persiapan" ? r.mitra && adaMitra : true;
      if (on && dibayar && r.media.includes("Tatap muka")) out.push({ kelompok: "Rapat", uraian: `Konsumsi rapat ${nama} tatap muka`, akun: "521211", volume: null, satuan: "orang", tarif: konsumsi, jumlah: null, perk: false, catatan: "Jumlah peserta rapat belum diidentifikasi." });
    }
  }
  return out;
}

export function jumlahRincian(baris: BarisRincian[]): { total: number; terhitung: number; belum: number } {
  let total = 0; let terhitung = 0; let belum = 0;
  for (const b of baris) { if (b.jumlah === null) belum += 1; else { total += b.jumlah; terhitung += 1; } }
  return { total, terhitung, belum };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pembantu tampilan dan dokumen
// ---------------------------------------------------------------------------------------------------------------------
export const labelStatusLanjutan = (s: StatusLanjutan): { teks: string; nada: "kuning" | "hijau" } =>
  s === "final" ? { teks: "Final", nada: "hijau" } : { teks: "Draf (ada Perkiraan)", nada: "kuning" };

export type JenisDokumen = "undangan" | "pengantar" | "tugas";
export const NAMA_DOKUMEN: Record<JenisDokumen, string> = { undangan: "Undangan pelatihan", pengantar: "Surat pengantar kegiatan ke nagari", tugas: "Surat tugas atau SPK" };

/** Rentang tanggal kelas bila lengkap; kosong bila belum. */
export function ringkasTanggalKelas(k: Pick<Kelas, "mulai" | "selesai">): string {
  if (!k.mulai || !k.selesai) return "tanggal belum ditetapkan";
  return k.mulai === k.selesai ? k.mulai : `${k.mulai} s.d. ${k.selesai}`;
}

/** Tanggal pendataan efektif per periode (pembaruan H-15 bila ada). Dipakai surat pengantar nagari. */
export function jadwalPendataan(f: Form, tahun: number, upd: Record<string, { mulai: string; selesai: string }> | null | undefined): { periode: string; mulai: string; selesai: string }[] {
  const out: { periode: string; mulai: string; selesai: string }[] = [];
  for (const P of daftarPeriode(f)) {
    const u = upd?.[P];
    const w = u ? { mulai: u.mulai, selesai: u.selesai } : jendelaPeriode(f, P, tahun);
    out.push({ periode: P, mulai: w.mulai, selesai: w.selesai });
  }
  return out;
}

export { tambahHari };
