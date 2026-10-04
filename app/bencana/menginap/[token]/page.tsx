"use client";

import { useEffect, useRef, useState, use as usePromise } from "react";
import BuatAkunPanel from "../../undangan/BuatAkunPanel";

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
  kecamatan: string;
  nagari: string | null;
  keterangan: string;
  status: "bersedia" | "tidak_bersedia" | null;
  catatan: string | null;
  dijawab_pada: string | null;
};

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
  const [modeTolak, setModeTolak] = useState(false);
  const [alasanTolak, setAlasanTolak] = useState("");

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

  async function kirimJawaban(bersedia: boolean) {
    if (!bersedia && !alasanTolak.trim()) {
      setError("Mohon isi alasan tidak bersedia.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bencana/menginap/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bersedia ? { bersedia: true } : { bersedia: false, alasan: alasanTolak.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Gagal mengirim jawaban.");
      } else {
        setUbahJawaban(false);
        setModeTolak(false);
        await muat();
        setGulirKeBanner(true);
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
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      <div className="mx-auto max-w-lg">
        {/* ===== HEADER ===== */}
        <header className="flex flex-col gap-3.5 bg-[#0F3D7A] px-5 pb-11 pt-[22px] text-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold tracking-wide">BPS Kabupaten Solok</span>
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
                    Anda <b>BERSEDIA menginap</b> di {lokasi}, Kec. {info.kecamatan}. Admin BPS akan menghubungi Anda
                    untuk memastikan wilayah kerja, jadwal pelatihan, dan lokasi kontrakan.
                  </p>
                </>
              ) : (
                <>
                  Anda sudah mengonfirmasi <b>TIDAK BERSEDIA</b> menginap untuk tawaran ini.
                  {info.catatan && <> Alasan: &ldquo;{info.catatan}&rdquo;</>}
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
            <section className={`${KARTU} flex flex-col gap-3 border-2 border-[#0F3D7A]/15`}>
              <div className="flex items-center gap-2.5">
                <NomorLangkah n={2} />
                <h2 className={`${JUDUL_KARTU} flex-1`}>Konfirmasi kesediaan menginap</h2>
              </div>

              {!modeTolak ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => kirimJawaban(true)}
                    className="min-h-[48px] rounded-xl bg-[#1E7A4C] px-4 py-3 text-[15px] font-extrabold text-white shadow-sm hover:bg-[#176540] disabled:opacity-50"
                  >
                    {busy ? "Mengirim..." : "Saya Bersedia Menginap"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setModeTolak(true)}
                    className="text-sm font-bold text-[#C0392B] underline disabled:opacity-50"
                  >
                    Saya tidak bersedia
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs font-bold text-[#33435C]">Mohon isi alasan tidak bersedia:</p>
                  <textarea
                    value={alasanTolak}
                    onChange={(e) => setAlasanTolak(e.target.value)}
                    rows={3}
                    placeholder="Alasan (wajib diisi)..."
                    className="w-full rounded-lg border border-[#D5DDE8] bg-white px-3 py-2 text-sm outline-none focus:border-[#0F3D7A]"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => kirimJawaban(false)}
                      className="rounded-xl bg-[#C0392B] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-[#A93226] disabled:opacity-50"
                    >
                      {busy ? "Mengirim..." : "Kirim"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setModeTolak(false)}
                      className="rounded-xl border border-[#D5DDE8] bg-white px-4 py-2.5 text-sm font-bold text-[#33435C] hover:bg-[#F6F8FB]"
                    >
                      Batal
                    </button>
                  </div>
                </>
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
