"use client";

// app/sigap/sampel/KartuSls.tsx
//
// (30 Okt 2026) Kartu satu SLS: sampel utama (nama responden, anggota ruta lain, navigasi ke koordinat), sampel cadangan, dan tanda penggantian.
// `bisaGanti` (PPL pemilik, pengaturan mengizinkan) menampilkan tombol Ganti/Batalkan; selain itu kartu hanya-baca (PML).

import { useState } from "react";
import { cadanganTersedia, tautanLihatSampel, tautanPetaSampel, type GrupSls, type SampelRow, type SampelTampil } from "@/lib/sampelSls";

const fmtWaktu = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function Navigasi({ r }: { r: SampelRow }) {
  if (r.lat == null || r.lng == null) return null;
  return (
    <span className="flex flex-none gap-1.5">
      <a href={tautanPetaSampel(r.lat, r.lng)} target="_blank" rel="noopener noreferrer" className="grid min-h-[40px] place-items-center rounded-[10px] bg-[#EAF1FC] px-3 text-[12.5px] font-bold text-[#1F5FD1] active:bg-[#DCE8FB]" aria-label={`Arahkan ke ${r.nama_responden}`}>
        Arahkan
      </a>
      <a href={tautanLihatSampel(r.lat, r.lng)} target="_blank" rel="noopener noreferrer" className="grid min-h-[40px] place-items-center rounded-[10px] border border-[#DCE5F2] bg-white px-3 text-[12.5px] font-bold text-[#44546F] active:bg-[#F1F5FC]" aria-label={`Lihat peta ${r.nama_responden}`}>
        Peta
      </a>
    </span>
  );
}

function BarisUtama({ r, no, bisaGanti, punyaCadangan, onGanti }: { r: SampelTampil; no: number; bisaGanti: boolean; punyaCadangan: boolean; onGanti: (r: SampelRow) => void }) {
  const diganti = !!r.pengganti;
  return (
    <li className={`flex items-start gap-2.5 border-t border-[#EEF2F7] px-3 py-2.5 first:border-t-0 ${diganti ? "bg-[#FFF9E8]" : ""}`}>
      <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-[#EEF2F7] text-[11.5px] font-bold text-[#44546F]">{no}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] font-bold leading-snug text-[#0F2A52] ${diganti ? "line-through decoration-[#B8860B]/60" : ""}`}>{r.nama_responden}</p>
        {r.anggota_lain && <p className="text-[12px] leading-snug text-[#55657D]">Anggota ruta lain: {r.anggota_lain}</p>}
        {diganti && r.pengganti && (
          <p className="mt-0.5 text-[12px] font-semibold leading-snug text-[#8A6200]">
            Diganti cadangan: {r.pengganti.nama_responden}
            {r.pengganti.alasan ? ` · ${r.pengganti.alasan}` : ""}
            {r.pengganti.diganti_at ? ` · ${fmtWaktu(r.pengganti.diganti_at)}` : ""}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Navigasi r={diganti && r.pengganti ? r.pengganti : r} />
          {bisaGanti && !diganti && punyaCadangan && (
            <button type="button" onClick={() => onGanti(r)} className="min-h-[40px] rounded-[10px] border border-[#E8C86E] bg-white px-3 text-[12.5px] font-bold text-[#8A6200] active:bg-[#FFF4D6]">
              Ganti dengan cadangan
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function KartuSls({
  grup,
  semua,
  bisaGanti,
  tampilPpl,
  onGanti,
  onBatal,
  terbukaAwal = true,
}: {
  grup: GrupSls;
  semua: readonly SampelRow[];
  bisaGanti: boolean;
  tampilPpl: boolean;
  onGanti: (utama: SampelRow) => void;
  onBatal: (cadangan: SampelRow) => void;
  terbukaAwal?: boolean;
}) {
  const [buka, setBuka] = useState(terbukaAwal);
  const [cadanganBuka, setCadanganBuka] = useState(false);
  return (
    <section className="overflow-hidden rounded-[18px] bg-white shadow-[0_6px_18px_rgba(15,42,82,.07)]">
      <button type="button" onClick={() => setBuka((b) => !b)} aria-expanded={buka} className="flex w-full items-center gap-2 px-3.5 py-3 text-left active:bg-[#F7FAFF]">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-[#6B7A90]">SLS{tampilPpl ? ` · ${grup.ppl_nama}` : ""}</p>
          <p className="break-all font-mono text-[13.5px] font-bold text-[#0F2A52]">{grup.kode_sls}</p>
          <p className="mt-0.5 text-[12px] text-[#55657D]">
            {grup.utama.length} sampel utama · {grup.cadangan.length} cadangan{grup.diganti > 0 ? ` · ${grup.diganti} diganti` : ""}
          </p>
        </div>
        <span aria-hidden="true" className="flex-none text-[#6B7A90]">
          {buka ? "▴" : "▾"}
        </span>
      </button>
      {buka && (
        <>
          <ol className="border-t border-[#EEF2F7]">
            {grup.utama.map((r, i) => (
              <BarisUtama key={r.id} r={r} no={i + 1} bisaGanti={bisaGanti} punyaCadangan={cadanganTersedia(r, semua).length > 0} onGanti={onGanti} />
            ))}
            {grup.utama.length === 0 && <li className="px-3.5 py-3 text-[13px] text-[#55657D]">Tidak ada sampel utama pada SLS ini.</li>}
          </ol>
          {grup.cadangan.length > 0 && (
            <div className="border-t border-[#EEF2F7]">
              <button type="button" onClick={() => setCadanganBuka((b) => !b)} aria-expanded={cadanganBuka} className="flex min-h-[44px] w-full items-center justify-between px-3.5 text-[13px] font-bold text-[#44546F] active:bg-[#F7FAFF]">
                <span>
                  Sampel cadangan ({grup.cadangan.length}) · tersisa {grup.cadangan_tersisa}
                </span>
                <span aria-hidden="true">{cadanganBuka ? "▴" : "▾"}</span>
              </button>
              {cadanganBuka && (
                <ul className="pb-1">
                  {grup.cadangan.map((r) => (
                    <li key={r.id} className="flex items-start gap-2 border-t border-[#EEF2F7] px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-bold leading-snug text-[#0F2A52]">{r.nama_responden}</p>
                        {r.anggota_lain && <p className="text-[12px] text-[#55657D]">Anggota ruta lain: {r.anggota_lain}</p>}
                        {r.menggantikan ? (
                          <p className="mt-0.5 text-[12px] font-semibold text-[#8A6200]">Dipakai menggantikan {r.menggantikan.nama_responden}</p>
                        ) : (
                          <p className="mt-0.5 text-[12px] text-[#13794B]">Tersedia</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Navigasi r={r} />
                          {bisaGanti && r.menggantikan && (
                            <button type="button" onClick={() => onBatal(r)} className="min-h-[40px] rounded-[10px] border border-[#F0C4BF] bg-white px-3 text-[12.5px] font-bold text-[#B42329] active:bg-[#FDE8E8]">
                              Batalkan penggantian
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
