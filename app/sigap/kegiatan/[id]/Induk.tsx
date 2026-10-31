"use client";

// app/sigap/kegiatan/[id]/Induk.tsx
//
// (9 Okt 2026) Layer 2 kegiatan INDUK (mockup disetujui user): garis waktu vertikal tahap proses bisnis (Perencanaan, Pelatihan, Pendataan,
// Evaluasi, dst. -- diatur admin per kegiatan di /portal/admin/tahap). Tahap yang sedang dikerjakan ditandai "Kerjakan sekarang".
// Mengetuk tahap membuka halaman tahapnya (Layer 3): Pelatihan -> /sigap/pelatihan, lainnya -> /sigap/kegiatan/<kegiatan>/<tahap>.
// (31 Okt 2026) Kegiatan bermenu rutin (lib/sigapMenuKegiatan.ts: pakaiTemplateMenu) tidak lagi memakai garis waktu: mengetuk ikonnya di Beranda mendarat di
// "Hari Ini" dengan bar bawah (Hari Ini | Sampel | Pengawasan/Supervisi | Kamera | Translok). Bila petugas punya penugasan Transport Lokal, Hari Ini = halaman
// Hari Ini milik Translok (replace, supaya Kembali pulang ke Beranda); bila tidak, halaman ini menampilkan Hari Ini sederhana berisi pintasan menu.

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import IkonMenu from "@/app/portal/IkonMenu";
import { Cincin } from "@/app/portal/CincinKegiatan";
import TombolKembali from "@/app/components/TombolKembali";
import { buatRencana, useSiapkan } from "@/app/portal/siapkan";
import { adalahTugas } from "@/lib/sigapPrioritas";
import { tahapSekarang, type TahapHasil } from "@/lib/sigapTahap";
import type { StatusLangkah } from "@/lib/sigapKegiatan";
import { useInduk } from "../useInduk";
import BarKegiatan, { useBarKegiatan } from "../../BarKegiatan";
import BarisPengawasan from "../../BarisPengawasan";
import BarisLangkah from "../../BarisLangkah";

const NODE: Record<StatusLangkah, string> = {
  selesai: "bg-[#19A463] text-white",
  mendesak: "bg-[#F4B400] text-[#0F2A52] ring-[3px] ring-[#D43A3A]",
  perlu: "bg-[#FFF4D6] text-[#8A6200] ring-2 ring-[#F4B400]",
  sekarang: "bg-[#0F2A52] text-[#F4B400]",
  berjalan: "bg-white text-[#1F5FD1] ring-2 ring-[#1F5FD1]",
  menunggu: "bg-[#EEF2F7] text-[#5B6B84] ring-2 ring-[#D5DBE6]",
  terkunci: "bg-[#EEF2F7] text-[#5B6B84] ring-2 ring-[#D5DBE6]",
};
const CHIP: Record<StatusLangkah, { teks: string; kelas: string }> = {
  selesai: { teks: "Selesai", kelas: "bg-[#E3F6EC] text-[#13794B]" },
  mendesak: { teks: "Mendesak", kelas: "bg-[#FDE8E8] text-[#B42329]" },
  perlu: { teks: "Perlu dilengkapi", kelas: "bg-[#FFF4D6] text-[#8A6200]" },
  sekarang: { teks: "Sekarang", kelas: "bg-[#E6EEFC] text-[#1F5FD1]" },
  berjalan: { teks: "Berjalan", kelas: "bg-[#E6EEFC] text-[#1F5FD1]" },
  menunggu: { teks: "Belum mulai", kelas: "bg-[#E3E8F0] text-[#55657D]" },
  terkunci: { teks: "Belum dibuka", kelas: "bg-[#E3E8F0] text-[#55657D]" },
};

function Tahap({ t, akhir, aktif }: { t: TahapHasil; akhir: boolean; aktif: boolean }) {
  const garis = t.status === "selesai" ? "bg-[#19A463]" : "bg-[#D5DBE6]";
  const c = CHIP[t.status];
  const bisa = !t.terkunci && t.isi.length > 0;
  // (19 Okt 2026) Kartu aktif menghitung TUGAS bernomor (sama dengan kartu "Tugas aktif" & halaman tahap), bukan semua bagian informasi (Wilayah tim dst.).
  const tugas = t.modul.filter((m) => adalahTugas(m.kode));
  const tampil = tugas.length > 0 ? tugas : t.modul;
  const judul = (
    <div className="flex flex-wrap items-center gap-2">
      <b className="text-[15px] font-extrabold text-[#0F2A52]">{t.nama}</b>
      <span className={`rounded-full px-2 py-[2px] text-[10.5px] font-extrabold ${c.kelas}`}>{c.teks}</span>
    </div>
  );
  return (
    <li className="flex gap-3">
      <div className="flex w-8 flex-none flex-col items-center">
        <span className={`grid h-8 w-8 flex-none place-items-center rounded-full text-[14px] font-black ${NODE[t.status]}`}>
          {t.status === "selesai" ? <IkonMenu n="tanda" className="h-4 w-4" /> : t.terkunci ? <IkonMenu n="kunci" className="h-3.5 w-3.5" /> : t.no}
        </span>
        {!akhir && <span aria-hidden className={`my-1 w-[3px] flex-1 rounded ${garis}`} />}
      </div>
      <div className={`min-w-0 flex-1 ${akhir ? "" : "pb-4"}`}>
        {aktif ? (
          <div className="rounded-[16px] border-2 border-[#F4B400] bg-white p-3.5 shadow-[0_8px_22px_rgba(15,42,82,.08)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-black tracking-[0.12em] text-[#B42329]">KERJAKAN SEKARANG</span>
              <span className="text-[11px] font-bold text-[#55657D]">
                {tampil.filter((m) => m.status === "selesai").length} dari {tampil.length} {tugas.length > 0 ? "tugas" : "bagian"}
              </span>
            </div>
            <div className="mt-1.5">{judul}</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#E3E8F0]">
              <div className="h-full rounded-full bg-[#1F5FD1]" style={{ width: `${Math.round(t.pecahan * 100)}%` }} />
            </div>
            <p className="mt-2 text-[12.5px] leading-snug text-[#0F2A52]">{t.ringkas}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tampil.map((m) => (
                <span key={m.kode} className="rounded-full bg-[#E6EEFC] px-2.5 py-[3px] text-[11px] font-bold text-[#0F3D7A]">
                  {m.judul}
                </span>
              ))}
            </div>
            <Link href={t.rute} className="mt-3 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[13px] bg-[#0F2A52] px-4 text-[14px] font-extrabold text-white transition hover:bg-[#143a70]">
              Buka tahap {t.nama}
              <IkonMenu n="panah" className="h-4 w-4" />
            </Link>
          </div>
        ) : bisa ? (
          <Link href={t.rute} className="block rounded-[12px] py-0.5 transition active:bg-[#EAF1FC]">
            {judul}
            {/* (11 Okt 2026) "Selesai" tidak diulang di bawah lencana "Selesai" (dulu terbaca "Selesai Selesai") */}
            {!(t.status === "selesai" && t.ringkas === "Selesai") && <p className="mt-0.5 text-[12.5px] leading-snug text-[#55657D]">{t.ringkas}</p>}
            {t.uraian && t.status !== "selesai" && <p className="mt-0.5 text-[11.5px] leading-snug text-[#6B7A90]">{t.uraian}</p>}
          </Link>
        ) : (
          <div className="py-0.5">
            {judul}
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#55657D]">{t.terkunci ? (t.alasanKunci ?? "Belum dibuka") : t.uraian ?? t.ringkas}</p>
          </div>
        )}
      </div>
    </li>
  );
}

export default function HalamanInduk({ kode }: { kode: string }) {
  const router = useRouter();
  const bar = useBarKegiatan(kode);
  const hariIni = bar.items?.find((i) => i.kunci === "hari_ini") ?? null;
  const alihKeTranslok = !!hariIni && hariIni.href !== `/sigap/kegiatan/${kode}`;
  useEffect(() => {
    if (alihKeTranslok && hariIni) router.replace(hariIni.href);
  }, [alihKeTranslok, hariIni, router]);
  if (bar.items && bar.kode) {
    return alihKeTranslok ? <KerangkaMuat /> : <HariIniSederhana kode={bar.kode} items={bar.items} peran={bar.peran} langkah={bar.langkah} />;
  }
  // belum diketahui kegiatan ini bermenu rutin atau tidak: jangan kedip-kedip menampilkan garis waktu lalu berganti (galat -> halaman lama yang menampilkannya)
  if (!bar.siap && !bar.galat) return <KerangkaMuat />;
  return <HalamanTahap kode={kode} />;
}

function KerangkaMuat() {
  return (
    <main className="min-h-screen bg-[#F5F8FE] px-3.5 pt-24 text-[#1B2B4B]" aria-busy="true">
      <div className="mx-auto max-w-xl rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]">
        <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
        <div className="mt-4 h-10 animate-pulse rounded bg-[#EEF2F7]" />
      </div>
    </main>
  );
}

/** Hari Ini untuk petugas tanpa penugasan Transport Lokal (mis. Supervisor SPDT): pintasan ke menu yang ada di bar bawah. */
function HariIniSederhana({ kode, items, peran, langkah }: { kode: string; items: NonNullable<ReturnType<typeof useBarKegiatan>["items"]>; peran: ReturnType<typeof useBarKegiatan>["peran"]; langkah: ReturnType<typeof useBarKegiatan>["langkah"] }) {
  const { induk } = useInduk(kode);
  const pintasan = items.filter((i) => i.kunci !== "hari_ini" && i.kunci !== "kamera");
  const awas = items.find((i) => i.kunci === "pengawasan");
  const kamera = items.find((i) => i.kunci === "kamera");
  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-28 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-[62px] pt-5 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2">
          <TombolKembali tema="gelap" />
        </div>
        <div className="relative mx-auto mt-3 max-w-xl">
          <h1 className="text-[19px] font-extrabold leading-tight tracking-[-0.3px]">{induk?.nama ?? "Kegiatan"}</h1>
          <p className="mt-1.5 text-[12px] text-[#A9BCD8]">Hari Ini</p>
        </div>
      </header>
      <div className="relative z-10 mx-auto -mt-[44px] max-w-xl space-y-3 px-3.5">
        <BarisLangkah langkah={langkah} />
        {awas && <BarisPengawasan kode={kode} peran={peran} label={awas.label} href={awas.href} />}
        <section aria-label="Menu kegiatan" className="space-y-2.5 rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]">
          <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Menu kegiatan</h2>
          {pintasan.map((i) => (
            <Link key={i.kunci} href={i.href} className="flex min-h-[52px] items-center justify-between gap-2 rounded-[14px] border border-[#DCE5F2] bg-[#F8FAFE] px-4 text-[14px] font-extrabold text-[#0F2A52] active:bg-[#EAF1FC]">
              {i.label}
              <IkonMenu n="panah" className="h-4 w-4" />
            </Link>
          ))}
          {kamera && (
            <Link href={kamera.href} className="flex min-h-[52px] items-center justify-between gap-2 rounded-[14px] bg-[#0F2A52] px-4 text-[14px] font-extrabold text-white">
              Buka Kamera SIGAP
              <IkonMenu n="panah" className="h-4 w-4" />
            </Link>
          )}
        </section>
      </div>
      <BarKegiatan kode={kode} items={items} aktif="hari_ini" />
    </main>
  );
}

function HalamanTahap({ kode }: { kode: string }) {
  const { induk, tahap, siap, galat } = useInduk(kode);
  // (10 Okt 2026) Selagi petugas membaca tahapan, data & kode halaman TUJUAN (semua tahap yang sudah terbuka; tahap prioritas lebih dulu) diambil di belakang
  // supaya saat tahap ditekan langsung tampil -- permintaan user (lihat app/portal/siapkan.ts)
  const rencana = useMemo(() => buatRencana(tahap, !!induk?.identifikasi), [tahap, induk]);
  useSiapkan(rencana, siap);
  const selesai = tahap.filter((t) => t.status === "selesai").length;
  const sekarang = tahapSekarang(tahap);
  const idxAktif = sekarang ? tahap.findIndex((t) => t.kode === sekarang.tahap.kode) : -1;
  // (19 Okt 2026) "Tahap x dari n" = tahap yang sedang dikerjakan (kartu "Kerjakan sekarang"), bukan sekadar tahap pertama yang belum selesai --
  // dulu tahap Perencanaan yang tak berlaku bagi petugas lapangan membuat tulisan di kepala berbeda dengan kartu aktif.
  const ke = (() => {
    if (idxAktif >= 0) return idxAktif + 1;
    const i = tahap.findIndex((t) => t.status !== "selesai");
    return i < 0 ? tahap.length : i + 1;
  })();
  const pecahan = tahap.length ? tahap.reduce((a, t) => a + t.pecahan, 0) / tahap.length : 0;
  const nada = sekarang ? (sekarang.modul.status === "mendesak" ? "merah" : "emas") : selesai === tahap.length && tahap.length > 0 ? "hijau" : "biru";

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-12 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-[62px] pt-5 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2">
          <TombolKembali tema="gelap" />
        </div>
        <div className="relative mx-auto mt-3 flex max-w-xl items-center gap-3.5">
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] font-extrabold leading-tight tracking-[-0.3px]">{induk?.nama ?? "Kegiatan"}</h1>
            {tahap.length > 0 && <p className="mt-1.5 text-[12px] text-[#A9BCD8]">Tahap {ke} dari {tahap.length}</p>}
          </div>
          {induk && tahap.length > 0 && (
            <span className="relative grid flex-none place-items-center">
              <Cincin k={{ ikon: induk.ikon, nada, pecahan, peringatan: false }} ukuran={70} gelap />
              <span className="absolute text-center leading-none">
                <b className="block text-[16px]">{selesai}/{tahap.length}</b>
                <span className="mt-0.5 block text-[8.5px] text-[#A9BCD8]">tahap</span>
              </span>
            </span>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-[44px] max-w-xl space-y-4 px-3.5">
        {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!siap && !galat && (
          <div className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]" aria-busy="true">
            <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
            <div className="mt-4 h-10 animate-pulse rounded bg-[#EEF2F7]" />
          </div>
        )}
        {siap && tahap.length > 0 && (
          <section aria-label="Tahapan kegiatan" className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Tahapan</h2>
              <span className="rounded-[9px] bg-[#E6EEFC] px-2 py-[3px] text-[11px] font-bold text-[#1F5FD1]">Tahap {ke} dari {tahap.length}</span>
            </div>
            <ol>
              {tahap.map((t, i) => (
                <Tahap key={t.kode} t={t} akhir={i === tahap.length - 1} aktif={i === idxAktif} />
              ))}
            </ol>
          </section>
        )}
        {siap && tahap.length === 0 && <p className="rounded-[18px] bg-white px-4 py-6 text-center text-[13.5px] text-[#5B6B84] shadow-[0_8px_22px_rgba(15,42,82,.06)]">Belum ada tahap yang berlaku untuk akun Anda.</p>}
        <p className="px-1 text-[11.5px] leading-relaxed text-[#6B7A90]">Ketuk satu tahap untuk membuka halaman kerjanya. Tahap bergembok terbuka sesuai aturan yang ditetapkan admin kegiatan.</p>
      </div>
    </main>
  );
}
