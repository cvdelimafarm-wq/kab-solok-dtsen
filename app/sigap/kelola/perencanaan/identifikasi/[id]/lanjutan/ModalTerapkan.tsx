"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/lanjutan/ModalTerapkan.tsx
//
// (5 Nov 2026) Dua dialog halaman Identifikasi lanjutan:
//   * ModalTerapkan: dampak perubahan terhadap modul hilir (alokasi petugas, rekrutmen, anggaran, pengadaan) dan pilihan "Simpan dan terapkan" atau "Simpan saja".
//     "Simpan saja" menyimpan versi baru (tercatat di riwayat) tetapi modul hilir tetap memakai versi yang ditandai (keu_lanjutan_simpan p_terapkan=false).
//     Mode "terapkan" hanya menerapkan versi terbaru ke hilir tanpa mengubah isi (keu_lanjutan_terapkan). Sesudah H-15 penerapan wajib beralasan.
//   * ModalKeluar: peringatan meninggalkan halaman saat ada perubahan belum disimpan (pengganti window.confirm agar tidak memblokir peramban).
// Hanya tampilan; aturan di basis data (20261105a) dan lib/keu/selisihLanjutan.ts.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { kolom, tombolKecil, tombolUtama } from "@/app/sigap/keu-ui";
import type { Dampak } from "@/lib/keu/selisihLanjutan";

export type PilihanSimpan = "terapkan" | "saja";

function Lapisan({ judul, idJudul, onTutup, children }: { judul: string; idJudul: string; onTutup: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const tutupRef = useRef(onTutup);
  tutupRef.current = onTutup;
  // dipasang sekali: fokus awal ke dialog, Escape menutup (pemanggil terbaru lewat ref agar fokus tidak berpindah saat mengetik)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") tutupRef.current(); };
    document.addEventListener("keydown", k);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", k);
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0E2A47]/45 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onTutup(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={idJudul} className="flex max-h-[92vh] w-full max-w-[560px] flex-col gap-3 overflow-y-auto rounded-t-xl border border-[#DCE3EE] bg-white p-4 shadow-xl outline-none sm:rounded-xl">
        <h2 id={idJudul} className="m-0 text-[16px] font-bold text-[#0F2A52]">{judul}</h2>
        {children}
      </div>
    </div>
  );
}

export function DaftarDampak({ dampak }: { dampak: Dampak[] }) {
  if (dampak.length === 0) return <p className="m-0 text-[13px] text-[#44546F]">Tidak ada selisih angka pada alokasi, rekrutmen, anggaran, maupun pengadaan.</p>;
  return (
    <div className="flex flex-col gap-2">
      {dampak.map((d) => (
        <div key={d.kunci} className="rounded-lg border border-[#DCE3EE] bg-[#FAFBFD] px-3 py-2">
          <p className="m-0 text-[13px] font-semibold text-[#0F2A52]">{d.judul}</p>
          <ul className="m-0 mt-1 list-disc pl-5 text-[12.5px] leading-snug text-[#44546F]">{d.butir.map((b, i) => <li key={`${d.kunci}${i}`}>{b}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

export function ModalTerapkan(p: {
  mode: "simpan" | "terapkan";
  dampak: Dampak[];
  verHilir: number | null; // versi yang kini dipakai hilir (null = ikut versi terbaru)
  verTerbaru: number | null;
  pinAda: boolean;
  pasca: boolean;
  wajibDasar: boolean; // sesudah H-15 dan lanjutan Final diubah: alasan wajib untuk simpan apa pun pilihannya
  mengirim: boolean;
  galat: string | null;
  alasanAwal: string;
  onBatal: () => void;
  onJalan: (pilihan: PilihanSimpan, alasan: string) => void;
}) {
  const [pilihan, setPilihan] = useState<PilihanSimpan>("terapkan");
  const [alasan, setAlasan] = useState(p.alasanAwal);
  const simpan = p.mode === "simpan";
  const perluAlasan = p.pasca && (simpan ? (p.wajibDasar || (pilihan === "terapkan" && p.pinAda)) : true);
  const kurang = perluAlasan && alasan.trim().length < 10;
  const efektif: PilihanSimpan = simpan ? pilihan : "terapkan";
  const tutup = () => { if (!p.mengirim) p.onBatal(); };
  const label = !simpan ? "Terapkan ke modul hilir" : pilihan === "terapkan" ? "Simpan dan terapkan" : "Simpan saja";
  const verHilirTeks = p.verHilir ?? p.verTerbaru;
  return (
    <Lapisan judul={simpan ? "Simpan identifikasi lanjutan" : `Terapkan versi ${p.verTerbaru ?? ""} ke modul hilir`} idJudul="judul-modal-terapkan" onTutup={tutup}>
      <p className="m-0 text-[13px] leading-snug text-[#44546F]">
        {simpan
          ? <>Modul hilir (usulan penugasan, Delego, kebutuhan rekrutmen, pelaksanaan, kelas pelatihan) saat ini memakai versi {verHilirTeks ?? "terbaru"}. Perubahan ini berdampak pada:</>
          : <>Modul hilir saat ini memakai versi {verHilirTeks}; versi terbaru adalah {p.verTerbaru}. Menerapkan versi terbaru berdampak pada:</>}
      </p>
      <DaftarDampak dampak={p.dampak} />
      {simpan && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={p.mengirim}>
          <legend className="mb-1 p-0 text-[12.5px] font-semibold text-[#5B6B84]">Pilih cara menyimpan</legend>
          <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 ${pilihan === "terapkan" ? "border-[#1F5FD1] bg-[#E3EEFF]" : "border-[#C5D0E2] bg-white"}`}>
            <input type="radio" name="cara-simpan" className="mt-1 h-4 w-4 accent-[#1F5FD1]" checked={pilihan === "terapkan"} onChange={() => setPilihan("terapkan")} />
            <span><strong className="block text-[13.5px] text-[#0F2A52]">Simpan dan terapkan ke modul hilir</strong><span className="text-[12.5px] text-[#44546F]">Alokasi petugas, rekrutmen, anggaran, dan pengadaan langsung memakai angka baru.</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 ${pilihan === "saja" ? "border-[#1F5FD1] bg-[#E3EEFF]" : "border-[#C5D0E2] bg-white"}`}>
            <input type="radio" name="cara-simpan" className="mt-1 h-4 w-4 accent-[#1F5FD1]" checked={pilihan === "saja"} onChange={() => setPilihan("saja")} />
            <span><strong className="block text-[13.5px] text-[#0F2A52]">Simpan saja</strong><span className="text-[12.5px] text-[#44546F]">Versi baru tersimpan dan tercatat di riwayat. Modul hilir tetap memakai versi {verHilirTeks ?? "sebelumnya"}; Anda dapat menerapkannya nanti dari halaman ini.</span></span>
          </label>
        </fieldset>
      )}
      {perluAlasan && (
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-[#5B6B84]">Alasan (wajib sesudah H-15, minimal 10 huruf; dicatat dan masuk antrean keputusan KPA)</span>
          <textarea className={`${kolom} min-h-[64px] py-2`} rows={2} maxLength={500} value={alasan} onChange={(e) => setAlasan(e.target.value)} disabled={p.mengirim} />
        </label>
      )}
      {p.galat && <p role="alert" className="m-0 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{p.galat}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className={tombolKecil} disabled={p.mengirim} onClick={tutup}>Batal</button>
        <button type="button" className={tombolUtama} disabled={p.mengirim || kurang} onClick={() => p.onJalan(efektif, alasan.trim())}>{p.mengirim ? "Menyimpan…" : label}</button>
      </div>
      {kurang && <p className="m-0 text-right text-[12px] text-[#8A6200]">Isi alasan minimal 10 huruf.</p>}
    </Lapisan>
  );
}

export function ModalKeluar({ onTetap, onKeluar }: { onTetap: () => void; onKeluar: () => void }) {
  return (
    <Lapisan judul="Perubahan belum disimpan" idJudul="judul-modal-keluar" onTutup={onTetap}>
      <p className="m-0 text-[13px] leading-snug text-[#44546F]">Isian yang Anda ubah di halaman ini belum disimpan. Bila keluar sekarang, perubahan itu hilang.</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className={tombolKecil} onClick={onKeluar}>Keluar tanpa menyimpan</button>
        <button type="button" className={tombolUtama} onClick={onTetap}>Tetap di halaman</button>
      </div>
    </Lapisan>
  );
}
