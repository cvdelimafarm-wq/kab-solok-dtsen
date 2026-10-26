"use client";

// app/sigap/delego/riwayat/page.tsx
//
// (26 Okt 2026) Riwayat laporan saya (35 hari terakhir) beserta tanggapan pada laporan itu.

import Link from "next/link";
import { useMemo } from "react";
import { angka, tglPendek } from "@/lib/delego/hitung";
import { berjenis, jumlahDariPoin, satuanAngka } from "@/lib/delego/teknis";
import { useSaya } from "../data";
import { DaftarBukti } from "../BuktiFoto";
import { KELAS } from "../merek";
import { Galat, Halaman, Kartu, Kosong, Lencana, Memuat, fmt } from "../ui";

export default function Riwayat() {
  const s = useSaya();
  const d = s.data;
  const kelompok = useMemo(() => {
    if (!d) return [];
    const judul = new Map([...d.delegasi, ...d.diwakili].map((x) => [x.id, x]));
    const peta = new Map<string, { tanggal: string; baris: { l: (typeof d.laporan)[number]; nama: string; satuan: string; jumlah: string | null }[] }>();
    for (const l of [...d.laporan, ...d.laporan_diwakili]) {
      const dg = judul.get(l.delegasi_id);
      const g = peta.get(l.tanggal) ?? { tanggal: l.tanggal, baris: [] };
      g.baris.push({ l, nama: dg ? (dg.penerima_akun === d.akun.id ? dg.judul : `${dg.penerima_nama} · ${dg.judul}`) : `Delegasi ${l.delegasi_id}`, satuan: dg ? satuanAngka(dg) : "poin", jumlah: dg && berjenis(dg) ? `${fmt(l.jumlah !== null && l.jumlah !== undefined ? angka(l.jumlah) : jumlahDariPoin(angka(dg.poin_per_satuan), angka(l.poin)), 2)} ${dg.satuan}` : null });
      peta.set(l.tanggal, g);
    }
    return [...peta.values()].sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
  }, [d]);

  return (
    <Halaman judul="Riwayat laporan" sub="35 hari terakhir">
      {s.memuat && !d && <Memuat />}
      {s.galat && !d && <Galat>{s.galat}</Galat>}
      {d && kelompok.length === 0 && (
        <Kosong>
          Belum ada laporan. <Link href="/sigap/delego/lapor" className="font-semibold text-[#0F6B63] underline">Isi laporan pertama</Link>.
        </Kosong>
      )}
      <div className="mx-auto max-w-3xl space-y-3">
        {d &&
          kelompok.map((g) => (
            <Kartu key={g.tanggal} judul={tglPendek(g.tanggal)}>
              <ul className="m-0 list-none space-y-3 p-0">
                {g.baris.map(({ l, nama, satuan, jumlah }) => {
                  const tg = d.tanggapan.filter((t) => t.laporan_id === l.id);
                  return (
                    <li key={l.id} className="space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[14px] font-semibold leading-snug">{nama}</span>
                        <span className="whitespace-nowrap text-right text-[14px] font-bold">{jumlah ?? <>{fmt(angka(l.poin), 1)} <span className="text-[12px] font-medium text-[#3B4A57]">{satuan}</span></>}{jumlah && <span className="block text-[12px] font-medium text-[#3B4A57]">{fmt(angka(l.poin), 1)} {satuan}</span>}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {l.terlambat && <Lencana nada="amber">Terlambat</Lencana>}
                        {l.mewakili && <Lencana nada="biru">Diwakili</Lencana>}
                      </div>
                      {l.uraian && <p className="m-0 text-[13.5px] leading-snug text-[#33404B]">{l.uraian}</p>}
                      {l.kendala && <p className="m-0 text-[13.5px] leading-snug text-[#8A4605]">Kendala: {l.kendala}</p>}
                      <DaftarBukti bukti={l.bukti} ukuran={72} />
                      {tg.map((t) => (
                        <div key={t.id} className="rounded-lg bg-[#F1F7F6] px-3 py-2 text-[13px]">
                          <b className="text-[#0B524C]">{t.dari_nama ?? "Pemberi"}:</b> {t.isi}
                        </div>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </Kartu>
          ))}
        {d && kelompok.length > 0 && <Link href="/sigap/delego/lapor" className={`${KELAS.tombolSekunder} w-full`}>Isi laporan</Link>}
      </div>
    </Halaman>
  );
}
