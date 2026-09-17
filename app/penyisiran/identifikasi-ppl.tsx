"use client";

// app/penyisiran/identifikasi-ppl.tsx
//
// Tab "Identifikasi PPL (Mantan Pendata)" -- dulu dibuka pakai 1 PIN yang
// dibagikan rata ke semua PPL/mantan pendata SE2026 (env
// PENYISIRAN_IDENTIFIKASI_PIN). SEKARANG diganti login PERSONAL: Nama
// Lengkap + Tanggal Lahir (dicocokkan ke tabel ppl_akun, sumbernya sheet
// "PPL (Login)" pada file "Kode Wilayah dan Alokasi IDSLS - Rapi.xlsx").
//
// Konsekuensi login personal ini:
//  1. Daftar keluarga OTOMATIS dibatasi ke ID Sub SLS yang memang
//     dialokasikan ke PPL yang login (tabel ppl_alokasi_idsls) -- PPL
//     TIDAK PERLU LAGI pilih kecamatan/nagari manual seperti sebelumnya.
//  2. Sesi login disimpan di localStorage (bukan sessionStorage) dan
//     berumur panjang (180 hari, lihat lib/penyisiranAuth.ts) supaya
//     besoknya PPL tidak perlu login ulang -- otomatis masuk lagi.
//  3. Nama diambil dari datalist (autocomplete) supaya PPL tidak salah
//     ketik nama sendiri (typo bikin login gagal krn dicocokkan persis).
//
// Hasil isian di sini otomatis muncul sbg badge read-only di tab
// Penyisiran Usaha (app/seruti/penyisiran-usaha.tsx).

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "identifikasi-ppl-login-token";
const NAMA_KEY = "identifikasi-ppl-login-nama";

// Halaman ini rencananya ditutup Minggu, 20 September 2026 pukul 12:00 WIB
// -- ditampilkan sbg pengingat di layar login maupun di halaman isian.
const PESAN_PENUTUPAN = "Halaman ini akan ditutup pada Minggu, 20 September 2026 pukul 12:00 WIB.";

type NilaiIdentifikasi = "belum" | "ada" | "tidak_ada" | "ragu";

const PILIHAN: { nilai: NilaiIdentifikasi; label: string; className: string }[] = [
  { nilai: "ada", label: "Ada", className: "bg-moss-100 text-moss-700" },
  { nilai: "tidak_ada", label: "Tidak Ada", className: "bg-rust-100 text-rust-700" },
  { nilai: "ragu", label: "Ragu-ragu", className: "bg-[#FCEFD1] text-[#8A6A12]" },
];

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

function tokenExpMs(token: string): number {
  // Token role identifikasi_ppl: role.subjectB64.exp.sig (4 bagian) --
  // exp ada di index ke-2. Format lama (3 bagian) exp ada di index ke-1,
  // dijaga juga di sini kalau-kalau ada sisa token lama tersimpan.
  const parts = token.split(".");
  const expStr = parts.length === 4 ? parts[2] : parts[1];
  return Number(expStr);
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = localStorage.getItem(TOKEN_KEY);
  if (!t) return null;
  const exp = tokenExpMs(t);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAMA_KEY);
    return null;
  }
  return t;
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAMA_KEY);
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
  const [nama, setNama] = useState<string | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    setToken(getToken());
    setNama(typeof window !== "undefined" ? localStorage.getItem(NAMA_KEY) : null);
    setCheckedStorage(true);
  }, []);

  function handleLoggedIn(t: string, n: string) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(NAMA_KEY, n);
    setToken(t);
    setNama(n);
  }

  function handleLogout() {
    clearToken();
    setToken(null);
    setNama(null);
  }

  if (!checkedStorage) return null; // hindari kedip layar login sebelum cek localStorage

  if (!token) {
    return <LoginForm onLoggedIn={handleLoggedIn} />;
  }

  return (
    <IdentifikasiPanel
      token={token}
      nama={nama || ""}
      onSessionExpired={handleLogout}
      onLogout={handleLogout}
    />
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (token: string, nama: string) => void }) {
  const [namaOptions, setNamaOptions] = useState<string[]>([]);
  const [namaInput, setNamaInput] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/penyisiran/identifikasi-ppl-names")
      .then((r) => r.json())
      .then((d) => setNamaOptions(Array.isArray(d?.names) ? d.names : []))
      .catch(() => setNamaOptions([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!namaInput.trim() || !tanggalLahir) {
      setError("Isi nama lengkap dan tanggal lahir.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/penyisiran/identifikasi-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama: namaInput, tanggal_lahir: tanggalLahir }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Login gagal.");
        return;
      }
      onLoggedIn(data.token, data.nama);
    } catch {
      setError("Gagal terhubung. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
      <p className="text-sm font-semibold text-navy-900">Identifikasi PPL (Mantan Pendata)</p>
      <p className="mt-1 text-xs text-ink/60">
        Untuk PPL yang dulu mendata SE2026 di wilayah ini -- masukkan nama lengkap dan tanggal lahir Anda. Setelah
        berhasil, Anda tidak perlu login ulang besok.
      </p>
      <p className="mt-2 rounded-md bg-rust-100 px-2.5 py-1.5 text-[11px] font-medium text-rust-700">
        ⚠ {PESAN_PENUTUPAN}
      </p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-2 text-left">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Nama Lengkap</label>
          <input
            list="nama-ppl-options"
            type="text"
            value={namaInput}
            onChange={(e) => setNamaInput(e.target.value)}
            placeholder="Ketik nama lengkap Anda"
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <datalist id="nama-ppl-options">
            {namaOptions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Tanggal Lahir</label>
          <input
            type="date"
            value={tanggalLahir}
            onChange={(e) => setTanggalLahir(e.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
        >
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-rust-700">{error}</p>}
    </div>
  );
}

function IdentifikasiPanel({
  token,
  nama,
  onSessionExpired,
  onLogout,
}: {
  token: string;
  nama: string;
  onSessionExpired: () => void;
  onLogout: () => void;
}) {
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
          onSessionExpired();
        } else {
          setErrMsg(msg);
        }
      }
    },
    [onSessionExpired]
  );

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const sp = new URLSearchParams();
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
  }, [filterStatus, search, page, token, guard]);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  function refreshAfterEdit(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.kode_identitas === id ? { ...r, ...patch } : r)));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">Identifikasi PPL (Mantan Pendata)</h1>
        <button
          type="button"
          onClick={onLogout}
          className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700"
        >
          Keluar
        </button>
      </div>

      <div className="rounded-lg border border-[#F4D77A] bg-[#FCEFD1] p-3">
        <p className="text-xs font-medium text-[#8A6A12] sm:text-sm">
          Seingat Saudara <span className="font-semibold">{nama}</span> sebagai petugas yang dulu mendata SE2026,
          apakah keluarga berikut memiliki usaha atau tidak?
        </p>
      </div>

      <p className="inline-block rounded-md bg-rust-100 px-2.5 py-1.5 text-xs font-medium text-rust-700">
        ⚠ {PESAN_PENUTUPAN}
      </p>

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
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

      <div className="flex flex-col gap-2">
        <div className="text-xs text-ink/50">
          {loading ? "Memuat..." : `${total} keluarga di wilayah yang dialokasikan ke Anda`}
        </div>
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
