"use client";

import { useEffect, useState } from "react";

// (5 Okt 2026) Portal SIGAP satu pintu -- permintaan user: sesudah masuk, kartu menu yang tampil
// mengikuti peran & izin akun (Transport Lokal bila punya penugasan, Admin, Kelola Peran & Akses).

type Saya = { nama: string; token_petugas: string | null; jumlah_penugasan: number; peran: { nama: string }[]; admin: boolean; kelola_akses: boolean };

function bacaSesi(): string | null {
  try {
    const s = localStorage.getItem("sigap_sesi");
    const sampai = localStorage.getItem("sigap_sesi_sampai");
    return s && sampai && Date.parse(sampai) > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export default function PanelSaya() {
  const [saya, setSaya] = useState<Saya | null>(null);
  const [status, setStatus] = useState<"memuat" | "tamu" | "masuk">("memuat");

  useEffect(() => {
    const sesi = bacaSesi();
    if (!sesi) return setStatus("tamu");
    fetch("/api/sigap/saya", { headers: { Authorization: `Bearer ${sesi}` }, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setSaya(await r.json());
        setStatus("masuk");
      })
      .catch(() => setStatus("tamu"));
  }, []);

  function keluar() {
    try {
      ["sigap_sesi", "sigap_sesi_sampai", "sigap_token"].forEach((k) => localStorage.removeItem(k));
    } catch {
      /* abaikan */
    }
    window.location.reload();
  }

  if (status === "memuat") return <div className="h-[132px] animate-pulse rounded-2xl bg-white/70" />;

  if (status === "tamu")
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-md sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[16px] font-extrabold">Masuk untuk membuka menu Anda</p>
          <p className="text-[13px] text-[#55657D]">Petugas, admin anggaran, PJ kegiatan, dan bendahara masuk dengan nama + PIN. Menu yang tampil sesuai peran.</p>
        </div>
        <a href="/sigap/masuk" className="shrink-0 rounded-xl bg-[#0F3D7A] px-5 py-3 text-center text-[14px] font-extrabold text-white shadow">
          Masuk →
        </a>
      </div>
    );

  const kartu: { ikon: string; judul: string; ket: string; href: string }[] = [];
  if (saya?.token_petugas)
    kartu.push({ ikon: "🛵", judul: "Transport Lokal", ket: `Laporan harian, 5 foto, hari kerja & arsip SPJ · ${saya.jumlah_penugasan} kegiatan`, href: `/sigap/translok/${saya.token_petugas}` });
  if (saya?.admin) kartu.push({ ikon: "🛡", judul: "Admin Transport Lokal", ket: "Monitoring, penugasan & ST, kegiatan & tarif, verifikasi & kunci", href: "/sigap/admin" });
  if (saya?.kelola_akses) kartu.push({ ikon: "🔐", judul: "Kelola Peran & Akses", ket: "Atur peran, izin per menu, dan akun", href: "/sigap/akses" });

  return (
    <div className="rounded-2xl bg-white p-4 shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#55657D]">Menu Anda</p>
          <p className="text-[16px] font-extrabold">Halo, {saya?.nama}</p>
          {saya && saya.peran.length > 0 && <p className="text-[12px] text-[#55657D]">{Array.from(new Set(saya.peran.map((p) => p.nama))).join(" · ")}</p>}
        </div>
        <button type="button" onClick={keluar} className="rounded-full bg-[#EEF1F5] px-3 py-1 text-[12px] font-bold text-[#55657D]">
          Keluar
        </button>
      </div>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        {kartu.map((k) => (
          <a key={k.judul} href={k.href} className="rounded-xl border border-[#1E7A4C]/40 bg-[#F6FBF8] p-3.5 transition hover:-translate-y-0.5 hover:shadow">
            <span className="text-2xl">{k.ikon}</span>
            <p className="mt-1 text-[14.5px] font-extrabold">{k.judul}</p>
            <p className="text-[12px] leading-relaxed text-[#55657D]">{k.ket}</p>
          </a>
        ))}
        {kartu.length === 0 && <p className="text-[13px] text-[#55657D]">Belum ada menu untuk akun ini. Hubungi admin anggaran.</p>}
      </div>
    </div>
  );
}
