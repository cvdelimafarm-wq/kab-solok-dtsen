// lib/keu/selisihLanjutan.ts  (murni; tanpa React/DB)
//
// (5 Nov 2026) Mengurangi atau mengubah jumlah petugas pada Identifikasi lanjutan dengan aman:
//   * Hapus nama   = mengosongkan slot (nama dan tautan akun hilang, slot tetap ada dan kembali "menyusul"); jabatan yang dipegang ikut dilepas.
//   * Hapus alokasi = hanya untuk slot yang sudah kosong: slot dihapus dan jumlah per peran berkurang satu.
//   * Mengetik jumlah per peran yang lebih kecil dari jumlah slot ditolak (dan diarahkan ke slot), supaya nama tidak hilang tanpa disengaja.
//   * Selisih antara dua isi (mis. rancangan dan versi yang dipakai hilir) diringkas menjadi dampak per area hilir untuk dialog "Simpan saja / Simpan dan terapkan".
// Berkas ini tidak mengubah bentuk data yang disimpan.

import type { Form } from "./identifikasi";
import type { IsiKebijakan } from "./kebijakan";
import { namaJabatan, type KodeJabatan } from "./kebijakan";
import {
  KODE_PERAN, NAMA_PERAN, awalLanjutan, jumlahRincian, pesertaKelas, rincianBiaya,
  type IsiLanjutan, type KodePeran, type Petugas,
} from "./lanjutan";

export type StatusPetugas = Petugas["status"];

/** Slot kosong = belum ada nama. Hanya slot kosong yang boleh dihapus alokasinya. */
export const slotKosong = (p: Pick<Petugas, "nama">): boolean => p.nama.trim() === "";

/** Jumlah slot (baris petugas) pada satu peran dan status, bernama maupun kosong. */
export const jumlahSlot = (isi: IsiLanjutan, kode: KodePeran, status: StatusPetugas): number =>
  isi.petugas.filter((p) => p.peran === kode && p.status === status).length;

/** Jumlah slot yang sudah bernama. */
export const jumlahBernama = (isi: IsiLanjutan, kode: KodePeran, status: StatusPetugas): number =>
  isi.petugas.filter((p) => p.peran === kode && p.status === status && !slotKosong(p)).length;

/**
 * Menurunkan jumlah per peran hanya boleh sampai sebanyak slot yang ada. Di bawah itu, pengguna harus memilih slot yang dihapus
 * (kosongkan nama, lalu Hapus alokasi). Menaikkan selalu boleh.
 */
export const bolehTurunkanJumlah = (isi: IsiLanjutan, kode: KodePeran, status: StatusPetugas, nilaiBaru: number): boolean =>
  nilaiBaru >= jumlahSlot(isi, kode, status);

/** Hapus nama: slot dikosongkan (menyusul), tautan akun dan penanda baru dilepas, jabatan dilepas. Mengubah `g` langsung. */
export function hapusNama(g: IsiLanjutan, id: string): { ada: boolean; jabatanDilepas: KodeJabatan[] } {
  const p = g.petugas.find((e) => e.id === id);
  if (!p) return { ada: false, jabatanDilepas: [] };
  const lepas = [...p.jabatan];
  p.nama = ""; p.menyusul = true; p.baru = false; p.jabatan = [];
  delete p.akun;
  return { ada: true, jabatanDilepas: lepas };
}

/**
 * Hapus alokasi: hanya untuk slot kosong. Slot dihapus; jumlah organik atau mitra pada peran itu berkurang satu, kecuali bila jumlah slot memang
 * sudah melebihi jumlah yang dialokasikan (kelebihan slot dibuang tanpa mengurangi alokasi). Mengubah `g` langsung; true bila dihapus.
 */
export function hapusAlokasi(g: IsiLanjutan, id: string): boolean {
  const p = g.petugas.find((e) => e.id === id);
  if (!p || !slotKosong(p)) return false;
  const sebelum = p.peran === "" ? 0 : jumlahSlot(g, p.peran, p.status);
  g.petugas = g.petugas.filter((e) => e.id !== id);
  if (p.peran !== "") {
    const x = g.peran[p.peran];
    const f = p.status === "Mitra" ? "nMit" : "nOrg";
    if (x && sebelum <= x[f]) x[f] = Math.max(0, x[f] - 1);
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// Selisih dua isi
// ---------------------------------------------------------------------------------------------------------------------
export type SelisihPeran = { kode: KodePeran; nama: string; dariOrg: number; dariMit: number; keOrg: number; keMit: number };

const angkaPeran = (isi: IsiLanjutan, k: KodePeran): { org: number; mit: number } => {
  const x = isi.peran[k];
  return x?.on ? { org: x.nOrg, mit: x.nMit } : { org: 0, mit: 0 };
};

/** Peran yang jumlah organik atau mitranya berbeda (peran yang tidak dipakai dihitung 0). */
export function bandingPeran(dari: IsiLanjutan, ke: IsiLanjutan): SelisihPeran[] {
  const out: SelisihPeran[] = [];
  for (const k of KODE_PERAN) {
    const a = angkaPeran(dari, k); const b = angkaPeran(ke, k);
    if (a.org !== b.org || a.mit !== b.mit) out.push({ kode: k, nama: NAMA_PERAN[k], dariOrg: a.org, dariMit: a.mit, keOrg: b.org, keMit: b.mit });
  }
  return out;
}

/** Teks ringkas satu selisih peran: "PPL 15 → 14 (mitra 15 → 14)". */
export function teksSelisihPeran(s: SelisihPeran): string {
  const total = (o: number, m: number) => o + m;
  const bagian: string[] = [];
  if (s.dariOrg !== s.keOrg) bagian.push(`organik ${s.dariOrg} → ${s.keOrg}`);
  if (s.dariMit !== s.keMit) bagian.push(`mitra ${s.dariMit} → ${s.keMit}`);
  return `${s.nama} ${total(s.dariOrg, s.dariMit)} → ${total(s.keOrg, s.keMit)} (${bagian.join(", ")})`;
}

/** Selisih terhadap identifikasi awal (tanpa awal atau tanpa tahun = kosong). Dipakai untuk peringatan di atas tabel. */
export function selisihDariAwal(isi: IsiLanjutan, form: Form | null, tahun: number | null): SelisihPeran[] {
  if (!form || tahun === null) return [];
  return bandingPeran(awalLanjutan(form, tahun), isi);
}

export type Dampak = { kunci: "alokasi" | "rekrutmen" | "anggaran" | "pengadaan"; judul: string; butir: string[] };

const rp = (n: number): string => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const jumlahMitra = (isi: IsiLanjutan): number => KODE_PERAN.reduce((s, k) => s + angkaPeran(isi, k).mit, 0);

/**
 * Dampak perubahan `dari` -> `ke` pada area yang dibaca modul hilir. Hanya area yang benar-benar berubah yang dimuat.
 * Anggaran: selisih jumlah baris rincian yang sudah terhitung (baris tanpa tarif tidak ikut); pagu tidak dihitung atau diubah di sini.
 */
export function dampakSelisih(dari: IsiLanjutan, ke: IsiLanjutan, form: Form | null, lembar: IsiKebijakan | null): Dampak[] {
  const out: Dampak[] = [];
  const peran = bandingPeran(dari, ke);
  if (peran.length > 0) {
    out.push({
      kunci: "alokasi", judul: "Alokasi petugas, penugasan, surat tugas, dan Delego",
      butir: peran.map(teksSelisihPeran),
    });
  }
  const m0 = jumlahMitra(dari); const m1 = jumlahMitra(ke);
  if (m0 !== m1) out.push({ kunci: "rekrutmen", judul: "Kebutuhan rekrutmen mitra", butir: [`Kebutuhan mitra ${m0} → ${m1} orang.`] });

  const r0 = rincianBiaya(dari, form, lembar); const r1 = rincianBiaya(ke, form, lembar);
  const j0 = jumlahRincian(r0); const j1 = jumlahRincian(r1);
  const butirAng: string[] = [];
  if (Math.round(j0.total) !== Math.round(j1.total)) butirAng.push(`Rincian biaya terhitung ${rp(j0.total)} → ${rp(j1.total)}.`);
  const vol0 = new Map(r0.map((b) => [b.uraian, b.volume])); 
  const ubahVol: string[] = [];
  for (const b of r1) {
    if (!vol0.has(b.uraian)) { ubahVol.push(`${b.uraian}: baris baru`); continue; }
    const v0 = vol0.get(b.uraian) ?? null;
    if (v0 !== b.volume) ubahVol.push(`${b.uraian}: volume ${v0 === null ? "—" : v0.toLocaleString("id-ID")} → ${b.volume === null ? "—" : b.volume.toLocaleString("id-ID")} ${b.satuan}`);
  }
  for (const b of r0) if (!r1.some((x) => x.uraian === b.uraian)) ubahVol.push(`${b.uraian}: baris dihapus`);
  if (ubahVol.length > 0) butirAng.push(...ubahVol.slice(0, 6), ...(ubahVol.length > 6 ? [`dan ${ubahVol.length - 6} baris lain.`] : []));
  if (butirAng.length > 0) out.push({ kunci: "anggaran", judul: "Anggaran (rincian biaya dan RAB)", butir: [...butirAng, "Pagu tidak diubah otomatis; periksa selisihnya terhadap pagu."] });

  const butirPeng: string[] = [];
  for (const k of ke.kelas) {
    const lama = dari.kelas.find((e) => e.id === k.id);
    if (!lama) { butirPeng.push(`${k.nama || "Kelas"}: kelas baru (${pesertaKelas(ke, k)} peserta)`); continue; }
    const p0 = pesertaKelas(dari, lama); const p1 = pesertaKelas(ke, k);
    if (p0 !== p1) butirPeng.push(`${k.nama || "Kelas"}: peserta ${p0} → ${p1}`);
    if (lama.mulai !== k.mulai || lama.selesai !== k.selesai || lama.tempat !== k.tempat || lama.metode !== k.metode || lama.paket !== k.paket) butirPeng.push(`${k.nama || "Kelas"}: jadwal, tempat, atau paket berubah`);
  }
  for (const lama of dari.kelas) if (!ke.kelas.some((e) => e.id === lama.id)) butirPeng.push(`${lama.nama || "Kelas"}: kelas dihapus`);
  if (butirPeng.length > 0) out.push({ kunci: "pengadaan", judul: "Pengadaan dan paket kelas (briefing, pelatihan)", butir: butirPeng });
  return out;
}

/** Teks untuk jabatan yang terlepas saat nama dihapus ("Ketua, Wakil"). */
export const teksJabatan = (j: readonly KodeJabatan[]): string => j.map(namaJabatan).join(", ");
