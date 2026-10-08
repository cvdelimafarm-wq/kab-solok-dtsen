"use client";

// app/sigap/admin/page.tsx
//
// (5 Okt 2026) SIGAP · Admin Transport Lokal -- mockup-sigap-admin layar 2-5 disetujui user.
//  - Header: pemilih kegiatan (dari bagian=ringkas), nama + peran pengguna, Keluar.
//  - Tab tampil sesuai izin menu (translok.monitoring / penugasan / kegiatan / verifikasi) + lingkup kegiatan.
//  - Tautan ke Kelola Peran & Akses bila punya izin akses.kelola.
// Semua akses API lewat ./api (header Bearer sesi, 401 -> /sigap/masuk?lanjut=...).
//
// (6 Okt 2026) Lembar kerja admin di laptop mengikuti saran desain backoffice widescreen user:
//  - Layar lebar (lg): shell ./Shell (sidebar kiri + topbar + palet Ctrl K). Layar kecil: tetap header
//    gradien navy + BarisTab. Konten tab dirender sekali untuk kedua ukuran.
//  - Tab baru "Beranda" (default saat membuka halaman): ringkasan & "perlu tindakan" dari bagian=beranda;
//    jumlah perlu tindakan dipakai juga utk badge sidebar & lonceng.
//  - URL ?tab=<kode>&kegiatan=<id> dihormati (dipakai link dari halaman Peran & akses / palet).

import Link from "next/link";
import { useDetak } from "../useDetak";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ambil, bacaSesi, bolehKlien, keluar, keMasuk, pesanGalat, rentangPendek, SesiBerakhir, tglPanjang, type Ringkas } from "./api";
import { BarisTab, HeaderAdmin, LayarPenuh, Pesan, Putar, type ItemTab } from "./ui";
import Shell, { MENU_ADMIN, type KodeTabAdmin } from "./Shell";
import type { ItemPalet } from "./PaletPerintah";
import Beranda, { daftarTindakan, type DataBeranda } from "./Beranda";
import TabMonitoring from "./TabMonitoring";
import TabPenugasan from "./TabPenugasan";
import TabKegiatan from "./TabKegiatan";
import TabVerifikasi from "./TabVerifikasi";

type Tab = KodeTabAdmin;
const IKON_TAB: Record<Exclude<Tab, "beranda">, string> = { monitoring: "📈", penugasan: "👥", kegiatan: "⚙️", verifikasi: "✅" };
const DAFTAR_TAB: (ItemTab<Tab> & { menu: string })[] = MENU_ADMIN.map((m) => ({ kode: m.kode, label: `${IKON_TAB[m.kode]} ${m.label}`, menu: m.menu }));
const SEMUA_TAB: Tab[] = ["beranda", ...MENU_ADMIN.map((m) => m.kode)];
const KUNCI_KEG = "sigap_admin_kegiatan"; // (5 Okt 2026) kegiatan terakhir dipilih (kenyamanan per browser)

export default function AdminTransportLokal() {
  const [r, setR] = useState<Ringkas | null>(null);
  // (6 Okt 2026) detak aktivitas utk log login & durasi
  const [sesiDetak] = useState(() => (typeof window === "undefined" ? null : bacaSesi()));
  useDetak({ sesi: sesiDetak }, "admin transport");
  const [galat, setGalat] = useState<string | null>(null);
  const [kegId, setKegId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("beranda");
  const [kegBaru, setKegBaru] = useState(false); // mode "＋ Kegiatan baru" di tab Kegiatan
  // (6 Okt 2026) data Beranda (juga utk badge "perlu tindakan")
  const [beranda, setBeranda] = useState<DataBeranda | null>(null);
  const [galatBeranda, setGalatBeranda] = useState<unknown>(null);

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

  const muatBeranda = useCallback(async () => {
    try {
      const d = await ambil<DataBeranda>("beranda");
      setBeranda(d);
      setGalatBeranda(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalatBeranda(e);
    }
  }, []);

  useEffect(() => {
    if (!bacaSesi()) {
      keMasuk();
      return;
    }
    // (6 Okt 2026) ?tab= & ?kegiatan= dari URL (mis. dari sidebar halaman Peran & akses).
    let pilih: number | undefined;
    try {
      const q = new URLSearchParams(window.location.search);
      const t = q.get("tab") as Tab | null;
      if (t && SEMUA_TAB.includes(t)) setTab(t);
      else if (q.get("kegiatan")) setTab("monitoring");
      pilih = Number(q.get("kegiatan")) || undefined;
    } catch {
      /* abaikan */
    }
    muat(pilih);
    muatBeranda();
  }, [muat, muatBeranda]);

  useEffect(() => {
    try {
      if (kegId) localStorage.setItem(KUNCI_KEG, String(kegId));
    } catch {
      /* abaikan */
    }
  }, [kegId]);

  const tabTampil = useMemo(() => (r ? DAFTAR_TAB.filter((t) => bolehKlien(r.izin, t.menu, "lihat", kegId)) : []), [r, kegId]);
  const bolehBuatKegiatan = !!r && r.izin["translok.kegiatan"]?.level === "kelola" && !!r.izin["translok.kegiatan"]?.semua;
  const tabAktif: Tab | null = kegBaru ? "kegiatan" : tab === "beranda" ? "beranda" : tabTampil.find((t) => t.kode === tab)?.kode ?? tabTampil[0]?.kode ?? null;
  const keg = r?.kegiatan.find((k) => k.id === kegId) ?? null;
  const namaPeran = r ? Array.from(new Set(r.peran.map((p) => p.nama))) : [];
  const nTindakan = beranda ? daftarTindakan(beranda).length : null;

  const pindahTab = useCallback(
    (k: Tab) => {
      setKegBaru(false);
      setTab(k);
      if (k === "beranda") muatBeranda();
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    },
    [muatBeranda]
  );
  const mulaiKegiatanBaru = useCallback(() => {
    setKegBaru(true);
    setTab("kegiatan");
  }, []);
  const aksiPalet = useMemo<ItemPalet[]>(
    () => (bolehBuatKegiatan ? [{ id: "a-kegbaru", grup: "Aksi", label: "＋ Kegiatan baru", jalankan: mulaiKegiatanBaru }] : []),
    [bolehBuatKegiatan, mulaiKegiatanBaru]
  );

  if (galat && !r)
    return (
      <LayarPenuh>
        <Pesan>{galat}</Pesan>
        <div className="flex gap-3">
          <button type="button" onClick={() => muat()} className="text-sm font-bold text-[#1F6FD1] underline">
            Coba lagi
          </button>
          <button type="button" onClick={keluar} className="text-sm font-bold text-[#1F6FD1] underline">
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
  const labelTab = MENU_ADMIN.find((m) => m.kode === tabAktif)?.label;
  const jejak = kegBaru ? ["Admin transport", "Kegiatan baru"] : tabAktif === "beranda" || !tabAktif ? ["Beranda"] : ["Admin transport", labelTab ?? ""];
  const tabMobile: ItemTab<Tab>[] = [{ kode: "beranda", label: nTindakan ? `🏠 Beranda (${nTindakan})` : "🏠 Beranda" }, ...tabTampil];

  const mobile = (
    <>
      <HeaderAdmin
        kecil="Admin Transport Lokal"
        judul={kegBaru ? "Kegiatan baru" : tabAktif === "beranda" ? "Beranda" : keg?.nama ?? "Belum ada kegiatan"}
        onKeluar={keluar}
        kanan={
          <>
            <span className="hidden max-w-[220px] truncate rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-bold md:inline" title={r.nama}>
              {r.nama}
            </span>
            {namaPeran.map((p) => (
              <span key={p} className="rounded-full bg-[#D9971F]/20 px-2.5 py-1 text-[11px] font-bold text-[#D9971F]">
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
                className="max-w-[78vw] rounded-xl bg-white px-3 py-2 text-[13px] font-extrabold text-[#1F6FD1] shadow outline-none sm:max-w-md"
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
            <button type="button" onClick={mulaiKegiatanBaru} className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold hover:bg-white/20">
              ＋ Kegiatan baru
            </button>
          )}
          {r.izin["akses.kelola"] && (
            <Link href="/sigap/akses" className="rounded-full bg-[#D9971F] px-3 py-1.5 text-[12px] font-extrabold text-[#0E2A47] hover:brightness-105">
              🔐 Kelola Peran &amp; Akses
            </Link>
          )}
        </div>
      </HeaderAdmin>
      {!kegBaru && tabAktif && <BarisTab tab={tabMobile} aktif={tabAktif} onPilih={pindahTab} />}
    </>
  );

  return (
    <Shell
      aktif={tabAktif ?? "beranda"}
      jejak={jejak}
      ringkas={r}
      kegId={kegId}
      onPilihKegiatan={(id) => {
        setKegBaru(false);
        setKegId(id);
        if (tab === "beranda") setTab(tabTampil[0]?.kode ?? "monitoring");
      }}
      onMenu={pindahTab}
      jumlahTindakan={nTindakan}
      aksiPalet={aksiPalet}
      mobile={mobile}
    >
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}

      {/* (6 Okt 2026) Judul halaman versi layar lebar (header navy disembunyikan di lg). */}
      {tabAktif !== "beranda" && (
        <div className="hidden flex-wrap items-end gap-x-3 gap-y-1 pb-1 lg:flex">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#7B8794]">{kegBaru ? "Admin transport" : labelTab ?? "Admin transport"}</p>
            <h1 className="truncate text-[17px] font-extrabold leading-tight">{kegBaru ? "Kegiatan baru" : keg?.nama ?? "Belum ada kegiatan"}</h1>
          </div>
          {keg && !kegBaru && (
            <span className="pb-0.5 text-[12px] text-[#7B8794]">
              Periode {rentangPendek(keg.tanggal_mulai, keg.tanggal_selesai)} · {tglPanjang(r.hari_ini)}
              {!keg.aktif && " · selesai"}
            </span>
          )}
          <div className="flex-1" />
          {bolehBuatKegiatan && !kegBaru && (
            <button type="button" onClick={mulaiKegiatanBaru} className="rounded-lg border border-[#D5DCE7] bg-white px-3 py-1.5 text-[12px] font-bold text-[#1F6FD1] hover:border-[#1F6FD1]">
              ＋ Kegiatan baru
            </button>
          )}
        </div>
      )}

      {kegBaru ? (
        <TabKegiatan
          kegiatanId={null}
          bolehBuat={bolehBuatKegiatan}
          onBatalBaru={() => setKegBaru(false)}
          onTersimpan={async (id) => {
            setKegBaru(false);
            setTab("kegiatan");
            await muat(id);
            muatBeranda();
          }}
        />
      ) : tabAktif === "beranda" ? (
        <Beranda
          data={beranda}
          galat={galatBeranda}
          onMuatUlang={muatBeranda}
          nama={r.nama}
          peran={namaPeran}
          hariIni={r.hari_ini}
          kegIdSekarang={kegId}
          onBuka={(id, t) => {
            setKegBaru(false);
            setKegId(id);
            setTab(t);
            if (typeof window !== "undefined") window.scrollTo({ top: 0 });
          }}
          bolehAkses={!!r.izin["akses.kelola"]}
          bolehBuatKegiatan={bolehBuatKegiatan}
          onKegiatanBaru={mulaiKegiatanBaru}
        />
      ) : !adaAksesAdmin ? (
        <Pesan jenis="info">
          Akun Anda belum punya izin menu Admin Transport Lokal. Minta admin anggaran memberi peran lewat Kelola Peran &amp; Akses.{" "}
          <Link href="/" className="font-bold underline">
            Kembali ke Beranda
          </Link>
        </Pesan>
      ) : !kegId ? (
        <Pesan jenis="info">
          Belum ada kegiatan yang bisa Anda lihat.
          {bolehBuatKegiatan ? " Tekan “＋ Kegiatan baru” untuk membuat kegiatan pertama." : " Minta admin anggaran menambahkan Anda sebagai PJ kegiatan."}
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
    </Shell>
  );
}
