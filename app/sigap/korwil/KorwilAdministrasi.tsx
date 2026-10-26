"use client";

// app/sigap/korwil/KorwilAdministrasi.tsx
//
// (19 Okt 2026) Monitoring Korwil -- layar Progres Administrasi: matriks PPL & PML x tanggal (H1 = hari pertama pendataan).
// Penilaian sama dengan tab Monitoring (lib/monitorKinerja.kelasHari): lengkap = hasil lapangan + laporan + foto sesuai aturan; sebagian; kosong;
// anomali = bukan hari kerja tetapi ada isian. Hari ini yang belum lengkap tampil "berjalan" (belum dinilai).

import { useEffect, useRef } from "react";
import { angkaId, namaSingkat } from "@/app/sigap/kegiatan/format";
import { tglPendek } from "@/lib/monitorKinerja";
import type { Administrasi, SelAdm } from "@/lib/korwilMonitor";

const SEL: Record<SelAdm, { ikon: string; teks: string; kelas: string }> = {
  lengkap: { ikon: "✓", teks: "lengkap", kelas: "bg-[#DDF3E5] text-[#157A3E]" },
  sebagian: { ikon: "◐", teks: "sebagian", kelas: "bg-[#FFF1CC] text-[#8A6200]" },
  kosong: { ikon: "✕", teks: "kosong", kelas: "bg-[#FDE8E8] text-[#B42329]" },
  anomali: { ikon: "!", teks: "anomali (bukan hari kerja tetapi ada isian)", kelas: "bg-[#EFE3FB] text-[#6B2FA8]" },
  tidak_ada: { ikon: "–", teks: "tidak ada", kelas: "text-[#9AA7BC] font-medium" },
  berjalan: { ikon: "·", teks: "hari ini, berjalan", kelas: "border-[1.5px] border-dashed border-[#9AA7BC] text-[#6B7A90]" },
};
const LEGENDA: SelAdm[] = ["lengkap", "sebagian", "kosong", "anomali", "tidak_ada", "berjalan"];
const LEGENDA_TEKS: Record<SelAdm, string> = { lengkap: "lengkap", sebagian: "sebagian", kosong: "kosong", anomali: "anomali", tidak_ada: "libur / tidak ada", berjalan: "hari ini" };

const tglKolom = (t: string) => `${Number(t.slice(8, 10))}/${Number(t.slice(5, 7))}`;
const Ikon = ({ s, label }: { s: SelAdm; label: string }) => (
  <span role="img" aria-label={label} title={label} className={`inline-grid h-6 w-6 place-items-center rounded-[7px] text-[12px] font-extrabold ${SEL[s].kelas}`}>
    {SEL[s].ikon}
  </span>
);

export default function KorwilAdministrasi({ adm }: { adm: Administrasi }) {
  const gulir = useRef<HTMLDivElement>(null);
  // buka di tanggal terbaru (kolom paling kanan)
  useEffect(() => {
    const el = gulir.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [adm.tanggal.length]);

  if (adm.tanggal.length === 0) return <p className="rounded-[18px] bg-white px-4 py-6 text-center text-[13.5px] text-[#5B6B84] shadow-[0_8px_22px_rgba(15,42,82,.06)]">Pendataan belum dimulai.</p>;
  const p = adm.perhatian;
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11.5px] text-[#52627A]" aria-label="Keterangan simbol">
        {LEGENDA.map((s) => (
          <li key={s} className="inline-flex items-center gap-1">
            <span aria-hidden className={`inline-grid h-[18px] w-[18px] place-items-center rounded-[6px] text-[10px] font-extrabold ${SEL[s].kelas}`}>
              {SEL[s].ikon}
            </span>
            {LEGENDA_TEKS[s]}
          </li>
        ))}
      </ul>

      <div ref={gulir} className="overflow-x-auto rounded-[14px] bg-white shadow-[0_2px_8px_rgba(15,42,82,.08)]">
        <table className="border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-[2] min-w-[112px] max-w-[112px] border-r border-[#D9E3F2] bg-[#F6F8FC] px-2 py-1.5 text-left text-[10.5px] font-bold text-[#6B7A90]">
                Petugas
              </th>
              {adm.tanggal.map((t, i) => (
                <th key={t} scope="col" className={`min-w-[34px] bg-[#F6F8FC] px-0 py-1.5 text-center text-[10.5px] font-bold ${t === adm.hari_ini ? "text-[#1F5FD1]" : "text-[#6B7A90]"}`}>
                  H{i + 1}
                  <small className="block text-[9.5px] font-medium">{tglKolom(t)}</small>
                </th>
              ))}
              <th scope="col" className="min-w-[46px] bg-[#F6F8FC] px-1 py-1.5 text-center text-[10.5px] font-bold text-[#6B7A90]">
                Lengkap
              </th>
            </tr>
          </thead>
          <tbody>
            {adm.tim.map((tm) => (
              <TimBaris key={tm.pml_id} tm={tm} tanggal={adm.tanggal} />
            ))}
          </tbody>
        </table>
      </div>

      {p && (p.kosong.length > 0 || p.sebagian.length > 0) ? (
        <div className="rounded-[14px] bg-[#FFF1CC] px-3 py-2.5 text-[12.5px] leading-snug text-[#5C4300]">
          <b>Perlu perhatian · {tglPendek(p.tanggal)}</b>
          {p.kosong.length > 0 && (
            <p className="mt-0.5">
              Kosong ({p.kosong.length}): {p.kosong.map(namaSingkat).join(", ")}
            </p>
          )}
          {p.sebagian.length > 0 && (
            <p className="mt-0.5">
              Sebagian ({p.sebagian.length}): {p.sebagian.map(namaSingkat).join(", ")}
            </p>
          )}
        </div>
      ) : (
        p && <p className="rounded-[14px] bg-[#DDF3E5] px-3 py-2.5 text-[12.5px] font-bold text-[#0F5A2D]">Semua petugas lengkap pada {tglPendek(p.tanggal)}.</p>
      )}
      <p className="px-1 text-[11.5px] text-[#6B7A90]">
        Hari kerja yang sudah lewat: {angkaId(adm.ringkas.lengkap)} lengkap dari {angkaId(adm.ringkas.wajib)} ({angkaId(adm.ringkas.wajib - adm.ringkas.lengkap)} terlewat). Hari ini dan hari yang akan datang belum dihitung; rencana seluruh periode ada di Transport Lokal tiap petugas. Geser ke kiri untuk hari sebelumnya.
      </p>
    </div>
  );
}

function TimBaris({ tm, tanggal }: { tm: Administrasi["tim"][number]; tanggal: string[] }) {
  return (
    <>
      <tr>
        <td colSpan={tanggal.length + 2} className="bg-[#E3ECFB] px-0 py-1 text-left text-[11px] font-extrabold text-[#1F5FD1]">
          {/* teks tetap di kiri layar saat tabel digeser */}
          <span className="sticky left-0 inline-block px-2">Tim {namaSingkat(tm.pml_nama)}</span>
        </td>
      </tr>
      {tm.baris.map((b) => (
        <tr key={`${b.peran}-${b.petugas_id}`}>
          <th scope="row" className="sticky left-0 z-[1] min-w-[112px] max-w-[112px] border-r border-[#D9E3F2] border-b border-b-[#EEF2F8] bg-white px-2 py-1.5 text-left font-normal">
            <b className="block truncate text-[12px] text-[#0F2A52]">{namaSingkat(b.nama)}</b>
            <small className="text-[10px] text-[#6B7A90]">{b.peran === "pml" ? "PML" : "PPL"}</small>
          </th>
          {b.sel.map((s, i) => (
            <td key={tanggal[i]} className="h-10 min-w-[34px] border-b border-[#EEF2F8] text-center">
              <Ikon s={s} label={`${namaSingkat(b.nama)}, ${tglPendek(tanggal[i])}: ${SEL[s].teks}`} />
            </td>
          ))}
          <td className="min-w-[46px] border-b border-[#EEF2F8] bg-white text-center text-[11.5px] font-extrabold text-[#0F2A52]">
            {b.lengkap}/{b.wajib}
          </td>
        </tr>
      ))}
    </>
  );
}
