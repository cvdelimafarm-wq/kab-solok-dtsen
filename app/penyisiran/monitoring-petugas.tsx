"use client";

// app/penyisiran/monitoring-petugas.tsx
//
// Tab "Monitoring Petugas Penyisiran" -- rekap per petugas (tabel
// petugas_penyisiran_akun, roster yang SAMA dipakai jg utk login tab
// "Identifikasi Jorong" & dropdown "Nama Anda" di tab "Penyisiran Usaha"):
//  - Jumlah Diidentifikasi (Jorong): keluarga yg identifikasi_ppl-nya diisi
//    petugas ini lewat tab "Identifikasi Jorong".
//  - Jumlah Diidentifikasi (Tetangga/Lainnya): sama tapi lewat tab
//    "Identifikasi Tetangga/Lainnya" -- dipisah krn satu orang bisa punya
//    login di kedua tabel akun (petugas_penyisiran_akun & tetangga_akun).
//  - Jumlah Dikunjungi: keluarga yg checklist-nya disimpan petugas ini (lwt
//    dropdown "Nama Anda") di tab "Penyisiran Usaha", status kunjungan
//    apa pun selain "Belum".
//  - Jumlah Didata: subset dari Dikunjungi yg status-nya "Usaha Berhasil Didata".
//
// Pakai token login personal BERSAMA yg SAMA dgn tab Penyisiran Usaha (role
// "penyisiran_petugas", key localStorage yg SAMA -- diimpor lewat getToken()
// dari app/seruti/penyisiran-usaha.tsx). Gerbang PIN sendiri yang dulu ada di
// sini SUDAH DIHAPUS (permintaan user "cukup 1 login dan semua bisa masuk
// menu sesuai role") -- gerbang login SUDAH terjadi 1x di level halaman
// (app/penyisiran/page.tsx) SEBELUM tab bar ditampilkan, jadi tab ini tidak
// perlu minta PIN lagi. PIN admin lama ("penyisiran") TETAP diterima
// backend-nya sbg alternatif (lihat app/api/penyisiran/monitoring-petugas/
// route.ts), cuma tidak lagi ada UI utk memasukkannya di sini.
// Sumber data: RPC penyisiran_monitoring_petugas() (lihat migrasi
// 20260918_penyisiran_petugas_pasti_monitoring.sql).
//
// Fitur "Kelola Petugas Penyisiran" (aktifkan/nonaktifkan akun) DEFAULT
// DISEMBUNYIKAN -- diklik dulu utk membuka, lalu WAJIB masukkan PIN lagi
// (dicek server-side di /api/penyisiran/petugas-toggle-aktif) sebelum
// tombol aktif/nonaktif bisa dipakai, supaya tidak kepencet asal oleh siapa
// saja yang sekadar login personal biasa/membuka tab monitoring ini --
// SATU-SATUNYA bagian di tab ini yg TETAP wajib PIN, TIDAK ikut disatukan.
//
// Header tabel pakai komponen bersama ExcelTh/useExcelTable (app/penyisiran/
// _shared/excel-table.tsx) -- dropdown "Urutkan" yang dulu terpisah SUDAH
// DIHAPUS, diganti klik nama kolom (sort) & ikon "▾" (filter checklist nilai
// unik) langsung di header, spt tabel lain di app ini. Pembagian 2 kelompok
// baris (aktif di atas, nonaktif-berriwayat di bawah dgn baris pemisah)
// TETAP dipertahankan -- hasil sort/filter dari useExcelTable dipecah lagi
// jadi 2 array (tampilAktif/tampilNonaktifRiwayat) DGN URUTAN YANG SAMA,
// bukan diurutkan ulang terpisah.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getToken, clearToken } from "../seruti/penyisiran-usaha";
import { useExcelTable, ExcelTh } from "./_shared/excel-table";

interface PetugasMonitor {
  id: number;
  nama: string;
  aktif: boolean;
  jumlah_identifikasi_jorong: number;
  jumlah_identifikasi_tetangga: number;
  jumlah_dikunjungi: number;
  jumlah_didata: number;
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

export default function MonitoringPetugasTab() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(getToken());
  }, []);

  if (!token) {
    return (
      <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
        <p className="text-sm font-semibold text-navy-900">Monitoring Petugas Penyisiran</p>
        <p className="mt-1 text-xs text-ink/60">
          Sesi login tidak ditemukan. Coba muat ulang halaman, atau login lagi lewat tab &ldquo;Penyisiran
          Usaha&rdquo;.
        </p>
      </div>
    );
  }

  return <MonitoringPanel token={token} onSessionExpired={() => setToken(null)} />;
}

function MonitoringPanel({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [daftar, setDaftar] = useState<PetugasMonitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [kelolaOpen, setKelolaOpen] = useState(false);

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

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const d = await apiFetch("/api/penyisiran/monitoring-petugas", token);
      setDaftar(d.petugas ?? []);
    } catch (e) {
      guard(() => { throw e; });
    } finally {
      setLoading(false);
    }
  }, [token, guard]);

  useEffect(() => {
    load();
  }, [load]);

  function adaRiwayat(p: PetugasMonitor): boolean {
    return (
      p.jumlah_identifikasi_jorong > 0 ||
      p.jumlah_identifikasi_tetangga > 0 ||
      p.jumlah_dikunjungi > 0 ||
      p.jumlah_didata > 0
    );
  }

  const search = searchInput.trim().toLowerCase();
  const cocokCari = (p: PetugasMonitor) => !search || p.nama.toLowerCase().includes(search);

  // Petugas nonaktif TANPA riwayat sama sekali disembunyikan total (bukan
  // sekadar disamarkan) -- biasanya akun yang salah input/tidak pernah
  // benar2 aktif menyisir. Yang nonaktif TAPI punya riwayat tetap
  // ditampilkan, dipisah di bagian paling bawah tabel (supaya riwayatnya
  // tidak hilang dari rekap, tapi tidak mencampur dgn petugas yg SEDANG
  // aktif menyisir) -- disaring dulu SEBELUM masuk ke useExcelTable spy
  // yang disembunyikan tidak ikut muncul di daftar checkbox filter header
  // ataupun ikut dihitung Total di StatTile.
  //
  // Urutkan (dulu dropdown "nama"/"dikunjungi"/"diidentifikasi") SEKARANG
  // dipindah ke klik header kolom (ExcelTh, spt tabel lain di app ini) --
  // tabelMonitor.rows sudah terurut+terfilter, tinggal dipecah lagi jadi 2
  // kelompok (aktif/nonaktif berriwayat) dgn urutan yg SAMA persis spt hasil
  // sort/filter itu.
  const kolom = useMemo(
    () => [
      { key: "nama", label: "Nama", getValue: (p: PetugasMonitor) => p.nama },
      { key: "jumlah_identifikasi_jorong", label: "Diidentifikasi (Jorong)", getValue: (p: PetugasMonitor) => p.jumlah_identifikasi_jorong },
      {
        key: "jumlah_identifikasi_tetangga",
        label: "Diidentifikasi (Tetangga/Lainnya)",
        getValue: (p: PetugasMonitor) => p.jumlah_identifikasi_tetangga,
      },
      { key: "jumlah_didata", label: "Didata", getValue: (p: PetugasMonitor) => p.jumlah_didata },
      { key: "jumlah_dikunjungi", label: "Dikunjungi", getValue: (p: PetugasMonitor) => p.jumlah_dikunjungi },
    ],
    []
  );
  const daftarUntukTabel = useMemo(
    () => daftar.filter((p) => (p.aktif || adaRiwayat(p)) && cocokCari(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daftar, search]
  );
  const tabelMonitor = useExcelTable(daftarUntukTabel, kolom, { key: "nama", dir: "asc" });
  const tampilAktif = tabelMonitor.rows.filter((p) => p.aktif);
  const tampilNonaktifRiwayat = tabelMonitor.rows.filter((p) => !p.aktif);
  const tampil = tabelMonitor.rows;

  const totalDikunjungi = daftar.reduce((s, p) => s + p.jumlah_dikunjungi, 0);
  const totalDidata = daftar.reduce((s, p) => s + p.jumlah_didata, 0);
  const totalJorong = daftar.reduce((s, p) => s + p.jumlah_identifikasi_jorong, 0);
  const totalTetangga = daftar.reduce((s, p) => s + p.jumlah_identifikasi_tetangga, 0);

  function handleToggled(id: number, aktif: boolean) {
    setDaftar((prev) => prev.map((p) => (p.id === id ? { ...p, aktif } : p)));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-navy-900 sm:text-lg">Monitoring Petugas Penyisiran</h1>
          <p className="mt-0.5 text-xs text-ink/50">
            Rekap identifikasi (Jorong/Tetangga) &amp; kunjungan (Penyisiran Usaha) per petugas.
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="Petugas Aktif" value={daftar.filter((p) => p.aktif).length} />
        <StatTile label="Diidentifikasi (Jorong)" value={totalJorong} />
        <StatTile label="Diidentifikasi (Tetangga)" value={totalTetangga} />
        <StatTile label="Dikunjungi / Didata" value={`${totalDikunjungi} / ${totalDidata}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Cari nama petugas..."
          className="min-w-[160px] flex-1 rounded-md border border-line px-2 py-1.5 text-xs"
        />
        <p className="text-[10px] text-ink/40">Klik nama kolom tabel utk urutkan, klik &ldquo;▾&rdquo; utk filter (spt Excel).</p>
        {tabelMonitor.adaFilterAktif && (
          <button type="button" onClick={tabelMonitor.resetFilters} className="shrink-0 text-[11px] font-medium text-navy-700 hover:underline">
            Reset semua filter
          </button>
        )}
      </div>

      {/* Tabel rekap -- di layar sempit digulirkan ke samping. */}
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-[#2563eb] text-[10px] font-semibold uppercase tracking-wide text-white">
            <tr className="text-left">
              {kolom.map((k) => (
                <ExcelTh
                  key={k.key}
                  colKey={k.key}
                  label={k.label}
                  align={k.key === "nama" ? "left" : "right"}
                  sortKey={tabelMonitor.sortKey}
                  sortDir={tabelMonitor.sortDir}
                  onSort={tabelMonitor.toggleSort}
                  values={tabelMonitor.uniqueValues[k.key] ?? []}
                  activeFilter={tabelMonitor.filters[k.key]}
                  onFilterChange={tabelMonitor.setColumnFilter}
                  variant="dark"
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {tampilAktif.map((p) => (
              <PetugasRow key={p.id} p={p} />
            ))}
            {tampilNonaktifRiwayat.length > 0 && (
              <tr>
                <td colSpan={kolom.length} className="border-b border-line bg-paper/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                  Nonaktif -- masih ada riwayat data
                </td>
              </tr>
            )}
            {tampilNonaktifRiwayat.map((p) => (
              <PetugasRow key={p.id} p={p} />
            ))}
            {tampil.length === 0 && !loading && (
              <tr>
                <td colSpan={kolom.length} className="px-3 py-6 text-center text-ink/40">
                  Tidak ada petugas untuk pencarian{tabelMonitor.adaFilterAktif ? "/filter" : ""} ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* "Kelola Petugas Penyisiran" -- default HIDE, diklik dulu utk
          membuka, lalu WAJIB PIN lagi sebelum tombol aktif/nonaktif per
          baris bisa dipakai (lihat KelolaPanel). */}
      <button
        type="button"
        onClick={() => setKelolaOpen((v) => !v)}
        className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400"
      >
        {kelolaOpen ? "▲ Tutup Kelola Petugas Penyisiran" : "▼ Kelola Petugas Penyisiran"}
      </button>
      {kelolaOpen && <KelolaPanel token={token} daftar={daftar} onToggled={handleToggled} onSessionExpired={onSessionExpired} />}
    </div>
  );
}

function PetugasRow({ p }: { p: PetugasMonitor }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2 font-semibold text-navy-900">
        {p.nama}
        {!p.aktif && (
          <span className="ml-1.5 rounded-full border border-line px-1.5 py-0.5 text-[9px] font-medium text-ink/40">
            Nonaktif
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right">{p.jumlah_identifikasi_jorong}</td>
      <td className="px-3 py-2 text-right">{p.jumlah_identifikasi_tetangga}</td>
      <td className="px-3 py-2 text-right">{p.jumlah_didata}</td>
      <td className="px-3 py-2 text-right">{p.jumlah_dikunjungi}</td>
    </tr>
  );
}

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="text-lg font-bold text-navy-900">{value}</div>
      <div className="mt-0.5 text-[11px] text-ink/60">{label}</div>
    </div>
  );
}

function KelolaPanel({
  token,
  daftar,
  onToggled,
  onSessionExpired,
}: {
  token: string;
  daftar: PetugasMonitor[];
  onToggled: (id: number, aktif: boolean) => void;
  onSessionExpired: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function toggle(p: PetugasMonitor) {
    if (!pin) {
      setErrMsg("Masukkan PIN dulu.");
      return;
    }
    setBusyId(p.id);
    setErrMsg(null);
    try {
      await apiFetch("/api/penyisiran/petugas-toggle-aktif", token, {
        method: "PATCH",
        body: JSON.stringify({ petugas_id: p.id, aktif: !p.aktif, pin }),
      });
      onToggled(p.id, !p.aktif);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        clearToken();
        onSessionExpired();
        return;
      }
      setErrMsg(msg);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="mb-2 text-xs text-ink/60">
        Nonaktifkan akun petugas yang sudah tidak menyisir (mis. sudah tidak jadi mitra) -- riwayat kunjungan/
        identifikasi yang sudah tercatat TIDAK ikut terhapus. Petugas yang dinonaktifkan tidak muncul lagi di
        dropdown &ldquo;Nama Anda&rdquo; (Penyisiran Usaha) &amp; tidak bisa login lagi ke Identifikasi Jorong.
      </p>
      <input
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="Masukkan PIN utk mengaktifkan tombol di bawah"
        className="mb-2 w-full max-w-xs rounded-md border border-line px-3 py-1.5 text-xs outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
      />
      {errMsg && <p className="mb-2 text-xs text-rust-700">⚠ {errMsg}</p>}
      <div className="flex flex-col gap-1.5">
        {daftar.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-2.5 py-1.5">
            <span className="text-xs font-medium text-navy-900">{p.nama}</span>
            <button
              type="button"
              onClick={() => toggle(p)}
              disabled={busyId === p.id || !pin}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40 ${
                p.aktif ? "border border-rust-700 text-rust-700 hover:bg-rust-100/50" : "bg-moss-500 text-white hover:bg-moss-600"
              }`}
            >
              {busyId === p.id ? "..." : p.aktif ? "Nonaktifkan" : "Aktifkan"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
