// lib/sigapRapatDb.ts  (server)
//
// (9 Okt 2026) SIGAP -- akses data presensi rapat Zoom. Dipakai /api/sigap/rapat dan /api/sigap/rapat/admin.

import { KOLOM_RAPAT, perannyaSasaran, type Rapat } from "./sigapRapat";
import type { dbAdmin } from "./sigapTesDb";

type Db = NonNullable<ReturnType<typeof dbAdmin>>;

export async function muatRapatAktif(db: Db): Promise<Rapat[]> {
  const { data } = await db.from("sigap_rapat").select(KOLOM_RAPAT).eq("aktif", true).order("mulai_at").limit(20);
  return (data ?? []) as Rapat[];
}

export async function muatRapat(db: Db, id: number): Promise<Rapat | null> {
  const { data } = await db.from("sigap_rapat").select(KOLOM_RAPAT).eq("id", id).maybeSingle();
  return (data as Rapat | null) ?? null;
}

/** Akun termasuk sasaran rapat? (penugasan aktif PPL/PML pada kegiatan sasaran) */
export async function akunSasaran(db: Db, akunId: number, r: Rapat): Promise<boolean> {
  if ((r.akun_tambahan ?? []).includes(akunId)) return true; // (9 Okt 2026) akun tambahan (mis. admin) selalu boleh
  const { data } = await db.from("sigap_penugasan").select("peran").eq("kegiatan_id", r.sasaran_kegiatan_id).eq("akun_id", akunId).eq("aktif", true);
  return (data ?? []).some((p) => perannyaSasaran(String(p.peran), r.sasaran_peran));
}

export async function hadirAkun(db: Db, rapatId: number, akunId: number): Promise<string | null> {
  const { data } = await db.from("sigap_rapat_hadir").select("hadir_at").eq("rapat_id", rapatId).eq("akun_id", akunId).maybeSingle();
  return (data?.hadir_at as string | undefined) ?? null;
}

/** Semua sasaran rapat (akun aktif dengan penugasan aktif PPL/PML pada kegiatan sasaran) + catatan hadirnya. */
export async function rekapRapat(db: Db, r: Rapat) {
  const { data: pen } = await db.from("sigap_penugasan").select("akun_id, peran, kelas").eq("kegiatan_id", r.sasaran_kegiatan_id).eq("aktif", true);
  const sasaran = (pen ?? []).filter((p) => perannyaSasaran(String(p.peran), r.sasaran_peran));
  const tambahan = (r.akun_tambahan ?? []).map(Number);
  const ids = Array.from(new Set([...sasaran.map((p) => p.akun_id as number), ...tambahan]));
  const [{ data: akun }, { data: hadir }] = await Promise.all([
    ids.length ? db.from("sigap_akun").select("id, nama, aktif").in("id", ids) : Promise.resolve({ data: [] as { id: number; nama: string; aktif: boolean }[] }),
    db.from("sigap_rapat_hadir").select("akun_id, hadir_at, sumber, alasan").eq("rapat_id", r.id),
  ]);
  const nama = new Map((akun ?? []).filter((a) => a.aktif).map((a) => [a.id as number, a.nama as string]));
  const h = new Map((hadir ?? []).map((x) => [x.akun_id as number, x]));
  const baris = ids
    .filter((id) => nama.has(id))
    .map((id) => {
      const p = sasaran.find((x) => x.akun_id === id);
      const x = h.get(id);
      return { akun_id: id, nama: nama.get(id)!, peran: p ? String(p.peran).toLowerCase() : "tambahan", hadir_at: (x?.hadir_at as string | undefined) ?? null, sumber: (x?.sumber as string | undefined) ?? null, alasan: (x?.alasan as string | undefined) ?? null };
    })
    .sort((a, b) => a.peran.localeCompare(b.peran) || a.nama.localeCompare(b.nama, "id"));
  return baris;
}
