// lib/vanguard/sertifikasi/dasbor.ts  (murni)
//
// (1 Nov 2026) VANGUARD V7i: angka dasbor Sertifikasi untuk BPS Kabupaten Solok (hanya baca): sebaran tingkat, daftar petugas bersertifikat, butir tersulit, jenis kesalahan teratas.
// Hanya ujian sertifikasi yang SELESAI dan bertingkat (bukan dibatalkan) yang menjadi sertifikat; latihan dihitung terpisah sebagai keaktifan.

import { statusKesegaran, type Kesegaran } from "../pembinaan/segar";
import { hitungStreak } from "../pembinaan/streak";

export type BarisUjian = { id: number; akun_id: number; jenis: "sertifikasi" | "latihan" | "harian" | "tantangan"; mulai_at: string; selesai_at: string | null; skor: number | string | null; tingkat: number | null };
export type BarisButir = { ujian_id: number; kasus: string; poin: number | null; jml_fatal: number | null; benar: boolean | null; jawab_at: string | null; rincian?: { jenis?: string; tingkat?: string }[] | null };

export type BarisPetugasSert = { akun: number; nama: string; tingkat: number | null; skor: number | null; sertifikasi: number; latihan: number; harian: number; terbaru: { tingkat: number; skor: number; selesai_at: string } | null; terakhir: string; kesegaran: Kesegaran["status"] | null; streak: number };
export type DasborSertifikasi = {
  ringkasan: { petugasBersertifikat: number; petugasAktif: number; ujianSertifikasiSelesai: number; latihanSelesai: number; harianSelesai: number; tantanganSelesai: number; perluDisegarkan: number; rataSkor: number | null; sebaran: Record<number, number> };
  petugas: BarisPetugasSert[];
  butirTersulit: { kasus: string; dijawab: number; rataPoin: number; persenBenar: number }[];
  kesalahanTeratas: { jenis: string; tingkat: string; jumlah: number }[];
};

const angka = (x: number | string | null): number | null => (x === null || x === undefined ? null : Number(x));
const bulat2 = (x: number) => Math.round(x * 100) / 100;

export function susunDasborSertifikasi(ujian: BarisUjian[], butir: BarisButir[], nama: Map<number, string>, sekarang: Date = new Date()): DasborSertifikasi {
  const sebaran: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const per = new Map<number, BarisPetugasSert>();
  const ambil = (akun: number): BarisPetugasSert => {
    let p = per.get(akun);
    if (!p) { p = { akun, nama: nama.get(akun) ?? `Akun ${akun}`, tingkat: null, skor: null, sertifikasi: 0, latihan: 0, harian: 0, terbaru: null, terakhir: "", kesegaran: null, streak: 0 }; per.set(akun, p); }
    return p;
  };
  let sertSelesai = 0, latSelesai = 0, harSelesai = 0, tanSelesai = 0, jumlahSkor = 0;
  const harianPer = new Map<number, string[]>();
  const sertIds = new Set<number>();
  for (const u of [...ujian].sort((a, b) => a.mulai_at.localeCompare(b.mulai_at))) {
    const p = ambil(u.akun_id);
    if (!p.terakhir || u.mulai_at > p.terakhir) p.terakhir = u.mulai_at;
    if (!u.selesai_at || u.tingkat === null) continue; // belum selesai atau dibatalkan
    if (u.jenis === "latihan") { p.latihan += 1; latSelesai += 1; continue; }
    if (u.jenis === "harian") { p.harian += 1; harSelesai += 1; harianPer.set(u.akun_id, [...(harianPer.get(u.akun_id) ?? []), u.selesai_at]); continue; }
    if (u.jenis === "tantangan") { tanSelesai += 1; continue; }
    const skor = angka(u.skor) ?? 0;
    p.sertifikasi += 1; sertSelesai += 1; jumlahSkor += skor; sertIds.add(u.id);
    if (!p.terbaru || u.selesai_at > p.terbaru.selesai_at) p.terbaru = { tingkat: u.tingkat, skor, selesai_at: u.selesai_at };
    if (p.tingkat === null || u.tingkat > p.tingkat || (u.tingkat === p.tingkat && skor > (p.skor ?? 0))) { p.tingkat = u.tingkat; p.skor = skor; }
  }
  const petugas = [...per.values()];
  for (const p of petugas) {
    if (p.tingkat !== null) sebaran[p.tingkat] += 1;
    if (p.terbaru) p.kesegaran = statusKesegaran(p.terbaru.selesai_at, sekarang).status;
    p.streak = hitungStreak(harianPer.get(p.akun) ?? [], sekarang).sekarang;
  }
  petugas.sort((a, b) => (b.tingkat ?? 0) - (a.tingkat ?? 0) || (b.skor ?? 0) - (a.skor ?? 0) || a.nama.localeCompare(b.nama));

  // butir tersulit: butir terjawab pada ujian sertifikasi maupun latihan (rata poin terendah dahulu; minimal 1 jawaban)
  const kasus = new Map<string, { n: number; poin: number; benar: number }>();
  const kes = new Map<string, number>();
  for (const b of butir) {
    if (!b.jawab_at) continue;
    const k = kasus.get(b.kasus) ?? { n: 0, poin: 0, benar: 0 };
    k.n += 1; k.poin += b.poin ?? 0; if (b.benar) k.benar += 1;
    kasus.set(b.kasus, k);
    for (const r of b.rincian ?? []) if (r?.jenis) { const kunci = `${r.jenis}|${r.tingkat ?? "berat"}`; kes.set(kunci, (kes.get(kunci) ?? 0) + 1); }
  }
  const butirTersulit = [...kasus].map(([kd, v]) => ({ kasus: kd, dijawab: v.n, rataPoin: bulat2(v.poin / v.n), persenBenar: bulat2((v.benar / v.n) * 100) }))
    .sort((a, b) => a.rataPoin - b.rataPoin || b.dijawab - a.dijawab || a.kasus.localeCompare(b.kasus));
  const kesalahanTeratas = [...kes].map(([k, jumlah]) => { const [jenis, tingkat] = k.split("|"); return { jenis, tingkat, jumlah }; }).sort((a, b) => b.jumlah - a.jumlah || a.jenis.localeCompare(b.jenis)).slice(0, 12);
  void sertIds;
  return {
    ringkasan: { petugasBersertifikat: petugas.filter((p) => p.tingkat !== null).length, petugasAktif: petugas.length, ujianSertifikasiSelesai: sertSelesai, latihanSelesai: latSelesai, harianSelesai: harSelesai, tantanganSelesai: tanSelesai, perluDisegarkan: petugas.filter((p) => p.kesegaran === "perlu").length, rataSkor: sertSelesai ? bulat2(jumlahSkor / sertSelesai) : null, sebaran },
    petugas, butirTersulit, kesalahanTeratas,
  };
}

export function csvSertifikasi(d: DasborSertifikasi, namaTingkat: Record<number, string>): string {
  const q = (s: string | number | null) => { const t = String(s ?? ""); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const baris = [["Nama", "Tingkat", "Nama tingkat", "Skor tertinggi", "Sertifikasi selesai", "Latihan selesai", "Latihan harian selesai", "Rangkaian harian", "Kesegaran", "Terakhir aktif"]];
  for (const p of d.petugas) baris.push([p.nama, p.tingkat === null ? "" : String(p.tingkat), p.tingkat === null ? "Belum bersertifikat" : namaTingkat[p.tingkat], p.skor === null ? "" : String(p.skor), String(p.sertifikasi), String(p.latihan), String(p.harian), String(p.streak), p.kesegaran ?? "", p.terakhir]);
  return baris.map((r) => r.map(q).join(",")).join("\n") + "\n";
}
