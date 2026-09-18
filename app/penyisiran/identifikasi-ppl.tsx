"use client";

// app/penyisiran/identifikasi-ppl.tsx
//
// Tab "Identifikasi PPL (Mantan Pendata)" -- dulu dibuka pakai 1 PIN yang
// dibagikan rata ke semua PPL/mantan pendata SE2026 (env
// PENYISIRAN_IDENTIFIKASI_PIN). SEKARANG diganti login PERSONAL: Nama
// Lengkap + Tanggal Lahir (dicocokkan ke tabel ppl_akun, sumbernya sheet
// "PPL (Login)" pada file "Kode Wilayah dan Alokasi IDSLS - Rapi.xlsx").
//
// Konsekuensi login personal ini:
//  1. Daftar keluarga OTOMATIS dibatasi ke ID Sub SLS yang memang
//     dialokasikan ke PPL yang login (tabel ppl_alokasi_idsls) -- PPL
//     TIDAK PERLU LAGI pilih kecamatan/nagari manual seperti sebelumnya.
//  2. Sesi login disimpan di localStorage (bukan sessionStorage) dan
//     berumur panjang (180 hari, lihat lib/penyisiranAuth.ts) supaya
//     besoknya PPL tidak perlu login ulang -- otomatis masuk lagi.
//  3. Nama diambil dari datalist (autocomplete) supaya PPL tidak salah
//     ketik nama sendiri (typo bikin login gagal krn dicocokkan persis).
//
// Hasil isian di sini otomatis muncul sbg badge read-only di tab
// Penyisiran Usaha (app/seruti/penyisiran-usaha.tsx).

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "identifikasi-ppl-login-token";
const NAMA_KEY = "identifikasi-ppl-login-nama";

// Halaman ini rencananya ditutup Minggu, 20 September 2026 pukul 12:00 WIB
// -- ditampilkan sbg pengingat di layar login maupun di halaman isian.
const PESAN_PENUTUPAN = "Halaman ini akan ditutup pada Minggu, 20 September 2026 pukul 12:00 WIB.";

type NilaiIdentifikasi = "belum" | "ada" | "tidak_ada" | "ragu";

// Warna kartu (KARTU_META, dipakai di bawah) sengaja dibuat PUCAT/muda,
// sedangkan warna tombol yang aktif (className di sini) dibuat LEBIH
// PEKAT (solid, teks putih) -- supaya tombol aktif tetap kelihatan
// jelas di atas kartu yang senada warnanya, tidak "memudar"/menyatu
// (sebelumnya sama-sama pakai bg-moss-100 dkk utk kartu MAUPUN tombol,
// jadi tombolnya nyaris tidak kelihatan begitu kartu ikut diwarnai).
const PILIHAN: { nilai: NilaiIdentifikasi; label: string; className: string }[] = [
  { nilai: "ada", label: "Ada", className: "bg-moss-500 text-white" },
  { nilai: "tidak_ada", label: "Tidak Ada", className: "bg-rust-500 text-white" },
  { nilai: "ragu", label: "Ragu-ragu", className: "bg-[#8A6A12] text-white" },
];

// Warna kartu per status -- PUTIH kalau belum diisi, HIJAU/MERAH/KUNING
// pucat sesuai jawaban (lihat komentar PILIHAN di atas soal kenapa
// pucat, bukan warna solid).
const KARTU_META: Record<NilaiIdentifikasi, string> = {
  belum: "bg-white",
  ada: "bg-moss-100",
  tidak_ada: "bg-rust-100",
  ragu: "bg-[#FCEFD1]",
};

// Dipakai bar float navigasi status di bawah layar -- beda dari PILIHAN
// (yang cuma 3 pilihan jawaban), di sini termasuk "belum" supaya PPL bisa
// langsung lompat ke kartu yang belum diisi juga. Gaya kartu statistik
// (angka besar berwarna + label kecil di bawahnya + progress bar), bukan
// deretan pil, spy lebih rapi & gampang dibaca sekilas.
const BAR_META: Record<NilaiIdentifikasi, { label: string; warna: string }> = {
  belum: { label: "Belum Identifikasi", warna: "text-ink/50" },
  tidak_ada: { label: "Tidak Ada Usaha", warna: "text-rust-700" },
  ragu: { label: "Ragu-Ragu", warna: "text-[#8A6A12]" },
  ada: { label: "Ada Usaha", warna: "text-moss-700" },
};

interface Row {
  kode_identitas: string;
  kec_kode: string | null;
  kec_nama: string | null;
  nagari_kode: string | null;
  nagari_nama: string | null;
  sls_nama: string | null;
  nama_kk: string | null;
  alamat: string | null;
  identifikasi_ppl: NilaiIdentifikasi;
  identifikasi_ppl_at: string | null;
}

interface SubslsOption {
  idsubsls: string;
  label: string;
  jumlah: number;
}

// Alamat (baris pertama kartu) sering SUDAH memuat nama Jorong/SLS di
// dalamnya sendiri (mis. alamat "JALAN JORONG ULU PISAU HILANG" utk
// keluarga yg SLS-nya memang "JORONG ULU PISAU HILANG" -- lazim di alamat
// pedesaan yg tidak punya nama jalan sendiri) -- kalau baris kedua tetap
// menampilkan "Nagari · Nama SLS" apa adanya, nama Jorong itu jadi
// disebut DUA KALI berturut-turut (dilaporkan user, sama di tab Penyisiran
// Usaha -- lihat komentar ringkasWilayah di app/seruti/penyisiran-usaha.tsx
// utk versi kembarannya). Nama SLS di baris kedua disembunyikan HANYA
// kalau alamat sudah memuat teks yg sama persis (cek case-insensitive) --
// nagari tetap selalu ditampilkan krn itu jarang ikut disebut di alamat.
function ringkasWilayah(alamat: string | null, nagariNama: string | null, slsNama: string | null): string {
  const sudahDisebut =
    !!alamat && !!slsNama && slsNama.trim().length > 0 && alamat.toUpperCase().includes(slsNama.trim().toUpperCase());
  const bagian = [nagariNama, sudahDisebut ? null : slsNama].filter((b): b is string => !!b && b.trim().length > 0);
  return bagian.join(" · ");
}

function tokenExpMs(token: string): number {
  // Token role identifikasi_ppl: role.subjectB64.exp.sig (4 bagian) --
  // exp ada di index ke-2. Format lama (3 bagian) exp ada di index ke-1,
  // dijaga juga di sini kalau-kalau ada sisa token lama tersimpan.
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

export default function IdentifikasiPplTab() {
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

  if (!checkedStorage) return null; // hindari kedip layar login sebelum cek localStorage

  if (!token) {
    return <LoginForm onLoggedIn={handleLoggedIn} />;
  }

  return (
    <IdentifikasiPanel
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
    fetch("/api/penyisiran/identifikasi-ppl-names")
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
      const res = await fetch("/api/penyisiran/identifikasi-login", {
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
      <p className="text-sm font-semibold text-navy-900">Identifikasi PPL (Mantan Pendata)</p>
      <p className="mt-1 text-xs text-ink/60">
        Untuk PPL yang dulu mendata SE2026 di wilayah ini -- masukkan nama lengkap dan tanggal lahir Anda. Setelah
        berhasil, Anda tidak perlu login ulang besok.
      </p>
      <p className="mt-2 rounded-md bg-rust-100 px-2.5 py-1.5 text-[11px] font-medium text-rust-700">
        ⚠ {PESAN_PENUTUPAN}
      </p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-2 text-left">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Nama Lengkap</label>
          <input
            list="nama-ppl-options"
            type="text"
            value={namaInput}
            onChange={(e) => setNamaInput(e.target.value)}
            placeholder="Ketik nama lengkap Anda"
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <datalist id="nama-ppl-options">
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

function IdentifikasiPanel({
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
  const [filterStatus, setFilterStatus] = useState("");
  // Filter Sub SLS/Jorong BARU -- opsinya otomatis dibatasi ke wilayah yg
  // sudah dialokasikan ke PPL ini (lihat loadSubslsOptions), BUKAN dropdown
  // Kecamatan/Nagari manual spt tab Identifikasi Jorong/Tetangga (PPL
  // memang tidak perlu pilih itu, lihat komentar di atas file).
  const [filterSubsls, setFilterSubsls] = useState("");
  const [subslsOptions, setSubslsOptions] = useState<SubslsOption[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
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

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Opsi dropdown Sub SLS -- dimuat SEKALI saat panel dibuka (bukan tiap
  // filter berubah), krn daftarnya tetap sama selama sesi login (wilayah
  // alokasi PPL tidak berubah-ubah).
  useEffect(() => {
    apiFetch("/api/penyisiran/identifikasi-subsls", token)
      .then((d) => setSubslsOptions(Array.isArray(d) ? d : []))
      .catch((e) => guard(() => { throw e; }));
  }, [token, guard]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const sp = new URLSearchParams();
      if (filterStatus) sp.set("status", filterStatus);
      if (filterSubsls) sp.set("subsls", filterSubsls);
      if (search) sp.set("q", search);
      sp.set("page", String(page));
      const data = await apiFetch(`/api/penyisiran/identifikasi-list?${sp.toString()}`, token);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSubsls, search, page, token, guard]);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, filterSubsls, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  function refreshAfterEdit(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.kode_identitas === id ? { ...r, ...patch } : r)));
  }

  // Bar float "Belum Identifikasi / Tidak Ada Usaha / Ragu-Ragu / Ada
  // Usaha" di bawah layar: melompat ke kartu BERIKUTNYA (searah gulir ke
  // bawah) yang berstatus identifikasi_ppl sesuai tombol yang ditekan,
  // lalu berputar kembali ke kartu paling atas kalau sudah sampai ujung --
  // supaya bisa dipakai berulang kali menyisir semua kartu dgn status yg
  // sama. Hanya menjangkau kartu yang sedang dimuat di halaman ini (rows,
  // dipaginasi 200/halaman).
  function jumpKeStatus(nilai: NilaiIdentifikasi) {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(`[data-identifikasi-ppl="${nilai}"]`));
    if (cards.length === 0) return;
    const batasAtas = window.scrollY + 96; // beri sedikit ruang dari bagian atas layar
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
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">Identifikasi PPL (Mantan Pendata)</h1>
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
          Seingat Saudara <span className="font-semibold">{nama}</span> sebagai petugas yang dulu mendata SE2026,
          apakah keluarga berikut memiliki usaha atau tidak?
        </p>
      </div>

      <p className="inline-block rounded-md bg-rust-100 px-2.5 py-1.5 text-xs font-medium text-rust-700">
        ⚠ {PESAN_PENUTUPAN}
      </p>

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
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
        {subslsOptions.length > 0 && (
          <select
            value={filterSubsls}
            onChange={(e) => setFilterSubsls(e.target.value)}
            className="rounded-md border border-line px-2 py-1.5 text-xs"
          >
            <option value="">Semua SLS/Sub SLS</option>
            {subslsOptions.map((s) => (
              <option key={s.idsubsls} value={s.idsubsls}>
                {s.label} ({s.jumlah})
              </option>
            ))}
          </select>
        )}
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari nama / ID / alamat..."
          className="min-w-[160px] flex-1 rounded-md border border-line px-2 py-1.5 text-xs"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs text-ink/50">
          {loading ? "Memuat..." : `${total} keluarga di wilayah yang dialokasikan ke Anda`}
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

      {/* Kartu float navigasi status di tengah-bawah layar -- angka besar
          per status (ditekan langsung menggulir ke kartu berikutnya yg
          sesuai, lihat jumpKeStatus di atas) + progress bar keseluruhan.
          Cuma menghitung kartu yg sedang dimuat di halaman ini (rows). */}
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
          <span>Progres identifikasi</span>
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
      onSaved(row.kode_identitas, { identifikasi_ppl: v, identifikasi_ppl_at: new Date().toISOString() });
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
        <span className="text-sm font-bold text-navy-900">{row.nama_kk || "(tanpa nama)"}</span>
        <span className="text-[10px] text-ink/40">{row.kode_identitas}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink/70">{row.alamat || "-"}</p>
      <p className="mb-2 text-[11px] text-ink/40">{ringkasWilayah(row.alamat, row.nagari_nama, row.sls_nama)}</p>
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
