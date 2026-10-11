"use client";

// app/sigap/admin/Shell.tsx
//
// (6 Okt 2026) Shell backoffice SIGAP untuk layar lebar (lg ≥ 1024px) -- saran desain
// "sigap_backoffice_widescreen_layout" dari user: sidebar kiri (Beranda, Perencanaan, Pelaksanaan,
// Monitoring, Administrasi), topbar tipis (breadcrumb, cari Ctrl K, pemilih kegiatan, TA, lonceng, avatar),
// konten berlatar abu sangat muda. Di layar kecil (< lg) yang tampil tetap header gradien navy + BarisTab
// (prop `mobile`). Konten (children) dirender SEKALI untuk kedua ukuran layar.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bolehKlien, fetchJson, keluar, SesiBerakhir, type Ringkas } from "./api";
import PaletPerintah, { type ItemPalet } from "./PaletPerintah";

// (7 Okt 2026) + "pelatihan" (halaman peserta) & "pelatihan_kelola" (admin soal/jadwal/monitoring tes)
export type KodeMenu = "beranda" | "monitoring" | "penugasan" | "kegiatan" | "verifikasi" | "akses" | "kontrak" | "pedia" | "pedia_kelola" | "pelatihan" | "pelatihan_kelola";
export type KodeTabAdmin = Exclude<KodeMenu, "akses" | "kontrak" | "pedia" | "pedia_kelola" | "pelatihan" | "pelatihan_kelola">;

/** Sub-menu Admin transport (urutan = urutan tampil), dipakai sidebar, palet & halaman admin. */
export const MENU_ADMIN: { kode: Exclude<KodeTabAdmin, "beranda">; label: string; menu: string }[] = [
  { kode: "monitoring", label: "Monitoring", menu: "translok.monitoring" },
  { kode: "penugasan", label: "Penugasan & ST", menu: "translok.penugasan" },
  { kode: "kegiatan", label: "Kegiatan & Tarif", menu: "translok.kegiatan" },
  { kode: "verifikasi", label: "Verifikasi & Kunci", menu: "translok.verifikasi" },
];

// ---------------------------------------------------------------- Ikon SVG inline kecil (tanpa dependensi)
type NamaIkon = "beranda" | "buku" | "revisi" | "motor" | "pesawat" | "uang" | "paket" | "grafik" | "tautan" | "perisai" | "gembok" | "cari" | "lonceng" | "panah" | "panel" | "pedia" | "arsip";
function Ikon({ n, size = 15 }: { n: NamaIkon; size?: number }) {
  const isi: Record<NamaIkon, React.ReactNode> = {
    beranda: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="4" rx="1.5" />
        <rect x="13" y="10" width="7" height="10" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
      </>
    ),
    buku: <path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2zM5 20a2 2 0 0 0 2 2h12v-4" />,
    revisi: <path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />,
    motor: (
      <>
        <circle cx="5" cy="17" r="3" />
        <circle cx="19" cy="17" r="3" />
        <path d="M7.5 15.5L11 10h5l3 7M14 6h3l-1 4" />
      </>
    ),
    pesawat: <path d="M10 13L3 10l1.5-1.5 8 1L17 5a2 2 0 0 1 3 3l-4.5 4.5 1 8L15 22l-3-7-4 3v3l-2 1-1-4-4-1 1-2h3z" />,
    uang: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    paket: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />,
    grafik: <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />,
    tautan: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
    perisai: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4" />,
    gembok: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
    cari: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </>
    ),
    lonceng: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21a2 2 0 0 0 4 0" />,
    panah: <path d="M6 9l6 6 6-6" />,
    pedia: (
      <>
        <path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
        <circle cx="12" cy="9.5" r="3" />
        <path d="M14.2 11.7L16.5 14" />
      </>
    ),
    arsip: (
      <>
        <rect x="3" y="4" width="18" height="5" rx="1" />
        <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
      </>
    ),
    panel: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      {isi[n]}
    </svg>
  );
}

const inisial = (nama: string) =>
  nama
    .replace(/[^A-Za-z\s]/g, " ")
    .split(/\s+/)
    .filter((k) => k.length > 1)
    .slice(0, 2)
    .map((k) => k[0].toUpperCase())
    .join("") || "?";

// ---------------------------------------------------------------- Shell
export default function Shell({
  aktif,
  jejak,
  ringkas,
  kegId = null,
  onPilihKegiatan,
  onMenu,
  jumlahTindakan = null,
  aksiPalet = [],
  pemilihKegiatan = true,
  mobile,
  children,
}: {
  aktif: KodeMenu;
  /** Breadcrumb, mis. ["Admin transport", "Monitoring"]. */
  jejak: string[];
  ringkas: Ringkas;
  kegId?: number | null;
  /** Bila ada: pemilih kegiatan topbar & palet memanggil ini. Bila tidak: pindah ke /sigap/admin?kegiatan=. */
  onPilihKegiatan?: (id: number) => void;
  /** Bila ada: menu admin berpindah tab di tempat. Bila tidak: Link ke /sigap/admin?tab=. */
  onMenu?: (k: KodeTabAdmin) => void;
  jumlahTindakan?: number | null;
  aksiPalet?: ItemPalet[];
  /** (6 Okt 2026) false = sembunyikan pemilih kegiatan di topbar (mis. modul Pengadaan & Kontrak). */
  pemilihKegiatan?: boolean;
  /** Header + tab versi HP (dirender hanya < lg). */
  mobile: React.ReactNode;
  children: React.ReactNode;
}) {
  const [tokenPetugas, setTokenPetugas] = useState<string | null>(null);
  const [palet, setPalet] = useState(false);
  const [menuAvatar, setMenuAvatar] = useState(false);
  // (6 Okt 2026) Sidebar bisa diciutkan (68px, ikon saja) -- desain user; diingat per browser.
  const [mini, setMini] = useState(false);
  useEffect(() => {
    try {
      setMini(localStorage.getItem("sigap-mini") === "1");
    } catch {
      /* abaikan */
    }
  }, []);
  const ciutkan = () =>
    setMini((m) => {
      try {
        localStorage.setItem("sigap-mini", m ? "0" : "1");
      } catch {
        /* abaikan */
      }
      return !m;
    });
  const avatarRef = useRef<HTMLDivElement>(null);

  // (6 Okt 2026) Link "Transport lokal" ke halaman petugas milik pengguna bila ia punya penugasan.
  useEffect(() => {
    let batal = false;
    fetchJson<{ token_petugas: string | null }>("/api/sigap/saya")
      .then((d) => {
        if (!batal) setTokenPetugas(d.token_petugas ?? null);
      })
      .catch((e) => {
        if (!(e instanceof SesiBerakhir)) setTokenPetugas(null);
      });
    return () => {
      batal = true;
    };
  }, []);

  // Shortcut Ctrl/Cmd+K membuka palet perintah.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalet((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tutup menu avatar saat klik di luar / Esc.
  useEffect(() => {
    if (!menuAvatar) return;
    function onDown(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setMenuAvatar(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuAvatar(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuAvatar]);

  const pindahMenu = useCallback(
    (k: KodeTabAdmin) => {
      if (onMenu) onMenu(k);
      else window.location.href = `/sigap/kelola/translok?tab=${k}`;
    },
    [onMenu]
  );
  const pilihKegiatan = useCallback(
    (id: number) => {
      if (onPilihKegiatan) onPilihKegiatan(id);
      else window.location.href = `/sigap/kelola/translok?kegiatan=${id}`;
    },
    [onPilihKegiatan]
  );

  const subAdmin = useMemo(() => MENU_ADMIN.filter((m) => bolehKlien(ringkas.izin, m.menu, "lihat", kegId)), [ringkas.izin, kegId]);
  const bolehAkses = !!ringkas.izin["akses.kelola"];
  const bolehKontrak = !!ringkas.izin["kontrak.kelola"];
  const bolehPediaKelola = ringkas.izin["pedia.kelola"]?.level === "kelola";
  const bolehPelatihanKelola = !!ringkas.izin["pelatihan.kelola"]; // (7 Okt 2026) Kelola Pelatihan
  // (9 Okt 2026) /sigap/kelola/<modul> -- permintaan user: Delego & Kelola Aplikasi ikut di sidebar pengelolaan
  const bolehDelego = !!ringkas.izin["delego.admin"];
  // (11 Okt 2026) Pendataan keroyokan PPL/PML -- permintaan user (lembar petugas lewat tahap Pendataan di Beranda; sidebar desktop hanya memuat menu admin unggah, karena unggah CSV dari laptop)
  const bolehPendataanKelola = ringkas.izin["bencana.admin"]?.level === "kelola";
  const bolehAplikasi = ringkas.izin["portal.kelola"]?.level === "kelola" || ringkas.izin["translok.kegiatan"]?.level === "kelola";
  const namaPeran = Array.from(new Set(ringkas.peran.map((p) => p.nama)));
  const tahun = (ringkas.hari_ini || "2026").slice(0, 4);

  const itemPalet = useMemo<ItemPalet[]>(() => {
    const out: ItemPalet[] = [{ id: "m-beranda", grup: "Menu", label: "Beranda", ket: "ringkasan & perlu tindakan", jalankan: () => pindahMenu("beranda") }];
    for (const m of subAdmin) out.push({ id: `m-${m.kode}`, grup: "Menu", label: `Admin transport › ${m.label}`, jalankan: () => pindahMenu(m.kode) });
    if (bolehKontrak) out.push({ id: "m-kontrak", grup: "Menu", label: "Pengadaan & kontrak", ket: "paket, master, penyedia", jalankan: () => (window.location.href = "/sigap/kelola/pengadaan") });
    out.push({ id: "m-pedia", grup: "Menu", label: "SIGAP PEDIA", ket: "ensiklopedia konsultasi", jalankan: () => (window.location.href = "/sigap/pedia") });
    if (bolehPediaKelola) out.push({ id: "m-pedia-kelola", grup: "Menu", label: "SIGAP PEDIA › Buku register & arsip bukti", jalankan: () => (window.location.href = "/sigap/kelola/pedia") });
    if (tokenPetugas || bolehPelatihanKelola) out.push({ id: "m-pelatihan", grup: "Menu", label: "Pelatihan (langkah, pretest, presensi & posttest)", jalankan: () => (window.location.href = "/sigap/pelatihan") });
    if (bolehPelatihanKelola) out.push({ id: "m-pelatihan-kelola", grup: "Menu", label: "Pelatihan › Kelola soal, jadwal & monitoring", jalankan: () => (window.location.href = "/sigap/kelola/pelatihan") });
    if (bolehPendataanKelola) out.push({ id: "m-pendataan-unggah", grup: "Menu", label: "Pendataan › Unggah daftar KK (CSV FASIH)", jalankan: () => (window.location.href = "/sigap/kelola/pendataan") });
    if (bolehAplikasi) out.push({ id: "m-aplikasi", grup: "Menu", label: "Kelola aplikasi, admin & periode", jalankan: () => (window.location.href = "/sigap/kelola/aplikasi") });
    if (bolehDelego) out.push({ id: "m-delego", grup: "Menu", label: "Delego", ket: "aplikasi delegasi kerja", jalankan: () => (window.location.href = "/sigap/kelola/delego") });
    if (bolehAkses) out.push({ id: "m-akses", grup: "Menu", label: "Peran dan akses", jalankan: () => (window.location.href = "/sigap/kelola/akses") });
    if (tokenPetugas) out.push({ id: "m-translok", grup: "Menu", label: "Transport lokal (halaman petugas saya)", jalankan: () => (window.location.href = `/sigap/translok/${tokenPetugas}`) });
    out.push({ id: "m-portal", grup: "Menu", label: "Beranda SIGAP", jalankan: () => (window.location.href = "/") });
    out.push(...aksiPalet);
    for (const k of ringkas.kegiatan)
      out.push({ id: `k-${k.id}`, grup: "Kegiatan", label: k.nama, ket: `${k.kode}${k.aktif ? "" : " · selesai"}${k.id === kegId ? " · terpilih" : ""}`, jalankan: () => pilihKegiatan(k.id) });
    return out;
  }, [subAdmin, bolehAkses, bolehKontrak, bolehPediaKelola, bolehPelatihanKelola, bolehAplikasi, bolehDelego, bolehPendataanKelola, tokenPetugas, aksiPalet, ringkas.kegiatan, kegId, pindahMenu, pilihKegiatan]);

  const adaTindakan = (jumlahTindakan ?? 0) > 0;

  return (
    <main className="min-h-screen bg-[#F3F5F8] text-[#14202E] lg:flex">
      {/* ------------------------------------------------ Sidebar (layar lebar) */}
      {/* (6 Okt 2026) Sidebar navy sesuai desain "SIGAP · Monitoring kegiatan" dari user. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col self-start overflow-y-auto bg-[#0E2A47] px-2.5 py-3.5 text-[#C9D6E6] transition-[width] lg:flex ${mini ? "w-[68px]" : "w-[232px]"}`}
      >
        <Link href="/" className={`mb-3 flex items-center gap-2.5 rounded-lg px-2 pb-2 pt-1 ${mini ? "justify-center" : ""}`} title="Beranda SIGAP">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sigap-logo.png" alt="Logo SIGAP" className="h-full w-full object-contain" />
          </span>
          {!mini && (
            <span className="leading-tight">
              <span className="block text-[16px] font-bold tracking-wide text-white">SIGAP</span>
              <span className="block text-[11.5px] text-[#7F95AE]">BPS Kabupaten Solok</span>
            </span>
          )}
        </Link>
        <nav aria-label="Menu SIGAP" className="flex flex-col gap-0.5 text-[13.5px]">
          <ItemNav mini={mini} ikon="beranda" label="Beranda" aktif={aktif === "beranda"} onClick={() => pindahMenu("beranda")} />

          <LabelGrup mini={mini}>Perencanaan</LabelGrup>
          <ItemNav mini={mini} ikon="buku" label="RAB / POK" segera />
          <ItemNav mini={mini} ikon="revisi" label="Revisi anggaran" segera />

          <LabelGrup mini={mini}>Pelaksanaan</LabelGrup>
          {tokenPetugas ? (
            <ItemNav mini={mini} ikon="motor" label="Transport lokal" href={`/sigap/translok/${tokenPetugas}`} title="Halaman petugas transport lokal Anda" />
          ) : (
            <ItemNav mini={mini} ikon="motor" label="Transport lokal" nonaktif ket="—" title="Anda tidak punya penugasan transport lokal" />
          )}
          {(tokenPetugas || bolehPelatihanKelola) && <ItemNav mini={mini} ikon="buku" label="Pelatihan" href="/sigap/pelatihan" aktif={aktif === "pelatihan"} title="Langkah pelatihan: pretest, presensi, posttest" />}
          {bolehPelatihanKelola && <ItemNav mini={mini} ikon="grafik" label="Kelola pelatihan" href="/sigap/kelola/pelatihan" aktif={aktif === "pelatihan_kelola"} title="Soal, jadwal & monitoring tes" />}
          <ItemNav mini={mini} ikon="pesawat" label="Perjalanan dinas" segera />
          <ItemNav mini={mini} ikon="uang" label="Honor" segera />
          {bolehKontrak ? (
            <ItemNav mini={mini} ikon="paket" label="Pengadaan" href="/sigap/kelola/pengadaan" aktif={aktif === "kontrak"} title="Pengadaan & kontrak" />
          ) : (
            <ItemNav mini={mini} ikon="paket" label="Pengadaan" nonaktif ket="—" title="Akun Anda belum diberi akses Pengadaan & Kontrak" />
          )}

          <LabelGrup mini={mini}>Referensi</LabelGrup>
          <ItemNav mini={mini} ikon="pedia" label="SIGAP PEDIA" href="/sigap/pedia" aktif={aktif === "pedia"} title="Ensiklopedia konsultasi resmi" />
          {bolehPediaKelola && <ItemNav mini={mini} ikon="arsip" label="Register & arsip bukti" href="/sigap/kelola/pedia" aktif={aktif === "pedia_kelola"} />}

          <LabelGrup mini={mini}>Monitoring</LabelGrup>
          <ItemNav mini={mini} ikon="grafik" label="Realisasi dan serapan" segera />
          <ItemNav mini={mini} ikon="tautan" label="Sinkronisasi Delego" segera />

          {(subAdmin.length > 0 || bolehAkses || bolehAplikasi || bolehDelego || bolehPendataanKelola) && <LabelGrup mini={mini}>Administrasi</LabelGrup>}
          {subAdmin.length > 0 && (
            <>
              <ItemNav
                mini={mini}
                ikon="perisai"
                label="Admin transport lokal"
                induk={aktif !== "beranda" && aktif !== "akses" && aktif !== "kontrak" && aktif !== "pedia" && aktif !== "pedia_kelola" && aktif !== "pelatihan" && aktif !== "pelatihan_kelola"}
                onClick={() => pindahMenu(subAdmin[0].kode)}
                badge={adaTindakan ? jumlahTindakan : null}
              />
              {!mini && (
                <div className="ml-[19px] flex flex-col gap-0.5 border-l border-white/10 pl-2">
                  {subAdmin.map((m) => (
                    <button
                      key={m.kode}
                      type="button"
                      onClick={() => pindahMenu(m.kode)}
                      aria-current={aktif === m.kode ? "page" : undefined}
                      className={`rounded-md px-2 py-1 text-left text-[12.5px] transition ${
                        aktif === m.kode ? "bg-[#163A60] font-semibold text-white shadow-[inset_3px_0_0_#5C9DEB]" : "text-[#C9D6E6] hover:bg-[#163A60] hover:text-white"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {bolehAkses && <ItemNav mini={mini} ikon="gembok" label="Peran dan akses" href="/sigap/kelola/akses" aktif={aktif === "akses"} />}
          {bolehAplikasi && <ItemNav mini={mini} ikon="panel" label="Aplikasi & periode" href="/sigap/kelola/aplikasi" title="Kelola aplikasi, admin & periode kegiatan" />}
          {bolehDelego && <ItemNav mini={mini} ikon="tautan" label="Delego" href="/sigap/kelola/delego" title="Buka Delego" />}
          {bolehPendataanKelola && <ItemNav mini={mini} ikon="arsip" label="Unggah daftar KK" href="/sigap/kelola/pendataan" title="Unggah CSV ekspor FASIH-SM untuk Pendataan keroyokan" />}
        </nav>
        <div className="flex-1" />
        <div className="pt-3">
          <ItemNav mini={mini} ikon="panel" label={mini ? "Lebarkan menu" : "Ciutkan menu"} onClick={ciutkan} />
          {!mini && <p className="px-2.5 pt-2 text-[10.5px] leading-snug text-[#7F95AE]">Gerak Anggaran &amp; Pertanggungjawaban · TA {tahun}</p>}
        </div>
      </aside>

      {/* ------------------------------------------------ Kolom kanan */}
      <div className="min-w-0 flex-1">
        {/* Header + tab HP: display:contents agar BarisTab tetap sticky terhadap kolom ini. */}
        <div className="contents lg:hidden">{mobile}</div>

        {/* Topbar (layar lebar) */}
        <header className="sticky top-0 z-30 hidden h-[56px] items-center gap-3 border-b border-[#E3E8EE] bg-white px-6 lg:flex">
          <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center gap-1.5 text-[12.5px]">
            {jejak.map((j, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <span className="text-[#7B8794]">/</span>}
                <span className={`truncate ${i === jejak.length - 1 ? "font-semibold text-[#14202E]" : "text-[#7B8794]"}`}>{j}</span>
              </span>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setPalet(true)}
            className="mx-2 flex min-w-[180px] max-w-[420px] flex-1 items-center gap-2 rounded-lg border border-[#E3E8EE] bg-[#F8FAFC] px-2.5 py-1.5 text-[12px] text-[#7B8794] transition hover:border-[#CDD5DE]"
            aria-label="Cari kegiatan atau menu (Ctrl K)"
          >
            <Ikon n="cari" size={14} />
            <span className="flex-1 text-left">Cari kegiatan, menu…</span>
            <kbd className="rounded border border-[#E3E8EE] bg-white px-1.5 text-[10.5px] font-semibold text-[#7B8794]">Ctrl K</kbd>
          </button>
          <div className="flex-1" />
          {pemilihKegiatan && ringkas.kegiatan.length > 0 && (
            <label className="flex min-w-0 items-center">
              <span className="sr-only">Pilih kegiatan</span>
              <select
                value={kegId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) pilihKegiatan(id);
                }}
                className="max-w-[260px] truncate rounded-lg border border-[#E3E8EE] bg-white px-2 py-1.5 text-[12px] font-bold text-[#1F6FD1] outline-none focus:border-[#1F6FD1]"
              >
                {kegId == null && <option value="">Pilih kegiatan…</option>}
                {ringkas.kegiatan.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                    {k.aktif ? "" : " (selesai)"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="shrink-0 rounded-lg border border-[#E3E8EE] px-2 py-1 text-[11.5px] font-semibold text-[#4D5B6B]" title="Tahun anggaran">
            TA {tahun}
          </span>
          <button
            type="button"
            onClick={() => pindahMenu("beranda")}
            className="relative shrink-0 rounded-lg p-1.5 text-[#4D5B6B] hover:bg-[#F8FAFC] hover:text-[#1F6FD1]"
            aria-label={adaTindakan ? `${jumlahTindakan} hal perlu tindakan — buka Beranda` : "Tidak ada yang perlu tindakan — buka Beranda"}
            title={adaTindakan ? `${jumlahTindakan} hal perlu tindakan` : "Tidak ada yang perlu tindakan"}
          >
            <Ikon n="lonceng" size={18} />
            {adaTindakan && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                {(jumlahTindakan ?? 0) > 99 ? "99+" : jumlahTindakan}
              </span>
            )}
          </button>
          <div ref={avatarRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuAvatar((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuAvatar}
              title={ringkas.nama}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#E3EEFB] text-[12.5px] font-bold text-[#1F6FD1] ring-[#5C9DEB] hover:ring-2"
            >
              {inisial(ringkas.nama)}
            </button>
            {menuAvatar && (
              <div role="menu" className="absolute right-0 top-10 z-40 w-[240px] rounded-xl border border-[#E3E8EE] bg-white p-3 shadow-lg">
                <p className="text-[13px] font-bold leading-tight">{ringkas.nama}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {namaPeran.length === 0 && <span className="text-[11.5px] text-[#7B8794]">Tanpa peran admin</span>}
                  {namaPeran.map((p) => (
                    <span key={p} className="rounded-full bg-[#FBEFD6] px-2 py-0.5 text-[11px] font-bold text-[#9A6200]">
                      {p}
                    </span>
                  ))}
                </div>
                <div className="mt-3 border-t border-[#EDF0F4] pt-2">
                  <Link href="/" role="menuitem" className="block rounded-md px-2 py-1.5 text-[12.5px] text-[#14202E] hover:bg-[#F8FAFC]">
                    Beranda SIGAP
                  </Link>
                  <button type="button" role="menuitem" onClick={keluar} className="block w-full rounded-md px-2 py-1.5 text-left text-[12.5px] font-bold text-red-700 hover:bg-red-50">
                    Keluar
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-3 px-3 pb-16 pt-4 sm:px-5 lg:max-w-[1440px] lg:px-6 lg:pt-[22px]">{children}</div>
      </div>

      <PaletPerintah buka={palet} onTutup={() => setPalet(false)} item={itemPalet} />
    </main>
  );
}

function LabelGrup({ children, mini }: { children: React.ReactNode; mini?: boolean }) {
  if (mini) return <div className="mx-3 my-2 border-t border-white/10" aria-hidden />;
  return <p className="mx-2.5 mb-1 mt-3.5 whitespace-nowrap text-[11.5px] text-[#7F95AE]">{children}</p>;
}

function ItemNav({
  ikon,
  label,
  aktif = false,
  induk = false,
  segera = false,
  nonaktif = false,
  mini = false,
  ket,
  title,
  href,
  onClick,
  badge,
}: {
  ikon: NamaIkon;
  label: string;
  aktif?: boolean;
  /** Induk dari sub-item yang aktif: teks putih tanpa latar. */
  induk?: boolean;
  segera?: boolean;
  nonaktif?: boolean;
  /** Sidebar diciutkan: ikon saja, label jadi tooltip. */
  mini?: boolean;
  ket?: string;
  title?: string;
  href?: string;
  onClick?: () => void;
  badge?: number | null;
}) {
  const mati = segera || nonaktif;
  const kelas = `relative flex w-full items-center gap-2.5 whitespace-nowrap rounded-[7px] px-2.5 py-[7px] text-left transition ${mini ? "justify-center" : ""} ${
    aktif
      ? "bg-[#163A60] text-white shadow-[inset_3px_0_0_#5C9DEB]"
      : mati
        ? "cursor-default text-[#7F95AE]"
        : induk
          ? "font-semibold text-white hover:bg-[#163A60]"
          : "text-[#C9D6E6] hover:bg-[#163A60] hover:text-white"
  }`;
  const tip = title ?? (segera ? `${label} — segera hadir` : mini ? label : undefined);
  const isi = (
    <>
      <Ikon n={ikon} size={18} />
      {!mini && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!mini && segera && <span className="rounded-[10px] bg-white/[.08] px-[7px] py-px text-[11px] text-[#7F95AE]">segera</span>}
      {!mini && !segera && ket && <span className="text-[11px] text-[#7F95AE]">{ket}</span>}
      {badge != null && badge > 0 && (
        <span className={`rounded-[10px] bg-[#D9971F] px-[7px] py-px text-[11px] font-semibold text-[#2B1C00] ${mini ? "absolute -right-0.5 -top-1 px-[5px] text-[10px]" : ""}`}>{badge}</span>
      )}
    </>
  );
  if (mati)
    return (
      <span className={kelas} aria-disabled="true" title={tip}>
        {isi}
      </span>
    );
  if (href)
    return (
      <Link href={href} className={kelas} aria-current={aktif ? "page" : undefined} title={tip} aria-label={mini ? label : undefined}>
        {isi}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={kelas} aria-current={aktif ? "page" : undefined} title={tip} aria-label={mini ? label : undefined}>
      {isi}
    </button>
  );
}
