// lib/delego/ringkasan.ts
//
// (29 Okt 2026) Ringkasan bulanan ukuran keberhasilan (manajemen, pembinaan pegawai, kemudahan kerja).
// Data dihitung basis data (fungsi keu_ringkasan_bulanan dan keu_ringkasan_pegawai, hanya baca, hanya service role).
// Berkas ini memuat bagian murni: pemeriksaan bulan, pemformatan, CSV, dan logika permintaan (bisa diuji dengan Db palsu).
// Hak: hanya akun pemberi delegasi untuk semua RO (keu_boleh 'delegasi_beri'), sama dengan hak "semua" di Delego.

import type { Db } from "@/lib/sigap";

export type BarisRingkas = { urut: number; bidang: string; kode: string; ukuran: string; nilai: number | null; satuan: string; keterangan: string };
export type BarisPegawai = { akun_id: number; nama: string; delegasi: number; selesai: number; laporan: number; terlambat: number; poin: number; kualitas: number | null; kepatuhan: number | null };
export type IsiRingkasan = { bulan: string; ringkasan: BarisRingkas[]; pegawai: BarisPegawai[] };
export type Sesi = { akunId: number; aktorId: number | null } | null;
export type Balasan = { status: number; json: Record<string, unknown> };

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-10" atau "2026-10-17" -> "2026-10-01"; selain itu null. Tahun 2024 sampai 2099. */
export function periksaBulan(teks: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec((teks ?? "").trim());
  if (!m) return null;
  const th = Number(m[1]);
  const bl = Number(m[2]);
  if (th < 2024 || th > 2099 || bl < 1 || bl > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

/** Bulan dari tanggal ISO (yyyy-mm-dd) -> "yyyy-mm-01". */
export const awalBulan = (hariIso: string): string => `${hariIso.slice(0, 7)}-01`;

/** Geser n bulan dari "yyyy-mm-01". */
export function geserBulan(bulan: string, n: number): string {
  const th = Number(bulan.slice(0, 4));
  const bl = Number(bulan.slice(5, 7)) - 1 + n;
  const t = th + Math.floor(bl / 12);
  const b = ((bl % 12) + 12) % 12;
  return `${t}-${String(b + 1).padStart(2, "0")}-01`;
}

export const namaBulan = (bulan: string): string => `${NAMA_BULAN[Number(bulan.slice(5, 7)) - 1] ?? "?"} ${bulan.slice(0, 4)}`;

const angkaAtauNull = (x: unknown): number | null => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

export const teksNilai = (nilai: number | null, satuan: string): string => {
  if (nilai === null) return "–";
  const n = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(nilai);
  return satuan === "%" ? `${n}%` : n;
};

/** Mengelompokkan baris per bidang menurut urutan munculnya. */
export function kelompokBidang(baris: BarisRingkas[]): { bidang: string; baris: BarisRingkas[] }[] {
  const hasil: { bidang: string; baris: BarisRingkas[] }[] = [];
  for (const b of [...baris].sort((a, c) => a.urut - c.urut)) {
    const g = hasil.find((x) => x.bidang === b.bidang);
    if (g) g.baris.push(b);
    else hasil.push({ bidang: b.bidang, baris: [b] });
  }
  return hasil;
}

const sel = (v: string | number | null): string => {
  const t = v === null ? "" : String(v);
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** CSV (pemisah titik koma, cocok untuk Excel berlokal Indonesia). Rincian pegawai ikut hanya bila `denganPegawai`. */
export function ringkasanKeCsv(isi: IsiRingkasan, denganPegawai: boolean): string {
  const baris: (string | number | null)[][] = [
    [`Ringkasan bulanan Delego, ${namaBulan(isi.bulan)}`],
    [],
    ["Bidang", "Kode", "Ukuran", "Nilai", "Satuan", "Keterangan"],
    ...isi.ringkasan.map((r) => [r.bidang, r.kode, r.ukuran, r.nilai, r.satuan, r.keterangan]),
  ];
  if (denganPegawai) {
    baris.push([], ["Rincian per pegawai"], ["Nama", "Delegasi", "Selesai", "Laporan", "Terlambat", "Poin", "Kualitas", "Kepatuhan"]);
    for (const p of isi.pegawai) baris.push([p.nama, p.delegasi, p.selesai, p.laporan, p.terlambat, p.poin, p.kualitas, p.kepatuhan]);
  }
  return "﻿" + baris.map((b) => b.map(sel).join(";")).join("\r\n") + "\r\n";
}

const normRingkas = (r: Record<string, unknown>): BarisRingkas => ({
  urut: Number(r.urut), bidang: String(r.bidang ?? ""), kode: String(r.kode ?? ""), ukuran: String(r.ukuran ?? ""),
  nilai: angkaAtauNull(r.nilai), satuan: String(r.satuan ?? ""), keterangan: String(r.keterangan ?? ""),
});
const normPegawai = (r: Record<string, unknown>): BarisPegawai => ({
  akun_id: Number(r.akun_id), nama: String(r.nama ?? ""), delegasi: Number(r.delegasi ?? 0), selesai: Number(r.selesai ?? 0),
  laporan: Number(r.laporan ?? 0), terlambat: Number(r.terlambat ?? 0), poin: Number(r.poin ?? 0),
  kualitas: angkaAtauNull(r.kualitas), kepatuhan: angkaAtauNull(r.kepatuhan),
});

/** Logika GET /api/sigap/delego/ringkasan?bulan=yyyy-mm (dipisah dari Next supaya bisa diuji). */
export async function tanganiRingkasan(db: Db, sesi: Sesi, bulanParam: string | null): Promise<Balasan> {
  if (!sesi) return { status: 401, json: { error: "Sesi berakhir. Silakan masuk kembali." } };
  const bulan = periksaBulan(bulanParam);
  if (!bulan) return { status: 400, json: { error: "Bulan tidak sah. Gunakan format yyyy-mm." } };
  // Hak: pemberi delegasi untuk semua RO. Mode "masuk sebagai" hanya membaca, jadi tetap diizinkan (hak diperiksa atas akun yang disamarkan).
  const hak = await db.rpc("keu_boleh", { p_akun: sesi.akunId, p_kew: "delegasi_beri", p_ro: null });
  if (hak.error) return { status: 500, json: { error: "Hak akses belum dapat diperiksa. Coba lagi." } };
  if (hak.data !== true) return { status: 403, json: { error: "Ringkasan bulanan hanya untuk pemberi delegasi semua RO." } };
  const [a, b] = await Promise.all([db.rpc("keu_ringkasan_bulanan", { p_bulan: bulan }), db.rpc("keu_ringkasan_pegawai", { p_bulan: bulan })]);
  if (a.error || b.error) {
    const pesan = `${a.error?.message ?? ""} ${b.error?.message ?? ""}`;
    if (/does not exist|could not find the function|schema cache/i.test(pesan)) {
      return { status: 503, json: { error: "Fungsi ringkasan belum dipasang di basis data (jalankan 20261029b_keu_ringkasan_bulanan.sql)." } };
    }
    return { status: 500, json: { error: "Ringkasan belum dapat dimuat. Coba lagi." } };
  }
  const isi: IsiRingkasan = {
    bulan,
    ringkasan: ((a.data ?? []) as Record<string, unknown>[]).map(normRingkas),
    pegawai: ((b.data ?? []) as Record<string, unknown>[]).map(normPegawai),
  };
  return { status: 200, json: { data: isi } };
}
