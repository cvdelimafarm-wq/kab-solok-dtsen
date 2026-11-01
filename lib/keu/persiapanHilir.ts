// lib/keu/persiapanHilir.ts  (murni; tanpa React/DB)
//
// (1 Nov 2026) Tahap 4 "Persiapan pelatihan" dan tahap 5 "Persiapan pendataan" pada alur Identifikasi survei (permintaan user). Kedua tahap ini
// MENARIK data dari identifikasi (formulir awal yang sah): sesi pelatihan/briefing, instruktur, jumlah petugas per peran, instrumen, jadwal pendataan.
// Rinciannya kelak dikerjakan di menu Pelatihan dan menu Pendataan; menu itu membaca data dari sini, bukan sebaliknya. Di sini hanya RINGKASAN + daftar
// periksa yang menyarankan (tidak memblokir apa pun).

import { PERAN_DEF, adaPendataan, instrDari, instrLengkap, type Form, type PeranId, type StatusPetugas } from "./identifikasi";
import { jadwalPendataan } from "./lanjutan";
import type { FungsiKegiatan } from "./pelaksanaan";

export type PeriksaButir = { kode: string; teks: string; beres: boolean; catatan?: string };

export type RingkasSesi = { kode: "briefing" | "pelatihan"; nama: string; aktif: boolean; bentuk: string; tempat: string; pengajar: boolean; instruktur: { jumlah: number; level: string; jam: number; lengkap: boolean } };
export type RingkasPeran = { id: PeranId; nama: string; jumlah: number; organik: number; mitra: number; status: StatusPetugas; translok: boolean; honor: boolean };

const NAMA_SESI: Record<"briefing" | "pelatihan", string> = { briefing: "Briefing", pelatihan: "Pelatihan" };

/** Peran yang dinyalakan, dengan jumlah organik + mitra. */
export function ringkasPeran(f: Form): RingkasPeran[] {
  return PERAN_DEF.filter((p) => f.peran[p.id]?.on).map((p) => {
    const x = f.peran[p.id];
    const organik = Math.max(0, Math.round(Number(x.nOrg) || 0));
    const mitra = Math.max(0, Math.round(Number(x.nMit) || 0));
    return { id: p.id, nama: p.nama, jumlah: organik + mitra, organik, mitra, status: x.status, translok: !!x.translok, honor: !!x.honor };
  });
}

export const jumlahPetugas = (peran: readonly RingkasPeran[]): number => peran.reduce((s, p) => s + p.jumlah, 0);

export type RingkasPelatihan = { sesi: RingkasSesi[]; peran: RingkasPeran[]; totalPeserta: number; adaSesi: boolean };

export function ringkasPelatihan(f: Form): RingkasPelatihan {
  const sesi: RingkasSesi[] = (["briefing", "pelatihan"] as const).map((k) => {
    const s = f.sesi[k];
    const i = instrDari(s);
    return {
      kode: k, nama: NAMA_SESI[k], aktif: !!s.on, bentuk: s.bentuk || "belum dipilih", tempat: s.tempat || "belum dipilih", pengajar: !!s.pengajar,
      instruktur: { jumlah: i.jumlah, level: i.level, jam: i.jam, lengkap: instrLengkap(i) },
    };
  });
  const peran = ringkasPeran(f);
  return { sesi, peran, totalPeserta: jumlahPetugas(peran), adaSesi: sesi.some((s) => s.aktif) };
}

export type RingkasPendataan = {
  ada: boolean; instrumen: string; cetakPapi: boolean; jadwal: { periode: string; mulai: string; selesai: string }[];
  lapangan: RingkasPeran[]; totalLapangan: number; rapatPersiapan: boolean;
};

/** Peran lapangan untuk pendataan: PML dan PPL, ditambah Kortim/Supervisor yang mengawasi. Petugas entri (pengolahan) tidak dihitung. */
const PERAN_LAPANGAN: readonly PeranId[] = ["supervisor", "kortim", "pml", "ppl"];

export function ringkasPendataan(f: Form, tahun: number, upd: Record<string, { mulai: string; selesai: string }> | null | undefined): RingkasPendataan {
  const ada = adaPendataan(f);
  const lapangan = ringkasPeran(f).filter((p) => PERAN_LAPANGAN.includes(p.id));
  return {
    ada, instrumen: f.instrumen, cetakPapi: !!f.cetakPapi,
    jadwal: ada ? jadwalPendataan(f, tahun, upd) : [],
    lapangan, totalLapangan: jumlahPetugas(lapangan), rapatPersiapan: !!f.rapat.persiapan.on,
  };
}

const jumlahFungsi = (tertaut: readonly { fungsi: FungsiKegiatan }[], fungsi: FungsiKegiatan): number => tertaut.filter((t) => t.fungsi === fungsi).length;

/** Daftar periksa tahap 4. Sesi tidak direncanakan = tahap tidak wajib (butir lain tidak ditagih). */
export function periksaPelatihan(r: RingkasPelatihan, tertaut: readonly { fungsi: FungsiKegiatan }[]): PeriksaButir[] {
  if (!r.adaSesi) return [{ kode: "sesi", teks: "Identifikasi tidak merencanakan briefing atau pelatihan, jadi tahap ini boleh dilewati.", beres: true }];
  const out: PeriksaButir[] = [{ kode: "sesi", teks: "Sesi briefing/pelatihan direncanakan", beres: true }];
  for (const s of r.sesi.filter((x) => x.aktif && x.pengajar)) {
    out.push({ kode: `instruktur-${s.kode}`, teks: `Instruktur ${s.nama.toLowerCase()} lengkap (jumlah, level, jam)`, beres: s.instruktur.lengkap });
  }
  out.push({ kode: "peserta", teks: "Jumlah petugas (peserta) sudah diisi", beres: r.totalPeserta > 0 });
  out.push({ kode: "kegiatan", teks: "Kegiatan SIGAP berfungsi Pelatihan sudah ditautkan", beres: jumlahFungsi(tertaut, "pelatihan") > 0, catatan: "Tautkan di halaman Pelaksanaan." });
  return out;
}

/** Daftar periksa tahap 5. Tanpa pendataan = tahap tidak wajib. */
export function periksaPendataan(r: RingkasPendataan, tertaut: readonly { fungsi: FungsiKegiatan }[]): PeriksaButir[] {
  if (!r.ada) return [{ kode: "ada", teks: "Identifikasi menyatakan tanpa pendataan, jadi tahap ini boleh dilewati.", beres: true }];
  return [
    { kode: "instrumen", teks: `Instrumen pendataan ditetapkan (${r.instrumen})`, beres: true },
    { kode: "jadwal", teks: "Jadwal pendataan terhitung", beres: r.jadwal.length > 0 },
    { kode: "petugas", teks: "Jumlah petugas lapangan (PML/PPL) sudah diisi", beres: r.totalLapangan > 0 },
    { kode: "kegiatan", teks: "Kegiatan SIGAP berfungsi Pendataan sudah ditautkan", beres: jumlahFungsi(tertaut, "pendataan") > 0, catatan: "Tautkan di halaman Pelaksanaan." },
  ];
}

/** Kalimat peringatan untuk NavAlur ("bebas dengan peringatan"); null bila semua butir beres. */
export function peringatanDariPeriksa(butir: readonly PeriksaButir[]): string | null {
  const kurang = butir.filter((b) => !b.beres);
  if (kurang.length === 0) return null;
  return `Belum lengkap di tahap ini: ${kurang.map((b) => b.teks.toLowerCase()).join("; ")}. Anda tetap boleh lanjut.`;
}
