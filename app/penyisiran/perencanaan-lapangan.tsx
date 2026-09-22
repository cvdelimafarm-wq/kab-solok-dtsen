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
//     SEBANYAK yang dia mau (TIDAK ADA BATAS JUMLAH -- dulu maks 5, batas
//     itu DIHAPUS atas permintaan user) -> tombol "Kirim Pilihan" -> POST
//     /api/penyisiran/alokasi/submit (REPLACE penuh pilihan lama). SEBAGAI
//     GANTI batas jumlah, checklist sekarang EKSKLUSIF: 1 Sub SLS (atau 1
//     SLS utuh kalau tidak py breakdown Sub SLS) HANYA BOLEH dipegang SATU
//     petugas -- BEDA dari perilaku lama yg mengizinkan SLS yg sama
//     dipilih >1 petugas bebas tanpa saling menghalangi. Baris yang sudah
//     habis diambil petugas lain tampak pudar & checkbox-nya terkunci;
//     baris yang SEBAGIAN sudah diambil memaksa pakai "unhide" (lihat di
//     bawah) drpd centang langsung baris induknya. Validasi FINAL & PASTI
//     ada di server (app/api/penyisiran/alokasi/submit/route.ts, balas 409
//     kalau bentrok) -- field tersedia/boleh_pilih_seluruh dari endpoint
//     rekomendasi cuma utk UI (disable checkbox), bukan satu2nya penjaga.
//     Sesudah submit (atau kalau petugas SUDAH PERNAH submit sebelumnya --
//     dideteksi dari field "pilihan" yg dikembalikan endpoint
//     rekomendasi), matriks gabungan SEMUA petugas dimunculkan (GET
//     /api/penyisiran/alokasi/matrix) -- HANYA menampilkan SLS/Jorong yang
//     SUDAH dipilih minimal 1 petugas (yang belum dipilih siapa pun tidak
//     ikut tampil), dikelompokkan per Kecamatan > Nagari > SLS/Jorong dgn
//     daftar nama petugas yang memilihnya (+ rincian Sub SLS kalau
//     pilihannya sebagian, lihat subsls_kode_list di MatrixPanel).
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
//     (mis. Sub SLS 01-02 utk PPL A, Sub SLS 03 utk PPL B) -- Sub SLS yang
//     sudah dipegang petugas LAIN otomatis terkunci (checkbox disabled,
//     kolom "Dipegang" menunjukkan namanya) krn checklist ini EKSKLUSIF
//     (lihat penjelasan di atas). Kalau SEMUA SUBSLS di baris itu tercentang, otomatis
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
//     Di dalam panel yg sama ada "Monitoring Alokasi Hari Tugas"
//     (GridAlokasiDanKuota) -- kotak kuota (Kuota/Terpakai/Sisa) + grid
//     kalender ringkas (baris = nama petugas, kolom = tanggal 17-30 Sep,
//     sel = titik bulat berwarna, BUKAN teks/bar lebar spt contoh gambar
//     user, supaya kolom tanggal bisa sempit) -- field `grid` dari respons
//     GET .../oh-monitoring (lihat komentar lengkap di route.ts itu):
//     hijau = direncanakan & sudah ada foto dokumentasi SPJ, merah =
//     direncanakan tapi belum ada foto (dianggap tidak jalan), abu2 =
//     tidak direncanakan/dibatalkan/libur. Ada tombol "Salin sebagai
//     Gambar" (html2canvas + Clipboard API, POLA SAMA dgn
//     salinTabelSebagaiGambar di app/seruti/page.tsx: render ke elemen
//     tersembunyi off-screen lebar tetap, lalu disalin sbg PNG ke
//     clipboard supaya gampang ditempel langsung ke grup WA -- fallback
//     unduh file kalau browser tidak dukung clipboard image).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";
import { useExcelTable, ExcelTh } from "./_shared/excel-table";

const TOKEN_KEY = "penyisiran-petugas-login-token";
const NAMA_KEY = "penyisiran-petugas-login-nama";
const PETUGAS_ID_STORE_KEY = "penyisiran-petugas-login-id";
const LAT_KEY = "penyisiran-petugas-login-lat";
const LNG_KEY = "penyisiran-petugas-login-lng";

// Dulu jg dipakai sbg batas jumlah checklist manual petugas (MAKS_PILIHAN)
// -- batas itu SUDAH DIHAPUS atas permintaan user (checklist manual
// sekarang BEBAS jumlahnya, dijaga ketersediaan lewat eksklusivitas per
// Sub SLS, bukan lewat kuota). Konstanta ini SEKARANG cuma dipakai utk
// target tetap tombol "🎯 Alokasikan Otomatis" (proses TERPISAH, khusus
// pengelola, TIDAK berubah -- lihat .../alokasi/auto-alokasi/route.ts).
const TARGET_AUTO_ALOKASI = 5;

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
  // Sejak checklist jadi EKSKLUSIF (lihat komentar di
  // .../alokasi/submit/route.ts): tersedia = masih ada MINIMAL 1 Sub SLS
  // (atau seluruh SLS-nya kalau tidak py breakdown Sub SLS) yg BISA
  // diambil petugas ini; boleh_pilih_seluruh = tidak ada petugas LAIN yg
  // pegang apa pun di SLS ini (kalau false tapi tersedia true, WAJIB
  // pakai "unhide" -- tidak boleh langsung centang baris induk).
  tersedia: boolean;
  boleh_pilih_seluruh: boolean;
}

// Rincian per SUBSLS di dalam satu Jorong/SLS -- dimuat lazy (baru
// difetch saat baris diklik "unhide") dari GET .../alokasi/subsls.
// dipilih_oleh_petugas_id null = masih bebas; kalau BUKAN milik petugas
// yang sedang login, checkbox-nya di-disable (lihat JSX tabel).
interface SubslsRow {
  subsls_kode: string;
  label: string;
  jumlah_potensi: number;
  skor_dasar_rata: number;
  dipilih_oleh_petugas_id: number | null;
  dipilih_oleh_nama: string | null;
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

// Bentuk data "Monitoring Status Pemilihan Sub-SLS" (DIPINDAH dari tab
// Monitoring ke sini, lihat SeksiPemilihanSubsls di bawah) -- RPC berdiri
// sendiri penyisiran_pemilihan_subsls() & penyisiran_detail_pemilihan_subsls().
interface PemilihanSubslsRow {
  id: number;
  nama: string;
  kec_domisili: string | null;
  nagari_domisili: string | null;
  kec_tugas: string | null;
  jumlah_subsls_ditag: number;
  jumlah_kk: number;
  jumlah_ditemukan: number;
  jumlah_sisa: number;
}

interface PemilihanSubsls {
  per_petugas: PemilihanSubslsRow[];
  total_subsls_belum_ditag: number;
}

interface DetailPemilihanSubslsRow {
  kec_nama: string;
  nagari_nama: string;
  sls_nama: string;
  subsls_kode: string;
  idsubsls: string;
  jumlah_kk: number;
}

interface DetailPemilihanSubslsDitagRow extends DetailPemilihanSubslsRow {
  jumlah_ditemukan: number;
}

interface DetailPemilihanSubsls {
  ditag: DetailPemilihanSubslsDitagRow[];
  belum_ditag: DetailPemilihanSubslsRow[];
  total_ditag_kk: number;
  total_belum_ditag_kk: number;
}

function persenPemilihan(bagian: number, total: number): number {
  return total > 0 ? Math.round((bagian / total) * 100) : 0;
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

      {/* DIPINDAH dari tab Monitoring (permintaan user) -- ditaruh tepat di
          bawah kartu "📋 Identifikasi Wilayah Sampel SLS" di atas. Data
          agregat SEMUA petugas (bukan personal), jadi digerbang pengelola
          spt panel2 lain di bawah ini. */}
      {bolehAksesManajemenTarget(nama) && <SeksiPemilihanSubsls token={token} />}

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

type StatusGridHariTugas = "hijau" | "merah" | "abu";

interface GridBarisPetugas {
  petugas_id: number;
  petugas_nama: string;
  status: Record<string, StatusGridHariTugas>;
}

const WARNA_GRID_HARI_TUGAS: Record<StatusGridHariTugas, string> = {
  hijau: "#0ca30c",
  merah: "#d03b3b",
  abu: "#9ca3af",
};

// Kotak kuota (Kuota/Terpakai/Sisa) + grid kalender ringkas per petugas --
// dipakai DUA KALI oleh OhMonitoringPanel (tampilan biasa on-screen & versi
// tersembunyi lebar tetap khusus sumber "Salin sebagai Gambar", lihat
// komentar panjang di atas file ini) supaya isi keduanya PERSIS SAMA.
function GridAlokasiDanKuota({
  kuota,
  terpakai,
  sisa,
  tanggalList,
  baris,
}: {
  kuota: number;
  terpakai: number;
  sisa: number;
  tanggalList: string[];
  baris: GridBarisPetugas[];
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <div className="rounded-md bg-paper/60 px-3 py-1.5">
          Kuota: <span className="font-semibold text-navy-900">{kuota} OH</span>
        </div>
        <div className="rounded-md bg-paper/60 px-3 py-1.5">
          Terpakai: <span className="font-semibold text-navy-900">{terpakai} OH</span>
        </div>
        <div className={`rounded-md px-3 py-1.5 ${sisa < 0 ? "bg-rust-100 text-rust-700" : "bg-paper/60"}`}>
          Sisa: <span className="font-semibold">{sisa} OH</span>
          {sisa < 0 && " -- kuota terlampaui!"}
        </div>
      </div>

      <table className="mt-3 border-collapse text-[11px]">
        <thead>
          <tr>
            <th className="border-b border-r border-line px-2 py-1 text-left font-semibold text-navy-900">
              Nama Petugas
            </th>
            {tanggalList.map((t) => (
              <th key={t} className="w-[20px] border-b border-line px-0.5 py-1 text-center font-medium text-ink/50">
                {Number(t.slice(-2))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => (
            <tr key={b.petugas_id} className="border-b border-line/60 last:border-0">
              <td className="whitespace-nowrap border-r border-line px-2 py-1 font-medium text-navy-900">
                {b.petugas_nama}
              </td>
              {tanggalList.map((t) => (
                <td key={t} className="px-0.5 py-1 text-center">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: WARNA_GRID_HARI_TUGAS[b.status[t] ?? "abu"] }}
                  />
                </td>
              ))}
            </tr>
          ))}
          {baris.length === 0 && (
            <tr>
              <td colSpan={tanggalList.length + 1} className="px-2 py-4 text-center text-ink/40">
                Belum ada data.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-ink/60">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WARNA_GRID_HARI_TUGAS.hijau }} />
          Direncanakan
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WARNA_GRID_HARI_TUGAS.merah }} />
          Direncanakan, belum ada foto dokumentasi (dianggap tidak jalan)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WARNA_GRID_HARI_TUGAS.abu }} />
          Tidak ada rencana / libur
        </span>
      </div>
    </div>
  );
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
  const [gridTanggal, setGridTanggal] = useState<string[]>([]);
  const [gridBaris, setGridBaris] = useState<GridBarisPetugas[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "done" | "error">("idle");

  async function muat() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/penyisiran/alokasi/oh-monitoring", token);
      setKuota(data?.kuota ?? 0);
      setTerpakai(data?.terpakai ?? 0);
      setRincian(Array.isArray(data?.rincian) ? data.rincian : []);
      setGridTanggal(Array.isArray(data?.grid?.tanggalList) ? data.grid.tanggalList : []);
      setGridBaris(Array.isArray(data?.grid?.baris) ? data.grid.baris : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat monitoring OH.");
    } finally {
      setLoading(false);
    }
  }

  // Salin grid+kotak kuota sbg gambar PNG ke clipboard, siap ditempel
  // langsung ke chat WA -- pola SAMA persis dgn salinTabelSebagaiGambar di
  // app/seruti/page.tsx (render dari elemen tersembunyi off-screen lebar
  // tetap, bukan dari tampilan on-screen, supaya hasilnya konsisten tanpa
  // peduli lebar layar/scroll pengguna).
  async function salinSebagaiGambar() {
    if (!gridRef.current) return;
    setCopyStatus("copying");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(gridRef.current, { backgroundColor: "#ffffff", scale: 2 });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setCopyStatus("error");
          return;
        }
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setCopyStatus("done");
          setTimeout(() => setCopyStatus("idle"), 2500);
        } catch {
          // Fallback: unduh langsung kalau clipboard image tidak didukung browser.
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "monitoring-alokasi-hari-tugas.png";
          a.click();
          URL.revokeObjectURL(url);
          setCopyStatus("done");
          setTimeout(() => setCopyStatus("idle"), 2500);
        }
      });
    } catch {
      setCopyStatus("error");
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

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-navy-900">📅 Monitoring Alokasi Hari Tugas</p>
            <button
              type="button"
              onClick={salinSebagaiGambar}
              disabled={copyStatus === "copying"}
              className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
            >
              {copyStatus === "copying"
                ? "Menyalin..."
                : copyStatus === "done"
                ? "Tersalin ✓"
                : copyStatus === "error"
                ? "Gagal, coba lagi"
                : "📋 Salin sebagai Gambar"}
            </button>
          </div>
          <div className="mt-2 overflow-x-auto">
            <GridAlokasiDanKuota kuota={kuota} terpakai={terpakai} sisa={sisa} tanggalList={gridTanggal} baris={gridBaris} />
          </div>
          {/* Salinan tersembunyi lebar tetap, dipakai sbg sumber gambar saat tombol "Salin sebagai Gambar" diklik -- lihat salinSebagaiGambar. */}
          <div ref={gridRef} className="fixed -left-[9999px] top-0 w-[720px]" aria-hidden="true">
            <GridAlokasiDanKuota kuota={kuota} terpakai={terpakai} sisa={sisa} tanggalList={gridTanggal} baris={gridBaris} />
          </div>

          <p className="mt-4 text-xs font-semibold text-navy-900">🛠 Rincian &amp; Kelola per Petugas</p>
          <div className="mt-2 max-h-[24rem] space-y-2 overflow-y-auto">
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

// Bagian 2: "Identifikasi Wilayah Sampel SLS" -- checklist BEBAS JUMLAH
// (eksklusif per Sub SLS) SLS/Jorong rekomendasi + matriks gabungan
// sesudah submit. Header tabel pakai
// komponen bersama ExcelTh/useExcelTable (app/penyisiran/_shared/
// excel-table.tsx) -- tiap kolom bisa diurutkan (klik nama kolom) & bisa
// difilter (klik "▾", checklist nilai unik, spt Filter/Sort di Excel),
// murni client-side di atas hasil rekomendasi yg sama (tidak nambah
// request API). SEMUA tabel di bagian ini pakai pola yg sama: tabel
// rekomendasi utama, tabel rincian per Sub SLS saat "unhide" (komponen
// terpisah SubslsDetailTable -- lihat komentar di sana knp harus dipisah),
// & tabel hasil "🎯 Alokasikan Otomatis".
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
  // konsisten dgn checkbox lain: klik pada baris yg aktif = uncheck. TIDAK
  // ADA lagi batas jumlah (dulu MAKS_PILIHAN) -- yang membatasi sekarang
  // cuma ketersediaan (baris.tersedia/boleh_pilih_seluruh dari server,
  // lihat pemakaian di JSX tabel di bawah, disabled lewat prop `disabled`
  // pada elemen checkbox-nya, BUKAN di sini).
  function toggleSls(key: string) {
    setDipilih((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, null);
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
  // TIDAK ADA lagi batas jumlah -- Sub SLS yg sudah dipegang petugas LAIN
  // dicegah lewat prop `disabled` pada checkbox-nya sendiri di JSX
  // (dipilih_oleh_petugas_id), bukan di fungsi ini.
  function toggleSubsls(slsKey: string, subslsKode: string, semuaKode: string[]) {
    setDipilih((prev) => {
      const next = new Map(prev);
      const current = next.get(slsKey); // undefined = blm dipilih, null = seluruh SLS, array = partial
      let set: Set<string>;
      if (current === undefined) {
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
      // Muat ulang rekomendasi jg (bukan cuma matrix) -- field
      // tersedia/boleh_pilih_seluruh per baris perlu disegarkan supaya
      // baris yg baru saja diambil langsung kelihatan terkunci bagi
      // petugas LAIN yang sedang membuka halaman ini bersamaan.
      await Promise.all([muatMatrix(), muatRekomendasi()]);
    } catch (e: unknown) {
      // SENGAJA TIDAK muatRekomendasi() di sini (beda dgn jalur sukses di
      // atas) -- kalau gagal krn konflik eksklusivitas (409), memuat ulang
      // akan menimpa balik `dipilih` ke pilihan TERSIMPAN TERAKHIR (blm
      // termasuk perubahan yg baru diketik petugas), menghapus diam2
      // centangan lain yg sebenarnya masih valid & belum sempat disimpan.
      // Cukup tampilkan pesan errornya (sudah menyebut SLS/Sub SLS mana yg
      // bentrok, lihat .../alokasi/submit/route.ts) & biarkan petugas
      // membatalkan sendiri centang yg bentrok itu sebelum kirim ulang.
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

  // Header tabel hasil "Alokasikan Otomatis" (pengelola) jg pakai ExcelTh --
  // hook dipanggil DI SINI (bukan di dalam blok `{autoHasil && (...)}`) krn
  // Hooks React wajib dipanggil tanpa syarat; kalau autoHasil belum ada,
  // cukup dikasih array kosong.
  const kolomAutoHasil = useMemo(
    () => [
      { key: "nama", label: "Petugas", getValue: (h: AutoAlokasiBaris) => h.nama },
      { key: "tier_label", label: "Sumber Lokasi", getValue: (h: AutoAlokasiBaris) => h.tier_label },
      { key: "jumlah_dialokasikan", label: "Jumlah", getValue: (h: AutoAlokasiBaris) => h.jumlah_dialokasikan },
      { key: "daftar_sls", label: "Jorong/SLS Terpilih", getValue: (h: AutoAlokasiBaris) => h.daftar_sls.join(", ") },
    ],
    []
  );
  const tabelAutoHasil = useExcelTable(autoHasil?.hasil ?? [], kolomAutoHasil, { key: "nama", dir: "asc" });

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
            📋 Identifikasi Wilayah Sampel SLS
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
              {autoHasil.jumlah_dpt_penuh} dapat penuh {TARGET_AUTO_ALOKASI}/{TARGET_AUTO_ALOKASI}),{" "}
              {autoHasil.jumlah_petugas_dilewati}{" "}
              petugas dilewati (sudah pernah submit sendiri), {autoHasil.jumlah_rebutan_terjadi}x rebutan
              jorong diselesaikan otomatis.
            </p>
            {autoHasil.pesan && <p className="mt-1 text-ink/60">{autoHasil.pesan}</p>}
            {autoHasil.hasil.length > 0 && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded border border-navy-200/70 bg-white">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-cream-50 text-[10px] uppercase tracking-wide text-ink/50">
                    <tr>
                      {kolomAutoHasil.map((k) => (
                        <ExcelTh
                          key={k.key}
                          colKey={k.key}
                          label={k.label}
                          align={k.key === "jumlah_dialokasikan" ? "right" : "left"}
                          sortKey={tabelAutoHasil.sortKey}
                          sortDir={tabelAutoHasil.sortDir}
                          onSort={tabelAutoHasil.toggleSort}
                          values={tabelAutoHasil.uniqueValues[k.key] ?? []}
                          activeFilter={tabelAutoHasil.filters[k.key]}
                          onFilterChange={tabelAutoHasil.setColumnFilter}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tabelAutoHasil.rows.map((h) => (
                      <tr key={h.petugas_id} className="border-t border-line/60">
                        <td className="px-2 py-1.5 font-medium text-navy-900">{h.nama}</td>
                        <td className="px-2 py-1.5 text-ink/60">{h.tier_label}</td>
                        <td className="px-2 py-1.5 text-right">
                          {h.jumlah_dialokasikan}/{TARGET_AUTO_ALOKASI}
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
          Pilih SEBANYAK yang Anda mau (tidak ada batas jumlah), diurutkan menurut skor prioritas akhir tertinggi
          (skor sumber + identifikasi, ditambah bonus volume potensi KK, dikurangi penalti jarak dari lokasi
          rumah Anda). Setiap Sub SLS (atau seluruh SLS kalau tidak punya Sub SLS) hanya bisa dipegang SATU
          petugas &mdash; baris yang sudah diambil penuh oleh petugas lain akan tampak pudar &amp; tidak bisa
          dicentang. Baris yang punya tombol &ldquo;▸&rdquo; bisa di-unhide utk dipecah per Sub SLS &mdash;
          berguna kalau 1 Jorong ingin dibagi ke beberapa PPL berbeda, atau sebagiannya sudah diambil orang lain.
        </p>
        <p className="mt-1 text-xs font-medium text-navy-700">
          Terpilih: {dipilih.size} SLS/Jorong
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
                // Checkbox INDUK (pilih SELURUH SLS) cuma boleh diklik kalau:
                // sudah aktif (utk bisa di-uncheck), ATAU masih tersedia DAN
                // tidak ada petugas lain yg pegang apa pun di SLS ini. Kalau
                // tersedia tapi SEBAGIAN sudah diambil org lain, petugas WAJIB
                // pakai "unhide" utk memilih Sub SLS yg masih sisa saja.
                const utamaBisaDiklik = aktif || (r.tersedia && r.boleh_pilih_seluruh);
                const bisaUnhide = r.jumlah_subsls > 1;
                const isExpanded = expanded.has(r.sls_key);
                const subslsState = subslsCache.get(r.sls_key);

                let statusLabel: string | null = null;
                if (!aktif && !r.tersedia) statusLabel = "Sudah diambil semua";
                else if (!aktif && r.tersedia && !r.boleh_pilih_seluruh) statusLabel = "Sebagian sudah diambil";

                return (
                  <Fragment key={r.sls_key}>
                    <tr
                      className={`border-t border-line/60 ${utamaBisaDiklik ? "cursor-pointer" : ""} ${
                        aktif ? "bg-navy-50" : "hover:bg-cream-50"
                      } ${!aktif && !r.tersedia ? "opacity-40" : ""}`}
                      onClick={() => utamaBisaDiklik && toggleSls(r.sls_key)}
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
                        <input
                          type="checkbox"
                          checked={aktif}
                          disabled={!utamaBisaDiklik}
                          onChange={() => toggleSls(r.sls_key)}
                        />
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
                          {statusLabel && (
                            <span className="shrink-0 rounded-full bg-line/60 px-1.5 py-0.5 text-[10px] font-medium text-ink/50">
                              {statusLabel}
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
                            <SubslsDetailTable
                              rows={subslsState}
                              current={current}
                              petugasId={petugasId}
                              onToggle={(subslsKode, kodeUtk) => toggleSubsls(r.sls_key, subslsKode, kodeUtk)}
                            />
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

// Rincian per SUBSLS di dalam 1 baris Jorong/SLS yang di-unhide -- header
// jg pakai ExcelTh/useExcelTable (urutkan & filter, spt tabel lain).
// DIPISAH jadi komponen sendiri (bukan langsung di dalam .map() baris induk
// di WilayahSampelPanel) krn Hooks React (termasuk useExcelTable) TIDAK
// BOLEH dipanggil di dalam callback .map() -- jumlah pemanggilannya bisa
// berubah2 (mengikuti jumlah baris yg sedang di-unhide/difilter), melanggar
// Rules of Hooks. `rows` di sini SELALU daftar LENGKAP (belum difilter
// tabel) SUB SLS milik 1 SLS -- dipakai jg utk hitung semuaKode (dikirim ke
// onToggle) supaya logika "semua SUBSLS tercentang = pilih seluruh SLS" di
// toggleSubsls() TETAP benar walau tabel rincian ini SEDANG difilter.
function SubslsDetailTable({
  rows,
  current,
  petugasId,
  onToggle,
}: {
  rows: SubslsRow[];
  current: string[] | null | undefined;
  petugasId: number;
  onToggle: (subslsKode: string, semuaKode: string[]) => void;
}) {
  const kolom = useMemo(
    () => [
      { key: "label", label: "Sub SLS", getValue: (s: SubslsRow) => s.label },
      { key: "jumlah_potensi", label: "Potensi KK", getValue: (s: SubslsRow) => s.jumlah_potensi },
      { key: "skor_dasar_rata", label: "Skor Dasar", getValue: (s: SubslsRow) => s.skor_dasar_rata },
      { key: "dipilih_oleh_nama", label: "Dipegang", getValue: (s: SubslsRow) => s.dipilih_oleh_nama },
    ],
    []
  );
  const tabel = useExcelTable(rows, kolom, { key: "label", dir: "asc" });
  const semuaKode = rows.map((s) => s.subsls_kode);

  return (
    <table className="w-full text-[11px]">
      <thead className="text-[10px] uppercase tracking-wide text-ink/40">
        <tr>
          <th className="w-8" />
          {kolom.map((k) => (
            <ExcelTh
              key={k.key}
              colKey={k.key}
              label={k.label}
              align={k.key === "label" ? "left" : "right"}
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
        {tabel.rows.map((s) => {
          const milikSaya = s.dipilih_oleh_petugas_id === petugasId;
          const checkedSub = current === null || (Array.isArray(current) && current.includes(s.subsls_kode));
          const disabledSub = s.dipilih_oleh_petugas_id != null && !milikSaya;
          return (
            <tr key={s.subsls_kode} className={`border-t border-line/30 ${disabledSub ? "opacity-50" : ""}`}>
              <td className="py-1 pl-4">
                <input
                  type="checkbox"
                  checked={checkedSub}
                  disabled={disabledSub}
                  onChange={() => onToggle(s.subsls_kode, semuaKode)}
                />
              </td>
              <td className="px-2 py-1 text-ink/80">{s.label}</td>
              <td className="px-2 py-1 text-right">{s.jumlah_potensi}</td>
              <td className="px-2 py-1 text-right">{s.skor_dasar_rata}</td>
              <td className="px-2 py-1 text-right text-ink/50">
                {s.dipilih_oleh_nama == null ? "-" : milikSaya ? "Anda" : s.dipilih_oleh_nama}
              </td>
            </tr>
          );
        })}
        {tabel.rows.length === 0 && (
          <tr>
            <td colSpan={kolom.length + 1} className="py-1.5 text-center text-ink/40">
              Tidak ada Sub SLS utk filter ini.
            </td>
          </tr>
        )}
      </tbody>
    </table>
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

// ---------- Monitoring Status Pemilihan Sub-SLS (DIPINDAH dari tab
// Monitoring, permintaan user) ----------
//
// Per petugas AKTIF (tab Penyisiran Usaha): berapa Sub SLS yg sudah
// ditag/dialokasikan (kolom "Jumlah Sub-SLS Ditag" bisa DIKLIK -> modal
// rincian), jumlah KK di dalamnya, dan progres kunjungan
// (Ditemukan/Sudah Dikunjungi vs Sisa Belum Dikunjungi). Dihitung lewat
// JOIN langsung ke penyisiran_usaha aktif memakai predikat wilayah yg
// benar (lib/wilayahAlokasiPetugas.ts: kec+nagari+sls sama, dan
// subsls_kode_list IS NULL [artinya "seluruh SLS"] ATAU subsls_kode =
// ANY(subsls_kode_list)) -- lihat RPC penyisiran_pemilihan_subsls() &
// penyisiran_detail_pemilihan_subsls() migrasi
// pindah_pemilihan_subsls_dan_tambah_jabatan_petugas.sql. PANEL INI
// FETCH SENDIRI (endpoint terpisah /api/penyisiran/pemilihan-subsls),
// beda dari 2 bagian utama tab ini yg datanya personal per petugas login.

function ProgresBarPemilihan({ persenNilai }: { persenNilai: number }) {
  const warna = persenNilai >= 100 ? "bg-moss-500" : persenNilai >= 50 ? "bg-navy-500" : "bg-rust-500";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${warna}`} style={{ width: `${Math.min(100, persenNilai)}%` }} />
      </div>
      <span className="w-9 text-right tabular-nums">{persenNilai}%</span>
    </div>
  );
}

function SeksiPemilihanSubsls({ token }: { token: string }) {
  const [data, setData] = useState<PemilihanSubsls | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: number; nama: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const d = await apiFetch("/api/penyisiran/pemilihan-subsls", token);
      setData(d);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const kolom = useMemo(
    () => [
      { key: "nama", label: "Nama Petugas", getValue: (r: PemilihanSubslsRow) => r.nama },
      { key: "kec_domisili", label: "Kecamatan Domisili", getValue: (r: PemilihanSubslsRow) => r.kec_domisili },
      { key: "kec_tugas", label: "Kecamatan Tugas", getValue: (r: PemilihanSubslsRow) => r.kec_tugas },
      {
        key: "jumlah_subsls_ditag",
        label: "Jumlah Sub-SLS Ditag",
        getValue: (r: PemilihanSubslsRow) => r.jumlah_subsls_ditag,
      },
      { key: "jumlah_kk", label: "Jumlah KK", getValue: (r: PemilihanSubslsRow) => r.jumlah_kk },
      {
        key: "jumlah_ditemukan",
        label: "Ditemukan (Sudah Dikunjungi)",
        getValue: (r: PemilihanSubslsRow) => r.jumlah_ditemukan,
      },
      { key: "jumlah_sisa", label: "Sisa Belum Dikunjungi", getValue: (r: PemilihanSubslsRow) => r.jumlah_sisa },
    ],
    []
  );
  const tabel = useExcelTable(data?.per_petugas ?? [], kolom, { key: "jumlah_subsls_ditag", dir: "desc" });

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-navy-900">📶 Monitoring Status Pemilihan Sub-SLS (khusus pengelola)</p>
          <p className="mt-1 text-xs text-ink/60">
            Sub SLS yang sudah ditag/dialokasikan tiap petugas beserta jumlah KK &amp; progres kunjungannya. Klik
            angka pada kolom &ldquo;Jumlah Sub-SLS Ditag&rdquo; untuk lihat rincian kecamatan/nagari/Sub SLS yang
            ditag, serta Sub SLS yang masih tersedia (belum ditag siapapun) di kecamatan yang sama.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </div>

      {errMsg && (
        <p className="mt-2 rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      {!data && loading && <p className="mt-3 text-xs text-ink/50">Memuat...</p>}

      {data && (
        <>
          <p className="mt-3 text-[11px] text-ink/50">
            Sub SLS aktif belum ditag siapapun (se-kabupaten):{" "}
            <span className={`font-semibold ${data.total_subsls_belum_ditag > 0 ? "text-rust-700" : "text-moss-700"}`}>
              {data.total_subsls_belum_ditag}
            </span>
          </p>

          <div className="mt-2 flex items-center justify-between text-[10px] text-ink/40">
            <p>Klik nama kolom utk urutkan, klik &ldquo;▾&rdquo; utk filter.</p>
            {tabel.adaFilterAktif && (
              <button type="button" onClick={tabel.resetFilters} className="font-medium text-navy-700 hover:underline">
                Reset semua filter
              </button>
            )}
          </div>

          <div className="mt-2 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[820px] text-xs">
              <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-2 py-2 text-left">No</th>
                  {kolom.map((c) => (
                    <ExcelTh
                      key={c.key}
                      label={c.label}
                      colKey={c.key}
                      values={tabel.uniqueValues[c.key] ?? []}
                      sortKey={tabel.sortKey}
                      sortDir={tabel.sortDir}
                      onSort={tabel.toggleSort}
                      activeFilter={tabel.filters[c.key]}
                      onFilterChange={tabel.setColumnFilter}
                      align={c.key === "nama" || c.key === "kec_domisili" || c.key === "kec_tugas" ? "left" : "right"}
                    />
                  ))}
                  <th className="px-2 py-2 text-right">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tabel.rows.map((r, i) => {
                  const pct = persenPemilihan(r.jumlah_ditemukan, r.jumlah_kk);
                  return (
                    <tr key={r.id}>
                      <td className="px-2 py-1.5 text-ink/40">{i + 1}</td>
                      <td className="px-2 py-1.5 font-medium text-navy-900">{r.nama}</td>
                      <td className="px-2 py-1.5">{r.kec_domisili ?? "-"}</td>
                      <td className="px-2 py-1.5">{r.kec_tugas ?? "-"}</td>
                      <td className="px-2 py-1.5 text-right">
                        {r.jumlah_subsls_ditag > 0 ? (
                          <button
                            type="button"
                            onClick={() => setDetail({ id: r.id, nama: r.nama })}
                            className="font-semibold text-navy-700 underline hover:text-navy-900"
                          >
                            {r.jumlah_subsls_ditag}
                          </button>
                        ) : (
                          <span className="text-ink/40">0</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">{r.jumlah_kk}</td>
                      <td className="px-2 py-1.5 text-right">{r.jumlah_ditemukan}</td>
                      <td className="px-2 py-1.5 text-right">{r.jumlah_sisa}</td>
                      <td className="px-2 py-1.5">
                        <ProgresBarPemilihan persenNilai={pct} />
                      </td>
                    </tr>
                  );
                })}
                {tabel.rows.length === 0 && (
                  <tr>
                    <td colSpan={kolom.length + 2} className="px-2 py-4 text-center text-ink/40">
                      Tidak ada baris utk filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail && (
        <ModalDetailPemilihanSubsls
          token={token}
          petugasId={detail.id}
          namaPetugas={detail.nama}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

function ModalDetailPemilihanSubsls({
  token,
  petugasId,
  namaPetugas,
  onClose,
}: {
  token: string;
  petugasId: number;
  namaPetugas: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DetailPemilihanSubsls | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    setMemuat(true);
    setErrMsg(null);
    apiFetch(`/api/penyisiran/detail-pemilihan-subsls?petugas_id=${petugasId}`, token)
      .then((d) => setData(d))
      .catch((e) => setErrMsg(e instanceof Error ? e.message : String(e)))
      .finally(() => setMemuat(false));
  }, [petugasId, token]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-navy-900">Rincian Pemilihan Sub-SLS</p>
            <p className="text-[11px] text-ink/50">{namaPetugas}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-ink/40 hover:text-navy-700">
            ✕
          </button>
        </div>

        {memuat && <p className="py-6 text-center text-xs text-ink/40">Memuat...</p>}
        {errMsg && (
          <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
        )}

        {data && (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-[11px] font-semibold text-ink/50">Sub SLS yang Ditag ({data.ditag.length})</p>
                <p className="text-[11px] text-ink/50">{data.total_ditag_kk} KK</p>
              </div>
              {data.ditag.length === 0 ? (
                <p className="rounded-md border border-line bg-paper/40 p-2.5 text-xs text-ink/50">
                  Belum ada Sub SLS yang ditag utk petugas ini.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-xs">
                    <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Kecamatan</th>
                        <th className="px-2 py-1.5 text-left">Nagari</th>
                        <th className="px-2 py-1.5 text-left">SLS</th>
                        <th className="px-2 py-1.5 text-left">Sub SLS</th>
                        <th className="px-2 py-1.5 text-right">Jumlah KK</th>
                        <th className="px-2 py-1.5 text-right">Ditemukan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.ditag.map((r) => (
                        <tr key={r.idsubsls}>
                          <td className="px-2 py-1.5">{r.kec_nama}</td>
                          <td className="px-2 py-1.5">{r.nagari_nama}</td>
                          <td className="px-2 py-1.5">{r.sls_nama}</td>
                          <td className="px-2 py-1.5 font-mono text-[11px]">{r.subsls_kode}</td>
                          <td className="px-2 py-1.5 text-right">{r.jumlah_kk}</td>
                          <td className="px-2 py-1.5 text-right">{r.jumlah_ditemukan}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-[11px] font-semibold text-ink/50">
                  Sub SLS Masih Tersedia di Kecamatan yang Sama, Belum Ditag ({data.belum_ditag.length})
                </p>
                <p className="text-[11px] text-ink/50">{data.total_belum_ditag_kk} KK</p>
              </div>
              {data.belum_ditag.length === 0 ? (
                <p className="rounded-md border border-moss-200 bg-moss-100/40 p-2.5 text-xs text-moss-700">
                  ✅ Semua Sub SLS di kecamatan tugas petugas ini sudah ditag.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] border-collapse text-xs">
                    <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Kecamatan</th>
                        <th className="px-2 py-1.5 text-left">Nagari</th>
                        <th className="px-2 py-1.5 text-left">SLS</th>
                        <th className="px-2 py-1.5 text-left">Sub SLS</th>
                        <th className="px-2 py-1.5 text-right">Jumlah KK</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.belum_ditag.map((r) => (
                        <tr key={r.idsubsls}>
                          <td className="px-2 py-1.5">{r.kec_nama}</td>
                          <td className="px-2 py-1.5">{r.nagari_nama}</td>
                          <td className="px-2 py-1.5">{r.sls_nama}</td>
                          <td className="px-2 py-1.5 font-mono text-[11px]">{r.subsls_kode}</td>
                          <td className="px-2 py-1.5 text-right">{r.jumlah_kk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
