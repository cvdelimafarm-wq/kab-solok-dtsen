// lib/sigapLaporanData.ts  (hanya server)
//
// (28 Okt 2026) Pembaca data untuk lampiran Laporan SPJ ("Isi laporan SPJ", lib/sigapLaporanIsi.ts). Membaca pengaturan per kegiatan (tabel
// sigap_laporan_isi_konfig; belum ada/kosong = bawaan) dan catatan lapangan petugas SATU KALI untuk seluruh rentang tanggal laporan, lalu menyusunnya per tanggal
// (lib/sigapLaporanAgregat.ts). Kegagalan membaca satu bagian TIDAK menggagalkan SPJ: bagian itu dilewati (laporan tetap terbit tanpa lampiran tersebut).
//  - PPL: hasil pendataan miliknya.   - PML: hasil seluruh PPL di bawahnya (bencana_petugas.atasan_id), isian identifikasinya, lembar QC miliknya.
//  - korwil: hasil seluruh PPL pada kelompok koordinasinya (bencana_kelompok_tim), lembar QC miliknya.

import type { Db } from "@/lib/sigap";
import { konfigKegiatan } from "@/lib/portal/lembarKonfig";
import { anggotaKelompok, daftarKelompokKortim } from "@/lib/portal/korwilMonitor";
import { KEGIATAN_PENDATAAN_BAWAAN } from "@/lib/portal/pendataan";
import type { KonfigLembar } from "@/lib/lembarKonfig";
import { KOLOM_IDENTIFIKASI, KONFIG_LAPORAN_BAWAAN, normalisasiLaporan, peranLaporan, type DataIsiHarian, type KonfigLaporan } from "@/lib/sigapLaporanIsi";
import { agregatIdentifikasi, agregatPendataan, agregatQc, gabungHarian, type AnggotaIsi, type BarisHarian } from "@/lib/sigapLaporanAgregat";

export type IsiLaporanSpj = { konfig: KonfigLaporan; lembar: KonfigLembar; harian: Map<string, DataIsiHarian> };

/** Pengaturan Isi laporan satu kegiatan (bawaan bila belum disimpan atau tabel belum dibuat). */
export async function konfigLaporanKegiatan(db: Db, kegiatanId: number): Promise<KonfigLaporan> {
  const { data, error } = await db.from("sigap_laporan_isi_konfig").select("konfig").eq("kegiatan_id", kegiatanId).maybeSingle();
  if (error || !data) return KONFIG_LAPORAN_BAWAAN;
  return normalisasiLaporan((data as { konfig: unknown }).konfig);
}

const num = (x: unknown) => Number(x);

/** PPL dalam lingkup laporan (PPL: dirinya; PML: PPL bawahannya; korwil: PPL pada kelompoknya). */
async function lingkupPpl(db: Db, peran: "ppl" | "pml" | "korwil", akunId: number): Promise<AnggotaIsi[]> {
  if (peran === "ppl") return [{ akun_id: akunId, nama: "", peran: "ppl", tim: null }];
  if (peran === "korwil") {
    const hasil = new Map<number, AnggotaIsi>();
    for (const k of await daftarKelompokKortim(db, akunId)) {
      for (const a of (await anggotaKelompok(db, k)) ?? []) if (a.peran === "ppl" && !hasil.has(a.akun_id)) hasil.set(a.akun_id, { akun_id: a.akun_id, nama: a.nama, peran: "ppl", tim: a.pml_nama });
    }
    return Array.from(hasil.values());
  }
  const { data: me } = await db.from("sigap_akun").select("nama, petugas_bencana_id").eq("id", akunId).maybeSingle();
  const pid = me?.petugas_bencana_id == null ? null : num(me.petugas_bencana_id);
  if (pid == null) return [];
  const { data: bawahan } = await db.from("bencana_petugas").select("id").eq("atasan_id", pid);
  const idPetugas = (bawahan ?? []).map((r) => num((r as { id: unknown }).id));
  if (idPetugas.length === 0) return [];
  const { data: akun } = await db.from("sigap_akun").select("id, nama").in("petugas_bencana_id", idPetugas);
  return (akun ?? []).map((a) => ({ akun_id: num((a as { id: unknown }).id), nama: String((a as { nama: unknown }).nama ?? ""), peran: "ppl" as const, tim: String(me?.nama ?? "") || null }));
}

async function halaman<T>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let dari = 0; dari < 20_000; dari += 1000) {
    const { data, error } = await ambil(dari, dari + 999);
    if (error) throw new Error(error.message);
    const b = (data ?? []) as T[];
    out.push(...b);
    if (b.length < 1000) break;
  }
  return out;
}

/**
 * Pengaturan + data harian untuk satu petugas pada kumpulan tanggal laporan. Mengembalikan null bila peran bukan ppl/pml/korwil (supervisor dst.: laporan seperti biasa).
 * Data hanya dibaca bila ada lampiran data yang dicentang untuk peran itu.
 */
export async function ambilIsiLaporan(db: Db, p: { kegiatanId: number; akunId: number; peran: string; tanggal: string[] }): Promise<IsiLaporanSpj | null> {
  const peran = peranLaporan(p.peran);
  if (!peran) return null;
  const [konfig, lembar] = await Promise.all([konfigLaporanKegiatan(db, p.kegiatanId), konfigKegiatan(db, p.kegiatanId)]);
  const on = konfig.peran[peran].lampiran;
  const perluPendataan = on.pendataan || on.pendataan_alasan || on.pendataan_petugas || on.jarak;
  const tanggal = Array.from(new Set(p.tanggal)).sort();
  const harian = new Map<string, DataIsiHarian>();
  if (tanggal.length === 0 || !(perluPendataan || on.identifikasi || on.qc)) return { konfig, lembar, harian };
  const dari = tanggal[0];
  const sampai = tanggal[tanggal.length - 1];

  const bagian: Parameters<typeof gabungHarian>[0] = {};

  if (perluPendataan) {
    try {
      const anggota = await lingkupPpl(db, peran, p.akunId);
      if (anggota.length > 0) {
        const { data, error } = await db.rpc("sigap_isi_harian", { p_akun_ids: anggota.map((a) => a.akun_id), p_dari: dari, p_sampai: sampai, p_kegiatan_id: p.kegiatanId });
        if (error) throw new Error(error.message);
        bagian.pendataan = agregatPendataan(peran, (Array.isArray(data) ? data : []) as BarisHarian[], anggota);
      }
    } catch (e) {
      console.error("[sigapLaporanData] pendataan dilewati:", e instanceof Error ? e.message : e);
    }
  }

  // Identifikasi: alat PML khusus Pendataan Pascabencana (tabel tidak menyimpan kegiatan).
  if (on.identifikasi && peran === "pml" && p.kegiatanId === KEGIATAN_PENDATAAN_BAWAAN) {
    try {
      const awal = new Date(Date.parse(`${dari}T00:00:00+07:00`)).toISOString();
      const akhir = new Date(Date.parse(`${sampai}T00:00:00+07:00`) + 86_400_000).toISOString();
      const baris = await halaman<{ idsubsls: string; diisi_at: string | null } & Record<string, unknown>>((a, b) =>
        db.from("bencana_identifikasi_subsls").select(["idsubsls", "diisi_at", ...KOLOM_IDENTIFIKASI].join(", ")).eq("diisi_oleh_akun", p.akunId).gte("diisi_at", awal).lt("diisi_at", akhir).order("idsubsls").range(a, b)
      );
      bagian.identifikasi = agregatIdentifikasi(baris);
    } catch (e) {
      console.error("[sigapLaporanData] identifikasi dilewati:", e instanceof Error ? e.message : e);
    }
  }

  if (on.qc && (peran === "pml" || peran === "korwil")) {
    try {
      const baris = await halaman<{ tanggal: string; ringkas: unknown }>((a, b) =>
        db.from("sigap_qc_lembar").select("tanggal, ringkas").eq("pemeriksa_akun_id", p.akunId).eq("kegiatan_id", p.kegiatanId).gte("tanggal", dari).lte("tanggal", sampai).order("id").range(a, b)
      );
      bagian.qc = agregatQc(baris.map((r) => ({ tanggal: String(r.tanggal).slice(0, 10), ringkas: r.ringkas })));
    } catch (e) {
      console.error("[sigapLaporanData] QC dilewati:", e instanceof Error ? e.message : e);
    }
  }

  for (const [t, v] of gabungHarian(bagian)) harian.set(t, v);
  return { konfig, lembar, harian };
}
