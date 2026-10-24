// lib/keu/baca.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- membaca tampilan (view keu_v_*) dan tabel keu_ untuk halaman /sigap/ro/<KODE>.
//
// Hak lihat (keputusan Bapak 24 Okt 2026): semua pegawai organik (dan akun super) boleh MELIHAT semua RO, hanya baca. Mengubah
// tetap lewat lib/keu/gerbang.ts yang hak-nya ditegakkan basis data. Klien service-role melewati RLS, jadi pemeriksaan "organik"
// dilakukan di sini, dan hanya nama dan kolom dari daftar putih (lib/keu/tampilan.ts) yang boleh dibaca atau disaring.
//
// Masukan (query string): tampilan=<nama>, kolom=a,b (opsional, saringan proyeksi), urut=<kolom> atau -<kolom> (opsional),
// batas=<n> (bawaan 1000, maks 20000), dan saringan sama-dengan: tiap parameter lain "kolom=nilai" (kolom harus ada pada
// tampilan itu), "kolom=a|b|c" berarti salah satu dari. Nilai "null" menyaring yang kosong.

import type { Db } from "@/lib/sigap";
import { petakanGalat } from "@/lib/keu/galat";
import { TAMPILAN_BACA } from "@/lib/keu/tampilan";
import type { Balasan, Sesi } from "@/lib/keu/gerbang";

export const BATAS_BAWAAN = 1000;
export const BATAS_MAKS = 20000;
const UKURAN_HALAMAN = 1000;
const MAKS_SARING = 8;
const MAKS_NILAI_IN = 50;
const RE_NILAI = /^[\p{L}\p{N} _.:\/#+\-]{0,120}$/u;

export type SaringKolom = { kolom: string; nilai: string[]; kosong: boolean };
export type MasukanBaca = { tampilan: string; kolom: string[] | null; saring: SaringKolom[]; urut: { kolom: string; naik: boolean } | null; batas: number };

const RESERVASI = new Set(["tampilan", "kolom", "urut", "batas"]);

/** Memeriksa parameter baca terhadap daftar putih. `params` = pasangan nama->nilai dari query string. */
export function periksaMasukanBaca(params: Record<string, string>): { ok: true; masukan: MasukanBaca } | { ok: false; pesan: string } {
  const tampilan = params.tampilan ?? "";
  const kolomSah = TAMPILAN_BACA[tampilan];
  if (!kolomSah) return { ok: false, pesan: "Tampilan tidak dikenal atau tidak boleh dibaca." };

  let kolom: string[] | null = null;
  if (params.kolom) {
    kolom = params.kolom.split(",").map((x) => x.trim()).filter(Boolean);
    if (kolom.length === 0 || kolom.length > 60) return { ok: false, pesan: "Daftar kolom tidak sah." };
    const salah = kolom.find((k) => !kolomSah.includes(k));
    if (salah) return { ok: false, pesan: `Kolom "${salah.slice(0, 30)}" tidak ada pada ${tampilan}.` };
  }

  let urut: MasukanBaca["urut"] = null;
  if (params.urut) {
    const naik = !params.urut.startsWith("-");
    const k = naik ? params.urut : params.urut.slice(1);
    if (!kolomSah.includes(k)) return { ok: false, pesan: `Kolom urut "${k.slice(0, 30)}" tidak ada pada ${tampilan}.` };
    urut = { kolom: k, naik };
  }

  let batas = BATAS_BAWAAN;
  if (params.batas !== undefined) {
    const n = Number(params.batas);
    if (!Number.isInteger(n) || n < 1 || n > BATAS_MAKS) return { ok: false, pesan: `batas harus bilangan bulat 1 sampai ${BATAS_MAKS}.` };
    batas = n;
  }

  const saring: SaringKolom[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (RESERVASI.has(k)) continue;
    if (!kolomSah.includes(k)) return { ok: false, pesan: `Saringan: kolom "${k.slice(0, 30)}" tidak ada pada ${tampilan}.` };
    if (saring.length >= MAKS_SARING) return { ok: false, pesan: "Terlalu banyak saringan." };
    if (v === "null") { saring.push({ kolom: k, nilai: [], kosong: true }); continue; }
    const nilai = v.split("|");
    if (nilai.length > MAKS_NILAI_IN) return { ok: false, pesan: `Saringan ${k}: terlalu banyak nilai.` };
    if (nilai.some((x) => !RE_NILAI.test(x))) return { ok: false, pesan: `Saringan ${k}: nilai memuat karakter yang tidak diizinkan.` };
    saring.push({ kolom: k, nilai, kosong: false });
  }
  return { ok: true, masukan: { tampilan, kolom, saring, urut, batas } };
}

/** Akun aktif dan organik (atau super)? */
export async function akunBolehBaca(db: Db, akunId: number): Promise<boolean> {
  const { data } = await db.from("sigap_akun").select("aktif, jenis, super").eq("id", akunId).maybeSingle();
  if (!data || !data.aktif) return false;
  return data.jenis === "organik" || data.super === true;
}

/** Membaca baris per halaman 1000 (batas baku PostgREST) sampai `batas` atau habis. */
export async function bacaKeu(db: Db, m: MasukanBaca): Promise<{ ok: true; data: unknown[]; terpotong: boolean } | { ok: false; galat: ReturnType<typeof petakanGalat> }> {
  const semua: unknown[] = [];
  let dari = 0;
  let terpotong = false;
  while (semua.length < m.batas) {
    const ambil = Math.min(UKURAN_HALAMAN, m.batas - semua.length);
    let q = db.from(m.tampilan).select(m.kolom ? m.kolom.join(",") : "*");
    for (const s of m.saring) {
      if (s.kosong) q = q.is(s.kolom, null);
      else if (s.nilai.length === 1) q = q.eq(s.kolom, s.nilai[0]);
      else q = q.in(s.kolom, s.nilai);
    }
    if (m.urut) q = q.order(m.urut.kolom, { ascending: m.urut.naik });
    const { data, error } = await q.range(dari, dari + ambil - 1);
    if (error) return { ok: false, galat: petakanGalat(error) };
    const baris = (data ?? []) as unknown[];
    semua.push(...baris);
    if (baris.length < ambil) return { ok: true, data: semua, terpotong };
    dari += ambil;
  }
  // Batas tercapai tepat pada halaman penuh: mungkin masih ada baris lagi.
  terpotong = true;
  return { ok: true, data: semua, terpotong };
}

/** Logika GET /api/sigap/keu/baca (dipisah dari Next supaya bisa diuji). */
export async function tanganiBaca(db: Db, sesi: Sesi, params: Record<string, string>): Promise<Balasan> {
  if (!sesi) return { status: 401, json: { error: "Sesi berakhir. Silakan masuk kembali." } };
  const p = periksaMasukanBaca(params);
  if (!p.ok) return { status: 400, json: { error: p.pesan } };
  if (!(await akunBolehBaca(db, sesi.akunId))) return { status: 403, json: { error: "Hanya pegawai organik yang boleh melihat data ini." } };
  const h = await bacaKeu(db, p.masukan);
  if (!h.ok) return { status: h.galat.status, json: { error: h.galat.pesan, kode: h.galat.kode } };
  return { status: 200, json: { data: h.data, jumlah: h.data.length, terpotong: h.terpotong } };
}
