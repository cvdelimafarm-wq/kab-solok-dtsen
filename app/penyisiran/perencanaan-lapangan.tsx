"use client";

// app/penyisiran/perencanaan-lapangan.tsx
//
// Tab "Perencanaan Lapangan" (nama lama "Alokasi Sampel", diganti nama
// user krn sekarang isinya 2 bagian, bukan cuma alokasi SLS). Login
// PERSONAL role "penyisiran_petugas" -- SENGAJA memakai TOKEN & KEY
// localStorage YANG SAMA PERSIS dgn tab "Penyisiran Usaha"
// (app/seruti/penyisiran-usaha.tsx: TOKEN_KEY "penyisiran-petugas-login-
// token" dst) supaya petugas yang sudah login di tab itu OTOMATIS
// dianggap login di sini juga -- tidak perlu login dua kali (satu akun,
// satu role token, dua tab berbeda yg membacanya).
//
// Dua bagian + 1 panel khusus pengelola:
//  1. "Identifikasi Hari Tugas" -- checklist per TANGGAL KALENDER dalam
//     periode 17-30 September 2026 (DIKOREKSI user dari rencana awal
//     "hari dalam seminggu" -- ruang lingkup penyisiran sudah pasti
//     tanggalnya, jadi ditampilkan sbg GRID KALENDER Sen..Min dgn angka
//     tanggal, lihat KALENDER_HARI_TUGAS & lib/penyisiranHari.ts) yang
//     ditandai petugas sbg BISA turun bertugas lapangan; centang tanggal
//     yg bisa, hapus centang tanggal yg tidak bisa, lalu submit. Disimpan
//     di tabel penyisiran_alokasi_hari_tugas (SATU baris per
//     petugas+tanggal) lewat GET/PATCH /api/penyisiran/alokasi/hari-tugas.
//     Tiap tanggal yg dicentang = 1 OH (Orang-Hari) dari KUOTA_OH_TRANSLOK
//     (280, hardcode di .../oh-monitoring/route.ts) -- lihat migrasi
//     supabase/migrations/20260918_hari_tugas_jadi_tanggal_kalender.sql
//     utk justifikasi lengkap tiap parameter (SUDAH dikonfirmasi user
//     lewat AskUserQuestion: 1 tanggal = 1 OH sekali pakai; kuota TIDAK
//     mengunci checklist kalau habis, cuma peringatan).
//  2. "Identifikasi Wilayah Sampel SLS" (dulu bernama "Checklist SLS/
//     Jorong") -- form rekomendasi wilayah tugas: GET
//     /api/penyisiran/alokasi/rekomendasi mengembalikan daftar SEMUA SLS/
//     Jorong yg masih ada potensi (bukan "tidak_ada"), diurutkan skor
//     akhir (personal, berbasis jarak dari lokasi rumah petugas)
//     tertinggi ke terendah -- rumus lengkap & justifikasi tiap parameter
//     (SUDAH dikonfirmasi user) ada di migrasi
//     supabase/migrations/20260918_alokasi_sampel.sql. Tabelnya punya
//     FILTER Kecamatan/Nagari (dropdown, Nagari otomatis mengikuti pilihan
//     Kecamatan) & tiap kolom bisa DIURUTKAN ascending/descending (klik
//     header, panah ▲/▼) -- keduanya murni client-side di atas hasil
//     rekomendasi yg sama, tidak menambah request API. Petugas checklist
//     MAKS 5 SLS/Jorong -> tombol "Kirim Pilihan" -> POST
//     /api/penyisiran/alokasi/submit (REPLACE penuh pilihan lama). Sesudah
//     submit (atau kalau petugas SUDAH PERNAH submit sebelumnya --
//     dideteksi dari field "pilihan" yg dikembalikan endpoint
//     rekomendasi), matriks gabungan SEMUA petugas dimunculkan (GET
//     /api/penyisiran/alokasi/matrix) -- HANYA menampilkan SLS/Jorong yang
//     SUDAH dipilih minimal 1 petugas (yang belum dipilih siapa pun tidak
//     ikut tampil), dikelompokkan per Kecamatan > Nagari > SLS/Jorong dgn
//     daftar nama petugas yang memilihnya. SLS BOLEH dipilih lebih dari 1
//     petugas (dikonfirmasi user) -- tidak ada mekanisme rebutan/kunci.
//  3. "Monitoring Kuota OH Translok" -- panel TAMBAHAN, HANYA tampil kalau
//     nama hasil login termasuk 4 pengelola yg SAMA dgn tab "Manajemen
//     Target" (bolehAksesManajemenTarget, lihat
//     lib/manajemenTargetAkses.ts). Menampilkan total OH terpakai vs
//     kuota 280, rincian per petugas, & tombol utk membatalkan/
//     mengaktifkan-kembali SATU hari milik petugas tertentu (GET/PATCH
//     .../oh-monitoring & .../oh-monitoring/batalkan) -- kalau super user
//     membatalkan satu hari, petugas ybs akan melihat badge "Dibatalkan
//     oleh <nama>" di checklist Hari Tugas miliknya sendiri (poin 1) &
//     hari itu terkunci (tdk bisa dicentang ulang sendiri) sampai
//     diaktifkan lagi oleh pengelola.

import { useEffect, useState } from "react";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";

const TOKEN_KEY = "penyisiran-petugas-login-token";
const NAMA_KEY = "penyisiran-petugas-login-nama";
const PETUGAS_ID_STORE_KEY = "penyisiran-petugas-login-id";
const LAT_KEY = "penyisiran-petugas-login-lat";
const LNG_KEY = "penyisiran-petugas-login-lng";

const MAKS_PILIHAN = 5;

// Grid kalender "Identifikasi Hari Tugas" -- HARDCODE utk periode 17-30
// September 2026 (dikonfirmasi user, lihat lib/penyisiranHari.ts). Kalau
// periode resmi berubah, PERBARUI manual: grid 3 baris x 7 kolom (Sen..Min)
// di bawah ini, DAFTAR_TANGGAL (dipakai jg oleh OhMonitoringPanel utk
// label singkat), & 2 tempat di lib/penyisiranHari.ts (constraint tanggal).
const HARI_KOLOM = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

interface SelKalender {
  tanggal: string;
  tgl: number;
}

const KALENDER_HARI_TUGAS: (SelKalender | null)[][] = [
  [
    null,
    null,
    null,
    { tanggal: "2026-09-17", tgl: 17 },
    { tanggal: "2026-09-18", tgl: 18 },
    { tanggal: "2026-09-19", tgl: 19 },
    { tanggal: "2026-09-20", tgl: 20 },
  ],
  [
    { tanggal: "2026-09-21", tgl: 21 },
    { tanggal: "2026-09-22", tgl: 22 },
    { tanggal: "2026-09-23", tgl: 23 },
    { tanggal: "2026-09-24", tgl: 24 },
    { tanggal: "2026-09-25", tgl: 25 },
    { tanggal: "2026-09-26", tgl: 26 },
    { tanggal: "2026-09-27", tgl: 27 },
  ],
  [
    { tanggal: "2026-09-28", tgl: 28 },
    { tanggal: "2026-09-29", tgl: 29 },
    { tanggal: "2026-09-30", tgl: 30 },
    null,
    null,
    null,
    null,
  ],
];

function labelTanggalPendek(tanggal: string): string {
  const tgl = Number(tanggal.slice(-2));
  return `${tgl} Sep`;
}

interface RekomendasiRow {
  sls_key: string;
  kec_kode: string;
  kec_nama: string;
  nagari_kode: string;
  nagari_nama: string;
  sls_kode: string;
  sls_nama: string;
  jumlah_potensi: number;
  skor_dasar_rata: number;
  bonus_volume: number;
  jarak_km: number | null;
  penalti_jarak: number | null;
  skor_akhir: number;
  sudah_dipilih_oleh: number;
}

interface MatrixRow {
  kec_kode: string;
  kec_nama: string;
  nagari_kode: string;
  nagari_nama: string;
  sls_kode: string;
  sls_nama: string;
  sls_key: string;
  petugas_id: number;
  petugas_nama: string;
}

function tokenExpMs(token: string): number {
  const parts = token.split(".");
  const expStr = parts.length === 4 ? parts[2] : parts[1];
  return Number(expStr);
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

export default function PerencanaanLapanganTab() {
  const [token, setToken] = useState<string | null>(null);
  const [nama, setNama] = useState<string | null>(null);
  const [petugasId, setPetugasId] = useState<number | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    setToken(getToken());
    if (typeof window !== "undefined") {
      setNama(localStorage.getItem(NAMA_KEY));
      const savedId = Number(localStorage.getItem(PETUGAS_ID_STORE_KEY));
      setPetugasId(Number.isFinite(savedId) && savedId > 0 ? savedId : null);
    }
    setCheckedStorage(true);
  }, []);

  function handleLoggedIn(t: string, n: string, id: number, loginLat: number | null, loginLng: number | null) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(NAMA_KEY, n);
    localStorage.setItem(PETUGAS_ID_STORE_KEY, String(id));
    if (loginLat != null) localStorage.setItem(LAT_KEY, String(loginLat));
    if (loginLng != null) localStorage.setItem(LNG_KEY, String(loginLng));
    setToken(t);
    setNama(n);
    setPetugasId(id);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAMA_KEY);
    localStorage.removeItem(PETUGAS_ID_STORE_KEY);
    localStorage.removeItem(LAT_KEY);
    localStorage.removeItem(LNG_KEY);
    setToken(null);
    setNama(null);
    setPetugasId(null);
  }

  if (!checkedStorage) return null;

  if (!token || !petugasId) {
    return <LoginForm onLoggedIn={handleLoggedIn} />;
  }

  return <PerencanaanPanel token={token} nama={nama || ""} petugasId={petugasId} onSessionExpired={handleLogout} />;
}

// Form login -- pola & endpoint SAMA PERSIS dgn app/seruti/penyisiran-usaha.tsx
// (role "penyisiran_petugas", tabel petugas_penyisiran_akun).
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
      <p className="text-sm font-semibold text-navy-900">Perencanaan Lapangan -- Login Petugas Penyisiran</p>
      <p className="mt-1 text-xs text-ink/60">
        Masukkan nama lengkap dan tanggal lahir Anda sebagai petugas penyisiran (sama dgn login tab Penyisiran
        Usaha).
      </p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-2 text-left">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Nama Lengkap</label>
          <input
            list="nama-petugas-perencanaan-options"
            type="text"
            value={namaInput}
            onChange={(e) => setNamaInput(e.target.value)}
            placeholder="Ketik nama lengkap Anda"
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <datalist id="nama-petugas-perencanaan-options">
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
        {error && <p className="text-xs font-medium text-rust-700">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
        >
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
    </div>
  );
}

function PerencanaanPanel({
  token,
  nama,
  petugasId,
  onSessionExpired,
}: {
  token: string;
  nama: string;
  petugasId: number;
  onSessionExpired: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-2">
        <p className="text-sm">
          Login sbg <span className="font-semibold text-navy-900">{nama}</span>
        </p>
        <button type="button" onClick={onSessionExpired} className="text-xs font-medium text-ink/50 hover:text-rust-700">
          Keluar
        </button>
      </div>

      <HariTugasPanel token={token} />

      <WilayahSampelPanel token={token} petugasId={petugasId} onSessionExpired={onSessionExpired} />

      {bolehAksesManajemenTarget(nama) && <OhMonitoringPanel token={token} />}
    </div>
  );
}

interface HariRow {
  tanggal: string;
  dibatalkan_oleh: string | null;
  dibatalkan_at: string | null;
}

// Bagian 1: "Identifikasi Hari Tugas" -- checklist per TANGGAL kalender
// (grid Sen..Min, periode 17-30 September 2026). Tiap tanggal yg dicentang
// = 1 OH (Orang-Hari) dari kuota translok kabupaten -- lihat
// app/api/penyisiran/alokasi/hari-tugas/route.ts. Tanggal yang SUDAH
// dibatalkan super user (dibatalkan_oleh terisi) TERKUNCI (tidak bisa
// dicentang ulang sendiri) & tampil sbg badge di sini.
function HariTugasPanel({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<HariRow[]>([]);
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function terapkanRows(data: HariRow[]) {
    setRows(data);
    setDipilih(new Set(data.filter((r) => !r.dibatalkan_oleh).map((r) => r.tanggal)));
  }

  useEffect(() => {
    apiFetch("/api/penyisiran/alokasi/hari-tugas", token)
      .then((data) => terapkanRows(Array.isArray(data?.tanggal) ? data.tanggal : []))
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dibatalkanMap = new Map(
    rows.filter((r) => r.dibatalkan_oleh).map((r) => [r.tanggal, r.dibatalkan_oleh as string])
  );

  function toggle(tanggal: string) {
    if (dibatalkanMap.has(tanggal)) return; // terkunci, tidak bisa dicentang ulang sendiri
    setDipilih((prev) => {
      const next = new Set(prev);
      if (next.has(tanggal)) next.delete(tanggal);
      else next.add(tanggal);
      return next;
    });
  }

  async function handleSubmit() {
    setBusy(true);
    setMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/alokasi/hari-tugas", token, {
        method: "PATCH",
        body: JSON.stringify({ tanggal: Array.from(dipilih) }),
      });
      terapkanRows(Array.isArray(data?.tanggal) ? data.tanggal : []);
      setMsg("Tersimpan.");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-sm font-semibold text-navy-900">🗓 Identifikasi Hari Tugas (17-30 September 2026)</p>
      <p className="mt-1 text-xs text-ink/60">
        Centang tanggal yang Anda BISA turun bertugas lapangan. Hilangkan centang kalau tidak bisa, lalu tekan
        Simpan. Tiap tanggal yang dicentang memakai 1 jatah OH (Orang-Hari) translok kabupaten.
      </p>
      {loading ? (
        <p className="mt-3 text-xs text-ink/50">Memuat...</p>
      ) : (
        <>
          <div className="mt-3 max-w-md">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink/50">
              {HARI_KOLOM.map((h) => (
                <div key={h} className="py-1">
                  {h}
                </div>
              ))}
            </div>
            {KALENDER_HARI_TUGAS.map((baris, i) => (
              <div key={i} className="mt-1 grid grid-cols-7 gap-1">
                {baris.map((sel, j) => {
                  if (!sel) return <div key={j} />;
                  const dibatalkanOleh = dibatalkanMap.get(sel.tanggal);
                  if (dibatalkanOleh) {
                    return (
                      <div
                        key={j}
                        title={`Dibatalkan oleh ${dibatalkanOleh}`}
                        className="flex aspect-square flex-col items-center justify-center rounded-md border border-dashed border-rust-300 bg-rust-50 text-rust-700"
                      >
                        <span className="text-xs font-semibold">🚫 {sel.tgl}</span>
                      </div>
                    );
                  }
                  const aktif = dipilih.has(sel.tanggal);
                  return (
                    <button
                      key={j}
                      type="button"
                      onClick={() => toggle(sel.tanggal)}
                      className={`aspect-square rounded-md border text-sm font-semibold transition ${
                        aktif
                          ? "border-navy-700 bg-navy-700 text-white"
                          : "border-line bg-white text-ink/70 hover:border-navy-400"
                      }`}
                    >
                      {sel.tgl}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {dibatalkanMap.size > 0 && (
            <div className="mt-2 space-y-0.5 text-[11px] text-rust-700">
              {Array.from(dibatalkanMap.entries()).map(([tanggal, oleh]) => (
                <p key={tanggal}>
                  🚫 {labelTanggalPendek(tanggal)}: dibatalkan oleh {oleh}
                </p>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy}
              className="rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
            >
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
            {msg && <p className="text-xs font-medium text-ink/70">{msg}</p>}
          </div>
        </>
      )}
    </div>
  );
}

interface OhRincianPetugas {
  petugas_id: number;
  petugas_nama: string;
  tanggal: HariRow[];
}

// Panel monitoring kuota OH translok -- HANYA tampil utk 4 nama pengelola
// (bolehAksesManajemenTarget), sama spt tab "Manajemen Target". Pengelola
// bisa membatalkan/mengaktifkan-kembali satu hari milik petugas tertentu
// lgs dari sini -- lihat .../oh-monitoring/batalkan/route.ts.
function OhMonitoringPanel({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kuota, setKuota] = useState(0);
  const [terpakai, setTerpakai] = useState(0);
  const [rincian, setRincian] = useState<OhRincianPetugas[]>([]);
  const [aksiBusyKey, setAksiBusyKey] = useState<string | null>(null);

  async function muat() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/penyisiran/alokasi/oh-monitoring", token);
      setKuota(data?.kuota ?? 0);
      setTerpakai(data?.terpakai ?? 0);
      setRincian(Array.isArray(data?.rincian) ? data.rincian : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat monitoring OH.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function aksi(petugasId: number, tanggal: string, jenis: "batalkan" | "aktifkan") {
    const key = `${petugasId}-${tanggal}`;
    setAksiBusyKey(key);
    try {
      await apiFetch("/api/penyisiran/alokasi/oh-monitoring/batalkan", token, {
        method: "PATCH",
        body: JSON.stringify({ petugas_id: petugasId, tanggal, aksi: jenis }),
      });
      await muat();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memproses aksi.");
    } finally {
      setAksiBusyKey(null);
    }
  }

  const sisa = kuota - terpakai;

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-sm font-semibold text-navy-900">📊 Monitoring Kuota OH Translok (khusus pengelola)</p>
      <p className="mt-1 text-xs text-ink/60">
        1 hari tugas yang dicentang petugas = 1 OH. Kuota tidak dikunci otomatis -- kelola manual lewat tombol
        batalkan di bawah kalau OH perlu dibebaskan utk petugas lain.
      </p>

      {loading ? (
        <p className="mt-3 text-xs text-ink/50">Memuat...</p>
      ) : (
        <>
          {error && <p className="mt-2 text-xs font-medium text-rust-700">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <p>
              Kuota: <span className="font-semibold text-navy-900">{kuota} OH</span>
            </p>
            <p>
              Terpakai: <span className="font-semibold text-navy-900">{terpakai} OH</span>
            </p>
            <p className={sisa < 0 ? "font-semibold text-rust-700" : ""}>
              Sisa: <span className="font-semibold">{sisa} OH</span>
              {sisa < 0 && " -- kuota terlampaui!"}
            </p>
          </div>

          <div className="mt-3 max-h-[24rem] space-y-2 overflow-y-auto">
            {rincian.length === 0 && <p className="text-xs text-ink/50">Belum ada petugas yang mengisi hari tugas.</p>}
            {rincian.map((p) => (
              <div key={p.petugas_id} className="rounded-md border border-line/70 p-2">
                <p className="text-xs font-semibold text-navy-900">{p.petugas_nama}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {p.tanggal
                    .slice()
                    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
                    .map((h) => {
                      const key = `${p.petugas_id}-${h.tanggal}`;
                      const label = labelTanggalPendek(h.tanggal);
                      const busy = aksiBusyKey === key;
                      if (h.dibatalkan_oleh) {
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={busy}
                            onClick={() => aksi(p.petugas_id, h.tanggal, "aktifkan")}
                            title={`Dibatalkan oleh ${h.dibatalkan_oleh} -- klik utk aktifkan kembali`}
                            className="rounded-full border border-dashed border-line px-2.5 py-1 text-[11px] font-medium text-ink/40 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
                          >
                            🚫 {label}
                          </button>
                        );
                      }
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={busy}
                          onClick={() => aksi(p.petugas_id, h.tanggal, "batalkan")}
                          title="Klik utk batalkan slot tanggal ini"
                          className="rounded-full border border-navy-700 bg-navy-50 px-2.5 py-1 text-[11px] font-semibold text-navy-900 hover:bg-rust-50 hover:text-rust-700 disabled:opacity-50"
                        >
                          {label}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type SortKey =
  | "sls_nama"
  | "nagari_nama"
  | "kec_nama"
  | "jumlah_potensi"
  | "jarak_km"
  | "skor_akhir"
  | "sudah_dipilih_oleh";
type SortDir = "asc" | "desc";

const KOLOM_TEKS: SortKey[] = ["sls_nama", "nagari_nama", "kec_nama"];

// Bagian 2: "Identifikasi Wilayah Sampel SLS" -- checklist maks 5 SLS/
// Jorong rekomendasi + matriks gabungan sesudah submit. Ada filter
// Kecamatan/Nagari & kolom bisa diurutkan (klik header) -- keduanya
// client-side di atas hasil rekomendasi yg sama.
function WilayahSampelPanel({
  token,
  petugasId,
  onSessionExpired,
}: {
  token: string;
  petugasId: number;
  onSessionExpired: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RekomendasiRow[]>([]);
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [sudahPernahSubmit, setSudahPernahSubmit] = useState(false);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [lokasiBusy, setLokasiBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [tampilkanMatrix, setTampilkanMatrix] = useState(false);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [filterKec, setFilterKec] = useState("");
  const [filterNagari, setFilterNagari] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("skor_akhir");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function muatRekomendasi() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/penyisiran/alokasi/rekomendasi", token);
      setRows(Array.isArray(data?.data) ? data.data : []);
      const pilihanAwal: string[] = Array.isArray(data?.pilihan) ? data.pilihan : [];
      setDipilih(new Set(pilihanAwal));
      setSudahPernahSubmit(pilihanAwal.length > 0);
      if (pilihanAwal.length > 0) setTampilkanMatrix(true);
      setLat(typeof data?.lat === "number" ? data.lat : null);
      setLng(typeof data?.lng === "number" ? data.lng : null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal memuat data.";
      setError(msg);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
    } finally {
      setLoading(false);
    }
  }

  async function muatMatrix() {
    setMatrixLoading(true);
    try {
      const data = await apiFetch("/api/penyisiran/alokasi/matrix", token);
      setMatrix(Array.isArray(data?.data) ? data.data : []);
    } catch {
      // diamkan -- matriks bukan bagian kritikal, cukup kosong kalau gagal
    } finally {
      setMatrixLoading(false);
    }
  }

  useEffect(() => {
    muatRekomendasi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tampilkanMatrix) muatMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tampilkanMatrix]);

  function toggleSls(key: string) {
    setDipilih((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= MAKS_PILIHAN) return prev;
        next.add(key);
      }
      return next;
    });
  }

  function handleTetapkanLokasi() {
    if (!("geolocation" in navigator)) {
      setError("Perangkat/browser ini tidak mendukung deteksi lokasi.");
      return;
    }
    setLokasiBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const newLat = pos.coords.latitude;
          const newLng = pos.coords.longitude;
          await apiFetch("/api/penyisiran/set-lokasi-rumah", token, {
            method: "PATCH",
            body: JSON.stringify({ petugas_id: petugasId, lat: newLat, lng: newLng }),
          });
          localStorage.setItem(LAT_KEY, String(newLat));
          localStorage.setItem(LNG_KEY, String(newLng));
          setLat(newLat);
          setLng(newLng);
          await muatRekomendasi();
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Gagal menyimpan lokasi.");
        } finally {
          setLokasiBusy(false);
        }
      },
      () => {
        setError("Gagal mendeteksi lokasi. Pastikan izin lokasi browser diaktifkan.");
        setLokasiBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function handleSubmit() {
    if (dipilih.size === 0) {
      setSubmitMsg("Pilih minimal 1 SLS/Jorong dulu.");
      return;
    }
    setSubmitBusy(true);
    setSubmitMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/alokasi/submit", token, {
        method: "POST",
        body: JSON.stringify({ sls_keys: Array.from(dipilih) }),
      });
      setSubmitMsg(`Tersimpan ${data?.jumlah_tersimpan ?? dipilih.size} SLS/Jorong.`);
      setSudahPernahSubmit(true);
      setTampilkanMatrix(true);
      await muatMatrix();
    } catch (e: unknown) {
      setSubmitMsg(e instanceof Error ? e.message : "Gagal mengirim pilihan.");
    } finally {
      setSubmitBusy(false);
    }
  }

  const kecOptions = Array.from(new Set(rows.map((r) => r.kec_nama))).sort((a, b) => a.localeCompare(b));
  const nagariOptions = Array.from(
    new Set(rows.filter((r) => !filterKec || r.kec_nama === filterKec).map((r) => r.nagari_nama))
  ).sort((a, b) => a.localeCompare(b));

  function handleFilterKec(v: string) {
    setFilterKec(v);
    setFilterNagari(""); // reset Nagari kalau Kecamatan diganti (opsi Nagari lama blm tentu relevan lg)
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(KOLOM_TEKS.includes(key) ? "asc" : "desc");
    }
  }

  function panahSort(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  const rowsTertampil = rows
    .filter((r) => (!filterKec || r.kec_nama === filterKec) && (!filterNagari || r.nagari_nama === filterNagari))
    .slice()
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        const an = av == null ? -Infinity : Number(av);
        const bn = bv == null ? -Infinity : Number(bv);
        cmp = an - bn;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  if (loading) {
    return <p className="text-sm text-ink/60">Memuat rekomendasi...</p>;
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-rust-300 bg-rust-50 px-4 py-2 text-xs font-medium text-rust-700">
          {error}
        </div>
      )}

      {(lat == null || lng == null) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold">⚠ Lokasi rumah Anda belum tercatat.</p>
          <p className="mt-0.5">
            Urutan rekomendasi di bawah BELUM memperhitungkan jarak dari rumah Anda sampai lokasi ini ditetapkan.
          </p>
          <button
            type="button"
            onClick={handleTetapkanLokasi}
            disabled={lokasiBusy}
            className="mt-2 rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {lokasiBusy ? "Mendeteksi..." : "📍 Tetapkan Lokasi Rumah Saya"}
          </button>
        </div>
      )}

      <div className="rounded-lg border border-line bg-white p-4">
        <p className="text-sm font-semibold text-navy-900">📋 Identifikasi Wilayah Sampel SLS (maks {MAKS_PILIHAN})</p>
        <p className="mt-1 text-xs text-ink/60">
          Pilih 5 kandidat wilayah sampel, diurutkan menurut skor prioritas akhir tertinggi (skor sumber +
          identifikasi, ditambah bonus volume potensi KK, dikurangi penalti jarak dari lokasi rumah Anda). SLS
          boleh dipilih lebih dari 1 petugas.
        </p>
        <p className="mt-1 text-xs font-medium text-navy-700">
          Terpilih: {dipilih.size} / {MAKS_PILIHAN}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <label className="text-ink/60">Kecamatan:</label>
          <select
            value={filterKec}
            onChange={(e) => handleFilterKec(e.target.value)}
            className="rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-navy-400"
          >
            <option value="">Semua Kecamatan</option>
            {kecOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <label className="text-ink/60">Nagari:</label>
          <select
            value={filterNagari}
            onChange={(e) => setFilterNagari(e.target.value)}
            className="rounded-md border border-line px-2 py-1 text-xs outline-none focus:border-navy-400"
          >
            <option value="">Semua Nagari</option>
            {nagariOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {(filterKec || filterNagari) && (
            <button
              type="button"
              onClick={() => {
                setFilterKec("");
                setFilterNagari("");
              }}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900"
            >
              Reset filter
            </button>
          )}
        </div>

        <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-cream-50 text-[11px] uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-2 py-2 text-left">✓</th>
                <th className="cursor-pointer select-none px-2 py-2 text-left hover:text-navy-700" onClick={() => toggleSort("sls_nama")}>
                  Jorong / SLS{panahSort("sls_nama")}
                </th>
                <th className="cursor-pointer select-none px-2 py-2 text-left hover:text-navy-700" onClick={() => toggleSort("nagari_nama")}>
                  Nagari{panahSort("nagari_nama")}
                </th>
                <th className="cursor-pointer select-none px-2 py-2 text-left hover:text-navy-700" onClick={() => toggleSort("kec_nama")}>
                  Kecamatan{panahSort("kec_nama")}
                </th>
                <th
                  className="cursor-pointer select-none px-2 py-2 text-right hover:text-navy-700"
                  onClick={() => toggleSort("jumlah_potensi")}
                >
                  Potensi KK{panahSort("jumlah_potensi")}
                </th>
                <th className="cursor-pointer select-none px-2 py-2 text-right hover:text-navy-700" onClick={() => toggleSort("jarak_km")}>
                  Jarak (km){panahSort("jarak_km")}
                </th>
                <th className="cursor-pointer select-none px-2 py-2 text-right hover:text-navy-700" onClick={() => toggleSort("skor_akhir")}>
                  Skor Akhir{panahSort("skor_akhir")}
                </th>
                <th
                  className="cursor-pointer select-none px-2 py-2 text-right hover:text-navy-700"
                  onClick={() => toggleSort("sudah_dipilih_oleh")}
                >
                  Dipilih Petugas{panahSort("sudah_dipilih_oleh")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsTertampil.map((r) => {
                const aktif = dipilih.has(r.sls_key);
                const penuh = !aktif && dipilih.size >= MAKS_PILIHAN;
                return (
                  <tr
                    key={r.sls_key}
                    className={`cursor-pointer border-t border-line/60 ${aktif ? "bg-navy-50" : "hover:bg-cream-50"} ${
                      penuh ? "opacity-40" : ""
                    }`}
                    onClick={() => !penuh && toggleSls(r.sls_key)}
                  >
                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={aktif} disabled={penuh} onChange={() => toggleSls(r.sls_key)} />
                    </td>
                    <td className="px-2 py-1.5 font-medium text-navy-900">{r.sls_nama}</td>
                    <td className="px-2 py-1.5">{r.nagari_nama}</td>
                    <td className="px-2 py-1.5">{r.kec_nama}</td>
                    <td className="px-2 py-1.5 text-right">{r.jumlah_potensi}</td>
                    <td className="px-2 py-1.5 text-right">{r.jarak_km != null ? r.jarak_km.toFixed(1) : "-"}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-navy-900">{r.skor_akhir}</td>
                    <td className="px-2 py-1.5 text-right text-ink/50">
                      {r.sudah_dipilih_oleh > 0 ? `${r.sudah_dipilih_oleh} org` : "-"}
                    </td>
                  </tr>
                );
              })}
              {rowsTertampil.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-ink/50">
                    Tidak ada data{(filterKec || filterNagari) && " utk filter ini"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitBusy || dipilih.size === 0}
            className="rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {submitBusy ? "Mengirim..." : sudahPernahSubmit ? "Perbarui Pilihan" : "Kirim Pilihan"}
          </button>
          {submitMsg && <p className="text-xs font-medium text-ink/70">{submitMsg}</p>}
        </div>
      </div>

      {tampilkanMatrix && <MatrixPanel matrix={matrix} loading={matrixLoading} />}
    </div>
  );
}

function MatrixPanel({ matrix, loading }: { matrix: MatrixRow[]; loading: boolean }) {
  // Kelompokkan matrix flat -> Kecamatan > Nagari > SLS/Jorong > [nama petugas]
  const kecMap = new Map<
    string,
    { kec_nama: string; nagari: Map<string, { nagari_nama: string; sls: Map<string, { sls_nama: string; petugas: string[] }> }> }
  >();
  for (const r of matrix) {
    if (!kecMap.has(r.kec_kode)) kecMap.set(r.kec_kode, { kec_nama: r.kec_nama, nagari: new Map() });
    const kec = kecMap.get(r.kec_kode)!;
    const nagariKey = r.kec_kode + "-" + r.nagari_kode;
    if (!kec.nagari.has(nagariKey)) kec.nagari.set(nagariKey, { nagari_nama: r.nagari_nama, sls: new Map() });
    const nag = kec.nagari.get(nagariKey)!;
    if (!nag.sls.has(r.sls_key)) nag.sls.set(r.sls_key, { sls_nama: r.sls_nama, petugas: [] });
    nag.sls.get(r.sls_key)!.petugas.push(r.petugas_nama);
  }

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-sm font-semibold text-navy-900">🗂 Matriks Alokasi -- Jorong yang Sudah Dipilih</p>
      <p className="mt-1 text-xs text-ink/60">
        Jorong/SLS yang belum dipilih petugas mana pun TIDAK ditampilkan di sini.
      </p>
      {loading ? (
        <p className="mt-3 text-xs text-ink/50">Memuat matriks...</p>
      ) : matrix.length === 0 ? (
        <p className="mt-3 text-xs text-ink/50">Belum ada Jorong/SLS yang dipilih oleh petugas mana pun.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {Array.from(kecMap.entries()).map(([kecKode, kec]) => (
            <div key={kecKode}>
              <p className="text-xs font-bold uppercase tracking-wide text-navy-700">{kec.kec_nama}</p>
              <div className="mt-1 space-y-2 border-l-2 border-line pl-3">
                {Array.from(kec.nagari.entries()).map(([nagariKey, nag]) => (
                  <div key={nagariKey}>
                    <p className="text-xs font-semibold text-ink/80">{nag.nagari_nama}</p>
                    <table className="mt-1 w-full text-xs">
                      <tbody>
                        {Array.from(nag.sls.entries()).map(([slsKey, sls]) => (
                          <tr key={slsKey} className="border-t border-line/50">
                            <td className="w-1/3 py-1 pr-2 text-ink/70">{sls.sls_nama}</td>
                            <td className="py-1 font-medium text-navy-900">{sls.petugas.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
