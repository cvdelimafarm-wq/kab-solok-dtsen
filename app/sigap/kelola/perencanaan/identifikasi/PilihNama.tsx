"use client";

// app/sigap/kelola/perencanaan/identifikasi/PilihNama.tsx
//
// (2 Nov 2026, permintaan Iqbal: "seluruh nama harus dipilih lewat dropdown") Pemilih nama dengan kolom cari: ketuk, pilih dari daftar (pegawai organik atau mitra),
// atau "Pakai nama lain" bila tidak ada di daftar. Nama terpilih tampil sebagai kotak dengan tombol Ganti. Tanpa daftar (belum termuat, atau SQL belum dijalankan)
// = kolom ketik bebas seperti semula. Logika saring dan cek di lib/keu/pilihNama.ts. Hanya tampilan.

import { useEffect, useMemo, useRef, useState } from "react";
import { kolom, tombolKecil } from "@/app/sigap/keu-ui";
import { adaDiDaftar, saringCalon, sudahTerpakai, type CalonNama } from "@/lib/keu/pilihNama";

const pangkas = (s: string): string => s.replace(/\s+/g, " ").trim();
const MAKS_TAMPIL = 40;

export default function PilihNama({ nilai, onPilih, calon, terpakai, mati, ariaLabel, placeholder }: {
  nilai: string; onPilih: (nama: string) => void; calon: readonly CalonNama[] | null; terpakai?: ReadonlySet<string>; mati: boolean; ariaLabel: string; placeholder?: string;
}) {
  const [kata, setKata] = useState("");
  const [buka, setBuka] = useState(false);
  const kotak = useRef<HTMLDivElement>(null);
  const punya = !!calon && calon.length > 0;
  const hasil = useMemo(() => saringCalon(calon ?? [], kata, MAKS_TAMPIL), [calon, kata]);
  useEffect(() => {
    if (!buka) return;
    const tutup = (e: PointerEvent) => { if (!kotak.current?.contains(e.target as Node)) setBuka(false); };
    document.addEventListener("pointerdown", tutup);
    return () => document.removeEventListener("pointerdown", tutup);
  }, [buka]);

  // tanpa daftar: ketik bebas seperti semula
  if (!punya) {
    return <input aria-label={ariaLabel} className={kolom} maxLength={120} disabled={mati} value={nilai} placeholder={placeholder ?? ""} onChange={(e) => onPilih(e.target.value)} />;
  }
  // nama sudah terisi: tampil sebagai kotak + Ganti
  if (nilai !== "") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <div aria-label={ariaLabel} className={`${kolom} flex min-w-0 flex-1 items-center gap-2`}>
          <span className="min-w-0 truncate">{nilai}</span>
          {!adaDiDaftar(calon, nilai) && <span className="shrink-0 rounded-full bg-[#EEF2F7] px-1.5 text-[11px] font-semibold text-[#44546F]">di luar daftar</span>}
        </div>
        <button type="button" className={tombolKecil} disabled={mati} onClick={() => { onPilih(""); setKata(""); setBuka(true); }}>Ganti</button>
      </div>
    );
  }
  const bersih = pangkas(kata);
  return (
    <div ref={kotak} className="relative min-w-0">
      <input
        role="combobox" aria-expanded={buka} aria-label={ariaLabel} className={kolom} maxLength={120} disabled={mati} value={kata}
        placeholder={placeholder ?? "Cari atau pilih nama…"}
        onFocus={() => setBuka(true)} onChange={(e) => { setKata(e.target.value); setBuka(true); }} onKeyDown={(e) => { if (e.key === "Escape") setBuka(false); }}
      />
      {buka && !mati && (
        <ul role="listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-60 list-none overflow-y-auto rounded-lg border border-[#DCE3EE] bg-white p-1 shadow-lg">
          {hasil.map((c) => {
            const pakai = !!terpakai && sudahTerpakai(terpakai, c.nama);
            return (
              <li key={`${c.nama}|${c.ket}`}>
                <button type="button" disabled={pakai} onClick={() => { onPilih(c.nama); setKata(""); setBuka(false); }}
                  className="flex min-h-[40px] w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13.5px] text-[#1B2B4B] hover:bg-[#EEF3FB] disabled:text-[#8A97AD]">
                  <span className="min-w-0 truncate">{c.nama}</span>
                  <span className="shrink-0 text-[11.5px] text-[#5B6B84]">{pakai ? "sudah dipilih" : c.ket}</span>
                </button>
              </li>
            );
          })}
          {hasil.length === 0 && <li className="px-2 py-2 text-[12.5px] text-[#5B6B84]">Tidak ada yang cocok{bersih ? ` dengan “${bersih}”` : ""}.</li>}
          {bersih === "" && calon.length > hasil.length && <li className="px-2 py-1.5 text-[11.5px] text-[#5B6B84]">Menampilkan {hasil.length} dari {calon.length}. Ketik untuk mencari.</li>}
          {bersih !== "" && !adaDiDaftar(calon, bersih) && (
            <li>
              <button type="button" onClick={() => { onPilih(bersih); setKata(""); setBuka(false); }}
                className="flex min-h-[40px] w-full items-center rounded-md border-t border-[#EEF1F6] px-2 py-1.5 text-left text-[13.5px] font-semibold text-[#1F5FD1] hover:bg-[#EEF3FB]">
                Pakai nama lain: “{bersih}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
