"use client";

// app/penyisiran/_shared/excel-table.tsx
//
// Komponen & hook BERSAMA utk tabel dgn header "layaknya fitur Excel" --
// klik nama kolom utk urutkan (▲/▼), klik ikon "▾" di kanan nama kolom utk
// buka dropdown filter (checkbox per nilai unik, ada kotak cari utk
// mempersempit daftar checkbox, tombol "Pilih Semua"/"Kosongkan"). Dipakai
// di lebih dari satu tabel (Master Petugas, Identifikasi Wilayah Sampel
// SLS di Perencanaan Lapangan) makanya ditaruh di sini, bukan diulang di
// tiap file -- folder "_shared" (prefix underscore) SENGAJA dipakai supaya
// Next.js App Router TIDAK menganggapnya sbg route (lihat konvensi private
// folder Next.js), murni tempat komponen dibagi antar tab.
//
// Cara pakai (lihat master-petugas.tsx / perencanaan-lapangan.tsx):
//   const kolom = useMemo(() => [
//     { key: "nama", label: "Nama", getValue: (r) => r.nama },
//     ...
//   ], []);
//   const tabel = useExcelTable(dataMentah, kolom, { key: "skor", dir: "desc" });
//   ...
//   <ExcelTh label="Nama" colKey="nama" values={tabel.uniqueValues.nama}
//     sortKey={tabel.sortKey} sortDir={tabel.sortDir} onSort={tabel.toggleSort}
//     activeFilter={tabel.filters.nama} onFilterChange={tabel.setColumnFilter} />
//   ...
//   {tabel.rows.map((r) => ...)}

import { useEffect, useMemo, useRef, useState } from "react";

export type SortDir = "asc" | "desc";

export interface ExcelColumn<T> {
  key: string;
  label: string;
  getValue: (row: T) => string | number | boolean | null | undefined;
}

type FilterState = Record<string, Set<string> | null>;

const KOSONG_LABEL = "(Kosong)";

function toDisplay(v: string | number | boolean | null | undefined): string {
  if (v == null || v === "") return KOSONG_LABEL;
  return String(v);
}

export function useExcelTable<T>(
  rows: T[],
  columns: ExcelColumn<T>[],
  initialSort?: { key: string; dir: SortDir }
) {
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(initialSort?.dir ?? "asc");
  const [filters, setFilters] = useState<FilterState>({});

  // Nilai unik per kolom dihitung dari SELURUH baris sumber (bukan hasil
  // saring kolom lain) -- persis spt Excel Autofilter: daftar checkbox di
  // satu kolom tidak berubah-ubah gara2 kolom lain sedang difilter.
  const uniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      const set = new Set<string>();
      for (const r of rows) set.add(toDisplay(col.getValue(r)));
      map[col.key] = Array.from(set).sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
    }
    return map;
  }, [rows, columns]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function setColumnFilter(key: string, values: Set<string> | null) {
    setFilters((prev) => ({ ...prev, [key]: values }));
  }

  function resetFilters() {
    setFilters({});
  }

  const adaFilterAktif = columns.some((c) => {
    const active = filters[c.key];
    return !!active && active.size < (uniqueValues[c.key]?.length ?? 0);
  });

  const rowsTertampil = useMemo(() => {
    let out = rows.filter((r) =>
      columns.every((col) => {
        const active = filters[col.key];
        if (!active) return true; // kolom ini belum difilter -> tampilkan semua
        return active.has(toDisplay(col.getValue(r)));
      })
    );
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) {
        out = out.slice().sort((a, b) => {
          const av = col.getValue(a);
          const bv = col.getValue(b);
          let cmp: number;
          if (typeof av === "number" && typeof bv === "number") {
            cmp = av - bv;
          } else {
            const as = av == null ? "" : String(av);
            const bs = bv == null ? "" : String(bv);
            cmp = as.localeCompare(bs, "id", { numeric: true });
          }
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, columns, filters, sortKey, sortDir]);

  return {
    sortKey,
    sortDir,
    filters,
    uniqueValues,
    toggleSort,
    setColumnFilter,
    resetFilters,
    adaFilterAktif,
    rows: rowsTertampil,
  };
}

export function ExcelTh({
  label,
  colKey,
  sortKey,
  sortDir,
  onSort,
  values,
  activeFilter,
  onFilterChange,
  align = "left",
  className,
}: {
  label: string;
  colKey: string;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
  values: string[];
  activeFilter: Set<string> | null | undefined;
  onFilterChange: (key: string, values: Set<string> | null) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cari, setCari] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = activeFilter ?? new Set(values);
  const isFiltered = !!activeFilter && activeFilter.size < values.length;
  const valuesTertampil = cari.trim()
    ? values.filter((v) => v.toLowerCase().includes(cari.trim().toLowerCase()))
    : values;

  function toggleValue(v: string) {
    const next = new Set(activeFilter ?? values);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onFilterChange(colKey, next.size === values.length ? null : next);
  }

  return (
    <th className={`relative select-none px-2 py-2 ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}>
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {align === "right" && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`rounded px-1 text-[10px] normal-case ${isFiltered ? "bg-navy-700 text-white" : "text-ink/40 hover:text-navy-700"}`}
            title="Filter"
          >
            ▾
          </button>
        )}
        <button type="button" onClick={() => onSort(colKey)} className="inline-flex items-center gap-0.5 hover:text-navy-900">
          {label}
          {sortKey === colKey && <span>{sortDir === "asc" ? " ▲" : " ▼"}</span>}
        </button>
        {align === "left" && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`rounded px-1 text-[10px] normal-case ${isFiltered ? "bg-navy-700 text-white" : "text-ink/40 hover:text-navy-700"}`}
            title="Filter"
          >
            ▾
          </button>
        )}
      </div>
      {open && (
        <div
          ref={ref}
          className={`absolute top-full z-20 mt-1 w-56 rounded-md border border-line bg-white p-2 text-left text-[11px] font-normal normal-case tracking-normal text-ink shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <input
            type="text"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nilai..."
            className="mb-1.5 w-full rounded border border-line px-1.5 py-1 text-[11px]"
          />
          <div className="mb-1 flex justify-between text-[10px]">
            <button type="button" className="text-navy-700 hover:underline" onClick={() => onFilterChange(colKey, null)}>
              Pilih Semua
            </button>
            <button type="button" className="text-navy-700 hover:underline" onClick={() => onFilterChange(colKey, new Set())}>
              Kosongkan
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto border-t border-line pt-1">
            {valuesTertampil.map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-1.5 py-0.5 hover:bg-paper/60">
                <input type="checkbox" checked={selected.has(v)} onChange={() => toggleValue(v)} />
                <span className="truncate">{v}</span>
              </label>
            ))}
            {valuesTertampil.length === 0 && <p className="py-1 text-center text-ink/40">Tidak ada.</p>}
          </div>
        </div>
      )}
    </th>
  );
}
