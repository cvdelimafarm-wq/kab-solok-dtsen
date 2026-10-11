"use client";

// app/portal/KartuPetaOffline.tsx
//
// (10 Okt 2026) Status & tombol cadangan "Unduh peta untuk offline" (petaOffline.ts): berapa peta wilayah kerja sudah tersimpan di HP.
// Unduhan otomatis berjalan sendiri saat sinyal bagus; tombol ini untuk memaksa (mis. sebelum berangkat ke lokasi tanpa sinyal).

import { useState } from "react";
import { daftarPetaDari, useStatusPeta } from "./petaOffline";

export default function KartuPetaOffline({ idsubsls }: { idsubsls: string[] }) {
  const daftar = daftarPetaDari(idsubsls);
  const { status, belumDicek, unduh } = useStatusPeta(daftar);
  const [pesan, setPesan] = useState<string | null>(null);
  if (daftar.subs.length === 0) return null;
  const jalan = !!status?.jalan;
  const lengkap = !!status && !belumDicek && status.total > 0 && status.tersimpan >= status.total;
  const teks = !status
    ? "Memeriksa…"
    : lengkap
      ? `Semua peta wilayah Anda (${status.tersimpan} berkas) tersimpan di HP. Bisa dibuka tanpa sinyal.`
      : belumDicek && status.total === 0
        ? "Peta wilayah Anda belum diunduh ke HP."
        : `${status.tersimpan} dari ${status.total} berkas peta tersimpan di HP.${status.berhenti === "sinyal" ? " Berhenti karena sinyal lemah; dilanjutkan otomatis nanti." : ""}`;
  return (
    <section aria-label="Peta untuk offline" className="rounded-[18px] bg-white p-3.5 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <b className="block text-[13.5px] text-[#0F2A52]">Peta untuk offline</b>
          <small className="block text-[12px] leading-snug text-[#55657D]">{jalan ? `Mengunduh… ${status?.tersimpan ?? 0}${status?.total ? ` dari ${status.total}` : ""}` : teks}</small>
        </span>
        {!lengkap && (
          <button
            type="button"
            disabled={jalan}
            onClick={async () => {
              setPesan(null);
              const h = await unduh();
              if (h.berhenti === "luring") setPesan("Tidak ada sambungan internet.");
              else if (h.berhenti === "sinyal") setPesan("Sinyal lemah. Tersimpan yang sudah terunduh; coba lagi di tempat bersinyal baik.");
              else if (h.berhenti === "galat") setPesan("Sebagian peta belum bisa diunduh. Peta tetap bisa dibuka lewat internet.");
              else if (h.berhenti === "tidak_didukung") setPesan("Browser ini belum mendukung simpan peta offline.");
            }}
            className="min-h-[44px] flex-none rounded-full bg-[#1F5FD1] px-4 text-[12.5px] font-extrabold text-white active:bg-[#1A4FB8] disabled:opacity-60"
          >
            {jalan ? "Mengunduh…" : "Unduh peta"}
          </button>
        )}
      </div>
      {pesan && <p role="status" className="mt-2 rounded-[12px] bg-[#FFF4D6] px-3 py-2 text-[12px] leading-snug text-[#6B4A00]">{pesan}</p>}
    </section>
  );
}
