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
      { key: "pengawas_nama", label: "Pengawas", getValue: (p: PetugasMaster) => p.pengawas_nama },
    ],
    []
  );
  const tabel = useExcelTable(petugasSearched, kolom, { key: "nama", dir: "asc" });

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
          </div>
        </div>

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

        <div className="overflow-x-auto rounded-md border border-line">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-line bg-paper/60 text-[10px] font-semibold uppercase tracking-wide text-ink/50">
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
                    // Kolom "Nama Petugas" DIBEKUKAN (freeze, permintaan
                    // user) -- tetap kelihatan di kiri layar walau tabel
                    // digulir ke kanan (banyak kolom: Email/No.HP/Kecamatan/
                    // Nagari/Alamat Detail/Status/Pengawas). Latar SOLID
                    // (bg-paper, bukan bg-paper/60 spt baris header lainnya)
                    // supaya kolom lain yg tergulir di baliknya tidak
                    // "tembus" -- z-20 (lebih tinggi dari sel body z-10) spy
                    // dropdown filter Excel kolom lain tidak ketutup header
                    // beku ini.
                    className={k.key === "nama" ? "sticky left-0 z-20 border-r border-line bg-paper" : undefined}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {tabel.rows.map((p) => (
                <BarisMaster key={p.id} p={p} daftarCalonPengawas={daftarCalonPengawas} onSimpan={simpanSatu} />
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
}: {
  p: PetugasMaster;
  daftarCalonPengawas: PetugasMaster[];
  onSimpan: (id: number, fields: Record<string, string | number | null>) => Promise<void>;
}) {
  const [email, setEmail] = useState(p.email ?? "");
  const [noHp, setNoHp] = useState(p.no_hp ?? "");
  const [kecamatan, setKecamatan] = useState(p.alamat_kecamatan ?? "");
  const [nagari, setNagari] = useState(p.alamat_nagari ?? "");
  const [detail, setDetail] = useState(p.alamat_detail ?? "");
  const [status, setStatus] = useState<StatusKepegawaian | "">(p.status_kepegawaian ?? "");
  const [pengawasId, setPengawasId] = useState<string>(p.pengawas_id != null ? String(p.pengawas_id) : "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "ok" | "err">("idle");

  useEffect(() => {
    setEmail(p.email ?? "");
    setNoHp(p.no_hp ?? "");
    setKecamatan(p.alamat_kecamatan ?? "");
    setNagari(p.alamat_nagari ?? "");
    setDetail(p.alamat_detail ?? "");
    setStatus(p.status_kepegawaian ?? "");
    setPengawasId(p.pengawas_id != null ? String(p.pengawas_id) : "");
  }, [p.email, p.no_hp, p.alamat_kecamatan, p.alamat_nagari, p.alamat_detail, p.status_kepegawaian, p.pengawas_id]);

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
        <span
          className={
            p.aktif
              ? "rounded-full border border-moss-100 bg-moss-100/40 px-1.5 py-0.5 text-[9px] font-medium text-moss-700"
              : "rounded-full border border-line px-1.5 py-0.5 text-[9px] font-medium text-ink/40"
          }
        >
          {p.aktif ? "Aktif" : "Nonaktif"}
        </span>
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
