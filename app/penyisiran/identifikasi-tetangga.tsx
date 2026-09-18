"use client";

// app/penyisiran/identifikasi-tetangga.tsx
//
// Tab "Identifikasi Tetangga/Lainnya" -- PERSIS SAMA cara kerjanya dgn
// tab "Identifikasi Jorong" (app/penyisiran/identifikasi-jorong.tsx):
// login personal nama+tanggal lahir, filter kartu manual Kecamatan ->
// Nagari -> Sub SLS (bukan auto-scope), kartu Ada/Tidak Ada/Ragu, bar
// float navigasi status, dan setiap jawaban ikut menandai siapa yang
// mengisi (identifikasi_ppl_oleh).
//
// SATU-SATUNYA beda dari Identifikasi Jorong: sumber informasinya.
// Identifikasi Jorong = petugas penyisiran yang menyisir langsung ke
// lapangan; di sini = tetangga/pihak lain yang mengetahui keluarga tsb
// (login personal ke tabel tetangga_akun, role "identifikasi_tetangga",
// TERPISAH dari ppl_akun maupun petugas_penyisiran_akun -- lihat migrasi
// supabase/migrations/20260918_tetangga_akun.sql dan komentar role
// "identifikasi_tetangga" di lib/penyisiranAuth.ts).
//
// Hasil isian DI SINI menulis ke kolom yang SAMA PERSIS dgn Identifikasi
// PPL/Jorong (penyisiran_usaha.identifikasi_ppl) -- jadi otomatis muncul
// juga sbg badge read-only di tab Penyisiran Usaha, tanpa perlu
// sinkronisasi tambahan apa pun.

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "identifikasi-tetangga-login-token";
const NAMA_KEY = "identifikasi-tetangga-login-nama";

type NilaiIdentifikasi = "belum" | "ada" | "tidak_ada" | "ragu";

const PILIHAN: { nilai: NilaiIdentifikasi; label: string; className: string }[] = [
  { nilai: "ada", label: "Ada", className: "bg-moss-500 text-white" },
  { nilai: "tidak_ada", label: "Tidak Ada", className: "bg-rust-500 text-white" },
  { nilai: "ragu", label: "Ragu-ragu", className: "bg-[#8A6A12] text-white" },
];

const KARTU_META: Record<NilaiIdentifikasi, string> = {
  belum: "bg-white",
  ada: "bg-moss-100",
  tidak_ada: "bg-rust-100",
  ragu: "bg-[#FCEFD1]",
};

const BAR_META: Record<NilaiIdentifikasi, { label: string; warna: string }> = {
  belum: { label: "Belum Identifikasi", warna: "text-ink/50" },
  tidak_ada: { label: "Tidak Ada Usaha", warna: "text-rust-700" },
  ragu: { label: "Ragu-Ragu", warna: "text-[#8A6A12]" },
  ada: { label: "Ada Usaha", warna: "text-moss-700" },
};

// Jumlah Jorong/Sub SLS yg disarankan jadi target konfirmasi (sesuai
// potensi kasus terbanyak di kecamatan terpilih) -- HARUS sama dgn
// TOP_N di app/api/penyisiran/jorong-top/route.ts, krn nilai ini cuma
// dipakai utk teks banner, isi daftarnya sendiri sudah dibatasi di server.
const JUMLAH_TARGET_JORONG = 8;

// Sama persis dgn ringkasWilayah di app/seruti/penyisiran-usaha.tsx,
// app/penyisiran/identifikasi-ppl.tsx, & identifikasi-jorong.tsx -- lihat
// komentar di sana. Alamat sering sudah memuat nama Jorong/SLS di
// dalamnya sendiri, jadi baris kedua ("Nagari · Nama SLS") tidak perlu
// mengulang nama yg sama.
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
  label: string;
  jumlah: number;
}
// Item saran "Target Konfirmasi Jorong" -- kombinasi Nagari+Jorong (Sub
// SLS) dgn jumlah potensi kasus terbanyak DI DALAM kecamatan yg sedang
// dipilih, lihat app/api/penyisiran/jorong-top/route.ts. label sudah
// gabungan "Nagari · Jorong" dari server, jadi tinggal ditampilkan.
interface TopJorongItem {
  idsubsls: string;
  nagari_kode: string | null;
  nagari_nama: string | null;
  label: string;
  jumlah: number;
}
interface Row {
  kode_identitas: string;
  kec_kode: string | null;
  kec_nama: string | null;
  nagari_kode: string | null;
  nagari_nama: string | null;
  sls_nama: string | null;
  nama_kk: string | null;
  nama_anggota_keluarga: string | null;
  alamat: string | null;
  identifikasi_ppl: NilaiIdentifikasi;
  identifikasi_ppl_at: string | null;
  identifikasi_ppl_oleh: string | null;
}

// Sama dgn namaTampilRow di app/seruti/penyisiran-usaha.tsx & di
// identifikasi-jorong.tsx -- utamakan nama gabungan anggota keluarga,
// baru pakai nama kepala keluarga sbg cadangan.
function namaTampilRow(row: Row): string {
  return row.nama_anggota_keluarga || row.nama_kk || "(tanpa nama)";
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
  if (!Number.isFinite(exp) || exp < Date.now()) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAMA_KEY);
    return null;
  }
  return t;
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAMA_KEY);
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

export default function IdentifikasiTetanggaTab() {
  const [token, setToken] = useState<string | null>(null);
  const [nama, setNama] = useState<string | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    setToken(getToken());
    setNama(typeof window !== "undefined" ? localStorage.getItem(NAMA_KEY) : null);
    setCheckedStorage(true);
  }, []);

  function handleLoggedIn(t: string, n: string) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(NAMA_KEY, n);
    setToken(t);
    setNama(n);
  }

  function handleLogout() {
    clearToken();
    setToken(null);
    setNama(null);
  }

  if (!checkedStorage) return null;

  if (!token) {
    return <LoginForm onLoggedIn={handleLoggedIn} />;
  }

  return (
    <IdentifikasiTetanggaPanel
      token={token}
      nama={nama || ""}
      onSessionExpired={handleLogout}
      onLogout={handleLogout}
    />
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (token: string, nama: string) => void }) {
  const [namaOptions, setNamaOptions] = useState<string[]>([]);
  const [namaInput, setNamaInput] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/penyisiran/tetangga-names")
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
      const res = await fetch("/api/penyisiran/tetangga-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama: namaInput, tanggal_lahir: tanggalLahir }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Login gagal.");
        return;
      }
      onLoggedIn(data.token, data.nama);
    } catch {
      setError("Gagal terhubung. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
      <p className="text-sm font-semibold text-navy-900">Identifikasi Tetangga/Lainnya</p>
      <p className="mt-1 text-xs text-ink/60">
        Untuk tetangga/pihak lain yang mengetahui keluarga bersangkutan -- masukkan nama lengkap dan tanggal lahir
        Anda. Setelah berhasil, Anda tidak perlu login ulang besok.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-2 text-left">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Nama Lengkap</label>
          <input
            list="nama-tetangga-options"
            type="text"
            value={namaInput}
            onChange={(e) => setNamaInput(e.target.value)}
            placeholder="Ketik nama lengkap Anda"
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <datalist id="nama-tetangga-options">
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

function IdentifikasiTetanggaPanel({
  token,
  nama,
  onSessionExpired,
  onLogout,
}: {
  token: string;
  nama: string;
  onSessionExpired: () => void;
  onLogout: () => void;
}) {
  const [kecOptions, setKecOptions] = useState<KecOption[]>([]);
  const [nagariOptions, setNagariOptions] = useState<KecOption[]>([]);
  const [subslsOptions, setSubslsOptions] = useState<SubslsOption[]>([]);
  const [filterKec, setFilterKec] = useState("");
  const [filterNagari, setFilterNagari] = useState("");
  const [filterSubsls, setFilterSubsls] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [topJorong, setTopJorong] = useState<TopJorongItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const pageSize = 200;

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

  // Dropdown filter tahap 1: Kecamatan -- daftar diambil dari
  // /api/penyisiran/summary (dipakai bersama tab Penyisiran Usaha).
  useEffect(() => {
    apiFetch("/api/penyisiran/summary", token)
      .then((d) => setKecOptions(d?.kecamatan ?? []))
      .catch((e) => guard(() => { throw e; }));
  }, [token, guard]);

  // Dropdown filter tahap 2: Nagari -- baru muncul setelah Kecamatan dipilih.
  // CATATAN: dulu ada setFilterNagari("") di sini juga -- dipindah ke
  // onChange select Kecamatan (lihat bawah), krn kalau resetnya masih di
  // effect ini, klik saran "Target Konfirmasi Jorong" (handleLoncatJorong,
  // yg set Nagari+Sub SLS sekaligus tanpa mengubah Kecamatan) tidak akan
  // memicu effect ini (dependency filterKec tidak berubah) TAPI effect
  // Sub SLS di bawah tetap terpicu oleh perubahan filterNagari -- supaya
  // effect itu tidak balik mereset Sub SLS yg baru saja diisi, resetnya
  // juga harus keluar dari sana. Effect ini SEKARANG cuma tugas memuat
  // opsi, tidak lagi ikut mengubah filter.
  useEffect(() => {
    if (!filterKec) {
      setNagariOptions([]);
      return;
    }
    apiFetch(`/api/penyisiran/nagari?kec=${encodeURIComponent(filterKec)}`, token)
      .then(setNagariOptions)
      .catch((e) => guard(() => { throw e; }));
  }, [filterKec, token, guard]);

  // Dropdown filter tahap 3: Sub SLS/Jorong -- baru muncul setelah
  // Kecamatan & Nagari dipilih (WAJIB kirim keduanya, lihat komentar di
  // app/api/penyisiran/subsls/route.ts). Sama seperti effect Nagari di
  // atas -- reset Sub SLS dipindah ke onChange select Nagari, effect ini
  // cuma memuat opsi supaya handleLoncatJorong bisa set Nagari+Sub SLS
  // berbarengan tanpa diclobber balik ke "".
  useEffect(() => {
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

  // Saran "Target Konfirmasi Jorong" -- muncul begitu Kecamatan dipilih
  // (lihat app/api/penyisiran/jorong-top/route.ts). Diminta user: daftar
  // ini harus sudah tampil SESAAT setelah klik dropdown Kecamatan, jadi
  // dimuat langsung di sini, bukan menunggu Nagari/Sub SLS ikut dipilih.
  useEffect(() => {
    if (!filterKec) {
      setTopJorong([]);
      return;
    }
    apiFetch(`/api/penyisiran/jorong-top?kec=${encodeURIComponent(filterKec)}`, token)
      .then(setTopJorong)
      .catch((e) => guard(() => { throw e; }));
  }, [filterKec, token, guard]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

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
      const data = await apiFetch(`/api/penyisiran/tetangga-list?${sp.toString()}`, token);
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

  function refreshAfterEdit(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.kode_identitas === id ? { ...r, ...patch } : r)));
  }

  // Diklik dari daftar saran "Target Konfirmasi Jorong" -- set Nagari &
  // Sub SLS SEKALIGUS ke kombinasi yg dipilih (Kecamatan tidak perlu
  // diubah lagi krn daftar saran ini memang sudah scoped ke Kecamatan yg
  // sedang aktif). Aman dari efek reset otomatis krn reset-nya sudah
  // dipindah ke onChange select, bukan lagi di useEffect (lihat komentar
  // di atas).
  function handleLoncatJorong(item: TopJorongItem) {
    setFilterNagari(item.nagari_kode || "");
    setFilterSubsls(item.idsubsls);
  }

  function jumpKeStatus(nilai: NilaiIdentifikasi) {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(`[data-identifikasi-ppl="${nilai}"]`));
    if (cards.length === 0) return;
    const batasAtas = window.scrollY + 96;
    const berikutnya = cards.find((el) => el.getBoundingClientRect().top + window.scrollY > batasAtas);
    (berikutnya ?? cards[0]).scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const jumlahIdentifikasi = (Object.keys(BAR_META) as NilaiIdentifikasi[]).reduce(
    (acc, k) => ({ ...acc, [k]: rows.filter((r) => r.identifikasi_ppl === k).length }),
    {} as Record<NilaiIdentifikasi, number>
  );
  const jumlahSudahDiisi = rows.length - (jumlahIdentifikasi.belum ?? 0);
  const persenSelesai = rows.length > 0 ? Math.round((jumlahSudahDiisi / rows.length) * 100) : 0;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3 pb-28">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">Identifikasi Tetangga/Lainnya</h1>
        <button
          type="button"
          onClick={onLogout}
          className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700"
        >
          Keluar
        </button>
      </div>

      <div className="rounded-lg border border-[#F4D77A] bg-[#FCEFD1] p-3">
        <p className="text-xs font-medium text-[#8A6A12] sm:text-sm">
          Sebagai <span className="font-semibold">{nama}</span>, konfirmasi berdasarkan pengetahuan Anda sebagai
          tetangga/pihak lain: apakah keluarga berikut memiliki usaha atau tidak?
        </p>
      </div>

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <select
          value={filterKec}
          onChange={(e) => {
            // Ganti Kecamatan -> Nagari & Sub SLS yg lama sudah tidak
            // relevan, reset di sini (bukan di useEffect, lihat komentar
            // di effect Nagari/Sub SLS di atas).
            setFilterKec(e.target.value);
            setFilterNagari("");
            setFilterSubsls("");
          }}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          <option value="">Pilih Kecamatan...</option>
          {kecOptions.map((k) => (
            <option key={k.kode} value={k.kode}>
              {k.nama} ({k.jumlah})
            </option>
          ))}
        </select>
        <select
          value={filterNagari}
          onChange={(e) => {
            // Ganti Nagari -> Sub SLS yg lama sudah tidak relevan, reset
            // di sini (bukan di useEffect, lihat komentar di atas).
            setFilterNagari(e.target.value);
            setFilterSubsls("");
          }}
          disabled={!filterKec}
          className="rounded-md border border-line px-2 py-1.5 text-xs disabled:opacity-40"
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
          className="rounded-md border border-line px-2 py-1.5 text-xs disabled:opacity-40"
        >
          <option value="">Semua Sub SLS/Jorong</option>
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
          <option value="">Semua Jawaban</option>
          <option value="belum">Belum diisi</option>
          <option value="ada">Ada</option>
          <option value="tidak_ada">Tidak Ada</option>
          <option value="ragu">Ragu-ragu</option>
        </select>
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari nama / ID / alamat..."
          className="min-w-[160px] flex-1 rounded-md border border-line px-2 py-1.5 text-xs"
        />
      </div>

      {filterKec && topJorong.length > 0 && (
        <div className="rounded-lg border border-[#F4D77A] bg-[#FCEFD1] p-3">
          <p className="text-xs font-medium text-[#8A6A12] sm:text-sm">
            🎯 Target konfirmasi: <span className="font-semibold">{JUMLAH_TARGET_JORONG} Jorong/Sub SLS</span>{" "}
            dengan jumlah potensi kasus terbanyak di kecamatan ini. Cek daftarnya di bawah -- klik salah satu untuk
            langsung mengaktifkan filter ke Jorong tersebut.
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {topJorong.map((item, idx) => {
              const aktif = filterSubsls === item.idsubsls;
              return (
                <button
                  key={item.idsubsls}
                  type="button"
                  onClick={() => handleLoncatJorong(item)}
                  className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
                    aktif
                      ? "border-[#8A6A12] bg-[#8A6A12] text-white"
                      : "border-[#F4D77A] bg-white text-[#8A6A12] hover:bg-[#FCEFD1]"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        aktif ? "bg-white/20" : "bg-[#F4D77A]/60"
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <span className="min-w-0 truncate font-medium">{item.label}</span>
                  </span>
                  <span className={`shrink-0 text-[11px] font-semibold ${aktif ? "text-white" : "text-[#8A6A12]"}`}>
                    {item.jumlah} kasus
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="text-xs text-ink/50">
          {!bisaMuat
            ? "Pilih kecamatan (atau isi pencarian) dulu untuk memuat daftar."
            : loading
              ? "Memuat..."
              : `${total} keluarga`}
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <IdentifikasiCard
              key={row.kode_identitas}
              row={row}
              token={token}
              onSaved={refreshAfterEdit}
              onSessionExpired={onSessionExpired}
            />
          ))}
          {rows.length === 0 && !loading && bisaMuat && (
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

      <div className="fixed inset-x-3 bottom-4 z-40 mx-auto max-w-md rounded-xl border border-line bg-white p-3 shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2">
        <div className="grid grid-cols-4 gap-1">
          {(Object.keys(BAR_META) as NilaiIdentifikasi[]).map((nilai) => (
            <button
              key={nilai}
              type="button"
              onClick={() => jumpKeStatus(nilai)}
              title={`Lompat ke kartu berikutnya: ${BAR_META[nilai].label}`}
              className="flex flex-col items-center gap-0.5 rounded-md py-1 transition hover:bg-line/40"
            >
              <span className={`text-lg font-bold leading-none ${BAR_META[nilai].warna}`}>
                {jumlahIdentifikasi[nilai] ?? 0}
              </span>
              <span className="text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-ink/50">
                {BAR_META[nilai].label}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-moss-500 transition-all"
            style={{ width: `${persenSelesai}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-ink/50">
          <span>Progres identifikasi (halaman ini)</span>
          <span>
            {jumlahSudahDiisi}/{rows.length} kartu &middot; {jumlahIdentifikasi.belum ?? 0} belum diisi &middot;{" "}
            {persenSelesai}%
          </span>
        </div>
      </div>
    </div>
  );
}

function IdentifikasiCard({
  row,
  token,
  onSaved,
  onSessionExpired,
}: {
  row: Row;
  token: string;
  onSaved: (id: string, patch: Partial<Row>) => void;
  onSessionExpired: () => void;
}) {
  const [nilai, setNilai] = useState<NilaiIdentifikasi>(row.identifikasi_ppl);
  const [oleh, setOleh] = useState<string | null>(row.identifikasi_ppl_oleh);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");

  async function pilih(v: NilaiIdentifikasi) {
    if (saving) return;
    setSaving(true);
    setNilai(v);
    try {
      await apiFetch("/api/penyisiran/identifikasi", token, {
        method: "PATCH",
        body: JSON.stringify({ id: row.kode_identitas, identifikasi_ppl: v }),
      });
      setSaved("ok");
      setOleh(localStorage.getItem(NAMA_KEY));
      onSaved(row.kode_identitas, {
        identifikasi_ppl: v,
        identifikasi_ppl_at: new Date().toISOString(),
        identifikasi_ppl_oleh: localStorage.getItem(NAMA_KEY),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        onSessionExpired();
        return;
      }
      setNilai(row.identifikasi_ppl);
      setSaved("err");
    } finally {
      setSaving(false);
      setTimeout(() => setSaved("idle"), 2000);
    }
  }

  return (
    <div
      id={`kartu-${row.kode_identitas}`}
      data-identifikasi-ppl={nilai}
      className={`rounded-lg border border-line p-3 transition-colors ${KARTU_META[nilai]}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-bold text-navy-900" title={namaTampilRow(row)}>
          {namaTampilRow(row)}
        </span>
        <span className="shrink-0 text-[10px] text-ink/40">{row.kode_identitas}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink/70">{row.alamat || "-"}</p>
      <p className="mb-1 text-[11px] text-ink/40">{ringkasWilayah(row.alamat, row.nagari_nama, row.sls_nama)}</p>
      {nilai !== "belum" && oleh && (
        <p className="mb-2 text-[10px] italic text-ink/40">Diisi oleh: {oleh}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {PILIHAN.map((p) => (
          <button
            key={p.nilai}
            type="button"
            disabled={saving}
            onClick={() => pilih(p.nilai)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
              nilai === p.nilai ? p.className : "border border-line bg-white text-ink/50 hover:border-navy-400"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          disabled={saving || nilai === "belum"}
          onClick={() => pilih("belum")}
          title="Kembalikan ke Belum Identifikasi"
          className="rounded-full border border-dashed border-line bg-white px-3 py-1 text-xs font-semibold text-ink/40 transition hover:border-rust-500 hover:text-rust-700 disabled:opacity-40"
        >
          ↺ Reset
        </button>
        {saved === "ok" && <span className="text-[11px] text-moss-700">✓ Tersimpan</span>}
        {saved === "err" && <span className="text-[11px] text-rust-700">Gagal, coba lagi</span>}
      </div>
    </div>
  );
}
