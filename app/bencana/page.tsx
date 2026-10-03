"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { haversineKm } from "@/lib/jarakJalan";

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

type SubslsItem = { idsubsls: string; sub_sls: string; lat: number | null; lng: number | null };
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

type PegawaiMagangItem = { id: number; nama: string };

type MonitoringMagangRow = {
  id: number;
  nama: string;
  jumlah_hari_ini: number;
  jumlah_total: number;
  terakhir_diisi: string | null;
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
  // (3 Okt 2026) Pecah Sub SLS: null = baris biasa (1 Sub SLS = 1 PPL, tidak
  // berubah). Terisi = ini SALAH SATU bagian dari Sub SLS yg dipecah ke
  // beberapa PPL -- jumlah KK langsung yg jadi tanggung jawab PPL baris ini
  // (skor_beban_pendataan/skor_jarak/skor_beban_akhir di baris ini SUDAH
  // diprorata server sesuai porsi_kk / kk_total, lihat bencana_kertas_
  // kerja_alokasi()). Beberapa baris bisa berbagi idsubsls yg sama.
  porsi_kk: number | null;
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
  // (3 Okt 2026) 2 flag manual (diisi admin di tab Kegiatan Petugas) --
  // dipakai utk MENGECUALIKAN mitra ybs dari Tier 1/2 popover "Saran" & dari
  // kandidat "Auto Plot" (lihat tier1/tier2 di SaranMitraTombol & kandidat
  // di hitungSaranAutoPlot). Tetap bisa diplot manual lewat dropdown.
  rekomendasi_pml: boolean;
  red_flag_kinerja: boolean;
  kegiatan_lain: string[];
  lat: number | null;
  lng: number | null;
  // (3 Okt 2026) Hasil penilaian kinerja mitra SE2026 -- dipakai Langkah 4
  // utk warna gradasi nama PPL & ikon nilai/catatan (lihat IkonNilaiKinerja).
  nilai_kinerja: number | null;
  catatan_kinerja: string | null;
};

// Titik koordinat (centroid/geotag) per Sub SLS -- dipakai utk menghitung
// jarak garis lurus (haversine) dari lokasi rumah kandidat PPL ke Sub SLS
// baris itu, utk pengurutan popover "Saran" Langkah 4 (lihat jarakJalan.ts).
type TitikSubsls = { idsubsls: string; lat: number | null; lng: number | null };

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
      {buka &&
        pos &&
        // (3 Okt 2026) Dipindah ke React Portal (document.body) -- dilaporkan
        // user: popover ini "ketutup" di "Tampilan Padat". SEBELUMNYA panel
        // ini anak DOM dari <td> baris tabel walau sudah `position: fixed`,
        // jadi tetap ikut mewarisi CSS tabel leluhurnya & ketiban stacking
        // context sel-sel sticky (z-30) di sampingnya -- persis bug yg sama
        // yg sudah diperbaiki sebelumnya utk SaranMitraTombol/Combobox/
        // ThKontrol/IkonNilaiKinerja (lihat komentar di situ). Portal ke
        // document.body melepaskan panel ini total dari tabel.
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 260 }}
            className="z-50 rounded-md border border-line bg-white p-2.5 text-left text-xs normal-case leading-normal shadow-lg"
          >
            <p className={`font-semibold ${warna}`}>{judul}</p>
            {status.tipe === "belum_konfirmasi" ? (
              <p className="mt-1 text-ink/70">
                Nama ini tidak ada di daftar self-report kesediaan ikut pendataan bencana. Perlu dihubungi utk
                ditawarkan &amp; diminta konfirmasi kesediaannya.
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
          </div>,
          document.body
        )}
    </div>
  );
}

// Satu badge kecil PER kegiatan lain (bukan satu ikon gabungan) -- supaya
// pas admin sedang mem-plot PPL, langsung kelihatan tanpa perlu klik
// kegiatan APA SAJA yg sudah dipegang petugas itu (mis. "PES SE2026" dan
// "SPDT NTP 2026" tampil terpisah, bukan digabung jadi satu teks). Admin
// yg memutuskan sendiri tetap plot dobel (merangkap) atau pilih petugas
// lain -- badge ini murni informasi, bukan larangan otomatis.
function BadgeKegiatanLain({ kegiatan }: { kegiatan: string }) {
  return (
    <span
      title={`Petugas ini sudah bertugas/terdaftar di kegiatan "${kegiatan}". Boleh saja dirangkap (merangkap), tapi pertimbangkan beban kerjanya -- putuskan tetap plot dobel atau koreksi ke petugas lain.`}
      className="shrink-0 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-medium text-orange-700"
    >
      ⚠ {kegiatan}
    </span>
  );
}

// (2 Okt 2026) Tombol "💡 Saran" di kolom PPL Langkah 4 -- permintaan user
// "tambahkan tombol kolom saran mitra yang diambil dari daftar Mengajukan
// Diri sebagai tier 1 dan PES SE2026 sebagai tier 2". Popover kecil (pola &
// perilaku tutup sama dgn IkonStatusKesediaanPpl/ThKontrol) berisi 2
// kelompok kandidat PPL (dari pplOptions yg SAMA dgn isi dropdown Combobox
// di kolom ini, jadi tidak pernah menyarankan org di luar daftar resmi):
//   - Tier 1: pendaftaran_bencana_konfirmasi = true (sudah mengajukan diri
//     ikut pendataan bencana lewat form self-report).
//   - Tier 2: BELUM mengajukan diri TAPI terdaftar ikut kegiatan "PES
//     SE2026" (kegiatan_lain) -- dipakai sbg cadangan kalau Tier 1 kosong/
//     tidak cukup, sesuai permintaan user.
// Tiap kelompok diurutkan dari beban draft PALING RINGAN dulu (konsisten
// dgn semangat "beban rendah" yg sudah dipakai di saran rebalancing
// Langkah 3) supaya saran yg muncul duluan jg membantu pemerataan beban,
// bukan cuma asal urutan nama.
//
// SENGAJA tombol SARAN, bukan plotting otomatis -- klik nama HANYA mengisi
// draftPpl (field yg sama persis dgn kalau admin pilih manual dari
// Combobox), TETAP perlu "Simpan Perubahan" & TETAP bisa diganti lagi
// sebelum itu. Konsisten dgn aturan baku proyek ini: tidak ada fitur
// alokasi otomatis/algoritmik utk PPL/PML/Korwil -- keputusan akhir selalu
// di tangan admin lewat klik manual.
function SaranMitraTombol({
  pplOptions,
  bebanDraftPerPpl,
  rataBebanTetap,
  pplTerpilihId,
  onPilih,
  subslsPoint,
}: {
  pplOptions: PetugasRingkas[];
  bebanDraftPerPpl: Map<number, number>;
  // (3 Okt 2026) Rata-rata beban tim (total skor wilayah tugas / asumsi
  // jumlah PPL) -- dipakai di sini SEMATA utk mewarnai/menandai skor beban
  // tiap kandidat di popover (lihat balanceInfo), SAMA seperti warna yg
  // dipakai di panel "Keseimbangan Beban per PPL". TIDAK mengubah urutan
  // tier1/tier2 (tetap jarak dulu) -- keputusan tetap di tangan admin, cuma
  // sekarang kelihatan jelas kalau kandidat terdekat ternyata sudah
  // kelebihan beban, sesuai masukan user.
  rataBebanTetap: number;
  pplTerpilihId: number | null;
  onPilih: (id: number) => void;
  // (2 Okt 2026) Titik koordinat Sub SLS baris ini -- dipakai utk mengurutkan
  // tier1/tier2 berdasarkan jarak garis lurus (haversine) dari lokasi rumah
  // tiap kandidat PPL ke Sub SLS ini, BUKAN beban kerja lagi (lihat
  // jarakDraftPerPpl di bawah & komentar di route.ts/jarakJalan.ts). null
  // kalau titik Sub SLS belum tersedia -> fallback ke urutan semula.
  subslsPoint: { lat: number; lng: number } | null;
}) {
  const [buka, setBuka] = useState(false);
  // (3 Okt 2026) top/bottom dibuat saling eksklusif (salah satu null) supaya
  // panel bisa "dibalik" ke ATAS tombol kalau ruang di bawah tidak cukup --
  // dilaporkan user: "pop up saran ketutup" utk baris dekat ujung bawah area
  // scroll tabel Langkah 4. maxHeight dihitung dari ruang yg benar2 tersedia
  // (bukan konstanta max-h-80 tetap) biar panel tidak ikut terpotong lagi.
  const [pos, setPos] = useState<{
    top: number | null;
    bottom: number | null;
    left: number;
    maxHeight: number;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // (3 Okt 2026) Batas jarak saran -- user minta kandidat yg jaraknya SUDAH
  // DIKETAHUI (lokasi riil, bukan "tidak tersedia") tapi lebih dari 20 km
  // dari Sub SLS ini TIDAK disarankan lagi (sebelumnya daftar ini tidak
  // dibatasi jarak sama sekali). Kandidat yg jaraknya BELUM diketahui (lokasi
  // blm riil, atau titik Sub SLS ini sendiri blm tersedia) TETAP ditampilkan
  // (bukan dibuang) -- cuma tidak bisa diurutkan, biar admin msh bisa pilih
  // manual kalau memang cuma itu kandidatnya, sesuai semangat "saran = bantuan,
  // bukan keputusan otomatis".
  const BATAS_JARAK_SARAN_KM = 20;

  // (3 Okt 2026) Dipisah dari toggle() biar bisa dipakai ULANG saat scroll
  // (lihat useEffect di bawah) -- bukan cuma saat panel pertama dibuka.
  function hitungPosisi(rect: DOMRect) {
    const lebar = 280;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - lebar - 8));
    // Tinggi "ideal" panel -- selaras dgn max-h-80 (320px) yg dipakai
    // sebelumnya. Kalau ruang DI BAWAH tombol tidak cukup (dan ruang di ATAS
    // lebih luas), panel ditampilkan di atas tombol (anchor ke `bottom`,
    // bukan `top`) supaya tidak terpotong oleh tepi bawah viewport / area
    // scroll tabel -- dilaporkan user: "pop up saran ketutup".
    const TINGGI_IDEAL = 320;
    const ruangBawah = window.innerHeight - rect.bottom - 8;
    const ruangAtas = rect.top - 8;
    if (ruangBawah >= TINGGI_IDEAL || ruangBawah >= ruangAtas) {
      setPos({ top: rect.bottom + 4, bottom: null, left, maxHeight: Math.max(120, Math.min(TINGGI_IDEAL, ruangBawah)) });
    } else {
      setPos({
        top: null,
        bottom: Math.max(8, window.innerHeight - rect.top + 4),
        left,
        maxHeight: Math.max(120, Math.min(TINGGI_IDEAL, ruangAtas)),
      });
    }
  }

  useEffect(() => {
    if (!buka) return;
    function tutupJikaDiluar(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setBuka(false);
    }
    // (3 Okt 2026, revisi) SEBELUMNYA scroll apa pun langsung MENUTUP panel.
    // Ternyata itu sumber bug lain: tombol "Saran" yg baru menerima fokus
    // (klik) dekat tepi area scroll tabel bisa memicu browser auto-scroll
    // ("scroll into view") SEGERA setelah panel dibuka -- scroll itu sendiri
    // langsung menutupnya lagi, membuat panel kelihatan "kepotong"/separuh
    // (dilaporkan user lewat screenshot: panel teks kepotong di sisi kiri).
    // Fix: REPOSISI ulang panel saat scroll (bukan ditutup) -- konsisten dgn
    // perbaikan yg sama di Combobox PPL.
    function reposisiSaatScroll() {
      if (ref.current) hitungPosisi(ref.current.getBoundingClientRect());
    }
    document.addEventListener("mousedown", tutupJikaDiluar);
    document.addEventListener("scroll", reposisiSaatScroll, true);
    window.addEventListener("resize", reposisiSaatScroll);
    return () => {
      document.removeEventListener("mousedown", tutupJikaDiluar);
      document.removeEventListener("scroll", reposisiSaatScroll, true);
      window.removeEventListener("resize", reposisiSaatScroll);
    };
  }, [buka]);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (buka) {
      setBuka(false);
      return;
    }
    hitungPosisi(e.currentTarget.getBoundingClientRect());
    setBuka(true);
  }

  // (2 Okt 2026) Jarak garis lurus (haversine) dari lokasi rumah tiap
  // kandidat PPL ke Sub SLS baris ini -- dihitung sekali per render popover
  // di sini (FE, bukan OSRM/BE) krn popover ini bisa dibuka berkali-kali
  // sambil admin mem-plot banyak baris; null kalau lokasi PPL atau titik Sub
  // SLS belum tersedia (lokasi_status bukan "riil", atau lat/lng kosong) --
  // kandidat begini ditaruh di urutan paling akhir, bukan dibuang.
  const jarakPerPpl = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const p of pplOptions) {
      if (!subslsPoint || p.lokasi_status !== "riil" || typeof p.lat !== "number" || typeof p.lng !== "number") {
        map.set(p.id, null);
        continue;
      }
      map.set(p.id, haversineKm(p.lat, p.lng, subslsPoint.lat, subslsPoint.lng));
    }
    return map;
  }, [pplOptions, subslsPoint]);

  // Urutan: jarak ascending dulu (kandidat tanpa jarak terhitung ditaruh
  // paling akhir), lalu beban kerja sbg tie-breaker (konsisten dgn perilaku
  // lama sblm fitur jarak ini ada).
  function bandingkanJarakLaluBeban(a: PetugasRingkas, b: PetugasRingkas) {
    const jarakA = jarakPerPpl.get(a.id) ?? null;
    const jarakB = jarakPerPpl.get(b.id) ?? null;
    if (jarakA !== null && jarakB !== null && jarakA !== jarakB) return jarakA - jarakB;
    if (jarakA !== null && jarakB === null) return -1;
    if (jarakA === null && jarakB !== null) return 1;
    return (bebanDraftPerPpl.get(a.id) ?? 0) - (bebanDraftPerPpl.get(b.id) ?? 0);
  }

  // (3 Okt 2026) Mitra yg ditandai rekomendasi_pml / red_flag_kinerja (tab
  // Kegiatan Petugas) DIKECUALIKAN dari kedua tier -- bukan dihapus dari
  // pplOptions (Combobox tetap menampilkannya, admin tetap bisa plot manual
  // kalau benar2 mau), cuma tidak lagi DISARANKAN di sini.
  const pplOptionsDisaranan = useMemo(
    () => pplOptions.filter((p) => !p.rekomendasi_pml && !p.red_flag_kinerja),
    [pplOptions]
  );
  // Kandidat yg jaraknya SUDAH diketahui TAPI lebih dari BATAS_JARAK_SARAN_KM
  // dibuang; yg jaraknya belum diketahui (null) TETAP lolos filter ini.
  function dalamBatasJarak(p: PetugasRingkas) {
    const jarak = jarakPerPpl.get(p.id) ?? null;
    return jarak === null || jarak <= BATAS_JARAK_SARAN_KM;
  }
  const tier1Semua = useMemo(
    () => pplOptionsDisaranan.filter((p) => p.pendaftaran_bencana_konfirmasi),
    [pplOptionsDisaranan]
  );
  const tier1 = useMemo(
    () => tier1Semua.filter(dalamBatasJarak).sort(bandingkanJarakLaluBeban),
    [tier1Semua, bebanDraftPerPpl, jarakPerPpl]
  );
  const tier2Semua = useMemo(
    () =>
      pplOptionsDisaranan
        // (p.kegiatan_lain ?? []) -- JAGA-JAGA konsisten dgn statusKesediaanPpl()
        // di atas: field ini SELALU array dari API, tapi kalau browser masih
        // menjalankan JS versi baru dgn JSON hasil fetch yg sempat ke-cache dari
        // versi lama (sblm kegiatan_lain ditambahkan ke respons), field ini bisa
        // undefined sesaat -- lihat crash "Cannot read properties of undefined
        // (reading 'includes')" yg dilaporkan user pasca deploy fitur ini.
        .filter((p) => !p.pendaftaran_bencana_konfirmasi && (p.kegiatan_lain ?? []).includes("PES SE2026")),
    [pplOptionsDisaranan]
  );
  const tier2 = useMemo(
    () => tier2Semua.filter(dalamBatasJarak).sort(bandingkanJarakLaluBeban),
    [tier2Semua, bebanDraftPerPpl, jarakPerPpl]
  );
  // (3 Okt 2026) Pesan "kosong" dibedakan: tidak ada kandidat sama sekali vs
  // ada kandidat tapi semua di luar radius 20 km (biar admin tahu alasannya,
  // bukan dikira tidak ada mitra sama sekali).
  const tier1Kosong =
    tier1Semua.length === 0
      ? "Belum ada mitra yang mengajukan diri."
      : `Ada ${tier1Semua.length} mitra yang mengajukan diri, tapi semuanya lebih dari ${BATAS_JARAK_SARAN_KM} km dari Sub SLS ini.`;
  const tier2Kosong =
    tier2Semua.length === 0
      ? "Tidak ada kandidat cadangan dari peserta PES SE2026."
      : `Ada ${tier2Semua.length} kandidat PES SE2026, tapi semuanya lebih dari ${BATAS_JARAK_SARAN_KM} km dari Sub SLS ini.`;

  function pilih(id: number) {
    onPilih(id);
    setBuka(false);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        title={`Lihat saran mitra (maks ${BATAS_JARAK_SARAN_KM} km): Tier 1 dari yang sudah Mengajukan Diri, Tier 2 dari peserta PES SE2026`}
        className="shrink-0 rounded-full bg-moss-100 px-1.5 py-0.5 text-[10px] font-medium text-moss-700 hover:bg-moss-200"
      >
        💡 Saran
      </button>
      {buka &&
        pos &&
        createPortal(
          // (3 Okt 2026, revisi 2) Dipindah ke React Portal (document.body)
          // -- sebelumnya panel ini tetap anak DOM dari <td> baris tabel
          // walau posisinya `position: fixed`, jadi dia masih IKUT MEWARISI
          // CSS dari leluhurnya. Di "Tampilan Padat" ada aturan
          // `.tabel-alokasi-padat td { font-size: 11px !important;
          // line-height: 1.25 !important }` yg ikut ke-WARIS ke teks di
          // dalam panel ini (krn font-size/line-height itu properti yg
          // diwariskan), bikin baris-baris daftar kandidat jadi rapat &
          // kelihatan "tumpang tindih"/kepotong (dilaporkan user: "kenapa
          // masih begini saat pilih tampilan padat"). Portal ke document.body
          // membuat panel ini jadi saudara dari <body>, bukan lagi turunan
          // tabel, jadi lepas total dari override CSS tabel manapun -- sama
          // sekalian menghapus semua jenis clipping/stacking-context dari
          // leluhur tabel (overflow-auto, sticky z-index, dst).
          <div
            style={{
              position: "fixed",
              top: pos.top ?? undefined,
              bottom: pos.bottom ?? undefined,
              left: pos.left,
              width: 280,
              maxHeight: pos.maxHeight,
            }}
            className="z-50 overflow-y-auto rounded-md border border-line bg-white p-2.5 text-left text-xs normal-case leading-normal shadow-lg"
          >
            <p className="mb-1.5 text-[10px] text-ink/50">
              Saran murni bantuan memilih (bukan plotting otomatis), dibatasi radius {BATAS_JARAK_SARAN_KM} km -- klik
              nama utk mengisi kolom PPL, tetap perlu &quot;Simpan Perubahan&quot;.
            </p>
            <SaranMitraKelompok
              judul="Tier 1 — Mengajukan Diri"
              warna="text-moss-700"
              daftar={tier1}
              pplTerpilihId={pplTerpilihId}
              jarakPerPpl={jarakPerPpl}
              bebanDraftPerPpl={bebanDraftPerPpl}
              rataBebanTetap={rataBebanTetap}
              adaTitikSubsls={subslsPoint !== null}
              onPilih={pilih}
              kosong={tier1Kosong}
            />
            <div className="my-1.5 border-t border-line" />
            <SaranMitraKelompok
              judul="Tier 2 — Ikut PES SE2026"
              warna="text-blue-700"
              daftar={tier2}
              pplTerpilihId={pplTerpilihId}
              jarakPerPpl={jarakPerPpl}
              bebanDraftPerPpl={bebanDraftPerPpl}
              rataBebanTetap={rataBebanTetap}
              adaTitikSubsls={subslsPoint !== null}
              onPilih={pilih}
              kosong={tier2Kosong}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

function SaranMitraKelompok({
  judul,
  warna,
  daftar,
  pplTerpilihId,
  jarakPerPpl,
  bebanDraftPerPpl,
  rataBebanTetap,
  adaTitikSubsls,
  onPilih,
  kosong,
}: {
  judul: string;
  warna: string;
  daftar: PetugasRingkas[];
  pplTerpilihId: number | null;
  jarakPerPpl: Map<number, number | null>;
  bebanDraftPerPpl: Map<number, number>;
  rataBebanTetap: number;
  // (3 Okt 2026) Dipakai HANYA utk membedakan pesan kalau jarak tidak
  // tersedia -- false berarti titik Sub SLS baris ini sendiri belum ada,
  // jadi SEMUA kandidat (bukan cuma satu org) pasti tanpa jarak; true berarti
  // titik Sub SLS-nya ada tapi kandidat ybs yg lokasi rumahnya belum riil.
  // Ditambahkan supaya laporan "jarak kosong tapi lokasi mitra sudah riil di
  // database" lebih gampang dilacak lewat pesan yg ditampilkan sendiri.
  adaTitikSubsls: boolean;
  onPilih: (id: number) => void;
  kosong: string;
}) {
  const BATAS_TAMPIL = 8;
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${warna}`}>{judul}</p>
      {daftar.length === 0 ? (
        <p className="mt-0.5 text-[11px] text-ink/40">{kosong}</p>
      ) : (
        // (2 Okt 2026) Redesain atas masukan user: nama ditulis MENONJOL/jelas
        // (bukan teks biasa di dalam satu tombol besar yg kurang kelihatan bisa
        // diklik), DISERTAI tombol "Terapkan" eksplisit terpisah -- klik tombol
        // itu yg mengisi draftPpl (otomatis ikut mengisi dropdown Combobox PPL
        // di baris ybs, krn keduanya SATU state yg sama, lihat onPilih di
        // SaranMitraTombol). Baris yg SUDAH terpilih ditandai jelas (latar +
        // label "✓ Dipilih") drpd tombol disabled polos spt sebelumnya.
        <ul className="mt-0.5 space-y-1">
          {daftar.slice(0, BATAS_TAMPIL).map((p) => {
            const sudahDipilih = p.id === pplTerpilihId;
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 ${
                  sudahDipilih ? "bg-moss-50" : "hover:bg-paper/70"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-navy-900">{p.nama}</p>
                  <p className="text-[10px] text-ink/40">
                    {(() => {
                      const jarak = jarakPerPpl.get(p.id) ?? null;
                      if (jarak !== null) {
                        return `± ${jarak.toLocaleString("id-ID", { maximumFractionDigits: 1 })} km dari Sub SLS ini`;
                      }
                      return adaTitikSubsls
                        ? "Jarak tidak tersedia (lokasi mitra ini belum riil)"
                        : "Jarak tidak tersedia (titik Sub SLS ini belum tersedia)";
                    })()}
                  </p>
                  {/* (3 Okt 2026) Skor beban SAAT INI (termasuk perubahan draft
                      yg belum disimpan) ditampilkan BOLD + diwarnai sesuai
                      balanceInfo -- supaya kelihatan jelas kalau kandidat
                      terdekat ternyata beban kerjanya SUDAH kelebihan, bukan
                      cuma diam-diam tetap nangkring di urutan atas. Saran ini
                      tetap murni bantuan: tidak menyingkirkan kandidat
                      kelebihan beban dari daftar, admin yg memutuskan. */}
                  {(() => {
                    const beban = bebanDraftPerPpl.get(p.id) ?? 0;
                    const info = balanceInfo(beban, rataBebanTetap);
                    return (
                      <p className={`text-[10px] font-bold ${info.cls}`}>
                        Beban: {beban.toLocaleString("id-ID", { maximumFractionDigits: 1 })}
                        {info.tone !== "netral" ? ` (${info.label})` : ""}
                      </p>
                    );
                  })()}
                  {/* (3 Okt 2026) Nilai kinerja (angka) + ikon catatan --
                      permintaan user: kandidat di popover Saran ini jg perlu
                      kelihatan penilaian kinerjanya, bukan cuma jarak & beban. */}
                  <p className="mt-0.5 flex items-center gap-1 text-[10px]">
                    <span className="font-bold" style={{ color: warnaNilaiKinerja(p.nilai_kinerja) }}>
                      Nilai: {p.nilai_kinerja ?? "Belum Dinilai"}
                    </span>
                    <IkonNilaiKinerja nilai={p.nilai_kinerja} catatan={p.catatan_kinerja} />
                  </p>
                </div>
                <button
                  type="button"
                  // (3 Okt 2026, revisi) DULU onClick -- rusak sejak panel
                  // "Saran" dipindah ke React Portal (document.body): tombol
                  // ini jadi bukan lagi anak DOM dari `ref` SaranMitraTombol,
                  // jadi listener "klik di luar utk menutup" (mousedown di
                  // document) menganggap klik di sini sbg "di luar" & langsung
                  // MENUTUP (unmount) panel ini SEBELUM event "click" sempat
                  // nyala -- di React/DOM, kalau elemen target sudah dicabut
                  // dari DOM antara mousedown & mouseup, event click-nya
                  // batal, jadi onPilih tidak pernah terpanggil (dropdown PPL
                  // tidak kewarat terisi, dilaporkan user). Fix: pindah ke
                  // onMouseDown + preventDefault (pola sama persis dgn opsi
                  // Combobox) -- handler milik TOMBOL INI SENDIRI jalan
                  // duluan (sebelum event bubble ke listener document), jadi
                  // onPilih sempat terpanggil sebelum panel ditutup.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (sudahDipilih) return;
                    onPilih(p.id);
                  }}
                  disabled={sudahDipilih}
                  className="shrink-0 rounded-full bg-moss-50 px-2 py-1 text-[10px] font-semibold text-moss-900 hover:bg-moss-100 disabled:cursor-default disabled:bg-paper disabled:text-ink/40"
                  title={sudahDipilih ? "Sudah dipilih di baris ini" : `Pilih ${p.nama} utk Sub SLS ini`}
                >
                  {sudahDipilih ? "✓ Dipilih" : "Terapkan"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {daftar.length > BATAS_TAMPIL && (
        <p className="mt-0.5 text-[10px] text-ink/40">+{daftar.length - BATAS_TAMPIL} lainnya (persempit lewat pencarian PPL kalau perlu).</p>
      )}
    </div>
  );
}

// (3 Okt 2026) "📍 Wilayah Lain" -- permintaan user: KEBALIKAN dari
// SaranMitraTombol (yg menyarankan PPL utk satu Sub SLS tetap), tombol ini
// menyarankan Sub SLS LAIN utk PPL yg SEDANG aktif/terpilih di baris ini --
// 5 Sub SLS terdekat yg masih KOSONG (klik -> pindah ke sana SEKALIAN isi
// draft PPL yg sama ke sana) & 5 Sub SLS terdekat yg SUDAH terisi (klik ->
// CUMA pindah, tidak mengubah apa pun, krn sudah ada PPL lain di sana).
// Jarak dihitung garis lurus (haversine) dari lokasi rumah PPL ybs ke titik
// tiap Sub SLS -- pola & alasan SAMA PERSIS dgn SaranMitraTombol (lihat
// komentar di sana & di lib/jarakJalan.ts), cuma arah pencariannya dibalik.
function SarankanWilayahTombol({
  petugas,
  kertasKerja,
  efektifPplId,
  titikSubslsMap,
  idsubslsSaatIni,
  onPilih,
}: {
  // PPL yg SEDANG aktif/terpilih di baris INI -- bukan PPL baris tujuan.
  // undefined -> dirender null oleh pemanggil (lihat Langkah 4), jadi di
  // sini selalu dianggap ADA kalau komponen ini sempat dipanggil.
  petugas: PetugasRingkas | undefined;
  // Daftar LENGKAP (bukan yg sedang difilter/dihalaman) -- supaya Sub SLS
  // terdekat tetap ketemu walau sedang disaring/di halaman lain di tabel.
  kertasKerja: KertasKerjaRow[];
  efektifPplId: (r: KertasKerjaRow) => number | null;
  titikSubslsMap: Map<string, { lat: number; lng: number }>;
  idsubslsSaatIni: string;
  // kosong=true -> Sub SLS yg diklik BELUM ada PPL (parent WAJIB isi draft
  // PPL ybs ke sana SEKALIAN pindah); kosong=false -> sudah ada PPL (parent
  // CUMA pindah/scroll, draft tidak diubah).
  onPilih: (idsubsls: string, kosong: boolean) => void;
}) {
  const [buka, setBuka] = useState(false);
  const [pos, setPos] = useState<{ top: number | null; bottom: number | null; left: number; maxHeight: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function hitungPosisi(rect: DOMRect) {
    const lebar = 300;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - lebar - 8));
    const TINGGI_IDEAL = 360;
    const ruangBawah = window.innerHeight - rect.bottom - 8;
    const ruangAtas = rect.top - 8;
    if (ruangBawah >= TINGGI_IDEAL || ruangBawah >= ruangAtas) {
      setPos({ top: rect.bottom + 4, bottom: null, left, maxHeight: Math.max(120, Math.min(TINGGI_IDEAL, ruangBawah)) });
    } else {
      setPos({ top: null, bottom: Math.max(8, window.innerHeight - rect.top + 4), left, maxHeight: Math.max(120, Math.min(TINGGI_IDEAL, ruangAtas)) });
    }
  }

  useEffect(() => {
    if (!buka) return;
    function tutupJikaDiluar(e: Event) {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setBuka(false);
    }
    function reposisiSaatScroll() {
      if (ref.current) hitungPosisi(ref.current.getBoundingClientRect());
    }
    document.addEventListener("mousedown", tutupJikaDiluar);
    document.addEventListener("scroll", reposisiSaatScroll, true);
    window.addEventListener("resize", reposisiSaatScroll);
    return () => {
      document.removeEventListener("mousedown", tutupJikaDiluar);
      document.removeEventListener("scroll", reposisiSaatScroll, true);
      window.removeEventListener("resize", reposisiSaatScroll);
    };
  }, [buka]);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (buka) {
      setBuka(false);
      return;
    }
    hitungPosisi(e.currentTarget.getBoundingClientRect());
    setBuka(true);
  }

  // (3 Okt 2026) Dihitung HANYA saat panel benar2 dibuka (bukan tiap render
  // baris) -- scan + haversine ke SELURUH Sub SLS sampel bisa ratusan baris,
  // sayang kalau diulang tiap render padahal panelnya tertutup.
  const kandidat = useMemo(() => {
    if (!buka) return null;
    if (!petugas || petugas.lokasi_status !== "riil" || typeof petugas.lat !== "number" || typeof petugas.lng !== "number") {
      return "lokasi_belum_ada" as const;
    }
    const asalLat = petugas.lat;
    const asalLng = petugas.lng;
    // Dedupe per idsubsls dulu -- Sub SLS yg sudah dipecah punya BEBERAPA
    // baris kertasKerja (satu per bagian/PPL), cukup 1 wakil per idsubsls
    // utk daftar "Sub SLS terdekat" ini (lokasinya sama, titik yg sama).
    const wakilPerSubsls = new Map<string, KertasKerjaRow>();
    for (const r of kertasKerja) {
      if (r.idsubsls === idsubslsSaatIni) continue;
      if (!wakilPerSubsls.has(r.idsubsls)) wakilPerSubsls.set(r.idsubsls, r);
    }
    const denganJarak: { r: KertasKerjaRow; jarak: number; terisi: boolean }[] = [];
    for (const r of wakilPerSubsls.values()) {
      const titik = titikSubslsMap.get(r.idsubsls);
      if (!titik || typeof titik.lat !== "number" || typeof titik.lng !== "number") continue;
      denganJarak.push({
        r,
        jarak: haversineKm(asalLat, asalLng, titik.lat, titik.lng),
        // Sub SLS yg sudah dipecah SELALU dianggap "terisi" (porsi_kk !==
        // null -> efektifPplId langsung balik r.ppl_id tersimpan, tanpa
        // perlu draft) -- wakilnya cukup 1 bagian saja, status ini sama utk
        // semua bagian lain dr idsubsls yg sama.
        terisi: !!efektifPplId(r),
      });
    }
    denganJarak.sort((a, b) => a.jarak - b.jarak);
    return {
      kosong: denganJarak.filter((x) => !x.terisi).slice(0, 5),
      terisi: denganJarak.filter((x) => x.terisi).slice(0, 5),
    };
  }, [buka, petugas, kertasKerja, efektifPplId, titikSubslsMap, idsubslsSaatIni]);

  if (!petugas) return null;

  function pilih(idsubsls: string, kosong: boolean) {
    onPilih(idsubsls, kosong);
    setBuka(false);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        title={`Sarankan Sub SLS lain utk ${petugas.nama}: 5 terdekat yg masih kosong + 5 terdekat yg sudah terisi (jarak garis lurus dari lokasi rumah)`}
        className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
      >
        📍 Wilayah Lain
      </button>
      {buka &&
        pos &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top ?? undefined, bottom: pos.bottom ?? undefined, left: pos.left, width: 300, maxHeight: pos.maxHeight }}
            className="z-50 overflow-y-auto rounded-md border border-line bg-white p-2.5 text-left text-xs normal-case leading-normal shadow-lg"
          >
            <p className="mb-1.5 text-[10px] text-ink/50">
              Sub SLS lain terdekat dari lokasi rumah <span className="font-semibold">{petugas.nama}</span> -- klik utk
              langsung pindah ke baris itu.
            </p>
            {kandidat === "lokasi_belum_ada" ? (
              <p className="px-1 py-1 text-xs text-ink/50">
                Lokasi rumah {petugas.nama} belum riil/terverifikasi -- jarak tidak bisa diperkirakan.
              </p>
            ) : (
              <>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-moss-700">5 Terdekat — Masih Kosong</p>
                  {!kandidat || kandidat.kosong.length === 0 ? (
                    <p className="mt-0.5 text-[11px] text-ink/40">Tidak ada Sub SLS kosong di sekitar sini.</p>
                  ) : (
                    <ul className="mt-0.5 space-y-0.5">
                      {kandidat.kosong.map(({ r, jarak }) => (
                        <li key={r.idsubsls}>
                          <button
                            type="button"
                            // onMouseDown, bukan onClick -- panel ini portal ke
                            // document.body, sama persis alasannya dgn tombol
                            // "Terapkan" di SaranMitraKelompok (lihat komentar
                            // di sana): listener "klik di luar" (mousedown)
                            // akan menutup panel ini SEBELUM event click
                            // sempat menyala kalau dipasang di onClick.
                            onMouseDown={(e) => {
                              e.preventDefault();
                              pilih(r.idsubsls, true);
                            }}
                            className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-moss-50"
                          >
                            <span className="truncate text-ink/80">
                              {r.nagari} · {r.sls} · {r.sub_sls}
                            </span>
                            <span className="shrink-0 text-[10px] text-ink/40">
                              {jarak.toLocaleString("id-ID", { maximumFractionDigits: 1 })} km
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-2 border-t border-line pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">5 Terdekat — Sudah Terisi</p>
                  {!kandidat || kandidat.terisi.length === 0 ? (
                    <p className="mt-0.5 text-[11px] text-ink/40">Tidak ada Sub SLS terisi di sekitar sini.</p>
                  ) : (
                    <ul className="mt-0.5 space-y-0.5">
                      {kandidat.terisi.map(({ r, jarak }) => (
                        <li key={r.idsubsls}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              pilih(r.idsubsls, false);
                            }}
                            className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-blue-50"
                          >
                            <span className="truncate text-ink/80">
                              {r.nagari} · {r.sls} · {r.sub_sls}
                            </span>
                            <span className="shrink-0 text-[10px] text-ink/40">
                              {jarak.toLocaleString("id-ID", { maximumFractionDigits: 1 })} km
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>,
          document.body
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

type MitraCalon = {
  id: number;
  nama: string;
  no_telp: string | null;
  alamat_kecamatan: string | null;
  alamat_desa: string | null;
  posisi: string | null;
  status_seleksi: string | null;
};

type RekomendasiMitra = { tier1: MitraCalon[]; tier2: MitraCalon[]; tier3: MitraCalon[] };

// Tombol bantuan (❓) di samping kolom "Nama Mitra" pada form Identifikasi --
// MURNI rekomendasi/bantuan keputusan, bukan penugasan otomatis: nama hanya
// terisi ke kolom kalau admin/mitra sendiri yang klik "Pilih nama ini".
//
// Skala prioritas: (1) Nagari yang sama & terdaftar Diterima di kegiatan
// lain (Sensus 2026) -> (2) Kecamatan yang sama & terdaftar Diterima ->
// (3) Nagari yang sama tapi belum/tidak terdaftar di kegiatan lain.
function IkonRekomendasiMitra({
  iddesa,
  kecamatan,
  onPilih,
}: {
  iddesa: string;
  kecamatan: string;
  onPilih: (nama: string) => void;
}) {
  const [buka, setBuka] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [data, setData] = useState<RekomendasiMitra | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dikueriUntuk, setDikueriUntuk] = useState<string | null>(null);
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
    const lebar = 320;
    setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - lebar - 8)) });
    setBuka(true);
    if (!iddesa || !kecamatan) return;
    const kunci = `${iddesa}|${kecamatan}`;
    if (dikueriUntuk === kunci && data) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/bencana/rekomendasi-mitra?iddesa=${encodeURIComponent(iddesa)}&kecamatan=${encodeURIComponent(
          kecamatan
        )}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat rekomendasi mitra.");
      setData(json);
      setDikueriUntuk(kunci);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga.");
    } finally {
      setLoading(false);
    }
  }

  function Daftar({ list }: { list: MitraCalon[] }) {
    if (list.length === 0) return <p className="text-ink/40">Tidak ada.</p>;
    return (
      <ul className="space-y-1">
        {list.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 border-b border-line/60 pb-1 last:border-0">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">
                {m.nama}
                {m.no_telp ? ` (${m.no_telp})` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onPilih(m.nama);
                setBuka(false);
              }}
              className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-900 hover:bg-blue-100"
            >
              Pilih
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div ref={ref} className="relative inline-block shrink-0 align-middle">
      <button
        type="button"
        onClick={toggle}
        title="Rekomendasi nama mitra untuk Nagari ini"
        className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-bold leading-none text-blue-900 hover:bg-blue-200"
      >
        ?
      </button>
      {buka && pos && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 320 }}
          className="z-50 max-h-96 overflow-y-auto rounded-md border border-line bg-white p-2.5 text-left text-xs normal-case shadow-lg"
        >
          <p className="font-semibold text-ink">Rekomendasi Nama Mitra untuk dihubungi</p>
          {!iddesa || !kecamatan ? (
            <p className="mt-1 text-ink/60">Pilih Kecamatan dan Nagari dulu di bawah.</p>
          ) : loading ? (
            <p className="mt-1 text-ink/60">Memuat...</p>
          ) : error ? (
            <p className="mt-1 text-rust-600">{error}</p>
          ) : (
            data && (
              <div className="mt-1.5 flex flex-col gap-2.5">
                <div>
                  <p className="mb-1 font-medium text-moss-700">
                    1) Nagari sama &amp; terdaftar kegiatan lain (Sensus 2026)
                  </p>
                  <Daftar list={data.tier1} />
                </div>
                <div>
                  <p className="mb-1 font-medium text-blue-900">
                    2) Kecamatan sama &amp; terdaftar kegiatan lain
                  </p>
                  <Daftar list={data.tier2} />
                </div>
                <div>
                  <p className="mb-1 font-medium text-orange-700">
                    3) Nagari sama, belum/tidak terdaftar kegiatan lain
                  </p>
                  <Daftar list={data.tier3} />
                </div>
                <p className="border-t border-line pt-1.5 text-[10px] text-ink/40">
                  Hanya rekomendasi -- klik &quot;Pilih&quot; untuk mengisi kolom Nama
                  Mitra, atau tetap ketik nama lain secara manual.
                </p>
              </div>
            )
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

// (3 Okt 2026) Tombol "Lihat Peta" per baris Sub SLS di tab Identifikasi --
// awalnya buka Google Maps di tab baru, user minta diganti jadi popover
// kecil langsung di halaman (cukup "cek sekilas", tidak perlu pindah
// halaman/aplikasi). Pakai iframe embed Google Maps (`output=embed`, TIDAK
// butuh API key -- trik publik yg sama dgn tombol "Share/Embed" biasa di
// Google Maps, beda dari Maps Embed API resmi yg berbayar). Tetap sediakan
// link "Buka di Google Maps" di bawah iframe utk yg mau lihat lebih detail/
// zoom/satelit penuh di aplikasi aslinya.
function PetaSekilasTombol({ lat, lng, label }: { lat: number; lng: number; label: string }) {
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

  const srcEmbed = `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
  const linkPenuh = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <div ref={ref} className="relative inline-block shrink-0">
      <button
        type="button"
        onClick={toggle}
        title="Lihat lokasi Sub SLS ini di peta (cek sekilas kemungkinan area banjir)"
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium transition ${
          buka ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
        }`}
      >
        🗺️ Lihat Peta
      </button>
      {buka && pos && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 280 }}
          className="z-50 overflow-hidden rounded-md border border-line bg-white normal-case shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-line px-2 py-1">
            <p className="truncate text-[11px] font-medium text-ink/70">{label}</p>
            <button
              type="button"
              onClick={() => setBuka(false)}
              className="shrink-0 px-1 text-xs text-ink/40 hover:text-ink/70"
              title="Tutup"
            >
              ✕
            </button>
          </div>
          <iframe
            src={srcEmbed}
            width="280"
            height="220"
            style={{ border: 0, display: "block" }}
            loading="lazy"
            title={`Peta lokasi ${label}`}
          />
          <a
            href={linkPenuh}
            target="_blank"
            rel="noopener noreferrer"
            className="block border-t border-line px-2 py-1.5 text-center text-[10px] font-medium text-blue-600 hover:bg-blue-50"
          >
            Buka di Google Maps ↗
          </a>
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
  // "KK Terdampak (Wawancara Sub SLS)" -- angka PER SUB SLS langsung dari
  // field perkiraan KK yg diisi mitra/anak magang scr spesifik per Sub SLS
  // (beda dari kk_terdampak_estimasi yg cuma rata-rata per Jorong). null
  // kalau belum ada laporan yg spesifik menyebut Sub SLS ini; kalau Jorong
  // ybs ada laporan "tidak ada yg terdampak", kk_wawancara_tidak_terdampak
  // jadi true (ditampilkan sbg "NO", bukan angka).
  kk_wawancara: number | null;
  kk_wawancara_tidak_terdampak: boolean;
  // (3 Okt 2026) Titik koordinat Sub SLS ini, utk tombol "Lihat Peta" di
  // sebelah nama Jorong -- null kalau titiknya belum tersedia.
  lat: number | null;
  lng: number | null;
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

// Monitoring Magang -- ditaruh paling atas tab Monitoring. Menghitung
// hasil identifikasi (per-Jorong) yang masuk HARI INI per pegawai magang,
// termasuk pegawai magang yang hari ini belum mengisi sama sekali (0)
// supaya kelihatan siapa yang belum submit. Nama yang belum pernah ada di
// Identifikasi (belum didampingi magang) tidak muncul di sini -- itu
// bukan masalah, kolomnya memang opsional.
function MonitoringMagangSection({ data }: { data: MonitoringMagangRow[] }) {
  if (data.length === 0) {
    return (
      <section className="rounded-md border border-line bg-white p-4">
        <h3 className="font-medium text-blue-950">👩‍🎓 Monitoring Magang</h3>
        <p className="mt-1 text-sm text-ink/60">
          Belum ada nama pegawai magang yang tercatat. Nama akan muncul di sini
          begitu diisi lewat kolom &quot;Nama Pegawai Magang&quot; pada form
          Identifikasi.
        </p>
      </section>
    );
  }

  const totalHariIni = data.reduce((sum, m) => sum + m.jumlah_hari_ini, 0);
  const belumIsiHariIni = data.filter((m) => m.jumlah_hari_ini === 0).length;

  return (
    <section className="rounded-md border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-blue-950">👩‍🎓 Monitoring Magang</h3>
        <span className="shrink-0 rounded-full bg-moss-100 px-3 py-1 text-xs font-medium text-moss-700">
          {totalHariIni} hasil identifikasi masuk hari ini
        </span>
      </div>
      <p className="mt-1 text-xs text-ink/60">
        Jumlah hasil identifikasi (per-Jorong) yang dimasukkan tiap pegawai
        magang hari ini.{" "}
        {belumIsiHariIni > 0 && (
          <span className="text-orange-700">
            {belumIsiHariIni} pegawai magang belum mengisi hari ini.
          </span>
        )}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {data.map((m) => (
          <div
            key={m.id}
            className={`rounded-md border px-3 py-2 ${
              m.jumlah_hari_ini > 0
                ? "border-moss-200 bg-moss-50"
                : "border-line bg-gray-50"
            }`}
          >
            <p className="truncate text-sm font-medium text-ink" title={m.nama}>
              {m.nama}
            </p>
            <p
              className={`text-lg font-semibold ${
                m.jumlah_hari_ini > 0 ? "text-moss-700" : "text-ink/40"
              }`}
            >
              {m.jumlah_hari_ini}
              <span className="ml-1 text-xs font-normal text-ink/50">hari ini</span>
            </p>
            <p className="text-xs text-ink/50">Total keseluruhan: {m.jumlah_total}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// Header kolom tabel dengan kontrol cari (🔍), filter (▽), urut (⇅) --
// (2 Okt 2026) SEMUA kontrol yang relevan utk kolom itu ditampilkan
// SEKALIGUS dalam 1 popover gabungan (dulu: menu pilih salah satu dulu,
// baru buka popover kontrol itu sendiri -- tidak bisa kombinasi, mis.
// urutkan SEKALIGUS filter dalam 1x buka). Popover dipasang
// `position: fixed` (posisi dihitung dari lokasi tombol saat diklik)
// supaya TIDAK terpotong oleh overflow-auto pembungkus tabel, dan
// otomatis tertutup kalau tabelnya discroll, jendela di-resize, atau
// diklik di luar popover. Urutkan/Cari berlaku LANGSUNG saat
// diklik/diketik (popover TIDAK otomatis tertutup) supaya bisa lanjut
// atur kontrol lain di popover yang sama; Filter tetap pola draft+Terapkan
// (perlu klik Terapkan dulu) spy tidak nge-refetch/filter ulang tiap 1
// checkbox dicentang.
// (2 Okt 2026) Redesain atas masukan user: dulu Cari ikut jadi salah satu
// tab di dalam popover titik-tiga (⋮) bersama Urutkan/Filter -- user minta
// Cari dipisah jadi ikon 🔍 TERSENDIRI di samping ⋮ (langsung kelihatan &
// klik 1x, tidak perlu buka ⋮ dulu), sedangkan Urutkan & Filter tetap
// digabung dalam 1 popover ⋮ seperti sebelumnya. Dua popover independen,
// tapi 1 listener "klik di luar" yang menutup salah satu/keduanya.
function ThKontrol({
  label,
  className,
  stickyLeft,
  freeze,
  search,
  filter,
  filter2,
  sort,
}: {
  label: string;
  className?: string;
  stickyLeft?: boolean;
  // (3 Okt 2026) Versi sticky-left dgn offset & lebar TERTENTU (bukan cuma
  // left-0) -- dipakai saat beberapa kolom dibekukan sekaligus berurutan
  // (lihat LEBAR_FREEZE_ALOKASI). Beda dgn stickyLeft (yg selalu left-0,
  // dipakai tabel lain yg cuma 1 kolom dibekukan).
  freeze?: { left: number; width: number };
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  filter?: { options: string[]; selected: Set<string>; onApply: (next: Set<string>) => void };
  // (3 Okt 2026) Grup filter KEDUA yg independen dlm popover ⋮ yg SAMA --
  // permintaan user: filter "Penilaian Kinerja" di kolom PPL Langkah 4,
  // DI SAMPING filter nama PPL yg sudah ada (`filter`), bukan menggantinya.
  // Dibuat terpisah (bukan menambah dimensi ke `filter`) supaya SELURUH
  // pemanggil ThKontrol lain yg sudah pakai `filter` tidak perlu diubah --
  // `filter2` punya label SENDIRI (selalu ditampilkan) persis supaya kedua
  // grup tidak tertukar saat keduanya sekaligus ada.
  filter2?: { label: string; options: string[]; selected: Set<string>; onApply: (next: Set<string>) => void };
  sort?: { active: boolean; dir: "asc" | "desc"; onAsc: () => void; onDesc: () => void; onReset: () => void };
}) {
  const adaAksi = !!sort || !!filter || !!filter2;

  const [cariTerbuka, setCariTerbuka] = useState(false);
  const [cariPos, setCariPos] = useState<{ top: number; left: number } | null>(null);
  const cariRef = useRef<HTMLDivElement>(null);

  const [terbuka, setTerbuka] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [filterDraft, setFilterDraft] = useState<Set<string>>(new Set());
  const [filter2Draft, setFilter2Draft] = useState<Set<string>>(new Set());
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cariTerbuka && !terbuka) return;
    function tutupJikaDiluar(e: Event) {
      const target = e.target;
      if (cariRef.current && target instanceof Node && cariRef.current.contains(target)) return;
      if (popoverRef.current && target instanceof Node && popoverRef.current.contains(target)) return;
      setCariTerbuka(false);
      setTerbuka(false);
    }
    document.addEventListener("mousedown", tutupJikaDiluar);
    document.addEventListener("scroll", tutupJikaDiluar, true);
    window.addEventListener("resize", tutupJikaDiluar);
    return () => {
      document.removeEventListener("mousedown", tutupJikaDiluar);
      document.removeEventListener("scroll", tutupJikaDiluar, true);
      window.removeEventListener("resize", tutupJikaDiluar);
    };
  }, [cariTerbuka, terbuka]);

  function bukaCari(e: React.MouseEvent<HTMLButtonElement>) {
    if (cariTerbuka) {
      setCariTerbuka(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const lebar = 220;
    setCariPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.right - lebar, window.innerWidth - lebar - 8)) });
    setTerbuka(false);
    setCariTerbuka(true);
  }

  function bukaAksi(e: React.MouseEvent<HTMLButtonElement>) {
    if (terbuka) {
      setTerbuka(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const lebar = 240;
    setPos({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - lebar, window.innerWidth - lebar - 8)),
    });
    if (filter) setFilterDraft(new Set(filter.selected));
    if (filter2) setFilter2Draft(new Set(filter2.selected));
    setCariTerbuka(false);
    setTerbuka(true);
  }

  const searchAktif = !!search?.value;
  const filterAktif = (!!filter && filter.selected.size > 0) || (!!filter2 && filter2.selected.size > 0);
  const aksiAktif = filterAktif || !!sort?.active;
  const banyakBagian = [!!sort, !!filter, !!filter2].filter(Boolean).length > 1;

  return (
    <th
      className={`px-3 py-2 font-medium ${
        freeze ? "sticky z-30 bg-blue-50" : stickyLeft ? "sticky left-0 z-30 bg-blue-50" : ""
      } ${className ?? ""}`}
      style={freeze ? { left: freeze.left, width: freeze.width, minWidth: freeze.width, maxWidth: freeze.width } : undefined}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate">{label}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          {search && (
            <div ref={cariRef} className="relative">
              <button
                type="button"
                title="Cari di kolom ini"
                onClick={bukaCari}
                className={`shrink-0 rounded p-1 text-xs leading-none transition ${
                  searchAktif || cariTerbuka ? "bg-blue-600 text-white" : "text-blue-300 hover:bg-blue-100 hover:text-blue-900"
                }`}
              >
                🔍
              </button>
              {cariTerbuka && cariPos && (
                <div
                  style={{ position: "fixed", top: cariPos.top, left: cariPos.left, width: 220 }}
                  className="z-50 rounded-md border border-line bg-white p-2 text-left font-normal normal-case text-ink shadow-lg"
                >
                  <input
                    autoFocus
                    value={search.value}
                    onChange={(e) => search.onChange(e.target.value)}
                    placeholder={search.placeholder ?? "Ketik kata kunci..."}
                    className="w-full rounded-md border border-line px-2 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                  />
                  {search.value && (
                    <button
                      type="button"
                      onClick={() => search.onChange("")}
                      className="mt-1 text-[10px] font-medium text-blue-600 hover:underline"
                    >
                      Hapus pencarian
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {adaAksi && (
            <div ref={popoverRef} className="relative">
              <button
                type="button"
                title="Urutkan / filter kolom ini"
                onClick={bukaAksi}
                className={`shrink-0 rounded p-1 text-xs leading-none transition ${
                  aksiAktif || terbuka ? "bg-blue-600 text-white" : "text-blue-300 hover:bg-blue-100 hover:text-blue-900"
                }`}
              >
                ⋮
              </button>
              {terbuka && pos && (
                <div
                  style={{ position: "fixed", top: pos.top, left: pos.left, width: 240 }}
                  className="z-50 flex flex-col gap-2 rounded-md border border-line bg-white p-2 text-left font-normal normal-case text-ink shadow-lg"
                >
                  {sort && (
                    <div className={banyakBagian ? "border-b border-line pb-2" : ""}>
                      {banyakBagian && (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink/40">Urutkan</p>
                      )}
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={sort.onAsc}
                          className={`block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-blue-50 ${
                            sort.active && sort.dir === "asc" ? "bg-blue-50 font-medium text-blue-700" : ""
                          }`}
                        >
                          ▲ Urut naik (A-Z)
                        </button>
                        <button
                          type="button"
                          onClick={sort.onDesc}
                          className={`block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-blue-50 ${
                            sort.active && sort.dir === "desc" ? "bg-blue-50 font-medium text-blue-700" : ""
                          }`}
                        >
                          ▼ Urut turun (Z-A)
                        </button>
                        {sort.active && (
                          <button
                            type="button"
                            onClick={sort.onReset}
                            className="block w-full rounded px-2 py-1.5 text-left text-xs text-ink/60 hover:bg-gray-50"
                          >
                            ✕ Reset urutan
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {filter && (
                    <div className={filter2 ? "border-b border-line pb-2" : ""}>
                      {(banyakBagian || filter2) && (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                          {filter2 ? "Filter: Nama" : "Filter"}
                        </p>
                      )}
                      <div className="max-h-44 overflow-y-auto">
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
                          onClick={() => filter.onApply(filterDraft)}
                          className="ml-auto rounded bg-blue-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-600"
                        >
                          Terapkan
                        </button>
                      </div>
                    </div>
                  )}

                  {filter2 && (
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink/40">{filter2.label}</p>
                      <div className="max-h-44 overflow-y-auto">
                        {filter2.options.length === 0 && <p className="px-1 py-1 text-xs text-ink/50">Tidak ada data.</p>}
                        <div className="flex flex-col gap-1">
                          {filter2.options.map((opt) => (
                            <label key={opt} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-blue-50">
                              <input
                                type="checkbox"
                                checked={filter2Draft.has(opt)}
                                onChange={() => {
                                  setFilter2Draft((prev) => {
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
                        <button type="button" onClick={() => setFilter2Draft(new Set())} className="text-[10px] text-ink/60 hover:underline">
                          Bersihkan
                        </button>
                        <button
                          type="button"
                          onClick={() => filter2.onApply(filter2Draft)}
                          className="ml-auto rounded bg-blue-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-600"
                        >
                          Terapkan
                        </button>
                      </div>
                    </div>
                  )}

                  {banyakBagian && (
                    <button
                      type="button"
                      onClick={() => setTerbuka(false)}
                      className="w-full rounded px-2 py-1 text-center text-[10px] font-medium text-ink/50 hover:bg-gray-50 hover:text-ink/80"
                    >
                      Tutup
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
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

const ALOKASI_PAGE_SIZE = 20;
const SAMPEL_PAGE_SIZE = 25;
const BEBAN_PAGE_SIZE = 25;

// (3 Okt 2026) "Freeze kolom" tabel Langkah 4 -- permintaan user: dulu cuma
// kolom Sub SLS yg dibekukan (sticky) saat geser ke kanan, sekarang
// diperluas SAMPAI kolom PPL (identitas wilayah + skor2 + PPL yg sedang
// dipegang tetap kelihatan sambil geser lihat Pecah/Beban Petugas/PML/
// Korwil/Status). Lebar HARUS fixed (bukan auto) -- offset `left` kumulatif
// antar kolom sticky dihitung dari ini. Teks panjang DIBUNGKUS (wrap),
// bukan dipotong, supaya datanya tidak hilang dari pandangan -- baris cuma
// jadi lebih tinggi kalau kepanjangan, bukan kehilangan info.
const LEBAR_FREEZE_ALOKASI = {
  kecamatan: 96,
  nagari: 104,
  jorong: 84,
  subsls: 100,
  datakk: 76,
  skorBebanPendataan: 92,
  skorJarak: 150,
  skorBebanAkhir: 88,
  ppl: 300,
} as const;
type KolomFreezeAlokasi = keyof typeof LEBAR_FREEZE_ALOKASI;
function hitungOffsetFreezeAlokasi(modeFokus: boolean): Record<KolomFreezeAlokasi, number> {
  // Urutan HARUS sama dgn urutan kolom di <thead>/<tbody> tabel Langkah 4.
  const urutan: KolomFreezeAlokasi[] = modeFokus
    ? ["jorong", "subsls", "skorBebanAkhir", "ppl"]
    : ["kecamatan", "nagari", "jorong", "subsls", "datakk", "skorBebanPendataan", "skorJarak", "skorBebanAkhir", "ppl"];
  const offset = {} as Record<KolomFreezeAlokasi, number>;
  let akumulasi = 0;
  for (const k of urutan) {
    offset[k] = akumulasi;
    akumulasi += LEBAR_FREEZE_ALOKASI[k];
  }
  return offset;
}
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
  warnaTeks,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  options: { value: number; label: string; disabled?: boolean }[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
  // (3 Okt 2026) Warna teks nama yg SEDANG terpilih (bukan warna opsi di
  // dropdown) -- dipakai Langkah 4 utk gradasi merah->hijau tua sesuai nilai
  // kinerja PPL terpilih. Opsional, default-nya tidak dipakai Combobox lain
  // (PML/Korwil) supaya tidak berubah perilakunya.
  warnaTeks?: (value: number | null) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // (3 Okt 2026) Dropdown ini sebelumnya `position: absolute` terhadap
  // wrapRef -- gampang TERPOTONG oleh ancestor `overflow-auto` (area scroll
  // tabel Langkah 4) kalau baris-nya dekat ujung bawah area scroll itu,
  // berapa pun z-index-nya (overflow clipping tidak peduli z-index).
  // Dilaporkan user: "dropdon ppl ketutup". Fix: pakai `position: fixed` +
  // koordinat dihitung dari getBoundingClientRect(), dengan clamp horizontal
  // DAN vertikal (dibalik ke atas kalau ruang bawah tidak cukup) -- pola yg
  // sama persis dgn SaranMitraTombol/ThKontrol di file ini.
  const [pos, setPos] = useState<{
    left: number;
    width: number;
    top: number | null;
    bottom: number | null;
    maxHeight: number;
  } | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  function hitungPosisi() {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const TINGGI_IDEAL = 224; // selaras dgn max-h-56 (224px) yg dipakai sebelumnya
    const ruangBawah = window.innerHeight - rect.bottom - 8;
    const ruangAtas = rect.top - 8;
    if (ruangBawah >= TINGGI_IDEAL || ruangBawah >= ruangAtas) {
      setPos({
        left: rect.left,
        width: rect.width,
        top: rect.bottom + 4,
        bottom: null,
        maxHeight: Math.max(120, Math.min(TINGGI_IDEAL, ruangBawah)),
      });
    } else {
      setPos({
        left: rect.left,
        width: rect.width,
        top: null,
        bottom: Math.max(8, window.innerHeight - rect.top + 4),
        maxHeight: Math.max(120, Math.min(TINGGI_IDEAL, ruangAtas)),
      });
    }
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    // (3 Okt 2026, revisi) Percobaan pertama: TUTUP dropdown setiap kali ada
    // scroll apa pun (sama seperti pola SaranMitraTombol/ThKontrol). Ternyata
    // ini salah utk Combobox: dropdown dibuka lewat onFocus() pada <input>,
    // dan browser SERING otomatis men-scroll input itu ke pandangan
    // ("scroll into view on focus") kalau baris-nya dekat tepi area scroll
    // tabel -- scroll bawaan itu terjadi SEGERA setelah dropdown dibuka,
    // jadi langsung menutupnya lagi di detik yg sama, membuat dropdown
    // kelihatan seperti TIDAK PERNAH muncul (dilaporkan user: "tidakbisa
    // dropdown nama ppl"). SaranMitraTombol tidak kena masalah ini krn
    // dibuka lewat onClick tombol, bukan fokus <input>, jadi tidak memicu
    // auto-scroll serupa. Fix: REPOSISI ulang panel saat scroll (bukan
    // ditutup) -- panel tetap terbuka & ikut pindah mengikuti posisi input.
    function onScroll() {
      hitungPosisi();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
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
          hitungPosisi();
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          hitungPosisi();
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
        style={!disabled && value != null ? { color: warnaTeks?.(value) } : undefined}
        className="w-full rounded-md border border-line bg-white px-2 py-1 text-xs outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-ink/40"
      />
      {open &&
        !disabled &&
        pos &&
        createPortal(
          // (3 Okt 2026, revisi 2) Portal ke document.body -- alasan sama
          // dgn SaranMitraTombol: walau sudah `position: fixed`, panel ini
          // masih anak DOM dari <td> baris tabel, jadi masih ikut mewarisi
          // override CSS "Tampilan Padat" (font-size/line-height). Portal
          // melepaskannya total dari tabel.
          <div
            style={{
              position: "fixed",
              top: pos.top ?? undefined,
              bottom: pos.bottom ?? undefined,
              left: pos.left,
              width: Math.max(pos.width, 192),
              maxHeight: pos.maxHeight,
            }}
            className="z-50 overflow-y-auto rounded-md border border-line bg-white text-xs leading-normal shadow-lg"
          >
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
          </div>,
          document.body
        )}
    </div>
  );
}

// (3 Okt 2026) Warna gradasi nilai kinerja mitra (hasil SE2026, 1-5, 5 =
// paling baik) -- 5 warna "jangkar" TERPISAH (bukan interpolasi RGB
// kontinu dari 2 warna ujung), krn nilai_kinerja selalu bilangan bulat
// (CHECK 1-5 di DB) & interpolasi lurus merah->hijau lewat titik tengah
// selalu menghasilkan warna coklat kusam (merah+hijau = coklat). 3 dari 5
// jangkar diambil dari palet brand (rust-500/gold-400/moss-700 di
// tailwind.config.ts), 2 transisi (oranye & hijau muda) dipilih manual
// supaya gradasinya tetap mulus dari mata.
const WARNA_NILAI_KINERJA: Record<number, string> = {
  1: "#A6432D", // rust-500 -- merah, kurang baik
  2: "#BF7A2E", // oranye transisi
  3: "#C08829", // gold-400 -- kuning keemasan, cukup
  4: "#6B9C4A", // hijau muda transisi
  5: "#2C5940", // moss-700 -- hijau tua, paling baik
};
function warnaNilaiKinerja(nilai: number | null | undefined): string | undefined {
  if (nilai == null) return undefined;
  return WARNA_NILAI_KINERJA[Math.round(nilai)] ?? undefined;
}

// Ikon kecil "📝" utk lihat catatan penilaian kinerja mitra (hasil xlsx
// "Penilaian Kinerja Survei" SE2026) -- diklik utk buka popover singkat
// berisi nilai & catatan lengkap. Dipakai di 3 tempat: Master Petugas,
// kolom tambahan "Nilai Kinerja" di Kegiatan Petugas, & Langkah 4 Alokasi
// Petugas. Popover portal ke document.body (pola sama dgn Combobox/
// ThKontrol) supaya tidak terpotong overflow tabel & lepas dari override
// CSS "Tampilan Padat" (font-size/line-height).
function IkonNilaiKinerja({ nilai, catatan }: { nilai: number | null; catatan: string | null }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function tutupJikaDiluar(e: Event) {
      const target = e.target;
      if (ref.current && target instanceof Node && ref.current.contains(target)) return;
      setOpen(false);
    }
    function reposisi() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const lebar = 260;
      setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - lebar - 8)) });
    }
    document.addEventListener("mousedown", tutupJikaDiluar);
    document.addEventListener("scroll", reposisi, true);
    window.addEventListener("resize", reposisi);
    return () => {
      document.removeEventListener("mousedown", tutupJikaDiluar);
      document.removeEventListener("scroll", reposisi, true);
      window.removeEventListener("resize", reposisi);
    };
  }, [open]);

  if (nilai == null) {
    return (
      <span className="shrink-0 text-[10px] text-ink/30" title="Belum ada hasil penilaian kinerja">
        —
      </span>
    );
  }

  const warna = warnaNilaiKinerja(nilai);

  return (
    <span className="relative inline-flex shrink-0">
      <button
        ref={ref}
        type="button"
        title="Lihat nilai & catatan penilaian kinerja"
        onClick={() => {
          if (!open && ref.current) {
            const rect = ref.current.getBoundingClientRect();
            const lebar = 260;
            setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - lebar - 8)) });
          }
          setOpen((v) => !v);
        }}
        className="shrink-0 rounded p-0.5 text-xs leading-none text-blue-400 hover:bg-blue-50 hover:text-blue-700"
      >
        📝
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 260 }}
            className="z-50 rounded-md border border-line bg-white p-2.5 text-left text-xs normal-case text-ink shadow-lg"
          >
            <p className="font-semibold" style={{ color: warna }}>
              Nilai Kinerja: {nilai} / 5
            </p>
            <p className="mt-1 whitespace-pre-wrap text-ink/70">
              {catatan || <span className="text-ink/40">Tidak ada catatan.</span>}
            </p>
          </div>,
          document.body
        )}
    </span>
  );
}

// (3 Okt 2026) Tombol filter MANDIRI (bukan bagian dari <th> spt ThKontrol)
// -- dipakai utk kolom tambahan yg "ditempel di nama" (alamat & nilai
// kinerja, lihat tempelDiNama di KOLOM_TAMBAHAN_DAFTAR), yg TIDAK punya
// <th> sendiri krn tidak dirender sbg kolom terpisah di tabel. Meniru
// popover filter ThKontrol (posisi fixed, klik-luar/scroll menutup) tapi
// lepas total dari struktur tabel -- dipasang di panel "+ Kolom Tambahan".
function BtnFilterKolomTambahan({
  label,
  options,
  selected,
  onApply,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onApply: (next: Set<string>) => void;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!terbuka) return;
    function tutupJikaDiluar(e: Event) {
      const target = e.target;
      if (ref.current && target instanceof Node && ref.current.contains(target)) return;
      if (popoverRef.current && target instanceof Node && popoverRef.current.contains(target)) return;
      setTerbuka(false);
    }
    document.addEventListener("mousedown", tutupJikaDiluar);
    document.addEventListener("scroll", tutupJikaDiluar, true);
    window.addEventListener("resize", tutupJikaDiluar);
    return () => {
      document.removeEventListener("mousedown", tutupJikaDiluar);
      document.removeEventListener("scroll", tutupJikaDiluar, true);
      window.removeEventListener("resize", tutupJikaDiluar);
    };
  }, [terbuka]);

  const aktif = selected.size > 0;

  return (
    <span className="relative inline-flex">
      <button
        ref={ref}
        type="button"
        title={`Filter ${label}`}
        onClick={(e) => {
          if (terbuka) {
            setTerbuka(false);
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          const lebar = 220;
          setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.right - lebar, window.innerWidth - lebar - 8)) });
          setDraft(new Set(selected));
          setTerbuka(true);
        }}
        className={`shrink-0 rounded p-1 text-[11px] leading-none transition ${
          aktif || terbuka ? "bg-blue-600 text-white" : "text-blue-400 hover:bg-blue-100 hover:text-blue-900"
        }`}
      >
        ⚲{aktif ? ` (${selected.size})` : ""}
      </button>
      {terbuka &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 220 }}
            className="z-50 flex flex-col gap-2 rounded-md border border-line bg-white p-2 text-left text-xs normal-case text-ink shadow-lg"
          >
            <div className="max-h-44 overflow-y-auto">
              {options.length === 0 && <p className="px-1 py-1 text-xs text-ink/50">Tidak ada data.</p>}
              <div className="flex flex-col gap-1">
                {options.map((opt) => (
                  <label key={opt} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-blue-50">
                    <input
                      type="checkbox"
                      checked={draft.has(opt)}
                      onChange={() => {
                        setDraft((prev) => {
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
            <div className="flex items-center gap-2 border-t border-line pt-2">
              <button type="button" onClick={() => setDraft(new Set())} className="text-[10px] text-ink/60 hover:underline">
                Bersihkan
              </button>
              <button
                type="button"
                onClick={() => {
                  onApply(draft);
                  setTerbuka(false);
                }}
                className="ml-auto rounded bg-blue-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-600"
              >
                Terapkan
              </button>
            </div>
          </div>,
          document.body
        )}
    </span>
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
  // (3 Okt 2026) read-only di sini -- diedit lewat tab Kegiatan Petugas.
  rekomendasi_pml: boolean;
  red_flag_kinerja: boolean;
  // (3 Okt 2026) Hasil penilaian kinerja mitra SE2026 -- read-only di sini.
  nilai_kinerja: number | null;
  catatan_kinerja: string | null;
};

// (3 Okt 2026) Satu kolom gabungan "Rekomendasi" di Master Petugas utk 2 flag
// manual (diedit di tab Kegiatan Petugas) -- bisa dua-duanya aktif sekaligus
// (jarang, tp mungkin), jadi dikembalikan array label, bukan 1 nilai.
function rekomendasiLabelsRow(r: MasterPetugasRow): string[] {
  const labels: string[] = [];
  if (r.rekomendasi_pml) labels.push("Rekomendasi PML");
  if (r.red_flag_kinerja) labels.push("Red Flag Kinerja");
  if (labels.length === 0) labels.push("Tidak Ada");
  return labels;
}

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
// (3 Okt 2026) Label filter/tampil utk kolom "Penilaian Kinerja" (hasil
// SE2026) -- dipakai Master Petugas & opsi filter kolom tambahan "Nilai
// Kinerja" di Kegiatan Petugas.
function labelNilaiKinerja(nilai: number | null): string {
  return nilai != null ? `Nilai ${nilai}` : "Belum Dinilai";
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
  const [rekomendasiSel, setRekomendasiSel] = useState<Set<string>>(new Set());
  // (3 Okt 2026) Filter kolom baru "Penilaian Kinerja" (hasil SE2026).
  const [nilaiKinerjaSel, setNilaiKinerjaSel] = useState<Set<string>>(new Set());

  // (2 Okt 2026) Cari per-kolom utk kolom teks/kategori berkardinalitas
  // tinggi (banyak nilai berbeda) -- Kecamatan/Nagari/Jorong/Pendidikan/
  // Pekerjaan. Kolom boolean/status kecil (Status, Peran, Aktif, Jenis
  // Kelamin, Bisa Motor, Status Pendaftaran) sengaja TIDAK diberi cari/urut
  // krn nilainya cuma segelintir -- filter centang yang sudah ada sudah
  // cukup & lebih cepat dipakai utk kolom begitu.
  const [kecamatanSearch, setKecamatanSearch] = useState("");
  const [nagariSearch, setNagariSearch] = useState("");
  const [jorongSearch, setJorongSearch] = useState("");
  const [pendidikanSearch, setPendidikanSearch] = useState("");
  const [pekerjaanSearch, setPekerjaanSearch] = useState("");

  const [sortKey, setSortKey] = useState<
    "nama" | "umur" | "kecamatan" | "nagari" | "jorong" | "pendidikan" | "pekerjaan" | null
  >(null);
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
  const opsiRekomendasi = ["Rekomendasi PML", "Red Flag Kinerja", "Tidak Ada"];
  const opsiNilaiKinerja = opsiUnik((r) => labelNilaiKinerja(r.nilai_kinerja));

  function sortAsc(key: NonNullable<typeof sortKey>) {
    setSortKey(key);
    setSortDir("asc");
  }
  function sortDesc(key: NonNullable<typeof sortKey>) {
    setSortKey(key);
    setSortDir("desc");
  }
  function sortReset() {
    setSortKey(null);
  }

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const kwKecamatan = kecamatanSearch.trim().toLowerCase();
    const kwNagari = nagariSearch.trim().toLowerCase();
    const kwJorong = jorongSearch.trim().toLowerCase();
    const kwPendidikan = pendidikanSearch.trim().toLowerCase();
    const kwPekerjaan = pekerjaanSearch.trim().toLowerCase();
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
      if (rekomendasiSel.size > 0 && !rekomendasiLabelsRow(r).some((l) => rekomendasiSel.has(l))) return false;
      if (nilaiKinerjaSel.size > 0 && !nilaiKinerjaSel.has(labelNilaiKinerja(r.nilai_kinerja))) return false;
      if (kwKecamatan && !kecamatanTampil(r).toLowerCase().includes(kwKecamatan)) return false;
      if (kwNagari && !nagariTampil(r).toLowerCase().includes(kwNagari)) return false;
      if (kwJorong && !jorongTampil(r).toLowerCase().includes(kwJorong)) return false;
      if (kwPendidikan && !(r.pendidikan || "Tidak ada data").toLowerCase().includes(kwPendidikan)) return false;
      if (kwPekerjaan && !(r.pekerjaan || "Tidak ada data").toLowerCase().includes(kwPekerjaan)) return false;
      return true;
    });

    if (sortKey) {
      hasil = [...hasil].sort((a, b) => {
        let cmp = 0;
        if (sortKey === "nama") cmp = a.nama.localeCompare(b.nama, "id");
        else if (sortKey === "umur") cmp = (a.umur ?? -1) - (b.umur ?? -1);
        else if (sortKey === "kecamatan") cmp = kecamatanTampil(a).localeCompare(kecamatanTampil(b), "id");
        else if (sortKey === "nagari") cmp = nagariTampil(a).localeCompare(nagariTampil(b), "id");
        else if (sortKey === "jorong") cmp = jorongTampil(a).localeCompare(jorongTampil(b), "id");
        else if (sortKey === "pendidikan") cmp = (a.pendidikan || "").localeCompare(b.pendidikan || "", "id");
        else if (sortKey === "pekerjaan") cmp = (a.pekerjaan || "").localeCompare(b.pekerjaan || "", "id");
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
    rekomendasiSel,
    nilaiKinerjaSel,
    kecamatanSearch,
    nagariSearch,
    jorongSearch,
    pendidikanSearch,
    pekerjaanSearch,
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
      "Rekomendasi PML": r.rekomendasi_pml ? "Ya" : "",
      "Red Flag Kinerja": r.red_flag_kinerja ? "Ya" : "",
      "No HP": r.no_hp ?? "",
      "Nilai Kinerja": r.nilai_kinerja ?? "",
      "Catatan Kinerja": r.catatan_kinerja ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(dataRows);
    ws["!cols"] = [
      { wch: 26 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 8 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 30 },
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
                search={{ value: kecamatanSearch, onChange: setKecamatanSearch, placeholder: "Cari kecamatan..." }}
                filter={{ options: opsiKecamatan, selected: kecamatanSel, onApply: setKecamatanSel }}
                sort={{
                  active: sortKey === "kecamatan",
                  dir: sortDir,
                  onAsc: () => sortAsc("kecamatan"),
                  onDesc: () => sortDesc("kecamatan"),
                  onReset: sortReset,
                }}
              />
              <ThKontrol
                label="Nagari"
                search={{ value: nagariSearch, onChange: setNagariSearch, placeholder: "Cari nagari..." }}
                filter={{ options: opsiNagari, selected: nagariSel, onApply: setNagariSel }}
                sort={{
                  active: sortKey === "nagari",
                  dir: sortDir,
                  onAsc: () => sortAsc("nagari"),
                  onDesc: () => sortDesc("nagari"),
                  onReset: sortReset,
                }}
              />
              <ThKontrol
                label="Jorong"
                search={{ value: jorongSearch, onChange: setJorongSearch, placeholder: "Cari jorong..." }}
                filter={{ options: opsiJorong, selected: jorongSel, onApply: setJorongSel }}
                sort={{
                  active: sortKey === "jorong",
                  dir: sortDir,
                  onAsc: () => sortAsc("jorong"),
                  onDesc: () => sortDesc("jorong"),
                  onReset: sortReset,
                }}
              />
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
                search={{ value: pendidikanSearch, onChange: setPendidikanSearch, placeholder: "Cari pendidikan..." }}
                filter={{ options: opsiPendidikan, selected: pendidikanSel, onApply: setPendidikanSel }}
                sort={{
                  active: sortKey === "pendidikan",
                  dir: sortDir,
                  onAsc: () => sortAsc("pendidikan"),
                  onDesc: () => sortDesc("pendidikan"),
                  onReset: sortReset,
                }}
              />
              <ThKontrol
                label="Pekerjaan"
                search={{ value: pekerjaanSearch, onChange: setPekerjaanSearch, placeholder: "Cari pekerjaan..." }}
                filter={{ options: opsiPekerjaan, selected: pekerjaanSel, onApply: setPekerjaanSel }}
                sort={{
                  active: sortKey === "pekerjaan",
                  dir: sortDir,
                  onAsc: () => sortAsc("pekerjaan"),
                  onDesc: () => sortDesc("pekerjaan"),
                  onReset: sortReset,
                }}
              />
              <ThKontrol
                label="Bisa Motor"
                filter={{ options: opsiMotor, selected: motorSel, onApply: setMotorSel }}
              />
              <ThKontrol
                label="Status Pendaftaran"
                filter={{ options: opsiPendaftaran, selected: pendaftaranSel, onApply: setPendaftaranSel }}
              />
              <ThKontrol
                label="Rekomendasi"
                filter={{ options: opsiRekomendasi, selected: rekomendasiSel, onApply: setRekomendasiSel }}
              />
              <ThKontrol
                label="Penilaian Kinerja"
                filter={{ options: opsiNilaiKinerja, selected: nilaiKinerjaSel, onApply: setNilaiKinerjaSel }}
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
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {r.rekomendasi_pml && (
                      <span
                        className="rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-medium text-gold-600"
                        title="Direkomendasikan jadi PML -- dikecualikan dari popover Saran & Auto Plot di tab Alokasi Petugas. Diedit di tab Kegiatan Petugas."
                      >
                        🎯 Rekomendasi PML
                      </span>
                    )}
                    {r.red_flag_kinerja && (
                      <span
                        className="rounded-full bg-rust-100 px-2 py-0.5 text-[11px] font-medium text-rust-700"
                        title="Ditandai kinerja kurang baik -- dikecualikan dari popover Saran & Auto Plot di tab Alokasi Petugas. Diedit di tab Kegiatan Petugas."
                      >
                        🚩 Red Flag
                      </span>
                    )}
                    {!r.rekomendasi_pml && !r.red_flag_kinerja && <span className="text-ink/30">—</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    {r.nilai_kinerja != null ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                        style={{ backgroundColor: warnaNilaiKinerja(r.nilai_kinerja) }}
                      >
                        Nilai {r.nilai_kinerja}
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-ink/50">
                        Belum Dinilai
                      </span>
                    )}
                    <IkonNilaiKinerja nilai={r.nilai_kinerja} catatan={r.catatan_kinerja} />
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={16} className="px-3 py-6 text-center text-ink/50">
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

// 5 kegiatan lain yang dikenal aplikasi -- HARUS sama persis dgn whitelist
// KEGIATAN_LAIN_VALID di app/api/bencana/kegiatan-petugas/route.ts.
const KEGIATAN_LAIN_DAFTAR = [
  "PES SE2026",
  "SPDT NTP 2026",
  "SITASI 2026",
  "SKSPPI/SKLNPT/SKTNP/SKNP",
  "GC Mix Method",
] as const;

type KegiatanPetugasRow = {
  id: number;
  nama: string;
  status_kepegawaian: "organik" | "mitra";
  peran: string | null;
  aktif: boolean;
  pendaftaran_bencana_konfirmasi: boolean;
  // (3 Okt 2026) 2 flag manual tambahan -- permintaan user:
  // - rekomendasi_pml: mitra yg DIREKOMENDASIKAN jadi PML (bukan PPL).
  //   Dipakai utk MENGECUALIKAN mitra ybs dari Tier 1/2 popover "Saran" &
  //   dari kandidat "Auto Plot" di Langkah 4 tab Alokasi Petugas (tetap bisa
  //   dipilih manual lewat dropdown kalau admin benar2 mau).
  // - red_flag_kinerja: mitra dgn catatan kinerja buruk (diisi MANUAL oleh
  //   admin di sini, BUKAN dihitung otomatis) -- dikecualikan dari Tier 1/2
  //   & Auto Plot dgn alasan yg sama (jangan disarankan lagi).
  // Keduanya cuma BISA DIEDIT di tab ini (sama spt pendaftaran_bencana_
  // konfirmasi) -- ditampilkan read-only di tab Master Petugas.
  rekomendasi_pml: boolean;
  red_flag_kinerja: boolean;
  kegiatan_lain: string[];
  sudah_plotting: boolean;
  jumlah_subsls_diplot: number;
  // (3 Okt 2026) "Kolom tambahan" -- permintaan user: tampilan default
  // tabel ini TETAP spt semula, tapi admin bisa centang utk MENAMBAHKAN
  // info ini sbg kolom ekstra (lihat KOLOM_TAMBAHAN_DAFTAR & kolomTambahan
  // di bawah). Semuanya ikut terambil dari GET yg sama (tidak ada request
  // terpisah) supaya togglenya instan.
  alamat_kecamatan: string | null;
  alamat_nagari: string | null;
  no_hp: string | null;
  pml_nama: string | null;
  umur: number | null;
  jenis_kelamin: string | null;
  pendidikan: string | null;
  pekerjaan: string | null;
  status_kontak_pendaftaran_bencana: string | null;
  // (3 Okt 2026) Hasil penilaian kinerja mitra SE2026 -- kolom tambahan
  // "Nilai Kinerja" (lihat KOLOM_TAMBAHAN_DAFTAR), read-only di sini.
  nilai_kinerja: number | null;
  catatan_kinerja: string | null;
};

// (3 Okt 2026) Daftar kolom opsional tabel "Kegiatan Petugas" -- lihat
// komentar di KegiatanPetugasRow. `label` = teks header & checkbox
// picker; `render(r)` = isi sel-nya (dibuat function per-kolom supaya
// gampang tambah kolom baru tanpa ubah struktur tabel).
const KOLOM_TAMBAHAN_DAFTAR: {
  key: string;
  label: string;
  // (3 Okt 2026) true -> kolom ini TIDAK dirender sbg kolom <th>/<td>
  // terpisah di ujung tabel (spt kolom tambahan lain) -- kalau dicentang,
  // `render(r)` ditaruk LANGSUNG di sebelah nama petugas (lihat sel Nama di
  // KegiatanPetugasSection). Permintaan user utk "alamat" & "nilai kinerja".
  tempelDiNama?: boolean;
  render: (r: KegiatanPetugasRow) => ReactNode;
  // teks polos utk Export Excel (json_to_sheet butuh value primitif, bukan
  // JSX spt `render` di atas) -- JUGA dipakai sbg basis opsi filter kolom
  // tambahan (lihat opsiKolomTambahan di KegiatanPetugasSection).
  text: (r: KegiatanPetugasRow) => string;
}[] = [
  {
    key: "alamat",
    label: "Alamat (Kecamatan/Nagari)",
    tempelDiNama: true,
    render: (r) =>
      r.alamat_kecamatan || r.alamat_nagari ? (
        <span className="ml-1.5 whitespace-nowrap align-middle text-[11px] font-normal text-ink/50">
          ({r.alamat_nagari ?? "-"}, {r.alamat_kecamatan ?? "-"})
        </span>
      ) : null,
    text: (r) => (r.alamat_kecamatan || r.alamat_nagari ? `${r.alamat_nagari ?? "-"}, ${r.alamat_kecamatan ?? "-"}` : ""),
  },
  {
    key: "nilai_kinerja",
    label: "Nilai Kinerja",
    tempelDiNama: true,
    render: (r) => (
      <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
        {r.nilai_kinerja != null ? (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: warnaNilaiKinerja(r.nilai_kinerja) }}
            title={`Nilai Kinerja: ${r.nilai_kinerja} / 5`}
          >
            {r.nilai_kinerja}
          </span>
        ) : (
          <span className="text-[10px] text-ink/30">Belum Dinilai</span>
        )}
        <IkonNilaiKinerja nilai={r.nilai_kinerja} catatan={r.catatan_kinerja} />
      </span>
    ),
    text: (r) =>
      r.nilai_kinerja != null
        ? `Nilai ${r.nilai_kinerja}${r.catatan_kinerja ? ` (${r.catatan_kinerja})` : ""}`
        : "Belum Dinilai",
  },
  {
    key: "no_hp",
    label: "No. HP",
    render: (r) => r.no_hp || <span className="text-ink/30">-</span>,
    text: (r) => r.no_hp ?? "",
  },
  {
    key: "peran_pml",
    label: "Peran & PML Atasan",
    render: (r) => (
      <span>
        {r.peran ? r.peran.toUpperCase() : <span className="text-ink/30">belum ada peran</span>}
        {r.peran === "ppl" && (
          <span className="text-ink/50"> · PML: {r.pml_nama ?? <span className="text-ink/30">belum ada</span>}</span>
        )}
      </span>
    ),
    text: (r) => `${r.peran ? r.peran.toUpperCase() : "belum ada peran"}${r.peran === "ppl" ? ` (PML: ${r.pml_nama ?? "belum ada"})` : ""}`,
  },
  { key: "umur", label: "Umur", render: (r) => r.umur ?? <span className="text-ink/30">-</span>, text: (r) => (r.umur != null ? String(r.umur) : "") },
  {
    key: "jenis_kelamin",
    label: "Jenis Kelamin",
    render: (r) => r.jenis_kelamin || <span className="text-ink/30">-</span>,
    text: (r) => r.jenis_kelamin ?? "",
  },
  {
    key: "pendidikan",
    label: "Pendidikan",
    render: (r) => r.pendidikan || <span className="text-ink/30">-</span>,
    text: (r) => r.pendidikan ?? "",
  },
  {
    key: "pekerjaan",
    label: "Pekerjaan",
    render: (r) => r.pekerjaan || <span className="text-ink/30">-</span>,
    text: (r) => r.pekerjaan ?? "",
  },
  {
    key: "status_kontak",
    label: "Status Kontak Pendaftaran",
    render: (r) => r.status_kontak_pendaftaran_bencana || <span className="text-ink/30">-</span>,
    text: (r) => r.status_kontak_pendaftaran_bencana ?? "",
  },
];

function KegiatanPetugasSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<KegiatanPetugasRow[]>([]);
  // Kunci busy per sel yang sedang disimpan, format `${petugasId}:${field}`,
  // supaya checkbox/select lain tetap bisa dipakai saat satu sel lain masih
  // menyimpan -- dan errSel menyimpan pesan error PER SEL (bukan global)
  // supaya satu gagal simpan tidak mengganggu baris lain.
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errSel, setErrSel] = useState<Map<string, string>>(new Map());

  const [search, setSearch] = useState("");
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set());
  const [pendaftaranSel, setPendaftaranSel] = useState<Set<string>>(new Set());
  const [rekomendasiPmlSel, setRekomendasiPmlSel] = useState<Set<string>>(new Set());
  const [redFlagSel, setRedFlagSel] = useState<Set<string>>(new Set());
  const [plottingSel, setPlottingSel] = useState<Set<string>>(new Set());
  const [kegiatanSel, setKegiatanSel] = useState<Record<string, Set<string>>>(() => {
    const awal: Record<string, Set<string>> = {};
    for (const k of KEGIATAN_LAIN_DAFTAR) awal[k] = new Set<string>();
    return awal;
  });

  const [sortKey, setSortKey] = useState<"nama" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // (3 Okt 2026) "Kolom Tambahan" -- permintaan user: tampilan default
  // tabel ini tetap spt semula (set kosong di bawah), admin centang sendiri
  // kalau mau tambah info spt alamat/no HP/dll (lihat KOLOM_TAMBAHAN_DAFTAR).
  const [kolomTambahan, setKolomTambahan] = useState<Set<string>>(new Set());
  // (3 Okt 2026) Filter per kolom tambahan -- permintaan user: SELURUH
  // kolom tambahan (termasuk yg "ditempel di nama", lihat tempelDiNama di
  // KOLOM_TAMBAHAN_DAFTAR) bisa difilter. Satu Set per key, independen dari
  // apakah kolomnya SEDANG ditampilkan (kolomTambahan) -- supaya admin bisa
  // filter by Nilai Kinerja/Alamat walau kolomnya tidak dicentang tampil.
  const [kolomTambahanFilter, setKolomTambahanFilter] = useState<Record<string, Set<string>>>({});

  // (3 Okt 2026) Tombol "Muat Ulang" -- permintaan user: refresh data tabel
  // ini TANPA mereset filter yang sedang aktif (search/status/dll di atas).
  // `refreshing` SENGAJA dipisah dari `loading` -- `loading` cuma dipakai
  // utk layar "Memuat..." SEBELUM data pertama kali tampil (lihat `if
  // (loading) return ...` di bawah); kalau dipakai ulang di sini, klik
  // "Muat Ulang" akan menyembunyikan seluruh tabel (termasuk filter yg lagi
  // aktif) selama fetch berjalan, padahal maunya tabel & filter tetap
  // kelihatan, cuma datanya yg diganti pas fetch selesai.
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    muatUlang();
  }, []);

  async function muatUlang() {
    setLoadError(null);
    try {
      const res = await fetch("/api/bencana/kegiatan-petugas");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat data kegiatan petugas.");
      setRows(json.data ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat data kegiatan petugas.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await muatUlang();
    } finally {
      setRefreshing(false);
    }
  }

  function tandaiError(kunci: string, pesan: string | null) {
    setErrSel((prev) => {
      const next = new Map(prev);
      if (pesan) next.set(kunci, pesan);
      else next.delete(kunci);
      return next;
    });
  }

  async function ubahStatusKepegawaian(id: number, status: "organik" | "mitra") {
    const kunci = `${id}:status`;
    const sebelum = rows.find((r) => r.id === id)?.status_kepegawaian;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status_kepegawaian: status } : r)));
    setBusy((prev) => new Set(prev).add(kunci));
    tandaiError(kunci, null);
    try {
      const res = await fetch("/api/bencana/kegiatan-petugas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petugas_id: id, status_kepegawaian: status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan status kepegawaian.");
    } catch (e) {
      if (sebelum) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status_kepegawaian: sebelum } : r)));
      tandaiError(kunci, e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(kunci);
        return next;
      });
    }
  }

  async function ubahMendaftar(id: number, nilai: boolean) {
    const kunci = `${id}:mendaftar`;
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, pendaftaran_bencana_konfirmasi: nilai } : r))
    );
    setBusy((prev) => new Set(prev).add(kunci));
    tandaiError(kunci, null);
    try {
      const res = await fetch("/api/bencana/kegiatan-petugas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petugas_id: id, pendaftaran_bencana_konfirmasi: nilai }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan status pendaftaran.");
    } catch (e) {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, pendaftaran_bencana_konfirmasi: !nilai } : r))
      );
      tandaiError(kunci, e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(kunci);
        return next;
      });
    }
  }

  async function ubahRekomendasiPml(id: number, nilai: boolean) {
    const kunci = `${id}:rekomendasi_pml`;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, rekomendasi_pml: nilai } : r)));
    setBusy((prev) => new Set(prev).add(kunci));
    tandaiError(kunci, null);
    try {
      const res = await fetch("/api/bencana/kegiatan-petugas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petugas_id: id, rekomendasi_pml: nilai }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan rekomendasi PML.");
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, rekomendasi_pml: !nilai } : r)));
      tandaiError(kunci, e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(kunci);
        return next;
      });
    }
  }

  async function ubahRedFlag(id: number, nilai: boolean) {
    const kunci = `${id}:red_flag`;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, red_flag_kinerja: nilai } : r)));
    setBusy((prev) => new Set(prev).add(kunci));
    tandaiError(kunci, null);
    try {
      const res = await fetch("/api/bencana/kegiatan-petugas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petugas_id: id, red_flag_kinerja: nilai }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan red flag.");
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, red_flag_kinerja: !nilai } : r)));
      tandaiError(kunci, e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(kunci);
        return next;
      });
    }
  }

  async function ubahKegiatanLain(id: number, kegiatan: string, aktif: boolean) {
    const kunci = `${id}:${kegiatan}`;
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              kegiatan_lain: aktif
                ? Array.from(new Set([...r.kegiatan_lain, kegiatan]))
                : r.kegiatan_lain.filter((k) => k !== kegiatan),
            }
          : r
      )
    );
    setBusy((prev) => new Set(prev).add(kunci));
    tandaiError(kunci, null);
    try {
      const res = await fetch("/api/bencana/kegiatan-petugas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petugas_id: id, kegiatan, aktif }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan kegiatan.");
    } catch (e) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                kegiatan_lain: aktif
                  ? r.kegiatan_lain.filter((k) => k !== kegiatan)
                  : Array.from(new Set([...r.kegiatan_lain, kegiatan])),
              }
            : r
        )
      );
      tandaiError(kunci, e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(kunci);
        return next;
      });
    }
  }

  function opsiUnik(nilai: (r: KegiatanPetugasRow) => string): string[] {
    return Array.from(new Set(rows.map(nilai))).sort((a, b) => a.localeCompare(b, "id"));
  }

  const opsiStatus = opsiUnik((r) => (r.status_kepegawaian === "organik" ? "Organik" : "Mitra"));
  const opsiPendaftaran = ["Sudah Mengajukan Diri", "Belum Mengajukan Diri"];
  const opsiRekomendasiPml = ["Direkomendasikan PML", "Tidak"];
  const opsiRedFlag = ["Red Flag", "Tidak"];
  const opsiPlotting = ["Sudah Plotting", "Belum Plotting"];

  // (3 Okt 2026) Opsi filter kolom tambahan -- basisnya `text(r)` yg sama
  // dipakai Export Excel, teks kosong diganti label "(Kosong)" supaya tetap
  // bisa dipilih di daftar filter (bukan hilang begitu saja).
  function opsiKolomTambahan(k: (typeof KOLOM_TAMBAHAN_DAFTAR)[number]): string[] {
    return Array.from(new Set(rows.map((r) => k.text(r) || "(Kosong)"))).sort((a, b) => a.localeCompare(b, "id"));
  }

  function sortAsc(key: "nama") {
    setSortKey(key);
    setSortDir("asc");
  }
  function sortDesc(key: "nama") {
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
      if (statusSel.size > 0 && !statusSel.has(r.status_kepegawaian === "organik" ? "Organik" : "Mitra"))
        return false;
      if (
        pendaftaranSel.size > 0 &&
        !pendaftaranSel.has(r.pendaftaran_bencana_konfirmasi ? "Sudah Mengajukan Diri" : "Belum Mengajukan Diri")
      )
        return false;
      if (
        rekomendasiPmlSel.size > 0 &&
        !rekomendasiPmlSel.has(r.rekomendasi_pml ? "Direkomendasikan PML" : "Tidak")
      )
        return false;
      if (redFlagSel.size > 0 && !redFlagSel.has(r.red_flag_kinerja ? "Red Flag" : "Tidak")) return false;
      if (plottingSel.size > 0 && !plottingSel.has(r.sudah_plotting ? "Sudah Plotting" : "Belum Plotting"))
        return false;
      for (const k of KEGIATAN_LAIN_DAFTAR) {
        const sel = kegiatanSel[k];
        if (sel && sel.size > 0) {
          const label = r.kegiatan_lain.includes(k) ? "Ikut" : "Tidak Ikut";
          if (!sel.has(label)) return false;
        }
      }
      // (3 Okt 2026) Filter kolom tambahan -- berlaku terlepas dari apakah
      // kolomnya sedang dicentang tampil (lihat komentar di state
      // kolomTambahanFilter di atas).
      for (const k of KOLOM_TAMBAHAN_DAFTAR) {
        const sel = kolomTambahanFilter[k.key];
        if (sel && sel.size > 0 && !sel.has(k.text(r) || "(Kosong)")) return false;
      }
      return true;
    });

    if (sortKey === "nama") {
      hasil = [...hasil].sort((a, b) => {
        const cmp = a.nama.localeCompare(b.nama, "id");
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return hasil;
  }, [
    rows,
    search,
    statusSel,
    pendaftaranSel,
    rekomendasiPmlSel,
    redFlagSel,
    plottingSel,
    kegiatanSel,
    kolomTambahanFilter,
    sortKey,
    sortDir,
  ]);

  function handleExport() {
    // (3 Okt 2026) Kolom tambahan yg SEDANG dicentang/ditampilkan ikut
    // masuk Excel juga (konsisten dgn apa yg kelihatan di layar) -- kalau
    // tidak ada yg dicentang, hasil export persis spt sebelumnya.
    const kolomTambahanAktif = KOLOM_TAMBAHAN_DAFTAR.filter((k) => kolomTambahan.has(k.key));
    const dataRows = filtered.map((r) => {
      const baris: Record<string, string> = {
        Nama: r.nama,
        "Status Kepegawaian": r.status_kepegawaian === "organik" ? "Organik" : "Mitra",
        "Mengajukan Diri Kegiatan Bencana": r.pendaftaran_bencana_konfirmasi ? "Ya" : "Tidak",
        "Rekomendasi PML": r.rekomendasi_pml ? "Ya" : "",
        "Red Flag Kinerja": r.red_flag_kinerja ? "Ya" : "",
        "Sudah Plotting (ke Kegiatan Bencana)": r.sudah_plotting
          ? `Ya (${r.jumlah_subsls_diplot} Sub SLS)`
          : "Belum",
      };
      for (const k of KEGIATAN_LAIN_DAFTAR) baris[k] = r.kegiatan_lain.includes(k) ? "Ya" : "";
      for (const k of kolomTambahanAktif) baris[k.label] = k.text(r);
      return baris;
    });
    const ws = XLSX.utils.json_to_sheet(dataRows);
    ws["!cols"] = [
      { wch: 26 },
      { wch: 16 },
      { wch: 26 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
      ...KEGIATAN_LAIN_DAFTAR.map(() => ({ wch: 16 })),
      ...kolomTambahanAktif.map(() => ({ wch: 20 })),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kegiatan Petugas");
    XLSX.writeFile(wb, "kegiatan_petugas.xlsx");
  }

  if (loading) {
    return <p className="mt-6 text-ink/60">Memuat data kegiatan petugas...</p>;
  }
  if (loadError) {
    return <p className="mt-6 rounded-md bg-rust-100 px-4 py-3 text-rust-700">{loadError}</p>;
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <section className="rounded-md border border-line bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-blue-400">Kegiatan Petugas</p>
        <p className="mt-1 text-sm text-ink/70">
          Status kesediaan &amp; keterlibatan seluruh petugas (organik &amp; mitra) di kegiatan pendataan
          bencana maupun kegiatan lain yang berjalan bersamaan. Kolom &ldquo;Status Kepegawaian&rdquo;,
          &ldquo;Mengajukan Diri&rdquo;, &ldquo;Rekomendasi PML&rdquo;, &ldquo;Red Flag Kinerja&rdquo;, dan
          kelima kolom kegiatan lain BISA DIEDIT langsung di tabel ini (klik checkbox/pilihan, otomatis
          tersimpan). Kolom &ldquo;Sudah Plotting (ke Kegiatan Bencana)&rdquo; murni informasi (dihitung
          dari jumlah Sub SLS yang sudah di-plot ke petugas ini di tab Alokasi Petugas, khusus kegiatan
          pendataan bencana) -- BUKAN tombol/penugasan, hanya penanda supaya terlihat sekilas siapa yang
          belum kebagian wilayah.
        </p>
        <p className="mt-1 text-xs text-ink/50">
          &ldquo;Rekomendasi PML&rdquo; &amp; &ldquo;Red Flag Kinerja&rdquo;: mitra yang ditandai salah
          satu TIDAK akan muncul lagi di popover &ldquo;💡 Saran&rdquo; (Tier 1/2) maupun fitur
          &ldquo;🤖 Auto Plot&rdquo; di Langkah 4 tab Alokasi Petugas -- tetap bisa diplot manual lewat
          dropdown kalau admin benar-benar mau.
        </p>
        <p className="mt-2 text-xs text-ink/50">
          Menampilkan {filtered.length} dari {rows.length} petugas.
        </p>
      </section>

      <div className="flex items-center justify-end gap-2">
        {/* (3 Okt 2026) "Muat Ulang" -- refresh data tabel tanpa mereset
            filter yang sedang aktif (search/status/dll); lihat handleRefresh
            & komentar di state `refreshing` di atas. */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Muat ulang data tabel ini, filter yang sedang aktif tidak berubah"
          className="rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/70 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? "⟳ Memuat..." : "⟳ Muat Ulang"}
        </button>
        {/* (3 Okt 2026) "+ Kolom Tambahan" -- permintaan user: tampilan
            default tabel ini tetap spt semula, tapi bisa ditambah kolom
            info lain (alamat, no HP, dst.) lewat centang di sini. Dipakai
            <details>/<summary> (bukan state buka/tutup + listener klik-luar
            spt ThKontrol) krn lebih sederhana & cukup utk kebutuhan ini. */}
        <details className="group relative">
          <summary className="cursor-pointer list-none rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink/70 hover:bg-blue-50">
            + Kolom Tambahan{kolomTambahan.size > 0 ? ` (${kolomTambahan.size})` : ""}
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-72 rounded-md border border-line bg-white p-2 text-xs shadow-lg">
            <p className="mb-1.5 px-1 text-[11px] font-medium text-ink/50">
              Centang info tambahan yang mau ditampilkan. &ldquo;Alamat&rdquo; &amp; &ldquo;Nilai
              Kinerja&rdquo; ditaruh di sebelah nama (bukan kolom tersendiri); sisanya jadi kolom di
              ujung tabel. Semua bisa difilter lewat tombol ⚲ di sampingnya.
            </p>
            {KOLOM_TAMBAHAN_DAFTAR.map((k) => (
              <div key={k.key} className="flex items-center gap-1.5 rounded px-1 py-1 hover:bg-gray-50">
                <label className="flex min-w-0 flex-1 items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={kolomTambahan.has(k.key)}
                    onChange={(e) =>
                      setKolomTambahan((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(k.key);
                        else next.delete(k.key);
                        return next;
                      })
                    }
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                  <span className="truncate text-ink/80">{k.label}</span>
                </label>
                <BtnFilterKolomTambahan
                  label={k.label}
                  options={opsiKolomTambahan(k)}
                  selected={kolomTambahanFilter[k.key] ?? new Set()}
                  onApply={(next) => setKolomTambahanFilter((prev) => ({ ...prev, [k.key]: next }))}
                />
              </div>
            ))}
          </div>
        </details>
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
              <ThKontrol
                label="Mengajukan Diri"
                filter={{ options: opsiPendaftaran, selected: pendaftaranSel, onApply: setPendaftaranSel }}
              />
              <ThKontrol
                label="Rekomendasi PML"
                filter={{ options: opsiRekomendasiPml, selected: rekomendasiPmlSel, onApply: setRekomendasiPmlSel }}
              />
              <ThKontrol
                label="Red Flag Kinerja"
                filter={{ options: opsiRedFlag, selected: redFlagSel, onApply: setRedFlagSel }}
              />
              <ThKontrol
                label="Sudah Plotting (ke Kegiatan Bencana)"
                filter={{ options: opsiPlotting, selected: plottingSel, onApply: setPlottingSel }}
              />
              {KEGIATAN_LAIN_DAFTAR.map((k) => (
                <ThKontrol
                  key={k}
                  label={k}
                  filter={{
                    options: ["Ikut", "Tidak Ikut"],
                    selected: kegiatanSel[k],
                    onApply: (next) => setKegiatanSel((prev) => ({ ...prev, [k]: next })),
                  }}
                />
              ))}
              {/* (3 Okt 2026) Kolom tambahan yg dicentang lewat "+ Kolom
                  Tambahan" -- ditaruh di UJUNG supaya tidak mengganggu
                  urutan kolom default yg sudah ada. Kolom "tempelDiNama"
                  (alamat, nilai kinerja) TIDAK dapat <th> di sini sama
                  sekali -- isinya ditempel langsung di sel Nama (lihat
                  <tbody> di bawah). Sisanya dibungkus ThKontrol (bukan
                  <th> polos lagi) supaya punya filter sendiri. */}
              {KOLOM_TAMBAHAN_DAFTAR.filter((k) => !k.tempelDiNama && kolomTambahan.has(k.key)).map((k) => (
                <ThKontrol
                  key={k.key}
                  label={k.label}
                  filter={{
                    options: opsiKolomTambahan(k),
                    selected: kolomTambahanFilter[k.key] ?? new Set(),
                    onApply: (next) => setKolomTambahanFilter((prev) => ({ ...prev, [k.key]: next })),
                  }}
                />
              ))}
              {/* (3 Okt 2026) "Status Kepegawaian" dipindah ke PALING UJUNG
                  (permintaan user), sesudah kolom tambahan. */}
              <ThKontrol
                label="Status Kepegawaian"
                filter={{ options: opsiStatus, selected: statusSel, onApply: setStatusSel }}
              />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const kunciStatus = `${r.id}:status`;
              const kunciMendaftar = `${r.id}:mendaftar`;
              const kunciRekomendasiPml = `${r.id}:rekomendasi_pml`;
              const kunciRedFlag = `${r.id}:red_flag`;
              return (
                <tr key={r.id} className="border-t border-line hover:bg-blue-50/40">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium">
                    <span className="inline-flex flex-wrap items-center">
                      {r.nama}
                      {/* (3 Okt 2026) Kolom tambahan "tempelDiNama" (alamat,
                          nilai kinerja) -- kalau dicentang, ditempel LANGSUNG
                          di sebelah nama (bukan kolom terpisah). Urutannya
                          ikut urutan di KOLOM_TAMBAHAN_DAFTAR. */}
                      {KOLOM_TAMBAHAN_DAFTAR.filter((k) => k.tempelDiNama && kolomTambahan.has(k.key)).map((k) => (
                        <span key={k.key}>{k.render(r)}</span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={r.pendaftaran_bencana_konfirmasi}
                        disabled={busy.has(kunciMendaftar)}
                        onChange={(e) => ubahMendaftar(r.id, e.target.checked)}
                        className="h-3.5 w-3.5 accent-blue-600 disabled:opacity-50"
                      />
                      <span className="text-xs text-ink/70">
                        {r.pendaftaran_bencana_konfirmasi ? "Ya" : "Tidak"}
                      </span>
                    </label>
                    {errSel.has(kunciMendaftar) && (
                      <p className="mt-0.5 text-[10px] text-rust-600">{errSel.get(kunciMendaftar)}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={r.rekomendasi_pml}
                        disabled={busy.has(kunciRekomendasiPml)}
                        onChange={(e) => ubahRekomendasiPml(r.id, e.target.checked)}
                        className="h-3.5 w-3.5 accent-gold-400 disabled:opacity-50"
                      />
                      <span className="text-xs text-ink/70">{r.rekomendasi_pml ? "Ya" : "Tidak"}</span>
                    </label>
                    {errSel.has(kunciRekomendasiPml) && (
                      <p className="mt-0.5 text-[10px] text-rust-600">{errSel.get(kunciRekomendasiPml)}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={r.red_flag_kinerja}
                        disabled={busy.has(kunciRedFlag)}
                        onChange={(e) => ubahRedFlag(r.id, e.target.checked)}
                        className="h-3.5 w-3.5 accent-rust-500 disabled:opacity-50"
                      />
                      <span className="text-xs text-ink/70">{r.red_flag_kinerja ? "Ya" : "Tidak"}</span>
                    </label>
                    {errSel.has(kunciRedFlag) && (
                      <p className="mt-0.5 text-[10px] text-rust-600">{errSel.get(kunciRedFlag)}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.sudah_plotting ? (
                      <span
                        title="Murni informasi -- plotting dilakukan di tab Alokasi Petugas, bukan di sini."
                        className="rounded-full bg-moss-100 px-2 py-0.5 text-xs font-medium text-moss-700"
                      >
                        Ya ({r.jumlah_subsls_diplot} Sub SLS)
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-ink/50">
                        Belum
                      </span>
                    )}
                  </td>
                  {KEGIATAN_LAIN_DAFTAR.map((k) => {
                    const kunciK = `${r.id}:${k}`;
                    const ikut = r.kegiatan_lain.includes(k);
                    return (
                      <td key={k} className="px-3 py-2">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={ikut}
                            disabled={busy.has(kunciK)}
                            onChange={(e) => ubahKegiatanLain(r.id, k, e.target.checked)}
                            className="h-3.5 w-3.5 accent-blue-600 disabled:opacity-50"
                          />
                          <span className="text-xs text-ink/70">{ikut ? "Ikut" : "—"}</span>
                        </label>
                        {errSel.has(kunciK) && (
                          <p className="mt-0.5 text-[10px] text-rust-600">{errSel.get(kunciK)}</p>
                        )}
                      </td>
                    );
                  })}
                  {KOLOM_TAMBAHAN_DAFTAR.filter((k) => !k.tempelDiNama && kolomTambahan.has(k.key)).map((k) => (
                    <td key={k.key} className="px-3 py-2 text-ink/80">
                      {k.render(r)}
                    </td>
                  ))}
                  {/* (3 Okt 2026) "Status Kepegawaian" dipindah ke PALING
                      UJUNG (permintaan user), sejalan dgn <th>-nya di atas. */}
                  <td className="px-3 py-2">
                    <select
                      value={r.status_kepegawaian}
                      disabled={busy.has(kunciStatus)}
                      onChange={(e) => ubahStatusKepegawaian(r.id, e.target.value as "organik" | "mitra")}
                      className="rounded border border-line bg-white px-1.5 py-1 text-xs disabled:opacity-50"
                    >
                      <option value="organik">Organik</option>
                      <option value="mitra">Mitra</option>
                    </select>
                    {errSel.has(kunciStatus) && (
                      <p className="mt-0.5 text-[10px] text-rust-600">{errSel.get(kunciStatus)}</p>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={
                    6 +
                    KEGIATAN_LAIN_DAFTAR.length +
                    KOLOM_TAMBAHAN_DAFTAR.filter((k) => !k.tempelDiNama && kolomTambahan.has(k.key)).length
                  }
                  className="px-3 py-6 text-center text-ink/50"
                >
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
// mencerminkan alur kerja Langkah 1-4. (3 Okt 2026, revisi) Sekarang
// berfungsi sbg SUB-TAB beneran: diklik utk GANTI section yg dirender
// (cuma 1 section aktif dlm satu waktu -- lihat langkahAktif &
// {langkahAktif === n && (...)} di AlokasiPetugasSection), bukan lagi
// scroll-spy ke halaman panjang berisi semua section sekaligus. Disembunyikan
// di layar sempit (<lg) supaya tidak mendesak tabel yg sudah lebar.
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

// (3 Okt 2026) Modal "Pecah Sub SLS" -- memecah 1 Sub SLS yg skor beban
// pendataannya sangat besar ke beberapa PPL sekaligus, masing2 memegang
// SEBAGIAN KK secara langsung (basis "Jumlah KK langsung", bukan
// persentase/skor mentah -- keputusan admin saat fitur ini didesain).
// Minimal 2 PPL, total KK yg dibagi tidak boleh melebihi KK Total Sub SLS
// ini. Skor beban/jarak tiap bagian diprorata OTOMATIS oleh server
// (bencana_kertas_kerja_alokasi()) -- modal ini cuma mengumpulkan
// {ppl_id, porsi_kk} per baris, tidak menghitung skor sendiri.
function ModalPecahSubSls({
  row,
  pplOptions,
  sudahDipecahSebelumnya,
  busy,
  error,
  onBatal,
  onSimpan,
}: {
  row: KertasKerjaRow;
  pplOptions: PetugasRingkas[];
  sudahDipecahSebelumnya: KertasKerjaRow[];
  busy: boolean;
  error: string | null;
  onBatal: () => void;
  onSimpan: (pembagian: { ppl_id: number; porsi_kk: number }[]) => void;
}) {
  type Baris = { id: number; ppl_id: number | null; porsi_kk: string };
  const [baris, setBaris] = useState<Baris[]>(() => {
    if (sudahDipecahSebelumnya.length > 0) {
      return sudahDipecahSebelumnya.map((r, i) => ({
        id: i,
        ppl_id: r.ppl_id,
        porsi_kk: String(r.porsi_kk ?? ""),
      }));
    }
    return [
      { id: 0, ppl_id: row.ppl_id, porsi_kk: "" },
      { id: 1, ppl_id: null, porsi_kk: "" },
    ];
  });
  const idSeq = useRef(baris.length);

  const totalDibagi = baris.reduce((s, b) => s + (Number(b.porsi_kk) || 0), 0);
  const sisa = row.kk_total - totalDibagi;

  function tambahBaris() {
    setBaris((prev) => [...prev, { id: idSeq.current++, ppl_id: null, porsi_kk: "" }]);
  }
  function hapusBaris(id: number) {
    setBaris((prev) => prev.filter((b) => b.id !== id));
  }
  function ubahPpl(id: number, pplId: number | null) {
    setBaris((prev) => prev.map((b) => (b.id === id ? { ...b, ppl_id: pplId } : b)));
  }
  function ubahPorsi(id: number, nilai: string) {
    setBaris((prev) => prev.map((b) => (b.id === id ? { ...b, porsi_kk: nilai } : b)));
  }

  const siapDisimpan =
    baris.length >= 2 &&
    baris.every((b) => b.ppl_id !== null && Number(b.porsi_kk) > 0) &&
    new Set(baris.map((b) => b.ppl_id)).size === baris.length &&
    totalDibagi > 0 &&
    totalDibagi <= row.kk_total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h3 className="font-medium text-blue-950">
          Pecah Sub SLS {row.sub_sls} — {row.nagari}
        </h3>
        <p className="mt-1 text-xs text-ink/60">
          Bagi beban Sub SLS ini (KK Total: {row.kk_total.toLocaleString("id-ID")}, skor beban pendataan:{" "}
          {row.skor_beban_pendataan.toLocaleString("id-ID")}) ke beberapa PPL sekaligus. Masukkan jumlah KK LANGSUNG
          yang jadi tanggung jawab tiap PPL -- skor beban & skor jarak tiap bagian dihitung otomatis secara
          proporsional.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {baris.map((b) => (
            <div key={b.id} className="flex items-center gap-1.5">
              <Combobox
                value={b.ppl_id}
                onChange={(v) => ubahPpl(b.id, v)}
                options={pplOptions.map((p) => ({ value: p.id, label: p.nama }))}
                placeholder="Pilih PPL..."
                className="flex-1"
              />
              <input
                type="number"
                min={1}
                value={b.porsi_kk}
                onChange={(e) => ubahPorsi(b.id, e.target.value)}
                placeholder="Jumlah KK"
                className="w-28 rounded border border-line px-2 py-1 text-sm"
              />
              <span className="text-xs text-ink/50">KK</span>
              {baris.length > 2 && (
                <button
                  type="button"
                  onClick={() => hapusBaris(b.id)}
                  className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-ink/60 hover:bg-gray-200"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={tambahBaris}
          className="mt-2 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-ink/70 hover:bg-gray-200"
        >
          + Tambah PPL
        </button>

        <div
          className={`mt-3 rounded-md px-3 py-2 text-xs ${
            sisa < 0 ? "bg-rust-50 text-rust-700" : sisa === 0 ? "bg-moss-50 text-moss-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          Total dibagi: {totalDibagi.toLocaleString("id-ID")} KK dari {row.kk_total.toLocaleString("id-ID")} KK Total.{" "}
          {sisa < 0
            ? `Kelebihan ${Math.abs(sisa).toLocaleString("id-ID")} KK -- kurangi dulu.`
            : sisa > 0
            ? `Sisa ${sisa.toLocaleString("id-ID")} KK belum dibagi ke siapa pun.`
            : "Sudah terbagi habis."}
        </div>

        {error && <div className="mt-2 rounded-md bg-rust-50 px-3 py-2 text-xs text-rust-700">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onBatal}
            disabled={busy}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-ink/70 hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!siapDisimpan || busy}
            onClick={() =>
              onSimpan(
                baris.map((b) => ({ ppl_id: b.ppl_id as number, porsi_kk: Number(b.porsi_kk) }))
              )
            }
            className="rounded-md bg-blue-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-40"
          >
            {busy ? "Menyimpan..." : "Simpan Pembagian"}
          </button>
        </div>
      </div>
    </div>
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
  const [titikSubsls, setTitikSubsls] = useState<TitikSubsls[]>([]);
  const [hariKerjaInput, setHariKerjaInput] = useState(24);
  // (3 Okt 2026) Dulu hardcode "const TOTAL_PPL_TETAP = 133" -- permintaan
  // user: dijadikan bisa diubah admin (bukan angka tetap di kode), supaya
  // "Rata-rata beban per PPL" di Langkah 4 bisa dihitung ulang dgn asumsi
  // jumlah PPL yg berbeda (mis. disamakan dgn "Kebutuhan PPL (estimasi)"
  // hasil Langkah 2, atau skenario what-if lain) -- lihat input di Langkah 4
  // & tombol "Pakai estimasi Langkah 2". Default 133 dipertahankan supaya
  // perilaku lama tidak berubah sebelum admin sengaja menggantinya.
  const [totalPplAsumsi, setTotalPplAsumsi] = useState(133);
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
  // (2 Okt 2026) Sama spt tabel Beban: cari sudah ditopang kotak gabungan di
  // atas tabel, titik-tiga kolom Nagari/Jorong-SLS/Sub SLS cukup Urutkan.
  const [sampelSortKey, setSampelSortKey] = useState<"nagari" | "jorong" | "subsls" | null>(null);
  const [sampelSortDir, setSampelSortDir] = useState<"asc" | "desc">("asc");
  function sampelSortAsc(key: NonNullable<typeof sampelSortKey>) {
    setSampelSortKey(key);
    setSampelSortDir("asc");
  }
  function sampelSortDesc(key: NonNullable<typeof sampelSortKey>) {
    setSampelSortKey(key);
    setSampelSortDir("desc");
  }
  function sampelSortReset() {
    setSampelSortKey(null);
  }
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
  // (3 Okt 2026) Filter kolom PPL (⋮) grup KEDUA -- permintaan user: filter
  // baris Langkah 4 menurut penilaian kinerja PPL yg SEDANG terpasang di
  // baris itu (draft-aware, lewat efektifPplId, sama spt filter nama PPL).
  const [nilaiKinerjaPplFilter, setNilaiKinerjaPplFilter] = useState<Set<string>>(new Set());
  const [pmlFilterLangkah4, setPmlFilterLangkah4] = useState<number | "">("");
  const [dataFilter, setDataFilter] = useState<"" | "lengkap" | "belum">("");
  const [statusBebanFilter, setStatusBebanFilter] = useState<"" | BalanceTone>("");
  const [statusPlotFilter, setStatusPlotFilter] = useState<"" | "sudah" | "belum">("");
  const [hanyaBerubahFilter, setHanyaBerubahFilter] = useState(false);
  const [search, setSearch] = useState("");
  // (2 Okt 2026) Cari khusus Kecamatan -- field ini TIDAK ikut kotak cari
  // gabungan "Cari Nagari/Jorong/Sub SLS" di atas (yg cuma menyasar 3 kolom
  // itu), jadi diberi kotak cari sendiri di titik-tiganya.
  const [kecamatanHeaderSearch, setKecamatanHeaderSearch] = useState("");
  const [page, setPage] = useState(1);
  const [alokasiPageSize, setAlokasiPageSize] = useState<number>(ALOKASI_PAGE_SIZE);
  // (3 Okt 2026) "📍 Wilayah Lain" -- idsubsls tujuan yg SEDANG menunggu
  // discroll-ke (lihat SarankanWilayahTombol & efek scroll di bawah `paged`).
  // null = tidak ada navigasi yg sedang berjalan.
  const [scrollTargetIdsubsls, setScrollTargetIdsubsls] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<
    | "kecamatan"
    | "nagari"
    | "jorong"
    | "subsls"
    | "skor_beban_pendataan"
    | "skor_jarak"
    | "skor_beban_akhir"
    | "beban_ppl"
    | "ppl"
    | "pml"
    | null
  >(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [modeFokus, setModeFokus] = useState(false);
  // (3 Okt 2026) "Tampilan Padat" -- lihat komentar di dekat tabel Langkah 4.
  const [tampilanPadat, setTampilanPadat] = useState(false);
  const freezeOffsetAlokasi = hitungOffsetFreezeAlokasi(modeFokus);
  const [diffTerbuka, setDiffTerbuka] = useState(false);

  // Draft plotting Sub SLS->PPL & PPL->PML: TIDAK submit ke server tiap
  // dropdown dipilih (supaya bisa trial-error lihat keseimbangan beban dulu).
  // Baru terkirim ke server sekaligus saat tombol "Simpan Perubahan" ditekan.
  const [draftPpl, setDraftPpl] = useState<Record<string, number | null>>({});
  // (3 Okt 2026) Baris Pecah Sub SLS (porsi_kk != null) SELALU dianggap
  // sudah final/tersimpan ke ppl_id-nya sendiri -- TIDAK PERNAH lewat
  // draftPpl (dropdown Langkah 4 disembunyikan utk baris ini, lihat render
  // tabel). Dipakai di SEMUA tempat yg sebelumnya baca `draftPpl[idsubsls]`
  // langsung, supaya "Simpan Perubahan" tidak salah mengira baris pecahan
  // "dilepas" (null) lalu mengirim buka_kunci yg akan menghapus SELURUH
  // pecahannya.
  function efektifPplId(r: KertasKerjaRow): number | null {
    return r.porsi_kk !== null ? r.ppl_id : draftPpl[r.idsubsls] ?? null;
  }
  const [draftPmlByPpl, setDraftPmlByPpl] = useState<Record<number, number | null>>({});
  const [simpanBusy, setSimpanBusy] = useState(false);
  const [simpanError, setSimpanError] = useState<string | null>(null);
  // (3 Okt 2026) Progres "Simpan Perubahan" -- permintaan user: tombolnya
  // tampilkan persentase berjalan (bukan cuma teks statis "Menyimpan...")
  // krn tiap baris/PML dikirim SATU PER SATU ke server (satu request per
  // baris, bukan 1 request borongan), jadi bisa lama kalau perubahannya
  // banyak -- admin perlu tahu ini masih jalan & sudah sejauh mana, bukan
  // macet. null = tidak sedang menyimpan.
  const [simpanProgress, setSimpanProgress] = useState<{ selesai: number; total: number } | null>(null);
  // Pembagi skor jarak (lihat muatPengaturanBeban) -- default 5 sama dgn
  // default di server, dipakai utk menghitung PERKIRAAN Skor Jarak di kolom
  // Langkah 4 sblm plot tersimpan.
  const [pembagiJarakKm, setPembagiJarakKm] = useState(5);
  // (3 Okt 2026) "Pecah Sub SLS": modal terpisah dari mekanisme draft di
  // atas -- langsung tersimpan ke server begitu "Simpan Pembagian" ditekan
  // (TIDAK ikut tombol "Simpan Perubahan"), krn bentuk datanya beda (1
  // idsubsls -> banyak ppl_id, tidak cocok dgn draftPpl yg cuma menyimpan 1
  // ppl_id per idsubsls). modalPecah menyimpan baris Sub SLS yg sedang
  // dipecah/diedit pembagiannya (null = modal tertutup).
  const [modalPecah, setModalPecah] = useState<KertasKerjaRow | null>(null);
  const [pecahBusy, setPecahBusy] = useState(false);
  const [pecahError, setPecahError] = useState<string | null>(null);
  const [gabungBusyId, setGabungBusyId] = useState<string | null>(null);
  // (3 Okt 2026) Umpan balik "Gabung Kembali" LANGSUNG di baris ybs (bukan
  // cuma `simpanError` di toolbar atas, yg jauh dari baris & sering tidak
  // disadari admin krn tabelnya panjang & berpaginasi -- ini akar laporan
  // "setelah split tidak bisa hapus split", padahal aksinya SEBENARNYA
  // berhasil/gagal dgn jelas, cuma pesannya tidak terlihat). null = tidak
  // ada pesan ditampilkan. Dibersihkan otomatis saat mulai aksi baru di
  // baris lain atau sesudah beberapa detik.
  const [gabungInfo, setGabungInfo] = useState<{ idsubsls: string; teks: string; tipe: "ok" | "error" } | null>(
    null
  );
  // (3 Okt 2026) "Reset Semua Plotting": hapus SELURUH plotting PPL (termasuk
  // Sub SLS yg sudah dipecah) sekali jalan -- aksi destruktif, digerbangi PIN
  // statis (app ini tidak punya sistem login sama sekali) supaya tidak
  // kepencet tidak sengaja.
  const [modalReset, setModalReset] = useState(false);
  const [resetKecamatan, setResetKecamatan] = useState(""); // "" = semua kecamatan
  const [resetNagari, setResetNagari] = useState(""); // "" = semua nagari di kecamatan terpilih
  const [resetPin, setResetPin] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // (3 Okt 2026) "Auto Plot": idsubsls baris yg PPL-nya diisi oleh saran
  // otomatis (handleAutoPlot) dan BELUM ditinjau/disetujui admin -- dipakai
  // utk highlight baris warna cokelat (gold-100) + tombol Setujui/Batalkan.
  // SENGAJA bukan plotting final: draftPpl-nya sama persis spt kalau admin
  // pilih manual, jadi tetap lewat alur draft -> "Simpan Perubahan" yg sama,
  // konsisten dgn aturan baku proyek ini (tidak ada alokasi otomatis yg
  // mengikat, keputusan akhir selalu admin).
  const [autoPlotSubsls, setAutoPlotSubsls] = useState<Set<string>>(new Set());

  // Draft koreksi Kertas Kerja Beban (KK Total & KK Terdampak per Sub SLS):
  // sama seperti draft plotting -- input lokal dulu, baru dikirim batch
  // saat "Simpan Perubahan" ditekan supaya tidak spam server tiap ketik.
  const [draftKkTotal, setDraftKkTotal] = useState<Record<string, number>>({});
  const [draftKkTerdampak, setDraftKkTerdampak] = useState<Record<string, number>>({});
  const [bebanKecFilter, setBebanKecFilter] = useState("");
  const [bebanSearch, setBebanSearch] = useState("");
  // (2 Okt 2026) Urutkan per kolom Nagari/Jorong-SLS/Sub SLS -- kolom ini
  // TIDAK diberi ikon cari sendiri krn sudah ditopang kotak "Cari
  // Nagari/Jorong/Sub SLS" gabungan di atas tabel (bebanSearch), supaya
  // tidak dobel.
  const [bebanSortKey, setBebanSortKey] = useState<"nagari" | "jorong" | "subsls" | null>(null);
  const [bebanSortDir, setBebanSortDir] = useState<"asc" | "desc">("asc");
  function bebanSortAsc(key: NonNullable<typeof bebanSortKey>) {
    setBebanSortKey(key);
    setBebanSortDir("asc");
  }
  function bebanSortDesc(key: NonNullable<typeof bebanSortKey>) {
    setBebanSortKey(key);
    setBebanSortDir("desc");
  }
  function bebanSortReset() {
    setBebanSortKey(null);
  }
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
    const res = await fetch("/api/bencana/alokasi/beban", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Gagal memuat kertas kerja beban.");
    setBebanRows(json.data ?? []);
  }

  // (3 Okt 2026) Dipakai utk menghitung PERKIRAAN Skor Jarak di kolom "Skor
  // Jarak" Langkah 4 SEBELUM plot benar2 tersimpan (lihat kolom Skor Jarak
  // di tabel Langkah 4) -- rumus HARUS sama dgn yg dipakai server
  // (bencana_kertas_kerja_alokasi): skor_jarak = jarak_km / pembagi_jarak_km
  // x jumlah_hari_kerja. Nilai pembagi ini admin-configurable (menu "Kelola
  // Perkiraan Beban Tugas"), jadi diambil dari server, BUKAN di-hardcode.
  async function muatPengaturanBeban() {
    const res = await fetch("/api/bencana/pengaturan-beban", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Gagal memuat pengaturan beban.");
    const rows = (json.data ?? []) as { kunci: string; nilai: number }[];
    const p = rows.find((r) => r.kunci === "pembagi_jarak_km");
    const nilai = p ? Number(p.nilai) : NaN;
    if (Number.isFinite(nilai) && nilai > 0) setPembagiJarakKm(nilai);
  }

  async function muatKontak() {
    const res = await fetch("/api/bencana/alokasi/kontak-mitra", { cache: "no-store" });
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
    const res = await fetch("/api/bencana/alokasi/sampel", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Gagal memuat daftar calon wilayah sampel.");
    setCalonSampel(json.data ?? []);
  }

  // (3 Okt 2026) cache:"no-store" ditambahkan -- ditemukan bug: popover
  // "Saran" sempat menampilkan "lokasi belum riil" utk mitra yg SUDAH
  // mengisi lokasi rumahnya di database (dicek langsung lewat SQL),
  // penyebabnya fetch ini tidak eksplisit minta data segar jadi browser bisa
  // menyajikan response lama dari cache HTTP-nya sendiri (persis pola yg
  // sudah pernah bikin crash "Cannot read properties of undefined" versi
  // kegiatan_lain dulu -- lihat komentar tier2 di SaranMitraTombol). Route
  // ini sendiri sudah `dynamic = "force-dynamic"` di server, tapi itu cuma
  // mencegah Next.js men-cache di sisi server -- tidak mencegah BROWSER
  // meng-cache response fetch() ini sendiri.
  async function muatData(hariKerja: number) {
    const res = await fetch(`/api/bencana/alokasi?hari_kerja=${hariKerja}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Gagal memuat data alokasi.");
    setKertasKerja(json.kertas_kerja ?? []);
    setRingkasanPpl(json.ringkasan_ppl ?? []);
    setRingkasanPml(json.ringkasan_pml ?? []);
    setRingkasanKorwil(json.ringkasan_korwil ?? []);
    setKebutuhan(json.kebutuhan_petugas ?? []);
    setPetugasList(json.petugas ?? []);
    setTitikSubsls(json.titik_subsls ?? []);
    setHariKerjaDipakai(json.hari_kerja ?? hariKerja);
  }

  async function muatSemua(hariKerja: number) {
    setLoading(true);
    setLoadError(null);
    try {
      await Promise.all([muatBeban(), muatSampel(), muatData(hariKerja), muatKontak(), muatPengaturanBeban()]);
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

  async function handleSimpanPecahan(idsubsls: string, pembagian: { ppl_id: number; porsi_kk: number }[]) {
    setPecahBusy(true);
    setPecahError(null);
    try {
      const res = await fetch("/api/bencana/alokasi/pecah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idsubsls, pembagian }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menyimpan pembagian Sub SLS.");
      setModalPecah(null);
      await muatData(hariKerjaDipakai);
    } catch (err) {
      setPecahError(err instanceof Error ? err.message : "Gagal menyimpan pembagian Sub SLS.");
    } finally {
      setPecahBusy(false);
    }
  }

  async function handleGabungKembali(idsubsls: string) {
    setGabungBusyId(idsubsls);
    setGabungInfo(null);
    try {
      const res = await fetch("/api/bencana/alokasi/pecah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idsubsls, gabung_kembali: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal menggabungkan kembali Sub SLS.");
      await muatData(hariKerjaDipakai);
      // (3 Okt 2026) Sesudah muatData, baris ini sudah BUKAN lagi "dipecah"
      // (porsi_kk null) -- jadi kembali ke 1 baris belum terplot spt biasa.
      // Pesan sukses ditaruh di idsubsls yg SAMA supaya tetap ketemu baris
      // itu (kalau tidak kesaring filter) & meyakinkan admin aksinya jalan,
      // bukan diam2 gagal.
      setGabungInfo({ idsubsls, teks: "Berhasil digabungkan kembali -- Sub SLS ini kembali belum terplot.", tipe: "ok" });
    } catch (err) {
      const pesan = err instanceof Error ? err.message : "Gagal menggabungkan kembali Sub SLS.";
      setGabungInfo({ idsubsls, teks: pesan, tipe: "error" });
      setSimpanError(pesan);
    } finally {
      setGabungBusyId(null);
    }
  }

  async function handleResetSemuaPlotting() {
    setResetBusy(true);
    setResetError(null);
    try {
      const res = await fetch("/api/bencana/alokasi/reset-semua", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: resetPin, kecamatan: resetKecamatan || null, nagari: resetNagari || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mereset plotting.");
      setDraftPpl({});
      setDraftPmlByPpl({});
      setAutoPlotSubsls(new Set());
      setModalReset(false);
      setResetPin("");
      setResetKecamatan("");
      setResetNagari("");
      await muatData(hariKerjaDipakai);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Gagal mereset plotting.");
    } finally {
      setResetBusy(false);
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
    setAutoPlotSubsls(new Set());
    setSimpanError(null);
  }

  async function handleSimpanPerubahan() {
    setSimpanBusy(true);
    setSimpanError(null);
    try {
      // (3 Okt 2026) Daftar "yg perlu dikirim" dikumpulkan DULU (bukan
      // difilter sambil jalan spt sebelumnya) supaya totalnya diketahui di
      // awal -- dipakai utk persentase progres di tombol "Simpan Perubahan"
      // (lihat simpanProgress). Tiap baris/PML tetap 1 request terpisah ke
      // server (bukan borongan), jadi progresnya nyata, bukan kira-kira.
      const daftarReassign = kertasKerja.filter((r) => {
        if (r.porsi_kk !== null) return false; // baris pecahan -- kelola lewat modal Pecah
        const draftVal = draftPpl[r.idsubsls] ?? null;
        const serverVal = r.ppl_id ?? null;
        return draftVal !== serverVal;
      });

      const serverPmlByPpl = new Map<number, number | null>();
      for (const r of kertasKerja) {
        if (r.ppl_id) serverPmlByPpl.set(r.ppl_id, r.pml_id ?? null);
      }
      const pplIdsDipakai = Array.from(
        new Set(kertasKerja.map((r) => efektifPplId(r)).filter((v): v is number => !!v))
      );
      const daftarPml = pplIdsDipakai.filter((pplId) => {
        const draftVal = draftPmlByPpl[pplId] ?? null;
        const serverVal = serverPmlByPpl.get(pplId) ?? null;
        return draftVal !== serverVal;
      });

      const total = daftarReassign.length + daftarPml.length;
      let selesai = 0;
      if (total > 0) setSimpanProgress({ selesai, total });

      for (const r of daftarReassign) {
        const draftVal = draftPpl[r.idsubsls] ?? null;
        const res = await fetch("/api/bencana/alokasi/reassign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftVal ? { idsubsls: r.idsubsls, ppl_id: draftVal } : { idsubsls: r.idsubsls, buka_kunci: true }),
        });
        // (3 Okt 2026) Dulu kalau respons gagal TAPI body-nya bukan JSON yg
        // valid (mis. halaman error platform/hosting, bukan dari handler
        // kita), res.json() di sini ikut melempar -- pesannya jadi syntax
        // error yg membingungkan ("Unexpected token...") drpd pesan yg jelas
        // row mana yg gagal. Sekarang ditangkap dulu supaya SELALU bisa kasih
        // konteks baris + kode HTTP, bahkan kalau server tidak kasih field
        // "error" sama sekali.
        const json: { error?: string; [k: string]: unknown } | null = await res.json().catch(() => null);
        if (!res.ok) {
          const detail = json?.error
            ? `: ${json.error}`
            : ` (server tidak memberi detail error, kode HTTP ${res.status})`;
          throw new Error(`Gagal menyimpan plot Sub SLS ${r.sub_sls} di ${r.nagari} (idsubsls ${r.idsubsls})${detail}`);
        }
        selesai++;
        setSimpanProgress({ selesai, total });
      }

      for (const pplId of daftarPml) {
        const draftVal = draftPmlByPpl[pplId] ?? null;
        const res = await fetch("/api/bencana/alokasi/susunan-tim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ petugas_id: pplId, peran: "ppl", atasan_id: draftVal }),
        });
        const json: { error?: string; [k: string]: unknown } | null = await res.json().catch(() => null);
        if (!res.ok) {
          const namaPpl = petugasList.find((p) => p.id === pplId)?.nama ?? `id ${pplId}`;
          const detail = json?.error
            ? `: ${json.error}`
            : ` (server tidak memberi detail error, kode HTTP ${res.status})`;
          throw new Error(`Gagal menyimpan PML untuk ${namaPpl}${detail}`);
        }
        selesai++;
        setSimpanProgress({ selesai, total });
      }

      // Semua baris yg berhasil disimpan sudah resmi jadi plot server --
      // saran Auto Plot yg ikut tersimpan tidak perlu ditinjau lagi.
      setAutoPlotSubsls(new Set());
      await muatData(hariKerjaDipakai);
    } catch (err) {
      setSimpanError(err instanceof Error ? err.message : "Gagal menyimpan perubahan.");
      // Tetap refresh supaya perubahan yg sempat berhasil sebelum error
      // tercermin di layar; draft yg belum sempat tersimpan tetap
      // dipertahankan lewat efek sinkronisasi di atas.
      await muatData(hariKerjaDipakai).catch(() => {});
    } finally {
      setSimpanBusy(false);
      setSimpanProgress(null);
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
    let hasil = bebanRows.filter((r) => {
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
    if (bebanSortKey) {
      hasil = [...hasil].sort((a, b) => {
        let cmp = 0;
        if (bebanSortKey === "nagari") cmp = a.nagari.localeCompare(b.nagari, "id");
        else if (bebanSortKey === "jorong") cmp = a.sls.localeCompare(b.sls, "id");
        else if (bebanSortKey === "subsls") cmp = a.sub_sls.localeCompare(b.sub_sls, "id");
        return bebanSortDir === "asc" ? cmp : -cmp;
      });
    }
    return hasil;
  }, [bebanRows, bebanKecFilter, bebanSearch, bebanSortKey, bebanSortDir]);
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
    let hasil = calonSampel.filter((r) => {
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
    if (sampelSortKey) {
      hasil = [...hasil].sort((a, b) => {
        let cmp = 0;
        if (sampelSortKey === "nagari") cmp = a.nagari.localeCompare(b.nagari, "id");
        else if (sampelSortKey === "jorong") cmp = a.sls.localeCompare(b.sls, "id");
        else if (sampelSortKey === "subsls") cmp = a.sub_sls.localeCompare(b.sub_sls, "id");
        return sampelSortDir === "asc" ? cmp : -cmp;
      });
    }
    return hasil;
  }, [calonSampel, sampelKecFilter, sampelStatusFilter, sampelDataFilter, sampelSearch, sampelSortKey, sampelSortDir]);
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
  // (3 Okt 2026) Lingkup "Reset Semua Plotting" -- nagari HANYA muncul
  // sbg penyempit DI DALAM kecamatan yg dipilih di modal reset.
  const nagariOptionsUntukReset = useMemo(
    () =>
      resetKecamatan
        ? Array.from(new Set(kertasKerja.filter((r) => r.kecamatan === resetKecamatan).map((r) => r.nagari))).sort()
        : [],
    [kertasKerja, resetKecamatan]
  );
  // PPL: wajib mitra, belum berperan lain (atau sudah PPL, utk dipindah Sub SLS-nya)
  const pplOptions = useMemo(
    () =>
      petugasList
        .filter((p) => p.aktif && p.status_kepegawaian === "mitra" && (!p.peran || p.peran === "ppl"))
        .sort((a, b) => a.nama.localeCompare(b.nama)),
    [petugasList]
  );
  // Titik koordinat per Sub SLS (idsubsls -> lat/lng), utk popover "Saran"
  // Langkah 4 menghitung jarak ke Sub SLS baris yg sedang diisi.
  const titikSubslsMap = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const t of titikSubsls) {
      if (typeof t.lat === "number" && typeof t.lng === "number") map.set(t.idsubsls, { lat: t.lat, lng: t.lng });
    }
    return map;
  }, [titikSubsls]);
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
    const diKec = kertasKerja.filter((k) => efektifPplId(k) === p.id && k.kecamatan === row.kecamatan).length;
    const diNagari = kertasKerja.filter((k) => efektifPplId(k) === p.id && k.nagari === row.nagari).length;
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
  const rataBebanTetap = totalPplAsumsi > 0 ? totalSkorWilayahTugas / totalPplAsumsi : 0;

  // Beban draft per PPL (skor beban pendataan, TANPA jarak -- jarak riil
  // baru dihitung server sesudah plot benar2 disimpan): dihitung ulang
  // instan setiap draftPpl berubah, tanpa panggilan server.
  const bebanDraftPerPpl = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of kertasKerja) {
      // efektifPplId: baris pecahan (porsi_kk != null) selalu pakai ppl_id
      // tersimpannya sendiri -- skor_beban_pendataan baris itu SUDAH
      // diprorata server sesuai porsi_kk, jadi tinggal dijumlah apa adanya.
      const pid = efektifPplId(r);
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
    const pplIdsDipakai = new Set(
      kertasKerja.map((r) => efektifPplId(r)).filter((v): v is number => !!v)
    );
    for (const pplId of pplIdsDipakai) {
      const pmlId = draftPmlByPpl[pplId] ?? null;
      if (pmlId) map.set(pmlId, (map.get(pmlId) ?? 0) + 1);
    }
    return map;
  }, [kertasKerja, draftPpl, draftPmlByPpl]);

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

  // (3 Okt 2026) Ringkasan pool kandidat Tier 1/Tier 2 (sama definisinya dgn
  // tier1/tier2 di SaranMitraTombol & kandidat Auto Plot: dikecualikan yg
  // ditandai rekomendasi_pml/red_flag_kinerja) -- ditampilkan di baris
  // "Rata-rata beban per PPL" supaya admin lihat sekilas berapa dari pool
  // itu yg SUDAH kepakai (punya >=1 Sub SLS di draft saat ini) dari berapa
  // total yg TERSEDIA, tanpa perlu buka popover Saran satu-satu.
  const pplDisarananTanpaPml = useMemo(
    () => pplOptions.filter((p) => !p.rekomendasi_pml && !p.red_flag_kinerja),
    [pplOptions]
  );
  const kandidatTier1 = useMemo(
    () => pplDisarananTanpaPml.filter((p) => p.pendaftaran_bencana_konfirmasi),
    [pplDisarananTanpaPml]
  );
  const kandidatTier2 = useMemo(
    () =>
      pplDisarananTanpaPml.filter(
        (p) => !p.pendaftaran_bencana_konfirmasi && (p.kegiatan_lain ?? []).includes("PES SE2026")
      ),
    [pplDisarananTanpaPml]
  );
  const jumlahTier1Terpakai = useMemo(
    () => kandidatTier1.filter((p) => bebanDraftPerPpl.has(p.id)).length,
    [kandidatTier1, bebanDraftPerPpl]
  );
  const jumlahTier2Terpakai = useMemo(
    () => kandidatTier2.filter((p) => bebanDraftPerPpl.has(p.id)).length,
    [kandidatTier2, bebanDraftPerPpl]
  );
  // (3 Okt 2026) Permintaan user: angka "Jumlah PPL terpilih" sempat
  // membingungkan krn jauh lebih besar dari (Tier 1 terpakai + Tier 2
  // terpakai) -- WAJAR, bukan bug: popover Saran/Auto Plot CUMA
  // menyarankan dari pool Tier 1/2, tapi admin tetap bebas plot manual
  // lewat dropdown PPL siapa saja (termasuk yg ditandai Rekomendasi
  // PML/Red Flag, atau yg belum "Mengajukan Diri" & bukan peserta PES
  // SE2026 -- jadi tidak masuk tier manapun). Selisih itu dihitung eksplisit
  // di sini supaya angkanya kelihatan jelas nyambung: terpilih = tier1 +
  // tier2 + di-luar-tier.
  const jumlahDiluarTier = Math.max(0, jumlahPplDiplotDraft - jumlahTier1Terpakai - jumlahTier2Terpakai);

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
        .filter((r) => efektifPplId(r) === pplId && r.porsi_kk === null)
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
  // Dipakai buat SKIP scroll-into-view pas pertama kali halaman ini
  // dirender (langkahAktif awalnya 1 juga) -- cuma mau scroll kalau
  // langkahAktif benar2 BERUBAH krn diklik/filter, bukan tiap mount.
  const pertamaKaliRef = useRef(true);

  // (3 Okt 2026) Sidebar "rel langkah" (4 lingkaran bernomor di kiri) --
  // permintaan user: dulu ke-4 section (Langkah 1-4) SEMUANYA dirender
  // sekaligus di satu halaman panjang, sidebar cuma scroll-spy (klik =
  // scroll halus ke section terkait, lalu IntersectionObserver otomatis
  // menandai section mana yg lagi kelihatan). Sekarang diubah jadi SUB-TAB
  // beneran: cuma SATU section (sesuai langkahAktif) yg dirender tiap saat
  // -- jadi pas buka Langkah 4, Langkah 1-3 TIDAK ikut dirender/discroll
  // lewati sama sekali (lihat {langkahAktif === 1 && (...)} dkk di bawah).
  // IntersectionObserver jadi tidak relevan lagi (cuma ada 1 section yg
  // di-mount tiap saat) -- diganti scroll-ke-atas-section SETELAH tab
  // berganti (useEffect di bawah), supaya posisi scroll tetap masuk akal
  // walau sebelumnya user scroll jauh ke bawah di tab lain.
  useEffect(() => {
    if (pertamaKaliRef.current) {
      pertamaKaliRef.current = false;
      return;
    }
    const ref =
      langkahAktif === 1 ? langkah1Ref : langkahAktif === 2 ? langkah2Ref : langkahAktif === 3 ? langkah3Ref : langkah4Ref;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [langkahAktif]);

  function pilihLangkah(n: 1 | 2 | 3 | 4) {
    setLangkahAktif(n);
  }

  function filterKeStatusBeban(tone: BalanceTone | "") {
    setStatusBebanFilter(tone);
    setStatusPlotFilter("");
    setPage(1);
    setLangkahAktif(4);
  }
  function filterKeBelumDiplot() {
    setStatusBebanFilter("");
    setStatusPlotFilter("belum");
    setPage(1);
    setLangkahAktif(4);
  }

  const jumlahPerubahanPending = useMemo(() => {
    let n = 0;
    for (const r of kertasKerja) {
      if (r.porsi_kk !== null) continue; // baris pecahan -- selalu dianggap final, bukan draft
      if ((draftPpl[r.idsubsls] ?? null) !== (r.ppl_id ?? null)) n++;
    }
    const serverPmlByPpl = new Map<number, number | null>();
    for (const r of kertasKerja) {
      if (r.ppl_id) serverPmlByPpl.set(r.ppl_id, r.pml_id ?? null);
    }
    const pplIdsDipakai = new Set(kertasKerja.map((r) => efektifPplId(r)).filter((v): v is number => !!v));
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
      if (r.porsi_kk !== null) continue; // baris pecahan -- selalu dianggap final, bukan draft
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
    const pplIdsDipakai = new Set(kertasKerja.map((r) => efektifPplId(r)).filter((v): v is number => !!v));
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
    () => kertasKerja.filter((r) => !efektifPplId(r)).length,
    [kertasKerja, draftPpl]
  );

  // Ubah draftPpl SATU baris (dipakai Combobox/SaranMitraTombol/tombol lepas
  // di tabel Langkah 4) -- sekalian lepas tanda "Saran Auto Plot" baris itu
  // kalau ada, krn begitu admin pilih manual, pilihan itu bukan saran lagi.
  function ubahDraftPpl(idsubsls: string, val: number | null) {
    setDraftPpl((prev) => ({ ...prev, [idsubsls]: val }));
    setAutoPlotSubsls((prev) => {
      if (!prev.has(idsubsls)) return prev;
      const next = new Set(prev);
      next.delete(idsubsls);
      return next;
    });
  }

  // (3 Okt 2026) "📍 Wilayah Lain" (SarankanWilayahTombol) -- pindah ke Sub
  // SLS LAIN & (kalau kosong) sekalian isi draft PPL yg sama ke sana.
  // SEMUA filter & nomor halaman di-reset dulu SEBELUM pindah -- tabel
  // Langkah 4 TIDAK virtualized (baris yg tersaring filter/halaman lain
  // sama sekali tidak dirender ke DOM), jadi baris tujuan BISA SAJA ada di
  // filter/halaman yg berbeda dari baris asal & harus dibuat "kelihatan"
  // dulu sebelum bisa discroll ke sana -- efek scroll sesudah `paged`
  // (di bawah) yg benar2 melakukan scroll-nya, sesudah `page` ikut
  // ter-update ke halaman yg tepat.
  function navigasiKeSubsls(idsubsls: string, kosong: boolean, pplIdUtkIsi: number) {
    setSearch("");
    setKecamatanHeaderSearch("");
    setKecFilter("");
    setPplFilter("");
    setNilaiKinerjaPplFilter(new Set());
    setPmlFilterLangkah4("");
    setDataFilter("");
    setStatusBebanFilter("");
    setStatusPlotFilter("");
    setHanyaBerubahFilter(false);
    if (kosong) ubahDraftPpl(idsubsls, pplIdUtkIsi);
    setScrollTargetIdsubsls(idsubsls);
  }

  // (3 Okt 2026) "Auto Plot" -- permintaan admin: isi otomatis baris yg
  // BELUM diplot sama sekali (TIDAK PERNAH menimpa pilihan yg sudah ada),
  // berdasar (1) jarak terdekat (haversine, titik Sub SLS ke lokasi rumah
  // PPL -- sama persis dgn dasar urutan popover "Saran") dan (2) total
  // beban PPL ybs sesudah ditambah baris ini.
  //
  // (3 Okt 2026, revisi) Permintaan user: DUA BATAS KERAS (bukan lagi ambang
  // balanceInfo yg longgar + fallback ke terdekat apa adanya) --
  //   - radius maksimal BATAS_RADIUS_KM dari lokasi rumah PPL ke titik Sub
  //     SLS (jarak garis lurus/haversine, sama spt popover Saran);
  //   - total beban PPL ybs SESUDAH ditambah baris ini maksimal
  //     BATAS_SELISIH_SKOR skor DI ATAS rata-rata (rataBebanTetap).
  // Kalau TIDAK ADA kandidat yg lolos KEDUA batas itu, baris tsb DILEWATI
  // (tidak dipaksa diisi kandidat terdekat apa adanya spt versi sebelumnya)
  // -- konsisten dgn sifat fitur ini yg CUMA mengisi yg kosong & CUMA saran,
  // bukan alokasi otomatis paksa. Kandidat yg ditandai rekomendasi_pml atau
  // red_flag_kinerja (lihat tab Kegiatan Petugas) DIKECUALIKAN dari saran --
  // sama spt popover "Saran" Tier 1/2.
  //
  // (3 Okt 2026, revisi #2) Permintaan user: pool kandidat Auto Plot
  // DIPERSEMPIT jadi PERSIS gabungan Tier 1 (sudah "Mengajukan Diri") +
  // Tier 2 (peserta PES SE2026) -- kandidatTier1/kandidatTier2 yg sama dgn
  // yg dipakai popover "Saran" & ringkasan di baris "Rata-rata beban per
  // PPL". Mitra yg TIDAK termasuk tier manapun (belum mengajukan diri & bukan
  // peserta PES SE2026) TIDAK LAGI ikut dipilih Auto Plot -- kalau memang
  // mau dipakai, admin tetap bisa plot manual lewat dropdown PPL.
  //
  // (3 Okt 2026, revisi #3) Permintaan user: ganti dari "nearest-available
  // polos per baris" (versi lama) jadi PITA JARAK BERTAHAP yg melebar, dgn
  // pemerataan antar kandidat yg sama-sama dekat:
  //   1. Proses baris dlm pita <1 km dulu -- SEMUA baris sekaligus, bukan 1
  //      per 1 dari yg skornya terbesar lagi. Tiap PUTARAN dlm pita yg sama,
  //      kandidat yg beban-nya SAAT INI paling ringan dapat giliran "ambil"
  //      1 baris terdekatnya duluan (bukan kandidat yg sama terus) -- kalau
  //      ada beberapa kandidat sama-sama dekat ke sekumpulan baris, baris2
  //      itu jadi TERSEBAR ke mereka, bukan diborong 1 orang sampai sisanya
  //      "terlempar" ke pita yg lebih jauh.
  //   2. Beban maksimal (rataBebanTetap + BATAS_SELISIH_SKOR) tetap dicek
  //      SETIAP kali sebelum sebuah baris diambil -- kandidat yg sudah penuh
  //      di-skip (tidak dapat giliran lagi), TIDAK menghentikan kandidat
  //      lain yg masih longgar.
  //   3. Begitu dlm 1 putaran penuh TIDAK ADA LAGI baris yg bisa diambil di
  //      pita ini (baris dlm pita habis, ATAU semua kandidat dlm pita ini
  //      sudah capai batas beban), pita diperlebar +1 km, ulangi dari (1),
  //      sampai maksimal BATAS_RADIUS_KM.
  // Baris yg sampai pita 7 km tetap tidak dapat kandidat (semua kandidat dlm
  // radius sudah penuh/tidak ada) DILEWATI, bukan dipaksa -- konsisten dgn
  // sifat fitur ini: cuma mengisi yg memang masuk akal, bukan alokasi paksa.
  //
  // SENGAJA TIDAK auto-save & TIDAK menyentuh PML/Korwil -- hasilnya cuma
  // mengisi draftPpl (persis spt pilih manual) + ditandai di autoPlotSubsls
  // utk highlight baris cokelat & tombol Setujui/Batalkan; baru benar2
  // tersimpan ke server sesudah "Simpan Perubahan" ditekan, konsisten dgn
  // aturan baku proyek ini (lihat komentar SaranMitraTombol).
  function hitungSaranAutoPlot(): Record<string, number> {
    const BATAS_RADIUS_KM = 7;
    const BATAS_SELISIH_SKOR = 20;
    const LEBAR_PITA_KM = 1;

    const workingBeban = new Map(bebanDraftPerPpl);
    const hasil: Record<string, number> = {};

    const kandidat = [...kandidatTier1, ...kandidatTier2].filter(
      (p) => p.lokasi_status === "riil" && typeof p.lat === "number" && typeof p.lng === "number"
    );
    if (kandidat.length === 0) return hasil;

    const belumDiplot = kertasKerja.filter((r) => !efektifPplId(r));

    // Jarak tiap pasangan (baris, kandidat) dlm radius 7 km dihitung SEKALI
    // di awal -- dipakai berulang kali di tiap pita, bukan dihitung ulang
    // (haversine) tiap putaran.
    const pasangan: { idsubsls: string; skor: number; jarak: number; pplId: number }[] = [];
    for (const r of belumDiplot) {
      const titik = titikSubslsMap.get(r.idsubsls);
      if (!titik) continue; // Sub SLS tanpa koordinat -- tidak bisa dihitung jaraknya, dilewati total.
      for (const p of kandidat) {
        const jarak = haversineKm(p.lat as number, p.lng as number, titik.lat, titik.lng);
        if (jarak <= BATAS_RADIUS_KM) {
          pasangan.push({ idsubsls: r.idsubsls, skor: r.skor_beban_pendataan, jarak, pplId: p.id });
        }
      }
    }

    const sudahDiplot = new Set<string>();

    for (let pita = LEBAR_PITA_KM; pita <= BATAS_RADIUS_KM; pita += LEBAR_PITA_KM) {
      let adaPerubahan = true;
      while (adaPerubahan) {
        adaPerubahan = false;
        // Kandidat PALING RINGAN beban-nya SAAT INI dapat giliran duluan di
        // tiap putaran -- inti pemerataannya: siapa pun yg sedang paling
        // longgar yg "jalan" mengambil baris terdekatnya, bukan selalu
        // kandidat yg sama dari awal sampai akhir.
        const urutanKandidat = [...kandidat].sort(
          (a, b) => (workingBeban.get(a.id) ?? 0) - (workingBeban.get(b.id) ?? 0)
        );
        for (const p of urutanKandidat) {
          const pilihan = pasangan
            .filter((x) => x.pplId === p.id && x.jarak <= pita && !sudahDiplot.has(x.idsubsls))
            .sort((a, b) => a.jarak - b.jarak)[0];
          if (!pilihan) continue; // tidak ada baris tersisa dlm pita ini buat kandidat ini.

          const proyeksi = (workingBeban.get(p.id) ?? 0) + pilihan.skor;
          if (proyeksi > rataBebanTetap + BATAS_SELISIH_SKOR) continue; // kandidat ini sudah penuh -- skip, bukan berhenti total.

          hasil[pilihan.idsubsls] = p.id;
          sudahDiplot.add(pilihan.idsubsls);
          workingBeban.set(p.id, proyeksi);
          adaPerubahan = true; // masih ada kemungkinan baris lain di pita ini -- putaran berikutnya dicoba lagi.
        }
      }
    }

    return hasil;
  }

  function handleAutoPlot() {
    const saran = hitungSaranAutoPlot();
    const idSubslsTerisi = Object.keys(saran);
    if (idSubslsTerisi.length === 0) return;
    setDraftPpl((prev) => ({ ...prev, ...saran }));
    setAutoPlotSubsls((prev) => {
      const next = new Set(prev);
      for (const id of idSubslsTerisi) next.add(id);
      return next;
    });
  }

  function setujuiAutoPlot(idsubsls: string) {
    setAutoPlotSubsls((prev) => {
      if (!prev.has(idsubsls)) return prev;
      const next = new Set(prev);
      next.delete(idsubsls);
      return next;
    });
  }

  function batalkanAutoPlot(idsubsls: string) {
    setDraftPpl((prev) => ({ ...prev, [idsubsls]: null }));
    setAutoPlotSubsls((prev) => {
      if (!prev.has(idsubsls)) return prev;
      const next = new Set(prev);
      next.delete(idsubsls);
      return next;
    });
  }

  function setujuiSemuaAutoPlot() {
    setAutoPlotSubsls(new Set());
  }

  function batalkanSemuaAutoPlot() {
    setDraftPpl((prev) => {
      const next = { ...prev };
      for (const id of autoPlotSubsls) next[id] = null;
      return next;
    });
    setAutoPlotSubsls(new Set());
  }
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
    const pplId = efektifPplId(r);
    if (!pplId) return "belum";
    const beban = bebanDraftPerPpl.get(pplId) ?? 0;
    return balanceInfo(beban, rataBebanTetap).tone;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const kwKec = kecamatanHeaderSearch.trim().toLowerCase();
    return kertasKerja.filter((r) => {
      if (kecFilter && r.kecamatan !== kecFilter) return false;
      const draftPplId = efektifPplId(r);
      if (pplFilter && draftPplId !== pplFilter) return false;
      if (nilaiKinerjaPplFilter.size > 0) {
        const nilaiPpl = draftPplId ? petugasList.find((p) => p.id === draftPplId)?.nilai_kinerja ?? null : null;
        if (!nilaiKinerjaPplFilter.has(labelNilaiKinerja(nilaiPpl))) return false;
      }
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
      if (kwKec && !r.kecamatan.toLowerCase().includes(kwKec)) return false;
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
    nilaiKinerjaPplFilter,
    pmlFilterLangkah4,
    dataFilter,
    statusPlotFilter,
    statusBebanFilter,
    hanyaBerubahFilter,
    search,
    kecamatanHeaderSearch,
    draftPpl,
    draftPmlByPpl,
    bebanDraftPerPpl,
    rataBebanTetap,
    petugasList,
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
        case "nagari":
          return r.nagari;
        case "jorong":
          return r.sls;
        case "subsls":
          return r.sub_sls;
        case "skor_beban_pendataan":
          return r.skor_beban_pendataan;
        case "skor_jarak":
          return r.jarak_status === "riil" ? r.skor_jarak : -1;
        case "skor_beban_akhir":
          return r.skor_beban_akhir;
        case "beban_ppl": {
          const pplId = efektifPplId(r);
          return pplId ? bebanDraftPerPpl.get(pplId) ?? 0 : -1;
        }
        // (2 Okt 2026) PPL/PML diurutkan berdasar NAMA dari penugasan draft
        // saat ini (bukan dari r.ppl_id tersimpan), konsisten dgn "beban_ppl"
        // di atas & dgn kolom PPL/PML yg memang menampilkan draft, bukan data
        // tersimpan -- baris yg belum diplot ditaruh di awal ("" selalu
        // paling kecil scr abjad).
        case "ppl": {
          const pplId = efektifPplId(r);
          return pplId ? petugasList.find((p) => p.id === pplId)?.nama ?? "" : "";
        }
        case "pml": {
          const pplId = efektifPplId(r);
          const pmlId = pplId ? pmlDraftUntukPpl(pplId) : null;
          return pmlId ? petugasList.find((p) => p.id === pmlId)?.nama ?? "" : "";
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
  }, [filtered, sortKey, sortDir, draftPpl, bebanDraftPerPpl, draftPmlByPpl, petugasList]);

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

  // (3 Okt 2026) Efek scroll utk "📍 Wilayah Lain" (lihat navigasiKeSubsls
  // & SarankanWilayahTombol) -- jalan dlm 2 tahap krn `page` butuh 1 siklus
  // render dulu sblm `paged` (yg benar2 dirender ke <tr>) ikut berubah:
  //  1. idsubsls tujuan belum di halaman yg sedang aktif -> pindah halaman
  //     dulu (setPage), effect ini jalan ulang sesudah render berikutnya.
  //  2. sudah di halaman yg benar -> baris tujuan seharusnya SUDAH ada di
  //     DOM -- scrollIntoView + highlight sekilas, lalu bersihkan target.
  useEffect(() => {
    if (!scrollTargetIdsubsls) return;
    const idx = sorted.findIndex((r) => r.idsubsls === scrollTargetIdsubsls);
    if (idx === -1) {
      // Seharusnya tidak terjadi (semua filter sudah direset di
      // navigasiKeSubsls) -- batalkan saja drpd nyangkut menunggu selamanya.
      setScrollTargetIdsubsls(null);
      return;
    }
    const targetPage = alokasiPageSize === Infinity ? 1 : Math.floor(idx / alokasiPageSize) + 1;
    if (pageClamped !== targetPage) {
      setPage(targetPage);
      return;
    }
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`tr[data-idsubsls="${CSS.escape(scrollTargetIdsubsls)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const warnaAsli = el.style.backgroundColor;
        el.style.backgroundColor = "#DCEADF"; // moss-100 -- highlight sekilas
        el.style.transition = "background-color 0.3s";
        setTimeout(() => {
          el.style.backgroundColor = warnaAsli;
        }, 1800);
      }
      setScrollTargetIdsubsls(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollTargetIdsubsls, sorted, alokasiPageSize, pageClamped]);

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
      "Porsi KK (kalau dipecah)": r.porsi_kk ?? "",
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
      <SidebarLangkah aktif={langkahAktif} onPilih={pilihLangkah} />
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
          <MiniStat warna="bg-blue-50 text-blue-900" label="Asumsi Jumlah PPL (bisa diubah)" nilai={totalPplAsumsi} />
          <MiniStat warna="bg-blue-50 text-blue-900" label="Kebutuhan PPL (estimasi)" nilai={totalKebutuhan.ppl} />
          <MiniStat warna="bg-moss-50 text-moss-700" label="PML Ditetapkan" nilai={pmlOptions.length} />
          <MiniStat warna="bg-moss-50 text-moss-700" label="Korwil Ditetapkan" nilai={korwilOptions.length} />
        </div>
        <p className="mt-2 text-[11px] text-ink/50">
          {jumlahPplDiplotDraft} dari {totalPplAsumsi} PPL sudah punya plot (draft) · {jumlahBelumDiplot} dari{" "}
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
              <table className="w-full min-w-[1350px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Kecamatan</th>
                    <ThKontrol
                      label="Nagari"
                      sort={{
                        active: bebanSortKey === "nagari",
                        dir: bebanSortDir,
                        onAsc: () => bebanSortAsc("nagari"),
                        onDesc: () => bebanSortDesc("nagari"),
                        onReset: bebanSortReset,
                      }}
                    />
                    <ThKontrol
                      label="Jorong/SLS"
                      sort={{
                        active: bebanSortKey === "jorong",
                        dir: bebanSortDir,
                        onAsc: () => bebanSortAsc("jorong"),
                        onDesc: () => bebanSortDesc("jorong"),
                        onReset: bebanSortReset,
                      }}
                    />
                    <ThKontrol
                      label="Sub SLS"
                      sort={{
                        active: bebanSortKey === "subsls",
                        dir: bebanSortDir,
                        onAsc: () => bebanSortAsc("subsls"),
                        onDesc: () => bebanSortDesc("subsls"),
                        onReset: bebanSortReset,
                      }}
                    />
                    <th className="px-3 py-2 font-medium">KK Total</th>
                    <th className="px-3 py-2 font-medium">KK Terdampak</th>
                    <th className="px-3 py-2 font-medium">
                      KK Terdampak (Wawancara Sub SLS)
                      <span
                        className="ml-1 cursor-help text-ink/40"
                        title="Angka spesifik per Sub SLS dari hasil wawancara mitra/anak magang (field perkiraan KK per Sub SLS saat Identifikasi), bukan rata-rata per Jorong. 'NO' = Jorong ybs sudah ada laporan 'tidak ada yang terdampak'. '-' = belum ada laporan spesifik sampai level Sub SLS ini."
                      >
                        ⓘ
                      </span>
                    </th>
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
                        <td className="px-3 py-2 font-medium text-ink">
                          {/* (3 Okt 2026) items-start+justify-between (bukan items-center biasa)
                              -- nama Jorong yg panjang bisa patah ke 2 baris di layar sempit,
                              dan tombol "Lihat Peta" tetap rapi nempel rata kanan (shrink-0,
                              tidak ikut patah/melayang di tengah) drpd mengambang di sebelah
                              teks yg tinggi barisnya berubah-ubah. Permintaan user. */}
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0">{r.sls}</span>
                            {r.lat != null && r.lng != null && (
                              <span className="shrink-0">
                                <PetaSekilasTombol
                                  lat={r.lat}
                                  lng={r.lng}
                                  label={`Jorong ${r.sls} / Sub SLS ${r.sub_sls}`}
                                />
                              </span>
                            )}
                          </span>
                        </td>
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
                        <td className="px-3 py-2">
                          {r.kk_wawancara_tidak_terdampak ? (
                            <span
                              className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                              title="Jorong ini sudah ada laporan 'tidak ada yang terdampak' dari mitra/anak magang."
                            >
                              NO
                            </span>
                          ) : r.kk_wawancara != null ? (
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-ink">
                                {r.kk_wawancara.toLocaleString("id-ID")}
                              </span>
                              {terdampak !== r.kk_wawancara && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftKkTerdampak((prev) => ({ ...prev, [r.idsubsls]: r.kk_wawancara as number }))
                                  }
                                  title="Pakai angka wawancara ini sbg KK Terdampak"
                                  className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-900 hover:bg-blue-100"
                                >
                                  pakai
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-ink/30">-</span>
                          )}
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

      {/* ===== LANGKAH 1: WILAYAH SAMPEL =====
          (3 Okt 2026) Sub-tab beneran -- cuma dirender kalau langkahAktif
          === 1 (lihat komentar di deklarasi langkahAktif di atas). */}
      {langkahAktif === 1 && (
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
                  sort={{
                    active: sampelSortKey === "nagari",
                    dir: sampelSortDir,
                    onAsc: () => sampelSortAsc("nagari"),
                    onDesc: () => sampelSortDesc("nagari"),
                    onReset: sampelSortReset,
                  }}
                />
                <ThKontrol
                  label="Jorong/SLS"
                  sort={{
                    active: sampelSortKey === "jorong",
                    dir: sampelSortDir,
                    onAsc: () => sampelSortAsc("jorong"),
                    onDesc: () => sampelSortDesc("jorong"),
                    onReset: sampelSortReset,
                  }}
                />
                <ThKontrol
                  label="Sub SLS"
                  sort={{
                    active: sampelSortKey === "subsls",
                    dir: sampelSortDir,
                    onAsc: () => sampelSortAsc("subsls"),
                    onDesc: () => sampelSortDesc("subsls"),
                    onReset: sampelSortReset,
                  }}
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
      )}

      {/* ===== LANGKAH 2: KEBUTUHAN PETUGAS ===== */}
      {langkahAktif === 2 && (
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
      )}

      {/* ===== LANGKAH 3: SUSUNAN TIM (MANUAL, TANPA PENGELOMPOKAN OTOMATIS) ===== */}
      {langkahAktif === 3 && (
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
      )}

      {/* ===== VISUALISASI KESEIMBANGAN BEBAN =====
          (3 Okt 2026) SENGAJA dibiarkan selalu terlihat (tidak digerbang
          langkahAktif) -- ini panel ringkasan, bukan salah satu Langkah
          1-4, sama spt panel "Ringkasan Alokasi Petugas" di paling atas. */}
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
      {langkahAktif === 4 && (
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
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleAutoPlot}
              disabled={jumlahBelumDiplot === 0}
              title="Isi otomatis SARAN plot utk baris yg BELUM diplot sama sekali -- kandidat HANYA dari Tier 1 (Mengajukan Diri) + Tier 2 (peserta PES SE2026). Diproses per pita jarak melebar (<1 km dulu, baru <2 km, dst. sampai maks. 7 km dari Sub SLS) & beban akhir maks. 20 skor di atas rata-rata; kalau ada beberapa kandidat sama-sama dekat, baris2 disebar rata ke mereka (bukan diborong 1 orang). Baris yg tidak ada kandidat memenuhi syarat itu sampai 7 km DILEWATI (tidak dipaksa). TIDAK menimpa pilihan yg sudah ada, dan TIDAK langsung tersimpan -- baris hasil saran ditandai cokelat, perlu ditinjau & disetujui, baru ikut tersimpan saat 'Simpan Perubahan' ditekan."
              className="rounded-md border border-gold-400 bg-gold-100 px-3 py-1.5 text-sm font-medium text-gold-600 transition hover:bg-gold-400/20 disabled:opacity-40"
            >
              🤖 Auto Plot {jumlahBelumDiplot > 0 ? `(${jumlahBelumDiplot} kosong)` : ""}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={filtered.length === 0}
              className="rounded-md border border-blue-700 bg-white px-3 py-1.5 text-sm font-medium text-blue-900 transition hover:bg-blue-50 disabled:opacity-40"
            >
              Export ke Excel
            </button>
          </div>
        </div>

        {/* (3 Okt 2026) Permintaan user: dulu pembagi "rata-rata beban per PPL"
            hardcode 133 di kode, tidak bisa diubah dari UI. Sekarang jumlah
            PPL-nya (totalPplAsumsi) bisa diketik ulang langsung di sini --
            rata-rata (rataBebanTetap) otomatis hitung ulang krn dia turunan
            dari totalPplAsumsi. Tombol "Pakai estimasi Langkah 2" menyalin
            cepat dari totalKebutuhan.ppl (hasil Langkah 2) tanpa perlu
            mengetik manual kalau admin mau menyamakan asumsi dgn Langkah 2. */}
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2">
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink/70">
            Rata-rata beban per PPL (total skor {totalSkorWilayahTugas.toLocaleString("id-ID", { maximumFractionDigits: 0 })} ÷{" "}
            <input
              type="number"
              min={1}
              value={totalPplAsumsi}
              onChange={(e) => setTotalPplAsumsi(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              title="Asumsi jumlah PPL -- ubah angka ini utk menghitung ulang rata-rata beban dgn skenario jumlah PPL yg berbeda"
              className="w-16 rounded-md border border-blue-200 bg-white px-1.5 py-0.5 text-xs font-medium text-ink outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />{" "}
            PPL):{" "}
            <strong className="text-blue-950">{rataBebanTetap.toLocaleString("id-ID", { maximumFractionDigits: 1 })}</strong>
            {totalKebutuhan.ppl > 0 && totalKebutuhan.ppl !== totalPplAsumsi && (
              <button
                type="button"
                onClick={() => setTotalPplAsumsi(totalKebutuhan.ppl)}
                className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-200"
                title="Samakan asumsi jumlah PPL dgn hasil estimasi Langkah 2"
              >
                Pakai estimasi Langkah 2 ({totalKebutuhan.ppl})
              </button>
            )}
          </span>
          {/* (3 Okt 2026) Permintaan user: ringkasan jumlah PPL terpilih +
              utilisasi pool kandidat Tier 1/Tier 2 (dikecualikan rekomendasi
              PML/red flag) di baris yg sama dgn "Rata-rata beban per PPL",
              supaya kelihatan sekilas tanpa buka popover Saran satu-satu.
              (revisi) "Di luar Tier 1/2" ditambahkan supaya angkanya jelas
              nyambung (terpilih = tier1 + tier2 + di-luar-tier) -- sebelumnya
              sempat membingungkan krn jumlah PPL terpilih jauh lebih besar
              drpd (tier1 + tier2) tanpa penjelasan ke mana sisanya. */}
          <span
            className="flex flex-wrap items-center gap-1.5 text-xs text-ink/70"
            title="Jumlah PPL terpilih = Tier 1 terpakai + Tier 2 terpakai + di luar Tier 1/2. Popover Saran/Auto Plot cuma menyarankan dari pool Tier 1/2, tapi admin tetap bisa plot manual lewat dropdown siapa saja -- termasuk yg ditandai Rekomendasi PML/Red Flag atau yg tidak masuk tier manapun, itu yg masuk hitungan 'di luar Tier 1/2'."
          >
            · Jumlah PPL terpilih: <strong className="text-blue-950">{jumlahPplDiplotDraft}</strong> (
            <strong className="text-blue-950">{jumlahTier1Terpakai}</strong> Tier 1 +{" "}
            <strong className="text-blue-950">{jumlahTier2Terpakai}</strong> Tier 2 +{" "}
            <strong className="text-blue-950">{jumlahDiluarTier}</strong> di luar Tier 1/2)
            · Kandidat Tier 1 terpakai:{" "}
            <strong className="text-blue-950">
              {jumlahTier1Terpakai}/{kandidatTier1.length}
            </strong>{" "}
            (kecuali PML)
            · Kandidat Tier 2 terpakai:{" "}
            <strong className="text-blue-950">
              {jumlahTier2Terpakai}/{kandidatTier2.length}
            </strong>{" "}
            (kecuali PML)
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
              {simpanBusy
                ? simpanProgress && simpanProgress.total > 0
                  ? // (3 Okt 2026) Permintaan user: tombol tampilkan persentase
                    // berjalan selagi menyimpan (bukan cuma teks statis),
                    // krn tiap baris dikirim satu-satu ke server & bisa
                    // lama kalau perubahannya banyak.
                    `Menyimpan... ${Math.round((simpanProgress.selesai / simpanProgress.total) * 100)}% (${simpanProgress.selesai}/${simpanProgress.total})`
                  : "Menyimpan..."
                : "💾 Simpan Perubahan"}
            </button>
            <button
              type="button"
              onClick={() => {
                setResetError(null);
                setResetPin("");
                setResetKecamatan("");
                setResetNagari("");
                setModalReset(true);
              }}
              title="Hapus SELURUH plotting PPL (termasuk yg sudah dipecah) -- butuh PIN"
              className="rounded-md border border-rust-200 bg-rust-50 px-3 py-1.5 text-xs font-medium text-rust-700 transition hover:bg-rust-100"
            >
              🗑️ Reset Semua Plotting
            </button>
          </span>
        </div>

        {modalReset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
              <h3 className="font-medium text-rust-700">Reset Semua Plotting</h3>
              <p className="mt-1 text-xs text-ink/60">
                Hapus penugasan PPL (termasuk Sub SLS yg sudah dipecah) utk lingkup di bawah ini. Tidak bisa
                dibatalkan sesudah dijalankan.
              </p>

              <label className="mt-3 block text-xs font-medium text-ink/70">Lingkup</label>
              <div className="mt-1 flex flex-col gap-1.5">
                <select
                  value={resetKecamatan}
                  onChange={(e) => {
                    setResetKecamatan(e.target.value);
                    setResetNagari(""); // ganti kecamatan -> nagari lama (kecamatan beda) tidak relevan lagi
                  }}
                  className="w-full rounded border border-line px-2 py-1.5 text-sm"
                >
                  <option value="">Semua Kecamatan</option>
                  {kecamatanOptions.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <select
                  value={resetNagari}
                  onChange={(e) => setResetNagari(e.target.value)}
                  disabled={!resetKecamatan}
                  className="w-full rounded border border-line px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-ink/40"
                >
                  <option value="">
                    {resetKecamatan ? `Semua Nagari di ${resetKecamatan}` : "Pilih Kecamatan dulu (opsional)"}
                  </option>
                  {nagariOptionsUntukReset.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1.5 text-xs font-medium text-rust-700">
                {resetNagari
                  ? `Akan mereset: Sub SLS di Nagari ${resetNagari}, Kecamatan ${resetKecamatan} saja.`
                  : resetKecamatan
                  ? `Akan mereset: SELURUH Sub SLS di Kecamatan ${resetKecamatan} saja.`
                  : "Akan mereset: SELURUH Sub SLS di SEMUA kecamatan."}
              </p>

              <label className="mt-3 block text-xs font-medium text-ink/70">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={resetPin}
                onChange={(e) => setResetPin(e.target.value)}
                placeholder="PIN"
                autoFocus
                className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && resetPin && !resetBusy) handleResetSemuaPlotting();
                }}
              />
              {resetError && <div className="mt-2 rounded-md bg-rust-50 px-3 py-2 text-xs text-rust-700">{resetError}</div>}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={resetBusy}
                  onClick={() => setModalReset(false)}
                  className="rounded-md border border-line px-3 py-1.5 text-sm text-ink/70 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!resetPin || resetBusy}
                  onClick={handleResetSemuaPlotting}
                  className="rounded-md bg-rust-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rust-700 disabled:opacity-40"
                >
                  {resetBusy ? "Mereset..." : "Reset Sekarang"}
                </button>
              </div>
            </div>
          </div>
        )}

        {autoPlotSubsls.size > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-gold-400 bg-gold-100 px-3 py-2 text-xs text-gold-600">
            <span>
              🤖 <strong>{autoPlotSubsls.size}</strong> baris diisi dari saran Auto Plot (baris berwarna cokelat di
              tabel bawah) — belum final, tinjau dulu sebelum menyimpan.
            </span>
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={batalkanSemuaAutoPlot}
                className="rounded-md border border-gold-400 bg-white px-2.5 py-1 font-medium text-gold-600 hover:bg-gold-100"
              >
                ✕ Batalkan Semua Saran
              </button>
              <button
                type="button"
                onClick={setujuiSemuaAutoPlot}
                className="rounded-md bg-moss-500 px-2.5 py-1 font-medium text-white hover:bg-moss-700"
              >
                ✓ Setujui Semua Saran
              </button>
            </span>
          </div>
        )}

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
        {/* (3 Okt 2026) Cadangan pesan sukses "Gabung Kembali" DI SINI JUGA
            (selain di baris ybs, lihat kolom "Pecah") -- kalau baris itu jadi
            kesaring filter aktif (mis. "Status Plot: sudah") sesudah berhasil
            digabungkan (jadi belum terplot), admin tetap lihat konfirmasinya
            di toolbar atas ini, tidak terkesan aksinya diam2 gagal. */}
        {gabungInfo?.tipe === "ok" && (
          <p className="mt-2 rounded-md bg-moss-100 px-3 py-2 text-xs text-moss-700">✓ {gabungInfo.teks}</p>
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
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={40}>40</option>
              <option value={50}>50</option>
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

        {/* (3 Okt 2026) "Tampilan Padat": permintaan user supaya tabel
            Langkah 4 lebih mirip spreadsheet -- baris lebih rapat & teks
            lebih kecil, jadi lebih banyak baris kelihatan sekali pandang.
            Diterapkan lewat <style> + className pembungkus (bukan mengubah
            tiap className px-3 py-2 satu-satu di ~14 kolom) supaya aman &
            kecil risikonya; override pakai !important krn Tailwind utility
            padding/text-size yg sudah ada juga spesifik. */}
        <style>{`
          .tabel-alokasi-padat th, .tabel-alokasi-padat td {
            padding-top: 2px !important;
            padding-bottom: 2px !important;
            font-size: 11px !important;
            line-height: 1.25 !important;
          }
        `}</style>
        <div className="mt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setTampilanPadat((v) => !v)}
            className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink/70 hover:bg-gray-50"
            title="Baris lebih rapat & teks lebih kecil -- supaya lebih banyak baris kelihatan sekaligus, mirip spreadsheet"
          >
            {tampilanPadat ? "☰ Tampilan Normal" : "☰ Tampilan Padat"}
          </button>
        </div>

        <div className={`mt-2 max-h-[70vh] overflow-auto rounded-md border border-line ${tampilanPadat ? "tabel-alokasi-padat" : ""}`}>
          <table className="w-full min-w-[1450px] text-left text-sm">
            <thead className="sticky top-0 z-20 bg-blue-50 text-blue-600">
              <tr>
                {!modeFokus && (
                  <ThKontrol
                    label="Kecamatan"
                    freeze={{ left: freezeOffsetAlokasi.kecamatan, width: LEBAR_FREEZE_ALOKASI.kecamatan }}
                    search={{ value: kecamatanHeaderSearch, onChange: (v) => { setKecamatanHeaderSearch(v); setPage(1); }, placeholder: "Cari kecamatan..." }}
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
                    freeze={{ left: freezeOffsetAlokasi.nagari, width: LEBAR_FREEZE_ALOKASI.nagari }}
                    sort={{
                      active: sortKey === "nagari",
                      dir: sortDir,
                      onAsc: () => sortAsc("nagari"),
                      onDesc: () => sortDesc("nagari"),
                      onReset: sortReset,
                    }}
                  />
                )}
                <ThKontrol
                  label="Jorong/SLS"
                  freeze={{ left: freezeOffsetAlokasi.jorong, width: LEBAR_FREEZE_ALOKASI.jorong }}
                  sort={{
                    active: sortKey === "jorong",
                    dir: sortDir,
                    onAsc: () => sortAsc("jorong"),
                    onDesc: () => sortDesc("jorong"),
                    onReset: sortReset,
                  }}
                />
                <ThKontrol
                  label="Sub SLS"
                  freeze={{ left: freezeOffsetAlokasi.subsls, width: LEBAR_FREEZE_ALOKASI.subsls }}
                  sort={{
                    active: sortKey === "subsls",
                    dir: sortDir,
                    onAsc: () => sortAsc("subsls"),
                    onDesc: () => sortDesc("subsls"),
                    onReset: sortReset,
                  }}
                />
                {!modeFokus && (
                  <ThKontrol
                    label="Data KK"
                    freeze={{ left: freezeOffsetAlokasi.datakk, width: LEBAR_FREEZE_ALOKASI.datakk }}
                    filter={{ options: DATA_KK_OPSI, selected: dataFilterSelected, onApply: terapkanDataFilter }}
                  />
                )}
                {!modeFokus && (
                  <ThKontrol
                    label="Skor Beban Pendataan"
                    freeze={{ left: freezeOffsetAlokasi.skorBebanPendataan, width: LEBAR_FREEZE_ALOKASI.skorBebanPendataan }}
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
                    freeze={{ left: freezeOffsetAlokasi.skorJarak, width: LEBAR_FREEZE_ALOKASI.skorJarak }}
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
                  freeze={{ left: freezeOffsetAlokasi.skorBebanAkhir, width: LEBAR_FREEZE_ALOKASI.skorBebanAkhir }}
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
                  freeze={{ left: freezeOffsetAlokasi.ppl, width: LEBAR_FREEZE_ALOKASI.ppl }}
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
                  // (3 Okt 2026) Grup filter kedua -- permintaan user: filter
                  // baris menurut penilaian kinerja PPL yg sedang terpasang
                  // (draft-aware, lihat efektifPplId di `filtered`).
                  filter2={{
                    label: "Penilaian Kinerja",
                    options: Array.from(
                      new Set(petugasList.filter((p) => p.peran === "ppl").map((p) => labelNilaiKinerja(p.nilai_kinerja)))
                    ).sort((a, b) => a.localeCompare(b, "id")),
                    selected: nilaiKinerjaPplFilter,
                    onApply: (next) => {
                      setNilaiKinerjaPplFilter(next);
                      setPage(1);
                    },
                  }}
                  sort={{
                    active: sortKey === "ppl",
                    dir: sortDir,
                    onAsc: () => sortAsc("ppl"),
                    onDesc: () => sortDesc("ppl"),
                    onReset: sortReset,
                  }}
                />
                <th className="px-3 py-2 font-medium">Pecah</th>
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
                  sort={{
                    active: sortKey === "pml",
                    dir: sortDir,
                    onAsc: () => sortAsc("pml"),
                    onDesc: () => sortDesc("pml"),
                    onReset: sortReset,
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
                // (3 Okt 2026) Pecah Sub SLS: baris ini salah satu bagian dari
                // Sub SLS yg dipecah -- ppl_id SUDAH final/tersimpan (bukan
                // draft), jadi tidak lewat mekanisme draftPpl sama sekali.
                // CATATAN keterbatasan: kolom "Beban Petugas" & ranking di
                // popover "Saran" dihitung dari bebanDraftPerPpl, yg cuma
                // menjumlah baris yg draftPpl-nya diisi lewat dropdown --
                // porsi KK dari Sub SLS yg dipecah TIDAK ikut tersjumlah di
                // situ (makanya kolom itu bisa tampil "-" utk baris pecahan).
                // Angka yg benar2 akurat (termasuk pecahan) ada di panel
                // "Ringkasan Beban" per PPL/PML/Korwil -- itu dihitung server.
                const dipecah = r.porsi_kk !== null;
                const draftPplId = dipecah ? r.ppl_id : draftPpl[r.idsubsls] ?? null;
                const berubah = dipecah ? false : draftPplId !== (r.ppl_id ?? null);
                const bebanPpl = draftPplId ? bebanDraftPerPpl.get(draftPplId) ?? 0 : null;
                const info = bebanPpl != null ? balanceInfo(bebanPpl, rataBebanTetap) : null;
                const delta = bebanPpl != null && rataBebanTetap > 0 ? bebanPpl - rataBebanTetap : null;
                const draftPmlId = draftPplId ? pmlDraftUntukPpl(draftPplId) : null;
                const korwilNama = korwilNamaUntukPml(draftPmlId);
                const isSaranAutoPlot = !dipecah && autoPlotSubsls.has(r.idsubsls);
                // (3 Okt 2026) Permintaan user: baris ditandai HIJAU kalau
                // sudah teralokasi (sudah punya PPL di draft saat ini, tanpa
                // perubahan yg belum disimpan) -- supaya sekilas kelihatan
                // mana yg sudah kebagian petugas vs yg masih kosong (putih).
                // Diletakkan PALING TERAKHIR (prioritas paling rendah) krn
                // dipecah/auto-plot/berubah sudah sama2 berarti "ada PPL"
                // juga, tapi warnanya dipakai utk menandai status LAIN yg
                // lebih spesifik -- jangan sampai ketimpa hijau.
                const sudahTeralokasi = !dipecah && !isSaranAutoPlot && !berubah && draftPplId !== null;
                const bgBaris = dipecah
                  ? "bg-indigo-50/60"
                  : isSaranAutoPlot
                  ? "bg-gold-100"
                  : berubah
                  ? "bg-orange-50/50"
                  : sudahTeralokasi
                  ? "bg-moss-50/60"
                  : "bg-white";
                const petugasDraftPpl = draftPplId ? petugasList.find((x) => x.id === draftPplId) : undefined;
                const statusKesediaan = statusKesediaanPpl(petugasDraftPpl);
                // Skor Jarak: nilai RESMI (OSRM) cuma valid kalau draft PPL
                // saat ini SAMA dgn PPL yg benar2 tersimpan di server & jarak
                // riilnya sudah dihitung (baris pecahan SELALU dianggap final
                // krn tidak ada draft utk itu). Selain itu (baru dipilih/
                // diubah di draft, atau belum pernah dihitung sama sekali)
                // tampilkan PERKIRAAN garis lurus (haversine) spt popover
                // "Saran", biar admin langsung lihat gambaran begitu memilih
                // PPL -- bukan menunggu simpan + proses OSRM.
                const skorJarakResmi = dipecah
                  ? r.jarak_status === "riil"
                  : r.jarak_status === "riil" && draftPplId === r.ppl_id;
                const titikBarisIni = titikSubslsMap.get(r.idsubsls) ?? null;
                const skorJarakEstimasi =
                  !dipecah && !skorJarakResmi && petugasDraftPpl && titikBarisIni && petugasDraftPpl.lokasi_status === "riil" &&
                  typeof petugasDraftPpl.lat === "number" && typeof petugasDraftPpl.lng === "number"
                    ? (() => {
                        const jarakKm = haversineKm(petugasDraftPpl.lat as number, petugasDraftPpl.lng as number, titikBarisIni.lat, titikBarisIni.lng);
                        return { jarakKm, skor: (jarakKm / pembagiJarakKm) * r.jumlah_hari_kerja };
                      })()
                    : null;
                return (
                  <tr
                    key={`${r.idsubsls}-${r.ppl_id ?? "x"}`}
                    data-idsubsls={r.idsubsls}
                    className={`border-t border-line ${bgBaris}`}
                  >
                    {!modeFokus && (
                      <td
                        className={`sticky z-10 px-3 py-2 text-ink/80 ${bgBaris}`}
                        style={{ left: freezeOffsetAlokasi.kecamatan, width: LEBAR_FREEZE_ALOKASI.kecamatan, minWidth: LEBAR_FREEZE_ALOKASI.kecamatan, maxWidth: LEBAR_FREEZE_ALOKASI.kecamatan }}
                      >
                        {r.kecamatan}
                      </td>
                    )}
                    {!modeFokus && (
                      <td
                        className={`sticky z-10 px-3 py-2 text-ink/80 ${bgBaris}`}
                        style={{ left: freezeOffsetAlokasi.nagari, width: LEBAR_FREEZE_ALOKASI.nagari, minWidth: LEBAR_FREEZE_ALOKASI.nagari, maxWidth: LEBAR_FREEZE_ALOKASI.nagari }}
                      >
                        {r.nagari}
                      </td>
                    )}
                    <td
                      className={`sticky z-10 px-3 py-2 font-medium text-ink ${bgBaris}`}
                      style={{ left: freezeOffsetAlokasi.jorong, width: LEBAR_FREEZE_ALOKASI.jorong, minWidth: LEBAR_FREEZE_ALOKASI.jorong, maxWidth: LEBAR_FREEZE_ALOKASI.jorong }}
                    >
                      {r.sls}
                    </td>
                    <td
                      className={`sticky z-10 px-3 py-2 text-ink/80 ${bgBaris}`}
                      style={{ left: freezeOffsetAlokasi.subsls, width: LEBAR_FREEZE_ALOKASI.subsls, minWidth: LEBAR_FREEZE_ALOKASI.subsls, maxWidth: LEBAR_FREEZE_ALOKASI.subsls }}
                    >
                      {r.sub_sls}
                    </td>
                    {!modeFokus && (
                      <td
                        className={`sticky z-10 px-3 py-2 ${bgBaris}`}
                        style={{ left: freezeOffsetAlokasi.datakk, width: LEBAR_FREEZE_ALOKASI.datakk, minWidth: LEBAR_FREEZE_ALOKASI.datakk, maxWidth: LEBAR_FREEZE_ALOKASI.datakk }}
                      >
                        <BadgeDataKk punya={r.punya_data_kk} />
                      </td>
                    )}
                    {!modeFokus && (
                      <td
                        className={`sticky z-10 px-3 py-2 text-ink/80 ${bgBaris}`}
                        style={{ left: freezeOffsetAlokasi.skorBebanPendataan, width: LEBAR_FREEZE_ALOKASI.skorBebanPendataan, minWidth: LEBAR_FREEZE_ALOKASI.skorBebanPendataan, maxWidth: LEBAR_FREEZE_ALOKASI.skorBebanPendataan }}
                      >
                        {r.skor_beban_pendataan.toLocaleString("id-ID")}
                      </td>
                    )}
                    {!modeFokus && (
                      <td
                        className={`sticky z-10 px-3 py-2 text-ink/80 ${bgBaris}`}
                        style={{ left: freezeOffsetAlokasi.skorJarak, width: LEBAR_FREEZE_ALOKASI.skorJarak, minWidth: LEBAR_FREEZE_ALOKASI.skorJarak, maxWidth: LEBAR_FREEZE_ALOKASI.skorJarak }}
                      >
                        {skorJarakResmi ? (
                          <span
                            title={`Jarak RESMI dihitung dari titik Sub SLS ke lokasi rumah petugas (OSRM/garis lurus), dikali perkiraan ${r.jumlah_hari_kerja} hari kerja (PP tiap hari, tidak menginap)`}
                          >
                            {r.skor_jarak.toLocaleString("id-ID")} ({r.jarak_km?.toLocaleString("id-ID")} km × {r.jumlah_hari_kerja} hari)
                          </span>
                        ) : skorJarakEstimasi ? (
                          <span
                            className="text-amber-700"
                            title="PERKIRAAN garis lurus (haversine) dari lokasi rumah PPL ke titik Sub SLS -- belum final. Nilai resmi (rute OSRM) dihitung ulang sesudah 'Simpan Perubahan' ditekan."
                          >
                            ≈ {skorJarakEstimasi.skor.toLocaleString("id-ID", { maximumFractionDigits: 2 })} (
                            {skorJarakEstimasi.jarakKm.toLocaleString("id-ID", { maximumFractionDigits: 1 })} km ×{" "}
                            {r.jumlah_hari_kerja} hari)
                          </span>
                        ) : (
                          <span
                            className="text-xs text-ink/40"
                            title={
                              draftPplId
                                ? "Lokasi rumah PPL ini blm diisi/diverifikasi -- jarak tidak bisa diperkirakan"
                                : "Belum dipilih PPL / lokasi rumah petugas blm diisi-diverifikasi"
                            }
                          >
                            ⚪ belum tersedia
                          </span>
                        )}
                      </td>
                    )}
                    <td
                      className={`sticky z-10 px-3 py-2 font-medium text-ink ${bgBaris}`}
                      style={{ left: freezeOffsetAlokasi.skorBebanAkhir, width: LEBAR_FREEZE_ALOKASI.skorBebanAkhir, minWidth: LEBAR_FREEZE_ALOKASI.skorBebanAkhir, maxWidth: LEBAR_FREEZE_ALOKASI.skorBebanAkhir }}
                    >
                      {r.skor_beban_akhir.toLocaleString("id-ID")}
                    </td>
                    <td
                      className={`sticky z-10 px-3 py-2 ${bgBaris}`}
                      style={{ left: freezeOffsetAlokasi.ppl, width: LEBAR_FREEZE_ALOKASI.ppl, minWidth: LEBAR_FREEZE_ALOKASI.ppl, maxWidth: LEBAR_FREEZE_ALOKASI.ppl }}
                    >
                      {dipecah ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                            ✂️ Pecahan
                          </span>
                          {/* (3 Okt 2026) Warna nama gradasi merah->hijau tua
                              sesuai nilai_kinerja PPL ybs (5 = terbaik) --
                              permintaan user. `undefined` (nilai belum ada)
                              otomatis jatuh balik ke warna teks bawaan. */}
                          <span
                            className="font-medium text-ink/80"
                            style={{ color: warnaNilaiKinerja(petugasDraftPpl?.nilai_kinerja ?? null) }}
                          >
                            {r.ppl_nama}
                          </span>
                          <IkonNilaiKinerja
                            nilai={petugasDraftPpl?.nilai_kinerja ?? null}
                            catatan={petugasDraftPpl?.catatan_kinerja ?? null}
                          />
                          <span className="text-xs text-ink/50">({r.porsi_kk?.toLocaleString("id-ID")} KK)</span>
                          {statusKesediaan?.tipe === "belum_konfirmasi" && (
                            <IkonStatusKesediaanPpl status={statusKesediaan} />
                          )}
                          {statusKesediaan &&
                            statusKesediaan.kegiatanLain.map((k) => <BadgeKegiatanLain key={k} kegiatan={k} />)}
                        </div>
                      ) : (
                        <>
                          {/* (3 Okt 2026) flex-wrap -- kolom PPL sekarang lebar FIXED
                              (lihat LEBAR_FREEZE_ALOKASI, dibekukan/sticky), jadi kalau
                              Combobox + tombol Saran + ikon kesediaan/kegiatan lain
                              kebetulan tidak muat satu baris, biar TURUN ke baris
                              baru di dalam sel ini (sel jadi lebih tinggi) -- BUKAN
                              meluber keluar sel/menimpa kolom sebelahnya. */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Combobox
                              disabled={pplOptions.length === 0}
                              value={draftPplId ?? null}
                              onChange={(val) => ubahDraftPpl(r.idsubsls, val)}
                              options={pplOptions.map((p) => ({ value: p.id, label: infoPplUntukBaris(p, r) }))}
                              placeholder="Plot ke PPL..."
                              className="w-48"
                              // (3 Okt 2026) Warna teks nama PPL terpilih,
                              // gradasi merah->hijau tua sesuai nilai_kinerja
                              // -- permintaan user, lihat warnaNilaiKinerja.
                              warnaTeks={(id) => warnaNilaiKinerja(petugasList.find((p) => p.id === id)?.nilai_kinerja ?? null)}
                            />
                            {draftPplId && (
                              <IkonNilaiKinerja
                                nilai={petugasDraftPpl?.nilai_kinerja ?? null}
                                catatan={petugasDraftPpl?.catatan_kinerja ?? null}
                              />
                            )}
                            <SaranMitraTombol
                              pplOptions={pplOptions}
                              bebanDraftPerPpl={bebanDraftPerPpl}
                              rataBebanTetap={rataBebanTetap}
                              pplTerpilihId={draftPplId}
                              onPilih={(id) => ubahDraftPpl(r.idsubsls, id)}
                              subslsPoint={titikSubslsMap.get(r.idsubsls) ?? null}
                            />
                            {/* (3 Okt 2026) "📍 Wilayah Lain" -- KEBALIKAN dari
                                tombol Saran di atas: menyarankan Sub SLS LAIN
                                utk PPL yg SEDANG aktif di baris ini (bukan
                                menyarankan PPL utk baris ini). Cuma muncul
                                kalau baris ini sudah ada PPL-nya. */}
                            {draftPplId && (
                              <SarankanWilayahTombol
                                petugas={petugasDraftPpl}
                                kertasKerja={kertasKerja}
                                efektifPplId={efektifPplId}
                                titikSubslsMap={titikSubslsMap}
                                idsubslsSaatIni={r.idsubsls}
                                onPilih={(idsubslsTujuan, kosong) => navigasiKeSubsls(idsubslsTujuan, kosong, draftPplId)}
                              />
                            )}
                            {statusKesediaan?.tipe === "belum_konfirmasi" && (
                              <IkonStatusKesediaanPpl status={statusKesediaan} />
                            )}
                            {statusKesediaan &&
                              statusKesediaan.kegiatanLain.map((k) => (
                                <BadgeKegiatanLain key={k} kegiatan={k} />
                              ))}
                            {draftPplId && (
                              <button
                                type="button"
                                onClick={() => ubahDraftPpl(r.idsubsls, null)}
                                title="Lepas plot Sub SLS ini (belum tersimpan sampai Simpan Perubahan ditekan)"
                                className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-ink/60 hover:bg-gray-200"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          {isSaranAutoPlot && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className="rounded-full bg-gold-400/20 px-2 py-0.5 text-[10px] font-medium text-gold-600"
                                title="Saran otomatis Auto Plot: PPL terdekat yg bebannya paling mendekati rata-rata. BELUM final -- tinjau lalu Setujui atau Batalkan."
                              >
                                🤖 Saran Auto Plot
                              </span>
                              <button
                                type="button"
                                onClick={() => setujuiAutoPlot(r.idsubsls)}
                                className="rounded-full bg-moss-100 px-2 py-0.5 text-[10px] font-medium text-moss-700 hover:bg-moss-500 hover:text-white"
                              >
                                ✓ Setujui
                              </button>
                              <button
                                type="button"
                                onClick={() => batalkanAutoPlot(r.idsubsls)}
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-ink/60 hover:bg-gray-200"
                              >
                                ✕ Batalkan
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {dipecah ? (
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() => setModalPecah(r)}
                            className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-ink/60 hover:bg-gray-200"
                          >
                            Edit Pembagian
                          </button>
                          <button
                            type="button"
                            disabled={gabungBusyId === r.idsubsls}
                            onClick={() => handleGabungKembali(r.idsubsls)}
                            className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-ink/60 hover:bg-gray-200 disabled:opacity-50"
                          >
                            {gabungBusyId === r.idsubsls ? "Menggabungkan..." : "Gabung Kembali"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setModalPecah(r)}
                          title="Pecah Sub SLS ini ke beberapa PPL sekaligus (skor beban yg sangat besar)"
                          className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-100"
                        >
                          ✂️ Pecah
                        </button>
                      )}
                      {gabungInfo && gabungInfo.idsubsls === r.idsubsls && (
                        <p
                          className={`mt-1 max-w-[12rem] text-[10px] font-medium ${
                            gabungInfo.tipe === "ok" ? "text-moss-600" : "text-rust-600"
                          }`}
                        >
                          {gabungInfo.tipe === "ok" ? "✓ " : "⚠ "}
                          {gabungInfo.teks}
                        </p>
                      )}
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
                  <td colSpan={modeFokus ? 8 : 14} className="px-3 py-4 text-center text-ink/50">
                    Tidak ada data yang cocok dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {modalPecah && (
          <ModalPecahSubSls
            row={modalPecah}
            pplOptions={pplOptions}
            sudahDipecahSebelumnya={kertasKerja.filter(
              (x) => x.idsubsls === modalPecah.idsubsls && x.porsi_kk !== null
            )}
            busy={pecahBusy}
            error={pecahError}
            onBatal={() => {
              setModalPecah(null);
              setPecahError(null);
            }}
            onSimpan={(pembagian) => handleSimpanPecahan(modalPecah.idsubsls, pembagian)}
          />
        )}

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
      )}
      </div>
    </div>
  );
}

export default function BencanaPage() {
  const [tab, setTab] = useState<
    "identifikasi" | "monitoring" | "alokasi" | "master" | "kegiatan-petugas" | "pengaturan"
  >("identifikasi");

  const [wilayah, setWilayah] = useState<KecamatanItem[]>([]);
  const [mitraList, setMitraList] = useState<MitraItem[]>([]);
  const [magangList, setMagangList] = useState<PegawaiMagangItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Identitas pengisi
  const [namaInput, setNamaInput] = useState("");
  const [mitraIdManual, setMitraIdManual] = useState<number | null>(null);
  const [saranDipakai, setSaranDipakai] = useState(false);
  const [namaMagangInput, setNamaMagangInput] = useState("");

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
  const [monMagang, setMonMagang] = useState<MonitoringMagangRow[]>([]);

  useEffect(() => {
    async function loadAwal() {
      try {
        const [wRes, mRes, pmRes] = await Promise.all([
          fetch("/api/bencana/wilayah"),
          fetch("/api/bencana/mitra"),
          fetch("/api/bencana/pegawai-magang"),
        ]);
        const wJson = await wRes.json();
        const mJson = await mRes.json();
        const pmJson = await pmRes.json();
        if (!wRes.ok) throw new Error(wJson.error || "Gagal memuat daftar wilayah.");
        if (!mRes.ok) throw new Error(mJson.error || "Gagal memuat daftar mitra.");
        setWilayah(wJson.data ?? []);
        setMitraList(mJson.data ?? []);
        if (pmRes.ok) setMagangList(pmJson.data ?? []);
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
        setMonMagang(json.magang ?? []);
      } catch (err) {
        setMonError(err instanceof Error ? err.message : "Gagal memuat monitoring.");
      } finally {
        setMonLoading(false);
      }
    }
    loadMonitoring();
  }, [tab]);

  // Tambahkan nama pegawai magang ke daftar lokal (optimis) begitu dipakai
  // di suatu submit, supaya form berikutnya (jorong lain di nagari yang
  // sama) langsung lihat nama itu di dropdown tanpa perlu reload. Server
  // (route gate/jorong) yang menyimpan permanen ke bencana_pegawai_magang.
  function catatNamaMagangLokal(nama: string) {
    const trimmed = nama.trim();
    if (!trimmed) return;
    setMagangList((prev) =>
      prev.some((m) => m.nama.trim().toLowerCase() === trimmed.toLowerCase())
        ? prev
        : [...prev, { id: -Date.now(), nama: trimmed }].sort((a, b) => a.nama.localeCompare(b.nama))
    );
  }

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
          nama_pegawai_magang: namaMagangInput.trim() || null,
          ada_jorong_terdampak: jawaban,
          catatan: gateCatatan,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal mengirim jawaban.");
      setGateSubmitted(true);
      catatNamaMagangLokal(namaMagangInput);
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
          nama_pegawai_magang: namaMagangInput.trim() || null,
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
      catatNamaMagangLokal(namaMagangInput);
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
        tab === "alokasi" || tab === "master" || tab === "kegiatan-petugas"
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
          onClick={() => setTab("kegiatan-petugas")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === "kegiatan-petugas"
              ? "bg-white text-blue-950 shadow-sm"
              : "text-blue-400 hover:text-blue-600"
          }`}
        >
          Kegiatan Petugas
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
      ) : tab === "kegiatan-petugas" ? (
        <KegiatanPetugasSection />
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
                Nama Mitra <span className="text-rust-500">*</span>
                <IkonRekomendasiMitra
                  iddesa={selectedIddesa}
                  kecamatan={selectedKecamatan}
                  onPilih={(nama) => {
                    setNamaInput(nama);
                    setMitraIdManual(null);
                  }}
                />
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

            <div>
              <label className="text-sm font-medium text-ink">Nama Pegawai Magang</label>
              <input
                list="daftar-magang"
                value={namaMagangInput}
                onChange={(e) => setNamaMagangInput(e.target.value)}
                placeholder="Isi jika didampingi pegawai magang (opsional)"
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
              <datalist id="daftar-magang">
                {magangList.map((m) => (
                  <option key={m.id} value={m.nama} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-ink/50">
                Pilih dari daftar kalau sudah pernah diisi sebelumnya (supaya nama
                konsisten/tidak typo), atau ketik nama baru kalau belum pernah ada.
              </p>
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
                                          <span className="flex items-center gap-1.5 text-sm text-ink">
                                            Sub SLS {s.sub_sls}
                                            {/* (3 Okt 2026) Tombol lihat peta sekilas -- permintaan mitra/admin
                                                supaya bisa cek cepat di citra satelit apakah lokasi Sub SLS ini
                                                masuk akal terdampak banjir (dekat sungai/dataran rendah) SEBELUM
                                                menandai Terdampak/Ragu. Popover kecil langsung di halaman (bukan
                                                tab baru) -- cukup utk "cek sekilas", lihat PetaSekilasTombol.
                                                Disembunyikan kalau titik Sub SLS ini belum tersedia (null). */}
                                            {s.lat != null && s.lng != null && (
                                              <PetaSekilasTombol lat={s.lat} lng={s.lng} label={`Sub SLS ${s.sub_sls}`} />
                                            )}
                                          </span>
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
              <MonitoringMagangSection data={monMagang} />

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
