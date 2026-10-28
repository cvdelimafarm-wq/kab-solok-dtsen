"use client";

// app/sigap/kelola/perencanaan/identifikasi/Relatif.tsx
//
// (28 Okt 2026) Isian jadwal relatif tahap dalam bentuk kalimat, menggantikan empat kolom "Mulai, acuan / Selisih hari mulai / Selesai, acuan /
// Selisih hari selesai" yang membingungkan. Contoh: "Mulai  [0] hari [tepat pada] [mulai pendataan] → 02/11/2026".
// Data tetap sama (aM, dM, aS, dS); selisih bertanda dipecah jadi angka + sesudah/sebelum oleh lib/keu/relJadwal.ts.

import { Angka } from "./Kontrol";
import { tglIndo, type Rel } from "@/lib/keu/identifikasi";
import { gabungSelisih, pecahSelisih, peringatanRentang, type ArahSelisih } from "@/lib/keu/relJadwal";

const pilih = "box-border min-h-[40px] rounded-md border border-[#C5D0E2] bg-white px-2 text-[13.5px] font-semibold text-[#0F2A52] focus:outline-2 focus:outline-[#1F5FD1] disabled:opacity-60";

function Baris({ judul, nama, d, a, acuan, tanggal, mati, onD, onA }: {
  judul: string; nama: string; d: number; a: "mulai" | "selesai"; acuan: string; tanggal: string | undefined; mati: boolean;
  onD: (d: number) => void; onA: (a: "mulai" | "selesai") => void;
}) {
  const { n, arah } = pecahSelisih(d);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="w-14 shrink-0 text-[13px] font-bold text-[#0F2A52]">{judul}</span>
      <div className="w-[84px]"><Angka nama={`${nama}, jumlah hari`} nilai={n} min={0} maks={365} mati={mati} onUbah={(v) => onD(gabungSelisih(v, arah))} /></div>
      <span className="text-[13px] text-[#44546F]">hari</span>
      <select aria-label={`${nama}, sebelum atau sesudah`} className={pilih} value={n === 0 ? "sama" : arah} disabled={mati || n === 0} onChange={(e) => onD(gabungSelisih(n, e.target.value as ArahSelisih))}>
        {n === 0 ? <option value="sama">tepat pada</option> : (<><option value="sesudah">sesudah</option><option value="sebelum">sebelum</option></>)}
      </select>
      <select aria-label={`${nama}, acuan`} className={pilih} value={a} disabled={mati} onChange={(e) => onA(e.target.value as "mulai" | "selesai")}>
        <option value="mulai">mulai {acuan}</option>
        <option value="selesai">selesai {acuan}</option>
      </select>
      <span className="rounded-md border border-[#CFE6D8] bg-white px-2 py-1 text-[12.5px] font-bold text-[#14653A]">→ {tanggal ? tglIndo(tanggal) : "belum dapat dihitung"}</span>
    </div>
  );
}

export function BarisRelatif({ tahap, acuan, rel, mulai, selesai, ringkas, mati, onUbah }: {
  tahap: string; acuan: string; rel: Rel; mulai?: string; selesai?: string; ringkas: string; mati: boolean; onUbah: (p: Partial<Rel>) => void;
}) {
  const peringatan = peringatanRentang(mulai, selesai);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[12.5px] text-[#44546F]">Atur tanggal {tahap.toLowerCase()} dari jadwal {acuan}. Isi jumlah hari, lalu pilih sesudah atau sebelum.</p>
      <Baris judul="Mulai" nama={`${tahap} mulai`} d={rel.dM} a={rel.aM} acuan={acuan} tanggal={mulai} mati={mati} onD={(v) => onUbah({ dM: v })} onA={(v) => onUbah({ aM: v })} />
      <Baris judul="Selesai" nama={`${tahap} selesai`} d={rel.dS} a={rel.aS} acuan={acuan} tanggal={selesai} mati={mati} onD={(v) => onUbah({ dS: v })} onA={(v) => onUbah({ aS: v })} />
      <p className="m-0 text-[12.5px] font-semibold text-[#0F2A52]">{ringkas}</p>
      {peringatan && <p role="alert" className="m-0 rounded-md bg-[#FDE8E8] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#9B1C23]">{peringatan}</p>}
    </div>
  );
}
