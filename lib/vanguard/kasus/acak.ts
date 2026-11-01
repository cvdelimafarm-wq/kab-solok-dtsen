// lib/vanguard/kasus/acak.ts  (murni, HANYA server/tes: templat memuat rumus kunci)
//
// (1 Nov 2026) VANGUARD V7c: angka acak untuk kasus lama (Blok V–VII). Templat = berkas kasus dengan penampung {nama}/{nama:rp}/{nama:d2} pada teks dan rumus "=..." pada
// angka (kunci, nilai tabel IV.1, nilai alternatif), parameter (>= 5 pilihan, satu nilai baku) dan variabel turunan. Mesin yang sama dengan kasus K
// (kuesioner/templat.ts). Benih 0 = angka kasus asli (harus sama persis dengan level-*.json); benih >= 1 = angka acak yang bisa diulang.
// Dasar Ujian Sertifikasi: soal dan kunci dibangun di server dari benih, jadi kunci tidak pernah dikirim ke perangkat petugas.

import { acak, hitungRumus, isiTeks, tetapkanNilai, type ParameterT } from "../kuesioner/templat";
import type { Kasus } from "../tipe";
import dataA from "./templat-a.json";
import dataB from "./templat-b.json";
import dataC from "./templat-c.json";

export type TemplatV1 = { kode: string; parameter: Record<string, ParameterT>; turunan: Record<string, string>; kasus: Record<string, unknown> };
export const TEMPLAT_V1: TemplatV1[] = [...(dataA as unknown as TemplatV1[]), ...(dataB as unknown as TemplatV1[]), ...(dataC as unknown as TemplatV1[])];

export const punyaTemplatV1 = (kode: string): boolean => TEMPLAT_V1.some((t) => t.kode === kode);

function selesaikan(node: unknown, v: Record<string, number>): unknown {
  if (typeof node === "string") return node.startsWith("=") ? hitungRumus(node.slice(1), v) : isiTeks(node, v);
  if (Array.isArray(node)) return node.map((x) => selesaikan(x, v));
  if (node && typeof node === "object") return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, x]) => [k, selesaikan(x, v)]));
  return node;
}

export type KasusAcak = { kasus: Kasus; nilai: Record<string, number> };
export function susunKasusV1(t: TemplatV1, benih: number): KasusAcak {
  const nilai = tetapkanNilai(t, benih);
  return { kasus: selesaikan(t.kasus, nilai) as Kasus, nilai };
}
export function kasusDariBenih(kode: string, benih: number): Kasus | undefined {
  const t = TEMPLAT_V1.find((x) => x.kode === kode);
  return t ? susunKasusV1(t, benih).kasus : undefined;
}
export { acak };
