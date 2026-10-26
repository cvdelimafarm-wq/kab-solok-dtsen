"use client";

// app/sigap/delego/PemilihPenerima.tsx
//
// (26 Okt 2026, tahap 39) Pemilih penerima delegasi, dipakai halaman Buat delegasi dan Pekerjaan berulang. Calon dari lanjutan final identifikasi,
// pegawai organik, dan pencarian mitra/akun lain; peran tiap penerima dapat diatur (mitra hanya PML atau PPL).

import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { NAMA_PERAN, type JenisAkun, type PeranDelegasi } from "@/lib/delego/tipe";
import { useCalon } from "./data";
import { useKonteksDelego } from "./konteks";
import { KELAS } from "./merek";
import { Galat, Lencana, Memuat } from "./ui";

export type Pilihan = { akun: number; nama: string; jenis: JenisAkun; peran: PeranDelegasi; pj: string };

export const peranAwal = (jenis: JenisAkun, petunjuk?: string | null): PeranDelegasi => {
  const p = (petunjuk ?? "").toLowerCase();
  if (/\bpml\b/.test(p)) return "pml";
  if (/\bppl\b/.test(p)) return "ppl";
  if (jenis === "mitra") return "ppl";
  if (/wakil/.test(p)) return "wakil";
  return "pegawai";
};

export default function PemilihPenerima({
  ro,
  ident,
  pilih,
  setPilih,
  infoBeban,
  tampilPj = true,
  bebanOrang,
}: {
  ro: string;
  ident: number | null;
  pilih: Pilihan[];
  setPilih: Dispatch<SetStateAction<Pilihan[]>>;
  /** Teks tambahan di bawah tiap penerima terpilih (mis. beban minggu ini). */
  infoBeban?: (akun: number) => ReactNode;
  tampilPj?: boolean;
  /** Persen beban minggu ini per akun untuk daftar pegawai organik. */
  bebanOrang?: (akun: number) => number | null;
}) {
  const { hak } = useKonteksDelego();
  const [cari, setCari] = useState("");
  const [cariTunda, setCariTunda] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setCariTunda(cari.trim()), 300);
    return () => clearTimeout(t);
  }, [cari]);
  const calon = useCalon(ro || null, ident, cariTunda);

  const sudah = (akun: number) => pilih.some((p) => p.akun === akun);
  const tambahPilih = (akun: number, nama: string, jenis: JenisAkun, petunjuk?: string | null) => {
    if (sudah(akun)) return;
    setPilih((x) => [...x, { akun, nama, jenis, peran: peranAwal(jenis, petunjuk), pj: "" }]);
  };
  const ubah = (akun: number, p: Partial<Pilihan>) => setPilih((x) => x.map((y) => (y.akun === akun ? { ...y, ...p } : y)));

  if (!ro) return <p className="m-0 text-[13.5px] text-[#3B4A57]">Pilih asal pekerjaan terlebih dulu.</p>;

  return (
    <div className="space-y-4">
      {pilih.length > 0 && (
        <ul className="m-0 list-none space-y-2 p-0">
          {pilih.map((p) => (
            <li key={p.akun} className="rounded-lg border border-[#D5DCE2] bg-[#F9FBFB] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px] font-semibold">{p.nama}{p.jenis === "mitra" && <span className="text-[12px] font-normal text-[#3B4A57]"> · mitra</span>}</span>
                <button type="button" className={KELAS.tombolKecil} onClick={() => setPilih((x) => x.filter((y) => y.akun !== p.akun))} aria-label={`Hapus ${p.nama} dari daftar`}>Lepas</button>
              </div>
              <div className={`mt-2 grid gap-2 ${tampilPj ? "grid-cols-2" : "grid-cols-1"}`}>
                <select aria-label={`Peran ${p.nama}`} className={KELAS.isian} value={p.peran} onChange={(e) => ubah(p.akun, { peran: e.target.value as PeranDelegasi })}>
                  {(p.jenis === "mitra" ? (["pml", "ppl"] as const) : (["wakil", "pegawai", "pml", "ppl"] as const)).map((r) => <option key={r} value={r}>{NAMA_PERAN[r]}</option>)}
                </select>
                {tampilPj && <input aria-label={`PJ bidang ${p.nama}`} className={KELAS.isian} maxLength={80} placeholder="PJ bidang (opsional)" value={p.pj} onChange={(e) => ubah(p.akun, { pj: e.target.value })} />}
              </div>
              {infoBeban?.(p.akun)}
            </li>
          ))}
        </ul>
      )}

      {calon.memuat && !calon.data && <Memuat />}
      {calon.galat && !calon.data && <Galat>{calon.galat}</Galat>}
      {calon.data && (
        <>
          {ident && (
            <div>
              <div className={KELAS.labelKecil}>Dari lanjutan identifikasi</div>
              {calon.data.lanjutan.filter((c) => c.akun_id !== hak.akun.id).length === 0 ? (
                <p className="m-0 mt-1 text-[13px] text-[#3B4A57]">Belum ada petugas pada lanjutan final identifikasi ini.</p>
              ) : (
                <ul className="m-0 mt-1 list-none space-y-1 p-0">
                  {calon.data.lanjutan.filter((c) => c.akun_id !== hak.akun.id).map((c, i) => (
                    <li key={`${c.nama}-${i}`} className="flex items-center justify-between gap-2 text-[13.5px]">
                      <span className="min-w-0 truncate">{c.nama} <span className="text-[#3B4A57]">{c.peran ? `· ${c.peran}` : ""}</span></span>
                      {c.akun_id ? (
                        <button type="button" className={KELAS.tombolKecil} disabled={sudah(c.akun_id)} onClick={() => tambahPilih(c.akun_id as number, c.nama, c.jenis === "mitra" ? "mitra" : "organik", `${c.peran ?? ""} ${c.jenis ?? ""}`)}>{sudah(c.akun_id) ? "Dipilih" : "Pilih"}</button>
                      ) : (
                        <Lencana nada="amber">Belum punya akun</Lencana>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div>
            <div className={KELAS.labelKecil}>Pegawai organik</div>
            <ul className="m-0 mt-1 max-h-48 list-none space-y-1 overflow-y-auto p-0">
              {calon.data.organik.filter((c) => c.id !== hak.akun.id).map((c) => {
                const b = bebanOrang?.(c.id);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-[13.5px]">
                    <span className="min-w-0 truncate">{c.nama}{b !== null && b !== undefined ? <span className="text-[12px] text-[#3B4A57]"> · beban {b}%</span> : null}</span>
                    <button type="button" className={KELAS.tombolKecil} disabled={sudah(c.id)} onClick={() => tambahPilih(c.id, c.nama, "organik")}>{sudah(c.id) ? "Dipilih" : "Pilih"}</button>
                  </li>
                );
              })}
              {calon.data.organik.length === 0 && <li className="text-[13px] text-[#3B4A57]">Tidak ada pegawai organik aktif.</li>}
            </ul>
          </div>
        </>
      )}
      <div>
        <label className="block space-y-1">
          <span className={KELAS.labelKecil}>Cari mitra atau akun lain</span>
          <input className={KELAS.isian} placeholder="Ketik minimal 2 huruf nama" value={cari} onChange={(e) => setCari(e.target.value)} />
        </label>
        {calon.data && cariTunda.length >= 2 && (
          <ul className="m-0 mt-2 max-h-48 list-none space-y-1 overflow-y-auto p-0">
            {calon.data.cari.filter((c) => c.id !== hak.akun.id).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-[13.5px]">
                <span className="min-w-0 truncate">{c.nama} <span className="text-[12px] text-[#3B4A57]">· {c.jenis}{c.kecamatan ? ` · ${c.kecamatan}` : ""}</span></span>
                <button type="button" className={KELAS.tombolKecil} disabled={sudah(c.id)} onClick={() => tambahPilih(c.id, c.nama, c.jenis)}>{sudah(c.id) ? "Dipilih" : "Pilih"}</button>
              </li>
            ))}
            {calon.data.cari.length === 0 && <li className="text-[13px] text-[#3B4A57]">Tidak ditemukan.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
