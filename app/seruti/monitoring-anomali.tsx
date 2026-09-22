"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ============================================================================
// Tab "Monitoring Penyelesaian Anomali" — rekap per NKS: berapa sampel (RT)
// yang punya temuan, berapa yang sudah SELESAI diperiksa/dikonfirmasi PPL,
// sedang berjalan, atau belum mulai sama sekali. Sumber NKS/Jorong/PPL dari
// kp_nks_jorong (master mapping yang sudah ada); status per-sampel dihitung
// dari kp_anomali_temuan (gabungan VSEN26.KP + VSEN26.M, SEMUA status).
//
// Definisi "sampel" di sini = 1 NURT (RT) yang punya minimal 1 temuan.
// Untuk tiap sampel:
//   - SELESAI   : semua temuan pada sampel itu sudah berstatus non-pending
//                 (sesuai / perlu_koreksi / resolved)
//   - BERJALAN  : sebagian temuan sudah dikonfirmasi, sebagian masih pending
//   - BELUM     : belum ada satupun temuan yang dikonfirmasi (semua pending)
// Status per-NKS mengikuti agregat sampel-nya (lihat hitungStatus()).
// ============================================================================

interface SampelInfo {
  total: number; // jumlah temuan pada sampel (NURT) ini
  confirmed: number; // jumlah temuan yang sudah non-pending
}

interface MonitorRow {
  nks: string;
  nama_jorong: string;
  nama_ppl: string;
  jumlah_sampel: number; // total NURT unik yang punya temuan
  sampel_selesai: number; // NURT yang semua temuannya sudah dikonfirmasi
  sampel_berjalan: number; // NURT yang sebagian temuannya sudah dikonfirmasi
  sampel_belum: number; // NURT yang belum ada temuan yang dikonfirmasi
  jumlah_temuan: number; // total temuan (semua status)
  temuan_dikonfirmasi: number; // total temuan berstatus non-pending
  jumlah_error_konsistensi: number; // total temuan Error Konsistensi (kp_konsistensi_temuan) berstatus aktif
  error_konsistensi_dibaca: number; // dari jumlah di atas, yang sudah ditandai dibaca PPL
}

type TingkatStatus = "selesai" | "berjalan" | "belum_mulai";
type FilterStatus = "semua" | TingkatStatus | "perlu_tindakan";
type SortKey = "progres" | "nks" | "jorong";
type SortDir = "asc" | "desc";

const HALAMAN = 15;

function hitungStatus(r: MonitorRow): TingkatStatus {
  if (r.jumlah_sampel === 0) return "selesai"; // tidak ada temuan sama sekali → tidak ada yang perlu diperiksa
  if (r.sampel_selesai === r.jumlah_sampel) return "selesai";
  if (r.sampel_selesai > 0 || r.sampel_berjalan > 0) return "berjalan";
  return "belum_mulai";
}

function hitungPersen(r: MonitorRow): number {
  if (r.jumlah_sampel === 0) return 100;
  return Math.round((r.sampel_selesai / r.jumlah_sampel) * 100);
}

const STATUS_META: Record<TingkatStatus, { label: string; dot: string; badge: string; bar: string; barTrack: string }> = {
  selesai: { label: "Selesai", dot: "🟢", badge: "bg-moss-100 text-moss-700", bar: "bg-moss-500", barTrack: "bg-moss-100" },
  berjalan: { label: "Berjalan", dot: "🟡", badge: "bg-gold-100 text-gold-600", bar: "bg-gold-400", barTrack: "bg-gold-100" },
  belum_mulai: { label: "Belum Mulai", dot: "🔴", badge: "bg-rust-100 text-rust-700", bar: "bg-rust-500", barTrack: "bg-rust-100" },
};

function ProgressBar({ persen, status }: { persen: number; status: TingkatStatus }) {
  const meta = STATUS_META[status];
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full ${meta.barTrack}`}>
      <div
        className={`h-full rounded-full ${meta.bar} transition-all`}
        style={{ width: `${Math.min(100, Math.max(0, persen))}%` }}
      />
    </div>
  );
}

function StatusPill({ status }: { status: TingkatStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}>
      <span>{meta.dot}</span>
      {meta.label}
    </span>
  );
}

function DetailPanel({ r }: { r: MonitorRow }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-md bg-navy-50 p-3 text-xs sm:grid-cols-4">
      <div>
        <p className="text-ink/50">Jumlah Temuan Awal</p>
        <p className="font-semibold text-navy-900">{r.jumlah_temuan}</p>
      </div>
      <div>
        <p className="text-ink/50">Temuan Dikonfirmasi</p>
        <p className="font-semibold text-moss-700">{r.temuan_dikonfirmasi}</p>
      </div>
      <div>
        <p className="text-ink/50">Sampel Selesai</p>
        <p className="font-semibold text-moss-700">{r.sampel_selesai}</p>
      </div>
      <div>
        <p className="text-ink/50">Sampel Berjalan</p>
        <p className="font-semibold text-gold-600">{r.sampel_berjalan}</p>
      </div>
      <div>
        <p className="text-ink/50">Sampel Belum Mulai</p>
        <p className="font-semibold text-rust-700">{r.sampel_belum}</p>
      </div>
      <div>
        <p className="text-ink/50">Total Sampel</p>
        <p className="font-semibold text-navy-900">{r.jumlah_sampel}</p>
      </div>
      <div>
        <p className="text-ink/50">Error Konsistensi (aktif)</p>
        <p className="font-semibold text-navy-900">{r.jumlah_error_konsistensi}</p>
      </div>
      <div>
        <p className="text-ink/50">Error Konsistensi Sudah Dibaca</p>
        <p className="font-semibold text-moss-700">
          {r.error_konsistensi_dibaca}/{r.jumlah_error_konsistensi}
        </p>
      </div>
    </div>
  );
}

export default function MonitoringAnomaliTab() {
  const [supabase] = useState(() => createClient());
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("semua");
  const [filterPpl, setFilterPpl] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("progres");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tableRef = useRef<HTMLTableElement>(null);
  const cardListRef = useRef<HTMLDivElement>(null);
  const [copyingImage, setCopyingImage] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const salinSebagaiGambar = useCallback(async (target: HTMLElement | null) => {
    if (!target) return;
    setCopyingImage(true);
    setCopyMsg(null);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(target, { backgroundColor: "#ffffff", scale: 2 });
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Gagal membuat gambar dari tabel.");
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard && "write" in navigator.clipboard) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopyMsg("✓ Gambar tabel disalin — silakan tempel (paste / Ctrl+V) ke chat WhatsApp.");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `monitoring-anomali-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setCopyMsg("Perangkat ini tidak mendukung salin gambar langsung — gambar sudah diunduh, silakan kirim manual ke WhatsApp.");
      }
    } catch (err) {
      setCopyMsg(`Gagal menyalin gambar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCopyingImage(false);
      setTimeout(() => setCopyMsg(null), 6000);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: jorongRows, error: jorongErr },
      { data: temuanRows, error: temuanErr },
      { data: konsistensiRows, error: konsistensiErr },
    ] = await Promise.all([
      supabase.from("kp_nks_jorong").select("nks, nama_jorong, nama_ppl").order("nks"),
      supabase.from("kp_anomali_temuan").select("nks, nurt, status"),
      supabase.from("kp_konsistensi_temuan").select("nks, dibaca_at").eq("status", "aktif"),
    ]);
    if (jorongErr) setDebugError(`Gagal memuat NKS/Jorong: ${jorongErr.message}`);
    else if (temuanErr) setDebugError(`Gagal memuat temuan: ${temuanErr.message}`);
    else if (konsistensiErr) setDebugError(`Gagal memuat temuan Error Konsistensi: ${konsistensiErr.message}`);
    else setDebugError(null);

    // Agregasi per NKS, lalu per NURT (sampel), lalu simpulkan status sampel.
    const perNks = new Map<string, Map<string, SampelInfo>>();
    for (const t of temuanRows ?? []) {
      const nks = t.nks as string | null;
      const nurt = t.nurt ? String(t.nurt) : null;
      if (!nks || !nurt) continue;
      let sampelMap = perNks.get(nks);
      if (!sampelMap) {
        sampelMap = new Map();
        perNks.set(nks, sampelMap);
      }
      const cur = sampelMap.get(nurt) ?? { total: 0, confirmed: 0 };
      cur.total += 1;
      if (t.status !== "pending") cur.confirmed += 1;
      sampelMap.set(nurt, cur);
    }

    // Agregasi Error Konsistensi (aktif) per NKS: total & yang sudah ditandai dibaca.
    const konsistensiPerNks = new Map<string, { total: number; dibaca: number }>();
    for (const k of konsistensiRows ?? []) {
      const nks = k.nks as string | null;
      if (!nks) continue;
      const cur = konsistensiPerNks.get(nks) ?? { total: 0, dibaca: 0 };
      cur.total += 1;
      if (k.dibaca_at) cur.dibaca += 1;
      konsistensiPerNks.set(nks, cur);
    }

    const list: MonitorRow[] = (jorongRows ?? []).map((j) => {
      const nks = j.nks as string;
      const sampelMap = perNks.get(nks);
      let selesai = 0;
      let berjalan = 0;
      let belum = 0;
      let jumlahTemuan = 0;
      let temuanOk = 0;
      if (sampelMap) {
        for (const s of sampelMap.values()) {
          jumlahTemuan += s.total;
          temuanOk += s.confirmed;
          if (s.confirmed === 0) belum += 1;
          else if (s.confirmed === s.total) selesai += 1;
          else berjalan += 1;
        }
      }
      const konsistensi = konsistensiPerNks.get(nks);
      return {
        nks,
        nama_jorong: j.nama_jorong as string,
        nama_ppl: j.nama_ppl as string,
        jumlah_sampel: sampelMap ? sampelMap.size : 0,
        sampel_selesai: selesai,
        sampel_berjalan: berjalan,
        sampel_belum: belum,
        jumlah_temuan: jumlahTemuan,
        temuan_dikonfirmasi: temuanOk,
        jumlah_error_konsistensi: konsistensi ? konsistensi.total : 0,
        error_konsistensi_dibaca: konsistensi ? konsistensi.dibaca : 0,
      };
    });
    setRows(list);
    setPage(1);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const withStatus = useMemo(
    () => rows.map((r) => ({ ...r, _status: hitungStatus(r), _persen: hitungPersen(r) })),
    [rows]
  );

  const pplOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.nama_ppl).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const jumlahBelumMulai = withStatus.filter((r) => r._status === "belum_mulai").length;
  const jumlahBerjalan = withStatus.filter((r) => r._status === "berjalan").length;
  const jumlahSelesai = withStatus.filter((r) => r._status === "selesai").length;
  const perluTindakan = jumlahBelumMulai + jumlahBerjalan;

  const totalSampelKeseluruhan = withStatus.reduce((a, r) => a + r.jumlah_sampel, 0);
  const sampelSelesaiKeseluruhan = withStatus.reduce((a, r) => a + r.sampel_selesai, 0);
  const progresKeseluruhan =
    totalSampelKeseluruhan === 0 ? 0 : Math.round((sampelSelesaiKeseluruhan / totalSampelKeseluruhan) * 100);

  let filtered = withStatus.filter((r) => {
    if (filterStatus === "perlu_tindakan" && r._status === "selesai") return false;
    if (filterStatus !== "semua" && filterStatus !== "perlu_tindakan" && r._status !== filterStatus) return false;
    if (filterPpl && r.nama_ppl !== filterPpl) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !r.nks.toLowerCase().includes(q) &&
        !(r.nama_jorong ?? "").toLowerCase().includes(q) &&
        !(r.nama_ppl ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  filtered = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "progres") cmp = a._persen - b._persen;
    else if (sortKey === "nks") cmp = a.nks.localeCompare(b.nks);
    else cmp = (a.nama_jorong ?? "").localeCompare(b.nama_jorong ?? "");
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalHalaman = Math.max(1, Math.ceil(filtered.length / HALAMAN));
  const halamanAman = Math.min(page, totalHalaman);
  const shown = filtered.slice((halamanAman - 1) * HALAMAN, halamanAman * HALAMAN);

  function toggleExpand(nks: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(nks)) next.delete(nks);
      else next.add(nks);
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return "⇅";
    return sortDir === "asc" ? "↑" : "↓";
  }

  function resetFilter() {
    setFilterStatus("semua");
    setFilterPpl("");
    setSearch("");
    setPage(1);
  }

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
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </div>

      {debugError && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {debugError}</p>
      )}

      {/* ---------- Ringkasan ---------- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg border border-line bg-white p-2.5">
          <p className="text-lg font-bold text-navy-900">{rows.length}</p>
          <p className="text-[11px] text-ink/60">Total Jorong/NKS</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-2.5">
          <p className="text-lg font-bold text-navy-900">{totalSampelKeseluruhan}</p>
          <p className="text-[11px] text-ink/60">Total Sampel</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-2.5">
          <p className="text-lg font-bold text-moss-700">{sampelSelesaiKeseluruhan}</p>
          <p className="text-[11px] text-ink/60">
            Sudah Diperiksa
            {totalSampelKeseluruhan > 0 && (
              <span className="text-ink/40"> ({Math.round((sampelSelesaiKeseluruhan / totalSampelKeseluruhan) * 100)}%)</span>
            )}
          </p>
        </div>
        <button
          onClick={() => {
            setFilterStatus("perlu_tindakan");
            setPage(1);
          }}
          className={`rounded-lg border p-2.5 text-left ${
            filterStatus === "perlu_tindakan" ? "border-gold-400 bg-gold-100" : "border-line bg-white"
          }`}
        >
          <p className="text-lg font-bold text-gold-600">{perluTindakan}</p>
          <p className="text-[11px] text-ink/60">Perlu Tindakan</p>
        </button>
        <div className="col-span-2 rounded-lg border border-line bg-white p-2.5 sm:col-span-1">
          <div className="flex items-baseline justify-between">
            <p className="text-lg font-bold text-navy-900">{progresKeseluruhan}%</p>
          </div>
          <p className="mb-1 text-[11px] text-ink/60">Progres Keseluruhan</p>
          <ProgressBar
            persen={progresKeseluruhan}
            status={progresKeseluruhan === 100 ? "selesai" : progresKeseluruhan === 0 ? "belum_mulai" : "berjalan"}
          />
        </div>
      </div>

      {perluTindakan > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gold-400/60 bg-gold-100 p-3">
          <p className="text-xs text-gold-600 sm:text-sm">
            ⚠ Terdapat <span className="font-semibold">{perluTindakan} jorong</span> yang perlu mendapat perhatian —{" "}
            {jumlahBelumMulai} jorong belum mulai diperiksa dan {jumlahBerjalan} jorong masih berjalan (belum selesai).
          </p>
          <button
            onClick={() => {
              setFilterStatus("perlu_tindakan");
              setPage(1);
            }}
            className="shrink-0 rounded-md bg-gold-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Lihat Daftar
          </button>
        </div>
      )}

      {/* ---------- Filter ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "semua", label: `Semua (${rows.length})` },
            { key: "belum_mulai", label: `🔴 Belum Mulai (${jumlahBelumMulai})` },
            { key: "berjalan", label: `🟡 Berjalan (${jumlahBerjalan})` },
            { key: "selesai", label: `🟢 Selesai (${jumlahSelesai})` },
          ] as { key: FilterStatus; label: string }[]
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setFilterStatus(f.key);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filterStatus === f.key
                ? "border-navy-700 bg-navy-700 text-white"
                : "border-line bg-white text-navy-700 hover:border-navy-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari NKS, jorong, atau nama PPL..."
          className="min-w-[200px] flex-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs sm:text-sm"
        />
        <select
          value={filterPpl}
          onChange={(e) => {
            setFilterPpl(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs sm:text-sm"
        >
          <option value="">Semua PPL</option>
          {pplOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {(filterStatus !== "semua" || filterPpl || search) && (
          <button
            onClick={resetFilter}
            className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400"
          >
            Reset
          </button>
        )}
      </div>

      {copyMsg && (
        <p className="rounded-lg border border-navy-400/40 bg-navy-50 px-3 py-2 text-xs text-navy-700">{copyMsg}</p>
      )}

      {/* ---------- Tabel (desktop/laptop) ---------- */}
      <div className="hidden overflow-x-auto rounded-lg border border-line bg-white md:block">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-navy-50/60 px-3 py-1.5">
          <p className="text-[11px] font-medium text-ink/50">
            {shown.length} dari {filtered.length} jorong ditampilkan
          </p>
          <button
            onClick={() => salinSebagaiGambar(tableRef.current)}
            disabled={copyingImage}
            className="shrink-0 rounded-md border border-navy-400 bg-white px-2.5 py-1 text-xs font-medium text-navy-700 hover:bg-navy-50 disabled:opacity-50"
          >
            {copyingImage ? "Menyalin..." : "📋 Salin sebagai Gambar (WA)"}
          </button>
        </div>
        <table ref={tableRef} className="w-full min-w-[900px] text-sm">
          <thead className="bg-[#2563eb] text-left text-xs font-semibold uppercase tracking-wide text-white">
            {/* Baris 1: kelompok kolom -- "Anomali" (Konfirmasi PPL) vs "Error
                Konsistensi", supaya kelihatan jelas dua sumber temuan yang
                beda (kp_anomali_temuan vs kp_konsistensi_temuan) tidak
                tercampur, sesuai arahan Bapak Iqbal 17/9. */}
            <tr>
              <th rowSpan={2} className="cursor-pointer select-none border-b border-line px-3 py-2 align-bottom font-medium" onClick={() => toggleSort("nks")}>
                NKS {sortArrow("nks")}
              </th>
              <th rowSpan={2} className="cursor-pointer select-none border-b border-line px-3 py-2 align-bottom font-medium" onClick={() => toggleSort("jorong")}>
                Nama Jorong {sortArrow("jorong")}
              </th>
              <th rowSpan={2} className="border-b border-line px-3 py-2 align-bottom font-medium">PPL</th>
              <th
                colSpan={6}
                className="border-b border-l border-line bg-gold-100/60 px-3 py-1.5 text-center font-semibold text-gold-700"
                title="Kolom dari tab Konfirmasi PPL (kp_anomali_temuan) -- pemeriksaan anomali per sampel"
              >
                Anomali (Konfirmasi PPL)
              </th>
              <th
                colSpan={2}
                className="border-b border-l border-line bg-navy-100/60 px-3 py-1.5 text-center font-semibold text-navy-700"
                title="Kolom dari tab Error Konsistensi (kp_konsistensi_temuan) -- aturan resmi BPS yang wajib dibaca PPL"
              >
                Error Konsistensi
              </th>
              <th rowSpan={2} className="border-b border-l border-line px-3 py-2 text-center align-bottom font-medium">Aksi</th>
            </tr>
            <tr>
              <th className="border-l border-line px-3 py-2 font-medium text-center" title="Jumlah RT (NURT) unik yang punya minimal 1 temuan anomali">
                Jumlah Sampel
              </th>
              <th className="px-3 py-2 font-medium text-center" title="Sampel yang sudah ada aktivitas pemeriksaan (selesai atau berjalan)">
                Diperiksa
              </th>
              <th className="px-3 py-2 font-medium text-center" title="Sampel yang SEMUA temuannya sudah dikonfirmasi PPL">
                Dikonfirmasi
              </th>
              <th className="px-3 py-2 font-medium text-center" title="Sampel yang belum ada satupun temuan dikonfirmasi">
                Belum
              </th>
              <th className="cursor-pointer select-none px-3 py-2 font-medium" onClick={() => toggleSort("progres")}>
                Progres {sortArrow("progres")}
              </th>
              <th className="px-3 py-2 font-medium text-center">Status</th>
              <th className="border-l border-line px-3 py-2 font-medium text-center" title="Jumlah temuan Error Konsistensi (VSEN26.M) yang masih aktif utk NKS ini">
                Error Konsistensi
              </th>
              <th className="px-3 py-2 font-medium text-center" title="Dari jumlah Error Konsistensi di atas, yang sudah ditandai dibaca PPL">
                Sudah Dibaca
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Fragment key={r.nks}>
                <tr className="border-t border-line align-middle">
                  <td className="px-3 py-2 font-mono text-xs">{r.nks}</td>
                  <td className="px-3 py-2">{r.nama_jorong}</td>
                  <td className="px-3 py-2 text-ink/70">{r.nama_ppl}</td>
                  <td className="border-l border-line px-3 py-2 text-center">{r.jumlah_sampel}</td>
                  <td className="px-3 py-2 text-center">{r.sampel_selesai + r.sampel_berjalan}</td>
                  <td className="px-3 py-2 text-center text-moss-700">{r.sampel_selesai}</td>
                  <td className="px-3 py-2 text-center">
                    {r.sampel_belum === 0 ? (
                      <span className="text-ink/30">0</span>
                    ) : (
                      <span className="font-semibold text-rust-700">{r.sampel_belum}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <ProgressBar persen={r._persen} status={r._status} />
                      </div>
                      <span className="w-9 shrink-0 text-xs font-semibold text-navy-900">{r._persen}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusPill status={r._status} />
                  </td>
                  <td className="border-l border-line px-3 py-2 text-center">
                    {r.jumlah_error_konsistensi === 0 ? (
                      <span className="text-ink/30">0</span>
                    ) : (
                      <span className="font-semibold text-navy-900">{r.jumlah_error_konsistensi}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.jumlah_error_konsistensi === 0 ? (
                      <span className="text-ink/30">-</span>
                    ) : (
                      <span
                        className={`font-semibold ${
                          r.error_konsistensi_dibaca === r.jumlah_error_konsistensi ? "text-moss-700" : "text-gold-600"
                        }`}
                      >
                        {r.error_konsistensi_dibaca}/{r.jumlah_error_konsistensi}
                      </span>
                    )}
                  </td>
                  <td className="border-l border-line px-3 py-2 text-center">
                    <button
                      onClick={() => toggleExpand(r.nks)}
                      className="rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-navy-700 hover:border-navy-400"
                    >
                      {expanded.has(r.nks) ? "Sembunyikan ▴" : "Detail ▾"}
                    </button>
                  </td>
                </tr>
                {expanded.has(r.nks) && (
                  <tr className="border-t border-line bg-navy-50/40">
                    <td colSpan={12} className="px-3 py-3">
                      <DetailPanel r={r} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {shown.length === 0 && !loading && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-xs text-ink/40">
                  Tidak ada data untuk filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Daftar Jorong (kartu, untuk HP) ---------- */}
      <div className="space-y-2 md:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <p className="text-xs font-semibold text-navy-900">Daftar Jorong</p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => toggleSort("progres")}
              className="flex items-center gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-navy-700"
            >
              Urutkan: Progres {sortArrow("progres")}
            </button>
            <button
              onClick={() => salinSebagaiGambar(cardListRef.current)}
              disabled={copyingImage}
              className="shrink-0 rounded-md border border-navy-400 bg-white px-2 py-1 text-xs font-medium text-navy-700 hover:bg-navy-50 disabled:opacity-50"
            >
              {copyingImage ? "Menyalin..." : "📋 Salin Gambar"}
            </button>
          </div>
        </div>

        <div ref={cardListRef} className="space-y-2">
        {shown.map((r) => (
          <div key={r.nks} className="rounded-lg border border-line bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-ink/50">{r.nks}</p>
                <p className="truncate text-sm font-bold text-navy-900">{r.nama_jorong}</p>
                <p className="truncate text-xs text-ink/60">{r.nama_ppl}</p>
              </div>
              <StatusPill status={r._status} />
            </div>

            <div className="mt-2.5 flex items-center justify-between text-xs">
              <p className="text-ink/70">
                <span className="font-semibold text-navy-900">
                  {r.sampel_selesai}/{r.jumlah_sampel}
                </span>{" "}
                diperiksa <span className="text-ink/40">({r.jumlah_sampel} sampel)</span>
              </p>
              <p className="font-semibold text-navy-900">{r._persen}%</p>
            </div>
            <div className="mt-1.5">
              <ProgressBar persen={r._persen} status={r._status} />
            </div>

            <button
              onClick={() => toggleExpand(r.nks)}
              className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-md border border-line py-1.5 text-xs font-medium text-navy-700"
            >
              {expanded.has(r.nks) ? "Sembunyikan detail ▴" : "Lihat detail ▾"}
            </button>
            {expanded.has(r.nks) && (
              <div className="mt-2">
                <DetailPanel r={r} />
              </div>
            )}
          </div>
        ))}

        {shown.length === 0 && !loading && (
          <p className="rounded-lg border border-line bg-white px-3 py-6 text-center text-xs text-ink/40">
            Tidak ada data untuk filter ini.
          </p>
        )}
        </div>
      </div>

      {/* ---------- Pagination ---------- */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/60">
          <p>
            Menampilkan {(halamanAman - 1) * HALAMAN + 1}–{Math.min(halamanAman * HALAMAN, filtered.length)} dari{" "}
            {filtered.length} jorong
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={halamanAman <= 1}
              className="rounded-md border border-line bg-white px-2.5 py-1 font-medium text-navy-700 disabled:opacity-40"
            >
              ‹ Sebelumnya
            </button>
            <span className="px-1">
              Halaman {halamanAman} dari {totalHalaman}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalHalaman, p + 1))}
              disabled={halamanAman >= totalHalaman}
              className="rounded-md border border-line bg-white px-2.5 py-1 font-medium text-navy-700 disabled:opacity-40"
            >
              Berikutnya ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
