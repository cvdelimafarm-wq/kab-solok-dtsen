"use client";

// app/penyisiran/master-petugas.tsx
//
// Tab "Master Petugas" -- HANYA bisa diakses 4 nama tertentu (sama persis
// dgn tab "Manajemen Target", lihat lib/manajemenTargetAkses.ts). Login
// PAKAI ULANG sistem personal (nama + tanggal lahir, role token
// "penyisiran_petugas") yang SAMA dgn tab Penyisiran Usaha / Manajemen
// Target -- localStorage KEY SENGAJA sama persis dgn
// app/seruti/penyisiran-usaha.tsx (lihat komentar di manajemen-target.tsx
// utk alasan lengkapnya).
//
// Isi tab: perluasan data petugas yang SUDAH ADA (tabel
// petugas_penyisiran_akun, SAMA dgn yg dipakai tab Penyisiran
// Usaha/Identifikasi Jorong/Perencanaan Lapangan), bukan tabel baru --
// kolom tambahan: email, No. HP (kolom no_hp SUDAH ADA dari awal di tabel
// ini tapi baru DITAMPILKAN/bisa diedit di sini sekarang -- dipakai jg utk
// tombol kirim WA ke PML di tab Penyisiran Usaha, lihat komentar
// FloatBarRencanaBesok di app/penyisiran/page.tsx), alamat rumah (diisi
// MANUAL, bukan dari titik GPS login) DIPISAH jadi 3 kolom -- Kecamatan,
// Nagari, Alamat Detail (lihat migrasi
// 20260918_master_petugas_pisah_alamat.sql) -- status kepegawaian
// (Mitra/Organik), dan pengawas (dipilih dari petugas lain di tabel yg
// sama -- satu pengawas boleh membawahi banyak PPL). Lihat migrasi
// 20260918_master_petugas_kolom_dan_pengawas.sql &
// app/api/penyisiran/master-petugas/route.ts.
//
// Data ini dipakai jg utk export Excel "Pengawas/Pencacah per SUBSLS" di
// tab Perencanaan Lapangan (tombol di samping header "Identifikasi
// Wilayah Sampel SLS") -- lihat
// app/api/penyisiran/alokasi/export-subsls/route.ts.
//
// Header tabel di bawah pakai komponen bersama ExcelTh/useExcelTable
// (app/penyisiran/_shared/excel-table.tsx) -- tiap kolom bisa diurutkan
// (klik nama kolom) & difilter (klik "▾", checklist nilai unik) persis
// spt fitur Filter/Sort di header Excel.

import { useCallback, useEffect, useMemo, useState } from "react";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";
import { useExcelTable, ExcelTh } from "./_shared/excel-table";

// NILAI STRING INI HARUS PERSIS SAMA dgn TOKEN_KEY/NAMA_KEY/
// PETUGAS_ID_STORE_KEY/LAT_KEY/LNG_KEY di app/seruti/penyisiran-usaha.tsx
// (lihat manajemen-target.tsx utk penjelasan lengkap kenapa login dibagikan
// lintas tab).
const TOKEN_KEY = "penyisiran-petugas-login-token";
const NAMA_KEY = "penyisiran-petugas-login-nama";
const PETUGAS_ID_STORE_KEY = "penyisiran-petugas-login-id";
const LAT_KEY = "penyisiran-petugas-login-lat";
const LNG_KEY = "penyisiran-petugas-login-lng";

type StatusKepegawaian = "mitra" | "organik";

const STATUS_LABEL: Record<StatusKepegawaian, string> = {
  mitra: "Mitra",
  organik: "Organik",
};

// Jabatan (BARU, permintaan user) -- dipakai jg utk monitoring "PPL belum
// ada PML" & "PML belum ada PPL" (lihat MonitoringJabatanCard di bawah,
// dihitung CLIENT-SIDE dari kolom ini + pengawas_id yg sudah ada. PPL
// "belum ada PML" = jabatan ppl & aktif & (tidak py pengawas ATAU pengawas
// yg ditunjuk BUKAN berjabatan pml). PML "belum ada PPL" = jabatan pml &
// aktif & tidak ada PPL aktif yg pengawas_id-nya mengarah ke dia.
type Jabatan = "ppl" | "pml" | "kepala_kantor";

const JABATAN_LABEL: Record<Jabatan, string> = {
  ppl: "PPL",
  pml: "PML",
  kepala_kantor: "Kepala Kantor",
};

interface PetugasMaster {
  id: number;
  nama: string;
  aktif: boolean;
  email: string | null;
  no_hp: string | null;
  alamat_kecamatan: string | null;
  alamat_nagari: string | null;
  alamat_detail: string | null;
  status_kepegawaian: StatusKepegawaian | null;
  pengawas_id: number | null;
  pengawas_nama: string | null;
  jabatan: Jabatan | null;
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

export default function MasterPetugasTab() {
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
          Anda login sebagai <span className="font-semibold text-navy-900">{nama}</span>, tapi tab &ldquo;Master
          Petugas&rdquo; ini hanya bisa diakses oleh pengelola yang ditentukan.
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

  return <MasterPetugasPanel token={token} onSessionExpired={handleGantiAkun} />;
}

// Form login personal -- SAMA PERSIS pola & endpoint dgn LoginForm di
// manajemen-target.tsx / app/seruti/penyisiran-usaha.tsx.
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
      <p className="text-sm font-semibold text-navy-900">Master Petugas</p>
      <p className="mt-1 text-xs text-ink/60">
        Tab ini khusus pengelola -- masukkan nama lengkap dan tanggal lahir Anda (sama dengan login tab Penyisiran
        Usaha).
      </p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-2 text-left">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Nama Lengkap</label>
          <input
            list="nama-master-petugas-options"
            type="text"
            value={namaInput}
            onChange={(e) => setNamaInput(e.target.value)}
            placeholder="Ketik nama lengkap Anda"
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <datalist id="nama-master-petugas-options">
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

function MasterPetugasPanel({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [petugas, setPetugas] = useState<PetugasMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [cariNama, setCariNama] = useState("");
  const [showTambah, setShowTambah] = useState(false);
  // PIN BERSAMA utk tombol Aktifkan/Nonaktifkan semua baris -- endpoint yg
  // dipanggil (petugas-toggle-aktif) MEWAJIBKAN PIN ini di server terlepas
  // dari tab mana yg memanggilnya (lihat komentar di route itu), jadi UI di
  // sini tetap harus memintanya walau akses tab ini sendiri sudah dikunci
  // ke pengelola. Satu PIN dipakai utk SEMUA baris sekali diisi -- sama pola
  // dgn "Kelola Petugas Penyisiran" di tab Monitoring Petugas Penyisiran.
  const [pinAktif, setPinAktif] = useState("");
  const [busyToggleId, setBusyToggleId] = useState<number | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const loadPetugas = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/master-petugas", token);
      setPetugas(data.petugas ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        onSessionExpired();
        return;
      }
      setErrMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    loadPetugas();
  }, [loadPetugas]);

  async function simpanSatu(petugasId: number, fields: Record<string, string | number | null>) {
    await apiFetch("/api/penyisiran/master-petugas", token, {
      method: "PATCH",
      body: JSON.stringify({ petugas_id: petugasId, fields }),
    });
    setPetugas((prev) =>
      prev.map((p) => {
        if (p.id !== petugasId) return p;
        const next = { ...p, ...fields } as PetugasMaster;
        if ("pengawas_id" in fields) {
          const pid = fields.pengawas_id;
          next.pengawas_nama = pid == null ? null : prev.find((x) => x.id === pid)?.nama ?? null;
        }
        return next;
      })
    );
  }

  async function toggleAktif(petugasId: number, aktifBaru: boolean) {
    if (!pinAktif) {
      setErrMsg("Masukkan PIN dulu utk mengaktifkan/menonaktifkan akun.");
      return;
    }
    setBusyToggleId(petugasId);
    setErrMsg(null);
    try {
      await apiFetch("/api/penyisiran/petugas-toggle-aktif", token, {
        method: "PATCH",
        body: JSON.stringify({ petugas_id: petugasId, aktif: aktifBaru, pin: pinAktif }),
      });
      setPetugas((prev) => prev.map((p) => (p.id === petugasId ? { ...p, aktif: aktifBaru } : p)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        onSessionExpired();
        return;
      }
      setErrMsg(msg);
    } finally {
      setBusyToggleId(null);
    }
  }

  // Export seluruh "Daftar Petugas" jadi file Excel (.xlsx) -- fetch manual +
  // blob (bukan window.open langsung ke URL API) krn endpoint export butuh
  // header Authorization, pola SAMA dgn handleExportSubsls di
  // perencanaan-lapangan.tsx. Akses endpointnya sendiri jg dijaga di server
  // (lihat .../master-petugas/export/route.ts).
  async function handleExport() {
    setExportBusy(true);
    setExportErr(null);
    try {
      const res = await fetch("/api/penyisiran/master-petugas/export", {
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
      a.download = "daftar_petugas_master.xlsx";
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

  async function tambahPetugas(fields: Record<string, string | null>) {
    const data = await apiFetch("/api/penyisiran/master-petugas", token, {
      method: "POST",
      body: JSON.stringify(fields),
    });
    if (data?.petugas) {
      setPetugas((prev) =>
        [...prev, { ...data.petugas, pengawas_nama: null } as PetugasMaster].sort((a, b) => a.nama.localeCompare(b.nama))
      );
    } else {
      await loadPetugas();
    }
    setShowTambah(false);
  }

  // Daftar calon pengawas: sebaiknya cuma petugas berstatus "organik" (sesuai
  // permintaan pengelola), tapi kalau belum ada satu pun yg ditandai organik
  // (mis. data baru diisi bertahap), tampilkan semua petugas aktif supaya
  // dropdown tidak kosong & tetap bisa dipakai sambil data dilengkapi.
  const calonPengawasOrganik = petugas.filter((p) => p.status_kepegawaian === "organik");
  const daftarCalonPengawas = calonPengawasOrganik.length > 0 ? calonPengawasOrganik : petugas.filter((p) => p.aktif);

  // Kotak "Cari nama" cepat di atas tabel (search-as-you-type) TETAP ada di
  // samping filter Excel per-kolom -- keduanya menyaring bersamaan (AND):
  // ini utk pencarian cepat 1 kolom, filter header utk kombinasi nilai yg
  // lebih rumit/ persis spt Excel.
  const petugasSearched = cariNama.trim()
    ? petugas.filter((p) => p.nama.toLowerCase().includes(cariNama.trim().toLowerCase()))
    : petugas;

  const kolom = useMemo(
    () => [
      { key: "nama", label: "Nama Petugas", getValue: (p: PetugasMaster) => p.nama },
      { key: "status_akun", label: "Status Akun", getValue: (p: PetugasMaster) => (p.aktif ? "Aktif" : "Nonaktif") },
      { key: "email", label: "Email", getValue: (p: PetugasMaster) => p.email },
      { key: "no_hp", label: "No. HP", getValue: (p: PetugasMaster) => p.no_hp },
      { key: "alamat_kecamatan", label: "Kecamatan", getValue: (p: PetugasMaster) => p.alamat_kecamatan },
      { key: "alamat_nagari", label: "Nagari", getValue: (p: PetugasMaster) => p.alamat_nagari },
      { key: "alamat_detail", label: "Alamat Detail", getValue: (p: PetugasMaster) => p.alamat_detail },
      {
        key: "status_kepegawaian",
        label: "Status",
        getValue: (p: PetugasMaster) => (p.status_kepegawaian ? STATUS_LABEL[p.status_kepegawaian] : null),
      },
      {
        key: "jabatan",
        label: "Jabatan",
        getValue: (p: PetugasMaster) => (p.jabatan ? JABATAN_LABEL[p.jabatan] : null),
      },
      { key: "pengawas_nama", label: "Pengawas", getValue: (p: PetugasMaster) => p.pengawas_nama },
    ],
    []
  );
  const tabel = useExcelTable(petugasSearched, kolom, { key: "nama", dir: "asc" });

  // Monitoring kelengkapan jabatan PPL/PML (BARU, permintaan user) --
  // dihitung dari SELURUH daftar petugas yg sudah dimuat (bukan hasil
  // pencarian/filter tabel di bawah, supaya angkanya tetap utuh walau
  // sedang mencari/filter baris tertentu).
  //   - PPL belum ada PML: jabatan ppl, aktif, dan pengawasnya KOSONG atau
  //     pengawas yg ditunjuk BUKAN berjabatan pml.
  //   - PML belum ada PPL: jabatan pml, aktif, dan TIDAK ADA petugas
  //     berjabatan ppl aktif yg pengawas_id-nya mengarah ke dia.
  const byId = new Map(petugas.map((p) => [p.id, p]));
  const ppBelumAdaPml = petugas.filter((p) => {
    if (p.jabatan !== "ppl" || !p.aktif) return false;
    const pengawas = p.pengawas_id != null ? byId.get(p.pengawas_id) : null;
    return !pengawas || pengawas.jabatan !== "pml";
  });
  const pmlBelumAdaPpl = petugas.filter((p) => {
    if (p.jabatan !== "pml" || !p.aktif) return false;
    return !petugas.some((x) => x.aktif && x.jabatan === "ppl" && x.pengawas_id === p.id);
  });

  return (
    <div className="space-y-4 pb-16">
      <div>
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">Master Petugas</h1>
        <p className="mt-0.5 text-xs text-ink/50">
          Data kontak &amp; kepegawaian petugas, serta alokasi pengawas per petugas (PPL). Dipakai jg utk export Excel
          Pengawas/Pencacah di tab Perencanaan Lapangan.
        </p>
      </div>

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="rounded-lg border border-line bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-navy-900">🧭 Monitoring Kelengkapan Jabatan PPL/PML</p>
        <p className="mb-3 text-[11px] text-ink/50">
          Dihitung dari kolom &ldquo;Jabatan&rdquo; &amp; &ldquo;Pengawas&rdquo; pada tabel di bawah -- isi dulu kedua
          kolom itu utk tiap petugas supaya monitoring ini akurat.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-paper/40 p-2.5">
            <p className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-ink/60">PPL Belum Ada PML</span>
              <span className={`text-base font-bold ${ppBelumAdaPml.length > 0 ? "text-rust-700" : "text-moss-700"}`}>
                {ppBelumAdaPml.length}
              </span>
            </p>
            {ppBelumAdaPml.length === 0 ? (
              <p className="mt-1 text-[11px] text-moss-700">✅ Semua PPL aktif sudah punya PML.</p>
            ) : (
              <p className="mt-1 text-[11px] text-ink/70">{ppBelumAdaPml.map((p) => p.nama).join(", ")}</p>
            )}
          </div>
          <div className="rounded-md border border-line bg-paper/40 p-2.5">
            <p className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-ink/60">PML Belum Ada PPL</span>
              <span className={`text-base font-bold ${pmlBelumAdaPpl.length > 0 ? "text-rust-700" : "text-moss-700"}`}>
                {pmlBelumAdaPpl.length}
              </span>
            </p>
            {pmlBelumAdaPpl.length === 0 ? (
              <p className="mt-1 text-[11px] text-moss-700">✅ Semua PML aktif sudah punya PPL bawahan.</p>
            ) : (
              <p className="mt-1 text-[11px] text-ink/70">{pmlBelumAdaPpl.map((p) => p.nama).join(", ")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-navy-900">👤 Daftar Petugas ({petugas.length})</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={cariNama}
              onChange={(e) => setCariNama(e.target.value)}
              placeholder="Cari nama..."
              className="rounded-md border border-line px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={loadPetugas}
              disabled={loading}
              className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
            >
              {loading ? "Memuat..." : "↻ Muat Ulang"}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exportBusy}
              className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
            >
              {exportBusy ? "Menyiapkan..." : "⬇ Export Excel"}
            </button>
            <button
              type="button"
              onClick={() => setShowTambah((s) => !s)}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
                showTambah
                  ? "border border-line text-ink/60 hover:border-navy-400"
                  : "bg-navy-700 text-white hover:bg-navy-900"
              }`}
            >
              {showTambah ? "✕ Batal" : "+ Tambah Petugas"}
            </button>
          </div>
        </div>

        {exportErr && <p className="mb-2 text-[11px] text-rust-700">⚠ {exportErr}</p>}

        {showTambah && (
          <TambahPetugasForm onBatal={() => setShowTambah(false)} onSimpan={tambahPetugas} />
        )}

        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink/40">
          <p>
            Kolom otomatis tersimpan saat Anda pindah dari kolom yg diedit (onBlur / setelah memilih dropdown). Alamat
            diisi MANUAL (bukan dari titik GPS login). Klik nama kolom utk urutkan, klik &ldquo;▾&rdquo; utk filter.
          </p>
          {tabel.adaFilterAktif && (
            <button type="button" onClick={tabel.resetFilters} className="shrink-0 font-medium text-navy-700 hover:underline">
              Reset semua filter
            </button>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper/40 px-2.5 py-2">
          <input
            type="password"
            inputMode="numeric"
            value={pinAktif}
            onChange={(e) => setPinAktif(e.target.value)}
            placeholder="PIN utk Aktifkan/Nonaktifkan akun"
            className="w-56 rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <p className="text-[10px] text-ink/40">
            Isi PIN sekali di sini utk mengaktifkan tombol Aktifkan/Nonaktifkan pada tiap baris di kolom &ldquo;Status
            Akun&rdquo; di bawah.
          </p>
        </div>

        <div className="overflow-x-auto rounded-md border border-line">
          <table className="min-w-full text-xs">
            <thead className="bg-[#2563eb] text-[10px] font-semibold uppercase tracking-wide text-white">
              <tr>
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
                    variant="dark"
                    // Kolom "Nama Petugas" DIBEKUKAN (freeze, permintaan
                    // user) -- tetap kelihatan di kiri layar walau tabel
                    // digulir ke kanan (banyak kolom: Email/No.HP/Kecamatan/
                    // Nagari/Alamat Detail/Status/Pengawas). Latar SOLID
                    // warna gelap yg SAMA dgn header (bg-[#2563eb], bukan
                    // bg-paper spt sebelum tema disamakan) supaya kolom lain
                    // yg tergulir di baliknya tidak "tembus" & tetap
                    // menyatu dgn header gelap -- z-20 (lebih tinggi dari
                    // sel body z-10) spy dropdown filter Excel kolom lain
                    // tidak ketutup header beku ini.
                    className={k.key === "nama" ? "sticky left-0 z-20 border-r border-white/20 bg-[#2563eb]" : undefined}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {tabel.rows.map((p) => (
                <BarisMaster
                  key={p.id}
                  p={p}
                  daftarCalonPengawas={daftarCalonPengawas}
                  onSimpan={simpanSatu}
                  pinAktif={pinAktif}
                  busyToggleId={busyToggleId}
                  onToggleAktif={toggleAktif}
                />
              ))}
              {tabel.rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={kolom.length} className="px-3 py-4 text-center text-ink/40">
                    Tidak ada petugas yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BarisMaster({
  p,
  daftarCalonPengawas,
  onSimpan,
  pinAktif,
  busyToggleId,
  onToggleAktif,
}: {
  p: PetugasMaster;
  daftarCalonPengawas: PetugasMaster[];
  onSimpan: (id: number, fields: Record<string, string | number | null>) => Promise<void>;
  pinAktif: string;
  busyToggleId: number | null;
  onToggleAktif: (id: number, aktifBaru: boolean) => void;
}) {
  const [email, setEmail] = useState(p.email ?? "");
  const [noHp, setNoHp] = useState(p.no_hp ?? "");
  const [kecamatan, setKecamatan] = useState(p.alamat_kecamatan ?? "");
  const [nagari, setNagari] = useState(p.alamat_nagari ?? "");
  const [detail, setDetail] = useState(p.alamat_detail ?? "");
  const [status, setStatus] = useState<StatusKepegawaian | "">(p.status_kepegawaian ?? "");
  const [jabatan, setJabatan] = useState<Jabatan | "">(p.jabatan ?? "");
  const [pengawasId, setPengawasId] = useState<string>(p.pengawas_id != null ? String(p.pengawas_id) : "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");

  useEffect(() => {
    setEmail(p.email ?? "");
    setNoHp(p.no_hp ?? "");
    setKecamatan(p.alamat_kecamatan ?? "");
    setNagari(p.alamat_nagari ?? "");
    setDetail(p.alamat_detail ?? "");
    setStatus(p.status_kepegawaian ?? "");
    setJabatan(p.jabatan ?? "");
    setPengawasId(p.pengawas_id != null ? String(p.pengawas_id) : "");
  }, [
    p.email,
    p.no_hp,
    p.alamat_kecamatan,
    p.alamat_nagari,
    p.alamat_detail,
    p.status_kepegawaian,
    p.jabatan,
    p.pengawas_id,
  ]);

  async function simpan(fields: Record<string, string | number | null>) {
    setSaveStatus("saving");
    try {
      await onSimpan(p.id, fields);
      setSaveStatus("ok");
      setTimeout(() => setSaveStatus((s) => (s === "ok" ? "idle" : s)), 1500);
    } catch {
      setSaveStatus("err");
    }
  }

  // Petugas lain tidak boleh jadi pengawas kalau itu dirinya sendiri --
  // difilter di sini jg (server sudah menolak, tapi lebih baik tdk
  // ditawarkan sama sekali di dropdown).
  const opsiPengawas = daftarCalonPengawas.filter((x) => x.id !== p.id);

  return (
    <tr className="border-b border-line last:border-0">
      {/* Kolom "Nama" DIBEKUKAN (freeze) -- sticky left-0 + latar SOLID putih
          (harus opaque, bukan transparan) supaya kolom lain yg digulir ke
          kiri tidak "tembus" kelihatan di baliknya. z-10 (di bawah z-20
          header beku di atas) supaya header tetap menang saat scroll
          vertikal+horizontal bersamaan. */}
      <td className="sticky left-0 z-10 border-r border-line bg-white px-3 py-1.5 font-medium text-navy-900">
        {p.nama}
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className={
              p.aktif
                ? "rounded-full border border-moss-200 bg-moss-100/40 px-1.5 py-0.5 text-[9px] font-medium text-moss-700"
                : "rounded-full border border-line px-1.5 py-0.5 text-[9px] font-medium text-ink/40"
            }
          >
            {p.aktif ? "Aktif" : "Nonaktif"}
          </span>
          <button
            type="button"
            onClick={() => onToggleAktif(p.id, !p.aktif)}
            disabled={!pinAktif || busyToggleId === p.id}
            title={!pinAktif ? "Isi PIN dulu di atas tabel" : undefined}
            className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40 ${
              p.aktif
                ? "border border-rust-700 text-rust-700 hover:bg-rust-100/50"
                : "bg-moss-500 text-white hover:bg-moss-600"
            }`}
          >
            {busyToggleId === p.id ? "..." : p.aktif ? "Nonaktifkan" : "Aktifkan"}
          </button>
        </div>
      </td>
      <td className="px-3 py-1.5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => {
            if (email === (p.email ?? "")) return;
            simpan({ email: email.trim() === "" ? null : email.trim() });
          }}
          placeholder="nama@bps.go.id"
          className="w-44 rounded-md border border-line px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          inputMode="tel"
          value={noHp}
          onChange={(e) => setNoHp(e.target.value)}
          onBlur={() => {
            if (noHp === (p.no_hp ?? "")) return;
            simpan({ no_hp: noHp.trim() === "" ? null : noHp.trim() });
          }}
          placeholder="+62 8xx-xxxx-xxxx"
          className="w-36 rounded-md border border-line px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={kecamatan}
          onChange={(e) => setKecamatan(e.target.value)}
          onBlur={() => {
            if (kecamatan === (p.alamat_kecamatan ?? "")) return;
            simpan({ alamat_kecamatan: kecamatan.trim() === "" ? null : kecamatan.trim() });
          }}
          placeholder="Kecamatan"
          className="w-32 rounded-md border border-line px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={nagari}
          onChange={(e) => setNagari(e.target.value)}
          onBlur={() => {
            if (nagari === (p.alamat_nagari ?? "")) return;
            simpan({ alamat_nagari: nagari.trim() === "" ? null : nagari.trim() });
          }}
          placeholder="Nagari"
          className="w-32 rounded-md border border-line px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="text"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          onBlur={() => {
            if (detail === (p.alamat_detail ?? "")) return;
            simpan({ alamat_detail: detail.trim() === "" ? null : detail.trim() });
          }}
          placeholder="Alamat detail (jorong/jalan/dll)"
          className="w-56 rounded-md border border-line px-2 py-1 text-xs"
        />
      </td>
      <td className="px-3 py-1.5">
        <select
          value={status}
          onChange={(e) => {
            const v = (e.target.value || "") as StatusKepegawaian | "";
            setStatus(v);
            simpan({ status_kepegawaian: v === "" ? null : v });
          }}
          className="rounded-md border border-line px-2 py-1 text-xs"
        >
          <option value="">-- Belum diisi --</option>
          {(Object.keys(STATUS_LABEL) as StatusKepegawaian[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <select
          value={jabatan}
          onChange={(e) => {
            const v = (e.target.value || "") as Jabatan | "";
            setJabatan(v);
            simpan({ jabatan: v === "" ? null : v });
          }}
          className="rounded-md border border-line px-2 py-1 text-xs"
        >
          <option value="">-- Belum diisi --</option>
          {(Object.keys(JABATAN_LABEL) as Jabatan[]).map((j) => (
            <option key={j} value={j}>
              {JABATAN_LABEL[j]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <select
            value={pengawasId}
            onChange={(e) => {
              const v = e.target.value;
              setPengawasId(v);
              simpan({ pengawas_id: v === "" ? null : Number(v) });
            }}
            className="rounded-md border border-line px-2 py-1 text-xs"
          >
            <option value="">-- Tidak ada --</option>
            {opsiPengawas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nama}
              </option>
            ))}
          </select>
          {saveStatus === "saving" && <span className="text-[10px] text-ink/40">...</span>}
          {saveStatus === "ok" && <span className="text-[10px] text-moss-700">✓</span>}
          {saveStatus === "err" && <span className="text-[10px] text-rust-700">✕</span>}
        </div>
      </td>
    </tr>
  );
}

// Form "+ Tambah Petugas" -- menggantikan proses manual INSERT SQL langsung
// ke Supabase yg dipakai sblm endpoint POST /api/penyisiran/master-petugas
// ada. Nama Lengkap & Tanggal Lahir WAJIB (dipakai login personal, lihat
// komentar di route POST), field lain opsional & bisa dilengkapi belakangan
// lewat kolom2 yg sudah ada di tabel (email/No.HP/alamat/status/pengawas).
function TambahPetugasForm({
  onBatal,
  onSimpan,
}: {
  onBatal: () => void;
  onSimpan: (fields: Record<string, string | null>) => Promise<void>;
}) {
  const [nama, setNama] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState("");
  const [email, setEmail] = useState("");
  const [noHp, setNoHp] = useState("");
  const [nip, setNip] = useState("");
  const [kecamatan, setKecamatan] = useState("");
  const [nagari, setNagari] = useState("");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<StatusKepegawaian | "">("");
  const [jabatan, setJabatan] = useState<Jabatan | "">("");
  const [keterangan, setKeterangan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nama.trim()) {
      setError("Nama lengkap wajib diisi.");
      return;
    }
    if (!tanggalLahir) {
      setError("Tanggal lahir wajib diisi (dipakai utk login personal petugas).");
      return;
    }
    setSaving(true);
    try {
      await onSimpan({
        nama: nama.trim(),
        tanggal_lahir: tanggalLahir,
        email: email.trim() === "" ? null : email.trim(),
        no_hp: noHp.trim() === "" ? null : noHp.trim(),
        nip: nip.trim() === "" ? null : nip.trim(),
        alamat_kecamatan: kecamatan.trim() === "" ? null : kecamatan.trim(),
        alamat_nagari: nagari.trim() === "" ? null : nagari.trim(),
        alamat_detail: detail.trim() === "" ? null : detail.trim(),
        status_kepegawaian: status === "" ? null : status,
        jabatan: jabatan === "" ? null : jabatan,
        keterangan: keterangan.trim() === "" ? null : keterangan.trim(),
      });
      // Sukses -- onSimpan (tambahPetugas di parent) yg menutup form ini
      // (setShowTambah(false)), jadi tidak perlu reset state di sini.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-3 space-y-2 rounded-md border border-navy-200 bg-navy-50/30 p-3"
    >
      <p className="text-xs font-semibold text-navy-900">Tambah Petugas Baru</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/60">Nama Lengkap *</label>
          <input
            type="text"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            autoFocus
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/60">Tanggal Lahir *</label>
          <input
            type="date"
            value={tanggalLahir}
            onChange={(e) => setTanggalLahir(e.target.value)}
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/60">Status Kepegawaian</label>
          <select
            value={status}
            onChange={(e) => setStatus((e.target.value || "") as StatusKepegawaian | "")}
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          >
            <option value="">-- Belum diisi --</option>
            {(Object.keys(STATUS_LABEL) as StatusKepegawaian[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/60">Jabatan</label>
          <select
            value={jabatan}
            onChange={(e) => setJabatan((e.target.value || "") as Jabatan | "")}
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          >
            <option value="">-- Belum diisi --</option>
            {(Object.keys(JABATAN_LABEL) as Jabatan[]).map((j) => (
              <option key={j} value={j}>
                {JABATAN_LABEL[j]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/60">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@bps.go.id"
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/60">No. HP</label>
          <input
            type="text"
            inputMode="tel"
            value={noHp}
            onChange={(e) => setNoHp(e.target.value)}
            placeholder="+62 8xx-xxxx-xxxx"
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/60">NIP / Sobat ID</label>
          <input
            type="text"
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            placeholder="NIP (organik) / No. registrasi Sobat (mitra)"
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/60">Kecamatan</label>
          <input
            type="text"
            value={kecamatan}
            onChange={(e) => setKecamatan(e.target.value)}
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/60">Nagari</label>
          <input
            type="text"
            value={nagari}
            onChange={(e) => setNagari(e.target.value)}
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/60">Alamat Detail</label>
          <input
            type="text"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Jorong/jalan/dll"
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mb-1 block text-[10px] font-medium text-ink/60">Keterangan</label>
          <input
            type="text"
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            className="w-full rounded-md border border-line px-2.5 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
      </div>

      {error && <p className="text-xs text-rust-700">⚠ {error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
        >
          {saving ? "Menyimpan..." : "Simpan Petugas Baru"}
        </button>
        <button
          type="button"
          onClick={onBatal}
          disabled={saving}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-navy-400"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
