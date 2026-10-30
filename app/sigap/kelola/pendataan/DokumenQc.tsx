"use client";

// app/sigap/kelola/pendataan/DokumenQc.tsx
//
// (30 Okt 2026) Daftar unduh dokumen hasil pemeriksaan (PDF scan dari PML) di tab QC, untuk kegiatan yang sedang dipilih. Dipasang untuk SEMUA kegiatan,
// tetapi kartunya baru TAMPIL bila memang ada dokumen yang masuk; tanpa data (atau kegiatan itu belum punya fitur unggah) tidak ada yang ditampilkan.
// Hanya melihat dan mengunduh: PML mengunggah/menarik dari tab Dokumen di lembar pendataan kegiatannya. API: /api/portal/qc/dokumen.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { BTN_O, Kartu, Pesan } from "../../admin/ui";
import { API_QC_DOKUMEN, cocokCari, kelompokkanPerPml, labelUkuran, labelWilayah, type DokumenPeriksaAdmin } from "@/lib/dokumenPeriksa";

const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const waktuWib = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":") + " WIB";

export default function DokumenQc({ kegiatanId }: { kegiatanId: number }) {
  const [daftar, setDaftar] = useState<DokumenPeriksaAdmin[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [sibukId, setSibukId] = useState<number | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await apiPortal<{ dokumen: DokumenPeriksaAdmin[] }>(`${API_QC_DOKUMEN}?k=${kegiatanId}`);
      setDaftar(r.dokumen);
      setGalat(null);
    } catch (e) {
      setGalat(pesanGalat(e));
    }
  }, [kegiatanId]);

  useEffect(() => {
    setDaftar(null);
    setGalat(null);
    setCari("");
    void muat();
  }, [muat]);

  const unduh = async (d: DokumenPeriksaAdmin) => {
    setSibukId(d.id);
    try {
      const r = await apiPortal<{ url: string }>(`${API_QC_DOKUMEN}?k=${kegiatanId}&unduh=${d.id}`);
      window.location.href = r.url;
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setSibukId(null);
    }
  };

  const kelompok = useMemo(() => kelompokkanPerPml((daftar ?? []).filter((d) => cocokCari(d, cari))), [daftar, cari]);
  const jumlahPml = useMemo(() => new Set((daftar ?? []).map((d) => d.pml_id)).size, [daftar]);

  // belum ada data masuk (atau masih memuat): tidak ada yang ditampilkan
  if (!daftar || daftar.length === 0) return galat ? <Pesan jenis="galat" onTutup={() => setGalat(null)}>Dokumen pemeriksaan: {galat}</Pesan> : null;

  return (
    <Kartu
      judul="Dokumen hasil pemeriksaan"
      ket={`${daftar.length} dokumen dari ${jumlahPml} PML · PDF scan yang diunggah PML; yang ditarik PML tidak tampil`}
      kanan={
        <button type="button" className={BTN_O} onClick={() => void muat()}>
          Segarkan
        </button>
      }
    >
      <div className="space-y-3">
        {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari judul, PML, atau jorong"
          aria-label="Cari dokumen"
          className="min-h-[44px] w-full rounded-[10px] border border-[#DCE5F2] bg-white px-2.5 text-[14px] text-[#1B2B4B] outline-none focus:border-[#1F5FD1]"
        />
        {kelompok.length === 0 && <p className="text-[13px] text-[#55657D]">Tidak ada dokumen yang cocok dengan pencarian.</p>}
        {kelompok.map((k) => (
          <div key={k.pml_id} className="rounded-xl border border-[#E3EAF5] px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-[#0F2A52]">{k.pml_nama}</h3>
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
                  <button
                    type="button"
                    onClick={() => void unduh(d)}
                    disabled={sibukId === d.id}
                    className="min-h-[44px] flex-none rounded-[10px] bg-[#1F5FD1] px-3.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                  >
                    {sibukId === d.id ? "Membuka…" : "Unduh PDF"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Kartu>
  );
}
