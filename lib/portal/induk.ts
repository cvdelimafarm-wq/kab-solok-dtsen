// lib/portal/induk.ts  (hanya server)
//
// (9 Okt 2026) Kegiatan induk + tahap proses bisnis (lib/sigapTahap.ts): baca definisi dari sigap_induk/sigap_tahap, tentukan induk mana yang
// relevan bagi akun, siapkan data pendukung (konfirmasi kesediaan, ringkasan wilayah tim) dan detail wilayah tugas PER TIM.
// Skema pendataan tetap KEROYOKAN: wilayah ditampilkan sebagai tim (PML + semua PPL) beserta Sub SLS yang didata bersama, bukan per orang.

import type { Db } from "@/lib/sigap";
import { penugasanAkun } from "@/lib/sigap";
import type { AkunPortal } from "@/lib/portal/server";
import { tentukanTujuan } from "@/lib/undangan";
import type { BukaMode, InfoPerencanaan, InfoWilayah, Induk, TahapDef } from "@/lib/sigapTahap";
import type { IkonKode } from "@/lib/sigapTugasUtama";

export type AnggotaTim = { id: number; nama: string; peran: string | null; anda: boolean };
export type SubSlsTim = {
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  /** perkiraan jumlah KK (bencana_skor_beban_subsls) */
  kk: number;
  /** perkiraan jumlah KK terdampak */
  kk_terdampak: number;
  /** sudah ada laporan harian yang memuat Sub SLS ini (sigap_realisasi.lokasi) */
  ada_laporan: boolean;
};
export type WilayahTim = {
  pml: { id: number; nama: string } | null;
  anggota: AnggotaTim[];
  sub_sls: SubSlsTim[];
  total_kk: number;
  total_terdampak: number;
  ada_laporan: number;
};

type BarisInduk = { kode: string; nama: string; pendek: string; ikon: string; kegiatan_ids: number[]; urutan: number };
type BarisTahap = { induk_kode: string; kode: string; urutan: number; nama: string; uraian: string | null; isi: string[]; buka_mode: string; buka_tanggal: string | null };

const IKON_SAH: IkonKode[] = ["motor", "pedia", "surat", "langkah", "tes", "kuis", "hadir", "arsip", "kelola", "akses", "kontrak", "peta", "grafik", "periode", "dtsen", "bencana"];
const jadiIkon = (x: string): IkonKode => ((IKON_SAH as string[]).includes(x) ? (x as IkonKode) : "bencana");

const angka = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

/** Semua induk aktif beserta tahap aktifnya (urut). Gagal baca tabel -> kosong (Beranda memakai tampilan lama). */
export async function bacaDefinisi(db: Db): Promise<{ induk: BarisInduk[]; tahap: BarisTahap[] }> {
  const [{ data: i, error: e1 }, { data: t, error: e2 }] = await Promise.all([
    db.from("sigap_induk").select("kode, nama, pendek, ikon, kegiatan_ids, urutan").eq("aktif", true).order("urutan"),
    db.from("sigap_tahap").select("induk_kode, kode, urutan, nama, uraian, isi, buka_mode, buka_tanggal").eq("aktif", true).order("urutan"),
  ]);
  if (e1 || e2) return { induk: [], tahap: [] };
  return { induk: (i ?? []) as BarisInduk[], tahap: (t ?? []) as BarisTahap[] };
}

function jadiTahap(b: BarisTahap): TahapDef {
  const mode: BukaMode = b.buka_mode === "setelah_sebelumnya" || b.buka_mode === "tanggal" ? b.buka_mode : "langsung";
  return { kode: b.kode, urutan: b.urutan, nama: b.nama, uraian: b.uraian, isi: b.isi ?? [], buka_mode: mode, buka_tanggal: b.buka_tanggal };
}

/** Perencanaan: konfirmasi kesediaan petugas bencana + halaman tujuan (sama dengan kartu "Pendataan Pascabencana" lama). */
async function perencanaanAkun(db: Db, akun: AkunPortal): Promise<InfoPerencanaan | null> {
  if (!akun.petugas_bencana_id) return null;
  const { data: pb } = await db.from("bencana_petugas").select("id, nama, token, aktif, pendaftaran_bencana_konfirmasi").eq("id", akun.petugas_bencana_id).maybeSingle();
  if (!pb || pb.aktif === false) return null;
  const t = await tentukanTujuan(db, { id: pb.id as number, nama: pb.nama as string, token: pb.token as string });
  if (t.tipe === "dibatalkan") return { konfirmasi: null, href: null, pesan: t.pesan };
  return { konfirmasi: (pb.pendaftaran_bencana_konfirmasi as boolean | null) ?? null, href: t.path ?? null };
}

/** Tim (PML + semua anggotanya) dan Sub SLS yang didata bersama, dengan perkiraan KK & KK terdampak. */
export async function wilayahTim(db: Db, petugasId: number): Promise<WilayahTim | null> {
  const { data: p } = await db.from("bencana_petugas").select("id, nama, peran, atasan_id").eq("id", petugasId).maybeSingle();
  if (!p) return null;
  const pmlId = (p.peran === "pml" ? p.id : p.atasan_id) as number | null;
  if (!pmlId) return null;
  const [{ data: pml }, { data: ang }] = await Promise.all([
    db.from("bencana_petugas").select("id, nama").eq("id", pmlId).maybeSingle(),
    db.from("bencana_petugas").select("id, nama, peran, aktif").eq("atasan_id", pmlId),
  ]);
  const anggota = (ang ?? []).filter((x) => x.aktif !== false);
  const idAnggota = anggota.map((x) => x.id as number);
  const filter = idAnggota.length ? `pml_id.eq.${pmlId},ppl_id.in.(${idAnggota.join(",")})` : `pml_id.eq.${pmlId}`;
  const { data: alok } = await db.from("bencana_alokasi_subsls").select("idsubsls").or(filter);
  const ids = Array.from(new Set((alok ?? []).map((a) => a.idsubsls as string)));
  if (ids.length === 0) {
    return { pml: pml ? { id: pml.id as number, nama: pml.nama as string } : null, anggota: ringkasAnggota(anggota, petugasId), sub_sls: [], total_kk: 0, total_terdampak: 0, ada_laporan: 0 };
  }

  const { data: skor } = await db.rpc("bencana_skor_beban_subsls");
  type Skor = { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string; kk_total: number; kk_terdampak_estimasi: number };
  const peta = new Map<string, Skor>(((skor ?? []) as Skor[]).map((r) => [r.idsubsls, r]));

  // Sub SLS yang sudah muncul di laporan harian anggota tim
  const adaLaporan = await subSlsBerlaporan(db, [pmlId, ...idAnggota]);

  const sub: SubSlsTim[] = ids
    .map((id) => {
      const r = peta.get(id);
      return {
        idsubsls: id,
        kecamatan: r?.kecamatan ?? "-",
        nagari: r?.nagari ?? "-",
        sls: r?.sls ?? "-",
        sub_sls: r?.sub_sls ?? "-",
        kk: angka(r?.kk_total),
        kk_terdampak: angka(r?.kk_terdampak_estimasi),
        ada_laporan: adaLaporan.has(id),
      };
    })
    .sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.nagari.localeCompare(b.nagari) || a.sls.localeCompare(b.sls) || a.sub_sls.localeCompare(b.sub_sls));

  return {
    pml: pml ? { id: pml.id as number, nama: pml.nama as string } : null,
    anggota: ringkasAnggota(anggota, petugasId),
    sub_sls: sub,
    total_kk: Math.round(sub.reduce((a, x) => a + x.kk, 0)),
    total_terdampak: Math.round(sub.reduce((a, x) => a + x.kk_terdampak, 0)),
    ada_laporan: sub.filter((x) => x.ada_laporan).length,
  };
}

function ringkasAnggota(anggota: { id: unknown; nama: unknown; peran: unknown }[], petugasId: number): AnggotaTim[] {
  return anggota
    .map((x) => ({ id: x.id as number, nama: x.nama as string, peran: (x.peran as string | null) ?? null, anda: x.id === petugasId }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

/** idsubsls yang tercantum di sigap_realisasi.lokasi milik penugasan para anggota tim. */
async function subSlsBerlaporan(db: Db, petugasIds: number[]): Promise<Set<string>> {
  const hasil = new Set<string>();
  const { data: akun } = await db.from("sigap_akun").select("id").in("petugas_bencana_id", petugasIds);
  const akunIds = (akun ?? []).map((a) => a.id as number);
  if (akunIds.length === 0) return hasil;
  const { data: pen } = await db.from("sigap_penugasan").select("id").in("akun_id", akunIds);
  const penIds = (pen ?? []).map((p) => p.id as number);
  if (penIds.length === 0) return hasil;
  const { data: real } = await db.from("sigap_realisasi").select("lokasi").in("penugasan_id", penIds);
  for (const r of real ?? []) {
    const lok = r.lokasi as unknown;
    const daftar = Array.isArray(lok) ? lok : lok && typeof lok === "object" ? [lok] : [];
    for (const l of daftar) {
      const id = (l as { idsubsls?: unknown })?.idsubsls;
      if (typeof id === "string" && id) hasil.add(id);
    }
  }
  return hasil;
}

/** Induk yang relevan bagi akun, lengkap dengan tahap & data pendukung. */
export async function indukUntukAkun(db: Db, akun: AkunPortal, kode?: string | null): Promise<Induk[]> {
  const { induk, tahap } = await bacaDefinisi(db);
  if (induk.length === 0) return [];
  const pen = await penugasanAkun(db, akun.id);
  const hasil: Induk[] = [];
  let perencanaan: InfoPerencanaan | null | undefined;
  let wilayah: InfoWilayah | null | undefined;
  for (const i of induk) {
    if (kode && i.kode !== kode) continue;
    const kegIds = (i.kegiatan_ids ?? []).map(Number);
    const penInduk = pen.filter((p) => kegIds.includes(p.kegiatan.id));
    const relevan = !!akun.petugas_bencana_id || penInduk.length > 0;
    if (!relevan) continue;
    const t = tahap.filter((x) => x.induk_kode === i.kode).map(jadiTahap).sort((a, b) => a.urutan - b.urutan);
    if (t.length === 0) continue;
    const isi = new Set(t.flatMap((x) => x.isi));

    if (isi.has("konfirmasi") && perencanaan === undefined) perencanaan = await perencanaanAkun(db, akun);
    if (isi.has("wilayah_tim") && wilayah === undefined) {
      const w = akun.petugas_bencana_id ? await wilayahTim(db, akun.petugas_bencana_id) : null;
      wilayah = w ? { total: w.sub_sls.length, ada_laporan: w.ada_laporan, kk: w.total_kk, kk_terdampak: w.total_terdampak } : null;
    }

    const menyerap: string[] = [];
    if (isi.has("pelatihan")) menyerap.push("pelatihan");
    if (isi.has("konfirmasi") || isi.has("wilayah_tim")) menyerap.push("bencana");
    for (const p of penInduk) if (isi.has(`translok:${p.kegiatan.id}`)) menyerap.push(`translok-${p.id}`);

    hasil.push({
      kode: i.kode,
      nama: i.nama,
      pendek: i.pendek,
      ikon: jadiIkon(i.ikon),
      menyerap,
      tahap: t,
      perencanaan: isi.has("konfirmasi") ? (perencanaan ?? null) : null,
      wilayah: isi.has("wilayah_tim") ? (wilayah ?? null) : null,
    });
  }
  return hasil;
}
