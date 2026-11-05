"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/tim/TabelTim.tsx
//
// (6 Nov 2026, Tahap 3) Dua tabel langkah "Susunan tim kerja": A. Jabatan dan pemegang (pemegang dipilih dari petugas bernama pada identifikasi lanjutan),
// B. Rangkap jabatan per petugas (dihitung otomatis terhadap lembar kebijakan). Hanya tampilan; aturan ada di lib/keu/lanjutan.ts (peringatanLanjutan).

import Link from "next/link";
import { useMemo } from "react";
import { Catatan, Chip } from "@/app/sigap/keu-ui";
import { NAMA_PERAN, namaPetugas, peringatanLanjutan, type IsiLanjutan, type Petugas } from "@/lib/keu/lanjutan";
import { JABATAN, strataUntuk, type IsiKebijakan, type KodeJabatan } from "@/lib/keu/kebijakan";
import { slotKosong, teksJabatan } from "@/lib/keu/selisihLanjutan";
import { Bagian, Cat } from "../../Kontrol";
import { TabelSaring, type Kol } from "../../TabelSaring";

type BarisJabatan = { k: KodeJabatan; nama: string; min: number | null; pemegang: { p: Petugas; i: number }[] };
type BarisRangkap = { p: Petugas; i: number; nama: string };

export function SusunanTim({ isi, lembar, lembarSiap, versi, verHilir, mati, setJabatan, hrefLanjutan }: {
  isi: IsiLanjutan; lembar: IsiKebijakan | null; lembarSiap: boolean; versi: number; verHilir: number | null; mati: boolean;
  setJabatan: (pid: string, kode: KodeJabatan, pegang: boolean) => void; hrefLanjutan: string;
}) {
  // ------------------------------------------------------------------------------------------------------------------
  // Turunan tampilan
  // ------------------------------------------------------------------------------------------------------------------
  const total = isi?.petugas.length ?? 0;
  const strata = lembar && total > 0 ? strataUntuk(lembar, total) : null;
  const bernama = useMemo(() => (isi ? isi.petugas.map((p, i) => ({ p, i })).filter(({ p }) => !slotKosong(p)) : []), [isi]);
  const dataJabatan = useMemo<BarisJabatan[]>(() => (isi ? JABATAN.map((j) => ({
    k: j.k, nama: j.nama,
    min: lembar && strata ? (lembar.minimal[strata.k]?.[j.k] ?? 0) : null,
    pemegang: isi.petugas.map((p, i) => ({ p, i })).filter(({ p }) => p.jabatan.includes(j.k)),
  })) : []), [isi, lembar, strata]);
  const dataRangkap = useMemo<BarisRangkap[]>(() => bernama.map(({ p, i }) => ({ p, i, nama: namaPetugas(p, i + 1) })), [bernama]);
  const boleh = useMemo(() => new Set<string>(strata && lembar ? (lembar.rangkap[strata.k] ?? []) : []), [strata, lembar]);
  const ketRangkap = (p: Petugas): string => {
    if (!strata) return "—";
    if (p.jabatan.length === 0) return "Tanpa jabatan";
    const lebih = p.jabatan.length > strata.maks_jabatan;
    const lain = p.jabatan.length > 1 ? p.jabatan.filter((j) => !boleh.has(j)) : [];
    if (!lebih && lain.length === 0) return p.jabatan.length > 1 ? "Rangkap sesuai kebijakan" : "Satu jabatan";
    return [lebih ? `Melebihi batas ${strata.maks_jabatan} jabatan` : "", lain.length > 0 ? "Ada jabatan yang tidak boleh dirangkap" : ""].filter(Boolean).join("; ");
  };
  const peringatan = useMemo(
    () => (isi ? peringatanLanjutan(isi, { lembar, dasarUsang: false, form: null }).filter((t) => /minimal|memegang|merangkap/i.test(t)) : []),
    [isi, lembar],
  );

  const kolJabatan: Kol<BarisJabatan>[] = [
    { id: "jabatan", judul: "Jabatan", jenis: "pilih", nilai: (r) => r.nama, sel: (r) => <strong className="text-[#0F2A52]">{r.nama}</strong>, kelasTd: "min-w-[150px]" },
    { id: "min", judul: "Minimal", jenis: "pilih", nilai: (r) => (r.min === null ? "—" : String(r.min)), sel: (r) => (r.min === null ? "—" : r.min) },
    { id: "ada", judul: "Terisi", jenis: "pilih", nilai: (r) => String(r.pemegang.length), sel: (r) => r.pemegang.length },
    {
      id: "status", judul: "Status", jenis: "pilih",
      nilai: (r) => (r.min === null ? "—" : r.pemegang.length >= r.min ? "Cukup" : "Kurang"),
      sel: (r) => r.min === null ? "—" : r.pemegang.length >= r.min
        ? <span className="rounded-full bg-[#E6F6EC] px-2 py-[1px] text-[11.5px] font-semibold text-[#14653A]">Cukup</span>
        : <span className="rounded-full bg-[#FFF4D6] px-2 py-[1px] text-[11.5px] font-semibold text-[#8A6200]">Kurang {r.min - r.pemegang.length}</span>,
    },
    {
      id: "pemegang", judul: "Pemegang", jenis: "teks", nilai: (r) => r.pemegang.map(({ p, i }) => namaPetugas(p, i + 1)).join(", ") || "—",
      kelasTd: "min-w-[260px]",
      sel: (r) => {
        const calon = bernama.filter(({ p }) => !p.jabatan.includes(r.k));
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {r.pemegang.length === 0 && mati && <span className="text-[#5B6B84]">Belum ada</span>}
            {r.pemegang.map(({ p, i }) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-[#EEF2F7] px-2 py-[1px] text-[12px] font-semibold text-[#2B3A55]">
                {namaPetugas(p, i + 1)}
                {!mati && (
                  <button type="button" aria-label={`Lepas ${r.nama} dari ${namaPetugas(p, i + 1)}`} className="rounded px-0.5 text-[13px] leading-none text-[#B42329]" onClick={() => setJabatan(p.id, r.k, false)}>×</button>
                )}
              </span>
            ))}
            {!mati && (
              <select
                aria-label={`Tambah pemegang ${r.nama}`} className="min-h-[34px] rounded-lg border border-[#C5D0E2] bg-white px-2 text-[12.5px]" value=""
                onChange={(e) => { if (e.target.value) setJabatan(e.target.value, r.k, true); }}
              >
                <option value="">+ Tambah pemegang…</option>
                {calon.map(({ p, i }) => (
                  <option key={p.id} value={p.id}>{namaPetugas(p, i + 1)} · {p.peran ? NAMA_PERAN[p.peran] : "tanpa peran"} · {p.status}{p.jabatan.length > 0 ? ` · ${p.jabatan.length} jabatan` : ""}</option>
                ))}
              </select>
            )}
          </div>
        );
      },
    },
  ];
  const kolRangkap: Kol<BarisRangkap>[] = [
    { id: "nama", judul: "Petugas", jenis: "teks", nilai: (r) => r.nama, sel: (r) => <strong className="text-[#0F2A52]">{r.nama}</strong>, kelasTd: "min-w-[150px]" },
    { id: "peran", judul: "Peran", jenis: "pilih", nilai: (r) => (r.p.peran ? NAMA_PERAN[r.p.peran] : "—"), sel: (r) => (r.p.peran ? NAMA_PERAN[r.p.peran] : "—") },
    { id: "status", judul: "Status", jenis: "pilih", nilai: (r) => r.p.status, sel: (r) => r.p.status },
    { id: "jabatan", judul: "Jabatan", jenis: "teks", nilai: (r) => teksJabatan(r.p.jabatan) || "—", sel: (r) => teksJabatan(r.p.jabatan) || "—", kelasTd: "min-w-[200px]" },
    { id: "jml", judul: "Jumlah", jenis: "pilih", nilai: (r) => String(r.p.jabatan.length), sel: (r) => r.p.jabatan.length },
    {
      id: "ket", judul: "Rangkap", jenis: "pilih", nilai: (r) => ketRangkap(r.p),
      sel: (r) => {
        const t = ketRangkap(r.p);
        const buruk = t.startsWith("Melebihi") || t.startsWith("Ada jabatan");
        return <span className={buruk ? "font-semibold text-[#B42329]" : "text-[#44546F]"}>{t}</span>;
      },
      kelasTd: "min-w-[190px]",
    },
  ];

  return (
    <>
      <Bagian huruf="A" judul="Jabatan dan pemegang" id="tim-jabatan">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#44546F]">
          <span>{total} petugas pada identifikasi lanjutan versi {versi}</span>
          {strata && <Chip warna="biru">{strata.k} · jabatan per orang maksimal {strata.maks_jabatan}</Chip>}
          {verHilir !== null && <span>· modul hilir memakai versi {verHilir}</span>}
        </div>
        {!lembar && lembarSiap && <Catatan>Belum ada lembar kebijakan yang berlaku; minimal per jabatan dan batas rangkap belum dapat diperiksa.</Catatan>}
        <Cat>Pilih pemegang dari petugas yang sudah bernama pada identifikasi lanjutan. Satu jabatan boleh dipegang lebih dari satu orang bila minimalnya lebih dari satu; rangkap dihitung otomatis pada tabel B. Menghapus nama petugas di langkah 2 melepas jabatannya.</Cat>
        {bernama.length === 0 && <Catatan>Belum ada petugas bernama. Isi nama petugas pada identifikasi lanjutan agar dapat dipilih sebagai pemegang jabatan.</Catatan>}
        <TabelSaring label="Jabatan dan pemegang" kols={kolJabatan} data={dataJabatan} kunci={(r) => r.k} idBaris={(r) => `jabatan-${r.k}`} />
      </Bagian>
      <Bagian huruf="B" judul="Rangkap jabatan per petugas" id="tim-rangkap">
        <TabelSaring label="Rangkap jabatan per petugas" kols={kolRangkap} data={dataRangkap} kunci={(r) => r.p.id} kosong="Belum ada petugas bernama." />
        {peringatan.length > 0 && (
          <div role="status" className="rounded-lg border border-[#F2D58A] bg-[#FFF8E6] px-3 py-2 text-[12.5px] leading-snug text-[#6B4D00]">
            <strong>Peringatan susunan tim</strong>
            <ul className="m-0 mt-1 list-disc pl-5">{peringatan.map((x) => <li key={x}>{x}</li>)}</ul>
            <span className="mt-1 block">Peringatan tidak memblokir penyimpanan. Pelanggaran yang disengaja diajukan sebagai pengecualian di <Link href={`${hrefLanjutan}#lj-pengecualian`} className="font-semibold text-[#1F5FD1] underline">identifikasi lanjutan</Link>.</span>
          </div>
        )}
      </Bagian>
    </>
  );
}
