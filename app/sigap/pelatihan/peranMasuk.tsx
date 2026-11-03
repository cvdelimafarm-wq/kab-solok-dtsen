"use client";

// app/sigap/pelatihan/peranMasuk.tsx
//
// (3 Nov 2026) "Masuk sebagai": dropdown peran untuk akun berkewenangan ganda (peserta, instruktur, panitia, penanggung jawab) di HP, per pelatihan.
// Pilihan disimpan di perangkat (localStorage, per kegiatan) dan dibagi ke semua komponen lewat useSyncExternalStore. Hanya mengubah TAMPILAN (isi Hari ini, tab
// bawah, tombol Kamera); hak akses di server tetap menurut izin. Aturan murni: lib/peranMasuk.ts.

import { useSyncExternalStore } from "react";
import { useDataPel } from "./dataPel";
import { kunciPeran, labelPilihan, perluPemilih, pilihPeran, type PeranMasuk } from "@/lib/peranMasuk";

type Jawab = { kegiatan_id: number; peran_tersedia?: PeranMasuk[]; peran_nyata?: PeranMasuk[]; peserta?: unknown | null; status?: string; tab_baru?: boolean; terkunci_undangan?: boolean };

const pendengar = new Set<() => void>();

function baca(id: number | null): string | null {
  if (id === null || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(kunciPeran(id));
  } catch {
    return null;
  }
}

function langganan(f: () => void): () => void {
  pendengar.add(f);
  if (typeof window !== "undefined") window.addEventListener("storage", f);
  return () => {
    pendengar.delete(f);
    if (typeof window !== "undefined") window.removeEventListener("storage", f);
  };
}

export type StatusPeran = {
  memuat: boolean;
  kegiatanId: number | null;
  tersedia: PeranMasuk[];
  /** Peran yang benar-benar dimiliki akun (peran lain di dropdown = pratinjau). */
  nyata: PeranMasuk[];
  /** Peran yang berlaku; null bila akun tidak punya dua peran atau lebih (tampilan mengikuti server seperti biasa). */
  peran: PeranMasuk | null;
  /** Undangan perlu dituntaskan di peran Peserta (UI saja; server tetap menurut izin). */
  terkunci: boolean;
  pilih: (p: PeranMasuk) => void;
};

export function usePeranMasuk(): StatusPeran {
  const { data } = useDataPel<Jawab>("/api/sigap/pelatihan/ketentuan");
  const id = data?.kegiatan_id ?? null;
  const tersimpan = useSyncExternalStore(langganan, () => baca(id), () => null);
  const tersedia = data?.peran_tersedia ?? [];
  const nyata = data?.peran_nyata ?? tersedia;
  const ganda = perluPemilih(tersedia);
  const belumTerima = !!data?.peserta && !!data?.tab_baru && data?.status !== "diterima";
  const peran = ganda ? pilihPeran(tersedia, tersimpan, belumTerima) : null;
  const terkunci = !!data && (!!data.terkunci_undangan || (ganda && peran === "peserta" && belumTerima));
  const pilih = (p: PeranMasuk) => {
    if (id === null) return;
    try {
      window.localStorage.setItem(kunciPeran(id), p);
    } catch {
      /* tanpa penyimpanan: pilihan berlaku sampai halaman dimuat ulang */
    }
    pendengar.forEach((f) => f());
  };
  return { memuat: !data, kegiatanId: id, tersedia, nyata, peran, terkunci, pilih };
}

/** Dropdown "Masuk sebagai"; tidak tampil bila akun hanya punya satu peran. */
export function PemilihPeran() {
  const { tersedia, nyata, peran, pilih } = usePeranMasuk();
  if (!peran || !perluPemilih(tersedia)) return null;
  return (
    <div className="rounded-xl border border-[#D7DEE8] bg-white px-3 py-2 shadow-sm" data-testid="pemilih-peran">
      <label htmlFor="masuk-sebagai" className="text-[11px] font-bold uppercase tracking-wide text-[#5B6B7F]">
        Masuk sebagai
      </label>
      <select
        id="masuk-sebagai"
        value={peran}
        onChange={(e) => pilih(e.target.value as PeranMasuk)}
        className="mt-1 w-full rounded-lg border border-[#C9D3E0] bg-[#F3F5F8] px-3 py-2 text-[14px] font-semibold text-[#14202E]"
      >
        {tersedia.map((p) => (
          <option key={p} value={p}>
            {labelPilihan(p, nyata)}
          </option>
        ))}
      </select>
    </div>
  );
}
