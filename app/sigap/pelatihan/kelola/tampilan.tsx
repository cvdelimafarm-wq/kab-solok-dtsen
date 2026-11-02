"use client";

// app/sigap/pelatihan/kelola/tampilan.tsx
//
// (2 Nov 2026) Tab "Persiapan" di Kelola Pelatihan: (1) tampilan peserta (OTOMATIS bawaan: lima tab selama pelatihan belum selesai; dapat dipaksa baru / lama),
// (2) ketentuan undangan, (3) pengaturan Absen peserta (sesi, jendela, radius). Setiap setelan diberi penanda Bawaan / Diubah.
// API: /api/sigap/pelatihan/ketentuan dan /api/sigap/pelatihan/absen (aksi "atur").

import { useCallback, useEffect, useMemo, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { BTN, BTN_O, BTN_R, INPUT, Kartu, Memuat, Pesan } from "../../admin/ui";
import { MAKS_BUTIR, MAKS_PANJANG_BUTIR } from "@/lib/ketentuanPelatihan";
import { lupakanBenderaTab } from "../TabPelatihan";
import { JENDELA_MENIT_BAWAAN, RADIUS_RADAR_BAWAAN_M, SESI_BAWAAN, type SesiRencana } from "@/lib/sigapAbsen";
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

type AturAbsen = { sesi: SesiRencana[]; jendela_menit: number; radius_m: number };
const sama = (a: AturAbsen, b: AturAbsen) => JSON.stringify(a) === JSON.stringify(b);
const BAWAAN_ABSEN: AturAbsen = { sesi: SESI_BAWAAN.map((x) => ({ ...x })), jendela_menit: JENDELA_MENIT_BAWAAN, radius_m: RADIUS_RADAR_BAWAAN_M };

/** Pengaturan Absen peserta: daftar sesi (label + jam rencana), jendela absen, radius radar. */
function KartuAturAbsen({ bisa }: { bisa: boolean }) {
  const [asal, setAsal] = useState<AturAbsen | null>(null);
  const [f, setF] = useState<AturAbsen>(BAWAAN_ABSEN);
  const [ada, setAda] = useState(true);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await fetchJson<{ atur: AturAbsen; tersedia?: boolean }>(urlPelatihan("/api/sigap/pelatihan/absen"));
      setAsal(r.atur);
      setF(r.atur);
      setAda(r.tersedia !== false);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  async function simpan(isi: AturAbsen, pesan: string) {
    setSibuk(true);
    setGalat(null);
    setOk(null);
    try {
      await fetchJson(urlPelatihan("/api/sigap/pelatihan/absen"), { method: "POST", body: JSON.stringify({ aksi: "atur", ...isi }) });
      setOk(pesan);
      await muat();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  if (!asal && !galat) return <Memuat />;
  const diubah = !!asal && !sama(asal, BAWAAN_ABSEN);
  const berubah = !!asal && !sama(asal, f);
  const ubahSesi = (i: number, k: "label" | "jam", v: string) => setF((x) => ({ ...x, sesi: x.sesi.map((r, j) => (j === i ? { ...r, [k]: k === "label" ? v.slice(0, 40) : v } : r)) }));
  const tambah = () =>
    setF((x) => {
      const terpakai = new Set(x.sesi.map((r) => r.no));
      let no = 1;
      while (terpakai.has(no)) no++;
      return no > 12 ? x : { ...x, sesi: [...x.sesi, { no, label: `Sesi ${no}`, jam: "08:00" }].sort((a, b) => a.no - b.no) };
    });

  return (
    <Kartu judul="Absen peserta" kanan={<ChipSetelan diubah={diubah} teksBawaan="Bawaan · 4 sesi, 30 menit, 25 m" teksDiubah="Diubah" />}>
      {galat && <Pesan jenis="galat">{galat}</Pesan>}
      {ok && <Pesan jenis="ok">{ok}</Pesan>}
      {!ada && <Pesan jenis="info">Fitur Absen peserta belum aktif di basis data (SQL 20261102zk belum dijalankan). Pengaturan di sini baru dapat disimpan setelah itu.</Pesan>}
      <p className="text-[12.5px] text-[#6B7A90]">
        Daftar sesi hanya saran: pengelola tetap memulai sesi kapan saja dari tab Absen peserta. Jendela absen adalah lama sesi terbuka sejak dimulai; radius dipakai metode radar.
      </p>
      <ol className="mt-2 space-y-2">
        {f.sesi.map((r, i) => (
          <li key={r.no} className="flex flex-wrap items-center gap-1.5">
            <span className="w-5 text-right text-[12px] text-[#6B7A90]">{r.no}.</span>
            <input value={r.label} onChange={(e) => ubahSesi(i, "label", e.target.value)} disabled={!bisa} className={`${INPUT} min-w-0 flex-1`} aria-label={`Nama sesi ${r.no}`} />
            <input type="time" value={r.jam} onChange={(e) => ubahSesi(i, "jam", e.target.value)} disabled={!bisa} className={`${INPUT} w-[7.5rem]`} aria-label={`Jam rencana sesi ${r.no}`} />
            {bisa && f.sesi.length > 1 && (
              <button type="button" className={BTN_R} onClick={() => setF((x) => ({ ...x, sesi: x.sesi.filter((_, j) => j !== i) }))} aria-label={`Hapus sesi ${r.no}`}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[13px]">
          <span className="font-semibold">Jendela absen (menit)</span>
          <input type="number" inputMode="numeric" min={5} max={240} value={f.jendela_menit} onChange={(e) => setF((x) => ({ ...x, jendela_menit: Number(e.target.value) }))} disabled={!bisa} className={`${INPUT} mt-1 w-full`} />
        </label>
        <label className="text-[13px]">
          <span className="font-semibold">Radius radar (meter)</span>
          <input type="number" inputMode="numeric" min={10} max={500} value={f.radius_m} onChange={(e) => setF((x) => ({ ...x, radius_m: Number(e.target.value) }))} disabled={!bisa} className={`${INPUT} mt-1 w-full`} />
        </label>
      </div>
      {bisa && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={BTN_O} onClick={tambah} disabled={f.sesi.length >= 12}>
            + Tambah sesi
          </button>
          <button type="button" className={BTN} onClick={() => simpan(f, "Pengaturan absen disimpan.")} disabled={sibuk || !berubah || !ada}>
            {sibuk ? "Menyimpan…" : "Simpan pengaturan"}
          </button>
          {diubah && (
            <button type="button" className={BTN_O} onClick={() => simpan(BAWAAN_ABSEN, "Pengaturan absen dikembalikan ke bawaan.")} disabled={sibuk || !ada}>
              Kembalikan ke bawaan
            </button>
          )}
        </div>
      )}
    </Kartu>
  );
}

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

      <KartuAturAbsen bisa={bisa} />
    </div>
  );
}
