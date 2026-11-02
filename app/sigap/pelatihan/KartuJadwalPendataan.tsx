"use client";

// app/sigap/pelatihan/KartuJadwalPendataan.tsx
//
// (3 Nov 2026) Kartu "Jadwal pendataan" di tab Hari ini peserta: tanggal mulai dan selesai LENGKAP dengan nama hari, lama, status terhadap hari ini (dimulai X hari lagi /
// berjalan hari ke-n / selesai), dan penanda Fix atau Perkiraan. Data dari Identifikasi survei yang tertaut ke kegiatan (jawaban /ketentuan -> jadwal_pendataan).
// Tidak ada data = tidak menggambar apa pun.

import { useEffect, useState } from "react";
import { hariWib } from "@/lib/vanguardAnjuran";
import { ringkasPeriode, type JadwalPendataanKartu } from "@/lib/jadwalPendataanTampil";

const WARNA = {
  belum: "bg-[#E3EEFF] text-[#1F5FD1]",
  berjalan: "bg-[#E3F6EC] text-[#13794B]",
  selesai: "bg-[#EEF2F7] text-[#55657D]",
} as const;

export default function KartuJadwalPendataan({ jadwal }: { jadwal: JadwalPendataanKartu | null | undefined }) {
  // tanggal diambil di sisi klien (zona WIB) supaya tidak berbeda dengan HTML dari server
  const [hariIni, setHariIni] = useState<string | null>(null);
  useEffect(() => {
    setHariIni(hariWib(Date.now()));
  }, []);
  if (!jadwal || jadwal.periode.length === 0 || !hariIni) return null;
  const banyak = jadwal.periode.length > 1;
  return (
    <section id="langkah-pendataan" aria-label="Jadwal pendataan" className="scroll-mt-24 rounded-[18px] border border-[#DDE6F3] bg-white p-4 shadow-[0_8px_22px_rgba(15,42,82,.07)]">
      <h2 className="m-0 text-[15px] font-extrabold text-[#0F2A52]">Jadwal pendataan</h2>
      <ul className="m-0 mt-2.5 list-none space-y-2.5 p-0">
        {jadwal.periode.map((p) => {
          const r = ringkasPeriode(p, hariIni);
          if (!r) return null;
          return (
            <li key={p.periode} className="rounded-xl bg-[#F8FAFE] p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {banyak && <b className="text-[12.5px] font-extrabold text-[#0F2A52]">{p.periode}</b>}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${WARNA[r.status]}`}>{r.ket}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.perkiraan ? "bg-[#FFF4D6] text-[#8A6200]" : "bg-[#E3F6EC] text-[#13794B]"}`}>{p.perkiraan ? "Perkiraan" : "Tanggal pasti"}</span>
              </div>
              <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13.5px] text-[#0F2A52]">
                <dt className="text-[12px] font-semibold text-[#6B7A90]">Mulai</dt>
                <dd className="m-0 font-bold">{r.mulaiTeks}</dd>
                <dt className="text-[12px] font-semibold text-[#6B7A90]">Selesai</dt>
                <dd className="m-0 font-bold">{r.selesaiTeks}</dd>
                <dt className="text-[12px] font-semibold text-[#6B7A90]">Lama</dt>
                <dd className="m-0">{r.hari} hari</dd>
              </dl>
              {r.status === "berjalan" && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E1E9F6]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.persen} aria-label={r.ket}>
                  <span className="block h-full rounded-full bg-[#19A463]" style={{ width: `${r.persen}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="m-0 mt-2 text-[11.5px] leading-snug text-[#6B7A90]">
        Sumber: Identifikasi survei{jadwal.sumber ? ` ${jadwal.sumber}` : ""}. {jadwal.periode.some((p) => p.perkiraan) ? "Perkiraan dapat berubah; ikuti pembaruan dari PJ." : ""}
      </p>
    </section>
  );
}
