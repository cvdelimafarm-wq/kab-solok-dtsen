"use client";

// app/sigap/admin/KepalaKolom.tsx
//
// (28 Okt 2026) Judul kolom tabel standar SIGAP: label + tiga tombol kecil -- cari (⌕), urut (⇅), dan filter nilai (▾). Dapat dipakai ulang di tabel admin mana pun
// dengan lib/sigapTabelKolom.ts. Panel dibuka dengan posisi tetap (fixed) supaya tidak terpotong tabel yang bisa digulir; klik di luar menutup.

import { useState } from "react";
import { putarUrut, type Saring, type Urut } from "@/lib/sigapTabelKolom";

type Props<K extends string> = {
  id: K;
  label: string;
  saring: Saring<K>;
  setSaring: (s: Saring<K>) => void;
  urut: Urut<K>;
  setUrut: (u: Urut<K>) => void;
  /** nilai berbeda untuk daftar filter; dipanggil hanya saat panel filter dibuka */
  opsi: () => string[];
};

export default function KepalaKolom<K extends string>({ id, label, saring, setSaring, urut, setUrut, opsi }: Props<K>) {
  const [buka, setBuka] = useState<null | { jenis: "q" | "f"; x: number; y: number }>(null);
  const f = saring[id] ?? { q: "", pilih: [] };
  const set = (x: { q: string; pilih: string[] }) => setSaring({ ...saring, [id]: x });
  const aktifQ = f.q.trim() !== "";
  const aktifF = f.pilih.length > 0;
  const aktifU = urut?.kolom === id;
  const ikon = (on: boolean) =>
    `inline-flex h-[20px] w-[20px] items-center justify-center rounded text-[12px] leading-none ${on ? "bg-[#1F5FD1] text-white" : "text-[#5B6B84] hover:bg-[#DCE6F5]"}`;
  const bukaPanel = (jenis: "q" | "f", el: HTMLElement) => {
    if (buka?.jenis === jenis) return setBuka(null);
    const r = el.getBoundingClientRect();
    const lebar = jenis === "f" ? 240 : 224;
    setBuka({ jenis, x: Math.max(8, Math.min(r.left, window.innerWidth - lebar - 8)), y: r.bottom + 4 });
  };
  const daftar = buka?.jenis === "f" ? opsi().slice(0, 80) : [];
  return (
    <span className="flex w-full min-w-[9rem] items-center justify-between gap-3">
      <span>
        {label}
        {aktifU ? (urut?.arah === "naik" ? " ▲" : " ▼") : ""}
      </span>
      <span className="inline-flex items-center gap-0.5">
        <button type="button" aria-label={`Cari di kolom ${label}`} title={`Cari di kolom ${label}`} className={ikon(aktifQ)} onClick={(e) => bukaPanel("q", e.currentTarget)}>
          ⌕
        </button>
        <button type="button" aria-label={`Urutkan kolom ${label}`} title={`Urutkan kolom ${label}`} className={ikon(aktifU)} onClick={() => setUrut(putarUrut(urut, id))}>
          ⇅
        </button>
        <button type="button" aria-label={`Filter kolom ${label}`} title={`Filter kolom ${label}`} className={ikon(aktifF)} onClick={(e) => bukaPanel("f", e.currentTarget)}>
          ▾
        </button>
      </span>
      {buka && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setBuka(null)} aria-hidden />
          {buka.jenis === "q" ? (
            <span className="fixed z-50 flex w-56 flex-col gap-1.5 rounded-lg border border-[#C5D0E2] bg-white p-2 text-left font-normal shadow-lg" style={{ left: buka.x, top: buka.y }}>
              <input
                autoFocus
                aria-label="Cari"
                placeholder={`Cari di ${label}…`}
                value={f.q}
                onChange={(e) => set({ ...f, q: e.target.value })}
                onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setBuka(null)}
                className="h-8 rounded border border-[#C5D0E2] px-2 text-[12.5px] text-[#1B2B4B]"
              />
              <button type="button" className="rounded border border-[#CBD6E6] px-2 py-1 text-[12px] font-semibold text-[#1B2B4B] hover:bg-[#F5F8FE]" onClick={() => (set({ ...f, q: "" }), setBuka(null))}>
                Hapus pencarian
              </button>
            </span>
          ) : (
            <span className="fixed z-50 flex max-h-64 w-60 flex-col gap-1 overflow-auto rounded-lg border border-[#C5D0E2] bg-white p-2 text-left font-normal shadow-lg" style={{ left: buka.x, top: buka.y }}>
              {daftar.length === 0 && <span className="text-[12.5px] text-[#7B8794]">Tidak ada nilai.</span>}
              {daftar.map((o) => {
                const on = f.pilih.includes(o);
                return (
                  <label key={o} className="flex min-h-[26px] cursor-pointer items-center gap-2 text-[12.5px] text-[#1B2B4B]">
                    <input type="checkbox" checked={on} onChange={() => set({ ...f, pilih: on ? f.pilih.filter((x) => x !== o) : [...f.pilih, o] })} />
                    <span className="truncate">{o === "" ? "(kosong)" : o}</span>
                  </label>
                );
              })}
              <button type="button" className="rounded border border-[#CBD6E6] px-2 py-1 text-[12px] font-semibold text-[#1B2B4B] hover:bg-[#F5F8FE]" onClick={() => (set({ ...f, pilih: [] }), setBuka(null))}>
                Hapus filter
              </button>
            </span>
          )}
        </>
      )}
    </span>
  );
}
