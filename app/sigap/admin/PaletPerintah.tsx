"use client";

// app/sigap/admin/PaletPerintah.tsx
//
// (6 Okt 2026) Palet perintah (Ctrl/Cmd+K) untuk shell layar lebar SIGAP -- saran desain backoffice
// widescreen dari user: daftar menu + kegiatan, ketik untuk menyaring, ↑/↓ memilih, Enter/klik pindah,
// Esc menutup.

import { useEffect, useMemo, useRef, useState } from "react";

export type ItemPalet = { id: string; grup: string; label: string; ket?: string; jalankan: () => void };

export default function PaletPerintah({ buka, onTutup, item }: { buka: boolean; onTutup: () => void; item: ItemPalet[] }) {
  const [q, setQ] = useState("");
  const [pilih, setPilih] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (buka) {
      setQ("");
      setPilih(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [buka]);

  const hasil = useMemo(() => {
    const kata = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (kata.length === 0) return item;
    return item.filter((x) => {
      const teks = `${x.label} ${x.ket ?? ""} ${x.grup}`.toLowerCase();
      return kata.every((k) => teks.includes(k));
    });
  }, [q, item]);

  useEffect(() => {
    setPilih(0);
  }, [q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${pilih}"]`)?.scrollIntoView({ block: "nearest" });
  }, [pilih]);

  if (!buka) return null;

  function jalankan(x: ItemPalet | undefined) {
    if (!x) return;
    onTutup();
    x.jalankan();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onTutup();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setPilih((p) => Math.min(hasil.length - 1, p + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPilih((p) => Math.max(0, p - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      jalankan(hasil[pilih]);
    }
  }

  let grupLalu = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-[#13213A]/30 px-4 pt-[12vh]" onMouseDown={onTutup}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palet perintah"
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-[#E3E8F0] bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-2 border-b border-[#E3E8F0] px-3 py-2.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B7890" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari kegiatan, menu…"
            className="flex-1 bg-transparent text-[13px] text-[#13213A] outline-none placeholder:text-[#8592A8]"
            role="combobox"
            aria-expanded="true"
            aria-controls="palet-daftar"
            aria-activedescendant={hasil[pilih] ? `palet-${hasil[pilih].id}` : undefined}
          />
          <kbd className="rounded border border-[#E3E8F0] px-1.5 text-[10.5px] text-[#6B7890]">Esc</kbd>
        </div>
        <ul id="palet-daftar" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
          {hasil.length === 0 && <li className="px-4 py-6 text-center text-[12.5px] text-[#6B7890]">Tidak ada yang cocok dengan “{q}”.</li>}
          {hasil.map((x, i) => {
            const judulGrup = x.grup !== grupLalu ? x.grup : null;
            grupLalu = x.grup;
            return (
              <li key={x.id}>
                {judulGrup && <p className="px-4 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-[#8592A8]">{judulGrup}</p>}
                <button
                  type="button"
                  id={`palet-${x.id}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === pilih}
                  onMouseEnter={() => setPilih(i)}
                  onClick={() => jalankan(x)}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-[12.5px] ${i === pilih ? "bg-[#E8EEF8] text-[#0F3D7A]" : "text-[#13213A]"}`}
                >
                  <span className="min-w-0 flex-1 truncate font-semibold">{x.label}</span>
                  {x.ket && <span className="shrink-0 text-[11px] text-[#6B7890]">{x.ket}</span>}
                  {i === pilih && <span className="shrink-0 text-[11px] text-[#6B7890]">↵</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
