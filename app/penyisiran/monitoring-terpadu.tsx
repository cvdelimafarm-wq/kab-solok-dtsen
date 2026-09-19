"use client";

// app/penyisiran/monitoring-terpadu.tsx
//
// Tab "Monitoring" -- gabungan 7 area monitoring lintas tab yang tadinya
// tersebar/belum ada, dirangkum dalam SATU tab (atas permintaan user
// setelah dianalisis "apa saja kira2 yang bisa dibuat monitoringnya"):
//   1. Kualitas & kewajaran data kunjungan Penyisiran Usaha (kelengkapan
//      bukti DUTP/DTSEN/PNM + catatan pada kartu "Ditemukan", dan deteksi
//      update beruntun sangat cepat/"bulk edit" yg patut dicek manual).
//   2. Konsistensi jawaban lintas sumber Identifikasi (PPL vs Jorong vs
//      Tetangga) -- ketiganya menulis ke kolom yg SAMA di penyisiran_usaha
//      (lihat komentar di page.tsx), jadi riwayatnya (penyisiran_riwayat)
//      dipakai utk membandingkan jawaban TERAKHIR tiap sumber per keluarga.
//   3. Realisasi vs rencana Perencanaan Lapangan (Sub SLS yg direncanakan
//      vs yg benar2 dikunjungi, + kuota OH Translok 280 hari).
//   4. Kelengkapan SPJ (Surat Tugas yg belum ada Visum-nya).
//   5. Beban kerja & kelengkapan data Master Petugas (jumlah bawahan per
//      pengawas, akun aktif dgn data kontak belum lengkap).
//   6. Progres vs tenggat waktu Identifikasi (proyeksi selesai berdasar
//      rata2 pengisian 7 hari terakhir, dibandingkan tenggat Minggu, 20
//      September 2026 pukul 12:00 WIB -- lihat PESAN_PENUTUPAN di
//      identifikasi-ppl.tsx).
//   7. Konflik alokasi wilayah PPL (1 ID Sub SLS dialokasikan ke >1 PPL --
//      "bukan bug, memang begitu datanya", lihat komentar di
//      monitoring-ppl.tsx, tapi tetap perlu terlihat supaya bisa ditindak
//      kalau memang perlu diluruskan).
//
// Sumber data: SATU RPC gabungan penyisiran_monitoring_terpadu() (lihat
// supabase/migrations/20260919_penyisiran_monitoring_terpadu.sql) supaya
// tab ini cukup 1x fetch, bukan 7x. Ini VIEW AGREGAT internal staf -- PIN
// & sesi SAMA dgn tab "Penyisiran Usaha"/"Monitoring Identifikasi PPL"
// (role "penyisiran", key sessionStorage "penyisiran-token").
//
// Semua tabel di sini pakai komponen bersama ExcelTh/useExcelTable (lihat
// app/penyisiran/_shared/excel-table.tsx) spy header-nya bisa
// difilter+diurutkan, konsisten dgn tabel di tab2 lain.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useExcelTable, ExcelTh } from "./_shared/excel-table";

const TOKEN_KEY = "penyisiran-token";

// ---------- Bentuk data dari RPC ----------

interface KualitasKunjungan {
  total_ditemukan: number;
  tanpa_bukti: number;
  tanpa_catatan: number;
  per_kecamatan: { kec_nama: string; total_ditemukan: number; tanpa_bukti: number }[];
}

interface BurstUpdateRow {
  oleh_nama: string;
  bucket: string;
  jumlah: number;
  mulai: string;
  selesai: string;
}

interface KonsistensiKonflikRow {
  kode_identitas: string;
  nama_kk: string | null;
  sls_nama: string | null;
  subsls_kode: string | null;
  nilai_per_sumber: Record<string, string | null>;
}

interface KonsistensiIdentifikasi {
  total_multi_sumber: number;
  total_konflik: number;
  daftar_konflik: KonsistensiKonflikRow[];
}

interface RealisasiPetugasRow {
  id: number;
  nama: string;
  jumlah_rencana: number;
  jumlah_realisasi: number;
  jumlah_kunjungan: number;
  jumlah_hari: number;
}

interface RealisasiVsRencana {
  kuota_oh: number;
  oh_terpakai: number;
  per_petugas: RealisasiPetugasRow[];
}

interface SpjTanpaVisumRow {
  nomor_st: string;
  nama: string;
  petugas_jenis: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
}

interface KelengkapanSpj {
  total_pasangan: number;
  tanpa_visum: number;
  daftar_tanpa_visum: SpjTanpaVisumRow[];
}

interface SpanPengawasRow {
  nama_pengawas: string;
  jumlah_bawahan: number;
}

interface DataTidakLengkapRow {
  nama: string;
  tanpa_hp: boolean;
  tanpa_nip: boolean;
  tanpa_email: boolean;
}

interface BebanKerjaPetugas {
  span_pengawas: SpanPengawasRow[];
  data_tidak_lengkap: DataTidakLengkapRow[];
}

interface TrenHarianRow {
  tanggal: string;
  jumlah: number;
}

interface ProgresTenggat {
  deadline: string;
  total_keluarga: number;
  jumlah_selesai: number;
  sisa: number;
  rata_rata_per_hari_7hr: number;
  tren_harian: TrenHarianRow[];
}

interface KonflikPplItem {
  ppl_id: number;
  nama: string;
  status_pencocokan: string | null;
}

interface KonflikAlokasiRow {
  idsubsls: string;
  jumlah_ppl: number;
  ppl_list: KonflikPplItem[];
}

interface KonflikAlokasiPpl {
  total_konflik: number;
  daftar: KonflikAlokasiRow[];
}

interface MonitoringTerpaduData {
  kualitas_kunjungan: KualitasKunjungan;
  burst_update: BurstUpdateRow[];
  konsistensi_identifikasi: KonsistensiIdentifikasi;
  realisasi_vs_rencana: RealisasiVsRencana;
  kelengkapan_spj: KelengkapanSpj;
  beban_kerja_petugas: BebanKerjaPetugas;
  progres_tenggat: ProgresTenggat;
  konflik_alokasi_ppl: KonflikAlokasiPpl;
}

// ---------- Util ----------

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = sessionStorage.getItem(TOKEN_KEY);
  if (!t) return null;
  const exp = Number(t.split(".")[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return t;
}

async function apiFetch(path: string, token: string) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
  return data;
}

function persen(bagian: number, total: number): number {
  return total > 0 ? Math.round((bagian / total) * 100) : 0;
}

function formatTanggalJam(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function formatTanggal(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "-";
  }
}

const LABEL_SUMBER: Record<string, string> = {
  identifikasi_ppl: "PPL",
  identifikasi_jorong: "Jorong",
  identifikasi_tetangga: "Tetangga/Lainnya",
};

const LABEL_NILAI: Record<string, string> = {
  ada: "Ada",
  tidak_ada: "Tidak Ada",
  ragu: "Ragu-ragu",
  belum: "Belum",
};

// ---------- Root ----------

export default function MonitoringTerpaduTab() {
  const [token, setToken] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    setToken(getToken());
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setPinError(null);
    setPinLoading(true);
    try {
      const res = await fetch("/api/penyisiran/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput, role: "penyisiran" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPinError(data?.error || "PIN salah.");
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
    } catch {
      setPinError("Gagal terhubung. Periksa koneksi internet.");
    } finally {
      setPinLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
        <p className="text-sm font-semibold text-navy-900">Monitoring</p>
        <p className="mt-1 text-xs text-ink/60">
          Rekap gabungan 7 area monitoring lintas tab -- masukkan PIN akses (sama dengan PIN Penyisiran Usaha).
        </p>
        <form onSubmit={handleUnlock} className="mt-3 flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
            autoFocus
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <button
            type="submit"
            disabled={pinLoading}
            className="shrink-0 rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
          >
            {pinLoading ? "..." : "Buka"}
          </button>
        </form>
        {pinError && <p className="mt-2 text-xs text-rust-700">{pinError}</p>}
      </div>
    );
  }

  return <MonitoringTerpaduPanel token={token} onSessionExpired={() => setToken(null)} />;
}

function MonitoringTerpaduPanel({ token, onSessionExpired }: { token: string; onSessionExpired: () => void }) {
  const [data, setData] = useState<MonitoringTerpaduData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrMsg(null);
    try {
      const d = await apiFetch("/api/penyisiran/monitoring-terpadu", token);
      setData(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        sessionStorage.removeItem(TOKEN_KEY);
        onSessionExpired();
      } else {
        setErrMsg(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-navy-900 sm:text-lg">Monitoring</h1>
          <p className="mt-0.5 text-xs text-ink/50">
            Rekap gabungan 7 area monitoring: kualitas data kunjungan, konsistensi lintas sumber identifikasi,
            realisasi vs rencana, kelengkapan SPJ, beban kerja petugas, progres vs tenggat, dan konflik alokasi PPL.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-ink/60 hover:border-navy-400 hover:text-navy-700 disabled:opacity-50"
        >
          {loading ? "Memuat..." : "↻ Muat Ulang"}
        </button>
      </div>

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      {!data && loading && (
        <p className="rounded-lg border border-line bg-white p-6 text-center text-xs text-ink/40">Memuat data...</p>
      )}

      {data && (
        <div className="space-y-4">
          <SeksiProgresTenggat data={data.progres_tenggat} />
          <SeksiKonsistensiIdentifikasi data={data.konsistensi_identifikasi} />
          <SeksiRealisasiRencana data={data.realisasi_vs_rencana} />
          <SeksiKualitasKunjungan kualitas={data.kualitas_kunjungan} burst={data.burst_update} />
          <SeksiKelengkapanSpj data={data.kelengkapan_spj} />
          <SeksiKonflikAlokasiPpl data={data.konflik_alokasi_ppl} />
          <SeksiBebanKerja data={data.beban_kerja_petugas} />
        </div>
      )}
    </div>
  );
}

// ---------- Bungkus seksi + stat tile (dipakai berulang) ----------

function Seksi({
  nomor,
  judul,
  keterangan,
  children,
}: {
  nomor: number;
  judul: string;
  keterangan: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-3">
      <div className="mb-2">
        <h2 className="text-sm font-bold text-navy-900">
          {nomor}. {judul}
        </h2>
        <p className="mt-0.5 text-[11px] text-ink/50">{keterangan}</p>
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, nilai, warna }: { label: string; nilai: number | string; warna: string }) {
  return (
    <div className="text-center sm:text-left">
      <div className={`text-lg font-bold leading-none sm:text-xl ${warna}`}>{nilai}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink/40">{label}</div>
    </div>
  );
}

function HintFilter({ adaFilterAktif, onReset }: { adaFilterAktif: boolean; onReset: () => void }) {
  return (
    <div className="mb-1 flex items-center justify-between text-[10px] text-ink/40">
      <span>Klik nama kolom utk urutkan, klik ▾ utk filter.</span>
      {adaFilterAktif && (
        <button type="button" onClick={onReset} className="font-medium text-navy-700 hover:underline">
          Reset semua filter
        </button>
      )}
    </div>
  );
}

// ---------- 1) Progres vs tenggat waktu ----------

function SeksiProgresTenggat({ data }: { data: ProgresTenggat }) {
  const pct = persen(data.jumlah_selesai, data.total_keluarga);
  const deadlineMs = useMemo(() => new Date(data.deadline).getTime(), [data.deadline]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const jamTersisa = (deadlineMs - now) / 3_600_000;
  const hariTersisa = jamTersisa / 24;
  const hariDibutuhkan = data.rata_rata_per_hari_7hr > 0 ? data.sisa / data.rata_rata_per_hari_7hr : Infinity;
  const sudahLewat = jamTersisa <= 0;
  const berisiko = !sudahLewat && data.sisa > 0 && hariDibutuhkan > hariTersisa;

  return (
    <Seksi
      nomor={1}
      judul="Progres vs Tenggat Waktu Identifikasi"
      keterangan={`Tenggat pengisian Identifikasi: ${formatTanggalJam(data.deadline)} WIB. Proyeksi dihitung dari rata-rata pengisian 7 hari terakhir.`}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Total Keluarga" nilai={data.total_keluarga} warna="text-navy-900" />
        <StatTile label="Sudah Diisi" nilai={data.jumlah_selesai} warna="text-moss-700" />
        <StatTile label="Sisa" nilai={data.sisa} warna={data.sisa > 0 ? "text-rust-700" : "text-ink/30"} />
        <StatTile label="Rata2/Hari (7hr)" nilai={data.rata_rata_per_hari_7hr} warna="text-navy-700" />
        <StatTile label="Persentase" nilai={`${pct}%`} warna="text-navy-700" />
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-moss-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div
        className={`mt-3 rounded-md border p-2.5 text-xs ${
          sudahLewat
            ? "border-rust-200 bg-rust-100/40 text-rust-700"
            : data.sisa === 0
              ? "border-moss-200 bg-moss-100/40 text-moss-700"
              : berisiko
                ? "border-rust-200 bg-rust-100/40 text-rust-700"
                : "border-moss-200 bg-moss-100/40 text-moss-700"
        }`}
      >
        {data.sisa === 0
          ? "✅ Semua keluarga sudah diisi Identifikasi-nya."
          : sudahLewat
            ? "⚠ Tenggat sudah lewat dan masih ada sisa yang belum diisi."
            : berisiko
              ? `⚠ Dengan kecepatan saat ini (~${Math.round(data.rata_rata_per_hari_7hr)}/hari), sisa ${data.sisa} keluarga diperkirakan butuh ~${Math.ceil(hariDibutuhkan)} hari lagi -- lebih lama dari sisa waktu ke tenggat (~${Math.max(0, Math.ceil(hariTersisa))} hari). Berisiko tidak selesai tepat waktu.`
              : `Dengan kecepatan saat ini, sisa ${data.sisa} keluarga diperkirakan bisa selesai sebelum tenggat (~${Math.max(0, Math.ceil(hariTersisa))} hari lagi).`}
      </div>

      {data.tren_harian.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-semibold text-ink/50">Tren pengisian 10 hari terakhir</p>
          <div className="flex items-end gap-1">
            {data.tren_harian.map((h) => {
              const maxJumlah = Math.max(...data.tren_harian.map((x) => x.jumlah), 1);
              const tinggi = Math.max(4, Math.round((h.jumlah / maxJumlah) * 48));
              return (
                <div key={h.tanggal} className="flex flex-1 flex-col items-center gap-1">
                  <div className="text-[9px] text-ink/50">{h.jumlah}</div>
                  <div className="w-full rounded-t bg-navy-400" style={{ height: `${tinggi}px` }} />
                  <div className="text-[8px] text-ink/40">{formatTanggal(h.tanggal)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Seksi>
  );
}

// ---------- 2) Konsistensi lintas sumber identifikasi ----------

function SeksiKonsistensiIdentifikasi({ data }: { data: KonsistensiIdentifikasi }) {
  const kolom = useMemo(
    () => [
      { key: "kode_identitas", label: "Kode Identitas", getValue: (r: KonsistensiKonflikRow) => r.kode_identitas },
      { key: "nama_kk", label: "Nama KK", getValue: (r: KonsistensiKonflikRow) => r.nama_kk ?? "" },
      { key: "sls_nama", label: "SLS", getValue: (r: KonsistensiKonflikRow) => r.sls_nama ?? "" },
      { key: "subsls_kode", label: "Sub SLS", getValue: (r: KonsistensiKonflikRow) => r.subsls_kode ?? "" },
      {
        key: "jawaban",
        label: "Jawaban per Sumber",
        getValue: (r: KonsistensiKonflikRow) =>
          Object.entries(r.nilai_per_sumber)
            .map(([k, v]) => `${LABEL_SUMBER[k] ?? k}: ${LABEL_NILAI[v ?? ""] ?? v ?? "-"}`)
            .join(" | "),
      },
    ],
    []
  );
  const tabel = useExcelTable(data.daftar_konflik, kolom, { key: "kode_identitas", dir: "asc" });

  return (
    <Seksi
      nomor={2}
      judul="Konsistensi Jawaban Lintas Sumber Identifikasi"
      keterangan="Membandingkan jawaban TERAKHIR dari PPL, Jorong, dan Tetangga/Lainnya per keluarga (dari riwayat perubahan) -- baris di bawah adalah keluarga yang dijawab beda oleh lebih dari satu sumber."
    >
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Diisi >1 Sumber" nilai={data.total_multi_sumber} warna="text-navy-900" />
        <StatTile
          label="Jawaban Bertentangan"
          nilai={data.total_konflik}
          warna={data.total_konflik > 0 ? "text-rust-700" : "text-moss-700"}
        />
        <StatTile
          label="% Bertentangan dari Multi-Sumber"
          nilai={`${persen(data.total_konflik, data.total_multi_sumber)}%`}
          warna="text-navy-700"
        />
      </div>
      {data.daftar_konflik.length === 0 ? (
        <p className="rounded-md border border-moss-200 bg-moss-100/40 p-2.5 text-xs text-moss-700">
          ✅ Tidak ada jawaban yang bertentangan antar sumber saat ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <HintFilter adaFilterAktif={tabel.adaFilterAktif} onReset={tabel.resetFilters} />
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              <tr>
                {kolom.map((c) => (
                  <ExcelTh
                    key={c.key}
                    label={c.label}
                    colKey={c.key}
                    values={tabel.uniqueValues[c.key] ?? []}
                    sortKey={tabel.sortKey}
                    sortDir={tabel.sortDir}
                    onSort={tabel.toggleSort}
                    activeFilter={tabel.filters[c.key]}
                    onFilterChange={tabel.setColumnFilter}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tabel.rows.map((r) => (
                <tr key={r.kode_identitas}>
                  <td className="px-2 py-1.5 font-mono text-[11px]">{r.kode_identitas}</td>
                  <td className="px-2 py-1.5">{r.nama_kk || "-"}</td>
                  <td className="px-2 py-1.5">{r.sls_nama || "-"}</td>
                  <td className="px-2 py-1.5">{r.subsls_kode || "-"}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(r.nilai_per_sumber).map(([k, v]) => (
                        <span
                          key={k}
                          className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-ink/70"
                        >
                          {LABEL_SUMBER[k] ?? k}: <strong>{LABEL_NILAI[v ?? ""] ?? v ?? "-"}</strong>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {tabel.rows.length === 0 && (
                <tr>
                  <td colSpan={kolom.length} className="px-2 py-4 text-center text-ink/40">
                    Tidak ada baris utk filter ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Seksi>
  );
}

// ---------- 3) Realisasi vs rencana ----------

function SeksiRealisasiRencana({ data }: { data: RealisasiVsRencana }) {
  const kolom = useMemo(
    () => [
      { key: "nama", label: "Nama Petugas", getValue: (r: RealisasiPetugasRow) => r.nama },
      { key: "jumlah_rencana", label: "Sub SLS Direncanakan", getValue: (r: RealisasiPetugasRow) => r.jumlah_rencana },
      { key: "jumlah_realisasi", label: "Sub SLS Terealisasi", getValue: (r: RealisasiPetugasRow) => r.jumlah_realisasi },
      { key: "jumlah_kunjungan", label: "Jumlah Kunjungan", getValue: (r: RealisasiPetugasRow) => r.jumlah_kunjungan },
      { key: "jumlah_hari", label: "Hari Tugas Dialokasikan", getValue: (r: RealisasiPetugasRow) => r.jumlah_hari },
    ],
    []
  );
  const tabel = useExcelTable(data.per_petugas, kolom, { key: "nama", dir: "asc" });
  const pctOh = persen(data.oh_terpakai, data.kuota_oh);

  return (
    <Seksi
      nomor={3}
      judul="Realisasi vs Rencana (Perencanaan Lapangan)"
      keterangan="Sub SLS yang direncanakan tiap petugas (kartu Identifikasi Wilayah Sampel SLS) dibandingkan dgn Sub SLS yang benar-benar sudah dikunjungi di Penyisiran Usaha, plus pemakaian kuota OH Translok."
    >
      <div className="mb-3 rounded-md border border-line bg-paper/40 p-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-ink/60">Kuota OH Translok</span>
          <span className="text-xs text-ink/50">
            {data.oh_terpakai} / {data.kuota_oh} hari terpakai ({pctOh}%)
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line">
          <div
            className={`h-full rounded-full transition-all ${pctOh >= 90 ? "bg-rust-500" : "bg-navy-500"}`}
            style={{ width: `${Math.min(100, pctOh)}%` }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <HintFilter adaFilterAktif={tabel.adaFilterAktif} onReset={tabel.resetFilters} />
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
            <tr>
              {kolom.map((c) => (
                <ExcelTh
                  key={c.key}
                  label={c.label}
                  colKey={c.key}
                  values={tabel.uniqueValues[c.key] ?? []}
                  sortKey={tabel.sortKey}
                  sortDir={tabel.sortDir}
                  onSort={tabel.toggleSort}
                  activeFilter={tabel.filters[c.key]}
                  onFilterChange={tabel.setColumnFilter}
                  align={c.key === "nama" ? "left" : "right"}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tabel.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-1.5">{r.nama}</td>
                <td className="px-2 py-1.5 text-right">{r.jumlah_rencana}</td>
                <td className="px-2 py-1.5 text-right">{r.jumlah_realisasi}</td>
                <td className="px-2 py-1.5 text-right">{r.jumlah_kunjungan}</td>
                <td className="px-2 py-1.5 text-right">{r.jumlah_hari}</td>
              </tr>
            ))}
            {tabel.rows.length === 0 && (
              <tr>
                <td colSpan={kolom.length} className="px-2 py-4 text-center text-ink/40">
                  Tidak ada baris utk filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Seksi>
  );
}

// ---------- 4) Kualitas & kewajaran data kunjungan ----------

function SeksiKualitasKunjungan({ kualitas, burst }: { kualitas: KualitasKunjungan; burst: BurstUpdateRow[] }) {
  const kolomKec = useMemo(
    () => [
      { key: "kec_nama", label: "Kecamatan", getValue: (r: KualitasKunjungan["per_kecamatan"][number]) => r.kec_nama },
      {
        key: "total_ditemukan",
        label: "Ditemukan",
        getValue: (r: KualitasKunjungan["per_kecamatan"][number]) => r.total_ditemukan,
      },
      {
        key: "tanpa_bukti",
        label: "Tanpa Bukti Sama Sekali",
        getValue: (r: KualitasKunjungan["per_kecamatan"][number]) => r.tanpa_bukti,
      },
    ],
    []
  );
  const tabelKec = useExcelTable(kualitas.per_kecamatan, kolomKec, { key: "kec_nama", dir: "asc" });

  const kolomBurst = useMemo(
    () => [
      { key: "oleh_nama", label: "Petugas", getValue: (r: BurstUpdateRow) => r.oleh_nama },
      { key: "jumlah", label: "Jumlah Update", getValue: (r: BurstUpdateRow) => r.jumlah },
      { key: "mulai", label: "Mulai", getValue: (r: BurstUpdateRow) => r.mulai },
      { key: "selesai", label: "Selesai", getValue: (r: BurstUpdateRow) => r.selesai },
    ],
    []
  );
  const tabelBurst = useExcelTable(burst, kolomBurst, { key: "jumlah", dir: "desc" });

  return (
    <Seksi
      nomor={4}
      judul="Kualitas & Kewajaran Data Kunjungan Penyisiran Usaha"
      keterangan="Kelengkapan bukti (DUTP/DTSEN/PNM) & catatan pada kartu berstatus “Ditemukan”, plus deteksi update status kunjungan yang beruntun sangat cepat (≥15x dalam 5 menit oleh petugas yang sama) -- patut dicek manual, bisa jadi isi cepat tanpa kunjungan nyata."
    >
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Kartu Ditemukan" nilai={kualitas.total_ditemukan} warna="text-navy-900" />
        <StatTile
          label="Tanpa Bukti Sama Sekali"
          nilai={`${kualitas.tanpa_bukti} (${persen(kualitas.tanpa_bukti, kualitas.total_ditemukan)}%)`}
          warna={kualitas.tanpa_bukti > 0 ? "text-rust-700" : "text-moss-700"}
        />
        <StatTile
          label="Tanpa Catatan Petugas"
          nilai={`${kualitas.tanpa_catatan} (${persen(kualitas.tanpa_catatan, kualitas.total_ditemukan)}%)`}
          warna="text-navy-700"
        />
      </div>

      <p className="mb-1 text-[11px] font-semibold text-ink/50">Kelengkapan bukti per Kecamatan</p>
      <div className="mb-4 overflow-x-auto">
        <HintFilter adaFilterAktif={tabelKec.adaFilterAktif} onReset={tabelKec.resetFilters} />
        <table className="w-full min-w-[480px] border-collapse text-xs">
          <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
            <tr>
              {kolomKec.map((c) => (
                <ExcelTh
                  key={c.key}
                  label={c.label}
                  colKey={c.key}
                  values={tabelKec.uniqueValues[c.key] ?? []}
                  sortKey={tabelKec.sortKey}
                  sortDir={tabelKec.sortDir}
                  onSort={tabelKec.toggleSort}
                  activeFilter={tabelKec.filters[c.key]}
                  onFilterChange={tabelKec.setColumnFilter}
                  align={c.key === "kec_nama" ? "left" : "right"}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tabelKec.rows.map((r) => (
              <tr key={r.kec_nama}>
                <td className="px-2 py-1.5">{r.kec_nama}</td>
                <td className="px-2 py-1.5 text-right">{r.total_ditemukan}</td>
                <td className="px-2 py-1.5 text-right">{r.tanpa_bukti}</td>
              </tr>
            ))}
            {tabelKec.rows.length === 0 && (
              <tr>
                <td colSpan={kolomKec.length} className="px-2 py-4 text-center text-ink/40">
                  Tidak ada baris utk filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mb-1 text-[11px] font-semibold text-ink/50">Update status kunjungan beruntun sangat cepat</p>
      {burst.length === 0 ? (
        <p className="rounded-md border border-moss-200 bg-moss-100/40 p-2.5 text-xs text-moss-700">
          ✅ Tidak ada indikasi update beruntun sangat cepat.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <HintFilter adaFilterAktif={tabelBurst.adaFilterAktif} onReset={tabelBurst.resetFilters} />
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              <tr>
                {kolomBurst.map((c) => (
                  <ExcelTh
                    key={c.key}
                    label={c.label}
                    colKey={c.key}
                    values={tabelBurst.uniqueValues[c.key] ?? []}
                    sortKey={tabelBurst.sortKey}
                    sortDir={tabelBurst.sortDir}
                    onSort={tabelBurst.toggleSort}
                    activeFilter={tabelBurst.filters[c.key]}
                    onFilterChange={tabelBurst.setColumnFilter}
                    align={c.key === "jumlah" ? "right" : "left"}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tabelBurst.rows.map((r, i) => (
                <tr key={`${r.oleh_nama}-${r.bucket}-${i}`}>
                  <td className="px-2 py-1.5">{r.oleh_nama}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-rust-700">{r.jumlah}</td>
                  <td className="px-2 py-1.5">{formatTanggalJam(r.mulai)}</td>
                  <td className="px-2 py-1.5">{formatTanggalJam(r.selesai)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seksi>
  );
}

// ---------- 5) Kelengkapan SPJ ----------

function SeksiKelengkapanSpj({ data }: { data: KelengkapanSpj }) {
  const kolom = useMemo(
    () => [
      { key: "nomor_st", label: "Nomor Surat Tugas", getValue: (r: SpjTanpaVisumRow) => r.nomor_st },
      { key: "nama", label: "Nama Petugas", getValue: (r: SpjTanpaVisumRow) => r.nama },
      { key: "tanggal_mulai", label: "Tanggal Mulai", getValue: (r: SpjTanpaVisumRow) => r.tanggal_mulai },
      { key: "tanggal_selesai", label: "Tanggal Selesai", getValue: (r: SpjTanpaVisumRow) => r.tanggal_selesai },
    ],
    []
  );
  const tabel = useExcelTable(data.daftar_tanpa_visum, kolom, { key: "tanggal_mulai", dir: "desc" });

  return (
    <Seksi
      nomor={5}
      judul="Kelengkapan SPJ (Surat Tugas tanpa Visum)"
      keterangan="Setiap petugas yang tercantum di sebuah Surat Tugas seharusnya punya Visum. Daftar di bawah adalah pasangan Surat Tugas x Petugas yang BELUM ada Visum-nya."
    >
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Total Pasangan ST x Petugas" nilai={data.total_pasangan} warna="text-navy-900" />
        <StatTile
          label="Belum Ada Visum"
          nilai={data.tanpa_visum}
          warna={data.tanpa_visum > 0 ? "text-rust-700" : "text-moss-700"}
        />
        <StatTile label="% Belum Visum" nilai={`${persen(data.tanpa_visum, data.total_pasangan)}%`} warna="text-navy-700" />
      </div>
      {data.daftar_tanpa_visum.length === 0 ? (
        <p className="rounded-md border border-moss-200 bg-moss-100/40 p-2.5 text-xs text-moss-700">
          ✅ Semua Surat Tugas sudah ada Visum-nya.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <HintFilter adaFilterAktif={tabel.adaFilterAktif} onReset={tabel.resetFilters} />
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              <tr>
                {kolom.map((c) => (
                  <ExcelTh
                    key={c.key}
                    label={c.label}
                    colKey={c.key}
                    values={tabel.uniqueValues[c.key] ?? []}
                    sortKey={tabel.sortKey}
                    sortDir={tabel.sortDir}
                    onSort={tabel.toggleSort}
                    activeFilter={tabel.filters[c.key]}
                    onFilterChange={tabel.setColumnFilter}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tabel.rows.map((r, i) => (
                <tr key={`${r.nomor_st}-${r.nama}-${i}`}>
                  <td className="px-2 py-1.5">{r.nomor_st}</td>
                  <td className="px-2 py-1.5">{r.nama}</td>
                  <td className="px-2 py-1.5">{formatTanggal(r.tanggal_mulai)}</td>
                  <td className="px-2 py-1.5">{formatTanggal(r.tanggal_selesai)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seksi>
  );
}

// ---------- 6) Konflik alokasi wilayah PPL ----------

function SeksiKonflikAlokasiPpl({ data }: { data: KonflikAlokasiPpl }) {
  const kolom = useMemo(
    () => [
      { key: "idsubsls", label: "ID Sub SLS", getValue: (r: KonflikAlokasiRow) => r.idsubsls },
      { key: "jumlah_ppl", label: "Jumlah PPL", getValue: (r: KonflikAlokasiRow) => r.jumlah_ppl },
      {
        key: "ppl_list",
        label: "Daftar PPL",
        getValue: (r: KonflikAlokasiRow) => r.ppl_list.map((p) => p.nama).join(", "),
      },
    ],
    []
  );
  const tabel = useExcelTable(data.daftar, kolom, { key: "idsubsls", dir: "asc" });

  return (
    <Seksi
      nomor={6}
      judul="Konflik Alokasi Wilayah PPL"
      keterangan="Satu ID Sub SLS yang dialokasikan ke lebih dari satu PPL sekaligus -- perlu diluruskan supaya keluarga di wilayah itu tidak terhitung dobel/rebutan sumber."
    >
      <div className="mb-2">
        <StatTile
          label="ID Sub SLS Konflik"
          nilai={data.total_konflik}
          warna={data.total_konflik > 0 ? "text-rust-700" : "text-moss-700"}
        />
      </div>
      {data.daftar.length === 0 ? (
        <p className="rounded-md border border-moss-200 bg-moss-100/40 p-2.5 text-xs text-moss-700">
          ✅ Tidak ada ID Sub SLS yang dialokasikan ke lebih dari satu PPL saat ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <HintFilter adaFilterAktif={tabel.adaFilterAktif} onReset={tabel.resetFilters} />
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              <tr>
                {kolom.map((c) => (
                  <ExcelTh
                    key={c.key}
                    label={c.label}
                    colKey={c.key}
                    values={tabel.uniqueValues[c.key] ?? []}
                    sortKey={tabel.sortKey}
                    sortDir={tabel.sortDir}
                    onSort={tabel.toggleSort}
                    activeFilter={tabel.filters[c.key]}
                    onFilterChange={tabel.setColumnFilter}
                    align={c.key === "jumlah_ppl" ? "right" : "left"}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tabel.rows.map((r) => (
                <tr key={r.idsubsls}>
                  <td className="px-2 py-1.5 font-mono text-[11px]">{r.idsubsls}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-rust-700">{r.jumlah_ppl}</td>
                  <td className="px-2 py-1.5">{r.ppl_list.map((p) => p.nama).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seksi>
  );
}

// ---------- 7) Beban kerja & kelengkapan data Master Petugas ----------

function SeksiBebanKerja({ data }: { data: BebanKerjaPetugas }) {
  const kolomSpan = useMemo(
    () => [
      { key: "nama_pengawas", label: "Nama Pengawas", getValue: (r: SpanPengawasRow) => r.nama_pengawas },
      { key: "jumlah_bawahan", label: "Jumlah Bawahan", getValue: (r: SpanPengawasRow) => r.jumlah_bawahan },
    ],
    []
  );
  const tabelSpan = useExcelTable(data.span_pengawas, kolomSpan, { key: "jumlah_bawahan", dir: "desc" });

  const kolomLengkap = useMemo(
    () => [
      { key: "nama", label: "Nama", getValue: (r: DataTidakLengkapRow) => r.nama },
      { key: "tanpa_hp", label: "Tanpa No. HP", getValue: (r: DataTidakLengkapRow) => (r.tanpa_hp ? "Ya" : "Tidak") },
      { key: "tanpa_nip", label: "Tanpa NIP", getValue: (r: DataTidakLengkapRow) => (r.tanpa_nip ? "Ya" : "Tidak") },
      { key: "tanpa_email", label: "Tanpa Email", getValue: (r: DataTidakLengkapRow) => (r.tanpa_email ? "Ya" : "Tidak") },
    ],
    []
  );
  const tabelLengkap = useExcelTable(data.data_tidak_lengkap, kolomLengkap, { key: "nama", dir: "asc" });

  return (
    <Seksi
      nomor={7}
      judul="Beban Kerja & Kelengkapan Data Master Petugas"
      keterangan="Jumlah bawahan per pengawas (span of control) dan akun petugas aktif yang datanya (No. HP/NIP/Email) belum lengkap di Master Petugas."
    >
      <p className="mb-1 text-[11px] font-semibold text-ink/50">Jumlah bawahan per pengawas</p>
      {data.span_pengawas.length === 0 ? (
        <p className="mb-4 rounded-md border border-line bg-paper/40 p-2.5 text-xs text-ink/50">
          Belum ada data pengawas (kolom &ldquo;Pengawas&rdquo; di Master Petugas belum diisi).
        </p>
      ) : (
        <div className="mb-4 overflow-x-auto">
          <HintFilter adaFilterAktif={tabelSpan.adaFilterAktif} onReset={tabelSpan.resetFilters} />
          <table className="w-full min-w-[360px] border-collapse text-xs">
            <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              <tr>
                {kolomSpan.map((c) => (
                  <ExcelTh
                    key={c.key}
                    label={c.label}
                    colKey={c.key}
                    values={tabelSpan.uniqueValues[c.key] ?? []}
                    sortKey={tabelSpan.sortKey}
                    sortDir={tabelSpan.sortDir}
                    onSort={tabelSpan.toggleSort}
                    activeFilter={tabelSpan.filters[c.key]}
                    onFilterChange={tabelSpan.setColumnFilter}
                    align={c.key === "jumlah_bawahan" ? "right" : "left"}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tabelSpan.rows.map((r) => (
                <tr key={r.nama_pengawas}>
                  <td className="px-2 py-1.5">{r.nama_pengawas}</td>
                  <td className="px-2 py-1.5 text-right">{r.jumlah_bawahan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mb-1 text-[11px] font-semibold text-ink/50">
        Akun aktif dengan data belum lengkap ({data.data_tidak_lengkap.length})
      </p>
      {data.data_tidak_lengkap.length === 0 ? (
        <p className="rounded-md border border-moss-200 bg-moss-100/40 p-2.5 text-xs text-moss-700">
          ✅ Semua akun petugas aktif sudah lengkap data kontaknya.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <HintFilter adaFilterAktif={tabelLengkap.adaFilterAktif} onReset={tabelLengkap.resetFilters} />
          <table className="w-full min-w-[480px] border-collapse text-xs">
            <thead className="bg-paper text-[10px] font-semibold uppercase tracking-wide text-ink/50">
              <tr>
                {kolomLengkap.map((c) => (
                  <ExcelTh
                    key={c.key}
                    label={c.label}
                    colKey={c.key}
                    values={tabelLengkap.uniqueValues[c.key] ?? []}
                    sortKey={tabelLengkap.sortKey}
                    sortDir={tabelLengkap.sortDir}
                    onSort={tabelLengkap.toggleSort}
                    activeFilter={tabelLengkap.filters[c.key]}
                    onFilterChange={tabelLengkap.setColumnFilter}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tabelLengkap.rows.map((r) => (
                <tr key={r.nama}>
                  <td className="px-2 py-1.5">{r.nama}</td>
                  <td className={`px-2 py-1.5 ${r.tanpa_hp ? "font-semibold text-rust-700" : "text-ink/40"}`}>
                    {r.tanpa_hp ? "Ya" : "Tidak"}
                  </td>
                  <td className={`px-2 py-1.5 ${r.tanpa_nip ? "font-semibold text-rust-700" : "text-ink/40"}`}>
                    {r.tanpa_nip ? "Ya" : "Tidak"}
                  </td>
                  <td className={`px-2 py-1.5 ${r.tanpa_email ? "font-semibold text-rust-700" : "text-ink/40"}`}>
                    {r.tanpa_email ? "Ya" : "Tidak"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seksi>
  );
}
