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
  izinBrowserBerlaku,
  jalurPasang,
  jalurWajibApp,
  modeAplikasi,
  perangkatSeluler,
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

// (9 Okt 2026) Halaman pasang dirombak -- permintaan user: redaksi singkat ber-"hook" dan ramah, "perbaiki agar semua masalah
// teratasi", dan "utamakan tombol pintas seperti install agar terlihat lebih dipercaya".
// - Kartu ala toko aplikasi (logo, nama, penerbit BPS Kabupaten Solok, lencana Resmi/Gratis/Tanpa Play Store) supaya terasa resmi.
// - Di Android SELALU ada tombol utama "Instal SIGAP": bila dialog bawaan siap -> langsung dialog Instal; bila belum datang dalam
//   beberapa detik (atau pengguna sempat membatalkan) -> tombol yang sama membuka langkah cadangan menu ⋮.
// - Browser di dalam WhatsApp/FB/IG -> tombol utama "Buka di Chrome". iPhone -> langkah sesuai Safari/Chrome iPhone, atau salin tautan.
// - Bila Chrome mendeteksi SIGAP sudah terpasang di HP ini (getInstalledRelatedApps + related_applications di manifest) -> arahkan
//   membuka dari ikon, bukan meminta pasang ulang.

const TUNGGU_DIALOG_MS = 4000; // beforeinstallprompt biasanya datang < 2 detik setelah halaman dimuat

function IkonUnduh() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}

function IkonBagikan() {
  // ikon Bagikan iPhone (kotak + panah ke atas), disisipkan dalam teks langkah
  return (
    <svg viewBox="0 0 24 24" className="mx-0.5 inline h-[18px] w-[18px] -translate-y-[2px] text-[#1F5FD1]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="Bagikan">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

function IkonCentang({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Putar() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />;
}

function Langkah({ no, children }: { no: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#E6EEFC] text-[12px] font-extrabold text-[#1F5FD1]">{no}</span>
      <span className="pt-[1px]">{children}</span>
    </li>
  );
}

/** Kartu identitas aplikasi ala toko aplikasi: membuat tombol Instal terasa resmi dan aman. */
function KartuAplikasi() {
  return (
    <div className="flex items-center gap-3.5">
      <span className="grid h-16 w-16 flex-none place-items-center rounded-[18px] border border-[#E4ECF8] bg-white shadow-[0_6px_16px_rgba(15,42,82,.12)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sigap-logo.png" alt="Logo SIGAP" width={46} height={46} className="h-[46px] w-[46px] object-contain" />
      </span>
      <div className="min-w-0">
        <p className="text-[20px] font-extrabold leading-none text-[#0F2A52]">SIGAP</p>
        <p className="mt-1 text-[12.5px] font-semibold text-[#5B6B84]">BPS Kabupaten Solok</p>
        <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#E3F6EC] px-2 py-[3px] text-[11px] font-extrabold text-[#13794B]">
          <IkonCentang className="h-3 w-3" /> Aplikasi resmi
        </p>
      </div>
    </div>
  );
}

function ModalPasang() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const jalur = jalurPasang(ua, typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints);
  const [siap, setSiap] = useState(false); // dialog pasang bawaan tersedia
  const [habisTunggu, setHabisTunggu] = useState(false); // dialog bawaan tidak datang dalam TUNGGU_DIALOG_MS
  const [proses, setProses] = useState<"diam" | "memasang" | "terpasang" | "batal">("diam");
  const [tampilLangkah, setTampilLangkah] = useState(false); // langkah cadangan menu ⋮ (Android)
  const [sudahDiHp, setSudahDiHp] = useState(false); // Chrome melaporkan SIGAP sudah terpasang di HP ini
  const [salin, setSalin] = useState(false);

  useEffect(() => {
    const perbarui = () => setSiap(!!window.__sigapPasang);
    perbarui();
    window.addEventListener(EVENT_SIAP_PASANG, perbarui);
    const terpasang = () => setProses("terpasang");
    window.addEventListener("appinstalled", terpasang);
    const t = window.setTimeout(() => setHabisTunggu(true), TUNGGU_DIALOG_MS);
    // Chrome Android: apakah PWA ini sudah terpasang? (butuh related_applications di manifest; diam bila tidak didukung)
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
    nav.getInstalledRelatedApps?.()
      .then((a) => {
        if (Array.isArray(a) && a.length > 0) setSudahDiHp(true);
      })
      .catch(() => {});
    return () => {
      window.removeEventListener(EVENT_SIAP_PASANG, perbarui);
      window.removeEventListener("appinstalled", terpasang);
      window.clearTimeout(t);
    };
  }, []);

  async function pasang() {
    const ev = window.__sigapPasang;
    if (!ev) {
      // dialog bawaan belum/tidak tersedia: tombol yang sama menampilkan cara manual (tetap satu tombol utama)
      setTampilLangkah(true);
      return;
    }
    setProses("memasang");
    try {
      await ev.prompt();
      const hasil = await ev.userChoice.catch(() => null);
      window.__sigapPasang = null; // hanya bisa dipakai sekali
      setSiap(false);
      if (hasil?.outcome === "accepted") setProses("terpasang");
      else {
        setProses("batal");
        setTampilLangkah(true); // Chrome menahan dialog untuk sementara setelah dibatalkan; sediakan jalan manual
      }
    } catch {
      setProses("batal");
      setTampilLangkah(true);
    }
  }

  async function salinTautan() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setSalin(true);
      setTimeout(() => setSalin(false), 2500);
    } catch {
      window.prompt("Salin tautan ini lalu buka di Safari/Chrome:", window.location.href);
    }
  }

  const chrome = typeof window === "undefined" ? null : tautanBukaChrome(window.location.href);
  const tombolUtama =
    "mt-5 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#1F5FD1] px-4 text-[16px] font-extrabold text-white no-underline shadow-[0_8px_18px_rgba(31,95,209,.3)] transition hover:bg-[#1A4FB8] active:scale-[.99] disabled:cursor-wait disabled:opacity-80";
  const tombolKedua =
    "mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-[13px] border border-[#CBD6E6] bg-white px-4 text-[14px] font-bold text-[#1B2B4B] transition hover:bg-[#F5F8FE]";
  const menunggu = jalur === "android" && !siap && !habisTunggu && proses === "diam" && !sudahDiHp;

  return (
    <Layar>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-pasang" className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-[24px] bg-white p-5 text-[#1B2B4B] shadow-2xl">
        <KartuAplikasi />

        <ul className="mt-3.5 flex flex-wrap gap-1.5 text-[11.5px] font-bold text-[#44546F]">
          {["Gratis", "Tanpa Play Store", "Ringan"].map((x) => (
            <li key={x} className="inline-flex items-center gap-1 rounded-full bg-[#F1F5FC] px-2.5 py-1">
              <IkonCentang className="h-3 w-3 text-[#1F5FD1]" /> {x}
            </li>
          ))}
        </ul>

        <h2 id="judul-pasang" className="mt-4 text-[21px] font-extrabold leading-tight text-[#0F2A52]">
          SIGAP kini ada di layar HP Anda 📲
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[#5B6B84]">
          Pasang sekali, buka dengan satu ketukan. Lebih cepat, layar penuh, dan pengingat pelatihan tetap masuk walau aplikasi ditutup.
        </p>

        {proses === "terpasang" ? (
          <div className="mt-5 rounded-[14px] bg-[#E3F6EC] p-3.5 text-[13.5px] leading-relaxed text-[#13794B]" role="status">
            <b className="flex items-center gap-1.5 text-[15px]">
              <IkonCentang className="h-4 w-4" /> Berhasil!
            </b>
            Ikon <b>SIGAP</b> sedang ditambahkan. Buka dari layar utama, lalu masuk dengan nama dan PIN.
          </div>
        ) : sudahDiHp && jalur === "android" ? (
          <div className="mt-5 rounded-[14px] bg-[#E3F6EC] p-3.5 text-[13.5px] leading-relaxed text-[#13794B]" role="status">
            <b className="flex items-center gap-1.5 text-[15px]">
              <IkonCentang className="h-4 w-4" /> SIGAP sudah terpasang
            </b>
            Tutup browser ini, lalu ketuk ikon <b>SIGAP</b> di layar utama atau daftar aplikasi HP.
          </div>
        ) : jalur === "android" ? (
          <>
            <button type="button" onClick={pasang} disabled={menunggu || proses === "memasang"} className={tombolUtama}>
              {menunggu || proses === "memasang" ? <Putar /> : <IkonUnduh />}
              {proses === "memasang" ? "Membuka jendela pasang…" : menunggu ? "Menyiapkan…" : "Instal SIGAP"}
            </button>
            {siap && !tampilLangkah && <p className="mt-2 text-center text-[12.5px] text-[#6B7A90]">Ketuk <b>Instal</b> di jendela yang muncul. Selesai dalam hitungan detik.</p>}
            {tampilLangkah && (
              <div className="mt-3 rounded-[14px] bg-[#F5F8FE] p-3.5">
                <p className="text-[13px] font-bold text-[#0F2A52]">{proses === "batal" ? "Belum terpasang. Pasang lewat menu Chrome:" : "Pasang lewat menu Chrome:"}</p>
                <ol className="mt-2 space-y-2 text-[13.5px] leading-relaxed">
                  <Langkah no={1}>
                    Ketuk <b>⋮</b> di pojok kanan atas.
                  </Langkah>
                  <Langkah no={2}>
                    Pilih <b>Instal aplikasi</b>, lalu ketuk <b>Instal</b>.
                  </Langkah>
                </ol>
                {chrome && (
                  <p className="mt-2.5 text-[12.5px] text-[#6B7A90]">
                    Menu itu tidak ada?{" "}
                    <a href={chrome} className="font-bold text-[#1F5FD1]">
                      Buka di Chrome
                    </a>
                  </p>
                )}
              </div>
            )}
          </>
        ) : jalur === "tertanam-android" ? (
          <>
            {chrome ? (
              <a href={chrome} className={tombolUtama}>
                Buka di Chrome untuk instal
              </a>
            ) : (
              <button type="button" onClick={salinTautan} className={tombolUtama}>
                {salin ? "Tautan tersalin" : "Salin tautan"}
              </button>
            )}
            <p className="mt-2 text-center text-[12.5px] leading-relaxed text-[#6B7A90]">Anda membuka dari WhatsApp. Pemasangan hanya bisa dari Chrome.</p>
            {chrome && (
              <button type="button" onClick={salinTautan} className={tombolKedua}>
                {salin ? "Tautan tersalin" : "Salin tautan"}
              </button>
            )}
          </>
        ) : jalur === "ios-lain" ? (
          <>
            <button type="button" onClick={salinTautan} className={tombolUtama}>
              {salin ? (
                <>
                  <IkonCentang className="h-4 w-4" /> Tautan tersalin
                </>
              ) : (
                "Salin tautan"
              )}
            </button>
            <p className="mt-2 text-center text-[12.5px] leading-relaxed text-[#6B7A90]">
              Di iPhone, pasang dari <b>Safari</b>: tempel tautan di Safari, lalu ikuti petunjuknya.
            </p>
          </>
        ) : (
          <div className="mt-5 rounded-[14px] border border-[#D8E3F5] bg-[#F5F8FE] p-3.5">
            <p className="text-[13px] font-bold text-[#0F2A52]">Pasang dalam 3 ketukan:</p>
            <ol className="mt-2 space-y-2 text-[13.5px] leading-relaxed">
              <Langkah no={1}>
                Ketuk <b>Bagikan</b>
                <IkonBagikan />
                {jalur === "ios-chrome" ? "di kanan atas kolom alamat." : "di bawah layar."}
              </Langkah>
              <Langkah no={2}>
                Pilih <b>Tambahkan ke Layar Utama</b>.
              </Langkah>
              <Langkah no={3}>
                Ketuk <b>Tambah</b>, lalu buka SIGAP dari ikonnya.
              </Langkah>
            </ol>
          </div>
        )}

        {!sudahDiHp && proses !== "terpasang" && (
          <p className="mt-4 text-center text-[12.5px] leading-relaxed text-[#6B7A90]">
            <b className="text-[#0F2A52]">Sudah terpasang?</b> Buka lewat ikon SIGAP, bukan dari browser.
          </p>
        )}
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
