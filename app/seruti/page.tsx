"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
};

function warnaStatus(status: Status, nonRespon: boolean | null) {
  if (status === "selesai_dibersihkan") return WARNA.hijau;
  if (status === "selesai_didata") return WARNA.kuning;
  if (nonRespon) return WARNA.merah;
  return WARNA.oren;
}

// Periode pendataan Seruti Triwulan III 2026
const TANGGAL_MULAI = new Date(2026, 8, 7); // 7 September 2026
const TANGGAL_AKHIR = new Date(2026, 8, 14); // 14 September 2026

function daysBetween(a: Date, b: Date) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
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
  potensi_non_respon: number;
  total: number;
}

export default function SerutiPage() {
  const [tab, setTab] = useState<"form" | "rekap">("form");

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
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
      <p className="text-sm font-semibold tracking-wide text-navy-900">
        BADAN PUSAT STATISTIK KABUPATEN SOLOK
      </p>
      <p className="mt-0.5 text-sm font-medium text-navy-400">
        Susenas September &middot; Seruti Triwulan III 2026
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-navy-900">
        Progress Pendataan Sampel
      </h1>

      <div className="mt-5 rounded-lg bg-rust-100 px-4 py-3 text-sm text-rust-700">
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

      <div className="mt-3 rounded-lg border border-gold-400 bg-gold-100 px-4 py-3 text-sm text-gold-600">
        <p className="font-semibold">
          PERHATIAN: 2 DOKUMEN PER PPL YANG TELAH DIBERSIHKAN WAJIB
          DIKUMPULKAN PALING LAMBAT SENIN 14 SEPTEMBER 2026
        </p>
        <p className="mt-1">Silakan dititip atau dikirim lewat ekspedisi.</p>
      </div>

      <div className="mt-6 flex gap-1 border-b border-line">
        <TabButton active={tab === "form"} onClick={() => setTab("form")}>
          Formulir Identifikasi
        </TabButton>
        <TabButton active={tab === "rekap"} onClick={() => setTab("rekap")}>
          Rekapitulasi
        </TabButton>
      </div>

      <div className="mt-6">
        {tab === "form" ? (
          <FormulirTab />
        ) : (
          <RekapTab idealPercent={idealPercent} totalPeriodDays={totalPeriodDays} />
        )}
      </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
        active
          ? "border-navy-700 text-navy-900"
          : "border-transparent text-ink/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
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
      .select("id, nomor_urut, status, potensi_non_respon")
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

  return (
    <div>
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

      {selected && (
        <p className="mt-3 text-sm text-ink/70">
          Petugas (PPL): <span className="font-medium text-ink">{selected.nama_ppl}</span>
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
                          {STATUS_LABEL[s.status]}
                          {s.status === "belum_didata" && s.potensi_non_respon
                            ? " (Non Respon)"
                            : ""}
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

              <button
                type="button"
                onClick={submitJorong}
                disabled={!dirty || submitting}
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

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("seruti_progress").select("*");
      setRows(data ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

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

  // Target dihitung per SLS (bukan total), dibulatkan ke bawah
  const jumlahSls = rows.length;
  const targetPerSls = Math.floor(10 * idealPercent);
  const totalTarget = targetPerSls * jumlahSls;
  const selisih = totals.selesai - totalTarget;
  const hariKe = Math.min(totalPeriodDays, Math.max(1, Math.round(idealPercent * totalPeriodDays)));

  const chartData = rows.map((r) => ({
    jorong: r.nama_jorong.replace(/^Jorong\s+/i, ""),
    "Selesai Dibersihkan": r.selesai_dibersihkan,
    "Selesai Didata": r.selesai_didata,
    "Belum Didata (Non Respon)": r.potensi_non_respon,
    "Belum Didata": r.belum_didata - r.potensi_non_respon,
  }));

  const belumLengkap = rows.filter((r) => r.belum_didata > 0);

  if (loading) {
    return <p className="text-sm text-ink/50">Memuat rekap...</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          {selisih >= 0 ? (
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

      <div className="mt-6 h-96 rounded-lg border border-line bg-white p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 56 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DEDBD3" />
            <XAxis
              dataKey="jorong"
              tick={{ fontSize: 11, fill: "#20242B" }}
              angle={-35}
              textAnchor="end"
              interval={0}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#20242B" }} />
            <Tooltip />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
            <Bar dataKey="Selesai Dibersihkan" stackId="a" fill={WARNA.hijau.hex} />
            <Bar dataKey="Selesai Didata" stackId="a" fill={WARNA.kuning.hex} />
            <Bar dataKey="Belum Didata (Non Respon)" stackId="a" fill={WARNA.merah.hex} />
            <Bar dataKey="Belum Didata" stackId="a" fill={WARNA.oren.hex} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-medium text-navy-900">Catatan sampel belum diidentifikasi</h2>
        {belumLengkap.length === 0 ? (
          <p className="mt-2 rounded-md bg-moss-100 px-3 py-2 text-sm text-moss-700">
            Semua sampel di seluruh Jorong sudah diidentifikasi.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {belumLengkap.map((r) => {
              const sudahMulai = r.selesai_didata + r.selesai_dibersihkan > 0;
              return (
                <li
                  key={r.ppl_id}
                  className={`flex items-start justify-between rounded-md px-3 py-2 text-sm ${
                    sudahMulai
                      ? "bg-moss-100 text-moss-700"
                      : "bg-gold-100 text-gold-600"
                  }`}
                >
                  <span>
                    <span className="font-medium">{r.nama_jorong}</span> ({r.nama_ppl}) &mdash;
                    masih {r.belum_didata} sampel belum diidentifikasi
                    {r.potensi_non_respon > 0 && (
                      <> ({r.potensi_non_respon} berpotensi non respon)</>
                    )}
                    .
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
