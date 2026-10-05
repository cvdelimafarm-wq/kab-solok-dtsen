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

export type KodeMenu = "beranda" | "monitoring" | "penugasan" | "kegiatan" | "verifikasi" | "akses";
export type KodeTabAdmin = Exclude<KodeMenu, "akses">;

/** Sub-menu Admin transport (urutan = urutan tampil), dipakai sidebar, palet & halaman admin. */
export const MENU_ADMIN: { kode: Exclude<KodeTabAdmin, "beranda">; label: string; menu: string }[] = [
  { kode: "monitoring", label: "Monitoring", menu: "translok.monitoring" },
  { kode: "penugasan", label: "Penugasan & ST", menu: "translok.penugasan" },
  { kode: "kegiatan", label: "Kegiatan & Tarif", menu: "translok.kegiatan" },
  { kode: "verifikasi", label: "Verifikasi & Kunci", menu: "translok.verifikasi" },
];

// ---------------------------------------------------------------- Ikon SVG inline kecil (tanpa dependensi)
type NamaIkon = "beranda" | "buku" | "revisi" | "motor" | "pesawat" | "uang" | "paket" | "grafik" | "tautan" | "perisai" | "gembok" | "cari" | "lonceng" | "panah";
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
  /** Header + tab versi HP (dirender hanya < lg). */
  mobile: React.ReactNode;
  children: React.ReactNode;
}) {
  const [tokenPetugas, setTokenPetugas] = useState<string | null>(null);
  const [palet, setPalet] = useState(false);
  const [menuAvatar, setMenuAvatar] = useState(false);
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
      else window.location.href = `/sigap/admin?tab=${k}`;
    },
    [onMenu]
  );
  const pilihKegiatan = useCallback(
    (id: number) => {
      if (onPilihKegiatan) onPilihKegiatan(id);
      else window.location.href = `/sigap/admin?kegiatan=${id}`;
    },
    [onPilihKegiatan]
  );

  const subAdmin = useMemo(() => MENU_ADMIN.filter((m) => bolehKlien(ringkas.izin, m.menu, "lihat", kegId)), [ringkas.izin, kegId]);
  const bolehAkses = !!ringkas.izin["akses.kelola"];
  const namaPeran = Array.from(new Set(ringkas.peran.map((p) => p.nama)));
  const tahun = (ringkas.hari_ini || "2026").slice(0, 4);

  const itemPalet = useMemo<ItemPalet[]>(() => {
    const out: ItemPalet[] = [{ id: "m-beranda", grup: "Menu", label: "Beranda", ket: "ringkasan & perlu tindakan", jalankan: () => pindahMenu("beranda") }];
    for (const m of subAdmin) out.push({ id: `m-${m.kode}`, grup: "Menu", label: `Admin transport › ${m.label}`, jalankan: () => pindahMenu(m.kode) });
    if (bolehAkses) out.push({ id: "m-akses", grup: "Menu", label: "Peran dan akses", jalankan: () => (window.location.href = "/sigap/akses") });
    if (tokenPetugas) out.push({ id: "m-translok", grup: "Menu", label: "Transport lokal (halaman petugas saya)", jalankan: () => (window.location.href = `/sigap/translok/${tokenPetugas}`) });
    out.push({ id: "m-portal", grup: "Menu", label: "Portal SIGAP", jalankan: () => (window.location.href = "/sigap") });
    out.push(...aksiPalet);
    for (const k of ringkas.kegiatan)
      out.push({ id: `k-${k.id}`, grup: "Kegiatan", label: k.nama, ket: `${k.kode}${k.aktif ? "" : " · selesai"}${k.id === kegId ? " · terpilih" : ""}`, jalankan: () => pilihKegiatan(k.id) });
    return out;
  }, [subAdmin, bolehAkses, tokenPetugas, aksiPalet, ringkas.kegiatan, kegId, pindahMenu, pilihKegiatan]);

  const adaTindakan = (jumlahTindakan ?? 0) > 0;

  return (
    <main className="min-h-screen bg-[#EEF2F8] text-[#13213A] lg:flex lg:bg-[#F6F8FB]">
      {/* ------------------------------------------------ Sidebar (layar lebar) */}
      <aside className="sticky top-0 hidden h-screen self-start w-[228px] shrink-0 flex-col overflow-y-auto border-r border-[#E3E8F0] bg-white px-2.5 py-3 lg:flex">
        <Link href="/sigap" className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[#F6F8FB]">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0F3D7A] text-[13px] font-extrabold text-white">S</span>
          <span className="leading-tight">
            <span className="block text-[13px] font-extrabold tracking-wide">SIGAP</span>
            <span className="block text-[11px] text-[#6B7890]">BPS Kab. Solok</span>
          </span>
        </Link>
        <nav aria-label="Menu SIGAP" className="flex flex-col gap-0.5 text-[12.5px]">
          <ItemNav ikon="beranda" label="Beranda" aktif={aktif === "beranda"} onClick={() => pindahMenu("beranda")} />

          <LabelGrup>Perencanaan</LabelGrup>
          <ItemNav ikon="buku" label="RAB / POK" segera />
          <ItemNav ikon="revisi" label="Revisi" segera />

          <LabelGrup>Pelaksanaan</LabelGrup>
          {tokenPetugas ? (
            <ItemNav ikon="motor" label="Transport lokal" href={`/sigap/translok/${tokenPetugas}`} title="Halaman petugas transport lokal Anda" />
          ) : (
            <ItemNav ikon="motor" label="Transport lokal" nonaktif ket="—" title="Anda tidak punya penugasan transport lokal" />
          )}
          <ItemNav ikon="pesawat" label="Perjadin" segera />
          <ItemNav ikon="uang" label="Honor" segera />
          <ItemNav ikon="paket" label="Pengadaan" segera />

          <LabelGrup>Monitoring</LabelGrup>
          <ItemNav ikon="grafik" label="Realisasi" segera />
          <ItemNav ikon="tautan" label="Delego" segera />

          {(subAdmin.length > 0 || bolehAkses) && <LabelGrup>Administrasi</LabelGrup>}
          {subAdmin.length > 0 && (
            <>
              <ItemNav
                ikon="perisai"
                label="Admin transport"
                induk={aktif !== "beranda" && aktif !== "akses"}
                onClick={() => pindahMenu(subAdmin[0].kode)}
                badge={adaTindakan ? jumlahTindakan : null}
              />
              <div className="ml-[22px] flex flex-col gap-0.5 border-l border-[#E3E8F0] pl-2">
                {subAdmin.map((m) => (
                  <button
                    key={m.kode}
                    type="button"
                    onClick={() => pindahMenu(m.kode)}
                    aria-current={aktif === m.kode ? "page" : undefined}
                    className={`rounded-md px-2 py-1 text-left text-[12px] transition ${
                      aktif === m.kode ? "bg-[#E8EEF8] font-bold text-[#0F3D7A]" : "text-[#55627A] hover:bg-[#F6F8FB] hover:text-[#0F3D7A]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {bolehAkses && <ItemNav ikon="gembok" label="Peran dan akses" href="/sigap/akses" aktif={aktif === "akses"} />}
        </nav>
        <div className="flex-1" />
        <p className="px-2 pt-4 text-[10.5px] leading-snug text-[#8592A8]">Gerak Anggaran &amp; Pertanggungjawaban · TA {tahun}</p>
      </aside>

      {/* ------------------------------------------------ Kolom kanan */}
      <div className="min-w-0 flex-1">
        {/* Header + tab HP: display:contents agar BarisTab tetap sticky terhadap kolom ini. */}
        <div className="contents lg:hidden">{mobile}</div>

        {/* Topbar (layar lebar) */}
        <header className="sticky top-0 z-30 hidden h-[52px] items-center gap-3 border-b border-[#E3E8F0] bg-white/95 px-5 backdrop-blur lg:flex">
          <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center gap-1.5 text-[12.5px]">
            {jejak.map((j, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <span className="text-[#B4BFD0]">›</span>}
                <span className={`truncate ${i === jejak.length - 1 ? "font-bold text-[#13213A]" : "text-[#6B7890]"}`}>{j}</span>
              </span>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setPalet(true)}
            className="mx-2 flex min-w-[180px] max-w-[420px] flex-1 items-center gap-2 rounded-lg border border-[#E3E8F0] bg-[#F6F8FB] px-2.5 py-1.5 text-[12px] text-[#8592A8] transition hover:border-[#C9D6EA]"
            aria-label="Cari kegiatan atau menu (Ctrl K)"
          >
            <Ikon n="cari" size={14} />
            <span className="flex-1 text-left">Cari kegiatan, menu…</span>
            <kbd className="rounded border border-[#E3E8F0] bg-white px-1.5 text-[10.5px] font-semibold text-[#6B7890]">Ctrl K</kbd>
          </button>
          <div className="flex-1" />
          {ringkas.kegiatan.length > 0 && (
            <label className="flex min-w-0 items-center">
              <span className="sr-only">Pilih kegiatan</span>
              <select
                value={kegId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (id) pilihKegiatan(id);
                }}
                className="max-w-[260px] truncate rounded-lg border border-[#E3E8F0] bg-white px-2 py-1.5 text-[12px] font-bold text-[#0F3D7A] outline-none focus:border-[#0F3D7A]"
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
          <span className="shrink-0 rounded-lg border border-[#E3E8F0] px-2 py-1 text-[11.5px] font-semibold text-[#55627A]" title="Tahun anggaran">
            TA {tahun}
          </span>
          <button
            type="button"
            onClick={() => pindahMenu("beranda")}
            className="relative shrink-0 rounded-lg p-1.5 text-[#55627A] hover:bg-[#F6F8FB] hover:text-[#0F3D7A]"
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
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8EEF8] text-[11.5px] font-extrabold text-[#0F3D7A] ring-[#F5B841] hover:ring-2"
            >
              {inisial(ringkas.nama)}
            </button>
            {menuAvatar && (
              <div role="menu" className="absolute right-0 top-10 z-40 w-[240px] rounded-xl border border-[#E3E8F0] bg-white p-3 shadow-lg">
                <p className="text-[13px] font-bold leading-tight">{ringkas.nama}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {namaPeran.length === 0 && <span className="text-[11.5px] text-[#6B7890]">Tanpa peran admin</span>}
                  {namaPeran.map((p) => (
                    <span key={p} className="rounded-full bg-[#FDF3DC] px-2 py-0.5 text-[11px] font-bold text-[#8A5A00]">
                      {p}
                    </span>
                  ))}
                </div>
                <div className="mt-3 border-t border-[#EEF1F5] pt-2">
                  <Link href="/sigap" role="menuitem" className="block rounded-md px-2 py-1.5 text-[12.5px] text-[#13213A] hover:bg-[#F6F8FB]">
                    Portal SIGAP
                  </Link>
                  <button type="button" role="menuitem" onClick={keluar} className="block w-full rounded-md px-2 py-1.5 text-left text-[12.5px] font-bold text-red-700 hover:bg-red-50">
                    Keluar
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-3 px-3 pb-16 pt-4 sm:px-5 lg:max-w-[1400px] lg:px-6 lg:pt-5">{children}</div>
      </div>

      <PaletPerintah buka={palet} onTutup={() => setPalet(false)} item={itemPalet} />
    </main>
  );
}

function LabelGrup({ children }: { children: React.ReactNode }) {
  return <p className="mx-2 mb-1 mt-3.5 text-[10.5px] font-bold uppercase tracking-wider text-[#8592A8]">{children}</p>;
}

function ItemNav({
  ikon,
  label,
  aktif = false,
  induk = false,
  segera = false,
  nonaktif = false,
  ket,
  title,
  href,
  onClick,
  badge,
}: {
  ikon: NamaIkon;
  label: string;
  aktif?: boolean;
  /** Induk dari sub-item yang aktif: teks aksen tanpa pil. */
  induk?: boolean;
  segera?: boolean;
  nonaktif?: boolean;
  ket?: string;
  title?: string;
  href?: string;
  onClick?: () => void;
  badge?: number | null;
}) {
  const mati = segera || nonaktif;
  const kelas = `flex w-full items-center gap-2 rounded-lg px-2 py-[6px] text-left transition ${
    aktif ? "bg-[#E8EEF8] font-bold text-[#0F3D7A]" : mati ? "cursor-default text-[#A3AEC0]" : induk ? "font-bold text-[#0F3D7A] hover:bg-[#F6F8FB]" : "text-[#3B4A63] hover:bg-[#F6F8FB] hover:text-[#0F3D7A]"
  }`;
  const isi = (
    <>
      <Ikon n={ikon} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {segera && <span className="rounded bg-[#F1F4F8] px-1.5 py-px text-[10.5px] font-semibold text-[#8592A8]">segera</span>}
      {!segera && ket && <span className="text-[10.5px] text-[#A3AEC0]">{ket}</span>}
      {badge != null && badge > 0 && <span className="rounded bg-amber-100 px-1.5 py-px text-[10.5px] font-bold text-amber-800">{badge}</span>}
    </>
  );
  if (mati)
    return (
      <span className={kelas} aria-disabled="true" title={title ?? (segera ? `${label} — segera hadir` : undefined)}>
        {isi}
      </span>
    );
  if (href)
    return (
      <Link href={href} className={kelas} aria-current={aktif ? "page" : undefined} title={title}>
        {isi}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={kelas} aria-current={aktif ? "page" : undefined} title={title}>
      {isi}
    </button>
  );
}
