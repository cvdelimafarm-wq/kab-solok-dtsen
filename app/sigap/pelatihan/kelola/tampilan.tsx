"use client";

// app/sigap/pelatihan/kelola/tampilan.tsx
//
// (2 Nov 2026) Tab "Persiapan" di Kelola Pelatihan: (1) tampilan peserta (OTOMATIS bawaan: lima tab selama pelatihan belum selesai; dapat dipaksa baru / lama),
// (2) ketentuan undangan. Setiap setelan diberi penanda Bawaan / Diubah. API: /api/sigap/pelatihan/ketentuan.

import { useCallback, useEffect, useMemo, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, BTN_R, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { MAKS_BUTIR, MAKS_PANJANG_BUTIR } from "@/lib/ketentuanPelatihan";
import { lupakanBenderaTab } from "../TabPelatihan";
import { ChipSetelan } from "./GrupTab";

type Data = {
  kegiatan_id: number;
  tab_baru: boolean;
  tab_pengaturan: boolean | null;
  otomatis: boolean;
  kegiatan_selesai: boolean;
  ketentuan: { butir: string[]; versi: number; diubah: boolean };
  boleh_kelola: boolean;
};

const PILIHAN: { nilai: boolean | null; label: string; ket: string }[] = [
  { nilai: null, label: "Otomatis", ket: "Lima tab selama pelatihan belum selesai; pelatihan yang sudah selesai tetap tampilan Langkah lama." },
  { nilai: true, label: "Selalu lima tab", ket: "Peserta selalu melihat Hari ini · Instrumen · Pelatihan · Kamera · Monitoring." },
  { nilai: false, label: "Selalu Langkah lama", ket: "Peserta melihat daftar Langkah pelatihan seperti sebelumnya." },
];

export default function PersiapanKelola() {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [butir, setButir] = useState<string[]>([]);
  const [simpanTab, setSimpanTab] = useState(false);
  const [simpanButir, setSimpanButir] = useState(false);

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<Data>(urlPelatihan("/api/sigap/pelatihan/ketentuan"));
      setD(r);
      setButir(r.ketentuan.butir);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  const berubah = useMemo(() => !!d && JSON.stringify(butir.map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean)) !== JSON.stringify(d.ketentuan.butir), [d, butir]);

  async function kirim(isi: { butir?: string[]; tab_baru?: boolean | null }, pesan: string, tandai: (b: boolean) => void) {
    tandai(true);
    setGalat(null);
    setOk(null);
    try {
      await fetchJson(urlPelatihan("/api/sigap/pelatihan/ketentuan"), { method: "POST", body: JSON.stringify({ aksi: "simpan", ...isi }) });
      setOk(pesan);
      lupakanBenderaTab();
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      tandai(false);
    }
  }

  if (!d && !galat) return <Memuat />;
  if (!d) return <Pesan jenis="galat">{galat}</Pesan>;
  const bisa = d.boleh_kelola;
  const ubah = (i: number, v: string) => setButir((b) => b.map((x, j) => (j === i ? v.slice(0, MAKS_PANJANG_BUTIR) : x)));
  const geser = (i: number, arah: -1 | 1) =>
    setButir((b) => {
      const j = i + arah;
      if (j < 0 || j >= b.length) return b;
      const c = [...b];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const butirTerisi = d.ketentuan.butir.length > 0;

  return (
    <div className="space-y-3">
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {ok && <Pesan jenis="ok">{ok}</Pesan>}

      <Kartu
        judul="Tampilan peserta"
        kanan={<ChipSetelan diubah={!d.otomatis} teksBawaan="Bawaan · otomatis" teksDiubah={d.tab_pengaturan ? "Diubah · selalu lima tab" : "Diubah · selalu Langkah lama"} />}
      >
        <p className="text-[13px] text-[#3B4A60]">
          Saat ini peserta melihat <b>{d.tab_baru ? "tampilan lima tab" : "tampilan Langkah lama"}</b>
          {d.otomatis ? (d.kegiatan_selesai ? " (otomatis: pelatihan ini sudah selesai)." : " (otomatis: pelatihan ini belum selesai).") : " (diatur manual)."}
        </p>
        <div role="radiogroup" aria-label="Tampilan peserta" className="mt-2 grid gap-2 sm:grid-cols-3">
          {PILIHAN.map((p) => {
            const aktif = d.tab_pengaturan === p.nilai;
            return (
              <button
                key={String(p.nilai)}
                type="button"
                role="radio"
                aria-checked={aktif}
                disabled={!bisa || simpanTab}
                onClick={() => !aktif && kirim({ tab_baru: p.nilai }, p.nilai === null ? "Kembali ke otomatis." : p.nilai ? "Tampilan lima tab dipaksa menyala." : "Tampilan Langkah lama dipaksa.", setSimpanTab)}
                className={`rounded-xl border p-3 text-left disabled:opacity-60 ${aktif ? "border-[#1F5FD1] bg-[#EAF1FC]" : "border-[#DDE6F3] bg-white hover:bg-[#F8FAFC]"}`}
              >
                <b className="block text-[13.5px] text-[#0F2A52]">
                  {aktif ? "● " : "○ "}
                  {p.label}
                  {p.nilai === null ? " (disarankan)" : ""}
                </b>
                <span className="mt-0.5 block text-[12px] text-[#6B7A90]">{p.ket}</span>
              </button>
            );
          })}
        </div>
        {!bisa && <p className="mt-2 text-[12.5px] text-[#6B7A90]">Anda hanya dapat melihat; mengubah memerlukan izin kelola pelatihan.</p>}
      </Kartu>

      <Kartu judul="Ketentuan undangan" ket={`versi ${d.ketentuan.versi}`} kanan={<ChipSetelan diubah={butirTerisi} teksDiubah={`Diubah · ${d.ketentuan.butir.length} butir`} teksBawaan="Bawaan · belum ada butir" />}>
        <p className="text-[12.5px] text-[#6B7A90]">
          Waktu dan tempat diambil otomatis dari data undangan. Butir di bawah tampil di modal ketentuan peserta. Mengubah butir menaikkan versi; peserta yang sudah menerima hanya diberi tahu, tanpa persetujuan ulang.
        </p>
        <ol className="mt-2 space-y-2">
          {butir.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="mt-2 w-5 text-right text-[12px] text-[#6B7A90]">{i + 1}.</span>
              <textarea value={b} onChange={(e) => ubah(i, e.target.value)} rows={2} disabled={!bisa} className={`${INPUT} min-w-0 flex-1`} aria-label={`Butir ketentuan ${i + 1}`} />
              {bisa && (
                <span className="flex flex-col gap-1">
                  <button type="button" className={BTN_O} onClick={() => geser(i, -1)} disabled={i === 0} aria-label="Naikkan">
                    ↑
                  </button>
                  <button type="button" className={BTN_O} onClick={() => geser(i, 1)} disabled={i === butir.length - 1} aria-label="Turunkan">
                    ↓
                  </button>
                </span>
              )}
              {bisa && (
                <button type="button" className={BTN_R} onClick={() => setButir((x) => x.filter((_, j) => j !== i))} aria-label="Hapus butir">
                  ✕
                </button>
              )}
            </li>
          ))}
          {butir.length === 0 && <li className="text-[12.5px] text-[#6B7A90]">Belum ada butir ketentuan (bawaan).</li>}
        </ol>
        {bisa && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BTN_O} onClick={() => setButir((b) => [...b, ""])} disabled={butir.length >= MAKS_BUTIR}>
              + Tambah butir
            </button>
            <button type="button" className={BTN} onClick={() => kirim({ butir }, "Ketentuan disimpan.", setSimpanButir)} disabled={simpanButir || !berubah}>
              {simpanButir ? "Menyimpan…" : "Simpan ketentuan"}
            </button>
            {butirTerisi && (
              <button type="button" className={BTN_O} onClick={() => kirim({ butir: [] }, "Ketentuan dikembalikan ke bawaan (tanpa butir).", setSimpanButir)} disabled={simpanButir}>
                Kembalikan ke bawaan
              </button>
            )}
          </div>
        )}
      </Kartu>
    </div>
  );
}
