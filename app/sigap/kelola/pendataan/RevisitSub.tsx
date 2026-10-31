"use client";

// app/sigap/kelola/pendataan/RevisitSub.tsx
//
// (31 Okt 2026) Tab "Revisit" di kartu "Permintaan daftar KK ke FASIH" (Kelola Pendataan > Persiapan) -- permintaan user, khusus pendataan bencana.
// Admin menandai Sub SLS yang akan direvisit. Selama bertanda, SEMUA KK di Sub SLS itu mendapat pilihan hasil tambahan di kartu KK Lembar Pendataan:
// "Tidak terdampak, revisit menjadi terdampak" (hasil tersimpan tetap 'terdampak'; aturan: lib/revisit.ts). Tanda bisa dicabut kapan saja.

import { rapikanNama } from "@/lib/rekapIdentifikasi";
import { LABEL_REVISIT, type BarisRevisit } from "@/lib/revisit";

type Props = {
  baris: BarisRevisit[];
  /** false = SQL 20261031c belum dijalankan */
  tersedia: boolean;
  boleh: boolean;
  sibuk: string | null;
  onUbah: (idsubsls: string, aktif: boolean) => void;
};

export default function RevisitSub({ baris, tersedia, boleh, sibuk, onUbah }: Props) {
  const bertanda = baris.filter((b) => b.aktif).length;
  return (
    <div className="mt-3">
      <p className="rounded-[12px] bg-[#F5F8FE] px-3 py-2.5 text-[12px] leading-snug text-[#52627A]">
        Tandai Sub SLS yang akan direvisit. Selama bertanda, semua KK di Sub SLS itu mendapat satu pilihan hasil tambahan di kartu KK: <b>{LABEL_REVISIT}</b>. Hasilnya tetap dihitung sebagai terdampak. Daftar ini berisi Sub SLS yang assignment-nya sudah keluar di FASIH.
      </p>
      {!tersedia && (
        <p className="mt-2 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#7A1D22]">Fitur revisit belum aktif di database. Jalankan <b>20261031c_pendataan_revisit.sql</b> lebih dulu.</p>
      )}
      {!boleh && tersedia && <p className="mt-2 text-[12.5px] text-[#6B7A90]">Mengatur revisit butuh izin kelola pendataan.</p>}
      {tersedia && baris.length === 0 && <p className="mt-3 rounded-[12px] bg-[#F5F8FE] px-3 py-3 text-[13px] text-[#55657D]">Belum ada Sub SLS yang assignment-nya sudah keluar di FASIH.</p>}
      {baris.length > 0 && (
        <>
          <p className="mt-3 text-[12px] font-bold text-[#6B1F96]">{bertanda} dari {baris.length} Sub SLS bertanda revisit</p>
          <ul className="mt-2 overflow-hidden rounded-[14px] border border-[#EEF2F7]">
            {baris.map((b) => {
              const lagi = sibuk === b.idsubsls;
              return (
                <li key={b.idsubsls} className="flex items-start gap-3 border-t border-[#EEF2F7] px-3 py-2.5 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13.5px] text-[#0F2A52]">
                      {rapikanNama(b.sls)}
                      {b.sub_sls ? ` Sub ${b.sub_sls}` : ""} · Nagari {rapikanNama(b.nagari)}
                      {b.aktif && <span className="ml-1.5 inline-block rounded-full bg-[#F1E4FA] px-2 py-[1px] align-[1px] text-[11px] font-extrabold text-[#6B1F96]">Revisit</span>}
                    </b>
                    <small className="block text-[12px] text-[#6B7A90]">
                      Kec. {b.kecamatan} · PML {b.pml_nama} → PPL {b.ppl_nama}
                    </small>
                  </span>
                  {boleh && tersedia && (
                    <button
                      type="button"
                      disabled={sibuk !== null}
                      aria-pressed={b.aktif}
                      aria-label={`${b.aktif ? "Cabut revisit" : "Tandai revisit"} ${rapikanNama(b.sls)}${b.sub_sls ? ` Sub ${b.sub_sls}` : ""}`}
                      onClick={() => onUbah(b.idsubsls, !b.aktif)}
                      className={`min-h-[44px] flex-none rounded-full px-3.5 text-[12.5px] font-extrabold disabled:opacity-50 ${b.aktif ? "border-2 border-[#B42329] bg-white text-[#B42329]" : "bg-[#6B1F96] text-white"}`}
                    >
                      {lagi ? "Menyimpan…" : b.aktif ? "Cabut" : "Tandai revisit"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
