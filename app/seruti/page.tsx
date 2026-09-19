"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import NeracaRtCalculator from "./neraca-calculator";
import AnomaliCepatTab from "./anomali-cepat";
import AnomaliCepatAiTab from "./anomali-cepat-ai";
import KonfirmasiPplTab from "./konfirmasi-ppl";
import MonitoringAnomaliTab from "./monitoring-anomali";
import RekapTemuanTab from "./rekap-temuan";
import ErrorKonsistensiTab from "./error-konsistensi";
// Komponen header tabel "layaknya Excel" (urutkan & filter per kolom) --
// aslinya dibuat utk tab Penyisiran (app/penyisiran/_shared/excel-table.tsx)
// tapi murni komponen UI generik (tidak py logika spesifik Penyisiran),
// jadi dipakai ulang di sini drpd bikin salinan baru.
import { useExcelTable, ExcelTh } from "../penyisiran/_shared/excel-table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Status = "belum_didata" | "selesai_didata" | "selesai_dibersihkan";

const STATUS_LABEL: Record<Status, string> = {
  belum_didata: "Belum Didata",
  selesai_didata: "Selesai Didata",
  selesai_dibersihkan: "Selesai Dibersihkan",
};

// Warna status: hijau = selesai dibersihkan, kuning = selesai didata,
// oren = belum didata (tidak non respon), merah = belum didata (non respon)
const WARNA = {
  hijau: { bg: "bg-moss-100", text: "text-moss-700", hex: "#3F7D58" },
  kuning: { bg: "bg-[#FAF0C5]", text: "text-[#8A6A12]", hex: "#D9B92C" },
  oren: { bg: "bg-gold-100", text: "text-gold-600", hex: "#C08829" },
  merah: { bg: "bg-rust-100", text: "text-rust-700", hex: "#A6432D" },
  abu: { bg: "bg-line", text: "text-ink/60", hex: "#DEDBD3" },
};

function warnaStatus(status: Status, nonRespon: boolean | null) {
  if (status === "selesai_dibersihkan") return WARNA.hijau;
  if (status === "selesai_didata") return WARNA.kuning;
  if (nonRespon === true) return WARNA.merah;
  if (nonRespon === false) return WARNA.oren;
  return WARNA.abu; // belum diidentifikasi sama sekali
}

// Periode pendataan Seruti Triwulan III 2026
const TANGGAL_MULAI = new Date(2026, 8, 7); // 7 September 2026
const TANGGAL_AKHIR = new Date(2026, 8, 14); // 14 September 2026

function daysBetween(a: Date, b: Date) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

function formatWaktuWIB(iso: string | null | undefined): string {
  if (!iso) return "belum pernah diupdate";
  const d = new Date(iso);
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const dd = String(wib.getUTCDate()).padStart(2, "0");
  const mm = String(wib.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = wib.getUTCFullYear();
  const hh = String(wib.getUTCHours()).padStart(2, "0");
  const min = String(wib.getUTCMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} pukul ${hh}:${min} WIB`;
}

// Batas akhir periode monitoring harian (2 hari setelah batas pendataan, untuk buffer pengumpulan dokumen)
const BATAS_MONITORING_HARIAN = new Date(2026, 8, 16); // 16 September 2026

function wibDateParts(d: Date) {
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return { y: wib.getUTCFullYear(), m: wib.getUTCMonth(), day: wib.getUTCDate() };
}

function sudahUpdateHariIni(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const a = wibDateParts(new Date(iso));
  const b = wibDateParts(new Date());
  return a.y === b.y && a.m === b.m && a.day === b.day;
}

interface JorongOption {
  jorong_id: string;
  nama_jorong: string;
  nama_ppl: string;
}

interface Sampel {
  id: string;
  nomor_urut: number;
  status: Status;
  potensi_non_respon: boolean | null;
  updated_at: string | null;
}

interface ProgressRow {
  ppl_id: string;
  nama_ppl: string;
  nama_jorong: string;
  nama_nagari: string;
  kecamatan: string;
  selesai_didata: number;
  selesai_dibersihkan: number;
  belum_didata: number;
  belum_diidentifikasi: number;
  belum_didata_bukan_nonrespon: number;
  potensi_non_respon: number;
  total: number;
  last_updated: string | null;
}

export default function SerutiPage() {
  const [tab, setTab] = useState<
    | "form"
    | "rekap"
    | "kalkulator"
    | "anomali"
    | "anomaliai"
    | "konfirmasi"
    | "monitoring"
    | "rekaptemuan"
    | "errorkonsistensi"
  >("form");

  const { daysLeft, totalPeriodDays, idealPercent } = useMemo(() => {
    const today = new Date();
    const total = daysBetween(TANGGAL_MULAI, TANGGAL_AKHIR) + 1;
    const elapsed = Math.min(
      total,
      Math.max(0, daysBetween(TANGGAL_MULAI, today) + 1)
    );
    const left = Math.max(0, daysBetween(today, TANGGAL_AKHIR) + 1);
    return {
      daysLeft: left,
      totalPeriodDays: total,
      idealPercent: total > 0 ? elapsed / total : 0,
    };
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-6">
      <p className="font-sans text-[13px] font-black italic tracking-tight text-navy-900">
        BADAN PUSAT STATISTIK KABUPATEN SOLOK
      </p>
      <p className="mt-0.5 text-xs font-medium text-navy-400">
        Susenas September &middot; Seruti Triwulan III 2026
      </p>
      <h1 className="mt-1 whitespace-nowrap text-lg font-bold text-navy-900 sm:text-xl">
        Progress Pendataan Sampel
      </h1>

      <div className="mt-3 rounded-lg bg-rust-100 px-3 py-2 text-xs leading-snug text-rust-700 sm:text-sm">
        {daysLeft > 0 ? (
          <>
            <span className="font-semibold">
              Sisa waktu {daysLeft} hari lagi.
            </span>{" "}
            Batas akhir pendataan: <strong>14 September 2026</strong>.
          </>
        ) : (
          <span className="font-semibold">
            Waktu pendataan sudah berakhir (batas: 14 September 2026).
          </span>
        )}
      </div>

      <div className="mt-2 rounded-lg border border-moss-500 bg-moss-100 px-3 py-2 text-xs leading-snug text-moss-700 sm:text-sm">
        <p className="font-bold">
          Terima kasih telah mengumpulkan 2 dokumen pendataan!
        </p>
        <p className="mt-0.5">
          Dokumen sedang diolah dan dilakukan pengecekan anomali &mdash; silakan konfirmasi
          temuan anomali di tab &quot;Konfirmasi PPL&quot; di bawah.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-9">
        <TabButton active={tab === "form"} onClick={() => setTab("form")} icon={<IconFormulir />}>
          Formulir Identifikasi
        </TabButton>
        <TabButton active={tab === "rekap"} onClick={() => setTab("rekap")} icon={<IconRekap />}>
          Rekapitulasi
        </TabButton>
        <TabButton active={tab === "kalkulator"} onClick={() => setTab("kalkulator")} icon={<IconKalkulator />}>
          Kalkulator Blok V
        </TabButton>
        <TabButton active={tab === "anomali"} onClick={() => setTab("anomali")} icon={<IconAnomali />}>
          Anomali Cepat
        </TabButton>
        <TabButton active={tab === "anomaliai"} onClick={() => setTab("anomaliai")} icon={<IconAnomaliAi />}>
          Anomali Cepat AI
        </TabButton>
        <TabButton
          active={tab === "konfirmasi"}
          onClick={() => setTab("konfirmasi")}
          icon={<IconKonfirmasi />}
          highlight
        >
          Konfirmasi PPL
        </TabButton>
        <TabButton active={tab === "monitoring"} onClick={() => setTab("monitoring")} icon={<IconMonitoring />}>
          Monitoring Anomali
        </TabButton>
        <TabButton active={tab === "rekaptemuan"} onClick={() => setTab("rekaptemuan")} icon={<IconRekapTemuan />}>
          Rekap Temuan
        </TabButton>
        <TabButton
          active={tab === "errorkonsistensi"}
          onClick={() => setTab("errorkonsistensi")}
          icon={<IconErrorKonsistensi />}
          highlight
        >
          Error Konsistensi
        </TabButton>
      </div>

      <div className="mt-6">
        {tab === "form" && <FormulirTab />}
        {tab === "rekap" && (
          <RekapTab idealPercent={idealPercent} totalPeriodDays={totalPeriodDays} />
        )}
        {tab === "kalkulator" && <NeracaRtCalculator />}
        {tab === "anomali" && <AnomaliCepatTab />}
        {tab === "anomaliai" && <AnomaliCepatAiTab />}
        {tab === "konfirmasi" && <KonfirmasiPplTab />}
        {tab === "monitoring" && <MonitoringAnomaliTab />}
        {tab === "rekaptemuan" && <RekapTemuanTab />}
        {tab === "errorkonsistensi" && <ErrorKonsistensiTab />}
      </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex min-h-[56px] flex-col items-center justify-center gap-1 border-b-2 px-1 py-1.5 text-center text-[10.5px] font-medium leading-tight transition sm:text-xs ${
        active
          ? "border-navy-700 bg-white text-navy-900"
          : highlight
          ? "border-transparent bg-rust-100 text-rust-700 hover:text-rust-700"
          : "border-transparent bg-white text-ink/50 hover:text-ink"
      }`}
    >
      {highlight && (
        <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rust-500 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rust-700" />
        </span>
      )}
      <span className={active ? "text-navy-700" : highlight ? "text-rust-500" : "text-ink/40"}>
        {icon}
      </span>
      {children}
    </button>
  );
}

function IconFormulir() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="5" y="4" width="14" height="17" rx="2" strokeLinejoin="round" />
      <path d="M9 3.5h6a1 1 0 011 1V6H8V4.5a1 1 0 011-1z" strokeLinejoin="round" />
      <path d="M8.5 12.5l2 2 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 16.5h7" strokeLinecap="round" />
    </svg>
  );
}

function IconRekap() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 20V10M10 20V4M16 20v-7M20.5 20H3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconKalkulator() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="5" y="3.5" width="14" height="17" rx="2" strokeLinejoin="round" />
      <path d="M7.5 7.5h9" strokeLinecap="round" />
      <path d="M7.5 12h1.6M11.2 12h1.6M14.9 12h1.6M7.5 15.5h1.6M11.2 15.5h1.6M14.9 15.5v3M7.5 19h1.6M11.2 19h1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconAnomali() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 8a2 2 0 012-2h1.2l.9-1.4A1 1 0 019 4h6a1 1 0 01.9.6L16.8 6H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

function IconAnomaliAi() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3.5l1.2 2.6 2.6 1.2-2.6 1.2L12 11l-1.2-2.5-2.6-1.2 2.6-1.2L12 3.5z" strokeLinejoin="round" />
      <rect x="4.5" y="12" width="15" height="8.5" rx="2" strokeLinejoin="round" />
      <path d="M8.5 16.25h.01M15.5 16.25h.01" strokeLinecap="round" />
      <path d="M8 19h8" strokeLinecap="round" />
    </svg>
  );
}

function IconKonfirmasi() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="3.5" width="16" height="17" rx="2" strokeLinejoin="round" />
      <path d="M8 8.5h8M8 12h8M8 15.5h5" strokeLinecap="round" />
      <path d="M8.5 8.5l1.5 1.5 2.5-2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMonitoring() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="4" width="17" height="16" rx="2" strokeLinejoin="round" />
      <path d="M7 9h3M7 12.5h3M7 16h3" strokeLinecap="round" />
      <path d="M14 9.5l1.5 1.5 2.5-2.8M13.5 15.5h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconRekapTemuan() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 5.5a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-4 3.5v-3.5H6a2 2 0 01-2-2v-9z" strokeLinejoin="round" />
      <path d="M7.5 8.5h9M7.5 12h6" strokeLinecap="round" />
    </svg>
  );
}

function IconErrorKonsistensi() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3l9 16H3l9-16z" strokeLinejoin="round" />
      <path d="M12 9.5v4" strokeLinecap="round" />
      <circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FormulirTab() {
  const supabase = createClient();

  const [options, setOptions] = useState<JorongOption[]>([]);
  const [jorongId, setJorongId] = useState("");
  const [sampelList, setSampelList] = useState<Sampel[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSampel, setLoadingSampel] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      const { data } = await supabase
        .from("seruti_ppl")
        .select("jorong_id, nama, jorong:jorong_id(nama_jorong)")
        .order("nama");
      const mapped: JorongOption[] = (data ?? []).map((row: any) => ({
        jorong_id: row.jorong_id,
        nama_jorong: row.jorong?.nama_jorong ?? "-",
        nama_ppl: row.nama,
      }));
      setOptions(mapped);
      setLoadingOptions(false);
    }
    loadOptions();
  }, [supabase]);

  // Selalu ambil data terbaru dari server - update terbaru menimpa yang lama otomatis
  async function loadSampel(id: string) {
    setJorongId(id);
    setLoadingSampel(true);
    const { data } = await supabase
      .from("seruti_sampel")
      .select("id, nomor_urut, status, potensi_non_respon, updated_at")
      .eq("jorong_id", id)
      .order("nomor_urut");
    setSampelList(data ?? []);
    setDirty(false);
    setSavedMessage(false);
    setLoadingSampel(false);
  }

  function editLocal(
    sampelId: string,
    patch: Partial<Pick<Sampel, "status" | "potensi_non_respon">>
  ) {
    setSampelList((prev) =>
      prev.map((s) => (s.id === sampelId ? { ...s, ...patch } : s))
    );
    setDirty(true);
    setSavedMessage(false);
  }

  async function submitJorong() {
    setSubmitting(true);

    const { data: pplRow } = await supabase
      .from("seruti_ppl")
      .select("id")
      .eq("jorong_id", jorongId)
      .maybeSingle();

    // Setiap submit menimpa penuh nilai status/non-respon yang tersimpan (last write wins)
    await Promise.all(
      sampelList.map((s) =>
        supabase
          .from("seruti_sampel")
          .update({
            status: s.status,
            potensi_non_respon:
              s.status === "belum_didata" ? s.potensi_non_respon : null,
            updated_by_ppl_id: pplRow?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", s.id)
      )
    );

    // Re-fetch supaya tampilan selalu mencerminkan data terbaru di server
    await loadSampel(jorongId);
    setSubmitting(false);
    setSavedMessage(true);
  }

  const selected = options.find((o) => o.jorong_id === jorongId);
  const selesai = sampelList.filter((s) => s.status !== "belum_didata").length;
  const belumTeridentifikasi = sampelList.filter(
    (s) => s.status === "belum_didata" && s.potensi_non_respon === null
  );

  return (
    <div>
      <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
        <p className="text-sm text-ink/70">
          Pilih Jorong untuk melihat dan memperbarui status 10 sampel Ruta.
        </p>

        <div className="mt-4">
          <label className="text-sm font-medium text-ink">Pilih Jorong</label>
          <select
            value={jorongId}
            onChange={(e) => loadSampel(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          >
            <option value="">
              {loadingOptions ? "Memuat..." : "Pilih Jorong"}
            </option>
            {options.map((o) => (
              <option key={o.jorong_id} value={o.jorong_id}>
                {o.nama_jorong}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected && (
        <p className="mt-3 text-sm text-ink/70">
          Petugas (PPL): <span className="font-medium text-ink">{selected.nama_ppl}</span>
        </p>
      )}
      {selected && sampelList.length > 0 && (
        <p className="mt-1 text-xs text-ink/50">
          Update data terakhir:{" "}
          {formatWaktuWIB(
            sampelList.reduce<string | null>((latest, s) => {
              if (!s.updated_at) return latest;
              if (!latest || s.updated_at > latest) return s.updated_at;
              return latest;
            }, null)
          )}
        </p>
      )}

      {jorongId && (
        <div className="mt-6">
          {loadingSampel ? (
            <p className="text-sm text-ink/50">Memuat sampel...</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink/60">
                {selesai} dari {sampelList.length} sampel sudah diproses.
              </p>
              <ol className="flex flex-col gap-3">
                {sampelList.map((s) => {
                  const warna = warnaStatus(s.status, s.potensi_non_respon);
                  return (
                    <li key={s.id} className="rounded-lg border border-line bg-white p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-navy-900">
                          Ruta No. {s.nomor_urut}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${warna.bg} ${warna.text}`}
                        >
                          {s.status === "belum_didata"
                            ? s.potensi_non_respon === true
                              ? "Belum Didata (Non Respon)"
                              : s.potensi_non_respon === false
                              ? "Belum Didata"
                              : "Belum Diidentifikasi"
                            : STATUS_LABEL[s.status]}
                        </span>
                      </div>

                      <select
                        value={s.status}
                        onChange={(e) =>
                          editLocal(s.id, {
                            status: e.target.value as Status,
                            potensi_non_respon:
                              e.target.value === "belum_didata"
                                ? s.potensi_non_respon
                                : null,
                          })
                        }
                        className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
                      >
                        {(Object.keys(STATUS_LABEL) as Status[]).map((key) => (
                          <option key={key} value={key}>
                            {STATUS_LABEL[key]}
                          </option>
                        ))}
                      </select>

                      {s.status === "belum_didata" && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-ink/60">
                            Potensi non respon?
                          </p>
                          <div className="mt-1 flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                editLocal(s.id, { potensi_non_respon: true })
                              }
                              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                                s.potensi_non_respon === true
                                  ? "bg-rust-500 text-white"
                                  : "bg-line text-ink/60"
                              }`}
                            >
                              Ya
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                editLocal(s.id, { potensi_non_respon: false })
                              }
                              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                                s.potensi_non_respon === false
                                  ? "bg-moss-500 text-white"
                                  : "bg-line text-ink/60"
                              }`}
                            >
                              Tidak
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>

              {belumTeridentifikasi.length > 0 && (
                <p className="mt-3 rounded-md bg-rust-100 px-3 py-2 text-sm text-rust-700">
                  Ruta No.{" "}
                  {belumTeridentifikasi.map((s) => s.nomor_urut).join(", ")}{" "}
                  belum diidentifikasi. Pilih status atau tandai potensi non
                  respon untuk semua sampel sebelum submit.
                </p>
              )}

              <button
                type="button"
                onClick={submitJorong}
                disabled={!dirty || submitting || belumTeridentifikasi.length > 0}
                className="mt-4 w-full rounded-md bg-navy-700 px-4 py-3 font-medium text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "Menyimpan..." : "Submit"}
              </button>
              {savedMessage && (
                <p className="mt-2 text-center text-sm text-moss-700">
                  Perubahan untuk {selected?.nama_jorong} tersimpan.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function GrafikTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-navy-900">
        {data.jorong} ({data.namaPpl})
      </p>
      <div className="mt-1 flex flex-col gap-0.5">
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-ink/70">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
            </span>
            <span className="font-medium text-ink">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RekapTab({
  idealPercent,
  totalPeriodDays,
}: {
  idealPercent: number;
  totalPeriodDays: number;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const tableRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "done" | "error">("idle");
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("seruti_progress").select("*");
      setRows(data ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  async function salinTabelSebagaiGambar() {
    if (!tableRef.current) return;
    setCopyStatus("copying");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setCopyStatus("error");
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          setCopyStatus("done");
          setTimeout(() => setCopyStatus("idle"), 2500);
        } catch {
          // Fallback: unduh langsung kalau clipboard image tidak didukung browser
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "rekap-update-ppl.png";
          a.click();
          URL.revokeObjectURL(url);
          setCopyStatus("done");
          setTimeout(() => setCopyStatus("idle"), 2500);
        }
      });
    } catch {
      setCopyStatus("error");
    }
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.selesai += r.selesai_didata + r.selesai_dibersihkan;
      acc.belum += r.belum_didata;
      acc.nonRespon += r.potensi_non_respon;
      acc.total += r.total;
      return acc;
    },
    { selesai: 0, belum: 0, nonRespon: 0, total: 0 }
  );
  const persen = totals.total > 0 ? Math.round((totals.selesai / totals.total) * 100) : 0;

  const kabupaten = rows.reduce(
    (acc, r) => {
      acc.hijau += r.selesai_dibersihkan;
      acc.kuning += r.selesai_didata;
      acc.merah += r.potensi_non_respon;
      acc.oren += r.belum_didata_bukan_nonrespon;
      acc.abu += r.belum_diidentifikasi;
      return acc;
    },
    { hijau: 0, kuning: 0, merah: 0, oren: 0, abu: 0 }
  );

  // Target dihitung per SLS (bukan total), dibulatkan ke bawah
  const jumlahSls = rows.length;
  const targetPerSls = Math.floor(10 * idealPercent);
  const totalTarget = targetPerSls * jumlahSls;
  const selisih = totals.selesai - totalTarget;
  const hariKe = Math.min(totalPeriodDays, Math.max(1, Math.round(idealPercent * totalPeriodDays)));

  const chartData = rows.map((r) => ({
    jorong: r.nama_jorong.replace(/^Jorong\s+/i, ""),
    namaPpl: r.nama_ppl,
    "Selesai Dibersihkan": r.selesai_dibersihkan,
    "Selesai Didata": r.selesai_didata,
    "Belum Didata (Non Respon)": r.potensi_non_respon,
    "Belum Didata": r.belum_didata_bukan_nonrespon,
    "Belum Diidentifikasi": r.belum_diidentifikasi,
  }));


  if (loading) {
    return <p className="text-sm text-ink/50">Memuat rekap...</p>;
  }

  return (
    <div>
      <RekapKabupatenBlock kabupaten={kabupaten} totalSampel={totals.total} jumlahJorong={rows.length} />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total sampel" value={totals.total} />
        <SummaryCard label="Sudah diproses" value={totals.selesai} tone="moss" />
        <SummaryCard label="Belum didata" value={totals.belum} />
        <SummaryCard label="Potensi non respon" value={totals.nonRespon} tone="rust" />
      </div>

      <p className="mt-4 text-sm text-ink/60">
        {persen}% dari seluruh sampel sudah diproses ({totals.selesai} dari{" "}
        {totals.total}).
      </p>

      <div className="mt-3 rounded-lg border border-line bg-white px-4 py-3 text-sm">
        <p>
          Target ideal hari ini (hari ke-{hariKe} dari {totalPeriodDays}, periode 7&ndash;14
          September 2026):{" "}
          <span className="font-semibold text-navy-900">{targetPerSls} dokumen per SLS</span>{" "}
          selesai didata (total {totalTarget} dari {jumlahSls} SLS).
        </p>
        <p className="mt-1">
          {totals.selesai === 0 ? (
            <span className="font-medium text-rust-700">
              Belum ada dokumen yang selesai didata sama sekali (target hari
              ini {totalTarget} dokumen).
            </span>
          ) : selisih >= 0 ? (
            <span className="font-medium text-moss-700">
              Sesuai/lebih cepat {selisih} dokumen dari target ideal.
            </span>
          ) : (
            <span className="font-medium text-rust-700">
              Tertinggal {Math.abs(selisih)} dokumen dari target ideal.
            </span>
          )}
        </p>
      </div>

      <div className="mt-6 h-[420px] rounded-lg border border-line bg-white p-4">
        <p className="mb-2 text-sm font-medium text-navy-900">Grafik Status per Jorong</p>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#DEDBD3" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#20242B" }} />
            <YAxis
              dataKey="jorong"
              type="category"
              width={110}
              tick={{ fontSize: 11, fill: "#20242B" }}
            />
            <Tooltip content={<GrafikTooltip />} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
            <Bar dataKey="Selesai Dibersihkan" stackId="a" fill={WARNA.hijau.hex} />
            <Bar dataKey="Selesai Didata" stackId="a" fill={WARNA.kuning.hex} />
            <Bar dataKey="Belum Didata (Non Respon)" stackId="a" fill={WARNA.merah.hex} />
            <Bar dataKey="Belum Didata" stackId="a" fill={WARNA.oren.hex} />
            <Bar dataKey="Belum Diidentifikasi" stackId="a" fill={WARNA.abu.hex} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-sm font-medium text-navy-400 hover:text-navy-700"
        >
          {showTable ? "\u25b4 Sembunyikan tabel" : "\u25be Tampilkan tabel"} Update
          Terakhir per PPL
        </button>
        <button
          type="button"
          onClick={salinTabelSebagaiGambar}
          disabled={copyStatus === "copying"}
          className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
        >
          {copyStatus === "copying"
            ? "Menyalin..."
            : copyStatus === "done"
            ? "Tersalin \u2713"
            : copyStatus === "error"
            ? "Gagal, coba lagi"
            : "Salin Tabel sebagai Gambar"}
        </button>
      </div>

      {showTable && (
        <div className="mt-2 overflow-hidden rounded-lg border border-line bg-white">
          <div className="border-b border-line p-3">
            <RekapKabupatenBlock kabupaten={kabupaten} totalSampel={totals.total} jumlahJorong={rows.length} />
          </div>
          <TabelRekapUpdate rows={rows} />
        </div>
      )}

      {/* Salinan tersembunyi di luar layar, dipakai sebagai sumber gambar saat tombol salin diklik */}
      <div
        ref={tableRef}
        className="fixed -left-[9999px] top-0 w-[680px] overflow-hidden rounded-lg border border-line bg-white"
        aria-hidden="true"
      >
        <div className="border-b border-line p-3">
          <RekapKabupatenBlock kabupaten={kabupaten} totalSampel={totals.total} jumlahJorong={rows.length} />
        </div>
        <TabelRekapUpdate rows={rows} />
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-medium text-navy-900">Catatan</h2>
        {rows.length === 0 ? (
          <p className="mt-2 rounded-md bg-line px-3 py-2 text-sm text-ink/60">
            Belum ada data Jorong.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {rows.map((r) => {
              const dalamPeriodeMonitoring = daysBetween(new Date(), BATAS_MONITORING_HARIAN) >= 0;
              const lengkap = r.belum_didata === 0;
              // Jorong yang sudah 100% lengkap dianggap "sudah update" terus,
              // meskipun update terakhirnya beberapa hari lalu — karena memang
              // sudah tidak ada lagi yang perlu diupdate.
              const hijau = lengkap || (dalamPeriodeMonitoring && sudahUpdateHariIni(r.last_updated));
              return (
                <li
                  key={r.ppl_id}
                  className={`flex items-start justify-between rounded-md px-3 py-2 text-sm ${
                    hijau ? "bg-moss-100 text-moss-700" : "bg-gold-100 text-gold-600"
                  }`}
                >
                  <span>
                    <span className="font-medium">{r.nama_jorong}</span> ({r.nama_ppl}) &mdash;{" "}
                    {lengkap ? (
                      "semua sampel sudah diidentifikasi."
                    ) : (
                      <>
                        masih {r.belum_didata} sampel belum diidentifikasi
                        {r.potensi_non_respon > 0 && (
                          <> ({r.potensi_non_respon} berpotensi non respon)</>
                        )}
                        .
                      </>
                    )}
                    <br />
                    <span className="text-xs opacity-70">
                      Update terakhir: {formatWaktuWIB(r.last_updated)}{" "}
                      &middot;{" "}
                      {lengkap
                        ? "sudah lengkap 100%"
                        : hijau
                        ? "sudah update hari ini"
                        : "belum update hari ini"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Persentase "Didata" bersifat kumulatif: Selesai Dibersihkan + Selesai
// Didata, krn dokumen yg sudah dibersihkan sudah pasti melewati tahap
// didata jg -- dipakai jg sbg NILAI SORTIR kolom "Progress Pendataan"
// (kolom itu sendiri berupa bar visual, bukan angka polos, jadi diurutkan
// berdasarkan persentase kumulatif ini).
function persenSelesaiDidata(r: ProgressRow): number {
  return r.total > 0 ? Math.round(((r.selesai_dibersihkan + r.selesai_didata) / r.total) * 100) : 0;
}

// Catatan: komponen ini dirender DUA KALI oleh RekapTab (sekali tampil di
// layar, sekali lagi tersembunyi di luar layar khusus utk "Salin Tabel
// sebagai Gambar") -- keduanya instance TERPISAH shg py state sort/filter
// SENDIRI-SENDIRI. SENGAJA begitu (tidak disatukan): salinan tersembunyi
// utk screenshot tetap menampilkan SEMUA baris apa adanya (urutan resmi
// asli), sedangkan tabel yg terlihat bisa diurutkan/difilter bebas oleh
// pengguna tanpa mengubah hasil screenshot yg dibagikan.
function TabelRekapUpdate({ rows }: { rows: ProgressRow[] }) {
  const kolom = useMemo(
    () => [
      { key: "nama_ppl", label: "Nama PPL", getValue: (r: ProgressRow) => r.nama_ppl },
      { key: "nama_jorong", label: "Nama Jorong", getValue: (r: ProgressRow) => r.nama_jorong },
      { key: "progress", label: "Progress Pendataan", getValue: (r: ProgressRow) => persenSelesaiDidata(r) },
    ],
    []
  );
  const tabel = useExcelTable(rows, kolom, { key: "nama_jorong", dir: "asc" });

  return (
    <>
      <p className="border-b border-line bg-navy-50 px-4 py-2 text-sm font-semibold text-navy-900">
        Rekap Update Terakhir &mdash; Susenas September &middot; Seruti Triwulan III 2026
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-navy-50/60 px-4 py-1 text-[10px] text-ink/40">
        <p>Klik nama kolom utk urutkan, klik &ldquo;▾&rdquo; utk filter (spt Excel).</p>
        {tabel.adaFilterAktif && (
          <button type="button" onClick={tabel.resetFilters} className="shrink-0 font-medium text-navy-700 hover:underline">
            Reset semua filter
          </button>
        )}
      </div>
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[20%]" />
          <col className="w-[56%]" />
        </colgroup>
        <thead className="bg-navy-50 text-left text-xs uppercase text-navy-600">
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
                className="font-medium"
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {tabel.rows.length === 0 && (
            <tr>
              <td colSpan={kolom.length} className="px-3 py-4 text-center text-ink/40">
                Tidak ada data utk filter ini.
              </td>
            </tr>
          )}
          {tabel.rows.map((r) => {
            // Persentase "Didata" bersifat kumulatif: Selesai Dibersihkan + Selesai Didata,
            // karena dokumen yang sudah dibersihkan sudah pasti melewati tahap didata juga.
            const kumulatifDidata = r.selesai_dibersihkan + r.selesai_didata;
            const segmen = [
              {
                jumlah: r.selesai_dibersihkan,
                warna: WARNA.hijau.hex,
                label: "Clean",
                persenNilai: r.selesai_dibersihkan,
              },
              {
                jumlah: r.selesai_didata,
                warna: WARNA.kuning.hex,
                label: "Didata",
                persenNilai: kumulatifDidata,
              },
              {
                jumlah: r.potensi_non_respon,
                warna: WARNA.merah.hex,
                label: "NR",
                persenNilai: r.potensi_non_respon,
              },
              {
                jumlah: r.belum_didata_bukan_nonrespon,
                warna: WARNA.oren.hex,
                label: "Belum",
                persenNilai: r.belum_didata_bukan_nonrespon,
              },
              {
                jumlah: r.belum_diidentifikasi,
                warna: WARNA.abu.hex,
                label: "Belum ID",
                persenNilai: r.belum_diidentifikasi,
              },
            ];
            return (
              <tr key={r.ppl_id} className="border-t border-line align-top">
                <td className="px-3 py-1.5">
                  <p className="break-words">{r.nama_ppl}</p>
                  <p className="mt-0.5 text-[10px] italic leading-tight text-ink/40">
                    {formatWaktuWIB(r.last_updated)}
                  </p>
                </td>
                <td className="px-3 py-1.5 break-words text-ink/70">{r.nama_jorong}</td>
                <td className="px-3 py-1.5">
                  {/* Baris atas: bar progress */}
                  <div className="flex h-4 w-full overflow-hidden rounded-full bg-line">
                    {segmen.map(
                      (s, i) =>
                        s.jumlah > 0 && (
                          <div
                            key={i}
                            style={{
                              width: `${(s.jumlah / r.total) * 100}%`,
                              backgroundColor: s.warna,
                            }}
                            className="h-full"
                          />
                        )
                    )}
                  </div>
                  {/* Baris bawah: sekat per kategori, dipaksa 1 baris */}
                  <div className="mt-1 flex flex-nowrap items-center gap-x-1.5 overflow-x-auto whitespace-nowrap text-[10px] text-ink/60">
                    {segmen.map((s, i) => (
                      <span key={i} className="flex shrink-0 items-center gap-1.5">
                        <AngkaKategori
                          warna={s.warna}
                          label={s.label}
                          nilai={s.jumlah}
                          persen={r.total > 0 ? Math.round((s.persenNilai / r.total) * 100) : 0}
                        />
                        {i < segmen.length - 1 && <span className="text-ink/25">|</span>}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-ink/60">
        <LegendDot warna={WARNA.hijau.hex} label="Selesai Dibersihkan" />
        <LegendDot warna={WARNA.kuning.hex} label="Selesai Didata" />
        <LegendDot warna={WARNA.merah.hex} label="Belum Didata (Non Respon)" />
        <LegendDot warna={WARNA.oren.hex} label="Belum Didata" />
        <LegendDot warna={WARNA.abu.hex} label="Belum Diidentifikasi" />
      </div>
    </>
  );
}

function AngkaKategori({
  warna,
  label,
  nilai,
  persen,
}: {
  warna: string;
  label: string;
  nilai: number;
  persen?: number;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: warna }} />
      {label} : {nilai}
      {persen !== undefined && <span className="text-ink/40"> ({persen}%)</span>}
    </span>
  );
}

function RekapKabupatenBlock({
  kabupaten,
  totalSampel,
  jumlahJorong,
}: {
  kabupaten: { hijau: number; kuning: number; merah: number; oren: number; abu: number };
  totalSampel: number;
  jumlahJorong: number;
}) {
  const kumulatifDidata = kabupaten.hijau + kabupaten.kuning;
  const segmen = [
    { jumlah: kabupaten.hijau, warna: WARNA.hijau.hex, label: "Clean", persenNilai: kabupaten.hijau },
    { jumlah: kabupaten.kuning, warna: WARNA.kuning.hex, label: "Didata", persenNilai: kumulatifDidata },
    { jumlah: kabupaten.merah, warna: WARNA.merah.hex, label: "NR", persenNilai: kabupaten.merah },
    { jumlah: kabupaten.oren, warna: WARNA.oren.hex, label: "Belum", persenNilai: kabupaten.oren },
    { jumlah: kabupaten.abu, warna: WARNA.abu.hex, label: "Belum ID", persenNilai: kabupaten.abu },
  ];
  return (
    <div>
      <h2 className="text-sm font-semibold text-navy-900">Rekap Kabupaten Solok</h2>
      <p className="mt-0.5 text-xs text-ink/50">
        Gabungan seluruh {jumlahJorong} Jorong sampel Seruti Triwulan III 2026.
      </p>

      <div className="mt-3 rounded-lg border border-line bg-white p-3">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-line">
          {segmen.map(
            (s, i) =>
              s.jumlah > 0 && (
                <div
                  key={i}
                  style={{
                    width: `${totalSampel > 0 ? (s.jumlah / totalSampel) * 100 : 0}%`,
                    backgroundColor: s.warna,
                  }}
                  className="h-full"
                />
              )
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink/60">
          {segmen.map((s, i) => (
            <AngkaKategori
              key={i}
              warna={s.warna}
              label={s.label}
              nilai={s.jumlah}
              persen={totalSampel > 0 ? Math.round((s.persenNilai / totalSampel) * 100) : 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LegendDot({ warna, label }: { warna: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: warna }}
      />
      {label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "moss" | "rust";
}) {
  const toneClass =
    tone === "moss" ? "text-moss-700" : tone === "rust" ? "text-rust-700" : "text-navy-900";
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <p className="text-xs text-ink/50">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
