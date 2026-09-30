"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

// ------------------------------------------------------------------------
// Halaman publik (tanpa login): Identifikasi SLS/Jorong Terdampak Bencana
// Hidrometeorologi (banjir dkk. akhir 2025).
//
// 2 tab:
//   - "Identifikasi": mitra memilih nama, memilih kecamatan/nagari, lalu
//     menjawab pertanyaan gate tingkat nagari, lalu (jika ada jorong yg
//     terdampak) mengisi detail per jorong.
//   - "Monitoring Hasil Identifikasi": rekap agregat per nagari & per
//     jorong, termasuk penanda konflik antar mitra.
// ------------------------------------------------------------------------

type SubslsItem = { idsubsls: string; sub_sls: string };
type JorongItem = { idsls: string; jorong: string; subsls: SubslsItem[] };
type NagariItem = { iddesa: string; nagari: string; daftar_awal: boolean; jorong: JorongItem[] };
type KecamatanItem = { kecamatan: string; nagari: NagariItem[] };

type MitraItem = {
  id: number;
  nama: string;
  alamat_kecamatan: string | null;
  alamat_desa: string | null;
  no_telp: string | null;
  saran_iddesa: string | null;
  saran_in_scope: boolean;
};

type MonitoringNagariRow = {
  iddesa: string;
  kecamatan: string;
  nagari: string;
  jumlah_jorong_total: number;
  jumlah_subsls_total: number;
  jumlah_gate_total: number;
  jumlah_gate_ya: number;
  jumlah_gate_tidak: number;
  konflik_gate: boolean;
  jumlah_jorong_dilaporkan_terdampak: number;
  terakhir_diisi: string | null;
};

type MonitoringJorongRow = {
  idsls: string;
  iddesa: string;
  kecamatan: string;
  nagari: string;
  jorong: string;
  jumlah_subsls_total: number;
  jumlah_identifikasi: number;
  jumlah_bilang_seluruh: number;
  jumlah_bilang_sebagian: number;
  konflik_jorong: boolean;
  subsls_terdampak_gabungan: string[];
  jumlah_subsls_terdampak_gabungan: number;
  nama_mitra_terakhir: string | null;
  terakhir_diisi: string | null;
  total_kk_terdampak: number;
};

// Status turunan (dihitung di client dari gabungan gate nagari + isian
// jorong) utk dashboard "Progress Identifikasi" di tab Monitoring.
type JorongStatus = "terdampak" | "tidak_terdampak" | "belum";
type NagariStatus = "belum" | "sedang" | "selesai";

type JorongDerived = MonitoringJorongRow & { status: JorongStatus; konflik: boolean };
type NagariDerived = MonitoringNagariRow & {
  status: NagariStatus;
  terdampakCount: number;
  konflik: boolean;
};

// Baris rekap datar tingkat Sub SLS (dipakai tab Monitoring, menggantikan
// tabel "Rekap per Nagari" & "Rekap per Jorong" sebelumnya) -- satu baris
// per Sub SLS, status diturunkan dari status Jorong induknya + apakah
// idsubsls tsb ada di gabungan subsls_terdampak Jorong tersebut.
type SubslsFlatRow = {
  idsubsls: string;
  idsls: string;
  iddesa: string;
  kecamatan: string;
  nagari: string;
  jorong: string;
  subSls: string;
  daftarAwal: boolean;
  status: JorongStatus;
  perkiraanKk: number | null;
};

const INDIKATOR_DAMPAK: { key: string; label: string }[] = [
  { key: "korban", label: "Korban meninggal, hilang, atau luka" },
  { key: "hunian_rusak", label: "Hunian rusak / terendam" },
  { key: "lahan_ternak", label: "Lahan / ternak tertimbun" },
  { key: "aset_usaha", label: "Aset usaha keluarga rusak" },
  {
    key: "efek_berantai",
    label:
      "Fisik/aset aman, namun fungsi kehidupan terganggu akibat efek berantai bencana sekitar",
  },
];

type JorongLocalState = {
  seluruh: boolean | null;
  checkedSubsls: Set<string>;
  indikator: Set<string>;
  indikatorKk: Record<string, number | "">;
  catatan: string;
  submitting: boolean;
  submitted: boolean;
  error: string | null;
};

function emptyJorongState(): JorongLocalState {
  return {
    seluruh: null,
    checkedSubsls: new Set(),
    indikator: new Set(),
    indikatorKk: {},
    catatan: "",
    submitting: false,
    submitted: false,
    error: null,
  };
}

function formatTanggal(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---- Komponen kecil utk dashboard "Progress Identifikasi" ---------------

function StatCard({
  ikon,
  warna,
  label,
  nilai,
  sub,
}: {
  ikon: string;
  warna: string;
  label: string;
  nilai: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-base ${warna}`}>
        {ikon}
      </div>
      <p className="mt-2 text-xs text-ink/60">{label}</p>
      <p className="text-xl font-semibold text-ink">
        {nilai}
        {sub && <span className="ml-1.5 text-xs font-medium text-ink/50">{sub}</span>}
      </p>
    </div>
  );
}

function MiniStat({ warna, label, nilai }: { warna: string; label: string; nilai: number }) {
  return (
    <div className={`rounded-md px-3 py-2 ${warna}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="text-lg font-semibold">{nilai}</p>
    </div>
  );
}

const STATUS_JORONG_SPEC: Record<JorongStatus, { label: string; cls: string }> = {
  terdampak: { label: "Terdampak", cls: "bg-orange-100 text-orange-700" },
  tidak_terdampak: { label: "Tidak Terdampak", cls: "bg-moss-100 text-moss-700" },
  belum: { label: "Belum Diisi", cls: "bg-gray-100 text-gray-600" },
};

function JorongStatusBadge({ status }: { status: JorongStatus }) {
  const spec = STATUS_JORONG_SPEC[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${spec.cls}`}>{spec.label}</span>;
}

const SUBSLS_PAGE_SIZE = 25;

// Tabel rekap tingkat Sub SLS untuk tab Monitoring, dipakai 2x (daftar awal
// & nagari tambahan) -- masing-masing dgn filter, pencarian, paginasi, dan
// tombol export ke Excel sendiri-sendiri.
function RekapSubslsSection({
  title,
  subtitle,
  rows,
  kecamatanOptions,
  fileName,
}: {
  title: string;
  subtitle?: string;
  rows: SubslsFlatRow[];
  kecamatanOptions: string[];
  fileName: string;
}) {
  const [kecFilter, setKecFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | JorongStatus>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kecFilter && r.kecamatan !== kecFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (
        q &&
        !r.nagari.toLowerCase().includes(q) &&
        !r.jorong.toLowerCase().includes(q) &&
        !r.subSls.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [rows, kecFilter, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / SUBSLS_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const paged = filtered.slice(
    (pageClamped - 1) * SUBSLS_PAGE_SIZE,
    pageClamped * SUBSLS_PAGE_SIZE
  );

  function handleExport() {
    const dataRows = filtered.map((r) => ({
      "ID SLS": r.idsls,
      Kecamatan: r.kecamatan,
      Nagari: r.nagari,
      "Jorong/SLS": r.jorong,
      "Sub SLS": r.subSls,
      "Status Terdampak": STATUS_JORONG_SPEC[r.status].label,
      "Perkiraan Jumlah KK Terdampak": r.perkiraanKk ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(dataRows);
    // Paksa kolom "ID SLS" (kolom pertama, kode 14 digit) jadi bertipe teks
    // -- kalau tidak, Excel bisa membuang angka nol di depan kode begitu
    // file dibuka (pola sama dgn export kode wilayah lain di aplikasi ini).
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let R = 1; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: 0 });
      const cell = ws[addr];
      if (cell) cell.t = "s";
    }
    ws["!cols"] = [
      { wch: 18 }, // ID SLS
      { wch: 16 }, // Kecamatan
      { wch: 22 }, // Nagari
      { wch: 22 }, // Jorong/SLS
      { wch: 10 }, // Sub SLS
      { wch: 16 }, // Status Terdampak
      { wch: 14 }, // Perkiraan KK
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium text-orange-900">{title}</h2>
          {subtitle && <p className="text-xs text-ink/60">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="shrink-0 rounded-md border border-orange-700 bg-white px-3 py-1.5 text-sm font-medium text-orange-700 transition hover:bg-orange-50 disabled:opacity-40"
        >
          Export ke Excel
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-3 rounded-md border border-line bg-white p-3 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-ink/60">Filter Kecamatan</label>
          <select
            value={kecFilter}
            onChange={(e) => {
              setKecFilter(e.target.value);
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
          >
            <option value="">Semua kecamatan</option>
            {kecamatanOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-ink/60">Filter Status</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "" | JorongStatus);
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
          >
            <option value="">Semua status</option>
            <option value="terdampak">Terdampak</option>
            <option value="tidak_terdampak">Tidak Terdampak</option>
            <option value="belum">Belum Diisi</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-ink/60">Cari Nagari/Jorong/Sub SLS</label>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Ketik kata kunci..."
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
          />
        </div>
      </div>

      <div className="mt-2 overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-orange-50 text-orange-600">
            <tr>
              <th className="px-3 py-2 font-medium">Kecamatan</th>
              <th className="px-3 py-2 font-medium">Nagari</th>
              <th className="px-3 py-2 font-medium">Jorong/SLS</th>
              <th className="px-3 py-2 font-medium">Sub SLS</th>
              <th className="px-3 py-2 font-medium">Status Terdampak</th>
              <th className="px-3 py-2 font-medium">Perkiraan Jumlah KK Terdampak</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.idsubsls} className="border-t border-line">
                <td className="px-3 py-2 text-ink/80">{r.kecamatan}</td>
                <td className="px-3 py-2 text-ink/80">{r.nagari}</td>
                <td className="px-3 py-2 font-medium text-ink">{r.jorong}</td>
                <td className="px-3 py-2 text-ink/80">{r.subSls}</td>
                <td className="px-3 py-2">
                  <JorongStatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2 text-ink/80">
                  {r.perkiraanKk != null ? `${r.perkiraanKk} KK` : "-"}
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-ink/50">
                  Tidak ada data yang cocok dengan filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <div className="mt-2 flex items-center justify-between text-sm text-ink/60">
          <span>
            {(pageClamped - 1) * SUBSLS_PAGE_SIZE + 1}-
            {Math.min(pageClamped * SUBSLS_PAGE_SIZE, filtered.length)} dari {filtered.length} baris
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={pageClamped <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40"
            >
              &lsaquo;
            </button>
            <button
              type="button"
              disabled={pageClamped >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40"
            >
              &rsaquo;
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function BencanaPage() {
  const [tab, setTab] = useState<"identifikasi" | "monitoring">("identifikasi");

  const [wilayah, setWilayah] = useState<KecamatanItem[]>([]);
  const [mitraList, setMitraList] = useState<MitraItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Identitas pengisi
  const [namaInput, setNamaInput] = useState("");
  const [mitraIdManual, setMitraIdManual] = useState<number | null>(null);
  const [saranDipakai, setSaranDipakai] = useState(false);

  // Filter wilayah (selalu dapat diubah bebas)
  const [selectedKecamatan, setSelectedKecamatan] = useState("");
  const [selectedIddesa, setSelectedIddesa] = useState("");

  // Gate tingkat nagari
  const [gateAnswer, setGateAnswer] = useState<boolean | null>(null);
  const [gateCatatan, setGateCatatan] = useState("");
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateSubmitted, setGateSubmitted] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // Per-jorong
  const [jorongState, setJorongState] = useState<Record<string, JorongLocalState>>({});

  // Monitoring
  const [monLoading, setMonLoading] = useState(false);
  const [monError, setMonError] = useState<string | null>(null);
  const [monNagari, setMonNagari] = useState<MonitoringNagariRow[]>([]);
  const [monJorong, setMonJorong] = useState<MonitoringJorongRow[]>([]);

  useEffect(() => {
    async function loadAwal() {
      try {
        const [wRes, mRes] = await Promise.all([
          fetch("/api/bencana/wilayah"),
          fetch("/api/bencana/mitra"),
        ]);
        const wJson = await wRes.json();
        const mJson = await mRes.json();
        if (!wRes.ok) throw new Error(wJson.error || "Gagal memuat daftar wilayah.");
        if (!mRes.ok) throw new Error(mJson.error || "Gagal memuat daftar mitra.");
        setWilayah(wJson.data ?? []);
        setMitraList(mJson.data ?? []);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Gagal memuat data awal.");
      } finally {
        setLoading(false);
      }
    }
    loadAwal();
  }, []);

  useEffect(() => {
    if (tab !== "monitoring") return;
    async function loadMonitoring() {
      setMonLoading(true);
      setMonError(null);
      try {
        const res = await fetch("/api/bencana/monitoring");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memuat monitoring.");
        setMonNagari(json.nagari ?? []);
        setMonJorong(json.jorong ?? []);
      } catch (err) {
        setMonError(err instanceof Error ? err.message : "Gagal memuat monitoring.");
      } finally {
        setMonLoading(false);
      }
    }
    loadMonitoring();
  }, [tab]);

  const matchedMitra = useMemo(() => {
    const nama = namaInput.trim().toLowerCase();
    if (!nama) return null;
    return mitraList.find((m) => m.nama.trim().toLowerCase() === nama) ?? null;
  }, [namaInput, mitraList]);

  // Saat mitra cocok ditemukan & punya saran dalam scope, otomatis set filter
  // wilayah (hanya kalau pengguna belum mengubah filter secara manual).
  useEffect(() => {
    if (!matchedMitra || saranDipakai) return;
    if (!matchedMitra.saran_in_scope || !matchedMitra.saran_iddesa) return;
    for (const kec of wilayah) {
      const nag = kec.nagari.find((n) => n.iddesa === matchedMitra.saran_iddesa);
      if (nag) {
        setSelectedKecamatan(kec.kecamatan);
        setSelectedIddesa(nag.iddesa);
        setSaranDipakai(true);
        break;
      }
    }
  }, [matchedMitra, saranDipakai, wilayah]);

  const kecamatanOptions = wilayah.map((k) => k.kecamatan);
  const nagariOptions = useMemo(() => {
    const kec = wilayah.find((k) => k.kecamatan === selectedKecamatan);
    return kec ? kec.nagari : [];
  }, [wilayah, selectedKecamatan]);

  const selectedNagariItem = useMemo(() => {
    return nagariOptions.find((n) => n.iddesa === selectedIddesa) ?? null;
  }, [nagariOptions, selectedIddesa]);

  function resetWilayahWorkflow() {
    setGateAnswer(null);
    setGateCatatan("");
    setGateSubmitted(false);
    setGateError(null);
    setJorongState({});
  }

  function handleKecamatanChange(kec: string) {
    setSelectedKecamatan(kec);
    setSelectedIddesa("");
    setSaranDipakai(true);
    resetWilayahWorkflow();
  }

  function handleNagariChange(iddesa: string) {
    setSelectedIddesa(iddesa);
    setSaranDipakai(true);
    resetWilayahWorkflow();
  }

  function identitasSiap() {
    return namaInput.trim().length > 0 && selectedIddesa.length > 0;
  }

  async function submitGate(jawaban: boolean) {
    if (!selectedNagariItem || !selectedKecamatan) return;
    setGateAnswer(jawaban);
    setGateSubmitting(true);
    setGateError(null);
    try {
      const res = await fetch("/api/bencana/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          iddesa: selectedNagariItem.iddesa,
          kecamatan: selectedKecamatan,
          nagari: selectedNagariItem.nagari,
          mitra_id: matchedMitra?.id ?? mitraIdManual,
          nama_mitra: namaInput.trim(),
          ada_jorong_terdampak: jawaban,
          catatan: gateCatatan,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengirim jawaban.");
      setGateSubmitted(true);
    } catch (err) {
      setGateError(err instanceof Error ? err.message : "Gagal mengirim jawaban.");
      setGateAnswer(null);
    } finally {
      setGateSubmitting(false);
    }
  }

  function getJorongState(idsls: string): JorongLocalState {
    return jorongState[idsls] ?? emptyJorongState();
  }

  function updateJorongState(idsls: string, patch: Partial<JorongLocalState>) {
    setJorongState((prev) => ({
      ...prev,
      [idsls]: { ...(prev[idsls] ?? emptyJorongState()), ...patch },
    }));
  }

  function toggleSubsls(idsls: string, idsubsls: string) {
    const cur = getJorongState(idsls);
    const next = new Set(cur.checkedSubsls);
    if (next.has(idsubsls)) next.delete(idsubsls);
    else next.add(idsubsls);
    updateJorongState(idsls, { checkedSubsls: next });
  }

  function toggleIndikator(idsls: string, key: string) {
    const cur = getJorongState(idsls);
    const next = new Set(cur.indikator);
    const nextKk = { ...cur.indikatorKk };
    if (next.has(key)) {
      next.delete(key);
      delete nextKk[key];
    } else {
      next.add(key);
    }
    updateJorongState(idsls, { indikator: next, indikatorKk: nextKk });
  }

  function setIndikatorKk(idsls: string, key: string, value: string) {
    const cur = getJorongState(idsls);
    const nextKk = { ...cur.indikatorKk };
    if (value === "") {
      nextKk[key] = "";
    } else {
      const num = Math.max(0, Math.floor(Number(value)));
      nextKk[key] = Number.isFinite(num) ? num : "";
    }
    updateJorongState(idsls, { indikatorKk: nextKk });
  }

  async function submitJorong(jorong: JorongItem) {
    if (!selectedNagariItem || !selectedKecamatan) return;
    const state = getJorongState(jorong.idsls);
    if (state.seluruh === null) return;
    if (!state.seluruh && state.checkedSubsls.size === 0) {
      updateJorongState(jorong.idsls, {
        error: "Pilih minimal satu Sub SLS yang terdampak, atau tandai seluruh Sub SLS terdampak.",
      });
      return;
    }

    updateJorongState(jorong.idsls, { submitting: true, error: null });
    try {
      const res = await fetch("/api/bencana/jorong", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idsls: jorong.idsls,
          iddesa: selectedNagariItem.iddesa,
          kecamatan: selectedKecamatan,
          nagari: selectedNagariItem.nagari,
          jorong: jorong.jorong,
          mitra_id: matchedMitra?.id ?? mitraIdManual,
          nama_mitra: namaInput.trim(),
          seluruh_subsls_terdampak: state.seluruh,
          subsls_terdampak: Array.from(state.checkedSubsls),
          indikator_dampak: Array.from(state.indikator),
          indikator_dampak_kk: Object.fromEntries(
            Array.from(state.indikator)
              .filter((key) => typeof state.indikatorKk[key] === "number")
              .map((key) => [key, state.indikatorKk[key] as number])
          ),
          catatan: state.catatan,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengirim data jorong.");
      updateJorongState(jorong.idsls, { submitting: false, submitted: true, error: null });
    } catch (err) {
      updateJorongState(jorong.idsls, {
        submitting: false,
        error: err instanceof Error ? err.message : "Gagal mengirim data jorong.",
      });
    }
  }

  // ---- Turunan status "Progress Identifikasi" -----------------------
  // Jorong dianggap:
  //  - "terdampak"       kalau sudah ada isian jorong (seluruh/sebagian).
  //  - "tidak_terdampak" kalau nagarinya sudah dijawab "tidak ada jorong
  //    terdampak" pada gate (shg jorong ini otomatis tidak perlu diisi).
  //  - "belum"           kalau belum ada isian sama sekali (gate blm
  //    dijawab, atau gate "ya" tapi jorong ini blm direview).
  const nagariByIddesa = new Map(monNagari.map((n) => [n.iddesa, n]));

  const jorongDerived: JorongDerived[] = monJorong.map((j) => {
    const nag = nagariByIddesa.get(j.iddesa);
    const nagariBilangTidak = (nag?.jumlah_gate_tidak ?? 0) > 0 && (nag?.jumlah_gate_ya ?? 0) === 0;
    let status: JorongStatus;
    if (j.jumlah_identifikasi > 0) status = "terdampak";
    else if (nagariBilangTidak) status = "tidak_terdampak";
    else status = "belum";
    const konflik = j.konflik_jorong || (nag?.konflik_gate ?? false);
    return { ...j, status, konflik };
  });

  const jorongByIddesa = new Map<string, JorongDerived[]>();
  for (const j of jorongDerived) {
    const list = jorongByIddesa.get(j.iddesa) ?? [];
    list.push(j);
    jorongByIddesa.set(j.iddesa, list);
  }

  // ---- Rekap datar tingkat Sub SLS (tab Monitoring) ------------------
  // Diturunkan dari pohon "wilayah" (selalu lengkap 1085 Sub SLS) +
  // jorongDerived (status & gabungan subsls_terdampak per Jorong). Status
  // per Sub SLS: ikut status Jorong induknya untuk "belum"/"tidak_terdampak";
  // kalau Jorong "terdampak", baru dicek apakah idsubsls tsb memang ada di
  // subsls_terdampak_gabungan Jorong itu (Sub SLS lain di Jorong yg sama yg
  // tidak dicentang dianggap "tidak_terdampak", bukan "terdampak").
  const jorongDerivedByIdsls = new Map(jorongDerived.map((j) => [j.idsls, j]));

  const subslsFlatAll: SubslsFlatRow[] = [];
  for (const kec of wilayah) {
    for (const nag of kec.nagari) {
      for (const jor of nag.jorong) {
        const jd = jorongDerivedByIdsls.get(jor.idsls);
        const jStatus: JorongStatus = jd?.status ?? "belum";
        const terdampakSet = new Set(jd?.subsls_terdampak_gabungan ?? []);
        for (const s of jor.subsls) {
          let status: JorongStatus;
          if (jStatus === "belum") status = "belum";
          else if (jStatus === "tidak_terdampak") status = "tidak_terdampak";
          else status = terdampakSet.has(s.idsubsls) ? "terdampak" : "tidak_terdampak";
          subslsFlatAll.push({
            idsubsls: s.idsubsls,
            idsls: jor.idsls,
            iddesa: nag.iddesa,
            kecamatan: kec.kecamatan,
            nagari: nag.nagari,
            jorong: jor.jorong,
            subSls: s.sub_sls,
            daftarAwal: nag.daftar_awal,
            status,
            perkiraanKk: status === "terdampak" ? jd?.total_kk_terdampak ?? null : null,
          });
        }
      }
    }
  }

  const subslsDaftarAwal = subslsFlatAll.filter((r) => r.daftarAwal);
  const subslsTambahan = subslsFlatAll.filter((r) => !r.daftarAwal);

  // Nagari dianggap "selesai" kalau: gate-nya "tidak" (tidak perlu jorong),
  // atau gate-nya "ya" DAN seluruh jorong di nagari itu sudah "terdampak".
  // "sedang" kalau baru sebagian jorong yg sudah diisi. "belum" kalau gate
  // sama sekali belum dijawab.
  const nagariDerived: NagariDerived[] = monNagari.map((n) => {
    const jorongList = jorongByIddesa.get(n.iddesa) ?? [];
    const terdampakCount = jorongList.filter((j) => j.status === "terdampak").length;
    let status: NagariStatus;
    if (n.jumlah_gate_total === 0) status = "belum";
    else if (n.jumlah_gate_ya === 0 && n.jumlah_gate_tidak > 0) status = "selesai";
    else if (n.jumlah_gate_ya > 0 && n.jumlah_jorong_total > 0 && terdampakCount >= n.jumlah_jorong_total)
      status = "selesai";
    else status = "sedang";
    const konflik = n.konflik_gate || jorongList.some((j) => j.konflik);
    return { ...n, status, terdampakCount, konflik };
  });

  const totalKecamatanMon = new Set(monNagari.map((n) => n.kecamatan)).size;
  const totalNagariMon = monNagari.length;
  const totalJorongMon = jorongDerived.length;
  const jorongSudahDiisi = jorongDerived.filter((j) => j.status !== "belum").length;
  const jorongTerdampak = jorongDerived.filter((j) => j.status === "terdampak").length;
  const jorongTidakTerdampak = jorongDerived.filter((j) => j.status === "tidak_terdampak").length;
  const jorongBelumDiisi = jorongDerived.filter((j) => j.status === "belum").length;
  const jorongKonflikCount = jorongDerived.filter((j) => j.konflik).length;
  const pctSudahDiisi = totalJorongMon > 0 ? Math.round((jorongSudahDiisi / totalJorongMon) * 100) : 0;

  const kecamatanProgressMap = new Map<string, { total: number; sudah: number }>();
  for (const j of jorongDerived) {
    const cur = kecamatanProgressMap.get(j.kecamatan) ?? { total: 0, sudah: 0 };
    cur.total += 1;
    if (j.status !== "belum") cur.sudah += 1;
    kecamatanProgressMap.set(j.kecamatan, cur);
  }
  const kecamatanProgress = Array.from(kecamatanProgressMap.entries())
    .map(([kecamatan, v]) => ({
      kecamatan,
      total: v.total,
      sudah: v.sudah,
      pct: v.total > 0 ? Math.round((v.sudah / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  const nagariBelumList = nagariDerived
    .filter((n) => n.status === "belum")
    .sort((a, b) => a.nagari.localeCompare(b.nagari));
  const nagariKonflikList = nagariDerived
    .filter((n) => n.konflik)
    .sort((a, b) => a.nagari.localeCompare(b.nagari));

  const lastUpdatedMon =
    [...monNagari.map((n) => n.terakhir_diisi), ...monJorong.map((j) => j.terakhir_diisi)]
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <p className="text-ink/60">Memuat...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16 text-center">
        <p className="rounded-md bg-rust-100 px-4 py-3 text-rust-700">{loadError}</p>
      </main>
    );
  }

  return (
    <main
      className={`mx-auto min-h-screen px-5 py-10 ${
        tab === "monitoring" ? "max-w-6xl" : "max-w-2xl"
      }`}
    >
      <p className="text-sm font-medium text-orange-400">BPS Kabupaten Solok</p>
      <h1 className="mt-1 text-2xl font-semibold text-orange-900">
        Identifikasi SLS/Jorong Terdampak Bencana Hidrometeorologi
      </h1>
      <p className="mt-2 text-sm text-ink/70">
        Bencana banjir dan hidrometeorologi lainnya akhir 2025 lalu berdampak pada
        sebagian wilayah Kabupaten Solok. Mohon bantuan Bapak/Ibu mitra untuk
        mengidentifikasi Jorong/Sub SLS yang terdampak di wilayah tugas
        masing-masing.
      </p>

      <div className="mt-6 flex gap-1 rounded-md bg-orange-50 p-1">
        <button
          type="button"
          onClick={() => setTab("identifikasi")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "identifikasi"
              ? "bg-white text-orange-900 shadow-sm"
              : "text-orange-400 hover:text-orange-600"
          }`}
        >
          Identifikasi
        </button>
        <button
          type="button"
          onClick={() => setTab("monitoring")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "monitoring"
              ? "bg-white text-orange-900 shadow-sm"
              : "text-orange-400 hover:text-orange-600"
          }`}
        >
          Monitoring Hasil Identifikasi
        </button>
      </div>

      {tab === "identifikasi" ? (
        <div className="mt-6 flex flex-col gap-6">
          <section className="rounded-md border border-line bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-orange-400">
              Kriteria Kode 1: Terdampak
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink/80">
              <li>&bull; Korban meninggal, hilang, atau luka.</li>
              <li>&bull; Hunian rusak/terendam.</li>
              <li>&bull; Lahan/ternak tertimbun.</li>
              <li>&bull; Aset usaha keluarga rusak.</li>
              <li>
                &bull; Fisik/aset aman, namun fungsi kehidupan terganggu akibat
                efek berantai bencana sekitar.
              </li>
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium text-ink">
                Nama Bapak/Ibu <span className="text-rust-500">*</span>
              </label>
              <input
                list="daftar-mitra"
                value={namaInput}
                onChange={(e) => {
                  setNamaInput(e.target.value);
                  setMitraIdManual(null);
                }}
                placeholder="Pilih dari daftar atau ketik nama"
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
              />
              <datalist id="daftar-mitra">
                {mitraList.map((m) => (
                  <option key={m.id} value={m.nama} />
                ))}
              </datalist>
              {matchedMitra?.saran_in_scope && matchedMitra.saran_iddesa && (
                <p className="mt-1 text-xs text-orange-400">
                  Wilayah tugas disarankan berdasarkan alamat: {matchedMitra.alamat_desa},{" "}
                  {matchedMitra.alamat_kecamatan}. Filter di bawah dapat diubah bebas.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-ink">
                  Kecamatan <span className="text-rust-500">*</span>
                </label>
                <select
                  value={selectedKecamatan}
                  onChange={(e) => handleKecamatanChange(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                >
                  <option value="">Pilih kecamatan</option>
                  {kecamatanOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-ink">
                  Nagari <span className="text-rust-500">*</span>
                </label>
                <select
                  value={selectedIddesa}
                  onChange={(e) => handleNagariChange(e.target.value)}
                  disabled={!selectedKecamatan}
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 disabled:opacity-50"
                >
                  <option value="">Pilih nagari</option>
                  {nagariOptions.map((n) => (
                    <option key={n.iddesa} value={n.iddesa}>
                      {n.nagari}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {identitasSiap() && selectedNagariItem && (
            <section className="rounded-md border border-line bg-white p-4">
              <p className="text-sm text-ink">
                Sehubungan dengan terdampaknya beberapa wilayah akibat bencana
                banjir akhir 2025 lalu, apakah ada Jorong di Nagari{" "}
                <span className="font-medium">{selectedNagariItem.nagari}</span>{" "}
                yang Bapak/Ibu ketahui terdampak bencana hidrometeorologi?
              </p>

              {!gateSubmitted ? (
                <>
                  <div className="mt-3 flex gap-3">
                    <button
                      type="button"
                      disabled={gateSubmitting}
                      onClick={() => submitGate(true)}
                      className="flex-1 rounded-md bg-orange-700 px-4 py-2.5 font-medium text-white transition hover:bg-orange-600 disabled:opacity-60"
                    >
                      Ya, ada
                    </button>
                    <button
                      type="button"
                      disabled={gateSubmitting}
                      onClick={() => submitGate(false)}
                      className="flex-1 rounded-md border border-line bg-white px-4 py-2.5 font-medium text-ink transition hover:border-orange-400 disabled:opacity-60"
                    >
                      Tidak ada
                    </button>
                  </div>
                  <div className="mt-3">
                    <label className="text-sm font-medium text-ink">
                      Catatan (opsional)
                    </label>
                    <textarea
                      value={gateCatatan}
                      onChange={(e) => setGateCatatan(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                    />
                  </div>
                  {gateError && (
                    <p className="mt-2 rounded-md bg-rust-100 px-3 py-2 text-sm text-rust-700">
                      {gateError}
                    </p>
                  )}
                </>
              ) : gateAnswer === false ? (
                <div className="mt-3 rounded-md bg-moss-100 px-4 py-3">
                  <p className="text-sm font-medium text-moss-700">
                    Jawaban tersimpan: tidak ada Jorong terdampak di Nagari{" "}
                    {selectedNagariItem.nagari}.
                  </p>
                  <p className="mt-1 text-sm text-moss-700/80">
                    Terima kasih. Bapak/Ibu dapat memilih Kecamatan/Nagari lain
                    di atas untuk melanjutkan identifikasi.
                  </p>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-4">
                  <p className="text-sm text-ink/70">
                    Untuk setiap Jorong di bawah, tentukan apakah{" "}
                    <span className="font-medium">seluruh</span> Sub SLS di
                    Jorong tersebut terdampak, atau hanya sebagian.
                  </p>
                  {selectedNagariItem.jorong.map((jorong) => {
                    const state = getJorongState(jorong.idsls);
                    return (
                      <div
                        key={jorong.idsls}
                        className="rounded-md border border-line bg-white p-4"
                      >
                        <p className="font-medium text-orange-900">{jorong.jorong}</p>

                        {state.submitted ? (
                          <p className="mt-2 rounded-md bg-moss-100 px-3 py-2 text-sm text-moss-700">
                            Data Jorong ini tersimpan. Terima kasih.
                          </p>
                        ) : (
                          <>
                            <p className="mt-2 text-sm text-ink">
                              Apakah seluruh Sub SLS Jorong ini terdampak?
                            </p>
                            <div className="mt-2 flex gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  updateJorongState(jorong.idsls, {
                                    seluruh: true,
                                    checkedSubsls: new Set(),
                                    error: null,
                                  })
                                }
                                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                                  state.seluruh === true
                                    ? "border-orange-700 bg-orange-700 text-white"
                                    : "border-line bg-white text-ink hover:border-orange-400"
                                }`}
                              >
                                Ya, seluruhnya
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateJorongState(jorong.idsls, {
                                    seluruh: false,
                                    error: null,
                                  })
                                }
                                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                                  state.seluruh === false
                                    ? "border-orange-700 bg-orange-700 text-white"
                                    : "border-line bg-white text-ink hover:border-orange-400"
                                }`}
                              >
                                Tidak, sebagian
                              </button>
                            </div>

                            {state.seluruh === false && (
                              <div className="mt-3">
                                <p className="text-sm font-medium text-ink">
                                  Centang Sub SLS yang terdampak:
                                </p>
                                <ul className="mt-2 flex flex-col gap-1.5">
                                  {jorong.subsls.map((s) => (
                                    <li key={s.idsubsls}>
                                      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 py-2 transition hover:border-orange-400">
                                        <input
                                          type="checkbox"
                                          checked={state.checkedSubsls.has(s.idsubsls)}
                                          onChange={() => toggleSubsls(jorong.idsls, s.idsubsls)}
                                          className="h-4 w-4 accent-orange-700"
                                        />
                                        <span className="text-sm text-ink">
                                          Sub SLS {s.sub_sls}
                                        </span>
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {state.seluruh !== null && (
                              <div className="mt-3">
                                <p className="text-sm font-medium text-ink">
                                  Indikator dampak (opsional, boleh lebih dari satu)
                                </p>
                                <ul className="mt-2 flex flex-col gap-1.5">
                                  {INDIKATOR_DAMPAK.map((ind) => {
                                    const checked = state.indikator.has(ind.key);
                                    return (
                                      <li key={ind.key}>
                                        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-line bg-white px-3 py-2 transition hover:border-orange-400">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleIndikator(jorong.idsls, ind.key)}
                                            className="mt-0.5 h-4 w-4 shrink-0 accent-orange-700"
                                          />
                                          <span className="text-sm text-ink">{ind.label}</span>
                                        </label>
                                        {checked && (
                                          <div className="ml-6 mt-1.5 flex items-center gap-2">
                                            <label className="text-xs text-ink/60">
                                              Perkiraan jumlah KK terdampak:
                                            </label>
                                            <input
                                              type="number"
                                              min={0}
                                              step={1}
                                              value={state.indikatorKk[ind.key] ?? ""}
                                              onChange={(e) =>
                                                setIndikatorKk(jorong.idsls, ind.key, e.target.value)
                                              }
                                              placeholder="0"
                                              className="w-24 rounded-md border border-line bg-white px-2 py-1 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                                            />
                                            <span className="text-xs text-ink/50">KK</span>
                                          </div>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}

                            {state.seluruh !== null && (
                              <div className="mt-3">
                                <label className="text-sm font-medium text-ink">
                                  Catatan (opsional)
                                </label>
                                <textarea
                                  value={state.catatan}
                                  onChange={(e) =>
                                    updateJorongState(jorong.idsls, { catatan: e.target.value })
                                  }
                                  rows={2}
                                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                                />
                              </div>
                            )}

                            {state.error && (
                              <p className="mt-2 rounded-md bg-rust-100 px-3 py-2 text-sm text-rust-700">
                                {state.error}
                              </p>
                            )}

                            {state.seluruh !== null && (
                              <button
                                type="button"
                                disabled={state.submitting}
                                onClick={() => submitJorong(jorong)}
                                className="mt-3 w-full rounded-md bg-orange-700 px-4 py-2.5 font-medium text-white transition hover:bg-orange-600 disabled:opacity-60"
                              >
                                {state.submitting ? "Mengirim..." : "Simpan data Jorong ini"}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {monLoading ? (
            <p className="text-sm text-ink/60">Memuat monitoring...</p>
          ) : monError ? (
            <p className="rounded-md bg-rust-100 px-3 py-2 text-sm text-rust-700">{monError}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-orange-900">Progress Identifikasi</h2>
                  <p className="text-sm text-ink/60">
                    Rekap pelaksanaan identifikasi Jorong/Sub SLS terdampak bencana
                    hidrometeorologi akhir 2025, mencakup seluruh {totalNagariMon} nagari
                    di Kabupaten Solok.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-orange-900 px-3 py-1.5 text-xs font-medium text-white">
                  Data terakhir diperbarui: {formatTanggal(lastUpdatedMon)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard
                  ikon="📍"
                  warna="bg-blue-100 text-blue-700"
                  label="Jumlah Kecamatan"
                  nilai={totalKecamatanMon}
                />
                <StatCard
                  ikon="🏘️"
                  warna="bg-teal-100 text-teal-700"
                  label="Jumlah Nagari"
                  nilai={totalNagariMon}
                />
                <StatCard
                  ikon="🧩"
                  warna="bg-violet-100 text-violet-700"
                  label="Total Jorong"
                  nilai={totalJorongMon}
                />
                <StatCard
                  ikon="✅"
                  warna="bg-moss-100 text-moss-700"
                  label="Sudah Diisi"
                  nilai={jorongSudahDiisi}
                  sub={`${pctSudahDiisi}%`}
                />
                <StatCard
                  ikon="📋"
                  warna="bg-orange-100 text-orange-700"
                  label="Belum Diisi"
                  nilai={jorongBelumDiisi}
                  sub={
                    totalJorongMon > 0
                      ? `${Math.round((jorongBelumDiisi / totalJorongMon) * 100)}%`
                      : "0%"
                  }
                />
                <StatCard
                  ikon="⚠️"
                  warna="bg-rust-100 text-rust-700"
                  label="Ada Konflik"
                  nilai={jorongKonflikCount}
                />
              </div>

              <section className="rounded-md border border-line bg-white p-4">
                <h3 className="font-medium text-orange-900">Progress Identifikasi Jorong</h3>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-orange-50">
                    <div
                      className="h-full rounded-full bg-moss-500 transition-all"
                      style={{ width: `${pctSudahDiisi}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-lg font-semibold text-moss-700">
                    {pctSudahDiisi}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink/60">
                  {jorongSudahDiisi} dari {totalJorongMon} Jorong sudah memiliki jawaban
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniStat warna="bg-orange-50 text-orange-700" label="Terdampak" nilai={jorongTerdampak} />
                  <MiniStat
                    warna="bg-moss-100 text-moss-700"
                    label="Tidak Terdampak"
                    nilai={jorongTidakTerdampak}
                  />
                  <MiniStat warna="bg-gray-100 text-gray-600" label="Belum Diisi" nilai={jorongBelumDiisi} />
                  <MiniStat warna="bg-rust-100 text-rust-700" label="Konflik" nilai={jorongKonflikCount} />
                </div>
              </section>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section className="rounded-md border border-line bg-white p-4">
                  <h3 className="font-medium text-orange-900">Progress per Kecamatan</h3>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-left text-sm">
                      <thead className="text-xs text-ink/50">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">Kecamatan</th>
                          <th className="px-2 py-1.5 font-medium">Jorong</th>
                          <th className="px-2 py-1.5 font-medium">Diisi</th>
                          <th className="px-2 py-1.5 font-medium">Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kecamatanProgress.map((k) => (
                          <tr key={k.kecamatan} className="border-t border-line">
                            <td className="px-2 py-1.5 text-ink">{k.kecamatan}</td>
                            <td className="px-2 py-1.5 text-ink/70">{k.total}</td>
                            <td className="px-2 py-1.5 text-ink/70">{k.sudah}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-20 overflow-hidden rounded-full bg-orange-50">
                                  <div
                                    className={`h-full rounded-full ${
                                      k.pct === 100 ? "bg-moss-500" : "bg-orange-500"
                                    }`}
                                    style={{ width: `${k.pct}%` }}
                                  />
                                </div>
                                <span className="shrink-0 text-xs font-medium text-ink/70">{k.pct}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="flex flex-col gap-4">
                  <section className="rounded-md border border-line bg-white p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-orange-900">Nagari Belum Diidentifikasi</h3>
                      <span className="text-xs text-ink/50">{nagariBelumList.length} nagari</span>
                    </div>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                      {nagariBelumList.length === 0 && (
                        <li className="text-sm text-ink/50">Semua nagari sudah mulai diisi.</li>
                      )}
                      {nagariBelumList.map((n) => (
                        <li
                          key={n.iddesa}
                          className="flex items-center justify-between rounded-md bg-orange-50/60 px-3 py-1.5 text-sm"
                        >
                          <span className="text-ink">{n.nagari}</span>
                          <span className="text-xs text-ink/50">{n.kecamatan}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="rounded-md border border-line bg-white p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-orange-900">Nagari dengan Konflik Data</h3>
                      <span className="text-xs text-ink/50">{nagariKonflikList.length} nagari</span>
                    </div>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                      {nagariKonflikList.length === 0 && (
                        <li className="text-sm text-ink/50">Belum ada konflik data.</li>
                      )}
                      {nagariKonflikList.map((n) => (
                        <li
                          key={n.iddesa}
                          className="flex items-center justify-between rounded-md bg-rust-100/60 px-3 py-1.5 text-sm"
                        >
                          <span className="text-ink">{n.nagari}</span>
                          <span className="text-xs text-rust-700">{n.kecamatan}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>

              <RekapSubslsSection
                title="Rekap Sub SLS — Daftar Awal (29 Nagari)"
                subtitle={`${subslsDaftarAwal.length} baris Sub SLS pada cakupan awal identifikasi.`}
                rows={subslsDaftarAwal}
                kecamatanOptions={kecamatanOptions}
                fileName="rekap_subsls_daftar_awal"
              />

              <RekapSubslsSection
                title="Rekap Sub SLS — Nagari Tambahan (Perluasan Cakupan)"
                subtitle={`${subslsTambahan.length} baris Sub SLS pada nagari hasil perluasan cakupan ke seluruh Kabupaten Solok.`}
                rows={subslsTambahan}
                kecamatanOptions={kecamatanOptions}
                fileName="rekap_subsls_nagari_tambahan"
              />
            </>
          )}
        </div>
      )}
    </main>
  );
}
