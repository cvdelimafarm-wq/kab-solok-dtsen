"use client";

// app/sigap/identifikasi/KontakRekan.tsx
//
// (10 Okt 2026) Kartu kontak PML rekan untuk SLS yang dikerjakan bersama (pelaksana + pendamping) -- permintaan user:
// "tampilkan nama rekan dan nomor HPnya agar bisa dihubungi". Tombol Telepon (tel:) dan WhatsApp (wa.me) hanya bila nomor sah.
// Tidak membuka WhatsApp otomatis & tidak mengirim apa pun: hanya tautan yang diketuk pengguna.

import { hpTel, hpWa, type SubIdentifikasi } from "@/lib/identifikasi";

const tombol = "grid min-h-[44px] place-items-center rounded-full px-3.5 text-[12px] font-extrabold";

export default function KontakRekan({ s, kompak = false }: { s: Pick<SubIdentifikasi, "rekan" | "rekan_hp" | "peran">; kompak?: boolean }) {
  if (!s.rekan) return null;
  const tel = hpTel(s.rekan_hp);
  const wa = hpWa(s.rekan_hp);
  const peranRekan = s.peran === "pelaksana" ? "Pendamping" : "Pelaksana";
  return (
    <div className={`flex items-center justify-between gap-2 border-b border-[#EEF2F7] bg-[#FFFBEF] ${kompak ? "px-3.5 py-1.5" : "rounded-[12px] px-3 py-2"}`}>
      <div className="min-w-0 text-[12px] leading-tight text-[#0F2A52]">
        <span className="block text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#8A6200]">Dikerjakan bersama · {peranRekan}</span>
        <b className="block break-words text-[13px]">{s.rekan}</b>
        <span className="block text-[12px] text-[#55657D]">{tel ?? "Nomor HP belum tercatat"}</span>
      </div>
      {tel && (
        <div className="flex flex-none gap-1.5">
          <a href={`tel:${tel}`} className={`${tombol} bg-[#E3F6EC] text-[#13794B] active:bg-[#CFEEDD]`} aria-label={`Telepon ${s.rekan}`}>
            Telepon
          </a>
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={`${tombol} bg-[#D7F3E0] text-[#0E6B3A] active:bg-[#C2EBD1]`} aria-label={`WhatsApp ${s.rekan}`}>
              WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}
