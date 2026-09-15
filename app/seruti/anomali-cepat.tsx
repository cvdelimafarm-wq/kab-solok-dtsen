"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------- tipe data ----------

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
  status: StatusKonfirmasi;
  catatan_ppl: string | null;
  nama_ppl: string | null;
}

interface SummaryRow {
  kode_anomali: string;
  kelompok: string | null;
  total: number;
  pending: number;
  sesuai: number;
  perlu_koreksi: number;
  resolved: number;
}

const fmtNum = (v: number | null) =>
  v === null || v === undefined ? "" : v.toLocaleString("id-ID");

export default function AnomaliCepatTab() {
  const supabase = createClient();

  const [subTab, setSubTab] = useState<"daftar" | "konfirmasi">("daftar");
  const [lastUpload, setLastUpload] = useState<{
    id: number;
    uploaded_at: string;
    jumlah_baru: number | null;
    jumlah_berubah: number | null;
    jumlah_tetap: number | null;
    jumlah_selesai: number | null;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [keterangan, setKeterangan] = useState("");

  const [temuan, setTemuan] = useState<Temuan[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [filterKode, setFilterKode] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [namaPpl, setNamaPpl] = useState("");
  const [loading, setLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  // ---------- ambil info upload terakhir (cuma utk ditampilkan, bukan filter) ----------
  const loadLastUpload = useCallback(async () => {
    const { data, error } = await supabase
      .from("kp_anomali_upload")
      .select("id, uploaded_at, jumlah_baru, jumlah_berubah, jumlah_tetap, jumlah_selesai")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("loadLastUpload error:", error);
      setDebugError(`Gagal membaca kp_anomali_upload: ${error.message} (code: ${error.code})`);
      return;
    }
    setDebugError(null);
    setLastUpload(data ?? null);
  }, [supabase]);

  useEffect(() => {
    loadLastUpload();
  }, [loadLastUpload]);

  // ---------- upload file DBF ----------
  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("files") as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) return;

    const fd = new FormData();
    for (const f of Array.from(fileInput.files)) fd.append("files", f);
    fd.append("keterangan", keterangan);

    setUploading(true);
    setUploadMsg(null);
    try {
      const res = await fetch("/api/anomali-kp/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.namaFileYangDiterimaServer
          ? ` (Nama file yang diterima server: ${data.namaFileYangDiterimaServer.join(", ") || "TIDAK ADA FILE DITERIMA"})`
          : "";
        throw new Error((data.error || "Gagal upload") + detail);
      }
      setUploadMsg({
        type: "ok",
        text:
          `Berhasil. ${data.totalTemuan} temuan aktif dari file: ${data.filenames.join(", ")}. ` +
          `(${data.ringkasan.baru} baru, ${data.ringkasan.berubah} berubah/perlu dicek ulang, ` +
          `${data.ringkasan.tetap} tetap, ${data.ringkasan.selesai} selesai/teratasi)`,
      });
      await loadLastUpload();
      await loadData();
      form.reset();
    } catch (err: any) {
      setUploadMsg({ type: "err", text: err.message });
    } finally {
      setUploading(false);
    }
  }

  // ---------- muat ringkasan + daftar temuan (kondisi TERKINI, bukan per-upload) ----------
  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: sum, error: sumErr } = await supabase.rpc("kp_anomali_summary");
    if (sumErr) {
      console.error("kp_anomali_summary error:", sumErr);
      setDebugError(`Gagal memanggil kp_anomali_summary: ${sumErr.message} (code: ${sumErr.code})`);
    } else if (sum) {
      setSummary(sum as SummaryRow[]);
      setDebugError(null);
    } else {
      // fallback kalau function RPC belum dibuat di DB — hitung manual di client
      const { data: rows, error: rowsErr } = await supabase.from("kp_anomali_temuan").select("*");
      if (rowsErr) {
        console.error("fallback kp_anomali_temuan error:", rowsErr);
        setDebugError(`Gagal membaca kp_anomali_temuan: ${rowsErr.message} (code: ${rowsErr.code})`);
      }
      const byKode = new Map<string, SummaryRow>();
      (rows ?? []).forEach((r: Temuan) => {
        const cur =
          byKode.get(r.kode_anomali) ??
          ({
            kode_anomali: r.kode_anomali,
            kelompok: r.kelompok,
            total: 0,
            pending: 0,
            sesuai: 0,
            perlu_koreksi: 0,
            resolved: 0,
          } as SummaryRow);
        cur.total++;
        cur[r.status]++;
        byKode.set(r.kode_anomali, cur);
      });
      setSummary([...byKode.values()].sort((a, b) => a.kode_anomali.localeCompare(b.kode_anomali)));
    }

    let query = supabase.from("kp_anomali_temuan").select("*");
    if (filterKode) query = query.eq("kode_anomali", filterKode);
    if (filterStatus) query = query.eq("status", filterStatus);
    const { data: rows, error: rowsErr2 } = await query.order("kode_anomali").order("nks").order("nurt");
    if (rowsErr2) {
      console.error("loadData temuan error:", rowsErr2);
      setDebugError(`Gagal membaca daftar temuan: ${rowsErr2.message} (code: ${rowsErr2.code})`);
    }
    setTemuan((rows ?? []) as Temuan[]);
    setLoading(false);
  }, [supabase, filterKode, filterStatus]);

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
    loadData();
  }

  const pendingList = temuan.filter((t) => t.status === "pending");
  const kodeOptions = [...new Set(summary.map((s) => s.kode_anomali))];

  return (
    <div className="space-y-4">
      {/* ---------- Upload ---------- */}
      <div className="rounded-lg border border-line bg-white p-4">
        <h2 className="text-sm font-semibold text-navy-900">
          Upload Hasil Export Aplikasi Desktop Entri
        </h2>
        <p className="mt-1 text-xs text-ink/60">
          Boleh upload <b>semua file hasil export</b> sekaligus (tidak perlu dipilah manual) —
          sistem otomatis memakai file yang relevan (diawali angka{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">3</code>,{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">4</code>,{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">5</code>,{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">9</code>) dan mengabaikan sisanya.
          File dari aplikasi desktop entri Susenas — bukan PANTAU.{" "}
          <b>Sertakan juga file <code className="rounded bg-navy-50 px-1 py-0.5">.dbt</code> pendamping</b>{" "}
          kalau ada (nama sama persis dengan file .dbf-nya, biasanya utk file nomor 3) — tanpa itu
          filenya gagal dibaca.
        </p>
        <form onSubmit={handleUpload} className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="files"
            multiple
            accept=".xls,.dbf,.dbt"
            required
            className="text-xs"
          />
          <input
            type="text"
            placeholder="Keterangan batch (mis. Semester 2 - 2026)"
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            className="rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-navy-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-navy-900 disabled:opacity-50"
          >
            {uploading ? "Memproses..." : "Upload & Jalankan Pengecekan"}
          </button>
        </form>
        {uploadMsg && (
          <p
            className={`mt-2 text-sm ${
              uploadMsg.type === "ok" ? "text-moss-700" : "text-rust-700"
            }`}
          >
            {uploadMsg.text}
          </p>
        )}
      </div>

      {debugError && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">
          ⚠ Diagnostik: {debugError}
        </p>
      )}

      {!lastUpload ? (
        <p className="rounded-lg border border-line bg-white p-4 text-sm text-ink/50">
          Belum ada data yang diupload.
        </p>
      ) : (
        <>
          <p className="text-xs text-ink/50">
            Terakhir diupdate: {new Date(lastUpload.uploaded_at).toLocaleString("id-ID")}
            {lastUpload.jumlah_baru != null && (
              <>
                {" "}
                &middot; {lastUpload.jumlah_baru} baru &middot; {lastUpload.jumlah_berubah} berubah &middot;{" "}
                {lastUpload.jumlah_tetap} tetap &middot; {lastUpload.jumlah_selesai} selesai
              </>
            )}
          </p>

          {/* ---------- Sub-tab: Daftar Anomali / Konfirmasi PPL ---------- */}
          <div className="flex gap-1 border-b border-line">
            <SubTabButton active={subTab === "daftar"} onClick={() => setSubTab("daftar")}>
              Daftar Anomali
            </SubTabButton>
            <SubTabButton active={subTab === "konfirmasi"} onClick={() => setSubTab("konfirmasi")}>
              Konfirmasi PPL
              {pendingList.length > 0 && (
                <span className="ml-1.5 rounded-full bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold text-gold-600">
                  {pendingList.length}
                </span>
              )}
            </SubTabButton>
          </div>

          {/* ---------- TAB: Daftar Anomali ---------- */}
          {subTab === "daftar" && (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-lg border border-line bg-white p-4">
                <h3 className="text-sm font-semibold text-navy-900">Ringkasan per Kode Anomali</h3>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-left uppercase tracking-wide text-ink/50">
                      <th className="py-1.5 pr-3 font-medium">Kode</th>
                      <th className="py-1.5 pr-3 font-medium">Kelompok</th>
                      <th className="py-1.5 pr-3 font-medium">Total</th>
                      <th className="py-1.5 pr-3 font-medium">Pending</th>
                      <th className="py-1.5 pr-3 font-medium">Sesuai</th>
                      <th className="py-1.5 pr-3 font-medium">Koreksi</th>
                      <th className="py-1.5 pr-3 font-medium">Selesai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((r) => (
                      <tr key={r.kode_anomali} className="border-b border-line/60">
                        <td className="py-1.5 pr-3 font-medium text-navy-900">{r.kode_anomali}</td>
                        <td className="py-1.5 pr-3 text-ink/60">{r.kelompok}</td>
                        <td className="py-1.5 pr-3">{r.total}</td>
                        <td className="py-1.5 pr-3">{r.pending}</td>
                        <td className="py-1.5 pr-3">{r.sesuai}</td>
                        <td className="py-1.5 pr-3">{r.perlu_koreksi}</td>
                        <td className="py-1.5 pr-3">{r.resolved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto rounded-lg border border-line bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="mr-auto text-sm font-semibold text-navy-900">Daftar Temuan</h3>
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
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="rounded-md border border-line px-2 py-1 text-xs"
                  >
                    <option value="">Semua status</option>
                    <option value="pending">Pending</option>
                    <option value="sesuai">Sesuai</option>
                    <option value="perlu_koreksi">Perlu Koreksi</option>
                    <option value="resolved">Selesai</option>
                  </select>
                </div>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="border-b border-line text-left uppercase tracking-wide text-ink/50">
                      <th className="py-1.5 pr-3 font-medium">Kode</th>
                      <th className="py-1.5 pr-3 font-medium">NKS</th>
                      <th className="py-1.5 pr-3 font-medium">NURT</th>
                      <th className="py-1.5 pr-3 font-medium">No.Komoditi</th>
                      <th className="py-1.5 pr-3 font-medium">Nama KRT</th>
                      <th className="py-1.5 pr-3 font-medium">Keterangan</th>
                      <th className="py-1.5 pr-3 font-medium">Nilai</th>
                      <th className="py-1.5 pr-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {temuan.map((t) => (
                      <tr key={t.id} className="border-b border-line/60">
                        <td className="py-1.5 pr-3 font-medium text-navy-900">{t.kode_anomali}</td>
                        <td className="py-1.5 pr-3">{t.nks}</td>
                        <td className="py-1.5 pr-3">{t.nurt}</td>
                        <td className="py-1.5 pr-3">{t.nourutkomo}</td>
                        <td className="py-1.5 pr-3">{t.nama_krt}</td>
                        <td className="py-1.5 pr-3">
                          {t.keterangan}
                          {t.nama_lainnya ? ` — "${t.nama_lainnya}"` : ""}
                        </td>
                        <td className="py-1.5 pr-3">{fmtNum(t.nilai)}</td>
                        <td className="py-1.5 pr-3">
                          <StatusBadge status={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {loading && <p className="mt-2 text-xs text-ink/40">Memuat...</p>}
              </div>
            </div>
          )}

          {/* ---------- TAB: Konfirmasi PPL ---------- */}
          {subTab === "konfirmasi" && (
            <div className="rounded-lg border border-line bg-white p-4">
              <h3 className="text-sm font-semibold text-navy-900">
                Konfirmasi PPL — Temuan Belum Dikonfirmasi
              </h3>
              <p className="mt-1 text-xs text-ink/60">
                Periksa tiap temuan di lapangan/dokumen, lalu tandai statusnya.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
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

              {pendingList.length === 0 ? (
                <p className="mt-4 text-sm text-ink/50">
                  Tidak ada temuan pending untuk filter ini.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {pendingList.map((t) => (
                    <ConfirmCard key={t.id} temuan={t} onConfirm={confirmFinding} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubTabButton({
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
      className={`-mb-px flex items-center border-b-2 px-3 py-2 text-sm font-medium transition ${
        active ? "border-navy-700 text-navy-900" : "border-transparent text-ink/50 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: StatusKonfirmasi }) {
  const cls: Record<StatusKonfirmasi, string> = {
    pending: "bg-gold-100 text-gold-600",
    sesuai: "bg-moss-100 text-moss-700",
    perlu_koreksi: "bg-rust-100 text-rust-700",
    resolved: "bg-navy-100 text-navy-600",
  };
  const label: Record<StatusKonfirmasi, string> = {
    pending: "Pending",
    sesuai: "Sesuai",
    perlu_koreksi: "Perlu Koreksi",
    resolved: "Selesai",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls[status]}`}>
      {label[status]}
    </span>
  );
}

function ConfirmCard({
  temuan,
  onConfirm,
}: {
  temuan: Temuan;
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
