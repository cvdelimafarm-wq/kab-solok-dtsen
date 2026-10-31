// app/api/sigap/pelatihan/daftar/route.ts
//
// (10 Okt 2026) Daftar pelatihan per kegiatan induk -- permintaan user: "pada kelola pelatihan langsung muncul pelatihan
// pendataan bencana, harusnya tampilkan dulu list pelatihan berdasarkan kegiatan".
// GET (Authorization: Bearer <sesi>) -> { grup: [{ induk_kode, induk_nama, pelatihan: [...] }], survei: [{ kode, nama, pelatihan: [...] }] }
// (31 Okt 2026) `survei` = SATU kartu per survei (kegiatan induk) untuk halaman awal Kelola Pelatihan dan dropdown Survei di dalamnya; survei tanpa pelatihan ikut
// tampil bila akun punya lingkup ke survei itu (lib/sigapPelatihanSurvei.ts). `grup` dipertahankan untuk kompatibilitas.
// Hanya kegiatan berjenis 'pelatihan' yang boleh dilihat akun (izin pelatihan.kelola level lihat, per kegiatan).
// `dapat_dikelola`: halaman Kelola saat ini baru melayani satu pelatihan (KODE_KEGIATAN_PELATIHAN); pelatihan lain tampil
// di daftar dengan tanda "belum tersambung" sampai modulnya mendukung banyak pelatihan.

import { NextRequest, NextResponse } from "next/server";
import { boleh, izinAkun, lingkup } from "@/lib/sigapAkses";
import { bolehBuatPelatihan, susunSurvei, type StatusPelatihan } from "@/lib/sigapPelatihanSurvei";
import { KODE_KEGIATAN_PELATIHAN } from "@/lib/sigapTes";
import { akunDariRequest, dbAdmin } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Keg = { id: number; kode: string; nama: string; tanggal_mulai: string | null; tanggal_selesai: string | null; aktif: boolean };

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariRequest(req, db);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });

  const [{ izin, peran }, { data: keg }, { data: induk }] = await Promise.all([
    izinAkun(db, akun.id),
    db.from("sigap_kegiatan").select("id, kode, nama, tanggal_mulai, tanggal_selesai, aktif").eq("jenis", "pelatihan").order("tanggal_mulai", { ascending: false }),
    db.from("sigap_induk").select("kode, nama, kegiatan_ids, urutan").eq("aktif", true).order("urutan"),
  ]);
  const terlihat = ((keg ?? []) as Keg[]).filter((k) => boleh(izin, "pelatihan.kelola", "lihat", k.id));
  const lingkupAkun = lingkup(izin, "pelatihan.kelola");
  const indukRingkas = ((induk ?? []) as { kode: unknown; nama: unknown; kegiatan_ids: unknown }[]).map((i) => ({ kode: String(i.kode), nama: String(i.nama), kegiatan_ids: (i.kegiatan_ids as (number | string)[] | null) ?? null }));
  /** Menandai survei yang boleh dibuatkan pelatihan baru oleh akun ini (admin / PJ kegiatan yang lingkupnya mencakup survei). */
  const dengBolehBuat = <T extends { kode: string }>(daftar: T[]): (T & { boleh_buat: boolean })[] =>
    daftar.map((sv) => ({ ...sv, boleh_buat: bolehBuatPelatihan(peran, indukRingkas.find((x) => x.kode === sv.kode)?.kegiatan_ids ?? null) }));
  if (terlihat.length === 0) return NextResponse.json({ grup: [], survei: dengBolehBuat(susunSurvei(indukRingkas, [], lingkupAkun)) });

  const ids = terlihat.map((k) => k.id);
  const { data: pen } = await db.from("sigap_penugasan").select("kegiatan_id").in("kegiatan_id", ids).eq("aktif", true);
  const jumlah = new Map<number, number>();
  for (const p of pen ?? []) jumlah.set(Number(p.kegiatan_id), (jumlah.get(Number(p.kegiatan_id)) ?? 0) + 1);

  const hariIni = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); // WIB
  const status = (k: Keg): StatusPelatihan =>
    !k.aktif ? "nonaktif" : k.tanggal_mulai && hariIni < k.tanggal_mulai ? "akan_datang" : k.tanggal_selesai && hariIni > k.tanggal_selesai ? "selesai" : "berlangsung";
  const baris = (k: Keg) => ({
    id: k.id,
    kode: k.kode,
    nama: k.nama,
    tanggal_mulai: k.tanggal_mulai,
    tanggal_selesai: k.tanggal_selesai,
    status: status(k),
    peserta: jumlah.get(k.id) ?? 0,
    boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", k.id),
    dapat_dikelola: true, // (31 Okt 2026) semua pelatihan dapat dikelola: rute memakai ?kegiatan=ID
    bawaan: k.kode === KODE_KEGIATAN_PELATIHAN, // pelatihan yang dipakai server bila alamat tidak menyebut ?kegiatan
  });

  const sisa = new Set(ids);
  const grup: { induk_kode: string | null; induk_nama: string; pelatihan: ReturnType<typeof baris>[] }[] = [];
  for (const i of induk ?? []) {
    const anggota = ((i.kegiatan_ids as (number | string)[] | null) ?? []).map(Number);
    const isi = terlihat.filter((k) => anggota.includes(k.id) && sisa.has(k.id));
    if (isi.length === 0) continue;
    isi.forEach((k) => sisa.delete(k.id));
    grup.push({ induk_kode: String(i.kode), induk_nama: String(i.nama), pelatihan: isi.map(baris) });
  }
  const lain = terlihat.filter((k) => sisa.has(k.id));
  if (lain.length) grup.push({ induk_kode: null, induk_nama: "Pelatihan lainnya", pelatihan: lain.map(baris) });
  const survei = dengBolehBuat(susunSurvei(indukRingkas, terlihat.map((k) => baris(k)), lingkupAkun));
  return NextResponse.json({ grup, survei });
}
