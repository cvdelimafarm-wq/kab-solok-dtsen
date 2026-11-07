// lib/alokasiWilayah.ts  (logika murni; aman diimpor klien dan server)
//
// (7 Nov 2026) ALOKASI PER SUB SLS -- lapis 2 rancangan "sampel lintas survei". ID wilayah = kode sub SLS 16 digit; NKS hanyalah penanda/remark (boleh sama
// antarsurvei, boleh beberapa sub SLS memakai NKS yang sama). Satu baris berkas = satu sub SLS pada satu kegiatan.
//
// Kolom templat (judul kolom tidak membedakan huruf besar/kecil dan tanda baca):
//   Kecamatan | Nagari | Jorong | Kode Sub SLS | NKS | Jumlah KK Sampel Stage 2 | Nama PPL | Nama PML | Nama Korwil | Nama Supervisor
// Hanya Kode Sub SLS yang wajib. Kecamatan/Nagari/Jorong hanya dipakai untuk memeriksa kecocokan dengan master (peringatan). PPL dan PML boleh dikosongkan
// BERPASANGAN (alokasi dini: petugas menyusul). Pencocokan nama PPL/PML/korwil/supervisor memakai ulang mesin sampel (lib/sampelSls.ts, lib/timSampel.ts).
//
// Isi berkas: tipe, pembacaan baris Excel, pemeriksaan terhadap master wilayah, pencocokan petugas, ringkasan, templat.

import {
  bacaKodeWilayah, cocokkanPetugasSampel, normNama,
  type BarisSampel, type GalatBaris, type Kandidat, type Pemetaan,
} from "@/lib/sampelSls";
import { cocokkanAtasan, susunTim, type PemetaanAtasan, type SusunanTim } from "@/lib/timSampel";
import type { InfoJendela } from "@/lib/tagSampel";

export const API_ALOKASI_ADMIN = "/api/portal/pendataan/alokasi";
export const API_ALOKASI = "/api/portal/alokasi";
export const MAKS_BARIS_ALOKASI = 2000;
export const PANJANG_SUBSLS = 16;
export const MAKS_TARGET = 500;

/** Satu baris berkas yang sudah dibersihkan (belum diperiksa ke master, belum dicocokkan ke akun). */
export type BarisAlokasi = {
  idsubsls: string;
  nks: string | null;
  /** null = pakai target bawaan kegiatan */
  target: number | null;
  ppl_nama: string;
  pml_nama: string;
  korwil_nama?: string;
  supervisor_nama?: string;
  /** hanya untuk pemeriksaan kecocokan dengan master */
  kecamatan?: string;
  nagari?: string;
  jorong?: string;
};
export type BarisAlokasiCocok = BarisAlokasi & { ppl_akun_id: number | null; pml_akun_id: number | null };

/** Baris master wilayah yang dibutuhkan pemeriksaan. */
export type WilayahMaster = { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string };

type Medan = "kode" | "nks" | "target" | "ppl" | "pml" | "korwil" | "supervisor" | "kecamatan" | "nagari" | "jorong";
const ALIAS: Record<Medan, string[]> = {
  kode: ["kodesubsls", "idsubsls", "kodewilayah", "kodesub", "kodesls16", "kode"],
  nks: ["nks", "kodenks", "nomorkerangkasampel", "nomornks"],
  target: ["jumlahkksampelstage2", "jumlahkksampel", "jumlahsampel", "jumlahkk", "target", "targetsampel", "jumlah", "jumlahsampelstage2"],
  ppl: ["namappl", "ppl", "petugaspencacah", "pencacah", "namapencacah"],
  pml: ["namapml", "pml", "pengawas", "namapengawas"],
  korwil: ["namakorwil", "korwil", "koordinatorwilayah", "namakoordinatorwilayah", "kortim", "namakortim"],
  supervisor: ["namasupervisor", "supervisor", "spv", "namaspv"],
  kecamatan: ["kecamatan", "namakecamatan", "kec"],
  nagari: ["nagari", "namanagari", "desa", "namadesa", "kelurahan"],
  jorong: ["jorong", "namajorong", "sls", "namasls", "dusun"],
};
const LABEL: Record<Medan, string> = {
  kode: "Kode Sub SLS", nks: "NKS", target: "Jumlah KK Sampel Stage 2", ppl: "Nama PPL", pml: "Nama PML", korwil: "Nama Korwil", supervisor: "Nama Supervisor",
  kecamatan: "Kecamatan", nagari: "Nagari", jorong: "Jorong",
};
export const KOLOM_TEMPLAT_ALOKASI = ["Kecamatan", "Nagari", "Jorong", "Kode Sub SLS", "NKS", "Jumlah KK Sampel Stage 2", "Nama PPL", "Nama PML", "Nama Korwil", "Nama Supervisor"] as const;

const rapat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const teks = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim());

/** Mencocokkan judul kolom berkas dengan kolom baku -> judul asli di berkas. */
export function petaKolomAlokasi(judul: readonly string[]): Partial<Record<Medan, string>> {
  const hasil: Partial<Record<Medan, string>> = {};
  for (const j of judul) {
    const r = rapat(String(j ?? "").replace(/\([^)]*\)/g, ""));
    if (!r) continue;
    for (const m of Object.keys(ALIAS) as Medan[]) {
      if (!hasil[m] && ALIAS[m].includes(r)) {
        hasil[m] = String(j);
        break;
      }
    }
  }
  return hasil;
}

/** Kode sub SLS dari sel Excel: tepat 16 digit. Kode 14 digit (SLS) ditolak dengan petunjuk. */
export function bacaKodeSubsls(sel: string): { ok: true; kode: string } | { ok: false; pesan: string } {
  const k = bacaKodeWilayah(sel);
  if (!k.ok) return k;
  if (k.kode.length === 14) return { ok: false, pesan: `Kode "${sel}" 14 digit (tingkat SLS). Alokasi memakai kode Sub SLS 16 digit.` };
  if (k.kode.length !== PANJANG_SUBSLS) return { ok: false, pesan: `Kode Sub SLS "${sel}" harus tepat ${PANJANG_SUBSLS} digit (kode ini ${k.kode.length} digit).` };
  return { ok: true, kode: k.kode };
}

export type HasilPeriksaAlokasi = { baris: BarisAlokasi[]; nomor: number[]; galat: GalatBaris[]; peringatan: GalatBaris[]; dilewati: number };

/** Baris hasil sheet_to_json -> baris alokasi bersih. Nomor baris pada galat = nomor baris Excel (judul = baris 1). Galat = baris TIDAK dimasukkan. */
export function periksaBarisAlokasi(baris: readonly Record<string, unknown>[]): HasilPeriksaAlokasi {
  const galat: GalatBaris[] = [];
  const peringatan: GalatBaris[] = [];
  const hasil: BarisAlokasi[] = [];
  const nomor: number[] = [];
  if (baris.length === 0) return { baris: hasil, nomor, galat: [{ baris: 0, pesan: "Berkas tidak berisi baris alokasi." }], peringatan, dilewati: 0 };
  if (baris.length > MAKS_BARIS_ALOKASI) return { baris: hasil, nomor, galat: [{ baris: 0, pesan: `Berkas memuat ${baris.length} baris; batas satu unggahan ${MAKS_BARIS_ALOKASI}.` }], peringatan, dilewati: 0 };
  const kolom = petaKolomAlokasi(Object.keys(baris[0]));
  if (!kolom.kode) return { baris: hasil, nomor, galat: [{ baris: 1, pesan: `Kolom tidak ditemukan: ${LABEL.kode}. Unduh templat untuk melihat format.` }], peringatan, dilewati: 0 };
  const ambil = (b: Record<string, unknown>, m: Medan) => (kolom[m] ? teks(b[kolom[m] as string]) : "");
  const sudah = new Map<string, number>();
  let dilewati = 0;
  baris.forEach((b, i) => {
    const no = i + 2;
    if (Object.values(b).every((v) => teks(v) === "")) {
      dilewati++;
      return;
    }
    const masalah: string[] = [];
    const kode = bacaKodeSubsls(ambil(b, "kode"));
    if (!kode.ok) masalah.push(kode.pesan);
    const nks = ambil(b, "nks");
    if (nks.length > 40) masalah.push("NKS lebih dari 40 huruf.");
    let target: number | null = null;
    const t = ambil(b, "target");
    if (t !== "") {
      const n = Number(t.replace(",", "."));
      if (!Number.isInteger(n) || n < 0 || n > MAKS_TARGET) masalah.push(`${LABEL.target} "${t}" harus bilangan bulat 0-${MAKS_TARGET}.`);
      else target = n;
    }
    const ppl = ambil(b, "ppl");
    const pml = ambil(b, "pml");
    if ((ppl === "") !== (pml === "")) masalah.push(`Nama PPL dan Nama PML harus diisi berpasangan (${ppl === "" ? "PPL" : "PML"} kosong).`);
    const korwil = ambil(b, "korwil");
    const supervisor = ambil(b, "supervisor");
    if (korwil.length > 200 || supervisor.length > 200 || ppl.length > 200 || pml.length > 200) masalah.push("Nama petugas lebih dari 200 huruf.");
    if (!ppl && (korwil || supervisor)) peringatan.push({ baris: no, pesan: "Nama Korwil/Supervisor diabaikan karena baris ini belum punya PPL dan PML." });
    if (!kode.ok || masalah.length > 0) {
      galat.push({ baris: no, pesan: masalah.join(" ") });
      return;
    }
    const pertama = sudah.get(kode.kode);
    if (pertama !== undefined) {
      galat.push({ baris: no, pesan: `Kode Sub SLS ${kode.kode} sudah ada di baris ${pertama}. Satu sub SLS hanya boleh satu baris per kegiatan.` });
      return;
    }
    sudah.set(kode.kode, no);
    nomor.push(no);
    hasil.push({
      idsubsls: kode.kode, nks: nks || null, target, ppl_nama: ppl, pml_nama: pml,
      ...(ppl && korwil ? { korwil_nama: korwil } : {}),
      ...(ppl && supervisor ? { supervisor_nama: supervisor } : {}),
      ...(ambil(b, "kecamatan") ? { kecamatan: ambil(b, "kecamatan") } : {}),
      ...(ambil(b, "nagari") ? { nagari: ambil(b, "nagari") } : {}),
      ...(ambil(b, "jorong") ? { jorong: ambil(b, "jorong") } : {}),
    });
  });
  return { baris: hasil, nomor, galat, peringatan, dilewati };
}

/**
 * Memeriksa baris terhadap master wilayah. Kode yang tidak ada di master = galat. Kecamatan/Nagari/Jorong pada berkas yang berbeda dari master = PERINGATAN
 * (kode sub SLS yang menentukan; nama pada berkas hanya pemeriksaan silang).
 */
export function periksaTerhadapMaster(baris: readonly BarisAlokasi[], nomor: readonly number[], master: ReadonlyMap<string, WilayahMaster>): { galat: GalatBaris[]; peringatan: GalatBaris[] } {
  const galat: GalatBaris[] = [];
  const peringatan: GalatBaris[] = [];
  baris.forEach((b, i) => {
    const no = nomor[i] ?? i + 2;
    const m = master.get(b.idsubsls);
    if (!m) {
      galat.push({ baris: no, pesan: `Kode Sub SLS ${b.idsubsls} tidak ada di master wilayah Kab. Solok.` });
      return;
    }
    const beda: string[] = [];
    if (b.kecamatan && normNama(b.kecamatan) !== normNama(m.kecamatan)) beda.push(`kecamatan "${b.kecamatan}" (master: ${m.kecamatan})`);
    if (b.nagari && normNama(b.nagari) !== normNama(m.nagari)) beda.push(`nagari "${b.nagari}" (master: ${m.nagari})`);
    if (b.jorong && !normNama(m.sls).includes(normNama(b.jorong)) && !normNama(b.jorong).includes(normNama(m.sls))) beda.push(`jorong "${b.jorong}" (master: ${m.sls})`);
    if (beda.length > 0) peringatan.push({ baris: no, pesan: `Nama wilayah pada berkas berbeda dari master untuk kode ${b.idsubsls}: ${beda.join("; ")}. Kode Sub SLS yang dipakai.` });
  });
  return { galat, peringatan };
}

export type KandidatPetugas = { ppl: readonly Kandidat[]; pml: readonly Kandidat[]; korwil: readonly Kandidat[]; supervisor: readonly Kandidat[] };
export type HasilCocokAlokasi = {
  final: BarisAlokasiCocok[];
  galat: GalatBaris[];
  pemetaan: Pemetaan[];
  pemetaan_atasan: PemetaanAtasan[];
  tim: SusunanTim;
};

/**
 * Mencocokkan nama PPL/PML/korwil/supervisor ke akun dan menyusun susunan tim. Baris tanpa PPL/PML (alokasi dini) lolos tanpa petugas. Memakai ulang
 * `cocokkanAtasan` dan `cocokkanPetugasSampel` dengan baris "semu" (nama_responden diisi NKS) supaya aturan pencocokan nama sama persis dengan mesin sampel.
 */
export function cocokkanAlokasi(
  baris: readonly BarisAlokasi[], nomor: readonly number[], kand: KandidatPetugas, sumber: "akun" | "penugasan", namaAkun: ReadonlyMap<number, string>,
): HasilCocokAlokasi {
  type Semu = BarisSampel & { _i: number };
  const semu: Semu[] = [];
  const nomorSemu: number[] = [];
  baris.forEach((b, i) => {
    if (!b.ppl_nama) return;
    semu.push({
      kode_wilayah: b.idsubsls, kode_sls: b.idsubsls.slice(0, 14), nama_responden: b.nks ?? b.idsubsls, anggota_lain: null, status: "utama", lat: null, lng: null,
      ppl_nama: b.ppl_nama, pml_nama: b.pml_nama,
      ...(b.korwil_nama ? { korwil_nama: b.korwil_nama } : {}),
      ...(b.supervisor_nama ? { supervisor_nama: b.supervisor_nama } : {}),
      _i: i,
    });
    nomorSemu.push(nomor[i] ?? i + 2);
  });
  const atasan = cocokkanAtasan(semu, kand.korwil, kand.supervisor, nomorSemu, sumber);
  const cocok = cocokkanPetugasSampel(atasan.baris, kand.ppl, kand.pml, nomorSemu);
  const idDariIndeks = new Map<number, { ppl: number; pml: number }>();
  for (const c of cocok.cocok) idDariIndeks.set(c._i, { ppl: c.ppl_akun_id, pml: c.pml_akun_id });
  const nama = new Map<number, string>(namaAkun);
  for (const k of [...kand.ppl, ...kand.pml, ...kand.korwil, ...kand.supervisor]) if (!nama.has(k.id)) nama.set(k.id, k.nama);
  const final: BarisAlokasiCocok[] = baris.map((b, i) => {
    const id = idDariIndeks.get(i);
    return { ...b, ppl_akun_id: id?.ppl ?? null, pml_akun_id: id?.pml ?? null };
  });
  const tim = susunTim(cocok.cocok, nama);
  return { final, galat: [...atasan.galat, ...cocok.galat].sort((a, b) => a.baris - b.baris), pemetaan: cocok.pemetaan, pemetaan_atasan: atasan.pemetaan, tim };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Ringkasan dan tampilan
// ---------------------------------------------------------------------------------------------------------------------------------

export type RekapAlokasi = { subsls: number; nks: number; ppl: number; pml: number; target_total: number; tanpa_petugas: number; tanpa_target: number };

export function rekapAlokasi(baris: readonly BarisAlokasiCocok[], targetBawaan: number): RekapAlokasi {
  return {
    subsls: baris.length,
    nks: new Set(baris.map((b) => b.nks).filter((x): x is string => !!x)).size,
    ppl: new Set(baris.map((b) => b.ppl_akun_id).filter((x): x is number => x != null)).size,
    pml: new Set(baris.map((b) => b.pml_akun_id).filter((x): x is number => x != null)).size,
    target_total: baris.reduce((s, b) => s + (b.target ?? targetBawaan), 0),
    tanpa_petugas: baris.filter((b) => b.ppl_akun_id == null).length,
    tanpa_target: baris.filter((b) => b.target == null).length,
  };
}

/** Peringatan alokasi (tidak menolak): sub SLS tanpa petugas, PPL > maks sub SLS, PPL di bawah >1 PML, sub SLS tanpa KK di master. */
export function periksaAlokasiWilayah(
  baris: readonly BarisAlokasiCocok[], maksPerPpl: number, jumlahKk: ReadonlyMap<string, number>, namaAkun: ReadonlyMap<number, string>,
): string[] {
  const out: string[] = [];
  const tanpa = baris.filter((b) => b.ppl_akun_id == null).length;
  if (tanpa > 0 && tanpa < baris.length) out.push(`${tanpa} dari ${baris.length} sub SLS belum punya PPL/PML.`);
  const perPpl = new Map<number, { sls: Set<string>; pml: Set<number> }>();
  for (const b of baris) {
    if (b.ppl_akun_id == null || b.pml_akun_id == null) continue;
    const p = perPpl.get(b.ppl_akun_id) ?? { sls: new Set<string>(), pml: new Set<number>() };
    p.sls.add(b.idsubsls);
    p.pml.add(b.pml_akun_id);
    perPpl.set(b.ppl_akun_id, p);
  }
  const nama = (id: number) => namaAkun.get(id) ?? `akun ${id}`;
  const lebih = Array.from(perPpl).filter(([, p]) => p.sls.size > maksPerPpl);
  if (lebih.length > 0) out.push(`${lebih.length} PPL memegang lebih dari ${maksPerPpl} sub SLS: ${lebih.slice(0, 5).map(([id, p]) => `${nama(id)} (${p.sls.size})`).join(", ")}${lebih.length > 5 ? ", ..." : ""}.`);
  const pindah = Array.from(perPpl).filter(([, p]) => p.pml.size > 1);
  if (pindah.length > 0) out.push(`${pindah.length} PPL tercatat di bawah lebih dari satu PML: ${pindah.slice(0, 5).map(([id]) => nama(id)).join(", ")}${pindah.length > 5 ? ", ..." : ""}.`);
  const kosong = baris.filter((b) => (jumlahKk.get(b.idsubsls) ?? 0) === 0);
  if (kosong.length > 0) out.push(`${kosong.length} sub SLS belum punya daftar KK di master: ${kosong.slice(0, 5).map((b) => b.idsubsls).join(", ")}${kosong.length > 5 ? ", ..." : ""}. Sampel tidak dapat ditandai di sana sebelum daftar KK diisi.`);
  const kurang = baris.filter((b) => b.target != null && (jumlahKk.get(b.idsubsls) ?? 0) > 0 && (jumlahKk.get(b.idsubsls) as number) < (b.target as number));
  if (kurang.length > 0) out.push(`${kurang.length} sub SLS punya KK lebih sedikit daripada target sampel: ${kurang.slice(0, 5).map((b) => `${b.idsubsls} (${jumlahKk.get(b.idsubsls)} KK, target ${b.target})`).join(", ")}.`);
  return out;
}

export const kodeSubslsPendek = (kode: string): string => (kode.length > 8 ? `…${kode.slice(-8)}` : kode);

/** Isi templat Excel (judul kolom + contoh) untuk `aoa_to_sheet`. Kolom Kode Sub SLS berupa teks agar angka 16 digit tidak berubah menjadi notasi ilmiah. */
export function templatAlokasi(): string[][] {
  return [
    [...KOLOM_TEMPLAT_ALOKASI],
    ["KUBUNG", "GANTUANG CIRI", "JORONG BARINGIN", "1303110005000101", "0001A", "10", "Nama PPL (nama akun)", "Nama PML (nama akun)", "Nama Korwil (boleh kosong)", "Nama Supervisor (boleh kosong)"],
    ["KUBUNG", "GANTUANG CIRI", "JORONG BARINGIN", "1303110005000102", "0001A", "10", "Nama PPL (nama akun)", "Nama PML (nama akun)", "", ""],
  ];
}
export const PETUNJUK_TEMPLAT_ALOKASI = [
  "Satu baris = satu Sub SLS. Kode Sub SLS (16 digit) ditulis sebagai TEKS; kode inilah yang menentukan wilayah. NKS hanya penanda dan boleh sama pada beberapa baris.",
  "Kecamatan, Nagari, dan Jorong boleh dikosongkan; bila diisi, hanya dipakai untuk memeriksa kecocokan dengan master wilayah (beda nama = peringatan).",
  "Jumlah KK Sampel Stage 2 boleh dikosongkan (dipakai target bawaan kegiatan).",
  "Nama PPL dan Nama PML boleh dikosongkan BERPASANGAN (alokasi dini); isi keduanya bila petugas sudah ada. Nama harus sama dengan nama akun SIGAP (gelar di belakang koma boleh dihilangkan).",
  "Nama Korwil dan Nama Supervisor boleh dikosongkan; bila diisi, atasan PML dan atasan korwil ikut tersimpan sebagai susunan tim kegiatan.",
  "Baris contoh pada lembar Templat harus dihapus sebelum diunggah. Unggah ulang MENGGANTIKAN alokasi aktif (riwayat tetap tercatat).",
];

// ---------------------------------------------------------------------------------------------------------------------------------
// Bentuk data layar
// ---------------------------------------------------------------------------------------------------------------------------------

/** Satu sub SLS beralokasi seperti dibaca dari basis data. */
export type WilayahAlokasi = {
  id: number;
  idsubsls: string;
  nks: string | null;
  /** sudah diterapkan target bawaan bila kosong */
  target: number;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  kd_kec: string;
  ppl_akun_id: number | null;
  pml_akun_id: number | null;
  ppl_nama: string | null;
  pml_nama: string | null;
  jumlah_kk: number;
  /** rekap tag sampel (stage 2); hanya ada pada data HP sesudah migrasi 20261107f */
  tag?: { utama: number; cadangan: number; hasil: number };
};

/** KK master seperti dikirim ke HP petugas sub SLS terkait. */
export type KkMaster = { id: number; nama_kk: string; anggota_lain: string | null; patokan: string | null; lat: number | null; lng: number | null };

export type KonfigAlokasi = { target_per_sls: number; maks_sls_per_ppl: number; dengan_updating: boolean; /** jatah sampel cadangan per sub SLS (0 = tanpa cadangan); migrasi 20261107f */ cadangan_per_sls: number };

export type RiwayatAlokasi = { id: number; nama_berkas: string | null; diunggah_at: string; oleh: string | null; jumlah: number; dengan_petugas: number; aktif: boolean };

export type DataAlokasiAdmin = {
  sekarang: string;
  kegiatan: { id: number; nama: string };
  boleh_kelola: boolean;
  /** false = migrasi belum dijalankan */
  siap: boolean;
  konfig: KonfigAlokasi;
  rekap: RekapAlokasi;
  wilayah: WilayahAlokasi[];
  riwayat: RiwayatAlokasi[];
  petugas: { ppl: number; pml: number };
};

export type DataAlokasiSaya = {
  sekarang: string;
  kegiatan: { id: number; nama: string };
  peran: "ppl" | "pml";
  saya: { id: number; nama: string };
  konfig: KonfigAlokasi;
  wilayah: WilayahAlokasi[];
  /** status jendela rilis sampel tahap 2; tidak ada pada salinan lama di HP */
  jendela?: InfoJendela;
};

export const LABEL_MODEL: Record<"dengan" | "tanpa", { judul: string; ket: string }> = {
  dengan: { judul: "Dengan updating", ket: "Stage 1: updating riil dilakukan petugas. Stage 2: tag sampel utama dan cadangan setelah updating." },
  tanpa: { judul: "Tanpa updating", ket: "Updating riil tidak dilakukan. Prinsipnya tetap dua stage, tetapi admin langsung ke stage 2: tag sampel utama dan cadangan dari daftar KK master." },
};
