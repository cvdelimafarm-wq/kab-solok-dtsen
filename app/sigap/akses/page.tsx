"use client";

// app/sigap/akses/page.tsx
//
// (5 Okt 2026) SIGAP · Kelola Peran & Akses -- mockup-sigap-admin layar 6 disetujui user. Portal tersendiri:
//  🎭 Peran & Izin (matriks menu × peran), 👤 Akun & Peran, 🧭 Daftar Portal & Menu, 🕘 Riwayat.
// Peran & izin tidak di-hardcode; semua dibaca/diubah lewat /api/sigap/admin (bagian=akses / riwayat).
// Read-only bila boleh_kelola = false.
// (6 Okt 2026) Shell layar lebar yang sama dgn Admin (../admin/Shell): sidebar dgn "Peran dan akses" aktif,
// topbar + palet Ctrl K; di HP tetap header navy + BarisTab -- saran desain widescreen user.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ambil, bacaSesi, keluar, keMasuk, pesanGalat, SesiBerakhir, type Ringkas } from "../admin/api";
import { BarisTab, HeaderAdmin, LayarPenuh, Memuat, Pesan, Putar, type ItemTab } from "../admin/ui";
import Shell from "../admin/Shell";
import { daftarTindakan, type DataBeranda } from "../admin/Beranda";
import type { DataAkses } from "./tipe";
import PeranIzin from "./PeranIzin";
import AkunPeranTab from "./AkunPeran";
import { DaftarPortal, Riwayat } from "./PortalRiwayat";
import LogLogin from "./LogLogin";
import { useDetak } from "../useDetak";

type Tab = "izin" | "akun" | "portal" | "riwayat" | "log";
const TAB: ItemTab<Tab>[] = [
  { kode: "izin", label: "🎭 Peran & Izin" },
  { kode: "akun", label: "👤 Akun & Peran" },
  { kode: "portal", label: "🧭 Daftar Portal & Menu" },
  { kode: "riwayat", label: "🕘 Riwayat" },
  { kode: "log", label: "🕒 Log Login" }, // (6 Okt 2026) terakhir login & durasi -- permintaan user
];

export default function KelolaPeranAkses() {
  const [saya, setSaya] = useState<Ringkas | null>(null);
  const [data, setData] = useState<DataAkses | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("izin");
  const [sesiDetak] = useState(() => (typeof window === "undefined" ? null : bacaSesi()));
  useDetak({ sesi: sesiDetak }, "kelola akses");
  const [beranda, setBeranda] = useState<DataBeranda | null>(null); // (6 Okt 2026) utk badge "perlu tindakan"

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
    // badge sidebar/lonceng: tidak wajib, galat diabaikan
    ambil<DataBeranda>("beranda")
      .then(setBeranda)
      .catch(() => {
        /* abaikan */
      });
  }, [muat]);
  const nTindakan = useMemo(() => (beranda ? daftarTindakan(beranda).length : null), [beranda]);

  if (galat && !data)
    return (
      <LayarPenuh>
        <Pesan>{galat}</Pesan>
        <div className="flex gap-3 text-sm font-bold text-[#1F6FD1]">
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

  const labelTab = TAB.find((t) => t.kode === tab)?.label.replace(/^\S+\s/, "") ?? "";
  const mobile = (
    <>
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
              <span key={p} className="rounded-full bg-[#D9971F]/20 px-2.5 py-1 text-[11px] font-bold text-[#D9971F]">
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
    </>
  );

  const isi = (
    <>
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {tab === "izin" ? (
        <PeranIzin data={data} setData={setData} onMuatUlang={muat} />
      ) : tab === "akun" ? (
        <AkunPeranTab data={data} onMuatUlang={muat} />
      ) : tab === "portal" ? (
        <DaftarPortal data={data} />
      ) : tab === "riwayat" ? (
        <Riwayat />
      ) : tab === "log" ? (
        <LogLogin />
      ) : (
        <Memuat />
      )}
    </>
  );

  // Ringkas belum ada (seharusnya tidak terjadi krn dimuat bersamaan) -> tampilan lama tanpa shell.
  if (!saya)
    return (
      <main className="min-h-screen bg-[#F3F5F8] pb-16 text-[#14202E]">
        {mobile}
        <div className="mx-auto max-w-7xl space-y-3 px-3 pt-4 sm:px-5">{isi}</div>
      </main>
    );

  return (
    <Shell aktif="akses" jejak={["Peran dan akses", labelTab]} ringkas={saya} jumlahTindakan={nTindakan} mobile={mobile}>
      {/* Judul + tab internal versi layar lebar */}
      <div className="hidden flex-wrap items-end gap-x-3 gap-y-1 lg:flex">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#7B8794]">Peran dan akses</p>
          <h1 className="text-[17px] font-extrabold leading-tight">Siapa boleh membuka apa</h1>
        </div>
        {!data.boleh_kelola && <span className="mb-0.5 rounded-full bg-[#F3F5F8] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#4D5B6B]">Mode lihat saja</span>}
      </div>
      <div role="tablist" aria-label="Bagian Peran dan akses" className="hidden gap-1 border-b border-[#E3E8EE] lg:flex">
        {TAB.map((t) => (
          <button
            key={t.kode}
            type="button"
            role="tab"
            aria-selected={tab === t.kode}
            onClick={() => setTab(t.kode)}
            className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] font-bold transition ${tab === t.kode ? "border-[#1F6FD1] text-[#1F6FD1]" : "border-transparent text-[#7B8794] hover:text-[#1F6FD1]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {isi}
    </Shell>
  );
}
