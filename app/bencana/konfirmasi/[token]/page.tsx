"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import BuatAkunPanel from "../../undangan/BuatAkunPanel";
import ModalSelesaikan from "../../undangan/ModalSelesaikan";
import BrandBps from "@/app/components/BrandBps";

// ------------------------------------------------------------------------
// Halaman publik (tanpa login): "Konfirmasi Kesediaan Ikut Pendataan
// Bencana" utk mitra/petugas yg SUDAH di-plot ke Sub SLS di tab "Alokasi
// Petugas" (Langkah 4). Diakses lewat link unik per petugas
// (/bencana/konfirmasi/<token>), dibagikan lewat tombol "📋 Salin Link
// Konfirmasi" pada kartu "Mitra Perlu Dihubungi" di admin.
//
// (4 Okt 2026) Tampilan DIROMBAK mengikuti desain "Alternatif A · Ringkas
// 2 langkah" (artifact desain konfirmasi kesediaan): header biru + strip
// ringkasan (Pelatihan / Pendataan / Wilayah) + kartu2 bernomor. Bedanya
// dgn desain awal, atas permintaan user:
//   1. Tanggal pelatihan = CHECKBOX, kedua tanggal (7 & 8 Okt 2026)
//      OTOMATIS TERCENTANG. Pelatihan cuma 1 hari di SALAH SATU tanggal itu
//      -- petugas cukup melepas centang tanggal yg TIDAK bisa dihadiri.
//   2. Ada langkah baru "Perkiraan hari kerja & libur" (kalender 10-31 Okt
//      2026): default semua hari kerja, petugas menandai hari yg libur.
//   3. Sesudah konfirmasi Bersedia, tampil tombol GABUNG GRUP WHATSAPP
//      (URL dikirim API hanya kalau status 'diterima').
// Logika lama (tolak + alasan, "Lengkapi Data Anda", wilayah kerja, ubah
// jawaban) TETAP sama.
// ------------------------------------------------------------------------

type WilayahKerjaRow = {
  idsubsls: string;
  kecamatan: string;
  nagari: string;
  sls: string;
  sub_sls: string;
  kk_total: number;
  kk_terdampak_estimasi: number;
  // (3 Okt 2026) true kalau estimasi 0 di atas BUKAN krn benar2 nol KK
  // terdampak, tapi krn mitra blm mengisi indikator dampak KK saat
  // Identifikasi Jorong -- lihat komentar route.ts.
  kk_terdampak_belum_lengkap: boolean;
  // (5 Okt 2026) sistem keroyokan: Sub SLS milik tim, bukan 1-1 ke PPL.
  milik_saya?: boolean;
  pemegang?: string[];
  jarak_rumah_km?: number | null;
  jarak_sumber?: "garis_lurus" | "alokasi" | null;
};

type KonfirmasiInfo = {
  tim?: { pml: string | null; anggota: string[] };
  lokasi_rumah_riil?: boolean;
  nama: string;
  status_kepegawaian: "organik" | "mitra";
  pendaftaran_bencana_konfirmasi: boolean;
  status_kontak_pendaftaran_bencana: "diterima" | "menolak" | null;
  catatan_penolakan_pendaftaran_bencana: string | null;
  // (4 Okt 2026) gabungan tanggal yg disanggupi, dipisah ", ".
  jadwal_pelatihan_dipilih: string | null;
  // (4 Okt 2026) tanggal YYYY-MM-DD yg diperkirakan libur; null = belum diisi.
  perkiraan_hari_libur: string[] | null;
  // (4 Okt 2026) hanya terisi kalau status 'diterima'.
  wa_group_url: string | null;
  // (4 Okt 2026) sudah membuat akun (PIN)? Grup WA baru tampil setelah akun ada.
  punya_akun: boolean;
  wilayah_kerja: WilayahKerjaRow[];
  // (3 Okt 2026) dipakai utk section "📝 Lengkapi Data Anda" -- lihat komentar
  // panjang di route.ts. FE hanya menampilkan field yg BENAR2 kosong,
  // berbeda per petugas ("tergantung orangnya" -- permintaan user).
  no_hp: string | null;
  lokasi_status: "riil" | "perkiraan_nagari" | "tanpa_data";
  umur: number | null;
  jenis_kelamin: "Lk" | "Pr" | null;
  pendidikan: string | null;
  pekerjaan: string | null;
  bisa_mengendarai_motor: boolean | null;
  punya_kendaraan_bermotor: boolean | null;
};

const PILIHAN_JADWAL = [
  { nilai: "7 Oktober 2026", hari: "Rabu", label: "7 Okt 2026" },
  { nilai: "8 Oktober 2026", hari: "Kamis", label: "8 Okt 2026" },
];

// Rentang pendataan lapangan 10-31 Oktober 2026 (SAMA dgn route.ts).
const HARI_SINGKAT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const TANGGAL_PENDATAAN = Array.from({ length: 22 }, (_, i) => {
  const d = 10 + i;
  const date = new Date(2026, 9, d);
  return {
    iso: `2026-10-${String(d).padStart(2, "0")}`,
    tgl: d,
    kolom: (date.getDay() + 6) % 7, // Senin = 0 ... Minggu = 6
  };
});
const ISO_MINGGU = TANGGAL_PENDATAAN.filter((t) => t.kolom === 6).map((t) => t.iso);

// (3 Okt 2026) SAMA persis dgn whitelist di route.ts -- lihat komentar di
// sana soal alasan nilai2 ini yg dipilih (konsisten dgn data rekrutmen mitra
// yg sudah ada).
const PILIHAN_PENDIDIKAN = [
  "Tamat SD/Sederajat",
  "Tamat SMP/Sederajat",
  "Tamat SMA/Sederajat",
  "Tamat D1/D2/D3",
  "Tamat D4/S1",
  "Tamat S2",
  "Tamat S3",
];
const PILIHAN_PEKERJAAN = [
  "Wiraswasta",
  "Mengurus Rumah Tangga",
  "Pelajar / Mahasiswa",
  "Kader PKK / Karang Taruna / Kader Lainnya",
  "Pegawai / Guru Honorer",
  "Aparat Desa / Kelurahan",
  "Lainnya",
];

const URL_KUESIONER = "/kuesioner-pendataan-bencana.pdf";
const KARTU = "rounded-[14px] bg-white p-4 shadow-sm";
const JUDUL_KARTU = "text-[17px] font-extrabold text-[#13213A]";
const INPUT_TEKS =
  "rounded-lg border border-[#D5DDE8] bg-white px-3 py-2 text-sm outline-none focus:border-[#0F3D7A]";

function NomorLangkah({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0F3D7A] text-sm font-extrabold text-white">
      {n}
    </span>
  );
}

export default function KonfirmasiKesediaanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);

  const [info, setInfo] = useState<KonfirmasiInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ubahJawaban, setUbahJawaban] = useState(false);
  // Setelah klik "Saya Bersedia", kartu status + tombol WA muncul di ATAS halaman;
  // layar otomatis digulir ke sana supaya petugas langsung melihatnya.
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [gulirKeBanner, setGulirKeBanner] = useState(false);
  // Modal "pastikan semua tahapan selesai" -- muncul begitu petugas menyatakan bersedia.
  const [modalSelesaikan, setModalSelesaikan] = useState(false);
  useEffect(() => {
    if (!gulirKeBanner) return;
    const t = setTimeout(() => {
      bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setGulirKeBanner(false);
    }, 120);
    return () => clearTimeout(t);
  }, [gulirKeBanner]);

  // (4 Okt 2026) Kedua tanggal pelatihan tercentang otomatis.
  const [jadwalDipilih, setJadwalDipilih] = useState<string[]>(PILIHAN_JADWAL.map((j) => j.nilai));
  // (4 Okt 2026) Tanggal2 yg ditandai LIBUR; default kosong = semua hari kerja.
  const [hariLibur, setHariLibur] = useState<string[]>([]);
  const [alasanTolak, setAlasanTolak] = useState("");
  const [modeTolak, setModeTolak] = useState(false);

  // ---- "📝 Lengkapi Data Anda" (3 Okt 2026) -----------------------------
  // Lokasi rumah (GPS) punya alur sendiri (sama pola dgn /bencana/lokasi/
  // [token]) krn perlu trigger Geolocation API browser, terpisah dari
  // field teks/pilihan lain yg disimpan lewat satu tombol "Simpan".
  const [lokasiBusy, setLokasiBusy] = useState(false);
  const [lokasiPesan, setLokasiPesan] = useState<string | null>(null);

  const [noHpInput, setNoHpInput] = useState("");
  const [umurInput, setUmurInput] = useState("");
  const [jkInput, setJkInput] = useState<"" | "Lk" | "Pr">("");
  const [pendidikanInput, setPendidikanInput] = useState("");
  const [pekerjaanInput, setPekerjaanInput] = useState("");
  const [motorInput, setMotorInput] = useState<"" | "ya" | "tidak">("");
  const [kendaraanInput, setKendaraanInput] = useState<"" | "ya" | "tidak">("");
  const [lengkapiBusy, setLengkapiBusy] = useState(false);
  const [lengkapiError, setLengkapiError] = useState<string | null>(null);

  async function muat() {
    try {
      const res = await fetch(`/api/bencana/konfirmasi/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json?.error ?? "Link tidak valid.");
      } else {
        const data: KonfirmasiInfo = json.data;
        setInfo(data);
        // Kalau sudah pernah menjawab, tampilkan pilihan sebelumnya; kalau
        // belum, biarkan default (kedua tanggal tercentang, semua hari kerja).
        if (data.jadwal_pelatihan_dipilih) {
          const tersimpan = data.jadwal_pelatihan_dipilih.split(",").map((s) => s.trim());
          const valid = PILIHAN_JADWAL.map((j) => j.nilai).filter((n) => tersimpan.includes(n));
          if (valid.length > 0) setJadwalDipilih(valid);
        }
        if (data.perkiraan_hari_libur) setHariLibur(data.perkiraan_hari_libur);
      }
    } catch {
      setLoadError("Gagal memuat data. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function toggleJadwal(nilai: string) {
    setJadwalDipilih((prev) => (prev.includes(nilai) ? prev.filter((n) => n !== nilai) : [...prev, nilai]));
  }

  function toggleLibur(iso: string) {
    setHariLibur((prev) => (prev.includes(iso) ? prev.filter((t) => t !== iso) : [...prev, iso]));
  }

  async function kirimJawaban(bersedia: boolean) {
    if (bersedia && jadwalDipilih.length === 0) {
      setError("Mohon centang minimal 1 tanggal pelatihan (7 dan/atau 8 Oktober 2026).");
      return;
    }
    if (!bersedia && !alasanTolak.trim()) {
      setError("Mohon isi alasan tidak bersedia.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bencana/konfirmasi/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          bersedia
            ? { bersedia: true, jadwal_pelatihan: jadwalDipilih, hari_libur: hariLibur }
            : { bersedia: false, alasan: alasanTolak.trim() }
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Gagal mengirim jawaban.");
      } else {
        setUbahJawaban(false);
        setModeTolak(false);
        await muat();
        if (bersedia) setModalSelesaikan(true);
      }
    } catch {
      setError("Gagal mengirim jawaban. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  function handleTetapkanLokasi() {
    if (!("geolocation" in navigator)) {
      setLokasiPesan("Browser ini tidak mendukung deteksi lokasi GPS.");
      return;
    }
    setLokasiBusy(true);
    setLokasiPesan(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/bencana/konfirmasi/${token}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          const json = await res.json();
          if (!res.ok) {
            setLokasiPesan(json?.error ?? "Gagal menyimpan lokasi.");
          } else {
            await muat();
          }
        } catch {
          setLokasiPesan("Gagal menyimpan lokasi. Periksa koneksi internet, lalu coba lagi.");
        } finally {
          setLokasiBusy(false);
        }
      },
      (err) => {
        setLokasiBusy(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLokasiPesan("Izin lokasi ditolak. Aktifkan izin lokasi utk browser ini, lalu coba lagi.");
        } else {
          setLokasiPesan("Gagal mendeteksi lokasi GPS. Pastikan GPS aktif, lalu coba lagi.");
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  async function simpanLengkapiData() {
    const body: Record<string, unknown> = {};
    if (noHpInput.trim()) body.no_hp = noHpInput.trim();
    if (umurInput.trim()) body.umur = Number(umurInput);
    if (jkInput) body.jenis_kelamin = jkInput;
    if (pendidikanInput) body.pendidikan = pendidikanInput;
    if (pekerjaanInput) body.pekerjaan = pekerjaanInput;
    if (motorInput) body.bisa_mengendarai_motor = motorInput === "ya";
    if (kendaraanInput) body.punya_kendaraan_bermotor = kendaraanInput === "ya";

    if (Object.keys(body).length === 0) {
      setLengkapiError("Isi dulu salah satu kolom di atas sebelum menyimpan.");
      return;
    }

    setLengkapiBusy(true);
    setLengkapiError(null);
    try {
      const res = await fetch(`/api/bencana/konfirmasi/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setLengkapiError(json?.error ?? "Gagal menyimpan data.");
      } else {
        setNoHpInput("");
        setUmurInput("");
        setJkInput("");
        setPendidikanInput("");
        setPekerjaanInput("");
        setMotorInput("");
        setKendaraanInput("");
        await muat();
      }
    } catch {
      setLengkapiError("Gagal menyimpan data. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setLengkapiBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F1F4F8] px-6">
        <p className="text-[#55657D]">Memuat...</p>
      </main>
    );
  }

  if (loadError || !info) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16 text-center">
        <p className="rounded-md bg-rust-100 px-4 py-3 text-rust-700">{loadError ?? "Link tidak ditemukan."}</p>
      </main>
    );
  }

  const sudahJawab = info.status_kontak_pendaftaran_bencana !== null;
  const tampilkanForm = !sudahJawab || ubahJawaban;
  const diterima = info.status_kontak_pendaftaran_bencana === "diterima";
  const totalKkTerdampak = info.wilayah_kerja.reduce((n, r) => n + r.kk_terdampak_estimasi, 0);
  const adaYangBelumLengkap = info.wilayah_kerja.some((r) => r.kk_terdampak_belum_lengkap);
  const jumlahHariLibur = hariLibur.length;
  const jumlahHariKerja = TANGGAL_PENDATAAN.length - jumlahHariLibur;
  const ringkasPelatihan =
    jadwalDipilih.length === PILIHAN_JADWAL.length
      ? "7 / 8 Okt"
      : jadwalDipilih.length === 1
      ? PILIHAN_JADWAL.find((j) => j.nilai === jadwalDipilih[0])?.label.replace(" 2026", "") ?? "7 / 8 Okt"
      : "7 / 8 Okt";

  // ---- "📝 Lengkapi Data Anda" -- cuma tawarkan field yg BENAR2 kosong,
  // beda per petugas ("tergantung orangnya"). Field demografi (umur, jenis
  // kelamin, pendidikan, pekerjaan, kendaraan) hanya ditawarkan utk mitra --
  // utk petugas organik (BPS) field2 ini memang bukan bagian data yg
  // dikumpulkan saat rekrutmen (lihat komentar route.ts), bukan "kosong".
  const isMitra = info.status_kepegawaian === "mitra";
  const perluLokasi = info.lokasi_status !== "riil";
  const perluNoHp = !info.no_hp;
  const perluUmur = isMitra && info.umur == null;
  const perluJk = isMitra && !info.jenis_kelamin;
  const perluPendidikan = isMitra && !info.pendidikan;
  const perluPekerjaan = isMitra && !info.pekerjaan;
  const perluMotor = isMitra && info.bisa_mengendarai_motor == null;
  const perluKendaraan = isMitra && info.punya_kendaraan_bermotor == null;
  const perluFormTeks = perluNoHp || perluUmur || perluJk || perluPendidikan || perluPekerjaan || perluMotor || perluKendaraan;
  const adaDataBelumLengkap = perluLokasi || perluFormTeks;

  return (
    <main
      className="min-h-screen bg-[#F1F4F8] pb-10 text-[#13213A]"
      style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
    >
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      {modalSelesaikan && !info.punya_akun && (
        <ModalSelesaikan nama={info.nama} onOk={() => setModalSelesaikan(false)} />
      )}

      <div className="mx-auto max-w-lg">
        {/* ===== HEADER ===== */}
        <header className="flex flex-col gap-3.5 bg-[#0F3D7A] px-5 pb-11 pt-[22px] text-white">
          <div className="flex items-center justify-between">
            <BrandBps className="min-w-0" teksClassName="text-[13px] font-bold leading-tight tracking-wide" ukuran={30} kotakPutih />
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">Undangan Petugas</span>
          </div>
          <h1 className="text-[25px] font-extrabold leading-tight">Konfirmasi Kesediaan Petugas Pendataan Pascabencana</h1>
          <p className="text-sm leading-relaxed text-[#DCE6F5]">
            Halo, <strong className="text-white">{info.nama}</strong>. Anda ditawari menjadi petugas pendataan KK
            terdampak bencana hidrometeorologi. Cukup 3 langkah: pilih tanggal pelatihan, tandai perkiraan hari kerja
            &amp; libur, lalu konfirmasi.
          </p>
        </header>

        {/* ===== STRIP RINGKASAN ===== */}
        <div className="-mt-[26px] mx-4 grid grid-cols-3 rounded-[14px] bg-white px-1.5 py-3.5 shadow-md">
          <div className="flex flex-col items-center gap-0.5 border-r border-[#E4E9F0]">
            <span className="text-[11px] font-semibold text-[#55657D]">Pelatihan</span>
            <span className="text-sm font-extrabold">{ringkasPelatihan}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 border-r border-[#E4E9F0]">
            <span className="text-[11px] font-semibold text-[#55657D]">Pendataan</span>
            <span className="text-sm font-extrabold">10–31 Okt</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] font-semibold text-[#55657D]">Wilayah</span>
            <span className="text-sm font-extrabold">{info.wilayah_kerja.length} Sub SLS</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {/* ===== STATUS JAWABAN (kalau sudah menjawab) ===== */}
          {sudahJawab && !ubahJawaban && (
            <div
              ref={bannerRef}
              className={`scroll-mt-4 rounded-[14px] border p-4 text-sm ${
                diterima ? "border-[#CFE3D7] bg-[#F1FAF5] text-[#1E5E3C]" : "border-rust-200 bg-rust-50 text-rust-700"
              }`}
            >
              {diterima ? (
                <>
                  <p className="text-[17px] font-extrabold">✓ Terima kasih, kesediaan Anda tercatat</p>
                  <p className="mt-1.5 leading-relaxed">
                    Tanggal pelatihan yang Anda sanggupi: <b>{info.jadwal_pelatihan_dipilih}</b>. Pelatihan hanya 1 hari
                    di salah satu tanggal tersebut. Perkiraan hari kerja {jumlahHariKerja} hari, libur {jumlahHariLibur}{" "}
                    hari (10–31 Okt 2026), minimal 5 jam kerja per hari.
                  </p>
                </>
              ) : (
                <>
                  Anda sudah mengonfirmasi <b>TIDAK BERSEDIA</b> ikut pendataan ini.
                  {info.catatan_penolakan_pendaftaran_bencana && (
                    <> Alasan: &ldquo;{info.catatan_penolakan_pendaftaran_bencana}&rdquo;</>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => setUbahJawaban(true)}
                className="mt-3 block text-sm font-bold text-[#0F3D7A] underline"
              >
                Ubah jawaban
              </button>
            </div>
          )}

          {/* ===== BUAT AKUN (setelah bersedia) -- grup WA baru terbuka setelah akun dibuat ===== */}
          {diterima && !ubahJawaban && (
            <BuatAkunPanel
              jenis="biasa"
              token={token}
              nama={info.nama}
              punyaAkun={info.punya_akun}
              waUrl={info.wa_group_url}
              onSelesai={muat}
            />
          )}

          {/* ===== LANGKAH 1: TANGGAL PELATIHAN (CHECKBOX) ===== */}
          <section className={`${KARTU} flex flex-col gap-3.5`}>
            <div className="flex items-center gap-2.5">
              <NomorLangkah n={1} />
              <h2 className={`${JUDUL_KARTU} flex-1`}>Pilih tanggal pelatihan</h2>
              <span className="rounded-md bg-[#FEF3E2] px-2 py-1 text-[11px] font-bold text-[#B45309]">Wajib</span>
            </div>

            <div className="rounded-lg bg-[#EAF1FB] px-3 py-2.5 text-[13px] leading-relaxed text-[#0F3D7A]">
              <b>Pelatihan hanya 1 hari di salah satu tanggal ini.</b> Kedua tanggal sudah tercentang otomatis -- lepas
              centang pada tanggal yang <b>tidak bisa</b> Anda hadiri.
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {PILIHAN_JADWAL.map((j) => {
                const aktif = jadwalDipilih.includes(j.nilai);
                return (
                  <label
                    key={j.nilai}
                    className={`flex min-h-[64px] items-center gap-2.5 rounded-xl border-2 p-3 ${
                      tampilkanForm ? "cursor-pointer" : "cursor-default opacity-80"
                    } ${aktif ? "border-[#0F3D7A] bg-[#EAF1FB]" : "border-[#D5DDE8] bg-white"}`}
                  >
                    <input
                      type="checkbox"
                      checked={aktif}
                      disabled={!tampilkanForm}
                      onChange={() => toggleJadwal(j.nilai)}
                      className="h-5 w-5 shrink-0 accent-[#0F3D7A]"
                    />
                    <span className="flex flex-col">
                      <span className="text-xs font-semibold text-[#55657D]">{j.hari}</span>
                      <span className="text-[15px] font-extrabold">{j.label}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {tampilkanForm && jadwalDipilih.length === 0 && (
              <p className="text-xs font-semibold text-rust-700">Centang minimal 1 tanggal untuk bisa melanjutkan.</p>
            )}

            <div className="flex flex-col gap-2 border-t border-[#EEF1F5] pt-3 text-sm">
              <div className="flex items-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#55657D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
                <span>Mami Hotel Kota Solok</span>
              </div>
              <div className="flex items-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#55657D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <span>08.00 – 17.00 WIB</span>
              </div>
            </div>
          </section>

          {/* ===== LANGKAH 2: PERKIRAAN HARI KERJA & LIBUR ===== */}
          <section className={`${KARTU} flex flex-col gap-3`}>
            <div className="flex items-center gap-2.5">
              <NomorLangkah n={2} />
              <h2 className={`${JUDUL_KARTU} flex-1`}>Perkiraan hari kerja &amp; libur</h2>
            </div>
            <p className="text-[13px] leading-relaxed text-[#44546C]">
              Pendataan lapangan <b>10 – 31 Oktober 2026</b>. Semua tanggal sudah ditandai <b>hari kerja</b> -- ketuk
              tanggal yang <b>libur</b> (tidak bisa mendata) untuk menandainya. Ini hanya perkiraan awal, boleh berubah
              nanti.
            </p>
            <p className="rounded-lg bg-[#EAF1FB] px-3 py-2 text-[13px] font-semibold leading-relaxed text-[#0F3D7A]">
              Setiap hari kerja diperkirakan <b>minimal 5 jam kerja per hari</b>.
            </p>

            <div className="grid grid-cols-7 gap-1.5 text-center">
              {HARI_SINGKAT.map((h) => (
                <span key={h} className="text-[11px] font-bold text-[#55657D]">
                  {h}
                </span>
              ))}
              {Array.from({ length: TANGGAL_PENDATAAN[0].kolom }).map((_, i) => (
                <span key={`kosong-${i}`} aria-hidden="true" />
              ))}
              {TANGGAL_PENDATAAN.map((t) => {
                const libur = hariLibur.includes(t.iso);
                return (
                  <button
                    key={t.iso}
                    type="button"
                    aria-pressed={libur}
                    aria-label={`${t.tgl} Oktober 2026, ${libur ? "libur" : "hari kerja"}`}
                    disabled={!tampilkanForm}
                    onClick={() => toggleLibur(t.iso)}
                    className={`flex h-11 items-center justify-center rounded-lg border-2 text-sm font-extrabold ${
                      libur
                        ? "border-[#E0605A] bg-[#FDE8E6] text-[#C0392B] line-through"
                        : "border-[#0F3D7A] bg-[#EAF1FB] text-[#0F3D7A]"
                    } ${tampilkanForm ? "cursor-pointer" : "cursor-default"}`}
                  >
                    {t.tgl}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#55657D]">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border-2 border-[#0F3D7A] bg-[#EAF1FB]" /> Hari kerja
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm border-2 border-[#E0605A] bg-[#FDE8E6]" /> Libur (merah, dicoret)
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[#F6F8FB] px-3 py-2.5 text-sm">
              <span>
                <b className="text-[#0F3D7A]">{jumlahHariKerja}</b> hari kerja (min. 5 jam/hari)
              </span>
              <span>
                <b className="text-[#C0392B]">{jumlahHariLibur}</b> hari libur
              </span>
            </div>

            {tampilkanForm && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setHariLibur([])}
                  className="rounded-full border border-[#D5DDE8] bg-white px-3 py-1.5 text-xs font-bold text-[#0F3D7A] hover:bg-[#F6F8FB]"
                >
                  Semua hari kerja
                </button>
                <button
                  type="button"
                  onClick={() => setHariLibur(ISO_MINGGU)}
                  className="rounded-full border border-[#D5DDE8] bg-white px-3 py-1.5 text-xs font-bold text-[#0F3D7A] hover:bg-[#F6F8FB]"
                >
                  Tandai hari Minggu libur
                </button>
              </div>
            )}
          </section>

          {/* ===== PERKIRAAN WILAYAH KERJA ===== */}
          <section className={`${KARTU} flex flex-col gap-3`}>
            <div className="flex items-baseline justify-between">
              <h2 className={JUDUL_KARTU}>Wilayah kerja tim</h2>
              <span className="text-xs font-bold text-[#55657D]">{info.wilayah_kerja.length} Sub SLS</span>
            </div>
            {info.wilayah_kerja.length === 0 ? (
              <p className="text-sm text-[#55657D]">
                Wilayah kerja Anda belum ditetapkan admin. Informasi ini akan diperbarui begitu wilayah kerja sudah
                diplot.
              </p>
            ) : (
              <>
                <div
                  role="note"
                  className="flex items-start gap-2.5 rounded-xl border-2 border-[#F59E0B] bg-[#FEF3E2] px-3.5 py-3 text-[#7A3E06]"
                >
                  <span aria-hidden className="mt-0.5 text-lg leading-none">⚠️</span>
                  <p className="text-[13px] font-extrabold uppercase leading-snug tracking-wide">
                    Alokasi ini hanya perkiraan, dapat bergeser sesuai dengan temuan kondisi riil saat pendataan
                  </p>
                </div>
                {info.tim && (info.tim.pml || info.tim.anggota.length > 0) && (
                  <div className="rounded-xl border border-[#D5DDE8] bg-[#F6F8FB] px-3.5 py-3 text-[13px] leading-relaxed text-[#1F2D44]">
                    <p className="font-bold text-[#0F3D7A]">Anda bekerja dalam tim (sistem keroyokan)</p>
                    <p>
                      Wilayah di bawah adalah <strong>seluruh Sub SLS sampel milik tim</strong>, bukan hanya satu wilayah per
                      petugas. Pembagian kerja di lapangan diatur bersama dalam tim.
                    </p>
                    {info.tim.pml && (
                      <p className="mt-1">
                        <span className="text-[#55657D]">PML:</span> {info.tim.pml}
                      </p>
                    )}
                    {info.tim.anggota.length > 0 && (
                      <p>
                        <span className="text-[#55657D]">Anggota PPL:</span> {info.tim.anggota.join(", ")}
                      </p>
                    )}
                    {info.lokasi_rumah_riil === false && (
                      <p className="mt-1 text-[#B45309]">
                        Lokasi rumah Anda belum tercatat, sehingga jarak dari rumah belum bisa dihitung untuk semua wilayah.
                        Lengkapi lokasi rumah pada bagian “Lengkapi Data Anda”.
                      </p>
                    )}
                  </div>
                )}
                {info.wilayah_kerja.map((r, i) => (
                  <div key={r.idsubsls} className="flex items-center gap-3 rounded-[10px] bg-[#F6F8FB] p-3">
                    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#E3EBF6] text-[13px] font-extrabold text-[#0F3D7A]">
                      {i + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-bold">{r.sls}</span>
                      <span className="text-xs text-[#55657D]">
                        Nagari {r.nagari} · Kec. {r.kecamatan}
                      </span>
                      <span className="text-[11px] font-semibold text-[#0F3D7A]">
                        {typeof r.jarak_rumah_km === "number"
                          ? `📍 ± ${r.jarak_rumah_km.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km dari rumah Anda${r.jarak_sumber === "garis_lurus" ? " (garis lurus)" : ""}`
                          : "📍 Jarak dari rumah belum tersedia"}
                      </span>
                      {r.pemegang && r.pemegang.length > 0 && (
                        <span className="text-[11px] text-[#55657D]">
                          {r.milik_saya ? "Wilayah awal Anda" : `Wilayah awal: ${r.pemegang.join(", ")}`}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[15px] font-extrabold">{r.kk_total.toLocaleString("id-ID")} KK</span>
                      {r.kk_terdampak_belum_lengkap ? (
                        <span
                          className="text-[11px] font-bold text-[#B45309]"
                          title="Mitra belum mengisi perkiraan jumlah KK terdampak untuk Jorong ini saat identifikasi."
                        >
                          Data belum lengkap
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-[#B45309]">
                          {r.kk_terdampak_estimasi.toLocaleString("id-ID")} terdampak
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-xs leading-relaxed text-[#55657D]">
                  Angka di atas merupakan perkiraan awal (perkiraan total {totalKkTerdampak.toLocaleString("id-ID")} KK
                  terdampak).
                  {adaYangBelumLengkap &&
                    " “Data belum lengkap” artinya wilayah ini sudah tercatat terdampak, tapi mitra yang melakukan identifikasi belum mengisi perkiraan jumlah KK terdampak -- bukan berarti wilayah ini tidak ada KK terdampak."}
                </p>
              </>
            )}
          </section>

          {/* ===== TUGAS ANDA ===== */}
          <section className={`${KARTU} flex flex-col gap-3.5`}>
            <h2 className={JUDUL_KARTU}>Tugas Anda</h2>
            {[
              {
                ikon: <path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5" />,
                teks: (
                  <>
                    Mendata <strong>seluruh KK terdampak</strong> bencana hidrometeorologi tahun 2025 di wilayah tugas.
                  </>
                ),
              },
              {
                ikon: (
                  <>
                    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                    <path d="M11 18h2" />
                  </>
                ),
                teks: (
                  <>
                    Pendataan menggunakan aplikasi <strong>FASIH Mobile</strong>.
                  </>
                ),
              },
              {
                ikon: (
                  <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </>
                ),
                teks: (
                  <>
                    Bekerja <strong>5–7 jam kerja per hari</strong>.
                  </>
                ),
              },
              {
                ikon: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />,
                teks: (
                  <>
                    Pelajari <strong>kuesioner pendataan</strong> lebih dulu (lihat kartu Kuesioner di bawah); pembahasan
                    pengisian dilakukan saat pelatihan.
                  </>
                ),
              },
            ].map((t, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#FEF3E2]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {t.ikon}
                  </svg>
                </span>
                <p className="text-sm leading-relaxed">{t.teks}</p>
              </div>
            ))}
          </section>

          {/* ===== KUESIONER ===== */}
          <section className={`${KARTU} flex flex-col gap-3`}>
            <h2 className={JUDUL_KARTU}>Kuesioner Pendataan</h2>
            <p className="text-[13px] leading-relaxed text-[#44546C]">
              Kuesioner Pendataan Daerah Terdampak Bencana ABT Sumatera 2026 (Keluarga). Silakan dibaca lebih dulu
              supaya lebih siap saat pelatihan.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={URL_KUESIONER}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#0F3D7A] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#0B2F5F]"
              >
                Buka Kuesioner (PDF)
              </a>
              <a
                href={URL_KUESIONER}
                download="Kuesioner Pendataan Daerah Terdampak Bencana ABT Sumatera 2026 - Keluarga.pdf"
                className="flex min-h-[44px] items-center justify-center rounded-xl border-2 border-[#0F3D7A] bg-white px-4 py-2.5 text-sm font-extrabold text-[#0F3D7A] hover:bg-[#EAF1FB]"
              >
                Unduh
              </a>
            </div>
          </section>

          {/* ===== LENGKAPI DATA ANDA ===== */}
          {adaDataBelumLengkap && (
            <section className={`${KARTU} border border-[#F3D9B5]`}>
              <h2 className={JUDUL_KARTU}>📝 Lengkapi Data Anda</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#44546C]">
                Beberapa data diri Anda di catatan kami masih kosong. Mohon dilengkapi dulu sebelum konfirmasi
                kesediaan di bawah.
              </p>

              {perluLokasi && (
                <div className="mt-3 rounded-[10px] bg-[#F6F8FB] p-3">
                  <p className="text-xs font-bold text-[#33435C]">📍 Lokasi rumah Anda belum tercatat.</p>
                  <p className="mt-1 text-[11px] text-[#55657D]">
                    Dipakai untuk menghitung jarak ke wilayah tugas, supaya pembagian wilayah kerja antar petugas lebih
                    adil.
                  </p>
                  <button
                    type="button"
                    onClick={handleTetapkanLokasi}
                    disabled={lokasiBusy}
                    className="mt-2 rounded-lg bg-[#0F3D7A] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0A2A55] disabled:opacity-50"
                  >
                    {lokasiBusy ? "Mendeteksi lokasi..." : "📍 Tetapkan Lokasi Rumah Saya"}
                  </button>
                  {lokasiPesan && <p className="mt-2 text-[11px] text-rust-700">{lokasiPesan}</p>}
                </div>
              )}

              {perluFormTeks && (
                <div className="mt-3 rounded-[10px] bg-[#F6F8FB] p-3">
                  <div className="flex flex-col gap-3">
                    {perluNoHp && (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="font-bold text-[#33435C]">No HP / WhatsApp</span>
                        <input
                          type="tel"
                          value={noHpInput}
                          onChange={(e) => setNoHpInput(e.target.value)}
                          placeholder="08xx-xxxx-xxxx"
                          className={INPUT_TEKS}
                        />
                      </label>
                    )}
                    {perluUmur && (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="font-bold text-[#33435C]">Umur</span>
                        <input
                          type="number"
                          min={15}
                          max={90}
                          value={umurInput}
                          onChange={(e) => setUmurInput(e.target.value)}
                          placeholder="Umur (tahun)"
                          className={INPUT_TEKS}
                        />
                      </label>
                    )}
                    {perluJk && (
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="font-bold text-[#33435C]">Jenis Kelamin</span>
                        <div className="flex gap-3">
                          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                            <input type="radio" name="jk" checked={jkInput === "Lk"} onChange={() => setJkInput("Lk")} />
                            Laki-laki
                          </label>
                          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                            <input type="radio" name="jk" checked={jkInput === "Pr"} onChange={() => setJkInput("Pr")} />
                            Perempuan
                          </label>
                        </div>
                      </div>
                    )}
                    {perluPendidikan && (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="font-bold text-[#33435C]">Pendidikan Terakhir</span>
                        <select
                          value={pendidikanInput}
                          onChange={(e) => setPendidikanInput(e.target.value)}
                          className={INPUT_TEKS}
                        >
                          <option value="">Pilih pendidikan...</option>
                          {PILIHAN_PENDIDIKAN.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {perluPekerjaan && (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="font-bold text-[#33435C]">Pekerjaan</span>
                        <select
                          value={pekerjaanInput}
                          onChange={(e) => setPekerjaanInput(e.target.value)}
                          className={INPUT_TEKS}
                        >
                          <option value="">Pilih pekerjaan...</option>
                          {PILIHAN_PEKERJAAN.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {perluMotor && (
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="font-bold text-[#33435C]">Bisa mengendarai sepeda motor?</span>
                        <div className="flex gap-3">
                          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                            <input
                              type="radio"
                              name="motor"
                              checked={motorInput === "ya"}
                              onChange={() => setMotorInput("ya")}
                            />
                            Ya
                          </label>
                          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                            <input
                              type="radio"
                              name="motor"
                              checked={motorInput === "tidak"}
                              onChange={() => setMotorInput("tidak")}
                            />
                            Tidak
                          </label>
                        </div>
                      </div>
                    )}
                    {perluKendaraan && (
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="font-bold text-[#33435C]">Punya kendaraan bermotor sendiri?</span>
                        <div className="flex gap-3">
                          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                            <input
                              type="radio"
                              name="kendaraan"
                              checked={kendaraanInput === "ya"}
                              onChange={() => setKendaraanInput("ya")}
                            />
                            Ya
                          </label>
                          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                            <input
                              type="radio"
                              name="kendaraan"
                              checked={kendaraanInput === "tidak"}
                              onChange={() => setKendaraanInput("tidak")}
                            />
                            Tidak
                          </label>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={simpanLengkapiData}
                      disabled={lengkapiBusy}
                      className="mt-1 self-start rounded-lg bg-[#0F3D7A] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0A2A55] disabled:opacity-50"
                    >
                      {lengkapiBusy ? "Menyimpan..." : "💾 Simpan Data"}
                    </button>
                    {lengkapiError && <p className="text-[11px] text-rust-700">{lengkapiError}</p>}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ===== LANGKAH 3: KONFIRMASI ===== */}
          {tampilkanForm && (
            <section className={`${KARTU} flex flex-col gap-3.5 border-[1.5px] border-[#CFE3D7]`}>
              <div className="flex items-center gap-2.5">
                <NomorLangkah n={3} />
                <h2 className={JUDUL_KARTU}>Konfirmasi kesediaan</h2>
              </div>

              {!modeTolak ? (
                <>
                  <p className="text-[13px] leading-relaxed text-[#44546C]">
                    Anda menyanggupi pelatihan pada:{" "}
                    <b>{jadwalDipilih.length > 0 ? jadwalDipilih.join(" atau ") : "(belum ada tanggal dicentang)"}</b>{" "}
                    · {jumlahHariKerja} hari kerja, {jumlahHariLibur} hari libur selama pendataan.
                  </p>
                  <button
                    type="button"
                    disabled={busy || jadwalDipilih.length === 0}
                    onClick={() => kirimJawaban(true)}
                    className={`flex min-h-[54px] items-center justify-center gap-2.5 rounded-xl text-base font-extrabold ${
                      jadwalDipilih.length === 0
                        ? "cursor-not-allowed bg-[#DCE2EA] text-[#6B7A90]"
                        : "bg-[#1E7A4C] text-white hover:bg-[#176540]"
                    } disabled:opacity-70`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                    {busy ? "Mengirim..." : "Saya Bersedia"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setModeTolak(true)}
                    className="min-h-[46px] rounded-xl border-[1.5px] border-[#E5C2C2] bg-white text-sm font-bold text-[#A12626] hover:bg-rust-50 disabled:opacity-50"
                  >
                    Saya tidak bersedia
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold text-[#33435C]">Mohon isi alasan tidak bersedia:</p>
                  <textarea
                    value={alasanTolak}
                    onChange={(e) => setAlasanTolak(e.target.value)}
                    rows={3}
                    placeholder="Alasan (wajib diisi)..."
                    className="w-full rounded-lg border border-[#D5DDE8] bg-white px-3 py-2 text-sm outline-none focus:border-rust-400"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => kirimJawaban(false)}
                      className="rounded-lg bg-rust-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-rust-700 disabled:opacity-50"
                    >
                      {busy ? "Mengirim..." : "Kirim"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setModeTolak(false)}
                      className="rounded-lg border border-[#D5DDE8] bg-white px-4 py-2 text-sm font-medium text-[#44546C] hover:bg-gray-50"
                    >
                      Batal
                    </button>
                  </div>
                </>
              )}

              {error && <p className="text-xs font-semibold text-rust-700">{error}</p>}
            </section>
          )}

          <p className="mt-2 text-center text-[11px] text-[#55657D]">
            Ada pertanyaan? Hubungi Korwil/PML pembimbing Anda atau admin BPS Kabupaten Solok.
          </p>
        </div>
      </div>
    </main>
  );
}
