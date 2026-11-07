"use client";

// app/sigap/revisi/kertas/KartuIsiNiat.tsx
//
// (7 Nov 2026, tahap 4d) Kartu "Isi dari rencana tindakan": menyalin niat per butir (Lepas, Tambal, Tambahan; tabel keu_niat_butir) ke kolom Menjadi
// kertas kerja satu RO. Hanya mengubah volume baris POK semula yang belum disentuh, lewat keu_tulis (keu_kk_baris), sehingga hak dan aturan basis data
// tetap berlaku (jadwal dibuka, kewenangan, usulan belum diajukan). Logika murni: lib/keu/isiNiat.ts. Tidak ada SQL baru.

import { useMemo, useState } from "react";
import { isiDariNiat, isiTulisLangkah, kalimatIsi } from "@/lib/keu/isiNiat";
import { n, type BarisKk } from "@/lib/keu/kk";
import { LABEL_NIAT, normalisasiNiat, susunRencana } from "@/lib/keu/niat";
import { semuaItem } from "@/lib/keu/kebutuhan";
import { susunPohon } from "@/lib/keu/pokTata";
import { rupiah, urlBaca } from "@/lib/keu/ro";
import { Catatan, Chip, judulKartu, kartu, Memuat, tombolUtama } from "../../keu-ui";
import { aksiKeu, tulisKeuKlien, useAnggaranRo, useBacaKeu } from "../../ro/useKeu";

const sel = (v: number): string => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${rupiah(Math.abs(v))}`);

export default function KartuIsiNiat({ jadwal, ro, bisa, sesudah }: { jadwal: number; ro: string; bisa: boolean; sesudah: () => void | Promise<void> }) {
  const ang = useAnggaranRo(ro);
  const niat = useBacaKeu<Record<string, unknown>>(urlBaca("keu_niat_butir", { ro_kode: ro }, { batas: 2000, kolom: ["ro_kode", "pok_kunci", "niat", "jumlah", "catatan"] }));
  const kk = useBacaKeu<BarisKk>(urlBaca("keu_v_kk_baris", { jadwal_id: jadwal, ro_kode: ro }, { urut: "urut", batas: 3000 }));
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  const rencana = useMemo(() => {
    if (!ang.anggaran) return null;
    const pohon = susunPohon(ang.anggaran, null, new Map(), { kode: ro, nama: "" });
    return susunRencana(semuaItem(pohon), normalisasiNiat(niat.baris ?? []));
  }, [ang.anggaran, niat.baris, ro]);
  const hasil = useMemo(() => (rencana && kk.baris ? isiDariNiat(rencana, kk.baris) : null), [rencana, kk.baris]);
  const adaRencana = (rencana ?? []).some((r) => r.niat === "lepas" || r.niat === "tambal" || r.niat === "tambahan");

  if (niat.galat || kk.galat || ang.galat) return null; // tabel niat belum ada atau data gagal dimuat: kartu tidak perlu tampil
  if (!ang.anggaran || niat.memuat || kk.memuat || !rencana) return <section className={`${kartu} flex flex-col gap-2`} aria-label="Isi dari rencana tindakan"><h2 className={judulKartu}>Isi dari rencana tindakan</h2><Memuat tinggi="h-12" /></section>;
  if (!adaRencana) return null;

  const muatBaris = async () => {
    setSibuk(true); setGalat(null); setKabar(null);
    const r = await aksiKeu("keu_kk_muat_ro", { p_jadwal: jadwal, p_ro: ro });
    if (!r.ok) setGalat(r.pesan);
    await kk.muat();
    await sesudah();
    setSibuk(false);
  };

  const isi = async () => {
    if (!hasil || hasil.langkah.length === 0) return;
    setSibuk(true); setGalat(null); setKabar(null);
    const catatanDari = new Map((kk.baris ?? []).map((b) => [b.id, b.catatan] as const));
    let selesai = 0;
    for (const l of hasil.langkah) {
      const h = await tulisKeuKlien("keu_kk_baris", "update", isiTulisLangkah(l, catatanDari.get(l.barisId)), { id: l.barisId });
      if (!h.ok) { setGalat(`${l.uraian}: ${h.pesan}`); break; }
      selesai += 1;
    }
    if (selesai > 0) setKabar(`${selesai} baris kertas kerja diisi dari rencana tindakan.`);
    await kk.muat();
    await sesudah();
    setSibuk(false);
  };

  const kosong = (kk.baris ?? []).length === 0;
  return (
    <section className={`${kartu} flex flex-col gap-2.5`} aria-label="Isi dari rencana tindakan" aria-busy={sibuk}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={judulKartu}>Isi dari rencana tindakan · {ro}</h2>
        {hasil && hasil.langkah.length > 0 && <Chip warna="biru">{hasil.langkah.length} baris siap diisi</Chip>}
      </div>
      <p className="m-0 text-[12.5px] text-[#5B6B84]">Rencana yang Anda catat di tab Anggaran RO (Lepas, Tambal, Minta tambahan) dipindahkan ke kolom Menjadi. Hanya volume baris POK yang belum disentuh yang diubah; setelah itu masih bisa disunting di matriks.</p>

      {kosong && (
        <>
          <Catatan>Kertas kerja RO ini belum dimuat. Muat baris POK dulu agar rencana dapat diisi.</Catatan>
          <button type="button" disabled={!bisa || sibuk} className={`${tombolUtama} self-start`} onClick={() => void muatBaris()}>Muat baris POK RO ini</button>
        </>
      )}

      {hasil && !kosong && (
        <>
          <p className="m-0 text-[13px] text-[#1B2B4B]">{kalimatIsi(hasil)}</p>
          {hasil.langkah.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {hasil.langkah.map((l) => (
                <li key={l.barisId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-md border border-[#DCE3EE] bg-white px-2.5 py-1.5 text-[12.5px]">
                  <span className="min-w-0 break-words text-[#1B2B4B]">{l.uraian} <span className="text-[#5B6B84]">({LABEL_NIAT[l.niat]})</span></span>
                  <span className="tabular-nums text-[#44546F]">vol {n(l.volSemula)} → {n(l.volBaru)} · <b className={l.perubahan < 0 ? "text-[#1B7A3E]" : "text-[#B42318]"}>{sel(l.perubahan)}</b></span>
                </li>
              ))}
            </ul>
          )}
          {hasil.dilewati.length > 0 && (
            <details className="text-[12.5px] text-[#5B6B84]">
              <summary className="cursor-pointer">{hasil.dilewati.length} butir dilewati</summary>
              <ul className="m-0 mt-1 list-disc pl-5">{hasil.dilewati.map((d) => <li key={d.kunci}>{d.uraian}: {d.alasan}</li>)}</ul>
            </details>
          )}
          {hasil.langkah.length > 0 && (
            <button type="button" disabled={!bisa || sibuk} className={`${tombolUtama} self-start`} onClick={() => void isi()}>Isi ke kertas kerja</button>
          )}
          {!bisa && hasil.langkah.length > 0 && <p className="m-0 text-[12px] text-[#5B6B84]">Anda tidak memiliki hak mengubah kertas kerja RO ini, atau jadwal tidak sedang dibuka.</p>}
        </>
      )}

      {kabar && <p role="status" className="m-0 rounded-md bg-[#E6F4EA] px-3 py-2 text-[12.5px] text-[#1B7A3E]">{kabar}</p>}
      {galat && <p role="alert" className="m-0 rounded-md bg-[#FDECEC] px-3 py-2 text-[12.5px] text-[#B42318]">{galat}</p>}
    </section>
  );
}
