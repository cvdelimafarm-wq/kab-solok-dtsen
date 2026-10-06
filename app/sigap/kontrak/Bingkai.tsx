"use client";

// app/sigap/kontrak/Bingkai.tsx
//
// (6 Okt 2026) Bingkai halaman Pengadaan & Kontrak dalam Shell backoffice SIGAP (sidebar navy, topbar,
// Ctrl K) -- desain "SIGAP · Monitoring kegiatan" dari user diterapkan ke semua halaman SIGAP.
// Layar lebar: sidebar + judul halaman (h1 22px + keterangan) + aksi kanan. HP: header navy + tab.

import { useEffect, useState } from "react";
import { ambil, keluar, SesiBerakhir, type Ringkas } from "../admin/api";
import { BarisTab, HeaderAdmin, type ItemTab } from "../admin/ui";
import Shell, { type KodeMenu } from "../admin/Shell";

export default function Bingkai<K extends string>({
  aktif = "kontrak",
  kecil = "SIGAP · Pengadaan & Kontrak",
  jejak,
  judul,
  sub,
  kanan,
  tab,
  aktifTab,
  onTab,
  children,
}: {
  /** (7 Okt 2026) menu sidebar yg aktif & label kecil header HP -- dipakai juga oleh SIGAP PEDIA. */
  aktif?: KodeMenu;
  kecil?: string;
  jejak: string[];
  judul: React.ReactNode;
  sub?: React.ReactNode;
  /** Aksi kanan; `gelap` = dirender di header navy (HP). */
  kanan?: (gelap: boolean) => React.ReactNode;
  tab?: ItemTab<K>[];
  aktifTab?: K;
  onTab?: (k: K) => void;
  children: React.ReactNode;
}) {
  const [ringkas, setRingkas] = useState<Ringkas | null>(null);
  useEffect(() => {
    ambil<Ringkas>("ringkas")
      .then(setRingkas)
      .catch((e) => {
        if (!(e instanceof SesiBerakhir)) setRingkas({ nama: "", peran: [], izin: {}, kegiatan: [], hari_ini: new Date().toISOString().slice(0, 10) });
      });
  }, []);

  const mobile = (
    <>
      <HeaderAdmin kecil={kecil} judul={judul} onKeluar={keluar} kanan={kanan?.(true)}>
        {sub && <p className="mt-1 text-[12.5px] text-blue-100">{sub}</p>}
      </HeaderAdmin>
      {tab && aktifTab && onTab && <BarisTab tab={tab} aktif={aktifTab} onPilih={onTab} />}
    </>
  );

  const isi = (
    <>
      {/* Judul halaman (layar lebar) */}
      <div className="mb-1 hidden flex-wrap items-end justify-between gap-4 lg:flex">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-bold tracking-[-0.2px] text-[#14202E]">{judul}</h1>
          {sub && <p className="mt-[3px] text-[13.5px] text-[#4D5B6B]">{sub}</p>}
        </div>
        {kanan && <div className="flex items-center gap-2">{kanan(false)}</div>}
      </div>
      {tab && aktifTab && onTab && (
        <div className="mb-1 hidden lg:flex" role="tablist">
          <div className="flex overflow-hidden rounded-lg border border-[#E3E8EE] bg-white">
            {tab.map((t, i) => (
              <button
                key={t.kode}
                type="button"
                role="tab"
                aria-selected={aktifTab === t.kode}
                onClick={() => onTab(t.kode)}
                className={`px-3.5 py-1.5 text-[13px] ${i > 0 ? "border-l border-[#E3E8EE]" : ""} ${aktifTab === t.kode ? "bg-[#E3EEFB] font-semibold text-[#1F6FD1]" : "text-[#4D5B6B] hover:bg-[#F8FAFC]"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {children}
    </>
  );

  if (!ringkas)
    return (
      <div className="min-h-screen bg-[#F3F5F8]">
        <div className="lg:hidden">{mobile}</div>
        <div className="mx-auto max-w-7xl space-y-3 p-3 sm:p-4">{children}</div>
      </div>
    );
  return (
    <Shell aktif={aktif} jejak={jejak} ringkas={ringkas} pemilihKegiatan={false} mobile={mobile}>
      {isi}
    </Shell>
  );
}
