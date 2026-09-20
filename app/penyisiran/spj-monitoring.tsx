"use client";

// app/penyisiran/spj-monitoring.tsx
//
// Sub-tab "Dashboard" & "Monitoring SPJ" di menu Administrasi (khusus
// pengelola) -- bagian dari redesain menu Administrasi dari model "kumpulan
// kartu dokumen" menjadi model "monitoring per orang + per tanggal", atas
// masukan user: pengelola menangani 15-30 petugas, kebutuhan utamanya
// menjawab cepat "siapa yang SPJ-nya belum lengkap, tanggal berapa, dan
// dokumen apa yang kurang" -- bukan membuka satu-per-satu kartu dokumen.
//
// SATU fetch (/api/penyisiran/spj/monitoring) dipakai bareng utk Dashboard
// & Monitoring (2 mode: Per Tanggal & Per Petugas) -- lihat
// lib/spjMatriks.ts utk definisi status per jenis dokumen & fungsi bantu
// yg dipakai bersama di sini, di Print Builder (spj-cetak.tsx), dan di
// tampilan "Administrasi Saya" (administrasi-spj.tsx) utk petugas biasa.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useExcelTable, ExcelTh } from "./_shared/excel-table";
import {
  BarisMatriks,
  JENIS_DOKUMEN,
  JenisDokumen,
  LABEL_DOKUMEN,
  SpjPetugasJenisMatriks,
  WARNA_DOT,
  statusDokumen,
  ringkasHari,
  labelRingkasan,
  kunciPetugas,
  hitungKelengkapanPerJenis,
} from "@/lib/spjMatriks";

async function apiFetch(path: string, token: string) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
  return data;
}

function hariIniStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tambahHari(tgl: string, delta: number): string {
  const d = new Date(tgl + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTanggalPendek(iso: string): string {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// ---------- Hook bersama: satu fetch /api/penyisiran/spj/monitoring ----------
//
// Dipakai oleh administrasi-spj.tsx (lifted ke AdministrasiPanel) supaya
// Dashboard & Monitoring SPJ (2 sub-tab TERPISAH di nav pengelola, sejajar
// dgn Cetak SPJ & Arsip SPJ) tidak masing2 fetch sendiri -- lihat juga
// pemakaian utk tampilan "Administrasi Saya" (petugas biasa, data sudah
// difilter server-side ke milik sendiri).

export function useSpjMonitoring(token: string, onSessionExpired: () => void) {
  const [baris, setBaris] = useState<BarisMatriks[]>([]);
  const [pengelola, setPengelola] = useState(false);
  // Identitas akun yg SEDANG LOGIN (dikirim server, sesi yg sudah
  // diverifikasi -- lihat komentar sesi_jenis/sesi_petugas_id di
  // app/api/penyisiran/spj/monitoring/route.ts) -- dipakai ProgresSayaKotak
  // di bawah utk menyaring `baris` (yg utk pengelola berisi SEMUA petugas)
  // jadi cuma milik akun ybs sendiri.
  const [sesiJenis, setSesiJenis] = useState<SpjPetugasJenisMatriks | null>(null);
  const [sesiPetugasId, setSesiPetugasId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/spj/monitoring", token);
      setPengelola(!!data?.pengelola);
      setBaris(Array.isArray(data?.baris) ? data.baris : []);
      setSesiJenis(data?.sesi_jenis === "penyisiran" || data?.sesi_jenis === "tetangga" ? data.sesi_jenis : null);
      setSesiPetugasId(typeof data?.sesi_petugas_id === "number" ? data.sesi_petugas_id : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
      else setErrMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    muat();
  }, [muat]);

  return { baris, pengelola, sesiJenis, sesiPetugasId, loading, errMsg, muat };
}

// ---------- Dashboard ----------

export function SpjDashboard({ baris, loading }: { baris: BarisMatriks[]; loading: boolean }) {
  const [tanggal, setTanggal] = useState(hariIniStr());

  const barisHariIni = useMemo(() => baris.filter((b) => b.tanggal === tanggal), [baris, tanggal]);

  // perJenis/totalDokumen/totalOk (dasar kartu "Progress SPJ Tanggal Ini" &
  // "Kelengkapan per Jenis Dokumen") DIHAPUS dari sini -- kedua kartu itu
  // DIPINDAH ke bagian atas tab "Monitoring SPJ" (lihat ProgresSayaKotak)
  // & sekaligus diubah jadi PERSONAL (progres akun yg login sendiri,
  // sampai hari ini), atas permintaan user -- bukan lagi agregat lintas
  // petugas utk satu tanggal terpilih spt di sini. KartuRingkas
  // (Petugas/Lengkap/Kurang/Kosong) di bawah TETAP agregat lintas
  // petugas -- tidak diminta berubah.
  const ringkasan = useMemo(() => {
    const perPetugas = new Map<string, BarisMatriks>();
    for (const b of barisHariIni) perPetugas.set(kunciPetugas(b), b);
    const daftar = Array.from(perPetugas.values());
    let lengkap = 0;
    let kurang = 0;
    let kosong = 0;
    for (const b of daftar) {
      const r = ringkasHari(b);
      if (r.status === "lengkap") lengkap++;
      else if (r.status === "kosong") kosong++;
      else kurang++;
    }
    return { totalPetugas: daftar.length, lengkap, kurang, kosong };
  }, [barisHariIni]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <button
          type="button"
          onClick={() => setTanggal((t) => tambahHari(t, -1))}
          className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink/60 hover:border-navy-400 hover:text-navy-700"
        >
          ← Sebelumnya
        </button>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={() => setTanggal((t) => tambahHari(t, 1))}
          className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink/60 hover:border-navy-400 hover:text-navy-700"
        >
          Berikutnya →
        </button>
        {tanggal !== hariIniStr() && (
          <button
            type="button"
            onClick={() => setTanggal(hariIniStr())}
            className="rounded-md bg-navy-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-navy-900"
          >
            Hari Ini
          </button>
        )}
        <span className="ml-auto text-xs font-semibold text-navy-900">{formatTanggalPendek(tanggal)}</span>
      </div>

      {loading && baris.length === 0 ? (
        <p className="rounded-lg border border-line bg-white p-6 text-center text-xs text-ink/40">Memuat data...</p>
      ) : ringkasan.totalPetugas === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink/40">
          Tidak ada petugas dengan Surat Tugas aktif pada tanggal ini.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <KartuRingkas label="👥 Petugas" nilai={ringkasan.totalPetugas} warna="text-navy-900" />
            <KartuRingkas label="🟢 Lengkap" nilai={ringkasan.lengkap} warna="text-moss-700" />
            <KartuRingkas label="🟡 Kurang" nilai={ringkasan.kurang} warna="text-gold-600" />
            <KartuRingkas label="🔴 Kosong" nilai={ringkasan.kosong} warna="text-rust-700" />
          </div>
          {/* "Progress SPJ Tanggal Ini" & "Kelengkapan per Jenis Dokumen"
              DIPINDAH ke bagian atas tab "Monitoring SPJ" (lihat
              ProgresSayaKotak) -- lihat komentar di ringkasan di atas. */}
        </>
      )}
    </div>
  );
}

function KartuRingkas({ label, nilai, warna }: { label: string; nilai: number; warna: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3 text-center">
      <div className={`text-xl font-bold leading-none ${warna}`}>{nilai}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink/40">{label}</div>
    </div>
  );
}

// ---------- Monitoring SPJ (2 mode: Per Tanggal & Per Petugas) ----------

interface BarisTampil {
  key: string;
  petugas_jenis: string;
  petugas_id: number;
  nama: string;
  tanggal: string;
  nomor_st: string;
  status: ReturnType<typeof ringkasHari>;
  row: BarisMatriks;
}

export function SpjMonitoring({
  baris,
  loading,
  token,
  onSessionExpired,
  sesiJenis,
  sesiPetugasId,
}: {
  baris: BarisMatriks[];
  loading: boolean;
  // token/onSessionExpired/sesiJenis/sesiPetugasId -- dipakai HANYA utk
  // kartu "Progres Saya" (ProgresSayaKotak) di bagian atas, lihat komentar
  // di sana & di sesi_jenis/sesi_petugas_id
  // app/api/penyisiran/spj/monitoring/route.ts. Tabel matriks lintas
  // petugas di bawahnya TETAP jalan dari `baris`/`loading` spt semula,
  // tidak terpengaruh 4 prop baru ini.
  token: string;
  onSessionExpired: () => void;
  sesiJenis: SpjPetugasJenisMatriks | null;
  sesiPetugasId: number | null;
}) {
  const [mode, setMode] = useState<"tanggal" | "petugas">("tanggal");
  const [tanggal, setTanggal] = useState(hariIniStr());
  const [petugasKey, setPetugasKey] = useState<string>("");
  const [detailKey, setDetailKey] = useState<string | null>(null);

  // Baris milik akun yg SEDANG LOGIN saja (dari `baris` yg utk pengelola
  // berisi SEMUA petugas) -- dasar ProgresSayaKotak di bawah.
  const barisSaya = useMemo(() => {
    if (!sesiJenis || sesiPetugasId == null) return [];
    return baris.filter((b) => b.petugas_jenis === sesiJenis && b.petugas_id === sesiPetugasId);
  }, [baris, sesiJenis, sesiPetugasId]);

  const daftarPetugas = useMemo(() => {
    const peta = new Map<string, string>();
    for (const b of baris) peta.set(kunciPetugas(b), b.nama);
    return Array.from(peta.entries())
      .map(([key, nama]) => ({ key, nama }))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  }, [baris]);

  useEffect(() => {
    if (!petugasKey && daftarPetugas.length > 0) setPetugasKey(daftarPetugas[0].key);
  }, [daftarPetugas, petugasKey]);

  const sumberBaris: BarisTampil[] = useMemo(() => {
    const sumber = mode === "tanggal" ? baris.filter((b) => b.tanggal === tanggal) : baris.filter((b) => kunciPetugas(b) === petugasKey);
    return sumber.map((row) => ({
      key: `${kunciPetugas(row)}:${row.surat_tugas_id}:${row.tanggal}`,
      petugas_jenis: row.petugas_jenis,
      petugas_id: row.petugas_id,
      nama: row.nama,
      tanggal: row.tanggal,
      nomor_st: row.nomor_st,
      status: ringkasHari(row),
      row,
    }));
  }, [baris, mode, tanggal, petugasKey]);

  const kolom = useMemo(
    () => [
      { key: "nama", label: mode === "tanggal" ? "Petugas" : "Tanggal", getValue: (r: BarisTampil) => (mode === "tanggal" ? r.nama : formatTanggalPendek(r.tanggal)) },
      ...JENIS_DOKUMEN.map((j) => ({
        key: j,
        label: LABEL_DOKUMEN[j],
        getValue: (r: BarisTampil) => WARNA_DOT[statusDokumen(r.row, j)],
      })),
      { key: "status", label: "Status", getValue: (r: BarisTampil) => labelRingkasan(r.status) },
    ],
    [mode]
  );

  const tabel = useExcelTable(sumberBaris, kolom, { key: "nama", dir: "asc" });

  return (
    <div className="space-y-3">
      {/* "Progres Saya" -- 2 kotak (Laporan & Dokumentasi) tentang akun yg
          SEDANG LOGIN sendiri, dipindah ke sini (atas permintaan) --
          SELALU tampil di bagian PALING ATAS tab ini, di atas matriks
          lintas petugas di bawah (lihat ProgresSayaKotak). */}
      <ProgresSayaKotak token={token} onSessionExpired={onSessionExpired} barisSaya={barisSaya} loading={loading} />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <div className="flex gap-1.5 rounded-md border border-line bg-paper/40 p-1">
          <button
            type="button"
            onClick={() => setMode("tanggal")}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
              mode === "tanggal" ? "bg-navy-700 text-white" : "text-ink/60 hover:text-navy-700"
            }`}
          >
            Per Tanggal
          </button>
          <button
            type="button"
            onClick={() => setMode("petugas")}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
              mode === "petugas" ? "bg-navy-700 text-white" : "text-ink/60 hover:text-navy-700"
            }`}
          >
            Per Petugas
          </button>
        </div>

        {mode === "tanggal" ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTanggal((t) => tambahHari(t, -1))}
              className="rounded-md border border-line px-2 py-1 text-xs text-ink/60 hover:border-navy-400"
            >
              ←
            </button>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="rounded-md border border-line px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => setTanggal((t) => tambahHari(t, 1))}
              className="rounded-md border border-line px-2 py-1 text-xs text-ink/60 hover:border-navy-400"
            >
              →
            </button>
            {tanggal !== hariIniStr() && (
              <button
                type="button"
                onClick={() => setTanggal(hariIniStr())}
                className="rounded-md border border-line px-2 py-1 text-xs font-medium text-navy-700 hover:border-navy-400"
              >
                Hari Ini
              </button>
            )}
          </div>
        ) : (
          <select
            value={petugasKey}
            onChange={(e) => setPetugasKey(e.target.value)}
            className="min-w-[180px] rounded-md border border-line px-2 py-1.5 text-xs"
          >
            {daftarPetugas.map((p) => (
              <option key={p.key} value={p.key}>
                {p.nama}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && baris.length === 0 ? (
        <p className="rounded-lg border border-line bg-white p-6 text-center text-xs text-ink/40">Memuat data...</p>
      ) : sumberBaris.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink/40">
          {mode === "tanggal" ? "Tidak ada petugas dengan Surat Tugas aktif pada tanggal ini." : "Belum ada data utk petugas ini."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white p-3">
          <div className="mb-1 flex items-center justify-between text-[10px] text-ink/40">
            <span>Klik nama kolom utk urutkan, klik ▾ utk filter. Klik baris utk lihat rincian.</span>
            {tabel.adaFilterAktif && (
              <button type="button" onClick={tabel.resetFilters} className="font-medium text-navy-700 hover:underline">
                Reset semua filter
              </button>
            )}
          </div>
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              <tr>
                {kolom.map((c) => (
                  <ExcelTh
                    key={c.key}
                    label={c.label}
                    colKey={c.key}
                    values={tabel.uniqueValues[c.key] ?? []}
                    sortKey={tabel.sortKey}
                    sortDir={tabel.sortDir}
                    onSort={tabel.toggleSort}
                    activeFilter={tabel.filters[c.key]}
                    onFilterChange={tabel.setColumnFilter}
                    align={c.key === "nama" ? "left" : "right"}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tabel.rows.map((r) => (
                <Fragment key={r.key}>
                  <tr
                    onClick={() => setDetailKey((k) => (k === r.key ? null : r.key))}
                    className="cursor-pointer hover:bg-paper/60"
                  >
                    <td className="px-2 py-1.5 font-medium text-navy-900">
                      {mode === "tanggal" ? r.nama : formatTanggalPendek(r.tanggal)}
                    </td>
                    {JENIS_DOKUMEN.map((j) => (
                      <td key={j} className="px-2 py-1.5 text-right">
                        {WARNA_DOT[statusDokumen(r.row, j)]}
                      </td>
                    ))}
                    <td
                      className={`px-2 py-1.5 text-right font-semibold ${
                        r.status.status === "lengkap" ? "text-moss-700" : r.status.status === "kosong" ? "text-rust-700" : "text-gold-600"
                      }`}
                    >
                      {labelRingkasan(r.status)}
                    </td>
                  </tr>
                  {detailKey === r.key && (
                    <tr className="bg-paper/40">
                      <td colSpan={kolom.length} className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink/70">
                          <span className="font-semibold text-navy-900">
                            {r.nama} -- {r.nomor_st} ({formatTanggalPendek(r.tanggal)})
                          </span>
                          {JENIS_DOKUMEN.map((j) => {
                            const s = statusDokumen(r.row, j);
                            return (
                              <span key={j}>
                                {s === "ok" ? "✓" : s === "sebagian" ? "◐" : "✕"} {LABEL_DOKUMEN[j]}
                                {j === "dokumentasi" ? ` (${r.row.slot_dokumentasi_terisi}/5)` : ""}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- "Administrasi Saya" -- ringkasan sederhana utk petugas biasa ----------
//
// Versi ringan dari Dashboard/Monitoring pengelola: petugas biasa cuma
// perlu tahu progres SPJ miliknya sendiri (hari ini) & riwayat tanggal
// sebelumnya -- BUKAN matriks 15-30 orang. Data sumbernya SAMA (endpoint
// /api/penyisiran/spj/monitoring), tapi server sudah memfilter ke baris
// milik sendiri saja utk akun non-pengelola (lihat route.ts).

// ---------- "Kelengkapan per Jenis Dokumen" -- kartu BARU utk 1 orang ----------
//
// Beda dgn panel sejenis di SpjDashboard (di atas -- pengelola, lintas
// org, 1 tanggal terpilih): kartu ini utk SATU orang (akun SPJ yg sedang
// login), lintas SEMUA hari kerja yg dia TAG di kartu 🗓 Identifikasi
// Hari Tugas (Perencanaan Lapangan) -- PENYEBUTnya (total) = jumlah hari
// kerja yg ditag, BUKAN jumlah baris matriks spt di Dashboard pengelola.
// Lihat lib/spjMatriks.ts hitungKelengkapanPerJenis() utk definisi
// lengkap tiap jenis dokumen (termasuk ambang Dokumentasi >=3/hari yg
// BEDA dgn ambang >=5 yg dipakai statusDokumen() di Dashboard/Monitoring
// pengelola).
//
// Fetch tanggal hari kerja terpisah dari `baris` (yg didapat lewat
// useSpjMonitoring, sudah di-lift ke AdministrasiPanel) krn sumbernya API
// yg berbeda (.../spj/hari-kerja-saya, bukan .../spj/monitoring).

async function apiFetchLokal(path: string, token: string) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
  return data;
}

// Hook BERSAMA -- dulu logikanya cuma inline di dalam KelengkapanDokumenSaya,
// DIEKSTRAK (atas kebutuhan fitur baru ProgresSayaKotak di bawah, yg BUKAN
// turunan/anak KelengkapanDokumenSaya tapi tetap butuh sumber hari kerja
// yang SAMA persis) supaya tidak ada 2 fetch terpisah ke endpoint yang
// sama saat keduanya kebetulan dirender bersamaan (mis. kalau nanti kartu
// ini jg dipasang di "Ringkasan" pengelola).
function useHariKerjaSaya(token: string, onSessionExpired: () => void) {
  const [hariKerja, setHariKerja] = useState<string[]>([]);
  const [sumber, setSumber] = useState<"hari_tugas" | "fallback_st_range" | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;
    setLoading(true);
    apiFetchLokal("/api/penyisiran/spj/hari-kerja-saya", token)
      .then((data) => {
        if (batal) return;
        setHariKerja(Array.isArray(data?.tanggal) ? data.tanggal : []);
        setSumber(data?.sumber ?? null);
      })
      .catch((e) => {
        if (batal) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
        else setErrMsg(msg);
      })
      .finally(() => {
        if (!batal) setLoading(false);
      });
    return () => {
      batal = true;
    };
  }, [token, onSessionExpired]);

  return { hariKerja, sumber, loading, errMsg };
}

// ---------- "Progres Saya" -- 2 kotak (Laporan & Dokumentasi) SAMPAI HARI INI ----------
//
// BARU (atas permintaan) -- dipasang di bagian PALING ATAS tab "Monitoring
// SPJ" (lihat pemakaiannya di SpjMonitoring), MENGGANTIKAN "Progress SPJ
// Tanggal Ini" & "Kelengkapan per Jenis Dokumen" yang SEBELUMNYA ada di
// sub-tab Dashboard (sudah dihapus dari SpjDashboard). Beda mendasar dari
// 2 kartu lama itu:
//  - Lama: AGREGAT lintas SEMUA petugas, utk SATU tanggal yang dipilih
//    manual lewat date picker.
//  - Baru: PERSONAL -- SELALU tentang akun yang SEDANG LOGIN (termasuk
//    kalau yang login itu pengelola), dihitung dari hari kerja yang dia
//    TAG sendiri (sumber SAMA dgn KelengkapanDokumenSaya, lihat
//    useHariKerjaSaya) yang SUDAH LEWAT ATAU HARI INI SAJA (bukan hari
//    kerja yang dijadwalkan di masa depan) -- sesuai definisi "sampai
//    hari ini" yang diminta.
//
// HANYA 2 dari 6 jenis dokumen yang ditonjolkan di sini (Laporan &
// Dokumentasi) -- beda dari KelengkapanDokumenSaya yang menampilkan
// keenamnya -- krn cuma dua ini yang PERLU diisi ULANG tiap hari kerja
// oleh petugas ybs sendiri (Kwitansi/Surat Tugas/Visum/Surat Pernyataan
// sifatnya administratif per Surat Tugas, bukan per-hari-kerja).
export function ProgresSayaKotak({
  token,
  onSessionExpired,
  barisSaya,
  loading,
}: {
  token: string;
  onSessionExpired: () => void;
  barisSaya: BarisMatriks[];
  loading: boolean;
}) {
  const { hariKerja, loading: loadingHari, errMsg } = useHariKerjaSaya(token, onSessionExpired);

  // "Sampai hari ini" -- hariIniStr() dari file ini (browser-local),
  // KONSISTEN dgn konvensi tanggal yang sudah dipakai di seluruh file ini
  // (SpjDashboard/SpjMonitoring/AdministrasiSayaRingkasan jg pakai
  // hariIniStr() yang sama, bukan konversi WIB eksplisit spt di
  // administrasi-spj.tsx).
  const hariIni = hariIniStr();
  const hariKerjaSampaiHariIni = useMemo(() => hariKerja.filter((t) => t <= hariIni), [hariKerja, hariIni]);

  const kelengkapan = useMemo(
    () => hitungKelengkapanPerJenis(barisSaya, hariKerjaSampaiHariIni),
    [barisSaya, hariKerjaSampaiHariIni]
  );
  const progresLaporan = kelengkapan.perJenis.find((p) => p.jenis === "laporan");
  const progresDokumentasi = kelengkapan.perJenis.find((p) => p.jenis === "dokumentasi");

  const memuat = loading || loadingHari;

  if (memuat && hariKerjaSampaiHariIni.length === 0 && barisSaya.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-white p-4 text-center text-xs text-ink/40">
        Memuat progres Anda...
      </p>
    );
  }

  if (hariKerjaSampaiHariIni.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-ink/40">
        Belum ada hari kerja (sampai hari ini) yang Anda tag di kartu 🗓 Identifikasi Hari Tugas -- progres pribadi
        belum bisa dihitung.
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        <KotakProgresSaya label="Progres Laporan" data={progresLaporan} />
        <KotakProgresSaya label="Progres Dokumentasi" data={progresDokumentasi} />
      </div>
      {errMsg && <p className="mt-2 text-[11px] text-rust-700">⚠ {errMsg}</p>}
    </div>
  );
}

function KotakProgresSaya({
  label,
  data,
}: {
  label: string;
  data: { ok: number; total: number; pct: number } | undefined;
}) {
  const ok = data?.ok ?? 0;
  const total = data?.total ?? 0;
  const pct = data?.pct ?? 0;
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="text-[11px] font-semibold text-ink/60">{label}</p>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-lg font-bold text-navy-900">
          {ok}/{total}
        </span>
        <span
          className={`text-xs font-semibold ${
            pct === 100 ? "text-moss-700" : pct >= 70 ? "text-gold-600" : "text-rust-700"
          }`}
        >
          {pct}%
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full ${pct === 100 ? "bg-moss-500" : pct >= 70 ? "bg-gold-500" : "bg-rust-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function KelengkapanDokumenSaya({
  token,
  onSessionExpired,
  baris,
  loading,
}: {
  token: string;
  onSessionExpired: () => void;
  baris: BarisMatriks[];
  loading: boolean;
}) {
  const { hariKerja, sumber, loading: loadingHari, errMsg } = useHariKerjaSaya(token, onSessionExpired);

  const kelengkapan = useMemo(() => hitungKelengkapanPerJenis(baris, hariKerja), [baris, hariKerja]);

  const memuat = loading || loadingHari;

  if (memuat && hariKerja.length === 0 && baris.length === 0) {
    return <p className="rounded-lg border border-line bg-white p-6 text-center text-xs text-ink/40">Memuat data...</p>;
  }

  if (kelengkapan.totalHariKerja === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink/40">
        Belum ada hari kerja yang ditag di kartu 🗓 Identifikasi Hari Tugas (tab Perencanaan Lapangan) -- kelengkapan
        SPJ belum bisa dihitung.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="mb-1 text-xs font-semibold text-navy-900">📊 Kelengkapan per Jenis Dokumen</p>
      <p className="mb-2 text-[11px] text-ink/50">
        Dihitung dari {kelengkapan.totalHariKerja} hari kerja yang Anda tag di kartu 🗓 Identifikasi Hari Tugas.
      </p>
      {errMsg && <p className="mb-2 text-[11px] text-rust-700">⚠ {errMsg}</p>}

      {/* Ringkasan total per jenis, format ringkas 1 baris (bukan bar
          panjang) -- detail sebenarnya ada di rincian 6 ikon per hari di
          bawah, ini cuma utk orientasi cepat "yg mana paling ketinggalan". */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {kelengkapan.perJenis.map((p) => (
          <span
            key={p.jenis}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              p.pct === 100 ? "bg-moss-100/70 text-moss-700" : p.pct >= 70 ? "bg-gold-100/70 text-gold-700" : "bg-rust-100/60 text-rust-700"
            }`}
          >
            {p.label} {p.ok}/{p.total}
          </span>
        ))}
      </div>

      {/* Rincian per hari -- 6 ikon (1 per jenis dokumen), hijau+centang
          kalau lengkap (termasuk yg "otomatis lengkap" spt Kwitansi/Visum/
          Surat Pernyataan/Surat Tugas -- aturannya SAMA dgn ringkasan di
          atas, lihat hitungKelengkapanPerJenis()), merah+"Belum" kalau
          belum -- permintaan user. */}
      <div className="space-y-2">
        {kelengkapan.perHari.map((h) => (
          <div key={h.tanggal} className="rounded-md border border-line bg-paper/30 p-2">
            <p className="mb-1.5 text-[11px] font-semibold text-navy-900">
              {formatTanggalPendek(h.tanggal)}
              {!h.adaSt && <span className="ml-1.5 text-[10px] font-normal text-gold-700">-- belum tertaut ST</span>}
            </p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {JENIS_DOKUMEN.map((j) => {
                const ok = h.ok[j];
                return (
                  <div
                    key={j}
                    className={`flex flex-col items-center gap-0.5 rounded-md px-1 py-1.5 text-center ${
                      ok ? "bg-moss-100/60" : "bg-rust-100/40"
                    }`}
                  >
                    <span className="text-base leading-none">{ok ? "✅" : "❌"}</span>
                    <span className={`text-[9px] font-medium leading-tight ${ok ? "text-moss-700" : "text-rust-700"}`}>
                      {LABEL_DOKUMEN[j]}
                    </span>
                    <span className="text-[8px] text-ink/40">{ok ? "Lengkap" : "Belum"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {kelengkapan.hariTanpaSt.length > 0 && (
        <p className="mt-2.5 rounded-md bg-gold-100/40 px-2 py-1.5 text-[10px] text-gold-700">
          ⚠ {kelengkapan.hariTanpaSt.length} hari kerja yang ditag BELUM tertaut Surat Tugas apa pun:{" "}
          {kelengkapan.hariTanpaSt.map((t) => formatTanggalPendek(t)).join(", ")}. Hubungi pengelola utk menautkan
          Surat Tugas pada tanggal tsb.
        </p>
      )}
      {sumber === "fallback_st_range" && (
        <p className="mt-2 text-[10px] text-ink/40">
          Catatan: akun Tetangga/Lainnya belum py fitur tag hari kerja tersendiri -- hari kerja di atas diturunkan
          dari rentang tanggal Surat Tugas yang ditautkan ke Anda.
        </p>
      )}
    </div>
  );
}

export function AdministrasiSayaRingkasan({ baris, loading }: { baris: BarisMatriks[]; loading: boolean }) {
  const hariIni = hariIniStr();

  const barisUrut = useMemo(() => [...baris].sort((a, b) => b.tanggal.localeCompare(a.tanggal)), [baris]);
  const barisHariIni = useMemo(() => baris.find((b) => b.tanggal === hariIni) || null, [baris, hariIni]);

  const progresHariIni = useMemo(() => {
    if (!barisHariIni) return null;
    const daftarStatus = JENIS_DOKUMEN.map((j) => statusDokumen(barisHariIni, j));
    const ok = daftarStatus.filter((s) => s === "ok").length;
    return { ok, total: JENIS_DOKUMEN.length, pct: Math.round((ok / JENIS_DOKUMEN.length) * 100) };
  }, [barisHariIni]);

  if (loading && baris.length === 0) {
    return <p className="rounded-lg border border-line bg-white p-6 text-center text-xs text-ink/40">Memuat data...</p>;
  }

  if (baris.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-ink/40">
        Belum ada Surat Tugas yang ditautkan ke Anda -- belum ada data SPJ untuk ditampilkan.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-white p-3">
        <p className="mb-1.5 text-xs font-semibold text-navy-900">Progres SPJ Hari Ini ({formatTanggalPendek(hariIni)})</p>
        {!barisHariIni ? (
          <p className="text-[11px] text-ink/50">Tidak ada penugasan Surat Tugas yang berlaku untuk hari ini.</p>
        ) : (
          <>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[11px] text-ink/50">
                {progresHariIni?.ok}/{progresHariIni?.total} dokumen lengkap
              </span>
              <span className="text-[11px] font-semibold text-navy-900">{progresHariIni?.pct}%</span>
            </div>
            <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full transition-all ${progresHariIni?.pct === 100 ? "bg-moss-500" : "bg-navy-500"}`}
                style={{ width: `${progresHariIni?.pct ?? 0}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {JENIS_DOKUMEN.map((j) => {
                const s = statusDokumen(barisHariIni, j);
                return (
                  <div key={j} className="flex items-center gap-1.5 rounded-md bg-paper/50 px-2 py-1.5 text-[11px]">
                    <span>{WARNA_DOT[s]}</span>
                    <span className="text-ink/70">{LABEL_DOKUMEN[j]}</span>
                    {j === "dokumentasi" && (
                      <span className="ml-auto text-[10px] text-ink/40">{barisHariIni.slot_dokumentasi_terisi}/5</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="rounded-lg border border-line bg-white p-3">
        <p className="mb-2 text-xs font-semibold text-navy-900">Riwayat SPJ per Tanggal</p>
        <div className="flex flex-col gap-1.5">
          {barisUrut.map((b) => {
            const r = ringkasHari(b);
            return (
              <div
                key={`${b.surat_tugas_id}:${b.tanggal}`}
                className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[11px] ${
                  b.tanggal === hariIni ? "border-navy-300 bg-navy-700/5" : "border-line bg-paper/30"
                }`}
              >
                <span className="font-medium text-navy-900">
                  {formatTanggalPendek(b.tanggal)}
                  {b.tanggal === hariIni && <span className="ml-1 text-[10px] text-navy-600">(hari ini)</span>}
                </span>
                <span className="text-ink/50">{b.nomor_st}</span>
                <span
                  className={`font-semibold ${
                    r.status === "lengkap" ? "text-moss-700" : r.status === "kosong" ? "text-rust-700" : "text-gold-600"
                  }`}
                >
                  {WARNA_DOT[r.status === "lengkap" ? "ok" : r.status === "kosong" ? "kosong" : "sebagian"]} {labelRingkasan(r)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
