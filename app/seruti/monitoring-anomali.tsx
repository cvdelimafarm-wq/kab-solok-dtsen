"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ============================================================================
// Tab "Monitoring Penyelesaian Anomali" — rekap per NKS: berapa sampel (RT)
// yang punya temuan, berapa total temuan awal, berapa sudah dikonfirmasi PPL
// dan berapa yang belum. Sumber NKS/Jorong/PPL dari kp_nks_jorong (master
// mapping yang sudah ada); seluruh angka dihitung dari kp_anomali_temuan
// (gabungan VSEN26.KP + VSEN26.M, SEMUA status — bukan cuma pending).
// ============================================================================

interface MonitorRow {
  nks: string;
  nama_jorong: string;
  nama_ppl: string;
  jumlah_sampel_diperiksa: number; // jumlah NURT unik yg punya temuan
  jumlah_awal: number; // total temuan (semua status, termasuk resolved)
  sudah_dikonfirmasi: number; // status sesuai + perlu_koreksi (PPL sudah menandai)
  belum_konfirmasi: number; // status pending
}

export default function MonitoringAnomaliTab() {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"semua" | "belum" | "sudah">("semua");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: jorongRows, error: jorongErr }, { data: temuanRows, error: temuanErr }] = await Promise.all([
      supabase.from("kp_nks_jorong").select("nks, nama_jorong, nama_ppl").order("nks"),
      supabase.from("kp_anomali_temuan").select("nks, nurt, status"),
    ]);
    if (jorongErr) setDebugError(`Gagal memuat NKS/Jorong: ${jorongErr.message}`);
    else if (temuanErr) setDebugError(`Gagal memuat temuan: ${temuanErr.message}`);
    else setDebugError(null);

    // Agregasi per NKS: jumlah sampel (NURT unik), total awal, sudah/belum konfirmasi.
    const agg = new Map<
      string,
      { nurtSet: Set<string>; total: number; sudah: number; belum: number }
    >();
    for (const t of temuanRows ?? []) {
      const nks = t.nks as string;
      if (!nks) continue;
      const cur = agg.get(nks) ?? { nurtSet: new Set<string>(), total: 0, sudah: 0, belum: 0 };
      if (t.nurt) cur.nurtSet.add(String(t.nurt));
      cur.total += 1;
      if (t.status === "pending") cur.belum += 1;
      else if (t.status === "sesuai" || t.status === "perlu_koreksi") cur.sudah += 1;
      // status 'resolved' dihitung di jumlah_awal (total) tapi bukan sudah/belum konfirmasi
      // — karena itu ditutup otomatis oleh sistem, bukan hasil konfirmasi PPL.
      agg.set(nks, cur);
    }

    const list: MonitorRow[] = (jorongRows ?? []).map((j) => {
      const c = agg.get(j.nks as string) ?? { nurtSet: new Set<string>(), total: 0, sudah: 0, belum: 0 };
      return {
        nks: j.nks as string,
        nama_jorong: j.nama_jorong as string,
        nama_ppl: j.nama_ppl as string,
        jumlah_sampel_diperiksa: c.nurtSet.size,
        jumlah_awal: c.total,
        sudah_dikonfirmasi: c.sudah,
        belum_konfirmasi: c.belum,
      };
    });
    setRows(list);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const jumlahSudah = rows.filter((r) => r.belum_konfirmasi === 0).length;
  const jumlahBelum = rows.length - jumlahSudah;
  const shown = rows.filter((r) => {
    if (filter === "sudah") return r.belum_konfirmasi === 0;
    if (filter === "belum") return r.belum_konfirmasi > 0;
    return true;
  });

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-navy-900 sm:text-lg">Monitoring Penyelesaian Anomali</h1>
          <p className="mt-0.5 text-xs text-ink/60 sm:text-sm">
            Status pemeriksaan anomali (VSEN26.KP + VSEN26.M) per NKS/Jorong.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "\u21bb Muat Ulang"}
        </button>
      </div>

      {debugError && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {debugError}</p>
      )}

      {/* ---------- Ringkasan ---------- */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <button
          onClick={() => setFilter("semua")}
          className={`rounded-lg border p-2.5 ${filter === "semua" ? "border-navy-700 bg-navy-50" : "border-line bg-white"}`}
        >
          <p className="text-lg font-bold text-navy-900">{rows.length}</p>
          <p className="text-[11px] text-ink/60">Total NKS</p>
        </button>
        <button
          onClick={() => setFilter("belum")}
          className={`rounded-lg border p-2.5 ${filter === "belum" ? "border-rust-500 bg-rust-100" : "border-line bg-white"}`}
        >
          <p className="text-lg font-bold text-rust-700">{jumlahBelum}</p>
          <p className="text-[11px] text-ink/60">Belum Selesai</p>
        </button>
        <button
          onClick={() => setFilter("sudah")}
          className={`rounded-lg border p-2.5 ${filter === "sudah" ? "border-moss-500 bg-moss-100" : "border-line bg-white"}`}
        >
          <p className="text-lg font-bold text-moss-700">{jumlahSudah}</p>
          <p className="text-[11px] text-ink/60">Sudah Selesai</p>
        </button>
      </div>

      {/* ---------- Tabel ---------- */}
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-600">
            <tr>
              <th className="px-3 py-2 font-medium">NKS</th>
              <th className="px-3 py-2 font-medium">Nama Jorong</th>
              <th className="px-3 py-2 font-medium">PPL</th>
              <th className="px-3 py-2 font-medium text-center" title="Jumlah RT (NURT) unik yang punya minimal 1 temuan anomali">
                Jml Sampel Diperiksa
              </th>
              <th className="px-3 py-2 font-medium text-center" title="Total temuan yang pernah terdeteksi (semua status, termasuk yang sudah selesai/teratasi otomatis)">
                Jumlah Awal
              </th>
              <th className="px-3 py-2 font-medium text-center" title="Temuan yang sudah ditandai PPL sebagai Sesuai atau Perlu Koreksi">
                Sudah Dikonfirmasi
              </th>
              <th className="px-3 py-2 font-medium text-center" title="Temuan yang masih menunggu diperiksa PPL">
                Belum Konfirmasi
              </th>
              <th className="px-3 py-2 font-medium text-center">Status Pemeriksaan</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.nks} className="border-t border-line">
                <td className="px-3 py-2 font-mono text-xs">{r.nks}</td>
                <td className="px-3 py-2">{r.nama_jorong}</td>
                <td className="px-3 py-2 text-ink/70">{r.nama_ppl}</td>
                <td className="px-3 py-2 text-center">{r.jumlah_sampel_diperiksa}</td>
                <td className="px-3 py-2 text-center">{r.jumlah_awal}</td>
                <td className="px-3 py-2 text-center text-moss-700">{r.sudah_dikonfirmasi}</td>
                <td className="px-3 py-2 text-center">
                  {r.belum_konfirmasi === 0 ? (
                    <span className="text-ink/30">0</span>
                  ) : (
                    <span className="font-semibold text-rust-700">{r.belum_konfirmasi}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      r.belum_konfirmasi === 0 ? "bg-moss-100 text-moss-700" : "bg-rust-100 text-rust-700"
                    }`}
                  >
                    {r.belum_konfirmasi === 0 ? "Sudah" : "Belum"}
                  </span>
                </td>
              </tr>
            ))}
            {shown.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-xs text-ink/40">
                  Tidak ada data untuk filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
