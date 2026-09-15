"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Narasi, StatusBadge } from "./anomali-cepat";

type StatusKonfirmasi = "pending" | "sesuai" | "perlu_koreksi" | "resolved";

interface Temuan {
  id: number;
  kode_anomali: string;
  kelompok: string | null;
  nks: string | null;
  nurt: string | null;
  nourutkomo: number | null;
  nama_krt: string | null;
  keterangan: string | null;
  nama_lainnya: string | null;
  banyak: number | null;
  nilai: number | null;
  detail: Record<string, unknown> | null;
  narasi: string | null;
  status: StatusKonfirmasi;
  catatan_ppl: string | null;
  nama_ppl: string | null;
}

interface NksOption {
  nks: string;
  label: string; // "00050 - Jorong Aia Daliak (PPL: Nisa Anggraini)" atau "00050 (belum ada nama jorong)"
  namaPpl: string | null;
}

const fmtNum = (v: number | null) =>
  v === null || v === undefined ? "" : v.toLocaleString("id-ID");

export default function KonfirmasiPplTab() {
  const [supabase] = useState(() => createClient());

  const [temuan, setTemuan] = useState<Temuan[]>([]);
  const [nksOptions, setNksOptions] = useState<NksOption[]>([]);
  const [nksPplMap, setNksPplMap] = useState<Map<string, string>>(new Map());
  const [kodeOptions, setKodeOptions] = useState<string[]>([]);
  const [filterNks, setFilterNks] = useState("");
  const [filterKode, setFilterKode] = useState("");
  const [namaPpl, setNamaPpl] = useState("");
  const [loading, setLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  // ---------- muat opsi dropdown NKS - Nama Jorong - Nama PPL ----------
  // Diambil dari NKS yang punya temuan pending, digabung (di sisi client)
  // dengan tabel kp_nks_jorong kalau sudah ada pemetaannya. Selama
  // kp_nks_jorong masih kosong utk suatu NKS, label-nya tetap tampil NKS
  // saja dengan catatan "(belum ada nama jorong)".
  const loadNksOptions = useCallback(async () => {
    const { data: pendingRows } = await supabase
      .from("kp_anomali_temuan")
      .select("nks")
      .eq("status", "pending");
    const uniqueNks = [...new Set((pendingRows ?? []).map((r) => r.nks).filter(Boolean))] as string[];

    const { data: jorongRows } = await supabase
      .from("kp_nks_jorong")
      .select("nks, nama_jorong, nama_ppl");
    const jorongMap = new Map((jorongRows ?? []).map((j) => [j.nks, j.nama_jorong]));
    const pplMap = new Map((jorongRows ?? []).map((j) => [j.nks, j.nama_ppl]).filter(([, v]) => v) as [string, string][]);
    setNksPplMap(pplMap);

    const opts: NksOption[] = uniqueNks
      .map((nks) => ({
        nks,
        namaPpl: pplMap.get(nks) ?? null,
        label: jorongMap.has(nks)
          ? `${nks} - ${jorongMap.get(nks)}${pplMap.has(nks) ? ` (PPL: ${pplMap.get(nks)})` : ""}`
          : `${nks} (belum ada nama jorong)`,
      }))
      .sort((a, b) => a.nks.localeCompare(b.nks));
    setNksOptions(opts);
  }, [supabase]);

  // ---------- muat daftar temuan pending (sesuai filter) ----------
  const loadData = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("kp_anomali_temuan").select("*").eq("status", "pending");
    if (filterKode) query = query.eq("kode_anomali", filterKode);
    if (filterNks) query = query.eq("nks", filterNks);
    const { data: rows, error } = await query.order("kode_anomali").order("nks").order("nurt");
    if (error) {
      console.error("loadData (konfirmasi) error:", error);
      setDebugError(`Gagal membaca temuan pending: ${error.message} (code: ${error.code})`);
    } else {
      setDebugError(null);
    }
    setTemuan((rows ?? []) as Temuan[]);

    if (!filterKode && !filterNks) {
      // basis daftar kode filter diambil dari SEMUA temuan pending (tanpa filter),
      // supaya pilihan kode di dropdown tidak berubah-ubah waktu difilter
      setKodeOptions([...new Set(((rows ?? []) as Temuan[]).map((t) => t.kode_anomali))].sort());
    }
    setLoading(false);
  }, [supabase, filterKode, filterNks]);

  useEffect(() => {
    loadNksOptions();
  }, [loadNksOptions]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------- konfirmasi PPL: tulis langsung dari client (RLS anon terbuka utk update) ----------
  async function confirmFinding(id: number, status: "sesuai" | "perlu_koreksi", catatan: string) {
    await supabase
      .from("kp_anomali_temuan")
      .update({
        status,
        catatan_ppl: catatan || null,
        nama_ppl: namaPpl || null,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", id);
    setTemuan((prev) => prev.filter((t) => t.id !== id));
    loadNksOptions(); // NKS yg temuan terakhirnya baru saja dikonfirmasi hilang dari dropdown
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-white p-4">
        <h3 className="text-sm font-semibold text-navy-900">
          Konfirmasi PPL — Temuan Belum Dikonfirmasi
        </h3>
        <p className="mt-1 text-xs text-ink/60">
          Periksa tiap temuan di lapangan/dokumen, lalu tandai statusnya.
        </p>

        {nksOptions.length > 0 && nksOptions.every((o) => o.label.includes("belum ada nama jorong")) && (
          <p className="mt-2 rounded-md bg-gold-100 px-2 py-1.5 text-[11px] text-gold-600">
            ⚠ Pemetaan NKS → Nama Jorong belum diisi, jadi dropdown di bawah cuma menampilkan nomor NKS.
          </p>
        )}

        {debugError && (
          <p className="mt-2 rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">
            ⚠ Diagnostik: {debugError}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={filterNks}
            onChange={(e) => setFilterNks(e.target.value)}
            className="min-w-[200px] rounded-md border border-line px-2 py-1.5 text-xs"
          >
            <option value="">Semua NKS - Jorong</option>
            {nksOptions.map((o) => (
              <option key={o.nks} value={o.nks}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={filterKode}
            onChange={(e) => setFilterKode(e.target.value)}
            className="rounded-md border border-line px-2 py-1 text-xs"
          >
            <option value="">Semua kode</option>
            {kodeOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Nama PPL (diisi sekali, dipakai utk semua konfirmasi)"
            value={namaPpl}
            onChange={(e) => setNamaPpl(e.target.value)}
            className="min-w-[220px] flex-1 rounded-md border border-line px-2 py-1.5 text-xs"
          />
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-ink/40">Memuat...</p>
        ) : temuan.length === 0 ? (
          <p className="mt-4 text-sm text-ink/50">Tidak ada temuan pending untuk filter ini.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {temuan.map((t) => (
              <ConfirmCard
                key={t.id}
                temuan={t}
                namaPplJorong={t.nks ? nksPplMap.get(t.nks) ?? null : null}
                onConfirm={confirmFinding}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmCard({
  temuan,
  namaPplJorong,
  onConfirm,
}: {
  temuan: Temuan;
  namaPplJorong: string | null;
  onConfirm: (id: number, status: "sesuai" | "perlu_koreksi", catatan: string) => void;
}) {
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);

  async function handle(status: "sesuai" | "perlu_koreksi") {
    setBusy(true);
    await onConfirm(temuan.id, status, catatan);
  }

  return (
    <div className="rounded-lg border border-line bg-paper/40 p-3">
      <div className="text-[11px] text-ink/50">
        {temuan.kode_anomali} &middot; NKS {temuan.nks ?? "-"} &middot; NURT {temuan.nurt ?? "-"}{" "}
        &middot; No.Komoditi {temuan.nourutkomo ?? "-"}
        {temuan.nama_krt ? ` \u00b7 KRT: ${temuan.nama_krt}` : ""}
        {namaPplJorong ? ` \u00b7 PPL: ${namaPplJorong}` : ""}
      </div>
      <div className="mt-1 text-sm text-ink">
        {temuan.keterangan}
        {temuan.nama_lainnya ? (
          <>
            {" "}
            &mdash; isian: &quot;<b>{temuan.nama_lainnya}</b>&quot;
          </>
        ) : null}
        {temuan.banyak != null ? ` \u00b7 Banyak: ${fmtNum(temuan.banyak)}` : ""}
        {temuan.nilai != null ? ` \u00b7 Nilai: Rp${fmtNum(temuan.nilai)}` : ""}
        {temuan.narasi && (
          <div className="mt-0.5 text-xs text-ink/70">
            <Narasi text={temuan.narasi} />
          </div>
        )}
      </div>
      <textarea
        placeholder="Catatan PPL (opsional)"
        value={catatan}
        onChange={(e) => setCatatan(e.target.value)}
        className="mt-2 min-h-[44px] w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
      />
      <div className="mt-2 flex gap-2">
        <button
          disabled={busy}
          onClick={() => handle("sesuai")}
          className="rounded-md bg-moss-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-moss-700 disabled:opacity-50"
        >
          &#10003; Sesuai
        </button>
        <button
          disabled={busy}
          onClick={() => handle("perlu_koreksi")}
          className="rounded-md bg-rust-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rust-700 disabled:opacity-50"
        >
          &#10007; Perlu Koreksi
        </button>
      </div>
    </div>
  );
}
