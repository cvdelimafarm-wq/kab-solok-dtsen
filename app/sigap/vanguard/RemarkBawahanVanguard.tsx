"use client";

// app/sigap/vanguard/RemarkBawahanVanguard.tsx
//
// (1 Nov 2026) VANGUARD V5c: remark "tidak lulus Vanguard, tetap mendata dengan pendampingan khusus" untuk level di atas petugas yang bermasalah (tab Hari Ini):
// PML melihat PPL yang tidak lulus; supervisor/korwil melihat PPL dan PML. Aturan dan izin diputuskan server (GET /api/sigap/vanguard/remark); tidak tampil bila
// kosong atau gagal memuat. Hanya informasi: petugas tersebut tetap boleh mendata.

import { useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";

type Baris = { akun_id: number; nama: string; peran: string; nilai: number; benar: number; dibuka: number; remark: string };
const NAMA_PERAN: Record<string, string> = { ppl: "PPL", pml: "PML" };

export default function RemarkBawahanVanguard({ kegiatanId }: { kegiatanId: number }) {
  const [daftar, setDaftar] = useState<Baris[]>([]);
  useEffect(() => {
    let batal = false;
    apiPortal<{ remark?: Baris[] }>(`/api/sigap/vanguard/remark?kegiatan=${kegiatanId}`)
      .then((r) => { if (!batal) setDaftar(Array.isArray(r.remark) ? r.remark : []); })
      .catch(() => { if (!batal) setDaftar([]); });
    return () => { batal = true; };
  }, [kegiatanId]);

  if (daftar.length === 0) return null;
  return (
    <section aria-label="Pendampingan khusus Vanguard" className="rounded-[18px] border border-[#F0D79A] bg-[#FFF8E6] p-3.5 text-[#5A3B00]">
      <b className="block text-[14px] font-extrabold">Pendampingan khusus · Vanguard</b>
      <span className="block text-[12.5px] leading-snug">Petugas berikut tidak lulus Vanguard (percobaan sudah habis). Mereka tetap dapat mendata, dengan pendampingan khusus.</span>
      <ul className="mt-2 space-y-1.5">
        {daftar.map((b) => (
          <li key={b.akun_id} className="rounded-[12px] bg-white px-3 py-2 text-[13px]">
            <b>{b.nama}</b> <span className="text-[#6B7A90]">· {NAMA_PERAN[b.peran] ?? b.peran}</span>
            <span className="block text-[12px] text-[#7A5B1F]">Nilai {b.nilai}% ({b.benar} dari {b.dibuka} kasus benar)</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
