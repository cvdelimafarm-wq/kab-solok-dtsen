"use client";

// app/sigap/kelola/perencanaan/identifikasi/PilihNama.tsx
//
// (2 Nov 2026, permintaan Iqbal: seluruh nama dipilih lewat dropdown yang bisa diketik dan memunculkan saran) Kolom isian dengan saran (combobox): ketuk untuk melihat
// daftar (pegawai organik atau mitra), ketik untuk menyaring, ketuk saran untuk memilih; atau "Pakai nama lain" bila tidak ada di daftar. Nama terpilih tetap tampil di kolom
// dan bisa langsung diketik ulang; ✕ mengosongkan. Tanpa daftar (belum termuat, atau SQL belum dijalankan) = kolom ketik bebas seperti semula.
// Logika saring dan cek di lib/keu/pilihNama.ts. Hanya tampilan.

import { useEffect, useMemo, useRef, useState } from "react";
import { kolom, tombolKecil } from "@/app/sigap/keu-ui";
import { adaDiDaftar, saringCalon, sudahTerpakai, type CalonNama } from "@/lib/keu/pilihNama";

const pangkas = (s: string): string => s.replace(/\s+/g, " ").trim();
const MAKS_TAMPIL = 40;

export default function PilihNama({ nilai, akun, onPilih, calon, terpakai, mati, ariaLabel, placeholder }: {
  nilai: string; akun?: number | null; onPilih: (nama: string, akun?: number) => void; calon: readonly CalonNama[] | null; terpakai?: ReadonlySet<string>; mati: boolean; ariaLabel: string; placeholder?: string;
}) {
  const [kata, setKata] = useState("");
  const [buka, setBuka] = useState(false);
  const [aktif, setAktif] = useState(-1); // saran yang disorot dengan panah atas/bawah
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

  const bersih = pangkas(kata);
  const bisaNamaLain = bersih !== "" && !adaDiDaftar(calon, bersih);
  const pilih = (nama: string, idAkun?: number) => { onPilih(nama, idAkun); setKata(""); setBuka(false); setAktif(-1); };
  const dapatDipilih = (c: CalonNama) => !(terpakai && sudahTerpakai(terpakai, c.nama));
  const jumlahBaris = hasil.length + (bisaNamaLain ? 1 : 0);
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setBuka(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setBuka(true); setAktif((a) => (jumlahBaris === 0 ? -1 : (a + 1) % jumlahBaris)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setAktif((a) => (jumlahBaris === 0 ? -1 : (a <= 0 ? jumlahBaris - 1 : a - 1))); return; }
    if (e.key === "Enter" && buka) {
      e.preventDefault();
      const n = aktif >= 0 ? aktif : (hasil.length === 1 && bersih !== "" ? 0 : -1);
      if (n >= 0 && n < hasil.length) { if (dapatDipilih(hasil[n])) pilih(hasil[n].nama, hasil[n].akun); }
      else if (n === hasil.length && bisaNamaLain) pilih(bersih);
    }
  };
  return (
    <div ref={kotak} className="relative min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <input
          role="combobox" aria-expanded={buka} aria-autocomplete="list" aria-label={ariaLabel} className={`${kolom} min-w-0 flex-1`} maxLength={120} disabled={mati}
          value={buka ? kata : nilai} placeholder={buka && nilai !== "" ? nilai : (placeholder ?? "Ketik untuk mencari nama…")} autoComplete="off"
          onFocus={() => { setKata(""); setBuka(true); setAktif(-1); }}
          onChange={(e) => { setKata(e.target.value); setBuka(true); setAktif(-1); }}
          onKeyDown={onKey}
        />
        {nilai !== "" && !mati && <button type="button" aria-label={`Kosongkan ${ariaLabel}`} className={tombolKecil} onClick={() => { onPilih("", undefined); setKata(""); setBuka(false); }}>✕</button>}
      </div>
      {nilai !== "" && !buka && (
        akun
          ? <p className="m-0 mt-0.5 text-[11.5px] font-semibold text-[#1B7A3E]">✓ Tertaut ke akun SIGAP</p>
          : adaDiDaftar(calon, nilai)
            ? <p className="m-0 mt-0.5 text-[11.5px] text-[#8A6200]">Belum tertaut ke akun. Pilih ulang dari daftar, atau gunakan tombol &ldquo;Tautkan otomatis&rdquo;.</p>
            : <p className="m-0 mt-0.5 text-[11.5px] text-[#5B6B84]">Nama di luar daftar (tidak tertaut ke akun).</p>
      )}
      {buka && !mati && (
        <ul role="listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-64 min-w-[260px] list-none overflow-y-auto rounded-lg border border-[#DCE3EE] bg-white p-1 shadow-lg">
          {hasil.map((c, n) => {
            const pakai = !dapatDipilih(c);
            return (
              <li key={`${c.nama}|${c.ket}`} role="option" aria-selected={n === aktif}>
                <button type="button" disabled={pakai} onMouseDown={(e) => e.preventDefault()} onClick={() => pilih(c.nama, c.akun)}
                  className={`flex min-h-[40px] w-full flex-col items-start justify-center rounded-md px-2 py-1 text-left text-[13.5px] text-[#1B2B4B] hover:bg-[#EEF3FB] disabled:text-[#8A97AD] ${n === aktif ? "bg-[#EEF3FB]" : ""}`}>
                  <span className="min-w-0 max-w-full break-words leading-snug">{c.nama}</span>
                  {(pakai || c.ket) && <span className="text-[11.5px] leading-tight text-[#5B6B84]">{pakai ? "sudah dipilih" : c.ket}</span>}
                </button>
              </li>
            );
          })}
          {hasil.length === 0 && <li className="px-2 py-2 text-[12.5px] text-[#5B6B84]">Tidak ada yang cocok{bersih ? ` dengan “${bersih}”` : ""}.</li>}
          {bersih === "" && calon.length > hasil.length && <li className="px-2 py-1.5 text-[11.5px] text-[#5B6B84]">Menampilkan {hasil.length} dari {calon.length}. Ketik untuk mencari.</li>}
          {bisaNamaLain && (
            <li role="option" aria-selected={aktif === hasil.length}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pilih(bersih)}
                className={`flex min-h-[40px] w-full items-center rounded-md border-t border-[#EEF1F6] px-2 py-1.5 text-left text-[13.5px] font-semibold text-[#1F5FD1] hover:bg-[#EEF3FB] ${aktif === hasil.length ? "bg-[#EEF3FB]" : ""}`}>
                Pakai nama lain: “{bersih}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
