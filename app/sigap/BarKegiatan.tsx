"use client";

// app/sigap/BarKegiatan.tsx
//
// (31 Okt 2026) Bar bawah SERAGAM untuk kegiatan bertemplate "menu rutin" (lib/sigapMenuKegiatan.ts): Hari Ini | Sampel | [Pengawasan/Supervisi] | Kamera | Translok.
//  * "Kamera" tombol aksi (menonjol, membuka layar kamera penuh), bukan tab;
//  * Hari Ini memakai ikon kalender bertanggal (ikon rumah sudah milik Beranda);
//  * Back HP = tab yang diklik sebelumnya, lalu Hari Ini, lalu Beranda: tab yang sudah ada di tumpukan tidak didorong lagi, melainkan mundur ke sana
//    (history.go(-n)); tumpukan disimpan per kegiatan di sessionStorage. Tombol "Kembali" di kepala halaman memakai riwayat yang sama (TombolKembali).

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import IkonMenu from "@/app/portal/IkonMenu";
import { useData } from "@/app/portal/dataBersama";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { susunTahap, type Induk } from "@/lib/sigapTahap";
import type { RingkasKegiatan } from "@/lib/sigapKegiatan";
import { idTranslokMenu, indukMemuatModul, langkahSekali, pakaiTemplateMenu, peranMenuDariInduk, putuskanTab, selaraskanTumpuk, susunBar, type ItemBar, type KunciTab, type LangkahSekali, type PeranMenu } from "@/lib/sigapMenuKegiatan";

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

/**
 * Bahan bar untuk satu kegiatan induk dari simpanan bersama (tanpa memuat data pelatihan). `kode` boleh null dan `cariModul` dipakai menemukan induk
 * yang memuat modul itu (halaman lama tanpa ?k=). Hasil null = kegiatan tidak memakai template (halaman memakai tampilan lamanya).
 */
export function useBarKegiatan(kode: string | null, cariModul?: string): { kode: string | null; items: ItemBar[] | null; peran: PeranMenu | null; langkah: LangkahSekali[]; siap: boolean; galat: boolean } {
  const aktif = !!(kode || cariModul); // tanpa kode: tidak memuat apa-apa (halaman lama tanpa bar)
  const dInduk = useData<{ sekarang: string; induk: Induk[] }>("/api/portal/induk", { aktif });
  const dKeg = useData<{ kegiatan: RingkasKegiatan[] }>("/api/portal/kegiatan", { aktif });
  const induk = useMemo(() => {
    const semua = dInduk.data?.induk ?? [];
    if (kode) return semua.find((x) => x.kode === kode) ?? null;
    if (cariModul) return semua.find((x) => indukMemuatModul(x.tahap, cariModul)) ?? null;
    return null;
  }, [dInduk.data, kode, cariModul]);
  const keg = dKeg.data?.kegiatan ?? null;
  const siap = !!dInduk.data && (keg !== null || !!dKeg.galat);
  const hasil = useMemo(() => {
    const kosong = { items: null, peran: null as PeranMenu | null, langkah: [] as LangkahSekali[] };
    if (!induk || !siap || !pakaiTemplateMenu(induk.tahap)) return kosong;
    const peran = peranMenuDariInduk(induk);
    if (!peran) return kosong;
    const tahap = susunTahap({ induk, hub: null, hubMuat: "gagal", keg: keg ?? [], nowMs: Date.now() });
    const modulSemua = tahap.flatMap((t) => t.modul);
    const modulAda = new Set(modulSemua.map((m) => m.kode));
    // penugasan Translok akun di kegiatan ini: modul "translok:<id>" yang berlaku dan punya alamat halaman kerja.
    // (Fase 4) Translok milik tahap Pelatihan tidak ikut: Pascabencana punya translok:3 (pelatihan) dan translok:1 (pendataan).
    const idTl = idTranslokMenu(induk.tahap);
    const tl = (keg ?? []).find((x) => x.kegiatan_id != null && idTl.includes(x.kegiatan_id) && !!x.hrefKerja);
    const items = susunBar({
      kode: induk.kode,
      peran: peran as PeranMenu,
      modul: [...modulAda].filter((m) => !/^translok:/.test(m)),
      translok: tl && tl.hrefKerja && tl.kegiatan_id != null ? { href: tl.hrefKerja, kegiatanId: tl.kegiatan_id } : null,
    });
    return { items, peran: peran as PeranMenu, langkah: langkahSekali(induk.kode, modulSemua) };
  }, [induk, keg, siap]);
  return { kode: induk?.kode ?? null, items: hasil.items, peran: hasil.peran, langkah: hasil.langkah, siap, galat: !!dInduk.galat };
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
export default function BarKegiatan({ kode, items, aktif, onKetuk, sinkron = true }: { kode: string; items: ItemBar[]; aktif: KunciTab; onKetuk?: (it: ItemBar) => boolean; sinkron?: boolean }) {
  const router = useRouter();
  // (31 Okt 2026) Kamera tetap ada di semua kegiatan. Dibuka di luar hari kerja Translok -> tanya dulu (bisa saja foto untuk laporan). Data dari simpanan bersama
  // (/api/sigap/foto/mode, sama dengan halaman Kamera); belum termuat/gagal = langsung buka kamera.
  const dMode = useData<{ kegiatan: { kegiatan_id: number; hari_kerja_hari_ini?: boolean }[] }>("/api/sigap/foto/mode");
  const [tanyaKamera, setTanyaKamera] = useState<string | null>(null);
  // selaraskan tumpukan dengan tab yang tampil (Back sistem bisa mengubahnya tanpa lewat bar)
  // `sinkron=false` selama halaman belum menentukan tab awalnya (Translok: tab dari tautan baru dipakai setelah data masuk); tanpa itu tab sementara "Hari Ini"
  // memotong tumpukan yang baru disimpan ketuk() dan Back antar tab berikutnya salah arah.
  useEffect(() => {
    if (!sinkron) return;
    simpanTumpuk(kode, selaraskanTumpuk(bacaTumpuk(kode), aktif));
  }, [kode, aktif, sinkron]);

  function ketuk(it: ItemBar) {
    if (it.kunci === "kamera") {
      const id = Number(/kegiatan=(\d+)/.exec(it.href)?.[1]);
      const m = (dMode.data?.kegiatan ?? []).filter((x) => x.kegiatan_id === id);
      const tanpaJadwal = m.length > 0 && m.every((x) => x.hari_kerja_hari_ini === false);
      return tanpaJadwal ? setTanyaKamera(it.href) : router.push(it.href);
    }
    const k = putuskanTab(bacaTumpuk(kode), aktif, it.kunci);
    if (k.aksi === "tetap") return window.scrollTo({ top: 0, behavior: "smooth" });
    simpanTumpuk(kode, k.tumpuk);
    if (k.aksi === "mundur") return window.history.go(-k.n);
    if (onKetuk?.(it)) return;
    router.push(it.href);
  }

  return (
    <>
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
    {/* di luar <nav>: backdrop-blur membuat nav menjadi acuan posisi "fixed" anaknya */}
    {tanyaKamera && <ModalKameraTanpaJadwal onBatal={() => setTanyaKamera(null)} onYa={() => { const h = tanyaKamera; setTanyaKamera(null); router.push(h); }} />}
    </>
  );
}

function ModalKameraTanpaJadwal({ onBatal, onYa }: { onBatal: () => void; onYa: () => void }) {
  useTutupDenganBack(true, onBatal);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="judul-kamera-tanpa-jadwal" className="fixed inset-0 z-50 grid place-items-center bg-[#0F2A52]/55 px-5" onClick={onBatal}>
      <div className="w-full max-w-sm rounded-[20px] bg-white p-5 shadow-[0_20px_50px_rgba(15,42,82,.35)]" onClick={(e) => e.stopPropagation()}>
        <h2 id="judul-kamera-tanpa-jadwal" className="text-[16.5px] font-extrabold text-[#0F2A52]">Tidak ada jadwal Translok hari ini</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#3F5070]">Anda tidak punya hari kerja Translok hari ini. Tetap gunakan kamera ini?</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={onBatal} className="min-h-[46px] rounded-[13px] border border-[#C9D3E6] bg-white text-[14px] font-extrabold text-[#0F2A52]">
            Batal
          </button>
          <button type="button" onClick={onYa} className="min-h-[46px] rounded-[13px] bg-[#0F2A52] px-2 text-[14px] font-extrabold text-white">
            Ya, untuk laporan
          </button>
        </div>
      </div>
    </div>
  );
}
