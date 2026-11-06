// lib/keu/imporPetugas.ts
//
// (6 Nov 2026, permintaan Iqbal: "jika ini form induk, tambahkan impor dengan template") Impor daftar petugas Identifikasi lanjutan dari berkas template (xlsx/csv).
// MURNI (tanpa xlsx dan tanpa tampilan; pembacaan berkas ada di ImporPetugas.tsx). Aturan:
//   * Satu baris berkas = satu petugas: Nama, Peran, Status (Organik/Mitra), Sumber mitra.
//   * Nama dicocokkan ke daftar pegawai organik atau mitra; cocok tepat satu = tertaut ke akun SIGAP. Nama kembar atau di luar daftar tetap masuk tetapi TIDAK tertaut.
//   * Status boleh dikosongkan bila nama hanya ada di salah satu daftar.
//   * Baris menempati slot kosong (menyusul) pada peran dan status yang sama lebih dulu; bila tidak ada, baris baru ditambahkan dan jumlah per peran ikut naik.
//   * Tidak pernah menimpa nama yang sudah ada atau mengubah penugasan; nama yang sudah ada pada peran dan status yang sama dilewati.

import { KODE_PERAN, NAMA_PERAN, NAMA_SUMBER, idBaru, type IsiLanjutan, type KodePeran, type Petugas, type SumberMitra } from "./lanjutan";
import { adaDiDaftar, cariAkunUnik, type CalonNama } from "./pilihNama";
import { jumlahSlot, slotKosong } from "./selisihLanjutan";

const pangkas = (s: string): string => s.replace(/\s+/g, " ").trim();
const kunci = (s: string): string => pangkas(s).toLocaleLowerCase("id");
const lunak = (s: string): string => s.toLocaleLowerCase("id").replace(/[^\p{L}\p{N}]+/gu, "");

export const KOLOM_TEMPLATE = ["Nama", "Peran", "Status", "Sumber mitra"] as const;
export const MAKS_BARIS_IMPOR = 500;
export const MAKS_PETUGAS = 3000;
export const MAKS_NAMA = 120;

export type BarisMentah = { baris: number; nama: string; peran: string; status: string; sumber: string };
export type Tindakan = "isi_slot" | "tambah" | "lewati";
export type HasilBaris = {
  /** nomor baris pada berkas (baris judul = 1) */
  baris: number;
  nama: string; peran: KodePeran | ""; status: "Organik" | "Mitra" | ""; sumber: SumberMitra;
  akun?: number; tertaut: boolean;
  tindakan: Tindakan;
  /** alasan dilewati (bila tindakan = lewati) */
  alasan: string;
  /** hal yang perlu diketahui meski baris tetap masuk */
  catatan: string[];
};
export type RingkasImpor = { masuk: number; isiSlot: number; tambah: number; lewati: number; tertaut: number; takTertaut: number };

// ---------------------------------------------------------------------------------------------------------------------
// Membaca tabel mentah
// ---------------------------------------------------------------------------------------------------------------------
const NAMA_KOLOM: Record<string, "nama" | "peran" | "status" | "sumber"> = {
  nama: "nama", namapetugas: "nama", peran: "peran", jabatan: "peran", status: "status", statuspetugas: "status", sumber: "sumber", sumbermitra: "sumber",
};

/** Tabel (baris demi baris, semua sel berupa teks) menjadi baris mentah. Baris judul dicari pada 15 baris pertama (harus memuat Nama dan Peran). Baris tanpa nama (slot template yang belum diisi) dilewati dan dihitung dalam `tanpaNama`. */
export function barisDariTabel(tabel: readonly (readonly unknown[])[]): { baris: BarisMentah[]; galat: string | null; tanpaNama: number } {
  const teks = (x: unknown): string => (x === null || x === undefined ? "" : String(x));
  let judul = -1; let peta: Partial<Record<"nama" | "peran" | "status" | "sumber", number>> = {};
  for (let i = 0; i < Math.min(tabel.length, 15); i++) {
    const m: typeof peta = {};
    tabel[i].forEach((sel, j) => { const k = NAMA_KOLOM[lunak(teks(sel))]; if (k && m[k] === undefined) m[k] = j; });
    if (m.nama !== undefined && m.peran !== undefined) { judul = i; peta = m; break; }
  }
  if (judul < 0) return { baris: [], tanpaNama: 0, galat: "Baris judul tidak ditemukan. Gunakan template dari tombol Unduh template (kolom Nama dan Peran wajib ada)." };
  const baris: BarisMentah[] = []; let tanpaNama = 0;
  for (let i = judul + 1; i < tabel.length; i++) {
    const r = tabel[i];
    const ambil = (k: "nama" | "peran" | "status" | "sumber"): string => (peta[k] === undefined ? "" : pangkas(teks(r[peta[k] as number])));
    const nama = ambil("nama"); const peran = ambil("peran"); const status = ambil("status"); const sumber = ambil("sumber");
    if (nama === "" && peran === "" && status === "" && sumber === "") continue; // baris kosong
    if (nama.startsWith("#")) continue; // baris catatan
    if (nama === "") { tanpaNama += 1; continue; } // mis. baris slot template yang namanya belum diisi: dilewati tanpa galat
    baris.push({ baris: i + 1, nama, peran, status, sumber });
  }
  return { baris, galat: null, tanpaNama };
}

// ---------------------------------------------------------------------------------------------------------------------
// Memahami isian
// ---------------------------------------------------------------------------------------------------------------------
const ALIAS_PERAN: Record<string, KodePeran> = { korwil: "kortim", koordinatorwilayah: "kortim", ketuatimlapangan: "kortim", petugasentri: "entri", operatorentri: "entri" };

export function pahamiPeran(s: string): KodePeran | null {
  const k = lunak(s);
  if (k === "") return null;
  for (const kode of KODE_PERAN) if (k === lunak(kode) || k === lunak(NAMA_PERAN[kode])) return kode;
  return ALIAS_PERAN[k] ?? null;
}
export function pahamiStatus(s: string): "Organik" | "Mitra" | "" | null {
  const k = lunak(s);
  if (k === "") return "";
  if (["organik", "pegawai", "pegawaiorganik", "asn", "pns"].includes(k)) return "Organik";
  if (["mitra", "mitrastatistik", "mitrakepka"].includes(k)) return "Mitra";
  return null;
}
export function pahamiSumber(s: string): SumberMitra | null {
  const k = lunak(s);
  if (k === "") return "";
  if (["kepka", "langsung", "langsungdarikepka"].includes(k)) return "kepka";
  if (["seleksi", "lewatseleksi"].includes(k)) return "seleksi";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rencana impor (pratinjau; tidak mengubah apa pun)
// ---------------------------------------------------------------------------------------------------------------------
export function rencanaImpor(
  isi: IsiLanjutan, baris: readonly BarisMentah[], organik: readonly CalonNama[] | null | undefined, mitra: readonly CalonNama[] | null | undefined,
): { hasil: HasilBaris[]; ringkas: RingkasImpor; galat: string | null } {
  const kosongRingkas: RingkasImpor = { masuk: 0, isiSlot: 0, tambah: 0, lewati: 0, tertaut: 0, takTertaut: 0 };
  if (baris.length === 0) return { hasil: [], ringkas: kosongRingkas, galat: "Tidak ada baris petugas pada berkas." };
  if (baris.length > MAKS_BARIS_IMPOR) return { hasil: [], ringkas: kosongRingkas, galat: `Terlalu banyak baris (${baris.length}); batas ${MAKS_BARIS_IMPOR} baris per impor.` };

  const org = organik ?? []; const mit = mitra ?? [];
  const terpakai = new Set<string>(); // peran|status|nama
  const slotLuang = new Map<string, number>(); // peran|status -> slot kosong yang tersisa
  for (const p of isi.petugas) {
    if (p.peran === "") continue;
    const kp = `${p.peran}|${p.status}`;
    if (slotKosong(p)) slotLuang.set(kp, (slotLuang.get(kp) ?? 0) + 1);
    else terpakai.add(`${kp}|${kunci(p.nama)}`);
  }
  let totalBaru = isi.petugas.length;

  const hasil: HasilBaris[] = baris.map((b) => {
    const dasar: HasilBaris = { baris: b.baris, nama: pangkas(b.nama), peran: "", status: "", sumber: "", tertaut: false, tindakan: "lewati", alasan: "", catatan: [] };
    const lewati = (alasan: string): HasilBaris => ({ ...dasar, alasan });
    if (dasar.nama === "") return lewati("Nama kosong.");
    if (dasar.nama.length > MAKS_NAMA) return lewati(`Nama lebih dari ${MAKS_NAMA} huruf.`);
    const peran = pahamiPeran(b.peran);
    if (peran === null) return lewati(b.peran === "" ? "Peran kosong." : `Peran “${b.peran}” tidak dikenal (pilihan: Supervisor, Kortim, PML, PPL, Petugas entri).`);
    let status = pahamiStatus(b.status);
    if (status === null) return lewati(`Status “${b.status}” tidak dikenal (isi Organik atau Mitra).`);
    if (status === "") {
      const dO = adaDiDaftar(org, dasar.nama); const dM = adaDiDaftar(mit, dasar.nama);
      if (dO && !dM) status = "Organik";
      else if (dM && !dO) status = "Mitra";
      else if (dO && dM) return lewati("Nama ada di daftar organik dan mitra; isi kolom Status.");
      else return lewati("Status kosong dan nama tidak ada di daftar organik maupun mitra; isi kolom Status.");
    }
    const sumberDipahami = pahamiSumber(b.sumber);
    if (sumberDipahami === null) return lewati(`Sumber mitra “${b.sumber}” tidak dikenal (isi Langsung dari kepka atau Lewat seleksi).`);

    const catatan: string[] = [];
    let sumber: SumberMitra = "";
    if (status === "Mitra") {
      sumber = sumberDipahami === "" ? "kepka" : sumberDipahami;
      if (sumberDipahami === "") catatan.push(`Sumber mitra kosong, dipakai “${NAMA_SUMBER.kepka}” (bawaan).`);
    } else if (sumberDipahami !== "") catatan.push("Sumber mitra diabaikan karena status Organik.");

    const kp = `${peran}|${status}`;
    if (terpakai.has(`${kp}|${kunci(dasar.nama)}`)) return lewati(`${dasar.nama} sudah ada sebagai ${NAMA_PERAN[peran]} ${status.toLowerCase()}.`);

    const daftar = status === "Mitra" ? mit : org;
    const akun = cariAkunUnik(daftar, dasar.nama);
    if (akun === null) {
      catatan.push(adaDiDaftar(daftar, dasar.nama)
        ? "Nama kembar pada daftar; tidak tertaut otomatis (pilih manual pada tabel)."
        : `Nama tidak ada pada daftar ${status === "Mitra" ? "mitra" : "pegawai organik"}; masuk sebagai nama di luar daftar (tidak tertaut).`);
    }

    const sisa = slotLuang.get(kp) ?? 0;
    let tindakan: Tindakan = "isi_slot";
    if (sisa > 0) slotLuang.set(kp, sisa - 1);
    else {
      if (totalBaru >= MAKS_PETUGAS) return lewati(`Jumlah baris petugas sudah mencapai batas ${MAKS_PETUGAS}.`);
      totalBaru += 1; tindakan = "tambah";
    }
    terpakai.add(`${kp}|${kunci(dasar.nama)}`);
    return { ...dasar, peran, status, sumber, ...(akun !== null ? { akun } : {}), tertaut: akun !== null, tindakan, catatan };
  });

  const ringkas = hasil.reduce<RingkasImpor>((r, h) => {
    if (h.tindakan === "lewati") return { ...r, lewati: r.lewati + 1 };
    return { ...r, masuk: r.masuk + 1, isiSlot: r.isiSlot + (h.tindakan === "isi_slot" ? 1 : 0), tambah: r.tambah + (h.tindakan === "tambah" ? 1 : 0), tertaut: r.tertaut + (h.tertaut ? 1 : 0), takTertaut: r.takTertaut + (h.tertaut ? 0 : 1) };
  }, { ...kosongRingkas });
  return { hasil, ringkas, galat: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Menerapkan (mengubah `g`)
// ---------------------------------------------------------------------------------------------------------------------
/** Menerapkan baris yang tidak dilewati. Slot kosong (peran dan status sama) diisi lebih dulu; selebihnya baris baru, dan jumlah per peran naik sebanyak baris baru
 *  (peran yang tidak dipakai diaktifkan). Mengembalikan peran yang baru diaktifkan. */
export function terapkanImpor(g: IsiLanjutan, hasil: readonly HasilBaris[]): { diisi: number; ditambah: number; peranDiaktifkan: KodePeran[] } {
  let diisi = 0; let ditambah = 0; const aktif = new Set<KodePeran>();
  for (const h of hasil) {
    if (h.tindakan === "lewati" || h.peran === "" || h.status === "") continue;
    const slot = g.petugas.find((p) => p.peran === h.peran && p.status === h.status && slotKosong(p));
    const isiPetugas = (p: Petugas) => {
      p.nama = h.nama; p.menyusul = false; p.baru = false;
      p.sumber = h.status === "Mitra" ? h.sumber : "";
      if (h.akun !== undefined) p.akun = h.akun; else delete p.akun;
    };
    if (slot) { isiPetugas(slot); diisi += 1; continue; }
    const baru: Petugas = { id: idBaru("p", g.petugas.map((p) => p.id)), nama: "", menyusul: true, peran: h.peran, status: h.status, sumber: "", baru: false, jabatan: [] };
    isiPetugas(baru);
    g.petugas.push(baru);
    ditambah += 1;
    const x = g.peran[h.peran];
    if (!x.on) { x.on = true; aktif.add(h.peran); }
    const f = h.status === "Mitra" ? "nMit" : "nOrg";
    const slotSekarang = jumlahSlot(g, h.peran, h.status);
    if (x[f] < slotSekarang) x[f] = slotSekarang;
  }
  return { diisi, ditambah, peranDiaktifkan: [...aktif] };
}

// ---------------------------------------------------------------------------------------------------------------------
// Isi template
// ---------------------------------------------------------------------------------------------------------------------
/** Lembar "Petugas": judul + satu baris untuk setiap slot kosong (peran dan status terisi, nama dikosongkan). */
export function barisTemplate(isi: IsiLanjutan): string[][] {
  const kosong = isi.petugas.filter((p) => slotKosong(p) && p.peran !== "");
  return [[...KOLOM_TEMPLATE], ...kosong.map((p) => [
    "", NAMA_PERAN[p.peran as KodePeran], p.status, p.status === "Mitra" ? NAMA_SUMBER[p.sumber === "" ? "kepka" : p.sumber] : "",
  ])];
}

export const BARIS_PETUNJUK: string[][] = [
  ["Petunjuk pengisian"],
  [""],
  ["1. Isi lembar “Petugas”: satu baris untuk satu petugas. Kolom Nama dan Peran wajib."],
  ["2. Peran: Supervisor, Kortim, PML, PPL, atau Petugas entri."],
  ["3. Status: Organik atau Mitra. Boleh dikosongkan bila nama hanya ada di salah satu daftar (lihat lembar “Daftar nama”)."],
  ["4. Sumber mitra (hanya untuk Mitra): Langsung dari kepka atau Lewat seleksi. Bila kosong dipakai Langsung dari kepka."],
  ["5. Tulis nama persis seperti pada lembar “Daftar nama” agar tertaut otomatis ke akun SIGAP. Nama kembar atau di luar daftar tetap masuk tetapi tidak tertaut."],
  ["6. Baris yang sudah terisi peran dan statusnya (dari slot yang masih kosong di SIGAP) tinggal diisi namanya."],
  ["7. Impor tidak menimpa nama yang sudah ada. Baris dimasukkan ke slot kosong lebih dulu; bila tidak ada slot, baris baru ditambahkan dan jumlah per peran ikut naik."],
  ["8. Baris yang kolom Nama-nya diawali tanda # dianggap catatan dan dilewati."],
];

export function barisDaftarNama(organik: readonly CalonNama[] | null | undefined, mitra: readonly CalonNama[] | null | undefined): string[][] {
  return [["Nama", "Status", "Keterangan"], ...(organik ?? []).map((c) => [c.nama, "Organik", c.ket]), ...(mitra ?? []).map((c) => [c.nama, "Mitra", c.ket])];
}
