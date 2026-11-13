// lib/keu/kursi.ts
//
// (14 Nov 2026, Fase 2a) Status kursi tim per identifikasi survei (mockup F3 "Susunan tim kerja").
//  * Kursi = jumlah orang per peran pada identifikasi lanjutan (nOrg + nMit). Isinya = petugas[] dengan peran itu.
//  * Rencana   = kursi belum bernama (jumlah saja).
//  * Sementara = bernama, tetapi lanjutan belum Final atau jumlah peran masih "Perkiraan" (fix = false).
//  * Final     = lanjutan versi hilir Final dan jumlah peran tetap; baru di sini surat tugas, butir kerja, dan pembayaran boleh memakai nama itu.
//  * Ditugaskan = orang di kursi itu punya penugasan aktif dengan peran yang sama pada kegiatan yang tertaut (keu_v_ident_kursi_tugas).
// Fungsi murni, tanpa jaringan.

import { KODE_PERAN, NAMA_PERAN, type IsiLanjutan, type KodePeran, type Petugas } from "./lanjutan";

export type StatusKursi = "rencana" | "sementara" | "final";
export const LABEL_STATUS_KURSI: Record<StatusKursi, string> = { rencana: "Rencana", sementara: "Sementara", final: "Final" };

export type BarisTugasKursi = { ident_id: number; fungsi: string; kegiatan_id: number; kegiatan_nama: string; penugasan_id: number; akun_id: number; peran: string; atasan_akun_id: number | null; ada_st: boolean };

export type KursiOrang = { petugas: Petugas; status: StatusKursi; ditugaskan: { kegiatan_id: number; fungsi: string; ada_st: boolean }[] };
export type RekapPeranKursi = {
  peran: KodePeran;
  nama: string;
  kursi: number;
  organik: number;
  mitra: number;
  terisi: number;
  rencana: number;
  status: StatusKursi;
  ditugaskan: number;
  denganSt: number;
  orang: KursiOrang[];
};
export type RekapKursi = { peran: RekapPeranKursi[]; total: { kursi: number; terisi: number; kosong: number; organik: number; mitra: number; final: number; ditugaskan: number }; tanpaPeran: number };

const bernama = (p: Petugas) => !p.menyusul && p.nama.trim() !== "";

export function susunKursi(isi: IsiLanjutan | null, lanjutanFinal: boolean, tugas: readonly BarisTugasKursi[]): RekapKursi | null {
  if (!isi) return null;
  const hasil: RekapPeranKursi[] = [];
  for (const k of KODE_PERAN) {
    const pr = isi.peran?.[k];
    if (!pr || !pr.on) continue;
    const kursi = Math.max(0, (pr.nOrg || 0) + (pr.nMit || 0));
    const orangPeran = isi.petugas.filter((p) => p.peran === k);
    const statusIsi: StatusKursi = lanjutanFinal && pr.fix ? "final" : "sementara";
    const orang: KursiOrang[] = orangPeran.map((p) => {
      const dt = p.akun ? tugas.filter((t) => t.akun_id === p.akun && t.peran === k).map((t) => ({ kegiatan_id: t.kegiatan_id, fungsi: t.fungsi, ada_st: t.ada_st })) : [];
      return { petugas: p, status: bernama(p) ? statusIsi : "rencana", ditugaskan: dt };
    });
    const terisi = orang.filter((o) => o.status !== "rencana").length;
    const rencana = Math.max(0, kursi - terisi);
    const ditugaskan = orang.filter((o) => o.ditugaskan.length > 0).length;
    const denganSt = orang.filter((o) => o.ditugaskan.some((d) => d.ada_st)).length;
    // status peran: Final hanya bila semua kursi terisi dan berstatus Final
    const status: StatusKursi = terisi === 0 ? "rencana" : rencana === 0 && orang.every((o) => o.status === "final") ? "final" : "sementara";
    hasil.push({
      peran: k, nama: NAMA_PERAN[k], kursi, organik: pr.nOrg || 0, mitra: pr.nMit || 0, terisi, rencana, status, ditugaskan, denganSt, orang,
    });
  }
  const total = hasil.reduce(
    (a, r) => ({
      kursi: a.kursi + r.kursi, terisi: a.terisi + Math.min(r.terisi, r.kursi), kosong: a.kosong + r.rencana, organik: a.organik + r.organik, mitra: a.mitra + r.mitra,
      final: a.final + r.orang.filter((o) => o.status === "final").length, ditugaskan: a.ditugaskan + r.ditugaskan,
    }),
    { kursi: 0, terisi: 0, kosong: 0, organik: 0, mitra: 0, final: 0, ditugaskan: 0 },
  );
  return { peran: hasil, total, tanpaPeran: isi.petugas.filter((p) => p.peran === "").length };
}

/** Kalimat ringkas untuk kartu: "29 kursi · 29 bernama · 23 ditugaskan". */
export function kalimatKursi(r: RekapKursi): string {
  return `${r.total.kursi} kursi · ${r.total.terisi} bernama${r.total.kosong > 0 ? ` · ${r.total.kosong} belum bernama` : ""} · ${r.total.final} Final · ${r.total.ditugaskan} ditugaskan`;
}
