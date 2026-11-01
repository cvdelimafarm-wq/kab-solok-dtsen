"use client";

// app/sigap/KartuVanguardHariIni.tsx
//
// (1 Nov 2026) Kartu VANGUARD di tab Hari Ini petugas (halaman Translok): tampil HANYA bila Vanguard menyala di kegiatan ini (centang manual atau jawaban Ya pada
// Identifikasi survei) dan akun adalah peserta aktif; keduanya diputuskan server (GET /api/sigap/vanguard?kegiatan=ID). Masuk lewat kartu ini = mode tercatat
// (membawa ?k=ID) dan membawa alamat halaman ini sebagai jalan pulang ("Kembali ke SIGAP" kembali ke tab Hari Ini). Gagal memuat = tidak tampil apa pun.

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { Lambang } from "@/app/sigap/vanguard/Logo";
import { alamatVanguard } from "@/lib/vanguard/navigasi";

type Keadaan = { mode: "bebas" | "tercatat"; boleh: boolean; riwayat: { kasus: string; benar: boolean }[] };

export default function KartuVanguardHariIni({ kegiatanId }: { kegiatanId: number }) {
  const [d, setD] = useState<{ benar: number } | null>(null);
  const [href, setHref] = useState<string>(() => alamatVanguard({ kegiatan: kegiatanId, dari: "/" }));

  useEffect(() => {
    setHref(alamatVanguard({ kegiatan: kegiatanId, dari: `${window.location.pathname}${window.location.search}` }));
    let batal = false;
    apiPortal<Keadaan>(`/api/sigap/vanguard?kegiatan=${kegiatanId}`)
      .then((r) => { if (!batal) setD(r.mode === "tercatat" && r.boleh ? { benar: r.riwayat.filter((x) => x.benar).length } : null); })
      .catch(() => { /* diam: kartu Vanguard hanya tambahan */ });
    return () => { batal = true; };
  }, [kegiatanId]);

  if (!d) return null;
  return (
    <Link href={href} aria-label="Buka Vanguard: latihan isi kuesioner, hasil Anda dicatat" className="block rounded-[18px] bg-gradient-to-br from-[#2A1763] to-[#5B34C9] p-3.5 text-white shadow-[0_8px_22px_rgba(42,23,99,.28)] active:opacity-95">
      <span className="flex items-center gap-3">
        <span className="grid h-[44px] w-[44px] flex-none place-items-center rounded-[12px] bg-white"><Lambang px={24} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-extrabold leading-snug">Vanguard · latihan isi kuesioner</b>
          <span className="block text-[12.5px] leading-snug text-[#D9CFF8]">{d.benar > 0 ? `${d.benar} kasus sudah benar` : "Pelatihan petugas"} · hasil Anda dicatat</span>
        </span>
        <span className="flex-none rounded-full bg-[#E3F6EC] px-2.5 py-[3px] text-[11px] font-bold text-[#0F5C38]">Dicatat</span>
      </span>
      <span className="mt-2.5 inline-flex min-h-[44px] items-center rounded-[12px] bg-[#FFC000] px-4 text-[13.5px] font-extrabold text-[#111]">Buka Vanguard</span>
    </Link>
  );
}
