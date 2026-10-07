"use client";

// app/sigap/pelatihan/kelola/monitorKit.tsx
//
// (8 Okt 2026) Perangkat bersama seluruh sub-tab Monitoring (Pretest & Posttest, Akses, Presensi, Transport Lokal):
//  - <BarFilterMonitoring>: bar filter seragam (Jenis, Kelas, Peran, Status, Cari nama, Reset) -- sama dgn Pretest & Posttest.
//  - <ThKontrol>: judul kolom berfilter -- 🔍 cari, ⋮ urut + filter centang (draft + "Terapkan"), polanya sama dgn tabel
//    tab "Alokasi Petugas"/"Kegiatan Petugas" di halaman Bencana. Popover `position: fixed` supaya tidak terpotong tabel.
//  - useFilterMon / urutkan: state filter (himpunan nilai; header & bar memakai state yang SAMA) + pengurut.

import { useEffect, useRef, useState } from "react";
import { BTN_O, INPUT, TH } from "../../admin/ui";

export type Opsi = string | { nilai: string; label: string; grup?: string };
const nilaiOpsi = (o: Opsi) => (typeof o === "string" ? o : o.nilai);
const labelOpsi = (o: Opsi) => (typeof o === "string" ? o : o.label);

export const OPSI_KELAS: Opsi[] = [1, 2, 3, 4].map((k) => ({ nilai: String(k), label: `Kelas ${k}` }));
export const OPSI_PERAN: Opsi[] = [
  { nilai: "pml", label: "PML" },
  { nilai: "ppl", label: "PPL" },
];
export const OPSI_JENIS: Opsi[] = [
  { nilai: "organik", label: "Organik" },
  { nilai: "mitra", label: "Mitra" },
];

// ---------------------------------------------------------------------------------------------
// State filter bersama
// ---------------------------------------------------------------------------------------------
export type Urut = { kunci: string; arah: "asc" | "desc" } | null;

export function useFilterMon(statusAwal: string[] = []) {
  const [jenis, setJenis] = useState<Set<string>>(new Set());
  const [kelas, setKelas] = useState<Set<string>>(new Set());
  const [peran, setPeran] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Set<string>>(new Set(statusAwal));
  const [kolom, setKolomState] = useState<Record<string, Set<string>>>({});
  const [cari, setCari] = useState("");
  const [urut, setUrut] = useState<Urut>(null);
  const setKolom = (k: string, v: Set<string>) => setKolomState((p) => ({ ...p, [k]: v }));
  const adaKolom = Object.values(kolom).some((s) => s.size > 0);
  const adaFilter = jenis.size > 0 || kelas.size > 0 || peran.size > 0 || status.size > 0 || adaKolom || cari.trim() !== "";
  function reset() {
    setJenis(new Set());
    setKelas(new Set());
    setPeran(new Set());
    setStatus(new Set());
    setKolomState({});
    setCari("");
  }
  return { jenis, setJenis, kelas, setKelas, peran, setPeran, status, setStatus, kolom, setKolom, cari, setCari, urut, setUrut, adaFilter, reset };
}
export type FilterMon = ReturnType<typeof useFilterMon>;

/** Filter dasar yang berlaku di semua monitoring (kecuali `status`, yang artinya beda tiap sub-tab). */
export function lolosDasar(f: FilterMon, p: { nama: string; kelas: number | null; peran: string; jenis_akun?: string | null }): boolean {
  if (f.jenis.size && !f.jenis.has(p.jenis_akun ?? "")) return false;
  if (f.kelas.size && !f.kelas.has(String(p.kelas ?? ""))) return false;
  if (f.peran.size && !f.peran.has(p.peran)) return false;
  const q = f.cari.trim().toLowerCase();
  if (q && !p.nama.toLowerCase().includes(q)) return false;
  return true;
}

/** Urutkan salinan `rows` menurut `urut`; angka dibandingkan sebagai angka, teks menurut abjad Indonesia, kosong selalu di bawah. */
export function urutkan<T>(rows: T[], urut: Urut, ambil: Record<string, (r: T) => string | number | null | undefined>): T[] {
  if (!urut || !ambil[urut.kunci]) return rows;
  const g = ambil[urut.kunci];
  const arah = urut.arah === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = g(a);
    const y = g(b);
    const kx = x === null || x === undefined || x === "";
    const ky = y === null || y === undefined || y === "";
    if (kx && ky) return 0;
    if (kx) return 1;
    if (ky) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * arah;
    return String(x).localeCompare(String(y), "id") * arah;
  });
}

/** Properti `sort` untuk <ThKontrol> dari state Urut. */
export function sortKolom(f: FilterMon, kunci: string) {
  return {
    active: f.urut?.kunci === kunci,
    dir: (f.urut?.kunci === kunci ? f.urut.arah : "asc") as "asc" | "desc",
    onAsc: () => f.setUrut({ kunci, arah: "asc" }),
    onDesc: () => f.setUrut({ kunci, arah: "desc" }),
    onReset: () => f.setUrut(null),
  };
}

/** Nilai terpilih -> teks ringkas untuk keterangan ("Kelas 1, 2"). */
const gabung = (s: Set<string>, opsi: Opsi[]) =>
  [...s].map((v) => opsi.find((o) => nilaiOpsi(o) === v)).map((o, i) => (o ? labelOpsi(o) : [...s][i])).join(", ");

// ---------------------------------------------------------------------------------------------
// Bar filter seragam (sama dgn Pretest & Posttest)
// ---------------------------------------------------------------------------------------------
function PilihSatu({ nilai, opsi, semua, label, onUbah, grup }: { nilai: Set<string>; opsi: Opsi[]; semua: string; label: string; onUbah: (s: Set<string>) => void; grup?: boolean }) {
  const banyak = nilai.size > 1;
  const v = nilai.size === 1 ? [...nilai][0] : banyak ? "__banyak" : "";
  const grupSet = grup ? [...new Set(opsi.map((o) => (typeof o === "string" ? "" : (o.grup ?? ""))))] : [""];
  return (
    <select className={INPUT} value={v} onChange={(e) => onUbah(e.target.value && e.target.value !== "__banyak" ? new Set([e.target.value]) : new Set())} aria-label={label}>
      <option value="">{semua}</option>
      {banyak && (
        <option value="__banyak" disabled>
          {nilai.size} dipilih (dari judul kolom)
        </option>
      )}
      {grupSet.map((g) => {
        const isi = opsi.filter((o) => (typeof o === "string" ? "" : (o.grup ?? "")) === g);
        const daftar = isi.map((o) => (
          <option key={nilaiOpsi(o)} value={nilaiOpsi(o)}>
            {labelOpsi(o)}
          </option>
        ));
        return g ? (
          <optgroup key={g} label={g}>
            {daftar}
          </optgroup>
        ) : (
          daftar
        );
      })}
    </select>
  );
}

export function BarFilterMonitoring({
  f,
  statusOpsi,
  statusSemua = "Semua status",
  statusLabel = "Filter status",
  tanpaJenis,
  total,
  semua,
  catatan,
}: {
  f: FilterMon;
  statusOpsi: Opsi[];
  statusSemua?: string;
  statusLabel?: string;
  tanpaJenis?: boolean;
  total: number;
  semua: number;
  /** Teks tambahan pada keterangan di bawah bar (mis. "kartu tidak ikut filter status"). */
  catatan?: string;
}) {
  const aktif = [
    f.jenis.size ? gabung(f.jenis, OPSI_JENIS) : "",
    f.kelas.size ? gabung(f.kelas, OPSI_KELAS) : "",
    f.peran.size ? gabung(f.peran, OPSI_PERAN) : "",
    f.status.size ? gabung(f.status, statusOpsi) : "",
    ...Object.entries(f.kolom).map(([k, s]) => (s.size ? `${k}: ${[...s].join(", ")}` : "")),
    f.cari.trim() ? `“${f.cari.trim()}”` : "",
  ].filter(Boolean);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-[#E3E8EE]" role="group" aria-label="Filter monitoring">
        <span className="text-[12.5px] font-bold text-[#55657D]">Filter:</span>
        {!tanpaJenis && <PilihSatu nilai={f.jenis} opsi={OPSI_JENIS} semua="Organik & Mitra" label="Filter jenis" onUbah={f.setJenis} />}
        <PilihSatu nilai={f.kelas} opsi={OPSI_KELAS} semua="Semua kelas" label="Filter kelas" onUbah={f.setKelas} />
        <PilihSatu nilai={f.peran} opsi={OPSI_PERAN} semua="Semua peran" label="Filter peran" onUbah={f.setPeran} />
        <PilihSatu nilai={f.status} opsi={statusOpsi} semua={statusSemua} label={statusLabel} onUbah={f.setStatus} grup />
        <input className={`${INPUT} min-w-[150px] flex-1`} placeholder="Cari nama…" value={f.cari} onChange={(e) => f.setCari(e.target.value)} aria-label="Cari nama" />
        {f.adaFilter && (
          <button type="button" className={BTN_O} onClick={f.reset}>
            ✕ Reset filter
          </button>
        )}
      </div>
      {f.adaFilter && (
        <p className="px-1 text-[12.5px] text-[#55657D]" aria-live="polite">
          Tabel di bawah menampilkan <b>{total}</b> dari {semua} peserta ({aktif.join(" · ")}).{catatan ? ` ${catatan}` : ""}
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Judul kolom berfilter (port ThKontrol Bencana, gaya SIGAP)
// ---------------------------------------------------------------------------------------------
type Sort = { active: boolean; dir: "asc" | "desc"; onAsc: () => void; onDesc: () => void; onReset: () => void };

export function ThKontrol({
  label,
  className = "",
  search,
  filter,
  sort,
}: {
  label: string;
  className?: string;
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  filter?: { options: Opsi[]; selected: Set<string>; onApply: (next: Set<string>) => void };
  sort?: Sort;
}) {
  const adaAksi = !!sort || !!filter;
  const [cariTerbuka, setCariTerbuka] = useState(false);
  const [cariPos, setCariPos] = useState<{ top: number; left: number } | null>(null);
  const cariRef = useRef<HTMLDivElement>(null);
  const [terbuka, setTerbuka] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cariTerbuka && !terbuka) return;
    function tutupJikaDiluar(e: Event) {
      const t = e.target;
      if (cariRef.current && t instanceof Node && cariRef.current.contains(t)) return;
      if (popRef.current && t instanceof Node && popRef.current.contains(t)) return;
      setCariTerbuka(false);
      setTerbuka(false);
    }
    document.addEventListener("mousedown", tutupJikaDiluar);
    document.addEventListener("scroll", tutupJikaDiluar, true);
    window.addEventListener("resize", tutupJikaDiluar);
    return () => {
      document.removeEventListener("mousedown", tutupJikaDiluar);
      document.removeEventListener("scroll", tutupJikaDiluar, true);
      window.removeEventListener("resize", tutupJikaDiluar);
    };
  }, [cariTerbuka, terbuka]);

  function bukaCari(e: React.MouseEvent<HTMLButtonElement>) {
    if (cariTerbuka) return setCariTerbuka(false);
    const r = e.currentTarget.getBoundingClientRect();
    setCariPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - 220, window.innerWidth - 228)) });
    setTerbuka(false);
    setCariTerbuka(true);
  }
  function bukaAksi(e: React.MouseEvent<HTMLButtonElement>) {
    if (terbuka) return setTerbuka(false);
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - 240, window.innerWidth - 248)) });
    if (filter) setDraft(new Set(filter.selected));
    setCariTerbuka(false);
    setTerbuka(true);
  }

  const cariAktif = !!search?.value;
  const aksiAktif = (!!filter && filter.selected.size > 0) || !!sort?.active;
  const tombol = (aktif: boolean) => `shrink-0 rounded p-1 text-[11px] leading-none transition ${aktif ? "bg-[#1F6FD1] text-white" : "text-[#8FA0B5] hover:bg-[#E3EDF9] hover:text-[#0F3D7A]"}`;
  const bagian = [!!sort, !!filter].filter(Boolean).length > 1;

  return (
    <th className={`${TH} ${className}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate" title={label}>
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {search && (
            <div ref={cariRef} className="relative">
              <button type="button" title="Cari di kolom ini" aria-label={`Cari di kolom ${label}`} onClick={bukaCari} className={tombol(cariAktif || cariTerbuka)}>
                🔍
              </button>
              {cariTerbuka && cariPos && (
                <div style={{ position: "fixed", top: cariPos.top, left: cariPos.left, width: 220 }} className="z-50 rounded-lg border border-[#CDD5DE] bg-white p-2 text-left font-normal normal-case text-[#14202E] shadow-lg">
                  <input autoFocus value={search.value} onChange={(e) => search.onChange(e.target.value)} placeholder={search.placeholder ?? "Ketik kata kunci..."} className={`${INPUT} w-full !py-1 text-[12px]`} />
                  {search.value && (
                    <button type="button" onClick={() => search.onChange("")} className="mt-1 text-[10.5px] font-semibold text-[#1F6FD1] hover:underline">
                      Hapus pencarian
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {adaAksi && (
            <div ref={popRef} className="relative">
              <button type="button" title="Urutkan / filter kolom ini" aria-label={`Urutkan atau filter kolom ${label}`} onClick={bukaAksi} className={tombol(aksiAktif || terbuka)}>
                ⋮
              </button>
              {terbuka && pos && (
                <div style={{ position: "fixed", top: pos.top, left: pos.left, width: 240 }} className="z-50 flex flex-col gap-2 rounded-lg border border-[#CDD5DE] bg-white p-2 text-left font-normal normal-case text-[#14202E] shadow-lg">
                  {sort && (
                    <div className={bagian ? "border-b border-[#E3E8EE] pb-2" : ""}>
                      {bagian && <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8FA0B5]">Urutkan</p>}
                      <div className="flex flex-col gap-0.5">
                        <button type="button" onClick={sort.onAsc} className={`block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-[#F1F6FD] ${sort.active && sort.dir === "asc" ? "bg-[#E3EDF9] font-semibold text-[#0F3D7A]" : ""}`}>
                          ▲ Urut naik (A-Z / kecil-besar)
                        </button>
                        <button type="button" onClick={sort.onDesc} className={`block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-[#F1F6FD] ${sort.active && sort.dir === "desc" ? "bg-[#E3EDF9] font-semibold text-[#0F3D7A]" : ""}`}>
                          ▼ Urut turun (Z-A / besar-kecil)
                        </button>
                        {sort.active && (
                          <button type="button" onClick={sort.onReset} className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-[#55657D] hover:bg-[#F8FAFC]">
                            ✕ Reset urutan
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {filter && (
                    <div>
                      {bagian && <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8FA0B5]">Filter</p>}
                      <div className="max-h-44 overflow-y-auto">
                        {filter.options.length === 0 && <p className="px-1 py-1 text-[12px] text-[#7B8794]">Tidak ada data.</p>}
                        <div className="flex flex-col gap-1">
                          {filter.options.map((o) => {
                            const v = nilaiOpsi(o);
                            return (
                              <label key={v} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[12px] hover:bg-[#F1F6FD]">
                                <input
                                  type="checkbox"
                                  checked={draft.has(v)}
                                  onChange={() =>
                                    setDraft((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(v)) n.delete(v);
                                      else n.add(v);
                                      return n;
                                    })
                                  }
                                  className="h-3.5 w-3.5 shrink-0 accent-[#1F6FD1]"
                                />
                                <span className="truncate">{labelOpsi(o)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-2 border-t border-[#E3E8EE] pt-2">
                        <button type="button" onClick={() => setDraft(new Set())} className="text-[10.5px] text-[#55657D] hover:underline">
                          Bersihkan
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            filter.onApply(draft);
                            setTerbuka(false);
                          }}
                          className="ml-auto rounded bg-[#1F6FD1] px-2.5 py-1 text-[10.5px] font-semibold text-white hover:bg-[#1A5DB0]"
                        >
                          Terapkan
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </th>
  );
}
