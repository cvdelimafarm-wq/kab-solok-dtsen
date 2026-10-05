"use client";

// app/sigap/admin/page.tsx
//
// (5 Okt 2026) SIGAP · Admin Transport Lokal -- mockup-sigap-admin layar 2-5 disetujui user.
//  - Header: pemilih kegiatan (dari bagian=ringkas), nama + peran pengguna, Keluar.
//  - Tab tampil sesuai izin menu (translok.monitoring / penugasan / kegiatan / verifikasi) + lingkup kegiatan.
//  - Tautan ke Kelola Peran & Akses bila punya izin akses.kelola.
// Semua akses API lewat ./api (header Bearer sesi, 401 -> /sigap/masuk?lanjut=...).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ambil, bacaSesi, bolehKlien, keluar, keMasuk, pesanGalat, rentangPendek, SesiBerakhir, tglPanjang, type Ringkas } from "./api";
import { BarisTab, HeaderAdmin, LayarPenuh, Pesan, Putar, type ItemTab } from "./ui";
import TabMonitoring from "./TabMonitoring";
import TabPenugasan from "./TabPenugasan";
import TabKegiatan from "./TabKegiatan";
import TabVerifikasi from "./TabVerifikasi";

type Tab = "monitoring" | "penugasan" | "kegiatan" | "verifikasi";
const DAFTAR_TAB: (ItemTab<Tab> & { menu: string })[] = [
  { kode: "monitoring", label: "📈 Monitoring", menu: "translok.monitoring" },
  { kode: "penugasan", label: "👥 Penugasan & ST", menu: "translok.penugasan" },
  { kode: "kegiatan", label: "⚙️ Kegiatan & Tarif", menu: "translok.kegiatan" },
  { kode: "verifikasi", label: "✅ Verifikasi & Kunci", menu: "translok.verifikasi" },
];
const KUNCI_KEG = "sigap_admin_kegiatan"; // (5 Okt 2026) kegiatan terakhir dipilih (kenyamanan per browser)
const KUNCI_TAB = "sigap_admin_tab";

export default function AdminTransportLokal() {
  const [r, setR] = useState<Ringkas | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [kegId, setKegId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("monitoring");
  const [kegBaru, setKegBaru] = useState(false); // mode "＋ Kegiatan baru" di tab Kegiatan

  const muat = useCallback(async (pilih?: number) => {
    try {
      const d = await ambil<Ringkas>("ringkas");
      setR(d);
      setGalat(null);
      setKegId((lama) => {
        const ids = d.kegiatan.map((k) => k.id);
        if (pilih && ids.includes(pilih)) return pilih;
        if (lama && ids.includes(lama)) return lama;
        let simpan: number | null = null;
        try {
          simpan = Number(localStorage.getItem(KUNCI_KEG)) || null;
        } catch {
          /* abaikan */
        }
        if (simpan && ids.includes(simpan)) return simpan;
        return d.kegiatan.find((k) => k.aktif)?.id ?? d.kegiatan[0]?.id ?? null;
      });
    } catch (e) {
      if (e instanceof SesiBerakhir) return;
      setGalat(pesanGalat(e));
    }
  }, []);

  useEffect(() => {
    if (!bacaSesi()) {
      keMasuk();
      return;
    }
    try {
      const t = localStorage.getItem(KUNCI_TAB) as Tab | null;
      if (t && DAFTAR_TAB.some((x) => x.kode === t)) setTab(t);
    } catch {
      /* abaikan */
    }
    muat();
  }, [muat]);

  useEffect(() => {
    try {
      if (kegId) localStorage.setItem(KUNCI_KEG, String(kegId));
      localStorage.setItem(KUNCI_TAB, tab);
    } catch {
      /* abaikan */
    }
  }, [kegId, tab]);

  const tabTampil = useMemo(() => (r ? DAFTAR_TAB.filter((t) => bolehKlien(r.izin, t.menu, "lihat", kegId)) : []), [r, kegId]);
  const bolehBuatKegiatan = !!r && r.izin["translok.kegiatan"]?.level === "kelola" && r.izin["translok.kegiatan"]?.semua;
  const tabAktif: Tab | null = kegBaru ? "kegiatan" : tabTampil.find((t) => t.kode === tab)?.kode ?? tabTampil[0]?.kode ?? null;
  const keg = r?.kegiatan.find((k) => k.id === kegId) ?? null;
  const namaPeran = r ? Array.from(new Set(r.peran.map((p) => p.nama))) : [];

  if (galat && !r)
    return (
      <LayarPenuh>
        <Pesan>{galat}</Pesan>
        <div className="flex gap-3">
          <button type="button" onClick={() => muat()} className="text-sm font-bold text-[#0F3D7A] underline">
            Coba lagi
          </button>
          <button type="button" onClick={keluar} className="text-sm font-bold text-[#0F3D7A] underline">
            Masuk kembali
          </button>
        </div>
      </LayarPenuh>
    );
  if (!r)
    return (
      <LayarPenuh>
        <Putar />
      </LayarPenuh>
    );

  const adaAksesAdmin = Object.keys(r.izin).some((k) => k.startsWith("translok."));

  return (
    <main className="min-h-screen bg-[#EEF2F8] pb-16 text-[#13213A]">
      <HeaderAdmin
        kecil="Admin Transport Lokal"
        judul={kegBaru ? "Kegiatan baru" : keg?.nama ?? "Belum ada kegiatan"}
        onKeluar={keluar}
        kanan={
          <>
            <span className="hidden max-w-[220px] truncate rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-bold md:inline" title={r.nama}>
              {r.nama}
            </span>
            {namaPeran.map((p) => (
              <span key={p} className="rounded-full bg-[#F5B841]/20 px-2.5 py-1 text-[11px] font-bold text-[#F5B841]">
                {p}
              </span>
            ))}
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {r.kegiatan.length > 0 && (
            <label className="flex items-center gap-2">
              <span className="sr-only">Pilih kegiatan</span>
              <select
                value={kegId ?? ""}
                onChange={(e) => {
                  setKegBaru(false);
                  setKegId(Number(e.target.value) || null);
                }}
                className="max-w-[78vw] rounded-xl bg-white px-3 py-2 text-[13px] font-extrabold text-[#0F3D7A] shadow outline-none sm:max-w-md"
              >
                {r.kegiatan.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                    {k.aktif ? "" : " (selesai)"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {keg && !kegBaru && <span className="text-[12.5px] text-blue-100">Periode {rentangPendek(keg.tanggal_mulai, keg.tanggal_selesai)} · {tglPanjang(r.hari_ini)}</span>}
          <div className="flex-1" />
          {bolehBuatKegiatan && !kegBaru && (
            <button
              type="button"
              onClick={() => {
                setKegBaru(true);
                setTab("kegiatan");
              }}
              className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold hover:bg-white/20"
            >
              ＋ Kegiatan baru
            </button>
          )}
          {r.izin["akses.kelola"] && (
            <Link href="/sigap/akses" className="rounded-full bg-[#F5B841] px-3 py-1.5 text-[12px] font-extrabold text-[#1E2A47] hover:brightness-105">
              🔐 Kelola Peran &amp; Akses
            </Link>
          )}
        </div>
      </HeaderAdmin>

      {!kegBaru && tabTampil.length > 0 && tabAktif && <BarisTab tab={tabTampil} aktif={tabAktif} onPilih={(k) => setTab(k)} />}

      <div className="mx-auto max-w-7xl space-y-3 px-3 pt-4 sm:px-5">
        {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}

        {kegBaru ? (
          <TabKegiatan
            kegiatanId={null}
            bolehBuat={bolehBuatKegiatan}
            onBatalBaru={() => setKegBaru(false)}
            onTersimpan={async (id) => {
              setKegBaru(false);
              setTab("kegiatan");
              await muat(id);
            }}
          />
        ) : !adaAksesAdmin ? (
          <Pesan jenis="info">
            Akun Anda belum punya izin menu Admin Transport Lokal. Minta admin anggaran memberi peran lewat Kelola Peran &amp; Akses.{" "}
            <Link href="/sigap" className="font-bold underline">
              Kembali ke portal
            </Link>
          </Pesan>
        ) : !kegId ? (
          <Pesan jenis="info">
            Belum ada kegiatan yang bisa Anda lihat.
            {bolehBuatKegiatan ? " Tekan “＋ Kegiatan baru” di atas untuk membuat kegiatan pertama." : " Minta admin anggaran menambahkan Anda sebagai PJ kegiatan."}
          </Pesan>
        ) : tabTampil.length === 0 ? (
          <Pesan jenis="info">Anda tidak punya izin menu apa pun untuk kegiatan ini. Pilih kegiatan lain.</Pesan>
        ) : tabAktif === "monitoring" ? (
          <TabMonitoring key={kegId} kegiatanId={kegId} kegiatan={keg} hariIni={r.hari_ini} />
        ) : tabAktif === "penugasan" ? (
          <TabPenugasan key={kegId} kegiatanId={kegId} />
        ) : tabAktif === "kegiatan" ? (
          <TabKegiatan key={kegId} kegiatanId={kegId} bolehBuat={bolehBuatKegiatan} onTersimpan={(id) => muat(id)} />
        ) : tabAktif === "verifikasi" ? (
          <TabVerifikasi key={kegId} kegiatanId={kegId} />
        ) : null}
      </div>
    </main>
  );
}
