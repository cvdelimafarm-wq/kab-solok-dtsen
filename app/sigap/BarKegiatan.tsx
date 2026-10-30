"use client";

// app/sigap/BarKegiatan.tsx
//
// (31 Okt 2026) Bar bawah SERAGAM untuk kegiatan bertemplate "menu rutin" (lib/sigapMenuKegiatan.ts): Hari Ini | Sampel | [Pengawasan/Supervisi] | Kamera | Translok.
//  * "Kamera" tombol aksi (menonjol, membuka layar kamera penuh), bukan tab;
//  * Hari Ini memakai ikon kalender bertanggal (ikon rumah sudah milik Beranda);
//  * Back HP = tab yang diklik sebelumnya, lalu Hari Ini, lalu Beranda: tab yang sudah ada di tumpukan tidak didorong lagi, melainkan mundur ke sana
//    (history.go(-n)); tumpukan disimpan per kegiatan di sessionStorage. Tombol "Kembali" di kepala halaman memakai riwayat yang sama (TombolKembali).

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import IkonMenu from "@/app/portal/IkonMenu";
import { useData } from "@/app/portal/dataBersama";
import { susunTahap, type Induk } from "@/lib/sigapTahap";
import type { RingkasKegiatan } from "@/lib/sigapKegiatan";
import { pakaiTemplateMenu, putuskanTab, selaraskanTumpuk, susunBar, type ItemBar, type KunciTab, type PeranMenu } from "@/lib/sigapMenuKegiatan";

const kunciTumpuk = (kode: string) => `sigap_tabbar:${kode}`;
function bacaTumpuk(kode: string): string[] {
  try {
    const a = JSON.parse(sessionStorage.getItem(kunciTumpuk(kode)) ?? "[]");
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function simpanTumpuk(kode: string, t: string[]) {
  try {
    sessionStorage.setItem(kunciTumpuk(kode), JSON.stringify(t));
  } catch {
    /* abaikan */
  }
}

const PERAN_SAH: PeranMenu[] = ["ppl", "pml", "supervisor"];

/**
 * Bahan bar untuk satu kegiatan induk dari simpanan bersama (tanpa memuat data pelatihan). `kode` boleh null dan `cariModul` dipakai menemukan induk
 * yang memuat modul itu (halaman lama tanpa ?k=). Hasil null = kegiatan tidak memakai template (halaman memakai tampilan lamanya).
 */
export function useBarKegiatan(kode: string | null, cariModul?: string): { kode: string | null; items: ItemBar[] | null; peran: PeranMenu | null; siap: boolean; galat: boolean } {
  const aktif = !!(kode || cariModul); // tanpa kode: tidak memuat apa-apa (halaman lama tanpa bar)
  const dInduk = useData<{ sekarang: string; induk: Induk[] }>("/api/portal/induk", { aktif });
  const dKeg = useData<{ kegiatan: RingkasKegiatan[] }>("/api/portal/kegiatan", { aktif });
  const induk = useMemo(() => {
    const semua = dInduk.data?.induk ?? [];
    if (kode) return semua.find((x) => x.kode === kode) ?? null;
    if (cariModul) return semua.find((x) => x.tahap.some((t) => t.isi.includes(cariModul))) ?? null;
    return null;
  }, [dInduk.data, kode, cariModul]);
  const keg = dKeg.data?.kegiatan ?? null;
  const siap = !!dInduk.data && (keg !== null || !!dKeg.galat);

  const hasil = useMemo(() => {
    if (!induk || !siap || !pakaiTemplateMenu(induk.tahap)) return { items: null, peran: null as PeranMenu | null };
    const peran = induk.spdt?.peran;
    if (!peran || !(PERAN_SAH as string[]).includes(peran)) return { items: null, peran: null };
    const tahap = susunTahap({ induk, hub: null, hubMuat: "gagal", keg: keg ?? [], nowMs: Date.now() });
    const modul = tahap.flatMap((t) => t.modul.map((m) => m.kode));
    const modulAda = new Set(modul);
    // penugasan Translok akun di kegiatan ini: modul "translok:<id>" yang berlaku dan punya alamat halaman kerja
    const idTl = induk.tahap.flatMap((t) => t.isi).filter((m) => /^translok:\d+$/.test(m)).map((m) => Number(m.slice(9)));
    const tl = (keg ?? []).find((x) => x.kegiatan_id != null && idTl.includes(x.kegiatan_id) && !!x.hrefKerja);
    const items = susunBar({
      kode: induk.kode,
      peran: peran as PeranMenu,
      modul: [...modulAda].filter((m) => !/^translok:/.test(m)),
      translok: tl && tl.hrefKerja && tl.kegiatan_id != null ? { href: tl.hrefKerja, kegiatanId: tl.kegiatan_id } : null,
    });
    return { items, peran: peran as PeranMenu };
  }, [induk, keg, siap]);

  return { kode: induk?.kode ?? null, items: hasil.items, peran: hasil.peran, siap, galat: !!dInduk.galat };
}

/** Ikon kalender bertanggal (tanggal hari ini WIB di dalamnya). */
function IkonHariIni({ className }: { className: string }) {
  const tgl = new Date(Date.now() + 7 * 3_600_000).getUTCDate();
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <text x="12" y="17.6" textAnchor="middle" fontSize="7.4" fontWeight="800" fill="currentColor" stroke="none">
        {tgl}
      </text>
    </svg>
  );
}

function Ikon({ k }: { k: ItemBar["kunci"] }) {
  const c = "h-[22px] w-[22px]";
  if (k === "hari_ini") return <IkonHariIni className={`${c} flex-none`} />;
  if (k === "sampel") return <IkonMenu n="peta" className={c} />;
  if (k === "pengawasan") return <IkonMenu n="grafik" className={c} />;
  if (k === "kamera") return <IkonMenu n="kamera" className="h-[26px] w-[26px]" />;
  return <IkonMenu n="periode" className={c} />;
}

/**
 * `aktif` = tab yang sedang tampil. Beri `pb-28` pada konten supaya tidak tertutup bar.
 * `onKetuk` (opsional): halaman yang menangani sendiri sebagian tab di tempat (mis. Translok: Hari Ini <-> Translok) mengembalikan true setelah
 * mendorong entri riwayatnya; bila false/tidak ada, bar berpindah halaman (router.push). Mundur selalu lewat riwayat peramban.
 */
export default function BarKegiatan({ kode, items, aktif, onKetuk }: { kode: string; items: ItemBar[]; aktif: KunciTab; onKetuk?: (it: ItemBar) => boolean }) {
  const router = useRouter();
  // selaraskan tumpukan dengan tab yang tampil (Back sistem bisa mengubahnya tanpa lewat bar)
  useEffect(() => {
    simpanTumpuk(kode, selaraskanTumpuk(bacaTumpuk(kode), aktif));
  }, [kode, aktif]);

  function ketuk(it: ItemBar) {
    if (it.kunci === "kamera") return router.push(it.href);
    const k = putuskanTab(bacaTumpuk(kode), aktif, it.kunci);
    if (k.aksi === "tetap") return window.scrollTo({ top: 0, behavior: "smooth" });
    simpanTumpuk(kode, k.tumpuk);
    if (k.aksi === "mundur") return window.history.go(-k.n);
    if (onKetuk?.(it)) return;
    router.push(it.href);
  }

  return (
    <nav aria-label="Menu kegiatan" className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E3E8F0] bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto flex max-w-lg">
        {items.map((it) =>
          it.kunci === "kamera" ? (
            <button key={it.kunci} type="button" onClick={() => ketuk(it)} aria-label="Buka Kamera SIGAP" className="flex flex-1 flex-col items-center gap-0.5 pb-2 text-[11px] font-bold text-[#0F3D7A]">
              <span className="-mt-4 grid h-[52px] w-[52px] place-items-center rounded-full bg-[#0F3D7A] text-white shadow-[0_6px_16px_rgba(15,42,82,.35)] ring-4 ring-white active:scale-95">
                <Ikon k="kamera" />
              </span>
              {it.label}
            </button>
          ) : (
            <button
              key={it.kunci}
              type="button"
              onClick={() => ketuk(it)}
              aria-current={aktif === it.kunci ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 border-t-[3px] pb-2.5 pt-2 text-[11.5px] font-bold ${aktif === it.kunci ? "border-[#F5B841] text-[#0F3D7A]" : "border-transparent text-[#8592A8]"}`}
            >
              <Ikon k={it.kunci} />
              <span className="max-w-full truncate px-0.5">{it.label}</span>
            </button>
          ),
        )}
      </div>
    </nav>
  );
}
