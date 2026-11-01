// lib/vanguard/remedial.ts  (murni: tanpa DB/React)
//
// (1 Nov 2026) VANGUARD V4: "Latihan kesalahan saya" = saran kasus untuk mengulang kesalahan yang paling sering dibuat seorang petugas.
// Kemampuan sebuah kasus menimbulkan sebuah jenis kesalahan DITURUNKAN dari engine (bukan dari teks): konversi seminggu atau sebulan diuji dengan menyalin nilai kunci
// dibagi faktor, salah letak dengan memindahkan nilai kunci ke kotak kosong, jebakan dan nilai keliru khas dari data kasus, kontrol VII dan diskrepansi dari kasus lengkap.
// Urutan saran selalu sama untuk data yang sama (tanpa acak).

import { evaluate, F } from "./engine";
import { KASUS_PUBLIK } from "./kasus/daftar";
import { idSelKasus } from "./sel";
import { LABEL_JENIS } from "./dasbor";
import type { JenisKesalahan, Kasus, KasusPublik } from "./tipe";

export type Kelemahan = { jenis: JenisKesalahan; jumlah: number };
export type RiwayatKasus = { kasus: string; percobaan: number; benar: boolean; bintang: number };
export type Saran = { kasus: string; judul: string; alasan: string[]; skor: number };

const cache = new Map<string, Set<JenisKesalahan>>();

/** Jenis kesalahan yang dapat dilatih oleh kasus ini. */
export function kemampuanKasus(k: Kasus): Set<JenisKesalahan> {
  const hit = cache.get(k.kode);
  if (hit) return hit;
  const s = new Set<JenisKesalahan>();
  if (!k.bebas) {
    if (k.jebakan.length) s.add("jebakan");
    if (k.alternatif.length) s.add("alternatif");
    if (k.lengkap) { s.add("kontrol_vii"); s.add("diskrepansi"); }
    const ids = Object.keys(k.kunci);
    if (ids.length === 0) s.add("harus_kosong");
    const kosong = idSelKasus(k).filter((id) => !(id in k.kunci));
    for (const id of ids) {
      const e = k.kunci[id];
      s.add("belum_diisi"); s.add("angka_meleset");
      const ada = (vals: Record<string, number>, jenis: JenisKesalahan) => evaluate(k, vals).fb.some((f) => f.k === id && f.jenis === jenis);
      const minggu = Math.round(e / F), bulan = Math.round(e / 12);
      if (minggu !== e && ada({ ...k.kunci, [id]: minggu }, "konversi_seminggu")) s.add("konversi_seminggu");
      if (bulan !== e && ada({ ...k.kunci, [id]: bulan }, "konversi_sebulan")) s.add("konversi_sebulan");
      if (kosong.length > 0) {
        const tanpa = { ...k.kunci }; delete tanpa[id];
        if (ada({ ...tanpa, [kosong[0]]: e }, "salah_letak")) s.add("salah_letak");
      }
    }
  }
  cache.set(k.kode, s);
  return s;
}

export const MAKS_SARAN = 5;
const BOBOT = { belumBenar: 30, belumDicoba: 20, bintangRendah: 10 };

/**
 * Saran kasus. Skor = status (belum benar sesudah mencoba 30; belum pernah dicoba 20; benar tetapi bintang <= 1 10) + 10 x (jumlah kelemahan yang dilatih kasus ini / jumlah kelemahan teratas),
 * memakai sampai tiga kelemahan teratas. Kasus yang sudah benar dengan bintang >= 2 dan tidak melatih kelemahan apa pun tidak disarankan. Tanpa riwayat dan tanpa kelemahan = daftar kosong.
 */
export type PetaKemampuan = Record<string, JenisKesalahan[]>;
/** (V5b) Kemampuan semua kasus, dihitung di SERVER (butuh kunci) lalu dikirim ke layar petugas dalam bentuk daftar jenis saja, tanpa kunci. */
export function petaKemampuan(daftar: Kasus[]): PetaKemampuan {
  return Object.fromEntries(daftar.filter((k) => !k.bebas).map((k) => [k.kode, [...kemampuanKasus(k)].sort()]));
}

export function saranKasus(lemah: Kelemahan[], riwayat: RiwayatKasus[], kemampuan: PetaKemampuan, maks = MAKS_SARAN, daftar: KasusPublik[] = KASUS_PUBLIK): Saran[] {
  if (lemah.length === 0 && riwayat.length === 0) return [];
  const teratas = [...lemah].filter((x) => x.jumlah > 0).sort((a, b) => b.jumlah - a.jumlah || a.jenis.localeCompare(b.jenis)).slice(0, 3);
  const peta = new Map(riwayat.map((r) => [r.kasus, r]));
  const hasil: Saran[] = [];
  for (const k of daftar) {
    if (k.bebas) continue;
    const r = peta.get(k.kode);
    const alasan: string[] = [];
    let skor = 0;
    if (r && !r.benar) { skor += BOBOT.belumBenar; alasan.push("Belum benar"); }
    else if (!r) { skor += BOBOT.belumDicoba; alasan.push("Belum dicoba"); }
    else if (r.bintang <= 1) { skor += BOBOT.bintangRendah; alasan.push("Benar dengan bintang rendah"); }
    const mampu = new Set<JenisKesalahan>(kemampuan[k.kode] ?? []);
    const cocok = teratas.filter((t) => mampu.has(t.jenis));
    if (cocok.length > 0) {
      skor += (10 * cocok.length) / teratas.length;
      for (const c of cocok.slice(0, 2)) alasan.push(`Melatih: ${LABEL_JENIS[c.jenis]}`);
    }
    if (skor <= 0) continue;
    // kasus yang sudah dikerjakan hanya layak disarankan bila belum benar atau melatih kelemahan
    if (r && r.benar && cocok.length === 0) continue;
    hasil.push({ kasus: k.kode, judul: k.judul, alasan, skor: Math.round(skor * 10) / 10 });
  }
  return hasil.sort((a, b) => b.skor - a.skor || a.kasus.localeCompare(b.kasus)).slice(0, maks);
}
