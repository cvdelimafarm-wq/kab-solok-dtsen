// lib/vanguard/pembinaan/usulan.ts  (murni)
//
// (1 Nov 2026) VANGUARD V8a: Usul Kasus oleh petugas. Petugas mengirim kasus janggal dari lapangan (tanpa data responden asli); admin meninjau (baru -> diterima / ditolak / dikerjakan).
// Usulan diterima akan dibuat menjadi soal oleh pengelola dan, bila jadi, dicantumkan nama pengusulnya. Tahap ini hanya mengumpulkan dan meninjau; tidak ada soal yang otomatis terbit.

export const MAKS_USULAN_PER_HARI = 5;
export const BATAS = { judul: 120, cerita: 1500, jawaban: 1500, blok: 60, catatan: 600 } as const;
export const STATUS_USULAN = ["baru", "diterima", "ditolak", "dikerjakan"] as const;
export type StatusUsulan = (typeof STATUS_USULAN)[number];
export const LABEL_STATUS_USULAN: Record<StatusUsulan, string> = { baru: "Menunggu tinjauan", diterima: "Diterima", ditolak: "Belum dapat dipakai", dikerjakan: "Sedang dijadikan soal" };

const rapi = (x: unknown): string => (typeof x === "string" ? x.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim() : "");
const ADA_ID = /\b\d{16}\b/; // kemiripan nomor KK/NIK 16 digit: data responden nyata tidak boleh dikirim

export type Usulan = { judul: string; cerita: string; jawaban: string; blok: string };

export function bacaUsulan(x: unknown): { usulan: Usulan | null; galat: string | null } {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { usulan: null, galat: "Usulan tidak sah." };
  const o = x as Record<string, unknown>;
  const u: Usulan = { judul: rapi(o.judul), cerita: rapi(o.cerita), jawaban: rapi(o.jawaban), blok: rapi(o.blok) };
  if (u.judul.length < 5) return { usulan: null, galat: "Judul minimal 5 huruf." };
  if (u.cerita.length < 30) return { usulan: null, galat: "Ceritakan kasusnya minimal 30 huruf (tanpa nama atau data asli responden)." };
  for (const [k, maks] of [["judul", BATAS.judul], ["cerita", BATAS.cerita], ["jawaban", BATAS.jawaban], ["blok", BATAS.blok]] as const) if (u[k].length > maks) return { usulan: null, galat: `Isian ${k} terlalu panjang (maksimum ${maks} huruf).` };
  if (ADA_ID.test(`${u.judul} ${u.cerita} ${u.jawaban}`)) return { usulan: null, galat: "Jangan menulis nomor identitas atau KK asli. Gunakan contoh rekaan." };
  return { usulan: u, galat: null };
}

export function bacaTinjauan(x: unknown): { status: StatusUsulan | null; catatan: string; galat: string | null } {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { status: null, catatan: "", galat: "Permintaan tidak sah." };
  const o = x as Record<string, unknown>;
  const status = STATUS_USULAN.find((s) => s === o.status && s !== "baru") ?? null;
  if (!status) return { status: null, catatan: "", galat: "Status tidak sah." };
  const catatan = rapi(o.catatan);
  if (catatan.length > BATAS.catatan) return { status: null, catatan: "", galat: `Catatan terlalu panjang (maksimum ${BATAS.catatan} huruf).` };
  return { status, catatan, galat: null };
}
