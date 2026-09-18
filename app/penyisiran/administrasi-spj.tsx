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
// oleh petugas, lihat app/api/penyisiran/spj/surat-tugas/*). Kwitansi,
// Visum, Laporan, Dokumentasi, & Surat Keterangan MASIH "segera hadir" --
// menyusul di iterasi berikutnya (butuh template PDF yang sudah
// dikonfirmasi user, lihat catatan di commit ini).

import { useCallback, useEffect, useState } from "react";

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

const DOKUMEN_SEGERA_HADIR: { judul: string; keterangan: string }[] = [
  { judul: "Kwitansi", keterangan: "Template 1 halaman, terisi otomatis dari data Surat Tugas & Laporan." },
  { judul: "Visum", keterangan: "Rencana kunjungan (nagari & tanggal) -- data rencana, bukan realisasi." },
  {
    judul: "Laporan",
    keterangan: "Narasi bebas atau otomatis dari rekap identifikasi tab Penyisiran sesuai tanggal & petugas.",
  },
  { judul: "Dokumentasi", keterangan: "5 slot foto/hari (berangkat, sampai lokasi, mendata, pulang, sampai rumah)." },
  {
    judul: "Surat Keterangan Tidak Menggunakan Kendaraan Dinas",
    keterangan: "Terisi otomatis nama, NIP, dan tanggal pelaksanaan.",
  },
];

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

      {/* ---------- 5 dokumen lain -- segera hadir ---------- */}
      {DOKUMEN_SEGERA_HADIR.map((d) => (
        <div key={d.judul} className="rounded-lg border border-dashed border-line bg-white p-3 opacity-70">
          <p className="text-xs font-semibold text-navy-900">📝 {d.judul}</p>
          <p className="mt-1 text-[11px] text-ink/50">{d.keterangan}</p>
          <p className="mt-1.5 inline-block rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/40">
            🚧 Segera hadir
          </p>
        </div>
      ))}
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
