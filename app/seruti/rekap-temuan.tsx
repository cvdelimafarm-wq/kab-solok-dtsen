"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ============================================================================
// Tab "Rekap Temuan & Catatan untuk PPL" — rekap SEMUA temuan anomali
// (VSEN26.KP + VSEN26.M), lintas NKS/kode/status, lengkap dengan nama PPL,
// hasil konfirmasi, dan catatan konfirmasi PPL. Tambahan utama: kolom
// "Catatan BPS untuk PPL" yang BISA DIISI di sini per-temuan — begitu
// disimpan, otomatis tampil ke PPL di kartu Konfirmasi PPL (kotak "Catatan
// BPS Kabupaten", menggantikan rekomendasi umum per kode), lewat kolom
// `rekomendasi_manual` yang memang SUDAH dibaca di sana. Ini pola yang sama
// dengan tabel "Tinjau Komoditas Lainnya" di Kelola Anomali — bedanya di
// sini cakupannya SEMUA kode, bukan cuma KP-11.xxx.
//
// Dikunci PIN sama seperti Kelola Anomali — konfirmasi Anda 16/9 — karena
// catatan yang disimpan di sini langsung tampil ke PPL.
// ============================================================================

type StatusKonfirmasi = "pending" | "sesuai" | "perlu_koreksi" | "salah_entry" | "resolved";

interface TemuanRow {
  id: number;
  kode_anomali: string;
  kelompok: string | null;
  nks: string | null;
  nurt: string | null;
  nama_krt: string | null;
  nama_ppl: string | null;
  status: StatusKonfirmasi;
  catatan_ppl: string | null;
  rekomendasi_manual: string | null;
}

const EDIT_PIN = "3333";

const STATUS_META: Record<StatusKonfirmasi, { label: string; badge: string }> = {
  pending: { label: "Belum Dikonfirmasi", badge: "bg-gold-100 text-gold-600" },
  sesuai: { label: "Sesuai", badge: "bg-moss-100 text-moss-700" },
  perlu_koreksi: { label: "Perlu Koreksi", badge: "bg-rust-100 text-rust-700" },
  salah_entry: { label: "Salah Entry", badge: "bg-navy-400 text-white" },
  resolved: { label: "Selesai", badge: "bg-navy-100 text-navy-600" },
};

const BATAS_BARIS = 1000;

export default function RekapTemuanTab() {
  const [supabase] = useState(() => createClient());

  // ---------- PIN gate (pola sama seperti Kelola Anomali) ----------
  const [pinInput, setPinInput] = useState("");
  const [pinOk, setPinOk] = useState(false);
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("rekap-temuan-pin-ok") === "1") {
      setPinOk(true);
    }
  }, []);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput === EDIT_PIN) {
      setPinOk(true);
      setPinError(false);
      sessionStorage.setItem("rekap-temuan-pin-ok", "1");
    } else {
      setPinError(true);
    }
  }

  // ---------- data ----------
  const [rows, setRows] = useState<TemuanRow[]>([]);
  const [kodeOptions, setKodeOptions] = useState<string[]>([]);
  const [pplOptions, setPplOptions] = useState<string[]>([]);
  const [filterPpl, setFilterPpl] = useState("");
  const [filterKode, setFilterKode] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("kp_anomali_temuan")
      .select("id, kode_anomali, kelompok, nks, nurt, nama_krt, nama_ppl, status, catatan_ppl, rekomendasi_manual");
    if (filterPpl) query = query.eq("nama_ppl", filterPpl);
    if (filterKode) query = query.eq("kode_anomali", filterKode);
    if (filterStatus) query = query.eq("status", filterStatus);
    const { data, error } = await query
      .order("kode_anomali")
      .order("nks")
      .order("nurt")
      .limit(BATAS_BARIS);
    if (error) setDebugError(`Gagal memuat temuan: ${error.message}`);
    else setDebugError(null);
    setRows((data ?? []) as TemuanRow[]);
    setLoading(false);
  }, [supabase, filterPpl, filterKode, filterStatus]);

  // Daftar kode utk dropdown filter — diambil dari kp_anomali_pengaturan
  // (semua kode yang pernah terdaftar), bukan dari kp_anomali_temuan, supaya
  // tidak perlu query terpisah cuma utk cari nilai unik.
  const loadKodeOptions = useCallback(async () => {
    const { data } = await supabase.from("kp_anomali_pengaturan").select("kode").order("kode");
    setKodeOptions((data ?? []).map((r) => r.kode as string));
  }, [supabase]);

  // Daftar nama PPL utk dropdown filter — dari kp_nks_jorong (master mapping
  // NKS/Jorong/PPL yang sudah ada), bukan dari kp_anomali_temuan, supaya
  // konsisten dgn tab Monitoring dan tidak perlu query DISTINCT terpisah.
  const loadPplOptions = useCallback(async () => {
    const { data } = await supabase.from("kp_nks_jorong").select("nama_ppl").order("nama_ppl");
    const unik = Array.from(new Set((data ?? []).map((r) => r.nama_ppl as string).filter(Boolean)));
    unik.sort((a, b) => a.localeCompare(b));
    setPplOptions(unik);
  }, [supabase]);

  useEffect(() => {
    loadKodeOptions();
    loadPplOptions();
  }, [loadKodeOptions, loadPplOptions]);

  useEffect(() => {
    if (pinOk) load();
  }, [pinOk, load]);

  if (!pinOk) {
    return (
      <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
        <p className="text-sm font-semibold text-navy-900">Halaman Terkunci</p>
        <p className="mt-1 text-xs text-ink/60">
          Catatan yang Anda simpan di sini langsung tampil ke PPL di kartu Konfirmasi PPL — masukkan PIN dulu.
        </p>
        <form onSubmit={handleUnlock} className="mt-3 flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900"
          >
            Buka
          </button>
        </form>
        {pinError && <p className="mt-2 text-xs text-rust-700">PIN salah.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-navy-900 sm:text-lg">Rekap Temuan &amp; Catatan untuk PPL</h1>
          <p className="mt-0.5 text-xs text-ink/60 sm:text-sm">
            Semua temuan anomali (VSEN26.KP + VSEN26.M), lengkap dengan hasil &amp; catatan konfirmasi PPL. Isi
            &quot;Catatan BPS untuk PPL&quot; pada baris yang perlu — otomatis tampil di kartu temuan PPL begitu
            disimpan.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </div>

      {debugError && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {debugError}</p>
      )}

      {/* ---------- Filter ---------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <select
          value={filterPpl}
          onChange={(e) => setFilterPpl(e.target.value)}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          <option value="">Semua PPL</option>
          {pplOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={filterKode}
          onChange={(e) => setFilterKode(e.target.value)}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          <option value="">Semua kode</option>
          {kodeOptions.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          <option value="">Semua status</option>
          <option value="pending">Belum Dikonfirmasi</option>
          <option value="sesuai">Sesuai</option>
          <option value="perlu_koreksi">Perlu Koreksi</option>
          <option value="salah_entry">Salah Entry</option>
          <option value="resolved">Selesai</option>
        </select>
        <span className="ml-auto text-xs text-ink/40">
          {rows.length} baris
          {rows.length >= BATAS_BARIS ? " (dibatasi 1000 — persempit filter utk lihat sisanya)" : ""}
        </span>
      </div>

      {/* ---------- Tabel ---------- */}
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-[#2563eb] text-left text-xs font-semibold uppercase tracking-wide text-white">
            <tr>
              <th className="px-3 py-2 font-medium">Kode</th>
              <th className="px-3 py-2 font-medium">NKS</th>
              <th className="px-3 py-2 font-medium">NURT</th>
              <th className="px-3 py-2 font-medium">Nama PPL</th>
              <th className="px-3 py-2 font-medium">Hasil Konfirmasi</th>
              <th className="px-3 py-2 font-medium">Catatan Konfirmasi (PPL)</th>
              <th className="px-3 py-2 font-medium">Catatan BPS untuk PPL</th>
              <th className="w-20 px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RekapRow key={row.id} row={row} supabase={supabase} />
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-xs text-ink/40">
                  Tidak ada temuan untuk filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Baris tabel — dgn state lokal (dirty-tracking) & tombol Kirim, pola sama
// seperti LainnyaRow di Kelola Anomali (edit rekomendasi_manual per baris).
// ============================================================================
function RekapRow({
  row,
  supabase,
}: {
  row: TemuanRow;
  supabase: ReturnType<typeof createClient>;
}) {
  const [catatanBps, setCatatanBps] = useState(row.rekomendasi_manual ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");
  const dirty = catatanBps !== (row.rekomendasi_manual ?? "");
  const meta = STATUS_META[row.status];

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("kp_anomali_temuan")
      .update({ rekomendasi_manual: catatanBps || null })
      .eq("id", row.id);
    setSaving(false);
    setSaved(error ? "err" : "ok");
    if (!error) row.rekomendasi_manual = catatanBps || null;
    setTimeout(() => setSaved("idle"), 2000);
  }

  return (
    <tr className="border-t border-line align-top">
      <td className="px-3 py-2 font-mono text-xs font-semibold text-navy-900">{row.kode_anomali}</td>
      <td className="px-3 py-2 text-xs">{row.nks}</td>
      <td className="px-3 py-2 text-xs">{row.nurt}</td>
      <td className="px-3 py-2 text-xs text-ink/70">{row.nama_ppl || "-"}</td>
      <td className="px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}>{meta.label}</span>
      </td>
      <td className="px-3 py-2 text-xs text-ink/70">{row.catatan_ppl || "-"}</td>
      <td className="px-3 py-2">
        <textarea
          value={catatanBps}
          onChange={(e) => setCatatanBps(e.target.value)}
          rows={2}
          placeholder="Tulis catatan/feedback utk PPL di sini..."
          className="w-full min-w-[260px] rounded border border-line px-1.5 py-1 text-xs outline-none focus:border-navy-400"
        />
      </td>
      <td className="px-3 py-2">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={`w-full rounded px-2 py-1 text-xs font-semibold text-white transition disabled:opacity-30 ${
            saved === "ok" ? "bg-moss-500" : saved === "err" ? "bg-rust-500" : "bg-navy-700 hover:bg-navy-900"
          }`}
        >
          {saving ? "..." : saved === "ok" ? "✓ OK" : saved === "err" ? "Gagal" : "Kirim"}
        </button>
      </td>
    </tr>
  );
}
