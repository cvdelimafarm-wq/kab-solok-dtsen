"use client";

// app/sigap/kelola/pendataan/DokumenPeriksaAdmin.tsx
//
// (29 Okt 2026) Kelola Pendataan > QC > Dokumen pemeriksaan: daftar PDF scan hasil pemeriksaan yang diunggah PML dari Lembar Pendataan, dikelompokkan
// per PML, dengan pencarian dan tombol unduh. Izin API: bencana.admin (lihat). Admin tidak mengubah/menghapus dokumen; PML yang menarik dokumennya.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { BTN, BTN_O, Chip, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { cocokCari, kelompokkanPerPml, labelUkuran, type DokumenPeriksaAdmin } from "@/lib/dokumenPeriksa";

const API = "/api/portal/pendataan/dokumen";
const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const waktuWib = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":") + " WIB";

export default function DokumenPeriksaAdminPanel({ kegiatanId }: { kegiatanId: number }) {
  const [daftar, setDaftar] = useState<DokumenPeriksaAdmin[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [cari, setCari] = useState("");
  const [sibukId, setSibukId] = useState<number | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const r = await apiPortal<{ dokumen: DokumenPeriksaAdmin[] }>(`${API}?semua=1&k=${kegiatanId}`);
      setDaftar(r.dokumen);
      setGalat(null);
    } catch (e) {
      setGalat(pesanGalat(e));
    } finally {
      setMemuat(false);
    }
  }, [kegiatanId]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const unduh = async (d: DokumenPeriksaAdmin) => {
    setSibukId(d.id);
    try {
      const r = await apiPortal<{ url: string }>(`${API}?unduh=${d.id}`);
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

  if (!daftar && !galat) return <Memuat />;
  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      <Kartu
        judul="Dokumen hasil pemeriksaan (PDF scan)"
        ket="Diunggah PML dari Lembar Pendataan. Unduh untuk memeriksa; dokumen yang ditarik PML tidak tampil di sini."
        kanan={<button type="button" className={BTN_O} onClick={() => void muat()} disabled={memuat}>{memuat ? "Memuat…" : "Segarkan"}</button>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Chip w="navy">{total} dokumen</Chip>
          <Chip w="mut">{jumlahPml} PML</Chip>
          <input className={`${INPUT} min-w-[220px] flex-1`} placeholder="Cari judul, PML, atau Sub SLS" value={cari} onChange={(e) => setCari(e.target.value)} aria-label="Cari dokumen" />
        </div>
      </Kartu>

      {daftar && total === 0 && <Pesan jenis="info">Belum ada dokumen. PML mengunggahnya dari Lembar Pendataan (kartu "Dokumen hasil pemeriksaan").</Pesan>}
      {daftar && total > 0 && kelompok.length === 0 && <Pesan jenis="info">Tidak ada dokumen yang cocok dengan pencarian.</Pesan>}

      {kelompok.map((k) => (
        <Kartu key={k.pml_id} judul={k.pml_nama} kanan={<Chip w="mut">{k.dokumen.length} dokumen</Chip>}>
          <ul className="divide-y divide-[#E8EDF5]">
            {k.dokumen.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <b className="block break-words text-[13.5px] text-[#0F2A52]">{d.judul}</b>
                  <span className="block text-[12px] text-[#55657D]">
                    {waktuWib(d.diunggah_at)} · {labelUkuran(d.ukuran_byte)}
                    {d.tanggal_periksa ? ` · diperiksa ${d.tanggal_periksa}` : ""}
                    {d.sub_nama ? ` · ${d.sub_nama}` : ""}
                  </span>
                  {d.keterangan && <span className="block break-words text-[12px] text-[#6B7A90]">{d.keterangan}</span>}
                </div>
                <button type="button" className={BTN} onClick={() => void unduh(d)} disabled={sibukId === d.id}>{sibukId === d.id ? "Membuka…" : "Unduh PDF"}</button>
              </li>
            ))}
          </ul>
        </Kartu>
      ))}
    </div>
  );
}
