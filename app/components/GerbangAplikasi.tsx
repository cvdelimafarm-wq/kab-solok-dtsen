"use client";

// app/components/GerbangAplikasi.tsx
//
// (8 Okt 2026) Gerbang "wajib lewat aplikasi" -- permintaan user: semua yang membuka di HP harus lewat aplikasi terpasang, berlaku
// langsung setelah deploy. Di HP yang membuka lewat tab browser, isi halaman TIDAK ditampilkan; yang tampil modal penuh layar tanpa
// tombol tutup berisi tombol "Pasang aplikasi sekarang" (Android/Chrome: satu ketukan membuka dialog Instal bawaan; iPhone: langkah
// Bagikan > Tambahkan ke Layar Utama). Logika murni di lib/sigapGerbangApp.ts. Pintu darurat (kode panitia) disembunyikan atas permintaan user; route-nya tidak dipakai.

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { EVENT_SIAP_PASANG } from "./DaftarSW";
import {
  KUNCI_IZIN_BROWSER,
  browserTertanam,
  izinBrowserBerlaku,
  jalurWajibApp,
  modeAplikasi,
  perangkatIos,
  perangkatSeluler,
  safariIos,
  tautanBukaChrome,
} from "@/lib/sigapGerbangApp";

type Status = "cek" | "lolos" | "blok";

function bacaStatus(): Status {
  const ua = navigator.userAgent;
  if (!perangkatSeluler(ua, navigator.maxTouchPoints)) return "lolos";
  const aplikasi = modeAplikasi({
    standalone: window.matchMedia("(display-mode: standalone)").matches,
    fullscreenAtauMinimal: window.matchMedia("(display-mode: fullscreen)").matches || window.matchMedia("(display-mode: minimal-ui)").matches,
    iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
    referrer: document.referrer,
  });
  if (aplikasi) return "lolos";
  try {
    if (izinBrowserBerlaku(localStorage.getItem(KUNCI_IZIN_BROWSER), Date.now())) return "lolos";
  } catch {
    /* penyimpanan diblokir: anggap tidak ada izin */
  }
  return "blok";
}

function Layar({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] p-4">{children}</div>;
}

function Logo() {
  return (
    <span className="grid h-12 w-12 flex-none place-items-center rounded-[14px] bg-white shadow-[0_4px_12px_rgba(4,16,40,.25)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/sigap-logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" />
    </span>
  );
}

function ModalPasang() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const ios = perangkatIos(ua, typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints);
  const tertanam = browserTertanam(ua);
  const [siap, setSiap] = useState(false); // dialog pasang bawaan tersedia
  const [proses, setProses] = useState<"diam" | "memasang" | "terpasang" | "batal">("diam");
  const [salin, setSalin] = useState(false);

  useEffect(() => {
    const perbarui = () => setSiap(!!window.__sigapPasang);
    perbarui();
    window.addEventListener(EVENT_SIAP_PASANG, perbarui);
    const terpasang = () => setProses("terpasang");
    window.addEventListener("appinstalled", terpasang);
    return () => {
      window.removeEventListener(EVENT_SIAP_PASANG, perbarui);
      window.removeEventListener("appinstalled", terpasang);
    };
  }, []);

  async function pasang() {
    const ev = window.__sigapPasang;
    if (!ev) return;
    setProses("memasang");
    try {
      await ev.prompt();
      const hasil = await ev.userChoice.catch(() => null);
      window.__sigapPasang = null; // hanya bisa dipakai sekali
      setSiap(false);
      setProses(hasil?.outcome === "accepted" ? "terpasang" : "batal");
    } catch {
      setProses("batal");
    }
  }

  async function salinTautan() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setSalin(true);
      setTimeout(() => setSalin(false), 2500);
    } catch {
      window.prompt("Salin tautan ini lalu buka di Chrome/Safari:", window.location.href);
    }
  }

  const chrome = typeof window === "undefined" ? null : tautanBukaChrome(window.location.href);
  const tombolUtama = "mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-[13px] bg-[#1F5FD1] px-4 text-[15px] font-extrabold text-white transition hover:bg-[#1A4FB8] disabled:cursor-not-allowed disabled:opacity-60";
  const tombolKedua = "mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-[13px] border border-[#CBD6E6] bg-white px-4 text-[14px] font-bold text-[#1B2B4B] transition hover:bg-[#F5F8FE]";

  return (
    <Layar>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-pasang" className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-[22px] bg-white p-5 text-[#1B2B4B] shadow-2xl">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <p className="text-[18px] font-extrabold leading-none text-[#0F2A52]">SIGAP</p>
            <p className="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-[#6B7A90]">Sistem Integrasi Kegiatan BPS</p>
          </div>
        </div>

        <h2 id="judul-pasang" className="mt-4 text-[20px] font-extrabold leading-tight text-[#0F2A52]">
          SIGAP kini hadir sebagai aplikasi
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#5B6B84]">
          SIGAP sudah bertransformasi menjadi aplikasi <b className="text-[#0F2A52]">Android dan iPhone</b>. Mulai sekarang, Anda mengakses SIGAP langsung dari ikon di layar utama HP: lebih cepat, tampil layar penuh, dan siap mengingatkan kegiatan pelatihan Anda, bahkan saat aplikasi sedang ditutup.
        </p>
        <p className="mt-2 text-[13.5px] font-semibold leading-relaxed text-[#0F2A52]">Nikmati layanan SIGAP yang lebih tangguh.</p>

        {proses === "terpasang" ? (
          <div className="mt-4 rounded-[14px] bg-[#E3F6EC] p-3.5 text-[13.5px] leading-relaxed text-[#13794B]" role="status">
            <b>Aplikasi sedang dipasang.</b> Tunggu beberapa detik sampai ikon <b>SIGAP</b> muncul di layar utama HP, lalu buka dari ikon itu dan masuk dengan nama + PIN.
          </div>
        ) : ios ? (
          safariIos(ua) && !tertanam ? (
            <ol className="mt-4 space-y-2.5 text-[13.5px] leading-relaxed">
              <li className="flex gap-2.5">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#1F5FD1] text-[12px] font-extrabold text-white">1</span>
                <span>
                  Ketuk tombol <b>Bagikan</b> (kotak dengan panah ke atas) di bagian bawah Safari.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#1F5FD1] text-[12px] font-extrabold text-white">2</span>
                <span>
                  Gulir, pilih <b>Tambahkan ke Layar Utama</b>, lalu ketuk <b>Tambah</b>.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#1F5FD1] text-[12px] font-extrabold text-white">3</span>
                <span>Tutup halaman ini, lalu buka SIGAP dari ikon di layar utama.</span>
              </li>
            </ol>
          ) : (
            <div className="mt-4 rounded-[14px] bg-[#FFF8E6] p-3.5 text-[13.5px] leading-relaxed text-[#6B4C00]">
              iPhone hanya bisa memasang aplikasi dari <b>Safari</b>. Salin tautan di bawah, buka Safari, tempel di kolom alamat, lalu ikuti petunjuknya.
              <button type="button" onClick={salinTautan} className={tombolUtama}>
                {salin ? "Tautan tersalin" : "Salin tautan"}
              </button>
            </div>
          )
        ) : siap ? (
          <>
            <button type="button" onClick={pasang} disabled={proses === "memasang"} className={tombolUtama}>
              {proses === "memasang" ? "Membuka dialog pasang…" : "Pasang aplikasi sekarang"}
            </button>
            {proses === "batal" && <p className="mt-2 text-[12.5px] text-[#B42329]">Pemasangan dibatalkan. Muat ulang halaman ini lalu ketuk tombol pasang lagi.</p>}
            <p className="mt-2 text-[12px] leading-relaxed text-[#6B7A90]">Ketuk <b>Instal</b> pada dialog yang muncul.</p>
          </>
        ) : tertanam ? (
          <div className="mt-4 rounded-[14px] bg-[#FFF8E6] p-3.5 text-[13.5px] leading-relaxed text-[#6B4C00]">
            Anda membuka dari dalam aplikasi lain (mis. WhatsApp), yang tidak bisa memasang aplikasi. Buka dulu di <b>Chrome</b>.
            {chrome && (
              <a href={chrome} className={`${tombolUtama} no-underline`}>
                Buka di Chrome
              </a>
            )}
            <button type="button" onClick={salinTautan} className={tombolKedua}>
              {salin ? "Tautan tersalin" : "Salin tautan"}
            </button>
          </div>
        ) : (
          <ol className="mt-4 space-y-2.5 text-[13.5px] leading-relaxed">
            <li className="flex gap-2.5">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#1F5FD1] text-[12px] font-extrabold text-white">1</span>
              <span>
                Di Chrome, ketuk menu <b>⋮</b> (tiga titik) di pojok kanan atas.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#1F5FD1] text-[12px] font-extrabold text-white">2</span>
              <span>
                Pilih <b>Instal aplikasi</b> (atau <b>Tambahkan ke layar utama</b>), lalu ketuk <b>Instal</b>.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#1F5FD1] text-[12px] font-extrabold text-white">3</span>
              <span>Buka SIGAP dari ikon di layar utama.</span>
            </li>
          </ol>
        )}

        <p className="mt-4 rounded-[12px] bg-[#F5F8FE] p-3 text-[12.5px] leading-relaxed text-[#5B6B84]">
          <b className="text-[#0F2A52]">Sudah pernah memasang?</b> Jangan buka dari browser. Ketuk ikon <b>SIGAP</b> di layar utama atau daftar aplikasi HP.
        </p>

      </div>
    </Layar>
  );
}

export default function GerbangAplikasi({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wajib = jalurWajibApp(pathname);
  const [status, setStatus] = useState<Status>("cek");
  const periksa = useCallback(() => setStatus(bacaStatus()), []);

  useEffect(() => {
    if (!wajib) return;
    periksa();
    // setelah pemasangan, mode tampilan bisa berubah tanpa memuat ulang
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener?.("change", periksa);
    return () => mq.removeEventListener?.("change", periksa);
  }, [wajib, periksa, pathname]);

  if (!wajib || status === "lolos") return <>{children}</>;
  if (status === "blok") return <ModalPasang />;
  // "cek": sekejap sebelum browser diperiksa -- jangan tampilkan isi aplikasi dulu
  return (
    <Layar>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/sigap-logo.png" alt="SIGAP" width={72} height={72} className="h-[72px] w-[72px] rounded-[18px] bg-white object-contain p-2" />
    </Layar>
  );
}
