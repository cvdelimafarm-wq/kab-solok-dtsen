"use client";

// app/sigap/akses/page.tsx
//
// (5 Okt 2026) SIGAP · Kelola Peran & Akses -- mockup-sigap-admin layar 6 disetujui user. Portal tersendiri:
//  🎭 Peran & Izin (matriks menu × peran), 👤 Akun & Peran, 🧭 Daftar Portal & Menu, 🕘 Riwayat.
// Peran & izin tidak di-hardcode; semua dibaca/diubah lewat /api/sigap/admin (bagian=akses / riwayat).
// Read-only bila boleh_kelola = false.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ambil, bacaSesi, keluar, keMasuk, pesanGalat, SesiBerakhir, type Ringkas } from "../admin/api";
import { BarisTab, HeaderAdmin, LayarPenuh, Memuat, Pesan, Putar, type ItemTab } from "../admin/ui";
import type { DataAkses } from "./tipe";
import PeranIzin from "./PeranIzin";
import AkunPeranTab from "./AkunPeran";
import { DaftarPortal, Riwayat } from "./PortalRiwayat";

type Tab = "izin" | "akun" | "portal" | "riwayat";
const TAB: ItemTab<Tab>[] = [
  { kode: "izin", label: "🎭 Peran & Izin" },
  { kode: "akun", label: "👤 Akun & Peran" },
  { kode: "portal", label: "🧭 Daftar Portal & Menu" },
  { kode: "riwayat", label: "🕘 Riwayat" },
];

export default function KelolaPeranAkses() {
  const [saya, setSaya] = useState<Ringkas | null>(null);
  const [data, setData] = useState<DataAkses | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("izin");

  const muat = useCallback(async () => {
    try {
      const [r, d] = await Promise.all([ambil<Ringkas>("ringkas"), ambil<DataAkses>("akses")]);
      setSaya(r);
      setData(d);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);

  useEffect(() => {
    if (!bacaSesi()) {
      keMasuk();
      return;
    }
    muat();
  }, [muat]);

  if (galat && !data)
    return (
      <LayarPenuh>
        <Pesan>{galat}</Pesan>
        <div className="flex gap-3 text-sm font-bold text-[#0F3D7A]">
          <Link href="/sigap/admin" className="underline">
            Ke Admin Transport Lokal
          </Link>
          <button type="button" onClick={keluar} className="underline">
            Masuk dengan akun lain
          </button>
        </div>
      </LayarPenuh>
    );
  if (!data)
    return (
      <LayarPenuh>
        <Putar />
      </LayarPenuh>
    );

  const namaPeran = saya ? Array.from(new Set(saya.peran.map((p) => p.nama))) : [];

  return (
    <main className="min-h-screen bg-[#EEF2F8] pb-16 text-[#13213A]">
      <HeaderAdmin
        kecil="Kelola Peran & Akses"
        judul="Siapa boleh membuka apa"
        onKeluar={keluar}
        kanan={
          <>
            {saya && (
              <span className="hidden max-w-[220px] truncate rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-bold md:inline" title={saya.nama}>
                {saya.nama}
              </span>
            )}
            {namaPeran.map((p) => (
              <span key={p} className="rounded-full bg-[#F5B841]/20 px-2.5 py-1 text-[11px] font-bold text-[#F5B841]">
                {p}
              </span>
            ))}
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href="/sigap/admin" className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold hover:bg-white/20">
            ← Admin Transport Lokal
          </Link>
          {!data.boleh_kelola && <span className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-blue-100">Mode lihat saja</span>}
        </div>
      </HeaderAdmin>
      <BarisTab tab={TAB} aktif={tab} onPilih={setTab} />
      <div className="mx-auto max-w-7xl space-y-3 px-3 pt-4 sm:px-5">
        {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
        {tab === "izin" ? (
          <PeranIzin data={data} setData={setData} onMuatUlang={muat} />
        ) : tab === "akun" ? (
          <AkunPeranTab data={data} onMuatUlang={muat} />
        ) : tab === "portal" ? (
          <DaftarPortal data={data} />
        ) : tab === "riwayat" ? (
          <Riwayat />
        ) : (
          <Memuat />
        )}
      </div>
    </main>
  );
}
