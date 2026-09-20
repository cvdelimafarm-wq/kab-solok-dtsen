"use client";

// app/penyisiran/page.tsx
//
// Halaman TERPISAH utk fitur penyisiran undercoverage usaha SE2026 --
// awalnya "Penyisiran Usaha" adalah tab di /seruti, dipindah ke sini (atas
// permintaan) supaya tidak mengganggu tab-tab utama Seruti Triwulan III
// (beda konteks: ini SE2026, bukan Susenas/Seruti).
//
// Ada 5 tab di sini (lihat lib/penyisiranAuth.ts utk skema sesi/PIN):
//  - "Penyisiran Usaha": checklist petugas lapangan -- login PERSONAL
//    (nama lengkap + tanggal lahir, dicocokkan ke tabel
//    petugas_penyisiran_akun -- TABEL SAMA dgn "Identifikasi Jorong" di
//    bawah, cuma role token beda: "penyisiran_petugas") --
//    MENGGANTIKAN PIN bersama yg dulu dipakai tab ini. Krn loginnya
//    personal, sistem otomatis tahu siapa yg mengisi (dipakai dasar
//    hitungan tab "Monitoring Petugas Penyisiran" & skor prioritas
//    berbasis jarak, lihat app/seruti/penyisiran-usaha.tsx) --
//    nama+alamat+GPS+bukti DUTP/DTSEN/PNM. Badge Info PPL/Jorong/Tetangga
//    + tombol Edit per-kartu sudah DIHAPUS dari kartu (field & skor
//    prioritas yg memakainya ttp ada di backend, cuma tdk bisa diubah lg
//    lewat tab ini) -- tombol "Edit Semua" (global) msh ada, skrg cuma
//    dipakai utk unlock "Tandai Pasti". Kolom
//    "Identifikasi PPL" (badge) DIBEKUKAN read-only di sini --
//    satu-satunya cara mengubahnya adalah lewat salah satu dari TIGA tab
//    Identifikasi di bawah (lihat app/api/penyisiran/identifikasi/route.ts,
//    role "penyisiran"/"penyisiran_petugas" SENGAJA tidak lagi diizinkan
//    menulis ke kolom itu). PIN admin lama ("penyisiran", env
//    PENYISIRAN_PIN) TETAP ADA tapi sekarang cuma dipakai DUA tab
//    Monitoring di bawah, bukan lagi tab ini.
//  - "Identifikasi PPL": dibagikan ke PPL/mantan pendata SE2026, login
//    PERSONAL (nama lengkap + tanggal lahir, dicocokkan ke tabel
//    ppl_akun, role "identifikasi_ppl") -- cuma nama+alamat+wilayah,
//    tanpa bukti/GPS, dan cuma bisa mengisi Ada/Tidak Ada/Ragu utk
//    wilayah yang dialokasikan ke PPL itu saja.
//  - "Identifikasi Jorong": SAMA BENTUK dgn Identifikasi PPL di atas,
//    tapi login pakai akun "petugas penyisiran" (tabel
//    petugas_penyisiran_akun, TERPISAH dari ppl_akun, role
//    "identifikasi_jorong") & filter kartu MANUAL per Kecamatan/Nagari/
//    Sub SLS (bukan auto-scope per petugas) -- krn tugasnya menyisir per
//    Jorong, bukan per wilayah alokasi pribadi.
//  - "Identifikasi Tetangga/Lainnya": SAMA PERSIS cara kerjanya dgn
//    Identifikasi Jorong (login personal, filter manual), tapi akun
//    SENDIRI lagi (tabel tetangga_akun, role "identifikasi_tetangga") --
//    sumber informasinya tetangga/pihak lain, bukan petugas penyisiran.
//
//    KETIGA tab Identifikasi di atas menulis ke kolom yang SAMA
//    (penyisiran_usaha.identifikasi_ppl + identifikasi_ppl_oleh utk
//    menandai siapa yang mengisi), jadi otomatis ter-update/sync juga di
//    tab Penyisiran Usaha tanpa sinkronisasi tambahan apa pun.
//  - "Monitoring Identifikasi PPL": rekap progres pengisian tab
//    Identifikasi PPL DI ATAS, per PPL -- pakai PIN & sesi yang SAMA
//    dengan tab Penyisiran Usaha (role "penyisiran", internal staf saja,
//    BUKAN utk dibagikan ke PPL).
//  - "Monitoring Petugas Penyisiran": rekap per petugas penyisiran (Nama |
//    Diidentifikasi Jorong | Diidentifikasi Tetangga/Lainnya | Didata |
//    Dikunjungi) -- pakai PIN/sesi yang sama jg. Ada fitur "Kelola Petugas
//    Penyisiran" (aktifkan/nonaktifkan akun) yang DEFAULT DISEMBUNYIKAN &
//    minta PIN lagi sebelum tombolnya aktif -- lihat
//    app/penyisiran/monitoring-petugas.tsx.
//  - "Alokasi Sampel": form rekomendasi wilayah tugas -- login PERSONAL
//    menumpang akun & role "penyisiran_petugas" YANG SAMA dgn tab
//    "Penyisiran Usaha" (token localStorage sama, jadi otomatis sudah
//    login kalau sudah login di tab itu). Isinya checklist maks 5 SLS/
//    Jorong, diurutkan skor prioritas akhir PERSONAL (beda tiap petugas,
//    krn faktor jarak dari lokasi rumah masing-masing) tertinggi ke
//    terendah -- rumus skor (Skor Sumber DUTP/DTSEN/PNM + Skor
//    Identifikasi Ada-PPL/Jorong/Keduanya + Bonus Volume potensi KK -
//    Penalti Jarak ke centroid SLS) SUDAH dikonfirmasi user, lihat migrasi
//    supabase/migrations/20260918_alokasi_sampel.sql. Sesudah submit,
//    matriks gabungan petugas x Jorong x Nagari x Kecamatan dimunculkan
//    (HANYA Jorong yg sudah dipilih min. 1 petugas -- lihat
//    app/penyisiran/alokasi-sampel.tsx).
//
// Tab "Penyisiran Usaha" jg punya tombol "📍 Tetapkan Lokasi Rumah Saya"
// (Geolocation API, disimpan ke petugas_penyisiran_akun.lat/lng lewat
// akun personal yg sedang login) utk skor prioritas berbasis jarak, dan
// tombol "🎯 Tandai Pasti" per kartu utk override manual skor prioritas
// jadi maksimal.
//
// Komponen sesungguhnya utk tab Penyisiran Usaha (PIN gate, daftar, peta)
// TETAP di app/seruti/penyisiran-usaha.tsx + penyisiran-map.tsx -- file
// itu sendiri sudah lepas dari tab bar Seruti, cuma nama foldernya belum
// dipindah (aman direname/dipindah manual nanti kalau mau lebih rapi,
// tidak wajib).

import { useCallback, useEffect, useRef, useState } from "react";
import PenyisiranUsahaTab, {
  apiFetch,
  getToken,
  IS_PML_KEY,
  ModalRencanaBesok,
  TabelRencanaBesokHead,
  TabelRencanaBesokRow,
  type RencanaBesokRow,
} from "../seruti/penyisiran-usaha";
import IdentifikasiPplTab from "./identifikasi-ppl";
import IdentifikasiJorongTab from "./identifikasi-jorong";
import IdentifikasiTetanggaTab from "./identifikasi-tetangga";
import MonitoringPplTab from "./monitoring-ppl";
import MonitoringPetugasTab from "./monitoring-petugas";
import MonitoringTerpaduTab from "./monitoring-terpadu";
import ManajemenTargetTab from "./manajemen-target";
import MasterPetugasTab from "./master-petugas";
import AdministrasiSpjTab from "./administrasi-spj";
import PerencanaanLapanganTab from "./perencanaan-lapangan";

type TabKey =
  | "usaha"
  | "identifikasi"
  | "jorong"
  | "tetangga"
  | "monitoring"
  | "monitoring_petugas"
  | "monitoring_terpadu"
  | "target"
  | "master_petugas"
  | "spj"
  | "perencanaan";

export default function PenyisiranPage() {
  // Default dibuka ke tab "Penyisiran Usaha" (internal BPS, dipakai
  // sehari-hari oleh tim) -- DIUBAH atas permintaan user dari default lama
  // "Identifikasi PPL" (link yg dibagikan ke PPL/mantan pendata biasanya
  // dibuka lewat link langsung ke tab itu, jadi tidak terlalu terpengaruh
  // tab default berubah). Tab "Administrasi" (SPJ) jg dipindah ke urutan
  // KEDUA (persis di samping "Penyisiran Usaha") -- lihat urutan TabButton
  // di bawah, BUKAN lagi di dekat "Perencanaan Lapangan" spt sebelumnya.
  const [tab, setTab] = useState<TabKey>("usaha");

  return (
    <main className="mx-auto min-h-screen max-w-6xl overflow-x-hidden px-5 py-6">
      {/* Floating warning "belum merencanakan 8 kunjungan besok" -- SENGAJA
          dipasang di sini (level halaman, LUAR blok {tab === "usaha" && ...}
          di bawah) supaya tampil di TAB MANA PUN petugas sedang berada,
          bukan cuma saat tab "Penyisiran Usaha" aktif -- lihat komentar
          panjang di RencanaBesokWarningBar. */}
      <RencanaBesokWarningBar onRencanakan={() => setTab("usaha")} />
      {/* Bar BARU terpisah di BAWAH layar (permintaan user, SENGAJA bar
          TERPISAH dari RencanaBesokWarningBar di atas -- yg lama TETAP
          spt semula, cuma tampil saat BELUM 8/8) -- lihat komentar
          panjang di FloatBarRencanaBesok di bawah. DIBUNGKUS bareng
          FloatBarSpjBelumLengkap (bar KUNING BARU, permintaan user
          "diletakkan di bawah perencanaan 8 KK tadi") dlm SATU wrapper
          fixed+flex-col -- FloatBarSpjBelumLengkap ditaruh SESUDAHNYA
          (anak flex terakhir) supaya kalau dua2nya tampil sekaligus,
          bar SPJ ini yg nempel di tepi bawah layar & bar Rencana Besok
          persis di atasnya. Kalau salah satu return null, wrapper tetap
          rapat (tidak ada kotak kosong). */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col">
        <FloatBarRencanaBesok />
        <FloatBarSpjBelumLengkap onBukaAdministrasi={() => setTab("spj")} />
      </div>
      <p className="font-sans text-[13px] font-black italic tracking-tight text-navy-900">
        BADAN PUSAT STATISTIK KABUPATEN SOLOK
      </p>
      <p className="mt-0.5 text-xs font-medium text-navy-400">
        Sensus Ekonomi 2026 &middot; Penyisiran Undercoverage Usaha
      </p>

      {/* overflow-x-auto + flex-nowrap (bukan flex-wrap) SENGAJA dipakai --
          dgn 6 tab & beberapa labelnya panjang ("Monitoring Petugas
          Penyisiran"), kalau dibiarkan flex biasa baris tab ini melebar
          menembus lebar layar & mendorong SELURUH halaman jadi lebih lebar
          dari layar HP (dilaporkan user: tampilan berantakan/tidak
          otomatis ikut lebar layar di HP). Dengan overflow-x-auto,
          kelebihan lebarnya digulir SENDIRI di baris tab ini saja (bisa
          digeser ke samping), tidak lagi memaksa seluruh halaman ikut
          melebar. shrink-0+whitespace-nowrap di TabButton mencegah label
          tab terpotong/mengecil. */}
      <div className="mt-4 flex gap-2 overflow-x-auto border-b border-line">
        <TabButton active={tab === "usaha"} onClick={() => setTab("usaha")}>
          Penyisiran Usaha
        </TabButton>
        {/* "Administrasi" -- SPJ Translok (Kwitansi/Surat Tugas/Visum/
            Laporan/Dokumentasi/Surat Keterangan). Login menumpang akun
            Identifikasi Jorong ATAU Tetangga (PPL tidak ikut), lihat
            komentar lengkap di administrasi-spj.tsx & lib/spjAuth.ts.
            DIPINDAH ke urutan kedua (persis di samping "Penyisiran Usaha")
            atas permintaan user -- sebelumnya di dekat "Perencanaan
            Lapangan" di ujung baris tab. */}
        <TabButton active={tab === "spj"} onClick={() => setTab("spj")}>
          Administrasi
        </TabButton>
        <TabButton active={tab === "identifikasi"} onClick={() => setTab("identifikasi")}>
          Identifikasi PPL
        </TabButton>
        <TabButton active={tab === "jorong"} onClick={() => setTab("jorong")}>
          Identifikasi Jorong
        </TabButton>
        <TabButton active={tab === "tetangga"} onClick={() => setTab("tetangga")}>
          Identifikasi Tetangga/Lainnya
        </TabButton>
        <TabButton active={tab === "monitoring"} onClick={() => setTab("monitoring")}>
          Monitoring Identifikasi PPL
        </TabButton>
        <TabButton active={tab === "monitoring_petugas"} onClick={() => setTab("monitoring_petugas")}>
          Monitoring Petugas Penyisiran
        </TabButton>
        {/* "Monitoring" (terpadu) -- tab BARU, gabungan 7 area monitoring
            lintas tab yg tadinya tersebar/belum ada (kualitas kunjungan,
            konsistensi lintas sumber identifikasi, realisasi vs rencana,
            kelengkapan SPJ, beban kerja petugas, progres vs tenggat,
            konflik alokasi PPL) -- lihat komentar lengkap di
            app/penyisiran/monitoring-terpadu.tsx. Pakai PIN/sesi yg sama
            dgn 2 tab Monitoring di atas. */}
        <TabButton active={tab === "monitoring_terpadu"} onClick={() => setTab("monitoring_terpadu")}>
          Monitoring
        </TabButton>
        {/* "Manajemen Target" -- tab BARU, ditaruh paling akhir (area
            internal BPS bukan utk PPL/tetangga). Tombolnya tampil ke SEMUA
            orang (sama spt tab lain), tapi ISINYA dibatasi ke 4 nama
            tertentu -- lihat komentar akses di
            app/penyisiran/manajemen-target.tsx. */}
        <TabButton active={tab === "target"} onClick={() => setTab("target")}>
          Manajemen Target
        </TabButton>
        {/* "Master Petugas" -- tab BARU, perluasan data petugas yg sudah
            ada (email/alamat/status kepegawaian/pengawas) -- lihat
            komentar akses & isi lengkap di app/penyisiran/master-petugas.tsx.
            Akses dibatasi ke 4 nama yg sama dgn "Manajemen Target". */}
        <TabButton active={tab === "master_petugas"} onClick={() => setTab("master_petugas")}>
          Master Petugas
        </TabButton>
        {/* "Perencanaan Lapangan" (dulu "Alokasi Sampel") -- tab BARU,
            2 bagian: (1) Identifikasi Hari Tugas (checklist hari dalam
            seminggu yg bisa turun bertugas) & (2) Identifikasi Wilayah
            Sampel SLS (checklist SLS/Jorong per petugas Penyisiran
            berdasarkan skor prioritas personal, jarak dari lokasi rumah
            petugas). Login menumpang akun & role "penyisiran_petugas" yg
            SAMA dgn tab "Penyisiran Usaha" (lihat komentar lengkap di
            perencanaan-lapangan.tsx). */}
        <TabButton active={tab === "perencanaan"} onClick={() => setTab("perencanaan")}>
          Perencanaan Lapangan
        </TabButton>
      </div>

      <div className="mt-4">
        {tab === "usaha" && <PenyisiranUsahaTab />}
        {tab === "identifikasi" && <IdentifikasiPplTab />}
        {tab === "jorong" && <IdentifikasiJorongTab />}
        {tab === "tetangga" && <IdentifikasiTetanggaTab />}
        {tab === "monitoring" && <MonitoringPplTab />}
        {tab === "monitoring_petugas" && <MonitoringPetugasTab />}
        {tab === "monitoring_terpadu" && <MonitoringTerpaduTab />}
        {tab === "target" && <ManajemenTargetTab />}
        {tab === "master_petugas" && <MasterPetugasTab />}
        {tab === "spj" && <AdministrasiSpjTab />}
        {tab === "perencanaan" && <PerencanaanLapanganTab />}
      </div>
    </main>
  );
}

// Floating warning bar "belum merencanakan 8 kunjungan besok" -- muncul
// OTOMATIS mulai jam 17.00 (WIB, dari jam browser petugas -- app ini
// dipakai internal BPS Kab Solok, semua di WIB, sama spt pola jam lain di
// app ini yg tidak konversi TZ eksplisit di FE) kalau kuota harian (8
// keluarga berstatus "Jadwalkan Besok" utk BESOK) belum tercapai. HANYA
// utk akun "penyisiran_petugas" (login personal tab Penyisiran Usaha) yg
// BUKAN PML (PML tidak pernah mengisi status/menjadwalkan sendiri, lihat
// komentar isPml di app/seruti/penyisiran-usaha.tsx) -- kalau belum login
// sama sekali/PIN admin/role identifikasi_* lain, bar ini tidak tampil.
//
// Dipasang di LEVEL HALAMAN (bukan di dalam tab Penyisiran Usaha) supaya
// tetap kelihatan di tab mana pun petugas sedang bekerja (mis. sedang di
// tab Identifikasi Jorong) -- makanya komponen ini baca localStorage &
// panggil /api/penyisiran/summary SENDIRI (lewat getToken/apiFetch yg
// diekspor dari app/seruti/penyisiran-usaha.tsx, bukan duplikat logika),
// bukan menerima token lewat props dari tab manapun.
//
// Login/logout terjadi di komponen SAUDARA (tab Penyisiran Usaha) yg
// tidak otomatis memicu render ulang bar ini -- makanya localStorage
// dipoll ringan tiap 30 detik (bukan cuma sekali saat mount), cukup utk
// warning ambient spt ini (bukan kebutuhan real-time).
function RencanaBesokWarningBar({ onRencanakan }: { onRencanakan: () => void }) {
  const KUOTA = 8;
  const [checked, setChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [isPml, setIsPml] = useState(false);
  const [jumlah, setJumlah] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    function bacaStorage() {
      setToken(getToken());
      setIsPml(typeof window !== "undefined" && localStorage.getItem(IS_PML_KEY) === "1");
      setChecked(true);
    }
    bacaStorage();
    const id = setInterval(bacaStorage, 30000);
    return () => clearInterval(id);
  }, []);

  // Jam SAAT INI -- dicek ulang tiap 30 detik jg, supaya bar ini otomatis
  // muncul begitu jam menyentuh 17.00 tanpa perlu reload halaman.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Kuota "direncanakan_besok" -- dari RPC yg SAMA dipakai StatTile "📅
  // Dijadwalkan Besok" di tab Penyisiran Usaha (lihat migrasi
  // 20260920_penyisiran_jadwalkan_besok.sql), jadi angkanya SELALU
  // konsisten dgn yg dilihat petugas di tab itu. Dimuat ulang tiap kali
  // token berubah & diulang tiap 2 menit selama sesi aktif.
  useEffect(() => {
    if (!token || isPml) {
      setJumlah(null);
      return;
    }
    let batal = false;
    function muat() {
      apiFetch("/api/penyisiran/summary", token as string)
        .then((data) => {
          if (!batal) setJumlah(typeof data?.direncanakan_besok === "number" ? data.direncanakan_besok : null);
        })
        .catch(() => {
          if (!batal) setJumlah(null);
        });
    }
    muat();
    const id = setInterval(muat, 120000);
    return () => {
      batal = true;
      clearInterval(id);
    };
  }, [token, isPml]);

  if (!checked || !token || isPml || jumlah == null) return null;

  const jamSekarang = new Date(nowMs).getHours();
  if (jamSekarang < 17 || jumlah >= KUOTA) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-2 bg-rust-700 px-4 py-2 text-center text-xs font-medium text-white shadow-md">
      <span>
        ⚠ Kamu belum merencanakan {KUOTA} kunjungan untuk besok (baru {jumlah}/{KUOTA}).
      </span>
      <button
        type="button"
        onClick={onRencanakan}
        className="shrink-0 rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-rust-700 hover:bg-rust-50"
      >
        Rencanakan →
      </button>
    </div>
  );
}

// Bar BARU (permintaan user) di BAWAH layar, TERPISAH dari
// RencanaBesokWarningBar di atas (yg TETAP spt semula -- cuma tampil saat
// BELUM 8/8, mulai jam 17:00). Bar ini:
//  - Tampil SELALU jam 17:00-23:59 (bukan cuma saat belum tercapai), warna
//    berubah sesuai progres (merah <50%, kuning 50-99%, hijau 100%+) --
//    padam sendiri jam 00:00-16:59 (jamSekarang<17, sama spt bar di atas).
//  - Angka "x/8" ini SELALU per PETUGAS YANG LOGIN SAJA (dari RPC
//    penyisiran_summary_wilayah, wilayah personal petugas ybs) -- BUKAN
//    direkap per SLS/Kecamatan (sesuai permintaan user).
//  - Update MENDEKATI real-time: selain polling 30 detik spt bar di atas,
//    jg mendengarkan custom event "penyisiran:rencana-besok-changed" yg
//    di-dispatch RowCard (app/seruti/penyisiran-usaha.tsx) SETIAP KALI
//    checklist berhasil disimpan -- begitu ada kartu yg statusnya berubah
//    jadi/dari "Dijadwalkan Besok", angka di bar ini langsung diperbarui
//    tanpa menunggu interval polling berikutnya.
//  - Tombol "📤 Kirim ke WA PML": DI HP (yg dukung Web Share API dgn file --
//    Chrome Android, Safari iOS 15+), pakai navigator.share() supaya
//    gambar rencana besok LANGSUNG "nempel" siap dikirim persis spt share
//    bukti transfer dari BRImo/aplikasi bank -- layar Share bawaan HP
//    kebuka, user tinggal ketuk ikon WhatsApp, PILIH chat PML-nya (WhatsApp
//    SENGAJA mewajibkan ini, BUKAN sesuatu yg bisa dilewati/diotomatisasi
//    dari web manapun termasuk BRImo -- itu jg cuma share ke OS, bukan
//    kirim otomatis), gambar SUDAH terpasang di kotak chat, tinggal tekan
//    Kirim. TIDAK ADA LAGI langkah salin-tempel manual di jalur ini.
//    Kalau Web Share API dgn file TIDAK didukung (kebanyakan browser
//    desktop) atau gagal/dibatalkan karena sebab lain, jatuh ke cara LAMA:
//    salin gambar ke clipboard (html2canvas, pola SAMA dgn
//    ModalRencanaBesok) + buka tab WhatsApp ke nomor PML (dari kolom
//    "No. HP" Master Petugas, via pengawas_id -- lihat
//    /api/penyisiran/summary) -- di jalur fallback ini tersisa SATU
//    langkah manual: klik kotak chat lalu Ctrl+V (atau tekan-tahan lalu
//    Tempel di HP), baru Kirim.
function FloatBarRencanaBesok() {
  const KUOTA = 8;
  const [checked, setChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [isPml, setIsPml] = useState(false);
  const [jumlah, setJumlah] = useState<number | null>(null);
  const [pmlNama, setPmlNama] = useState<string | null>(null);
  const [pmlNoHp, setPmlNoHp] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  // "selesai_share" (JALUR 1, Web Share API) vs "selesai_salin" (JALUR 2,
  // fallback clipboard) DIBEDAKAN krn pesan sukses ke user beda -- lihat
  // kirimKeWaPml & label tombol di bawah.
  const [kirimStatus, setKirimStatus] = useState<
    "idle" | "menyiapkan" | "selesai_share" | "selesai_salin" | "error"
  >("idle");
  // Modal "📅 Dijadwalkan Besok" (komponen ASLI yg sama dgn StatTile di tab
  // Penyisiran Usaha, diimpor -- BUKAN diduplikasi) -- SEKARANG ikut dibuka
  // saat tombol "Kirim ke WA" ditekan (permintaan user: "keluar modalnya yg
  // di atas, karena gambar itu lebih bagus"), supaya petugas bisa LIHAT
  // dulu daftarnya sebelum/sambil gambar disalin & tab WA terbuka.
  const [showModal, setShowModal] = useState(false);
  const gambarRef = useRef<HTMLDivElement | null>(null);
  // Baris utk gambar off-screen -- SENGAJA dimuat bersamaan dgn `jumlah`
  // (poll periodik yg sama, lihat muatRingkasan di bawah), BUKAN baru
  // di-fetch saat tombol "Kirim ke WA" ditekan -- supaya gambarRef SUDAH
  // ter-render duluan & html2canvas bisa langsung dipanggil synchronous
  // dari klik tombol, tanpa race condition menunggu fetch+render selesai.
  // Tipe baris & tanggal SEKARANG SAMA PERSIS dgn ModalRencanaBesok
  // (RencanaBesokRow, bukan bentuk ringkas {kode_identitas,idsubsls,nama}
  // spt sebelumnya) -- permintaan user: desain gambar WA harus SAMA PERSIS
  // dgn gambar di modal itu (ada subjudul Nagari/SLS di bawah nama tiap
  // baris), makanya komponen tabelnya (TabelRencanaBesokHead/Row) diimpor
  // LANGSUNG dari sana, bukan ditulis ulang.
  const [rowsUntukGambar, setRowsUntukGambar] = useState<RencanaBesokRow[]>([]);
  const [tanggalRencana, setTanggalRencana] = useState<string | null>(null);

  useEffect(() => {
    function bacaStorage() {
      setToken(getToken());
      setIsPml(typeof window !== "undefined" && localStorage.getItem(IS_PML_KEY) === "1");
      setChecked(true);
    }
    bacaStorage();
    const id = setInterval(bacaStorage, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const muatRingkasan = useCallback(() => {
    if (!token || isPml) {
      setJumlah(null);
      return;
    }
    apiFetch("/api/penyisiran/summary", token)
      .then((data) => {
        setJumlah(typeof data?.direncanakan_besok === "number" ? data.direncanakan_besok : null);
        setPmlNama(typeof data?.pml_nama === "string" ? data.pml_nama : null);
        setPmlNoHp(typeof data?.pml_no_hp === "string" ? data.pml_no_hp : null);
      })
      .catch(() => {
        setJumlah(null);
      });
    apiFetch("/api/penyisiran/rencana-besok", token)
      .then((data) => {
        setRowsUntukGambar(Array.isArray(data?.rows) ? data.rows : []);
        setTanggalRencana(typeof data?.tanggal === "string" ? data.tanggal : null);
      })
      .catch(() => {
        setRowsUntukGambar([]);
        setTanggalRencana(null);
      });
  }, [token, isPml]);

  // SAMA PERSIS dgn tanggalLabel() di ModalRencanaBesok (app/seruti/
  // penyisiran-usaha.tsx) -- diulang di sini (bukan diekspor, cuma beberapa
  // baris) supaya judul gambar off-screen di bawah konsisten formatnya.
  function tanggalLabel(): string {
    if (!tanggalRencana) return "besok";
    const [y, m, d] = tanggalRencana.split("-").map(Number);
    if (!y || !m || !d) return tanggalRencana;
    return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  }

  useEffect(() => {
    muatRingkasan();
    const id = setInterval(muatRingkasan, 30000);
    return () => clearInterval(id);
  }, [muatRingkasan]);

  // Dengar event real-time dari RowCard -- lihat komentar panjang di atas.
  useEffect(() => {
    window.addEventListener("penyisiran:rencana-besok-changed", muatRingkasan);
    return () => window.removeEventListener("penyisiran:rencana-besok-changed", muatRingkasan);
  }, [muatRingkasan]);

  function nomorWaInternasional(raw: string): string {
    const digit = raw.replace(/\D/g, "");
    if (digit.startsWith("62")) return digit;
    if (digit.startsWith("0")) return `62${digit.slice(1)}`;
    return digit;
  }

  async function kirimKeWaPml() {
    // Buka modal ASLI "📅 Dijadwalkan Besok" sekalian (permintaan user) --
    // TIDAK menunggu ini selesai sebelum lanjut menyiapkan gambar (dua-duanya
    // jalan bersamaan: modal utk dilihat, share/clipboard+tab WA di bawah).
    setShowModal(true);
    if (!gambarRef.current) return;
    setKirimStatus("menyiapkan");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(gambarRef.current, { backgroundColor: "#ffffff", scale: 2 });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        setKirimStatus("error");
        setTimeout(() => setKirimStatus("idle"), 2500);
        return;
      }

      // Rakit nama file gambar sekali di sini (dipakai JALUR 1 di bawah).

      // JALUR 1 (lebih baik, tapi cuma didukung browser HP): Web Share API
      // dgn file gambar -- lihat komentar panjang di atas komponen ini soal
      // kenapa ini bikin pengalamannya SAMA spt share bukti tf dari BRImo,
      // & kenapa WhatsApp TETAP minta pilih chat sendiri (bukan kurangnya
      // implementasi di sini). navigator.canShare dicek dulu krn beberapa
      // browser PUNYA navigator.share tapi TIDAK mendukung { files }.
      const file = new File([blob], `rencana-besok-${tanggalRencana || "besok"}.png`, { type: "image/png" });
      const dukungShareFile =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (dukungShareFile) {
        try {
          await navigator.share({ files: [file], title: `Rencana Kunjungan ${tanggalLabel()}` });
          setKirimStatus("selesai_share");
          setTimeout(() => setKirimStatus("idle"), 4000);
          return;
        } catch (err) {
          // User menekan "Batal" di layar Share bawaan HP -- BUKAN error,
          // hormati pembatalan itu, JANGAN lanjut ke jalur 2 (nanti malah
          // tetap buka tab WA padahal user memang tidak jadi kirim).
          if (err instanceof Error && err.name === "AbortError") {
            setKirimStatus("idle");
            return;
          }
          // Gagal karena sebab lain (jarang) -> lanjut ke JALUR 2 di bawah.
        }
      }

      // JALUR 2 (fallback -- desktop, atau Web Share API gagal): cara LAMA,
      // salin gambar ke clipboard + buka tab WA ke nomor PML. Tab WA tetap
      // dibuka meski clipboard gagal -- user tinggal pakai tombol "Salin
      // sebagai Gambar" di modal 📅 Dijadwalkan Besok sbg cadangan.
      let disalin = false;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        disalin = true;
      } catch {
        disalin = false;
      }
      if (pmlNoHp) {
        const nomor = nomorWaInternasional(pmlNoHp);
        window.open(`https://wa.me/${nomor}`, "_blank", "noopener,noreferrer");
      }

      setKirimStatus(disalin ? "selesai_salin" : "error");
      setTimeout(() => setKirimStatus("idle"), 4000);
    } catch {
      setKirimStatus("error");
      setTimeout(() => setKirimStatus("idle"), 2500);
    }
  }

  if (!checked || !token || isPml || jumlah == null) return null;

  const jamSekarang = new Date(nowMs).getHours();
  if (jamSekarang < 17) return null;

  const pct = jumlah / KUOTA;
  // Latar bar SOLID PUTIH (permintaan user) -- warna status (hijau/kuning/
  // merah) SEBELUMNYA ada di latar bar penuh, sekarang dipindah ke teks/
  // ikon supaya tetap kelihatan status-nya tanpa latar berwarna.
  const warnaTeks = pct >= 1 ? "text-moss-700" : pct >= 0.5 ? "text-[#8A6A12]" : "text-rust-700";

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line bg-white px-4 py-2 text-center text-xs font-medium shadow-md">
      <span className={`font-semibold ${warnaTeks}`}>
        📅 Rencana Besok: {jumlah}/{KUOTA}
      </span>
      {pmlNoHp ? (
        <button
          type="button"
          onClick={kirimKeWaPml}
          disabled={kirimStatus === "menyiapkan"}
          className="shrink-0 rounded-md bg-navy-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
        >
          {kirimStatus === "menyiapkan"
            ? "Menyiapkan..."
            : kirimStatus === "selesai_share"
            ? "✓ Dibagikan -- pilih chat WA & tekan Kirim"
            : kirimStatus === "selesai_salin"
            ? "✓ Tersalin -- tempel (Ctrl+V) di WA"
            : kirimStatus === "error"
            ? "Gagal, coba lagi"
            : `📤 Kirim ke WA ${pmlNama ?? "PML"}`}
        </button>
      ) : (
        <span className="text-[10px] italic text-ink/40">
          (Nomor WA PML belum diisi di Master Petugas)
        </span>
      )}

      {/* Klon tersembunyi off-screen utk html2canvas -- diisi
          `rowsUntukGambar` (dipoll bersamaan dgn `jumlah`, lihat
          muatRingkasan di atas, supaya SUDAH ter-render duluan saat
          tombol "Kirim ke WA" ditekan). Markup tabel (judul + head + baris)
          SEKARANG memakai komponen ASLI yg SAMA dgn ModalRencanaBesok
          (TabelRencanaBesokHead/TabelRencanaBesokRow, diimpor) -- permintaan
          user, supaya desain gambarnya PERSIS sama (ada subjudul Nagari/SLS
          di bawah nama tiap baris), bukan versi ringkas terpisah spt
          sebelumnya. */}
      <div style={{ position: "fixed", top: -99999, left: -99999, width: 640 }}>
        <div ref={gambarRef} className="bg-white p-4">
          <p className="mb-2 text-sm font-bold text-navy-900">
            Rencana Kunjungan {tanggalLabel()} -- Penyisiran Undercoverage Usaha SE2026
          </p>
          <table className="w-full text-xs">
            <TabelRencanaBesokHead />
            <tbody>
              {rowsUntukGambar.map((r) => (
                <TabelRencanaBesokRow key={r.kode_identitas} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal ASLI "📅 Dijadwalkan Besok" -- ikut terbuka begitu tombol
          "Kirim ke WA" ditekan (lihat kirimKeWaPml), supaya petugas bisa
          lihat daftarnya jg (bukan cuma tersalin diam2 ke clipboard). Modal
          ini fetch data sendiri (independen dari rowsUntukGambar di atas). */}
      {showModal && (
        <ModalRencanaBesok
          token={token}
          onClose={() => setShowModal(false)}
          onSessionExpired={() => setToken(null)}
        />
      )}
    </div>
  );
}

// Bar KUNING BARU (permintaan user), diletakkan DI BAWAH FloatBarRencanaBesok
// di atas (lihat wrapper fixed+flex-col di PenyisiranPage) -- pengingat
// "SPJ hari ini belum lengkap" utk petugas yg SEDANG LOGIN sendiri.
//  - Sumbernya field spj_ada_st_hari_ini/spj_laporan_ok/spj_dokumentasi_ok
//    dari /api/penyisiran/summary (lihat komentar panjang di
//    app/api/penyisiran/summary/route.ts) -- dihitung dari RPC
//    penyisiran_monitoring_kinerja_hari_ini() yg SAMA dipakai seksi
//    "Monitoring Kinerja PPL Hari Ini" (tab Monitoring), jadi definisi
//    "lengkap" (Laporan ada + Dokumentasi >=3 foto/hari) SELALU konsisten
//    dgn yg dilihat pengelola.
//  - TIDAK tampil kalau petugas belum punya Surat Tugas yg mencakup hari
//    ini (spj_ada_st_hari_ini false) -- memang tidak ada kewajiban SPJ hari
//    itu, bukan berarti "sudah lengkap".
//  - SENGAJA TIDAK dibatasi jam 17:00 spt FloatBarRencanaBesok (bar itu soal
//    rencana BESOK, jadi wajar baru relevan sore; bar ini soal SPJ HARI INI
//    yg bisa/boleh diisi kapan saja sepanjang hari) -- tampil sepanjang hari
//    selama masih ada bagian yg kurang, padam otomatis begitu Laporan &
//    Dokumentasi hari ini sudah lengkap.
//  - Tombol "Isi di Administrasi →" langsung memindahkan tab aktif ke
//    "Administrasi" (tab "spj") lewat prop onBukaAdministrasi, supaya
//    petugas tidak perlu cari sendiri tab mana yg dituju.
function FloatBarSpjBelumLengkap({ onBukaAdministrasi }: { onBukaAdministrasi: () => void }) {
  const [checked, setChecked] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [isPml, setIsPml] = useState(false);
  const [adaSt, setAdaSt] = useState(false);
  const [laporanOk, setLaporanOk] = useState<boolean | null>(null);
  const [dokumentasiOk, setDokumentasiOk] = useState<boolean | null>(null);

  useEffect(() => {
    function bacaStorage() {
      setToken(getToken());
      setIsPml(typeof window !== "undefined" && localStorage.getItem(IS_PML_KEY) === "1");
      setChecked(true);
    }
    bacaStorage();
    const id = setInterval(bacaStorage, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!token || isPml) {
      setAdaSt(false);
      setLaporanOk(null);
      setDokumentasiOk(null);
      return;
    }
    let batal = false;
    function muat() {
      apiFetch("/api/penyisiran/summary", token as string)
        .then((data) => {
          if (batal) return;
          setAdaSt(!!data?.spj_ada_st_hari_ini);
          setLaporanOk(typeof data?.spj_laporan_ok === "boolean" ? data.spj_laporan_ok : null);
          setDokumentasiOk(typeof data?.spj_dokumentasi_ok === "boolean" ? data.spj_dokumentasi_ok : null);
        })
        .catch(() => {
          if (!batal) {
            setAdaSt(false);
            setLaporanOk(null);
            setDokumentasiOk(null);
          }
        });
    }
    muat();
    const id = setInterval(muat, 120000);
    return () => {
      batal = true;
      clearInterval(id);
    };
  }, [token, isPml]);

  if (!checked || !token || isPml || !adaSt) return null;
  if (laporanOk && dokumentasiOk) return null;

  const kurang = [!laporanOk ? "Laporan" : null, !dokumentasiOk ? "Dokumentasi (min. 3 foto)" : null].filter(
    Boolean
  );

  return (
    // Latar bar SOLID PUTIH (permintaan user, sama spt FloatBarRencanaBesok
    // di atas) -- warna kuning (permintaan awal) dipindah ke teks/ikon &
    // tombol, bukan lagi ke latar bar penuh.
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line bg-white px-4 py-2 text-center text-xs font-medium shadow-md">
      <span className="font-semibold text-[#8A6A12]">
        ⚠ SPJ hari ini belum lengkap: {kurang.join(" & ")} belum diisi.
      </span>
      <button
        type="button"
        onClick={onBukaAdministrasi}
        className="shrink-0 rounded-md bg-[#CA8A04] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#A9720A]"
      >
        Isi di Administrasi →
      </button>
    </div>
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
      type="button"
      onClick={onClick}
      className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition ${
        active ? "border-navy-700 text-navy-900" : "border-transparent text-ink/50 hover:text-navy-700"
      }`}
    >
      {children}
    </button>
  );
}
