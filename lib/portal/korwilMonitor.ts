// lib/portal/korwilMonitor.ts  (hanya server)
//
// (19 Okt 2026) Monitoring Korwil di HP -- HANYA-BACA: tidak menulis apa pun.
// Kelompok & tim: bencana_kelompok_tim (kortim + PML tiap kelompok); PPL = petugas aktif beratasan PML itu (bencana_petugas.atasan_id).
// Sub SLS: bencana_alokasi_subsls (pml_id), dibekukan = bencana_wilayah.nonaktif. KK: fungsi database bencana_pendataan_ringkas (sama dengan
// Lembar Pendataan & tab Monitoring). Administrasi: bencana_monitoring_lapangan (sama dengan Monitoring Lapangan). Perhitungan di lib/korwilMonitor.ts.

import type { Db } from "@/lib/sigap";
import { hariIniWib, hariLengkap } from "@/lib/sigap";
import { KEGIATAN_PENDATAAN_ID } from "@/lib/pendataan";
import { monitoringLapangan } from "@/lib/portal/lapangan";
import { memoWaktu } from "@/lib/portal/memoSingkat";
import type { AkunPortal } from "@/lib/portal/server";
import type { BarisKkMon, HasilMon } from "@/lib/pendataanMonitor";
import type { InfoKorwil } from "@/lib/sigapTahap";
import {
  susunAdministrasi,
  susunLapanganKorwil,
  type AnggotaKorwil,
  type BarisHariKorwil,
  type DataKorwil,
  type PilihanKelompok,
  type SubInfoKorwil,
  type SubPmlKorwil,
  type TimKorwilMasuk,
} from "@/lib/korwilMonitor";

/** Periode kegiatan Pendataan Pascabencana mulai 10 Okt 2026 (sama dengan tab Monitoring). */
export const MULAI_KORWIL = "2026-10-10";
const TTL_MS = 45_000;
const HASIL: HasilMon[] = ["terdampak", "tidak_terdampak", "tidak_ditemukan"];

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

type BarisKelompok = { kelompok: number; peran: string; akun_id: number; urutan: number | null };

/** Kelompok tempat akun ini menjadi kortim (korwil); null = bukan kortim. */
export async function kelompokKortim(db: Db, akunId: number): Promise<number | null> {
  const { data, error } = await db
    .from("bencana_kelompok_tim")
    .select("kelompok")
    .eq("kegiatan_id", KEGIATAN_PENDATAAN_ID)
    .eq("aktif", true)
    .eq("peran", "kortim")
    .eq("akun_id", akunId)
    .order("kelompok")
    .limit(1);
  if (error) throw new Error(`Gagal membaca kelompok: ${error.message}`);
  const k = (data ?? [])[0] as { kelompok: number } | undefined;
  return k ? n(k.kelompok) : null;
}

/** Semua kelompok beserta nama kortimnya (untuk pemilih kelompok bagi admin). */
export async function daftarKelompok(db: Db): Promise<PilihanKelompok[]> {
  const { data, error } = await db.from("bencana_kelompok_tim").select("kelompok, peran, akun_id, urutan").eq("kegiatan_id", KEGIATAN_PENDATAAN_ID).eq("aktif", true).eq("peran", "kortim").order("kelompok").order("urutan");
  if (error) throw new Error(`Gagal membaca kelompok: ${error.message}`);
  const baris = (data ?? []) as BarisKelompok[];
  const nama = await namaAkun(db, baris.map((b) => n(b.akun_id)));
  const per = new Map<number, string[]>();
  for (const b of baris) per.set(n(b.kelompok), [...(per.get(n(b.kelompok)) ?? []), nama.get(n(b.akun_id)) ?? `Akun ${b.akun_id}`]);
  return [...per.entries()].map(([kelompok, korwil]) => ({ kelompok, korwil }));
}

async function namaAkun(db: Db, ids: number[]): Promise<Map<number, string>> {
  const hasil = new Map<number, string>();
  const unik = Array.from(new Set(ids));
  if (unik.length === 0) return hasil;
  const { data } = await db.from("sigap_akun").select("id, nama").in("id", unik);
  for (const r of (data ?? []) as { id: number; nama: string }[]) hasil.set(n(r.id), String(r.nama ?? ""));
  return hasil;
}

/** PML (petugas id) satu kelompok: dari akun PML di bencana_kelompok_tim -> petugas_bencana_id. */
async function pmlKelompok(db: Db, kelompok: number): Promise<{ korwilAkun: number[]; pmlPetugas: number[] } | null> {
  const { data, error } = await db.from("bencana_kelompok_tim").select("kelompok, peran, akun_id, urutan").eq("kegiatan_id", KEGIATAN_PENDATAAN_ID).eq("aktif", true).eq("kelompok", kelompok);
  if (error) throw new Error(`Gagal membaca kelompok: ${error.message}`);
  const baris = (data ?? []) as BarisKelompok[];
  if (baris.length === 0) return null;
  const pmlAkun = baris.filter((b) => b.peran === "pml").map((b) => n(b.akun_id));
  const { data: ak } = pmlAkun.length ? await db.from("sigap_akun").select("id, petugas_bencana_id").in("id", pmlAkun) : { data: [] };
  const pmlPetugas = ((ak ?? []) as { id: number; petugas_bencana_id: number | null }[]).map((a) => a.petugas_bencana_id).filter((x): x is number => x != null).map(n);
  return {
    korwilAkun: baris
      .filter((b) => b.peran === "kortim")
      .sort((a, b) => n(a.urutan) - n(b.urutan))
      .map((b) => n(b.akun_id)),
    pmlPetugas: Array.from(new Set(pmlPetugas)),
  };
}

/** Tim (PML + PPL aktif beserta akunnya) untuk daftar PML tertentu. */
async function bangunTim(db: Db, pmlIds: number[], tampil: boolean): Promise<TimKorwilMasuk[]> {
  if (pmlIds.length === 0) return [];
  const [{ data: pm }, { data: pp }] = await Promise.all([
    db.from("bencana_petugas").select("id, nama, aktif").in("id", pmlIds),
    db.from("bencana_petugas").select("id, nama, atasan_id, aktif").in("atasan_id", pmlIds).eq("peran", "ppl"),
  ]);
  const pmlRows = (pm ?? []) as { id: number; nama: string; aktif: boolean | null }[];
  const pplRows = ((pp ?? []) as { id: number; nama: string; atasan_id: number; aktif: boolean | null }[]).filter((x) => x.aktif !== false);
  const semua = [...pmlRows.map((x) => n(x.id)), ...pplRows.map((x) => n(x.id))];
  const { data: ak } = semua.length ? await db.from("sigap_akun").select("id, petugas_bencana_id").in("petugas_bencana_id", semua).eq("aktif", true) : { data: [] };
  const akunPer = new Map<number, number[]>();
  for (const a of (ak ?? []) as { id: number; petugas_bencana_id: number }[]) akunPer.set(n(a.petugas_bencana_id), [...(akunPer.get(n(a.petugas_bencana_id)) ?? []), n(a.id)]);
  const anggota = (x: { id: number; nama: string }): AnggotaKorwil => ({ petugas_id: n(x.id), nama: String(x.nama ?? ""), akun_ids: akunPer.get(n(x.id)) ?? [] });
  return pmlRows.map((p) => ({ pml: anggota(p), ppl: pplRows.filter((x) => n(x.atasan_id) === n(p.id)).map(anggota), tampil }));
}

async function halaman<T>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let dari = 0; dari < 60_000; dari += 1000) {
    const { data, error } = await ambil(dari, dari + 999);
    if (error) throw new Error(error.message);
    const b = (data ?? []) as T[];
    out.push(...b);
    if (b.length < 1000) break;
  }
  return out;
}

async function muatKelompok(db: Db, kelompok: number): Promise<Omit<DataKorwil, "pilihan"> | null> {
  const k = await pmlKelompok(db, kelompok);
  if (!k) return null;
  const namaKorwil = await namaAkun(db, k.korwilAkun);
  const timKelompok = await bangunTim(db, k.pmlPetugas, true);

  // Sub SLS tim kelompok, lalu pemegang lain Sub SLS yang sama (tim di kelompok lain) supaya pembagian proporsional benar
  const alokasi = await halaman<{ idsubsls: string; pml_id: number | null }>((a, b) =>
    db.from("bencana_alokasi_subsls").select("idsubsls, pml_id").in("pml_id", k.pmlPetugas.length ? k.pmlPetugas : [-1]).order("idsubsls").range(a, b),
  );
  const subPml: SubPmlKorwil[] = alokasi.filter((x) => x.pml_id != null).map((x) => ({ idsubsls: x.idsubsls, pml_id: n(x.pml_id) }));
  const idsSub = Array.from(new Set(subPml.map((s) => s.idsubsls)));
  const lain: { idsubsls: string; pml_id: number | null }[] = [];
  for (let i = 0; i < idsSub.length; i += 200) {
    const { data } = await db.from("bencana_alokasi_subsls").select("idsubsls, pml_id").in("idsubsls", idsSub.slice(i, i + 200)).not("pml_id", "is", null);
    lain.push(...((data ?? []) as { idsubsls: string; pml_id: number | null }[]));
  }
  const pmlLuar = Array.from(new Set(lain.map((x) => n(x.pml_id)).filter((id) => id > 0 && !k.pmlPetugas.includes(id))));
  const timLuar = await bangunTim(db, pmlLuar, false);
  for (const x of lain) if (pmlLuar.includes(n(x.pml_id))) subPml.push({ idsubsls: x.idsubsls, pml_id: n(x.pml_id) });
  const semuaTim = [...timKelompok, ...timLuar];

  // nama wilayah + Sub SLS non aktif (kolom `nonaktif` ada sejak migrasi 20261018a; bila belum ada, semua dianggap aktif)
  const info = new Map<string, SubInfoKorwil>();
  const nonaktif = new Set<string>();
  for (let i = 0; i < idsSub.length; i += 200) {
    const potong = idsSub.slice(i, i + 200);
    type BarisWilayah = { idsubsls: string; nagari: string; sls: string; sub_sls: string; nonaktif?: boolean | null };
    type HasilWilayah = { data: BarisWilayah[] | null; error: unknown };
    let res = (await db.from("bencana_wilayah").select("idsubsls, nagari, sls, sub_sls, nonaktif").in("idsubsls", potong)) as unknown as HasilWilayah;
    if (res.error) res = (await db.from("bencana_wilayah").select("idsubsls, nagari, sls, sub_sls").in("idsubsls", potong)) as unknown as HasilWilayah;
    for (const r of res.data ?? []) {
      info.set(r.idsubsls, { nagari: String(r.nagari ?? ""), sls: String(r.sls ?? ""), sub_sls: String(r.sub_sls ?? "") });
      if (r.nonaktif === true) nonaktif.add(r.idsubsls);
    }
  }

  // ringkasan KK per tim (beberapa tim sekaligus)
  const baris: BarisKkMon[] = [];
  const pmlSemua = semuaTim.map((t) => t.pml.petugas_id);
  for (let i = 0; i < pmlSemua.length; i += 6) {
    const hasil = await Promise.all(
      pmlSemua.slice(i, i + 6).map(async (pml) => {
        const { data, error } = await db.rpc("bencana_pendataan_ringkas", { p_pml: pml });
        if (error) throw new Error(`Gagal memuat ringkasan tim: ${error.message}`);
        return ((data ?? []) as Record<string, unknown>[]).map(
          (r): BarisKkMon => ({ pml_id: pml, idsubsls: String(r.idsubsls), ppl_akun_id: r.ppl_akun_id == null ? null : n(r.ppl_akun_id), hasil: HASIL.includes(r.hasil as HasilMon) ? (r.hasil as HasilMon) : null, jumlah: n(r.jumlah) }),
        );
      }),
    );
    for (const h of hasil) baris.push(...h);
  }

  // administrasi harian (sama dengan Monitoring Lapangan); satu muatan dipakai semua kelompok
  const hariIni = hariIniWib();
  const lap = await memoWaktu("korwil:lapangan", TTL_MS, () => monitoringLapangan(db, MULAI_KORWIL, hariIni));
  const akunKelompok = new Set(timKelompok.flatMap((t) => [t.pml, ...t.ppl].flatMap((p) => p.akun_ids)));
  const hari: BarisHariKorwil[] = lap.baris
    .filter((b) => akunKelompok.has(b.akun_id))
    .map((b) => ({
      akun_id: b.akun_id,
      tanggal: b.tanggal,
      hari_kerja: b.hari_kerja,
      lengkap: hariLengkap(b.ada_laporan, b.jumlah_foto, lap.aturan),
      ada_laporan: b.ada_laporan,
      jumlah_foto: b.jumlah_foto,
      aktif: b.sub_idf > 0 || b.kk_berhasil > 0 || b.kk_tdk_ditemukan > 0,
    }));

  return {
    sekarang: new Date().toISOString(),
    hari_ini: hariIni,
    mulai: MULAI_KORWIL,
    kelompok,
    korwil: k.korwilAkun.map((a) => namaKorwil.get(a) ?? `Akun ${a}`),
    lapangan: susunLapanganKorwil({ tim: semuaTim, sub: subPml, nonaktif, baris, info }),
    administrasi: susunAdministrasi({ tim: timKelompok, baris: hari, mulai: MULAI_KORWIL, hariIni }),
  };
}

/** Data Monitoring Korwil satu kelompok (disimpan ±45 detik; permintaan serentak berbagi satu pemuatan). null = kelompok tidak ada. */
export function monitoringKorwil(db: Db, kelompok: number, paksa = false): Promise<Omit<DataKorwil, "pilihan"> | null> {
  const kunci = `korwil:${kelompok}`;
  if (paksa) return muatKelompok(db, kelompok);
  return memoWaktu(kunci, TTL_MS, () => muatKelompok(db, kelompok));
}

/** Ringkas murah untuk kartu modul di tahap Pendataan (tanpa menghitung progres): kelompok, jumlah tim PML, jumlah PPL. null = bukan kortim. */
export async function ringkasModulKorwil(db: Db, akun: Pick<AkunPortal, "id">): Promise<InfoKorwil | null> {
  return memoWaktu(`korwil-ringkas:${akun.id}`, 60_000, async () => {
    const kel = await kelompokKortim(db, akun.id);
    if (kel == null) return null;
    const k = await pmlKelompok(db, kel);
    if (!k) return null;
    const { data } = k.pmlPetugas.length ? await db.from("bencana_petugas").select("id").in("atasan_id", k.pmlPetugas).eq("peran", "ppl").neq("aktif", false) : { data: [] };
    return { kelompok: kel, tim: k.pmlPetugas.length, ppl: (data ?? []).length };
  });
}
