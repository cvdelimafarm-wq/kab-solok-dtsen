"use client";

// app/penyisiran/manajemen-target.tsx
//
// Tab "Manajemen Target" -- HANYA bisa diakses 4 nama tertentu (Bambang
// Suryanggono, Deswaty, M. Iqbal Hadi, Wisnu Dwi Jayanto, lihat
// lib/manajemenTargetAkses.ts). Login PAKAI ULANG sistem personal
// (nama + tanggal lahir, role token "penyisiran_petugas") yang SAMA dgn
// tab "Penyisiran Usaha" -- SENGAJA pakai localStorage KEY YANG SAMA
// (lihat konstanta *_KEY di bawah, nilainya harus PERSIS sama dgn di
// app/seruti/penyisiran-usaha.tsx) supaya kalau salah satu dari 4 nama itu
// SUDAH login di tab Penyisiran Usaha, tab ini otomatis ikut terbuka tanpa
// login ulang -- dan sebaliknya. Tidak perlu tabel akun/role baru krn
// keempatnya memang sudah terdaftar di petugas_penyisiran_akun.
//
// Pengecekan "apakah nama ini termasuk pengelola" dilakukan DUA kali:
//  1. Di sini (client) -- cuma utk UX, langsung tampilkan pesan "tidak
//     punya akses" tanpa nunggu API menolak.
//  2. Di SETIAP endpoint /api/penyisiran/target* (server) -- inilah yang
//     SEBENARNYA menentukan boleh/tidak, krn semua petugas penyisiran
//     lain jg punya token role "penyisiran_petugas" yang sama persis.
//
// Isi tab:
//  - "Ringkasan Hasil Identifikasi": rekap status identifikasi_ppl per
//    wilayah, level dropdown Kecamatan/Nagari/Sub SLS (RPC
//    penyisiran_ringkasan_identifikasi). Kolom "Sumber Informasi (Ada)"
//    adalah GRUP header (thead 2 baris) yg menaungi 3 sub-kolom angka
//    polos PPL/Jorong/Keduanya (BUKAN digabung jd satu sel teks -- pernah
//    dicoba, kepanjangan & susah dibaca cepat), berdasarkan kolom
//    ada_konfirmasi_ppl & ada_konfirmasi_jorong (lihat
//    migrasi 20260918_ada_konfirmasi_split.sql & app/api/penyisiran/
//    identifikasi/route.ts) -- selain itu ttp Tidak Ada/Ragu/Belum/Total
//    spt semula. Tiap baris Kecamatan (view "Per Kecamatan") bisa
//    di-unhide (▸) utk menampilkan rincian per Nagari-nya tanpa ganti
//    seluruh tabel -- lihat migrasi 20260918_ringkasan_kec_kode_dan_
//    drilldown.sql (param p_kec_kode & fix bug nagari_kode yg dulu tdk
//    unik lintas kecamatan).
//  - "Target Petugas": target per petugas (tabel petugas_target), dipisah
//    2 jenis tugas:
//     - Identifikasi (Jorong): target_identifikasi_jumlah + satuan
//       (KK/SLS/Nagari/Kecamatan) -- wajib dikunjungi/disisir.
//     - Pendataan (Penyisiran Usaha): target_kunjungan_kk (wajib
//       dikunjungi) + target_berhasil_kk (wajib berhasil didata), satuan
//       selalu KK.
//    Tiap variabel bisa "Terapkan ke Semua Petugas" (nilai sama utk
//    semua) ATAU diedit satu-satu per baris di tabel (auto-simpan saat
//    kolom ditinggalkan / onBlur).

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";
import { useExcelTable, ExcelTh } from "./_shared/excel-table";

// NILAI STRING INI HARUS PERSIS SAMA dgn TOKEN_KEY/NAMA_KEY/
// PETUGAS_ID_STORE_KEY/LAT_KEY/LNG_KEY di app/seruti/penyisiran-usaha.tsx
// -- lihat komentar di atas kenapa (login dibagikan lintas tab).
const TOKEN_KEY = "penyisiran-petugas-login-token";
const NAMA_KEY = "penyisiran-petugas-login-nama";
const PETUGAS_ID_STORE_KEY = "penyisiran-petugas-login-id";
const LAT_KEY = "penyisiran-petugas-login-lat";
const LNG_KEY = "penyisiran-petugas-login-lng";

type JenisTugas = "identifikasi" | "pendataan";
type SatuanIdentifikasi = "kk" | "sls" | "nagari" | "kecamatan";
type Level = "kec" | "nagari" | "subsls";

const SATUAN_LABEL: Record<SatuanIdentifikasi, string> = {
  kk: "KK",
  sls: "SLS/Sub SLS",
  nagari: "Nagari",
  kecamatan: "Kecamatan",
};

const LEVEL_LABEL: Record<Level, string> = {
  kec: "Kecamatan",
  nagari: "Nagari",
  subsls: "SLS/Sub SLS",
};

interface PetugasTarget {
  id: number;
  nama: string;
  aktif: boolean;
  target_identifikasi_jumlah: number | null;
  target_identifikasi_satuan: SatuanIdentifikasi | null;
  target_kunjungan_kk: number | null;
  target_berhasil_kk: number | null;
}

interface RingkasanRow {
  kode: string;
  kec_kode: string;
  kec_nama: string;
  nama: string;
  ada_ppl: number;
  ada_jorong: number;
  ada_keduanya: number;
  belum: number;
  tidak_ada: number;
  ragu: number;
  total: number;
}

function tokenExpMs(t: string): number {
  const parts = t.split(".");
  return Number(parts.length === 4 ? parts[2] : parts[1]);
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = localStorage.getItem(TOKEN_KEY);
  if (!t) return null;
  const exp = tokenExpMs(t);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
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

export default function ManajemenTargetTab() {
  const [token, setToken] = useState<string | null>(null);
  const [nama, setNama] = useState<string | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    setToken(getToken());
    if (typeof window !== "undefined") setNama(localStorage.getItem(NAMA_KEY));
    setCheckedStorage(true);
  }, []);

  function handleLoggedIn(t: string, n: string, petugasId: number, lat: number | null, lng: number | null) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(NAMA_KEY, n);
    localStorage.setItem(PETUGAS_ID_STORE_KEY, String(petugasId));
    if (lat != null) localStorage.setItem(LAT_KEY, String(lat));
    if (lng != null) localStorage.setItem(LNG_KEY, String(lng));
    setToken(t);
    setNama(n);
  }

  function handleGantiAkun() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAMA_KEY);
    localStorage.removeItem(PETUGAS_ID_STORE_KEY);
    localStorage.removeItem(LAT_KEY);
    localStorage.removeItem(LNG_KEY);
    setToken(null);
    setNama(null);
  }

  if (!checkedStorage) return null;

  if (!token) {
    return <LoginForm onLoggedIn={handleLoggedIn} />;
  }

  if (!bolehAksesManajemenTarget(nama)) {
    return (
      <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
        <p className="text-2xl">🔒</p>
        <p className="mt-2 text-sm font-semibold text-navy-900">Akses Terbatas</p>
        <p className="mt-1 text-xs text-ink/60">
          Anda login sebagai <span className="font-semibold text-navy-900">{nama}</span>, tapi tab &ldquo;Manajemen
          Target&rdquo; ini hanya bisa diakses oleh pengelola yang ditentukan.
        </p>
        <button
          type="button"
          onClick={handleGantiAkun}
          className="mt-3 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400"
        >
          Bukan Anda? Ganti Akun
        </button>
      </div>
    );
  }

  return <ManajemenTargetPanel token={token} onSessionExpired={handleGantiAkun} />;
}

// Form login personal (nama + tanggal lahir) -- SAMA PERSIS pola & endpoint
// dgn LoginForm di app/seruti/penyisiran-usaha.tsx (memang akun yg sama).
function LoginForm({
  onLoggedIn,
}: {
  onLoggedIn: (token: string, nama: string, petugasId: number, lat: number | null, lng: number | null) => void;
}) {
  const [namaOptions, setNamaOptions] = useState<string[]>([]);
  const [namaInput, setNamaInput] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/penyisiran/jorong-names")
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
      const res = await fetch("/api/penyisiran/penyisiran-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama: namaInput, tanggal_lahir: tanggalLahir }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Login gagal.");
        return;
      }
      onLoggedIn(data.token, data.nama, data.petugas_id, data.lat ?? null, data.lng ?? null);
    } catch {
      setError("Gagal terhubung. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
      <p className="text-sm font-semibold text-navy-900">Manajemen Target</p>
      <p className="mt-1 text-xs text-ink/60">
        Tab ini khusus pengelola -- masukkan nama lengkap dan tanggal lahir Anda (sama dengan login tab Penyisiran
        Usaha).
      </p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-2 text-left">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Nama Lengkap</label>
          <input
            list="nama-manajemen-target-options"
            type="text"
            value={namaInput}
            onChange={(e) => setNamaInput(e.target.value)}
            placeholder="Ketik nama lengkap Anda"
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <datalist id="nama-manajemen-target-options">
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

function ManajemenTargetPanel({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [jenisTugas, setJenisTugas] = useState<JenisTugas>("identifikasi");
  const [petugas, setPetugas] = useState<PetugasTarget[]>([]);
  const [loadingPetugas, setLoadingPetugas] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const guard = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa|akses terbatas|pengelola yang ditentukan/i.test(msg)) {
          setErrMsg(msg);
        } else {
          setErrMsg(msg);
        }
      }
    },
    []
  );

  const loadPetugas = useCallback(async () => {
    setLoadingPetugas(true);
    setErrMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/target", token);
      setPetugas(data.petugas ?? []);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoadingPetugas(false);
    }
  }, [token, guard]);

  useEffect(() => {
    loadPetugas();
  }, [loadPetugas]);

  async function simpanSatu(petugasId: number, fields: Record<string, number | string | null>) {
    await apiFetch("/api/penyisiran/target", token, {
      method: "PATCH",
      body: JSON.stringify({ petugas_id: petugasId, fields }),
    });
    setPetugas((prev) => prev.map((p) => (p.id === petugasId ? { ...p, ...fields } : p)));
  }

  async function terapkanSemua(fields: Record<string, number | string | null>) {
    await apiFetch("/api/penyisiran/target", token, {
      method: "PATCH",
      body: JSON.stringify({ terapkan_semua: true, fields }),
    });
    setPetugas((prev) => prev.map((p) => ({ ...p, ...fields })));
  }

  return (
    <div className="space-y-4 pb-16">
      <div>
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">Manajemen Target</h1>
        <p className="mt-0.5 text-xs text-ink/50">
          Ringkasan hasil identifikasi per wilayah &amp; pengaturan target wajib per petugas.
        </p>
      </div>

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <RingkasanIdentifikasi token={token} onSessionExpired={onSessionExpired} />

      <div className="rounded-lg border border-line bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-navy-900">🎯 Target Petugas</p>
          <button
            type="button"
            onClick={loadPetugas}
            disabled={loadingPetugas}
            className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
          >
            {loadingPetugas ? "Memuat..." : "↻ Muat Ulang"}
          </button>
        </div>

        {/* Jenis tugas -- menentukan target APA yg ditampilkan/diedit di
            bawah, krn satuan & jumlah variabelnya beda antara Identifikasi
            (1 target, satuan bisa macam2) vs Pendataan (2 target, selalu
            KK). */}
        <div className="mb-3 flex gap-1.5">
          <button
            type="button"
            onClick={() => setJenisTugas("identifikasi")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              jenisTugas === "identifikasi" ? "bg-navy-700 text-white" : "border border-line text-ink/60 hover:border-navy-400"
            }`}
          >
            Identifikasi (Jorong)
          </button>
          <button
            type="button"
            onClick={() => setJenisTugas("pendataan")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              jenisTugas === "pendataan" ? "bg-navy-700 text-white" : "border border-line text-ink/60 hover:border-navy-400"
            }`}
          >
            Pendataan (Penyisiran Usaha)
          </button>
        </div>

        {jenisTugas === "identifikasi" ? (
          <TargetIdentifikasiSection petugas={petugas} onSimpanSatu={simpanSatu} onTerapkanSemua={terapkanSemua} />
        ) : (
          <TargetPendataanSection petugas={petugas} onSimpanSatu={simpanSatu} onTerapkanSemua={terapkanSemua} />
        )}

        {petugas.length === 0 && !loadingPetugas && (
          <p className="mt-2 text-center text-xs text-ink/40">Belum ada petugas terdaftar.</p>
        )}
      </div>
    </div>
  );
}

// ---------- Ringkasan Hasil Identifikasi (per level wilayah) ----------
// Kolom "Sumber Informasi (Ada)" tampil sbg GRUP header (thead 2 baris)
// yg menaungi 3 sub-kolom angka polos (PPL/Jorong/Keduanya) -- sengaja
// TIDAK ditulis ulang jadi teks "PPL 362 · Jorong 26 · Keduanya 0" di tiap
// baris (dicoba sebelumnya, kepanjangan & susah dibaca cepat) -- cukup
// angkanya saja per sub-kolom, label cukup sekali di header.

function RingkasanIdentifikasi({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [level, setLevel] = useState<Level>("kec");
  const [rows, setRows] = useState<RingkasanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Fitur "unhide": tiap baris Kecamatan (level="kec") bisa dibuka utk
  // menampilkan rincian per Nagari-nya TANPA mengganti seluruh tabel ke
  // view "Per Nagari" (dropdown level di atas ttp bisa dipakai spt biasa
  // kalau memang mau lihat SEMUA nagari sekaligus scr flat).
  const [expandedKec, setExpandedKec] = useState<Set<string>>(new Set());
  const [nagariCache, setNagariCache] = useState<Record<string, RingkasanRow[]>>({});
  const [nagariLoading, setNagariLoading] = useState<Record<string, boolean>>({});
  const [nagariErr, setNagariErr] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    setErrMsg(null);
    // Ganti level -> reset semua state drill-down (cuma relevan di level
    // "kec"), spy tdk nyangkut data/cache dari level sebelumnya.
    setExpandedKec(new Set());
    setNagariCache({});
    setNagariErr({});
    apiFetch(`/api/penyisiran/target/ringkasan?level=${level}`, token)
      .then((d) => setRows(d.data ?? []))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
          onSessionExpired();
          return;
        }
        setErrMsg(msg);
      })
      .finally(() => setLoading(false));
  }, [level, token, onSessionExpired]);

  async function toggleKec(kodeKec: string) {
    setExpandedKec((prev) => {
      const next = new Set(prev);
      if (next.has(kodeKec)) next.delete(kodeKec);
      else next.add(kodeKec);
      return next;
    });
    if (nagariCache[kodeKec] || nagariLoading[kodeKec]) return;
    setNagariLoading((p) => ({ ...p, [kodeKec]: true }));
    setNagariErr((p) => ({ ...p, [kodeKec]: "" }));
    try {
      const d = await apiFetch(
        `/api/penyisiran/target/ringkasan?level=nagari&kec=${encodeURIComponent(kodeKec)}`,
        token
      );
      setNagariCache((p) => ({ ...p, [kodeKec]: d.data ?? [] }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        onSessionExpired();
      } else {
        setNagariErr((p) => ({ ...p, [kodeKec]: msg }));
      }
    } finally {
      setNagariLoading((p) => ({ ...p, [kodeKec]: false }));
    }
  }

  // Header tabel pakai komponen bersama ExcelTh/useExcelTable (urutkan &
  // filter per kolom, spt Excel) -- lihat app/penyisiran/_shared/excel-table.tsx.
  // Kolom "nama" labelnya ikut berubah sesuai level dropdown (Kecamatan/
  // Nagari/SLS/Sub SLS) makanya `level` masuk dependency array.
  const kolomRingkasan = useMemo(
    () => [
      { key: "nama", label: LEVEL_LABEL[level], getValue: (r: RingkasanRow) => r.nama },
      { key: "ada_ppl", label: "PPL", getValue: (r: RingkasanRow) => r.ada_ppl },
      { key: "ada_jorong", label: "Jorong", getValue: (r: RingkasanRow) => r.ada_jorong },
      { key: "ada_keduanya", label: "Keduanya", getValue: (r: RingkasanRow) => r.ada_keduanya },
      { key: "belum", label: "Belum", getValue: (r: RingkasanRow) => r.belum },
      { key: "tidak_ada", label: "Tidak Ada", getValue: (r: RingkasanRow) => r.tidak_ada },
      { key: "ragu", label: "Ragu", getValue: (r: RingkasanRow) => r.ragu },
      { key: "total", label: "Total", getValue: (r: RingkasanRow) => r.total },
    ],
    [level]
  );
  const tabelRingkasan = useExcelTable(rows, kolomRingkasan, { key: "nama", dir: "asc" });

  // Baris "Total" di tfoot SENGAJA mengikuti baris yang SEDANG TAMPIL
  // (sesudah filter header), bukan seluruh data -- persis spt baris Total
  // Excel yang ikut menyesuaikan saat Autofilter dipakai.
  const totalAdaPpl = tabelRingkasan.rows.reduce((s, r) => s + r.ada_ppl, 0);
  const totalAdaJorong = tabelRingkasan.rows.reduce((s, r) => s + r.ada_jorong, 0);
  const totalAdaKeduanya = tabelRingkasan.rows.reduce((s, r) => s + r.ada_keduanya, 0);
  const totalBelum = tabelRingkasan.rows.reduce((s, r) => s + r.belum, 0);
  const totalTidakAda = tabelRingkasan.rows.reduce((s, r) => s + r.tidak_ada, 0);
  const totalRagu = tabelRingkasan.rows.reduce((s, r) => s + r.ragu, 0);
  const totalSemua = tabelRingkasan.rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-navy-900">📊 Ringkasan Hasil Identifikasi</p>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as Level)}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
            <option key={l} value={l}>
              Per {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
      </div>

      {level === "kec" && (
        <p className="mb-2 text-[10px] text-ink/40">
          Klik ikon ▸ di depan nama kecamatan utk menampilkan rincian per Nagari.
        </p>
      )}

      {errMsg && <p className="mb-2 text-xs text-rust-700">⚠ {errMsg}</p>}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink/40">
        <p>Klik nama kolom utk urutkan, klik &ldquo;▾&rdquo; di header utk filter (spt Excel).</p>
        {tabelRingkasan.adaFilterAktif && (
          <button type="button" onClick={tabelRingkasan.resetFilters} className="shrink-0 font-medium text-navy-700 hover:underline">
            Reset semua filter
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-paper/60 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              <ExcelTh
                rowSpan={2}
                colKey="nama"
                label={LEVEL_LABEL[level]}
                sortKey={tabelRingkasan.sortKey}
                sortDir={tabelRingkasan.sortDir}
                onSort={tabelRingkasan.toggleSort}
                values={tabelRingkasan.uniqueValues.nama ?? []}
                activeFilter={tabelRingkasan.filters.nama}
                onFilterChange={tabelRingkasan.setColumnFilter}
              />
              <th colSpan={3} className="border-b border-line/60 px-3 py-1 text-center">
                Sumber Informasi (Ada)
              </th>
              {(["belum", "tidak_ada", "ragu", "total"] as const).map((key) => (
                <ExcelTh
                  key={key}
                  rowSpan={2}
                  colKey={key}
                  label={kolomRingkasan.find((k) => k.key === key)!.label}
                  align="right"
                  sortKey={tabelRingkasan.sortKey}
                  sortDir={tabelRingkasan.sortDir}
                  onSort={tabelRingkasan.toggleSort}
                  values={tabelRingkasan.uniqueValues[key] ?? []}
                  activeFilter={tabelRingkasan.filters[key]}
                  onFilterChange={tabelRingkasan.setColumnFilter}
                />
              ))}
            </tr>
            <tr className="border-b border-line bg-paper/60 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              {(["ada_ppl", "ada_jorong", "ada_keduanya"] as const).map((key) => (
                <ExcelTh
                  key={key}
                  colKey={key}
                  label={kolomRingkasan.find((k) => k.key === key)!.label}
                  align="right"
                  sortKey={tabelRingkasan.sortKey}
                  sortDir={tabelRingkasan.sortDir}
                  onSort={tabelRingkasan.toggleSort}
                  values={tabelRingkasan.uniqueValues[key] ?? []}
                  activeFilter={tabelRingkasan.filters[key]}
                  onFilterChange={tabelRingkasan.setColumnFilter}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {tabelRingkasan.rows.map((r) => {
              const bisaDibuka = level === "kec";
              const terbuka = expandedKec.has(r.kode);
              return (
                <Fragment key={r.kode}>
                  <tr className="border-b border-line last:border-0">
                    <td className="px-3 py-1.5 font-medium text-navy-900">
                      {bisaDibuka && (
                        <button
                          type="button"
                          onClick={() => toggleKec(r.kode)}
                          className="mr-1.5 inline-flex w-4 items-center justify-center text-ink/40 hover:text-navy-900"
                          title={terbuka ? "Sembunyikan rincian per Nagari" : "Tampilkan rincian per Nagari"}
                        >
                          {terbuka ? "▾" : "▸"}
                        </button>
                      )}
                      {level === "nagari" ? `${r.nama} — ${r.kec_nama}` : r.nama}
                    </td>
                    <td className="px-3 py-1.5 text-right text-moss-700">{r.ada_ppl}</td>
                    <td className="px-3 py-1.5 text-right text-moss-700">{r.ada_jorong}</td>
                    <td className="px-3 py-1.5 text-right text-moss-700">{r.ada_keduanya}</td>
                    <td className="px-3 py-1.5 text-right text-ink/60">{r.belum}</td>
                    <td className="px-3 py-1.5 text-right text-[#8A6A12]">{r.tidak_ada}</td>
                    <td className="px-3 py-1.5 text-right text-rust-700">{r.ragu}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-navy-900">{r.total}</td>
                  </tr>
                  {bisaDibuka && terbuka && nagariLoading[r.kode] && (
                    <tr className="border-b border-line bg-paper/30">
                      <td colSpan={8} className="px-3 py-1.5 pl-8 text-ink/40">
                        Memuat rincian Nagari...
                      </td>
                    </tr>
                  )}
                  {bisaDibuka && terbuka && !nagariLoading[r.kode] && nagariErr[r.kode] && (
                    <tr className="border-b border-line bg-paper/30">
                      <td colSpan={8} className="px-3 py-1.5 pl-8 text-rust-700">
                        ⚠ {nagariErr[r.kode]}
                      </td>
                    </tr>
                  )}
                  {bisaDibuka &&
                    terbuka &&
                    !nagariLoading[r.kode] &&
                    !nagariErr[r.kode] &&
                    (nagariCache[r.kode] ?? []).map((n) => (
                      <tr key={n.kode} className="border-b border-line bg-paper/30">
                        <td className="px-3 py-1.5 pl-8 text-ink/70">↳ {n.nama}</td>
                        <td className="px-3 py-1.5 text-right text-moss-700/80">{n.ada_ppl}</td>
                        <td className="px-3 py-1.5 text-right text-moss-700/80">{n.ada_jorong}</td>
                        <td className="px-3 py-1.5 text-right text-moss-700/80">{n.ada_keduanya}</td>
                        <td className="px-3 py-1.5 text-right text-ink/50">{n.belum}</td>
                        <td className="px-3 py-1.5 text-right text-[#8A6A12]/80">{n.tidak_ada}</td>
                        <td className="px-3 py-1.5 text-right text-rust-700/80">{n.ragu}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-navy-900/80">{n.total}</td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
            {tabelRingkasan.rows.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-ink/40">
                  Tidak ada data{tabelRingkasan.adaFilterAktif && " utk filter ini"}.
                </td>
              </tr>
            )}
          </tbody>
          {tabelRingkasan.rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-line bg-paper/60 font-semibold text-navy-900">
                <td className="px-3 py-1.5">Total</td>
                <td className="px-3 py-1.5 text-right">{totalAdaPpl}</td>
                <td className="px-3 py-1.5 text-right">{totalAdaJorong}</td>
                <td className="px-3 py-1.5 text-right">{totalAdaKeduanya}</td>
                <td className="px-3 py-1.5 text-right">{totalBelum}</td>
                <td className="px-3 py-1.5 text-right">{totalTidakAda}</td>
                <td className="px-3 py-1.5 text-right">{totalRagu}</td>
                <td className="px-3 py-1.5 text-right">{totalSemua}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---------- Target Identifikasi (Jorong): jumlah + satuan ----------
function TargetIdentifikasiSection({
  petugas,
  onSimpanSatu,
  onTerapkanSemua,
}: {
  petugas: PetugasTarget[];
  onSimpanSatu: (id: number, fields: Record<string, number | string | null>) => Promise<void>;
  onTerapkanSemua: (fields: Record<string, number | string | null>) => Promise<void>;
}) {
  const [bulkJumlah, setBulkJumlah] = useState("");
  const [bulkSatuan, setBulkSatuan] = useState<SatuanIdentifikasi>("kk");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleTerapkan() {
    if (!bulkJumlah.trim()) {
      setMsg("Isi jumlah target dulu.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await onTerapkanSemua({ target_identifikasi_jumlah: Number(bulkJumlah), target_identifikasi_satuan: bulkSatuan });
      setMsg(`✓ Target diterapkan ke ${petugas.length} petugas.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-[11px] text-ink/50">
        Target jumlah wilayah/KK yang WAJIB disisir (Identifikasi Jorong) per petugas.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-line bg-paper/40 p-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/50">Terapkan ke Semua Petugas</label>
          <input
            type="number"
            min={0}
            value={bulkJumlah}
            onChange={(e) => setBulkJumlah(e.target.value)}
            placeholder="Jumlah"
            className="w-24 rounded-md border border-line px-2 py-1.5 text-xs"
          />
        </div>
        <select
          value={bulkSatuan}
          onChange={(e) => setBulkSatuan(e.target.value as SatuanIdentifikasi)}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          {(Object.keys(SATUAN_LABEL) as SatuanIdentifikasi[]).map((s) => (
            <option key={s} value={s}>
              {SATUAN_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleTerapkan}
          disabled={busy}
          className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
        >
          {busy ? "..." : "Terapkan"}
        </button>
        {msg && <span className="text-[11px] text-ink/50">{msg}</span>}
      </div>

      <TabelTargetIdentifikasi petugas={petugas} onSimpanSatu={onSimpanSatu} />
    </div>
  );
}

// Header pakai ExcelTh/useExcelTable (urutkan & filter per kolom) --
// dipisah jadi komponen sendiri (bukan langsung di
// TargetIdentifikasiSection) sekadar spy `kolom`/`tabel` tidak bercampur dgn
// state form bulk terapkan-semua di atasnya.
function TabelTargetIdentifikasi({
  petugas,
  onSimpanSatu,
}: {
  petugas: PetugasTarget[];
  onSimpanSatu: (id: number, fields: Record<string, number | string | null>) => Promise<void>;
}) {
  const kolom = useMemo(
    () => [
      { key: "nama", label: "Nama Petugas", getValue: (p: PetugasTarget) => p.nama },
      {
        key: "target_identifikasi_jumlah",
        label: "Target Wajib Dikunjungi",
        getValue: (p: PetugasTarget) => p.target_identifikasi_jumlah,
      },
      {
        key: "target_identifikasi_satuan",
        label: "Satuan",
        getValue: (p: PetugasTarget) => (p.target_identifikasi_satuan ? SATUAN_LABEL[p.target_identifikasi_satuan] : null),
      },
    ],
    []
  );
  const tabel = useExcelTable(petugas, kolom, { key: "nama", dir: "asc" });

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink/40">
        <p>Klik nama kolom utk urutkan, klik &ldquo;▾&rdquo; di header utk filter (spt Excel).</p>
        {tabel.adaFilterAktif && (
          <button type="button" onClick={tabel.resetFilters} className="shrink-0 font-medium text-navy-700 hover:underline">
            Reset semua filter
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-paper/60 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              {kolom.map((k) => (
                <ExcelTh
                  key={k.key}
                  colKey={k.key}
                  label={k.label}
                  sortKey={tabel.sortKey}
                  sortDir={tabel.sortDir}
                  onSort={tabel.toggleSort}
                  values={tabel.uniqueValues[k.key] ?? []}
                  activeFilter={tabel.filters[k.key]}
                  onFilterChange={tabel.setColumnFilter}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {tabel.rows.map((p) => (
              <BarisIdentifikasi key={p.id} p={p} onSimpan={onSimpanSatu} />
            ))}
            {tabel.rows.length === 0 && (
              <tr>
                <td colSpan={kolom.length} className="px-3 py-4 text-center text-ink/40">
                  Tidak ada petugas{tabel.adaFilterAktif && " utk filter ini"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarisIdentifikasi({
  p,
  onSimpan,
}: {
  p: PetugasTarget;
  onSimpan: (id: number, fields: Record<string, number | string | null>) => Promise<void>;
}) {
  const [jumlah, setJumlah] = useState(p.target_identifikasi_jumlah != null ? String(p.target_identifikasi_jumlah) : "");
  const [satuan, setSatuan] = useState<SatuanIdentifikasi>(p.target_identifikasi_satuan ?? "kk");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");

  useEffect(() => {
    setJumlah(p.target_identifikasi_jumlah != null ? String(p.target_identifikasi_jumlah) : "");
    setSatuan(p.target_identifikasi_satuan ?? "kk");
  }, [p.target_identifikasi_jumlah, p.target_identifikasi_satuan]);

  async function simpan(fields: Record<string, number | string | null>) {
    setStatus("saving");
    try {
      await onSimpan(p.id, fields);
      setStatus("ok");
      setTimeout(() => setStatus((s) => (s === "ok" ? "idle" : s)), 1500);
    } catch {
      setStatus("err");
    }
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-1.5 font-medium text-navy-900">
        {p.nama}
        {!p.aktif && <span className="ml-1 text-[9px] text-ink/40">(nonaktif)</span>}
      </td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          min={0}
          value={jumlah}
          onChange={(e) => setJumlah(e.target.value)}
          onBlur={() => {
            if (jumlah === "" && p.target_identifikasi_jumlah == null) return;
            if (jumlah !== "" && Number(jumlah) === p.target_identifikasi_jumlah) return;
            simpan({ target_identifikasi_jumlah: jumlah === "" ? null : Number(jumlah) });
          }}
          className="w-20 rounded-md border border-line px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <select
            value={satuan}
            onChange={(e) => {
              const v = e.target.value as SatuanIdentifikasi;
              setSatuan(v);
              simpan({ target_identifikasi_satuan: v });
            }}
            className="rounded-md border border-line px-2 py-1 text-xs"
          >
            {(Object.keys(SATUAN_LABEL) as SatuanIdentifikasi[]).map((s) => (
              <option key={s} value={s}>
                {SATUAN_LABEL[s]}
              </option>
            ))}
          </select>
          {status === "saving" && <span className="text-[10px] text-ink/40">...</span>}
          {status === "ok" && <span className="text-[10px] text-moss-700">✓</span>}
          {status === "err" && <span className="text-[10px] text-rust-700">✕</span>}
        </div>
      </td>
    </tr>
  );
}

// ---------- Target Pendataan (Penyisiran Usaha): kunjungan + berhasil, selalu KK ----------
function TargetPendataanSection({
  petugas,
  onSimpanSatu,
  onTerapkanSemua,
}: {
  petugas: PetugasTarget[];
  onSimpanSatu: (id: number, fields: Record<string, number | string | null>) => Promise<void>;
  onTerapkanSemua: (fields: Record<string, number | string | null>) => Promise<void>;
}) {
  const [bulkKunjungan, setBulkKunjungan] = useState("");
  const [bulkBerhasil, setBulkBerhasil] = useState("");
  const [busyKunjungan, setBusyKunjungan] = useState(false);
  const [busyBerhasil, setBusyBerhasil] = useState(false);
  const [msgKunjungan, setMsgKunjungan] = useState<string | null>(null);
  const [msgBerhasil, setMsgBerhasil] = useState<string | null>(null);

  async function handleTerapkanKunjungan() {
    if (!bulkKunjungan.trim()) {
      setMsgKunjungan("Isi jumlah target dulu.");
      return;
    }
    setBusyKunjungan(true);
    setMsgKunjungan(null);
    try {
      await onTerapkanSemua({ target_kunjungan_kk: Number(bulkKunjungan) });
      setMsgKunjungan(`✓ Diterapkan ke ${petugas.length} petugas.`);
    } catch (e) {
      setMsgKunjungan(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKunjungan(false);
    }
  }

  async function handleTerapkanBerhasil() {
    if (!bulkBerhasil.trim()) {
      setMsgBerhasil("Isi jumlah target dulu.");
      return;
    }
    setBusyBerhasil(true);
    setMsgBerhasil(null);
    try {
      await onTerapkanSemua({ target_berhasil_kk: Number(bulkBerhasil) });
      setMsgBerhasil(`✓ Diterapkan ke ${petugas.length} petugas.`);
    } catch (e) {
      setMsgBerhasil(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyBerhasil(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-[11px] text-ink/50">
        Target jumlah KK (Penyisiran Usaha) per petugas -- Kunjungan (wajib dikunjungi, status apa pun) dan Berhasil
        Didata (subset yang usahanya ditemukan).
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-line bg-paper/40 p-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-ink/50">Terapkan Target Kunjungan (KK)</label>
            <input
              type="number"
              min={0}
              value={bulkKunjungan}
              onChange={(e) => setBulkKunjungan(e.target.value)}
              placeholder="Jumlah KK"
              className="w-24 rounded-md border border-line px-2 py-1.5 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={handleTerapkanKunjungan}
            disabled={busyKunjungan}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {busyKunjungan ? "..." : "Terapkan"}
          </button>
          {msgKunjungan && <span className="text-[11px] text-ink/50">{msgKunjungan}</span>}
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-line bg-paper/40 p-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-ink/50">Terapkan Target Berhasil Didata (KK)</label>
            <input
              type="number"
              min={0}
              value={bulkBerhasil}
              onChange={(e) => setBulkBerhasil(e.target.value)}
              placeholder="Jumlah KK"
              className="w-24 rounded-md border border-line px-2 py-1.5 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={handleTerapkanBerhasil}
            disabled={busyBerhasil}
            className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {busyBerhasil ? "..." : "Terapkan"}
          </button>
          {msgBerhasil && <span className="text-[11px] text-ink/50">{msgBerhasil}</span>}
        </div>
      </div>

      <TabelTargetPendataan petugas={petugas} onSimpanSatu={onSimpanSatu} />
    </div>
  );
}

// Sama polanya dgn TabelTargetIdentifikasi -- lihat komentar di sana.
function TabelTargetPendataan({
  petugas,
  onSimpanSatu,
}: {
  petugas: PetugasTarget[];
  onSimpanSatu: (id: number, fields: Record<string, number | string | null>) => Promise<void>;
}) {
  const kolom = useMemo(
    () => [
      { key: "nama", label: "Nama Petugas", getValue: (p: PetugasTarget) => p.nama },
      { key: "target_kunjungan_kk", label: "Target Kunjungan (KK)", getValue: (p: PetugasTarget) => p.target_kunjungan_kk },
      {
        key: "target_berhasil_kk",
        label: "Target Berhasil Didata (KK)",
        getValue: (p: PetugasTarget) => p.target_berhasil_kk,
      },
    ],
    []
  );
  const tabel = useExcelTable(petugas, kolom, { key: "nama", dir: "asc" });

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink/40">
        <p>Klik nama kolom utk urutkan, klik &ldquo;▾&rdquo; di header utk filter (spt Excel).</p>
        {tabel.adaFilterAktif && (
          <button type="button" onClick={tabel.resetFilters} className="shrink-0 font-medium text-navy-700 hover:underline">
            Reset semua filter
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-paper/60 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              {kolom.map((k) => (
                <ExcelTh
                  key={k.key}
                  colKey={k.key}
                  label={k.label}
                  sortKey={tabel.sortKey}
                  sortDir={tabel.sortDir}
                  onSort={tabel.toggleSort}
                  values={tabel.uniqueValues[k.key] ?? []}
                  activeFilter={tabel.filters[k.key]}
                  onFilterChange={tabel.setColumnFilter}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {tabel.rows.map((p) => (
              <BarisPendataan key={p.id} p={p} onSimpan={onSimpanSatu} />
            ))}
            {tabel.rows.length === 0 && (
              <tr>
                <td colSpan={kolom.length} className="px-3 py-4 text-center text-ink/40">
                  Tidak ada petugas{tabel.adaFilterAktif && " utk filter ini"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BarisPendataan({
  p,
  onSimpan,
}: {
  p: PetugasTarget;
  onSimpan: (id: number, fields: Record<string, number | string | null>) => Promise<void>;
}) {
  const [kunjungan, setKunjungan] = useState(p.target_kunjungan_kk != null ? String(p.target_kunjungan_kk) : "");
  const [berhasil, setBerhasil] = useState(p.target_berhasil_kk != null ? String(p.target_berhasil_kk) : "");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");

  useEffect(() => {
    setKunjungan(p.target_kunjungan_kk != null ? String(p.target_kunjungan_kk) : "");
    setBerhasil(p.target_berhasil_kk != null ? String(p.target_berhasil_kk) : "");
  }, [p.target_kunjungan_kk, p.target_berhasil_kk]);

  async function simpan(fields: Record<string, number | string | null>) {
    setStatus("saving");
    try {
      await onSimpan(p.id, fields);
      setStatus("ok");
      setTimeout(() => setStatus((s) => (s === "ok" ? "idle" : s)), 1500);
    } catch {
      setStatus("err");
    }
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-1.5 font-medium text-navy-900">
        {p.nama}
        {!p.aktif && <span className="ml-1 text-[9px] text-ink/40">(nonaktif)</span>}
      </td>
      <td className="px-3 py-1.5">
        <input
          type="number"
          min={0}
          value={kunjungan}
          onChange={(e) => setKunjungan(e.target.value)}
          onBlur={() => {
            if (kunjungan === "" && p.target_kunjungan_kk == null) return;
            if (kunjungan !== "" && Number(kunjungan) === p.target_kunjungan_kk) return;
            simpan({ target_kunjungan_kk: kunjungan === "" ? null : Number(kunjungan) });
          }}
          className="w-24 rounded-md border border-line px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            value={berhasil}
            onChange={(e) => setBerhasil(e.target.value)}
            onBlur={() => {
              if (berhasil === "" && p.target_berhasil_kk == null) return;
              if (berhasil !== "" && Number(berhasil) === p.target_berhasil_kk) return;
              simpan({ target_berhasil_kk: berhasil === "" ? null : Number(berhasil) });
            }}
            className="w-24 rounded-md border border-line px-2 py-1 text-xs"
          />
          {status === "saving" && <span className="text-[10px] text-ink/40">...</span>}
          {status === "ok" && <span className="text-[10px] text-moss-700">✓</span>}
          {status === "err" && <span className="text-[10px] text-rust-700">✕</span>}
        </div>
      </td>
    </tr>
  );
}
