"use client";

// app/sigap/ro/[kode]/page.tsx
//
// (24 Okt 2026) Halaman satu Rincian Output (RO) -- Kertas Kerja Revisi POK, hanya baca. Satu alamat per RO dan per tab (aturan D-24):
// /sigap/ro/<KODE>?tab=ringkasan|anggaran|administrasi|kekurangan. Semua pegawai organik boleh melihat; mengubah belum ada di halaman ini.

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import TombolKembali from "@/app/components/TombolKembali";
import { kodeRoSah, LABEL_TAB, penugasanRo, tabDari, TAB_RO, urlBaca } from "@/lib/keu/ro";
import { useBacaKeu, usePenugasan } from "../useKeu";
import { TabKekurangan } from "./Kekurangan";
import { TabRab } from "./Rab";
import { TabAdministrasi, TabAnggaran, TabRingkasan } from "./Tab";

type RoRow = { kode: string; nama: string; sementara: boolean; aktif: boolean };

function Isi() {
  const { kode: kodeParam } = useParams<{ kode: string }>();
  const kode = decodeURIComponent(kodeParam ?? "");
  const tab = tabDari(useSearchParams().get("tab"));
  const sah = kodeRoSah(kode);
  const ro = useBacaKeu<RoRow>(sah ? urlBaca("keu_ro", { kode }, { batas: 1 }) : null);
  const tugas = usePenugasan();
  const p = useMemo(() => (tugas.baris ? penugasanRo(tugas.baris, kode) : null), [tugas.baris, kode]);
  const baris = ro.baris?.[0] ?? null;

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-12 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-16 pt-5 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2">
          <TombolKembali tema="gelap" induk="/sigap/ro" label="Daftar RO" className="max-w-[40%] flex-none" />
          <span className="truncate text-[12.5px] font-bold text-[#D3E0F5]">Kertas Kerja Revisi POK</span>
        </div>
        <div className="relative mx-auto mt-3 max-w-xl">
          <p className="text-[12.5px] font-extrabold tracking-wide text-[#A9C6F5]">{sah ? kode : "RO"}{baris?.sementara ? " · sementara" : ""}</p>
          <h1 className="mt-0.5 break-words text-[20px] font-extrabold leading-tight tracking-[-0.3px]">{baris?.nama ?? (sah ? "Memuat…" : "Kode RO tidak sah")}</h1>
          {sah && p && (
            <p className="mt-1.5 text-[12.5px] text-[#A9BCD8]">
              Ketua tim: {p.adaKetua ? p.ketua.join(", ") : "belum ditugaskan"}{p.adminRo.length > 0 ? ` · Admin RO: ${p.adminRo.join(", ")}` : ""}
            </p>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-10 max-w-xl space-y-3 px-3.5">
        {!sah && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">Kode RO tidak sah.</p>}
        {sah && ro.galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{ro.galat}</p>}
        {sah && ro.baris && !baris && <p className="rounded-[20px] bg-white p-4 text-[13.5px] text-[#5B6B84]">RO ini tidak ditemukan.</p>}

        {sah && baris && (
          <>
            <nav aria-label="Tab RO" className="flex gap-1.5 overflow-x-auto rounded-[16px] bg-white p-1.5 shadow-[0_4px_16px_rgba(15,42,82,0.08)]">
              {TAB_RO.map((t) => (
                <Link
                  key={t}
                  replace
                  scroll={false}
                  href={`/sigap/ro/${encodeURIComponent(kode)}?tab=${t}`}
                  aria-current={t === tab ? "page" : undefined}
                  className={`flex min-h-[44px] flex-none items-center rounded-[12px] px-3.5 text-[13px] font-extrabold ${t === tab ? "bg-[#1F5FD1] text-white" : "text-[#44546F] active:bg-[#EEF2F7]"}`}
                >
                  {LABEL_TAB[t]}
                </Link>
              ))}
            </nav>
            {tab === "ringkasan" && <TabRingkasan kode={kode} />}
            {tab === "anggaran" && <TabAnggaran kode={kode} />}
            {tab === "rab" && <TabRab kode={kode} />}
            {tab === "administrasi" && <TabAdministrasi kode={kode} />}
            {tab === "kekurangan" && <TabKekurangan kode={kode} />}
          </>
        )}
      </div>
    </main>
  );
}

export default function HalamanRo() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
