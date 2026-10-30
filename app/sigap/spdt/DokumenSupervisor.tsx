"use client";

// app/sigap/spdt/DokumenSupervisor.tsx
//
// (30 Okt 2026) Tab "Dokumen" untuk Supervisor SPDT NTP: daftar PDF scan hasil pemeriksaan yang diunggah PML, dikelompokkan per PML, dengan pencarian
// dan tombol unduh. Supervisor tidak mengubah/menghapus dokumen; PML yang menarik dokumennya. Hanya milik SPDT NTP.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { cocokCari, kelompokkanPerPml, labelUkuran, labelWilayah, type DokumenPeriksaAdmin } from "@/lib/dokumenPeriksa";
import { API_SPDT_DOKUMEN } from "@/lib/spdtNtp";

const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const waktuWib = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":") + " WIB";

export default function DokumenSupervisor() {
  const [daftar, setDaftar] = useState<DokumenPeriksaAdmin[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [cari, setCari] = useState("");
  const [sibukId, setSibukId] = useState<number | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const r = await apiPortal<{ dokumen: DokumenPeriksaAdmin[] }>(`${API_SPDT_DOKUMEN}?semua=1`);
      setDaftar(r.dokumen);
      setGalat(null);
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const unduh = async (d: DokumenPeriksaAdmin) => {
    setSibukId(d.id);
    try {
      const r = await apiPortal<{ url: string }>(`${API_SPDT_DOKUMEN}?unduh=${d.id}`);
      window.location.href = r.url;
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibukId(null);
    }
  };

  const kelompok = useMemo(() => kelompokkanPerPml((daftar ?? []).filter((d) => cocokCari(d, cari))), [daftar, cari]);
  const total = daftar?.length ?? 0;
  const jumlahPml = useMemo(() => new Set((daftar ?? []).map((d) => d.pml_id)).size, [daftar]);

  return (
    <div className="space-y-2.5 p-2.5">
      <section className="rounded-[18px] bg-white p-4 shadow-[0_6px_18px_rgba(15,42,82,.08)]">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Dokumen hasil pemeriksaan</h2>
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#55657D]">PDF scan yang diunggah PML. Dokumen yang ditarik PML tidak tampil di sini.</p>
          </div>
          <button type="button" onClick={() => void muat()} disabled={memuat} className="min-h-[40px] flex-none rounded-[10px] border border-[#CBD6E6] bg-white px-3 text-[12.5px] font-bold text-[#1B2B4B] disabled:opacity-50">
            {memuat ? "Memuat…" : "Segarkan"}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[12px] font-bold text-[#0F2A52]">
          <span className="rounded-full bg-[#E5EEFB] px-2.5 py-1">{total} dokumen</span>
          <span className="rounded-full bg-[#EEF2F7] px-2.5 py-1 text-[#44546F]">{jumlahPml} PML</span>
        </div>
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari judul, PML, atau jorong"
          aria-label="Cari dokumen"
          className="mt-2.5 min-h-[44px] w-full rounded-[10px] border border-[#DCE5F2] bg-white px-2.5 text-[14px] text-[#1B2B4B] outline-none"
        />
      </section>

      {galat && (
        <p role="alert" className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">
          {galat} <button type="button" onClick={() => void muat()} className="font-bold underline">Coba lagi</button>
        </p>
      )}
      {!daftar && !galat && <div className="h-24 animate-pulse rounded-[18px] bg-white" aria-busy="true" />}
      {daftar && total === 0 && <p className="rounded-[18px] bg-white px-4 py-8 text-center text-[13.5px] leading-snug text-[#55657D]">Belum ada dokumen. PML mengunggahnya dari tab Dokumen di Lembar Pendataan mereka.</p>}
      {daftar && total > 0 && kelompok.length === 0 && <p className="rounded-[18px] bg-white px-4 py-6 text-center text-[13px] text-[#55657D]">Tidak ada dokumen yang cocok dengan pencarian.</p>}

      {kelompok.map((k) => (
        <section key={k.pml_id} className="rounded-[18px] bg-white p-4 shadow-[0_6px_18px_rgba(15,42,82,.08)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[14.5px] font-extrabold text-[#0F2A52]">{k.pml_nama}</h3>
            <span className="flex-none rounded-full bg-[#EEF2F7] px-2.5 py-0.5 text-[11.5px] font-bold text-[#44546F]">{k.dokumen.length} dokumen</span>
          </div>
          <ul className="mt-1 divide-y divide-[#E8EDF5]">
            {k.dokumen.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <b className="block break-words text-[13.5px] text-[#0F2A52]">{d.judul}</b>
                  <span className="block text-[12px] text-[#55657D]">
                    {waktuWib(d.diunggah_at)} · {labelUkuran(d.ukuran_byte)}
                    {d.tanggal_periksa ? ` · diperiksa ${d.tanggal_periksa}` : ""}
                    {d.wilayah ? ` · ${labelWilayah(d.wilayah)}` : ""}
                  </span>
                  {d.keterangan && <span className="block break-words text-[12px] text-[#6B7A90]">{d.keterangan}</span>}
                </div>
                <button type="button" onClick={() => void unduh(d)} disabled={sibukId === d.id} className="min-h-[44px] flex-none rounded-[10px] bg-[#1F5FD1] px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50">
                  {sibukId === d.id ? "Membuka…" : "Unduh PDF"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
