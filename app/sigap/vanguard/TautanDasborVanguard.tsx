"use client";

// app/sigap/vanguard/TautanDasborVanguard.tsx
//
// (1 Nov 2026) VANGUARD V5a: pintasan dari layar Kelola (Kelola Pelatihan dan Fitur kegiatan Kelola Pendataan) ke dasbor Vanguard kegiatan itu. Tampil hanya bila
// kegiatan memakai Vanguard dan akun boleh melihat dasbornya: daftar diambil dari GET /api/sigap/vanguard/admin (sudah menyaring izin dan penyalaan).
// Gagal memuat = diam (pintasan tambahan, bukan bagian wajib layar).

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { alamatDasbor } from "@/lib/vanguard/navigasi";

export default function TautanDasborVanguard({ kegiatanId }: { kegiatanId: number | null }) {
  const [ada, setAda] = useState(false);
  const [dari, setDari] = useState("/");

  useEffect(() => {
    setDari(`${window.location.pathname}${window.location.search}`);
    if (!kegiatanId) { setAda(false); return; }
    let batal = false;
    apiPortal<{ daftar?: { id: number }[] }>("/api/sigap/vanguard/admin")
      .then((r) => { if (!batal) setAda(Array.isArray(r.daftar) && r.daftar.some((k) => k.id === kegiatanId)); })
      .catch(() => { if (!batal) setAda(false); });
    return () => { batal = true; };
  }, [kegiatanId]);

  if (!ada || !kegiatanId) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#D8CCF5] bg-[#F5F0FF] px-3 py-2 text-[13px] text-[#3B1F8F]">
      <span>Kegiatan ini memakai <b>Vanguard</b> (simulasi pengisian kuesioner).</span>
      <Link href={alamatDasbor({ kegiatan: kegiatanId, dari })} className="inline-flex min-h-[40px] items-center rounded-full bg-[#5B34C9] px-4 text-[13px] font-extrabold text-white">
        Buka dasbor dan pengaturan →
      </Link>
    </div>
  );
}
