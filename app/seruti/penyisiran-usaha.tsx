"use client";

// app/seruti/penyisiran-usaha.tsx
//
// Tab "Penyisiran Usaha" -- lembar pengecekan/identifikasi lapangan utk
// daftar keluarga hasil pencocokan SE2026 vs DUTP/DTSEN/PNM Mekar (dari
// script penyisiran_undercoverage_usaha.py, dijalankan OFFLINE di komputer
// BPS Kab Solok karena sumbernya memuat NIK). Data yang sampai ke sini
// (lewat file data_checklist_penyisiran.json yang diupload manual di tab
// ini) SUDAH TIDAK memuat NIK/Nomor KK sama sekali -- lihat komentar di
// bagian atas script Python & migrasi supabase/migrations/20260917_penyisiran_usaha.sql.
//
// Dikunci PIN server-side, role "penyisiran" (lib/penyisiranAuth.ts) --
// BEDA dari pola PIN client-side di tab lain (Rekap Temuan, Kelola
// Anomali), karena di sini yang dilindungi adalah BACAAN nama+alamat+GPS
// warga, bukan cuma akses EDIT ke data yang memang sudah terbuka publik.
//
// Kolom Info PPL/Jorong/Tetangga cuma bisa diubah setelah menekan tombol
// "Edit" (per-kartu) atau "Edit Semua" (global) -- supaya tidak kepencet
// tidak sengaja saat sekadar melihat-lihat daftar. Kolom "Identifikasi
// PPL" ditampilkan read-only di sini (badge) -- diisi dari tab lain
// ("Identifikasi PPL", lihat app/penyisiran/identifikasi-ppl.tsx) yang
// dibagikan ke PPL/mantan pendata dengan PIN yang berbeda.

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MarkerRow } from "./penyisiran-map";

const PenyisiranMap = dynamic(() => import("./penyisiran-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-ink/40">Memuat peta...</div>
  ),
});

const TOKEN_KEY = "penyisiran-token";

type StatusKunjungan = "belum" | "ditemukan" | "tidak_ditemukan" | "tidak_bisa";
type NilaiIdentifikasi = "belum" | "ada" | "tidak_ada" | "ragu";

const STATUS_META: Record<StatusKunjungan, { label: string; badge: string; dot: string }> = {
  belum: { label: "Belum Dikunjungi", badge: "bg-line text-ink/70", dot: "#6b7280" },
  ditemukan: { label: "Usaha Ditemukan", badge: "bg-moss-100 text-moss-700", dot: "#0ca30c" },
  tidak_ditemukan: { label: "Usaha Tidak Ditemukan", badge: "bg-[#FCEFD1] text-[#8A6A12]", dot: "#fab219" },
  tidak_bisa: { label: "Tidak Bisa Ditemui / Pindah", badge: "bg-rust-100 text-rust-700", dot: "#d03b3b" },
};

const IDENTIFIKASI_META: Record<NilaiIdentifikasi, { label: string; className: string }> = {
  belum: { label: "Identifikasi PPL: Belum diisi", className: "border border-line text-ink/40" },
  ada: { label: "Identifikasi PPL: Ada usaha", className: "bg-moss-100 text-moss-700" },
  tidak_ada: { label: "Identifikasi PPL: Tidak ada usaha", className: "bg-rust-100 text-rust-700" },
  ragu: { label: "Identifikasi PPL: Ragu-ragu", className: "bg-[#FCEFD1] text-[#8A6A12]" },
};

type TierPrioritas = "tinggi" | "sedang" | "rendah";

const PRIORITAS_META: Record<TierPrioritas, { label: string; className: string }> = {
  tinggi: { label: "Prioritas Tinggi", className: "bg-rust-100 text-rust-700" },
  sedang: { label: "Prioritas Sedang", className: "bg-[#FCEFD1] text-[#8A6A12]" },
  rendah: { label: "Prioritas Rendah", className: "border border-line text-ink/40" },
};

// Skor skala prioritas kunjungan (0-100), gabungan 3 pertimbangan yg
// diminta -- makin tinggi skornya, makin layak didahulukan disisir:
//  1. Jumlah sumber data yg "mencurigakan ada usaha" (DUTP+DTSEN+PNM
//     Mekar, 0-3 tercentang) -- bobot PALING BESAR (50) krn ini bukti
//     paling langsung ada indikasi usaha.
//  2. Jumlah info tambahan yg sudah dikumpulkan petugas (Info PPL/
//     Jorong/Tetangga, 0-3 tercentang) -- bobot menengah (30), makin
//     banyak yg "Ya" makin menguatkan dugaan ada usaha.
//  3. Ukuran pengelompokan di Sub SLS yg sama (dibandingkan Sub SLS
//     LAIN yg sedang termuat di daftar ini) -- bobot terkecil (20),
//     Sub SLS dgn banyak keluarga bermasalah lebih efisien didahulukan
//     krn sekali jalan bisa menyisir banyak kasus sekaligus. Dihitung
//     dari daftar yg SEDANG DIMUAT (rows, terpengaruh filter & halaman
//     aktif), bukan hitungan global se-kabupaten.
function hitungSkorPrioritas(
  data: Pick<Row, "bukti_dutp" | "bukti_dtsen" | "bukti_pnm" | "info_ppl" | "info_jorong" | "info_tetangga">,
  jumlahDiSubsls: number,
  maxJumlahDiSubsls: number
) {
  const jumlahBukti = (data.bukti_dutp ? 1 : 0) + (data.bukti_dtsen ? 1 : 0) + (data.bukti_pnm ? 1 : 0);
  const jumlahInfo = (data.info_ppl ? 1 : 0) + (data.info_jorong ? 1 : 0) + (data.info_tetangga ? 1 : 0);
  const skorSumber = (jumlahBukti / 3) * 50;
  const skorInfo = (jumlahInfo / 3) * 30;
  const skorKlaster = maxJumlahDiSubsls > 0 ? (jumlahDiSubsls / maxJumlahDiSubsls) * 20 : 0;
  const skor = Math.round(skorSumber + skorInfo + skorKlaster);
  const tier: TierPrioritas = skor >= 60 ? "tinggi" : skor >= 30 ? "sedang" : "rendah";
  return { skor, tier, jumlahBukti, jumlahInfo };
}

interface KecOption {
  kode: string;
  nama: string;
  jumlah: number;
}
interface SubslsOption {
  idsubsls: string;
  label: string; // mis. "JORONG USAK-01"
  jumlah: number;
}
interface Summary {
  total: number;
  belum: number;
  ditemukan: number;
  tidak_ditemukan: number;
  tidak_bisa: number;
  kecamatan: KecOption[];
}
interface PplInfo {
  nama: string;
  no_hp: string;
  korwil: string;
  pml: string;
}
interface Row {
  kode_identitas: string;
  idsubsls: string | null;
  kec_kode: string | null;
  kec_nama: string | null;
  nagari_kode: string | null;
  nagari_nama: string | null;
  sls_kode: string | null;
  sls_nama: string | null;
  subsls_kode: string | null;
  nama_kk: string | null;
  alamat: string | null;
  lat: number | null;
  lng: number | null;
  bukti_dutp: boolean;
  bukti_dtsen: boolean;
  bukti_pnm: boolean;
  pnm_sektor: string | null;
  pnm_subsektor: string | null;
  dtsen_lapangan_usaha: string | null;
  catatan_sensus: string | null;
  status_kunjungan: StatusKunjungan;
  info_ppl: boolean;
  info_jorong: boolean;
  info_tetangga: boolean;
  identifikasi_ppl: NilaiIdentifikasi;
  identifikasi_ppl_at: string | null;
  catatan_petugas: string | null;
  updated_at: string;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = sessionStorage.getItem(TOKEN_KEY);
  if (!t) return null;
  const exp = Number(t.split(".")[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return t;
}

async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
  return data;
}

export default function PenyisiranUsahaTab() {
  const [token, setToken] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    setToken(getToken());
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setPinError(null);
    setPinLoading(true);
    try {
      const res = await fetch("/api/penyisiran/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput, role: "penyisiran" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(data?.error || "PIN salah.");
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
    } catch {
      setPinError("Gagal terhubung. Periksa koneksi internet.");
    } finally {
      setPinLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
        <p className="text-sm font-semibold text-navy-900">Lembar Pengecekan Penyisiran Usaha</p>
        <p className="mt-1 text-xs text-ink/60">
          Berisi nama kepala keluarga, alamat, dan koordinat lokasi warga -- masukkan PIN akses dulu.
        </p>
        <form onSubmit={handleUnlock} className="mt-3 flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
            autoFocus
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <button
            type="submit"
            disabled={pinLoading}
            className="shrink-0 rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {pinLoading ? "..." : "Buka"}
          </button>
        </form>
        {pinError && <p className="mt-2 text-xs text-rust-700">{pinError}</p>}
      </div>
    );
  }

  return <PenyisiranPanel token={token} onSessionExpired={() => setToken(null)} />;
}

function PenyisiranPanel({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [nagariOptions, setNagariOptions] = useState<KecOption[]>([]);
  const [subslsOptions, setSubslsOptions] = useState<SubslsOption[]>([]);
  const [filterKec, setFilterKec] = useState("");
  const [filterNagari, setFilterNagari] = useState("");
  const [filterSubsls, setFilterSubsls] = useState(""); // idsubsls, mis. "JORONG USAK-01"
  const [filterStatus, setFilterStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [markers, setMarkers] = useState<MarkerRow[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [editAllMode, setEditAllMode] = useState(false);
  // Peta tampil setengah layar begitu halaman dibuka, tapi bisa digulung
  // ke atas (disembunyikan) supaya daftar keluarga bisa memakai lebar
  // penuh saat peta sedang tidak dibutuhkan.
  const [mapVisible, setMapVisible] = useState(true);
  const pageSize = 200;

  const guard = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
          sessionStorage.removeItem(TOKEN_KEY);
          onSessionExpired();
        } else {
          setErrMsg(msg);
        }
      }
    },
    [onSessionExpired]
  );

  const loadSummary = useCallback(async () => {
    try {
      const data = await apiFetch("/api/penyisiran/summary", token);
      setSummary(data);
    } catch (e) {
      guard(() => {
        throw e;
      });
    }
  }, [token, guard]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // debounce pencarian teks
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setFilterNagari("");
    if (!filterKec) {
      setNagariOptions([]);
      return;
    }
    apiFetch(`/api/penyisiran/nagari?kec=${encodeURIComponent(filterKec)}`, token)
      .then(setNagariOptions)
      .catch((e) => guard(() => { throw e; }));
  }, [filterKec, token, guard]);

  // Dropdown filter tahap 3: Sub SLS (mis. "JORONG USAK-01") -- baru bisa
  // dipilih setelah kecamatan & nagari dipilih. WAJIB kirim kec+nagari
  // sekaligus (lihat komentar di app/api/penyisiran/subsls/route.ts).
  useEffect(() => {
    setFilterSubsls("");
    if (!filterKec || !filterNagari) {
      setSubslsOptions([]);
      return;
    }
    apiFetch(
      `/api/penyisiran/subsls?kec=${encodeURIComponent(filterKec)}&nagari=${encodeURIComponent(filterNagari)}`,
      token
    )
      .then(setSubslsOptions)
      .catch((e) => guard(() => { throw e; }));
  }, [filterKec, filterNagari, token, guard]);

  const bisaMuat = Boolean(filterKec || search);

  const loadList = useCallback(async () => {
    if (!bisaMuat) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setErrMsg(null);
    try {
      const sp = new URLSearchParams();
      if (filterKec) sp.set("kec", filterKec);
      if (filterNagari) sp.set("nagari", filterNagari);
      if (filterSubsls) sp.set("subsls", filterSubsls);
      if (filterStatus) sp.set("status", filterStatus);
      if (search) sp.set("q", search);
      sp.set("page", String(page));
      const data = await apiFetch(`/api/penyisiran/list?${sp.toString()}`, token);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoading(false);
    }
  }, [bisaMuat, filterKec, filterNagari, filterSubsls, filterStatus, search, page, token, guard]);

  useEffect(() => {
    setPage(1);
  }, [filterKec, filterNagari, filterSubsls, filterStatus, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadMarkers = useCallback(async () => {
    if (!filterKec) {
      setMarkers([]);
      return;
    }
    try {
      const sp = new URLSearchParams({ kec: filterKec });
      if (filterNagari) sp.set("nagari", filterNagari);
      if (filterSubsls) sp.set("subsls", filterSubsls);
      if (filterStatus) sp.set("status", filterStatus);
      const data = await apiFetch(`/api/penyisiran/markers?${sp.toString()}`, token);
      setMarkers(data.markers);
    } catch (e) {
      guard(() => {
        throw e;
      });
    }
  }, [filterKec, filterNagari, filterSubsls, filterStatus, token, guard]);

  useEffect(() => {
    loadMarkers();
  }, [loadMarkers]);

  function refreshAfterEdit(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.kode_identitas === id ? { ...r, ...patch } : r)));
    loadSummary();
    loadMarkers();
  }

  // Peta idsubsls -> jumlah keluarga dgn idsubsls yg sama di daftar yg
  // SEDANG DIMUAT (rows) -- dasar hitungan skor "pengelompokan Sub SLS"
  // di hitungSkorPrioritas(). Cuma sebatas halaman/filter aktif, bukan
  // hitungan global se-kabupaten (lihat komentar di hitungSkorPrioritas).
  const jumlahDiSubslsMap = new Map<string, number>();
  for (const r of rows) {
    if (r.idsubsls) jumlahDiSubslsMap.set(r.idsubsls, (jumlahDiSubslsMap.get(r.idsubsls) ?? 0) + 1);
  }
  const maxJumlahDiSubsls = Math.max(1, ...jumlahDiSubslsMap.values());

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">
          Lembar Pengecekan Penyisiran Undercoverage Usaha
        </h1>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400"
        >
          {showUpload ? "Tutup" : "⬆ Unggah Data"}
        </button>
      </div>

      <div className="rounded-lg border border-line bg-white p-3">
        <p className="text-xs text-ink/70 sm:text-sm">
          Keluarga tercatat <span className="font-semibold text-rust-700">TIDAK ada usaha</span> di SE2026, tapi
          ada indikasi usaha di DUTP/DTSEN/PNM Mekar.
        </p>
        <p className="mt-0.5 text-[11px] text-ink/40">Tidak memuat NIK/Nomor KK.</p>
      </div>

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      {showUpload && <UploadPanel token={token} onDone={() => { loadSummary(); loadList(); loadMarkers(); }} onSessionExpired={onSessionExpired} />}

      {/* ---------- Stat tiles ---------- */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatTile label="Total Keluarga" value={summary.total} color="#41547E" />
          <StatTile label={STATUS_META.belum.label} value={summary.belum} color={STATUS_META.belum.dot} />
          <StatTile label={STATUS_META.ditemukan.label} value={summary.ditemukan} color={STATUS_META.ditemukan.dot} />
          <StatTile
            label={STATUS_META.tidak_ditemukan.label}
            value={summary.tidak_ditemukan}
            color={STATUS_META.tidak_ditemukan.dot}
          />
          <StatTile label={STATUS_META.tidak_bisa.label} value={summary.tidak_bisa} color={STATUS_META.tidak_bisa.dot} />
        </div>
      )}

      {/* ---------- Filter ---------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <select
          value={filterKec}
          onChange={(e) => setFilterKec(e.target.value)}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          <option value="">Pilih Kecamatan...</option>
          {(summary?.kecamatan ?? []).map((k) => (
            <option key={k.kode} value={k.kode}>
              {k.nama} ({k.jumlah})
            </option>
          ))}
        </select>
        <select
          value={filterNagari}
          onChange={(e) => setFilterNagari(e.target.value)}
          disabled={!filterKec}
          className="rounded-md border border-line px-2 py-1.5 text-xs disabled:opacity-50"
        >
          <option value="">Semua Nagari</option>
          {nagariOptions.map((n) => (
            <option key={n.kode} value={n.kode}>
              {n.nama} ({n.jumlah})
            </option>
          ))}
        </select>
        <select
          value={filterSubsls}
          onChange={(e) => setFilterSubsls(e.target.value)}
          disabled={!filterNagari}
          className="rounded-md border border-line px-2 py-1.5 text-xs disabled:opacity-50"
        >
          <option value="">Semua SLS / Sub SLS</option>
          {subslsOptions.map((s) => (
            <option key={s.idsubsls} value={s.idsubsls}>
              {s.label} ({s.jumlah})
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          <option value="">Semua Status</option>
          {(Object.keys(STATUS_META) as StatusKunjungan[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari nama / ID / alamat..."
          className="min-w-[160px] flex-1 rounded-md border border-line px-2 py-1.5 text-xs"
        />
      </div>

      {!bisaMuat && (
        <p className="rounded-lg border border-line bg-white p-4 text-center text-xs text-ink/50">
          Pilih kecamatan (atau ketik pencarian) dulu untuk menampilkan daftar &amp; peta.
        </p>
      )}

      {bisaMuat && (
        <>
          {/* ---------- Map -- PERSIS di bawah baris filter/kolom cari,
              full-width (bukan lagi berdampingan dgn daftar), supaya
              langsung kelihatan begitu filter dipilih. Tetap bisa
              disembunyikan spy tidak makan tempat kalau tidak dibutuhkan. */}
          {mapVisible ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setMapVisible(false)}
                className="self-start rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400"
              >
                ▲ Sembunyikan Peta
              </button>
              <div className="relative h-[50vh] min-h-[320px] overflow-hidden rounded-lg border border-line">
                <PenyisiranMap markers={markers} />
                <div className="absolute bottom-2 left-2 z-[1000] rounded-md border border-line bg-white/95 p-2 text-[11px] shadow">
                  {(Object.keys(STATUS_META) as StatusKunjungan[]).map((s) => (
                    <div key={s} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: STATUS_META[s].dot }}
                      />
                      {STATUS_META[s].label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMapVisible(true)}
              className="flex h-10 items-center justify-center rounded-lg border border-dashed border-line bg-white text-xs font-medium text-navy-700 hover:border-navy-400"
            >
              ▼ Tampilkan Peta
            </button>
          )}

          {/* ---------- List ---------- */}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-ink/50">
              {loading ? "Memuat..." : `${total} keluarga cocok filter ini`}
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <RowCard
                  key={row.kode_identitas}
                  row={row}
                  token={token}
                  editAllMode={editAllMode}
                  jumlahDiSubsls={row.idsubsls ? jumlahDiSubslsMap.get(row.idsubsls) ?? 1 : 1}
                  maxJumlahDiSubsls={maxJumlahDiSubsls}
                  onSaved={refreshAfterEdit}
                  onSessionExpired={onSessionExpired}
                />
              ))}
              {rows.length === 0 && !loading && (
                <p className="rounded-lg border border-line bg-white p-4 text-center text-xs text-ink/40">
                  Tidak ada keluarga untuk filter ini.
                </p>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-2 text-xs">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-line px-2 py-1 disabled:opacity-40"
                >
                  ← Sebelumnya
                </button>
                <span>
                  Halaman {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded border border-line px-2 py-1 disabled:opacity-40"
                >
                  Berikutnya →
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tombol "Edit Semua" MELAYANG di pojok bawah halaman -- supaya
          selalu terjangkau tanpa perlu gulung ke atas dulu, terutama saat
          daftar keluarga panjang. */}
      <button
        onClick={() => setEditAllMode((v) => !v)}
        className={`fixed bottom-5 right-5 z-40 rounded-full border px-4 py-2.5 text-xs font-semibold shadow-lg transition ${
          editAllMode
            ? "border-navy-700 bg-navy-700 text-white"
            : "border-line bg-white text-navy-700 hover:border-navy-400"
        }`}
      >
        {editAllMode ? "🔓 Edit Semua Aktif" : "🔒 Edit Semua Info Lapangan"}
      </button>
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="text-lg font-bold text-navy-900">{value.toLocaleString("id-ID")}</div>
      <div className="mt-0.5 text-[11px] text-ink/60">{label}</div>
    </div>
  );
}

function RowCard({
  row,
  token,
  editAllMode,
  jumlahDiSubsls,
  maxJumlahDiSubsls,
  onSaved,
  onSessionExpired,
}: {
  row: Row;
  token: string;
  editAllMode: boolean;
  jumlahDiSubsls: number;
  maxJumlahDiSubsls: number;
  onSaved: (id: string, patch: Partial<Row>) => void;
  onSessionExpired: () => void;
}) {
  const [status, setStatus] = useState<StatusKunjungan>(row.status_kunjungan);
  const [catatan, setCatatan] = useState(row.catatan_petugas ?? "");
  const [infoPpl, setInfoPpl] = useState(row.info_ppl);
  const [infoJorong, setInfoJorong] = useState(row.info_jorong);
  const [infoTetangga, setInfoTetangga] = useState(row.info_tetangga);
  const [unlocked, setUnlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");
  // "Riwayat Pendataan": nama + No HP PPL yg dulu dialokasikan ke ID Sub
  // SLS keluarga ini (tabel ppl_alokasi_idsls/ppl_akun) -- dimuat ON
  // DEMAND (baru fetch pas tombolnya ditekan pertama kali, lalu di-cache
  // di state ini) supaya tidak membebani daftar yg bisa ratusan kartu.
  const [riwayatOpen, setRiwayatOpen] = useState(false);
  const [riwayatData, setRiwayatData] = useState<PplInfo[] | null>(null);
  const [riwayatLoading, setRiwayatLoading] = useState(false);
  const [riwayatErr, setRiwayatErr] = useState<string | null>(null);
  const canEditInfo = editAllMode || unlocked;
  const dirty =
    status !== row.status_kunjungan ||
    catatan !== (row.catatan_petugas ?? "") ||
    infoPpl !== row.info_ppl ||
    infoJorong !== row.info_jorong ||
    infoTetangga !== row.info_tetangga;
  const meta = STATUS_META[status];
  const identMeta = IDENTIFIKASI_META[row.identifikasi_ppl] ?? IDENTIFIKASI_META.belum;
  // Pakai nilai Info PPL/Jorong/Tetangga yg SEDANG diedit (bukan cuma yg
  // sudah tersimpan) -- supaya skornya langsung ikut naik/turun begitu
  // petugas mencentang, sebagai umpan balik instan sebelum ditekan Simpan.
  const prioritas = hitungSkorPrioritas(
    { bukti_dutp: row.bukti_dutp, bukti_dtsen: row.bukti_dtsen, bukti_pnm: row.bukti_pnm, info_ppl: infoPpl, info_jorong: infoJorong, info_tetangga: infoTetangga },
    jumlahDiSubsls,
    maxJumlahDiSubsls
  );
  const prioritasMeta = PRIORITAS_META[prioritas.tier];

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/penyisiran/update", token, {
        method: "PATCH",
        body: JSON.stringify({
          id: row.kode_identitas,
          status_kunjungan: status,
          catatan_petugas: catatan || null,
          info_ppl: infoPpl,
          info_jorong: infoJorong,
          info_tetangga: infoTetangga,
        }),
      });
      setSaved("ok");
      onSaved(row.kode_identitas, {
        status_kunjungan: status,
        catatan_petugas: catatan,
        info_ppl: infoPpl,
        info_jorong: infoJorong,
        info_tetangga: infoTetangga,
      });
      // Cukup 1x tindakan: begitu tersimpan, kunci lagi Info PPL/Jorong/
      // Tetangga & tampilkan lagi tombol "✎ Edit" -- supaya tidak
      // kepencet lagi tanpa sengaja setelah selesai mengisi.
      setUnlocked(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        sessionStorage.removeItem(TOKEN_KEY);
        onSessionExpired();
        return;
      }
      setSaved("err");
    } finally {
      setSaving(false);
      setTimeout(() => setSaved("idle"), 2000);
    }
  }

  async function toggleRiwayat() {
    if (riwayatOpen) {
      setRiwayatOpen(false);
      return;
    }
    setRiwayatOpen(true);
    if (riwayatData !== null || !row.idsubsls) return; // sudah pernah dimuat / tidak ada idsubsls
    setRiwayatLoading(true);
    setRiwayatErr(null);
    try {
      const data = await apiFetch(`/api/penyisiran/ppl-info?idsubsls=${encodeURIComponent(row.idsubsls)}`, token);
      setRiwayatData(data.ppl ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        sessionStorage.removeItem(TOKEN_KEY);
        onSessionExpired();
        return;
      }
      setRiwayatErr(msg);
    } finally {
      setRiwayatLoading(false);
    }
  }

  const mapsUrl =
    row.lat != null && row.lng != null ? `https://www.google.com/maps?q=${row.lat},${row.lng}` : null;

  return (
    <div
      className="rounded-lg border border-line bg-white p-3"
      style={{ borderLeft: `4px solid ${meta.dot}` }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-navy-900">{row.nama_kk || "(tanpa nama)"}</span>
        <span className="text-[10px] text-ink/40">{row.kode_identitas}</span>
      </div>
      <div className="mt-1">
        <span
          title={`Sumber data (DUTP/DTSEN/PNM): ${prioritas.jumlahBukti}/3 · Info tambahan (PPL/Jorong/Tetangga): ${prioritas.jumlahInfo}/3 · Keluarga lain di Sub SLS yg sama (daftar ini): ${jumlahDiSubsls}`}
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${prioritasMeta.className}`}
        >
          {prioritasMeta.label} &middot; {prioritas.skor}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink/70">{row.alamat || "-"}</p>
      <p className="mb-1.5 text-[11px] text-ink/40">
        {row.nagari_nama} &middot; {row.sls_nama}
        {mapsUrl && (
          <>
            {" "}
            &middot;{" "}
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-navy-400 underline">
              Lihat di peta
            </a>
          </>
        )}
        {!mapsUrl && " · tanpa koordinat"}
      </p>
      <div className="mb-1.5">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${identMeta.className}`}>
          {identMeta.label}
        </span>
      </div>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.bukti_dutp ? "bg-moss-100 text-moss-700" : "border border-line text-ink/40"}`}>
          DUTP {row.bukti_dutp ? "✓" : "-"}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.bukti_dtsen ? "bg-moss-100 text-moss-700" : "border border-line text-ink/40"}`}>
          DTSEN {row.bukti_dtsen ? "✓" : "-"}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.bukti_pnm ? "bg-moss-100 text-moss-700" : "border border-line text-ink/40"}`}>
          PNM Mekar {row.bukti_pnm ? "✓" : "-"}
        </span>
      </div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <InfoToggle label="Info PPL" value={infoPpl} onChange={setInfoPpl} disabled={!canEditInfo} />
        <InfoToggle label="Info Jorong" value={infoJorong} onChange={setInfoJorong} disabled={!canEditInfo} />
        <InfoToggle label="Info Tetangga" value={infoTetangga} onChange={setInfoTetangga} disabled={!canEditInfo} />
        {!canEditInfo && (
          <button
            type="button"
            onClick={() => setUnlocked(true)}
            className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-navy-400 hover:border-navy-400"
          >
            ✎ Edit
          </button>
        )}
      </div>

      {/* Riwayat Pendataan: nama + No HP PPL/mantan pendata yg dulu
          mendata Sub SLS keluarga ini -- supaya petugas penyisiran bisa
          langsung menghubungi kalau perlu konfirmasi lapangan. */}
      <div className="mb-1.5">
        <button
          type="button"
          onClick={toggleRiwayat}
          className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-navy-400 hover:border-navy-400"
        >
          🕘 Riwayat Pendataan {riwayatOpen ? "▲" : "▼"}
        </button>
        {riwayatOpen && (
          <div className="mt-1.5 rounded-md border border-line bg-paper/60 p-2 text-[11px]">
            {riwayatLoading && <span className="text-ink/40">Memuat...</span>}
            {!riwayatLoading && riwayatErr && <span className="text-rust-700">Gagal memuat: {riwayatErr}</span>}
            {!riwayatLoading && !riwayatErr && riwayatData && riwayatData.length === 0 && (
              <span className="text-ink/40">Tidak ada PPL yang dialokasikan ke Sub SLS ini.</span>
            )}
            {!riwayatLoading && !riwayatErr && riwayatData && riwayatData.length > 0 && (
              <div className="space-y-1">
                {riwayatData.map((p, i) => {
                  const hpBersih = p.no_hp.replace(/\D/g, "");
                  const hpWa = hpBersih.startsWith("0") ? `62${hpBersih.slice(1)}` : hpBersih;
                  return (
                    <div key={i}>
                      <span className="font-semibold text-navy-900">{p.nama || "(tanpa nama)"}</span>
                      {p.no_hp ? (
                        <>
                          {" "}
                          &middot;{" "}
                          <a
                            href={`https://wa.me/${hpWa}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-navy-400 underline"
                          >
                            {p.no_hp}
                          </a>
                        </>
                      ) : (
                        <span className="text-ink/40"> &middot; tanpa No HP</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusKunjungan)}
          className="rounded-md border border-line px-2 py-1 text-xs"
        >
          {(Object.keys(STATUS_META) as StatusKunjungan[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <input
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Catatan petugas..."
          className="min-w-[140px] flex-1 rounded-md border border-line px-2 py-1 text-xs"
        />
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={`shrink-0 rounded-md px-3 py-1 text-xs font-semibold text-white disabled:opacity-30 ${
            saved === "ok" ? "bg-moss-500" : saved === "err" ? "bg-rust-500" : "bg-navy-700 hover:bg-navy-900"
          }`}
        >
          {saving ? "..." : saved === "ok" ? "✓ Tersimpan" : saved === "err" ? "Gagal" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

function InfoToggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!value);
      }}
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
        value ? "bg-moss-100 text-moss-700" : "border border-line text-ink/40 hover:border-navy-400"
      } ${disabled ? "cursor-not-allowed opacity-50 hover:border-line" : ""}`}
    >
      {label}: {value ? "Ada" : "Tidak"}
    </button>
  );
}

function UploadPanel({
  token,
  onDone,
  onSessionExpired,
}: {
  token: string;
  onDone: () => void;
  onSessionExpired: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const BATCH_SIZE = 2000;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("Membaca file...");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("Format file tidak sesuai (harus berupa daftar/array).");

      let totalBaru = 0;
      let totalDiperbarui = 0;
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        setStatus(`Mengunggah ${Math.min(i + BATCH_SIZE, data.length)} / ${data.length} baris...`);
        const res = await apiFetch("/api/penyisiran/upload", token, {
          method: "POST",
          body: JSON.stringify({ rows: batch }),
        });
        totalBaru += res.baru ?? 0;
        totalDiperbarui += res.diperbarui ?? 0;
      }
      setStatus(`Selesai: ${totalBaru} keluarga baru, ${totalDiperbarui} diperbarui (checklist yang sudah diisi tetap dipertahankan).`);
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        sessionStorage.removeItem(TOKEN_KEY);
        onSessionExpired();
        return;
      }
      setStatus(`Gagal: ${msg}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3 text-xs">
      <p className="mb-2 text-ink/70">
        Unggah file <code>data_checklist_penyisiran.json</code> (hasil script Python di komputer BPS). Boleh
        diulang kapan saja -- checklist yang sudah diisi petugas TIDAK akan hilang/tertimpa.
      </p>
      <input ref={fileRef} type="file" accept=".json" onChange={handleFile} disabled={busy} className="text-xs" />
      {status && <p className="mt-2 text-ink/60">{status}</p>}
    </div>
  );
}
