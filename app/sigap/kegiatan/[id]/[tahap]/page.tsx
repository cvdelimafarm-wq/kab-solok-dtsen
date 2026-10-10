"use client";

// app/sigap/kegiatan/[id]/[tahap]/page.tsx
//
// (9 Okt 2026) Layer 3 generik: halaman kerja satu tahap kegiatan induk (mockup disetujui user). Isinya mengikuti modul yang diatur admin
// (urut seperti di pengaturan): Wilayah tugas per tim, Transport Lokal, Konfirmasi. Tahap Pelatihan memakai halaman /sigap/pelatihan.

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import IkonMenu from "@/app/portal/IkonMenu";
import { keAtas } from "@/app/portal/navigasi";
import type { ModulTahap } from "@/lib/sigapTahap";
import { useInduk } from "../../useInduk";
import WilayahTim from "./WilayahTim";

const CHIP: Record<ModulTahap["status"], { teks: string; kelas: string }> = {
  selesai: { teks: "Selesai", kelas: "bg-[#E3F6EC] text-[#13794B]" },
  mendesak: { teks: "Mendesak", kelas: "bg-[#FDE8E8] text-[#B42329]" },
  perlu: { teks: "Perlu dilengkapi", kelas: "bg-[#FFF4D6] text-[#8A6200]" },
  sekarang: { teks: "Sekarang", kelas: "bg-[#E6EEFC] text-[#1F5FD1]" },
  berjalan: { teks: "Berjalan", kelas: "bg-[#E6EEFC] text-[#1F5FD1]" },
  menunggu: { teks: "Belum mulai", kelas: "bg-[#E3E8F0] text-[#55657D]" },
  terkunci: { teks: "Belum dibuka", kelas: "bg-[#E3E8F0] text-[#55657D]" },
};

// (10 Okt 2026) Daftar wilayah tugas tim disembunyikan sementara KHUSUS PML -- permintaan user (kartu PML terlalu panjang; fokus ke 2 tugas utama).
// PPL tetap melihatnya. PML dikenali dari modul "identifikasi" (hanya muncul bagi PML) atau ringkasan identifikasi pada kegiatan induk.
// Komponen WilayahTim & modulnya tetap ada; ubah ke false untuk menampilkannya lagi bagi PML.
const SEMBUNYIKAN_WILAYAH_TIM_PML = true;

// (10 Okt 2026) Modul yang berupa TUGAS (harus dikerjakan) diberi nomor langkah agar PML jelas urutannya -- permintaan user.
const adalahTugas = (kode: string) => kode === "identifikasi" || kode.startsWith("translok:");

function BarisModul({ m, no }: { m: ModulTahap; no?: number }) {
  const c = CHIP[m.status];
  const selesai = m.status === "selesai";
  const isi = (
    <>
      {no != null && (
        <span
          aria-label={`Langkah ${no}${selesai ? ", selesai" : ""}`}
          className={`grid h-8 w-8 flex-none place-items-center rounded-full text-[14px] font-extrabold ${selesai ? "bg-[#13794B] text-white" : "bg-[#1A4590] text-white"}`}
        >
          {selesai ? "✓" : no}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <b className="block text-[14px] text-[#0F2A52]">{m.judul}</b>
        <small className="block text-[12px] leading-snug text-[#55657D]">{m.ket}</small>
      </span>
      <span className={`flex-none rounded-full px-2 py-[2px] text-[10.5px] font-extrabold ${c.kelas}`}>{c.teks}</span>
      {m.href && <IkonMenu n="panah" className="h-4 w-4 flex-none text-[#A5B3C7]" />}
    </>
  );
  const kelas = "flex min-h-[56px] items-center gap-3 rounded-[18px] bg-white px-4 py-3 shadow-[0_8px_22px_rgba(15,42,82,.08)]";
  return m.href ? (
    <Link href={m.href} className={`${kelas} transition active:bg-[#EAF1FC]`}>
      {isi}
    </Link>
  ) : (
    <div className={kelas}>{isi}</div>
  );
}

export default function HalamanTahap() {
  const { id, tahap: kodeTahap } = useParams<{ id: string; tahap: string }>();
  const router = useRouter();
  const { induk, tahap, siap, galat } = useInduk(id);
  const t = tahap.find((x) => x.kode === kodeTahap) ?? null;
  const induk_ = `/sigap/kegiatan/${id}`;
  const tugas = t && !t.terkunci ? t.modul.filter((m) => adalahTugas(m.kode)) : [];
  const adalahPml = !!induk?.identifikasi || !!t?.modul.some((m) => m.kode === "identifikasi");
  const sembunyikanWilayah = SEMBUNYIKAN_WILAYAH_TIM_PML && adalahPml;
  const tugasSelesai = tugas.filter((m) => m.status === "selesai").length;

  // Tahap Pelatihan punya halamannya sendiri; tahap yang tak berlaku bagi akun ini -> kembali ke garis waktu
  useEffect(() => {
    if (!siap) return;
    if (!t) router.replace(induk_);
    else if (t.rute !== `/sigap/kegiatan/${id}/${t.kode}`) router.replace(t.rute);
  }, [siap, t, id, induk_, router]);

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-12 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-[52px] pt-5 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2">
          <button type="button" onClick={() => keAtas(router, induk_)} aria-label="Kembali ke tahapan" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white/15 active:bg-white/25">
            <IkonMenu n="kembali" className="h-5 w-5 text-white" />
          </button>
          <span className="truncate text-[12.5px] font-bold text-[#D3E0F5]">{induk?.nama ?? "Kegiatan"} · Tahapan</span>
        </div>
        <div className="relative mx-auto mt-3 max-w-xl">
          <h1 className="text-[19px] font-extrabold leading-tight tracking-[-0.3px]">{t ? `Tahap ${t.no} · ${t.nama}` : "Tahap"}</h1>
          {t?.uraian && <p className="mt-1.5 text-[12px] leading-snug text-[#A9BCD8]">{t.uraian}</p>}
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-[34px] max-w-xl space-y-3 px-3.5">
        {galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        {!siap && !galat && (
          <div className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.12)]" aria-busy="true">
            <div className="h-3 w-32 animate-pulse rounded bg-[#E6EDF8]" />
            <div className="mt-4 h-10 animate-pulse rounded bg-[#EEF2F7]" />
          </div>
        )}
        {t?.terkunci && (
          <p className="flex items-center gap-2 rounded-[16px] bg-white px-4 py-3 text-[13px] font-bold text-[#55657D] shadow-[0_8px_22px_rgba(15,42,82,.08)]">
            <IkonMenu n="kunci" className="h-4 w-4" />
            {t.alasanKunci ?? "Tahap ini belum dibuka"}
          </p>
        )}
        {t && !t.terkunci && t.modul.filter((m) => !(sembunyikanWilayah && m.kode === "wilayah_tim")).length === 0 && (
          <p className="rounded-[18px] bg-white px-4 py-6 text-center text-[13.5px] text-[#5B6B84] shadow-[0_8px_22px_rgba(15,42,82,.06)]">Belum ada isi untuk tahap ini.</p>
        )}
        {tugas.length >= 2 && (
          <div className="rounded-[18px] border border-[#CFE0F8] bg-[#EAF1FC] px-4 py-3 text-[12.5px] leading-snug text-[#0F2A52]">
            <b className="block text-[13.5px]">
              Ada {tugas.length} tugas di tahap ini{tugasSelesai > 0 ? ` · ${tugasSelesai} selesai` : ""}
            </b>
            Kerjakan satu per satu sesuai nomor: {tugas.map((m, i) => `${i + 1}. ${m.judul}`).join(" → ")}.
          </div>
        )}
        {t &&
          !t.terkunci &&
          t.modul.map((m) => {
            if (m.kode === "wilayah_tim") return sembunyikanWilayah ? null : <WilayahTim key={m.kode} />;
            const i = tugas.indexOf(m);
            return <BarisModul key={m.kode} m={m} no={tugas.length >= 2 && i >= 0 ? i + 1 : undefined} />;
          })}
      </div>
    </main>
  );
}
