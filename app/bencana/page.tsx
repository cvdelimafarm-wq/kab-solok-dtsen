"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
  jumlah_bilang_tidak_ada: number;
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
  jumlah_hari_kerja: number;
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
  pendaftaran_bencana_konfirmasi: boolean;
  kegiatan_lain: string[];
};

// Status "kesediaan ikut pendataan bencana" utk seorang PPL yg sudah diplot,
// dipakai utk ikon warning di kolom PPL Langkah 4:
//  - "belum_konfirmasi": namanya tidak ada di daftar self-report konfirmasi
//    kesediaan ikut pendataan bencana -> perlu dihubungi & ditawarkan.
//  - "beban_ganda": sudah konfirmasi ikut pendataan bencana, TAPI juga sudah
//    ditandai (tag) di kegiatan/survei lain -> boleh saja, tapi beban kerja
//    petugas itu nambah, jadi perlu diberi tahu di depan.
type StatusKesediaanPpl = { tipe: "belum_konfirmasi" | "beban_ganda"; kegiatanLain: string[] } | null;

function statusKesediaanPpl(p: PetugasRingkas | undefined): StatusKesediaanPpl {
  if (!p) return null;
  const kegiatanLain = p.kegiatan_lain ?? [];
  if (!p.pendaftaran_bencana_konfirmasi) return { tipe: "belum_konfirmasi", kegiatanLain };
  if (kegiatanLain.length > 0) return { tipe: "beban_ganda", kegiatanLain };
  return null;
}

// Ikon warning ringan di kolom PPL (Langkah 4) -- klik utk buka popover kecil
// yg menjelaskan kenapa warning muncul. Sengaja dibuat SANGAT ringan (bukan
// modal penuh layar): posisi fixed dihitung dari lokasi klik, tutup sendiri
// kalau klik di luar/scroll/resize -- pola yg sama dgn popover ThKontrol.
function IkonStatusKesediaanPpl({ status }: { status: NonNullable<StatusKesediaanPpl> }) {
  const [buka, setBuka] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!buka) return;
    function tutupJikaDiluar(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setBuka(false);
    }
    document.addEventListener("mousedown", tutupJikaDiluar);
    document.addEventListener("scroll", tutupJikaDiluar, true);
    window.addEventListener("resize", tutupJikaDiluar);
    return () => {
      document.removeEventListener("mousedown", tutupJikaDiluar);
      document.removeEventListener("scroll", tutupJikaDiluar, true);
      window.removeEventListener("resize", tutupJikaDiluar);
    };
  }, [buka]);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (buka) {
      setBuka(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const lebar = 260;
    setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - lebar - 8)) });
    setBuka(true);
  }

  const warna = status.tipe === "belum_konfirmasi" ? "text-rust-600" : "text-orange-500";
  const judul =
    status.tipe === "belum_konfirmasi" ? "Belum konfirmasi ikut pendataan bencana" : "Sudah bertugas di kegiatan lain";

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={toggle} title={judul} className={`text-sm leading-none ${warna}`}>
        ⚠️
      </button>
      {buka && pos && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 260 }}
          className="z-50 rounded-md border border-line bg-white p-2.5 text-left text-xs normal-case shadow-lg"
        >
          <p className={`font-semibold ${warna}`}>{judul}</p>
          {status.tipe === "belum_konfirmasi" ? (
            <p className="mt-1 text-ink/70">
              Nama ini tidak ada di daftar self-report kesediaan ikut pendataan bencana. Perlu dihubungi utk ditawarkan
              &amp; diminta konfirmasi kesediaannya.
              {status.kegiatanLain.length > 0 && (
                <> Catatan: sudah bertugas juga di {status.kegiatanLain.join(", ")}.</>
              )}
            </p>
          ) : (
            <p className="mt-1 text-ink/70">
              Sudah konfirmasi ikut pendataan bencana, tapi juga sudah bertugas di{" "}
              <b>{status.kegiatanLain.join(", ")}</b>. Boleh saja dirangkap, tapi beban kerjanya bertambah.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Rincian satu laporan identifikasi jorong (mitra) yg jadi SUMBER estimasi
// KK terdampak utk sebuah Sub SLS -- dipakai popover "Sumber data KK
// Terdampak" di Kertas Kerja Beban, supaya admin bisa lihat langsung siapa
// lapor berapa & jenis kerusakan apa sebelum mengoreksi angka.
type RincianSumberKk = {
  nama_mitra: string;
  indikator_dampak: string[];
  total_kk: number;
  catatan: string | null;
  dibuat_pada: string;
};

type SumberKkTerdampak = {
  idsls: string;
  jorong: string;
  sub_sls: string;
  rincian: RincianSumberKk[];
  jumlah_laporan: number;
  rata_rata: number;
  maksimum: number;
};

function labelIndikatorDampak(key: string): string {
  return INDIKATOR_DAMPAK.find((i) => i.key === key)?.label ?? key;
}

// Ikon "cari tahu sumber data" di kolom KK Terdampak (Kertas Kerja Beban) --
// klik utk buka popover berisi rincian tiap laporan mitra (nama, jumlah KK,
// jenis kerusakan) yg mencakup Sub SLS ini, + tombol pintas "Terapkan
// rata-rata"/"Terapkan maksimum" utk mengisi kolom KK Terdampak dari angka
// itu (opsi ketik manual tetap ada di kolom inputnya, tidak berubah). Data
// di-fetch sekali per Sub SLS saat pertama kali dibuka (bukan saat tabel
// dimuat) supaya tetap ringan & cepat -- pola popover sama dgn ThKontrol /
// IkonStatusKesediaanPpl.
function IkonSumberKkTerdampak({
  idsubsls,
  onTerapkan,
}: {
  idsubsls: string;
  onTerapkan: (nilai: number) => void;
}) {
  const [buka, setBuka] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [data, setData] = useState<SumberKkTerdampak | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!buka) return;
    function tutupJikaDiluar(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setBuka(false);
    }
    document.addEventListener("mousedown", tutupJikaDiluar);
    document.addEventListener("scroll", tutupJikaDiluar, true);
    window.addEventListener("resize", tutupJikaDiluar);
    return () => {
      document.removeEventListener("mousedown", tutupJikaDiluar);
      document.removeEventListener("scroll", tutupJikaDiluar, true);
      window.removeEventListener("resize", tutupJikaDiluar);
    };
  }, [buka]);

  async function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (buka) {
      setBuka(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const lebar = 300;
    setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - lebar - 8)) });
    setBuka(true);
    if (!data && !loading) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bencana/alokasi/beban/sumber?idsubsls=${encodeURIComponent(idsubsls)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memuat sumber data KK terdampak.");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        title="Cari tahu dari mana data KK terdampak diperoleh"
        className="text-sm leading-none text-blue-600 hover:text-blue-900"
      >
        🔎
      </button>
      {buka && pos && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 300 }}
          className="z-50 max-h-80 overflow-y-auto rounded-md border border-line bg-white p-2.5 text-left text-xs normal-case shadow-lg"
        >
          <p className="font-semibold text-ink">Sumber data KK Terdampak</p>
          {loading && <p className="mt-1 text-ink/60">Memuat...</p>}
          {error && <p className="mt-1 text-rust-600">{error}</p>}
          {data && !loading && !error && (
            <>
              {data.jumlah_laporan === 0 ? (
                <p className="mt-1 text-ink/60">
                  Belum ada laporan identifikasi jorong yang mencakup Sub SLS ini.
                </p>
              ) : (
                <>
                  <ul className="mt-1.5 space-y-1.5">
                    {data.rincian.map((r, i) => (
                      <li key={i} className="border-b border-line/60 pb-1.5 last:border-0">
                        <span className="font-medium text-ink">{r.nama_mitra}</span>
                        <span className="text-ink/70"> : {r.total_kk} KK</span>
                        {r.indikator_dampak.length > 0 && (
                          <p className="text-[10px] text-ink/50">
                            {r.indikator_dampak.map(labelIndikatorDampak).join(", ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onTerapkan(data.rata_rata);
                        setBuka(false);
                      }}
                      className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-900 hover:bg-blue-100"
                    >
                      Terapkan rata-rata ({data.rata_rata})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onTerapkan(data.maksimum);
                        setBuka(false);
                      }}
                      className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-medium text-orange-700 hover:bg-orange-100"
                    >
                      Terapkan maksimum ({data.maksimum})
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-ink/40">Atau ketik manual langsung di kolom KK Terdampak.</p>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Ikon "bandingkan dgn data verifikasi" (🧭) di baris Sub SLS yang Jorong-nya
// SUDAH ADA data verifikasi resmi (lihat bencana_kk_terdampak_verifikasi_jorong
// & AMBANG_SELISIH_VERIFIKASI_JORONG). Beda dgn IkonSumberKkTerdampak, ikon
// ini TIDAK fetch ke server -- seluruh datanya (rincian tiap Sub SLS
// se-Jorong + nilai draft terkini) sudah ada di memory (bebanRows +
// draftKkTerdampak), jadi popovernya murni hitung ulang lokal & langsung
// ikut berubah kalau admin sedang mengetik koreksi manual.
function IkonVerifikasiJorong({
  namaJorong,
  verifikasiTotal,
  totalJorongLive,
  rincianSub,
  bedaSignifikan,
}: {
  namaJorong: string;
  verifikasiTotal: number;
  totalJorongLive: number;
  rincianSub: { sub_sls: string; nilai: number }[];
  bedaSignifikan: boolean;
}) {
  const [buka, setBuka] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!buka) return;
    function tutupJikaDiluar(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setBuka(false);
    }
    document.addEventListener("mousedown", tutupJikaDiluar);
    document.addEventListener("scroll", tutupJikaDiluar, true);
    window.addEventListener("resize", tutupJikaDiluar);
    return () => {
      document.removeEventListener("mousedown", tutupJikaDiluar);
      document.removeEventListener("scroll", tutupJikaDiluar, true);
      window.removeEventListener("resize", tutupJikaDiluar);
    };
  }, [buka]);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (buka) {
      setBuka(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const lebar = 280;
    setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - lebar - 8)) });
    setBuka(true);
  }

  const selisih = totalJorongLive - verifikasiTotal;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        title="Bandingkan dengan data verifikasi resmi per Jorong"
        className={`text-sm leading-none ${bedaSignifikan ? "text-rust-600" : "text-slate-400 hover:text-slate-600"}`}
      >
        🧭
      </button>
      {buka && pos && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 280 }}
          className="z-50 max-h-80 overflow-y-auto rounded-md border border-line bg-white p-2.5 text-left text-xs normal-case shadow-lg"
        >
          <p className="font-semibold text-ink">Verifikasi Jorong {namaJorong}</p>
          <p className="mt-1 text-ink/70">
            Data awal KK terdampak (verifikasi resmi): <b>{verifikasiTotal}</b>
          </p>
          <p className="text-ink/70">
            Jumlah menurut aplikasi (total semua Sub SLS di Jorong ini): <b>{totalJorongLive}</b>
          </p>
          {bedaSignifikan && (
            <p className="mt-1 font-medium text-rust-600">
              Selisih {selisih > 0 ? "+" : ""}
              {selisih} KK -- lebih dari {AMBANG_SELISIH_VERIFIKASI_JORONG}, mohon ditinjau ulang manual.
            </p>
          )}
          <p className="mt-2 font-medium text-ink/70">Rincian tiap Sub SLS (menurut aplikasi):</p>
          <ul className="mt-1 space-y-0.5">
            {rincianSub.map((s) => (
              <li key={s.sub_sls} className="flex justify-between text-ink/70">
                <span>Sub SLS {s.sub_sls}</span>
                <span className="font-medium text-ink">{s.nilai}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

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

// Baris "Kertas Kerja Beban" -- KK total & KK terdampak per Sub SLS
// terdampak, sbg variabel input skor_beban_pendataan (bisa dikoreksi manual).
type KertasKerjaBebanRow = {
  idsubsls: string;
  idsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  kk_total: number;
  kk_terdampak_estimasi: number;
  kk_tidak_terdampak_estimasi: number;
  skor_beban_pendataan: number;
  kk_total_asli: number;
  kk_terdampak_asli: number;
  kk_total_manual: boolean;
  kk_terdampak_manual: boolean;
  punya_data_kk: boolean;
  // Data verifikasi lapangan resmi (Januari 2026) jumlah keluarga terdampak
  // PER JORONG -- null kalau Jorong ybs belum ada datanya. Dipakai utk
  // membandingkan thd total kk_terdampak (dijumlah per Jorong) & menandai
  // Sub SLS yg selisihnya jauh sbg perlu ditinjau ulang manual.
  verifikasi_total_keluarga: number | null;
};

// Selisih di atas ini (KK) antara data verifikasi resmi per Jorong vs total
// kk_terdampak aplikasi (dijumlah per Jorong) dianggap signifikan -> baris2
// Sub SLS di Jorong itu ditandai merah utk ditinjau ulang manual.
const AMBANG_SELISIH_VERIFIKASI_JORONG = 15;

type PengaturanBebanRow = {
  kunci: string;
  nilai: number;
  label: string;
  keterangan: string | null;
  updated_at: string;
};

// Baris "Kartu Mitra Perlu Dihubungi" -- mitra aktif yang BELUM konfirmasi
// ikut pendataan bencana (pendaftaran_bencana_konfirmasi = false), perlu
// dihubungi utk ditawarkan & dicatat hasilnya (diterima/menolak).
type MitraKontakRow = {
  id: number;
  nama: string;
  no_hp: string | null;
  alamat_kecamatan: string | null;
  status_kontak_pendaftaran_bencana: "diterima" | "menolak" | null;
  catatan_penolakan_pendaftaran_bencana: string | null;
  dikontak_pendaftaran_bencana_at: string | null;
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
  // "seluruh" = seluruh Sub SLS terdampak, "sebagian" = sebagian (dipilih di
  // checklist Sub SLS), "tidak_ada" = TIDAK ADA Sub SLS yang terdampak di
  // Jorong ini sama sekali.
  jawaban: "seluruh" | "sebagian" | "tidak_ada" | null;
  checkedSubsls: Set<string>; // Sub SLS yg YAKIN terdampak (dipilih saat jawaban="sebagian")
  raguSubsls: Set<string>; // Sub SLS yg RAGU/belum yakin terdampak atau tidak
  perkiraanKkSubsls: Record<string, number | "">; // perkiraan jumlah KELUARGA terdampak PER Sub SLS (checkedSubsls & raguSubsls)
  indikator: Set<string>;
  indikatorKk: Record<string, number | "">;
  catatan: string;
  submitting: boolean;
  submitted: boolean;
  error: string | null;
};

function emptyJorongState(): JorongLocalState {
  return {
    jawaban: null,
    checkedSubsls: new Set(),
    raguSubsls: new Set(),
    perkiraanKkSubsls: {},
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

// Header kolom tabel dengan 3 kontrol terpisah -- cari (🔍), filter (▽),
// urut (⇅) -- masing-masing buka popover sendiri supaya tidak tumpang
// tindih/susah diklik. Popover dipasang `position: fixed` (posisi dihitung
// dari lokasi tombol saat diklik) supaya TIDAK terpotong oleh
// overflow-auto pembungkus tabel, dan otomatis tertutup kalau tabelnya
// discroll atau jendela di-resize.
type ThKontrolJenis = "search" | "filter" | "sort";

function ThKontrol({
  label,
  className,
  stickyLeft,
  search,
  filter,
  sort,
}: {
  label: string;
  className?: string;
  stickyLeft?: boolean;
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  filter?: { options: string[]; selected: Set<string>; onApply: (next: Set<string>) => void };
  sort?: { active: boolean; dir: "asc" | "desc"; onAsc: () => void; onDesc: () => void; onReset: () => void };
}) {
  // Satu tombol "⋮" per kolom (bukan 3 ikon terpisah) supaya header tetap
  // rapi. Diklik -> kalau kolom itu punya lebih dari 1 kontrol, muncul
  // menu pilihan (Cari/Filter/Urutkan) dulu; kalau cuma 1 kontrol yg
  // relevan, langsung ke kontrol itu. Popover `position: fixed` (posisi
  // dihitung dari lokasi tombol saat diklik) supaya tidak terpotong
  // overflow-auto pembungkus tabel, dan otomatis tertutup kalau tabelnya
  // discroll atau jendela di-resize.
  const jenisTersedia: ThKontrolJenis[] = [
    ...(search ? (["search"] as const) : []),
    ...(filter ? (["filter"] as const) : []),
    ...(sort ? (["sort"] as const) : []),
  ];

  const [tampil, setTampil] = useState<"menu" | ThKontrolJenis | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [filterDraft, setFilterDraft] = useState<Set<string>>(new Set());
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tampil) return;
    function tutupJikaDiluar(e: Event) {
      if (popoverRef.current && e.target instanceof Node && popoverRef.current.contains(e.target)) return;
      setTampil(null);
    }
    document.addEventListener("mousedown", tutupJikaDiluar);
    document.addEventListener("scroll", tutupJikaDiluar, true);
    window.addEventListener("resize", tutupJikaDiluar);
    return () => {
      document.removeEventListener("mousedown", tutupJikaDiluar);
      document.removeEventListener("scroll", tutupJikaDiluar, true);
      window.removeEventListener("resize", tutupJikaDiluar);
    };
  }, [tampil]);

  function bukaAksi(e: React.MouseEvent<HTMLButtonElement>) {
    if (tampil) {
      setTampil(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const lebar = 224;
    setPos({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - lebar, window.innerWidth - lebar - 8)),
    });
    if (filter) setFilterDraft(new Set(filter.selected));
    setTampil(jenisTersedia.length === 1 ? jenisTersedia[0] : "menu");
  }

  const searchAktif = !!search?.value;
  const filterAktif = !!filter && filter.selected.size > 0;
  const aksiAktif = searchAktif || filterAktif || !!sort?.active;

  const LABEL_JENIS: Record<ThKontrolJenis, string> = {
    search: "🔍 Cari",
    filter: "▽ Filter",
    sort: sort?.active ? (sort.dir === "asc" ? "▲ Urutkan" : "▼ Urutkan") : "⇅ Urutkan",
  };

  return (
    <th className={`px-3 py-2 font-medium ${stickyLeft ? "sticky left-0 z-30 bg-blue-50" : ""} ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate">{label}</span>
        {jenisTersedia.length > 0 && (
          <button
            type="button"
            title="Aksi kolom"
            onClick={bukaAksi}
            className={`shrink-0 rounded p-1 text-xs leading-none transition ${
              aksiAktif || tampil ? "bg-blue-600 text-white" : "text-blue-300 hover:bg-blue-100 hover:text-blue-900"
            }`}
          >
            ⋮
          </button>
        )}
      </div>

      {tampil === "menu" && pos && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 224 }}
          className="z-50 rounded-md border border-line bg-white p-1 text-left font-normal normal-case text-ink shadow-lg"
        >
          {jenisTersedia.map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => setTampil(j)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-blue-50"
            >
              <span>{LABEL_JENIS[j]}</span>
              {j === "search" && searchAktif && <span className="text-[10px] text-blue-600">aktif</span>}
              {j === "filter" && filterAktif && <span className="text-[10px] text-blue-600">aktif</span>}
              {j === "sort" && sort?.active && <span className="text-[10px] text-blue-600">aktif</span>}
            </button>
          ))}
        </div>
      )}

      {tampil === "search" && search && pos && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 224 }}
          className="z-50 rounded-md border border-line bg-white p-2 text-left font-normal normal-case text-ink shadow-lg"
        >
          {jenisTersedia.length > 1 && (
            <button
              type="button"
              onClick={() => setTampil("menu")}
              className="mb-1.5 text-[10px] font-medium text-ink/50 hover:text-ink/80"
            >
              ← Kembali
            </button>
          )}
          <input
            autoFocus
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setTampil(null);
            }}
            placeholder={search.placeholder ?? "Ketik kata kunci..."}
            className="w-full rounded-md border border-line px-2 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
          <p className="mt-1 text-[10px] text-ink/50">Tekan Enter untuk mencari</p>
          {search.value && (
            <button
              type="button"
              onClick={() => {
                search.onChange("");
                setTampil(null);
              }}
              className="mt-1 text-[10px] font-medium text-blue-600 hover:underline"
            >
              Hapus pencarian
            </button>
          )}
        </div>
      )}

      {tampil === "filter" && filter && pos && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 224 }}
          className="z-50 rounded-md border border-line bg-white p-2 text-left font-normal normal-case text-ink shadow-lg"
        >
          {jenisTersedia.length > 1 && (
            <button
              type="button"
              onClick={() => setTampil("menu")}
              className="mb-1.5 text-[10px] font-medium text-ink/50 hover:text-ink/80"
            >
              ← Kembali
            </button>
          )}
          <div className="max-h-52 overflow-y-auto">
            {filter.options.length === 0 && <p className="px-1 py-1 text-xs text-ink/50">Tidak ada data.</p>}
            <div className="flex flex-col gap-1">
              {filter.options.map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-blue-50">
                  <input
                    type="checkbox"
                    checked={filterDraft.has(opt)}
                    onChange={() => {
                      setFilterDraft((prev) => {
                        const next = new Set(prev);
                        if (next.has(opt)) next.delete(opt);
                        else next.add(opt);
                        return next;
                      });
                    }}
                    className="h-3.5 w-3.5 shrink-0 accent-blue-600"
                  />
                  <span className="truncate">{opt}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
            <button type="button" onClick={() => setFilterDraft(new Set())} className="text-[10px] text-ink/60 hover:underline">
              Bersihkan
            </button>
            <button
              type="button"
              onClick={() => {
                filter.onApply(filterDraft);
                setTampil(null);
              }}
              className="ml-auto rounded bg-blue-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-600"
            >
              Terapkan
            </button>
          </div>
        </div>
      )}

      {tampil === "sort" && sort && pos && (
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 224 }}
          className="z-50 rounded-md border border-line bg-white p-1 text-left font-normal normal-case text-ink shadow-lg"
        >
          {jenisTersedia.length > 1 && (
            <button
              type="button"
              onClick={() => setTampil("menu")}
              className="mb-1 block w-full px-2 py-1 text-left text-[10px] font-medium text-ink/50 hover:text-ink/80"
            >
              ← Kembali
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              sort.onAsc();
              setTampil(null);
            }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-blue-50"
          >
            ▲ Urut naik (A-Z)
          </button>
          <button
            type="button"
            onClick={() => {
              sort.onDesc();
              setTampil(null);
            }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-blue-50"
          >
            ▼ Urut turun (Z-A)
          </button>
          {sort.active && (
            <button
              type="button"
              onClick={() => {
                sort.onReset();
                setTampil(null);
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-ink/60 hover:bg-gray-50"
            >
              ✕ Reset urutan
            </button>
          )}
        </div>
      )}
    </th>
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
          <h2 className="font-medium text-blue-950">{title}</h2>
          {subtitle && <p className="text-xs text-ink/60">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="shrink-0 rounded-md border border-blue-700 bg-white px-3 py-1.5 text-sm font-medium text-blue-900 transition hover:bg-blue-50 disabled:opacity-40"
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
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
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
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
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
            className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="mt-2 overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-blue-50 text-blue-600">
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
type BalanceTone = "netral" | "seimbang" | "perhatian" | "kelebihan" | "rendah";
type BalanceInfo = { label: string; cls: string; barCls: string; dotCls: string; tone: BalanceTone };

// 4 tingkat (bukan 2) supaya ada jenjang peringatan sebelum "kelebihan":
// dlm rentang +-15% dari rata-rata = Seimbang, 15%-35% lebih tinggi =
// Perhatian (blm dianggap masalah, tp mulai perlu dilirik), >35% lebih
// tinggi = Kelebihan Beban, di bawah rata-rata >15% = Beban Rendah.
function balanceInfo(skor: number, rata: number): BalanceInfo {
  if (rata <= 0) return { label: "-", cls: "text-ink/50", barCls: "bg-gray-300", dotCls: "bg-gray-300", tone: "netral" };
  const selisih = (skor - rata) / rata;
  if (Math.abs(selisih) <= 0.15) {
    return { label: "Seimbang", cls: "text-moss-700", barCls: "bg-moss-500", dotCls: "bg-moss-500", tone: "seimbang" };
  }
  if (selisih > 0.15 && selisih <= 0.35) {
    return {
      label: "Perhatian",
      cls: "text-amber-700",
      barCls: "bg-amber-500",
      dotCls: "bg-amber-500",
      tone: "perhatian",
    };
  }
  if (selisih > 0.35) {
    return {
      label: "Kelebihan Beban",
      cls: "text-rust-700",
      barCls: "bg-rust-500",
      dotCls: "bg-rust-500",
      tone: "kelebihan",
    };
  }
  return { label: "Beban Rendah", cls: "text-violet-600", barCls: "bg-violet-400", dotCls: "bg-violet-400", tone: "rendah" };
}

const LEGENDA_STATUS_BEBAN: { tone: BalanceTone; label: string; keterangan: string }[] = [
  { tone: "seimbang", label: "Seimbang", keterangan: "dlm rentang ±15% dari rata-rata" },
  { tone: "perhatian", label: "Perhatian", keterangan: "15%-35% di atas rata-rata" },
  { tone: "kelebihan", label: "Kelebihan Beban", keterangan: ">35% di atas rata-rata" },
  { tone: "rendah", label: "Beban Rendah", keterangan: ">15% di bawah rata-rata" },
];

function LegendaStatusBeban({ withBelum = false }: { withBelum?: boolean }) {
  const items = LEGENDA_STATUS_BEBAN;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink/60">
      {items.map((it) => (
        <span key={it.tone} className="flex items-center gap-1" title={it.keterangan}>
          <span
            className={`h-2 w-2 rounded-full ${
              it.tone === "seimbang"
                ? "bg-moss-500"
                : it.tone === "perhatian"
                ? "bg-amber-500"
                : it.tone === "kelebihan"
                ? "bg-rust-500"
                : "bg-violet-400"
            }`}
          />
          {it.label}
        </span>
      ))}
      {withBelum && (
        <span className="flex items-center gap-1" title="Belum ada petugas yg diplot">
          <span className="h-2 w-2 rounded-full bg-gray-300" />
          Belum diplot
        </span>
      )}
    </div>
  );
}

const ALOKASI_PAGE_SIZE = 25;
const SAMPEL_PAGE_SIZE = 25;
const BEBAN_PAGE_SIZE = 25;
const BOBOT_KK_TERDAMPAK = 1;
const BOBOT_KK_TIDAK_TERDAMPAK = 0.12428;

// Kapasitas 1 PML membawahi PPL: idealnya 3-4 orang, MAKSIMAL 4 (dijaga --
// opsi PML yg sudah penuh dinonaktifkan di dropdown), kalau masih di bawah
// 3 cuma diberi WARNING (bukan diblokir, krn di awal alokasi wajar dulu
// PML baru punya 1-2 PPL sebelum trial-error selesai).
const KAPASITAS_MAX_PPL_PER_PML = 4;
const KAPASITAS_IDEAL_MIN_PPL_PER_PML = 3;

// Dropdown nama petugas (PPL/PML/Korwil) bisa berjumlah ratusan orang --
// <select> bawaan browser tidak bisa diketik utk mencari. Combobox ini:
// input teks yg bisa diketik utk memfilter + daftar pilihan yg discroll,
// klik di luar utk menutup, opsi bisa dinonaktifkan (mis. PML yg sudah
// penuh 4 PPL) tanpa menyembunyikannya (supaya tetap kelihatan alasannya).
function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  allowClear = true,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  options: { value: number; label: string; disabled?: boolean }[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <input
        type="text"
        disabled={disabled}
        value={open ? query : selected?.label ?? ""}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-ink/40"
      />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 max-h-56 w-full min-w-[12rem] overflow-y-auto rounded-md border border-line bg-white text-xs shadow-lg">
          {allowClear && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(null);
                setOpen(false);
                setQuery("");
              }}
              className="block w-full px-2 py-1.5 text-left text-ink/40 hover:bg-blue-50"
            >
              {placeholder}
            </button>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={o.disabled}
              onMouseDown={(e) => {
                e.preventDefault();
                if (o.disabled) return;
                onChange(o.value);
                setOpen(false);
                setQuery("");
              }}
              className={`block w-full px-2 py-1.5 text-left ${
                o.disabled
                  ? "cursor-not-allowed text-ink/30"
                  : o.value === value
                  ? "bg-blue-50 font-medium text-blue-900 hover:bg-blue-100"
                  : "text-ink hover:bg-blue-50"
              }`}
            >
              {o.label}
            </button>
          ))}
          {filtered.length === 0 && <div className="px-2 py-1.5 text-ink/40">Tidak ditemukan.</div>}
        </div>
      )}
    </div>
  );
}

const PENGATURAN_BEBAN_DEFAULT: Record<string, number> = {
  bobot_kk_terdampak: 1,
  bobot_kk_tidak_terdampak: 0.1428,
  pembagi_jarak_km: 5,
  menit_per_kk_tidak_terdampak: 3,
  menit_per_kk_terdampak: 20,
  jam_kerja_per_hari: 5,
};

function PengaturanBebanSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<PengaturanBebanRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [simpanBusy, setSimpanBusy] = useState(false);
  const [simpanError, setSimpanError] = useState<string | null>(null);
  const [simpanSukses, setSimpanSukses] = useState(false);

  async function muat() {
    setLoadError(null);
    try {
      const res = await fetch("/api/bencana/pengaturan-beban");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat pengaturan beban.");
      const data: PengaturanBebanRow[] = json.data ?? [];
      setRows(data);
      setDraft((prev) => {
        // Jangan timpa draft yg sedang diketik user kalau ini refetch setelah simpan.
        const next: Record<string, string> = {};
        for (const r of data) {
          next[r.kunci] = prev[r.kunci] !== undefined ? prev[r.kunci] : String(r.nilai);
        }
        return next;
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat pengaturan beban.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function nilaiAsli(kunci: string): number {
    const r = rows.find((x) => x.kunci === kunci);
    return r ? r.nilai : PENGATURAN_BEBAN_DEFAULT[kunci] ?? 0;
  }

  function draftNum(kunci: string): number {
    const v = Number(draft[kunci]);
    return Number.isFinite(v) ? v : nilaiAsli(kunci);
  }

  const adaPerubahan = rows.some((r) => draft[r.kunci] !== undefined && draft[r.kunci] !== String(r.nilai));

  function batalkanPerubahan() {
    const next: Record<string, string> = {};
    for (const r of rows) next[r.kunci] = String(r.nilai);
    setDraft(next);
    setSimpanError(null);
    setSimpanSukses(false);
  }

  async function simpanPerubahan() {
    setSimpanBusy(true);
    setSimpanError(null);
    setSimpanSukses(false);
    try {
      const berubah = rows.filter((r) => draft[r.kunci] !== undefined && draft[r.kunci] !== String(r.nilai));
      for (const r of berubah) {
        const nilai = Number(draft[r.kunci]);
        if (!Number.isFinite(nilai) || nilai <= 0) {
          throw new Error(`Nilai "${r.label}" harus berupa angka lebih besar dari 0.`);
        }
        const res = await fetch("/api/bencana/pengaturan-beban", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kunci: r.kunci, nilai }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Gagal menyimpan "${r.label}".`);
      }
      await muat();
      setSimpanSukses(true);
    } catch (e) {
      setSimpanError(e instanceof Error ? e.message : "Gagal menyimpan pengaturan.");
    } finally {
      setSimpanBusy(false);
    }
  }

  // Simulasi contoh perhitungan pakai nilai draft (belum tentu tersimpan)
  // supaya admin bisa lihat dampaknya SEBELUM menekan "Simpan Perubahan".
  const contohKkTerdampak = 5;
  const contohKkTidakTerdampak = 145;
  const contohJarakKm = 12;
  const bobotTerdampak = draftNum("bobot_kk_terdampak");
  const bobotTidakTerdampak = draftNum("bobot_kk_tidak_terdampak");
  const pembagiJarak = draftNum("pembagi_jarak_km") || 1;
  const menitTerdampak = draftNum("menit_per_kk_terdampak");
  const menitTidakTerdampak = draftNum("menit_per_kk_tidak_terdampak");
  const jamKerja = draftNum("jam_kerja_per_hari") || 1;
  const contohSkorBebanPendataan =
    contohKkTerdampak * bobotTerdampak + contohKkTidakTerdampak * bobotTidakTerdampak;
  const contohMenitDibutuhkan = contohKkTerdampak * menitTerdampak + contohKkTidakTerdampak * menitTidakTerdampak;
  const contohHariKerja = Math.max(1, Math.ceil(contohMenitDibutuhkan / (jamKerja * 60)));
  const contohSkorJarak = (contohJarakKm / pembagiJarak) * contohHariKerja;
  const contohSkorBebanAkhir = contohSkorBebanPendataan + contohSkorJarak;

  if (loading) {
    return <p className="mt-6 text-sm text-ink/60">Memuat pengaturan beban...</p>;
  }
  if (loadError) {
    return <p className="mt-6 rounded-md bg-rust-100 px-4 py-3 text-sm text-rust-700">{loadError}</p>;
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="rounded-md border border-blue-100 bg-white p-4">
        <h2 className="font-medium text-blue-950">Kelola Perkiraan Beban Tugas</h2>
        <p className="mt-1 text-sm text-ink/70">
          Bobot &amp; parameter di bawah ini menentukan perhitungan{" "}
          <strong>skor beban pendataan</strong>, <strong>skor jarak</strong>, dan{" "}
          <strong>skor beban akhir</strong> di seluruh tab Alokasi Petugas (Langkah 1-4,
          Ringkasan, dan Kebutuhan Petugas per Kecamatan). Perubahan di sini{" "}
          <strong>langsung berdampak</strong> pada semua perhitungan tersebut begitu
          disimpan.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          {rows.map((r) => (
            <div key={r.kunci} className="rounded-md border border-line bg-gray-50/60 p-3">
              <label className="text-sm font-medium text-ink">{r.label}</label>
              {r.keterangan && <p className="mt-0.5 text-xs text-ink/60">{r.keterangan}</p>}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={draft[r.kunci] ?? String(r.nilai)}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [r.kunci]: e.target.value }))}
                  className="w-32 rounded-md border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
                {draft[r.kunci] !== undefined && draft[r.kunci] !== String(r.nilai) && (
                  <span className="text-xs text-orange-600">
                    belum disimpan (semula {r.nilai})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={!adaPerubahan || simpanBusy}
            onClick={batalkanPerubahan}
            className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:bg-gray-50 disabled:opacity-40"
          >
            ↺ Batalkan Perubahan
          </button>
          <button
            type="button"
            disabled={!adaPerubahan || simpanBusy}
            onClick={simpanPerubahan}
            className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
          >
            {simpanBusy ? "Menyimpan..." : "💾 Simpan Perubahan"}
          </button>
          {simpanSukses && !adaPerubahan && (
            <span className="text-xs font-medium text-moss-700">
              ✓ Tersimpan. Perhitungan beban di tab Alokasi Petugas sudah memakai nilai baru.
            </span>
          )}
        </div>
        {simpanError && (
          <p className="mt-2 rounded-md bg-rust-100 px-3 py-2 text-xs text-rust-700">{simpanError}</p>
        )}
      </section>

      <section className="rounded-md border border-line bg-white p-4">
        <h3 className="font-medium text-blue-950">Simulasi Contoh Perhitungan</h3>
        <p className="mt-1 text-xs text-ink/60">
          Pratinjau memakai nilai di atas (termasuk yang belum disimpan), supaya Bapak/Ibu
          bisa cek dampaknya dulu sebelum menyimpan.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-gray-50/60 p-3 text-xs text-ink/70">
            <p className="font-medium text-ink">Contoh Sub SLS</p>
            <p className="mt-1">{contohKkTerdampak} KK terdampak, {contohKkTidakTerdampak} KK tidak terdampak, jarak {contohJarakKm} km</p>
            <p className="mt-2">
              Skor beban pendataan = {contohKkTerdampak} × {bobotTerdampak} + {contohKkTidakTerdampak} × {bobotTidakTerdampak}
              {" = "}
              <strong className="text-blue-900">{contohSkorBebanPendataan.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</strong>
            </p>
            <p className="mt-1">
              Menit dibutuhkan = {contohKkTerdampak} × {menitTerdampak} + {contohKkTidakTerdampak} × {menitTidakTerdampak}
              {" = "}
              <strong className="text-blue-900">{contohMenitDibutuhkan.toLocaleString("id-ID")}</strong> menit
            </p>
            <p className="mt-1">
              Jumlah hari kerja = CEIL({contohMenitDibutuhkan} ÷ ({jamKerja} × 60))
              {" = "}
              <strong className="text-blue-900">{contohHariKerja}</strong> hari (PP {contohHariKerja}×)
            </p>
            <p className="mt-1">
              Skor jarak = ({contohJarakKm} ÷ {pembagiJarak}) × {contohHariKerja}
              {" = "}
              <strong className="text-blue-900">{contohSkorJarak.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</strong>
            </p>
            <p className="mt-1">
              Skor beban akhir ={" "}
              <strong className="text-blue-900">{contohSkorBebanAkhir.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</strong>
            </p>
          </div>
          <div className="rounded-md border border-line bg-gray-50/60 p-3 text-xs text-ink/70">
            <p className="font-medium text-ink">Rumus yang dipakai sistem</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              <li>
                Skor beban pendataan = (KK terdampak × <em>Bobot Keluarga Terdampak</em>) +
                (KK tidak terdampak × <em>Bobot Keluarga Tidak Terdampak</em>)
              </li>
              <li>
                Jumlah hari kerja = CEIL((KK terdampak × <em>Menit per KK Terdampak</em> + KK
                tidak terdampak × <em>Menit per KK Tidak Terdampak</em>) ÷ (<em>Jam Kerja
                Efektif per Hari</em> × 60)), minimal 1 hari
              </li>
              <li>
                Skor jarak = (jarak tempuh (km) ÷ <em>Pembagi Jarak (km)</em>) × jumlah hari
                kerja &mdash; petugas PP tiap hari kerja (tidak menginap), jadi kalau volume KK
                butuh &gt;1 hari, PP-nya ikut dihitung &gt;1×
              </li>
              <li>Skor beban akhir = skor beban pendataan + skor jarak</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------------
// Tab "Master Petugas": daftar identitas + demografi semua petugas (organik
// & mitra), read-only, dengan berbagai filter per kolom (pola ThKontrol yg
// sama dgn tab Alokasi Petugas).
//
// Domisili (kecamatan/nagari/jorong) diutamakan dari HASIL JOIN koordinat
// (kecamatan_wilayah/nagari_wilayah/alamat_jorong, via idsubsls_1303 hasil
// matching rekrutmen mitra -> bencana_wilayah) -- "usahakan matching dengan
// koordinat" sesuai permintaan. Kalau tidak ada Sub SLS yg cocok, fallback
// ke alamat self-report (alamat_kecamatan/alamat_nagari); jorong tidak
// punya data self-report jadi tampil "Tidak ada data" kalau tidak ke-join.
// ------------------------------------------------------------------------

type MasterPetugasRow = {
  id: number;
  nama: string;
  status_kepegawaian: string;
  peran: string | null;
  aktif: boolean;
  no_hp: string | null;
  alamat_kecamatan: string | null;
  alamat_nagari: string | null;
  kecamatan_wilayah: string | null;
  nagari_wilayah: string | null;
  alamat_jorong: string | null;
  idsubsls_1303: string | null;
  lokasi_status: string | null;
  umur: number | null;
  jenis_kelamin: string | null;
  pendidikan: string | null;
  pekerjaan: string | null;
  bisa_mengendarai_motor: boolean | null;
  punya_kendaraan_bermotor: boolean | null;
  pendaftaran_bencana_konfirmasi: boolean;
};

function kecamatanTampil(r: MasterPetugasRow): string {
  return r.kecamatan_wilayah || r.alamat_kecamatan || "Tidak ada data";
}
function nagariTampil(r: MasterPetugasRow): string {
  return r.nagari_wilayah || r.alamat_nagari || "Tidak ada data";
}
function jorongTampil(r: MasterPetugasRow): string {
  return r.alamat_jorong || "Tidak ada data";
}
function boolTampil(v: boolean | null): string {
  return v === true ? "Ya" : v === false ? "Tidak" : "Tidak ada data";
}

function MasterPetugasSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<MasterPetugasRow[]>([]);

  const [search, setSearch] = useState("");
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set());
  const [peranSel, setPeranSel] = useState<Set<string>>(new Set());
  const [aktifSel, setAktifSel] = useState<Set<string>>(new Set());
  const [kecamatanSel, setKecamatanSel] = useState<Set<string>>(new Set());
  const [nagariSel, setNagariSel] = useState<Set<string>>(new Set());
  const [jorongSel, setJorongSel] = useState<Set<string>>(new Set());
  const [jkSel, setJkSel] = useState<Set<string>>(new Set());
  const [pendidikanSel, setPendidikanSel] = useState<Set<string>>(new Set());
  const [pekerjaanSel, setPekerjaanSel] = useState<Set<string>>(new Set());
  const [motorSel, setMotorSel] = useState<Set<string>>(new Set());
  const [pendaftaranSel, setPendaftaranSel] = useState<Set<string>>(new Set());

  const [sortKey, setSortKey] = useState<"nama" | "umur" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    (async () => {
      setLoadError(null);
      try {
        const res = await fetch("/api/bencana/master-petugas");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memuat data master petugas.");
        setRows(json.data ?? []);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Gagal memuat data master petugas.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function opsiUnik(nilai: (r: MasterPetugasRow) => string): string[] {
    return Array.from(new Set(rows.map(nilai))).sort((a, b) => a.localeCompare(b, "id"));
  }

  const opsiStatus = opsiUnik((r) => (r.status_kepegawaian === "organik" ? "Organik" : "Mitra"));
  const opsiPeran = opsiUnik((r) => (r.peran ? r.peran.toUpperCase() : "Belum Ada Peran"));
  const opsiAktif = ["Aktif", "Nonaktif"];
  const opsiKecamatan = opsiUnik(kecamatanTampil);
  const opsiNagari = opsiUnik(nagariTampil);
  const opsiJorong = opsiUnik(jorongTampil);
  const opsiJk = opsiUnik((r) => (r.jenis_kelamin === "Lk" ? "Laki-laki" : r.jenis_kelamin === "Pr" ? "Perempuan" : "Tidak ada data"));
  const opsiPendidikan = opsiUnik((r) => r.pendidikan || "Tidak ada data");
  const opsiPekerjaan = opsiUnik((r) => r.pekerjaan || "Tidak ada data");
  const opsiMotor = ["Ya", "Tidak", "Tidak ada data"];
  const opsiPendaftaran = ["Sudah Mendaftar", "Belum Mendaftar"];

  function sortAsc(key: "nama" | "umur") {
    setSortKey(key);
    setSortDir("asc");
  }
  function sortDesc(key: "nama" | "umur") {
    setSortKey(key);
    setSortDir("desc");
  }
  function sortReset() {
    setSortKey(null);
  }

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    let hasil = rows.filter((r) => {
      if (kw && !r.nama.toLowerCase().includes(kw)) return false;
      if (statusSel.size > 0 && !statusSel.has(r.status_kepegawaian === "organik" ? "Organik" : "Mitra")) return false;
      if (peranSel.size > 0 && !peranSel.has(r.peran ? r.peran.toUpperCase() : "Belum Ada Peran")) return false;
      if (aktifSel.size > 0 && !aktifSel.has(r.aktif ? "Aktif" : "Nonaktif")) return false;
      if (kecamatanSel.size > 0 && !kecamatanSel.has(kecamatanTampil(r))) return false;
      if (nagariSel.size > 0 && !nagariSel.has(nagariTampil(r))) return false;
      if (jorongSel.size > 0 && !jorongSel.has(jorongTampil(r))) return false;
      if (
        jkSel.size > 0 &&
        !jkSel.has(r.jenis_kelamin === "Lk" ? "Laki-laki" : r.jenis_kelamin === "Pr" ? "Perempuan" : "Tidak ada data")
      )
        return false;
      if (pendidikanSel.size > 0 && !pendidikanSel.has(r.pendidikan || "Tidak ada data")) return false;
      if (pekerjaanSel.size > 0 && !pekerjaanSel.has(r.pekerjaan || "Tidak ada data")) return false;
      if (motorSel.size > 0 && !motorSel.has(boolTampil(r.bisa_mengendarai_motor))) return false;
      if (
        pendaftaranSel.size > 0 &&
        !pendaftaranSel.has(r.pendaftaran_bencana_konfirmasi ? "Sudah Mendaftar" : "Belum Mendaftar")
      )
        return false;
      return true;
    });

    if (sortKey) {
      hasil = [...hasil].sort((a, b) => {
        let cmp = 0;
        if (sortKey === "nama") cmp = a.nama.localeCompare(b.nama, "id");
        else if (sortKey === "umur") cmp = (a.umur ?? -1) - (b.umur ?? -1);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return hasil;
  }, [
    rows,
    search,
    statusSel,
    peranSel,
    aktifSel,
    kecamatanSel,
    nagariSel,
    jorongSel,
    jkSel,
    pendidikanSel,
    pekerjaanSel,
    motorSel,
    pendaftaranSel,
    sortKey,
    sortDir,
  ]);

  function handleExport() {
    const dataRows = filtered.map((r) => ({
      Nama: r.nama,
      "Status Kepegawaian": r.status_kepegawaian === "organik" ? "Organik" : "Mitra",
      Peran: r.peran ? r.peran.toUpperCase() : "",
      Aktif: r.aktif ? "Aktif" : "Nonaktif",
      Kecamatan: kecamatanTampil(r),
      Nagari: nagariTampil(r),
      Jorong: jorongTampil(r),
      Umur: r.umur ?? "",
      "Jenis Kelamin": r.jenis_kelamin === "Lk" ? "Laki-laki" : r.jenis_kelamin === "Pr" ? "Perempuan" : "",
      Pendidikan: r.pendidikan ?? "",
      Pekerjaan: r.pekerjaan ?? "",
      "Bisa Mengendarai Motor": boolTampil(r.bisa_mengendarai_motor),
      "Punya Kendaraan Bermotor": boolTampil(r.punya_kendaraan_bermotor),
      "Status Pendaftaran Bencana": r.pendaftaran_bencana_konfirmasi ? "Sudah Mendaftar" : "Belum Mendaftar",
      "No HP": r.no_hp ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(dataRows);
    ws["!cols"] = [
      { wch: 26 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master Petugas");
    XLSX.writeFile(wb, "master_petugas.xlsx");
  }

  if (loading) {
    return <p className="mt-6 text-ink/60">Memuat data master petugas...</p>;
  }
  if (loadError) {
    return <p className="mt-6 rounded-md bg-rust-100 px-4 py-3 text-rust-700">{loadError}</p>;
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <section className="rounded-md border border-line bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-blue-400">Master Petugas</p>
        <p className="mt-1 text-sm text-ink/70">
          Daftar identitas &amp; demografi seluruh petugas (organik &amp; mitra). Kolom Kecamatan/Nagari/Jorong
          diutamakan dari hasil pencocokan (matching) koordinat domisili petugas ke wilayah Sub SLS; kalau tidak ada
          Sub SLS yang cocok, kecamatan/nagari memakai data isian awal (self-report) dan Jorong tampil
          &ldquo;Tidak ada data&rdquo;. Data umur, jenis kelamin, pendidikan, pekerjaan, dan kendaraan bermotor
          berasal dari data rekrutmen mitra sehingga untuk petugas organik (BPS) kolom tersebut kosong.
        </p>
        <p className="mt-2 text-xs text-ink/50">
          Menampilkan {filtered.length} dari {rows.length} petugas.
        </p>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/70 hover:bg-blue-50"
        >
          ⬇ Unduh Excel
        </button>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-md border border-line">
        <table className="w-full min-w-[1500px] text-left text-sm">
          <thead className="sticky top-0 z-20 bg-blue-50 text-blue-600">
            <tr>
              <ThKontrol
                label="Nama"
                stickyLeft
                search={{ value: search, onChange: setSearch, placeholder: "Cari nama..." }}
                sort={{
                  active: sortKey === "nama",
                  dir: sortDir,
                  onAsc: () => sortAsc("nama"),
                  onDesc: () => sortDesc("nama"),
                  onReset: sortReset,
                }}
              />
              <th className="px-3 py-2 font-medium">No HP</th>
              <ThKontrol
                label="Status"
                filter={{ options: opsiStatus, selected: statusSel, onApply: setStatusSel }}
              />
              <ThKontrol label="Peran" filter={{ options: opsiPeran, selected: peranSel, onApply: setPeranSel }} />
              <ThKontrol label="Aktif" filter={{ options: opsiAktif, selected: aktifSel, onApply: setAktifSel }} />
              <ThKontrol
                label="Kecamatan"
                filter={{ options: opsiKecamatan, selected: kecamatanSel, onApply: setKecamatanSel }}
              />
              <ThKontrol label="Nagari" filter={{ options: opsiNagari, selected: nagariSel, onApply: setNagariSel }} />
              <ThKontrol label="Jorong" filter={{ options: opsiJorong, selected: jorongSel, onApply: setJorongSel }} />
              <ThKontrol
                label="Umur"
                sort={{
                  active: sortKey === "umur",
                  dir: sortDir,
                  onAsc: () => sortAsc("umur"),
                  onDesc: () => sortDesc("umur"),
                  onReset: sortReset,
                }}
              />
              <ThKontrol label="Jenis Kelamin" filter={{ options: opsiJk, selected: jkSel, onApply: setJkSel }} />
              <ThKontrol
                label="Pendidikan"
                filter={{ options: opsiPendidikan, selected: pendidikanSel, onApply: setPendidikanSel }}
              />
              <ThKontrol
                label="Pekerjaan"
                filter={{ options: opsiPekerjaan, selected: pekerjaanSel, onApply: setPekerjaanSel }}
              />
              <ThKontrol
                label="Bisa Motor"
                filter={{ options: opsiMotor, selected: motorSel, onApply: setMotorSel }}
              />
              <ThKontrol
                label="Status Pendaftaran"
                filter={{ options: opsiPendaftaran, selected: pendaftaranSel, onApply: setPendaftaranSel }}
              />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-line hover:bg-blue-50/40">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium">{r.nama}</td>
                <td className="px-3 py-2 text-ink/80">{r.no_hp || "—"}</td>
                <td className="px-3 py-2">{r.status_kepegawaian === "organik" ? "Organik" : "Mitra"}</td>
                <td className="px-3 py-2">{r.peran ? r.peran.toUpperCase() : "—"}</td>
                <td className="px-3 py-2">{r.aktif ? "Aktif" : "Nonaktif"}</td>
                <td className="px-3 py-2">{kecamatanTampil(r)}</td>
                <td className="px-3 py-2">{nagariTampil(r)}</td>
                <td className="px-3 py-2">{jorongTampil(r)}</td>
                <td className="px-3 py-2">{r.umur ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.jenis_kelamin === "Lk" ? "Laki-laki" : r.jenis_kelamin === "Pr" ? "Perempuan" : "—"}
                </td>
                <td className="px-3 py-2">{r.pendidikan ?? "—"}</td>
                <td className="px-3 py-2">{r.pekerjaan ?? "—"}</td>
                <td className="px-3 py-2">{boolTampil(r.bisa_mengendarai_motor)}</td>
                <td className="px-3 py-2">
                  {r.pendaftaran_bencana_konfirmasi ? (
                    <span className="rounded-full bg-moss-100 px-2 py-0.5 text-xs font-medium text-moss-700">
                      Sudah Mendaftar
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-ink/50">
                      Belum Mendaftar
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-6 text-center text-ink/50">
                  Tidak ada petugas yang cocok dengan filter saat ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Ikon outline putih sederhana utk sidebar "rel langkah" -- SATU warna
// (currentColor/putih) saja, tidak berwarna-warni, supaya konsisten dipakai
// di atas lingkaran biru (aktif) maupun abu-abu (tidak aktif).
function IkonLangkah1() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 15l9-3.5 9 3.5 9-3.5v21l-9 3.5-9-3.5-9 3.5V15z" />
      <path d="M14 11.5v21M23 15v21" />
      <path d="M33 7c4.6 0 8.4 3.6 8.4 8.2 0 6.3-8.4 14.8-8.4 14.8s-8.4-8.5-8.4-14.8C24.6 10.6 28.4 7 33 7z" />
      <circle cx="33" cy="15.4" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IkonLangkah2() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5h15l8 8v27a2 2 0 01-2 2H11a2 2 0 01-2-2V7a2 2 0 012-2z" />
      <path d="M26 5v8h8" />
      <path d="M14 29v-6M19 29v-10.5M24 29v-4.5" />
      <circle cx="34.5" cy="34.5" r="6.6" strokeDasharray="2 2.6" />
      <circle cx="34.5" cy="34.5" r="2.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IkonLangkah3() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="17" cy="13" r="4" />
      <path d="M8 27c0-5.2 4-8.6 9-8.6s9 3.4 9 8.6" />
      <circle cx="33" cy="10.5" r="3.1" />
      <path d="M27.5 19.5c0-3.4 2.5-5.6 5.5-5.6s5.5 2.2 5.5 5.6" />
      <path d="M5 33.5c0-4.4 4.6-7.5 10-7.5s10 3.1 10 7.5v3.5H5v-3.5z" />
      <circle cx="37.5" cy="30" r="6.2" strokeDasharray="1.9 2.3" />
      <circle cx="37.5" cy="30" r="2.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IkonLangkah4() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5h16l8 8v25a2 2 0 01-2 2H9a2 2 0 01-2-2V7a2 2 0 012-2z" />
      <path d="M25 5v8h8" />
      <path d="M12.5 22.5h13M12.5 27.5h13M12.5 32.5h8.5" />
      <path d="M38.5 21.5l4 4-13 13-4.7 1 1-4.8z" />
    </svg>
  );
}

const LANGKAH_SIDEBAR: { n: 1 | 2 | 3 | 4; label: string; ikon: () => JSX.Element }[] = [
  { n: 1, label: "Pilih Wilayah Sampel", ikon: IkonLangkah1 },
  { n: 2, label: "Kebutuhan Petugas per Kecamatan", ikon: IkonLangkah2 },
  { n: 3, label: "Susunan Tim (Korwil, PML, PPL)", ikon: IkonLangkah3 },
  { n: 4, label: "Kertas Kerja Plotting Sub SLS ke PPL", ikon: IkonLangkah4 },
];

// Sidebar "rel langkah" -- 4 lingkaran bernomor tersambung garis putus-putus,
// mencerminkan alur kerja Langkah 1-4. Diklik utk scroll halus ke section
// terkait; lingkaran yg sedang kelihatan di layar otomatis ditandai aktif
// (lihat IntersectionObserver di AlokasiPetugasSection). Disembunyikan di
// layar sempit (<lg) supaya tidak mendesak tabel yg sudah lebar.
function SidebarLangkah({ aktif, onPilih }: { aktif: 1 | 2 | 3 | 4; onPilih: (n: 1 | 2 | 3 | 4) => void }) {
  return (
    <aside className="hidden shrink-0 lg:block lg:w-36">
      <div className="sticky top-6 flex flex-col items-center pt-1">
        {LANGKAH_SIDEBAR.map((l, i) => {
          const Ikon = l.ikon;
          const isAktif = aktif === l.n;
          return (
            <div key={l.n} className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => onPilih(l.n)}
                title={`Langkah ${l.n} — ${l.label}`}
                className="group relative flex flex-col items-center"
              >
                <span
                  className={`absolute -top-2 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white ${
                    isAktif ? "bg-blue-800" : "bg-blue-300"
                  }`}
                >
                  {l.n}
                </span>
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
                    isAktif
                      ? "bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-md shadow-blue-300/60"
                      : "bg-blue-300 text-white group-hover:bg-blue-400"
                  }`}
                >
                  <span className="h-7 w-7">
                    <Ikon />
                  </span>
                </span>
              </button>
              <p
                className={`mt-2 max-w-[8rem] text-center text-[11px] font-semibold leading-tight ${
                  isAktif ? "text-blue-950" : "text-blue-300"
                }`}
              >
                {l.label}
              </p>
              {i < LANGKAH_SIDEBAR.length - 1 && <div className="my-2.5 h-5 border-l-2 border-dotted border-blue-200" />}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function AlokasiPetugasSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bebanRows, setBebanRows] = useState<KertasKerjaBebanRow[]>([]);
  const [calonSampel, setCalonSampel] = useState<CalonSampelRow[]>([]);
  const [kertasKerja, setKertasKerja] = useState<KertasKerjaRow[]>([]);
  const [ringkasanPpl, setRingkasanPpl] = useState<RingkasanPplRow[]>([]);
  const [ringkasanPml, setRingkasanPml] = useState<RingkasanPmlRow[]>([]);
  const [ringkasanKorwil, setRingkasanKorwil] = useState<RingkasanKorwilRow[]>([]);
  const [kebutuhan, setKebutuhan] = useState<KebutuhanRow[]>([]);
  const [petugasList, setPetugasList] = useState<PetugasRingkas[]>([]);
  const [hariKerjaInput, setHariKerjaInput] = useState(24);
  const [detailKebutuhanTerbuka, setDetailKebutuhanTerbuka] = useState<Set<string>>(new Set());
  const [optimasiTerbuka, setOptimasiTerbuka] = useState(false);
  function toggleDetailKebutuhan(kecamatan: string) {
    setDetailKebutuhanTerbuka((prev) => {
      const next = new Set(prev);
      if (next.has(kecamatan)) next.delete(kecamatan);
      else next.add(kecamatan);
      return next;
    });
  }
  const [hariKerjaDipakai, setHariKerjaDipakai] = useState(24);

  const [sampelKecFilter, setSampelKecFilter] = useState("");
  const [sampelStatusFilter, setSampelStatusFilter] = useState<"" | "sudah" | "belum">("");
  const [sampelDataFilter, setSampelDataFilter] = useState<"" | "lengkap" | "belum">("");
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
  const [pmlFilterLangkah4, setPmlFilterLangkah4] = useState<number | "">("");
  const [dataFilter, setDataFilter] = useState<"" | "lengkap" | "belum">("");
  const [statusBebanFilter, setStatusBebanFilter] = useState<"" | BalanceTone>("");
  const [statusPlotFilter, setStatusPlotFilter] = useState<"" | "sudah" | "belum">("");
  const [hanyaBerubahFilter, setHanyaBerubahFilter] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [alokasiPageSize, setAlokasiPageSize] = useState<number>(ALOKASI_PAGE_SIZE);
  const [sortKey, setSortKey] = useState<
    "kecamatan" | "skor_beban_pendataan" | "skor_jarak" | "skor_beban_akhir" | "beban_ppl" | null
  >(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [modeFokus, setModeFokus] = useState(false);
  const [diffTerbuka, setDiffTerbuka] = useState(false);

  // Draft plotting Sub SLS->PPL & PPL->PML: TIDAK submit ke server tiap
  // dropdown dipilih (supaya bisa trial-error lihat keseimbangan beban dulu).
  // Baru terkirim ke server sekaligus saat tombol "Simpan Perubahan" ditekan.
  const [draftPpl, setDraftPpl] = useState<Record<string, number | null>>({});
  const [draftPmlByPpl, setDraftPmlByPpl] = useState<Record<number, number | null>>({});
  const [simpanBusy, setSimpanBusy] = useState(false);
  const [simpanError, setSimpanError] = useState<string | null>(null);

  // Draft koreksi Kertas Kerja Beban (KK Total & KK Terdampak per Sub SLS):
  // sama seperti draft plotting -- input lokal dulu, baru dikirim batch
  // saat "Simpan Perubahan" ditekan supaya tidak spam server tiap ketik.
  const [draftKkTotal, setDraftKkTotal] = useState<Record<string, number>>({});
  const [draftKkTerdampak, setDraftKkTerdampak] = useState<Record<string, number>>({});
  const [bebanKecFilter, setBebanKecFilter] = useState("");
  const [bebanSearch, setBebanSearch] = useState("");
  const [bebanSimpanBusy, setBebanSimpanBusy] = useState(false);
  const [bebanError, setBebanError] = useState<string | null>(null);
  const [bebanTerbuka, setBebanTerbuka] = useState(false);

  // Kartu "Mitra Perlu Dihubungi" -- lihat komentar di MitraKontakRow & di
  // app/api/bencana/alokasi/kontak-mitra/route.ts.
  const [kontakRows, setKontakRows] = useState<MitraKontakRow[]>([]);
  const [kontakTerbuka, setKontakTerbuka] = useState(true);
  const [kontakBusyId, setKontakBusyId] = useState<number | null>(null);
  const [kontakError, setKontakError] = useState<string | null>(null);
  // Draft pilihan "Menolak" yg belum disimpan (menunggu catatan diisi) --
  // supaya klik radio Menolak TIDAK langsung submit tanpa alasan.
  const [kontakMenolakDraft, setKontakMenolakDraft] = useState<Record<number, string>>({});

  async function muatBeban() {
    const res = await fetch("/api/bencana/alokasi/beban");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Gagal memuat kertas kerja beban.");
    setBebanRows(json.data ?? []);
  }

  async function muatKontak() {
    const res = await fetch("/api/bencana/alokasi/kontak-mitra");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Gagal memuat daftar mitra perlu dihubungi.");
    setKontakRows(json.data ?? []);
  }

  async function simpanStatusKontak(id: number, status: "diterima" | "menolak" | null, catatan?: string) {
    setKontakBusyId(id);
    setKontakError(null);
    try {
      const res = await fetch("/api/bencana/alokasi/kontak-mitra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petugas_id: id, status, catatan }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan status kontak.");
      setKontakMenolakDraft((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await muatKontak();
    } catch (err) {
      setKontakError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
    } finally {
      setKontakBusyId(null);
    }
  }

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
      await Promise.all([muatBeban(), muatSampel(), muatData(hariKerja), muatKontak()]);
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

  // Sinkronkan draft dengan data server: nilai yang SUDAH ada draft-nya
  // dipertahankan (supaya trial-error yang belum disimpan tidak hilang saat
  // data lain di-refresh, mis. ganti hari kerja), baris/PPL baru diisi dari
  // nilai server sbg titik awal.
  useEffect(() => {
    setDraftPpl((prev) => {
      const next: Record<string, number | null> = {};
      for (const r of kertasKerja) {
        next[r.idsubsls] = Object.prototype.hasOwnProperty.call(prev, r.idsubsls) ? prev[r.idsubsls] : r.ppl_id;
      }
      return next;
    });
    setDraftPmlByPpl((prev) => {
      const next: Record<number, number | null> = { ...prev };
      for (const r of kertasKerja) {
        if (r.ppl_id && !Object.prototype.hasOwnProperty.call(next, r.ppl_id)) {
          next[r.ppl_id] = r.pml_id;
        }
      }
      return next;
    });
  }, [kertasKerja]);

  function batalkanSemuaPerubahan() {
    const nextPpl: Record<string, number | null> = {};
    const nextPml: Record<number, number | null> = {};
    for (const r of kertasKerja) {
      nextPpl[r.idsubsls] = r.ppl_id;
      if (r.ppl_id && !(r.ppl_id in nextPml)) nextPml[r.ppl_id] = r.pml_id;
    }
    setDraftPpl(nextPpl);
    setDraftPmlByPpl(nextPml);
    setSimpanError(null);
  }

  async function handleSimpanPerubahan() {
    setSimpanBusy(true);
    setSimpanError(null);
    try {
      for (const r of kertasKerja) {
        const draftVal = draftPpl[r.idsubsls] ?? null;
        const serverVal = r.ppl_id ?? null;
        if (draftVal === serverVal) continue;
        const res = await fetch("/api/bencana/alokasi/reassign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftVal ? { idsubsls: r.idsubsls, ppl_id: draftVal } : { idsubsls: r.idsubsls, buka_kunci: true }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Gagal menyimpan plot ${r.sub_sls}.`);
      }

      const serverPmlByPpl = new Map<number, number | null>();
      for (const r of kertasKerja) {
        if (r.ppl_id) serverPmlByPpl.set(r.ppl_id, r.pml_id ?? null);
      }
      const pplIdsDipakai = new Set(Object.values(draftPpl).filter((v): v is number => !!v));
      for (const pplId of pplIdsDipakai) {
        const draftVal = draftPmlByPpl[pplId] ?? null;
        const serverVal = serverPmlByPpl.get(pplId) ?? null;
        if (draftVal === serverVal) continue;
        const res = await fetch("/api/bencana/alokasi/susunan-tim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ petugas_id: pplId, peran: "ppl", atasan_id: draftVal }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal menyimpan PML.");
      }

      await muatData(hariKerjaDipakai);
    } catch (err) {
      setSimpanError(err instanceof Error ? err.message : "Gagal menyimpan perubahan.");
      // Tetap refresh supaya perubahan yg sempat berhasil sebelum error
      // tercermin di layar; draft yg belum sempat tersimpan tetap
      // dipertahankan lewat efek sinkronisasi di atas.
      await muatData(hariKerjaDipakai).catch(() => {});
    } finally {
      setSimpanBusy(false);
    }
  }

  // Sinkronkan draft Kertas Kerja Beban dgn data server (pola sama dgn
  // draftPpl di atas): baris yg sedang diedit dipertahankan nilainya.
  useEffect(() => {
    setDraftKkTotal((prev) => {
      const next: Record<string, number> = {};
      for (const r of bebanRows) {
        next[r.idsubsls] = Object.prototype.hasOwnProperty.call(prev, r.idsubsls) ? prev[r.idsubsls] : r.kk_total;
      }
      return next;
    });
    setDraftKkTerdampak((prev) => {
      const next: Record<string, number> = {};
      for (const r of bebanRows) {
        next[r.idsubsls] = Object.prototype.hasOwnProperty.call(prev, r.idsubsls)
          ? prev[r.idsubsls]
          : r.kk_terdampak_estimasi;
      }
      return next;
    });
  }, [bebanRows]);

  function jumlahPerubahanBeban(): number {
    let n = 0;
    for (const r of bebanRows) {
      const total = draftKkTotal[r.idsubsls] ?? r.kk_total;
      const terdampak = draftKkTerdampak[r.idsubsls] ?? r.kk_terdampak_estimasi;
      if (total !== r.kk_total || terdampak !== r.kk_terdampak_estimasi) n++;
    }
    return n;
  }

  function batalkanPerubahanBeban() {
    const nextTotal: Record<string, number> = {};
    const nextTerdampak: Record<string, number> = {};
    for (const r of bebanRows) {
      nextTotal[r.idsubsls] = r.kk_total;
      nextTerdampak[r.idsubsls] = r.kk_terdampak_estimasi;
    }
    setDraftKkTotal(nextTotal);
    setDraftKkTerdampak(nextTerdampak);
    setBebanError(null);
  }

  function resetBarisBeban(idsubsls: string) {
    const r = bebanRows.find((x) => x.idsubsls === idsubsls);
    if (!r) return;
    setDraftKkTotal((prev) => ({ ...prev, [idsubsls]: r.kk_total_asli }));
    setDraftKkTerdampak((prev) => ({ ...prev, [idsubsls]: r.kk_terdampak_asli }));
  }

  async function handleSimpanBeban() {
    setBebanSimpanBusy(true);
    setBebanError(null);
    try {
      for (const r of bebanRows) {
        const draftTotal = draftKkTotal[r.idsubsls] ?? r.kk_total;
        const draftTerdampak = draftKkTerdampak[r.idsubsls] ?? r.kk_terdampak_estimasi;
        if (draftTotal === r.kk_total && draftTerdampak === r.kk_terdampak_estimasi) continue;

        const totalOverride = draftTotal === r.kk_total_asli ? null : draftTotal;
        const terdampakOverride = draftTerdampak === r.kk_terdampak_asli ? null : draftTerdampak;

        const res = await fetch("/api/bencana/alokasi/beban", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idsubsls: r.idsubsls,
            kk_total_override: totalOverride,
            kk_terdampak_override: terdampakOverride,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Gagal menyimpan koreksi ${r.sub_sls}.`);
      }
      // Skor beban pendataan berubah -> refresh semua turunan (calon sampel,
      // kertas kerja alokasi, kebutuhan petugas) supaya konsisten di seluruh
      // tab, bukan cuma kertas kerja beban.
      await Promise.all([muatBeban(), muatSampel(), muatData(hariKerjaDipakai)]);
    } catch (err) {
      setBebanError(err instanceof Error ? err.message : "Gagal menyimpan koreksi data KK.");
      await Promise.all([muatBeban(), muatSampel(), muatData(hariKerjaDipakai)]).catch(() => {});
    } finally {
      setBebanSimpanBusy(false);
    }
  }

  async function handleResetSemuaBeban() {
    if (!window.confirm("Kembalikan SEMUA koreksi KK ke data asli/estimasi? Perubahan manual yang sudah tersimpan akan dihapus.")) {
      return;
    }
    setBebanSimpanBusy(true);
    setBebanError(null);
    try {
      const res = await fetch("/api/bencana/alokasi/beban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_semua: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mereset koreksi data KK.");
      await Promise.all([muatBeban(), muatSampel(), muatData(hariKerjaDipakai)]);
    } catch (err) {
      setBebanError(err instanceof Error ? err.message : "Gagal mereset koreksi data KK.");
    } finally {
      setBebanSimpanBusy(false);
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

  // ---- Turunan: kertas kerja beban ----
  const kecamatanOptionsBeban = useMemo(
    () => Array.from(new Set(bebanRows.map((r) => r.kecamatan))).sort(),
    [bebanRows]
  );
  const filteredBeban = useMemo(() => {
    const q = bebanSearch.trim().toLowerCase();
    return bebanRows.filter((r) => {
      if (bebanKecFilter && r.kecamatan !== bebanKecFilter) return false;
      if (
        q &&
        !r.nagari.toLowerCase().includes(q) &&
        !r.sls.toLowerCase().includes(q) &&
        !r.sub_sls.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [bebanRows, bebanKecFilter, bebanSearch]);
  const bebanTotalPages = Math.max(1, Math.ceil(filteredBeban.length / BEBAN_PAGE_SIZE));
  const [bebanPage, setBebanPageState] = useState(1);
  const bebanPageClamped = Math.min(bebanPage, bebanTotalPages);
  const bebanPaged = filteredBeban.slice((bebanPageClamped - 1) * BEBAN_PAGE_SIZE, bebanPageClamped * BEBAN_PAGE_SIZE);
  function setBebanPage(p: number) {
    setBebanPageState(p);
  }
  const jumlahPerubahanBebanTampil = jumlahPerubahanBeban();
  // Skor beban pendataan dihitung LIVE dari draft (utk umpan balik instan),
  // memakai rumus persis yg sama dgn server (bencana_skor_beban_subsls()).
  function skorLiveBeban(idsubsls: string, kkTotalFallback: number, kkTerdampakFallback: number): number {
    const total = draftKkTotal[idsubsls] ?? kkTotalFallback;
    const terdampak = draftKkTerdampak[idsubsls] ?? kkTerdampakFallback;
    const tidakTerdampak = Math.max(total - terdampak, 0);
    return Math.round((terdampak * BOBOT_KK_TERDAMPAK + tidakTerdampak * BOBOT_KK_TIDAK_TERDAMPAK) * 100) / 100;
  }

  // Semua baris Sub SLS dikelompokkan per Jorong (idsls) -- dipakai popover
  // "🧭 Verifikasi Jorong" utk menampilkan rincian tiap Sub SLS se-Jorong.
  // Dari SELURUH bebanRows (bukan cuma yg tampil di halaman/filter saat ini),
  // supaya perbandingannya selalu lengkap walau tabel sedang difilter.
  const subRowsPerJorong = useMemo(() => {
    const map = new Map<string, KertasKerjaBebanRow[]>();
    for (const r of bebanRows) {
      const arr = map.get(r.idsls) ?? [];
      arr.push(r);
      map.set(r.idsls, arr);
    }
    return map;
  }, [bebanRows]);

  // Total KK terdampak LIVE per Jorong (dijumlah dari draft/nilai terkini tiap
  // Sub SLS-nya) -- dibandingkan dgn verifikasi_total_keluarga (data
  // verifikasi resmi) utk menentukan baris mana yg perlu ditandai merah.
  const totalTerdampakPerJorongLive = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of bebanRows) {
      const nilai = draftKkTerdampak[r.idsubsls] ?? r.kk_terdampak_estimasi;
      map.set(r.idsls, Math.round(((map.get(r.idsls) ?? 0) + nilai) * 100) / 100);
    }
    return map;
  }, [bebanRows, draftKkTerdampak]);

  // Jumlah baris Sub SLS yg Jorong-nya selisih >15 KK dari data verifikasi --
  // dipakai badge & legenda di atas tabel Kertas Kerja Beban.
  const jumlahBarisBedaVerifikasi = useMemo(() => {
    let n = 0;
    for (const r of bebanRows) {
      if (r.verifikasi_total_keluarga == null) continue;
      const totalJorong = totalTerdampakPerJorongLive.get(r.idsls) ?? 0;
      if (Math.abs(totalJorong - r.verifikasi_total_keluarga) > AMBANG_SELISIH_VERIFIKASI_JORONG) n++;
    }
    return n;
  }, [bebanRows, totalTerdampakPerJorongLive]);

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
      if (sampelDataFilter === "lengkap" && !r.punya_data_kk) return false;
      if (sampelDataFilter === "belum" && r.punya_data_kk) return false;
      if (
        q &&
        !r.nagari.toLowerCase().includes(q) &&
        !r.sls.toLowerCase().includes(q) &&
        !r.sub_sls.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [calonSampel, sampelKecFilter, sampelStatusFilter, sampelDataFilter, sampelSearch]);
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

  // Label dropdown PPL: HANYA nama + petunjuk kedekatan wilayah (jumlah Sub
  // SLS yg SUDAH dia pegang di draft saat ini pada kecamatan/nagari yg
  // sama) -- TANPA angka beban di dalam label. Beban ditampilkan di kolom
  // "Beban Petugas" tersendiri, dihitung ulang real-time dari draftPpl.
  function infoPplUntukBaris(p: PetugasRingkas, row: KertasKerjaRow): string {
    const diKec = kertasKerja.filter((k) => draftPpl[k.idsubsls] === p.id && k.kecamatan === row.kecamatan).length;
    const diNagari = kertasKerja.filter((k) => draftPpl[k.idsubsls] === p.id && k.nagari === row.nagari).length;
    if (diNagari > 0) return `${p.nama} — ${diNagari} Sub SLS di nagari ini`;
    if (diKec > 0) return `${p.nama} — ${diKec} Sub SLS di kecamatan ini`;
    return p.nama;
  }

  // Total skor beban pendataan (tanpa jarak) utk SELURUH wilayah sampel yang
  // sedang tampil (kertasKerja sudah terbatas ke Sub SLS sampel terkonfirmasi
  // di Langkah 1) -- bergerak sesuai jumlah wilayah sampel yang dicentang.
  const totalSkorWilayahTugas = useMemo(
    () => kertasKerja.reduce((s, r) => s + r.skor_beban_pendataan, 0),
    [kertasKerja]
  );
  const TOTAL_PPL_TETAP = 133;
  const rataBebanTetap = totalSkorWilayahTugas / TOTAL_PPL_TETAP;

  // Beban draft per PPL (skor beban pendataan, TANPA jarak -- jarak riil
  // baru dihitung server sesudah plot benar2 disimpan): dihitung ulang
  // instan setiap draftPpl berubah, tanpa panggilan server.
  const bebanDraftPerPpl = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of kertasKerja) {
      const pid = draftPpl[r.idsubsls];
      if (pid) map.set(pid, (map.get(pid) ?? 0) + r.skor_beban_pendataan);
    }
    return map;
  }, [kertasKerja, draftPpl]);

  function pmlDraftUntukPpl(pplId: number): number | null {
    return draftPmlByPpl[pplId] ?? null;
  }

  function korwilNamaUntukPml(pmlId: number | null): string | null {
    if (!pmlId) return null;
    const pml = petugasList.find((p) => p.id === pmlId);
    if (!pml?.atasan_id) return null;
    return petugasList.find((p) => p.id === pml.atasan_id)?.nama ?? null;
  }

  // Jumlah PPL yg (di draft, belum tentu tersimpan) membawahi tiap PML --
  // dipakai utk MENJAGA kapasitas maksimal 4 PPL/PML di dropdown Langkah 4
  // (opsi PML yg sudah penuh dinonaktifkan), dihitung live tiap draftPpl /
  // draftPmlByPpl berubah supaya batasnya kerasa langsung saat trial-error.
  const jumlahPplPerPmlDraft = useMemo(() => {
    const map = new Map<number, number>();
    const pplIdsDipakai = new Set(Object.values(draftPpl).filter((v): v is number => !!v));
    for (const pplId of pplIdsDipakai) {
      const pmlId = draftPmlByPpl[pplId] ?? null;
      if (pmlId) map.set(pmlId, (map.get(pmlId) ?? 0) + 1);
    }
    return map;
  }, [draftPpl, draftPmlByPpl]);

  // Jumlah PPL (yg sudah punya draft plot) per status beban -- dipakai utk
  // ringkasan chip yg bisa diklik utk memfilter tabel Langkah 4.
  const statusPplCounts = useMemo(() => {
    const counts: Record<BalanceTone, number> = { netral: 0, seimbang: 0, perhatian: 0, kelebihan: 0, rendah: 0 };
    for (const beban of bebanDraftPerPpl.values()) {
      const tone = balanceInfo(beban, rataBebanTetap).tone;
      counts[tone] += 1;
    }
    return counts;
  }, [bebanDraftPerPpl, rataBebanTetap]);

  const jumlahPplDiplotDraft = useMemo(() => bebanDraftPerPpl.size, [bebanDraftPerPpl]);

  // "Optimasi Beban" -- MURNI INFORMASI, tidak ada tombol terapkan/pindah di
  // sini. Cuma menyarankan Sub SLS mana yg PALING besar kontribusinya ke
  // beban PPL yg kelebihan, dan PPL mana yg (saat ini) beban-nya paling
  // rendah sbg kandidat -- keputusan pindah tetap 100% manual lewat dropdown
  // PPL di tabel Langkah 4.
  type SaranOptimasi = {
    pplId: number;
    namaPpl: string;
    beban: number;
    baris: KertasKerjaRow | null;
    namaKandidat: string | null;
    bebanKandidat: number | null;
  };
  const sasaranOptimasi = useMemo((): SaranOptimasi[] => {
    if (rataBebanTetap <= 0) return [];
    const namaPetugas = (id: number) => petugasList.find((p) => p.id === id)?.nama ?? `#${id}`;
    const overloaded = [...bebanDraftPerPpl.entries()]
      .filter(([, beban]) => balanceInfo(beban, rataBebanTetap).tone === "kelebihan")
      .sort((a, b) => b[1] - a[1]);
    const underloaded = [...bebanDraftPerPpl.entries()]
      .filter(([, beban]) => balanceInfo(beban, rataBebanTetap).tone === "rendah")
      .sort((a, b) => a[1] - b[1]);
    return overloaded.slice(0, 5).map(([pplId, beban]) => {
      const rowsPpl = kertasKerja
        .filter((r) => (draftPpl[r.idsubsls] ?? null) === pplId)
        .sort((a, b) => b.skor_beban_pendataan - a.skor_beban_pendataan);
      const kandidat = underloaded[0];
      return {
        pplId,
        namaPpl: namaPetugas(pplId),
        beban,
        baris: rowsPpl[0] ?? null,
        namaKandidat: kandidat ? namaPetugas(kandidat[0]) : null,
        bebanKandidat: kandidat ? kandidat[1] : null,
      };
    });
  }, [bebanDraftPerPpl, rataBebanTetap, kertasKerja, draftPpl, petugasList]);

  const langkah1Ref = useRef<HTMLElement | null>(null);
  const langkah2Ref = useRef<HTMLElement | null>(null);
  const langkah3Ref = useRef<HTMLElement | null>(null);
  const langkah4Ref = useRef<HTMLElement | null>(null);
  const [langkahAktif, setLangkahAktif] = useState<1 | 2 | 3 | 4>(1);

  // Sidebar "rel langkah" (4 lingkaran bernomor di kiri) -- diklik utk
  // scroll halus ke section terkait, dan otomatis menandai langkah mana
  // yg lagi kelihatan di layar pakai IntersectionObserver (bukan dipilih
  // manual), supaya tetap sinkron walau user scroll bebas.
  useEffect(() => {
    const target = [
      { ref: langkah1Ref, n: 1 as const },
      { ref: langkah2Ref, n: 2 as const },
      { ref: langkah3Ref, n: 3 as const },
      { ref: langkah4Ref, n: 4 as const },
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        const terlihat = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!terlihat) return;
        const cocok = target.find((t) => t.ref.current === terlihat.target);
        if (cocok) setLangkahAktif(cocok.n);
      },
      { rootMargin: "-15% 0px -60% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    target.forEach((t) => {
      if (t.ref.current) observer.observe(t.ref.current);
    });
    return () => observer.disconnect();
  }, [loading]);

  function scrollKeLangkah(n: 1 | 2 | 3 | 4) {
    const ref = n === 1 ? langkah1Ref : n === 2 ? langkah2Ref : n === 3 ? langkah3Ref : langkah4Ref;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function filterKeStatusBeban(tone: BalanceTone | "") {
    setStatusBebanFilter(tone);
    setStatusPlotFilter("");
    setPage(1);
    langkah4Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function filterKeBelumDiplot() {
    setStatusBebanFilter("");
    setStatusPlotFilter("belum");
    setPage(1);
    langkah4Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const jumlahPerubahanPending = useMemo(() => {
    let n = 0;
    for (const r of kertasKerja) {
      if ((draftPpl[r.idsubsls] ?? null) !== (r.ppl_id ?? null)) n++;
    }
    const serverPmlByPpl = new Map<number, number | null>();
    for (const r of kertasKerja) {
      if (r.ppl_id) serverPmlByPpl.set(r.ppl_id, r.pml_id ?? null);
    }
    const pplIdsDipakai = new Set(Object.values(draftPpl).filter((v): v is number => !!v));
    for (const pplId of pplIdsDipakai) {
      if ((draftPmlByPpl[pplId] ?? null) !== (serverPmlByPpl.get(pplId) ?? null)) n++;
    }
    return n;
  }, [kertasKerja, draftPpl, draftPmlByPpl]);

  // Daftar rinci perubahan draft yg belum disimpan (bukan cuma angka) --
  // supaya admin bisa cek dulu sebelum menekan "Simpan Perubahan".
  type BarisPerubahan = { label: string; dari: string; ke: string };
  const daftarPerubahanPending = useMemo((): BarisPerubahan[] => {
    const hasil: BarisPerubahan[] = [];
    const namaPetugas = (id: number | null): string => {
      if (!id) return "belum dipilih";
      return petugasList.find((p) => p.id === id)?.nama ?? `#${id}`;
    };
    for (const r of kertasKerja) {
      const draftVal = draftPpl[r.idsubsls] ?? null;
      const serverVal = r.ppl_id ?? null;
      if (draftVal !== serverVal) {
        hasil.push({ label: `PPL — ${r.sls} · ${r.sub_sls}`, dari: namaPetugas(serverVal), ke: namaPetugas(draftVal) });
      }
    }
    const serverPmlByPpl = new Map<number, number | null>();
    for (const r of kertasKerja) {
      if (r.ppl_id) serverPmlByPpl.set(r.ppl_id, r.pml_id ?? null);
    }
    const pplIdsDipakai = new Set(Object.values(draftPpl).filter((v): v is number => !!v));
    for (const pplId of pplIdsDipakai) {
      const draftVal = draftPmlByPpl[pplId] ?? null;
      const serverVal = serverPmlByPpl.get(pplId) ?? null;
      if (draftVal !== serverVal) {
        hasil.push({ label: `PML — utk PPL ${namaPetugas(pplId)}`, dari: namaPetugas(serverVal), ke: namaPetugas(draftVal) });
      }
    }
    return hasil;
  }, [kertasKerja, draftPpl, draftPmlByPpl, petugasList]);

  const jumlahTanpaDataKk = useMemo(() => kertasKerja.filter((r) => !r.punya_data_kk).length, [kertasKerja]);
  const jumlahTanpaKoordinat = useMemo(
    () => kertasKerja.filter((r) => r.jarak_status !== "riil").length,
    [kertasKerja]
  );
  const jumlahBelumDiplot = useMemo(
    () => kertasKerja.filter((r) => !(draftPpl[r.idsubsls] ?? null)).length,
    [kertasKerja, draftPpl]
  );
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

  // Status beban SATU baris ditentukan dari beban PPL yg (draft) memegangnya
  // -- bukan skor baris itu sendiri -- krn yg dijaga keseimbangannya adalah
  // beban PETUGAS, bukan beban per-Sub-SLS. Baris tanpa PPL dianggap tone
  // "netral" (dipakai jg oleh filter "Status Plot").
  function toneBarisAlokasi(r: KertasKerjaRow): BalanceTone | "belum" {
    const pplId = draftPpl[r.idsubsls] ?? null;
    if (!pplId) return "belum";
    const beban = bebanDraftPerPpl.get(pplId) ?? 0;
    return balanceInfo(beban, rataBebanTetap).tone;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kertasKerja.filter((r) => {
      if (kecFilter && r.kecamatan !== kecFilter) return false;
      const draftPplId = draftPpl[r.idsubsls] ?? null;
      if (pplFilter && draftPplId !== pplFilter) return false;
      if (pmlFilterLangkah4) {
        const draftPmlId = draftPplId ? pmlDraftUntukPpl(draftPplId) : null;
        if (draftPmlId !== pmlFilterLangkah4) return false;
      }
      if (dataFilter === "lengkap" && !r.punya_data_kk) return false;
      if (dataFilter === "belum" && r.punya_data_kk) return false;
      if (statusPlotFilter === "sudah" && !draftPplId) return false;
      if (statusPlotFilter === "belum" && draftPplId) return false;
      if (statusBebanFilter && toneBarisAlokasi(r) !== statusBebanFilter) return false;
      if (hanyaBerubahFilter && draftPplId === (r.ppl_id ?? null)) return false;
      if (
        q &&
        !r.nagari.toLowerCase().includes(q) &&
        !r.sls.toLowerCase().includes(q) &&
        !r.sub_sls.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kertasKerja,
    kecFilter,
    pplFilter,
    pmlFilterLangkah4,
    dataFilter,
    statusPlotFilter,
    statusBebanFilter,
    hanyaBerubahFilter,
    search,
    draftPpl,
    draftPmlByPpl,
    bebanDraftPerPpl,
    rataBebanTetap,
  ]);

  // Sorting: kolom yg bisa diurutkan diambil dari kunci sortKey. "beban_ppl"
  // pakai beban draft PPL yg memegang baris itu (0 kalau belum diplot).
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const arah = sortDir === "asc" ? 1 : -1;
    const nilai = (r: KertasKerjaRow): number | string => {
      switch (sortKey) {
        case "kecamatan":
          return r.kecamatan;
        case "skor_beban_pendataan":
          return r.skor_beban_pendataan;
        case "skor_jarak":
          return r.jarak_status === "riil" ? r.skor_jarak : -1;
        case "skor_beban_akhir":
          return r.skor_beban_akhir;
        case "beban_ppl": {
          const pplId = draftPpl[r.idsubsls] ?? null;
          return pplId ? bebanDraftPerPpl.get(pplId) ?? 0 : -1;
        }
        default:
          return 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = nilai(a);
      const vb = nilai(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * arah;
      }
      return (va - vb) * arah;
    });
  }, [filtered, sortKey, sortDir, draftPpl, bebanDraftPerPpl]);

  function toggleSort(key: NonNullable<typeof sortKey>) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  }

  // Dipakai popover "Urutkan" ThKontrol -- pilih arah langsung (bukan toggle)
  // supaya opsi "Urut naik"/"Urut turun"/"Reset urutan" selalu jelas maknanya.
  function sortAsc(key: NonNullable<typeof sortKey>) {
    setSortKey(key);
    setSortDir("asc");
    setPage(1);
  }
  function sortDesc(key: NonNullable<typeof sortKey>) {
    setSortKey(key);
    setSortDir("desc");
    setPage(1);
  }
  function sortReset() {
    setSortKey(null);
    setPage(1);
  }

  // Adapter Data KK: state asli `dataFilter` cuma 1 nilai ("" | "lengkap" |
  // "belum"), tapi popover filter ThKontrol berbasis multi-pilih (Set).
  // Dikonversi dua arah supaya popovernya tetap konsisten dgn checkbox-list
  // di mockup walau di baliknya cuma single-value.
  const DATA_KK_OPSI = ["Lengkap", "Belum Ada Data"];
  const dataFilterSelected = new Set<string>(
    dataFilter === "lengkap" ? ["Lengkap"] : dataFilter === "belum" ? ["Belum Ada Data"] : DATA_KK_OPSI
  );
  function terapkanDataFilter(next: Set<string>) {
    if (next.size === 0 || next.size === DATA_KK_OPSI.length) setDataFilter("");
    else if (next.has("Lengkap")) setDataFilter("lengkap");
    else setDataFilter("belum");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / alokasiPageSize));
  const pageClamped = Math.min(page, totalPages);
  // alokasiPageSize bisa Infinity (opsi "Semua") -- 0 * Infinity = NaN di JS,
  // jadi ditangani terpisah drpd lewat slice biasa.
  const paged =
    alokasiPageSize === Infinity ? sorted : sorted.slice((pageClamped - 1) * alokasiPageSize, pageClamped * alokasiPageSize);

  function handleExport() {
    const dataRows = filtered.map((r) => ({
      Kecamatan: r.kecamatan,
      Nagari: r.nagari,
      "Jorong/SLS": r.sls,
      "Sub SLS": r.sub_sls,
      "Status Data KK": r.punya_data_kk ? "Lengkap" : "Belum Ada Data",
      "KK Total": r.kk_total,
      "Skor Beban Kerja Pendataan (tanpa jarak)": r.skor_beban_pendataan,
      "Jarak (km)": r.jarak_km ?? "",
      "Jumlah Hari Kerja (PP)": r.jumlah_hari_kerja,
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
    <div className="mt-6 flex gap-6">
      <SidebarLangkah aktif={langkahAktif} onPilih={scrollKeLangkah} />
      <div className="flex min-w-0 flex-1 flex-col gap-6">
      {/* ===== RINGKASAN ALOKASI PETUGAS (selalu terlihat) ===== */}
      <section className="rounded-md border border-blue-100 bg-white p-4">
        <h2 className="font-medium text-blue-950">Ringkasan Alokasi Petugas</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat warna="bg-blue-50 text-blue-900" label="Sub SLS Sampel" nilai={kertasKerja.length} />
          <MiniStat
            warna="bg-blue-50 text-blue-900"
            label="Total Skor Beban"
            nilai={Math.round(totalSkorWilayahTugas)}
          />
          <MiniStat warna="bg-blue-50 text-blue-900" label="PPL Tetap Tersedia" nilai={TOTAL_PPL_TETAP} />
          <MiniStat warna="bg-blue-50 text-blue-900" label="Kebutuhan PPL (estimasi)" nilai={totalKebutuhan.ppl} />
          <MiniStat warna="bg-moss-50 text-moss-700" label="PML Ditetapkan" nilai={pmlOptions.length} />
          <MiniStat warna="bg-moss-50 text-moss-700" label="Korwil Ditetapkan" nilai={korwilOptions.length} />
        </div>
        <p className="mt-2 text-[11px] text-ink/50">
          {jumlahPplDiplotDraft} dari {TOTAL_PPL_TETAP} PPL sudah punya plot (draft) · {jumlahBelumDiplot} dari{" "}
          {kertasKerja.length} Sub SLS belum diplot
          {jumlahPerubahanPending > 0 && <> · {jumlahPerubahanPending} perubahan belum disimpan</>}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-ink/60">Status beban PPL (klik utk filter Langkah 4):</span>
          <button
            type="button"
            onClick={() => filterKeStatusBeban("seimbang")}
            className="rounded-full bg-moss-50 px-2.5 py-1 text-xs font-medium text-moss-700 hover:bg-moss-100"
          >
            🟢 {statusPplCounts.seimbang} seimbang
          </button>
          <button
            type="button"
            onClick={() => filterKeStatusBeban("perhatian")}
            className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            🟡 {statusPplCounts.perhatian} perhatian
          </button>
          <button
            type="button"
            onClick={() => filterKeStatusBeban("kelebihan")}
            className="rounded-full bg-rust-50 px-2.5 py-1 text-xs font-medium text-rust-700 hover:bg-rust-100"
          >
            🔴 {statusPplCounts.kelebihan} kelebihan
          </button>
          <button
            type="button"
            onClick={() => filterKeStatusBeban("rendah")}
            className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
          >
            🟣 {statusPplCounts.rendah} rendah
          </button>
          <button
            type="button"
            onClick={filterKeBelumDiplot}
            className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-ink/60 hover:bg-gray-200"
          >
            ☐ {jumlahBelumDiplot} Sub SLS belum diplot
          </button>
        </div>
      </section>

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

      {/* ===== KARTU MITRA PERLU DIHUBUNGI (BELUM MENDAFTAR) ===== */}
      <section className="rounded-md border border-amber-200 bg-white p-4">
        <button
          type="button"
          onClick={() => setKontakTerbuka((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <div>
            <h2 className="font-medium text-blue-950">📞 Mitra Perlu Dihubungi (Belum Mendaftar)</h2>
            <p className="mt-1 text-xs text-ink/60">
              Mitra aktif yang belum konfirmasi kesediaan ikut pendataan bencana. Hubungi, tawarkan, lalu catat
              hasilnya di sini.
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              {kontakRows.length} perlu dihubungi
            </span>
            <span className="text-slate-400">{kontakTerbuka ? "▾" : "▸"}</span>
          </span>
        </button>

        {kontakError && <p className="mt-2 text-xs text-rust-600">{kontakError}</p>}

        {kontakTerbuka && (
          <div className="mt-3">
            {kontakRows.length === 0 ? (
              <p className="text-sm text-ink/50">
                Semua mitra aktif sudah konfirmasi kesediaan ikut pendataan bencana.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {kontakRows.map((m) => {
                  const busy = kontakBusyId === m.id;
                  const draftCatatan = kontakMenolakDraft[m.id];
                  const sedangIsiMenolak = draftCatatan !== undefined;
                  const pilihan = sedangIsiMenolak ? "menolak" : m.status_kontak_pendaftaran_bencana;
                  return (
                    <div
                      key={m.id}
                      className={`rounded-md border p-3 text-sm ${
                        pilihan === "menolak"
                          ? "border-rust-200 bg-rust-50/40"
                          : pilihan === "diterima"
                          ? "border-moss-200 bg-moss-50/40"
                          : "border-line bg-white"
                      }`}
                    >
                      <p className="font-medium text-ink">{m.nama}</p>
                      <p className="text-xs text-ink/60">
                        {m.no_hp || "No HP tidak ada"}
                        {m.alamat_kecamatan && <> · {m.alamat_kecamatan}</>}
                      </p>

                      <div className="mt-2 flex items-center gap-3 text-xs">
                        <label className="flex cursor-pointer items-center gap-1">
                          <input
                            type="radio"
                            name={`kontak-${m.id}`}
                            checked={pilihan === "diterima"}
                            disabled={busy}
                            onChange={() => simpanStatusKontak(m.id, "diterima")}
                          />
                          Terima
                        </label>
                        <label className="flex cursor-pointer items-center gap-1">
                          <input
                            type="radio"
                            name={`kontak-${m.id}`}
                            checked={pilihan === "menolak"}
                            disabled={busy}
                            onChange={() =>
                              setKontakMenolakDraft((prev) => ({
                                ...prev,
                                [m.id]: m.catatan_penolakan_pendaftaran_bencana ?? "",
                              }))
                            }
                          />
                          Menolak
                        </label>
                        {m.status_kontak_pendaftaran_bencana && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => simpanStatusKontak(m.id, null)}
                            className="ml-auto text-[10px] text-ink/40 underline hover:text-ink/60"
                          >
                            batalkan
                          </button>
                        )}
                      </div>

                      {pilihan === "menolak" && (
                        <div className="mt-2">
                          <textarea
                            value={draftCatatan ?? m.catatan_penolakan_pendaftaran_bencana ?? ""}
                            onChange={(e) =>
                              setKontakMenolakDraft((prev) => ({ ...prev, [m.id]: e.target.value }))
                            }
                            placeholder="Alasan menolak (wajib diisi)..."
                            rows={2}
                            className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-blue-400"
                          />
                          {sedangIsiMenolak && (
                            <div className="mt-1 flex gap-1.5">
                              <button
                                type="button"
                                disabled={busy || !(draftCatatan ?? "").trim()}
                                onClick={() => simpanStatusKontak(m.id, "menolak", draftCatatan)}
                                className="rounded-full bg-rust-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-rust-700 disabled:opacity-40"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  setKontakMenolakDraft((prev) => {
                                    const next = { ...prev };
                                    delete next[m.id];
                                    return next;
                                  })
                                }
                                className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-ink/60 hover:bg-gray-200"
                              >
                                Batal
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ===== KERTAS KERJA BEBAN: KOREKSI DATA KK ===== */}
      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setBebanTerbuka((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-slate-400">{bebanTerbuka ? "▾" : "▸"}</span>
            <span>
              <h2 className="font-medium text-slate-800">Kertas Kerja Beban — Koreksi Data KK</h2>
              <p className="mt-0.5 text-xs text-ink/60">
                Lihat &amp; koreksi manual jumlah KK Total dan KK Terdampak per Sub SLS terdampak — inilah variabel
                yang menentukan Skor Beban Pendataan di seluruh langkah di bawah. KK Total asal dari data Wilkerstat,
                KK Terdampak asal dari estimasi rata-rata per Jorong.
              </p>
            </span>
          </button>
          <span className="flex shrink-0 items-center gap-1.5">
            {jumlahBarisBedaVerifikasi > 0 && (
              <span className="rounded-full bg-rust-100 px-3 py-1 text-xs font-medium text-rust-700">
                🧭 {jumlahBarisBedaVerifikasi} Sub SLS beda &gt;{AMBANG_SELISIH_VERIFIKASI_JORONG} dari verifikasi
              </span>
            )}
            {!bebanTerbuka && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {bebanRows.filter((r) => r.kk_total_manual || r.kk_terdampak_manual).length} dari {bebanRows.length}{" "}
                Sub SLS terkoreksi manual
              </span>
            )}
          </span>
        </div>

        {bebanTerbuka && (
          <div className="mt-3">
            {jumlahBarisBedaVerifikasi > 0 && (
              <p className="mb-2 rounded-md border border-rust-100 bg-rust-50 px-3 py-2 text-xs text-rust-700">
                Baris berwarna merah = total KK Terdampak Jorong ybs (dijumlah semua Sub SLS-nya) selisih lebih dari{" "}
                {AMBANG_SELISIH_VERIFIKASI_JORONG} KK dari data verifikasi resmi lapangan. Klik ikon 🧭 pada baris
                tsb utk lihat rinciannya. Ini hanya penanda utk ditinjau ulang manual — bukan koreksi otomatis.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-xs text-ink/70">
                {bebanRows.filter((r) => r.kk_total_manual || r.kk_terdampak_manual).length} dari {bebanRows.length}{" "}
                Sub SLS sudah terkoreksi manual
              </span>
              <span className="ml-auto flex items-center gap-2">
                {jumlahPerubahanBebanTampil > 0 && (
                  <span className="rounded-full bg-orange-200 px-2.5 py-1 text-xs font-medium text-orange-800">
                    {jumlahPerubahanBebanTampil} perubahan belum disimpan
                  </span>
                )}
                <button
                  type="button"
                  disabled={bebanSimpanBusy}
                  onClick={handleResetSemuaBeban}
                  className="rounded-md border border-rust-200 bg-white px-3 py-1.5 text-xs font-medium text-rust-600 transition hover:bg-rust-50 disabled:opacity-40"
                >
                  Reset Semua ke Data Asli
                </button>
                <button
                  type="button"
                  disabled={jumlahPerubahanBebanTampil === 0 || bebanSimpanBusy}
                  onClick={batalkanPerubahanBeban}
                  className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:bg-gray-50 disabled:opacity-40"
                >
                  ↺ Batalkan Perubahan
                </button>
                <button
                  type="button"
                  disabled={jumlahPerubahanBebanTampil === 0 || bebanSimpanBusy}
                  onClick={handleSimpanBeban}
                  className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {bebanSimpanBusy ? "Menyimpan..." : "💾 Simpan Perubahan"}
                </button>
              </span>
            </div>

            {bebanError && (
              <p className="mt-2 rounded-md bg-rust-100 px-3 py-2 text-xs text-rust-700">{bebanError}</p>
            )}

            <div className="mt-2 grid grid-cols-1 gap-3 rounded-md border border-line bg-white p-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-ink/60">Filter Kecamatan</label>
                <select
                  value={bebanKecFilter}
                  onChange={(e) => {
                    setBebanKecFilter(e.target.value);
                    setBebanPage(1);
                  }}
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                >
                  <option value="">Semua kecamatan</option>
                  {kecamatanOptionsBeban.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-ink/60">Cari Nagari/Jorong/Sub SLS</label>
                <input
                  value={bebanSearch}
                  onChange={(e) => {
                    setBebanSearch(e.target.value);
                    setBebanPage(1);
                  }}
                  placeholder="Ketik kata kunci..."
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>

            <div className="mt-2 overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Kecamatan</th>
                    <ThKontrol
                      label="Nagari"
                      search={{ value: bebanSearch, onChange: (v) => { setBebanSearch(v); setBebanPage(1); }, placeholder: "Cari Nagari/Jorong/Sub SLS..." }}
                    />
                    <ThKontrol
                      label="Jorong/SLS"
                      search={{ value: bebanSearch, onChange: (v) => { setBebanSearch(v); setBebanPage(1); }, placeholder: "Cari Nagari/Jorong/Sub SLS..." }}
                    />
                    <ThKontrol
                      label="Sub SLS"
                      search={{ value: bebanSearch, onChange: (v) => { setBebanSearch(v); setBebanPage(1); }, placeholder: "Cari Nagari/Jorong/Sub SLS..." }}
                    />
                    <th className="px-3 py-2 font-medium">KK Total</th>
                    <th className="px-3 py-2 font-medium">KK Terdampak</th>
                    <th className="px-3 py-2 font-medium">KK Tidak Terdampak</th>
                    <th className="px-3 py-2 font-medium">Skor Beban Pendataan</th>
                    <th className="px-3 py-2 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {bebanPaged.map((r) => {
                    const total = draftKkTotal[r.idsubsls] ?? r.kk_total;
                    const terdampak = draftKkTerdampak[r.idsubsls] ?? r.kk_terdampak_estimasi;
                    const tidakTerdampak = Math.max(total - terdampak, 0);
                    const skorLive = skorLiveBeban(r.idsubsls, r.kk_total, r.kk_terdampak_estimasi);
                    const berubah = total !== r.kk_total || terdampak !== r.kk_terdampak_estimasi;
                    const totalJorongLive = totalTerdampakPerJorongLive.get(r.idsls) ?? terdampak;
                    const bedaSignifikanJorong =
                      r.verifikasi_total_keluarga != null &&
                      Math.abs(totalJorongLive - r.verifikasi_total_keluarga) > AMBANG_SELISIH_VERIFIKASI_JORONG;
                    return (
                      <tr
                        key={r.idsubsls}
                        className={`border-t border-line ${
                          bedaSignifikanJorong ? "bg-rust-50" : berubah ? "bg-orange-50/50" : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-ink/80">{r.kecamatan}</td>
                        <td className="px-3 py-2 text-ink/80">{r.nagari}</td>
                        <td className="px-3 py-2 font-medium text-ink">{r.sls}</td>
                        <td className="px-3 py-2 text-ink/80">{r.sub_sls}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={total}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setDraftKkTotal((prev) => ({ ...prev, [r.idsubsls]: val }));
                              }}
                              className="w-20 rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-blue-400"
                            />
                            {r.kk_total_manual && (
                              <span
                                className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-700"
                                title={`Data asli (Wilkerstat): ${r.kk_total_asli}`}
                              >
                                manual
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={terdampak}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setDraftKkTerdampak((prev) => ({ ...prev, [r.idsubsls]: val }));
                              }}
                              className="w-20 rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-blue-400"
                            />
                            <IkonSumberKkTerdampak
                              idsubsls={r.idsubsls}
                              onTerapkan={(nilai) =>
                                setDraftKkTerdampak((prev) => ({ ...prev, [r.idsubsls]: nilai }))
                              }
                            />
                            {r.verifikasi_total_keluarga != null && (
                              <IkonVerifikasiJorong
                                namaJorong={r.sls}
                                verifikasiTotal={r.verifikasi_total_keluarga}
                                totalJorongLive={totalJorongLive}
                                bedaSignifikan={bedaSignifikanJorong}
                                rincianSub={(subRowsPerJorong.get(r.idsls) ?? []).map((s) => ({
                                  sub_sls: s.sub_sls,
                                  nilai: draftKkTerdampak[s.idsubsls] ?? s.kk_terdampak_estimasi,
                                }))}
                              />
                            )}
                            {r.kk_terdampak_manual && (
                              <span
                                className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-700"
                                title={`Estimasi rata-jorong: ${r.kk_terdampak_asli}`}
                              >
                                manual
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-ink/80">{tidakTerdampak.toLocaleString("id-ID")}</td>
                        <td className="px-3 py-2 font-medium text-ink">
                          {skorLive.toLocaleString("id-ID")}
                          {berubah && (
                            <span
                              className={`ml-1.5 text-[10px] font-medium ${
                                skorLive >= r.skor_beban_pendataan ? "text-rust-600" : "text-moss-600"
                              }`}
                              title={`Skor sebelum koreksi: ${r.skor_beban_pendataan.toLocaleString("id-ID")}`}
                            >
                              ({skorLive >= r.skor_beban_pendataan ? "+" : ""}
                              {(skorLive - r.skor_beban_pendataan).toLocaleString("id-ID", { maximumFractionDigits: 2 })})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => resetBarisBeban(r.idsubsls)}
                            title="Kembalikan baris ini ke data asli/estimasi"
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-ink/60 hover:bg-gray-200"
                          >
                            ↺ reset
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {bebanPaged.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-4 text-center text-ink/50">
                        Tidak ada data yang cocok dengan filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredBeban.length > 0 && (
              <div className="mt-2 flex items-center justify-between text-sm text-ink/60">
                <span>
                  {(bebanPageClamped - 1) * BEBAN_PAGE_SIZE + 1}-
                  {Math.min(bebanPageClamped * BEBAN_PAGE_SIZE, filteredBeban.length)} dari {filteredBeban.length}{" "}
                  baris
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={bebanPageClamped <= 1}
                    onClick={() => setBebanPage(bebanPageClamped - 1)}
                    className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40"
                  >
                    &lsaquo;
                  </button>
                  <button
                    type="button"
                    disabled={bebanPageClamped >= bebanTotalPages}
                    onClick={() => setBebanPage(bebanPageClamped + 1)}
                    className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40"
                  >
                    &rsaquo;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ===== LANGKAH 1: WILAYAH SAMPEL ===== */}
      <section ref={langkah1Ref} className="rounded-md border border-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium text-blue-950">Langkah 1 — Pilih Wilayah Sampel</h2>
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

        <div className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-line bg-blue-50/40 p-3 sm:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-ink/60">Filter Kecamatan</label>
            <select
              value={sampelKecFilter}
              onChange={(e) => {
                setSampelKecFilter(e.target.value);
                setSampelPage(1);
              }}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
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
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
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
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              disabled={sampelBulkBusy || filteredSampel.length === 0}
              onClick={() => handleCentangSemuaFiltered(true, filteredSampel)}
              className="flex-1 rounded-md bg-blue-500 px-2 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
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
            <thead className="bg-blue-50 text-blue-600">
              <tr>
                <th className="w-10 px-3 py-2 font-medium"></th>
                <th className="px-3 py-2 font-medium">Kecamatan</th>
                <ThKontrol
                  label="Nagari"
                  search={{ value: sampelSearch, onChange: (v) => { setSampelSearch(v); setSampelPage(1); }, placeholder: "Cari Nagari/Jorong/Sub SLS..." }}
                />
                <ThKontrol
                  label="Jorong/SLS"
                  search={{ value: sampelSearch, onChange: (v) => { setSampelSearch(v); setSampelPage(1); }, placeholder: "Cari Nagari/Jorong/Sub SLS..." }}
                />
                <ThKontrol
                  label="Sub SLS"
                  search={{ value: sampelSearch, onChange: (v) => { setSampelSearch(v); setSampelPage(1); }, placeholder: "Cari Nagari/Jorong/Sub SLS..." }}
                />
                <ThKontrol
                  label="Data KK"
                  filter={{
                    options: ["Lengkap", "Belum Ada Data"],
                    selected: new Set(
                      sampelDataFilter === "lengkap"
                        ? ["Lengkap"]
                        : sampelDataFilter === "belum"
                        ? ["Belum Ada Data"]
                        : ["Lengkap", "Belum Ada Data"]
                    ),
                    onApply: (next) => {
                      if (next.size === 0 || next.size === 2) setSampelDataFilter("");
                      else if (next.has("Lengkap")) setSampelDataFilter("lengkap");
                      else setSampelDataFilter("belum");
                      setSampelPage(1);
                    },
                  }}
                />
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
                      className="h-4 w-4 accent-blue-500"
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
      <section ref={langkah2Ref} className="rounded-md border border-line bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-medium text-blue-950">Langkah 2 — Kebutuhan Petugas per Kecamatan</h2>
            <p className="mt-1 text-xs text-ink/60">
              Dihitung HANYA dari Sub SLS yang sudah dicentang sbg wilayah sampel di Langkah 1. Bobot KK terdampak,
              KK tidak terdampak, dan jarak rumah petugas bisa diatur di tab &quot;⚙️ Kelola Perkiraan Beban&quot;.
              Kapasitas dihitung dari ±15 menit/kuesioner, ±5 jam kerja/hari.
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
                className="mt-1 w-28 rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <button
              type="button"
              onClick={handleTerapkanHariKerja}
              className="rounded-md border border-blue-700 bg-white px-3 py-2 text-sm font-medium text-blue-900 transition hover:bg-blue-50"
            >
              Hitung Ulang
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat warna="bg-blue-50 text-blue-900" label="Total PPL Dibutuhkan (estimasi)" nilai={totalKebutuhan.ppl} />
          <MiniStat warna="bg-blue-50 text-blue-900" label="Total PML Dibutuhkan (estimasi)" nilai={totalKebutuhan.pml} />
          <MiniStat warna="bg-blue-50 text-blue-900" label="Total Korwil Dibutuhkan (estimasi)" nilai={totalKebutuhan.korwil} />
          <MiniStat warna="bg-moss-50 text-moss-700" label="PPL Sudah Diplot" nilai={ringkasanPpl.length} />
        </div>
        <p className="mt-1.5 text-[11px] text-ink/50">
          Angka PML/Korwil per kecamatan di atas adalah estimasi per wilayah; susunan tim sebenarnya di Langkah 3 bisa
          lebih sedikit karena 1 PML/Korwil boleh membawahi wilayah lintas-kecamatan yang berdekatan.
        </p>

        <div className="mt-3 overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-blue-50 text-blue-600">
              <tr>
                <th className="px-3 py-2 font-medium"></th>
                <th className="px-3 py-2 font-medium">Kecamatan</th>
                <th className="px-3 py-2 font-medium">Skor Beban Total</th>
                <th className="px-3 py-2 font-medium">Jml Sub SLS Sampel</th>
                <th className="px-3 py-2 font-medium">Belum Ada Data KK</th>
                <th className="px-3 py-2 font-medium">Beban/PPL</th>
                <th className="px-3 py-2 font-medium">PPL</th>
                <th className="px-3 py-2 font-medium">PML</th>
                <th className="px-3 py-2 font-medium">Korwil</th>
              </tr>
            </thead>
            <tbody>
              {kebutuhan.map((k) => {
                const terbuka = detailKebutuhanTerbuka.has(k.kecamatan);
                const bebanPerPpl = k.jumlah_ppl_dibutuhkan > 0 ? k.total_skor_beban / k.jumlah_ppl_dibutuhkan : 0;
                const kebutuhanTeoritis = k.kapasitas_per_ppl > 0 ? k.total_skor_beban / k.kapasitas_per_ppl : 0;
                return (
                  <Fragment key={k.kecamatan}>
                    <tr className="border-t border-line">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleDetailKebutuhan(k.kecamatan)}
                          className="text-ink/40 hover:text-ink/70"
                          title="Detail perhitungan"
                        >
                          {terbuka ? "▾" : "▸"}
                        </button>
                      </td>
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
                      <td className="px-3 py-2 text-ink/80">
                        {bebanPerPpl.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-3 py-2 text-ink/80">{k.jumlah_ppl_dibutuhkan}</td>
                      <td className="px-3 py-2 text-ink/80">{k.jumlah_pml_dibutuhkan}</td>
                      <td className="px-3 py-2 text-ink/80">{k.jumlah_korwil_dibutuhkan}</td>
                    </tr>
                    {terbuka && (
                      <tr className="border-t border-line bg-blue-50/30">
                        <td colSpan={9} className="px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                            Detail Perhitungan — {k.kecamatan}
                          </p>
                          <div className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-ink/70 sm:grid-cols-4">
                            <p>
                              Total skor beban: <strong className="text-ink">{k.total_skor_beban.toLocaleString("id-ID")}</strong>
                            </p>
                            <p>
                              Kapasitas per PPL: <strong className="text-ink">{k.kapasitas_per_ppl.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</strong>
                            </p>
                            <p>
                              Hari kerja dipakai: <strong className="text-ink">{hariKerjaDipakai}</strong>
                            </p>
                            <p>
                              Kebutuhan teoritis: <strong className="text-ink">{kebutuhanTeoritis.toLocaleString("id-ID", { maximumFractionDigits: 2 })} PPL</strong>
                            </p>
                            <p>
                              Pembulatan (dipakai): <strong className="text-ink">{k.jumlah_ppl_dibutuhkan} PPL</strong>
                            </p>
                            <p>
                              Beban rata-rata/PPL: <strong className="text-ink">{bebanPerPpl.toLocaleString("id-ID", { maximumFractionDigits: 1 })}</strong>
                            </p>
                          </div>
                          <p className="mt-2 text-[11px] text-ink/50">
                            Catatan: perhitungan ini estimasi kebutuhan per kecamatan (dibulatkan ke atas), BUKAN
                            plotting petugas -- plotting sebenarnya tetap manual di Langkah 4 & bisa lintas kecamatan.
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {kebutuhan.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-4 text-center text-ink/50">
                    Belum ada wilayah sampel yang dicentang di Langkah 1.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== LANGKAH 3: SUSUNAN TIM (MANUAL, TANPA PENGELOMPOKAN OTOMATIS) ===== */}
      <section ref={langkah3Ref} className="rounded-md border border-line bg-white p-4">
        <h2 className="font-medium text-blue-950">Langkah 3 — Susunan Tim (Korwil, PML, PPL)</h2>
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
              <Combobox
                value={korwilBaruId === "" ? null : korwilBaruId}
                onChange={(v) => setKorwilBaruId(v ?? "")}
                options={calonKorwilBaru.map((p) => ({ value: p.id, label: p.nama }))}
                placeholder="+ Pilih calon Korwil (organik)..."
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                disabled={!korwilBaruId || timBusyId === korwilBaruId}
                onClick={() => {
                  if (korwilBaruId) handleSusunanTim(korwilBaruId, "korwil", null);
                  setKorwilBaruId("");
                }}
                className="shrink-0 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
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
              <Combobox
                value={pmlBaruId === "" ? null : pmlBaruId}
                onChange={(v) => setPmlBaruId(v ?? "")}
                options={calonPmlBaru.map((p) => ({ value: p.id, label: `${p.nama} (${p.status_kepegawaian})` }))}
                placeholder="+ Pilih calon PML (organik/mitra)..."
                className="min-w-0 flex-1"
              />
              <button
                type="button"
                disabled={!pmlBaruId || timBusyId === pmlBaruId}
                onClick={() => {
                  if (pmlBaruId) handleSusunanTim(pmlBaruId, "pml", null);
                  setPmlBaruId("");
                }}
                className="shrink-0 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
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
                    {r && r.jumlah_ppl > 0 && r.jumlah_ppl < KAPASITAS_IDEAL_MIN_PPL_PER_PML && (
                      <p className="mt-0.5 text-[10px] font-medium text-orange-600">
                        ⚠ PML ini membawahi &lt; {KAPASITAS_IDEAL_MIN_PPL_PER_PML} PPL (idealnya {KAPASITAS_IDEAL_MIN_PPL_PER_PML}-
                        {KAPASITAS_MAX_PPL_PER_PML})
                      </p>
                    )}
                    <Combobox
                      value={p.atasan_id}
                      onChange={(v) => handleSusunanTim(p.id, "pml", v)}
                      disabled={timBusyId === p.id}
                      options={korwilOptions.map((k) => ({ value: k.id, label: `Korwil: ${k.nama}` }))}
                      placeholder="Korwil: belum dipilih..."
                      className="mt-1 w-full"
                    />
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
                      <Combobox
                        value={p?.atasan_id ?? null}
                        onChange={(v) => handleSusunanTim(r.ppl_id, "ppl", v)}
                        disabled={timBusyId === r.ppl_id}
                        options={pmlOptions.map((m) => {
                          const jumlah = ringkasanPml.find((x) => x.pml_id === m.id)?.jumlah_ppl ?? 0;
                          const sudahPunyaIni = p?.atasan_id === m.id;
                          const penuh = jumlah >= KAPASITAS_MAX_PPL_PER_PML && !sudahPunyaIni;
                          return {
                            value: m.id,
                            label: `PML: ${m.nama}${penuh ? ` (penuh - ${KAPASITAS_MAX_PPL_PER_PML} PPL)` : ""}`,
                            disabled: penuh,
                          };
                        })}
                        placeholder="PML: belum dipilih..."
                        className="mt-1 w-full"
                      />
                    </li>
                  );
                })}
              {ringkasanPpl.length === 0 && (
                <li className="text-xs text-ink/40">Belum ada PPL yang diplot ke Sub SLS.</li>
              )}
            </ul>
          </div>
        </div>

        {korwilOptions.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink/50">Struktur Tim (Pohon)</h3>
            <div className="mt-2 flex flex-col gap-2 text-xs">
              {korwilOptions.map((k) => {
                const pmlUnderKorwil = pmlOptions.filter((p) => p.atasan_id === k.id);
                const rKorwil = ringkasanKorwil.find((x) => x.korwil_id === k.id);
                return (
                  <div key={k.id} className="rounded-md border border-line p-2">
                    <p className="font-semibold text-ink">
                      👤 Korwil {k.nama}
                      {rKorwil && (
                        <span className="ml-2 font-normal text-ink/50">
                          ({rKorwil.jumlah_pml} PML · {rKorwil.jumlah_ppl} PPL · beban{" "}
                          {rKorwil.total_skor_beban_akhir.toLocaleString("id-ID")})
                        </span>
                      )}
                    </p>
                    <div className="ml-4 mt-1.5 flex flex-col gap-1.5 border-l border-line pl-3">
                      {pmlUnderKorwil.map((m) => {
                        const pplUnderPml = ringkasanPpl.filter((r) => {
                          const p = petugasList.find((x) => x.id === r.ppl_id);
                          return p?.atasan_id === m.id;
                        });
                        const rPml = ringkasanPml.find((x) => x.pml_id === m.id);
                        return (
                          <div key={m.id}>
                            <p className="font-medium text-ink/80">
                              PML {m.nama}
                              {rPml && (
                                <span className="ml-2 font-normal text-ink/50">
                                  ({rPml.jumlah_ppl} PPL · beban {rPml.total_skor_beban_akhir.toLocaleString("id-ID")})
                                </span>
                              )}
                              {rPml && rPml.jumlah_ppl > 0 && rPml.jumlah_ppl < KAPASITAS_IDEAL_MIN_PPL_PER_PML && (
                                <span className="ml-1 text-orange-500" title="Membawahi < 3 PPL">
                                  ⚠
                                </span>
                              )}
                            </p>
                            <ul className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-line pl-3 text-ink/60">
                              {pplUnderPml.map((r) => (
                                <li key={r.ppl_id}>
                                  PPL {r.ppl_nama}{" "}
                                  <span className="text-ink/40">
                                    ({r.jumlah_subsls} Sub SLS · beban {r.total_skor_beban_akhir.toLocaleString("id-ID")})
                                  </span>
                                </li>
                              ))}
                              {pplUnderPml.length === 0 && <li className="text-ink/30">belum ada PPL</li>}
                            </ul>
                          </div>
                        );
                      })}
                      {pmlUnderKorwil.length === 0 && <p className="text-ink/30">belum ada PML</p>}
                    </div>
                  </div>
                );
              })}
              {pmlOptions.filter((p) => !p.atasan_id).length > 0 && (
                <div className="rounded-md border border-dashed border-line p-2 text-ink/60">
                  <p className="font-medium">PML belum punya Korwil:</p>
                  <p className="mt-0.5">
                    {pmlOptions
                      .filter((p) => !p.atasan_id)
                      .map((p) => p.nama)
                      .join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ===== VISUALISASI KESEIMBANGAN BEBAN ===== */}
      {(ringkasanPpl.length > 0 || ringkasanPml.length > 0 || ringkasanKorwil.length > 0) && (
        <section className="rounded-md border border-line bg-white p-4">
          <h2 className="font-medium text-blue-950">Keseimbangan Beban Tim</h2>
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
                        <span className="flex w-40 shrink-0 items-center gap-1 truncate text-ink/80" title={r.pml_nama}>
                          {r.pml_nama}
                          {r.jumlah_ppl > 0 && r.jumlah_ppl < KAPASITAS_IDEAL_MIN_PPL_PER_PML && (
                            <span
                              title={`Membawahi < ${KAPASITAS_IDEAL_MIN_PPL_PER_PML} PPL (idealnya ${KAPASITAS_IDEAL_MIN_PPL_PER_PML}-${KAPASITAS_MAX_PPL_PER_PML})`}
                              className="shrink-0 text-orange-500"
                            >
                              ⚠
                            </span>
                          )}
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

          {sasaranOptimasi.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => setOptimasiTerbuka((v) => !v)}
                className="flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-ink/50 hover:text-ink/70"
              >
                <span>{optimasiTerbuka ? "▾" : "▸"}</span>
                Optimasi Beban (informasi, bukan otomatis)
              </button>
              {optimasiTerbuka && (
                <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-line bg-gray-50 p-2.5 text-xs text-ink/70">
                  <p className="text-[11px] text-ink/50">
                    Saran di bawah HANYA informasi (Sub SLS mana yg paling besar kontribusinya ke beban PPL yg
                    kelebihan, & PPL mana yg saat ini paling longgar) -- tidak ada yang dipindahkan otomatis. Kalau
                    setuju, pindahkan sendiri lewat dropdown PPL di baris terkait pada Langkah 4.
                  </p>
                  {sasaranOptimasi.map((s) => (
                    <div key={s.pplId} className="rounded-md bg-white px-2.5 py-2">
                      <span className="font-medium text-rust-700">{s.namaPpl}</span>{" "}
                      <span className="text-ink/60">
                        (beban {s.beban.toLocaleString("id-ID", { maximumFractionDigits: 1 })})
                      </span>
                      {s.baris ? (
                        <>
                          {" "}
                          — Sub SLS terbesar:{" "}
                          <span className="font-medium text-ink">
                            {s.baris.sls} · {s.baris.sub_sls}
                          </span>{" "}
                          (skor {s.baris.skor_beban_pendataan.toLocaleString("id-ID")})
                          {s.namaKandidat && s.bebanKandidat != null ? (
                            <>
                              {" "}
                              → pertimbangkan pindah ke{" "}
                              <span className="font-medium text-moss-700">{s.namaKandidat}</span> (beban rendah,{" "}
                              {s.bebanKandidat.toLocaleString("id-ID", { maximumFractionDigits: 1 })})
                            </>
                          ) : (
                            <> — belum ada PPL berbeban rendah sbg kandidat saat ini.</>
                          )}
                        </>
                      ) : (
                        <> — tidak ada baris terdeteksi.</>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ===== LANGKAH 4: KERTAS KERJA PLOTTING SUB SLS -> PPL ===== */}
      <section ref={langkah4Ref}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium text-blue-950">Langkah 4 — Kertas Kerja Plotting Sub SLS ke PPL</h2>
            <p className="text-xs text-ink/60">
              {filtered.length} dari {kertasKerja.length} baris wilayah sampel. Pilih PPL &amp; PML bebas dulu
              (trial-error) — kolom &quot;Beban Petugas&quot; langsung berubah tiap kali memilih, TANPA tersimpan ke
              server. Baru tersimpan sesudah menekan &quot;Simpan Perubahan&quot;.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="shrink-0 rounded-md border border-blue-700 bg-white px-3 py-1.5 text-sm font-medium text-blue-900 transition hover:bg-blue-50 disabled:opacity-40"
          >
            Export ke Excel
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2">
          <span className="text-xs text-ink/70">
            Rata-rata beban per PPL (total skor {totalSkorWilayahTugas.toLocaleString("id-ID", { maximumFractionDigits: 0 })} ÷ {TOTAL_PPL_TETAP} PPL tetap):{" "}
            <strong className="text-blue-950">{rataBebanTetap.toLocaleString("id-ID", { maximumFractionDigits: 1 })}</strong>
          </span>
          <span className="ml-auto flex items-center gap-2">
            {jumlahPerubahanPending > 0 && (
              <button
                type="button"
                onClick={() => setDiffTerbuka((v) => !v)}
                className="rounded-full bg-orange-200 px-2.5 py-1 text-xs font-medium text-orange-800 hover:bg-orange-300"
              >
                {jumlahPerubahanPending} perubahan belum disimpan {diffTerbuka ? "▾" : "▸"}
              </button>
            )}
            <button
              type="button"
              disabled={jumlahPerubahanPending === 0 || simpanBusy}
              onClick={batalkanSemuaPerubahan}
              className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/70 transition hover:bg-gray-50 disabled:opacity-40"
            >
              ↺ Batalkan Perubahan
            </button>
            <button
              type="button"
              disabled={jumlahPerubahanPending === 0 || simpanBusy}
              onClick={handleSimpanPerubahan}
              className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
            >
              {simpanBusy ? "Menyimpan..." : "💾 Simpan Perubahan"}
            </button>
          </span>
        </div>

        {diffTerbuka && daftarPerubahanPending.length > 0 && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-blue-100 bg-blue-50/40 p-2">
            <ul className="flex flex-col gap-1 text-xs text-ink/70">
              {daftarPerubahanPending.map((d, i) => (
                <li key={i}>
                  <span className="font-medium text-ink/80">{d.label}:</span> {d.dari} → <strong>{d.ke}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {simpanError && (
          <p className="mt-2 rounded-md bg-rust-100 px-3 py-2 text-xs text-rust-700">{simpanError}</p>
        )}
        {kertasKerja.length === 0 && (
          <p className="mt-2 rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-700">
            Belum ada baris. Centang dulu wilayah sampel di Langkah 1.
          </p>
        )}

        {(jumlahTanpaDataKk > 0 || jumlahTanpaKoordinat > 0 || jumlahBelumDiplot > 0) && kertasKerja.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-ink/60">Data belum lengkap:</span>
            {jumlahTanpaDataKk > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDataFilter("belum");
                  setPage(1);
                }}
                className="rounded-full bg-rust-50 px-2.5 py-1 text-xs font-medium text-rust-700 hover:bg-rust-100"
              >
                ⚠ {jumlahTanpaDataKk} SLS belum ada data KK
              </button>
            )}
            {jumlahTanpaKoordinat > 0 && (
              <span
                className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-ink/60"
                title="Lokasi rumah petugas blm diisi/diverifikasi -- skor jarak blm dihitung dari data riil"
              >
                ⚪ {jumlahTanpaKoordinat} SLS belum ada koordinat jarak
              </span>
            )}
            {jumlahBelumDiplot > 0 && (
              <button
                type="button"
                onClick={filterKeBelumDiplot}
                className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-ink/60 hover:bg-gray-200"
              >
                ☐ {jumlahBelumDiplot} SLS belum diplot
              </button>
            )}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-ink/60">Quick filter:</span>
          <button
            type="button"
            onClick={() => {
              setStatusBebanFilter("");
              setStatusPlotFilter("");
              setHanyaBerubahFilter(false);
              setPage(1);
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              !statusBebanFilter && !statusPlotFilter && !hanyaBerubahFilter
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-ink/60 hover:bg-gray-200"
            }`}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => filterKeStatusBeban(statusBebanFilter === "perhatian" ? "" : "perhatian")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              statusBebanFilter === "perhatian" ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            ⚠ Perlu Perhatian
          </button>
          <button
            type="button"
            onClick={() => filterKeStatusBeban(statusBebanFilter === "kelebihan" ? "" : "kelebihan")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              statusBebanFilter === "kelebihan" ? "bg-rust-500 text-white" : "bg-rust-50 text-rust-700 hover:bg-rust-100"
            }`}
          >
            🔴 PPL Kelebihan
          </button>
          <button
            type="button"
            onClick={() => filterKeStatusBeban(statusBebanFilter === "rendah" ? "" : "rendah")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              statusBebanFilter === "rendah" ? "bg-violet-500 text-white" : "bg-violet-50 text-violet-700 hover:bg-violet-100"
            }`}
          >
            🟣 PPL Beban Rendah
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusPlotFilter((v) => (v === "belum" ? "" : "belum"));
              setStatusBebanFilter("");
              setPage(1);
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              statusPlotFilter === "belum" ? "bg-ink text-white" : "bg-gray-100 text-ink/60 hover:bg-gray-200"
            }`}
          >
            ☐ Belum Diplot
          </button>
          <button
            type="button"
            onClick={() => {
              setHanyaBerubahFilter((v) => !v);
              setPage(1);
            }}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              hanyaBerubahFilter ? "bg-ink text-white" : "bg-gray-100 text-ink/60 hover:bg-gray-200"
            }`}
          >
            ✎ Ada Perubahan
          </button>
          <button
            type="button"
            onClick={() => setModeFokus((v) => !v)}
            className="ml-auto rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink/70 hover:bg-gray-50"
            title="Sembunyikan kolom sekunder supaya fokus ke plotting"
          >
            {modeFokus ? "⊞ Tampilan Lengkap" : "⊞ Mode Fokus"}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <LegendaStatusBeban withBelum />
          <div className="flex items-center gap-1.5 text-xs text-ink/60">
            <span>Tampilkan:</span>
            <select
              value={alokasiPageSize === Infinity ? "semua" : alokasiPageSize}
              onChange={(e) => {
                setAlokasiPageSize(e.target.value === "semua" ? Infinity : Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-blue-400"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value="semua">Semua</option>
            </select>
            <span>baris</span>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-3 rounded-md border border-line bg-white p-3 sm:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-ink/60">Filter Kecamatan</label>
            <select
              value={kecFilter}
              onChange={(e) => {
                setKecFilter(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
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
            <Combobox
              value={pplFilter === "" ? null : pplFilter}
              onChange={(v) => {
                setPplFilter(v ?? "");
                setPage(1);
              }}
              options={pplOptions.map((p) => ({ value: p.id, label: p.nama }))}
              placeholder="Semua PPL"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink/60">Filter PML</label>
            <Combobox
              value={pmlFilterLangkah4 === "" ? null : pmlFilterLangkah4}
              onChange={(v) => {
                setPmlFilterLangkah4(v ?? "");
                setPage(1);
              }}
              options={pmlOptions.map((p) => ({ value: p.id, label: p.nama }))}
              placeholder="Semua PML"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink/60">Status Beban PPL</label>
            <select
              value={statusBebanFilter}
              onChange={(e) => {
                setStatusBebanFilter(e.target.value as "" | BalanceTone);
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            >
              <option value="">Semua</option>
              <option value="seimbang">🟢 Seimbang</option>
              <option value="perhatian">🟡 Perhatian</option>
              <option value="kelebihan">🔴 Kelebihan</option>
              <option value="rendah">🟣 Beban Rendah</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink/60">Status Plot</label>
            <select
              value={statusPlotFilter}
              onChange={(e) => {
                setStatusPlotFilter(e.target.value as "" | "sudah" | "belum");
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            >
              <option value="">Semua</option>
              <option value="sudah">Sudah diplot</option>
              <option value="belum">Belum diplot</option>
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
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            >
              <option value="">Semua</option>
              <option value="lengkap">Data Lengkap</option>
              <option value="belum">Belum Ada Data</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-ink/60">Cari Nagari/Jorong/Sub SLS</label>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Ketik kata kunci..."
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        <div className="mt-2 max-h-[70vh] overflow-auto rounded-md border border-line">
          <table className="w-full min-w-[1450px] text-left text-sm">
            <thead className="sticky top-0 z-20 bg-blue-50 text-blue-600">
              <tr>
                {!modeFokus && (
                  <ThKontrol
                    label="Kecamatan"
                    sort={{
                      active: sortKey === "kecamatan",
                      dir: sortDir,
                      onAsc: () => sortAsc("kecamatan"),
                      onDesc: () => sortDesc("kecamatan"),
                      onReset: sortReset,
                    }}
                  />
                )}
                {!modeFokus && (
                  <ThKontrol
                    label="Nagari"
                    search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Cari Nagari/Jorong/Sub SLS..." }}
                  />
                )}
                <ThKontrol
                  label="Jorong/SLS"
                  search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Cari Nagari/Jorong/Sub SLS..." }}
                />
                <ThKontrol
                  label="Sub SLS"
                  stickyLeft
                  search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Cari Nagari/Jorong/Sub SLS..." }}
                />
                {!modeFokus && (
                  <ThKontrol
                    label="Data KK"
                    filter={{ options: DATA_KK_OPSI, selected: dataFilterSelected, onApply: terapkanDataFilter }}
                  />
                )}
                {!modeFokus && (
                  <ThKontrol
                    label="Skor Beban Pendataan"
                    sort={{
                      active: sortKey === "skor_beban_pendataan",
                      dir: sortDir,
                      onAsc: () => sortAsc("skor_beban_pendataan"),
                      onDesc: () => sortDesc("skor_beban_pendataan"),
                      onReset: sortReset,
                    }}
                  />
                )}
                {!modeFokus && (
                  <ThKontrol
                    label="Skor Jarak"
                    sort={{
                      active: sortKey === "skor_jarak",
                      dir: sortDir,
                      onAsc: () => sortAsc("skor_jarak"),
                      onDesc: () => sortDesc("skor_jarak"),
                      onReset: sortReset,
                    }}
                  />
                )}
                <ThKontrol
                  label="Skor Beban Akhir"
                  sort={{
                    active: sortKey === "skor_beban_akhir",
                    dir: sortDir,
                    onAsc: () => sortAsc("skor_beban_akhir"),
                    onDesc: () => sortDesc("skor_beban_akhir"),
                    onReset: sortReset,
                  }}
                />
                <ThKontrol
                  label="PPL"
                  filter={{
                    options: petugasList.filter((p) => p.peran === "ppl").map((p) => p.nama),
                    selected: pplFilter ? new Set([petugasList.find((p) => p.id === pplFilter)?.nama ?? ""]) : new Set(),
                    onApply: (next) => {
                      const nama = Array.from(next)[0];
                      const p = nama ? petugasList.find((x) => x.nama === nama) : null;
                      setPplFilter(p ? p.id : "");
                      setPage(1);
                    },
                  }}
                />
                <ThKontrol
                  label="Beban Petugas"
                  sort={{
                    active: sortKey === "beban_ppl",
                    dir: sortDir,
                    onAsc: () => sortAsc("beban_ppl"),
                    onDesc: () => sortDesc("beban_ppl"),
                    onReset: sortReset,
                  }}
                />
                <ThKontrol
                  label="PML"
                  filter={{
                    options: petugasList.filter((p) => p.peran === "pml").map((p) => p.nama),
                    selected:
                      pmlFilterLangkah4 ? new Set([petugasList.find((p) => p.id === pmlFilterLangkah4)?.nama ?? ""]) : new Set(),
                    onApply: (next) => {
                      const nama = Array.from(next)[0];
                      const p = nama ? petugasList.find((x) => x.nama === nama) : null;
                      setPmlFilterLangkah4(p ? p.id : "");
                      setPage(1);
                    },
                  }}
                />
                {!modeFokus && <th className="px-3 py-2 font-medium">Korwil</th>}
                <ThKontrol
                  label="Status"
                  filter={{
                    options: ["Seimbang", "Perhatian", "Kelebihan Beban", "Beban Rendah"],
                    selected: new Set(
                      statusBebanFilter === "seimbang"
                        ? ["Seimbang"]
                        : statusBebanFilter === "perhatian"
                        ? ["Perhatian"]
                        : statusBebanFilter === "kelebihan"
                        ? ["Kelebihan Beban"]
                        : statusBebanFilter === "rendah"
                        ? ["Beban Rendah"]
                        : ["Seimbang", "Perhatian", "Kelebihan Beban", "Beban Rendah"]
                    ),
                    onApply: (next) => {
                      if (next.size === 0 || next.size === 4) setStatusBebanFilter("");
                      else if (next.has("Seimbang")) setStatusBebanFilter("seimbang");
                      else if (next.has("Perhatian")) setStatusBebanFilter("perhatian");
                      else if (next.has("Kelebihan Beban")) setStatusBebanFilter("kelebihan");
                      else if (next.has("Beban Rendah")) setStatusBebanFilter("rendah");
                      setPage(1);
                    },
                  }}
                />
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const draftPplId = draftPpl[r.idsubsls] ?? null;
                const berubah = draftPplId !== (r.ppl_id ?? null);
                const bebanPpl = draftPplId ? bebanDraftPerPpl.get(draftPplId) ?? 0 : null;
                const info = bebanPpl != null ? balanceInfo(bebanPpl, rataBebanTetap) : null;
                const delta = bebanPpl != null && rataBebanTetap > 0 ? bebanPpl - rataBebanTetap : null;
                const draftPmlId = draftPplId ? pmlDraftUntukPpl(draftPplId) : null;
                const korwilNama = korwilNamaUntukPml(draftPmlId);
                const bgBaris = berubah ? "bg-orange-50/50" : "bg-white";
                const petugasDraftPpl = draftPplId ? petugasList.find((x) => x.id === draftPplId) : undefined;
                const statusKesediaan = statusKesediaanPpl(petugasDraftPpl);
                return (
                  <tr key={r.idsubsls} className={`border-t border-line ${bgBaris}`}>
                    {!modeFokus && <td className="px-3 py-2 text-ink/80">{r.kecamatan}</td>}
                    {!modeFokus && <td className="px-3 py-2 text-ink/80">{r.nagari}</td>}
                    <td className="px-3 py-2 font-medium text-ink">{r.sls}</td>
                    <td className={`sticky left-0 z-10 px-3 py-2 text-ink/80 ${bgBaris}`}>{r.sub_sls}</td>
                    {!modeFokus && (
                      <td className="px-3 py-2">
                        <BadgeDataKk punya={r.punya_data_kk} />
                      </td>
                    )}
                    {!modeFokus && (
                      <td className="px-3 py-2 text-ink/80">{r.skor_beban_pendataan.toLocaleString("id-ID")}</td>
                    )}
                    {!modeFokus && (
                      <td className="px-3 py-2 text-ink/80">
                        {r.jarak_status === "riil" ? (
                          <span
                            title={`Jarak dihitung dari titik Sub SLS ke lokasi rumah petugas (OSRM/garis lurus), dikali perkiraan ${r.jumlah_hari_kerja} hari kerja (PP tiap hari, tidak menginap)`}
                          >
                            {r.skor_jarak.toLocaleString("id-ID")} ({r.jarak_km?.toLocaleString("id-ID")} km × {r.jumlah_hari_kerja} hari)
                          </span>
                        ) : (
                          <span className="text-xs text-ink/40" title="Lokasi rumah petugas blm diisi/diverifikasi">
                            ⚪ belum tersedia
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium text-ink">{r.skor_beban_akhir.toLocaleString("id-ID")}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Combobox
                          disabled={pplOptions.length === 0}
                          value={draftPplId ?? null}
                          onChange={(val) => setDraftPpl((prev) => ({ ...prev, [r.idsubsls]: val }))}
                          options={pplOptions.map((p) => ({ value: p.id, label: infoPplUntukBaris(p, r) }))}
                          placeholder="Plot ke PPL..."
                          className="w-48"
                        />
                        {statusKesediaan && <IkonStatusKesediaanPpl status={statusKesediaan} />}
                        {draftPplId && (
                          <button
                            type="button"
                            onClick={() => setDraftPpl((prev) => ({ ...prev, [r.idsubsls]: null }))}
                            title="Lepas plot Sub SLS ini (belum tersimpan sampai Simpan Perubahan ditekan)"
                            className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-ink/60 hover:bg-gray-200"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {bebanPpl != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-semibold text-ink">
                            {bebanPpl.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                          </span>
                          {info && delta != null && (
                            <span className={`text-[10px] font-medium ${info.cls}`}>
                              {delta >= 0 ? "+" : ""}
                              {delta.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-ink/40">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Combobox
                        disabled={!draftPplId || pmlOptions.length === 0}
                        value={draftPmlId ?? null}
                        onChange={(val) => {
                          if (draftPplId) setDraftPmlByPpl((prev) => ({ ...prev, [draftPplId]: val }));
                        }}
                        options={pmlOptions.map((p) => {
                          const jumlah = jumlahPplPerPmlDraft.get(p.id) ?? 0;
                          const sudahPunyaIni = draftPmlId === p.id;
                          const penuh = jumlah >= KAPASITAS_MAX_PPL_PER_PML && !sudahPunyaIni;
                          return {
                            value: p.id,
                            label: `${p.nama}${penuh ? ` (penuh - ${KAPASITAS_MAX_PPL_PER_PML} PPL)` : ""}`,
                            disabled: penuh,
                          };
                        })}
                        placeholder="Pilih PML..."
                        className="w-40"
                      />
                    </td>
                    {!modeFokus && (
                      <td className="px-3 py-2 text-ink/80">
                        {korwilNama ?? <span className="text-xs text-ink/40">-</span>}
                      </td>
                    )}
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-col gap-0.5">
                        {info && <span className={`font-medium ${info.cls}`}>{info.label}</span>}
                        {berubah && <span className="text-orange-600">belum disimpan</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={modeFokus ? 7 : 13} className="px-3 py-4 text-center text-ink/50">
                    Tidak ada data yang cocok dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {sorted.length > 0 && (
          <div className="mt-2 flex items-center justify-between text-sm text-ink/60">
            <span>
              {(pageClamped - 1) * alokasiPageSize + 1}-
              {Math.min(pageClamped * alokasiPageSize, sorted.length)} dari {sorted.length} baris
              {sorted.length !== kertasKerja.length && <> (dari {kertasKerja.length} total)</>}
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
    </div>
  );
}

export default function BencanaPage() {
  const [tab, setTab] = useState<"identifikasi" | "monitoring" | "alokasi" | "master" | "pengaturan">("identifikasi");

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

  // Tandai SATU Sub SLS sbg "terdampak" atau "ragu" -- saling eksklusif (pilih
  // salah satu akan menghapus tanda dari status yg lain), klik ulang pada
  // status yg sama akan membatalkannya (kembali ke "tidak ditandai").
  function toggleSubslsStatus(idsls: string, idsubsls: string, status: "terdampak" | "ragu") {
    const cur = getJorongState(idsls);
    const nextTerdampak = new Set(cur.checkedSubsls);
    const nextRagu = new Set(cur.raguSubsls);
    if (status === "terdampak") {
      if (nextTerdampak.has(idsubsls)) {
        nextTerdampak.delete(idsubsls);
      } else {
        nextTerdampak.add(idsubsls);
        nextRagu.delete(idsubsls);
      }
    } else {
      if (nextRagu.has(idsubsls)) {
        nextRagu.delete(idsubsls);
      } else {
        nextRagu.add(idsubsls);
        nextTerdampak.delete(idsubsls);
      }
    }
    updateJorongState(idsls, { checkedSubsls: nextTerdampak, raguSubsls: nextRagu });
  }

  function setPerkiraanKkSubsls(idsls: string, idsubsls: string, value: string) {
    const cur = getJorongState(idsls);
    const next = { ...cur.perkiraanKkSubsls };
    if (value === "") {
      next[idsubsls] = "";
    } else {
      const num = Math.max(0, Math.floor(Number(value)));
      next[idsubsls] = Number.isFinite(num) ? num : "";
    }
    updateJorongState(idsls, { perkiraanKkSubsls: next });
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
    if (state.jawaban === null) return;
    if (state.jawaban === "sebagian" && state.checkedSubsls.size === 0 && state.raguSubsls.size === 0) {
      updateJorongState(jorong.idsls, {
        error:
          "Pilih minimal satu Sub SLS (terdampak atau ragu), atau tandai seluruh Sub SLS terdampak / tidak ada yang terdampak.",
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
          seluruh_subsls_terdampak: state.jawaban === "seluruh",
          tidak_ada_terdampak: state.jawaban === "tidak_ada",
          subsls_terdampak: Array.from(state.checkedSubsls),
          subsls_ragu: Array.from(state.raguSubsls),
          perkiraan_kk_subsls: Object.fromEntries(
            Object.entries(state.perkiraanKkSubsls).filter(([, v]) => typeof v === "number")
          ),
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
        tab === "alokasi" || tab === "master"
          ? "max-w-[1800px]"
          : tab === "monitoring"
          ? "max-w-6xl"
          : tab === "pengaturan"
          ? "max-w-4xl"
          : "max-w-2xl"
      }`}
    >
      <p className="text-sm font-medium text-blue-400">BPS Kabupaten Solok</p>
      <h1 className="mt-1 text-2xl font-semibold text-blue-950">
        Identifikasi SLS/Jorong Terdampak Bencana Hidrometeorologi
      </h1>
      <p className="mt-2 text-sm text-ink/70">
        Bencana banjir dan hidrometeorologi lainnya akhir 2025 lalu berdampak pada
        sebagian wilayah Kabupaten Solok. Mohon bantuan Bapak/Ibu mitra untuk
        mengidentifikasi Jorong/Sub SLS yang terdampak di wilayah tugas
        masing-masing.
      </p>

      <div className="mt-6 flex gap-1 rounded-md bg-blue-50 p-1">
        <button
          type="button"
          onClick={() => setTab("identifikasi")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "identifikasi"
              ? "bg-white text-blue-950 shadow-sm"
              : "text-blue-400 hover:text-blue-600"
          }`}
        >
          Identifikasi
        </button>
        <button
          type="button"
          onClick={() => setTab("monitoring")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "monitoring"
              ? "bg-white text-blue-950 shadow-sm"
              : "text-blue-400 hover:text-blue-600"
          }`}
        >
          Monitoring Hasil Identifikasi
        </button>
        <button
          type="button"
          onClick={() => setTab("alokasi")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "alokasi"
              ? "bg-white text-blue-950 shadow-sm"
              : "text-blue-400 hover:text-blue-600"
          }`}
        >
          Alokasi Petugas
        </button>
        <button
          type="button"
          onClick={() => setTab("master")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "master"
              ? "bg-white text-blue-950 shadow-sm"
              : "text-blue-400 hover:text-blue-600"
          }`}
        >
          Master Petugas
        </button>
        <button
          type="button"
          onClick={() => setTab("pengaturan")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "pengaturan"
              ? "bg-white text-blue-950 shadow-sm"
              : "text-blue-400 hover:text-blue-600"
          }`}
        >
          ⚙️ Kelola Perkiraan Beban
        </button>
      </div>

      {tab === "alokasi" ? (
        <AlokasiPetugasSection />
      ) : tab === "master" ? (
        <MasterPetugasSection />
      ) : tab === "pengaturan" ? (
        <PengaturanBebanSection />
      ) : tab === "identifikasi" ? (
        <div className="mt-6 flex flex-col gap-6">
          <section className="rounded-md border border-line bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-blue-400">
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
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
              <datalist id="daftar-mitra">
                {mitraList.map((m) => (
                  <option key={m.id} value={m.nama} />
                ))}
              </datalist>
              {matchedMitra?.saran_in_scope && matchedMitra.saran_iddesa && (
                <p className="mt-1 text-xs text-blue-400">
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
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
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
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
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
                      className="flex-1 rounded-md bg-blue-700 px-4 py-2.5 font-medium text-white transition hover:bg-blue-600 disabled:opacity-60"
                    >
                      Ya, ada
                    </button>
                    <button
                      type="button"
                      disabled={gateSubmitting}
                      onClick={() => submitGate(false)}
                      className="flex-1 rounded-md border border-line bg-white px-4 py-2.5 font-medium text-ink transition hover:border-blue-400 disabled:opacity-60"
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
                      className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
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
                        <p className="font-medium text-blue-950">{jorong.jorong}</p>

                        {state.submitted ? (
                          <p className="mt-2 rounded-md bg-moss-100 px-3 py-2 text-sm text-moss-700">
                            Data Jorong ini tersimpan. Terima kasih.
                          </p>
                        ) : (
                          <>
                            <p className="mt-2 text-sm text-ink">
                              Apakah seluruh Sub SLS Jorong ini terdampak?
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  updateJorongState(jorong.idsls, {
                                    jawaban: "seluruh",
                                    checkedSubsls: new Set(),
                                    raguSubsls: new Set(),
                                    perkiraanKkSubsls: {},
                                    error: null,
                                  })
                                }
                                className={`min-w-[140px] flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                                  state.jawaban === "seluruh"
                                    ? "border-blue-700 bg-blue-700 text-white"
                                    : "border-line bg-white text-ink hover:border-blue-400"
                                }`}
                              >
                                Ya, seluruhnya
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateJorongState(jorong.idsls, {
                                    jawaban: "sebagian",
                                    error: null,
                                  })
                                }
                                className={`min-w-[140px] flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                                  state.jawaban === "sebagian"
                                    ? "border-blue-700 bg-blue-700 text-white"
                                    : "border-line bg-white text-ink hover:border-blue-400"
                                }`}
                              >
                                Ya, sebagian
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateJorongState(jorong.idsls, {
                                    jawaban: "tidak_ada",
                                    checkedSubsls: new Set(),
                                    raguSubsls: new Set(),
                                    perkiraanKkSubsls: {},
                                    error: null,
                                  })
                                }
                                className={`min-w-[140px] flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                                  state.jawaban === "tidak_ada"
                                    ? "border-rust-600 bg-rust-600 text-white"
                                    : "border-line bg-white text-ink hover:border-rust-300"
                                }`}
                              >
                                Tidak ada yang terdampak
                              </button>
                            </div>

                            {state.jawaban === "sebagian" && (
                              <div className="mt-3">
                                <p className="text-sm font-medium text-ink">
                                  Tandai tiap Sub SLS: Terdampak, Ragu, atau biarkan (tidak terdampak):
                                </p>
                                <ul className="mt-2 flex flex-col gap-1.5">
                                  {jorong.subsls.map((s) => {
                                    const statusSub = state.checkedSubsls.has(s.idsubsls)
                                      ? "terdampak"
                                      : state.raguSubsls.has(s.idsubsls)
                                      ? "ragu"
                                      : null;
                                    return (
                                      <li
                                        key={s.idsubsls}
                                        className="rounded-md border border-line bg-white px-3 py-2"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <span className="text-sm text-ink">Sub SLS {s.sub_sls}</span>
                                          <div className="flex gap-1.5">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                toggleSubslsStatus(jorong.idsls, s.idsubsls, "terdampak")
                                              }
                                              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                                                statusSub === "terdampak"
                                                  ? "bg-blue-700 text-white"
                                                  : "bg-gray-100 text-ink/60 hover:bg-gray-200"
                                              }`}
                                            >
                                              Terdampak
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => toggleSubslsStatus(jorong.idsls, s.idsubsls, "ragu")}
                                              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                                                statusSub === "ragu"
                                                  ? "bg-amber-500 text-white"
                                                  : "bg-gray-100 text-ink/60 hover:bg-gray-200"
                                              }`}
                                            >
                                              Ragu
                                            </button>
                                          </div>
                                        </div>
                                        {statusSub && (
                                          <div className="mt-1.5 flex items-center gap-2">
                                            <label className="text-xs text-ink/60">
                                              Perkiraan jumlah keluarga terdampak:
                                            </label>
                                            <input
                                              type="number"
                                              min={0}
                                              step={1}
                                              value={state.perkiraanKkSubsls[s.idsubsls] ?? ""}
                                              onChange={(e) =>
                                                setPerkiraanKkSubsls(jorong.idsls, s.idsubsls, e.target.value)
                                              }
                                              placeholder="0"
                                              className="w-24 rounded-md border border-line bg-white px-2 py-1 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
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

                            {(state.jawaban === "seluruh" || state.jawaban === "sebagian") && (
                              <div className="mt-3">
                                <p className="text-sm font-medium text-ink">
                                  Indikator dampak (opsional, boleh lebih dari satu)
                                </p>
                                <ul className="mt-2 flex flex-col gap-1.5">
                                  {INDIKATOR_DAMPAK.map((ind) => {
                                    const checked = state.indikator.has(ind.key);
                                    return (
                                      <li key={ind.key}>
                                        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-line bg-white px-3 py-2 transition hover:border-blue-400">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleIndikator(jorong.idsls, ind.key)}
                                            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-700"
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
                                              className="w-24 rounded-md border border-line bg-white px-2 py-1 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
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

                            {state.jawaban !== null && (
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
                                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                                />
                              </div>
                            )}

                            {state.error && (
                              <p className="mt-2 rounded-md bg-rust-100 px-3 py-2 text-sm text-rust-700">
                                {state.error}
                              </p>
                            )}

                            {state.jawaban !== null && (
                              <button
                                type="button"
                                disabled={state.submitting}
                                onClick={() => submitJorong(jorong)}
                                className="mt-3 w-full rounded-md bg-blue-700 px-4 py-2.5 font-medium text-white transition hover:bg-blue-600 disabled:opacity-60"
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
                  <h2 className="text-lg font-semibold text-blue-950">Progress Identifikasi</h2>
                  <p className="text-sm text-ink/60">
                    Rekap pelaksanaan identifikasi Jorong/Sub SLS terdampak bencana
                    hidrometeorologi akhir 2025, mencakup seluruh {totalNagariMon} nagari
                    di Kabupaten Solok.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-blue-900 px-3 py-1.5 text-xs font-medium text-white">
                  Data terakhir diperbarui: {formatTanggal(lastUpdatedMon)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard
                  ikon="📍"
                  warna="bg-blue-100 text-blue-900"
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
                <h3 className="font-medium text-blue-950">Progress Identifikasi Jorong</h3>
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
                  <h3 className="font-medium text-blue-950">Progress per Kecamatan</h3>
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
                      <h3 className="font-medium text-blue-950">Nagari Belum Diidentifikasi</h3>
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
                      <h3 className="font-medium text-blue-950">Nagari dengan Konflik Data</h3>
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
