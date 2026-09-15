"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Narasi } from "./anomali-cepat";

// ============================================================================
// Halaman ini didesain ulang total (UI/UX) mengikuti brief:
//   "Konfirmasi PPL – Temuan Anomali" — kartu accordion, mobile-first,
//   dikelompokkan per tema, rincian fleksibel dgn highlight merah.
// TIDAK ADA perubahan pada logic backend, query dasar, struktur data,
// aturan anomali, atau proses konfirmasi — murni tampilan & interaksi.
// Satu-satunya tambahan data: kolom `rekomendasi` di kp_anomali_pengaturan
// (sudah ada tabelnya dari fitur Upload Aturan sebelumnya; cuma nambah 1
// kolom opsional utk teks "Catatan BPS Kabupaten" di bawah).
// ============================================================================

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
  rekomendasi_manual: string | null;
}

const fmtNum = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : v.toLocaleString("id-ID");
const fmtRp = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : "Rp" + v.toLocaleString("id-ID");

// Label + rujukan kode rincian + format angka per key. Dipetakan eksplisit
// satu-satu (bukan tebak-tebakan regex) supaya tidak salah format (dulu ada
// bug: "banyakHitung" ikut diformat Rupiah krn regex mendeteksi kata
// "hitung", padahal itu satuan banyaknya, bukan rupiah).
//
// PENTING soal nomor kolom yang ditampilkan (field `kode` di bawah):
// utk KP-01/KP-23/KP-24 (komoditas No.1-225, tabel 3 & 4), nomornya mengacu
// ke KOLOM CETAK di kuesioner fisik (Kolom 4=Sumber Perolehan [khusus ART],
// 5=Banyak Beli, 6=Nilai Beli, 7=Banyak Nonbeli, 8=Nilai Nonbeli,
// 9=Banyak Total, 10=Nilai Total) — BUKAN nama field database (KOLOM1-6) —
// supaya PPL bisa langsung cocokkan ke kertas kuesioner tanpa bingung.
// Utk kode lain (KP-02, KP-10, dst, tabel 5/No.226-347) nomor kolom cetak &
// nama field database KEBETULAN sama, jadi tidak perlu dibedakan.
const DETAIL_META: Record<string, { label: string; kode: string; format: "rp" | "num" }> = {
  banyakTotal: { label: "Banyaknya Total tercatat", kode: "Kolom 9", format: "num" },
  banyakHitung: { label: "Banyaknya seharusnya (Beli + Nonbeli)", kode: "Kolom 5 + Kolom 7", format: "num" },
  nilaiTotal: { label: "Nilai Total tercatat", kode: "Kolom 10", format: "rp" },
  nilaiHitung: { label: "Nilai seharusnya (Beli + Nonbeli)", kode: "Kolom 6 + Kolom 8", format: "rp" },
  sumberPerolehan: { label: "Kode Sumber Perolehan", kode: "Kolom 4", format: "num" },
  banyakBeli: { label: "Banyak Beli", kode: "Kolom 5", format: "num" },
  banyakNonbeli: { label: "Banyak Nonbeli", kode: "Kolom 7", format: "num" },
  kolom5: { label: "Sebulan Terakhir", kode: "KOLOM5", format: "rp" },
  kolom6: { label: "Setahun Terakhir", kode: "KOLOM6", format: "rp" },
  kolom6Total: { label: "Nilai Total Pelayanan Kesehatan", kode: "KOLOM6", format: "rp" },
  oopA: { label: "Biaya OOP (sub-a)", kode: "KOLOM10", format: "rp" },
  oopC: { label: "Biaya OOP (sub-c)", kode: "KOLOM12", format: "rp" },
  jmlKomoditas: { label: "Jumlah Komoditas Terisi", kode: "-", format: "num" },
  bumbuBumbuan: { label: "Nilai Bumbu-bumbuan", kode: "B432R11K5", format: "rp" },
  padiPadian: { label: "Nilai Padi-padian", kode: "B432R1K5", format: "rp" },
};

interface RincianRow {
  label: string;
  kode: string;
  value: string;
  bad: boolean;
}

// "Data yang dianalisis" — dibangun fleksibel dari field yang benar-benar ada
// di temuan (detail / banyak / nilai / nama_lainnya), BUKAN kolom tetap.
// `bad` menandai rincian mana yang jadi pemicu anomali (bukan semua rincian
// ditandai merah, cuma yang memang jadi sumber masalah). Baris pertama
// selalu No.Urut Komoditas (kalau ada) supaya PPL tahu rincian yg dimaksud.
function buildRincian(t: Temuan): RincianRow[] {
  const rows: RincianRow[] = [];
  const d = (t.detail ?? {}) as Record<string, any>;
  const kode = t.kode_anomali;
  const badKeys = new Set<string>();

  if (kode === "KP-01" || kode === "KP-23") {
    if (d.banyakTotal !== d.banyakHitung) badKeys.add("banyakTotal");
    if (d.nilaiTotal !== d.nilaiHitung) badKeys.add("nilaiTotal");
  } else if (kode === "KP-24") {
    const ket = String(t.keterangan ?? "");
    if (ket.includes("pembelian terisi")) badKeys.add("banyakBeli");
    if (ket.includes("tidak terisi")) badKeys.add("banyakNonbeli");
    badKeys.add("sumberPerolehan");
  } else if (kode === "KP-02") {
    if (d.kolom5 != null) badKeys.add("kolom5");
    if (d.kolom6 != null) badKeys.add("kolom6");
  } else if (kode === "KP-10") {
    badKeys.add(String(t.keterangan ?? "").includes("3a") ? "oopA" : "oopC");
  } else if (kode === "KP-19") {
    badKeys.add("bumbuBumbuan");
  } else if (kode === "KP-07" || kode === "KP-08" || kode === "KP-09") {
    badKeys.add("jmlKomoditas");
  }

  if (t.nourutkomo != null) {
    rows.push({ label: "Nomor Urut Komoditas", kode: "NOURUTKOMO", value: fmtNum(t.nourutkomo), bad: false });
  }

  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined || typeof v === "object") continue;
    const meta = DETAIL_META[k] ?? { label: k, kode: k, format: "num" as const };
    rows.push({
      label: meta.label,
      kode: meta.kode,
      value: typeof v === "number" ? (meta.format === "rp" ? fmtRp(v) : fmtNum(v)) : String(v),
      bad: badKeys.has(k),
    });
  }
  if (t.banyak != null) rows.push({ label: "Banyaknya", kode: "KOLOM5", value: fmtNum(t.banyak), bad: true });
  if (t.nilai != null) rows.push({ label: "Nilai", kode: "KOLOM6", value: fmtRp(t.nilai), bad: true });
  if (t.nama_lainnya) rows.push({ label: 'Isian "Lainnya"', kode: "KOLOM8", value: t.nama_lainnya, bad: true });
  return rows;

}

const STATUS_META: Record<StatusKonfirmasi, { label: string; badge: string }> = {
  pending: { label: "Belum Dikonfirmasi", badge: "bg-gold-100 text-gold-600" },
  sesuai: { label: "Sesuai", badge: "bg-moss-100 text-moss-700" },
  perlu_koreksi: { label: "Perlu Koreksi", badge: "bg-rust-100 text-rust-700" },
  resolved: { label: "Selesai", badge: "bg-navy-100 text-navy-600" },
};

// Warna badge kode, bervariasi per kelompok (A/B/C/D/E) supaya kartu mudah
// dipindai sekilas — bukan indikator status, cuma pembeda kategori.
function kodeBadgeClass(kelompok: string | null): string {
  const huruf = (kelompok ?? "").charAt(0);
  switch (huruf) {
    case "A":
      return "bg-rust-500 text-white";
    case "B":
      return "bg-gold-600 text-white";
    case "C":
      return "bg-navy-700 text-white";
    case "D":
      return "bg-moss-500 text-white";
    default:
      return "bg-navy-400 text-white";
  }
}

export default function KonfirmasiPplTab() {
  const [supabase] = useState(() => createClient());

  const [temuan, setTemuan] = useState<Temuan[]>([]);
  const [ringkasan, setRingkasan] = useState({ total: 0, pending: 0, sesuai: 0, perlu_koreksi: 0 });
  const [rekomendasiMap, setRekomendasiMap] = useState<Map<string, string>>(new Map());
  const [namaPpl, setNamaPpl] = useState("");
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

  const loadRekomendasi = useCallback(async () => {
    const { data } = await supabase.from("kp_anomali_pengaturan").select("kode, rekomendasi");
    setRekomendasiMap(new Map((data ?? []).map((r) => [r.kode, r.rekomendasi as string | null])) as Map<string, string>);
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);

    const { data: sum, error: sumErr } = await supabase.rpc("kp_anomali_summary");
    if (sumErr) {
      console.error("kp_anomali_summary error:", sumErr);
      setDebugError(`Gagal memuat ringkasan: ${sumErr.message}`);
    } else if (sum) {
      const rows = sum as { total: number; pending: number; sesuai: number; perlu_koreksi: number }[];
      setRingkasan({
        total: rows.reduce((a, b) => a + b.total, 0),
        pending: rows.reduce((a, b) => a + b.pending, 0),
        sesuai: rows.reduce((a, b) => a + b.sesuai, 0),
        perlu_koreksi: rows.reduce((a, b) => a + b.perlu_koreksi, 0),
      });
      setDebugError(null);
    }

    const { data: rows, error } = await supabase
      .from("kp_anomali_temuan")
      .select("*")
      .eq("status", "pending")
      .order("kelompok")
      .order("kode_anomali")
      .order("nks")
      .order("nurt");
    if (error) {
      console.error("loadData (konfirmasi) error:", error);
      setDebugError(`Gagal membaca temuan pending: ${error.message} (code: ${error.code})`);
    }
    const list = (rows ?? []) as Temuan[];
    setTemuan(list);
    setOpenGroups(new Set(list.map((t) => t.kelompok ?? "Lainnya"))); // default semua tema terbuka
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadRekomendasi();
    loadData();
  }, [loadRekomendasi, loadData]);

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
    setOpenIds((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    setRingkasan((prev) => ({
      ...prev,
      pending: Math.max(0, prev.pending - 1),
      sesuai: status === "sesuai" ? prev.sesuai + 1 : prev.sesuai,
      perlu_koreksi: status === "perlu_koreksi" ? prev.perlu_koreksi + 1 : prev.perlu_koreksi,
    }));
  }

  function toggleCard(id: number) {
    setOpenIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleGroup(g: string) {
    setOpenGroups((prev) => {
      const n = new Set(prev);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  }

  const jumlahSampel = new Set(temuan.map((t) => t.nks).filter(Boolean)).size;

  const grouped = new Map<string, Temuan[]>();
  for (const t of temuan) {
    const g = t.kelompok ?? "Lainnya";
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(t);
  }

  return (
    <div className="space-y-3 pb-6">
      {/* ---------- Header ---------- */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold text-navy-900 sm:text-lg">
            Konfirmasi PPL &ndash; Temuan Anomali
          </h1>
          <p className="mt-0.5 text-xs text-ink/60 sm:text-sm">
            Periksa setiap temuan di lapangan/dokumen, lalu tandai statusnya.
          </p>
        </div>
        <span
          title="Daftar temuan anomali dari sampel yang sudah dientri. Ketuk sebuah kartu untuk membuka detail dan mengonfirmasi."
          className="shrink-0 cursor-help rounded-full bg-navy-50 px-2.5 py-1.5 text-[11px] font-semibold text-navy-700"
        >
          {jumlahSampel} Sampel
        </span>
      </div>

      {/* Identitas PPL yang sedang konfirmasi — BUKAN filter wilayah, cuma
          dipakai utk mengisi field nama_ppl saat menyimpan konfirmasi. */}
      <input
        type="text"
        placeholder="Nama Anda (PPL) — isi sekali sebelum mulai konfirmasi"
        value={namaPpl}
        onChange={(e) => setNamaPpl(e.target.value)}
        className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
      />

      {debugError && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">
          ⚠ {debugError}
        </p>
      )}

      {/* ---------- Ringkasan singkat ---------- */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <SummaryBox label="Total" value={ringkasan.total} className="bg-navy-50 text-navy-900" />
        <SummaryBox label="Belum" value={ringkasan.pending} className="bg-gold-100 text-gold-600" />
        <SummaryBox label="Koreksi" value={ringkasan.perlu_koreksi} className="bg-rust-100 text-rust-700" />
        <SummaryBox label="Sesuai" value={ringkasan.sesuai} className="bg-moss-100 text-moss-700" />
      </div>

      {/* ---------- Daftar temuan, dikelompokkan per tema ---------- */}
      {loading ? (
        <p className="py-6 text-center text-sm text-ink/40">Memuat...</p>
      ) : temuan.length === 0 ? (
        <p className="rounded-lg border border-line bg-white p-6 text-center text-sm text-ink/50">
          🎉 Tidak ada temuan yang perlu dikonfirmasi saat ini.
        </p>
      ) : (
        [...grouped.entries()].map(([g, list]) => (
          <div key={g} className="overflow-hidden rounded-lg border border-line bg-white">
            <button
              onClick={() => toggleGroup(g)}
              className="flex w-full items-center justify-between gap-2 bg-navy-50 px-3 py-2.5 text-left"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-navy-900 sm:text-sm">
                {g} <span className="font-normal text-navy-400">({list.length})</span>
              </span>
              <Chevron open={openGroups.has(g)} />
            </button>
            {openGroups.has(g) && (
              <div className="space-y-2 p-2">
                {list.map((t) => (
                  <AnomaliCard
                    key={t.id}
                    temuan={t}
                    isOpen={openIds.has(t.id)}
                    onToggle={() => toggleCard(t.id)}
                    rekomendasi={t.rekomendasi_manual || rekomendasiMap.get(t.kode_anomali) || null}
                    onConfirm={confirmFinding}
                  />
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function SummaryBox({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded-lg px-1.5 py-2 ${className}`}>
      <div className="text-lg font-bold leading-none sm:text-xl">{value}</div>
      <div className="mt-0.5 text-[10px] font-medium leading-none sm:text-[11px]">{label}</div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-ink/50 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function AnomaliCard({
  temuan,
  isOpen,
  onToggle,
  rekomendasi,
  onConfirm,
}: {
  temuan: Temuan;
  isOpen: boolean;
  onToggle: () => void;
  rekomendasi: string | null;
  onConfirm: (id: number, status: "sesuai" | "perlu_koreksi", catatan: string) => void;
}) {
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[temuan.status];
  const rincian = buildRincian(temuan);

  async function handle(status: "sesuai" | "perlu_koreksi") {
    setBusy(true);
    await onConfirm(temuan.id, status, catatan);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {/* ---------- Header kartu (selalu tampil, collapsed & expanded) ---------- */}
      <button onClick={onToggle} className="flex w-full items-start gap-2.5 bg-white p-3 text-left">
        <span
          className={`mt-0.5 shrink-0 rounded-md px-2 py-1 text-[11px] font-bold ${kodeBadgeClass(temuan.kelompok)}`}
        >
          {temuan.kode_anomali}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-navy-900">Anomali {temuan.id}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-ink/70 sm:text-sm">{temuan.keterangan}</p>
          <p className="mt-1 text-[11px] text-ink/50">
            Sampel {temuan.nks ?? "-"} &middot; RT {temuan.nurt ?? "-"}
            {temuan.nama_krt ? ` \u00b7 ${temuan.nama_krt}` : ""}
          </p>
        </div>
        <Chevron open={isOpen} />
      </button>

      {/* ---------- Detail (accordion) ---------- */}
      {isOpen && (
        <div className="space-y-3 border-t border-line bg-paper/30 p-3">
          {/* Data yang dianalisis — jumlah baris fleksibel, bukan tabel lebar */}
          {rincian.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-bold text-navy-900">Data yang dianalisis</p>
              <div className="overflow-hidden rounded-md border border-line">
                {rincian.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs sm:text-sm ${
                      i > 0 ? "border-t border-line" : ""
                    } ${r.bad ? "bg-rust-100/60" : "bg-white"}`}
                  >
                    <span className="text-ink/60">
                      {r.label}
                      {r.kode !== "-" && (
                        <span className="ml-1 text-[10px] font-mono text-ink/35">({r.kode})</span>
                      )}
                    </span>
                    <span className={`text-right font-medium ${r.bad ? "text-rust-700" : "text-ink"}`}>
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Keterangan (narasi dari sistem, angka ditebalkan) */}
          {temuan.narasi && (
            <div className="flex gap-2 rounded-md border border-gold-400 bg-gold-100 p-2.5">
              <span className="mt-0.5 shrink-0 text-gold-600">&#9888;</span>
              <div>
                <p className="text-xs font-bold text-gold-600">Keterangan</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink/80 sm:text-sm">
                  <Narasi text={temuan.narasi} />
                  {temuan.nama_lainnya ? ` — isian: "${temuan.nama_lainnya}"` : ""}
                </p>
              </div>
            </div>
          )}

          {/* Catatan BPS Kabupaten (rekomendasi, informatif) */}
          {rekomendasi && (
            <div className="flex gap-2 rounded-md border border-navy-100 bg-navy-50 p-2.5">
              <span className="mt-0.5 shrink-0 text-navy-700">&#128214;</span>
              <div>
                <p className="text-xs font-bold text-navy-900">Catatan BPS Kabupaten</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink/80 sm:text-sm">{rekomendasi}</p>
              </div>
            </div>
          )}

          {/* Penjelasan PPL */}
          <div>
            <p className="mb-1 text-xs font-bold text-navy-900">Penjelasan PPL</p>
            <textarea
              placeholder="Tulis penjelasan di sini..."
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              className="min-h-[56px] w-full rounded-md border border-line bg-white px-2.5 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
            />
          </div>

          {/* Tombol konfirmasi — besar, mudah disentuh jempol */}
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => handle("sesuai")}
              className="flex-1 rounded-md bg-moss-500 py-3 text-sm font-semibold text-white transition hover:bg-moss-700 disabled:opacity-50"
            >
              &#10003; Sesuai
            </button>
            <button
              disabled={busy}
              onClick={() => handle("perlu_koreksi")}
              className="flex-1 rounded-md bg-rust-500 py-3 text-sm font-semibold text-white transition hover:bg-rust-700 disabled:opacity-50"
            >
              &#10007; Perlu Koreksi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
