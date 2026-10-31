"use client";

// app/sigap/akses/KepalaKolom.tsx
//
// (31 Okt 2026) Judul kolom berfilter ala spreadsheet: klik judul -> urut A-Z / Z-A, cari nilai, centang nilai yang ditampilkan.
// Logika (urut, saringan bertingkat): lib/saringKolom.ts. Popover memakai posisi "fixed" supaya tidak terpotong tabel yang bisa digulir.
// Tabel yang memakainya: Daftar Mitra Kepka dan Daftar pegawai organik (tab Pengguna).

import { useEffect, useMemo, useRef, useState } from "react";
import { TH } from "../admin/ui";
import { alihNilai, bersihkanKolom, KOSONG, LABEL_KOSONG, nilaiUnik, setBanyakNilai, setUrut, type DefKolom, type StatusKolom } from "@/lib/saringKolom";

const LEBAR = 264;
const MAKS_TAMPIL = 300;

type Props<T> = {
  kolom: DefKolom<T>[];
  id: string;
  rows: T[];
  status: StatusKolom;
  onUbah: (s: StatusKolom) => void;
};

export default function KepalaKolom<T>({ kolom, id, rows, status, onUbah }: Props<T>) {
  const def = kolom.find((k) => k.id === id);
  const [buka, setBuka] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [cari, setCari] = useState("");
  const tombol = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  const disaring = (status.sembunyi[id]?.length ?? 0) > 0;
  const arah = status.urut?.id === id ? status.urut.arah : null;

  // daftar nilai hanya dihitung ketika popover terbuka
  const unik = useMemo(() => (buka ? nilaiUnik(rows, kolom, status, id) : []), [buka, rows, kolom, status, id]);

  useEffect(() => {
    if (!buka) return;
    const tutup = () => setBuka(false);
    const klik = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popover.current?.contains(t) || tombol.current?.contains(t)) return;
      tutup();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && tutup();
    const gulir = (e: Event) => {
      if (popover.current?.contains(e.target as Node)) return;
      tutup();
    };
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", gulir, true);
    window.addEventListener("resize", tutup);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", gulir, true);
      window.removeEventListener("resize", tutup);
    };
  }, [buka]);

  if (!def) return <th className={TH} />;

  function alih() {
    if (buka) {
      setBuka(false);
      return;
    }
    const r = tombol.current?.getBoundingClientRect();
    if (r) setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - LEBAR - 8)), y: r.bottom + 4 });
    setCari("");
    setBuka(true);
  }

  const sembunyi = status.sembunyi[id] ?? [];
  const q = cari.trim().toLowerCase();
  const terlihat = unik.filter((u) => (u.nilai === KOSONG ? LABEL_KOSONG : u.nilai).toLowerCase().includes(q));
  const dipotong = terlihat.length > MAKS_TAMPIL;
  const tampil = terlihat.slice(0, MAKS_TAMPIL);
  const semuaDicentang = terlihat.length > 0 && terlihat.every((u) => !sembunyi.includes(u.nilai));
  const sebagian = !semuaDicentang && terlihat.some((u) => !sembunyi.includes(u.nilai));

  return (
    <th className={TH} aria-sort={arah === "naik" ? "ascending" : arah === "turun" ? "descending" : "none"}>
      <button
        ref={tombol}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={buka}
        aria-label={`Saring dan urutkan kolom ${def.label}`}
        onClick={alih}
        className={`-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-left font-semibold transition hover:bg-[#E6EEFB] ${disaring || arah ? "bg-[#E6EEFB] text-[#1F5FD1]" : ""}`}
      >
        <span>{def.label}</span>
        {arah === "naik" && <span aria-hidden>▲</span>}
        {arah === "turun" && <span aria-hidden>▼</span>}
        {disaring ? (
          <svg aria-hidden width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2h14l-5.4 6.4V14l-3.2-1.8V8.4L1 2z" />
          </svg>
        ) : (
          <span aria-hidden className="text-[10px] opacity-60">
            ▾
          </span>
        )}
      </button>

      {buka && (
        <div
          ref={popover}
          role="dialog"
          aria-label={`Saringan ${def.label}`}
          style={{ position: "fixed", left: pos.x, top: pos.y, width: LEBAR }}
          className="z-[60] space-y-2 rounded-xl border border-[#CBD6E6] bg-white p-2.5 text-left text-[12.5px] font-normal text-[#1B2B4B] shadow-[0_12px_32px_rgba(15,42,82,.18)]"
        >
          <div className="flex gap-1.5">
            <button type="button" className={`flex-1 rounded-lg border px-2 py-1.5 font-semibold transition ${arah === "naik" ? "border-[#1F5FD1] bg-[#E6EEFB] text-[#1F5FD1]" : "border-[#CBD6E6] hover:bg-[#F5F8FE]"}`} onClick={() => onUbah(setUrut(status, id, arah === "naik" ? null : "naik"))}>
              ▲ Urut naik
            </button>
            <button type="button" className={`flex-1 rounded-lg border px-2 py-1.5 font-semibold transition ${arah === "turun" ? "border-[#1F5FD1] bg-[#E6EEFB] text-[#1F5FD1]" : "border-[#CBD6E6] hover:bg-[#F5F8FE]"}`} onClick={() => onUbah(setUrut(status, id, arah === "turun" ? null : "turun"))}>
              ▼ Urut turun
            </button>
          </div>
          <input
            aria-label={`Cari nilai ${def.label}`}
            autoFocus
            className="w-full rounded-lg border border-[#DDE6F3] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#1F5FD1] focus:ring-2 focus:ring-[#1F5FD1]/15"
            placeholder="Cari…"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
          <label className="flex cursor-pointer items-center gap-2 border-b border-[#DDE6F3] pb-1.5 font-semibold">
            <input
              type="checkbox"
              checked={semuaDicentang}
              ref={(el) => {
                if (el) el.indeterminate = sebagian;
              }}
              onChange={() => onUbah(setBanyakNilai(status, id, terlihat.map((u) => u.nilai), !semuaDicentang))}
            />
            {q ? "(Pilih semua hasil pencarian)" : "(Pilih semua)"}
          </label>
          <ul className="max-h-[220px] space-y-0.5 overflow-y-auto pr-1">
            {tampil.map((u) => (
              <li key={u.nilai === KOSONG ? "__kosong" : u.nilai}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-[#F5F8FE]">
                  <input type="checkbox" checked={!sembunyi.includes(u.nilai)} onChange={() => onUbah(alihNilai(status, id, u.nilai))} />
                  <span className={`min-w-0 flex-1 truncate ${u.nilai === KOSONG ? "italic text-[#6B7A90]" : ""}`}>{u.nilai === KOSONG ? LABEL_KOSONG : u.nilai}</span>
                  <span className="text-[11px] text-[#8A97AB]">{u.jumlah}</span>
                </label>
              </li>
            ))}
            {tampil.length === 0 && <li className="px-1 py-1 text-[#6B7A90]">Tidak ada nilai yang cocok.</li>}
          </ul>
          {dipotong && <p className="text-[11px] text-[#6B7A90]">Menampilkan {MAKS_TAMPIL} nilai pertama; persempit dengan kotak cari.</p>}
          {disaring && (
            <button type="button" className="w-full rounded-lg border border-[#CBD6E6] px-2 py-1.5 font-semibold text-[#B42329] transition hover:bg-[#FDE8E8]" onClick={() => onUbah(bersihkanKolom(status, id))}>
              Hapus saringan kolom ini
            </button>
          )}
        </div>
      )}
    </th>
  );
}
