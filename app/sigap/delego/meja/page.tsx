"use client";

// app/sigap/delego/meja/page.tsx
//
// (14 Nov 2026, Fase 7) Meja kerja: semua yang menunggu saya lintas modul dalam satu daftar (keu_meja_kerja): pekerjaan hari ini, laporan perlu
// revisi, lewat tenggat yang wajib dijelaskan, sanggahan, tinjau dan usulan (bila saya pemberi), lewat tenggat yang menunggu jawaban saya,
// identifikasi menunggu persetujuan, dan pemberitahuan. Tiap butir menaut ke layar asal; tidak ada yang dikerjakan di sini.

import Link from "next/link";
import { pisahMeja, type BahanMeja } from "@/lib/delego/meja";
import { useBacaFungsi } from "../data";
import { Galat, Halaman, Info, Kartu, Lencana, Memuat } from "../ui";

export default function MejaKerja() {
  const m = useBacaFungsi<BahanMeja>("keu_meja_kerja", {});
  const d = m.data;
  const p = d ? pisahMeja(d) : null;
  return (
    <Halaman judul="Meja kerja" sub="Semua yang menunggu Anda, dari Delego, identifikasi, dan pemberitahuan, dalam satu daftar.">
      {m.memuat && !d && <Memuat />}
      {m.galat && !d && <Galat>{m.galat}</Galat>}
      {p && (
        <>
          {p.tindakan.length === 0 ? (
            <Info>Tidak ada yang menunggu Anda saat ini.</Info>
          ) : (
            <Kartu judul={`Menunggu tindakan (${d!.total})`}>
              <ul className="m-0 list-none divide-y divide-[#EEF2F5] p-0">
                {p.tindakan.map((b) => (
                  <li key={b.kode}>
                    <Link href={b.tautan} className="flex items-start justify-between gap-3 py-2.5 hover:bg-[#F6FAF9]">
                      <span className="min-w-0">
                        <span className="block text-[14.5px] font-semibold text-[#14212B]">{b.judul}</span>
                        <span className="block text-[12.5px] leading-snug text-[#3B4A57]">{b.modul} · {b.isi}</span>
                      </span>
                      <Lencana nada={b.nada}>{b.jumlah}</Lencana>
                    </Link>
                  </li>
                ))}
              </ul>
            </Kartu>
          )}
          {p.kabar.map((b) => (
            <Link key={b.kode} href={b.tautan} className="block text-[13.5px] font-semibold text-[#0F6B63] underline">
              {b.jumlah} {b.judul.toLowerCase()} →
            </Link>
          ))}
        </>
      )}
    </Halaman>
  );
}
