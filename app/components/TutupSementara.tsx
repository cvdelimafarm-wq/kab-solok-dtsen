"use client";

// app/components/TutupSementara.tsx
//
// (10 Okt 2026) Modal penutupan sementara SIGAP yang TIDAK bisa ditutup -- permintaan user: "Sedang menyiapkan lembar kerja
// identifikasi SLS", halaman SIGAP ditutup sampai pukul 13.00 untuk semua petugas selain M. Iqbal Hadi (akun super, termasuk saat
// ia "masuk sebagai" PPL). Keputusan tutup/buka dari server (/api/sigap/tutup, jam server); terbuka sendiri setelah 13.00.
// Berlaku di Beranda "/" dan seluruh /sigap/* (termasuk tautan Transport Lokal bertoken). Halaman Masuk (belum login) tetap bisa
// dipakai supaya akun super dapat masuk; setelah petugas lain masuk, modal muncul.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Status = { tutup: boolean; sampai: string; judul: string; pesan: string; sekarang: string; masuk?: boolean };

function bacaSesi(): string | null {
  try {
    const s = localStorage.getItem("sigap_sesi");
    const sampai = localStorage.getItem("sigap_sesi_sampai");
    if (!s) return null;
    if (sampai && Date.parse(sampai) < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

function halamanSigap(p: string | null): boolean {
  if (!p) return false;
  return p === "/" || p === "/sigap" || p.startsWith("/sigap/");
}

function sisaWaktu(ms: number): string {
  if (ms <= 0) return "sebentar lagi";
  const m = Math.ceil(ms / 60_000);
  const j = Math.floor(m / 60);
  return j > 0 ? `${j} jam ${m % 60} menit lagi` : `${m} menit lagi`;
}

export default function TutupSementara() {
  const pathname = usePathname();
  const [st, setSt] = useState<Status | null>(null);
  const [adaSesi, setAdaSesi] = useState(false);
  const [selisih, setSelisih] = useState(0); // jam server - jam HP
  const [, setTik] = useState(0);
  const sesiTerakhir = useRef<string | null | undefined>(undefined);

  const periksa = useCallback(async () => {
    const sesi = bacaSesi();
    sesiTerakhir.current = sesi;
    setAdaSesi(!!sesi);
    try {
      const r = await fetch("/api/sigap/tutup", { headers: sesi ? { Authorization: `Bearer ${sesi}` } : {}, cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as Status;
      setSelisih(Date.parse(d.sekarang) - Date.now());
      setSt(d);
    } catch {
      /* jaringan putus: pertahankan status terakhir */
    }
  }, []);

  useEffect(() => {
    if (!halamanSigap(pathname)) return;
    periksa();
    // cek ulang tiap menit (buka sendiri setelah 13.00) & segera saat sesi berubah (baru masuk / keluar)
    const lambat = setInterval(periksa, 60_000);
    const cepat = setInterval(() => {
      setTik((t) => t + 1);
      if (bacaSesi() !== sesiTerakhir.current) periksa();
    }, 3_000);
    return () => {
      clearInterval(lambat);
      clearInterval(cepat);
    };
  }, [pathname, periksa]);

  // halaman Masuk (Beranda tanpa sesi) & /sigap/masuk tetap bisa dipakai
  const halamanMasuk = pathname === "/sigap/masuk" || (pathname === "/" && !adaSesi);
  const blok = !!st?.tutup && halamanSigap(pathname) && !halamanMasuk;

  useEffect(() => {
    if (!blok) return;
    const lama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = lama;
    };
  }, [blok]);

  if (!blok || !st) return null;
  const sisa = Date.parse(st.sampai) - (Date.now() + selisih);

  function keluar() {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("sigap_")) localStorage.removeItem(k);
    } catch {
      /* abaikan */
    }
    window.location.href = "/";
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0F2A52]/80 p-4 backdrop-blur-sm" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="judul-tutup" aria-describedby="isi-tutup" className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF1CC] text-[28px]" aria-hidden>
          🛠️
        </div>
        <h2 id="judul-tutup" className="mt-3 text-[19px] font-extrabold leading-snug text-[#0F2A52]">
          {st.judul}
        </h2>
        <p id="isi-tutup" className="mt-2 text-[14.5px] leading-relaxed text-[#1B2B4B]">
          {st.pesan}
        </p>
        <div className="mt-4 rounded-xl bg-[#EEF3FB] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#55657D]">Dibuka kembali</p>
          <p className="text-[22px] font-extrabold tabular-nums text-[#0F2A52]">13.00 WIB</p>
          <p className="text-[12.5px] text-[#55657D]">{sisaWaktu(sisa)} · halaman terbuka otomatis</p>
        </div>
        {adaSesi && (
          <button type="button" onClick={keluar} className="mt-4 text-[12.5px] font-semibold text-[#55657D] underline">
            Keluar dari akun ini
          </button>
        )}
      </div>
    </div>
  );
}
