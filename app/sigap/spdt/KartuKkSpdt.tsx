"use client";

// app/sigap/spdt/KartuKkSpdt.tsx
//
// (16 Okt 2026) Kartu satu KK (lembar bawah): nama, anggota keluarga lain, alamat prelist, wilayah, koordinat, tombol Navigasi.
// Hanya informasi -- tidak ada tombol hasil pendataan. Membuka kartu = "koordinat dipilih/dibuka hari ini" (dicatat untuk Monitoring).

import { useEffect, useState } from "react";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import Ik from "./Ik";
import { catatBukaKk } from "./useSpdt";
import { BATAS_AKURASI_M, akurasiRendah, judulKata, tautanLihat, tautanNavigasi, teksJarak, teksKoordinat, type KkSpdt } from "@/lib/spdtNtp";

export default function KartuKkSpdt({ kk, jarak, tampilPpl, onTutup }: { kk: KkSpdt; jarak: number | null; tampilPpl: boolean; onTutup: () => void }) {
  useTutupDenganBack(true, onTutup); // (31 Okt 2026) Back HP menutup lapisan ini
  const [tersalin, setTersalin] = useState(false);

  useEffect(() => {
    catatBukaKk(kk.id, false);
    setTersalin(false);
  }, [kk.id]);

  async function salin() {
    try {
      await navigator.clipboard.writeText(teksKoordinat(kk.lat, kk.lng));
      setTersalin(true);
      setTimeout(() => setTersalin(false), 1800);
    } catch {
      /* peramban menolak: abaikan */
    }
  }

  const rendah = akurasiRendah(kk.akurasi_m);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl px-2.5 pb-2.5" role="dialog" aria-label={`Koordinat ${kk.nama_kk}`}>
      <div className="rounded-[20px] bg-white p-4 shadow-[0_-8px_30px_rgba(15,42,82,.22)]">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-extrabold leading-tight text-[#0F2A52]">{kk.nama_kk}</h2>
            <p className="mt-0.5 text-[12.5px] text-[#55657D]">
              {judulKata(kk.jorong)} · {judulKata(kk.nagari)} · Kec. {judulKata(kk.kecamatan)}
            </p>
          </div>
          <button type="button" onClick={onTutup} aria-label="Tutup kartu" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[#EEF2F7] text-[#44546F] active:bg-[#DDE4EE]">
            <Ik n="tutup" />
          </button>
        </div>

        <dl className="mt-2 grid grid-cols-[96px_1fr] gap-x-3 gap-y-1 text-[13px]">
          {kk.anggota_lain && (
            <>
              <dt className="text-[#55657D]">Anggota lain</dt>
              <dd className="font-semibold text-[#1B2B4B]">{kk.anggota_lain}</dd>
            </>
          )}
          {kk.alamat && (
            <>
              <dt className="text-[#55657D]">Alamat prelist</dt>
              <dd className="font-semibold text-[#1B2B4B]">{kk.alamat}</dd>
            </>
          )}
          {tampilPpl && (
            <>
              <dt className="text-[#55657D]">PPL / PML</dt>
              <dd className="font-semibold text-[#1B2B4B]">
                {judulKata(kk.ppl_nama)} / {judulKata(kk.pml_nama)}
              </dd>
            </>
          )}
          <dt className="text-[#55657D]">Kode wilayah</dt>
          <dd className="font-semibold tabular-nums text-[#1B2B4B]">{kk.kode_wilayah}</dd>
          <dt className="text-[#55657D]">Koordinat</dt>
          <dd className="font-semibold tabular-nums text-[#1B2B4B]">
            {teksKoordinat(kk.lat, kk.lng)}
            {jarak != null && <span className="ml-1.5 font-bold text-[#1F5FD1]">· {teksJarak(jarak)} dari Anda</span>}
          </dd>
        </dl>

        {rendah && (
          <p className="mt-2 flex items-start gap-1.5 rounded-[12px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] leading-snug text-[#5E4300]">
            <Ik n="awas" className="mt-[1px] h-4 w-4 text-[#B77900]" />
            <span>
              Akurasi GPS titik ini {Math.round(kk.akurasi_m ?? 0)} m (lebih dari {BATAS_AKURASI_M} m). Letak sebenarnya bisa bergeser; tanyakan warga sekitar bila perlu.
            </span>
          </p>
        )}

        <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
          <a
            href={tautanNavigasi(kk.lat, kk.lng)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => catatBukaKk(kk.id, true)}
            className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-[#1F5FD1] text-[15px] font-extrabold text-white active:bg-[#1A4FB0]"
          >
            <Ik n="arah" className="h-5 w-5" />
            Navigasi
          </a>
          <a href={tautanLihat(kk.lat, kk.lng)} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center rounded-[14px] border border-[#1F5FD1] px-3.5 text-[13.5px] font-bold text-[#1F5FD1] active:bg-[#EAF1FC]">
            Lihat titik
          </a>
          <button type="button" onClick={salin} aria-label="Salin koordinat" className="flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-[14px] border border-[#CBD6E6] px-3 text-[13px] font-bold text-[#0F2A52] active:bg-[#F1F5FC]">
            <Ik n={tersalin ? "centang" : "salin"} className="h-[18px] w-[18px]" />
            {tersalin ? "Tersalin" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
