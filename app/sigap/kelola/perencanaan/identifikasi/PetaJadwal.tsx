"use client";

// app/sigap/kelola/perencanaan/identifikasi/PetaJadwal.tsx
//
// (28 Okt 2026) Peta jadwal (Gantt) satu periode: briefing, pelatihan, rapat, dan tahap kegiatan pada satu garis waktu.
// Batang polos = Fix; batang bergaris miring dengan tepi putus-putus = Perkiraan. Benturan jadwal dicatat di bawah peta.
// Murni tampilan; data dari lib/keu/petaJadwal.ts (fungsi murni dengan tes).

import { Fragment, useMemo } from "react";
import { kartu } from "@/app/sigap/keu-ui";
import { petaJadwal, posisiBar, tandaBulan, tandaMinggu, type BarisPeta, type KelompokPeta } from "@/lib/keu/petaJadwal";
import { tglIndo, type Form } from "@/lib/keu/identifikasi";

const WARNA: Record<KelompokPeta, string> = { sesi: "#1F5FD1", rapat: "#7A4FC9", tahap: "#14864A" };
const NAMA_KEL: Record<KelompokPeta, string> = { sesi: "Sesi", rapat: "Rapat", tahap: "Tahap" };
const pendek = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

function Batang({ b, awal, akhir }: { b: BarisPeta; awal: string; akhir: string }) {
  const w = WARNA[b.kel];
  if (!b.ada) return <span className="text-[11.5px] italic text-[#8A97AD]">Belum dijadwalkan</span>;
  const { kiri, lebar } = posisiBar(awal, akhir, b.mulai, b.selesai);
  const gaya = b.perk
    ? { background: `repeating-linear-gradient(45deg, ${w}40 0 4px, ${w}14 4px 8px)`, border: `1.5px dashed ${w}` }
    : { background: w, border: `1.5px solid ${w}` };
  return (
    <span
      role="img" aria-label={`${b.nama}, ${b.perk ? "perkiraan" : "fix"}, ${tglIndo(b.mulai)} sampai ${tglIndo(b.selesai)}`}
      title={`${b.nama} (${b.perk ? "Perkiraan" : "Fix"}): ${tglIndo(b.mulai)} s.d. ${tglIndo(b.selesai)}`}
      className="absolute top-1/2 h-[18px] -translate-y-1/2 rounded"
      style={{ left: `${kiri}%`, width: `${lebar}%`, ...gaya }}
    />
  );
}

export default function PetaJadwal({ f, P, tahun, daftarP, onPilihP, hariIni }: {
  f: Form; P: string; tahun: number; daftarP: string[]; onPilihP: (p: string) => void; hariIni: string;
}) {
  const h = useMemo(() => petaJadwal(f, P, tahun), [f, P, tahun]);
  const bulan = useMemo(() => tandaBulan(h.awal, h.akhir), [h.awal, h.akhir]);
  const minggu = useMemo(() => tandaMinggu(h.awal, h.akhir), [h.awal, h.akhir]);
  const ada = h.baris.filter((b) => b.ada).length;
  const posHariIni = h.awal && hariIni >= h.awal && hariIni <= h.akhir ? posisiBar(h.awal, h.akhir, hariIni, hariIni).kiri : null;
  const KOL = "grid-cols-[104px_minmax(0,1fr)]";

  return (
    <section className={`${kartu} flex flex-col gap-2.5`} aria-labelledby="h-peta">
      <header className="flex flex-wrap items-center gap-2">
        <h3 id="h-peta" className="m-0 text-[15px] font-extrabold text-[#0F2A52]">Peta jadwal</h3>
        <span className="ml-auto text-[12px] text-[#5B6B84]">{ada} dari {h.baris.length} kegiatan terjadwal</span>
      </header>
      {daftarP.length > 1 && (
        <div role="tablist" aria-label="Periode peta jadwal" className="flex flex-wrap gap-1.5">
          {daftarP.map((q) => (
            <button key={q} type="button" role="tab" aria-selected={q === P} onClick={() => onPilihP(q)}
              className={`min-h-[32px] rounded-md border px-2.5 text-[12.5px] font-semibold ${q === P ? "border-[#1F5FD1] bg-[#1F5FD1] text-white" : "border-[#C5D0E2] bg-white text-[#1B2B4B] hover:bg-[#EEF2F7]"}`}>{q}</button>
          ))}
        </div>
      )}
      {!h.awal ? (
        <p className="m-0 rounded-lg border border-[#D5DEEC] bg-[#F3F6FA] px-3 py-2 text-[12.5px] text-[#44546F]">Belum ada jadwal terisi untuk {P}. Isi jadwal tahap, pelatihan, atau rapat; petanya terbentuk otomatis.</p>
      ) : (
        <div className="relative">
          <div className={`grid ${KOL} gap-y-0`}>
            <div />
            <div className="relative h-5" aria-hidden>
              {bulan.map((t) => <span key={t.tgl} className="absolute top-0 whitespace-nowrap text-[10.5px] font-bold text-[#44546F]" style={{ left: `${t.kiri}%` }}>{t.nama}</span>)}
            </div>
            {h.baris.map((b) => (
              <Fragment key={b.kunci}>
                <div className="flex min-w-0 flex-col justify-center border-t border-[#EEF2F7] py-1 pr-2">
                  <span className="flex items-center gap-1.5 truncate text-[12px] font-bold text-[#0F2A52]">
                    <span aria-hidden className="inline-block h-2 w-2 flex-none rounded-sm" style={{ background: WARNA[b.kel] }} />{b.nama}
                  </span>
                  <span className="truncate pl-3.5 text-[10.5px] text-[#5B6B84]">{b.ada ? `${pendek(b.mulai)} – ${pendek(b.selesai)}` : "belum diisi"}</span>
                </div>
                <div className="relative flex h-10 items-center border-t border-[#EEF2F7]">
                  <Batang b={b} awal={h.awal} akhir={h.akhir} />
                </div>
              </Fragment>
            ))}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[104px] right-0">
            {minggu.map((x) => <span key={`m${x}`} className="absolute bottom-0 top-5 border-l border-dashed border-[#EEF2F7]" style={{ left: `${x}%` }} />)}
            {bulan.map((t) => <span key={t.tgl} className="absolute bottom-0 top-0 border-l border-[#CBD5E5]" style={{ left: `${t.kiri}%` }} />)}
            {posHariIni !== null && (
              <span className="absolute bottom-0 top-5 border-l-2 border-[#D64545]" style={{ left: `${posHariIni}%` }}>
                <span className="absolute -top-4 -translate-x-1/2 whitespace-nowrap rounded bg-[#D64545] px-1 text-[9.5px] font-bold text-white">hari ini</span>
              </span>
            )}
          </div>
        </div>
      )}
      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[11.5px] text-[#44546F]" aria-label="Keterangan peta">
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-5 rounded-sm" style={{ background: "#14864A" }} />Fix</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-5 rounded-sm" style={{ background: "repeating-linear-gradient(45deg,#14864A40 0 4px,#14864A14 4px 8px)", border: "1.5px dashed #14864A" }} />Perkiraan</li>
        {(["sesi", "rapat", "tahap"] as const).map((k) => <li key={k} className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: WARNA[k] }} />{NAMA_KEL[k]}</li>)}
      </ul>
      {h.konflik.length > 0 && (
        <div role="alert" className="rounded-lg border border-[#E7C15A] bg-[#FFF8E1] px-3 py-2 text-[12.5px] leading-snug text-[#6B4E00]">
          <strong>Perlu dicek:</strong>
          <ul className="m-0 mt-1 list-disc pl-5">{h.konflik.map((k) => <li key={k}>{k}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
