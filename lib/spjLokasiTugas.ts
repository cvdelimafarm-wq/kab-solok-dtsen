// lib/spjLokasiTugas.ts
//
// Fungsi BERSAMA utk menghitung lokasi tugas (jorong/sub SLS/nagari/
// kecamatan) seorang petugas pada SATU tanggal, dari DUA sumber aktivitas
// yang mungkin tercatat pada tanggal itu:
//   1) lokasiPenyisiran -- dari tab "Penyisiran Usaha" (status_kunjungan),
//      DIPRIORITASKAN krn aktivitas ini WAJIB sejak 20 Sept 2026. Ditarik
//      dgn join kode_identitas: penyisiran_riwayat -> penyisiran_usaha.
//   2) lokasi -- dari tab "Identifikasi Jorong/Tetangga"
//      (identifikasi_ppl_*), FALLBACK kalau (1) kosong (mis. laporan lama
//      sblm Penyisiran Usaha wajib, atau petugas cuma sempat identifikasi
//      tanpa sempat update status kunjungan).
//
// Dipakai BERSAMA oleh:
//  - hitungRekapTemplate() (app/api/penyisiran/spj/laporan/route.ts) --
//    utk field lokasi/lokasiPenyisiran pd rekap_snapshot Laporan.
//  - Generator PDF "Lampiran Dokumentasi Kegiatan" (lib/pdf/dokumentasi.ts,
//    via route Dokumentasi & Cetak SPJ) -- field "Lokasi" pd blok
//    identitas, dihitung LANGSUNG (bukan menumpang rekap_snapshot Laporan
//    yg mungkin belum ada) supaya tidak pernah "-" selama ada aktivitas.
//
// SATU sumber logic ini memastikan "Lokasi" di Dokumentasi & "Wilayah
// tugas"/tabel lokasi di Laporan SELALU konsisten utk kombinasi
// petugas+tanggal yg sama (permintaan eksplisit user: jangan sampai dua
// dokumen SPJ yg berbeda menyebut wilayah yg berbeda utk hari yg sama).

import { SupabaseClient } from "@supabase/supabase-js";
import type { SpjPetugasJenis } from "./spjAuth";
import { roleUntukJenis } from "./spjAuth";
import { judulKecamatan } from "./spjFormat";

export interface LokasiTugasRow {
  kecNama: string | null;
  nagariNama: string | null;
  slsNama: string | null;
  subslsKode: string | null;
  waktuMulai: string | null;
  waktuSelesai: string | null;
  jumlah: number;
}

export interface LokasiTugasHasil {
  lokasi: LokasiTugasRow[]; // Identifikasi Jorong/Tetangga (fallback)
  lokasiPenyisiran: LokasiTugasRow[]; // Penyisiran Usaha (utama)
}

function tanggalBerikutnya(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function hitungLokasiTugas(
  supabase: SupabaseClient,
  opts: { nama: string; jenis: SpjPetugasJenis; tanggal: string }
): Promise<LokasiTugasHasil> {
  const { nama, jenis, tanggal } = opts;
  const batasAtas = tanggalBerikutnya(tanggal);

  const [{ data: rows, error: errRows }, { data: riwayat, error: errRiwayat }] = await Promise.all([
    supabase
      .from("penyisiran_usaha")
      .select("kec_nama, nagari_nama, sls_nama, subsls_kode, identifikasi_ppl_at")
      .eq("identifikasi_ppl_role", roleUntukJenis(jenis))
      .eq("identifikasi_ppl_oleh", nama)
      .gte("identifikasi_ppl_at", `${tanggal}T00:00:00+07:00`)
      .lt("identifikasi_ppl_at", `${batasAtas}T00:00:00+07:00`),
    supabase
      .from("penyisiran_riwayat")
      .select("kode_identitas, created_at")
      .eq("jenis", "status_kunjungan")
      .eq("oleh_nama", nama)
      .gte("created_at", `${tanggal}T00:00:00+07:00`)
      .lt("created_at", `${batasAtas}T00:00:00+07:00`),
  ]);
  if (errRows) throw new Error(errRows.message);
  if (errRiwayat) throw new Error(errRiwayat.message);

  // ---------- lokasi (Identifikasi Jorong/Tetangga) ----------
  const petaIdentifikasi = new Map<string, LokasiTugasRow>();
  for (const r of (rows ?? []) as {
    kec_nama: string | null;
    nagari_nama: string | null;
    sls_nama: string | null;
    subsls_kode: string | null;
    identifikasi_ppl_at: string | null;
  }[]) {
    const key = `${r.kec_nama ?? ""}|${r.nagari_nama ?? ""}|${r.sls_nama ?? ""}|${r.subsls_kode ?? ""}`;
    const at = r.identifikasi_ppl_at;
    const ada = petaIdentifikasi.get(key);
    if (ada) {
      ada.jumlah += 1;
      if (at && (!ada.waktuMulai || at < ada.waktuMulai)) ada.waktuMulai = at;
      if (at && (!ada.waktuSelesai || at > ada.waktuSelesai)) ada.waktuSelesai = at;
    } else {
      petaIdentifikasi.set(key, {
        kecNama: r.kec_nama,
        nagariNama: r.nagari_nama,
        slsNama: r.sls_nama,
        subslsKode: r.subsls_kode,
        waktuMulai: at,
        waktuSelesai: at,
        jumlah: 1,
      });
    }
  }
  const lokasi = [...petaIdentifikasi.values()].sort((a, b) => (a.waktuMulai ?? "").localeCompare(b.waktuMulai ?? ""));

  // ---------- lokasiPenyisiran (Penyisiran Usaha, via join kode_identitas) ----------
  const riwayatRows = (riwayat ?? []) as { kode_identitas: string | null; created_at: string }[];
  const kodeUnik = [...new Set(riwayatRows.map((r) => r.kode_identitas).filter((k): k is string => !!k))];
  const lokasiUsahaMap = new Map<
    string,
    { kec_nama: string | null; nagari_nama: string | null; sls_nama: string | null; subsls_kode: string | null }
  >();
  if (kodeUnik.length > 0) {
    const { data: usahaRows, error: errUsaha } = await supabase
      .from("penyisiran_usaha")
      .select("kode_identitas, kec_nama, nagari_nama, sls_nama, subsls_kode")
      .in("kode_identitas", kodeUnik);
    if (errUsaha) throw new Error(errUsaha.message);
    for (const u of (usahaRows ?? []) as {
      kode_identitas: string;
      kec_nama: string | null;
      nagari_nama: string | null;
      sls_nama: string | null;
      subsls_kode: string | null;
    }[]) {
      lokasiUsahaMap.set(u.kode_identitas, u);
    }
  }

  const petaPenyisiran = new Map<string, LokasiTugasRow>();
  for (const r of riwayatRows) {
    const u = r.kode_identitas ? lokasiUsahaMap.get(r.kode_identitas) : undefined;
    const key = `${u?.kec_nama ?? ""}|${u?.nagari_nama ?? ""}|${u?.sls_nama ?? ""}|${u?.subsls_kode ?? ""}`;
    const at = r.created_at;
    const ada = petaPenyisiran.get(key);
    if (ada) {
      ada.jumlah += 1;
      if (at && (!ada.waktuMulai || at < ada.waktuMulai)) ada.waktuMulai = at;
      if (at && (!ada.waktuSelesai || at > ada.waktuSelesai)) ada.waktuSelesai = at;
    } else {
      petaPenyisiran.set(key, {
        kecNama: u?.kec_nama ?? null,
        nagariNama: u?.nagari_nama ?? null,
        slsNama: u?.sls_nama ?? null,
        subslsKode: u?.subsls_kode ?? null,
        waktuMulai: at,
        waktuSelesai: at,
        jumlah: 1,
      });
    }
  }
  const lokasiPenyisiran = [...petaPenyisiran.values()].sort((a, b) => (a.waktuMulai ?? "").localeCompare(b.waktuMulai ?? ""));

  return { lokasi, lokasiPenyisiran };
}

/** Penyisiran Usaha diutamakan (wajib sejak 20 Sept 2026); Identifikasi jadi fallback kalau kosong. */
export function lokasiUtamaDari(hasil: LokasiTugasHasil): LokasiTugasRow[] {
  return hasil.lokasiPenyisiran.length > 0 ? hasil.lokasiPenyisiran : hasil.lokasi;
}

/**
 * Ringkasan 1-baris "Jorong X, Nagari Y, Kecamatan Z" utk field "Lokasi"
 * pd Dokumentasi -- dibatasi (nagari>1 => "N nagari", jorong>3 => "N
 * jorong") supaya tidak membengkak tak terbatas pd kasus petugas yg
 * berpindah banyak wilayah dlm 1 hari (jarang, tapi harus tetap wajar
 * dibaca & tidak merusak layout 1 baris).
 */
export function teksLokasiTugas(hasil: LokasiTugasHasil): string {
  const lok = lokasiUtamaDari(hasil);
  if (lok.length === 0) return "-";
  // Nilai dari DB (master data) tersimpan UPPERCASE -- di-title-case dulu
  // (judulKecamatan, dgn pengecualian angka Romawi) sebelum ditampilkan di
  // dokumen, supaya "JORONG GALANGGANG TANGAH" tampil proper "Jorong
  // Galanggang Tangah". Dedup TETAP dari nilai mentah (case-insensitive
  // lewat toUpperCase implicit di judulKecamatan) supaya tidak ada duplikat
  // krn beda kapitalisasi.
  const nagariUnik = [...new Set(lok.map((l) => (l.nagariNama ?? "").trim()).filter(Boolean))].map(judulKecamatan);
  const kecUnik = [...new Set(lok.map((l) => (l.kecNama ?? "").trim()).filter(Boolean))].map(judulKecamatan);
  const kecTeks = kecUnik.length > 0 ? kecUnik.join(", ") : null;

  if (nagariUnik.length === 0) return kecTeks ? `Kecamatan ${kecTeks}` : "-";
  if (nagariUnik.length > 1) {
    return kecTeks ? `${nagariUnik.length} nagari, Kecamatan ${kecTeks}` : `${nagariUnik.length} nagari`;
  }

  // sls_nama di master data SUDAH menyertakan awalan "JORONG " di dalam
  // nilainya sendiri (mis. "JORONG GALANGGANG TANGAH", bukan cuma
  // "GALANGGANG TANGAH") -- dibuang dulu di sini supaya tidak dobel dgn
  // awalan "Jorong " yang ditambahkan manual di bawah (`Jorong ${jorongTeks}`),
  // yang tadinya menghasilkan "Jorong JORONG GALANGGANG TANGAH".
  const jorongUnik = [...new Set(lok.map((l) => (l.slsNama ?? "").trim()).filter(Boolean))]
    .map((v) => v.replace(/^jorong\s+/i, ""))
    .map(judulKecamatan);
  const jorongTeks = jorongUnik.length === 0 ? null : jorongUnik.length <= 3 ? jorongUnik.join(", ") : `${jorongUnik.length} jorong`;

  const bagian = [
    jorongTeks ? `Jorong ${jorongTeks}` : null,
    `Nagari ${nagariUnik[0]}`,
    kecTeks ? `Kecamatan ${kecTeks}` : null,
  ].filter(Boolean);
  return bagian.join(", ");
}
