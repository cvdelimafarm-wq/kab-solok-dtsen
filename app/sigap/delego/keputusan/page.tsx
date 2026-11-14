"use client";

// app/sigap/delego/keputusan/page.tsx
//
// (14 Nov 2026, Fase 7) Ruang keputusan, versi baca-saja (keu_ruang_keputusan), juga untuk HP Kepala: sinyal dari modul yang sudah ada
// (lewat tenggat naik ke Kepala, sanggahan menunggu putusan, temuan Gap keras, SPK mitra belum terbit, usulan menggantung, pegawai tanpa catatan
// pekerjaan). Tiap sinyal menaut ke layar tempat keputusan diambil; keputusan tetap dicatat di layar asal. Untuk Kepala dan pemberi delegasi.

import Link from "next/link";
import { useState } from "react";
import { BATAS_ISI, urutSinyal, type BahanKeputusan, type Sinyal } from "@/lib/delego/meja";
import { useBacaFungsi } from "../data";
import { KELAS } from "../merek";
import { Galat, Halaman, Info, Lencana, Memuat } from "../ui";

function KartuSinyal({ s }: { s: Sinyal }) {
  const [semua, setSemua] = useState(false);
  const isi = semua ? s.isi : s.isi.slice(0, BATAS_ISI);
  return (
    <div className={`${KELAS.kartu} space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={s.tautan} className="text-[15px] font-semibold text-[#14212B] hover:underline">{s.judul}</Link>
        <Lencana nada={s.jumlah > 0 ? s.nada : "hijau"}>{s.jumlah > 0 ? s.jumlah : "Aman"}</Lencana>
      </div>
      {s.jumlah > 0 && (
        <ul className="m-0 list-none space-y-1 p-0 text-[13px]">
          {isi.map((x, i) => (
            <li key={`${s.kode}-${i}`} className="min-w-0">
              {x.tautan ? <Link href={x.tautan} className="font-semibold text-[#0F6B63] underline">{x.teks}</Link> : <span className="font-semibold">{x.teks}</span>}
              <span className="text-[#3B4A57]"> · {x.sub}</span>
            </li>
          ))}
        </ul>
      )}
      {s.isi.length > BATAS_ISI && (
        <button type="button" className={KELAS.tombolKecil} onClick={() => setSemua(!semua)}>{semua ? "Ringkas" : `Lihat semua (${s.isi.length})`}</button>
      )}
    </div>
  );
}

export default function RuangKeputusan() {
  const k = useBacaFungsi<BahanKeputusan>("keu_ruang_keputusan", {});
  const d = k.data;
  return (
    <Halaman judul="Ruang keputusan" sub="Sinyal yang menunggu keputusan pimpinan. Keputusan diambil dan dicatat di layar asal tiap sinyal.">
      {k.memuat && !d && <Memuat />}
      {k.galat && !d && <Galat>{k.galat}</Galat>}
      {d && (
        <>
          <Info>Versi baca-saja. Sinyal anggaran (pagu terlampaui, revisi) dan pemetaan peran anggaran ke orang menyusul setelah data peran Desember 2026 tersedia.</Info>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {urutSinyal(d.sinyal).map((s) => <KartuSinyal key={s.kode} s={s} />)}
          </div>
        </>
      )}
    </Halaman>
  );
}
