// lib/keu/rujukan.ts
//
// (14 Nov 2026, Fase 3 "Angka rujukan dan modal pembaruan") ANGKA RUJUKAN survei: angka yang dibaca lebih dari satu layar, satu sumber.
// Sumber: identifikasi lanjutan versi yang dipakai modul lain (Final; terkunci per versi), ditambah HARI DIBAYAR dari RAB survei
// (keu_rab_survei_draf.isi.hari, kunci "akun|Translok <Peran> (...)|<periode>").
// Langkah pertama Fase 3: hari dibayar dibandingkan dengan batas hari kerja penugasan (sigap_penugasan.maks_hari) pada kegiatan yang tertaut;
// beda -> modal pembaruan menawarkan menyamakan penugasan (keu_rujukan_terapkan_hari) atau membiarkannya tercatat sebagai selisih.
// Murni (tanpa React/DB).

import { NAMA_PERAN, bebanOrganik, type IsiLanjutan, type KodePeran } from "./lanjutan";

const PERAN_DARI_NAMA: [string, KodePeran][] = (Object.entries(NAMA_PERAN) as [KodePeran, string][]).map(([k, v]) => [v.toLowerCase(), k]);

/** "524113|Translok PPL (kurang dari 8 jam)|Triwulan IV" -> { peran: "ppl", periode: "Triwulan IV", penginapan: false }. Bukan translok/penginapan -> null. */
export function bacaKunciHari(kunci: string): { peran: KodePeran; periode: string; penginapan: boolean } | null {
  const [, uraian = "", periode = ""] = kunci.split("|");
  const m = /^(Translok|Penginapan)\s+(.+?)(?:\s+\(.*\))?$/.exec(uraian.trim());
  if (!m) return null;
  const nama = m[2].trim().toLowerCase();
  const peran = PERAN_DARI_NAMA.find(([n]) => n === nama)?.[1];
  return peran ? { peran, periode: periode.trim(), penginapan: m[1] === "Penginapan" } : null;
}

export type HariPeran = { periode: string; peran: KodePeran; hari: number; kunci: string };

/**
 * Hari dibayar per (periode, peran) dari isian hari RAB survei. Translok "kurang dari 8 jam" dan "lebih dari 8 jam" untuk peran yang sama dijumlahkan
 * (keduanya hari lapangan berbeda); penginapan tidak dihitung (malam, bukan hari kerja). Isian kosong/tidak sah dilewati.
 */
export function hariDibayarPerPeran(hari: Record<string, string | number | null | undefined>): HariPeran[] {
  const m = new Map<string, HariPeran>();
  for (const [k, v] of Object.entries(hari ?? {})) {
    const b = bacaKunciHari(k);
    if (!b || b.penginapan) continue;
    const n = typeof v === "number" ? v : /^\d{1,3}$/.test(String(v ?? "").trim()) ? Number(String(v).trim()) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > 366) continue;
    const id = `${b.periode}|${b.peran}`;
    const ada = m.get(id);
    m.set(id, { periode: b.periode, peran: b.peran, hari: (ada?.hari ?? 0) + n, kunci: `hari:${b.peran}:${b.periode}` });
  }
  return [...m.values()].sort((a, b) => a.periode.localeCompare(b.periode) || a.peran.localeCompare(b.peran));
}

export type BarisPenugasanRujukan = { ident_id: number; kegiatan_id: number; kegiatan_nama: string; fungsi: string; periode: string | null; peran: string; n: number; maks_min: number | null; maks_max: number | null; n_kosong: number };

export type SelisihHari = {
  periode: string;
  peran: KodePeran;
  hariRab: number;
  kunci: string;
  kegiatan_id: number;
  kegiatan_nama: string;
  n: number;
  /** batas penugasan sekarang: angka tunggal bila semua sama, null bila kosong semua, "campur" bila berbeda-beda */
  penugasan: number | null | "campur";
  sama: boolean;
};

/**
 * Bandingkan hari dibayar RAB dengan batas hari kerja penugasan kegiatan PENDATAAN yang tertaut (periode sama, atau kegiatan tanpa periode).
 * Pelatihan tidak dibandingkan (hari pelatihan dihitung dari kelas, bukan hari lapangan).
 */
export function bandingHariPenugasan(hari: HariPeran[], penugasan: readonly BarisPenugasanRujukan[]): SelisihHari[] {
  const hasil: SelisihHari[] = [];
  for (const h of hari) {
    for (const p of penugasan) {
      if (p.fungsi !== "pendataan" || p.peran !== h.peran) continue;
      if (p.periode && p.periode !== h.periode) continue;
      const nilai: number | null | "campur" = p.n_kosong === p.n ? null : p.n_kosong > 0 || p.maks_min !== p.maks_max ? "campur" : p.maks_min;
      hasil.push({ periode: h.periode, peran: h.peran, hariRab: h.hari, kunci: h.kunci, kegiatan_id: p.kegiatan_id, kegiatan_nama: p.kegiatan_nama, n: p.n, penugasan: nilai, sama: nilai === h.hari || (h.hari === 0 && nilai === null) });
    }
  }
  return hasil;
}

export const teksBatas = (v: number | null | "campur"): string => (v === null ? "tanpa batas" : v === "campur" ? "berbeda-beda" : `${v} hari`);

// ---------------------------------------------------------------------------------------------------------------------
// Dua belas angka rujukan (tampilan satu sumber)
// ---------------------------------------------------------------------------------------------------------------------
export type AngkaRujukan = { kode: string; label: string; nilai: string; sumber: string; dipakai: string };

export function angkaRujukan(isi: IsiLanjutan | null, hari: HariPeran[], o: { ver: number | null; status: string | null; tanggal?: string; pulsaCetak?: string; komponen?: string }): AngkaRujukan[] {
  const sumberLj = isi ? `Identifikasi lanjutan v${o.ver ?? "?"}${o.status === "final" ? " (Final)" : " (belum Final)"}` : "Identifikasi lanjutan belum disimpan";
  const peran = isi ? (Object.entries(isi.peran) as [KodePeran, IsiLanjutan["peran"][KodePeran]][]).filter(([, p]) => p.on) : [];
  const kursi = peran.map(([k, p]) => `${NAMA_PERAN[k]} ${p.nOrg + p.nMit}`).join(" · ") || "—";
  const kelas = isi?.kelas ?? [];
  const oh = kelas.reduce((s, k) => s + (k.oh || 0), 0);
  const peserta = kelas.reduce((s, k) => s + k.untuk.reduce((t, r) => t + ((isi?.peran[r]?.on ? isi.peran[r].nOrg + isi.peran[r].nMit : 0) || 0), 0), 0);
  const beban = isi?.beban;
  const metode = [...new Set(kelas.map((k) => k.metode).filter(Boolean))].join(", ") || "—";
  const hariTeks = hari.length ? hari.map((h) => `${NAMA_PERAN[h.peran]} ${h.hari} hari${h.periode ? ` (${h.periode})` : ""}`).join(" · ") : "Belum diisi di RAB survei";
  const tarif = "Lembar kebijakan (tarif translok per peran)";
  return [
    { kode: "R01", label: "Kursi per peran", nilai: kursi, sumber: sumberLj, dipakai: "Susunan tim, kursi, draf delegasi, RAB honor/translok" },
    { kode: "R02", label: "Kelas dan hari pelatihan", nilai: kelas.length ? `${kelas.length} kelas · ${oh} OH` : "—", sumber: sumberLj, dipakai: "RAB pelatihan, agenda, kegiatan pelatihan" },
    { kode: "R03", label: "Peserta pelatihan", nilai: peserta ? `${peserta} orang-kelas` : "—", sumber: sumberLj, dipakai: "RAB konsumsi/paket, undangan" },
    { kode: "R04", label: "Sampel", nilai: beban ? `${beban.sampel} ${beban.satuan}` : "—", sumber: sumberLj, dipakai: "Alokasi, honor PPL, draf delegasi" },
    { kode: "R05", label: "Dokumen diperiksa", nilai: beban ? `mitra ${beban.periksaMitra} · organik ${bebanOrganik(beban).periksa}` : "—", sumber: sumberLj, dipakai: "Honor PML, delegasi pemeriksaan (poin)" },
    { kode: "R06", label: "Hari dibayar (maks hari kerja)", nilai: hariTeks, sumber: "RAB survei (isian hari)", dipakai: "RAB translok, kuota hari kerja penugasan (Transport lokal)" },
    { kode: "R07", label: "Tarif", nilai: tarif, sumber: "Lembar kebijakan", dipakai: "RAB, Transport lokal" },
    { kode: "R08", label: "Tanggal", nilai: o.tanggal ?? "—", sumber: "Identifikasi (jadwal)", dipakai: "Kegiatan tertaut, tenggat delegasi, tenggat SPJ" },
    { kode: "R09", label: "Metode kelas", nilai: metode, sumber: sumberLj, dipakai: "RAB (paket/pulsa), pelatihan" },
    { kode: "R10", label: "Komponen teknis", nilai: o.komponen ?? "Lihat Lembar komponen", sumber: "Pengaturan kegiatan (satu pengaturan, dua pintu)", dipakai: "Fitur kegiatan, butir kerja" },
    { kode: "R11", label: "Wilayah", nilai: isi?.wilayah?.trim() ? (isi.wilayah.length > 80 ? `${isi.wilayah.slice(0, 80)}…` : isi.wilayah) : "—", sumber: sumberLj, dipakai: "Alokasi wilayah, surat tugas" },
    { kode: "R12", label: "Pulsa dan cetak", nilai: o.pulsaCetak ?? "—", sumber: "Identifikasi awal (instrumen)", dipakai: "RAB pengadaan" },
  ];
}
