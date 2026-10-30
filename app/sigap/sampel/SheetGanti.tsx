"use client";

// app/sigap/sampel/SheetGanti.tsx
//
// (30 Okt 2026) Lembar bawah untuk menandai sampel utama diganti cadangan: pilih cadangan (satu SLS, belum terpakai) dan isi alasan singkat.

import { useState } from "react";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { MAKS_ALASAN, MIN_ALASAN, cadanganTersedia, type SampelRow } from "@/lib/sampelSls";

const ALASAN_CEPAT = ["Responden pindah", "Menolak diwawancarai", "Rumah kosong / tidak ada penghuni", "Tidak ditemukan", "Bukan sasaran"];

export default function SheetGanti({
  utama,
  semua,
  onTutup,
  onSimpan,
}: {
  utama: SampelRow;
  semua: readonly SampelRow[];
  onTutup: () => void;
  onSimpan: (cadanganId: number, alasan: string) => Promise<void>;
}) {
  useTutupDenganBack(true, onTutup); // (31 Okt 2026) Back HP menutup sheet
  const pilihan = cadanganTersedia(utama, semua);
  const [cadangan, setCadangan] = useState<number | null>(pilihan.length === 1 ? pilihan[0].id : null);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");
  const sah = cadangan != null && alasan.trim().length >= MIN_ALASAN;

  async function simpan() {
    if (!sah || cadangan == null) return;
    setSibuk(true);
    setGalat("");
    try {
      await onSimpan(cadangan, alasan.trim());
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Penggantian gagal disimpan.");
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" role="dialog" aria-modal="true" aria-label="Ganti sampel dengan cadangan">
      <div className="mx-auto max-h-[92dvh] w-full max-w-xl overflow-auto rounded-t-[22px] bg-white p-4 pb-6">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6B7A90]">Ganti sampel</p>
        <p className="mt-0.5 text-[15px] font-extrabold leading-snug text-[#0F2A52]">{utama.nama_responden}</p>
        <p className="font-mono text-[12px] text-[#55657D]">SLS {utama.kode_sls}</p>

        <fieldset className="mt-3">
          <legend className="text-[12.5px] font-bold text-[#44546F]">Diganti dengan cadangan</legend>
          {pilihan.length === 0 && <p className="mt-1 text-[13px] text-[#B42329]">Tidak ada cadangan tersisa pada SLS ini.</p>}
          <div className="mt-1.5 space-y-1.5">
            {pilihan.map((c) => (
              <label key={c.id} className={`flex min-h-[48px] cursor-pointer items-center gap-2.5 rounded-[12px] border px-3 py-2 ${cadangan === c.id ? "border-[#1F5FD1] bg-[#EAF1FC]" : "border-[#DCE5F2] bg-white"}`}>
                <input type="radio" name="cadangan" className="h-4 w-4 accent-[#1F5FD1]" checked={cadangan === c.id} onChange={() => setCadangan(c.id)} />
                <span className="min-w-0 text-[13.5px] font-semibold text-[#0F2A52]">
                  {c.nama_responden}
                  {c.anggota_lain ? <span className="block text-[12px] font-normal text-[#55657D]">Anggota ruta lain: {c.anggota_lain}</span> : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-3">
          <label htmlFor="alasan-ganti" className="text-[12.5px] font-bold text-[#44546F]">
            Alasan
          </label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ALASAN_CEPAT.map((a) => (
              <button key={a} type="button" onClick={() => setAlasan(a)} className={`min-h-[36px] rounded-full border px-3 text-[12px] font-semibold ${alasan === a ? "border-[#1F5FD1] bg-[#EAF1FC] text-[#1F5FD1]" : "border-[#DCE5F2] bg-white text-[#44546F]"}`}>
                {a}
              </button>
            ))}
          </div>
          <textarea id="alasan-ganti" value={alasan} onChange={(e) => setAlasan(e.target.value.slice(0, MAKS_ALASAN))} rows={2} placeholder="Tulis alasan singkat" className="mt-1.5 w-full rounded-[12px] border border-[#DCE5F2] px-3 py-2 text-[14px] outline-none focus:border-[#1F5FD1]" />
        </div>

        {galat && <p className="mt-2 rounded-[10px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galat}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onTutup} disabled={sibuk} className="min-h-[48px] flex-1 rounded-[12px] border border-[#CBD6E6] bg-white text-[14px] font-bold text-[#1B2B4B] disabled:opacity-50">
            Batal
          </button>
          <button type="button" onClick={() => void simpan()} disabled={!sah || sibuk} className="min-h-[48px] flex-[1.4] rounded-[12px] bg-[#1F5FD1] text-[14px] font-bold text-white disabled:opacity-50">
            {sibuk ? "Menyimpan…" : "Simpan penggantian"}
          </button>
        </div>
      </div>
    </div>
  );
}
