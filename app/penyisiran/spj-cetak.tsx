"use client";

// app/penyisiran/spj-cetak.tsx
//
// Sub-tab "Cetak SPJ" (Print Builder) di menu Administrasi -- wizard 3
// langkah (pilih petugas -> pilih tanggal -> pilih dokumen+pengelompokan)
// + halaman ringkasan sebelum generate, sesuai masukan user: ini fitur
// yang paling penting utk kebutuhan cetak nyata, jadi dibuat SATU halaman
// fleksibel (bukan tombol cetak terpisah di tiap kartu dokumen).
//
// Dipakai DUA cara:
//  - Pengelola: <SpjCetakTab pengelola token .../> -- wizard penuh, boleh
//    pilih banyak petugas.
//  - Petugas/tetangga biasa: <SpjCetakSaya token .../> -- versi SANGAT
//    disederhanakan (cuma pilih tanggal saat sudah diberi rentang default
//    dari data miliknya sendiri + dokumen apa saja yg mau dicetak), TIDAK
//    ADA dropdown pilih petugas lain -- server (app/api/penyisiran/spj/
//    cetak/route.ts) jg memaksa ini di sisi backend, bukan cuma di UI.
//
// Backend (POST /api/penyisiran/spj/cetak) yg menyusun ulang PDF sesuai
// urutan standar SPJ terkunci -- lihat komentar lengkap di route itu &
// lib/spjMatriks.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarisMatriks,
  JENIS_DOKUMEN,
  JenisDokumen,
  LABEL_DOKUMEN,
  URUTAN_CETAK_STANDAR,
  statusDokumen,
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

// Unduh hasil generate (PDF/ZIP) -- pola SAMA dgn tombol unduh PDF lain di
// menu ini (fetch manual + blob + elemen <a> sintetis, BUKAN window.open
// langsung) krn butuh header Authorization & supaya tidak diblokir popup
// blocker (window.open sesudah await fetch async sering dianggap browser
// bukan hasil klik langsung).
async function unduhHasilCetak(token: string, payload: Record<string, unknown>): Promise<string | null> {
  const res = await fetch("/api/penyisiran/spj/cetak", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Gagal (${res.status})`);
  }
  const contentDisposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(contentDisposition);
  const namaFile = match?.[1] || (res.headers.get("Content-Type") === "application/zip" ? "SPJ.zip" : "SPJ.pdf");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = namaFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return namaFile;
}

// ---------- Pengelola: wizard penuh ----------

interface PetugasOpsi {
  jenis: "penyisiran" | "tetangga";
  id: number;
  nama: string;
  label: string;
}

type Pengelompokan = "per_orang" | "per_tanggal" | "per_jenis" | "gabung";
const LABEL_PENGELOMPOKAN: Record<Pengelompokan, string> = {
  per_orang: "PDF per orang",
  per_tanggal: "PDF per tanggal",
  per_jenis: "PDF per jenis dokumen",
  gabung: "Gabungkan semua jadi 1 PDF",
};
const KETERANGAN_PENGELOMPOKAN: Record<Pengelompokan, string> = {
  per_orang: "1 file PDF per petugas (semua tanggal & dokumen terpilih digabung jadi 1 file per orang).",
  per_tanggal: "1 file PDF per tanggal (semua petugas terpilih pada tanggal itu digabung jadi 1 file).",
  per_jenis: "1 file PDF per jenis dokumen (mis. semua Kwitansi jadi 1 file, semua Visum jadi 1 file lain).",
  gabung: "Semua petugas, semua tanggal, semua dokumen terpilih digabung jadi 1 file PDF saja.",
};

export function SpjCetakTab({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [langkah, setLangkah] = useState<1 | 2 | 3 | 4>(1);
  const [petugasOptions, setPetugasOptions] = useState<PetugasOpsi[]>([]);
  const [matriks, setMatriks] = useState<BarisMatriks[]>([]);
  const [loadingAwal, setLoadingAwal] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [petugasDipilih, setPetugasDipilih] = useState<Set<string>>(new Set());
  const [cariPetugas, setCariPetugas] = useState("");
  const [tanggalMulai, setTanggalMulai] = useState(hariIniStr());
  const [tanggalSelesai, setTanggalSelesai] = useState(hariIniStr());
  const [dokumenDipilih, setDokumenDipilih] = useState<Set<JenisDokumen>>(new Set(JENIS_DOKUMEN));
  const [pengelompokan, setPengelompokan] = useState<Pengelompokan>("per_orang");
  const [generating, setGenerating] = useState(false);
  const [hasilInfo, setHasilInfo] = useState<string | null>(null);

  const guardError = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
      else setErrMsg(msg);
    },
    [onSessionExpired]
  );

  useEffect(() => {
    setLoadingAwal(true);
    Promise.all([apiFetch("/api/penyisiran/spj/petugas-list", token), apiFetch("/api/penyisiran/spj/monitoring", token)])
      .then(([petugasData, monitoringData]) => {
        setPetugasOptions(Array.isArray(petugasData?.petugas) ? petugasData.petugas : []);
        setMatriks(Array.isArray(monitoringData?.baris) ? monitoringData.baris : []);
      })
      .catch(guardError)
      .finally(() => setLoadingAwal(false));
  }, [token, guardError]);

  function togglePetugas(key: string) {
    setPetugasDipilih((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleDokumen(j: JenisDokumen) {
    setDokumenDipilih((prev) => {
      const next = new Set(prev);
      if (next.has(j)) next.delete(j);
      else next.add(j);
      return next;
    });
  }

  const petugasTertampil = useMemo(() => {
    const q = cariPetugas.trim().toLowerCase();
    return petugasOptions.filter((p) => !q || p.nama.toLowerCase().includes(q));
  }, [petugasOptions, cariPetugas]);

  // Preview: dari matriks yg sudah dimuat, hitung berapa dokumen yg
  // TERSEDIA vs BELUM ADA utk kombinasi petugas+tanggal+jenis dokumen yg
  // sedang dipilih -- supaya pengelola tahu perkiraan hasil SEBELUM klik
  // generate (mencegah salah cetak, sesuai masukan user "Preview Susunan").
  const preview = useMemo(() => {
    const barisTerpilih = matriks.filter(
      (b) => petugasDipilih.has(kunciPetugas(b)) && b.tanggal >= tanggalMulai && b.tanggal <= tanggalSelesai
    );
    const petugasUnik = new Set(barisTerpilih.map((b) => kunciPetugas(b)));
    const jenisTerpilihUrut = URUTAN_CETAK_STANDAR.filter((j) => dokumenDipilih.has(j));
    // Dokumen tingkat-perjalanan (kwitansi/surat_tugas/visum/surat_keterangan)
    // dihitung SEKALI per (petugas, ST), bukan per baris harian -- dedupe dulu.
    const perAssignment = new Map<string, BarisMatriks>();
    for (const b of barisTerpilih) perAssignment.set(`${kunciPetugas(b)}:${b.surat_tugas_id}`, b);
    const assignmentUnik = Array.from(perAssignment.values());

    let tersedia = 0;
    let belumAda = 0;
    for (const j of jenisTerpilihUrut) {
      const isHarian = j === "laporan" || j === "dokumentasi";
      const sumber = isHarian ? barisTerpilih : assignmentUnik;
      for (const b of sumber) {
        if (statusDokumen(b, j) === "ok" || (j === "dokumentasi" && statusDokumen(b, j) === "sebagian")) tersedia++;
        else belumAda++;
      }
    }
    return { jumlahPetugas: petugasUnik.size, jumlahDokumenJenis: jenisTerpilihUrut.length, tersedia, belumAda };
  }, [matriks, petugasDipilih, tanggalMulai, tanggalSelesai, dokumenDipilih]);

  async function handleGenerate() {
    setGenerating(true);
    setErrMsg(null);
    setHasilInfo(null);
    try {
      const nama = await unduhHasilCetak(token, {
        petugas: Array.from(petugasDipilih).map((key) => {
          const [jenis, idStr] = key.split(":");
          return { jenis, id: Number(idStr) };
        }),
        tanggal_mulai: tanggalMulai,
        tanggal_selesai: tanggalSelesai,
        dokumen: Array.from(dokumenDipilih),
        pengelompokan,
      });
      setHasilInfo(`Berhasil diunduh: ${nama}`);
    } catch (e) {
      guardError(e);
    } finally {
      setGenerating(false);
    }
  }

  if (loadingAwal) {
    return <p className="rounded-lg border border-line bg-white p-6 text-center text-xs text-ink/40">Memuat data...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-white p-2.5">
        {(["Pilih Petugas", "Pilih Tanggal", "Pilih Dokumen", "Ringkasan"] as const).map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3 | 4;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setLangkah(n)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                langkah === n ? "bg-navy-700 text-white" : "text-ink/50 hover:text-navy-700"
              }`}
            >
              {n}. {label}
            </button>
          );
        })}
      </div>

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}
      {hasilInfo && (
        <p className="rounded-lg border border-moss-200 bg-moss-100/40 p-3 text-xs text-moss-700">✅ {hasilInfo}</p>
      )}

      {langkah === 1 && (
        <div className="rounded-lg border border-line bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-navy-900">Langkah 1 -- Pilih Petugas</p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={cariPetugas}
              onChange={(e) => setCariPetugas(e.target.value)}
              placeholder="Cari nama..."
              className="min-w-[160px] flex-1 rounded-md border border-line px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => setPetugasDipilih(new Set(petugasOptions.map((p) => `${p.jenis}:${p.id}`)))}
              className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400"
            >
              Pilih Semua
            </button>
            <button
              type="button"
              onClick={() => setPetugasDipilih(new Set())}
              className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink/60 hover:border-navy-400"
            >
              Kosongkan
            </button>
            <span className="text-[11px] text-ink/40">{petugasDipilih.size} dipilih</span>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border border-line">
            {petugasTertampil.map((p) => {
              const key = `${p.jenis}:${p.id}`;
              return (
                <label key={key} className="flex items-center gap-2 border-b border-line px-2.5 py-1.5 text-xs last:border-b-0 hover:bg-paper/60">
                  <input type="checkbox" checked={petugasDipilih.has(key)} onChange={() => togglePetugas(key)} />
                  {p.label}
                </label>
              );
            })}
            {petugasTertampil.length === 0 && <p className="p-3 text-center text-[11px] text-ink/40">Tidak ada hasil.</p>}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setLangkah(2)}
              disabled={petugasDipilih.size === 0}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-50"
            >
              Lanjut ke Pilih Tanggal →
            </button>
          </div>
        </div>
      )}

      {langkah === 2 && (
        <div className="rounded-lg border border-line bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-navy-900">Langkah 2 -- Pilih Tanggal</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setTanggalMulai(hariIniStr());
                setTanggalSelesai(hariIniStr());
              }}
              className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-ink/60 hover:border-navy-400"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => {
                setTanggalMulai(tambahHari(hariIniStr(), -6));
                setTanggalSelesai(hariIniStr());
              }}
              className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-ink/60 hover:border-navy-400"
            >
              7 Hari Terakhir
            </button>
            {matriks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const tanggalList = matriks.map((b) => b.tanggal).sort();
                  setTanggalMulai(tanggalList[0]);
                  setTanggalSelesai(tanggalList[tanggalList.length - 1]);
                }}
                className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-ink/60 hover:border-navy-400"
              >
                Semua Tanggal
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              <label className="mb-1 block text-[10px] font-medium text-ink/50">Tanggal Akhir</label>
              <input
                type="date"
                value={tanggalSelesai}
                min={tanggalMulai}
                onChange={(e) => setTanggalSelesai(e.target.value)}
                className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-between">
            <button type="button" onClick={() => setLangkah(1)} className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-navy-400">
              ← Kembali
            </button>
            <button
              type="button"
              onClick={() => setLangkah(3)}
              disabled={!tanggalMulai || !tanggalSelesai || tanggalMulai > tanggalSelesai}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-50"
            >
              Lanjut ke Pilih Dokumen →
            </button>
          </div>
        </div>
      )}

      {langkah === 3 && (
        <div className="rounded-lg border border-line bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-navy-900">Langkah 3 -- Pilih Dokumen &amp; Pengelompokan</p>
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/50">Dokumen yang Dicetak</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDokumenDipilih(new Set(JENIS_DOKUMEN))}
                  className="text-[11px] font-medium text-navy-700 hover:underline"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={() => setDokumenDipilih(new Set())}
                  className="text-[11px] font-medium text-ink/60 hover:underline"
                >
                  Kosongkan
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {URUTAN_CETAK_STANDAR.map((j) => (
                <label key={j} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs hover:bg-paper/60">
                  <input type="checkbox" checked={dokumenDipilih.has(j)} onChange={() => toggleDokumen(j)} />
                  {LABEL_DOKUMEN[j]}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-ink/40">
              Urutan halaman di PDF hasil SELALU mengikuti standar SPJ (Kwitansi → Surat Tugas → Visum → Laporan →
              Dokumentasi → Surat Pernyataan), apa pun urutan Anda mencentang di atas.
            </p>
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink/50">Susunan Hasil PDF</span>
            <div className="space-y-1.5">
              {(Object.keys(LABEL_PENGELOMPOKAN) as Pengelompokan[]).map((m) => (
                <label
                  key={m}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                    pengelompokan === m ? "border-navy-400 bg-navy-700/5" : "border-line hover:bg-paper/60"
                  }`}
                >
                  <input type="radio" name="pengelompokan" checked={pengelompokan === m} onChange={() => setPengelompokan(m)} className="mt-0.5" />
                  <span>
                    <span className="block font-medium text-navy-900">{LABEL_PENGELOMPOKAN[m]}</span>
                    <span className="block text-[10px] text-ink/50">{KETERANGAN_PENGELOMPOKAN[m]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-3 flex justify-between">
            <button type="button" onClick={() => setLangkah(2)} className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-navy-400">
              ← Kembali
            </button>
            <button
              type="button"
              onClick={() => setLangkah(4)}
              disabled={dokumenDipilih.size === 0}
              className="rounded-md bg-navy-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-50"
            >
              Lihat Ringkasan →
            </button>
          </div>
        </div>
      )}

      {langkah === 4 && (
        <div className="rounded-lg border border-line bg-white p-3">
          <p className="mb-2 text-xs font-semibold text-navy-900">Ringkasan Cetak</p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
            <Ringkas label="Petugas" nilai={`${preview.jumlahPetugas} orang`} />
            <Ringkas label="Tanggal" nilai={`${formatTanggalPendek(tanggalMulai)} s/d ${formatTanggalPendek(tanggalSelesai)}`} />
            <Ringkas label="Jenis Dokumen" nilai={`${preview.jumlahDokumenJenis} jenis`} />
            <Ringkas label="Mode Hasil" nilai={LABEL_PENGELOMPOKAN[pengelompokan]} />
          </dl>

          <div className="mt-3 rounded-md border border-line bg-paper/40 p-2.5 text-xs">
            <p className="mb-1 font-semibold text-navy-900">Perkiraan Dokumen</p>
            <p className="text-moss-700">✓ {preview.tersedia} dokumen tersedia &amp; akan ikut dicetak</p>
            {preview.belumAda > 0 && (
              <p className="mt-0.5 text-rust-700">
                ⚠ {preview.belumAda} dokumen BELUM ADA di sistem -- akan dilewati (daftarnya disertakan dlm file
                "_dokumen_dilewati.txt" kalau hasilnya berupa ZIP).
              </p>
            )}
          </div>

          <p className="mt-2 text-[10px] text-ink/40">
            Urutan tercetak: {URUTAN_CETAK_STANDAR.filter((j) => dokumenDipilih.has(j)).map((j) => LABEL_DOKUMEN[j]).join(" → ")}
          </p>

          <div className="mt-3 flex justify-between">
            <button type="button" onClick={() => setLangkah(3)} className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-navy-400">
              ← Kembali
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || preview.tersedia === 0}
              className="rounded-md bg-navy-700 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-50"
            >
              {generating ? "Menyusun PDF..." : "🖨️ Generate PDF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Ringkas({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex justify-between border-b border-line py-1 sm:justify-start sm:gap-2 sm:border-0 sm:py-0">
      <dt className="text-ink/50">{label}</dt>
      <dd className="font-medium text-navy-900">{nilai}</dd>
    </div>
  );
}

// ---------- Petugas/tetangga biasa: "Cetak SPJ Saya" (sangat sederhana) ----------

export function SpjCetakSaya({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [matriks, setMatriks] = useState<BarisMatriks[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [tanggalMulai, setTanggalMulai] = useState(hariIniStr());
  const [tanggalSelesai, setTanggalSelesai] = useState(hariIniStr());
  const [dokumenDipilih, setDokumenDipilih] = useState<Set<JenisDokumen>>(new Set(JENIS_DOKUMEN));
  const [generating, setGenerating] = useState(false);
  const [hasilInfo, setHasilInfo] = useState<string | null>(null);

  const guardError = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) onSessionExpired();
      else setErrMsg(msg);
    },
    [onSessionExpired]
  );

  useEffect(() => {
    apiFetch("/api/penyisiran/spj/monitoring", token)
      .then((d) => {
        const baris: BarisMatriks[] = Array.isArray(d?.baris) ? d.baris : [];
        setMatriks(baris);
        if (baris.length > 0) {
          const tanggalList = baris.map((b) => b.tanggal).sort();
          setTanggalMulai(tanggalList[0]);
          setTanggalSelesai(tanggalList[tanggalList.length - 1]);
        }
      })
      .catch(guardError)
      .finally(() => setLoading(false));
  }, [token, guardError]);

  function toggleDokumen(j: JenisDokumen) {
    setDokumenDipilih((prev) => {
      const next = new Set(prev);
      if (next.has(j)) next.delete(j);
      else next.add(j);
      return next;
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    setErrMsg(null);
    setHasilInfo(null);
    try {
      const nama = await unduhHasilCetak(token, {
        tanggal_mulai: tanggalMulai,
        tanggal_selesai: tanggalSelesai,
        dokumen: Array.from(dokumenDipilih),
        pengelompokan: "gabung",
      });
      setHasilInfo(`Berhasil diunduh: ${nama}`);
    } catch (e) {
      guardError(e);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <p className="rounded-lg border border-line bg-white p-6 text-center text-xs text-ink/40">Memuat data...</p>;

  if (matriks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-ink/40">
        Belum ada Surat Tugas yang ditautkan ke Anda -- Cetak SPJ baru bisa dipakai setelah pengelola menautkan Surat
        Tugas Anda.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="mb-2 text-xs font-semibold text-navy-900">🖨️ Cetak SPJ Saya</p>
      {errMsg && <p className="mb-2 rounded-md border border-rust-100 bg-rust-100/40 p-2 text-xs text-rust-700">⚠ {errMsg}</p>}
      {hasilInfo && <p className="mb-2 rounded-md border border-moss-200 bg-moss-100/40 p-2 text-xs text-moss-700">✅ {hasilInfo}</p>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/50">Tanggal Mulai</label>
          <input type="date" value={tanggalMulai} onChange={(e) => setTanggalMulai(e.target.value)} className="w-full rounded-md border border-line px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-ink/50">Tanggal Akhir</label>
          <input type="date" value={tanggalSelesai} min={tanggalMulai} onChange={(e) => setTanggalSelesai(e.target.value)} className="w-full rounded-md border border-line px-2 py-1.5 text-xs" />
        </div>
      </div>

      <div className="mt-2">
        <span className="mb-1 block text-[10px] font-medium text-ink/50">Dokumen yang Dicetak</span>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {URUTAN_CETAK_STANDAR.map((j) => (
            <label key={j} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs hover:bg-paper/60">
              <input type="checkbox" checked={dokumenDipilih.has(j)} onChange={() => toggleDokumen(j)} />
              {LABEL_DOKUMEN[j]}
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating || dokumenDipilih.size === 0 || !tanggalMulai || !tanggalSelesai || tanggalMulai > tanggalSelesai}
        className="mt-3 w-full rounded-md bg-navy-700 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-900 disabled:opacity-50"
      >
        {generating ? "Menyusun PDF..." : "🖨️ Cetak SPJ Saya"}
      </button>
      <p className="mt-1.5 text-[10px] text-ink/40">Dokumen yang belum diisi/diupload akan otomatis dilewati.</p>
    </div>
  );
}
