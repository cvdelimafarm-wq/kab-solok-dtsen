"use client";

// app/sigap/kelola/perencanaan/identifikasi/TabelSaring.tsx
//
// (5 Nov 2026) Tabel umum dengan tombol saring di tiap judul kolom, dipakai Identifikasi awal (Formulir) dan Identifikasi lanjutan (TabelLanjutan).
// Dipindah dari [id]/lanjutan/TabelLanjutan.tsx supaya dipakai bersama. Kotak saringan menutup dengan Back HP (useTutupDenganBack).
// Kolom `lekat` menempel di tepi kanan saat tabel digulir ke samping. Baris dapat diberi id, kelas, dan ikut terbuka lewat loncat() (Kontrol.tsx).

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { kolom, tombolKecil } from "@/app/sigap/keu-ui";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";

// ---------------------------------------------------------------------------------------------------------------------
// Tabel umum dengan tombol saring di tiap judul kolom
// ---------------------------------------------------------------------------------------------------------------------
export type NilaiSaring = Record<string, string[]>;
export type Kol<T> = {
  id: string; judul: string; jenis: "teks" | "pilih"; nilai: (r: T) => string; sel: (r: T) => ReactNode; kelasTd?: string;
  /** Kolom menempel di tepi kanan saat tabel digulir ke samping (dipakai kolom aksi agar tombolnya selalu terlihat). */
  lekat?: boolean;
};
const LEKAT_SHADOW = "sticky right-0 z-10 shadow-[-8px_0_8px_-8px_rgba(15,42,82,0.25)]";
const LEKAT = `${LEKAT_SHADOW} bg-white`;
const LEKAT_MATI = `${LEKAT_SHADOW} bg-[#F6F8FB]`;

const lolos = (saring: NilaiSaring, id: string, nilai: string, teks: boolean): boolean => {
  const f = saring[id];
  if (!f || f.length === 0) return true;
  return teks ? nilai.toLowerCase().includes(f[0].trim().toLowerCase()) : f.includes(nilai);
};

function ThSaring({ judul, id, jenis, pilihan, saring, setSaring, lekat }: {
  judul: string; id: string; jenis: "teks" | "pilih"; pilihan: string[]; saring: NilaiSaring; setSaring: (f: (s: NilaiSaring) => NilaiSaring) => void; lekat?: boolean;
}) {
  const [buka, setBuka] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const kotak = useRef<HTMLTableCellElement>(null);
  const tombol = useRef<HTMLButtonElement>(null);
  useTutupDenganBack(buka, () => setBuka(false)); // Back HP menutup kotak saringan
  const sekarang = saring[id] ?? [];
  const aktif = sekarang.length > 0 && sekarang.some((x) => x.trim() !== "");
  useEffect(() => {
    if (!buka) return;
    const tutup = (e: PointerEvent) => { if (!kotak.current?.contains(e.target as Node)) setBuka(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setBuka(false); tombol.current?.focus(); } };
    const geser = (e: Event) => { if (!(e.target instanceof Node) || !kotak.current?.contains(e.target)) setBuka(false); };
    document.addEventListener("pointerdown", tutup);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", geser, true);
    window.addEventListener("resize", geser);
    return () => { document.removeEventListener("pointerdown", tutup); document.removeEventListener("keydown", esc); window.removeEventListener("scroll", geser, true); window.removeEventListener("resize", geser); };
  }, [buka]);
  // Kotak saringan memakai posisi tetap (fixed) agar tidak terpotong oleh pembungkus tabel yang dapat digulir
  const bukaKotak = () => {
    const r = tombol.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 232)) });
    setBuka((b) => !b);
  };
  const semua = Array.from(new Set([...pilihan, ...sekarang]));
  return (
    <th ref={kotak} scope="col" className={`py-1.5 pr-1.5 text-left align-bottom font-bold ${lekat ? LEKAT : ""}`}>
      <button
        ref={tombol} type="button" aria-haspopup="dialog" aria-expanded={buka} aria-label={`Saring kolom ${judul}${aktif ? " (saringan aktif)" : ""}`}
        onClick={bukaKotak}
        className={`inline-flex min-h-[32px] items-center gap-1 rounded px-1 uppercase tracking-[0.04em] hover:bg-[#EEF3FB] ${aktif ? "bg-[#E3EEFF] text-[#1F5FD1]" : ""}`}
      >
        <span>{judul}</span><span aria-hidden>{aktif ? "●" : "▾"}</span>
      </button>
      {buka && (
        <div role="dialog" aria-label={`Saring ${judul}`} style={{ position: "fixed", top: pos.top, left: pos.left }} className="z-50 w-56 rounded-lg border border-[#DCE3EE] bg-white p-2 text-left normal-case tracking-normal text-[#1B2B4B] shadow-lg">
          {jenis === "teks" ? (
            <input
              autoFocus className={kolom} aria-label={`Kata kunci ${judul}`} placeholder="Ketik untuk menyaring" value={sekarang[0] ?? ""}
              onChange={(e) => { const v = e.target.value; setSaring((s) => ({ ...s, [id]: v === "" ? [] : [v] })); }}
            />
          ) : (
            <ul className="m-0 max-h-56 list-none overflow-y-auto p-0">
              {semua.length === 0 && <li className="px-1 py-1 text-[12.5px] text-[#5B6B84]">Tidak ada pilihan.</li>}
              {semua.map((o) => (
                <li key={o}>
                  <label className="flex min-h-[36px] cursor-pointer items-center gap-2 text-[13px]">
                    <input
                      type="checkbox" className="h-4 w-4 accent-[#1F5FD1]" checked={sekarang.includes(o)}
                      onChange={() => setSaring((s) => { const a = s[id] ?? []; return { ...s, [id]: a.includes(o) ? a.filter((x) => x !== o) : [...a, o] }; })}
                    />
                    {o === "" ? "(kosong)" : o}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={`${tombolKecil} mt-2 w-full`} disabled={!aktif} onClick={() => setSaring((s) => ({ ...s, [id]: [] }))}>Hapus saringan</button>
        </div>
      )}
    </th>
  );
}

/** Baris tabel; bila diberi onBuka, ikut terbuka saat loncat() menembakkan peristiwa "bukabaris" ke id barisnya. */
function BarisTabel({ id, kelas, onBuka, children }: { id?: string; kelas: string; onBuka?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLTableRowElement>(null);
  const bukaRef = useRef(onBuka);
  bukaRef.current = onBuka;
  const ada = !!onBuka;
  useEffect(() => {
    const el = ref.current;
    if (!el || !ada) return;
    const h = () => bukaRef.current?.();
    el.addEventListener("bukabaris", h);
    return () => el.removeEventListener("bukabaris", h);
  }, [ada]);
  return <tr ref={ref} id={id} className={`border-t border-[#EEF2F7] align-top ${kelas}`}>{children}</tr>;
}

export function TabelSaring<T>({ label, kols, data, kunci, bawah, kosong = "Tidak ada baris.", idBaris, kelasBaris, matiBaris, bukaBaris }: {
  label: string; kols: Kol<T>[]; data: T[]; kunci: (r: T) => string; bawah?: (r: T) => ReactNode; kosong?: string;
  /** id elemen baris (untuk tautan loncat dari kartu lain) */
  idBaris?: (r: T) => string | undefined;
  /** kelas tambahan baris, mis. abu-abu bila baris tidak dipakai */
  kelasBaris?: (r: T) => string;
  /** baris tidak dipakai: sel lekat (sticky) ikut berlatar abu-abu agar sama dengan baris */
  matiBaris?: (r: T) => boolean;
  /** dipanggil saat baris diminta terbuka lewat loncat() (peristiwa "bukabaris") */
  bukaBaris?: (r: T) => void;
}) {
  const [saring, setSaring] = useState<NilaiSaring>({});
  const tampil = data.filter((r) => kols.every((k) => lolos(saring, k.id, k.nilai(r), k.jenis === "teks")));
  const adaSaring = kols.some((k) => (saring[k.id] ?? []).some((x) => x.trim() !== ""));
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {adaSaring && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]" role="status">
          <span>Saringan aktif: menampilkan {tampil.length} dari {data.length} baris.</span>
          <button type="button" className={tombolKecil} onClick={() => setSaring({})}>Hapus semua saringan</button>
        </div>
      )}
      <div className="min-w-0 overflow-x-auto">
        <table aria-label={label} className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-[11px] text-[#5B6B84]">
              {kols.map((k) => (
                <ThSaring
                  key={k.id} id={k.id} judul={k.judul} jenis={k.jenis} saring={saring} setSaring={setSaring} lekat={k.lekat}
                  pilihan={k.jenis === "pilih" ? Array.from(new Set(data.map(k.nilai))).sort((a, b) => a.localeCompare(b, "id")) : []}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {tampil.map((r) => (
              <Fragment key={kunci(r)}>
                <BarisTabel id={idBaris?.(r)} kelas={kelasBaris?.(r) ?? ""} onBuka={bukaBaris ? () => bukaBaris(r) : undefined}>
                  {kols.map((k) => <td key={k.id} className={`py-1.5 pr-1.5 ${k.lekat ? (matiBaris?.(r) ? LEKAT_MATI : LEKAT) : ""} ${k.kelasTd ?? ""}`}>{k.sel(r)}</td>)}
                </BarisTabel>
                {bawah?.(r)}
              </Fragment>
            ))}
            {tampil.length === 0 && <tr className="border-t border-[#EEF2F7]"><td colSpan={kols.length} className="py-3 text-[13px] text-[#5B6B84]">{data.length === 0 ? kosong : "Tidak ada baris yang cocok dengan saringan."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
