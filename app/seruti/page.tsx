"use client";

import { useEffect, useState } from "react";
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

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
      <p className="text-sm font-medium text-navy-400">
        Susenas September &middot; Seruti Triwulan II
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-navy-900">
        Progress Pendataan Sampel
      </h1>

      <div className="mt-6 flex gap-1 border-b border-line">
        <TabButton active={tab === "form"} onClick={() => setTab("form")}>
          Formulir Identifikasi
        </TabButton>
        <TabButton active={tab === "rekap"} onClick={() => setTab("rekap")}>
          Rekapitulasi
        </TabButton>
      </div>

      <div className="mt-6">
        {tab === "form" ? <FormulirTab /> : <RekapTab />}
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
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingSampel, setLoadingSampel] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

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

  async function loadSampel(id: string) {
    setJorongId(id);
    setLoadingSampel(true);
    const { data } = await supabase
      .from("seruti_sampel")
      .select("id, nomor_urut, status, potensi_non_respon")
      .eq("jorong_id", id)
      .order("nomor_urut");
    setSampelList(data ?? []);
    setDirty({});
    setLoadingSampel(false);
  }

  function editLocal(
    sampelId: string,
    patch: Partial<Pick<Sampel, "status" | "potensi_non_respon">>
  ) {
    setSampelList((prev) =>
      prev.map((s) => (s.id === sampelId ? { ...s, ...patch } : s))
    );
    setDirty((prev) => ({ ...prev, [sampelId]: true }));
  }

  async function submitSampel(sampel: Sampel) {
    setSavingId(sampel.id);

    const { data: pplRow } = await supabase
      .from("seruti_ppl")
      .select("id")
      .eq("jorong_id", jorongId)
      .maybeSingle();

    await supabase
      .from("seruti_sampel")
      .update({
        status: sampel.status,
        potensi_non_respon:
          sampel.status === "belum_didata" ? sampel.potensi_non_respon : null,
        updated_by_ppl_id: pplRow?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sampel.id);

    setDirty((prev) => ({ ...prev, [sampel.id]: false }));
    setSavingId(null);
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
                  const sudah = s.status !== "belum_didata";
                  return (
                    <li key={s.id} className="rounded-lg border border-line bg-white p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-navy-900">
                          Ruta No. {s.nomor_urut}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            sudah
                              ? "bg-moss-100 text-moss-700"
                              : "bg-rust-100 text-rust-700"
                          }`}
                        >
                          {STATUS_LABEL[s.status]}
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

                      <button
                        type="button"
                        onClick={() => submitSampel(s)}
                        disabled={!dirty[s.id] || savingId === s.id}
                        className="mt-3 w-full rounded-md bg-navy-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-navy-600 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {savingId === s.id
                          ? "Menyimpan..."
                          : dirty[s.id]
                          ? "Submit"
                          : "Tersimpan"}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RekapTab() {
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

  const chartData = rows.map((r) => ({
    jorong: r.nama_jorong.replace(/^Jorong\s+/i, ""),
    "Selesai Didata": r.selesai_didata,
    "Selesai Dibersihkan": r.selesai_dibersihkan,
    "Belum Didata": r.belum_didata,
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

      <div className="mt-6 h-80 rounded-lg border border-line bg-white p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 40 }}>
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
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Selesai Didata" stackId="a" fill="#3F7D58" />
            <Bar dataKey="Selesai Dibersihkan" stackId="a" fill="#C08829" />
            <Bar dataKey="Belum Didata" stackId="a" fill="#DEDBD3" />
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
            {belumLengkap.map((r) => (
              <li
                key={r.ppl_id}
                className="flex items-start justify-between rounded-md bg-gold-100 px-3 py-2 text-sm text-gold-600"
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
            ))}
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
