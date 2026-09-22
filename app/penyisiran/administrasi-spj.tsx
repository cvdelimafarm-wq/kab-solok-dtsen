"use client";

// app/penyisiran/administrasi-spj.tsx
//
// Tab "Administrasi" -- kelengkapan SPJ Perjalanan Dinas Dalam Kota
// (Translok) yang dihasilkan LANGSUNG dari sistem: Kwitansi, Surat
// Tugas (upload asli), Visum, Laporan, Dokumentasi foto, dan Surat
// Keterangan Tidak Menggunakan Kendaraan Dinas.
//
// Login MENUMPANG PERSIS akun & token dari DUA tab lain (PPL TIDAK ikut,
// krn translok cuma relevan utk yang benar2 turun lapangan & dapat honor
// transport):
//  - "Identifikasi Jorong" (petugas_penyisiran_akun, role
//    "identifikasi_jorong") -- localStorage key SAMA PERSIS dgn
//    identifikasi-jorong.tsx, jadi kalau sudah login di tab itu, tab ini
//    otomatis ikut terbuka tanpa login ulang (dan sebaliknya).
//  - "Identifikasi Tetangga/Lainnya" (tetangga_akun, role
//    "identifikasi_tetangga") -- localStorage key SAMA dgn
//    identifikasi-tetangga.tsx, pola sharing yang sama.
// Lihat lib/spjAuth.ts utk cara server menerjemahkan kedua role token itu
// jadi (petugas_jenis, petugas_id) yang dipakai seluruh tabel spj_*.
//
// Fitur Surat Tugas, Visum, Laporan, Dokumentasi, Kwitansi, & Surat
// Keterangan SEMUA SUDAH JALAN PENUH (isi/upload + unduh PDF per dokumen).
//
// Menu utk PENGELOLA dipecah jadi 4 sub-tab (redesain dari model "kumpulan
// kartu dokumen" ke model "monitoring per orang + per tanggal", atas
// masukan user -- pengelola menangani 15-30 petugas sekaligus):
//   Dashboard | Monitoring SPJ | Cetak SPJ | Arsip SPJ
// "Arsip SPJ" = persis konten lama (kartu Surat Tugas + form tiap jenis
// dokumen) -- TIDAK dihapus, krn pengelola & petugas tetap butuh cara utk
// benar2 MENGISI/upload dokumen, bukan cuma memonitor & mencetak.
//
// Petugas/tetangga biasa (non-pengelola) dapat versi ringkas "Administrasi
// Saya": 🏠 Ringkasan (progres hari ini + riwayat + tombol Cetak SPJ Saya)
// dan 📝 Isi Dokumen (form yg sama dgn "Arsip SPJ" pengelola, krn PPL tetap
// perlu mengisi Visum/Laporan/Dokumentasi/dst miliknya sendiri).
//
// lib/spjMatriks.ts: definisi status per jenis dokumen & urutan cetak
// standar, dipakai bersama oleh spj-monitoring.tsx & spj-cetak.tsx.

import { useCallback, useEffect, useRef, useState } from "react";
import { SLOT_LABELS, SLOT_URUTAN } from "@/lib/spjDokumentasi";
import { AMBANG_DOKUMENTASI_HARIAN } from "@/lib/spjMatriks";
import { TANGGAL_WAJIB_PENYISIRAN, laporanTemplateBolehDisimpan } from "@/lib/spjLaporanAturan";
import {
  SpjDashboard,
  SpjMonitoring,
  AdministrasiSayaRingkasan,
  KelengkapanDokumenSaya,
  useSpjMonitoring,
} from "./spj-monitoring";
import { SpjCetakTab, SpjCetakSaya } from "./spj-cetak";

// Tanggal hari ini menurut WIB (UTC+7, tanpa DST) -- dipakai modal ucapan
// terima kasih SPJ (bandingkan tanggal Laporan/Dokumentasi vs "hari ini")
// supaya konsisten dgn zona waktu operasional BPS Kab Solok, bukan zona
// waktu server/browser yg bisa beda2.
function tanggalHariIniWib(): string {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
}

function selisihHari(dariTanggal: string, keTanggal: string): number {
  const a = new Date(dariTanggal + "T00:00:00Z").getTime();
  const b = new Date(keTanggal + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

const JORONG_TOKEN_KEY = "identifikasi-jorong-login-token";
const JORONG_NAMA_KEY = "identifikasi-jorong-login-nama";
const TETANGGA_TOKEN_KEY = "identifikasi-tetangga-login-token";
const TETANGGA_NAMA_KEY = "identifikasi-tetangga-login-nama";

type Jenis = "penyisiran" | "tetangga";

interface SesiSpj {
  token: string;
  nama: string;
  jenis: Jenis;
}

function tokenExpMs(t: string): number {
  const parts = t.split(".");
  return Number(parts.length === 4 ? parts[2] : parts[1]);
}

function tokenMasihBerlaku(t: string | null): boolean {
  if (!t) return false;
  const exp = tokenExpMs(t);
  return Number.isFinite(exp) && exp >= Date.now();
}

function bacaSesiTersimpan(): SesiSpj | null {
  if (typeof window === "undefined") return null;
  const tJorong = localStorage.getItem(JORONG_TOKEN_KEY);
  if (tokenMasihBerlaku(tJorong)) {
    return { token: tJorong as string, nama: localStorage.getItem(JORONG_NAMA_KEY) || "", jenis: "penyisiran" };
  }
  const tTetangga = localStorage.getItem(TETANGGA_TOKEN_KEY);
  if (tokenMasihBerlaku(tTetangga)) {
    return { token: tTetangga as string, nama: localStorage.getItem(TETANGGA_NAMA_KEY) || "", jenis: "tetangga" };
  }
  return null;
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

export default function AdministrasiSpjTab() {
  const [sesi, setSesi] = useState<SesiSpj | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    setSesi(bacaSesiTersimpan());
    setCheckedStorage(true);
  }, []);

  function handleLoggedIn(token: string, nama: string, jenis: Jenis) {
    if (jenis === "penyisiran") {
      localStorage.setItem(JORONG_TOKEN_KEY, token);
      localStorage.setItem(JORONG_NAMA_KEY, nama);
    } else {
      localStorage.setItem(TETANGGA_TOKEN_KEY, token);
      localStorage.setItem(TETANGGA_NAMA_KEY, nama);
    }
    setSesi({ token, nama, jenis });
  }

  function handleLogout() {
    // Sengaja HANYA menghapus sesi jenis yang sedang aktif di tab ini --
    // tidak ikut menghapus token tab lain kalau kebetulan berbeda jenis
    // (jarang terjadi, tapi lebih aman drpd logout paksa dari tab yg tidak
    // sedang dipakai orang ini).
    if (!sesi) return;
    if (sesi.jenis === "penyisiran") {
      localStorage.removeItem(JORONG_TOKEN_KEY);
      localStorage.removeItem(JORONG_NAMA_KEY);
    } else {
      localStorage.removeItem(TETANGGA_TOKEN_KEY);
      localStorage.removeItem(TETANGGA_NAMA_KEY);
    }
    setSesi(null);
  }

  if (!checkedStorage) return null;
  if (!sesi) return <LoginPicker onLoggedIn={handleLoggedIn} />;

  return <AdministrasiPanel sesi={sesi} onSessionExpired={handleLogout} onLogout={handleLogout} />;
}

// ---------- Login: pilih jenis akun dulu, baru form nama+tanggal lahir ----------
function LoginPicker({ onLoggedIn }: { onLoggedIn: (token: string, nama: string, jenis: Jenis) => void }) {
  const [jenis, setJenis] = useState<Jenis | null>(null);

  if (!jenis) {
    return (
      <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
        <p className="text-sm font-semibold text-navy-900">Administrasi / SPJ Translok</p>
        <p className="mt-1 text-xs text-ink/60">
          Kelengkapan SPJ perjalanan dinas dalam kota (Kwitansi, Surat Tugas, Visum, Laporan, Dokumentasi, Surat
          Keterangan). Pilih jenis akun Anda utk masuk -- sama dgn login tab Identifikasi Jorong/Tetangga.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setJenis("penyisiran")}
            className="rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900"
          >
            Saya Petugas Penyisiran
          </button>
          <button
            type="button"
            onClick={() => setJenis("tetangga")}
            className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-navy-700 hover:border-navy-400"
          >
            Saya Tetangga/Lainnya
          </button>
        </div>
      </div>
    );
  }

  return <LoginForm jenis={jenis} onBack={() => setJenis(null)} onLoggedIn={onLoggedIn} />;
}

function LoginForm({
  jenis,
  onBack,
  onLoggedIn,
}: {
  jenis: Jenis;
  onBack: () => void;
  onLoggedIn: (token: string, nama: string, jenis: Jenis) => void;
}) {
  const [namaOptions, setNamaOptions] = useState<string[]>([]);
  const [namaInput, setNamaInput] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Endpoint nama & login SAMA PERSIS dgn tab Identifikasi Jorong/Tetangga
  // (jorong-names/jorong-login vs tetangga-names/tetangga-login) -- login
  // di sini memang menumpang akun yg sama, bukan sistem baru.
  const namesPath = jenis === "penyisiran" ? "/api/penyisiran/jorong-names" : "/api/penyisiran/tetangga-names";
  const loginPath = jenis === "penyisiran" ? "/api/penyisiran/jorong-login" : "/api/penyisiran/tetangga-login";
  const labelJenis = jenis === "penyisiran" ? "Petugas Penyisiran" : "Tetangga/Lainnya";

  useEffect(() => {
    fetch(namesPath)
      .then((r) => r.json())
      .then((d) => setNamaOptions(Array.isArray(d?.names) ? d.names : []))
      .catch(() => setNamaOptions([]));
  }, [namesPath]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!namaInput.trim() || !tanggalLahir) {
      setError("Isi nama lengkap dan tanggal lahir.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(loginPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama: namaInput, tanggal_lahir: tanggalLahir }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Login gagal.");
        return;
      }
      onLoggedIn(data.token, data.nama, jenis);
    } catch {
      setError("Gagal terhubung. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
      <p className="text-sm font-semibold text-navy-900">Administrasi / SPJ Translok -- {labelJenis}</p>
      <p className="mt-1 text-xs text-ink/60">Masukkan nama lengkap dan tanggal lahir Anda.</p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-2 text-left">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Nama Lengkap</label>
          <input
            list="nama-administrasi-spj-options"
            type="text"
            value={namaInput}
            onChange={(e) => setNamaInput(e.target.value)}
            placeholder="Ketik nama lengkap Anda"
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <datalist id="nama-administrasi-spj-options">
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
      <button type="button" onClick={onBack} className="mt-3 text-[11px] text-ink/50 underline hover:text-navy-700">
        ← Ganti jenis akun
      </button>
    </div>
  );
}

// ---------- Panel utama ----------
interface PetugasTaut {
  jenis: Jenis;
  id: number;
  nama: string;
}
interface SuratTugasRow {
  id: number;
  nomor_st: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  keterangan: string | null;
  file_nama_asli: string | null;
  uploaded_by?: string;
  created_at: string;
  petugas?: PetugasTaut[];
  menunggu_file?: boolean;
}

function AdministrasiPanel({
  sesi,
  onSessionExpired,
  onLogout,
}: {
  sesi: SesiSpj;
  onSessionExpired: () => void;
  onLogout: () => void;
}) {
  const [pengelola, setPengelola] = useState(false);
  const [suratTugas, setSuratTugas] = useState<SuratTugasRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [subTabPengelola, setSubTabPengelola] = useState<"dashboard" | "monitoring" | "cetak" | "arsip">("dashboard");
  const [subTabSaya, setSubTabSaya] = useState<"ringkasan" | "isi">("ringkasan");
  const [modalSelesai, setModalSelesai] = useState<{ tanggal: string; telat: number } | null>(null);
  // Supaya modal ucapan terima kasih cuma muncul SEKALI per (ST, tanggal)
  // dlm satu sesi browser -- bukan tiap kali petugas upload/edit sesuatu
  // lagi pd hari yg sudah lengkap sebelumnya.
  const sudahDitampilkanRef = useRef<Set<string>>(new Set());

  // SATU fetch /api/penyisiran/spj/monitoring dipakai bareng utk
  // Dashboard, Monitoring SPJ, Cetak SPJ (matriks kelengkapan), DAN
  // ringkasan "Administrasi Saya" -- server sudah menentukan sendiri (lewat
  // field pengelola pada responsnya) apakah baris yg dikirim itu SEMUA
  // petugas atau cuma milik akun yg login.
  const monitoring = useSpjMonitoring(sesi.token, onSessionExpired);

  // Dipanggil LaporanSection/DokumentasiSection tiap kali petugas berhasil
  // simpan Laporan / upload foto Dokumentasi -- cek ULANG ke server (bukan
  // pakai `monitoring.baris` yg mungkin blm sempat refresh) apakah tanggal
  // itu SEKARANG sudah py Laporan + Dokumentasi >=3 foto (ambang KHUSUS
  // fitur ini, sama dgn AMBANG_DOKUMENTASI_HARIAN di lib/spjMatriks.ts --
  // BUKAN ambang >=5 yg dipakai statusDokumen() utk Dashboard pengelola).
  // Kalau ya (& blm pernah ditampilkan), tampilkan modal ucapan terima
  // kasih sesuai permintaan user. Kegagalan cek ini SENGAJA didiamkan --
  // ini cuma pemicu ucapan terima kasih, bukan bagian alur simpan utama
  // yg (kalau sampai callback ini terpanggil) sudah sukses tersimpan.
  const cekDanTandaiSelesai = useCallback(
    async (suratTugasId: number, tanggal: string) => {
      const kunci = `${suratTugasId}:${tanggal}`;
      try {
        if (!sudahDitampilkanRef.current.has(kunci)) {
          const data = await apiFetch("/api/penyisiran/spj/monitoring", sesi.token);
          const barisBaru = (Array.isArray(data?.baris) ? data.baris : []) as {
            surat_tugas_id: number;
            tanggal: string;
            ada_laporan: boolean;
            slot_dokumentasi_terisi: number;
          }[];
          const row = barisBaru.find((b) => b.surat_tugas_id === suratTugasId && b.tanggal === tanggal);
          if (row && row.ada_laporan && row.slot_dokumentasi_terisi >= AMBANG_DOKUMENTASI_HARIAN) {
            sudahDitampilkanRef.current.add(kunci);
            const telat = Math.max(0, selisihHari(tanggal, tanggalHariIniWib()));
            setModalSelesai({ tanggal, telat });
          }
        }
      } catch {
        // diamkan -- lihat komentar di atas.
      } finally {
        monitoring.muat();
      }
    },
    [sesi.token, monitoring]
  );

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

  const loadSuratTugas = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/spj/surat-tugas", sesi.token);
      setPengelola(Boolean(data?.pengelola));
      setSuratTugas(Array.isArray(data?.surat_tugas) ? data.surat_tugas : []);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoading(false);
    }
  }, [sesi.token, guard]);

  useEffect(() => {
    loadSuratTugas();
  }, [loadSuratTugas]);

  const [busyUnduhStId, setBusyUnduhStId] = useState<number | null>(null);
  async function handleUnduh(id: number) {
    setBusyUnduhStId(id);
    try {
      const data = await apiFetch(`/api/penyisiran/spj/surat-tugas/${id}/file`, sesi.token);
      if (data?.url) window.open(data.url, "_blank", "noreferrer");
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setBusyUnduhStId(null);
    }
  }

  // Dipanggil tombol navigasi di kartu Laporan/Dokumentasi versi read-only
  // (sub-tab Arsip SPJ/Isi Dokumen) -- "+ Tambah Laporan/Dokumentasi" di
  // sana TIDAK submit apa pun sendiri, cuma memindahkan orang ke sub-tab
  // aktif (Dashboard utk pengelola, Ringkasan utk petugas biasa) tempat
  // form submit sebenarnya berada -- sesuai permintaan user.
  const navigasiKeAktif = useCallback(() => {
    if (pengelola) setSubTabPengelola("dashboard");
    else setSubTabSaya("ringkasan");
  }, [pengelola]);

  const labelJenis = sesi.jenis === "penyisiran" ? "Petugas Penyisiran" : "Tetangga/Lainnya";

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-navy-900 sm:text-lg">Administrasi / SPJ Translok</h1>
          <p className="mt-0.5 text-xs text-ink/50">
            Login sebagai <span className="font-semibold text-navy-900">{sesi.nama}</span> ({labelJenis})
            {pengelola && <span className="ml-1 text-navy-700">-- pengelola</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700"
        >
          Keluar
        </button>
      </div>

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      {pengelola ? (
        <div className="flex flex-wrap gap-1.5 rounded-md border border-line bg-paper/40 p-1">
          {(
            [
              ["dashboard", "📊 Dashboard"],
              ["monitoring", "📋 Monitoring SPJ"],
              ["cetak", "🖨️ Cetak SPJ"],
              ["arsip", "📁 Arsip SPJ"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTabPengelola(key)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                subTabPengelola === key ? "bg-navy-700 text-white" : "text-ink/60 hover:text-navy-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 rounded-md border border-line bg-paper/40 p-1">
          {(
            [
              ["ringkasan", "🏠 Ringkasan"],
              ["isi", "📝 Isi Dokumen"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSubTabSaya(key)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                subTabSaya === key ? "bg-navy-700 text-white" : "text-ink/60 hover:text-navy-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {pengelola && subTabPengelola === "dashboard" && (
        <div className="space-y-3">
          <SpjDashboard baris={monitoring.baris} loading={monitoring.loading} />
          {/* ---------- Laporan & Dokumentasi -- form submit AKTIF, dipindah ke sini
              (permintaan user) supaya sub-tab Arsip SPJ murni jadi rekap. ---------- */}
          <LaporanSection token={sesi.token} onSessionExpired={onSessionExpired} onSelesai={cekDanTandaiSelesai} />
          <DokumentasiSection token={sesi.token} onSessionExpired={onSessionExpired} onSelesai={cekDanTandaiSelesai} />
        </div>
      )}
      {pengelola && subTabPengelola === "monitoring" && (
        <SpjMonitoring
          baris={monitoring.baris}
          loading={monitoring.loading}
          token={sesi.token}
          onSessionExpired={onSessionExpired}
          sesiJenis={monitoring.sesiJenis}
          sesiPetugasId={monitoring.sesiPetugasId}
        />
      )}
      {pengelola && subTabPengelola === "cetak" && (
        <SpjCetakTab token={sesi.token} onSessionExpired={onSessionExpired} />
      )}

      {!pengelola && subTabSaya === "ringkasan" && (
        <div className="space-y-3">
          <KelengkapanDokumenSaya
            token={sesi.token}
            onSessionExpired={onSessionExpired}
            baris={monitoring.baris}
            loading={monitoring.loading}
          />
          <AdministrasiSayaRingkasan baris={monitoring.baris} loading={monitoring.loading} />
          <SpjCetakSaya token={sesi.token} onSessionExpired={onSessionExpired} />
          {/* ---------- Laporan & Dokumentasi -- form submit AKTIF, dipindah ke sini
              (permintaan user) supaya sub-tab Isi Dokumen murni jadi rekap. ---------- */}
          <LaporanSection token={sesi.token} onSessionExpired={onSessionExpired} onSelesai={cekDanTandaiSelesai} />
          <DokumentasiSection token={sesi.token} onSessionExpired={onSessionExpired} onSelesai={cekDanTandaiSelesai} />
        </div>
      )}

      {((pengelola && subTabPengelola === "arsip") || (!pengelola && subTabSaya === "isi")) && (
      <>
      {/* ---------- Surat Tugas -- SUDAH JALAN ---------- */}
      <div className="rounded-lg border border-line bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-navy-900">📄 Surat Tugas</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadSuratTugas}
              disabled={loading}
              className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
            >
              {loading ? "Memuat..." : "↻ Muat Ulang"}
            </button>
            {pengelola && (
              <button
                type="button"
                onClick={() => setShowUpload((v) => !v)}
                className="rounded-md bg-navy-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-navy-900"
              >
                {showUpload ? "Tutup Form" : "+ Upload Surat Tugas"}
              </button>
            )}
          </div>
        </div>

        {pengelola && !showUpload && (
          <p className="mb-2 text-[11px] text-ink/50">
            Sebagai pengelola, Anda melihat SEMUA Surat Tugas yang pernah diupload beserta petugas yang ditautkan.
          </p>
        )}

        {showUpload && pengelola && (
          <UploadSuratTugasForm
            token={sesi.token}
            onDone={() => {
              setShowUpload(false);
              loadSuratTugas();
            }}
            onSessionExpired={onSessionExpired}
          />
        )}

        <div className="mt-2 flex flex-col gap-2">
          {suratTugas.map((st) => (
            <div key={st.id} className="rounded-md border border-line bg-paper/40 p-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-navy-900">
                  {st.nomor_st}
                  {st.menunggu_file && (
                    <span className="ml-1.5 rounded-full bg-rust-100 px-1.5 py-0.5 text-[10px] font-medium text-rust-700">
                      ⏳ Menunggu file
                    </span>
                  )}
                </span>
                {st.menunggu_file && pengelola ? (
                  <GantiFileTombol
                    id={st.id}
                    token={sesi.token}
                    onDone={loadSuratTugas}
                    onSessionExpired={onSessionExpired}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUnduh(st.id)}
                    disabled={busyUnduhStId === st.id}
                    className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
                  >
                    {busyUnduhStId === st.id ? "⏳ Menyiapkan..." : "⬇ Lihat/Unduh"}
                  </button>
                )}
              </div>
              <p className="mt-1 text-ink/60">
                {formatTanggal(st.tanggal_mulai)} s/d {formatTanggal(st.tanggal_selesai)}
              </p>
              {st.keterangan && <p className="mt-0.5 text-ink/50">{st.keterangan}</p>}
              {pengelola && st.petugas && st.petugas.length > 0 && (
                <p className="mt-1 text-[10px] text-ink/40">
                  Ditautkan ke: {st.petugas.map((p) => p.nama).join(", ")}
                </p>
              )}
            </div>
          ))}
          {suratTugas.length === 0 && !loading && (
            <p className="rounded-md border border-dashed border-line p-3 text-center text-[11px] text-ink/40">
              Belum ada Surat Tugas{pengelola ? " -- upload lewat tombol di atas." : " yang ditautkan ke Anda."}
            </p>
          )}
        </div>
      </div>

      {/* ---------- Visum -- SUDAH JALAN (tetap aktif di Arsip, isi 1x/ST) ---------- */}
      <VisumSection token={sesi.token} jenis={sesi.jenis} onSessionExpired={onSessionExpired} />

      {/* ---------- Laporan & Dokumentasi -- READ-ONLY di sini (permintaan
          user: Arsip SPJ/Isi Dokumen cuma rekap, submit-nya dipindah ke
          Dashboard/Ringkasan) -- tombol navigasi lompat ke sana. ---------- */}
      <LaporanSection
        token={sesi.token}
        onSessionExpired={onSessionExpired}
        onSelesai={cekDanTandaiSelesai}
        readOnly
        onNavigasiKeAktif={navigasiKeAktif}
      />
      <DokumentasiSection
        token={sesi.token}
        onSessionExpired={onSessionExpired}
        onSelesai={cekDanTandaiSelesai}
        readOnly
        onNavigasiKeAktif={navigasiKeAktif}
      />

      {/* ---------- Kwitansi -- SUDAH JALAN (tetap aktif di Arsip, isi 1x/ST) ---------- */}
      <KwitansiSection token={sesi.token} jenis={sesi.jenis} onSessionExpired={onSessionExpired} />

      {/* ---------- Surat Keterangan Tidak Menggunakan Kendaraan Dinas -- SUDAH JALAN ---------- */}
      <SuratKeteranganSection token={sesi.token} onSessionExpired={onSessionExpired} />
      </>
      )}

      {/* ---------- Modal ucapan terima kasih SPJ lengkap ---------- */}
      {/* Dipicu cekDanTandaiSelesai() -- muncul saat Laporan + Dokumentasi
          (>=3 foto) utk 1 (Surat Tugas, tanggal) SAMA2 sudah lengkap,
          persis permintaan user. */}
      {modalSelesai && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4">
          <div className="max-w-sm rounded-lg bg-white p-5 text-center shadow-xl">
            <p className="text-3xl">🎉</p>
            <p className="mt-2 text-sm font-semibold text-navy-900">
              {modalSelesai.telat > 0
                ? `Terima kasih, Anda sudah melengkapi SPJ tanggal ${formatTanggal(modalSelesai.tanggal)} (telat ${modalSelesai.telat} hari).`
                : "Terima kasih, Anda sudah melengkapi SPJ hari ini tepat waktu."}
            </p>
            <button
              type="button"
              onClick={() => setModalSelesai(null)}
              className="mt-4 rounded-md bg-navy-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-navy-900"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTanggal(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

// Tanggal hari ini menurut jam LOKAL browser (bukan toISOString() yg pakai
// UTC -- kalau dipakai jam dini hari WIB, toISOString() bisa mundur sehari),
// lalu diklem supaya tetap di dlm rentang tanggal_mulai..tanggal_selesai
// Surat Tugas. Dipakai sbg default form Laporan & Dokumentasi supaya
// tanggal yg tampil = hari ini (saat petugas benar2 kerja), bukan tanggal
// mulai ST -- kalau dibiarkan default ke tanggal_mulai, petugas yg lupa
// ganti tanggal akan submit ke tanggal yg salah & sistem tdk menemukan
// aktivitas identifikasi (krn memang dicatat di tanggal lain).
function tanggalHariIniKlem(tanggalMulai: string, tanggalSelesai: string): string {
  const d = new Date();
  const tahun = d.getFullYear();
  const bulan = String(d.getMonth() + 1).padStart(2, "0");
  const tgl = String(d.getDate()).padStart(2, "0");
  const hariIni = `${tahun}-${bulan}-${tgl}`;
  if (hariIni < tanggalMulai) return tanggalMulai;
  if (hariIni > tanggalSelesai) return tanggalSelesai;
  return hariIni;
}

// ---------- Form upload Surat Tugas (pengelola) ----------
function UploadSuratTugasForm({
  token,
  onDone,
  onSessionExpired,
}: {
  token: string;
  onDone: () => void;
  onSessionExpired: () => void;
}) {
  const [petugasOptions, setPetugasOptions] = useState<PetugasTaut[]>([]);
  const [nomorSt, setNomorSt] = useState("");
  const [tanggalMulai, setTanggalMulai] = useState("");
  const [tanggalSelesai, setTanggalSelesai] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/penyisiran/spj/petugas-list", token)
      .then((d) => setPetugasOptions(Array.isArray(d?.petugas) ? d.petugas : []))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
        else setError(msg);
      });
  }, [token, onSessionExpired]);

  function toggle(key: string) {
    setDipilih((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nomorSt.trim() || !tanggalMulai || !tanggalSelesai) {
      setError("Nomor ST, tanggal mulai, dan tanggal selesai wajib diisi.");
      return;
    }
    if (!file) {
      setError("Pilih file Surat Tugas (PDF/gambar hasil scan).");
      return;
    }
    if (dipilih.size === 0) {
      setError("Pilih minimal 1 petugas untuk ditautkan.");
      return;
    }
    setBusy(true);
    try {
      const petugas = Array.from(dipilih).map((key) => {
        const [jenis, idStr] = key.split(":");
        return { jenis, id: Number(idStr) };
      });
      const form = new FormData();
      form.set("nomor_st", nomorSt.trim());
      form.set("tanggal_mulai", tanggalMulai);
      form.set("tanggal_selesai", tanggalSelesai);
      form.set("keterangan", keterangan.trim());
      form.set("petugas", JSON.stringify(petugas));
      form.set("file", file);
      // Multipart -- SENGAJA tidak lewat apiFetch (yang selalu set
      // Content-Type: application/json), browser yang mengisi header
      // Content-Type + boundary secara otomatis utk FormData.
      const res = await fetch("/api/penyisiran/spj/surat-tugas", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-3 space-y-2 rounded-md border border-line bg-paper/40 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/50">Nomor ST</label>
          <input
            type="text"
            value={nomorSt}
            onChange={(e) => setNomorSt(e.target.value)}
            placeholder="B-xxxx/13030/..."
            className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/50">Tanggal Mulai</label>
          <input
            type="date"
            value={tanggalMulai}
            onChange={(e) => setTanggalMulai(e.target.value)}
            className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/50">Tanggal Selesai</label>
          <input
            type="date"
            value={tanggalSelesai}
            onChange={(e) => setTanggalSelesai(e.target.value)}
            className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-ink/50">Keterangan (opsional)</label>
        <input
          type="text"
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-ink/50">File Surat Tugas (PDF/gambar)</label>
        <input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-xs"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-ink/50">Tautkan ke Petugas</label>
        <div className="max-h-40 overflow-y-auto rounded-md border border-line bg-white p-2">
          {petugasOptions.map((p) => {
            const key = `${p.jenis}:${p.id}`;
            return (
              <label key={key} className="flex items-center gap-1.5 py-0.5 text-xs">
                <input type="checkbox" checked={dipilih.has(key)} onChange={() => toggle(key)} />
                {p.nama}
              </label>
            );
          })}
          {petugasOptions.length === 0 && <p className="text-[11px] text-ink/40">Memuat daftar petugas...</p>}
        </div>
      </div>
      {error && <p className="text-xs text-rust-700">⚠ {error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
      >
        {busy ? "Mengupload..." : "Upload & Tautkan"}
      </button>
    </form>
  );
}

// ---------- Ganti/lengkapi file utk ST yang `menunggu_file` (pengelola) ----------
// Dipakai khusus utk ST yang nomor/tanggal/petugas-nya sudah tercatat tapi
// file aslinya belum diupload (badge "⏳ Menunggu file") -- klik langsung
// buka pemilih file, submit otomatis begitu file dipilih (tidak perlu form
// terpisah spt UploadSuratTugasForm krn nomor/tanggal/petugas TIDAK diubah
// di sini, cuma file-nya).
function GantiFileTombol({
  id,
  token,
  onDone,
  onSessionExpired,
}: {
  id: number;
  token: string;
  onDone: () => void;
  onSessionExpired: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      // Multipart -- SENGAJA tidak lewat apiFetch, sama spt alasan di
      // UploadSuratTugasForm.
      const res = await fetch(`/api/penyisiran/spj/surat-tugas/${id}/file`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
      else setError(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="cursor-pointer rounded-md border border-rust-600 bg-rust-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-rust-700">
        {busy ? "⏳ Mengupload..." : "⬆ Ganti File"}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          disabled={busy}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>
      {error && <p className="text-[10px] text-rust-700">⚠ {error}</p>}
    </div>
  );
}

// ---------- Visum (rencana kunjungan) ----------
interface VisumRow {
  id: number;
  rencana_tujuan: string;
  tempat_kedudukan: string;
  tanggal_berangkat: string;
  tanggal_tiba_tujuan: string;
  tanggal_berangkat_kembali: string | null;
  tanggal_tiba_kembali: string | null;
}
interface VisumSuratTugas {
  surat_tugas_id: number;
  nomor_st: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  visum: VisumRow | null;
}

function VisumSection({
  token,
  jenis,
  onSessionExpired,
}: {
  token: string;
  jenis: Jenis;
  onSessionExpired: () => void;
}) {
  const [daftar, setDaftar] = useState<VisumSuratTugas[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  // Kecamatan domisili & wilayah tugas -- dihitung SERVER-SIDE dari data
  // Perencanaan Lapangan (lihat komentar hitungKecamatanVisum di
  // app/api/penyisiran/spj/visum/route.ts), HANYA terisi utk jenis
  // "penyisiran". Ditampilkan di sini SEBELUM disimpan supaya petugas tau
  // nilai apa yg bakal dipakai di PDF Visum-nya.
  const [kecDomisili, setKecDomisili] = useState<string | null>(null);
  const [kecWilayahTugas, setKecWilayahTugas] = useState<string | null>(null);

  const guard = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
        else setErrMsg(msg);
      }
    },
    [onSessionExpired]
  );

  const muat = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/spj/visum", token);
      setDaftar(Array.isArray(data?.daftar) ? data.daftar : []);
      setKecDomisili(typeof data?.kecamatan_domisili === "string" ? data.kecamatan_domisili : null);
      setKecWilayahTugas(typeof data?.kecamatan_wilayah_tugas === "string" ? data.kecamatan_wilayah_tugas : null);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoading(false);
    }
  }, [token, guard]);

  useEffect(() => {
    muat();
  }, [muat]);

  // Unduh PDF -- SENGAJA fetch manual + blob (bukan apiFetch/window.open
  // langsung ke URL API), krn endpoint ini butuh header Authorization yang
  // tidak bisa disisipkan lewat navigasi/`window.open` biasa, dan PDF-nya
  // dibuat on-the-fly (bukan file tersimpan spt Surat Tugas).
  async function handleUnduh(visumId: number) {
    try {
      const res = await fetch(`/api/penyisiran/spj/visum/${visumId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Gagal (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // PAKAI elemen <a>+.click(), BUKAN window.open() langsung -- window.open()
      // yg dipanggil SESUDAH `await fetch()` selesai sering dianggap browser
      // (terutama Safari/iOS, kadang jg Chrome) BUKAN hasil klik langsung
      // pengguna (krn ada jeda async di antaranya), jadi popup-nya diblokir
      // DIAM-DIAM tanpa error apa pun -- persis gejala "tombol Unduh PDF tidak
      // menghasilkan apa-apa". Klik anchor sintetis TIDAK kena blokir ini.
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      guard(() => {
        throw e;
      });
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-navy-900">🧭 Visum (Rencana Kunjungan)</p>
        <button
          type="button"
          onClick={muat}
          disabled={loading}
          className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-ink/50">
        Isi RENCANA tanggal pelaksanaan per Surat Tugas Anda -- bukan realisasi. Setelah disimpan, unduh PDF
        Visum-nya utk kelengkapan SPJ.
      </p>

      {jenis === "penyisiran" && (
        <div className="mb-2 rounded-md border border-line bg-paper/40 p-2 text-[11px] text-ink/60">
          <p>
            Kecamatan domisili (Tempat Kedudukan):{" "}
            <span className="font-medium text-navy-900">{kecDomisili || "belum ada data"}</span>
          </p>
          <p className="mt-0.5">
            Kecamatan wilayah tugas:{" "}
            {kecWilayahTugas ? (
              <span className="font-medium text-navy-900">{kecWilayahTugas}</span>
            ) : (
              <span className="font-medium text-rust-700">belum ada wilayah SLS yang ditautkan</span>
            )}
          </p>
          <p className="mt-1 text-[10px] text-ink/40">
            Otomatis diambil dari data domisili &amp; alokasi wilayah tugas Anda di Perencanaan Lapangan -- bukan
            diketik manual, supaya Visum selalu sesuai data terbaru.
          </p>
        </div>
      )}

      {errMsg && (
        <p className="mb-2 rounded-lg border border-rust-100 bg-rust-100/40 p-2 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-col gap-2">
        {daftar.map((row) => (
          <VisumBaris
            key={row.surat_tugas_id}
            row={row}
            token={token}
            jenis={jenis}
            kecamatanDomisili={kecDomisili}
            kecamatanWilayahTugas={kecWilayahTugas}
            onSaved={muat}
            onUnduh={handleUnduh}
            guard={guard}
          />
        ))}
        {daftar.length === 0 && !loading && (
          <p className="rounded-md border border-dashed border-line p-3 text-center text-[11px] text-ink/40">
            Belum ada Surat Tugas yang ditautkan ke Anda -- Visum baru bisa diisi setelah pengelola menautkan Surat
            Tugas Anda di bagian atas.
          </p>
        )}
      </div>
    </div>
  );
}

function VisumBaris({
  row,
  token,
  jenis,
  kecamatanDomisili,
  kecamatanWilayahTugas,
  onSaved,
  onUnduh,
  guard,
}: {
  row: VisumSuratTugas;
  token: string;
  jenis: Jenis;
  kecamatanDomisili: string | null;
  kecamatanWilayahTugas: string | null;
  onSaved: () => void;
  onUnduh: (visumId: number) => void;
  guard: (fn: () => void) => void;
}) {
  const [edit, setEdit] = useState(!row.visum);
  // rencanaTujuan HANYA relevan/ditampilkan utk jenis "tetangga" -- jenis
  // "penyisiran" pakai kecamatanWilayahTugas (dihitung server, read-only).
  const [rencanaTujuan, setRencanaTujuan] = useState(row.visum?.rencana_tujuan ?? "");
  const [tanggalPelaksanaan, setTanggalPelaksanaan] = useState(row.visum?.tanggal_berangkat ?? row.tanggal_mulai);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUnduh, setBusyUnduh] = useState(false);

  async function handleKlikUnduh() {
    if (!row.visum) return;
    setBusyUnduh(true);
    try {
      await onUnduh(row.visum.id);
    } finally {
      setBusyUnduh(false);
    }
  }

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (jenis === "penyisiran") {
      if (!kecamatanWilayahTugas) {
        setError("Kecamatan wilayah tugas belum tertaut -- minta pengelola menautkan wilayah SLS Anda dulu.");
        return;
      }
      if (!tanggalPelaksanaan) {
        setError("Tanggal pelaksanaan wajib diisi.");
        return;
      }
    } else if (!rencanaTujuan.trim() || !tanggalPelaksanaan) {
      setError("Rencana tujuan dan tanggal pelaksanaan wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/penyisiran/spj/visum", token, {
        method: "POST",
        body: JSON.stringify({
          surat_tugas_id: row.surat_tugas_id,
          // rencana_tujuan cuma dipakai server utk jenis "tetangga" --
          // utk jenis "penyisiran" server SELALU hitung ulang sendiri
          // (lihat app/api/penyisiran/spj/visum/route.ts), jadi dikirim
          // kosong/diabaikan.
          rencana_tujuan: jenis === "tetangga" ? rencanaTujuan.trim() : undefined,
          tanggal_pelaksanaan: tanggalPelaksanaan,
        }),
      });
      setEdit(false);
      onSaved();
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-paper/40 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-navy-900">{row.nomor_st}</span>
        <div className="flex items-center gap-2">
          {row.visum && !edit && (
            <button
              type="button"
              onClick={handleKlikUnduh}
              disabled={busyUnduh}
              className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
            >
              {busyUnduh ? "⏳ Menyiapkan..." : "🖨 Unduh PDF Visum"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEdit((v) => !v)}
            className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-ink/60 hover:border-navy-400"
          >
            {edit ? "Batal" : row.visum ? "Ubah" : "Isi Visum"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-ink/60">
        {formatTanggal(row.tanggal_mulai)} s/d {formatTanggal(row.tanggal_selesai)}
      </p>

      {!edit && row.visum && (
        <p className="mt-1 text-[11px] text-ink/50">
          Tujuan: <span className="font-medium text-navy-900">{row.visum.rencana_tujuan}</span> -- Tanggal:{" "}
          {formatTanggal(row.visum.tanggal_berangkat)}
        </p>
      )}

      {edit && (
        <form onSubmit={handleSimpan} className="mt-2 space-y-2 rounded-md border border-line bg-white p-2">
          {jenis === "penyisiran" ? (
            <div className="rounded-md border border-line bg-paper/40 p-2 text-[11px] text-ink/60">
              <p>
                Kecamatan domisili: <span className="font-medium text-navy-900">{kecamatanDomisili || "-"}</span>
              </p>
              <p className="mt-0.5">
                Kecamatan wilayah tugas:{" "}
                {kecamatanWilayahTugas ? (
                  <span className="font-medium text-navy-900">{kecamatanWilayahTugas}</span>
                ) : (
                  <span className="font-medium text-rust-700">belum ada wilayah SLS yang ditautkan</span>
                )}
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[10px] font-medium text-ink/50">Rencana Tujuan (Nagari/Jorong)</label>
              <input
                type="text"
                value={rencanaTujuan}
                onChange={(e) => setRencanaTujuan(e.target.value)}
                placeholder="Contoh: Nagari Kubung"
                className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] font-medium text-ink/50">Tanggal Pelaksanaan</label>
            <input
              type="date"
              value={tanggalPelaksanaan}
              onChange={(e) => setTanggalPelaksanaan(e.target.value)}
              className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
            />
          </div>
          {error && <p className="text-[11px] text-rust-700">⚠ {error}</p>}
          <button
            type="submit"
            disabled={busy || (jenis === "penyisiran" && !kecamatanWilayahTugas)}
            className="w-full rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {busy ? "Menyimpan..." : "Simpan Visum"}
          </button>
        </form>
      )}
    </div>
  );
}

// ---------- Laporan (per Surat Tugas, bisa lebih dari 1 tanggal) ----------
interface LaporanRow {
  id: number;
  tanggal: string;
  mode: "template" | "bebas";
  narasi: string | null;
  created_at: string;
}
interface LaporanSuratTugas {
  surat_tugas_id: number;
  nomor_st: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  laporan: LaporanRow[];
}

function LaporanSection({
  token,
  onSessionExpired,
  onSelesai,
  readOnly,
  onNavigasiKeAktif,
}: {
  token: string;
  onSessionExpired: () => void;
  onSelesai: (suratTugasId: number, tanggal: string) => void;
  // readOnly: dipakai versi Arsip SPJ/Isi Dokumen -- cuma rekap (daftar +
  // Unduh PDF), tombol "+ Tambah Laporan" & form DISEMBUNYIKAN, diganti
  // tombol navigasi (onNavigasiKeAktif) yg lompat ke sub-tab Dashboard/
  // Ringkasan tempat form submit sebenarnya berada. Default false (versi
  // aktif, submit spt biasa).
  readOnly?: boolean;
  onNavigasiKeAktif?: () => void;
}) {
  const [daftar, setDaftar] = useState<LaporanSuratTugas[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const guard = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
        else setErrMsg(msg);
      }
    },
    [onSessionExpired]
  );

  const muat = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/spj/laporan", token);
      setDaftar(Array.isArray(data?.daftar) ? data.daftar : []);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoading(false);
    }
  }, [token, guard]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function handleUnduh(laporanId: number) {
    try {
      const res = await fetch(`/api/penyisiran/spj/laporan/${laporanId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Gagal (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // PAKAI elemen <a>+.click(), BUKAN window.open() langsung -- window.open()
      // yg dipanggil SESUDAH `await fetch()` selesai sering dianggap browser
      // (terutama Safari/iOS, kadang jg Chrome) BUKAN hasil klik langsung
      // pengguna (krn ada jeda async di antaranya), jadi popup-nya diblokir
      // DIAM-DIAM tanpa error apa pun -- persis gejala "tombol Unduh PDF tidak
      // menghasilkan apa-apa". Klik anchor sintetis TIDAK kena blokir ini.
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      guard(() => {
        throw e;
      });
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-navy-900">📝 Laporan{readOnly ? " (Arsip)" : ""}</p>
        <div className="flex items-center gap-2">
          {readOnly && onNavigasiKeAktif && (
            <button
              type="button"
              onClick={onNavigasiKeAktif}
              className="rounded-md bg-navy-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-navy-900"
            >
              + Tambah Laporan
            </button>
          )}
          <button
            type="button"
            onClick={muat}
            disabled={loading}
            className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
          >
            {loading ? "Memuat..." : "↻ Muat Ulang"}
          </button>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-ink/50">
        {readOnly
          ? "Rekap/arsip Laporan yang sudah dibuat -- utk membuat Laporan baru, gunakan tombol di atas (lompat ke sub-tab submit)."
          : 'Satu Laporan per tanggal dlm rentang Surat Tugas. Mode "Template" menarik rekap otomatis dari tab Identifikasi Jorong/Tetangga pada tanggal itu -- kalau datanya belum sesuai, koreksi dulu di tab tersebut lalu buat ulang.'}
      </p>

      {errMsg && (
        <p className="mb-2 rounded-lg border border-rust-100 bg-rust-100/40 p-2 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-col gap-2">
        {daftar.map((st) => (
          <LaporanStCard
            key={st.surat_tugas_id}
            st={st}
            token={token}
            onSaved={muat}
            onUnduh={handleUnduh}
            guard={guard}
            onSelesai={onSelesai}
            readOnly={readOnly}
            onNavigasiKeAktif={onNavigasiKeAktif}
          />
        ))}
        {daftar.length === 0 && !loading && (
          <p className="rounded-md border border-dashed border-line p-3 text-center text-[11px] text-ink/40">
            Belum ada Surat Tugas yang ditautkan ke Anda -- Laporan baru bisa dibuat setelah pengelola menautkan Surat
            Tugas Anda di bagian atas.
          </p>
        )}
      </div>
    </div>
  );
}

function LaporanStCard({
  st,
  token,
  onSaved,
  onUnduh,
  guard,
  onSelesai,
  readOnly,
  onNavigasiKeAktif,
}: {
  st: LaporanSuratTugas;
  token: string;
  onSaved: () => void;
  onUnduh: (laporanId: number) => void;
  guard: (fn: () => void) => void;
  onSelesai: (suratTugasId: number, tanggal: string) => void;
  readOnly?: boolean;
  onNavigasiKeAktif?: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  // Lacak PER-baris (bukan 1 boolean utk seluruh kartu) krn 1 ST bisa py
  // beberapa Laporan (per tanggal) -- tombol yg diklik yg harus berubah
  // jadi "Menyiapkan...", bukan semua baris sekaligus.
  const [busyUnduhId, setBusyUnduhId] = useState<number | null>(null);

  async function handleKlikUnduh(id: number) {
    setBusyUnduhId(id);
    try {
      await onUnduh(id);
    } finally {
      setBusyUnduhId(null);
    }
  }

  return (
    <div className="rounded-md border border-line bg-paper/40 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-navy-900">{st.nomor_st}</span>
        {readOnly ? (
          onNavigasiKeAktif && (
            <button
              type="button"
              onClick={onNavigasiKeAktif}
              className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400"
            >
              + Tambah
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-ink/60 hover:border-navy-400"
          >
            {showForm ? "Batal" : "+ Tambah Laporan"}
          </button>
        )}
      </div>
      <p className="mt-1 text-ink/60">
        {formatTanggal(st.tanggal_mulai)} s/d {formatTanggal(st.tanggal_selesai)}
      </p>

      {!readOnly && showForm && (
        <LaporanForm
          st={st}
          token={token}
          onDone={(tanggal) => {
            setShowForm(false);
            onSaved();
            onSelesai(st.surat_tugas_id, tanggal);
          }}
          guard={guard}
        />
      )}

      <div className="mt-2 flex flex-col gap-1.5">
        {st.laporan.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-white p-2">
            <div>
              <span className="font-medium text-navy-900">{formatTanggal(l.tanggal)}</span>{" "}
              <span className="rounded-full bg-paper px-1.5 py-0.5 text-[10px] font-semibold uppercase text-ink/50">
                {l.mode === "template" ? "Template" : "Narasi Bebas"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleKlikUnduh(l.id)}
              disabled={busyUnduhId === l.id}
              className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
            >
              {busyUnduhId === l.id ? "⏳ Menyiapkan..." : "🖨 Unduh PDF"}
            </button>
          </div>
        ))}
        {st.laporan.length === 0 && !showForm && (
          <p className="text-[11px] text-ink/40">Belum ada Laporan utk Surat Tugas ini.</p>
        )}
      </div>
    </div>
  );
}

// Label dropdown status_kunjungan (tab "Penyisiran Usaha") -- SAMA persis
// dgn STATUS_VALID di app/api/penyisiran/update/route.ts, dipakai
// menampilkan rekapStatusKunjungan dari preview Laporan.
const LABEL_STATUS_KUNJUNGAN: Record<string, string> = {
  belum: "Belum",
  ditemukan: "Berhasil Didata",
  tidak_ditemukan: "Tidak Ditemukan",
  tidak_bisa: "Tidak Bisa Diwawancara",
  sudah_didata_se2026: "Sudah Didata SE2026",
  tidak_ada_usaha: "Tidak Ada Usaha",
};

interface RekapLaporanPreview {
  lokasi: {
    kecNama: string | null;
    nagariNama: string | null;
    slsNama: string | null;
    subslsKode: string | null;
    jumlah: number;
  }[];
  rekapIdentifikasi: { ada: number; tidak_ada: number; ragu: number; belum: number };
  totalAktivitas: number;
  jumlahDokumentasi: number;
  rekapStatusKunjungan: Record<string, number>;
}

// Kartu "Data Hasil Penyisiran" -- ditampilkan LANGSUNG di dalam form
// Laporan begitu tanggal dipilih (permintaan user: "untuk laporan
// langsung ditampilkan data hasil penyisiran"), TIDAK menunggu tombol
// Simpan ditekan. Dipisah jadi komponen sendiri supaya fetch preview-nya
// independen dari state form Laporan (mode/narasi).
function RekapLaporanPreviewBox({ suratTugasId, tanggal, token }: { suratTugasId: number; tanggal: string; token: string }) {
  const [rekap, setRekap] = useState<RekapLaporanPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tanggal) return;
    let batal = false;
    setLoading(true);
    setError(null);
    apiFetch(
      `/api/penyisiran/spj/laporan?preview_surat_tugas_id=${suratTugasId}&preview_tanggal=${encodeURIComponent(tanggal)}`,
      token
    )
      .then((data) => {
        if (!batal) setRekap(data?.rekap ?? null);
      })
      .catch((e) => {
        if (!batal) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!batal) setLoading(false);
      });
    return () => {
      batal = true;
    };
  }, [suratTugasId, tanggal, token]);

  const adaStatusKunjungan = rekap ? Object.values(rekap.rekapStatusKunjungan).some((v) => v > 0) : false;
  // Peringatan dini (permintaan user, lihat lib/spjLaporanAturan.ts) --
  // ditampilkan SEBELUM petugas menekan Simpan supaya tidak kaget tiba2
  // ditolak server: sejak 20 Sept 2026 aktivitas Penyisiran Usaha WAJIB,
  // Identifikasi saja (walau ADA datanya) TIDAK LAGI cukup. Dihitung
  // langsung dari laporanTemplateBolehDisimpan() (SATU sumber kebenaran yg
  // sama dgn gerbang simpan di server) supaya tidak bisa "lupa disamakan"
  // kalau aturannya berubah lagi nanti.
  const perluPeringatanPenyisiranWajib =
    !!rekap &&
    rekap.totalAktivitas > 0 &&
    !adaStatusKunjungan &&
    !laporanTemplateBolehDisimpan(tanggal, adaStatusKunjungan, rekap.totalAktivitas > 0);

  // Preview ini CUMA menampilkan REKAP DATA (angka & lokasi) dalam bentuk
  // tabel/baris -- SENGAJA TIDAK menampilkan narasi/uraian kalimat apa pun
  // (permintaan user: "narasi tidak usah ditampilkan di menu, narasi
  // ditampilkan saat sudah di pdf saja"). Kalimat uraian otomatis ("Pada
  // hari ... melaksanakan tugas ...") HANYA dirangkai saat PDF dibuat,
  // lihat bagian "B. URAIAN..." di lib/pdf/laporan.ts -- tidak pernah
  // dirender di komponen mana pun di sini.
  return (
    <div className="rounded-md border border-line bg-paper/30 p-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink/50">
        Data Hasil Penyisiran Tanggal {formatTanggal(tanggal)}
      </p>
      {loading ? (
        <p className="text-[11px] text-ink/40">Memuat...</p>
      ) : error ? (
        <p className="text-[11px] text-rust-700">⚠ {error}</p>
      ) : !rekap || (rekap.totalAktivitas === 0 && !adaStatusKunjungan) ? (
        <p className="text-[11px] text-ink/40">Belum ada aktivitas penyisiran/identifikasi tercatat pada tanggal ini.</p>
      ) : (
        <div className="space-y-2.5 text-[11px]">
          {perluPeringatanPenyisiranWajib && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
              ⚠ Belum ada aktivitas Penyisiran Usaha pada tanggal ini. Sejak {formatTanggal(TANGGAL_WAJIB_PENYISIRAN)},
              Laporan mode Template wajib berdasarkan aktivitas Penyisiran Usaha -- data Identifikasi di bawah ini
              saja TIDAK CUKUP utk disimpan. Lengkapi checklist di tab Penyisiran Usaha dulu, atau pakai mode
              Narasi Bebas.
            </p>
          )}
          <div>
            <p className="mb-1 font-medium text-ink/60">Kartu Keluarga per Status Kunjungan (Penyisiran Usaha)</p>
            {adaStatusKunjungan ? (
              <table className="w-full text-[11px]">
                <thead className="bg-[#2563eb] text-[10px] font-semibold uppercase tracking-wide text-white">
                  <tr>
                    <th className="px-2 py-1 text-left">Status Kunjungan</th>
                    <th className="px-2 py-1 text-right">Jml Keluarga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {Object.entries(LABEL_STATUS_KUNJUNGAN).map(([k, label]) =>
                    rekap.rekapStatusKunjungan[k] ? (
                      <tr key={k}>
                        <td className="px-2 py-1 text-ink/80">{label}</td>
                        <td className="px-2 py-1 text-right font-semibold text-navy-900">
                          {rekap.rekapStatusKunjungan[k]}
                        </td>
                      </tr>
                    ) : null
                  )}
                </tbody>
              </table>
            ) : (
              <p className="text-ink/40">Belum ada perubahan status kunjungan yang tercatat.</p>
            )}
          </div>

          <div>
            <p className="mb-1 font-medium text-ink/60">
              Identifikasi Jorong/Tetangga -- {rekap.totalAktivitas} keluarga
            </p>
            <table className="w-full text-[11px]">
              <thead className="bg-[#2563eb] text-[10px] font-semibold uppercase tracking-wide text-white">
                <tr>
                  <th className="px-2 py-1 text-left">Ada</th>
                  <th className="px-2 py-1 text-left">Tidak Ada</th>
                  <th className="px-2 py-1 text-left">Ragu</th>
                  <th className="px-2 py-1 text-left">Belum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="px-2 py-1 font-semibold text-navy-900">{rekap.rekapIdentifikasi.ada}</td>
                  <td className="px-2 py-1 font-semibold text-navy-900">{rekap.rekapIdentifikasi.tidak_ada}</td>
                  <td className="px-2 py-1 font-semibold text-navy-900">{rekap.rekapIdentifikasi.ragu}</td>
                  <td className="px-2 py-1 font-semibold text-navy-900">{rekap.rekapIdentifikasi.belum}</td>
                </tr>
              </tbody>
            </table>

            {rekap.lokasi.length > 0 && (
              <table className="mt-1.5 w-full text-[11px]">
                <thead className="bg-[#2563eb] text-[10px] font-semibold uppercase tracking-wide text-white">
                  <tr>
                    <th className="px-2 py-1 text-left">Lokasi (Jorong/Sub SLS/Nagari/Kec.)</th>
                    <th className="px-2 py-1 text-right">Jml Keluarga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rekap.lokasi.map((l, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1 text-ink/80">
                        {[l.slsNama, l.subslsKode, l.nagariNama, l.kecNama].filter(Boolean).join(" / ")}
                      </td>
                      <td className="px-2 py-1 text-right font-semibold text-navy-900">{l.jumlah}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <table className="w-full text-[11px]">
            <tbody>
              <tr>
                <td className="px-2 py-1 text-ink/60">Dokumentasi tanggal ini</td>
                <td className="px-2 py-1 text-right font-semibold text-navy-900">{rekap.jumlahDokumentasi} foto</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LaporanForm({
  st,
  token,
  onDone,
  guard,
}: {
  st: LaporanSuratTugas;
  token: string;
  onDone: (tanggal: string) => void;
  guard: (fn: () => void) => void;
}) {
  const [tanggal, setTanggal] = useState(() => tanggalHariIniKlem(st.tanggal_mulai, st.tanggal_selesai));
  const [mode, setMode] = useState<"template" | "bebas">("template");
  const [narasi, setNarasi] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tanggal) {
      setError("Tanggal wajib diisi.");
      return;
    }
    if (mode === "bebas" && !narasi.trim()) {
      setError("Narasi wajib diisi utk mode Narasi Bebas.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/penyisiran/spj/laporan", token, {
        method: "POST",
        body: JSON.stringify({
          surat_tugas_id: st.surat_tugas_id,
          tanggal,
          mode,
          // Utk mode "bebas" ini ISI UTAMA laporan (wajib diisi, dicek di
          // atas); utk mode "template" ini cuma catatan tambahan opsional
          // yg ditempel di bawah uraian otomatis (lihat lib/pdf/laporan.ts)
          // -- kedua kasus SAMA2 dikirim apa adanya, bukan dikosongkan.
          narasi: narasi.trim(),
        }),
      });
      onDone(tanggal);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        guard(() => {
          throw e;
        });
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-md border border-line bg-white p-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/50">Tanggal</label>
          <input
            type="date"
            value={tanggal}
            min={st.tanggal_mulai}
            max={st.tanggal_selesai}
            onChange={(e) => setTanggal(e.target.value)}
            className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/50">Mode Isi Laporan</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value === "bebas" ? "bebas" : "template")}
            className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
          >
            <option value="template">Template (otomatis dari Identifikasi)</option>
            <option value="bebas">Narasi Bebas</option>
          </select>
        </div>
      </div>

      {tanggal && <RekapLaporanPreviewBox suratTugasId={st.surat_tugas_id} tanggal={tanggal} token={token} />}

      {mode === "bebas" ? (
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/50">Narasi</label>
          <textarea
            value={narasi}
            onChange={(e) => setNarasi(e.target.value)}
            rows={4}
            placeholder="Tuliskan uraian perjalanan &amp; pelaksanaan tugas Anda..."
            className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
          />
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/50">Catatan Tambahan (opsional)</label>
          <textarea
            value={narasi}
            onChange={(e) => setNarasi(e.target.value)}
            rows={2}
            placeholder="Ditambahkan sbg catatan pelengkap di bawah uraian otomatis (boleh dikosongkan)"
            className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
          />
        </div>
      )}
      {error && <p className="text-[11px] text-rust-700">⚠ {error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
      >
        {busy ? "Menyimpan..." : "Simpan Laporan"}
      </button>
    </form>
  );
}

// ---------- Dokumentasi (5 slot foto/hari) ----------
interface DokumentasiSt {
  surat_tugas_id: number;
  nomor_st: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
}
interface DokumentasiFotoSlot {
  id: number;
  slot: number;
  file_nama_asli: string | null;
  url: string | null;
}

function DokumentasiSection({
  token,
  onSessionExpired,
  onSelesai,
  readOnly,
  onNavigasiKeAktif,
}: {
  token: string;
  onSessionExpired: () => void;
  onSelesai: (suratTugasId: number, tanggal: string) => void;
  // Sama seperti readOnly di LaporanSection -- lihat komentar di sana.
  readOnly?: boolean;
  onNavigasiKeAktif?: () => void;
}) {
  const [daftar, setDaftar] = useState<DokumentasiSt[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const guard = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
        else setErrMsg(msg);
      }
    },
    [onSessionExpired]
  );

  const muat = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/spj/dokumentasi", token);
      setDaftar(Array.isArray(data?.daftar) ? data.daftar : []);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoading(false);
    }
  }, [token, guard]);

  useEffect(() => {
    muat();
  }, [muat]);

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-navy-900">📷 Dokumentasi{readOnly ? " (Arsip)" : ""}</p>
        <div className="flex items-center gap-2">
          {readOnly && onNavigasiKeAktif && (
            <button
              type="button"
              onClick={onNavigasiKeAktif}
              className="rounded-md bg-navy-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-navy-900"
            >
              + Tambah Dokumentasi
            </button>
          )}
          <button
            type="button"
            onClick={muat}
            disabled={loading}
            className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
          >
            {loading ? "Memuat..." : "↻ Muat Ulang"}
          </button>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-ink/50">
        {readOnly
          ? "Rekap/arsip foto Dokumentasi yang sudah diupload -- utk menambah foto, gunakan tombol di atas (lompat ke sub-tab submit)."
          : "Maksimal 5 foto/hari per Surat Tugas -- pilih tanggal, lalu upload foto ke slot yang sesuai (bisa pilih beberapa foto sekaligus). Setelah lengkap, unduh PDF Lampiran Dokumentasi-nya."}
      </p>

      {errMsg && (
        <p className="mb-2 rounded-lg border border-rust-100 bg-rust-100/40 p-2 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-col gap-2">
        {daftar.map((st) => (
          <DokumentasiStCard
            key={st.surat_tugas_id}
            st={st}
            token={token}
            guard={guard}
            onSelesai={onSelesai}
            readOnly={readOnly}
          />
        ))}
        {daftar.length === 0 && !loading && (
          <p className="rounded-md border border-dashed border-line p-3 text-center text-[11px] text-ink/40">
            Belum ada Surat Tugas yang ditautkan ke Anda -- Dokumentasi baru bisa diupload setelah pengelola menautkan
            Surat Tugas Anda di bagian atas.
          </p>
        )}
      </div>
    </div>
  );
}

// Satu foto yang dipilih di batch (multi-select) + slot yang ditandai
// utknya. `previewUrl` = URL.createObjectURL(file) dibuat SEKALI saat
// dipilih (bukan di tiap render) supaya petugas bisa LANGSUNG lihat isi
// fotonya sendiri (bukan cuma nama file) sebelum menandai slot & upload --
// permintaan user ("kita tidak tau isinya apa, harusnya ditampilkan
// gambarnya"). WAJIB di-revoke (URL.revokeObjectURL) begitu tidak dipakai
// lagi (dibatalkan/sudah diupload/komponen unmount) spy tidak bocor memori.
interface BatchFoto {
  file: File;
  slot: number | null;
  previewUrl: string;
}

function DokumentasiStCard({
  st,
  token,
  guard,
  onSelesai,
  readOnly,
}: {
  st: DokumentasiSt;
  token: string;
  guard: (fn: () => void) => void;
  onSelesai: (suratTugasId: number, tanggal: string) => void;
  readOnly?: boolean;
}) {
  const [tanggal, setTanggal] = useState(() => tanggalHariIniKlem(st.tanggal_mulai, st.tanggal_selesai));
  const [foto, setFoto] = useState<Record<number, DokumentasiFotoSlot | null>>({});
  const [loading, setLoading] = useState(false);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUnduh, setBusyUnduh] = useState(false);
  // ---------- Batch upload (pilih beberapa foto sekaligus) ----------
  const [batch, setBatch] = useState<BatchFoto[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  // Ref berisi `batch` TERKINI (bukan dari closure useEffect mount) -- dipakai
  // cleanup unmount di bawah spy semua previewUrl yg masih tersisa (blm
  // sempat di-upload/dibatalkan) tetap direvoke, jangan bocor memori.
  const batchRef = useRef<BatchFoto[]>([]);
  useEffect(() => {
    batchRef.current = batch;
  }, [batch]);
  useEffect(() => {
    return () => {
      batchRef.current.forEach((b) => URL.revokeObjectURL(b.previewUrl));
    };
  }, []);

  const muatFoto = useCallback(
    async (tgl: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch(
          `/api/penyisiran/spj/dokumentasi?surat_tugas_id=${st.surat_tugas_id}&tanggal=${encodeURIComponent(tgl)}`,
          token
        );
        const peta: Record<number, DokumentasiFotoSlot | null> = {};
        for (const s of SLOT_URUTAN) peta[s] = null;
        for (const f of (data?.foto ?? []) as DokumentasiFotoSlot[]) peta[f.slot] = f;
        setFoto(peta);
      } catch (e) {
        guard(() => {
          throw e;
        });
      } finally {
        setLoading(false);
      }
    },
    [st.surat_tugas_id, token, guard]
  );

  useEffect(() => {
    muatFoto(tanggal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUploadSlot(slot: number, file: File) {
    setBusySlot(slot);
    setError(null);
    try {
      const form = new FormData();
      form.set("surat_tugas_id", String(st.surat_tugas_id));
      form.set("tanggal", tanggal);
      form.set("slot", String(slot));
      form.set("file", file);
      const res = await fetch("/api/penyisiran/spj/dokumentasi", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
      await muatFoto(tanggal);
      onSelesai(st.surat_tugas_id, tanggal);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      guard(() => {
        throw new Error(msg);
      });
    } finally {
      setBusySlot(null);
    }
  }

  async function handleHapusSlot(id: number) {
    setBusySlot(-1);
    setError(null);
    try {
      await apiFetch(`/api/penyisiran/spj/dokumentasi?id=${id}`, token, { method: "DELETE" });
      await muatFoto(tanggal);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setBusySlot(null);
    }
  }

  async function handleUnduh() {
    setBusyUnduh(true);
    try {
      const res = await fetch(
        `/api/penyisiran/spj/dokumentasi/pdf?surat_tugas_id=${st.surat_tugas_id}&tanggal=${encodeURIComponent(tanggal)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Gagal (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // PAKAI elemen <a>+.click(), BUKAN window.open() langsung -- window.open()
      // yg dipanggil SESUDAH `await fetch()` selesai sering dianggap browser
      // (terutama Safari/iOS, kadang jg Chrome) BUKAN hasil klik langsung
      // pengguna (krn ada jeda async di antaranya), jadi popup-nya diblokir
      // DIAM-DIAM tanpa error apa pun -- persis gejala "tombol Unduh PDF tidak
      // menghasilkan apa-apa". Klik anchor sintetis TIDAK kena blokir ini.
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setBusyUnduh(false);
    }
  }

  // ---------- Batch upload: pilih hingga 5 foto sekaligus, tandai slotnya
  // masing2 (Sebelum Berangkat/Sampai di Lokasi/dst), lalu upload semua
  // sekali klik -- permintaan user, menggantikan cara lama (upload 1-1 per
  // kotak slot, yg tetap ada & bisa dipakai utk ganti/hapus foto tertentu).
  function handlePilihBatch(fileList: FileList | null) {
    setBatchError(null);
    if (!fileList || fileList.length === 0) return;
    let dipilih = Array.from(fileList);
    let melebihi = false;
    if (dipilih.length > 5) {
      dipilih = dipilih.slice(0, 5);
      melebihi = true;
    }
    // Kalau masih ada batch LAMA yg blm sempat diupload/dibatalkan, revoke
    // dulu preview URL-nya sblm diganti batch baru -- jangan bocor memori.
    batch.forEach((b) => URL.revokeObjectURL(b.previewUrl));
    // Default slot per foto = slot KOSONG pertama yg belum dipakai foto lain
    // dlm batch ini (biar user biasanya tinggal klik Upload tanpa perlu
    // atur slot manual) -- kalau semua slot kosong sudah "dipesan" foto
    // lain di batch, slot dibiarkan belum ditandai (null), user WAJIB
    // pilih manual (dicek di validasiBatch()).
    const slotDipakaiBatch = new Set<number>();
    const daftar: BatchFoto[] = dipilih.map((file) => {
      const slotKosong = SLOT_URUTAN.find((s) => !foto[s] && !slotDipakaiBatch.has(s));
      if (slotKosong !== undefined) slotDipakaiBatch.add(slotKosong);
      // Preview LANGSUNG dari file yg baru dipilih (client-side, tanpa
      // perlu upload dulu) -- permintaan user supaya petugas bisa lihat
      // isi fotonya, bukan cuma nama file, sebelum menandai slot & upload.
      return { file, slot: slotKosong ?? null, previewUrl: URL.createObjectURL(file) };
    });
    setBatch(daftar);
    setBatchError(melebihi ? "Maksimal 5 foto sekaligus -- foto selebihnya diabaikan." : null);
  }

  function ubahSlotBatch(index: number, slotBaru: number) {
    setBatch((prev) => prev.map((b, i) => (i === index ? { ...b, slot: slotBaru } : b)));
  }

  function hapusDariBatch(index: number) {
    setBatch((prev) => {
      const dihapus = prev[index];
      if (dihapus) URL.revokeObjectURL(dihapus.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  // Slot yg SUDAH dipilih foto LAIN dlm batch yg sama (bukan foto ke-`index`
  // ini sendiri) -- dipakai menonaktifkan opsi itu di dropdown foto ini,
  // supaya tidak mungkin 2 foto ditandai slot yang sama (validasi yg
  // diminta user).
  function slotTerpakaiFotoLain(index: number): Set<number> {
    return new Set(batch.filter((_, i) => i !== index).map((b) => b.slot).filter((s): s is number => s !== null));
  }

  async function handleUploadBatch() {
    setBatchError(null);
    if (batch.some((b) => b.slot === null)) {
      setBatchError("Pilih slot foto (Sebelum Berangkat/Sampai di Lokasi/dst) utk SETIAP foto yang dipilih.");
      return;
    }
    const slotDipilih = batch.map((b) => b.slot as number);
    if (new Set(slotDipilih).size !== slotDipilih.length) {
      setBatchError("Tidak boleh ada 2 foto ditandai slot identifikasi yang sama -- setiap foto wajib slot berbeda.");
      return;
    }
    setBatchBusy(true);
    try {
      for (const b of batch) {
        if (b.slot !== null) await handleUploadSlot(b.slot, b.file);
      }
      batch.forEach((b) => URL.revokeObjectURL(b.previewUrl));
      setBatch([]);
    } finally {
      setBatchBusy(false);
    }
  }

  const adaFoto = Object.values(foto).some((f) => f);

  return (
    <div className="rounded-md border border-line bg-paper/40 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-navy-900">{st.nomor_st}</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={tanggal}
            min={st.tanggal_mulai}
            max={st.tanggal_selesai}
            onChange={(e) => {
              setTanggal(e.target.value);
              muatFoto(e.target.value);
              batch.forEach((b) => URL.revokeObjectURL(b.previewUrl));
              setBatch([]);
              setBatchError(null);
            }}
            className="rounded-md border border-line px-2 py-1 text-[11px]"
          />
          <button
            type="button"
            onClick={handleUnduh}
            disabled={!adaFoto || busyUnduh}
            className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-40"
          >
            {busyUnduh ? "⏳ Menyiapkan..." : "🖨 Unduh PDF"}
          </button>
        </div>
      </div>

      {error && <p className="mt-1 text-[11px] text-rust-700">⚠ {error}</p>}
      {loading && <p className="mt-1 text-[11px] text-ink/40">Memuat...</p>}

      {!readOnly && (
        <div className="mt-2 rounded-md border border-dashed border-navy-300 bg-navy-700/5 p-2">
          <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] font-medium text-navy-700 hover:border-navy-400">
            📤 Pilih Beberapa Foto Sekaligus (maks 5)
            <input
              type="file"
              accept="image/jpeg,image/png"
              multiple
              className="hidden"
              disabled={batchBusy}
              onChange={(e) => {
                handlePilihBatch(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {batchError && <p className="mt-1.5 text-[11px] text-rust-700">⚠ {batchError}</p>}

          {batch.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {batch.map((b, i) => {
                const slotTerpakaiLain = slotTerpakaiFotoLain(i);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-white p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={b.previewUrl}
                      alt={b.file.name}
                      className="h-12 w-12 shrink-0 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink/70">{b.file.name}</span>
                    <select
                      value={b.slot ?? ""}
                      onChange={(e) => ubahSlotBatch(i, Number(e.target.value))}
                      disabled={batchBusy}
                      className="rounded-md border border-line px-1.5 py-1 text-[10px]"
                    >
                      <option value="" disabled>
                        -- Pilih Slot --
                      </option>
                      {SLOT_URUTAN.map((s) => (
                        <option key={s} value={s} disabled={slotTerpakaiLain.has(s)}>
                          {SLOT_LABELS[s]}
                          {foto[s] ? " (ganti foto lama)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => hapusDariBatch(i)}
                      disabled={batchBusy}
                      className="text-[10px] text-rust-700 underline disabled:opacity-50"
                    >
                      Batal
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={handleUploadBatch}
                disabled={batchBusy}
                className="w-full rounded-md bg-navy-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
              >
                {batchBusy ? "Mengupload..." : `Upload ${batch.length} Foto`}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {SLOT_URUTAN.map((slot) => {
          const f = foto[slot];
          return (
            <div key={slot} className="rounded-md border border-dashed border-line bg-white p-2 text-center">
              <p className="text-[10px] font-semibold text-ink/60">{SLOT_LABELS[slot]}</p>
              {f?.url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={SLOT_LABELS[slot]} className="mx-auto mt-1 h-20 w-full rounded object-cover" />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleHapusSlot(f.id)}
                      disabled={busySlot !== null}
                      className="mt-1 text-[10px] text-rust-700 underline disabled:opacity-50"
                    >
                      Hapus
                    </button>
                  )}
                </>
              ) : readOnly ? (
                <p className="mt-1 flex h-20 items-center justify-center rounded border border-line bg-paper/30 text-[10px] text-ink/30">
                  (kosong)
                </p>
              ) : (
                <label className="mt-1 flex h-20 cursor-pointer items-center justify-center rounded border border-line bg-paper/50 text-[10px] text-ink/40 hover:border-navy-400">
                  {busySlot === slot ? "Mengupload..." : "+ Upload"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    disabled={busySlot !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadSlot(slot, file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Kwitansi (1 per Surat Tugas) ----------
interface KwitansiRow {
  id: number;
  nominal: number;
  terbilang: string;
  untuk_perjalanan_dinas_pada: string;
  tanggal_spd: string;
  tanggal_kwitansi: string;
}
interface KwitansiSuratTugas {
  surat_tugas_id: number;
  nomor_st: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  kwitansi: KwitansiRow | null;
  // Dihitung server (jenis "penyisiran" saja -- lihat hitungKecamatanTugas
  // di lib/spjWilayahTugas.ts), null utk jenis "tetangga" (tetap manual).
  untuk_perjalanan_dinas_pada_otomatis: string | null;
}

function KwitansiSection({ token, jenis, onSessionExpired }: { token: string; jenis: Jenis; onSessionExpired: () => void }) {
  const [daftar, setDaftar] = useState<KwitansiSuratTugas[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const guard = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
        else setErrMsg(msg);
      }
    },
    [onSessionExpired]
  );

  const muat = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/spj/kwitansi", token);
      setDaftar(Array.isArray(data?.daftar) ? data.daftar : []);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoading(false);
    }
  }, [token, guard]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function handleUnduh(kwitansiId: number) {
    try {
      const res = await fetch(`/api/penyisiran/spj/kwitansi/${kwitansiId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Gagal (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // PAKAI elemen <a>+.click(), BUKAN window.open() langsung -- window.open()
      // yg dipanggil SESUDAH `await fetch()` selesai sering dianggap browser
      // (terutama Safari/iOS, kadang jg Chrome) BUKAN hasil klik langsung
      // pengguna (krn ada jeda async di antaranya), jadi popup-nya diblokir
      // DIAM-DIAM tanpa error apa pun -- persis gejala "tombol Unduh PDF tidak
      // menghasilkan apa-apa". Klik anchor sintetis TIDAK kena blokir ini.
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      guard(() => {
        throw e;
      });
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-navy-900">🧾 Kwitansi</p>
        <button
          type="button"
          onClick={muat}
          disabled={loading}
          className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-ink/50">
        Nominal diinput manual sesuai yang diterima. Terbilang tersarankan otomatis dari nominal, boleh diubah kalau
        perlu.
      </p>

      {errMsg && (
        <p className="mb-2 rounded-lg border border-rust-100 bg-rust-100/40 p-2 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-col gap-2">
        {daftar.map((st) => (
          <KwitansiBaris key={st.surat_tugas_id} st={st} token={token} jenis={jenis} onSaved={muat} onUnduh={handleUnduh} guard={guard} />
        ))}
        {daftar.length === 0 && !loading && (
          <p className="rounded-md border border-dashed border-line p-3 text-center text-[11px] text-ink/40">
            Belum ada Surat Tugas yang ditautkan ke Anda.
          </p>
        )}
      </div>
    </div>
  );
}

function KwitansiBaris({
  st,
  token,
  jenis,
  onSaved,
  onUnduh,
  guard,
}: {
  st: KwitansiSuratTugas;
  token: string;
  jenis: Jenis;
  onSaved: () => void;
  onUnduh: (kwitansiId: number) => void;
  guard: (fn: () => void) => void;
}) {
  const [edit, setEdit] = useState(!st.kwitansi);
  const [nominal, setNominal] = useState(st.kwitansi ? String(st.kwitansi.nominal) : "");
  const [terbilang, setTerbilang] = useState(st.kwitansi?.terbilang ?? "");
  // untukPerjalananDinasPada HANYA relevan/dipakai utk jenis "tetangga" --
  // jenis "penyisiran" pakai st.untuk_perjalanan_dinas_pada_otomatis
  // (dihitung server, read-only, sama pola dgn Visum).
  const [untukPerjalananDinasPada, setUntukPerjalananDinasPada] = useState(st.kwitansi?.untuk_perjalanan_dinas_pada ?? "");
  const [tanggalSpd, setTanggalSpd] = useState(st.kwitansi?.tanggal_spd ?? st.tanggal_mulai);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUnduh, setBusyUnduh] = useState(false);

  async function handleKlikUnduh() {
    if (!st.kwitansi) return;
    setBusyUnduh(true);
    try {
      await onUnduh(st.kwitansi.id);
    } finally {
      setBusyUnduh(false);
    }
  }

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const nominalNum = Number(nominal);
    if (!Number.isFinite(nominalNum) || nominalNum < 0) {
      setError("Nominal tidak valid.");
      return;
    }
    if (jenis === "tetangga" && !untukPerjalananDinasPada.trim()) {
      setError("Tujuan perjalanan dinas dalam kota wajib diisi.");
      return;
    }
    if (jenis === "penyisiran" && !st.untuk_perjalanan_dinas_pada_otomatis) {
      setError("Kecamatan wilayah tugas belum tertaut -- minta pengelola menautkan wilayah SLS Anda dulu.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/penyisiran/spj/kwitansi", token, {
        method: "POST",
        body: JSON.stringify({
          surat_tugas_id: st.surat_tugas_id,
          nominal: nominalNum,
          terbilang: terbilang.trim(),
          // untuk_perjalanan_dinas_pada cuma dipakai server utk jenis
          // "tetangga" -- jenis "penyisiran" SELALU dihitung ulang sendiri
          // di server (lihat app/api/penyisiran/spj/kwitansi/route.ts).
          untuk_perjalanan_dinas_pada: jenis === "tetangga" ? untukPerjalananDinasPada.trim() : undefined,
          tanggal_spd: tanggalSpd,
        }),
      });
      setEdit(false);
      onSaved();
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-paper/40 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-navy-900">{st.nomor_st}</span>
        <div className="flex items-center gap-2">
          {st.kwitansi && !edit && (
            <button
              type="button"
              onClick={handleKlikUnduh}
              disabled={busyUnduh}
              className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
            >
              {busyUnduh ? "⏳ Menyiapkan..." : "🖨 Unduh PDF"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEdit((v) => !v)}
            className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-ink/60 hover:border-navy-400"
          >
            {edit ? "Batal" : st.kwitansi ? "Ubah" : "Isi Kwitansi"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-ink/60">
        {formatTanggal(st.tanggal_mulai)} s/d {formatTanggal(st.tanggal_selesai)}
      </p>

      {!edit && st.kwitansi && (
        <p className="mt-1 text-[11px] text-ink/50">
          Rp {st.kwitansi.nominal.toLocaleString("id-ID")} -- {st.kwitansi.untuk_perjalanan_dinas_pada}
        </p>
      )}

      {edit && (
        <form onSubmit={handleSimpan} className="mt-2 space-y-2 rounded-md border border-line bg-white p-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-ink/50">Nominal (Rp)</label>
              <input
                type="number"
                min={0}
                value={nominal}
                onChange={(e) => setNominal(e.target.value)}
                placeholder="170000"
                className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-ink/50">Tanggal SPD</label>
              <input
                type="date"
                value={tanggalSpd}
                min={st.tanggal_mulai}
                max={st.tanggal_selesai}
                onChange={(e) => setTanggalSpd(e.target.value)}
                className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
              />
            </div>
          </div>
          {jenis === "penyisiran" ? (
            <div className="rounded-md border border-line bg-paper/40 p-2 text-[11px] text-ink/60">
              <p>
                Untuk perjalanan dinas dalam kota pada:{" "}
                {st.untuk_perjalanan_dinas_pada_otomatis ? (
                  <span className="font-medium text-navy-900">{st.untuk_perjalanan_dinas_pada_otomatis}</span>
                ) : (
                  <span className="font-medium text-rust-700">belum ada wilayah SLS yang ditautkan</span>
                )}
              </p>
              <p className="mt-1 text-[10px] text-ink/40">
                Otomatis diambil dari data alokasi wilayah tugas Anda di Perencanaan Lapangan -- bukan diketik manual.
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[10px] font-medium text-ink/50">
                Untuk Perjalanan Dinas Dalam Kota Pada (Kecamatan/Nagari Tujuan)
              </label>
              <input
                type="text"
                value={untukPerjalananDinasPada}
                onChange={(e) => setUntukPerjalananDinasPada(e.target.value)}
                placeholder="Contoh: Kubung"
                className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] font-medium text-ink/50">
              Terbilang (opsional, kosongkan utk otomatis dari nominal)
            </label>
            <input
              type="text"
              value={terbilang}
              onChange={(e) => setTerbilang(e.target.value)}
              placeholder="Otomatis dari nominal kalau dikosongkan"
              className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
            />
          </div>
          {error && <p className="text-[11px] text-rust-700">⚠ {error}</p>}
          <button
            type="submit"
            disabled={busy || (jenis === "penyisiran" && !st.untuk_perjalanan_dinas_pada_otomatis)}
            className="w-full rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {busy ? "Menyimpan..." : "Simpan Kwitansi"}
          </button>
        </form>
      )}
    </div>
  );
}

// ---------- Surat Keterangan Tidak Menggunakan Kendaraan Dinas (1 per ST) ----------
interface SuratKeteranganRow {
  id: number;
  tanggal_pelaksanaan: string;
}
interface SuratKeteranganSt {
  surat_tugas_id: number;
  nomor_st: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  surat_keterangan: SuratKeteranganRow | null;
  // Dihitung server (dari tanggal Laporan TERAKHIR milik petugas utk ST ini
  // -- lihat komentar hitungTanggalPelaksanaan di
  // app/api/penyisiran/spj/surat-keterangan/route.ts), null kalau petugas
  // belum pernah membuat Laporan sama sekali utk ST ini.
  tanggal_pelaksanaan_otomatis: string | null;
}

function SuratKeteranganSection({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [daftar, setDaftar] = useState<SuratKeteranganSt[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const guard = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
        else setErrMsg(msg);
      }
    },
    [onSessionExpired]
  );

  const muat = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/spj/surat-keterangan", token);
      setDaftar(Array.isArray(data?.daftar) ? data.daftar : []);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoading(false);
    }
  }, [token, guard]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function handleUnduh(id: number) {
    try {
      const res = await fetch(`/api/penyisiran/spj/surat-keterangan/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Gagal (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // PAKAI elemen <a>+.click(), BUKAN window.open() langsung -- window.open()
      // yg dipanggil SESUDAH `await fetch()` selesai sering dianggap browser
      // (terutama Safari/iOS, kadang jg Chrome) BUKAN hasil klik langsung
      // pengguna (krn ada jeda async di antaranya), jadi popup-nya diblokir
      // DIAM-DIAM tanpa error apa pun -- persis gejala "tombol Unduh PDF tidak
      // menghasilkan apa-apa". Klik anchor sintetis TIDAK kena blokir ini.
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      guard(() => {
        throw e;
      });
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-navy-900">🚫🚗 Surat Keterangan Tidak Pakai Kendaraan Dinas</p>
        <button
          type="button"
          onClick={muat}
          disabled={loading}
          className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-ink/50">
        Nama, NIP &amp; tanggal pelaksanaan terisi otomatis (tanggal diambil dari Laporan terakhir yang Anda buat utk Surat Tugas
        ybs) -- tinggal periksa lalu simpan.
      </p>

      {errMsg && (
        <p className="mb-2 rounded-lg border border-rust-100 bg-rust-100/40 p-2 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-col gap-2">
        {daftar.map((st) => (
          <SuratKeteranganBaris key={st.surat_tugas_id} st={st} token={token} onSaved={muat} onUnduh={handleUnduh} guard={guard} />
        ))}
        {daftar.length === 0 && !loading && (
          <p className="rounded-md border border-dashed border-line p-3 text-center text-[11px] text-ink/40">
            Belum ada Surat Tugas yang ditautkan ke Anda.
          </p>
        )}
      </div>
    </div>
  );
}

function SuratKeteranganBaris({
  st,
  token,
  onSaved,
  onUnduh,
  guard,
}: {
  st: SuratKeteranganSt;
  token: string;
  onSaved: () => void;
  onUnduh: (id: number) => void;
  guard: (fn: () => void) => void;
}) {
  const [edit, setEdit] = useState(!st.surat_keterangan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUnduh, setBusyUnduh] = useState(false);

  async function handleKlikUnduh() {
    if (!st.surat_keterangan) return;
    setBusyUnduh(true);
    try {
      await onUnduh(st.surat_keterangan.id);
    } finally {
      setBusyUnduh(false);
    }
  }

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!st.tanggal_pelaksanaan_otomatis) {
      setError(
        "Belum ada Laporan Perjalanan Dinas utk Surat Tugas ini -- buat Laporan dulu (menu Laporan) supaya tanggal pelaksanaan bisa dihitung otomatis."
      );
      return;
    }
    setBusy(true);
    try {
      // tanggal_pelaksanaan TIDAK dikirim -- server yg menghitung sendiri
      // dari tanggal Laporan terakhir (lihat route.ts), supaya tidak bisa
      // beda dgn yg ditampilkan di sini.
      await apiFetch("/api/penyisiran/spj/surat-keterangan", token, {
        method: "POST",
        body: JSON.stringify({ surat_tugas_id: st.surat_tugas_id }),
      });
      setEdit(false);
      onSaved();
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-paper/40 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-navy-900">{st.nomor_st}</span>
        <div className="flex items-center gap-2">
          {st.surat_keterangan && !edit && (
            <button
              type="button"
              onClick={handleKlikUnduh}
              disabled={busyUnduh}
              className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
            >
              {busyUnduh ? "⏳ Menyiapkan..." : "🖨 Unduh PDF"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEdit((v) => !v)}
            className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-ink/60 hover:border-navy-400"
          >
            {edit ? "Batal" : st.surat_keterangan ? "Ubah" : "Isi"}
          </button>
        </div>
      </div>
      <p className="mt-1 text-ink/60">
        {formatTanggal(st.tanggal_mulai)} s/d {formatTanggal(st.tanggal_selesai)}
      </p>

      {!edit && st.surat_keterangan && (
        <p className="mt-1 text-[11px] text-ink/50">Tanggal pelaksanaan: {formatTanggal(st.surat_keterangan.tanggal_pelaksanaan)}</p>
      )}

      {edit && (
        <form onSubmit={handleSimpan} className="mt-2 space-y-2 rounded-md border border-line bg-white p-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium text-ink/50">Tanggal Pelaksanaan (otomatis)</label>
            <p className="rounded-md border border-line bg-paper/60 px-2 py-1.5 text-xs">
              {st.tanggal_pelaksanaan_otomatis ? (
                formatTanggal(st.tanggal_pelaksanaan_otomatis)
              ) : (
                <span className="text-ink/40">Belum ada Laporan utk Surat Tugas ini</span>
              )}
            </p>
            <p className="mt-1 text-[10px] text-ink/40">Diambil dari tanggal Laporan terakhir yang Anda buat utk Surat Tugas ini.</p>
          </div>
          {error && <p className="text-[11px] text-rust-700">⚠ {error}</p>}
          <button
            type="submit"
            disabled={busy || !st.tanggal_pelaksanaan_otomatis}
            className="w-full rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {busy ? "Menyimpan..." : "Simpan"}
          </button>
        </form>
      )}
    </div>
  );
}
