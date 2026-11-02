// lib/keu/tautAwal.ts
//
// (2 Nov 2026, keputusan Iqbal: "ikut awal, jadi nanti tinggal edit jika perlu"; kelas tambahan boleh dengan penanda) Tautan kelas pada Identifikasi lanjutan
// ke sesi pada Identifikasi awal. Nilai awal sudah diturunkan saat lanjutan pertama dibuat (awalLanjutan); berkas ini menambah KETERLIHATAN dan PEMULIHAN:
// kelas mana yang masih sama dengan awal, mana yang menyimpang (boleh, bertanda, bisa disamakan lagi), mana yang tambahan, dan kelas awal yang belum ada di lanjutan.
// MURNI. Tidak memblokir apa pun (peringatan saja); tidak mengubah bentuk data yang disimpan.

import { instrDari, type Form } from "./identifikasi";
import { awalLanjutan, hariKelas, idBaru, tglValid, type IsiLanjutan, type Kelas } from "./lanjutan";

export type BidangBeda = "metode" | "tempat" | "mulai" | "selesai";
export type Beda = { bidang: BidangBeda; label: string; awal: string; kini: string };
export type StatusTaut = "sesuai" | "menyimpang" | "tambahan";
/** Keadaan tautan satu kelas lanjutan terhadap awal. `instruktur` = catatan konsistensi jumlah instruktur (boleh null). */
export type TautKelas = { status: StatusTaut; beda: Beda[]; instruktur: string | null };
export type HasilTaut = { per: Record<string, TautKelas>; hilang: Kelas[] };

const LABEL: Record<BidangBeda, string> = { metode: "Metode", tempat: "Tempat", mulai: "Tanggal mulai", selesai: "Tanggal selesai" };
const kosongTeks = (v: string): string => (v === "" ? "(kosong)" : v);
const kunci = (k: Pick<Kelas, "sesi" | "periode">): string => `${k.sesi}|${k.periode}`;

/** Nilai awal yang dibandingkan: hanya yang diisi pada identifikasi awal (metode, tempat, tanggal yang sudah berupa tanggal). */
function bedaDari(k: Kelas, p: Kelas): Beda[] {
  const b: Beda[] = [];
  const cek = (bidang: BidangBeda, awal: string, kini: string, ada: boolean) => { if (ada && awal !== kini) b.push({ bidang, label: LABEL[bidang], awal: kosongTeks(awal), kini: kosongTeks(kini) }); };
  cek("metode", p.metode, k.metode, p.metode !== "");
  cek("tempat", p.tempat, k.tempat, p.tempat !== "");
  cek("mulai", p.mulai, k.mulai, tglValid(p.mulai));
  cek("selesai", p.selesai, k.selesai, tglValid(p.selesai));
  return b;
}

/**
 * Tautan tiap kelas lanjutan ke kelas yang diturunkan dari identifikasi awal (dipasangkan menurut sesi dan periode). Awal berbagi jadwal (`berbagi`) atau belum ada
 * = tanpa penanda. Kelas kedua dan seterusnya pada sesi dan periode yang sama (kelas dipecah) dihitung tambahan.
 */
export function tautkanKelas(isi: IsiLanjutan, f: Form | null, tahun: number | null): HasilTaut {
  if (!f || tahun === null || f.berbagi) return { per: {}, hilang: [] };
  const awal = awalLanjutan(f, tahun).kelas;
  const per: Record<string, TautKelas> = {};
  const terpakai = new Set<string>();
  for (const k of isi.kelas) {
    const p = awal.find((a) => kunci(a) === kunci(k) && !terpakai.has(kunci(a)));
    const sesiAwal = f.sesi[k.sesi];
    const jumlahIns = (k.instruktur ?? []).length;
    let catatanIns: string | null = null;
    if (p && !sesiAwal.pengajar && jumlahIns > 0) catatanIns = `Identifikasi awal menyatakan tidak ada instruktur pada sesi ini, sedangkan kelas ini memuat ${jumlahIns} instruktur. Honornya belum tercakup pada RAB awal.`;
    else if (p && sesiAwal.pengajar && jumlahIns > 0 && instrDari(sesiAwal).jumlah >= 1 && jumlahIns !== instrDari(sesiAwal).jumlah) catatanIns = `Identifikasi awal memuat ${instrDari(sesiAwal).jumlah} instruktur; kelas ini ${jumlahIns}.`;
    if (!p) { per[k.id] = { status: "tambahan", beda: [], instruktur: null }; continue; }
    terpakai.add(kunci(p));
    const beda = bedaDari(k, p);
    per[k.id] = { status: beda.length > 0 ? "menyimpang" : "sesuai", beda, instruktur: catatanIns };
  }
  const hilang = awal.filter((a) => !terpakai.has(kunci(a)));
  return { per, hilang };
}

/** Kelas hasil turunan awal yang berpasangan dengan `k` (sesi dan periode sama); dipakai tombol "Samakan dengan awal". */
export const kelasAwal = (f: Form, tahun: number, k: Pick<Kelas, "sesi" | "periode">): Kelas | undefined => awalLanjutan(f, tahun).kelas.find((a) => kunci(a) === kunci(k));

/** Menyamakan kelas dengan awal pada bidang yang berbeda (metode, tempat, tanggal); hari (OH) dihitung ulang bila kedua tanggal sah. Mengubah `k` langsung (untuk draf `ubah`). */
export function samakanDenganAwal(k: Kelas, p: Kelas): void {
  for (const b of bedaDari(k, p)) k[b.bidang] = p[b.bidang] as never;
  const hari = hariKelas(k.mulai, k.selesai);
  if (hari > 0) k.oh = Math.min(60, hari);
}

/** Menambahkan kelas dari awal yang belum ada di lanjutan (salinan; id baru). Mengubah `g` langsung. */
export function tambahDariAwal(g: IsiLanjutan, p: Kelas): void {
  g.kelas.push({ ...p, id: idBaru("k", g.kelas.map((e) => e.id)), untuk: [...p.untuk], instruktur: (p.instruktur ?? []).map((y) => ({ ...y })) });
}
