// lib/keu/rabSurvei.ts
//
// (28 Okt 2026) RAB per survei, tahap 1 (logika murni, tanpa React/DB). Dari rincian biaya identifikasi (lanjutan.ts: rincianBiaya) dibentuk RINCIAN RAB per survei:
//  - mode "periode": satu rincian per periode (mis. translok Susenas Maret dan Susenas September terpisah);
//  - mode "gabung": satu rincian untuk seluruh periode (volume dijumlahkan).
// Volume translok = orang x HARI DIBAYAR yang diisi manual (keputusan pengguna 28 Okt 2026: petugas bisa mendata 10 hari tetapi transloknya hanya dibayar 3 hari);
// hari dibayar tidak boleh melebihi HARI KERJA pendataan periode itu (Senin sampai Jumat tanpa hari libur; kalender libur dioper pemanggil, lib/keu/hariKerja.ts).
// Penginapan = orang x malam yang diisi sama (batas hari kerja - 1, cek aturan).
// Hari belum diisi = volume menyusul. Beberapa rincian (mis. translok PPL dan PML) boleh ditautkan ke SATU item POK: tautan dibuat per akun,
// dan hasil penautan memberi tahu bila item POK untuk akun itu belum ada atau namanya perlu diperbaiki (saran, bukan paksaan).

import type { BarisRincian } from "./lanjutan";
import type { ItemAnggaran } from "./ro";
import { NAMA_AKUN, selisihHari } from "./identifikasi";
import { hariKerjaAntara, type Libur } from "./hariKerja";

export type ModePecah = "periode" | "gabung";
export type PeriodeJadwal = { periode: string; mulai: string; selesai: string };
export type RincianSurvei = BarisRincian & { kunci: string; periode: string | null; hari: number | null; hariMaks?: number };

const akun6 = (a: string): string => a.slice(0, 6);
const TGL = /^\d{4}-\d{2}-\d{2}$/;

/** Jumlah hari kalender inklusif; 0 bila tanggal belum lengkap atau terbalik. */
export function hariJadwal(mulai: string, selesai: string): number {
  if (!TGL.test(mulai) || !TGL.test(selesai) || selesai < mulai) return 0;
  return selisihHari(selesai, mulai) + 1;
}

const adaPeriodeNama = (u: string, p: string[]): string | null => p.find((x) => x !== "Kegiatan" && u.includes(` ${x}`)) ?? null;
const lapangan = (b: BarisRincian) => b.kelompok === "Translok dan penginapan";
const jenisLap = (b: BarisRincian): "translok" | "penginapan" => (b.uraian.startsWith("Penginapan") ? "penginapan" : "translok");

/** Kunci isian hari dibayar: rincian asli (akun + uraian) dan periode. */
export const kunciHari = (b: Pick<BarisRincian, "akun" | "uraian">, periode: string): string => `${b.akun}|${b.uraian}|${periode}`;
export type HariBayar = Record<string, number>;

/** Pesan bila hari dibayar tidak sah (bukan bulat >= 0) atau melebihi batas hari pendataan; null bila sah. */
export function periksaHariBayar(hari: number, maks: number, penginapan = false): string | null {
  if (!Number.isInteger(hari) || hari < 0) return "Jumlah hari harus bilangan bulat, nol atau lebih.";
  const batas = penginapan ? Math.max(maks - 1, 0) : maks;
  if (maks > 0 && hari > batas) return `Melebihi ${penginapan ? "malam" : "hari kerja"} pendataan periode ini (maksimal ${batas}).`;
  return null;
}

function volLapangan(b: BarisRincian, p: PeriodeJadwal, hb: HariBayar, libur: Libur): { volume: number | null; hari: number | null; maks: number; catatan: string } {
  const maks = hariKerjaAntara(p.mulai, p.selesai, libur);
  const isi = hb[kunciHari(b, p.periode)];
  const pen = jenisLap(b) === "penginapan";
  if (typeof isi !== "number") return { volume: null, hari: null, maks, catatan: `Isi jumlah ${pen ? "malam" : "hari"} dibayar ${p.periode}${maks ? ` (maksimal ${pen ? Math.max(maks - 1, 0) : maks} hari kerja)` : ""}.` };
  const salah = periksaHariBayar(isi, maks, pen);
  if (salah) return { volume: null, hari: isi, maks, catatan: salah };
  if (b.volume === null) return { volume: null, hari: isi, maks, catatan: "Jumlah petugas belum diidentifikasi." };
  return { volume: b.volume * isi, hari: isi, maks, catatan: "" };
}

const beri = (b: BarisRincian, p: Partial<RincianSurvei> & { volume: number | null; uraian: string; satuan: string; catatan: string }): Omit<RincianSurvei, "kunci"> => {
  const jumlah = p.volume !== null && b.tarif !== null ? p.volume * b.tarif : null;
  return { ...b, periode: null, hari: null, ...p, jumlah };
};

/**
 * Rincian per survei. `periode` = jadwal pendataan tiap periode (jadwalPendataan di lanjutan.ts). Baris pelatihan, pulsa, dan honor sudah per kelas
 * (nama kelas memuat nama periode); baris translok, penginapan, dan rapat dikembangkan per periode.
 */
export function rincianSurvei(rincian: BarisRincian[], periode: PeriodeJadwal[], mode: ModePecah, hariBayar: HariBayar = {}, libur: Libur = new Set()): RincianSurvei[] {
  const nama = periode.map((x) => x.periode);
  const tanpa = nama.length === 1 && nama[0] === "Kegiatan";
  const sufiks = (p: string) => (tanpa ? "" : ` ${p}`);
  const mentah: Omit<RincianSurvei, "kunci">[] = [];
  for (const b of rincian) {
    if (lapangan(b)) {
      const per = periode.map((p) => ({ p, v: volLapangan(b, p, hariBayar, libur) }));
      const satuan = jenisLap(b) === "penginapan" ? "orang-malam" : "orang-hari";
      if (mode === "periode") {
        for (const { p, v } of per) mentah.push(beri(b, { uraian: b.uraian + sufiks(p.periode), satuan, periode: p.periode, hari: v.hari, hariMaks: v.maks, volume: v.volume, catatan: v.catatan }));
      } else {
        const lengkap = per.length > 0 && per.every((x) => x.v.volume !== null);
        const vol = lengkap ? per.reduce((s, x) => s + (x.v.volume ?? 0), 0) : null;
        mentah.push(beri(b, { uraian: b.uraian, satuan, volume: vol, hari: per.every((x) => x.v.hari !== null) ? per.reduce((s, x) => s + (x.v.hari ?? 0), 0) : null, hariMaks: per.reduce((s, x) => s + x.v.maks, 0), catatan: lengkap ? "" : per.find((x) => x.v.catatan)?.v.catatan ?? "Sebagian hari dibayar atau jumlah petugas belum lengkap; volume menyusul." }));
      }
    } else if (b.kelompok === "Rapat") {
      if (mode === "periode") for (const p of periode) mentah.push(beri(b, { uraian: b.uraian + sufiks(p.periode), satuan: b.satuan, periode: p.periode, volume: b.volume, catatan: b.catatan }));
      else mentah.push(beri(b, { uraian: b.uraian, satuan: b.satuan, volume: b.volume, catatan: b.catatan }));
    } else {
      const per = adaPeriodeNama(b.uraian, nama);
      if (mode === "periode" || !per) mentah.push(beri(b, { uraian: b.uraian, satuan: b.satuan, periode: per, volume: b.volume, catatan: b.catatan }));
      else mentah.push(beri(b, { uraian: b.uraian.replace(` ${per}`, ""), satuan: b.satuan, volume: b.volume, catatan: b.catatan }));
    }
  }
  // mode gabung: baris yang sama (akun + kelompok + uraian + satuan) dijumlahkan
  const hasil: Omit<RincianSurvei, "kunci">[] = [];
  if (mode === "gabung") {
    const peta = new Map<string, number>();
    const volumeAsal = new Map<number, (number | null)[]>();
    for (const r of mentah) {
      const k = `${r.akun}|${r.kelompok}|${r.uraian}|${r.satuan}`;
      const i = peta.get(k);
      if (i === undefined) { peta.set(k, hasil.length); volumeAsal.set(hasil.length, [r.volume]); hasil.push(r); continue; }
      volumeAsal.get(i)?.push(r.volume);
      const a = hasil[i];
      const vol = a.volume !== null && r.volume !== null ? a.volume + r.volume : null;
      hasil[i] = { ...a, volume: vol, jumlah: vol !== null && a.tarif !== null ? vol * a.tarif : null, perk: a.perk || r.perk, catatan: vol === null ? a.catatan || r.catatan : "" };
    }
    // honor instruktur: tampilkan rumus RAB (jumlah kelas x jam); di POK hanya total jam
    for (const [i, vols] of volumeAsal) {
      const h = hasil[i];
      if (h.kelompok === "Honor" && h.satuan === "jam" && vols.length > 1 && vols.every((v): v is number => v !== null)) {
        const sama = vols.every((v) => v === vols[0]);
        hasil[i] = { ...h, catatan: sama ? `${vols.length} kelas × ${vols[0]} jam = ${h.volume} jam` : `${vols.length} kelas, total ${h.volume} jam (jam tiap kelas: ${vols.join(", ")})` };
      }
    }
  } else hasil.push(...mentah);
  const dipakai = new Map<string, number>();
  return hasil.map((r) => {
    const dasar = `${r.akun}|${r.uraian}`;
    const n = (dipakai.get(dasar) ?? 0) + 1;
    dipakai.set(dasar, n);
    return { ...r, kunci: n === 1 ? dasar : `${dasar}#${n}` };
  });
}

export const jumlahSurvei = (r: RincianSurvei[]): { total: number; terhitung: number; belum: number } =>
  r.reduce((a, x) => (x.jumlah === null ? { ...a, belum: a.belum + 1 } : { ...a, total: a.total + x.jumlah, terhitung: a.terhitung + 1 }), { total: 0, terhitung: 0, belum: 0 });

// ---------------------------------------------------------------------------------------------------------------------
// Penautan rincian ke item POK
// ---------------------------------------------------------------------------------------------------------------------
export type StatusTautan = "cocok" | "perlu_nama" | "belum_ada";
export type HasilTautan = { status: StatusTautan; kandidat: ItemAnggaran[]; pilihan: ItemAnggaran | null; saranNama: string | null; pesan: string };

/** Kata kunci nama item POK yang wajar untuk sebuah rincian (huruf kecil). Kosong = tidak diperiksa. */
export function kataKunci(r: Pick<RincianSurvei, "uraian" | "akun" | "kelompok">): string[] {
  const u = r.uraian.toLowerCase();
  if (r.kelompok === "Translok dan penginapan") return u.startsWith("penginapan") ? ["penginapan", "akomodasi", "menginap"] : ["transport", "translok"];
  if (r.kelompok === "Rapat") return ["rapat", "konsumsi"];
  if (u.includes("paket")) return ["paket", "meeting", "fullday", "fullboard", "pelatihan"];
  if (u.includes("pulsa")) return ["pulsa", "komunikasi"];
  if (u.includes("konsumsi")) return ["konsumsi", "pelatihan", "rapat", "snack", "makan"];
  return [];
}

/** Saran nama item POK: nama baku jenis belanja + nama survei. Hanya saran; pengguna boleh mengubahnya. */
export function saranNamaItem(r: Pick<RincianSurvei, "uraian" | "akun" | "kelompok">, survei: string): string {
  const dasar = r.kelompok === "Translok dan penginapan"
    ? (r.uraian.startsWith("Penginapan") ? "Penginapan petugas pendataan" : "Transport lokal petugas pendataan")
    : (NAMA_AKUN[akun6(r.akun)] ?? r.uraian.split(":")[0]);
  return `${dasar} ${survei}`.trim();
}

/**
 * Tautan satu rincian ke item POK RO: akun enam angka sama. Beberapa rincian (mis. translok PPL dan PML) boleh menunjuk item yang sama.
 * - belum_ada: tidak ada item POK beakun itu (usul tambah item lewat revisi POK).
 * - perlu_nama: ada item beakun sama, tetapi tidak ada yang namanya memuat kata kunci jenis belanja (usul perbaiki nama lewat matriks semula-menjadi).
 * - cocok: ada item beakun sama dengan nama yang sesuai; bila tepat satu, langsung menjadi pilihan.
 */
export function tautkan(r: Pick<RincianSurvei, "uraian" | "akun" | "kelompok">, items: ItemAnggaran[], survei: string): HasilTautan {
  const sama = items.filter((i) => akun6(i.akun) === akun6(r.akun));
  if (sama.length === 0) return { status: "belum_ada", kandidat: [], pilihan: null, saranNama: saranNamaItem(r, survei), pesan: `Belum ada item POK akun ${akun6(r.akun)}. Tambahkan item baru (memicu item di RAB untuk revisi POK).` };
  const kunci = kataKunci(r);
  const nama = (i: ItemAnggaran) => i.uraian.toLowerCase();
  const cocok = kunci.length ? sama.filter((i) => kunci.some((k) => nama(i).includes(k))) : sama;
  if (cocok.length === 0) return { status: "perlu_nama", kandidat: sama, pilihan: sama.length === 1 ? sama[0] : null, saranNama: saranNamaItem(r, survei), pesan: `Item akun ${akun6(r.akun)} ada, tetapi namanya belum menggambarkan rincian ini. Disarankan memperbaiki nama (dibuatkan matriks semula-menjadi).` };
  return { status: "cocok", kandidat: cocok, pilihan: cocok.length === 1 ? cocok[0] : null, saranNama: null, pesan: cocok.length === 1 ? "Ditautkan ke satu item POK." : "Ada beberapa item cocok; pilih salah satu." };
}

export type RingkasTautan = { cocok: number; perlu_nama: number; belum_ada: number; belumDipilih: number };
export function ringkasTautan(hasil: HasilTautan[]): RingkasTautan {
  return hasil.reduce((a, h) => ({ ...a, [h.status]: a[h.status] + 1, belumDipilih: a.belumDipilih + (h.pilihan ? 0 : 1) }), { cocok: 0, perlu_nama: 0, belum_ada: 0, belumDipilih: 0 });
}
