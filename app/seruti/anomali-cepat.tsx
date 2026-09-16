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
  detail: Record<string, unknown> | null;
  narasi: string | null;
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

// Render narasi: bagian yang ditandai **...** (angka + rujukan kolom) ditebalkan,
// sisanya teks biasa.
export function Narasi({ text }: { text: string | null }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <b key={i} className="font-bold text-ink">
            {p.slice(2, -2)}
          </b>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export default function AnomaliCepatTab() {
  // Dibuat SEKALI saja (bukan tiap render) — penting supaya query/koneksi
  // Supabase-nya stabil, bukan instance baru tiap kali komponen re-render.
  const [supabase] = useState(() => createClient());

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
  const [aturanUploading, setAturanUploading] = useState(false);
  const [aturanMsg, setAturanMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [keterangan, setKeterangan] = useState("");

  const [temuan, setTemuan] = useState<Temuan[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [filterKode, setFilterKode] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterNks, setFilterNks] = useState("");
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
        type: data.warningRingkasanUpload ? "err" : "ok",
        text:
          `Berhasil. ${data.totalTemuan} temuan aktif dari file: ${data.filenames.join(", ")}. ` +
          `(${data.ringkasan.baru} baru, ${data.ringkasan.berubah} berubah/perlu dicek ulang, ` +
          `${data.ringkasan.tetap} tetap, ${data.ringkasan.selesai} selesai/teratasi)` +
          (data.warningRingkasanUpload ? ` ⚠ ${data.warningRingkasanUpload}` : ""),
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

  // ---------- upload Excel aturan anomali (ambang batas, aktif/nonaktif, dst) ----------
  async function handleUploadAturan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("aturanFile") as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) return;

    const fd = new FormData();
    fd.append("file", fileInput.files[0]);

    setAturanUploading(true);
    setAturanMsg(null);
    try {
      const res = await fetch("/api/anomali-kp/upload-aturan", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal upload aturan");
      const bagian: string[] = [];
      if (data.pengaturan) bagian.push(`${data.pengaturan} aturan/ambang batas`);
      if (data.qMaksimum) bagian.push(`${data.qMaksimum} batas maks. komoditas`);
      if (data.kalori) bagian.push(`${data.kalori} referensi kalori`);
      const errTxt = data.errors?.length ? ` ⚠ ${data.errors.join(" | ")}` : "";
      setAturanMsg({
        type: data.errors?.length ? "err" : "ok",
        text: `Sinkron: ${bagian.join(", ") || "tidak ada baris valid"}.${errTxt}`,
      });
      form.reset();
    } catch (err: any) {
      setAturanMsg({ type: "err", text: err.message });
    } finally {
      setAturanUploading(false);
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
    if (filterNks.trim()) query = query.eq("nks", filterNks.trim());
    const { data: rows, error: rowsErr2 } = await query.order("kode_anomali").order("nks").order("nurt");
    if (rowsErr2) {
      console.error("loadData temuan error:", rowsErr2);
      setDebugError(`Gagal membaca daftar temuan: ${rowsErr2.message} (code: ${rowsErr2.code})`);
    }
    setTemuan((rows ?? []) as Temuan[]);
    setLoading(false);
  }, [supabase, filterKode, filterStatus, filterNks]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
          sistem otomatis memakai file yang relevan: VSEN26.KP (diawali angka{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">3</code>,{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">4</code>,{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">5</code>,{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">9</code>) maupun VSEN26.M (diawali{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">1_1</code>,{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">2_1</code>,{" "}
          <code className="rounded bg-navy-50 px-1 py-0.5">2_2</code>) — dan mengabaikan sisanya.
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

      {/* ---------- Upload Aturan Anomali (ambang batas, aktif/nonaktif) ---------- */}
      <div className="rounded-lg border border-line bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-navy-900">Upload Aturan Anomali (Opsional)</h2>
          <a
            href="/seruti/kelola-anomali"
            className="shrink-0 whitespace-nowrap rounded-md bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-100"
          >
            Kelola Aturan &rarr;
          </a>
        </div>
        <p className="mt-1 text-xs text-ink/60">
          Upload file Excel <code className="rounded bg-navy-50 px-1 py-0.5">Draft_Aturan_Anomali_KP.xlsx</code> (atau
          versi yang sudah Anda edit) untuk mengatur ambang batas, status aktif/nonaktif tiap kode, batas maksimum
          konsumsi per komoditas, dan referensi kalori — tanpa perlu ubah kode. Kalau belum pernah upload, sistem
          otomatis pakai nilai default. Atau klik &quot;Kelola Aturan&quot; di atas utk lihat &amp; edit semua
          aturan langsung tanpa Excel.
        </p>
        <form onSubmit={handleUploadAturan} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="file" name="aturanFile" accept=".xlsx" required className="text-xs" />
          <button
            type="submit"
            disabled={aturanUploading}
            className="rounded-md bg-navy-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-navy-900 disabled:opacity-50"
          >
            {aturanUploading ? "Memproses..." : "Upload Aturan"}
          </button>
        </form>
        {aturanMsg && (
          <p className={`mt-2 text-sm ${aturanMsg.type === "ok" ? "text-moss-700" : "text-rust-700"}`}>
            {aturanMsg.text}
          </p>
        )}
      </div>

      {debugError && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">
          ⚠ Diagnostik: {debugError}
        </p>
      )}

      {!lastUpload ? (
        <p className="text-xs text-ink/40">Belum ada info upload terakhir (data di bawah tetap ditampilkan kalau ada).</p>
      ) : (
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
      )}

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
            <input
              type="text"
              placeholder="Filter NKS..."
              value={filterNks}
              onChange={(e) => setFilterNks(e.target.value)}
              className="w-28 rounded-md border border-line px-2 py-1 text-xs"
            />
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
                  <td className="py-1.5 pr-3 text-ink/80">
                    {t.keterangan}
                    {t.nama_lainnya ? ` — "${t.nama_lainnya}"` : ""}
                    {t.narasi && (
                      <div className="mt-0.5 text-[11px] text-ink/70">
                        <Narasi text={t.narasi} />
                      </div>
                    )}
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
    </div>
  );
}

export function StatusBadge({ status }: { status: StatusKonfirmasi }) {
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
