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
// Login PERSONAL (nama + tanggal lahir, role "penyisiran_petugas" --
// lihat lib/penyisiranAuth.ts & app/api/penyisiran/penyisiran-login) --
// MENGGANTIKAN PIN bersama yang dulu dipakai tab ini. Dicocokkan ke tabel
// petugas_penyisiran_akun (TABEL SAMA dgn "Identifikasi Jorong", cuma role
// token-nya beda), sama persis pola/gaya dgn tab Identifikasi Jorong/
// Tetangga -- token disimpan di localStorage (bukan sessionStorage) spy
// tidak perlu login ulang tiap hari. PIN admin ("penyisiran", env
// PENYISIRAN_PIN) TETAP ADA tapi sekarang cuma dipakai tab Monitoring.
//
// Karena loginnya personal, sistem otomatis tahu SIAPA yang sedang
// membuka tab ini -- dipakai utk (1) menandai siapa yang menyimpan
// checklist tiap keluarga (penyisiran_oleh/penyisiran_oleh_id, dasar
// hitungan tab Monitoring Petugas Penyisiran) dan (2) skor prioritas
// berbasis jarak dari lokasi rumah petugas yang login (tombol "📍 Tetapkan
// Lokasi Rumah Saya", lihat hitungSkorPrioritas()).
//
// Kolom Info PPL/Jorong/Tetangga cuma bisa diubah setelah menekan tombol
// "Edit" (per-kartu) atau "Edit Semua" (global) -- supaya tidak kepencet
// tidak sengaja saat sekadar melihat-lihat daftar. Kolom "Identifikasi
// PPL" ditampilkan read-only di sini (badge) -- diisi dari salah satu dari
// TIGA tab Identifikasi (masing-masing pakai login/PIN sendiri).

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MarkerRow, UserLocation } from "./penyisiran-map";

const PenyisiranMap = dynamic(() => import("./penyisiran-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-ink/40">Memuat peta...</div>
  ),
});

const TOKEN_KEY = "penyisiran-petugas-login-token";
const NAMA_KEY = "penyisiran-petugas-login-nama";
const PETUGAS_ID_STORE_KEY = "penyisiran-petugas-login-id";
const LAT_KEY = "penyisiran-petugas-login-lat";
const LNG_KEY = "penyisiran-petugas-login-lng";

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

type TierPrioritas = "pasti" | "tinggi" | "sedang" | "rendah";

// Pilihan "Urutkan" daftar keluarga -- "default" = urutan apa adanya dari
// server (spt semula), sisanya diurutkan di BROWSER dari data halaman yg
// sedang dimuat (lihat komentar rowsSorted di PenyisiranPanel).
type SortBy = "default" | "jarak_asc" | "jarak_terjauh" | "prioritas_desc" | "prioritas_asc";

// Warna badge "rendah" SENGAJA dibuat solid (bg-navy-100 + teks navy-700),
// BUKAN pucat/transparan (border border-line text-ink/40) seperti semula --
// versi pucat itu nyaris tidak kelihatan di atas kartu putih (dilaporkan
// user: "ada kartu yang tidak ada skala prioritasnya", padahal badge-nya
// ADA, cuma kontrasnya terlalu rendah). Dipilih warna biru (navy) supaya
// beda jelas dari merah (tinggi) & kuning (sedang), tidak disangka warna
// status lain. "pasti" (override manual lewat tombol "🎯 Pasti") dibuat
// SOLID merah tua supaya jelas beda dari "tinggi" biasa (hasil hitungan
// otomatis) -- ini keputusan MANUSIA, bukan skor.
const PRIORITAS_META: Record<TierPrioritas, { label: string; className: string }> = {
  pasti: { label: "Prioritas Pasti", className: "bg-rust-700 text-white" },
  tinggi: { label: "Prioritas Tinggi", className: "bg-rust-100 text-rust-700" },
  sedang: { label: "Prioritas Sedang", className: "bg-[#FCEFD1] text-[#8A6A12]" },
  rendah: { label: "Prioritas Rendah", className: "bg-navy-100 text-navy-700" },
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
//
// Dua lapisan TAMBAHAN di atas skor dasar tsb:
//  - `pasti` (tombol "🎯 Pasti"): override MANUAL -- kalau ditandai, skor
//    dipaksa 100/tier "pasti" apa pun hasil hitungan otomatis di atas.
//    Ditandai petugas yang sudah YAKIN (mis. sudah lihat sendiri ada usaha)
//    tapi skor otomatisnya belum tentu tinggi.
//  - `jarakKm` (opsional): jarak lurus rumah petugas yang SEDANG LOGIN ke
//    lokasi sampel -- kalau lokasi rumah petugas sudah ditetapkan (lihat
//    tombol "Tetapkan Lokasi Rumah Saya") DAN sampel punya koordinat, skor
//    dasar dikurangi 2 poin per km (maks -20) sebelum tier dihitung ulang --
//    makin jauh dari rumah petugas yang login, makin rendah prioritasnya
//    BAGI PETUGAS ITU (skor bisa beda2 antar akun yg login, sesuai
//    permintaan). Tidak berlaku kalau `pasti` true (override menang).
function hitungSkorPrioritas(
  data: Pick<Row, "bukti_dutp" | "bukti_dtsen" | "bukti_pnm" | "info_ppl" | "info_jorong" | "info_tetangga">,
  jumlahDiSubsls: number,
  maxJumlahDiSubsls: number,
  opts?: { pasti?: boolean; jarakKm?: number | null }
) {
  const jumlahBukti = (data.bukti_dutp ? 1 : 0) + (data.bukti_dtsen ? 1 : 0) + (data.bukti_pnm ? 1 : 0);
  const jumlahInfo = (data.info_ppl ? 1 : 0) + (data.info_jorong ? 1 : 0) + (data.info_tetangga ? 1 : 0);

  if (opts?.pasti) {
    return { skor: 100, tier: "pasti" as TierPrioritas, jumlahBukti, jumlahInfo };
  }

  const skorSumber = (jumlahBukti / 3) * 50;
  const skorInfo = (jumlahInfo / 3) * 30;
  const skorKlaster = maxJumlahDiSubsls > 0 ? (jumlahDiSubsls / maxJumlahDiSubsls) * 20 : 0;
  const penaltiJarak =
    opts?.jarakKm != null && Number.isFinite(opts.jarakKm) ? Math.min(20, Math.max(0, opts.jarakKm) * 2) : 0;
  const skor = Math.round(Math.min(100, Math.max(0, skorSumber + skorInfo + skorKlaster - penaltiJarak)));
  const tier: TierPrioritas = skor >= 60 ? "tinggi" : skor >= 30 ? "sedang" : "rendah";
  return { skor, tier, jumlahBukti, jumlahInfo };
}

// Alamat (baris pertama kartu) sering SUDAH memuat nama Jorong/SLS di
// dalamnya sendiri (mis. alamat "JALAN JORONG ULU PISAU HILANG" utk
// keluarga yg SLS-nya memang "JORONG ULU PISAU HILANG" -- lazim di alamat
// pedesaan yg tidak punya nama jalan sendiri) -- kalau baris kedua tetap
// menampilkan "Nagari · Nama SLS" apa adanya, nama Jorong itu jadi
// disebut DUA KALI berturut-turut (dilaporkan user, bikin kartu terasa
// berulang). Di sini nama SLS di baris kedua disembunyikan HANYA kalau
// alamat sudah memuat teks yg sama persis (cek case-insensitive) --
// nagari tetap selalu ditampilkan krn itu jarang ikut disebut di alamat.
function ringkasWilayah(alamat: string | null, nagariNama: string | null, slsNama: string | null): string {
  const sudahDisebut =
    !!alamat && !!slsNama && slsNama.trim().length > 0 && alamat.toUpperCase().includes(slsNama.trim().toUpperCase());
  const bagian = [nagariNama, sudahDisebut ? null : slsNama].filter((b): b is string => !!b && b.trim().length > 0);
  return bagian.join(" · ");
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
  prioritas_pasti: boolean;
  penyisiran_oleh: string | null;
  updated_at: string;
}

// Jarak lurus (haversine, km) antara 2 titik koordinat -- dipakai skor
// prioritas berbasis jarak rumah petugas ke lokasi sampel. Cukup akurat utk
// kebutuhan "makin jauh makin rendah prioritas" (tidak perlu jarak jalan
// sesungguhnya).
function jarakKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// "Diperbarui X detik/menit lalu" utk status Lokasi Langsung (live
// tracking) -- teksnya perlu ikut "hidup" tanpa GPS update baru, makanya
// ada tick interval terpisah di PenyisiranPanel yang cuma memaksa
// re-render tiap beberapa detik.
function formatDetikLalu(ts: number): string {
  const detik = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (detik < 5) return "Diperbarui baru saja";
  if (detik < 60) return `Diperbarui ${detik} detik lalu`;
  const menit = Math.round(detik / 60);
  return `Diperbarui ${menit} menit lalu`;
}

// Token personal (role "penyisiran_petugas") punya 4 bagian
// (role.subjectB64.exp.sig, lihat lib/penyisiranAuth.ts) -- beda dari token
// PIN lama yg 3 bagian (role.exp.sig). tokenExpMs() menangani KEDUA bentuk
// itu spy tidak salah baca posisi expiry-nya (pola sama dgn
// app/penyisiran/identifikasi-jorong.tsx).
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
  if (!Number.isFinite(exp) || exp < Date.now()) {
    clearToken();
    return null;
  }
  return t;
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAMA_KEY);
  localStorage.removeItem(PETUGAS_ID_STORE_KEY);
  localStorage.removeItem(LAT_KEY);
  localStorage.removeItem(LNG_KEY);
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
  const [nama, setNama] = useState<string | null>(null);
  const [petugasId, setPetugasId] = useState<number | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    setToken(getToken());
    if (typeof window !== "undefined") {
      setNama(localStorage.getItem(NAMA_KEY));
      const savedId = Number(localStorage.getItem(PETUGAS_ID_STORE_KEY));
      setPetugasId(Number.isFinite(savedId) && savedId > 0 ? savedId : null);
      const savedLat = Number(localStorage.getItem(LAT_KEY));
      const savedLng = Number(localStorage.getItem(LNG_KEY));
      setLat(Number.isFinite(savedLat) ? savedLat : null);
      setLng(Number.isFinite(savedLng) ? savedLng : null);
    }
    setCheckedStorage(true);
  }, []);

  function handleLoggedIn(t: string, n: string, id: number, loginLat: number | null, loginLng: number | null) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(NAMA_KEY, n);
    localStorage.setItem(PETUGAS_ID_STORE_KEY, String(id));
    if (loginLat != null) localStorage.setItem(LAT_KEY, String(loginLat));
    else localStorage.removeItem(LAT_KEY);
    if (loginLng != null) localStorage.setItem(LNG_KEY, String(loginLng));
    else localStorage.removeItem(LNG_KEY);
    setToken(t);
    setNama(n);
    setPetugasId(id);
    setLat(loginLat);
    setLng(loginLng);
  }

  function handleLogout() {
    clearToken();
    setToken(null);
    setNama(null);
    setPetugasId(null);
    setLat(null);
    setLng(null);
  }

  function handleLokasiUpdated(newLat: number, newLng: number) {
    localStorage.setItem(LAT_KEY, String(newLat));
    localStorage.setItem(LNG_KEY, String(newLng));
    setLat(newLat);
    setLng(newLng);
  }

  if (!checkedStorage) return null;

  if (!token || !petugasId) {
    return <LoginForm onLoggedIn={handleLoggedIn} />;
  }

  return (
    <PenyisiranPanel
      token={token}
      nama={nama || ""}
      petugasId={petugasId}
      petugasLat={lat}
      petugasLng={lng}
      onLokasiUpdated={handleLokasiUpdated}
      onSessionExpired={handleLogout}
      onLogout={handleLogout}
    />
  );
}

// Form login personal (nama + tanggal lahir) -- pola & endpoint datalist
// SAMA PERSIS dgn app/penyisiran/identifikasi-jorong.tsx (jorong-names
// mengambil dari tabel petugas_penyisiran_akun yg sama, jadi endpoint itu
// dipakai bersama di sini, bukan endpoint baru).
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
      <p className="text-sm font-semibold text-navy-900">Lembar Pengecekan Penyisiran Usaha</p>
      <p className="mt-1 text-xs text-ink/60">
        Berisi nama kepala keluarga, alamat, dan koordinat lokasi warga -- masukkan nama lengkap dan tanggal lahir
        Anda sebagai petugas penyisiran. Setelah berhasil, Anda tidak perlu login ulang besok.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-2 text-left">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Nama Lengkap</label>
          <input
            list="nama-petugas-penyisiran-usaha-options"
            type="text"
            value={namaInput}
            onChange={(e) => setNamaInput(e.target.value)}
            placeholder="Ketik nama lengkap Anda"
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <datalist id="nama-petugas-penyisiran-usaha-options">
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

function PenyisiranPanel({
  token,
  nama,
  petugasId,
  petugasLat,
  petugasLng,
  onLokasiUpdated,
  onSessionExpired,
  onLogout,
}: {
  token: string;
  nama: string;
  petugasId: number;
  petugasLat: number | null;
  petugasLng: number | null;
  onLokasiUpdated: (lat: number, lng: number) => void;
  onSessionExpired: () => void;
  onLogout: () => void;
}) {
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
  const [lokasiStatus, setLokasiStatus] = useState<string | null>(null);
  const [lokasiBusy, setLokasiBusy] = useState(false);
  // Peta tampil COMPACT (bukan lagi setengah layar) begitu halaman
  // dibuka, tapi bisa digulung ke atas (disembunyikan) supaya daftar
  // keluarga bisa memakai lebar penuh saat peta sedang tidak dibutuhkan.
  const [mapVisible, setMapVisible] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("default");
  const pageSize = 200;

  // ---------- Live Distance Tracking ----------
  // Lokasi PENGGUNA SAAT INI (BEDA dari "lokasi rumah" petugasLat/Lng di
  // atas, yang dipakai skor prioritas & disimpan permanen ke DB) --
  // dipakai utk navigasi lapangan real-time: jarak tiap kartu & urutan
  // "Sampel Terdekat" ikut berubah otomatis begitu petugas berpindah,
  // tanpa reload halaman & tanpa disimpan ke mana pun (murni di memori
  // browser, hilang begitu tab ditutup -- sengaja, krn ini posisi
  // SEMENTARA saat menyisir, bukan lokasi permanen).
  const [liveLoc, setLiveLoc] = useState<UserLocation | null>(null);
  const [liveStatus, setLiveStatus] = useState<"idle" | "searching" | "active" | "error">("idle");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  // Tick paksa re-render tiap 5 detik HANYA supaya teks "Diperbarui X
  // detik lalu" tetap segar walau tidak ada koordinat GPS baru masuk --
  // tidak menyentuh data apa pun.
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // Bersihkan watchPosition begitu komponen dilepas (pindah tab/keluar) --
  // mencegah memory leak & baterai HP terus terpakai di background.
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  function handleAktifkanLokasiLive() {
    if (!("geolocation" in navigator)) {
      setLiveStatus("error");
      setLiveError("Browser ini tidak mendukung deteksi lokasi.");
      return;
    }
    setLiveStatus("searching");
    setLiveError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null });
        setLiveStatus("active");
        setLiveUpdatedAt(Date.now());
        setLiveError(null);
      },
      (err) => {
        setLiveStatus("error");
        setLiveError(err.message || "Lokasi tidak tersedia.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    watchIdRef.current = id;
  }

  function handleNonaktifkanLokasiLive() {
    if (watchIdRef.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setLiveStatus("idle");
    setLiveLoc(null);
    setLiveUpdatedAt(null);
    setLiveError(null);
  }

  // Jarak dari lokasi LIVE (bukan lokasi rumah) ke satu keluarga -- null
  // kalau lokasi live belum aktif atau keluarganya tidak punya koordinat.
  function jarakLiveRow(row: Row): number | null {
    if (!liveLoc || row.lat == null || row.lng == null) return null;
    return jarakKm(liveLoc.lat, liveLoc.lng, row.lat, row.lng);
  }

  const guard = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
          clearToken();
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

  // Tombol "Tetapkan Lokasi Rumah Saya" -- dipilih SENDIRI oleh petugas yg
  // SEDANG LOGIN lewat Geolocation API browser (tidak dikumpulkan manual),
  // disimpan ke petugas_penyisiran_akun.lat/lng lewat
  // /api/penyisiran/set-lokasi-rumah. petugasId sudah pasti ada di sini
  // krn PenyisiranUsahaTab tidak merender panel ini sebelum login sukses.
  function handleTetapkanLokasi() {
    if (!("geolocation" in navigator)) {
      setLokasiStatus("Browser ini tidak mendukung deteksi lokasi.");
      return;
    }
    setLokasiBusy(true);
    setLokasiStatus(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiFetch("/api/penyisiran/set-lokasi-rumah", token, {
            method: "PATCH",
            body: JSON.stringify({ petugas_id: petugasId, lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          onLokasiUpdated(pos.coords.latitude, pos.coords.longitude);
          setLokasiStatus("✓ Lokasi rumah tersimpan.");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setLokasiStatus(`Gagal: ${msg}`);
        } finally {
          setLokasiBusy(false);
        }
      },
      (err) => {
        setLokasiStatus(`Gagal mengambil lokasi: ${err.message}`);
        setLokasiBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

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

  // Skor prioritas SATU keluarga -- dipakai HANYA utk mengurutkan daftar
  // (dropdown "Urutkan"). RowCard tetap menghitung skornya sendiri secara
  // live saat sedang diedit (lihat hitungSkorPrioritas di dalam RowCard);
  // fungsi ini cuma versi "nilai tersimpan saat ini" spy daftar bisa
  // diurutkan tanpa perlu tiap kartu melaporkan skornya ke atas.
  function skorRow(row: Row): number {
    const jarakRumah =
      petugasLat != null && petugasLng != null && row.lat != null && row.lng != null
        ? jarakKm(petugasLat, petugasLng, row.lat, row.lng)
        : null;
    return hitungSkorPrioritas(row, row.idsubsls ? jumlahDiSubslsMap.get(row.idsubsls) ?? 1 : 1, maxJumlahDiSubsls, {
      pasti: row.prioritas_pasti,
      jarakKm: jarakRumah,
    }).skor;
  }

  // Pengurutan CUMA sebatas halaman yg sedang dimuat (rows, maks 200
  // baris/halaman -- sama spt batasan hitungan klaster Sub SLS di
  // hitungSkorPrioritas), bukan pengurutan global se-kabupaten. Baris
  // tanpa koordinat/lokasi live selalu diletakkan di BELAKANG saat
  // diurutkan berdasar jarak (bukan dianggap jarak 0).
  const rowsSorted =
    sortBy === "default"
      ? rows
      : rows
          .map((r) => ({ r, jarak: jarakLiveRow(r), skor: skorRow(r) }))
          .sort((a, b) => {
            if (sortBy === "jarak_asc" || sortBy === "jarak_terjauh") {
              if (a.jarak == null && b.jarak == null) return 0;
              if (a.jarak == null) return 1;
              if (b.jarak == null) return -1;
              return sortBy === "jarak_asc" ? a.jarak - b.jarak : b.jarak - a.jarak;
            }
            return sortBy === "prioritas_desc" ? b.skor - a.skor : a.skor - b.skor;
          })
          .map((x) => x.r);

  // "Sampel Terdekat" -- 3 keluarga terdekat dari lokasi LIVE, dihitung
  // dari daftar yg sedang dimuat (rows), diperbarui otomatis tiap
  // koordinat GPS berubah krn liveLoc ikut jadi dependency render ini.
  const sampelTerdekat = liveLoc
    ? rows
        .map((r) => ({ r, jarak: jarakLiveRow(r) }))
        .filter((x): x is { r: Row; jarak: number } => x.jarak != null)
        .sort((a, b) => a.jarak - b.jarak)
        .slice(0, 3)
    : [];

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

      {/* Identitas petugas yg sedang login (personal, bukan lagi dropdown)
          + tombol tetapkan lokasi rumah utk skor prioritas berbasis jarak. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <span className="text-xs text-ink/60">
          Masuk sebagai <span className="font-semibold text-navy-900">{nama}</span>
        </span>
        <button
          type="button"
          onClick={handleTetapkanLokasi}
          disabled={lokasiBusy}
          className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
        >
          {lokasiBusy ? "Mendeteksi..." : "📍 Tetapkan Lokasi Rumah Saya"}
        </button>
        {petugasLat != null && <span className="text-[11px] text-moss-700">✓ Lokasi rumah sudah ditetapkan</span>}
        {lokasiStatus && <span className="text-[11px] text-ink/50">{lokasiStatus}</span>}
        <button
          type="button"
          onClick={onLogout}
          className="ml-auto rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink/50 hover:border-navy-400"
        >
          Keluar
        </button>
      </div>

      {/* ---------- Live Distance Tracking: status lokasi saat ini ---------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
            liveStatus === "active"
              ? "text-moss-700"
              : liveStatus === "searching"
              ? "text-[#8A6A12]"
              : liveStatus === "error"
              ? "text-rust-700"
              : "text-ink/50"
          }`}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              backgroundColor:
                liveStatus === "active"
                  ? "#0ca30c"
                  : liveStatus === "searching"
                  ? "#fab219"
                  : liveStatus === "error"
                  ? "#d03b3b"
                  : "#9ca3af",
            }}
          />
          {liveStatus === "active" && "Lokasi Anda terdeteksi"}
          {liveStatus === "searching" && "Mencari lokasi..."}
          {liveStatus === "error" && "Lokasi tidak tersedia"}
          {liveStatus === "idle" && "Lokasi langsung belum aktif"}
        </span>
        {liveStatus === "active" && liveUpdatedAt != null && (
          <span className="text-[11px] text-ink/40">{formatDetikLalu(liveUpdatedAt)}</span>
        )}
        {liveError && liveStatus === "error" && <span className="text-[11px] text-rust-700">{liveError}</span>}
        {liveStatus === "active" || liveStatus === "searching" ? (
          <button
            type="button"
            onClick={handleNonaktifkanLokasiLive}
            className="ml-auto rounded-md border border-rust-100 bg-white px-2.5 py-1.5 text-xs font-medium text-rust-700 hover:border-rust-700"
          >
            Nonaktifkan
          </button>
        ) : (
          <button
            type="button"
            onClick={handleAktifkanLokasiLive}
            className="ml-auto rounded-md bg-navy-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-navy-900"
          >
            📍 Gunakan Lokasi Saya
          </button>
        )}
      </div>

      {/* "Sampel Terdekat" -- ringkasan 3 keluarga terdekat dari lokasi
          LIVE, ikut berubah otomatis begitu petugas berpindah. */}
      {sampelTerdekat.length > 0 && (
        <div className="rounded-lg border border-line bg-white p-3">
          <p className="mb-1.5 text-xs font-semibold text-navy-900">📍 Sampel Terdekat</p>
          <div className="flex flex-col gap-1.5">
            {sampelTerdekat.map((x, i) => (
              <div key={x.r.kode_identitas} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[10px] font-bold text-navy-700">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-navy-900">{x.r.nama_kk || "(tanpa nama)"}</span>
                    <span className="block text-[10px] text-ink/40">{x.r.kode_identitas}</span>
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-navy-700">{x.jarak.toFixed(1)} km</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
          {/* ---------- Map -- COMPACT/floating (bukan lagi separuh
              layar), PERSIS di bawah baris filter/kolom cari, full-width,
              supaya langsung kelihatan begitu filter dipilih tapi tidak
              mendorong daftar keluarga jauh ke bawah. Tetap bisa
              disembunyikan spy tidak makan tempat kalau tidak dibutuhkan;
              live tracking & jarak pada daftar TETAP berjalan walau peta
              disembunyikan (state liveLoc ada di komponen induk, bukan di
              dalam blok ini). */}
          {mapVisible ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setMapVisible(false)}
                className="self-start rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400"
              >
                ▲ Sembunyikan Peta
              </button>
              <div className="relative h-[24vh] max-h-[260px] min-h-[160px] overflow-hidden rounded-lg border border-line">
                <PenyisiranMap markers={markers} userLocation={liveLoc} />
                <div className="absolute bottom-2 left-2 z-[1000] rounded-md border border-line bg-white/95 p-2 text-[11px] shadow">
                  {liveLoc && (
                    <div className="mb-1 flex items-center gap-1.5 border-b border-line pb-1">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
                      Lokasi Anda
                    </div>
                  )}
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
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/50">
              <span>{loading ? "Memuat..." : `${total} keluarga cocok filter ini`}</span>
              <label className="flex items-center gap-1.5">
                Urutkan:
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="rounded-md border border-line px-2 py-1 text-xs text-ink"
                >
                  <option value="default">Default</option>
                  <option value="jarak_asc">Jarak terdekat</option>
                  <option value="jarak_terjauh">Jarak terjauh</option>
                  <option value="prioritas_desc">Prioritas tertinggi</option>
                  <option value="prioritas_asc">Prioritas terendah</option>
                </select>
              </label>
            </div>
            <div className="flex flex-col gap-2">
              {rowsSorted.map((row) => (
                <RowCard
                  key={row.kode_identitas}
                  row={row}
                  token={token}
                  editAllMode={editAllMode}
                  jumlahDiSubsls={row.idsubsls ? jumlahDiSubslsMap.get(row.idsubsls) ?? 1 : 1}
                  maxJumlahDiSubsls={maxJumlahDiSubsls}
                  petugasId={petugasId}
                  petugasNama={nama}
                  petugasLat={petugasLat}
                  petugasLng={petugasLng}
                  liveLat={liveLoc?.lat ?? null}
                  liveLng={liveLoc?.lng ?? null}
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
  petugasId,
  petugasNama,
  petugasLat,
  petugasLng,
  liveLat,
  liveLng,
  onSaved,
  onSessionExpired,
}: {
  row: Row;
  token: string;
  editAllMode: boolean;
  jumlahDiSubsls: number;
  maxJumlahDiSubsls: number;
  petugasId: number | null;
  petugasNama: string | null;
  petugasLat: number | null;
  petugasLng: number | null;
  liveLat: number | null;
  liveLng: number | null;
  onSaved: (id: string, patch: Partial<Row>) => void;
  onSessionExpired: () => void;
}) {
  const [status, setStatus] = useState<StatusKunjungan>(row.status_kunjungan);
  const [catatan, setCatatan] = useState(row.catatan_petugas ?? "");
  const [infoPpl, setInfoPpl] = useState(row.info_ppl);
  const [infoJorong, setInfoJorong] = useState(row.info_jorong);
  const [infoTetangga, setInfoTetangga] = useState(row.info_tetangga);
  const [pastiFlag, setPastiFlag] = useState(row.prioritas_pasti);
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
    infoTetangga !== row.info_tetangga ||
    pastiFlag !== row.prioritas_pasti;
  const meta = STATUS_META[status];
  const identMeta = IDENTIFIKASI_META[row.identifikasi_ppl] ?? IDENTIFIKASI_META.belum;
  // Jarak rumah petugas yg SEDANG LOGIN (dropdown "Nama Anda") ke lokasi
  // sampel -- null kalau salah satu koordinatnya belum ada, sehingga skor
  // otomatis tidak kena potongan jarak (lihat hitungSkorPrioritas).
  const jarak =
    petugasLat != null && petugasLng != null && row.lat != null && row.lng != null
      ? jarakKm(petugasLat, petugasLng, row.lat, row.lng)
      : null;
  // Jarak LIVE (posisi GPS petugas SAAT INI, lihat "📍 Gunakan Lokasi
  // Saya" di PenyisiranPanel) -- BEDA dari `jarak` di atas (lokasi rumah
  // permanen, dipakai skor prioritas). Ini murni informasi navigasi utk
  // petugas di lapangan, tidak ikut memengaruhi skor prioritas.
  const jarakLive =
    liveLat != null && liveLng != null && row.lat != null && row.lng != null
      ? jarakKm(liveLat, liveLng, row.lat, row.lng)
      : null;
  // Pakai nilai Info PPL/Jorong/Tetangga & "Pasti" yg SEDANG diedit (bukan
  // cuma yg sudah tersimpan) -- supaya skornya langsung ikut naik/turun
  // begitu petugas mencentang, sebagai umpan balik instan sebelum ditekan
  // Simpan.
  const prioritas = hitungSkorPrioritas(
    { bukti_dutp: row.bukti_dutp, bukti_dtsen: row.bukti_dtsen, bukti_pnm: row.bukti_pnm, info_ppl: infoPpl, info_jorong: infoJorong, info_tetangga: infoTetangga },
    jumlahDiSubsls,
    maxJumlahDiSubsls,
    { pasti: pastiFlag, jarakKm: jarak }
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
          prioritas_pasti: pastiFlag,
          petugas_id: petugasId,
          petugas_nama: petugasNama,
        }),
      });
      setSaved("ok");
      onSaved(row.kode_identitas, {
        status_kunjungan: status,
        catatan_petugas: catatan,
        info_ppl: infoPpl,
        info_jorong: infoJorong,
        info_tetangga: infoTetangga,
        prioritas_pasti: pastiFlag,
        penyisiran_oleh: petugasNama ?? row.penyisiran_oleh,
      });
      // Cukup 1x tindakan: begitu tersimpan, kunci lagi Info PPL/Jorong/
      // Tetangga & tampilkan lagi tombol "✎ Edit" -- supaya tidak
      // kepencet lagi tanpa sengaja setelah selesai mengisi.
      setUnlocked(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        clearToken();
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
        clearToken();
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
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span
          title={`Sumber data (DUTP/DTSEN/PNM): ${prioritas.jumlahBukti}/3 · Info tambahan (PPL/Jorong/Tetangga): ${prioritas.jumlahInfo}/3 · Keluarga lain di Sub SLS yg sama (daftar ini): ${jumlahDiSubsls}${jarak != null ? ` · Jarak dari rumah Anda: ${jarak.toFixed(1)} km` : ""}`}
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${prioritasMeta.className}`}
        >
          {prioritasMeta.label} &middot; {prioritas.skor}
        </span>
        <button
          type="button"
          disabled={!canEditInfo}
          onClick={() => canEditInfo && setPastiFlag((v) => !v)}
          title="Tandai kalau sudah YAKIN ada usaha -- skor dipaksa maksimal apa pun hasil hitungan otomatis."
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
            pastiFlag ? "bg-rust-700 text-white" : "border border-line text-ink/40 hover:border-navy-400"
          } ${!canEditInfo ? "cursor-not-allowed opacity-50 hover:border-line" : ""}`}
        >
          🎯 {pastiFlag ? "Pasti" : "Tandai Pasti"}
        </button>
        {jarakLive != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#2563eb]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2563eb]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2563eb]" /> Live &middot; {jarakLive.toFixed(1)} km dari Anda
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-ink/70">{row.alamat || "-"}</p>
      <p className="mb-1.5 text-[11px] text-ink/40">
        {ringkasWilayah(row.alamat, row.nagari_nama, row.sls_nama)}
        {mapsUrl && (
          <>
            {" "}
            &middot;{" "}
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-navy-400 underline">
              Lihat di peta
            </a>
            {" "}
            &middot;{" "}
            <a
              href={
                liveLat != null && liveLng != null
                  ? `https://www.google.com/maps/dir/?api=1&origin=${liveLat},${liveLng}&destination=${row.lat},${row.lng}`
                  : mapsUrl
              }
              target="_blank"
              rel="noreferrer"
              className="text-navy-400 underline"
            >
              🧭 Navigasi
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
        clearToken();
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
