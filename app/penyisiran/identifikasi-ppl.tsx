"use client";

// app/penyisiran/identifikasi-ppl.tsx
//
// Tab "Identifikasi PPL (Mantan Pendata)" -- link + PIN INI yang
// dibagikan ke PPL yang DULU mendata SE2026 di wilayah tsb, utk ditanya
// ulang: seingat PPL, keluarga ini punya usaha atau tidak? (Ada / Tidak
// Ada / Ragu). PIN-nya BEDA dari tab "Penyisiran Usaha" (env
// PENYISIRAN_IDENTIFIKASI_PIN, lihat lib/penyisiranAuth.ts) supaya PIN
// yang dibagikan ke PPL luar tidak ikut membuka detail bukti
// DUTP/DTSEN/PNM Mekar / koordinat GPS -- itu tetap di balik PIN internal
// tab Penyisiran Usaha. Hasil isian di sini otomatis muncul sbg badge
// read-only di tab Penyisiran Usaha (app/seruti/penyisiran-usaha.tsx).
//
// Filter kecamatan/nagari/pencarian sengaja dibuat SAMA polanya dgn tab
// Penyisiran Usaha (endpoint summary & nagari dipakai bersama).

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "identifikasi-ppl-token";

// Halaman ini rencananya ditutup Minggu, 20 September 2026 pukul 12:00 WIB
// -- ditampilkan sbg pengingat di layar PIN maupun di halaman isian.
const PESAN_PENUTUPAN = "Halaman ini akan ditutup pada Minggu, 20 September 2026 pukul 12:00 WIB.";

type NilaiIdentifikasi = "belum" | "ada" | "tidak_ada" | "ragu";

const PILIHAN: { nilai: NilaiIdentifikasi; label: string; className: string }[] = [
  { nilai: "ada", label: "Ada", className: "bg-moss-100 text-moss-700" },
  { nilai: "tidak_ada", label: "Tidak Ada", className: "bg-rust-100 text-rust-700" },
  { nilai: "ragu", label: "Ragu-ragu", className: "bg-[#FCEFD1] text-[#8A6A12]" },
];

interface KecOption {
  kode: string;
  nama: string;
  jumlah: number;
}
interface Summary {
  kecamatan: KecOption[];
}
interface Row {
  kode_identitas: string;
  kec_kode: string | null;
  kec_nama: string | null;
  nagari_kode: string | null;
  nagari_nama: string | null;
  sls_nama: string | null;
  nama_kk: string | null;
  alamat: string | null;
  identifikasi_ppl: NilaiIdentifikasi;
  identifikasi_ppl_at: string | null;
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

export default function IdentifikasiPplTab() {
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
        body: JSON.stringify({ pin: pinInput, role: "identifikasi" }),
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
        <p className="text-sm font-semibold text-navy-900">Identifikasi PPL (Mantan Pendata)</p>
        <p className="mt-1 text-xs text-ink/60">
          Untuk PPL yang dulu mendata SE2026 di wilayah ini -- masukkan PIN akses yang dibagikan ke Anda.
        </p>
        <p className="mt-2 rounded-md bg-rust-100 px-2.5 py-1.5 text-[11px] font-medium text-rust-700">
          ⚠ {PESAN_PENUTUPAN}
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

  return <IdentifikasiPanel token={token} onSessionExpired={() => setToken(null)} />;
}

function IdentifikasiPanel({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [nagariOptions, setNagariOptions] = useState<KecOption[]>([]);
  const [filterKec, setFilterKec] = useState("");
  const [filterNagari, setFilterNagari] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
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
      if (filterStatus) sp.set("status", filterStatus);
      if (search) sp.set("q", search);
      sp.set("page", String(page));
      const data = await apiFetch(`/api/penyisiran/identifikasi-list?${sp.toString()}`, token);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoading(false);
    }
  }, [bisaMuat, filterKec, filterNagari, filterStatus, search, page, token, guard]);

  useEffect(() => {
    setPage(1);
  }, [filterKec, filterNagari, filterStatus, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  function refreshAfterEdit(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.kode_identitas === id ? { ...r, ...patch } : r)));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3 pb-6">
      <div>
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">Identifikasi PPL (Mantan Pendata)</h1>
        <p className="mt-0.5 text-xs text-ink/60 sm:text-sm">
          Seingat Saudara sebagai petugas yang dulu mendata SE2026, apakah keluarga berikut memiliki usaha atau
          tidak?
        </p>
        <p className="mt-2 inline-block rounded-md bg-rust-100 px-2.5 py-1.5 text-xs font-medium text-rust-700">
          ⚠ {PESAN_PENUTUPAN}
        </p>
      </div>

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

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
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          <option value="">Semua Jawaban</option>
          <option value="belum">Belum diisi</option>
          <option value="ada">Ada</option>
          <option value="tidak_ada">Tidak Ada</option>
          <option value="ragu">Ragu-ragu</option>
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
          Pilih kecamatan (atau ketik pencarian) dulu untuk menampilkan daftar keluarga.
        </p>
      )}

      {bisaMuat && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-ink/50">{loading ? "Memuat..." : `${total} keluarga cocok filter ini`}</div>
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <IdentifikasiCard
                key={row.kode_identitas}
                row={row}
                token={token}
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
      )}
    </div>
  );
}

function IdentifikasiCard({
  row,
  token,
  onSaved,
  onSessionExpired,
}: {
  row: Row;
  token: string;
  onSaved: (id: string, patch: Partial<Row>) => void;
  onSessionExpired: () => void;
}) {
  const [nilai, setNilai] = useState<NilaiIdentifikasi>(row.identifikasi_ppl);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");

  async function pilih(v: NilaiIdentifikasi) {
    if (saving) return;
    setSaving(true);
    setNilai(v);
    try {
      await apiFetch("/api/penyisiran/identifikasi", token, {
        method: "PATCH",
        body: JSON.stringify({ id: row.kode_identitas, identifikasi_ppl: v }),
      });
      setSaved("ok");
      onSaved(row.kode_identitas, { identifikasi_ppl: v, identifikasi_ppl_at: new Date().toISOString() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        sessionStorage.removeItem(TOKEN_KEY);
        onSessionExpired();
        return;
      }
      setNilai(row.identifikasi_ppl);
      setSaved("err");
    } finally {
      setSaving(false);
      setTimeout(() => setSaved("idle"), 2000);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-navy-900">{row.nama_kk || "(tanpa nama)"}</span>
        <span className="text-[10px] text-ink/40">{row.kode_identitas}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink/70">{row.alamat || "-"}</p>
      <p className="mb-2 text-[11px] text-ink/40">
        {row.nagari_nama} &middot; {row.sls_nama}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {PILIHAN.map((p) => (
          <button
            key={p.nilai}
            type="button"
            disabled={saving}
            onClick={() => pilih(p.nilai)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
              nilai === p.nilai ? p.className : "border border-line text-ink/50 hover:border-navy-400"
            }`}
          >
            {p.label}
          </button>
        ))}
        {saved === "ok" && <span className="text-[11px] text-moss-700">✓ Tersimpan</span>}
        {saved === "err" && <span className="text-[11px] text-rust-700">Gagal, coba lagi</span>}
      </div>
    </div>
  );
}
