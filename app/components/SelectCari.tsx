"use client";

// app/components/SelectCari.tsx
//
// (6 Nov 2026) Dropdown BISA DICARI pengganti <select> bawaan di seluruh aplikasi (permintaan user: "Searchable Dropdown" untuk semua dropdown).
//
// Cara pakai SAMA dengan <select>: ganti `<select` -> `<SelectCari` dan `</select>` -> `</SelectCari>`; value, onChange((e) => e.target.value),
// className, disabled, aria-label, id, title, required, <option> (termasuk disabled), <optgroup> dan peta (.map) tetap berlaku. Tidak perlu
// mengubah logika halaman. Batasan: <option>/<optgroup> harus ditulis langsung (boleh di dalam Fragment, array, atau hasil pemanggilan fungsi);
// komponen pembungkus <option> (mis. <OpsiKecamatan />) tidak terbaca -- tulis opsinya sebagai elemen biasa.
//
//  - Pilihan >= AMBANG_CARI (lib/pilihCari.ts): ada kotak cari (abaikan huruf besar/kecil & aksen, tiap kata harus cocok, urutan bebas).
//    Pilihan lebih sedikit: daftar biasa tanpa kotak cari.
//  - Layar lebar: daftar mengambang di bawah tombol (atau di atasnya bila ruang bawah kurang); tutup dengan Esc / klik di luar.
//  - Layar HP (< 640px): panel di bagian atas layar yang kelihatan (tidak tertutup papan ketik), berlatar gelap; Back HP menutup panel
//    (useTutupDenganBack, lapisan -- aturan Penjaga Back).
//  - Papan ketik: ↓ ↑ Home End Enter Esc; di tombol: ↓ ↑ Enter Spasi membuka daftar.
//  - Lebar tombol mengikuti label-label terpanjang (seperti <select>), tidak berubah-ubah ketika pilihan berganti.
//  - Panel dirender lewat portal ke <body> dengan z-index lebih tinggi dari semua lapisan lain (z-[10040] tertinggi saat ini), jadi tidak terpotong
//    overflow/transform induk dan tidak tertutup modal. Latar gelap mode HP hanya menahan sentuhan sampai ditutup (ketuk latar / Tutup / Back).
//  - `required`: disertakan input tersembunyi supaya validasi bawaan <form> tetap menolak isian kosong.

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import {
  geserAktif,
  indeksAwal,
  indeksPertamaAktif,
  labelPenentuLebar,
  labelTerpilih,
  perluKotakCari,
  potongTampil,
  saringPilihan,
  type OpsiPilih,
} from "@/lib/pilihCari";

/* ---------- membaca <option> dari children ---------- */

function teksDari(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(teksDari).join("");
  if (isValidElement(node)) return teksDari((node.props as { children?: ReactNode }).children);
  return "";
}

type PropsOpsi = { value?: string | number | readonly string[]; disabled?: boolean; hidden?: boolean; label?: string; children?: ReactNode };

function kumpulkan(node: ReactNode, kelompok: string | undefined, keluar: OpsiPilih[]) {
  Children.forEach(node, (c) => {
    if (!isValidElement(c)) return;
    const p = c.props as PropsOpsi;
    if (c.type === "option") {
      if (p.hidden) return;
      const label = teksDari(p.children).replace(/\s+/g, " ").trim();
      const nilai = p.value !== undefined && p.value !== null ? String(p.value) : label;
      keluar.push({ nilai, label, nonaktif: !!p.disabled, kelompok });
    } else if (c.type === "optgroup") {
      kumpulkan(p.children, p.label ? String(p.label) : undefined, keluar);
    } else if (c.type === Fragment) {
      kumpulkan(p.children, kelompok, keluar);
    }
  });
}

/* ---------- komponen ---------- */

export type SelectCariProps = {
  value?: string | number | readonly string[] | null;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  title?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

type Letak = { kiri: number; atas?: number; bawah?: number; lebarMin: number; tinggiMaks: number };

const LEBAR_HP = 640;

// Peristiwa dari panel (portal) merambat ke leluhur React-nya (mis. <tr onClick>, latar modal). <select> bawaan tidak begitu: memilih opsi
// tidak memicu klik di induknya. Karena itu peristiwa panel dihentikan di batas panel.
const henti = (e: { stopPropagation: () => void }) => e.stopPropagation();
const PAGAR_PANEL = { onClick: henti, onMouseDown: henti, onPointerDown: henti, onTouchStart: henti, onKeyDown: henti, onKeyUp: henti } as const;
// useLayoutEffect memberi peringatan saat render server; di server cukup useEffect (tidak pernah dijalankan di sana).
const useLayoutEffectAman = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function SelectCari(props: SelectCariProps) {
  const { value, onChange, children, className = "", disabled, required, id, name, title, autoFocus } = props;
  const ariaLabel = props["aria-label"];
  const idUnik = useId();
  const idDaftar = `sc-${idUnik}`;

  const opsi = useMemo(() => {
    const k: OpsiPilih[] = [];
    kumpulkan(children, undefined, k);
    return k;
  }, [children]);

  if (process.env.NODE_ENV !== "production" && opsi.length === 0 && Children.count(children) > 0) {
    console.warn("SelectCari: tidak ada <option> yang terbaca dari children. Komponen pembungkus <option> tidak didukung; tulis <option> langsung.");
  }

  const nilaiSekarang = value === undefined || value === null ? "" : Array.isArray(value) ? String(value[0] ?? "") : String(value);
  const { label: labelTombol } = labelTerpilih(opsi, nilaiSekarang);
  const penentuLebar = useMemo(() => labelPenentuLebar(opsi), [opsi]);
  const adaCari = perluKotakCari(opsi.length);

  const [buka, setBuka] = useState(false);
  const [mobil, setMobil] = useState(false);
  const [kueri, setKueri] = useState("");
  const [aktif, setAktif] = useState(-1);
  const [letak, setLetak] = useState<Letak | null>(null);

  const tombolRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cariRef = useRef<HTMLInputElement>(null);
  const daftarRef = useRef<HTMLUListElement>(null);
  const kembaliFokus = useRef(false);

  const tampilan = useMemo(() => {
    if (!buka) return { tampil: [] as OpsiPilih[], sisa: 0 };
    return potongTampil(saringPilihan(opsi, kueri));
  }, [buka, opsi, kueri]);
  const baris = tampilan.tampil;

  const tutup = useCallback((fokusKeTombol: boolean) => {
    kembaliFokus.current = fokusKeTombol;
    setBuka(false);
  }, []);

  // Back HP menutup panel (hanya mode HP; di layar lebar panel mengambang biasa dan ditutup Esc / klik luar).
  useTutupDenganBack(buka && mobil, () => tutup(false));

  // dinonaktifkan atau pilihan menghilang saat daftar terbuka: tutup (supaya tidak ada panel/latar yang tertinggal)
  useEffect(() => {
    if (buka && (disabled || opsi.length === 0)) setBuka(false);
  }, [buka, disabled, opsi.length]);

  const bukaDaftar = () => {
    if (disabled || opsi.length === 0) return;
    const hp = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(`(max-width: ${LEBAR_HP - 1}px)`).matches : false;
    setMobil(hp);
    setKueri("");
    setAktif(indeksAwal(opsi, nilaiSekarang));
    setBuka(true);
  };

  const pilih = (o: OpsiPilih) => {
    if (o.nonaktif) return;
    const berubah = o.nilai !== nilaiSekarang;
    tutup(true);
    if (berubah && onChange) {
      const target = { value: o.nilai, id, name } as unknown as HTMLSelectElement;
      const ev = { target, currentTarget: target, type: "change", preventDefault() {}, stopPropagation() {}, persist() {} } as unknown as ChangeEvent<HTMLSelectElement>;
      onChange(ev);
    }
  };

  /* letak daftar mengambang (layar lebar) / panel atas (HP) */
  const hitungLetak = useCallback(() => {
    const t = tombolRef.current;
    if (!t || typeof window === "undefined") return;
    const vv = window.visualViewport;
    const tinggiLayar = vv?.height ?? window.innerHeight;
    const geserAtas = vv?.offsetTop ?? 0;
    if (mobil) {
      setLetak({ kiri: 8, atas: geserAtas + 8, lebarMin: 0, tinggiMaks: Math.max(160, tinggiLayar - 16) });
      return;
    }
    const r = t.getBoundingClientRect();
    const bawahRuang = tinggiLayar - r.bottom - 8;
    const atasRuang = r.top - 8;
    const ke_atas = bawahRuang < 220 && atasRuang > bawahRuang;
    const tinggiMaks = Math.max(140, Math.min(360, ke_atas ? atasRuang : bawahRuang));
    setLetak({
      kiri: Math.max(8, r.left),
      atas: ke_atas ? undefined : r.bottom + 4,
      bawah: ke_atas ? window.innerHeight - r.top + 4 : undefined,
      lebarMin: r.width,
      tinggiMaks,
    });
  }, [mobil]);

  useLayoutEffectAman(() => {
    if (!buka) return;
    hitungLetak();
  }, [buka, hitungLetak]);

  useEffect(() => {
    if (!buka) return;
    const ulang = () => hitungLetak();
    const saatGulir = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return; // gulir daftar sendiri tak perlu menggeser panel
      hitungLetak();
    };
    window.addEventListener("resize", ulang);
    window.addEventListener("scroll", saatGulir, true);
    window.visualViewport?.addEventListener("resize", ulang);
    window.visualViewport?.addEventListener("scroll", ulang);
    return () => {
      window.removeEventListener("resize", ulang);
      window.removeEventListener("scroll", saatGulir, true);
      window.visualViewport?.removeEventListener("resize", ulang);
      window.visualViewport?.removeEventListener("scroll", ulang);
    };
  }, [buka, hitungLetak]);

  // klik di luar (layar lebar)
  useEffect(() => {
    if (!buka || mobil) return;
    const dll = (e: PointerEvent) => {
      const n = e.target as Node | null;
      if (n && (panelRef.current?.contains(n) || tombolRef.current?.contains(n))) return;
      tutup(false);
    };
    document.addEventListener("pointerdown", dll, true);
    return () => document.removeEventListener("pointerdown", dll, true);
  }, [buka, mobil, tutup]);

  // fokus: ke kotak cari / daftar saat terbuka; kembali ke tombol bila ditutup lewat pilihan atau Esc
  useEffect(() => {
    if (buka) {
      // HP + daftar tidak panjang: jangan langsung memunculkan papan ketik (menutupi daftar); pengguna boleh mengetuk kotak cari.
      const langsungCari = !(mobil && opsi.length < 15);
      const f = () => ((langsungCari ? cariRef.current : null) ?? daftarRef.current ?? cariRef.current)?.focus({ preventScroll: true });
      const t = setTimeout(f, 0);
      return () => clearTimeout(t);
    }
    if (kembaliFokus.current) {
      kembaliFokus.current = false;
      tombolRef.current?.focus({ preventScroll: true });
    }
  }, [buka]);

  // pilihan aktif ikut terlihat
  useEffect(() => {
    if (!buka || aktif < 0) return;
    const el = daftarRef.current?.querySelector<HTMLElement>(`[data-i="${aktif}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [buka, aktif]);

  const saatKetikCari = (v: string) => {
    setKueri(v);
    const s = saringPilihan(opsi, v);
    const t = potongTampil(s).tampil;
    setAktif(t.length ? (v.trim() ? indeksPertamaAktif(t, 1) : indeksAwal(t, nilaiSekarang)) : -1);
  };

  const saatTekanDaftar = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      tutup(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setAktif((a) => geserAktif(baris, a, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAktif((a) => geserAktif(baris, a, -1));
    } else if (e.key === "Home" && !adaCari) {
      e.preventDefault();
      setAktif(indeksPertamaAktif(baris, 1));
    } else if (e.key === "End" && !adaCari) {
      e.preventDefault();
      setAktif(indeksPertamaAktif(baris, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = baris[aktif];
      if (o) pilih(o);
    } else if (e.key === "Tab") {
      tutup(false);
    }
  };

  const saatTekanTombol = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      bukaDaftar();
    }
  };

  /* ---------- tampilan ---------- */
  const judulPanel = ariaLabel || title || "";

  const isiDaftar = (
    <>
      {adaCari && (
        <div className="border-b border-[#DDE6F3] p-2">
          <input
            ref={cariRef}
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            role="combobox"
            aria-expanded="true"
            aria-controls={idDaftar}
            aria-autocomplete="list"
            aria-activedescendant={aktif >= 0 ? `${idDaftar}-${aktif}` : undefined}
            aria-label={judulPanel ? `Cari: ${judulPanel}` : "Cari pilihan"}
            placeholder="Cari…"
            value={kueri}
            onChange={(e) => saatKetikCari(e.target.value)}
            onKeyDown={saatTekanDaftar}
            className="w-full rounded-lg border border-[#DDE6F3] bg-white px-2.5 py-2 text-[14px] text-[#1B2B4B] outline-none focus:border-[#1F5FD1] focus:ring-2 focus:ring-[#1F5FD1]/15 sm:py-1.5 sm:text-[13px]"
          />
        </div>
      )}
      <ul
        ref={daftarRef}
        id={idDaftar}
        role="listbox"
        aria-label={judulPanel || "Pilihan"}
        tabIndex={adaCari ? -1 : 0}
        onKeyDown={adaCari ? undefined : saatTekanDaftar}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 outline-none"
      >
        {baris.length === 0 && <li className="px-3 py-3 text-center text-[12.5px] text-[#5B6B84]">Tidak ada yang cocok</li>}
        {baris.map((o, i) => {
          const kepala = o.kelompok && o.kelompok !== baris[i - 1]?.kelompok ? o.kelompok : null;
          const terpilih = o.nilai === nilaiSekarang;
          return (
            <Fragment key={`${o.nilai}-${i}`}>
              {kepala && <li role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-[#5B6B84]">{kepala}</li>}
              <li
                id={`${idDaftar}-${i}`}
                data-i={i}
                role="option"
                aria-selected={terpilih}
                aria-disabled={o.nonaktif || undefined}
                onPointerMove={() => !o.nonaktif && aktif !== i && setAktif(i)}
                onClick={() => pilih(o)}
                className={
                  "flex cursor-pointer items-start gap-2 px-3 py-2.5 text-[13px] leading-snug sm:py-1.5 " +
                  (o.nonaktif ? "cursor-not-allowed text-slate-400 " : "text-[#1B2B4B] ") +
                  (i === aktif && !o.nonaktif ? "bg-[#EAF1FC] " : "") +
                  (terpilih ? "font-semibold" : "")
                }
              >
                <span className="min-w-0 flex-1 break-words">{o.label || " "}</span>
                {terpilih && (
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1F5FD1]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5l3.2 3.2L13 4.8" />
                  </svg>
                )}
              </li>
            </Fragment>
          );
        })}
        {tampilan.sisa > 0 && <li className="px-3 py-2 text-center text-[12px] text-[#5B6B84]">…{tampilan.sisa} pilihan lain. Ketik untuk mempersempit.</li>}
      </ul>
    </>
  );

  const gayaPanel = letak
    ? mobil
      ? { left: letak.kiri, right: 8, top: letak.atas, maxHeight: letak.tinggiMaks }
      : { left: letak.kiri, top: letak.atas, bottom: letak.bawah, minWidth: Math.max(letak.lebarMin, 180), maxWidth: "min(92vw, 28rem)", maxHeight: letak.tinggiMaks }
    : { visibility: "hidden" as const };

  const panel = (
    <div
      ref={panelRef}
      style={gayaPanel}
      {...PAGAR_PANEL}
      className="fixed z-[10100] flex flex-col overflow-hidden rounded-xl border border-[#CBD6E6] bg-white shadow-[0_12px_32px_rgba(15,35,75,0.22)]"
    >
      {mobil && (
        <div className="flex items-center justify-between gap-2 border-b border-[#DDE6F3] bg-[#F5F8FE] px-3 py-2">
          <span className="min-w-0 truncate text-[12.5px] font-bold text-[#1B2B4B]">{judulPanel || "Pilih"}</span>
          <button type="button" onClick={() => tutup(true)} className="min-h-[36px] shrink-0 rounded-lg px-3 text-[12.5px] font-bold text-[#1F5FD1] active:bg-[#DCE8FB]">
            Tutup
          </button>
        </div>
      )}
      {isiDaftar}
    </div>
  );

  return (
    <>
      <button
        ref={tombolRef}
        type="button"
        id={id}
        title={title}
        disabled={disabled}
        autoFocus={autoFocus}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={buka}
        aria-controls={buka ? idDaftar : undefined}
        aria-label={ariaLabel}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
        aria-required={required || undefined}
        onClick={() => (buka ? tutup(true) : bukaDaftar())}
        onKeyDown={saatTekanTombol}
        className={`${className} ${/(^|\s)(\w+:)*bg-/.test(className) ? "" : "bg-white "}inline-flex cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed`}
      >
        <span className="grid min-w-0 flex-1">
          <span className="col-start-1 row-start-1 min-w-0 truncate">{labelTombol || " "}</span>
          {penentuLebar.map((t, i) => (
            <span key={i} aria-hidden="true" className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap">{t}</span>
          ))}
        </span>
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[#5B6B84]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 6l4.5 4.5L12.5 6" />
        </svg>
      </button>
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          name={name}
          value={nilaiSekarang}
          onChange={() => {}}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
      )}
      {buka && typeof document !== "undefined" && createPortal(
        mobil ? (
          <>
            <div {...PAGAR_PANEL} aria-hidden="true" className="fixed inset-0 z-[10099] touch-none bg-black/35" onClick={(e) => { e.stopPropagation(); tutup(true); }} />
            {panel}
          </>
        ) : (
          panel
        ),
        document.body
      )}
    </>
  );
}
