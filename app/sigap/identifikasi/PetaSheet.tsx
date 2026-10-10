"use client";

// app/sigap/identifikasi/PetaSheet.tsx
//
// (10 Okt 2026) Lembar bawah "Peta" -- permintaan user: ikon peta di sebelah nama nagari untuk melihat peta WA (desa) dan peta SLS.
// Berkas diunggah belakangan ke bucket Storage "peta-wilayah"; yang belum ada tampil "Belum diunggah". Tautan dari /api/portal/peta (berlaku 1 jam).

import { useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";

type Berkas = { nama: string; url: string; tipe: "pdf" | "gambar"; halaman: number; dari: number };
type Hasil = { wa: Record<string, Berkas[]>; sls: Record<string, Berkas[]> };
export type SubPeta = { idsubsls: string; nama: string; sub: string };

export function IkonPeta({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z" />
      <path d="M9 4v13M15 7v13" />
    </svg>
  );
}

function Lembar({ berkas }: { berkas: Berkas[] | undefined }) {
  if (!berkas || berkas.length === 0) return <span className="rounded-full bg-[#EEF2F7] px-3 py-1.5 text-[12px] font-bold text-[#8A97AB]">Belum diunggah</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {berkas.map((b) => (
        <a key={b.nama} href={b.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[#E6EEFC] px-3 text-[12.5px] font-extrabold text-[#1F5FD1] active:bg-[#D3E0F5]">
          <IkonPeta className="h-3.5 w-3.5" />
          {b.dari > 1 ? `Lembar ${b.halaman} dari ${b.dari}` : "Buka peta"}
        </a>
      ))}
    </span>
  );
}

export default function PetaSheet({ buka, onTutup, judul, desa, subs }: { buka: boolean; onTutup: () => void; judul: string; desa: string | null; subs: SubPeta[] }) {
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const kunci = `${desa ?? ""}|${subs.map((s) => s.idsubsls).join(",")}`;

  useEffect(() => {
    if (!buka) return;
    let batal = false;
    setHasil(null);
    setGalat(null);
    const q = new URLSearchParams();
    if (desa) q.set("desa", desa);
    if (subs.length) q.set("sub", subs.map((s) => s.idsubsls).join(","));
    apiPortal<Hasil>(`/api/portal/peta?${q.toString()}`)
      .then((h) => !batal && setHasil(h))
      .catch((e) => !batal && setGalat(e instanceof Error ? e.message : "Gagal memuat peta."));
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka, kunci]);

  if (!buka) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F2A52]/45" onClick={onTutup} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={judul} onClick={(e) => e.stopPropagation()} className="max-h-[82vh] w-full max-w-xl overflow-y-auto rounded-t-[26px] bg-white px-4 pb-6 pt-3 shadow-[0_-12px_40px_rgba(15,42,82,.25)]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#D3DCEA]" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#6B7A90]">Peta wilayah</p>
            <h2 className="text-[17px] font-extrabold leading-tight text-[#0F2A52]">{judul}</h2>
          </div>
          <button type="button" onClick={onTutup} className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[#EEF2F7] text-[18px] font-bold text-[#55657D]" aria-label="Tutup">
            ×
          </button>
        </div>

        {galat && <p className="mt-3 rounded-[12px] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!hasil && !galat && <div className="mt-4 h-16 animate-pulse rounded-[14px] bg-[#EEF2F7]" aria-busy="true" />}

        {hasil && (
          <div className="mt-3 space-y-3">
            {desa && (
              <div className="rounded-[16px] bg-[#F1F6FE] p-3">
                <b className="block text-[13.5px] text-[#0F2A52]">Peta WA (wilayah administrasi desa)</b>
                <small className="block text-[11.5px] text-[#55657D]">Batas nagari/desa</small>
                <div className="mt-2">
                  <Lembar berkas={hasil.wa[desa]} />
                </div>
              </div>
            )}
            {subs.length > 0 && (
              <div className="rounded-[16px] bg-[#F1F6FE] p-3">
                <b className="block text-[13.5px] text-[#0F2A52]">Peta SLS</b>
                <small className="block text-[11.5px] text-[#55657D]">Satu peta untuk tiap Sub SLS wilayah Anda</small>
                <ul className="mt-2 divide-y divide-[#DCE6F6]">
                  {subs.map((s) => (
                    <li key={s.idsubsls} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0 text-[12.5px] font-bold leading-tight text-[#0F2A52]">
                        <span className="break-words">{s.nama}</span>
                        <span className="block text-[11px] font-semibold text-[#6B7A90]">Sub {s.sub}</span>
                      </span>
                      <Lembar berkas={hasil.sls[s.idsubsls]} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11.5px] leading-snug text-[#6B7A90]">Peta terbuka di tab baru. Yang bertanda "Belum diunggah" sedang disiapkan admin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
