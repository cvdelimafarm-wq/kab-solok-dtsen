"use client";

// app/sigap/kelola/pendataan/FiturKegiatan.tsx
//
// (30 Okt 2026) Layar "Fitur kegiatan" (tab 1 · Persiapan): pilih STRATEGI kegiatan dan centang fitur Kelola Pendataan yang dipakai. Strategi memilih
// paket bawaan; centang yang berbeda dari bawaan disimpan per kegiatan (lib/sigapFitur.ts). Fitur yang layarnya masih terikat data Pendataan Pascabencana
// tidak bisa dicentang untuk kegiatan lain dan diberi keterangan, bukan disembunyikan.

import { useEffect, useMemo, useState } from "react";
import { FITUR, STRATEGI, fiturEfektif, fiturTersedia, type PetaFitur, type StrategiKegiatan } from "@/lib/sigapFitur";
import { BTN, BTN_O, Kartu, Pesan } from "../../admin/ui";

type Props = {
  kegiatanId: number;
  nama: string;
  strategi: StrategiKegiatan;
  fitur: PetaFitur;
  siap: boolean;
  dimuat: boolean;
  galatMuat: string;
  onSimpan: (strategi: StrategiKegiatan, fitur: PetaFitur) => Promise<void>;
};

export default function FiturKegiatan({ kegiatanId, nama, strategi, fitur, siap, dimuat, galatMuat, onSimpan }: Props) {
  const [st, setSt] = useState<StrategiKegiatan>(strategi);
  const [peta, setPeta] = useState<PetaFitur>(fitur);
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);

  // draf mengikuti profil tersimpan (ganti survei, atau sesudah simpan)
  useEffect(() => {
    setSt(strategi);
    setPeta(fitur);
    setPesan(null);
  }, [strategi, fitur, kegiatanId]);

  const kelompok = useMemo(() => {
    const out: { nama: string; isi: typeof FITUR }[] = [];
    for (const f of FITUR) {
      const g = out.find((x) => x.nama === f.kelompok);
      if (g) g.isi.push(f);
      else out.push({ nama: f.kelompok, isi: [f] });
    }
    return out;
  }, []);

  const berubah = st !== strategi || FITUR.some((f) => peta[f.kode] !== fitur[f.kode]);
  const infoStrategi = STRATEGI.find((x) => x.kode === st);

  function gantiStrategi(baru: StrategiKegiatan) {
    setSt(baru);
    setPeta(fiturEfektif(baru, {}, kegiatanId)); // paket bawaan strategi baru; centang lama tidak dibawa
    setPesan(null);
  }

  async function simpan() {
    setMenyimpan(true);
    setPesan(null);
    try {
      await onSimpan(st, peta);
      setPesan({ jenis: "ok", teks: "Tersimpan. Tab di atas mengikuti pilihan ini." });
    } catch (e) {
      setPesan({ jenis: "galat", teks: e instanceof Error ? e.message : "Gagal menyimpan." });
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <Kartu
      judul="Fitur kegiatan"
      ket={`Atur fitur Kelola Pendataan untuk ${nama}. Strategi memilih paket bawaan; centang menyesuaikannya.`}
      kanan={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_O} disabled={menyimpan} onClick={() => gantiStrategi(st)}>
            Kembalikan ke bawaan strategi
          </button>
          <button type="button" className={BTN} disabled={!berubah || menyimpan || !siap} onClick={() => void simpan()}>
            {menyimpan ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      }
    >
      {galatMuat && <Pesan jenis="info">Profil fitur belum bisa dimuat ({galatMuat}); dipakai pengaturan bawaan kegiatan ini.</Pesan>}
      {dimuat && !siap && <Pesan jenis="info">Penyimpanan profil fitur belum aktif di basis data (migrasi 20261030e belum dijalankan). Pengaturan bawaan dipakai dan belum bisa diubah.</Pesan>}
      {pesan && <Pesan jenis={pesan.jenis === "ok" ? "ok" : "galat"}>{pesan.teks}</Pesan>}

      <label className="mt-3 block text-[12px] font-bold uppercase tracking-wide text-[#55657D]">
        Strategi kegiatan
        <select
          className="mt-1 block min-h-[42px] w-full max-w-xl rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] font-normal normal-case tracking-normal text-[#1E2B3F]"
          value={st}
          onChange={(e) => gantiStrategi(e.target.value as StrategiKegiatan)}
          disabled={!siap}
        >
          {STRATEGI.map((s) => (
            <option key={s.kode} value={s.kode}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {infoStrategi && <p className="mt-1 max-w-3xl text-[12.5px] text-[#6B7A90]">{infoStrategi.ket}</p>}

      <div className="mt-4 space-y-4">
        {kelompok.map((g) => (
          <div key={g.nama}>
            <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#55657D]">{g.nama}</p>
            <ul className="space-y-1.5">
              {g.isi.map((f) => {
                const ada = fiturTersedia(st, f.kode, kegiatanId);
                return (
                  <li key={f.kode}>
                    <label className={`flex items-start gap-2 text-[13.5px] ${ada ? "cursor-pointer text-[#1E2B3F]" : "cursor-not-allowed text-[#8A97AB]"}`}>
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#1F5FD1]"
                        checked={ada && peta[f.kode]}
                        disabled={!ada || !siap}
                        onChange={(e) => setPeta((p) => ({ ...p, [f.kode]: e.target.checked }))}
                      />
                      <span>
                        <b className="font-bold">{f.label}</b> <span className="text-[12.5px] text-[#6B7A90]">{f.ket}</span>
                        {!ada && (
                          <span className="mt-0.5 block text-[12px] text-[#8A6D1F]">
                            Layar ini masih membaca data Pendataan Pascabencana, jadi belum bisa dipakai untuk kegiatan ini. Dilepas bertahap.
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-[#6B7A90]">Tab 1 · Persiapan selalu tampil karena layar ini ada di sana. Mencentang tidak menghapus data apa pun; fitur yang dimatikan hanya disembunyikan.</p>
    </Kartu>
  );
}
