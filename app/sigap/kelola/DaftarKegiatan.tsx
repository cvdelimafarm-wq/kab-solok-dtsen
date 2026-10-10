"use client";

// app/sigap/kelola/DaftarKegiatan.tsx
//
// (10 Okt 2026) Daftar kegiatan per kegiatan induk -- halaman awal semua modul pengelolaan (Pelatihan, Transport Lokal,
// dan proses bisnis berikutnya). Permintaan user: "tampilkan dulu list ... berdasarkan kegiatan; demikian juga translok
// dan proses bisnis yang lain". Data: /api/sigap/kelola/daftar?modul=...; konfigurasi modul: lib/sigapKelolaModul.ts.

import { useEffect, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir, tglSedang } from "../admin/api";
import { Chip, Kartu, Memuat, Pesan } from "../admin/ui";
import type { KodeModulKelola, StatusKegiatan } from "@/lib/sigapKelolaModul";

export type KegiatanDaftar = {
  id: number;
  kode: string;
  nama: string;
  jenis: string | null;
  tanggal_mulai: string | null;
  tanggal_selesai: string | null;
  status: StatusKegiatan;
  jumlah_orang: number;
  boleh_kelola: boolean;
  tersambung: boolean;
};
type Data = { satuan: string; label_orang: string; grup: { induk_kode: string | null; induk_nama: string; kegiatan: KegiatanDaftar[] }[] };

const STATUS: Record<StatusKegiatan, { label: string; w: "ok" | "navy" | "mut" }> = {
  berlangsung: { label: "Berlangsung", w: "ok" },
  akan_datang: { label: "Akan datang", w: "navy" },
  selesai: { label: "Selesai", w: "mut" },
  nonaktif: { label: "Nonaktif", w: "mut" },
};
const URUT: Record<StatusKegiatan, number> = { berlangsung: 0, akan_datang: 1, selesai: 2, nonaktif: 3 };

function rentang(a: string | null, b: string | null) {
  if (!a && !b) return "Tanggal belum diatur";
  if (!b || a === b) return tglSedang(a ?? b);
  return `${tglSedang(a)} – ${tglSedang(b)}`;
}

export default function DaftarKegiatan({
  modul,
  onPilih,
  kosong,
  aksiKanan,
}: {
  modul: KodeModulKelola;
  onPilih: (k: KegiatanDaftar) => void;
  /** Pesan bila tidak ada kegiatan. */
  kosong?: React.ReactNode;
  /** Tombol tambahan di atas daftar (mis. "＋ Kegiatan baru"). */
  aksiKanan?: React.ReactNode;
}) {
  const [d, setD] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<Data>(`/api/sigap/kelola/daftar?modul=${modul}`)
      .then(setD)
      .catch((e) => {
        if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      });
  }, [modul]);

  if (galat) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!d) return <Memuat />;

  return (
    <div className="space-y-3">
      {aksiKanan && <div className="flex flex-wrap justify-end gap-2">{aksiKanan}</div>}
      {d.grup.length === 0 && <Pesan jenis="info">{kosong ?? `Belum ada ${d.satuan} yang bisa Anda kelola.`}</Pesan>}
      {d.grup.map((g) => (
        <Kartu key={g.induk_kode ?? "lain"} judul={g.induk_nama} ket={`${g.kegiatan.length} ${d.satuan}`}>
          <ul className="grid gap-2.5 md:grid-cols-2">
            {[...g.kegiatan]
              .sort((a, b) => URUT[a.status] - URUT[b.status])
              .map((k) => {
                const st = STATUS[k.status];
                return (
                  <li key={k.id}>
                    <button
                      type="button"
                      disabled={!k.tersambung}
                      onClick={() => onPilih(k)}
                      className="flex w-full flex-col gap-1.5 rounded-xl border border-[#E3E8EE] bg-white p-3.5 text-left transition hover:border-[#9DBEEB] hover:shadow disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none"
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Chip w={st.w}>{st.label}</Chip>
                        {k.jenis && <Chip>{k.jenis === "pelatihan" ? "Pelatihan" : k.jenis === "pendataan" ? "Pendataan" : k.jenis}</Chip>}
                        {!k.boleh_kelola && <Chip>Lihat saja</Chip>}
                        {!k.tersambung && <Chip w="wait">Belum tersambung</Chip>}
                      </span>
                      <span className="text-[15px] font-bold leading-snug text-[#14202E]">{k.nama}</span>
                      <span className="text-[12.5px] text-[#4D5B6B]">
                        {rentang(k.tanggal_mulai, k.tanggal_selesai)} · {k.jumlah_orang} {d.label_orang}
                      </span>
                      {k.tersambung && <span className="text-[12.5px] font-semibold text-[#1F6FD1]">Kelola →</span>}
                    </button>
                  </li>
                );
              })}
          </ul>
        </Kartu>
      ))}
    </div>
  );
}
