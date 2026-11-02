"use client";

// app/sigap/pelatihan/instrumen/page.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan > tab "Instrumen": kuesioner, buku pedoman, dan PPT materi pelatihan yang dapat diunduh peserta.
// (2 Nov 2026) Unggah dipindah ke Kelola Pelatihan > Persiapan > Instrumen (halaman ini hanya untuk membuka). Berkas boleh lebih dari satu per jenis.
// Berkas yang pernah diunduh disimpan di HP: lain kali langsung terbuka tanpa unduh ulang (lib/berkasLokal.ts), dan kartunya menunjukkan statusnya.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { bacaSesi, fetchJson, keMasuk, pesanGalat, SesiBerakhir, tglSedang } from "../../admin/api";
import { BTN, BTN_O, Chip, Kartu, Memuat, Pesan } from "../../admin/ui";
import { Kerangka } from "../komponen";
import BagianMateri from "./BagianMateri"; // (2 Nov 2026) Tahap C: video + tautan wajib dilacak
import { JudulIkon } from "./IkonInstrumen"; // (2 Nov 2026) ikon SVG menggantikan emoji
import { unduhBerkas } from "./unduhBerkas";
import { idBerkasTersimpan } from "@/lib/berkasLokal";
import { GRUP_BERKAS, ukuranTeks, type BerkasInstrumen } from "@/lib/instrumenBerkas";

type Daftar = { boleh_kelola: boolean; berkas: BerkasInstrumen[] };

const URL_INSTRUMEN = "/api/sigap/pelatihan/instrumen";
const TAUTAN_KELOLA = "/sigap/kelola/pelatihan?tab=persiapan&sub=instrumen";

export default function HalamanInstrumen() {
  const [data, setData] = useState<Daftar | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);
  const [diHp, setDiHp] = useState<Set<number>>(new Set());

  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<Daftar>(URL_INSTRUMEN));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
    setDiHp(await idBerkasTersimpan());
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    void muat();
  }, [muat]);

  async function buka(b: BerkasInstrumen) {
    setSibuk(b.id);
    setGalat(null);
    setInfo(null);
    try {
      const h = await unduhBerkas(b);
      setDiHp(await idBerkasTersimpan());
      if (!h.dibuka) setInfo(`Browser memblokir tab baru. Ketuk "Buka" sekali lagi${h.tersimpan ? " (berkas sudah tersimpan di HP)" : ""}.`);
      else if (h.dari === "server" && !h.tersimpan) setInfo("Berkas dibuka, tetapi tidak dapat disimpan di HP ini; lain kali akan diunduh lagi.");
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(null);
    }
  }

  const semuaKosong = !!data && data.berkas.length === 0;

  return (
    <Kerangka aktif="instrumen" judul="Instrumen Pelatihan" sub="Video, tautan, kuesioner, buku pedoman, dan PPT materi" langkah="instrumen">
      {galat && <Pesan jenis="galat" onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {info && <Pesan jenis="info" onTutup={() => setInfo(null)}>{info}</Pesan>}
      <BagianMateri />
      {!data && !galat && <Memuat />}
      {data && data.boleh_kelola && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#CBD6E6] bg-[#F5F8FE] px-3 py-2 text-[13px] text-[#34455F]">
          <span>{semuaKosong ? "Belum ada berkas yang diunggah." : "Mengunggah atau menyembunyikan berkas dilakukan di Kelola Pelatihan."}</span>
          <Link href={TAUTAN_KELOLA} className="inline-flex min-h-[40px] items-center rounded-full bg-[#1F5FD1] px-4 text-[13px] font-extrabold text-white">
            Unggah di Kelola Pelatihan →
          </Link>
        </div>
      )}
      {data &&
        GRUP_BERKAS.map((g) => {
          const daftar = data.berkas.filter((b) => b.jenis === g.jenis);
          return (
            <Kartu
              key={g.jenis}
              judul={<JudulIkon kunci={g.jenis} teks={g.judul} />}
              ket={g.ket}
              kanan={<Chip w={daftar.length > 0 ? "ok" : "mut"}>{daftar.length > 0 ? `${daftar.length} berkas` : "Belum diunggah"}</Chip>}
            >
              {daftar.length === 0 ? (
                <p className="rounded-lg bg-[#F6F8FB] px-3 py-2.5 text-[13px] text-[#6B7A90]">{g.kosong}</p>
              ) : (
                <ul className="space-y-2">
                  {daftar.map((b) => {
                    const tersimpan = diHp.has(b.id);
                    return (
                      <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#DDE6F3] px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-semibold leading-snug">{b.judul}</p>
                          <p className="text-[11.5px] text-[#6B7A90]">
                            {b.nama_file}
                            {b.ukuran ? ` · ${ukuranTeks(b.ukuran)}` : ""} · diunggah {tglSedang(b.diunggah_at)}
                          </p>
                          <p className="mt-1">
                            <Chip w={tersimpan ? "ok" : "mut"}>{tersimpan ? "✓ Sudah diunduh · tersimpan di HP" : "Belum diunduh"}</Chip>
                          </p>
                        </div>
                        <button type="button" className={tersimpan ? BTN_O : BTN} disabled={sibuk === b.id} onClick={() => void buka(b)}>
                          {sibuk === b.id ? "Menyiapkan…" : tersimpan ? "Buka" : "⬇ Unduh"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Kartu>
          );
        })}
    </Kerangka>
  );
}
