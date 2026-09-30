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

// ---- Tipe data tab "Alokasi Petugas" ------------------------------------

type KertasKerjaRow = {
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  is_terdampak: boolean;
  kk_total: number;
  punya_data_kk: boolean;
  skor_beban_pendataan: number;
  jarak_km: number | null;
  jarak_status: "riil" | "tanpa_data";
  skor_jarak: number;
  skor_beban_akhir: number;
  terkunci: boolean;
  ppl_id: number | null;
  ppl_nama: string | null;
  pml_id: number | null;
  pml_nama: string | null;
  korwil_id: number | null;
  korwil_nama: string | null;
};

type RingkasanPplRow = {
  ppl_id: number;
  ppl_nama: string;
  pml_nama: string | null;
  korwil_nama: string | null;
  jumlah_subsls: number;
  total_skor_beban_akhir: number;
  lokasi_status: "riil" | "tanpa_data" | "perkiraan_nagari";
};

type KebutuhanRow = {
  kecamatan: string;
  total_skor_beban: number;
  jumlah_subsls: number;
  jumlah_subsls_terdampak: number;
  jumlah_subsls_tanpa_data_kk: number;
  kapasitas_per_ppl: number;
  jumlah_ppl_dibutuhkan: number;
  jumlah_pml_dibutuhkan: number;
  jumlah_korwil_dibutuhkan: number;
};

type PetugasRingkas = {
  id: number;
  nama: string;
  peran: "ppl" | "pml" | "korwil" | null;
  status_kepegawaian: "organik" | "mitra";
  sumber_roster: string | null;
  atasan_id: number | null;
  lokasi_status: "riil" | "tanpa_data" | "perkiraan_nagari";
  aktif: boolean;
  alamat_kecamatan: string | null;
};

type CalonSampelRow = {
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  kk_total: number;
  punya_data_kk: boolean;
  skor_beban_pendataan: number;
  termasuk_sampel: boolean;
};

type RingkasanPmlRow = {
  pml_id: number;
  pml_nama: string;
  korwil_nama: string | null;
  jumlah_ppl: number;
  jumlah_subsls: number;
  total_skor_beban_akhir: number;
};

type RingkasanKorwilRow = {
  korwil_id: number;
  korwil_nama: string;
  jumlah_pml: number;
  jumlah_ppl: number;
  jumlah_subsls: number;
  total_skor_beban_akhir: number;
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

// ---- Komponen kecil utk tab "Alokasi Petugas" ---------------------------

function BadgeDataKk({ punya }: { punya: boolean }) {
  return punya ? (
    <span className="rounded-full bg-moss-100 px-2 py-0.5 text-xs font-medium text-moss-700">Lengkap</span>
  ) : (
    <span className="rounded-full bg-rust-100 px-2 py-0.5 text-xs font-medium text-rust-700">Belum Ada Data</span>
  );
}

// Dipakai panel "Keseimbangan Beban per PPL" utk memandu supervisor: beban
// tiap PPL dibandingkan rata-rata tim, bukan cuma ditampilkan mentah --
// sesuai permintaan user ("buat tools agar kertas kerja bisa
// menjaga/memandu agar beban berimbang").
function balanceInfo(skor: number, rata: number): { label: string; cls: string; barCls: string } {
  if (rata <= 0) return { label: "-", cls: "text-ink/50", barCls: "bg-gray-300" };
  const selisih = (skor - rata) / rata;
  if (Math.abs(selisih) <= 0.15) return { label: "Seimbang", cls: "text-moss-700", barCls: "bg-moss-500" };
  if (selisih > 0.15) return { label: "Kelebihan Beban", cls: "text-rust-700", barCls: "bg-rust-500" };
  return { label: "Beban Rendah", cls: "text-orange-600", barCls: "bg-orange-400" };
}

const ALOKASI_PAGE_SIZE = 25;
const SAMPEL_PAGE_SIZE = 25;

function AlokasiPetugasSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [calonSampel, setCalonSampel] = useState<CalonSampelRow[]>([]);
  const [kertasKerja, setKertasKerja] = useState<KertasKerjaRow[]>([]);
  const [ringkasanPpl, setRingkasanPpl] = useState<RingkasanPplRow[]>([]);
  const [ringkasanPml, setRingkasanPml] = useState<RingkasanPmlRow[]>([]);
  const [ringkasanKorwil, setRingkasanKorwil] = useState<RingkasanKorwilRow[]>([]);
  const [kebutuhan, setKebutuhan] = useState<KebutuhanRow[]>([]);
  const [petugasList, setPetugasList] = useState<PetugasRingkas[]>([]);
  const [hariKerjaInput, setHariKerjaInput] = useState(24);
  const [hariKerjaDipakai, setHariKerjaDipakai] = useState(24);

  const [sampelKecFilter, setSampelKecFilter] = useState("");
  const [sampelStatusFilter, setSampelStatusFilter] = useState<"" | "sudah" | "belum">("");
  const [sampelSearch, setSampelSearch] = useState("");
  const [sampelPage, setSampelPage] = useState(1);
  const [sampelBusyId, setSampelBusyId] = useState<string | null>(null);
  const [sampelBulkBusy, setSampelBulkBusy] = useState(false);
  const [sampelError, setSampelError] = useState<string | null>(null);

  const [timBusyId, setTimBusyId] = useState<number | null>(null);
  const [timError, setTimError] = useState<string | null>(null);
  const [korwilBaruId, setKorwilBaruId] = useState<number | "">("");
  const [pmlBaruId, setPmlBaruId] = useState<number | "">("");

  const [kecFilter, setKecFilter] = useState("");
  const [pplFilter, setPplFilter] = useState<number | "">("");
  const [dataFilter, setDataFilter] = useState<"" | "lengkap" | "belum">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [reassignBusyId, setReassignBusyId] = useState<string | null>(null);
  const [reassignError, setReassignError] = useState<string | null>(null);

  async function muatSampel() {
    const res = await fetch("/api/bencana/alokasi/sampel");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Gagal memuat daftar calon wilayah sampel.");
    setCalonSampel(json.data ?? []);
  }

  async function muatData(hariKerja: number) {
    const res = await fetch(`/api/bencana/alokasi?hari_kerja=${hariKerja}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Gagal memuat data alokasi.");
    setKertasKerja(json.kertas_kerja ?? []);
    setRingkasanPpl(json.ringkasan_ppl ?? []);
    setRingkasanPml(json.ringkasan_pml ?? []);
    setRingkasanKorwil(json.ringkasan_korwil ?? []);
    setKebutuhan(json.kebutuhan_petugas ?? []);
    setPetugasList(json.petugas ?? []);
    setHariKerjaDipakai(json.hari_kerja ?? hariKerja);
  }

  async function muatSemua(hariKerja: number) {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([muatSampel(), muatData(hariKerja)]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Gagal memuat data alokasi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    muatSemua(24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTerapkanHariKerja() {
    setLoading(true);
    try {
      await muatData(hariKerjaInput);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Gagal memuat data alokasi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleSampel(idsubsls: string, checked: boolean) {
    setSampelBusyId(idsubsls);
    setSampelError(null);
    try {
      const res = await fetch("/api/bencana/alokasi/sampel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idsubsls, termasuk_sampel: checked }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengubah wilayah sampel.");
      await Promise.all([muatSampel(), muatData(hariKerjaDipakai)]);
    } catch (err) {
      setSampelError(err instanceof Error ? err.message : "Gagal mengubah wilayah sampel.");
    } finally {
      setSampelBusyId(null);
    }
  }

  async function handleCentangSemuaFiltered(checked: boolean, daftar: CalonSampelRow[]) {
    if (daftar.length === 0) return;
    setSampelBulkBusy(true);
    setSampelError(null);
    try {
      const res = await fetch("/api/bencana/alokasi/sampel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idsubsls: daftar.map((r) => r.idsubsls), termasuk_sampel: checked }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengubah wilayah sampel.");
      await Promise.all([muatSampel(), muatData(hariKerjaDipakai)]);
    } catch (err) {
      setSampelError(err instanceof Error ? err.message : "Gagal mengubah wilayah sampel.");
    } finally {
      setSampelBulkBusy(false);
    }
  }

  async function handleReassign(idsubsls: string, pplId: number) {
    setReassignBusyId(idsubsls);
    setReassignError(null);
    try {
      const res = await fetch("/api/bencana/alokasi/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idsubsls, ppl_id: pplId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memplot Sub SLS.");
      await muatData(hariKerjaDipakai);
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : "Gagal memplot Sub SLS.");
    } finally {
      setReassignBusyId(null);
    }
  }

  async function handleBatalkanPlot(idsubsls: string) {
    setReassignBusyId(idsubsls);
    setReassignError(null);
    try {
      const res = await fetch("/api/bencana/alokasi/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idsubsls, buka_kunci: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal membatalkan plot Sub SLS.");
      await muatData(hariKerjaDipakai);
    } catch (err) {
      setReassignError(err instanceof Error ? err.message : "Gagal membatalkan plot Sub SLS.");
    } finally {
      setReassignBusyId(null);
    }
  }

  async function handleSusunanTim(petugasId: number, peran: "ppl" | "pml" | "korwil", atasanId: number | null) {
    setTimBusyId(petugasId);
    setTimError(null);
    try {
      const res = await fetch("/api/bencana/alokasi/susunan-tim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petugas_id: petugasId, peran, atasan_id: atasanId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengubah susunan tim.");
      await muatData(hariKerjaDipakai);
    } catch (err) {
      setTimError(err instanceof Error ? err.message : "Gagal mengubah susunan tim.");
    } finally {
      setTimBusyId(null);
    }
  }

  async function handleLepasPeran(petugasId: number) {
    setTimBusyId(petugasId);
    setTimError(null);
    try {
      const res = await fetch("/api/bencana/alokasi/susunan-tim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petugas_id: petugasId, lepas: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal melepas peran.");
      await muatData(hariKerjaDipakai);
    } catch (err) {
      setTimError(err instanceof Error ? err.message : "Gagal melepas peran.");
    } finally {
      setTimBusyId(null);
    }
  }

  // ---- Turunan: wilayah sampel ----
  const kecamatanOptionsSampel = useMemo(
    () => Array.from(new Set(calonSampel.map((r) => r.kecamatan))).sort(),
    [calonSampel]
  );
  const filteredSampel = useMemo(() => {
    const q = sampelSearch.trim().toLowerCase();
    return calonSampel.filter((r) => {
      if (sampelKecFilter && r.kecamatan !== sampelKecFilter) return false;
      if (sampelStatusFilter === "sudah" && !r.termasuk_sampel) return false;
      if (sampelStatusFilter === "belum" && r.termasuk_sampel) return false;
      if (
        q &&
        !r.nagari.toLowerCase().includes(q) &&
        !r.sls.toLowerCase().includes(q) &&
        !r.sub_sls.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [calonSampel, sampelKecFilter, sampelStatusFilter, sampelSearch]);
  const jumlahSampelTerpilih = useMemo(() => calonSampel.filter((r) => r.termasuk_sampel).length, [calonSampel]);
  const sampelTotalPages = Math.max(1, Math.ceil(filteredSampel.length / SAMPEL_PAGE_SIZE));
  const sampelPageClamped = Math.min(sampelPage, sampelTotalPages);
  const sampelPaged = filteredSampel.slice(
    (sampelPageClamped - 1) * SAMPEL_PAGE_SIZE,
    sampelPageClamped * SAMPEL_PAGE_SIZE
  );

  // ---- Turunan: kertas kerja & susunan tim ----
  const kecamatanOptions = useMemo(
    () => Array.from(new Set(kertasKerja.map((r) => r.kecamatan))).sort(),
    [kertasKerja]
  );
  // PPL: wajib mitra, belum berperan lain (atau sudah PPL, utk dipindah Sub SLS-nya)
  const pplOptions = useMemo(
    () =>
      petugasList
        .filter((p) => p.aktif && p.status_kepegawaian === "mitra" && (!p.peran || p.peran === "ppl"))
        .sort((a, b) => a.nama.localeCompare(b.nama)),
    [petugasList]
  );
  const korwilOptions = useMemo(
    () => petugasList.filter((p) => p.peran === "korwil").sort((a, b) => a.nama.localeCompare(b.nama)),
    [petugasList]
  );
  const pmlOptions = useMemo(
    () => petugasList.filter((p) => p.peran === "pml").sort((a, b) => a.nama.localeCompare(b.nama)),
    [petugasList]
  );
  const calonKorwilBaru = useMemo(
    () =>
      petugasList
        .filter((p) => p.aktif && p.status_kepegawaian === "organik" && !p.peran)
        .sort((a, b) => a.nama.localeCompare(b.nama)),
    [petugasList]
  );
  const calonPmlBaru = useMemo(
    () => petugasList.filter((p) => p.aktif && !p.peran).sort((a, b) => a.nama.localeCompare(b.nama)),
    [petugasList]
  );

  function infoPplUntukBaris(p: PetugasRingkas, row: KertasKerjaRow): string {
    const info = ringkasanPpl.find((x) => x.ppl_id === p.id);
    const beban = info ? info.total_skor_beban_akhir : 0;
    const diKec = kertasKerja.filter((k) => k.ppl_id === p.id && k.kecamatan === row.kecamatan).length;
    const diNagari = kertasKerja.filter((k) => k.ppl_id === p.id && k.nagari === row.nagari).length;
    let ket = `beban ${beban.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
    if (diNagari > 0) ket += `, ${diNagari} Sub SLS di nagari ini`;
    else if (diKec > 0) ket += `, ${diKec} Sub SLS di kecamatan ini`;
    else ket += ", belum ada Sub SLS di sini";
    return `${p.nama} — ${ket}`;
  }

  const jumlahTanpaDataKk = useMemo(() => kertasKerja.filter((r) => !r.punya_data_kk).length, [kertasKerja]);
  const kecamatanTanpaDataPenuh = useMemo(
    () => kebutuhan.filter((k) => k.jumlah_subsls_tanpa_data_kk === k.jumlah_subsls).map((k) => k.kecamatan),
    [kebutuhan]
  );

  const rataBebanPpl = useMemo(() => {
    if (ringkasanPpl.length === 0) return 0;
    const total = ringkasanPpl.reduce((s, r) => s + r.total_skor_beban_akhir, 0);
    return total / ringkasanPpl.length;
  }, [ringkasanPpl]);
  const rataBebanPml = useMemo(() => {
    if (ringkasanPml.length === 0) return 0;
    return ringkasanPml.reduce((s, r) => s + r.total_skor_beban_akhir, 0) / ringkasanPml.length;
  }, [ringkasanPml]);
  const rataBebanKorwil = useMemo(() => {
    if (ringkasanKorwil.length === 0) return 0;
    return ringkasanKorwil.reduce((s, r) => s + r.total_skor_beban_akhir, 0) / ringkasanKorwil.length;
  }, [ringkasanKorwil]);

  const totalKebutuhan = useMemo(
    () =>
      kebutuhan.reduce(
        (acc, k) => ({
          ppl: acc.ppl + k.jumlah_ppl_dibutuhkan,
          pml: acc.pml + k.jumlah_pml_dibutuhkan,
          korwil: acc.korwil + k.jumlah_korwil_dibutuhkan,
        }),
        { ppl: 0, pml: 0, korwil: 0 }
      ),
    [kebutuhan]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kertasKerja.filter((r) => {
      if (kecFilter && r.kecamatan !== kecFilter) return false;
      if (pplFilter && r.ppl_id !== pplFilter) return false;
      if (dataFilter === "lengkap" && !r.punya_data_kk) return false;
      if (dataFilter === "belum" && r.punya_data_kk) return false;
      if (
        q &&
        !r.nagari.toLowerCase().includes(q) &&
        !r.sls.toLowerCase().includes(q) &&
        !r.sub_sls.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [kertasKerja, kecFilter, pplFilter, dataFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ALOKASI_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const paged = filtered.slice((pageClamped - 1) * ALOKASI_PAGE_SIZE, pageClamped * ALOKASI_PAGE_SIZE);

  function handleExport() {
    const dataRows = filtered.map((r) => ({
      Kecamatan: r.kecamatan,
      Nagari: r.nagari,
      "Jorong/SLS": r.sls,
      "Sub SLS": r.sub_sls,
      "Status Data KK": r.punya_data_kk ? "Lengkap" : "Belum Ada Data",
      "KK Total": r.kk_total,
      "Skor Beban Kerja Pendataan (tanpa jarak)": r.skor_beban_pendataan,
      "Skor Jarak": r.skor_jarak,
      "Skor Beban Akhir": r.skor_beban_akhir,
      PPL: r.ppl_nama ?? "",
      PML: r.pml_nama ?? "",
      Korwil: r.korwil_nama ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(dataRows);
    ws["!cols"] = [
      { wch: 16 },
      { wch: 22 },
      { wch: 22 },
      { wch: 10 },
      { wch: 16 },
      { wch: 10 },
      { wch: 18 },
      { wch: 12 },
      { wch: 14 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kertas Kerja Alokasi");
    XLSX.writeFile(wb, "kertas_kerja_alokasi_petugas.xlsx");
  }

  if (loading) {
    return <p className="mt-6 text-sm text-ink/60">Memuat data alokasi...</p>;
  }
  if (loadError) {
    return <p className="mt-6 rounded-md bg-rust-100 px-4 py-3 text-sm text-rust-700">{loadError}</p>;
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {jumlahTanpaDataKk > 0 && (
        <div className="rounded-md border border-rust-100 bg-rust-100/40 px-4 py-3 text-sm text-rust-700">
          <p className="font-medium">⚠ Data KK belum lengkap</p>
          <p className="mt-1 text-xs">
            {jumlahTanpaDataKk} dari {kertasKerja.length} Sub SLS wilayah sampel belum ada data jumlah KK
            {kecamatanTanpaDataPenuh.length > 0 && (
              <> , termasuk seluruh Sub SLS sampel di kecamatan {kecamatanTanpaDataPenuh.join(", ")}</>
            )}
            . Skor beban &amp; kebutuhan petugas di baris/kecamatan ini BUKAN berarti kebutuhannya nol — hanya
            berarti datanya belum masuk. Mohon dilengkapi sebelum menjadikan angka ini sebagai acuan final.
          </p>
        </div>
      )}

      {/* ===== LANGKAH 1: WILAYAH SAMPEL ===== */}
      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium text-orange-900">Langkah 1 — Pilih Wilayah Sampel</h2>
            <p className="mt-1 text-xs text-ink/60">
              Centang Sub SLS terdampak mana yang benar-benar akan dijadikan wilayah sampel pendataan. Sub SLS yang
              tidak dicentang di sini tidak akan muncul di kertas kerja plotting Langkah 4 dan tidak ikut dihitung di
              kebutuhan petugas Langkah 2.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-moss-100 px-3 py-1 text-xs font-medium text-moss-700">
            {jumlahSampelTerpilih} dari {calonSampel.length} Sub SLS terdampak terpilih
          </span>
        </div>

        {sampelError && <p className="mt-2 rounded-md bg-rust-100 px-3 py-2 text-xs text-rust-700">{sampelError}</p>}

        <div className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-line bg-orange-50/40 p-3 sm:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-ink/60">Filter Kecamatan</label>
            <select
              value={sampelKecFilter}
              onChange={(e) => {
                setSampelKecFilter(e.target.value);
                setSampelPage(1);
              }}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            >
              <option value="">Semua kecamatan</option>
              {kecamatanOptionsSampel.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink/60">Status Sampel</label>
            <select
              value={sampelStatusFilter}
              onChange={(e) => {
                setSampelStatusFilter(e.target.value as "" | "sudah" | "belum");
                setSampelPage(1);
              }}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            >
              <option value="">Semua</option>
              <option value="sudah">Sudah dicentang</option>
              <option value="belum">Belum dicentang</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink/60">Cari Nagari/Jorong/Sub SLS</label>
            <input
              value={sampelSearch}
              onChange={(e) => {
                setSampelSearch(e.target.value);
                setSampelPage(1);
              }}
              placeholder="Ketik kata kunci..."
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              disabled={sampelBulkBusy || filteredSampel.length === 0}
              onClick={() => handleCentangSemuaFiltered(true, filteredSampel)}
              className="flex-1 rounded-md bg-orange-500 px-2 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-50"
            >
              ✓ Centang Semua
            </button>
            <button
              type="button"
              disabled={sampelBulkBusy || filteredSampel.length === 0}
              onClick={() => handleCentangSemuaFiltered(false, filteredSampel)}
              className="flex-1 rounded-md border border-line bg-white px-2 py-2 text-xs font-medium text-ink/70 transition hover:bg-gray-50 disabled:opacity-50"
            >
              Lepas Semua
            </button>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-ink/50">
          Tombol &quot;Centang Semua&quot;/&quot;Lepas Semua&quot; berlaku utk {filteredSampel.length} baris yang
          sedang tampil sesuai filter di atas (bukan seluruh {calonSampel.length} calon).
        </p>

        <div className="mt-3 overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-orange-50 text-orange-600">
              <tr>
                <th className="w-10 px-3 py-2 font-medium"></th>
                <th className="px-3 py-2 font-medium">Kecamatan</th>
                <th className="px-3 py-2 font-medium">Nagari</th>
                <th className="px-3 py-2 font-medium">Jorong/SLS</th>
                <th className="px-3 py-2 font-medium">Sub SLS</th>
                <th className="px-3 py-2 font-medium">Data KK</th>
                <th className="px-3 py-2 font-medium">Skor Beban Pendataan</th>
              </tr>
            </thead>
            <tbody>
              {sampelPaged.map((r) => (
                <tr key={r.idsubsls} className={`border-t border-line ${r.termasuk_sampel ? "bg-moss-50/40" : ""}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={r.termasuk_sampel}
                      disabled={sampelBusyId === r.idsubsls}
                      onChange={(e) => handleToggleSampel(r.idsubsls, e.target.checked)}
                      className="h-4 w-4 accent-orange-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-ink/80">{r.kecamatan}</td>
                  <td className="px-3 py-2 text-ink/80">{r.nagari}</td>
                  <td className="px-3 py-2 font-medium text-ink">{r.sls}</td>
                  <td className="px-3 py-2 text-ink/80">{r.sub_sls}</td>
                  <td className="px-3 py-2">
                    <BadgeDataKk punya={r.punya_data_kk} />
                  </td>
                  <td className="px-3 py-2 text-ink/80">{r.skor_beban_pendataan.toLocaleString("id-ID")}</td>
                </tr>
              ))}
              {sampelPaged.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-ink/50">
                    Tidak ada data yang cocok dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredSampel.length > 0 && (
          <div className="mt-2 flex items-center justify-between text-sm text-ink/60">
            <span>
              {(sampelPageClamped - 1) * SAMPEL_PAGE_SIZE + 1}-
              {Math.min(sampelPageClamped * SAMPEL_PAGE_SIZE, filteredSampel.length)} dari {filteredSampel.length}{" "}
              baris
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={sampelPageClamped <= 1}
                onClick={() => setSampelPage((p) => p - 1)}
                className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40"
              >
                &lsaquo;
              </button>
              <button
                type="button"
                disabled={sampelPageClamped >= sampelTotalPages}
                onClick={() => setSampelPage((p) => p + 1)}
                className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40"
              >
                &rsaquo;
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ===== LANGKAH 2: KEBUTUHAN PETUGAS ===== */}
      <section className="rounded-md border border-line bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-medium text-orange-900">Langkah 2 — Kebutuhan Petugas per Kecamatan</h2>
            <p className="mt-1 text-xs text-ink/60">
              Dihitung HANYA dari Sub SLS yang sudah dicentang sbg wilayah sampel di Langkah 1. 1 kuesioner BENCANA-K
              (KK terdampak) berbobot 1, 1 listing KK tidak terdampak berbobot 0,12428, jarak rumah petugas berbobot
              1 per 5 KM. Kapasitas dihitung dari ±15 menit/kuesioner, ±5 jam kerja/hari.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="text-xs font-medium text-ink/60">Hari Kerja / Bulan (maks. 24)</label>
              <input
                type="number"
                min={1}
                max={24}
                value={hariKerjaInput}
                onChange={(e) => setHariKerjaInput(Math.min(24, Math.max(1, Number(e.target.value) || 1)))}
                className="mt-1 w-28 rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
              />
            </div>
            <button
              type="button"
              onClick={handleTerapkanHariKerja}
              className="rounded-md border border-orange-700 bg-white px-3 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
            >
              Hitung Ulang
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat warna="bg-orange-50 text-orange-700" label="Total PPL Dibutuhkan (estimasi)" nilai={totalKebutuhan.ppl} />
          <MiniStat warna="bg-orange-50 text-orange-700" label="Total PML Dibutuhkan (estimasi)" nilai={totalKebutuhan.pml} />
          <MiniStat warna="bg-orange-50 text-orange-700" label="Total Korwil Dibutuhkan (estimasi)" nilai={totalKebutuhan.korwil} />
          <MiniStat warna="bg-moss-50 text-moss-700" label="PPL Sudah Diplot" nilai={ringkasanPpl.length} />
        </div>
        <p className="mt-1.5 text-[11px] text-ink/50">
          Angka PML/Korwil per kecamatan di atas adalah estimasi per wilayah; susunan tim sebenarnya di Langkah 3 bisa
          lebih sedikit karena 1 PML/Korwil boleh membawahi wilayah lintas-kecamatan yang berdekatan.
        </p>

        <div className="mt-3 overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-orange-50 text-orange-600">
              <tr>
                <th className="px-3 py-2 font-medium">Kecamatan</th>
                <th className="px-3 py-2 font-medium">Skor Beban Total</th>
                <th className="px-3 py-2 font-medium">Jml Sub SLS Sampel</th>
                <th className="px-3 py-2 font-medium">Belum Ada Data KK</th>
                <th className="px-3 py-2 font-medium">PPL</th>
                <th className="px-3 py-2 font-medium">PML</th>
                <th className="px-3 py-2 font-medium">Korwil</th>
              </tr>
            </thead>
            <tbody>
              {kebutuhan.map((k) => (
                <tr key={k.kecamatan} className="border-t border-line">
                  <td className="px-3 py-2 font-medium text-ink">{k.kecamatan}</td>
                  <td className="px-3 py-2 text-ink/80">{k.total_skor_beban.toLocaleString("id-ID")}</td>
                  <td className="px-3 py-2 text-ink/80">{k.jumlah_subsls}</td>
                  <td className="px-3 py-2">
                    {k.jumlah_subsls_tanpa_data_kk > 0 ? (
                      <span className="rounded-full bg-rust-100 px-2 py-0.5 text-xs font-medium text-rust-700">
                        {k.jumlah_subsls_tanpa_data_kk}
                        {k.jumlah_subsls_tanpa_data_kk === k.jumlah_subsls ? " (seluruhnya)" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-ink/40">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink/80">{k.jumlah_ppl_dibutuhkan}</td>
                  <td className="px-3 py-2 text-ink/80">{k.jumlah_pml_dibutuhkan}</td>
                  <td className="px-3 py-2 text-ink/80">{k.jumlah_korwil_dibutuhkan}</td>
                </tr>
              ))}
              {kebutuhan.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-ink/50">
                    Belum ada wilayah sampel yang dicentang di Langkah 1.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== LANGKAH 3: SUSUNAN TIM (MANUAL, TANPA PENGELOMPOKAN OTOMATIS) ===== */}
      <section className="rounded-md border border-line bg-white p-4">
        <h2 className="font-medium text-orange-900">Langkah 3 — Susunan Tim (Korwil, PML, PPL)</h2>
        <p className="mt-1 text-xs text-ink/60">
          Semua jenjang ditetapkan manual satu per satu, tidak ada pengelompokan otomatis. Korwil wajib pegawai
          organik. PML boleh organik atau mitra. PPL wajib mitra (diplot lewat kertas kerja Langkah 4).
        </p>

        {timError && <p className="mt-2 rounded-md bg-rust-100 px-3 py-2 text-xs text-rust-700">{timError}</p>}

        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Korwil */}
          <div className="rounded-md border border-line p-3">
            <h3 className="text-sm font-semibold text-ink">Korwil ({korwilOptions.length})</h3>
            <div className="mt-2 flex gap-1.5">
              <select
                value={korwilBaruId}
                onChange={(e) => setKorwilBaruId(e.target.value ? Number(e.target.value) : "")}
                className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1.5 text-xs outline-none focus:border-orange-400"
              >
                <option value="">+ Pilih calon Korwil (organik)...</option>
                {calonKorwilBaru.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!korwilBaruId || timBusyId === korwilBaruId}
                onClick={() => {
                  if (korwilBaruId) handleSusunanTim(korwilBaruId, "korwil", null);
                  setKorwilBaruId("");
                }}
                className="shrink-0 rounded-md bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Tambah
              </button>
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {korwilOptions.map((k) => {
                const r = ringkasanKorwil.find((x) => x.korwil_id === k.id);
                return (
                  <li key={k.id} className="flex items-center justify-between rounded-md bg-gray-50 px-2 py-1.5 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{k.nama}</p>
                      <p className="text-[10px] text-ink/50">
                        {r
                          ? `${r.jumlah_pml} PML · ${r.jumlah_ppl} PPL · beban ${r.total_skor_beban_akhir.toLocaleString("id-ID")}`
                          : "belum ada tim"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={timBusyId === k.id}
                      onClick={() => handleLepasPeran(k.id)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-rust-600 hover:bg-rust-100"
                    >
                      lepas
                    </button>
                  </li>
                );
              })}
              {korwilOptions.length === 0 && <li className="text-xs text-ink/40">Belum ada Korwil ditetapkan.</li>}
            </ul>
          </div>

          {/* PML */}
          <div className="rounded-md border border-line p-3">
            <h3 className="text-sm font-semibold text-ink">PML ({pmlOptions.length})</h3>
            <div className="mt-2 flex gap-1.5">
              <select
                value={pmlBaruId}
                onChange={(e) => setPmlBaruId(e.target.value ? Number(e.target.value) : "")}
                className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1.5 text-xs outline-none focus:border-orange-400"
              >
                <option value="">+ Pilih calon PML (organik/mitra)...</option>
                {calonPmlBaru.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama} ({p.status_kepegawaian})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pmlBaruId || timBusyId === pmlBaruId}
                onClick={() => {
                  if (pmlBaruId) handleSusunanTim(pmlBaruId, "pml", null);
                  setPmlBaruId("");
                }}
                className="shrink-0 rounded-md bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Tambah
              </button>
            </div>
            <ul className="mt-2 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
              {pmlOptions.map((p) => {
                const r = ringkasanPml.find((x) => x.pml_id === p.id);
                return (
                  <li key={p.id} className="rounded-md bg-gray-50 px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <p className="truncate font-medium text-ink">{p.nama}</p>
                      <button
                        type="button"
                        disabled={timBusyId === p.id}
                        onClick={() => handleLepasPeran(p.id)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-rust-600 hover:bg-rust-100"
                      >
                        lepas
                      </button>
                    </div>
                    <p className="text-[10px] text-ink/50">
                      {r
                        ? `${r.jumlah_ppl} PPL · beban ${r.total_skor_beban_akhir.toLocaleString("id-ID")}`
                        : "belum ada PPL"}
                    </p>
                    <select
                      value={p.atasan_id ?? ""}
                      disabled={timBusyId === p.id}
                      onChange={(e) => handleSusunanTim(p.id, "pml", e.target.value ? Number(e.target.value) : null)}
                      className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1 text-[11px] outline-none focus:border-orange-400"
                    >
                      <option value="">Korwil: belum dipilih...</option>
                      {korwilOptions.map((k) => (
                        <option key={k.id} value={k.id}>
                          Korwil: {k.nama}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
              {pmlOptions.length === 0 && <li className="text-xs text-ink/40">Belum ada PML ditetapkan.</li>}
            </ul>
          </div>

          {/* PPL */}
          <div className="rounded-md border border-line p-3">
            <h3 className="text-sm font-semibold text-ink">PPL Sudah Diplot ({ringkasanPpl.length})</h3>
            <p className="mt-1 text-[11px] text-ink/50">
              Daftar ini terisi otomatis begitu PPL diplot ke Sub SLS di Langkah 4. Pilih PML atasan tiap PPL di sini.
            </p>
            <ul className="mt-2 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
              {[...ringkasanPpl]
                .sort((a, b) => a.ppl_nama.localeCompare(b.ppl_nama))
                .map((r) => {
                  const p = petugasList.find((x) => x.id === r.ppl_id);
                  return (
                    <li key={r.ppl_id} className="rounded-md bg-gray-50 px-2 py-1.5 text-xs">
                      <p className="truncate font-medium text-ink">{r.ppl_nama}</p>
                      <p className="text-[10px] text-ink/50">
                        {r.jumlah_subsls} Sub SLS · beban {r.total_skor_beban_akhir.toLocaleString("id-ID")}
                      </p>
                      <select
                        value={p?.atasan_id ?? ""}
                        disabled={timBusyId === r.ppl_id}
                        onChange={(e) =>
                          handleSusunanTim(r.ppl_id, "ppl", e.target.value ? Number(e.target.value) : null)
                        }
                        className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1 text-[11px] outline-none focus:border-orange-400"
                      >
                        <option value="">PML: belum dipilih...</option>
                        {pmlOptions.map((m) => (
                          <option key={m.id} value={m.id}>
                            PML: {m.nama}
                          </option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              {ringkasanPpl.length === 0 && (
                <li className="text-xs text-ink/40">Belum ada PPL yang diplot ke Sub SLS.</li>
              )}
            </ul>
          </div>
        </div>
      </section>

      {/* ===== VISUALISASI KESEIMBANGAN BEBAN ===== */}
      {(ringkasanPpl.length > 0 || ringkasanPml.length > 0 || ringkasanKorwil.length > 0) && (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="font-medium text-orange-900">Keseimbangan Beban Tim</h2>
          <p className="mt-1 text-xs text-ink/60">
            Diperbarui otomatis setiap kali ada plot Sub SLS atau perubahan susunan tim. Hijau = beban mendekati
            rata-rata (selisih ≤15%). Oranye = beban rendah. Merah = kelebihan beban.
          </p>

          {ringkasanPpl.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">Per PPL</h3>
                <span className="text-xs text-ink/60">
                  Rata-rata: {rataBebanPpl.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                </span>
              </div>
              <div className="mt-1.5 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                {[...ringkasanPpl]
                  .sort((a, b) => b.total_skor_beban_akhir - a.total_skor_beban_akhir)
                  .map((r) => {
                    const info = balanceInfo(r.total_skor_beban_akhir, rataBebanPpl);
                    const maxSkor = Math.max(...ringkasanPpl.map((x) => x.total_skor_beban_akhir), 1);
                    const pct = Math.min(100, Math.round((r.total_skor_beban_akhir / maxSkor) * 100));
                    return (
                      <div key={r.ppl_id} className="flex items-center gap-2 text-sm">
                        <span className="w-40 shrink-0 truncate text-ink/80" title={r.ppl_nama}>
                          {r.ppl_nama}
                        </span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full rounded-full ${info.barCls}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs text-ink/70">
                          {r.total_skor_beban_akhir.toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                        </span>
                        <span className={`w-28 shrink-0 text-right text-xs font-medium ${info.cls}`}>{info.label}</span>
                        {r.lokasi_status !== "riil" && (
                          <span
                            className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500"
                            title="Petugas ini belum menetapkan lokasi rumah, skor jarak = 0"
                          >
                            tanpa lokasi
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {ringkasanPml.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">Per PML</h3>
                <span className="text-xs text-ink/60">
                  Rata-rata: {rataBebanPml.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                </span>
              </div>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {[...ringkasanPml]
                  .sort((a, b) => b.total_skor_beban_akhir - a.total_skor_beban_akhir)
                  .map((r) => {
                    const info = balanceInfo(r.total_skor_beban_akhir, rataBebanPml);
                    const maxSkor = Math.max(...ringkasanPml.map((x) => x.total_skor_beban_akhir), 1);
                    const pct = Math.min(100, Math.round((r.total_skor_beban_akhir / maxSkor) * 100));
                    return (
                      <div key={r.pml_id} className="flex items-center gap-2 text-sm">
                        <span className="w-40 shrink-0 truncate text-ink/80" title={r.pml_nama}>
                          {r.pml_nama}
                        </span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full rounded-full ${info.barCls}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs text-ink/70">
                          {r.total_skor_beban_akhir.toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                        </span>
                        <span className={`w-28 shrink-0 text-right text-xs font-medium ${info.cls}`}>{info.label}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {ringkasanKorwil.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">Per Korwil</h3>
                <span className="text-xs text-ink/60">
                  Rata-rata: {rataBebanKorwil.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                </span>
              </div>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {[...ringkasanKorwil]
                  .sort((a, b) => b.total_skor_beban_akhir - a.total_skor_beban_akhir)
                  .map((r) => {
                    const info = balanceInfo(r.total_skor_beban_akhir, rataBebanKorwil);
                    const maxSkor = Math.max(...ringkasanKorwil.map((x) => x.total_skor_beban_akhir), 1);
                    const pct = Math.min(100, Math.round((r.total_skor_beban_akhir / maxSkor) * 100));
                    return (
                      <div key={r.korwil_id} className="flex items-center gap-2 text-sm">
                        <span className="w-40 shrink-0 truncate text-ink/80" title={r.korwil_nama}>
                          {r.korwil_nama}
                        </span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full rounded-full ${info.barCls}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs text-ink/70">
                          {r.total_skor_beban_akhir.toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                        </span>
                        <span className={`w-28 shrink-0 text-right text-xs font-medium ${info.cls}`}>{info.label}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ===== LANGKAH 4: KERTAS KERJA PLOTTING SUB SLS -> PPL ===== */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium text-orange-900">Langkah 4 — Kertas Kerja Plotting Sub SLS ke PPL</h2>
            <p className="text-xs text-ink/60">
              {filtered.length} dari {kertasKerja.length} baris wilayah sampel. Pilih PPL satu per satu lewat dropdown
              &quot;Aksi&quot; — opsi dropdown menampilkan beban kerja PPL saat ini &amp; berapa Sub SLS yang sudah
              dia pegang di kecamatan/nagari yang sama, sbg panduan kedekatan wilayah.
            </p>
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

        {reassignError && (
          <p className="mt-2 rounded-md bg-rust-100 px-3 py-2 text-xs text-rust-700">{reassignError}</p>
        )}
        {kertasKerja.length === 0 && (
          <p className="mt-2 rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-700">
            Belum ada baris. Centang dulu wilayah sampel di Langkah 1.
          </p>
        )}

        <div className="mt-2 grid grid-cols-1 gap-3 rounded-md border border-line bg-white p-3 sm:grid-cols-4">
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
            <label className="text-xs font-medium text-ink/60">Filter PPL</label>
            <select
              value={pplFilter}
              onChange={(e) => {
                setPplFilter(e.target.value ? Number(e.target.value) : "");
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            >
              <option value="">Semua PPL</option>
              {pplOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink/60">Status Data KK</label>
            <select
              value={dataFilter}
              onChange={(e) => {
                setDataFilter(e.target.value as "" | "lengkap" | "belum");
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            >
              <option value="">Semua</option>
              <option value="lengkap">Data Lengkap</option>
              <option value="belum">Belum Ada Data</option>
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
          <table className="w-full min-w-[1300px] text-left text-sm">
            <thead className="bg-orange-50 text-orange-600">
              <tr>
                <th className="px-3 py-2 font-medium">Kecamatan</th>
                <th className="px-3 py-2 font-medium">Nagari</th>
                <th className="px-3 py-2 font-medium">Jorong/SLS</th>
                <th className="px-3 py-2 font-medium">Sub SLS</th>
                <th className="px-3 py-2 font-medium">Data KK</th>
                <th className="px-3 py-2 font-medium">Skor Beban Pendataan</th>
                <th className="px-3 py-2 font-medium">Skor Jarak</th>
                <th className="px-3 py-2 font-medium">Skor Beban Akhir</th>
                <th className="px-3 py-2 font-medium">PPL</th>
                <th className="px-3 py-2 font-medium">PML</th>
                <th className="px-3 py-2 font-medium">Korwil</th>
                <th className="px-3 py-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => (
                <tr key={r.idsubsls} className="border-t border-line">
                  <td className="px-3 py-2 text-ink/80">{r.kecamatan}</td>
                  <td className="px-3 py-2 text-ink/80">{r.nagari}</td>
                  <td className="px-3 py-2 font-medium text-ink">{r.sls}</td>
                  <td className="px-3 py-2 text-ink/80">{r.sub_sls}</td>
                  <td className="px-3 py-2">
                    <BadgeDataKk punya={r.punya_data_kk} />
                  </td>
                  <td className="px-3 py-2 text-ink/80">{r.skor_beban_pendataan.toLocaleString("id-ID")}</td>
                  <td className="px-3 py-2 text-ink/80">
                    {r.jarak_status === "riil" ? (
                      `${r.skor_jarak.toLocaleString("id-ID")} (${r.jarak_km?.toLocaleString("id-ID")} km)`
                    ) : (
                      <span className="text-xs text-ink/40">belum ada lokasi</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-ink">{r.skor_beban_akhir.toLocaleString("id-ID")}</td>
                  <td className="px-3 py-2 text-ink/80">{r.ppl_nama ?? <span className="text-xs text-ink/40">-</span>}</td>
                  <td className="px-3 py-2 text-ink/80">{r.pml_nama ?? <span className="text-xs text-ink/40">-</span>}</td>
                  <td className="px-3 py-2 text-ink/80">
                    {r.korwil_nama ?? <span className="text-xs text-ink/40">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <select
                        disabled={reassignBusyId === r.idsubsls || pplOptions.length === 0}
                        value={r.ppl_id ?? ""}
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          if (val) handleReassign(r.idsubsls, val);
                        }}
                        className="w-52 rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-orange-400"
                      >
                        <option value="">Plot ke PPL...</option>
                        {pplOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {infoPplUntukBaris(p, r)}
                          </option>
                        ))}
                      </select>
                      {r.ppl_id && (
                        <button
                          type="button"
                          disabled={reassignBusyId === r.idsubsls}
                          onClick={() => handleBatalkanPlot(r.idsubsls)}
                          title="Batalkan plot Sub SLS ini"
                          className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-ink/60 hover:bg-gray-200"
                        >
                          ✕ batal
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-4 text-center text-ink/50">
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
              {(pageClamped - 1) * ALOKASI_PAGE_SIZE + 1}-
              {Math.min(pageClamped * ALOKASI_PAGE_SIZE, filtered.length)} dari {filtered.length} baris
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
    </div>
  );
}

export default function BencanaPage() {
  const [tab, setTab] = useState<"identifikasi" | "monitoring" | "alokasi">("identifikasi");

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
        tab === "alokasi" ? "max-w-[1800px]" : tab === "monitoring" ? "max-w-6xl" : "max-w-2xl"
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
        <button
          type="button"
          onClick={() => setTab("alokasi")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "alokasi"
              ? "bg-white text-orange-900 shadow-sm"
              : "text-orange-400 hover:text-orange-600"
          }`}
        >
          Alokasi Petugas
        </button>
      </div>

      {tab === "alokasi" ? (
        <AlokasiPetugasSection />
      ) : tab === "identifikasi" ? (
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
