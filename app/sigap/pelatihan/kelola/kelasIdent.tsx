"use client";

// app/sigap/pelatihan/kelola/kelasIdent.tsx
//
// (1 Nov 2026) Tab "Kelas" di Kelola Pelatihan: kelas pelatihan menurut perencanaan (identifikasi lanjutan yang tertaut ke kegiatan), HANYA BACA,
// beserta jumlah peserta per kelas (dari penugasan) dan peringatan isian. API: /api/sigap/pelatihan/kelas?mode=admin. Logika: lib/sigapKelasIdent.ts.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { Chip, Kartu, Memuat, Pesan, TD, TH, TabelKartu } from "../../admin/ui";
import { rentangTanggal, type AturanMode, type BandingPeriode, type KelasInfo, type PeriodeRencana, type PeringatanKelas } from "@/lib/sigapKelasIdent";

type KelasAdmin = KelasInfo & { aturan: AturanMode | null; peserta: number };
type Data = {
  tersambung: boolean;
  ident: { id: number; nama: string | null; status_lanjutan: "draf" | "final" | null; versi: number | null } | null;
  kelas: KelasAdmin[];
  jumlah_peserta: number;
  tanpa_kelas: number;
  di_luar: number;
  peringatan: PeringatanKelas[];
  kegiatan: { tanggal_mulai: string | null; tanggal_selesai: string | null };
  periode_rencana: PeriodeRencana | null;
  banding_periode: BandingPeriode | null;
};

const WARNA = { Daring: "navy", Luring: "ok", Hybrid: "wait" } as const;
const NAMA_PERAN: Record<string, string> = { supervisor: "Supervisor", kortim: "Kortim", pml: "PML", ppl: "PPL", entri: "Entri" };

export default function KelasIdentKelola() {
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const muat = useCallback(async () => {
    try {
      setData(await fetchJson<Data>(urlPelatihan("/api/sigap/pelatihan/kelas?mode=admin")));
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, []);
  useEffect(() => {
    if (!bacaSesi()) return;
    void muat();
  }, [muat]);

  if (galat) return <Pesan jenis="galat">{galat}</Pesan>;
  if (!data) return <Memuat />;
  if (!data.tersambung) {
    return (
      <Pesan jenis="info">
        Pelatihan ini belum ditautkan ke identifikasi (perencanaan). Tautkan lewat kartu Pelaksanaan pada identifikasi kegiatan; setelah itu bentuk kelas (daring/luring/hybrid), jadwal, dan tempat dari perencanaan tampil di sini dan di layar peserta.
      </Pesan>
    );
  }
  const id = data.ident;
  return (
    <div className="space-y-3">
      <Kartu
        judul="Kelas menurut perencanaan"
        ket={`${id?.nama ?? "Identifikasi"}${id?.versi ? ` · lanjutan v${id.versi}` : ""} · hanya baca`}
        kanan={id?.status_lanjutan ? <Chip w={id.status_lanjutan === "final" ? "ok" : "wait"}>{id.status_lanjutan === "final" ? "Final" : "Draf"}</Chip> : <Chip w="mut">Lanjutan belum ada</Chip>}
      >
        {data.kelas.length === 0 ? (
          <p className="text-[13px] text-[#7B8794]">Identifikasi sudah tertaut, tetapi belum ada kelas pada isian lanjutannya.</p>
        ) : (
          <TabelKartu className="!shadow-none">
            <thead>
              <tr>
                <th className={TH}>Kelas</th>
                <th className={TH}>Bentuk</th>
                <th className={TH}>Jadwal</th>
                <th className={TH}>Tempat</th>
                <th className={TH}>Peran</th>
                <th className={TH}>Peserta</th>
              </tr>
            </thead>
            <tbody>
              {data.kelas.map((k) => (
                <tr key={k.id}>
                  <td className={`${TD} font-semibold`}>
                    {k.nomor}. {k.nama}
                    {k.sesi === "briefing" && <span className="ml-1 text-[11.5px] font-normal text-[#7B8794]">(briefing)</span>}
                  </td>
                  <td className={TD}>{k.metode ? <Chip w={WARNA[k.metode]}>{k.metode}</Chip> : <Chip w="mut">Belum diisi</Chip>}</td>
                  <td className={TD}>
                    {rentangTanggal(k.mulai, k.selesai)}
                    {k.hari > 1 && <span className="text-[#7B8794]"> · {k.hari} hari</span>}
                  </td>
                  <td className={TD}>{k.lokasi || "–"}</td>
                  <td className={TD}>{k.untuk.map((p) => NAMA_PERAN[p] ?? p).join(", ") || "–"}</td>
                  <td className={`${TD} tabular-nums`}>{k.peserta}</td>
                </tr>
              ))}
            </tbody>
          </TabelKartu>
        )}
        <p className="mt-2 text-[12.5px] text-[#5B6B84]">
          {data.jumlah_peserta} peserta pada penugasan · {data.tanpa_kelas} belum dibagi ke kelas
          {data.di_luar > 0 ? ` · ${data.di_luar} bernomor kelas yang tidak ada pada perencanaan` : ""}. Urutan kelas di atas = nomor kelas pada penugasan.
        </p>
      </Kartu>
      {data.periode_rencana && data.banding_periode && data.banding_periode !== "sama" && (
        <Pesan jenis="info">
          <strong>Tanggal kegiatan belum sama dengan perencanaan.</strong> Kelas pada perencanaan berlangsung {rentangTanggal(data.periode_rencana.mulai, data.periode_rencana.selesai)}, sedangkan periode kegiatan{" "}
          {data.banding_periode === "kosong" ? "belum diisi" : `tercatat ${rentangTanggal(data.kegiatan.tanggal_mulai ?? "", data.kegiatan.tanggal_selesai ?? "")}`}. Hari presensi mengikuti periode kegiatan; samakan lewat tab Kegiatan (panel &quot;Usulan dari perencanaan&quot;).
        </Pesan>
      )}
      {data.peringatan.length > 0 && (
        <Pesan jenis="info">
          <strong>Perlu dilengkapi pada perencanaan:</strong>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {data.peringatan.map((p, i) => (
              <li key={i}>{p.pesan}</li>
            ))}
          </ul>
        </Pesan>
      )}
    </div>
  );
}
