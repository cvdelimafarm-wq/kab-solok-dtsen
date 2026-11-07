"use client";

// app/sigap/revisi/tanggapan/page.tsx
//
// (7 Nov 2026, tahap 4c) Halaman "Tanggapan siklus revisi": semua RO milik ketua tim atau wakil pada siklus yang sedang dibuka, dengan tiga pilihan per RO.
// Tujuan tautan push dan notifikasi "Siklus revisi dibuka" / "Saatnya menanggapi".

import { useMemo } from "react";
import { perJadwal, labelTanggal } from "@/lib/keu/siklusRevisi";
import { Galat, HalamanKeu, Kosong, Memuat, caps, judulKartu, kartu } from "../../keu-ui";
import { BarisTanggapan, useTanggapanSaya } from "./TanggapanRevisi";

export default function HalamanTanggapan() {
  const { baris, galat, muat } = useTanggapanSaya(true);
  const grup = useMemo(() => perJadwal(baris ?? []), [baris]);
  return (
    <HalamanKeu
      jejak={[{ t: "Anggaran" }, { t: "Revisi", href: "/sigap/revisi" }, { t: "Tanggapan siklus" }]}
      judul="Tanggapan siklus revisi"
      sub="Pilih satu tanggapan untuk setiap RO yang Anda pimpin atau wakili: ajukan sekarang, minta diingatkan, atau tidak mengusulkan revisi."
      induk="/sigap/revisi"
      labelKembali="Jadwal revisi"
    >
      {galat && <Galat pesan={galat} />}
      {baris === null && !galat && <Memuat tinggi="h-40" />}
      {baris !== null && grup.length === 0 && !galat && <Kosong teks="Tidak ada siklus revisi yang sedang dibuka untuk RO Anda." />}
      {grup.map((g) => (
        <section key={g.jadwal_id} className={`${kartu} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={judulKartu}>{g.judul}</h2>
            <span className={caps}>Pengumpulan sampai {labelTanggal(g.tutup)}</span>
          </div>
          {g.baris.map((t) => <BarisTanggapan key={t.ro_kode} t={t} sesudah={muat} />)}
        </section>
      ))}
    </HalamanKeu>
  );
}
