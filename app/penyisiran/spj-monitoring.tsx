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
  WARNA_DOT,
  statusDokumen,
  ringkasHari,
  labelRingkasan,
  kunciPetugas,
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
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const data = await apiFetch("/api/penyisiran/spj/monitoring", token);
      setPengelola(!!data?.pengelola);
      setBaris(Array.isArray(data?.baris) ? data.baris : []);
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

  return { baris, pengelola, loading, errMsg, muat };
}

// ---------- Dashboard ----------

export function SpjDashboard({ baris, loading }: { baris: BarisMatriks[]; loading: boolean }) {
  const [tanggal, setTanggal] = useState(hariIniStr());

  const barisHariIni = useMemo(() => baris.filter((b) => b.tanggal === tanggal), [baris, tanggal]);

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
    const perJenis = JENIS_DOKUMEN.map((j) => {
      const ok = daftar.filter((b) => statusDokumen(b, j) === "ok").length;
      return { jenis: j, ok, total: daftar.length };
    });
    const totalDokumen = daftar.length * JENIS_DOKUMEN.length;
    const totalOk = perJenis.reduce((s, p) => s + p.ok, 0);
    return { totalPetugas: daftar.length, lengkap, kurang, kosong, perJenis, totalDokumen, totalOk };
  }, [barisHariIni]);

  const pctProgress = ringkasan.totalDokumen > 0 ? Math.round((ringkasan.totalOk / ringkasan.totalDokumen) * 100) : 0;

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

          <div className="rounded-lg border border-line bg-white p-3">
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-xs font-semibold text-navy-900">Progress SPJ Tanggal Ini</p>
              <p className="text-xs text-ink/50">
                {ringkasan.totalOk}/{ringkasan.totalDokumen} dokumen ({pctProgress}%)
              </p>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full transition-all ${pctProgress === 100 ? "bg-moss-500" : "bg-navy-500"}`}
                style={{ width: `${pctProgress}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-ink/40">
              {ringkasan.totalPetugas} petugas × {JENIS_DOKUMEN.length} dokumen = {ringkasan.totalDokumen} dokumen yang
              harus tersedia.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-white p-3">
            <p className="mb-2 text-xs font-semibold text-navy-900">Kelengkapan per Jenis Dokumen</p>
            <p className="mb-2 text-[11px] text-ink/50">Dokumen dengan persentase paling rendah = bottleneck.</p>
            <div className="space-y-2">
              {ringkasan.perJenis.map((p) => {
                const pct = p.total > 0 ? Math.round((p.ok / p.total) * 100) : 0;
                return (
                  <div key={p.jenis}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-ink/70">{LABEL_DOKUMEN[p.jenis]}</span>
                      <span className="text-ink/50">
                        {p.ok}/{p.total}
                      </span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div
                        className={`h-full rounded-full ${pct === 100 ? "bg-moss-500" : pct >= 70 ? "bg-gold-500" : "bg-rust-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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

export function SpjMonitoring({ baris, loading }: { baris: BarisMatriks[]; loading: boolean }) {
  const [mode, setMode] = useState<"tanggal" | "petugas">("tanggal");
  const [tanggal, setTanggal] = useState(hariIniStr());
  const [petugasKey, setPetugasKey] = useState<string>("");
  const [detailKey, setDetailKey] = useState<string | null>(null);

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
