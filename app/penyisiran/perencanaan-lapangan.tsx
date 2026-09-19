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
//     Di samping headernya ada tombol export "⬇ Export Excel Pengawas/
//     Pencacah (per SUBSLS)" -- HANYA tampil utk 4 pengelola yg sama dgn
//     tab Manajemen Target/Master Petugas (bolehAksesManajemenTarget).
//     Narik SEMUA alokasi yang sudah masuk, dipecah per SUBSLS (satu SLS
//     dgn 3 subsls jadi 3 baris), kolom PROVINSI/KABUPATEN-KOTA di-hardcode
//     13/"03", KECAMATAN/DESA/SLS/SUBSLS dari kode wilayah, dan Email
//     Pengawas/Email Pencacah diambil dari data tab Master Petugas -- lihat
//     app/api/penyisiran/alokasi/export-subsls/route.ts &
//     app/penyisiran/master-petugas.tsx.
//     Tiap baris yang punya >1 SUBSLS (kolom jumlah_subsls dari RPC
//     penyisiran_alokasi_dasar_sls) menampilkan tombol "unhide" (▸/▾) di
//     depan nama Jorong/SLS -- diklik utk memecah baris itu jadi rincian
//     per SUBSLS (fetch GET .../alokasi/subsls?sls_key=..., RPC
//     penyisiran_alokasi_dasar_subsls), tiap SUBSLS punya checkbox
//     sendiri sehingga SATU Jorong bisa dibagi ke BEBERAPA PPL berbeda
//     (mis. Sub SLS 01-02 utk PPL A, Sub SLS 03 utk PPL B) -- TETAP
//     dihitung 1 dari maks 5 slot pilihan (bukan nambah kuota per
//     SUBSLS). Kalau SEMUA SUBSLS di baris itu tercentang, otomatis
//     disederhanakan jadi "pilih seluruh SLS" (subsls_kode_list NULL di
//     DB) -- setara dgn checklist langsung di baris induk spt sebelumnya.
//     Disimpan di kolom BARU penyisiran_alokasi_pilihan.subsls_kode_list
//     (NULL = seluruh SLS, array = sebagian SUBSLS) -- lihat migrasi
//     alokasi_unhide_subsls & app/api/penyisiran/alokasi/submit/route.ts.
//     Di sebelahnya jg ada tombol "🎯 Alokasikan Otomatis (Prioritas)"
//     (HANYA pengelola, 2x klik krn menimpa data byk petugas) -> POST
//     .../alokasi/auto-alokasi -- mengisi otomatis 5 SLS prioritas
//     tertinggi utk SEMUA petugas yg BELUM PERNAH submit sendiri (yg
//     sudah submit tidak disentuh, SLS-nya dianggap "terpakai"). Kalau
//     jorong sama diminati >1 petugas, dimenangkan petugas yg datanya
//     paling akurat (lokasi rumah > titik tengah nagari > tanpa data)
//     lalu skor_akhir tertinggi -- petugas yg kalah otomatis dialihkan ke
//     pilihan berikutnya (algoritma "deferred acceptance", lihat komentar
//     lengkap & justifikasi di .../alokasi/auto-alokasi/route.ts, dikonfirmasi
//     user lewat AskUserQuestion 2026-09-19).
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

import { Fragment, useEffect, useMemo, useState } from "react";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";
import { useExcelTable, ExcelTh } from "./_shared/excel-table";

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
  jumlah_subsls: number;
}

// Rincian per SUBSLS di dalam satu Jorong/SLS -- dimuat lazy (baru
// difetch saat baris diklik "unhide") dari GET .../alokasi/subsls.
interface SubslsRow {
  subsls_kode: string;
  label: string;
  jumlah_potensi: number;
  skor_dasar_rata: number;
  sudah_dipilih_oleh: number;
}

// Bentuk "pilihan" yg dikembalikan endpoint rekomendasi & dikirim ke
// submit -- subsls_kode null/kosong berarti pilih SELURUH SLS/Jorong.
interface PilihanEntry {
  sls_key: string;
  subsls_kode: string[] | null;
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
  subsls_kode_list: string[] | null;
}

interface AutoAlokasiBaris {
  petugas_id: number;
  nama: string;
  tier: 1 | 2 | 3;
  tier_label: string;
  jumlah_dialokasikan: number;
  daftar_sls: string[];
}

interface AutoAlokasiHasil {
  jumlah_petugas_diproses: number;
  jumlah_petugas_dilewati: number;
  jumlah_rebutan_terjadi: number;
  jumlah_dpt_penuh: number;
  hasil: AutoAlokasiBaris[];
  pesan?: string;
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

      <WilayahSampelPanel token={token} nama={nama} petugasId={petugasId} onSessionExpired={onSessionExpired} />

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

// Bagian 2: "Identifikasi Wilayah Sampel SLS" -- checklist maks 5 SLS/
// Jorong rekomendasi + matriks gabungan sesudah submit. Header tabel pakai
// komponen bersama ExcelTh/useExcelTable (app/penyisiran/_shared/
// excel-table.tsx) -- tiap kolom bisa diurutkan (klik nama kolom) & bisa
// difilter (klik "▾", checklist nilai unik, spt Filter/Sort di Excel),
// murni client-side di atas hasil rekomendasi yg sama (tidak nambah
// request API).
function WilayahSampelPanel({
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RekomendasiRow[]>([]);
  // Map sls_key -> subsls_kode_list: NULL = pilih SELURUH SLS/Jorong
  // (perilaku lama), array = cuma SEBAGIAN SUBSLS (fitur "unhide"). Key
  // TIDAK ada di map sama sekali = baris itu tidak dipilih.
  const [dipilih, setDipilih] = useState<Map<string, string[] | null>>(new Map());
  // sls_key yang sedang "di-unhide" (rincian per SUBSLS-nya tampil).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Cache hasil fetch rincian SUBSLS per sls_key -- "loading"/"error" saat
  // proses, array kalau sudah berhasil dimuat.
  const [subslsCache, setSubslsCache] = useState<Map<string, SubslsRow[] | "loading" | "error">>(new Map());
  const [sudahPernahSubmit, setSudahPernahSubmit] = useState(false);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [lokasiBusy, setLokasiBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [tampilkanMatrix, setTampilkanMatrix] = useState(false);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [autoErr, setAutoErr] = useState<string | null>(null);
  const [autoHasil, setAutoHasil] = useState<AutoAlokasiHasil | null>(null);

  // Export Excel Pengawas/Pencacah per SUBSLS -- HANYA utk data yang SUDAH
  // MASUK (dipilih petugas), format kolom mengikuti contoh file dari
  // pengelola. Fetch manual + blob (bukan window.open langsung ke URL API)
  // krn endpoint butuh header Authorization -- pola SAMA dgn handleUnduh di
  // administrasi-spj.tsx. Akses endpointnya sendiri jg dijaga di server
  // (lihat .../alokasi/export-subsls/route.ts), tombol ini cuma disembunyikan
  // dari petugas biasa demi UX (lihat gate bolehAksesManajemenTarget(nama)
  // di JSX di bawah).
  async function handleExportSubsls() {
    setExportBusy(true);
    setExportErr(null);
    try {
      const res = await fetch("/api/penyisiran/alokasi/export-subsls", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Gagal (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "alokasi_pengawas_pencacah_subsls.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal mengunduh file.";
      setExportErr(msg);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
    } finally {
      setExportBusy(false);
    }
  }

  // Alokasi otomatis 5 SLS/Jorong prioritas tertinggi utk SEMUA petugas
  // yg BELUM PERNAH submit sendiri -- lihat penjelasan lengkap algoritma
  // & justifikasi tiap keputusan (tier lokasi, petugas yg sudah submit
  // TIDAK disentuh) di .../alokasi/auto-alokasi/route.ts. Tombol ini
  // butuh 2x klik (arm/konfirmasi) krn menimpa data BANYAK petugas
  // sekaligus & tidak bisa "dibatalkan" otomatis (cuma bisa diubah manual
  // satu-satu lewat checklist masing2 petugas sesudahnya).
  async function handleAutoAlokasi() {
    if (!autoConfirm) {
      setAutoConfirm(true);
      return;
    }
    setAutoBusy(true);
    setAutoErr(null);
    try {
      const data = await apiFetch("/api/penyisiran/alokasi/auto-alokasi", token, { method: "POST" });
      setAutoHasil(data as AutoAlokasiHasil);
      setAutoConfirm(false);
      await muatRekomendasi();
      if (tampilkanMatrix) await muatMatrix();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menjalankan alokasi otomatis.";
      setAutoErr(msg);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
    } finally {
      setAutoBusy(false);
    }
  }

  async function muatRekomendasi() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/penyisiran/alokasi/rekomendasi", token);
      setRows(Array.isArray(data?.data) ? data.data : []);
      const pilihanAwal: PilihanEntry[] = Array.isArray(data?.pilihan) ? data.pilihan : [];
      setDipilih(new Map(pilihanAwal.map((p) => [p.sls_key, p.subsls_kode ?? null])));
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

  // Klik baris/checkbox INDUK -- toggle pilih SELURUH SLS/Jorong (null).
  // Kalau baris ini sebelumnya sedang partial (sebagian SUBSLS dipilih),
  // klik ini akan MELEPAS semua sekaligus (bukan menambah jadi penuh) --
  // konsisten dgn checkbox lain: klik pada baris yg aktif = uncheck.
  function toggleSls(key: string) {
    setDipilih((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= MAKS_PILIHAN) return prev;
        next.set(key, null);
      }
      return next;
    });
  }

  // Buka/tutup rincian per SUBSLS utk satu baris ("unhide"), fetch lazy
  // (cuma sekali per sls_key, hasilnya di-cache) dari
  // GET /api/penyisiran/alokasi/subsls?sls_key=...
  async function toggleUnhide(slsKey: string) {
    const sedangTerbuka = expanded.has(slsKey);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (sedangTerbuka) next.delete(slsKey);
      else next.add(slsKey);
      return next;
    });
    if (!sedangTerbuka && !subslsCache.has(slsKey)) {
      setSubslsCache((prev) => new Map(prev).set(slsKey, "loading"));
      try {
        const data = await apiFetch(
          `/api/penyisiran/alokasi/subsls?sls_key=${encodeURIComponent(slsKey)}`,
          token
        );
        setSubslsCache((prev) => new Map(prev).set(slsKey, Array.isArray(data?.data) ? data.data : []));
      } catch {
        setSubslsCache((prev) => new Map(prev).set(slsKey, "error"));
      }
    }
  }

  // Klik checkbox SATU SUBSLS (di dalam baris yang sudah di-unhide) --
  // mengubah pilihan baris induknya jadi PARTIAL (array kode SUBSLS),
  // atau balik jadi "seluruh SLS" (null) kalau ujung2nya semua SUBSLS
  // tercentang, atau lepas total kalau tidak ada satupun SUBSLS
  // tercentang lagi. semuaKode = daftar LENGKAP kode SUBSLS baris ini
  // (dari hasil fetch unhide), dipakai utk tahu kapan "semua tercentang".
  function toggleSubsls(slsKey: string, subslsKode: string, semuaKode: string[]) {
    setDipilih((prev) => {
      const next = new Map(prev);
      const current = next.get(slsKey); // undefined = blm dipilih, null = seluruh SLS, array = partial
      let set: Set<string>;
      if (current === undefined) {
        if (next.size >= MAKS_PILIHAN) return prev; // slot penuh, tidak bisa mulai baris baru
        set = new Set<string>();
      } else if (current === null) {
        set = new Set(semuaKode); // sedang "seluruh SLS" -> anggap semua tercentang dulu
      } else {
        set = new Set(current);
      }
      if (set.has(subslsKode)) set.delete(subslsKode);
      else set.add(subslsKode);

      if (set.size === 0) {
        next.delete(slsKey);
      } else if (set.size >= semuaKode.length) {
        next.set(slsKey, null); // semua SUBSLS tercentang -> setara "pilih seluruh SLS"
      } else {
        next.set(slsKey, Array.from(set));
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
      const pilihanPayload = Array.from(dipilih.entries()).map(([sls_key, subsls_kode]) => ({
        sls_key,
        subsls_kode: subsls_kode ?? undefined,
      }));
      const data = await apiFetch("/api/penyisiran/alokasi/submit", token, {
        method: "POST",
        body: JSON.stringify({ pilihan: pilihanPayload }),
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

  const kolomRekomendasi = useMemo(
    () => [
      { key: "sls_nama", label: "Jorong / SLS", getValue: (r: RekomendasiRow) => r.sls_nama },
      { key: "nagari_nama", label: "Nagari", getValue: (r: RekomendasiRow) => r.nagari_nama },
      { key: "kec_nama", label: "Kecamatan", getValue: (r: RekomendasiRow) => r.kec_nama },
      { key: "jumlah_potensi", label: "Potensi KK", getValue: (r: RekomendasiRow) => r.jumlah_potensi },
      { key: "jarak_km", label: "Jarak (km)", getValue: (r: RekomendasiRow) => r.jarak_km },
      { key: "skor_akhir", label: "Skor Akhir", getValue: (r: RekomendasiRow) => r.skor_akhir },
      { key: "sudah_dipilih_oleh", label: "Dipilih Petugas", getValue: (r: RekomendasiRow) => r.sudah_dipilih_oleh },
    ],
    []
  );
  const tabelRekomendasi = useExcelTable(rows, kolomRekomendasi, { key: "skor_akhir", dir: "desc" });

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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm font-semibold text-navy-900">
            📋 Identifikasi Wilayah Sampel SLS (maks {MAKS_PILIHAN})
          </p>
          {/* Tombol export cuma utk pengelola (sama spt akses tab Manajemen
              Target/Master Petugas) -- narik data yang SUDAH MASUK (semua
              petugas), dipecah per SUBSLS, kolom Email Pengawas/Pencacah
              diambil dari tab Master Petugas. */}
          {bolehAksesManajemenTarget(nama) && (
            <div className="flex flex-col items-end gap-1.5 text-right">
              <button
                type="button"
                onClick={handleExportSubsls}
                disabled={exportBusy}
                className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
              >
                {exportBusy ? "Menyiapkan..." : "⬇ Export Excel Pengawas/Pencacah (per SUBSLS)"}
              </button>
              {exportErr && <p className="max-w-[220px] text-[10px] text-rust-700">⚠ {exportErr}</p>}

              <button
                type="button"
                onClick={handleAutoAlokasi}
                disabled={autoBusy}
                className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50 ${
                  autoConfirm
                    ? "border-rust-400 bg-rust-50 text-rust-700 hover:bg-rust-100"
                    : "border-line bg-white text-navy-700 hover:border-navy-400"
                }`}
              >
                {autoBusy
                  ? "Menjalankan..."
                  : autoConfirm
                  ? "✅ Yakin? Klik lagi utk konfirmasi"
                  : "🎯 Alokasikan Otomatis (Prioritas)"}
              </button>
              {autoConfirm && !autoBusy && (
                <button
                  type="button"
                  onClick={() => setAutoConfirm(false)}
                  className="text-[10px] text-ink/50 underline hover:text-ink/70"
                >
                  Batal
                </button>
              )}
              {autoErr && <p className="max-w-[220px] text-[10px] text-rust-700">⚠ {autoErr}</p>}
            </div>
          )}
        </div>
        {bolehAksesManajemenTarget(nama) && autoConfirm && !autoBusy && (
          <p className="mt-2 max-w-md text-right text-[11px] text-rust-700">
            Ini akan mengisi otomatis 5 SLS/Jorong prioritas tertinggi utk SEMUA petugas yang BELUM PERNAH submit
            pilihan sendiri (yang sudah submit tidak diubah). Kalau jorong yang sama diminati beberapa petugas,
            yang menang adalah yang datanya paling akurat &amp; skornya paling tinggi utk jorong itu -- petugas
            lain otomatis dialihkan ke pilihan berikutnya.
          </p>
        )}
        {bolehAksesManajemenTarget(nama) && autoHasil && (
          <div className="mt-3 rounded-md border border-navy-200 bg-navy-50/60 p-3 text-[11px]">
            <p className="font-semibold text-navy-900">
              🎯 Hasil Alokasi Otomatis: {autoHasil.jumlah_petugas_diproses} petugas diproses (
              {autoHasil.jumlah_dpt_penuh} dapat penuh {MAKS_PILIHAN}/{MAKS_PILIHAN}), {autoHasil.jumlah_petugas_dilewati}{" "}
              petugas dilewati (sudah pernah submit sendiri), {autoHasil.jumlah_rebutan_terjadi}x rebutan
              jorong diselesaikan otomatis.
            </p>
            {autoHasil.pesan && <p className="mt-1 text-ink/60">{autoHasil.pesan}</p>}
            {autoHasil.hasil.length > 0 && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded border border-navy-200/70 bg-white">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-cream-50 text-[10px] uppercase tracking-wide text-ink/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Petugas</th>
                      <th className="px-2 py-1.5 text-left">Sumber Lokasi</th>
                      <th className="px-2 py-1.5 text-right">Jumlah</th>
                      <th className="px-2 py-1.5 text-left">Jorong/SLS Terpilih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {autoHasil.hasil.map((h) => (
                      <tr key={h.petugas_id} className="border-t border-line/60">
                        <td className="px-2 py-1.5 font-medium text-navy-900">{h.nama}</td>
                        <td className="px-2 py-1.5 text-ink/60">{h.tier_label}</td>
                        <td className="px-2 py-1.5 text-right">
                          {h.jumlah_dialokasikan}/{MAKS_PILIHAN}
                        </td>
                        <td className="px-2 py-1.5 text-ink/70">{h.daftar_sls.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <p className="mt-1 text-xs text-ink/60">
          Pilih 5 kandidat wilayah sampel, diurutkan menurut skor prioritas akhir tertinggi (skor sumber +
          identifikasi, ditambah bonus volume potensi KK, dikurangi penalti jarak dari lokasi rumah Anda). SLS
          boleh dipilih lebih dari 1 petugas. Baris yang punya tombol &ldquo;▸&rdquo; bisa di-unhide utk dipecah
          per Sub SLS &mdash; berguna kalau 1 Jorong ingin dibagi ke beberapa PPL berbeda.
        </p>
        <p className="mt-1 text-xs font-medium text-navy-700">
          Terpilih: {dipilih.size} / {MAKS_PILIHAN}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink/40">
          <p>Klik nama kolom utk urutkan, klik &ldquo;▾&rdquo; di header utk filter (spt Excel).</p>
          {tabelRekomendasi.adaFilterAktif && (
            <button
              type="button"
              onClick={tabelRekomendasi.resetFilters}
              className="shrink-0 rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900"
            >
              Reset semua filter
            </button>
          )}
        </div>

        <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-cream-50 text-[11px] uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-2 py-2 text-left">✓</th>
                {kolomRekomendasi.map((k) => (
                  <ExcelTh
                    key={k.key}
                    colKey={k.key}
                    label={k.label}
                    align={["jumlah_potensi", "jarak_km", "skor_akhir", "sudah_dipilih_oleh"].includes(k.key) ? "right" : "left"}
                    sortKey={tabelRekomendasi.sortKey}
                    sortDir={tabelRekomendasi.sortDir}
                    onSort={tabelRekomendasi.toggleSort}
                    values={tabelRekomendasi.uniqueValues[k.key] ?? []}
                    activeFilter={tabelRekomendasi.filters[k.key]}
                    onFilterChange={tabelRekomendasi.setColumnFilter}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {tabelRekomendasi.rows.map((r) => {
                const current = dipilih.get(r.sls_key); // undefined/null/string[]
                const aktif = current !== undefined;
                const partial = Array.isArray(current);
                const penuh = !aktif && dipilih.size >= MAKS_PILIHAN;
                const bisaUnhide = r.jumlah_subsls > 1;
                const isExpanded = expanded.has(r.sls_key);
                const subslsState = subslsCache.get(r.sls_key);
                const semuaKode = Array.isArray(subslsState) ? subslsState.map((s) => s.subsls_kode) : [];

                return (
                  <Fragment key={r.sls_key}>
                    <tr
                      className={`cursor-pointer border-t border-line/60 ${aktif ? "bg-navy-50" : "hover:bg-cream-50"} ${
                        penuh ? "opacity-40" : ""
                      }`}
                      onClick={() => !penuh && toggleSls(r.sls_key)}
                    >
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        {/* stopPropagation DI SINI (bukan cuma di <input>-nya) --
                            <tr> di atas jg py onClick toggleSls yg SAMA; tanpa ini,
                            klik TEPAT di kotak centang akan memicu toggle DUA KALI
                            (sekali dari onChange <input>, sekali lagi dari klik yg
                            "naik"/bubbling ke <tr>) -- hasilnya nge-toggle balik ke
                            status semula & KELIHATAN spt tombolnya tidak merespons
                            sama sekali padahal klik di luar kotak centang (di sel
                            lain baris yg sama) berhasil normal. */}
                        <input type="checkbox" checked={aktif} disabled={penuh} onChange={() => toggleSls(r.sls_key)} />
                      </td>
                      <td className="px-2 py-1.5 font-medium text-navy-900">
                        <div className="flex items-center gap-1.5">
                          {bisaUnhide && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleUnhide(r.sls_key);
                              }}
                              title={
                                isExpanded
                                  ? "Tutup rincian Sub SLS"
                                  : `Unhide -- pecah jadi ${r.jumlah_subsls} Sub SLS (bisa dibagi ke PPL berbeda)`
                              }
                              className="shrink-0 rounded border border-line px-1 text-[10px] leading-4 text-ink/50 hover:border-navy-400 hover:text-navy-700"
                            >
                              {isExpanded ? "▾" : "▸"}
                            </button>
                          )}
                          <span>{r.sls_nama}</span>
                          {partial && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                              {current.length}/{r.jumlah_subsls} Sub SLS
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">{r.nagari_nama}</td>
                      <td className="px-2 py-1.5">{r.kec_nama}</td>
                      <td className="px-2 py-1.5 text-right">{r.jumlah_potensi}</td>
                      <td className="px-2 py-1.5 text-right">{r.jarak_km != null ? r.jarak_km.toFixed(1) : "-"}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-navy-900">{r.skor_akhir}</td>
                      <td className="px-2 py-1.5 text-right text-ink/50">
                        {r.sudah_dipilih_oleh > 0 ? `${r.sudah_dipilih_oleh} org` : "-"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t border-line/40 bg-cream-50/60">
                        <td />
                        <td colSpan={kolomRekomendasi.length} className="px-2 py-2">
                          {subslsState === "loading" && (
                            <p className="text-[11px] text-ink/50">Memuat rincian Sub SLS...</p>
                          )}
                          {subslsState === "error" && (
                            <p className="text-[11px] text-rust-700">Gagal memuat rincian Sub SLS.</p>
                          )}
                          {Array.isArray(subslsState) && subslsState.length === 0 && (
                            <p className="text-[11px] text-ink/50">Tidak ada data Sub SLS.</p>
                          )}
                          {Array.isArray(subslsState) && subslsState.length > 0 && (
                            <table className="w-full text-[11px]">
                              <thead className="text-[10px] uppercase tracking-wide text-ink/40">
                                <tr>
                                  <th className="w-8" />
                                  <th className="px-2 py-1 text-left">Sub SLS</th>
                                  <th className="px-2 py-1 text-right">Potensi KK</th>
                                  <th className="px-2 py-1 text-right">Skor Dasar</th>
                                  <th className="px-2 py-1 text-right">Dipilih Petugas</th>
                                </tr>
                              </thead>
                              <tbody>
                                {subslsState.map((s) => {
                                  const checkedSub =
                                    current === null || (Array.isArray(current) && current.includes(s.subsls_kode));
                                  const disabledSub = !aktif && dipilih.size >= MAKS_PILIHAN;
                                  return (
                                    <tr key={s.subsls_kode} className="border-t border-line/30">
                                      <td className="py-1 pl-4">
                                        <input
                                          type="checkbox"
                                          checked={checkedSub}
                                          disabled={disabledSub}
                                          onChange={() => toggleSubsls(r.sls_key, s.subsls_kode, semuaKode)}
                                        />
                                      </td>
                                      <td className="px-2 py-1 text-ink/80">{s.label}</td>
                                      <td className="px-2 py-1 text-right">{s.jumlah_potensi}</td>
                                      <td className="px-2 py-1 text-right">{s.skor_dasar_rata}</td>
                                      <td className="px-2 py-1 text-right text-ink/50">
                                        {s.sudah_dipilih_oleh > 0 ? `${s.sudah_dipilih_oleh} org` : "-"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {tabelRekomendasi.rows.length === 0 && (
                <tr>
                  <td colSpan={kolomRekomendasi.length + 1} className="px-2 py-6 text-center text-ink/50">
                    Tidak ada data{tabelRekomendasi.adaFilterAktif && " utk filter ini"}.
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
  // Kelompokkan matrix flat -> Kecamatan > Nagari > SLS/Jorong > [label petugas]
  // Label petugas menyertakan rincian Sub SLS kalau pilihannya SEBAGIAN
  // (subsls_kode_list terisi, hasil "unhide") -- kalau NULL (pilih
  // seluruh SLS/Jorong) cukup tampilkan nama petugasnya saja spt sebelumnya.
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
    const label =
      Array.isArray(r.subsls_kode_list) && r.subsls_kode_list.length > 0
        ? `${r.petugas_nama} (Sub SLS: ${r.subsls_kode_list.join(", ")})`
        : r.petugas_nama;
    nag.sls.get(r.sls_key)!.petugas.push(label);
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
