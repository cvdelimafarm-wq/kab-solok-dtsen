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
// Fitur Surat Tugas SUDAH JALAN PENUH (upload oleh pengelola + lihat/unduh
// oleh petugas, lihat app/api/penyisiran/spj/surat-tugas/*). Visum JUGA
// SUDAH JALAN (isi rencana tujuan + tanggal pelaksanaan per ST milik
// sendiri, lalu unduh PDF -- lihat app/api/penyisiran/spj/visum/* &
// lib/pdf/visum.ts). Kwitansi, Laporan, Dokumentasi, & Surat Keterangan
// MASIH "segera hadir" -- menyusul di iterasi berikutnya.

import { useCallback, useEffect, useState } from "react";
import { SLOT_LABELS, SLOT_URUTAN } from "@/lib/spjDokumentasi";

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

  async function handleUnduh(id: number) {
    try {
      const data = await apiFetch(`/api/penyisiran/spj/surat-tugas/${id}/file`, sesi.token);
      if (data?.url) window.open(data.url, "_blank", "noreferrer");
    } catch (e) {
      guard(() => {
        throw e;
      });
    }
  }

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
                <span className="font-semibold text-navy-900">{st.nomor_st}</span>
                <button
                  type="button"
                  onClick={() => handleUnduh(st.id)}
                  className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400"
                >
                  ⬇ Lihat/Unduh
                </button>
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

      {/* ---------- Visum -- SUDAH JALAN ---------- */}
      <VisumSection token={sesi.token} onSessionExpired={onSessionExpired} />

      {/* ---------- Laporan -- SUDAH JALAN ---------- */}
      <LaporanSection token={sesi.token} onSessionExpired={onSessionExpired} />

      {/* ---------- Dokumentasi -- SUDAH JALAN ---------- */}
      <DokumentasiSection token={sesi.token} onSessionExpired={onSessionExpired} />

      {/* ---------- Kwitansi -- SUDAH JALAN ---------- */}
      <KwitansiSection token={sesi.token} onSessionExpired={onSessionExpired} />

      {/* ---------- Surat Keterangan Tidak Menggunakan Kendaraan Dinas -- SUDAH JALAN ---------- */}
      <SuratKeteranganSection token={sesi.token} onSessionExpired={onSessionExpired} />
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
                {p.nama} <span className="text-ink/40">({p.jenis === "penyisiran" ? "Penyisiran" : "Tetangga"})</span>
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

function VisumSection({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [daftar, setDaftar] = useState<VisumSuratTugas[]>([]);
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
      const data = await apiFetch("/api/penyisiran/spj/visum", token);
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
        Isi RENCANA tujuan &amp; tanggal pelaksanaan per Surat Tugas Anda -- bukan realisasi. Setelah disimpan, unduh
        PDF Visum-nya utk kelengkapan SPJ.
      </p>

      {errMsg && (
        <p className="mb-2 rounded-lg border border-rust-100 bg-rust-100/40 p-2 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-col gap-2">
        {daftar.map((row) => (
          <VisumBaris key={row.surat_tugas_id} row={row} token={token} onSaved={muat} onUnduh={handleUnduh} guard={guard} />
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
  onSaved,
  onUnduh,
  guard,
}: {
  row: VisumSuratTugas;
  token: string;
  onSaved: () => void;
  onUnduh: (visumId: number) => void;
  guard: (fn: () => void) => void;
}) {
  const [edit, setEdit] = useState(!row.visum);
  const [rencanaTujuan, setRencanaTujuan] = useState(row.visum?.rencana_tujuan ?? "");
  const [tanggalPelaksanaan, setTanggalPelaksanaan] = useState(row.visum?.tanggal_berangkat ?? row.tanggal_mulai);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rencanaTujuan.trim() || !tanggalPelaksanaan) {
      setError("Rencana tujuan dan tanggal pelaksanaan wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/penyisiran/spj/visum", token, {
        method: "POST",
        body: JSON.stringify({
          surat_tugas_id: row.surat_tugas_id,
          rencana_tujuan: rencanaTujuan.trim(),
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
              onClick={() => onUnduh(row.visum!.id)}
              className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400"
            >
              🖨 Unduh PDF Visum
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
            disabled={busy}
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

function LaporanSection({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
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
        <p className="text-xs font-semibold text-navy-900">📝 Laporan</p>
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
        Satu Laporan per tanggal dlm rentang Surat Tugas. Mode "Template" menarik rekap otomatis dari tab Identifikasi
        Jorong/Tetangga pada tanggal itu -- kalau datanya belum sesuai, koreksi dulu di tab tersebut lalu buat ulang.
      </p>

      {errMsg && (
        <p className="mb-2 rounded-lg border border-rust-100 bg-rust-100/40 p-2 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-col gap-2">
        {daftar.map((st) => (
          <LaporanStCard key={st.surat_tugas_id} st={st} token={token} onSaved={muat} onUnduh={handleUnduh} guard={guard} />
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
}: {
  st: LaporanSuratTugas;
  token: string;
  onSaved: () => void;
  onUnduh: (laporanId: number) => void;
  guard: (fn: () => void) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="rounded-md border border-line bg-paper/40 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-navy-900">{st.nomor_st}</span>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-ink/60 hover:border-navy-400"
        >
          {showForm ? "Batal" : "+ Tambah Laporan"}
        </button>
      </div>
      <p className="mt-1 text-ink/60">
        {formatTanggal(st.tanggal_mulai)} s/d {formatTanggal(st.tanggal_selesai)}
      </p>

      {showForm && (
        <LaporanForm
          st={st}
          token={token}
          onDone={() => {
            setShowForm(false);
            onSaved();
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
              onClick={() => onUnduh(l.id)}
              className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400"
            >
              🖨 Unduh PDF
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

function LaporanForm({
  st,
  token,
  onDone,
  guard,
}: {
  st: LaporanSuratTugas;
  token: string;
  onDone: () => void;
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
      onDone();
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

function DokumentasiSection({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
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
        <p className="text-xs font-semibold text-navy-900">📷 Dokumentasi</p>
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
        Maksimal 5 foto/hari per Surat Tugas -- pilih tanggal, lalu upload foto ke slot yang sesuai. Setelah lengkap,
        unduh PDF Lampiran Dokumentasi-nya.
      </p>

      {errMsg && (
        <p className="mb-2 rounded-lg border border-rust-100 bg-rust-100/40 p-2 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-col gap-2">
        {daftar.map((st) => (
          <DokumentasiStCard key={st.surat_tugas_id} st={st} token={token} guard={guard} />
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

function DokumentasiStCard({ st, token, guard }: { st: DokumentasiSt; token: string; guard: (fn: () => void) => void }) {
  const [tanggal, setTanggal] = useState(() => tanggalHariIniKlem(st.tanggal_mulai, st.tanggal_selesai));
  const [foto, setFoto] = useState<Record<number, DokumentasiFotoSlot | null>>({});
  const [loading, setLoading] = useState(false);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            }}
            className="rounded-md border border-line px-2 py-1 text-[11px]"
          />
          <button
            type="button"
            onClick={handleUnduh}
            disabled={!adaFoto}
            className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-40"
          >
            🖨 Unduh PDF
          </button>
        </div>
      </div>

      {error && <p className="mt-1 text-[11px] text-rust-700">⚠ {error}</p>}
      {loading && <p className="mt-1 text-[11px] text-ink/40">Memuat...</p>}

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
                  <button
                    type="button"
                    onClick={() => handleHapusSlot(f.id)}
                    disabled={busySlot !== null}
                    className="mt-1 text-[10px] text-rust-700 underline disabled:opacity-50"
                  >
                    Hapus
                  </button>
                </>
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
}

function KwitansiSection({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
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
          <KwitansiBaris key={st.surat_tugas_id} st={st} token={token} onSaved={muat} onUnduh={handleUnduh} guard={guard} />
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
  onSaved,
  onUnduh,
  guard,
}: {
  st: KwitansiSuratTugas;
  token: string;
  onSaved: () => void;
  onUnduh: (kwitansiId: number) => void;
  guard: (fn: () => void) => void;
}) {
  const [edit, setEdit] = useState(!st.kwitansi);
  const [nominal, setNominal] = useState(st.kwitansi ? String(st.kwitansi.nominal) : "");
  const [terbilang, setTerbilang] = useState(st.kwitansi?.terbilang ?? "");
  const [untukPerjalananDinasPada, setUntukPerjalananDinasPada] = useState(st.kwitansi?.untuk_perjalanan_dinas_pada ?? "");
  const [tanggalSpd, setTanggalSpd] = useState(st.kwitansi?.tanggal_spd ?? st.tanggal_mulai);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const nominalNum = Number(nominal);
    if (!Number.isFinite(nominalNum) || nominalNum < 0) {
      setError("Nominal tidak valid.");
      return;
    }
    if (!untukPerjalananDinasPada.trim()) {
      setError("Tujuan perjalanan dinas dalam kota wajib diisi.");
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
          untuk_perjalanan_dinas_pada: untukPerjalananDinasPada.trim(),
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
              onClick={() => onUnduh(st.kwitansi!.id)}
              className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400"
            >
              🖨 Unduh PDF
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
            disabled={busy}
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
      <p className="mb-2 text-[11px] text-ink/50">Nama &amp; NIP terisi otomatis dari akun Anda -- tinggal pilih tanggal pelaksanaan.</p>

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
  const [tanggalPelaksanaan, setTanggalPelaksanaan] = useState(st.surat_keterangan?.tanggal_pelaksanaan ?? st.tanggal_mulai);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSimpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tanggalPelaksanaan) {
      setError("Tanggal pelaksanaan wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/penyisiran/spj/surat-keterangan", token, {
        method: "POST",
        body: JSON.stringify({ surat_tugas_id: st.surat_tugas_id, tanggal_pelaksanaan: tanggalPelaksanaan }),
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
              onClick={() => onUnduh(st.surat_keterangan!.id)}
              className="rounded-md border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400"
            >
              🖨 Unduh PDF
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
            <label className="mb-1 block text-[10px] font-medium text-ink/50">Tanggal Pelaksanaan</label>
            <input
              type="date"
              value={tanggalPelaksanaan}
              min={st.tanggal_mulai}
              max={st.tanggal_selesai}
              onChange={(e) => setTanggalPelaksanaan(e.target.value)}
              className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
            />
          </div>
          {error && <p className="text-[11px] text-rust-700">⚠ {error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {busy ? "Menyimpan..." : "Simpan"}
          </button>
        </form>
      )}
    </div>
  );
}
