"use client";

// app/sigap/admin/PeringatanBeban.tsx
//
// (1 Nov 2026) Panel peringatan beban untuk calon petugas yang dipilih pada "Tambah petugas ke kegiatan" (penunjukan langsung): beban Delego 4 pekan ke depan
// dan penugasan kegiatan lain yang beririsan. Hanya peringatan; tombol Tambah tidak diblokir. API: /api/sigap/admin/beban-calon.

import { useEffect, useState } from "react";
import { fetchJson } from "./api";
import { tglIndo } from "@/lib/sigapKelasIdent";
import type { MingguBeban, PenugasanLain, PeringatanCalon } from "@/lib/sigapBebanCalon";

type Data = { akun: { id: number; nama: string; jenis: string }; hari: string; minggu: MingguBeban[]; delegasi_aktif: number; penugasan_lain: PenugasanLain[]; peringatan: PeringatanCalon };

const GAYA = {
  aman: { kotak: "border-[#BFE5CF] bg-[#EFFAF3]", judul: "text-[#13794B]", label: "Aman" },
  perhatian: { kotak: "border-[#F2D98A] bg-[#FFF8E1]", judul: "text-[#8A6200]", label: "Perlu diperhatikan" },
  berat: { kotak: "border-[#F2B8BB] bg-[#FDECEC]", judul: "text-[#B42329]", label: "Beban berat" },
} as const;
const WARNA_PERSEN = (k: MingguBeban["kategori"]) => (k === "berlebih" ? "bg-[#FBD5D8] text-[#8E1B20]" : k === "sasaran" ? "bg-[#FCEBB8] text-[#7A5600]" : "bg-[#E3EEFB] text-[#1D4F91]");

export default function PeringatanBeban({ akunId, kegiatanId }: { akunId: number; kegiatanId: number }) {
  const [d, setD] = useState<Data | null>(null);
  const [gagal, setGagal] = useState(false);
  useEffect(() => {
    let batal = false;
    setD(null);
    setGagal(false);
    fetchJson<Data>(`/api/sigap/admin/beban-calon?akun_id=${akunId}&kegiatan_id=${kegiatanId}`)
      .then((r) => !batal && setD(r))
      .catch(() => !batal && setGagal(true));
    return () => {
      batal = true;
    };
  }, [akunId, kegiatanId]);

  if (gagal) return <p className="mt-2 text-[12px] text-[#7B8794]">Peringatan beban tidak bisa dimuat; penambahan tetap bisa dilanjutkan.</p>;
  if (!d) return <p className="mt-2 text-[12px] text-[#7B8794]">Memeriksa beban tugas…</p>;
  const g = GAYA[d.peringatan.tingkat];
  return (
    <div className={`mt-2 rounded-xl border px-3 py-2 text-[12.5px] ${g.kotak}`} data-testid="peringatan-beban">
      <p className={`font-bold ${g.judul}`}>
        Beban tugas {d.akun.nama}: {g.label}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[#34455F]">
        {d.peringatan.pesan.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[#55657D]">
        <span>Delego aktif: {d.delegasi_aktif}. Beban per pekan:</span>
        {d.minggu.map((m) => (
          <span key={m.mulai} className={`rounded-md px-1.5 py-[1px] font-semibold ${WARNA_PERSEN(m.kategori)}`} title={`${m.poin} dari ${m.kapasitas} poin`}>
            {tglIndo(m.mulai).replace(/ \d{4}$/, "")} · {m.persen}%
          </span>
        ))}
      </div>
    </div>
  );
}

