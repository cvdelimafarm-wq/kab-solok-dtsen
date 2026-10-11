// lib/portal/lapangan.ts  (hanya server)
//
// (11 Okt 2026) Monitoring Lapangan (admin) -- permintaan user. Hanya-baca: memanggil fungsi database bencana_monitoring_lapangan
// (orang × tanggal, tanggal menurut WIB) dan aturan isian kegiatan Pendataan untuk menilai status translok.

import { aturanDari, type AturanIsian, type Db } from "@/lib/sigap";
import { KEGIATAN_PENDATAAN_ID } from "@/lib/pendataan";
import type { BarisLapangan } from "@/lib/lapangan";

export type DataLapangan = { baris: BarisLapangan[]; aturan: AturanIsian; kegiatan: { id: number; nama: string } | null };

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export async function monitoringLapangan(db: Db, dari: string | null, sampai: string | null): Promise<DataLapangan> {
  const [{ data, error }, { data: keg }] = await Promise.all([
    db.rpc("bencana_monitoring_lapangan", { p_dari: dari, p_sampai: sampai, p_kegiatan: KEGIATAN_PENDATAAN_ID }),
    db.from("sigap_kegiatan").select("id, nama, jenis, wajib_laporan, jumlah_foto").eq("id", KEGIATAN_PENDATAAN_ID).maybeSingle(),
  ]);
  if (error) throw new Error(`Gagal memuat monitoring lapangan: ${error.message}`);
  const baris: BarisLapangan[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    akun_id: n(r.akun_id),
    nama: String(r.nama ?? ""),
    peran: r.peran === "pml" ? "pml" : r.peran === "korwil" ? "korwil" : "ppl",
    pml_id: r.pml_id == null ? null : n(r.pml_id),
    pml_nama: r.pml_nama == null ? null : String(r.pml_nama),
    tanggal: String(r.tanggal ?? "").slice(0, 10),
    sub_idf: n(r.sub_idf),
    kk_berhasil: n(r.kk_berhasil),
    kk_tdk_ditemukan: n(r.kk_tdk_ditemukan),
    agg_sub: n(r.agg_sub),
    agg_kk: n(r.agg_kk),
    hari_kerja: r.hari_kerja === true,
    ada_laporan: r.ada_laporan === true,
    jumlah_foto: n(r.jumlah_foto),
  }));
  return { baris, aturan: aturanDari(keg), kegiatan: keg ? { id: n(keg.id), nama: String(keg.nama ?? "") } : null };
}
