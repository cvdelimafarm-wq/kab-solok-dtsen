"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import BuatAkunPanel from "../../undangan/BuatAkunPanel";
import LengkapiDataPanel from "../../undangan/LengkapiDataPanel";
import ModalSelesaikan from "../../undangan/ModalSelesaikan";
import BrandBps from "@/app/components/BrandBps";

// ------------------------------------------------------------------------
// Halaman publik (tanpa login): "Tawaran Pendataan Bencana dengan Skema
// Menginap" -- tawaran KHUSUS ke petugas yang sudah mendaftar tapi belum
// mendapat wilayah kerja / rumahnya jauh dari lokasi yang kekurangan petugas.
// Petugas menginap di kontrakan yang disediakan BPS Kabupaten Solok di
// lokasi pendataan bersama rekan PPL lain (tanpa pulang-pergi) selama masa
// tugas. Diakses lewat link unik PER KANDIDAT PER TAWARAN
// (/bencana/menginap/<token-kandidat>), dibuat admin lewat kartu "Tawaran
// Menginap" di tab Alokasi Petugas.
//
// (4 Okt 2026) Tampilan disamakan dgn tema "tawaran kegiatan" di
// /bencana/konfirmasi/[token] (header biru, strip ringkasan, kartu putih
// bernomor langkah). Logika/API TIDAK berubah: murni mencatat kesediaan,
// admin yang menentukan plot sesudah melihat siapa yang bersedia.
// ------------------------------------------------------------------------

type MenginapInfo = {
  nama: string;
  // (4 Okt 2026) akun PIN & grup WA (grup hanya terisi jika bersedia + akun sudah ada)
  punya_akun: boolean;
  wa_group_url: string | null;
  // hanya terisi setelah bersedia: dipakai panel "Lengkapi Data Anda"
  petugas_token: string | null;
  pola_menginap: "penuh" | "akhir_pekan" | null;
  jadwal_pelatihan: string | null;
  perkiraan_hari_libur: string[] | null;
  teman_menginap: string | null;
  alasan_kategori: "keluarga" | "kesehatan" | "pekerjaan" | "lainnya" | null;
  bersedia_pulang_pergi: boolean | null;
  kecamatan: string;
  nagari: string | null;
  keterangan: string;
  status: "bersedia" | "tidak_bersedia" | null;
  catatan: string | null;
  dijawab_pada: string | null;
};

const PILIHAN_JADWAL = [
  { nilai: "7 Oktober 2026", hari: "Rabu", label: "7 Okt 2026" },
  { nilai: "8 Oktober 2026", hari: "Kamis", label: "8 Okt 2026" },
];
const HARI_SINGKAT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const TANGGAL_PENDATAAN = Array.from({ length: 22 }, (_, i) => {
  const d = 10 + i;
  const date = new Date(2026, 9, d);
  return { iso: `2026-10-${String(d).padStart(2, "0")}`, tgl: d, kolom: (date.getDay() + 6) % 7 };
});
const ISO_MINGGU = TANGGAL_PENDATAAN.filter((t) => t.kolom === 6).map((t) => t.iso);
const KATEGORI_ALASAN: { nilai: "keluarga" | "kesehatan" | "pekerjaan" | "lainnya"; label: string }[] = [
  { nilai: "keluarga", label: "Keluarga / anak" },
  { nilai: "kesehatan", label: "Kesehatan" },
  { nilai: "pekerjaan", label: "Pekerjaan / kegiatan lain" },
  { nilai: "lainnya", label: "Lainnya" },
];
const INPUT_TEKS = "rounded-lg border border-[#D5DDE8] bg-white px-3 py-2 text-sm outline-none focus:border-[#0F3D7A]";

const URL_KUESIONER = "/kuesioner-pendataan-bencana.pdf";
const KARTU = "rounded-[14px] bg-white p-4 shadow-sm";
const JUDUL_KARTU = "text-[17px] font-extrabold text-[#13213A]";

function NomorLangkah({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0F3D7A] text-sm font-extrabold text-white">
      {n}
    </span>
  );
}

function Ikon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#FEF3E2]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

export default function KonfirmasiMenginapPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);

  const [info, setInfo] = useState<MenginapInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ubahJawaban, setUbahJawaban] = useState(false);
  // Modal info: tampil SETIAP halaman dibuka (sengaja tanpa penyimpanan browser), tutup dgn tombol OK.
  const [modalAwal, setModalAwal] = useState(true);
  // Modal "pastikan semua tahapan selesai" -- muncul begitu petugas menyatakan bersedia.
  const [modalSelesaikan, setModalSelesaikan] = useState(false);
  // (4 Okt 2026) jawaban rinci -- lihat komentar POST di app/api/bencana/menginap/[token]/route.ts
  const [pilihan, setPilihan] = useState<"" | "bersedia" | "tidak">("");
  const [pola, setPola] = useState<"" | "penuh" | "akhir_pekan">("");
  const [jadwal, setJadwal] = useState<string[]>(PILIHAN_JADWAL.map((j) => j.nilai));
  const [hariLibur, setHariLibur] = useState<string[]>([]);
  const [teman, setTeman] = useState("");
  const [kategori, setKategori] = useState<"" | "keluarga" | "kesehatan" | "pekerjaan" | "lainnya">("");
  const [alasan, setAlasan] = useState("");
  const [pulangPergi, setPulangPergi] = useState<"" | "ya" | "tidak">("");

  // Setelah menjawab, kartu status muncul di ATAS halaman -> layar otomatis
  // digulir ke sana supaya petugas langsung melihat konfirmasinya.
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const [gulirKeBanner, setGulirKeBanner] = useState(false);
  useEffect(() => {
    if (!gulirKeBanner) return;
    const t = setTimeout(() => {
      bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setGulirKeBanner(false);
    }, 120);
    return () => clearTimeout(t);
  }, [gulirKeBanner]);

  async function muat() {
    try {
      const res = await fetch(`/api/bencana/menginap/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json?.error ?? "Link tidak valid.");
      } else {
        setInfo(json.data);
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

  function bukaUbahJawaban() {
    if (info) {
      setPilihan(info.status === "bersedia" ? "bersedia" : info.status === "tidak_bersedia" ? "tidak" : "");
      setPola(info.pola_menginap ?? "");
      if (info.jadwal_pelatihan) setJadwal(PILIHAN_JADWAL.map((j) => j.nilai).filter((n) => info.jadwal_pelatihan!.includes(n)));
      setHariLibur(info.perkiraan_hari_libur ?? []);
      setTeman(info.teman_menginap ?? "");
      setKategori(info.alasan_kategori ?? "");
      setAlasan(info.catatan ?? "");
      setPulangPergi(info.bersedia_pulang_pergi == null ? "" : info.bersedia_pulang_pergi ? "ya" : "tidak");
    }
    setError(null);
    setUbahJawaban(true);
  }

  async function kirimJawaban(bersedia: boolean) {
    setError(null);
    let body: Record<string, unknown>;
    if (bersedia) {
      if (!pola) return setError("Pilih pola menginap yang Anda sanggupi.");
      if (jadwal.length === 0) return setError("Pilih minimal 1 tanggal pelatihan.");
      body = { bersedia: true, pola_menginap: pola, jadwal_pelatihan: jadwal, hari_libur: hariLibur, teman_menginap: teman.trim() };
    } else {
      if (!kategori) return setError("Pilih kategori alasan tidak bersedia.");
      if (!alasan.trim()) return setError("Mohon isi alasan tidak bersedia.");
      if (!pulangPergi) return setError("Jawab apakah Anda tetap bersedia pulang-pergi.");
      body = { bersedia: false, alasan_kategori: kategori, alasan: alasan.trim(), bersedia_pulang_pergi: pulangPergi === "ya" };
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/bencana/menginap/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Gagal mengirim jawaban.");
      } else {
        setUbahJawaban(false);
        await muat();
        if (bersedia) setModalSelesaikan(true);
        else setGulirKeBanner(true);
      }
    } catch {
      setError("Gagal mengirim jawaban. Periksa koneksi internet, lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const fontStyle = { fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F1F4F8] px-6" style={fontStyle}>
        <p className="text-[#55657D]">Memuat...</p>
      </main>
    );
  }

  if (loadError || !info) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center bg-[#F1F4F8] px-6 py-16 text-center" style={fontStyle}>
        <p className="rounded-xl bg-rust-100 px-4 py-3 text-rust-700">{loadError ?? "Link tidak ditemukan."}</p>
      </main>
    );
  }

  const sudahJawab = info.status !== null;
  const tampilkanForm = !sudahJawab || ubahJawaban;
  const bersedia = info.status === "bersedia";
  const lokasi = info.nagari ? `Nagari ${info.nagari}` : `Kec. ${info.kecamatan}`;

  return (
    <main className="min-h-screen bg-[#F1F4F8] pb-10 text-[#13213A]" style={fontStyle}>
      {modalSelesaikan && !modalAwal && !info.punya_akun && (
        <ModalSelesaikan nama={info.nama} onOk={() => setModalSelesaikan(false)} />
      )}
      {modalAwal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="judul-modal-menginap"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="judul-modal-menginap" className="text-base font-extrabold text-[#0F3D7A]">
              Tawaran Menginap
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#13213A]">
              Halo, <strong>{info.nama}</strong>. Terima kasih sudah mendaftar. Kami menawarkan Anda mendata KK terdampak bencana di{" "}
              <strong>{lokasi}</strong>, Kec. {info.kecamatan}, dengan menginap di kontrakan yang disediakan BPS bersama rekan PPL lain.
            </p>
            <p className="mt-3 rounded-lg bg-[#F1F4F8] px-3 py-2.5 text-sm leading-relaxed text-[#13213A]">
              Informasi lebih lanjut silakan hubungi <strong>M. Iqbal Hadi</strong>{" "}
              <a href="https://wa.me/6281341760592" target="_blank" rel="noopener noreferrer" className="font-bold text-[#0F3D7A] underline">
                081341760592
              </a>
              .
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => setModalAwal(false)}
              className="mt-4 w-full rounded-xl bg-[#0F3D7A] py-3 text-sm font-bold text-white active:bg-[#0B2F5E]"
            >
              OK
            </button>
          </div>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      <div className="mx-auto max-w-lg">
        {/* ===== HEADER ===== */}
        <header className="flex flex-col gap-3.5 bg-[#0F3D7A] px-5 pb-11 pt-[22px] text-white">
          <div className="flex items-center justify-between">
            <BrandBps className="min-w-0" teksClassName="text-[13px] font-bold leading-tight tracking-wide" ukuran={30} kotakPutih />
            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">Tawaran Kegiatan</span>
          </div>
          <h1 className="text-[25px] font-extrabold leading-tight">Tawaran Pendataan Pascabencana dengan Skema Menginap</h1>
          <p className="text-sm leading-relaxed text-[#DCE6F5]">
            Halo, <strong className="text-white">{info.nama}</strong>. Terima kasih sudah mendaftar. Kami menawarkan Anda
            mendata KK terdampak bencana di <strong className="text-white">{lokasi}</strong>, Kec. {info.kecamatan},
            dengan menginap di kontrakan yang disediakan BPS bersama rekan PPL lain.
          </p>
        </header>

        {/* ===== STRIP RINGKASAN ===== */}
        <div className="-mt-[26px] mx-4 grid grid-cols-3 rounded-[14px] bg-white px-1.5 py-3.5 shadow-md">
          <div className="flex flex-col items-center gap-0.5 border-r border-[#E4E9F0]">
            <span className="text-[11px] font-semibold text-[#55657D]">Lokasi</span>
            <span className="px-1 text-center text-sm font-extrabold">{info.nagari ?? info.kecamatan}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 border-r border-[#E4E9F0]">
            <span className="text-[11px] font-semibold text-[#55657D]">Pendataan</span>
            <span className="text-sm font-extrabold">10–31 Okt</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[11px] font-semibold text-[#55657D]">Jam kerja</span>
            <span className="text-sm font-extrabold">5–7 jam/hari</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {/* ===== PERINGATAN: ALOKASI HANYA PERKIRAAN ===== */}
          <div role="note" className="flex items-start gap-2.5 rounded-xl border-2 border-[#F59E0B] bg-[#FEF3E2] px-3.5 py-3 text-[#7A3E06]">
            <span aria-hidden className="mt-0.5 text-lg leading-none">⚠️</span>
            <p className="text-[13px] font-extrabold uppercase leading-snug tracking-wide">
              Alokasi ini hanya perkiraan, dapat bergeser sesuai dengan temuan kondisi riil saat pendataan
            </p>
          </div>

          {/* ===== STATUS JAWABAN ===== */}
          {sudahJawab && !ubahJawaban && (
            <div
              ref={bannerRef}
              className={`scroll-mt-4 rounded-[14px] border p-4 text-sm ${
                bersedia ? "border-[#CFE3D7] bg-[#F1FAF5] text-[#1E5E3C]" : "border-rust-200 bg-rust-50 text-rust-700"
              }`}
            >
              {bersedia ? (
                <>
                  <p className="text-[17px] font-extrabold">✓ Terima kasih, kesediaan Anda tercatat</p>
                  <p className="mt-1.5 leading-relaxed">
                    Anda <b>BERSEDIA menginap</b> di {lokasi}, Kec. {info.kecamatan}
                    {info.pola_menginap === "akhir_pekan" ? " (pulang saat akhir pekan)" : info.pola_menginap === "penuh" ? " (penuh selama pendataan)" : ""}.
                    {info.jadwal_pelatihan && <> Pelatihan yang Anda sanggupi: <b>{info.jadwal_pelatihan}</b>.</>}{" "}
                    Admin BPS akan menghubungi Anda untuk memastikan wilayah kerja, jadwal, dan lokasi kontrakan.
                  </p>
                </>
              ) : (
                <>
                  Anda sudah mengonfirmasi <b>TIDAK BERSEDIA</b> menginap untuk tawaran ini.
                  {info.catatan && <> Alasan: &ldquo;{info.catatan}&rdquo;.</>}
                  {info.bersedia_pulang_pergi === true && <> Anda tetap <b>bersedia pulang-pergi</b> ke wilayah ini.</>}
                  {info.bersedia_pulang_pergi === false && <> Anda juga tidak bersedia pulang-pergi.</>}
                </>
              )}
              <button
                type="button"
                onClick={bukaUbahJawaban}
                className="mt-3 block text-sm font-bold text-[#0F3D7A] underline"
              >
                Ubah jawaban
              </button>
            </div>
          )}

          {/* ===== BUAT AKUN (setelah bersedia) ===== */}
          {bersedia && !ubahJawaban && (
            <BuatAkunPanel
              jenis="menginap"
              token={token}
              nama={info.nama}
              punyaAkun={info.punya_akun}
              waUrl={info.wa_group_url}
              onSelesai={muat}
            />
          )}

          {/* ===== LENGKAPI DATA (pertanyaan reguler; hanya kolom yang masih kosong) ===== */}
          {bersedia && !ubahJawaban && info.petugas_token && <LengkapiDataPanel petugasToken={info.petugas_token} />}

          {/* ===== LANGKAH 1: SKEMA MENGINAP ===== */}
          <section className={`${KARTU} flex flex-col gap-3`}>
            <div className="flex items-center gap-2.5">
              <NomorLangkah n={1} />
              <h2 className={`${JUDUL_KARTU} flex-1`}>Skema menginap</h2>
            </div>
            <div className="flex items-start gap-3">
              <Ikon>
                <path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5" />
              </Ikon>
              <p className="text-sm leading-relaxed">
                Anda <strong>tinggal di kontrakan yang disediakan BPS Kabupaten Solok</strong> di lokasi pendataan selama
                masa tugas, <strong>tanpa pulang-pergi</strong>.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Ikon>
                <>
                  <circle cx="9" cy="8" r="3" />
                  <circle cx="17" cy="9" r="2.5" />
                  <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 20c0-2.4 1.6-4.4 4-4.8" />
                </>
              </Ikon>
              <p className="text-sm leading-relaxed">
                Anda menginap <strong>bersama rekan PPL lain</strong>, jadi tidak sendirian. Bila ingin ditemani rekan
                tertentu, sampaikan kepada admin.
              </p>
            </div>
            <div className="rounded-[10px] bg-[#F6F8FB] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#55657D]">Keterangan kebutuhan</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{info.keterangan}</p>
            </div>
          </section>

          {/* ===== TUGAS ANDA ===== */}
          <section className={`${KARTU} flex flex-col gap-3.5`}>
            <h2 className={JUDUL_KARTU}>Tugas Anda</h2>
            <div className="flex items-start gap-3">
              <Ikon>
                <path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5" />
              </Ikon>
              <p className="text-sm leading-relaxed">
                Mendata <strong>seluruh KK terdampak</strong> bencana hidrometeorologi tahun 2025 di wilayah tugas.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Ikon>
                <>
                  <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                  <path d="M11 18h2" />
                </>
              </Ikon>
              <p className="text-sm leading-relaxed">
                Pendataan menggunakan aplikasi <strong>FASIH Mobile</strong>.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Ikon>
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </>
              </Ikon>
              <p className="text-sm leading-relaxed">
                Bekerja <strong>5–7 jam kerja per hari</strong>, pada rentang pendataan <strong>10–31 Oktober 2026</strong>.
              </p>
            </div>
          </section>

          {/* ===== KUESIONER ===== */}
          <section className={`${KARTU} flex flex-col gap-3`}>
            <h2 className={JUDUL_KARTU}>Kuesioner Pendataan</h2>
            <p className="text-[13px] leading-relaxed text-[#44546C]">
              Kuesioner Pendataan Daerah Terdampak Bencana ABT Sumatera 2026 (Keluarga). Silakan dibaca lebih dulu.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={URL_KUESIONER}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[#0F3D7A] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#0B2F5F]"
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

          {/* ===== YANG PERLU DIKETAHUI ===== */}
          <section className={`${KARTU} flex flex-col gap-2`}>
            <h2 className={JUDUL_KARTU}>Yang perlu diketahui</h2>
            <p className="text-sm leading-relaxed text-[#33435C]">
              Tawaran ini <b>belum berarti Anda pasti diplot</b> ke wilayah tersebut. Kami mengecek dulu siapa yang
              bersedia menginap; petugas lain mungkin juga ditawari untuk kebutuhan yang sama. Jika Anda menyatakan
              bersedia, admin akan menghubungi Anda untuk detail wilayah kerja pasti, jadwal pelatihan, dan lokasi
              kontrakan.
            </p>
          </section>

          {/* ===== LANGKAH 2: KONFIRMASI ===== */}
          {tampilkanForm && (
            <section className={`${KARTU} flex flex-col gap-3.5 border-2 border-[#0F3D7A]/15`}>
              <div className="flex items-center gap-2.5">
                <NomorLangkah n={2} />
                <h2 className={`${JUDUL_KARTU} flex-1`}>Konfirmasi kesediaan menginap</h2>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPilihan("bersedia")}
                  className={`min-h-[48px] rounded-xl border-2 px-3 py-2.5 text-sm font-extrabold ${
                    pilihan === "bersedia" ? "border-[#1E7A4C] bg-[#F1FAF5] text-[#1E5E3C]" : "border-[#D5DDE8] bg-white text-[#33435C]"
                  }`}
                >
                  Saya bersedia menginap
                </button>
                <button
                  type="button"
                  onClick={() => setPilihan("tidak")}
                  className={`min-h-[48px] rounded-xl border-2 px-3 py-2.5 text-sm font-extrabold ${
                    pilihan === "tidak" ? "border-[#C0392B] bg-[#FDF2F1] text-[#A93226]" : "border-[#D5DDE8] bg-white text-[#33435C]"
                  }`}
                >
                  Saya tidak bersedia
                </button>
              </div>

              {pilihan === "bersedia" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-sm font-bold">Pola menginap yang Anda sanggupi</p>
                    <div className="mt-2 flex flex-col gap-2">
                      {[
                        { v: "penuh" as const, t: "Penuh selama pendataan", d: "Tinggal di kontrakan 10–31 Oktober, tanpa pulang." },
                        { v: "akhir_pekan" as const, t: "Pulang saat akhir pekan", d: "Menginap hari kerja, pulang pada hari Sabtu/Minggu." },
                      ].map((o) => (
                        <label key={o.v} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-2 p-3 ${pola === o.v ? "border-[#0F3D7A] bg-[#EAF1FB]" : "border-[#D5DDE8]"}`}>
                          <input type="radio" name="pola" className="mt-1" checked={pola === o.v} onChange={() => setPola(o.v)} />
                          <span>
                            <span className="block text-sm font-bold">{o.t}</span>
                            <span className="block text-xs text-[#55657D]">{o.d}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-bold">Tanggal pelatihan</p>
                    <p className="mt-1 text-xs text-[#55657D]">Pelatihan hanya 1 hari di salah satu tanggal ini (Mami Hotel Kota Solok, 08.00–17.00 WIB). Lepas centang pada tanggal yang tidak bisa Anda hadiri.</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {PILIHAN_JADWAL.map((j) => {
                        const on = jadwal.includes(j.nilai);
                        return (
                          <label key={j.nilai} className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 p-3 ${on ? "border-[#0F3D7A] bg-[#EAF1FB]" : "border-[#D5DDE8]"}`}>
                            <input type="checkbox" checked={on} onChange={() => setJadwal((p) => (p.includes(j.nilai) ? p.filter((x) => x !== j.nilai) : [...p, j.nilai]))} />
                            <span className="text-sm font-bold">{j.hari}, {j.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-bold">Perkiraan hari libur (10–31 Oktober)</p>
                    <p className="mt-1 text-xs text-[#55657D]">Ketuk tanggal yang libur (tidak bisa mendata). Ini perkiraan awal, boleh berubah nanti.</p>
                    <div className="mt-2 grid grid-cols-7 gap-1.5 text-center">
                      {HARI_SINGKAT.map((h) => (
                        <span key={h} className="text-[10px] font-semibold text-[#55657D]">{h}</span>
                      ))}
                      {Array.from({ length: TANGGAL_PENDATAAN[0].kolom }).map((_, i) => (
                        <span key={`k${i}`} />
                      ))}
                      {TANGGAL_PENDATAAN.map((t) => {
                        const libur = hariLibur.includes(t.iso);
                        return (
                          <button
                            key={t.iso}
                            type="button"
                            onClick={() => setHariLibur((p) => (p.includes(t.iso) ? p.filter((x) => x !== t.iso) : [...p, t.iso]))}
                            className={`min-h-[36px] rounded-lg border text-sm font-bold ${
                              libur ? "border-[#E8B4AE] bg-[#FDF2F1] text-[#C0392B] line-through" : "border-[#0F3D7A]/40 bg-white text-[#13213A]"
                            }`}
                          >
                            {t.tgl}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-[#55657D]">{TANGGAL_PENDATAAN.length - hariLibur.length} hari kerja, {hariLibur.length} libur</span>
                      <button type="button" onClick={() => setHariLibur([])} className="rounded-full border border-[#0F3D7A] px-2.5 py-1 font-bold text-[#0F3D7A]">Semua hari kerja</button>
                      <button type="button" onClick={() => setHariLibur(ISO_MINGGU)} className="rounded-full border border-[#0F3D7A] px-2.5 py-1 font-bold text-[#0F3D7A]">Tandai Minggu libur</button>
                    </div>
                  </div>

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-bold">Teman menginap yang diinginkan <span className="font-normal text-[#55657D]">(opsional)</span></span>
                    <input value={teman} onChange={(e) => setTeman(e.target.value)} maxLength={200} placeholder="Nama rekan PPL, bila ada" className={INPUT_TEKS} />
                    <span className="text-xs text-[#55657D]">Permintaan ini tidak menjamin, tetapi akan kami pertimbangkan.</span>
                  </label>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => kirimJawaban(true)}
                    className="min-h-[48px] rounded-xl bg-[#1E7A4C] px-4 py-3 text-[15px] font-extrabold text-white shadow-sm hover:bg-[#176540] disabled:opacity-50"
                  >
                    {busy ? "Mengirim..." : "Kirim Kesediaan Menginap"}
                  </button>
                </div>
              )}

              {pilihan === "tidak" && (
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-bold">Alasan utama</span>
                    <select value={kategori} onChange={(e) => setKategori(e.target.value as typeof kategori)} className={INPUT_TEKS}>
                      <option value="">Pilih alasan...</option>
                      {KATEGORI_ALASAN.map((k) => (
                        <option key={k.nilai} value={k.nilai}>{k.label}</option>
                      ))}
                    </select>
                  </label>
                  <textarea
                    value={alasan}
                    onChange={(e) => setAlasan(e.target.value)}
                    rows={3}
                    placeholder="Jelaskan alasan (wajib diisi)..."
                    className="w-full rounded-lg border border-[#D5DDE8] bg-white px-3 py-2 text-sm outline-none focus:border-[#0F3D7A]"
                  />
                  <div>
                    <p className="text-sm font-bold">Apakah Anda tetap bersedia pulang-pergi ke wilayah ini?</p>
                    <div className="mt-2 flex gap-4">
                      {(["ya", "tidak"] as const).map((v) => (
                        <label key={v} className="flex cursor-pointer items-center gap-1.5 text-sm">
                          <input type="radio" name="pp" checked={pulangPergi === v} onChange={() => setPulangPergi(v)} />
                          {v === "ya" ? "Ya, bersedia pulang-pergi" : "Tidak"}
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => kirimJawaban(false)}
                    className="rounded-xl bg-[#C0392B] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-[#A93226] disabled:opacity-50"
                  >
                    {busy ? "Mengirim..." : "Kirim Jawaban"}
                  </button>
                </div>
              )}

              {error && <p className="text-xs font-semibold text-[#C0392B]">{error}</p>}
            </section>
          )}

          <p className="text-center text-[11px] text-[#55657D]">
            Ada pertanyaan? Hubungi Korwil/PML pembimbing Anda atau admin BPS Kabupaten Solok.
          </p>
        </div>
      </div>
    </main>
  );
}
