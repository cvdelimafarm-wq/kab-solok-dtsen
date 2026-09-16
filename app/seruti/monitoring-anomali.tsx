"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ============================================================================
// Tab "Monitoring Penyelesaian Anomali" — rekap per NKS: berapa temuan yang
// masih perlu diperiksa (status pending), dan apakah sudah tuntas atau
// belum. Sumber NKS/Jorong/PPL dari kp_nks_jorong (master mapping yang sudah
// ada); jumlah "Perlu Diperiksa" dihitung dari kp_anomali_temuan (gabungan
// VSEN26.KP + VSEN26.M).
// ============================================================================

interface MonitorRow {
  nks: string;
  nama_jorong: string;
  nama_ppl: string;
  perlu_diperiksa: number;
  perlu_diperiksa_kp: number;
  perlu_diperiksa_m: number;
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
      supabase.from("kp_anomali_temuan").select("nks, kode_anomali").eq("status", "pending"),
    ]);
    if (jorongErr) setDebugError(`Gagal memuat NKS/Jorong: ${jorongErr.message}`);
    else if (temuanErr) setDebugError(`Gagal memuat temuan: ${temuanErr.message}`);
    else setDebugError(null);

    // Hitung jumlah pending per NKS, dipecah KP vs M sekaligus digabung.
    const countMap = new Map<string, { kp: number; m: number }>();
    for (const t of temuanRows ?? []) {
      const nks = t.nks as string;
      if (!nks) continue;
      const cur = countMap.get(nks) ?? { kp: 0, m: 0 };
      if (String(t.kode_anomali).startsWith("KP-")) cur.kp += 1;
      else cur.m += 1;
      countMap.set(nks, cur);
    }

    const list: MonitorRow[] = (jorongRows ?? []).map((j) => {
      const c = countMap.get(j.nks as string) ?? { kp: 0, m: 0 };
      return {
        nks: j.nks as string,
        nama_jorong: j.nama_jorong as string,
        nama_ppl: j.nama_ppl as string,
        perlu_diperiksa: c.kp + c.m,
        perlu_diperiksa_kp: c.kp,
        perlu_diperiksa_m: c.m,
      };
    });
    setRows(list);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const jumlahSudah = rows.filter((r) => r.perlu_diperiksa === 0).length;
  const jumlahBelum = rows.length - jumlahSudah;
  const shown = rows.filter((r) => {
    if (filter === "sudah") return r.perlu_diperiksa === 0;
    if (filter === "belum") return r.perlu_diperiksa > 0;
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
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-navy-600">
            <tr>
              <th className="px-3 py-2 font-medium">NKS</th>
              <th className="px-3 py-2 font-medium">Nama Jorong</th>
              <th className="px-3 py-2 font-medium">PPL</th>
              <th className="px-3 py-2 font-medium text-center">Perlu Diperiksa</th>
              <th className="px-3 py-2 font-medium text-center">Status Pemeriksaan</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.nks} className="border-t border-line">
                <td className="px-3 py-2 font-mono text-xs">{r.nks}</td>
                <td className="px-3 py-2">{r.nama_jorong}</td>
                <td className="px-3 py-2 text-ink/70">{r.nama_ppl}</td>
                <td className="px-3 py-2 text-center">
                  {r.perlu_diperiksa === 0 ? (
                    <span className="text-ink/30">0</span>
                  ) : (
                    <span
                      title={`${r.perlu_diperiksa_kp} VSEN26.KP, ${r.perlu_diperiksa_m} VSEN26.M`}
                      className="cursor-help font-semibold text-rust-700"
                    >
                      {r.perlu_diperiksa}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      r.perlu_diperiksa === 0 ? "bg-moss-100 text-moss-700" : "bg-rust-100 text-rust-700"
                    }`}
                  >
                    {r.perlu_diperiksa === 0 ? "Sudah" : "Belum"}
                  </span>
                </td>
              </tr>
            ))}
            {shown.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-ink/40">
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
