"use client";

// app/sigap/KartuRoleplayHariIni.tsx
//
// (8 Nov 2026) Kartu "Roleplaying by Vanguard" (langkah 8) di tab Hari ini. Tampil HANYA bila roleplay dicentang di Kelola Pelatihan dan akun berhak
// (peserta kelas, instruktur kelas, atau panitia/admin); server yang memutuskan (GET /api/sigap/vanguard/roleplay?kegiatan=ID). Gagal memuat = tidak tampil.
// Punya id "langkah-roleplay" sebagai tujuan ikon langkah di lajur pelatihan. Poin roleplay tidak masuk nilai pelatihan.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRoleplaySaya } from "@/app/sigap/roleplaySaya";
import { alamatRoleplay } from "@/app/sigap/vanguard/roleplay/tipe";

export default function KartuRoleplayHariIni({ kegiatanId }: { kegiatanId: number }) {
  const rp = useRoleplaySaya(kegiatanId);
  const [href, setHref] = useState<string>(() => alamatRoleplay(kegiatanId, "/"));
  useEffect(() => {
    setHref(alamatRoleplay(kegiatanId, `${window.location.pathname}${window.location.search}`));
  }, [kegiatanId]);

  if (!rp.ada) return null;
  const l = rp.langkah;
  const peserta = rp.peran === "peserta";
  const ket = !peserta
    ? "Buka sesi, periksa jawaban peserta, dan tandai yang benar"
    : !l || !l.ada ? "Menunggu instruktur membuka roleplay"
    : l.selesai ? "Roleplay selesai · lihat poin dan review jawaban Anda"
    : l.terbuka && !l.sudahIsi ? "Sedang berjalan · isi jawaban responden di Vanguard Anda"
    : l.terbuka ? "Sedang berjalan · jawaban Anda tersimpan, bisa dilengkapi"
    : "Roleplay bareng kelas";
  const tombol = !peserta ? "Kelola roleplay kelas" : l?.selesai ? "Lihat hasil" : l?.terbuka ? "Isi jawaban" : "Buka roleplay";
  return (
    <Link
      id="langkah-roleplay"
      href={href}
      aria-label={`Buka Roleplaying by Vanguard. ${ket}`}
      className={`block scroll-mt-24 rounded-[18px] border border-[#D8CCF5] bg-white p-3.5 active:opacity-95 ${rp.mendesak ? "shadow-[0_0_0_3px_#FFC000]" : "shadow-[0_4px_14px_rgba(42,23,99,.10)]"}`}
    >
      <span className="flex items-center gap-3">
        <span className="grid h-[44px] w-[44px] flex-none place-items-center rounded-[12px] bg-[#F1EBFF] text-[20px]" aria-hidden>🎭</span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-extrabold leading-snug text-[#2A1763]">Roleplaying by Vanguard</b>
          <span className="block text-[12.5px] leading-snug text-[#55657D]">{ket}</span>
        </span>
        {rp.mendesak && <span className="flex-none rounded-full bg-[#FFC000] px-2.5 py-[3px] text-[11px] font-extrabold text-[#111]">Berjalan</span>}
      </span>
      <span className="mt-2.5 inline-flex min-h-[44px] items-center rounded-[12px] bg-[#2A1763] px-4 text-[13.5px] font-extrabold text-white">{tombol}</span>
      <span className="mt-1.5 block text-[11.5px] text-[#6B7A90]">Latihan kelas · poin tidak masuk nilai pelatihan</span>
    </Link>
  );
}
