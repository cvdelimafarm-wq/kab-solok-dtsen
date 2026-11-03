// lib/translokBlokirDb.ts  (hanya server)
//
// (3 Nov 2026) Data & kewenangan blokir sementara translok. Tabel: sigap_translok_blokir (SQL 20261103a).
// Kewenangan memblokir / menyetujui unblock untuk seorang petugas:
//   - atasan bertingkat: bencana_petugas.atasan_id (PPL -> PML -> Korwil) dan sigap_tim.atasan_akun_id (per kegiatan)
//   - Supervisor kegiatan tsb (peran berkode "supervisor*", lingkup kegiatan itu atau semua)
//   - admin dengan izin translok.penugasan = kelola untuk kegiatan itu
// Semua pembacaan toleran bila tabel belum dibuat: dianggap tidak ada blokir (aplikasi lama tetap jalan sampai SQL dijalankan).

import type { Db } from "@/lib/sigap";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { KOLOM_BLOKIR, memblokir, rantaiAtasan, turunanDari, type BarisBlokir } from "@/lib/translokBlokir";

async function semuaHalaman<T>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const hasil: T[] = [];
  for (let dari = 0; dari < 20000; dari += 1000) {
    const { data } = await ambil(dari, dari + 999);
    const d = data ?? [];
    hasil.push(...d);
    if (d.length < 1000) break;
  }
  return hasil;
}

/** Baris blokir seorang akun pada satu kegiatan (null = tidak ada / tabel belum ada). */
export async function ambilBlokir(db: Db, kegiatanId: number, akunId: number): Promise<BarisBlokir | null> {
  const { data, error } = await db.from("sigap_translok_blokir").select(KOLOM_BLOKIR).eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).maybeSingle();
  if (error || !data) return null;
  return data as BarisBlokir;
}

/** Pesan galat bila akun sedang diblokir pada kegiatan itu, selain itu null. */
export async function pesanBilaDiblokir(db: Db, kegiatanId: number, akunId: number, pesan: string): Promise<string | null> {
  const b = await ambilBlokir(db, kegiatanId, akunId);
  return b && memblokir(b.status) ? pesan : null;
}

/** Peta akun -> atasan langsungnya (akun), gabungan bencana_petugas dan sigap_tim kegiatan itu (sigap_tim menimpa). */
export async function petaAtasanAkun(db: Db, kegiatanId: number): Promise<Map<number, number | null>> {
  const [akun, bp, tim] = await Promise.all([
    semuaHalaman<{ id: number; petugas_bencana_id: number | null }>((a, z) => db.from("sigap_akun").select("id, petugas_bencana_id").not("petugas_bencana_id", "is", null).order("id").range(a, z)),
    semuaHalaman<{ id: number; atasan_id: number | null }>((a, z) => db.from("bencana_petugas").select("id, atasan_id").order("id").range(a, z)),
    semuaHalaman<{ akun_id: number; atasan_akun_id: number | null }>((a, z) => db.from("sigap_tim").select("akun_id, atasan_akun_id").eq("kegiatan_id", kegiatanId).order("akun_id").range(a, z)),
  ]);
  const akunPerPb = new Map<number, number>();
  for (const a of akun) if (a.petugas_bencana_id != null && !akunPerPb.has(a.petugas_bencana_id)) akunPerPb.set(a.petugas_bencana_id, a.id);
  const atasanPb = new Map<number, number | null>(bp.map((x) => [x.id, x.atasan_id]));
  const peta = new Map<number, number | null>();
  for (const a of akun) {
    const at = a.petugas_bencana_id != null ? atasanPb.get(a.petugas_bencana_id) : null;
    peta.set(a.id, at != null ? akunPerPb.get(at) ?? null : null);
  }
  for (const t of tim) if (t.atasan_akun_id != null) peta.set(t.akun_id, t.atasan_akun_id);
  return peta;
}

/** Akun Supervisor kegiatan (peran berkode supervisor*, lingkup kegiatan itu atau semua). */
export async function akunSupervisor(db: Db, kegiatanId: number): Promise<number[]> {
  const { data: pr } = await db.from("sigap_peran").select("id, kode").ilike("kode", "supervisor%");
  const ids = (pr ?? []).map((p) => p.id as number);
  if (!ids.length) return [];
  const { data } = await db.from("sigap_akun_peran").select("akun_id, kegiatan_id").in("peran_id", ids);
  return [...new Set((data ?? []).filter((x) => x.kegiatan_id == null || x.kegiatan_id === kegiatanId).map((x) => x.akun_id as number))];
}

/** Atasan bertingkat + Supervisor yang berwenang atas `targetId` (tanpa admin). Yang menerima notifikasi pengajuan. */
export async function penyetujuUntuk(db: Db, targetId: number, kegiatanId: number): Promise<{ atasan: number[]; supervisor: number[] }> {
  const [peta, sup] = await Promise.all([petaAtasanAkun(db, kegiatanId), akunSupervisor(db, kegiatanId)]);
  return { atasan: rantaiAtasan(targetId, peta), supervisor: sup.filter((x) => x !== targetId) };
}

export async function adminTranslok(db: Db, akunId: number, kegiatanId: number): Promise<boolean> {
  const { izin } = await izinAkun(db, akunId);
  return boleh(izin, "translok.penugasan", "kelola", kegiatanId);
}

/** Boleh memblokir / memutuskan pengajuan atas `targetId`? (bukan dirinya sendiri) */
export async function bolehMengelola(db: Db, aktorId: number, targetId: number, kegiatanId: number): Promise<boolean> {
  if (aktorId === targetId) return false;
  const { atasan, supervisor } = await penyetujuUntuk(db, targetId, kegiatanId);
  if (atasan.includes(aktorId) || supervisor.includes(aktorId)) return true;
  return adminTranslok(db, aktorId, kegiatanId);
}

export type Bawahan = { akun_id: number; nama: string; peran: string; status: BarisBlokir["status"] | null; blokir: BarisBlokir | null };

/** Petugas pada kegiatan itu yang boleh dikelola `aktorId` (atasan: turunannya; Supervisor/admin: semua), beserta status blokirnya. */
export async function bawahanDikelola(db: Db, aktorId: number, kegiatanId: number): Promise<{ daftar: Bawahan[]; semua: boolean }> {
  const [peta, sup, adm] = await Promise.all([petaAtasanAkun(db, kegiatanId), akunSupervisor(db, kegiatanId), adminTranslok(db, aktorId, kegiatanId)]);
  const semua = adm || sup.includes(aktorId);
  const { data: pen } = await db.from("sigap_penugasan").select("akun_id, peran").eq("kegiatan_id", kegiatanId).eq("aktif", true).limit(5000);
  const lingkup = semua ? null : new Set(turunanDari(aktorId, peta));
  const baris = (pen ?? []).filter((p) => (p.akun_id as number) !== aktorId && (lingkup === null || lingkup.has(p.akun_id as number)));
  if (!baris.length) return { daftar: [], semua };
  const ids = baris.map((p) => p.akun_id as number);
  const [{ data: ak }, bl] = await Promise.all([
    db.from("sigap_akun").select("id, nama").in("id", ids),
    db.from("sigap_translok_blokir").select(KOLOM_BLOKIR).eq("kegiatan_id", kegiatanId).in("akun_id", ids),
  ]);
  const nama = new Map((ak ?? []).map((a) => [a.id as number, a.nama as string]));
  const blokir = new Map(((bl.data ?? []) as BarisBlokir[]).map((b) => [b.akun_id, b]));
  return {
    semua,
    daftar: baris.map((p) => {
      const b = blokir.get(p.akun_id as number) ?? null;
      return { akun_id: p.akun_id as number, nama: nama.get(p.akun_id as number) ?? `Akun ${p.akun_id}`, peran: p.peran as string, status: b?.status ?? null, blokir: b };
    }),
  };
}
