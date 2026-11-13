"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/LembarKomponen.tsx
//
// (14 Nov 2026, Fase 2d) Lembar komponen teknis di tahap 5 (pelatihan) dan 6 (pendataan). Satu pengaturan, dua pintu: status dibaca dari pengaturan
// dan data Kelola yang sama (keu_v_ident_komponen_data + aturan Belajar dan mutu); "Atur" membuka layar Kelola yang memegangnya. Hanya baca.
// Tabel padat, saringan per kolom; HP bergulir di dalam kotak tabel.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Chip, judulKartu, kartu } from "@/app/sigap/keu-ui";
import { useBacaKeu } from "@/app/sigap/ro/useKeu";
import { urlBaca } from "@/lib/keu/ro";
import { LABEL_STATUS_KOMPONEN, ringkasLembar, susunLembar, type AturanBelajarRingkas, type DataKomponen, type FungsiKomponen, type StatusKomponen } from "@/lib/keu/komponen";

const WARNA: Record<StatusKomponen, "hijau" | "abu" | "merah" | "kuning" | "biru"> = { dipakai: "hijau", tidak: "abu", dibatalkan: "merah", belum: "kuning", info: "biru" };
const isian = "h-8 w-full min-w-0 rounded-md border border-[#C9D6EA] bg-white px-1.5 text-[12px]";

export default function LembarKomponen({ identId, fungsi, belajar }: { identId: number; fungsi: FungsiKomponen; belajar: readonly AturanBelajarRingkas[] }) {
  const data = useBacaKeu<DataKomponen>(urlBaca("keu_v_ident_komponen_data", { ident_id: identId }, { batas: 50 }));
  const kegiatan = useMemo(() => (data.baris ?? []).find((d) => d.fungsi === fungsi) ?? null, [data.baris, fungsi]);
  const baris = useMemo(() => susunLembar(fungsi, kegiatan, belajar), [fungsi, kegiatan, belajar]);
  const r = ringkasLembar(baris);
  const [sNama, setSNama] = useState("");
  const [sStatus, setSStatus] = useState("");
  const tampil = baris.filter((b) => (!sNama.trim() || `${b.kode} ${b.nama} ${b.peran}`.toLowerCase().includes(sNama.trim().toLowerCase())) && (!sStatus || b.status === sStatus));

  return (
    <section className={`${kartu} flex flex-col gap-2.5`} aria-label="Lembar komponen">
      <div>
        <h2 className={`${judulKartu} m-0`}>Lembar komponen {fungsi === "pelatihan" ? "pelatihan" : "pendataan"}</h2>
        <p className="m-0 mt-0.5 text-[12.5px] text-[#5B6B84]">
          {kegiatan ? <>Dibaca dari pengaturan kegiatan <b>{kegiatan.kegiatan_nama}</b>; tidak ada salinan. Tekan Atur untuk mengubah di Kelola.</> : "Kegiatan untuk tahap ini belum tertaut; tautkan di halaman Pelaksanaan."}
          {" "}{r.dipakai} dipakai · {r.belum} belum diatur · {r.tidak + r.dibatalkan} tidak dipakai/dibatalkan · {r.info} di luar SIGAP.
        </p>
      </div>
      {data.galat && <p className="m-0 text-[12.5px] text-[#7A1D22]">{data.galat}</p>}
      <div className="relative w-full min-w-0 max-w-full overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="bg-[#F7F9FC] text-[11px] uppercase tracking-wide text-[#5B6B84]">
              <th className="px-2 py-1.5">Komponen</th><th className="px-2 py-1.5">Peran</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Keterangan</th><th className="px-2 py-1.5"><span className="sr-only">Atur</span></th>
            </tr>
            <tr>
              <th className="px-1 py-1"><input aria-label="Saring komponen" className={isian} value={sNama} onChange={(e) => setSNama(e.target.value)} placeholder="Cari" /></th>
              <th />
              <th className="px-1 py-1"><select aria-label="Saring status" className={isian} value={sStatus} onChange={(e) => setSStatus(e.target.value)}><option value="">Semua</option>{(Object.keys(LABEL_STATUS_KOMPONEN) as StatusKomponen[]).map((s) => <option key={s} value={s}>{LABEL_STATUS_KOMPONEN[s]}</option>)}</select></th>
              <th /><th />
            </tr>
          </thead>
          <tbody>
            {tampil.map((b) => (
              <tr key={b.kode} className="border-t border-[#EEF2F6] align-top">
                <td className="px-2 py-1.5"><span className="text-[#5B6B84]">{b.kode}</span> <b>{b.nama}</b></td>
                <td className="px-2 py-1.5 text-[#44546F]">{b.peran}</td>
                <td className="px-2 py-1.5"><Chip warna={WARNA[b.status]}>{LABEL_STATUS_KOMPONEN[b.status]}</Chip></td>
                <td className="px-2 py-1.5 text-[#44546F]">{b.ket}</td>
                <td className="px-2 py-1.5 text-right">{b.href && <Link href={b.href} className="font-semibold text-[#1F5FD1] underline">Atur</Link>}</td>
              </tr>
            ))}
            {tampil.length === 0 && <tr><td colSpan={5} className="px-2 py-3 text-center text-[#5B6B84]">Tidak ada baris yang cocok dengan saringan.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
