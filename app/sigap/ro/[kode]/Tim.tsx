"use client";

// app/sigap/ro/[kode]/Tim.tsx
//
// (24 Okt 2026) Tab "Tim dan akses" ruang kerja satu RO (papan 9 dan 10 mockup): siapa ketua tim, admin RO, pengelola PBJ, dan pemegang akses tab
// Administrasi untuk RO ini, masa berlakunya, peran satker yang berlaku untuk semua RO, serta apa yang boleh dilakukan akun ini di RO ini.
// Hanya baca; penugasan diatur di halaman Peran dan akses (/sigap/akses). Logika murni: lib/keu/usulan.ts (timRo, peranSaya).

import Link from "next/link";
import { useMemo } from "react";
import { tglPanjang } from "@/lib/keu/revisi";
import { masaBerlaku, peranSaya, timRo, type KelompokTim } from "@/lib/keu/usulan";
import { caps, Chip, Galat, judulKartu, kartu, Memuat, tombolKecil } from "../../keu-ui";
import { usePenugasan } from "../useKeu";
import { useHakUsulan } from "./Revisi";

function Kelompok({ k, kosongTeks }: { k: KelompokTim; kosongTeks?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className={caps}>{k.label}</h3>
      {k.baris.length === 0 ? (
        <p className="text-[13px] text-[#6B7A93]">{kosongTeks ?? "Belum ditugaskan."}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {k.baris.map((b, i) => (
            <li key={`${b.nama}-${b.mulai}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-[#F5F8FE] px-3 py-2 text-[13px] text-[#1B2B4B]">
              <span className="font-semibold">{b.nama}</span>
              <Chip warna={b.aktif ? "hijau" : "abu"}>{b.aktif ? "Aktif" : "Tidak aktif"}</Chip>
              {b.semuaRo && <Chip warna="biru">Semua RO</Chip>}
              <span className="text-[12px] text-[#6B7A93]">{masaBerlaku(b.mulai, b.sampai, tglPanjang)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TabTim({ kode }: { kode: string }) {
  const tugas = usePenugasan();
  const hak = useHakUsulan(kode);
  const t = useMemo(() => (tugas.baris ? timRo(tugas.baris, kode) : null), [tugas.baris, kode]);
  if (tugas.galat) return <Galat pesan={tugas.galat} />;
  if (!t || !hak) return <Memuat tinggi="h-40" />;
  const saya = peranSaya(hak);

  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${kartu} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={judulKartu}>Tim dan akses RO {kode}</h2>
          <Link href="/sigap/akses" className={`${tombolKecil} inline-flex items-center no-underline`}>Atur di Peran dan akses</Link>
        </div>
        <p className="text-[12.5px] text-[#5B6B84]">Semua pegawai organik dapat melihat RO ini. Mengubah RAB, mengajukan, menyetujui, dan mengesahkan mengikuti penugasan di bawah ini; basis data menolak yang tidak berhak.</p>
        {t.perRo.map((k) => (
          <Kelompok key={k.peran} k={k} kosongTeks={k.peran === "KETUA" ? "Belum ada ketua tim. Usulan dan RAB RO ini belum dapat disetujui tingkat ketua." : k.peran === "AKSES_ADM" ? "Tidak ada akses khusus." : undefined} />
        ))}
      </section>

      <section className={`${kartu} flex flex-col gap-2`}>
        <h2 className={judulKartu}>Peran Anda di RO ini</h2>
        {saya.length === 0 ? (
          <p className="text-[13px] text-[#44546F]">Anda tidak memiliki kewenangan ubah di RO ini; Anda dapat melihat seluruh isinya.</p>
        ) : (
          <ul className="m-0 list-disc pl-5 text-[13px] text-[#1B2B4B]">{saya.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
      </section>

      {t.satker.length > 0 && (
        <section className={`${kartu} flex flex-col gap-3`}>
          <h2 className={judulKartu}>Peran tingkat satker</h2>
          <p className="text-[12.5px] text-[#5B6B84]">Berlaku untuk semua RO, ditampilkan sebagai konteks alur persetujuan.</p>
          {t.satker.map((k) => <Kelompok key={k.peran} k={k} />)}
        </section>
      )}
    </div>
  );
}
