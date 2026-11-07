// app/sigap/ro/[kode]/KartuGap.tsx
//
// (7 Nov 2026, langkah 1 rancangan Kebutuhan dan revisi) Kartu Gap tab Anggaran RO: berapa anggaran berlebih dan berapa kurang menurut Realisasi + RAB,
// butir yang belum dikaji (belum ber-RAB) dipisah supaya pagunya tidak dianggap lebih. Hanya baca. Logika di lib/keu/kebutuhan.ts.

import Link from "next/link";
import type { ReactNode } from "react";
import { judulKartu, kartu } from "../../keu-ui";
import { angka, rupiah } from "@/lib/keu/ro";
import { kalimatNeraca, type ButirGap, type RingkasGapRo } from "@/lib/keu/kebutuhan";

const blok = "min-w-0 rounded-lg border p-3";

function Daftar({ judul, butir }: { judul: string; butir: ButirGap[] }) {
  if (butir.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="m-0 text-[11.5px] font-semibold text-[#5B6B84]">{judul}</p>
      <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
        {butir.map((b) => (
          <li key={b.detail_id} className="flex items-start justify-between gap-2 text-[12.5px] text-[#1B2B4B]">
            <span className="min-w-0 break-words"><span className="font-mono text-[#5B6B84]">{b.akun.slice(0, 6)}</span> {b.uraian}</span>
            <span className="shrink-0 font-semibold tabular-nums">{angka(Math.abs(b.gap))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Blok({ judul, nilai, sub, kelas, anak }: { judul: string; nilai: ReactNode; sub: ReactNode; kelas: string; anak?: ReactNode }) {
  return (
    <div className={`${blok} ${kelas}`}>
      <p className="m-0 text-[11.5px] font-bold uppercase tracking-[0.04em]">{judul}</p>
      <p className="m-0 mt-0.5 text-[18px] font-bold tabular-nums">{nilai}</p>
      <p className="m-0 text-[12px]">{sub}</p>
      {anak}
    </div>
  );
}

export type TunggakBayar = { n: number; jumlah: number; tersedia: boolean; kode: string };

export function KartuGap({ r, tunggak }: { r: RingkasGapRo; tunggak?: TunggakBayar }) {
  return (
    <section className={`${kartu} flex flex-col gap-3`} aria-label="Kartu Gap anggaran RO">
      <div className="flex flex-col gap-1">
        <h2 className={judulKartu}>Gap anggaran RO</h2>
        <p className="m-0 text-[12.5px] text-[#5B6B84]">
          Dihitung per butir: Gap = Pagu dikurangi Kebutuhan, dengan Kebutuhan = Realisasi ditambah catatan pembayaran yang belum tampak di SAKTI ditambah RAB yang belum dibayar. Butir yang belum ber-RAB dipisah dan pagunya tidak dianggap berlebih.
        </p>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
        <Blok
          judul="Berlebih" kelas="border-[#BFE3CC] bg-[#F1FAF4] text-[#0B6B3F]" nilai={rupiah(r.lebih)}
          sub={r.nLebih === 0 ? "tidak ada butir berlebih" : `${angka(r.nLebih)} butir · calon donor revisi`}
          anak={<Daftar judul="Terbesar" butir={r.teratasLebih} />}
        />
        <Blok
          judul="Kurang (butir POK)" kelas="border-[#F3C2C2] bg-[#FEF3F3] text-[#9B1C23]" nilai={rupiah(r.kurang)}
          sub={r.nKurang === 0 ? "tidak ada butir kurang" : `${angka(r.nKurang)} butir · perlu ditambal, ditunda, atau diminta tambahan`}
          anak={<Daftar judul="Terbesar" butir={r.teratasKurang} />}
        />
        {r.nBaru > 0 && (
          <Blok
            judul="Item baru di RAB" kelas="border-[#F5D9A8] bg-[#FFF8EA] text-[#8A6200]" nilai={rupiah(r.baru)}
            sub={`${angka(r.nBaru)} item belum ada di POK · seluruhnya butuh sumber (bahan revisi POK)`}
            anak={<Daftar judul="Terbesar" butir={r.teratasBaru} />}
          />
        )}
        <Blok
          judul="Belum dikaji" kelas="border-[#DCE3EE] bg-[#F7F9FC] text-[#44546F]" nilai={`${angka(r.nBelum)} butir`}
          sub={r.nBelum === 0 ? "semua butir sudah ber-RAB" : `sisa pagu ${rupiah(r.belumSisaPagu)} · belum ber-RAB, tidak dihitung sebagai berlebih`}
        />
      </div>
      <p className="m-0 text-[13px] text-[#1B2B4B]">
        <span className="font-semibold">Neraca RO: </span>{kalimatNeraca(r)}
        {r.nCukup > 0 && <span className="text-[#5B6B84]"> {angka(r.nCukup)} butir cukup.</span>}
      </p>
      {tunggak && !tunggak.tersedia && (
        <p className="m-0 rounded-md bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#8A6200]">
          Catatan pembayaran belum tersedia (berkas 20261107d_catat_pembayaran.sql belum dijalankan). Selama itu, RAB yang sudah dibayar dapat terhitung ganda dengan realisasi.
        </p>
      )}
      {tunggak && tunggak.tersedia && tunggak.n > 0 && (
        <p className="m-0 rounded-md bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#8A6200]">
          Angka sementara: {angka(tunggak.n)} baris RAB sudah jatuh tempo tetapi belum dicatat pembayarannya ({rupiah(tunggak.jumlah)}). Bila sudah dibayar, RAB itu masih terhitung sebagai kebutuhan di samping realisasi.{" "}
          <Link href={`/sigap/ro/${encodeURIComponent(tunggak.kode)}?tab=pembayaran`} className="font-semibold underline">Catat di tab Pembayaran</Link>
        </p>
      )}
      <p className="m-0 text-[12px] text-[#5B6B84]">
        RAB yang sudah dibayar keluar dari RAB sisa setelah PJ Administrasi mencatat pembayarannya (tab Pembayaran). Catatan yang belum tampak di realisasi SAKTI tetap dihitung sebagai kebutuhan; setelah tercermin di SAKTI tidak dihitung lagi.
      </p>
    </section>
  );
}
