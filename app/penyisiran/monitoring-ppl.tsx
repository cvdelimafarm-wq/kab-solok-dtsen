"use client";

// app/penyisiran/monitoring-ppl.tsx
//
// Tab "Monitoring Pengisian Identifikasi PPL" -- rekap progres pengisian
// tab "Identifikasi PPL" (app/penyisiran/identifikasi-ppl.tsx) PER PPL,
// supaya staf BPS bisa memantau siapa yang belum/masih banyak sisa tanpa
// harus login satu-satu sbg tiap PPL. Ini VIEW AGREGAT internal staf --
// pakai PIN & sesi yang SAMA dengan tab "Penyisiran Usaha" (role
// "penyisiran", key sessionStorage "penyisiran-token"), jadi kalau tab
// Penyisiran Usaha sudah dibuka duluan, tab ini otomatis ikut terbuka
// (tidak perlu isi PIN dua kali).
//
// Sumber data: RPC penyisiran_monitoring_ppl() (lihat
// supabase/migrations/20260917_penyisiran_monitoring_ppl.sql) --
// menghitung, per PPL (tabel ppl_akun + alokasi ppl_alokasi_idsls),
// jumlah keluarga di wilayah yang dialokasikan ke PPL itu vs berapa yang
// sudah diisi Ada/Tidak Ada/Ragu di tab Identifikasi PPL.
//
// Catatan: beberapa ID Sub SLS bisa dialokasikan ke LEBIH DARI SATU PPL
// (konflik alokasi, lihat catatan di migrasi ppl_akun_alokasi_idsls) --
// kalau terjadi, keluarga yang sama akan ikut terhitung di baris PPL yang
// mana pun yang dialokasikan wilayah itu (bukan bug, memang begitu
// datanya).

import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "penyisiran-token";

interface OverallRow {
  jumlah_total: number;
  jumlah_diisi: number;
  jumlah_ada: number;
  jumlah_tidak_ada: number;
  jumlah_ragu: number;
  jumlah_belum: number;
}

interface PerPplRow {
  ppl_id: string;
  nama: string;
  no_hp: string | null;
  korwil: string | null;
  pml: string | null;
  jumlah_total: number;
  jumlah_diisi: number;
  jumlah_ada: number;
  jumlah_tidak_ada: number;
  jumlah_ragu: number;
  jumlah_belum: number;
  terakhir_diisi: string | null;
}

interface MonitoringData {
  overall: OverallRow;
  per_ppl: PerPplRow[];
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = sessionStorage.getItem(TOKEN_KEY);
  if (!t) return null;
  const exp = Number(t.split(".")[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return t;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
  return data;
}

function persen(diisi: number, total: number): number {
  return total > 0 ? Math.round((diisi / total) * 100) : 0;
}

function formatWaktu(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function nomorWa(noHp: string | null): string | null {
  if (!noHp) return null;
  const digit = noHp.replace(/\D/g, "");
  if (!digit) return null;
  return digit.startsWith("0") ? `62${digit.slice(1)}` : digit;
}

export default function MonitoringPplTab() {
  const [token, setToken] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    setToken(getToken());
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setPinError(null);
    setPinLoading(true);
    try {
      const res = await fetch("/api/penyisiran/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput, role: "penyisiran" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(data?.error || "PIN salah.");
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
    } catch {
      setPinError("Gagal terhubung. Periksa koneksi internet.");
    } finally {
      setPinLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
        <p className="text-sm font-semibold text-navy-900">Monitoring Pengisian Identifikasi PPL</p>
        <p className="mt-1 text-xs text-ink/60">
          Rekap progres pengisian per PPL/mantan pendata -- masukkan PIN akses (sama dengan PIN Penyisiran Usaha).
        </p>
        <form onSubmit={handleUnlock} className="mt-3 flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
            autoFocus
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <button
            type="submit"
            disabled={pinLoading}
            className="shrink-0 rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {pinLoading ? "..." : "Buka"}
          </button>
        </form>
        {pinError && <p className="mt-2 text-xs text-rust-700">{pinError}</p>}
      </div>
    );
  }

  return <MonitoringPanel token={token} onSessionExpired={() => setToken(null)} />;
}

function MonitoringPanel({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [urutan, setUrutan] = useState<"belum" | "nama">("belum");

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const d = await apiFetch("/api/penyisiran/monitoring-ppl", token);
      setData(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        sessionStorage.removeItem(TOKEN_KEY);
        onSessionExpired();
      } else {
        setErrMsg(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const overall = data?.overall;
  const overallPersen = overall ? persen(overall.jumlah_diisi, overall.jumlah_total) : 0;

  const search = searchInput.trim().toLowerCase();
  let daftar = (data?.per_ppl ?? []).filter((p) => !search || p.nama.toLowerCase().includes(search));
  daftar = [...daftar].sort((a, b) => {
    if (urutan === "nama") return a.nama.localeCompare(b.nama);
    // "belum" (default, sama urutan bawaan RPC): PPL dgn sisa terbanyak duluan.
    return b.jumlah_belum - a.jumlah_belum || a.nama.localeCompare(b.nama);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-navy-900 sm:text-lg">Monitoring Pengisian Identifikasi PPL</h1>
          <p className="mt-0.5 text-xs text-ink/50">
            Rekap progres pengisian tab &ldquo;Identifikasi PPL&rdquo; per petugas/mantan pendata SE2026.
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
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      {overall && (
        <div className="rounded-lg border border-line bg-white p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Total Keluarga" nilai={overall.jumlah_total} warna="text-navy-900" />
            <StatTile label="Sudah Diisi" nilai={overall.jumlah_diisi} warna="text-moss-700" />
            <StatTile label="Belum Diisi" nilai={overall.jumlah_belum} warna="text-rust-700" />
            <StatTile label="Persentase Selesai" nilai={`${overallPersen}%`} warna="text-navy-700" />
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-moss-500 transition-all" style={{ width: `${overallPersen}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-ink/50">
            <span>Ada usaha: {overall.jumlah_ada}</span>
            <span>Tidak ada usaha: {overall.jumlah_tidak_ada}</span>
            <span>Ragu-ragu: {overall.jumlah_ragu}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari nama PPL..."
          className="min-w-[160px] flex-1 rounded-md border border-line px-2 py-1.5 text-xs"
        />
        <select
          value={urutan}
          onChange={(e) => setUrutan(e.target.value as "belum" | "nama")}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          <option value="belum">Urutkan: Sisa terbanyak</option>
          <option value="nama">Urutkan: Nama (A-Z)</option>
        </select>
      </div>

      <div className="text-xs text-ink/50">
        {loading ? "Memuat..." : `${daftar.length} dari ${data?.per_ppl.length ?? 0} PPL`}
      </div>

      <div className="flex flex-col gap-2">
        {daftar.map((p) => (
          <PplRow key={p.ppl_id} row={p} />
        ))}
        {daftar.length === 0 && !loading && (
          <p className="rounded-lg border border-line bg-white p-4 text-center text-xs text-ink/40">
            Tidak ada PPL untuk pencarian ini.
          </p>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, nilai, warna }: { label: string; nilai: number | string; warna: string }) {
  return (
    <div className="text-center sm:text-left">
      <div className={`text-xl font-bold leading-none sm:text-2xl ${warna}`}>{nilai}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink/40">{label}</div>
    </div>
  );
}

function PplRow({ row }: { row: PerPplRow }) {
  const pct = persen(row.jumlah_diisi, row.jumlah_total);
  const wa = nomorWa(row.no_hp);
  const belumSelesai = row.jumlah_belum > 0;

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="text-sm font-bold text-navy-900">{row.nama}</span>
          {(row.korwil || row.pml) && (
            <p className="text-[11px] text-ink/40">
              {row.korwil && <>Korwil: {row.korwil}</>}
              {row.korwil && row.pml && " · "}
              {row.pml && <>PML: {row.pml}</>}
            </p>
          )}
        </div>
        {wa && (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-moss-700 hover:border-moss-500"
          >
            WhatsApp: {row.no_hp}
          </a>
        )}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center sm:flex sm:items-center sm:gap-4 sm:text-left">
        <div>
          <div className="text-sm font-bold text-navy-900">{row.jumlah_total}</div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-ink/40">Total</div>
        </div>
        <div>
          <div className="text-sm font-bold text-moss-700">{row.jumlah_diisi}</div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-ink/40">Diisi</div>
        </div>
        <div>
          <div className={`text-sm font-bold ${belumSelesai ? "text-rust-700" : "text-ink/30"}`}>
            {row.jumlah_belum}
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-wide text-ink/40">Belum</div>
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all ${belumSelesai ? "bg-gold-400" : "bg-moss-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-ink/50">
        <span>{pct}% selesai</span>
        <span>Terakhir diisi: {formatWaktu(row.terakhir_diisi)}</span>
      </div>
    </div>
  );
}
