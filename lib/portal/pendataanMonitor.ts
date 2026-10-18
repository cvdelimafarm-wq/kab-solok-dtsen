// lib/portal/pendataanMonitor.ts  (hanya server)
//
// (18 Okt 2026) Tab Monitoring di Kelola Pendataan (admin) -- Fase 1: Progres petugas. HANYA-BACA: tidak menulis apa pun.
// Mengumpulkan data (petugas aktif, Sub SLS tiap tim, Sub SLS non aktif, ringkasan KK per tim) lalu menyusunnya dengan
// fungsi murni susunMonitoring (lib/pendataanMonitor.ts). Hasil disimpan sebentar di memori supaya refresh otomatis ringan.

import type { Db } from "@/lib/sigap";
import { monitoringIdentifikasi } from "@/lib/portal/identifikasi";
import { susunMonitoring, type BarisKkMon, type DataMonitoringPendataan, type HasilMon, type IdfMon, type PetugasMon, type SubMon } from "@/lib/pendataanMonitor";

const TTL_MS = 45_000;
/** Bahan mentah yang juga dipakai Fase 2-4 (lib/portal/pendataanKinerja.ts) supaya tidak membaca ulang. */
export type Mentah = { petugas: PetugasMon[]; sub: SubMon[]; nonaktif: Set<string>; baris: BarisKkMon[]; idf: IdfMon[] };
export type HasilMuat = { data: DataMonitoringPendataan; mentah: Mentah };
let simpan: { waktu: number; hasil: HasilMuat } | null = null;
let sedangMuat: Promise<HasilMuat> | null = null;

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const HASIL: HasilMon[] = ["terdampak", "tidak_terdampak", "tidak_ditemukan"];

async function halaman<T>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await ambil(dari, dari + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function muat(db: Db): Promise<HasilMuat> {
  // 1) petugas aktif (PML / PPL) + akunnya
  const pt = await halaman<{ id: number; nama: string; peran: string; atasan_id: number | null }>((a, b) =>
    db.from("bencana_petugas").select("id, nama, peran, atasan_id").eq("aktif", true).in("peran", ["pml", "ppl"]).order("id").range(a, b),
  );
  const ids = pt.map((p) => p.id);
  const akun = ids.length
    ? await halaman<{ id: number; petugas_bencana_id: number }>((a, b) => db.from("sigap_akun").select("id, petugas_bencana_id").in("petugas_bencana_id", ids).eq("aktif", true).order("id").range(a, b))
    : [];
  const akunPer = new Map<number, number[]>();
  for (const a of akun) akunPer.set(a.petugas_bencana_id, [...(akunPer.get(a.petugas_bencana_id) ?? []), a.id]);
  const petugas: PetugasMon[] = pt.map((p) => ({ petugas_id: p.id, nama: p.nama, peran: p.peran === "pml" ? "pml" : "ppl", atasan_id: p.atasan_id, akun_ids: akunPer.get(p.id) ?? [] }));
  const pmlIds = petugas.filter((p) => p.peran === "pml").map((p) => p.petugas_id);

  // 2) Sub SLS tiap tim (plotting + pengajuan Kolam wilayah sudah berada di bencana_alokasi_subsls)
  const alok = await halaman<{ idsubsls: string; pml_id: number | null }>((a, b) => db.from("bencana_alokasi_subsls").select("idsubsls, pml_id").not("pml_id", "is", null).order("idsubsls").range(a, b));
  const pmlSet = new Set(pmlIds);
  const sub: SubMon[] = alok.filter((x) => x.pml_id != null && pmlSet.has(x.pml_id)).map((x) => ({ idsubsls: x.idsubsls, pml_id: x.pml_id as number }));

  // 3) Sub SLS non aktif (dibekukan). Kolom baru ada setelah migrasi 20261018a; bila belum ada, semuanya dianggap aktif.
  const nonaktif = new Set<string>();
  const unik = Array.from(new Set(sub.map((s) => s.idsubsls)));
  for (let i = 0; i < unik.length; i += 200) {
    const { data, error } = await db.from("bencana_wilayah").select("idsubsls").in("idsubsls", unik.slice(i, i + 200)).eq("nonaktif", true);
    if (error) break;
    for (const r of data ?? []) nonaktif.add(r.idsubsls as string);
  }

  // 4) ringkasan KK per tim (fungsi database yang sama dengan Lembar Pendataan), beberapa tim sekaligus
  const baris: BarisKkMon[] = [];
  for (let i = 0; i < pmlIds.length; i += 6) {
    const hasil = await Promise.all(
      pmlIds.slice(i, i + 6).map(async (pml) => {
        const { data, error } = await db.rpc("bencana_pendataan_ringkas", { p_pml: pml });
        if (error) throw new Error(`Gagal memuat ringkasan tim: ${error.message}`);
        return ((data ?? []) as Record<string, unknown>[]).map(
          (r): BarisKkMon => ({
            pml_id: pml,
            idsubsls: String(r.idsubsls),
            ppl_akun_id: r.ppl_akun_id == null ? null : n(r.ppl_akun_id),
            hasil: HASIL.includes(r.hasil as HasilMon) ? (r.hasil as HasilMon) : null,
            jumlah: n(r.jumlah),
          }),
        );
      }),
    );
    for (const h of hasil) baris.push(...h);
  }

  // 5) progres identifikasi Sub SLS per PML (pelaksana) -- pelengkap rekap PML; bila gagal, kolomnya dikosongkan saja
  let idf: IdfMon[] = [];
  try {
    const m = await monitoringIdentifikasi(db);
    idf = m.pml.map((x) => ({ pml_id: x.id, ditugaskan: x.ringkas.total, selesai: x.ringkas.terisi }));
  } catch {
    idf = [];
  }

  return { data: susunMonitoring({ petugas, sub, nonaktif, baris, idf }), mentah: { petugas, sub, nonaktif, baris, idf } };
}

/** Data + bahan mentah Monitoring Pendataan (cache ~45 detik; permintaan serentak berbagi satu pemuatan). */
export async function muatMonitoringPendataan(db: Db, paksa = false): Promise<HasilMuat> {
  if (!paksa && simpan && Date.now() - simpan.waktu < TTL_MS) return simpan.hasil;
  if (!sedangMuat) {
    sedangMuat = muat(db)
      .then((hasil) => {
        simpan = { waktu: Date.now(), hasil };
        return hasil;
      })
      .finally(() => {
        sedangMuat = null;
      });
  }
  return sedangMuat;
}

/** Data Monitoring Pendataan (Fase 1: progres petugas). */
export async function monitoringPendataan(db: Db, paksa = false): Promise<DataMonitoringPendataan> {
  return (await muatMonitoringPendataan(db, paksa)).data;
}
