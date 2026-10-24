"use client";

// app/sigap/ro/page.tsx
//
// (24 Okt 2026) Daftar Rincian Output (RO) -- Kertas Kerja Revisi POK, hanya baca. Keputusan Bapak 24 Okt 2026: semua pegawai organik boleh
// MELIHAT semua RO; daftar mengikuti hak lihat itu. Mengubah RAB dan revisi tidak dilakukan di sini (hak ditegakkan basis data).
// Satu alamat per RO: /sigap/ro/<KODE> (aturan D-24).

import Link from "next/link";
import { useMemo, useState } from "react";
import TombolKembali from "@/app/components/TombolKembali";
import { angka, persen, rupiah, urlBaca, WARNA_KATEGORI } from "@/lib/keu/ro";
import { useBacaKeu, usePenugasan } from "./useKeu";

type Ro = { kode: string; nama: string; sementara: boolean; aktif: boolean };
type Adm = { ro_kode: string; jumlah_item: number | string | null; n_item: number | string };
type Real = { ro_kode: string; real_sd: number | string; pagu: number | string; persen: number | string | null; sampai_tanggal: string };
type Skor = { ro_kode: string; total: number | string | null; kategori: string | null; ada_rab_sah: boolean; sampai_bulan: number | string };
type Kek = { ro_kode: string; n_terbuka: number | string; jumlah_terbuka: number | string };

const kartu = "rounded-[20px] bg-white p-4 shadow-[0_4px_16px_rgba(15,42,82,0.08)]";

function pertama<T extends { ro_kode: string }>(baris: T[] | null): Map<string, T> {
  const m = new Map<string, T>();
  for (const b of baris ?? []) if (!m.has(b.ro_kode)) m.set(b.ro_kode, b);
  return m;
}

export default function DaftarRo() {
  const [cari, setCari] = useState("");
  const ro = useBacaKeu<Ro>(urlBaca("keu_ro", {}, { urut: "kode", batas: 2000, kolom: ["kode", "nama", "sementara", "aktif"] }));
  const adm = useBacaKeu<Adm>(urlBaca("keu_v_adm_ringkas", {}, { batas: 2000, kolom: ["ro_kode", "jumlah_item", "n_item"] }));
  const real = useBacaKeu<Real>(urlBaca("keu_v_realisasi_ro", {}, { urut: "-sampai_tanggal", batas: 2000, kolom: ["ro_kode", "real_sd", "pagu", "persen", "sampai_tanggal"] }));
  const skor = useBacaKeu<Skor>(urlBaca("keu_v_skor_ro", {}, { urut: "-sampai_bulan", batas: 2000, kolom: ["ro_kode", "total", "kategori", "ada_rab_sah", "sampai_bulan"] }));
  const kek = useBacaKeu<Kek>(urlBaca("keu_v_kekurangan_ro", {}, { batas: 2000, kolom: ["ro_kode", "n_terbuka", "jumlah_terbuka"] }));
  const tugas = usePenugasan();

  const peta = useMemo(() => ({ adm: pertama(adm.baris), real: pertama(real.baris), skor: pertama(skor.baris), kek: pertama(kek.baris) }), [adm.baris, real.baris, skor.baris, kek.baris]);
  const ketuaPer = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const b of tugas.baris ?? []) {
      if (b.peran_kode !== "KETUA" || !b.aktif_hari_ini || !b.ro_kode) continue;
      const l = m.get(b.ro_kode) ?? [];
      if (!l.includes(b.akun_nama)) l.push(b.akun_nama);
      m.set(b.ro_kode, l);
    }
    return m;
  }, [tugas.baris]);

  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (ro.baris ?? []).filter((r) => r.aktif && (!q || r.kode.toLowerCase().includes(q) || r.nama.toLowerCase().includes(q)));
  }, [ro.baris, cari]);

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-12 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-16 pt-5 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2">
          <TombolKembali tema="gelap" className="max-w-[40%] flex-none" />
          <span className="truncate text-[12.5px] font-bold text-[#D3E0F5]">Kertas Kerja Revisi POK</span>
        </div>
        <h1 className="relative mx-auto mt-3 max-w-xl text-[20px] font-extrabold leading-tight tracking-[-0.3px]">Rincian Output (RO)</h1>
        <p className="relative mx-auto mt-1.5 max-w-xl text-[12.5px] text-[#A9BCD8]">Semua RO dapat dilihat oleh pegawai organik. Halaman ini hanya untuk melihat.</p>
      </header>

      <div className="relative z-10 mx-auto -mt-10 max-w-xl space-y-3 px-3.5">
        <div className={kartu}>
          <label htmlFor="cari-ro" className="sr-only">Cari RO</label>
          <input
            id="cari-ro"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Cari kode atau nama RO"
            value={cari}
            onChange={(e) => setCari(e.target.value.slice(0, 60))}
            className="box-border h-11 w-full rounded-[12px] border-[1.5px] border-[#C5D0E2] bg-[#F8FBFF] px-3.5 text-[14.5px] font-semibold text-[#0F2A52] placeholder:text-[#8A97AB]"
          />
        </div>

        <Link href="/sigap/realisasi" className={`${kartu} flex min-h-[44px] items-center justify-between gap-2 text-[13.5px] font-extrabold text-[#1F5FD1] active:bg-[#F0F5FF]`}>
          <span>Realisasi anggaran (unggah GLP039)</span>
          <span aria-hidden>›</span>
        </Link>

        {ro.galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{ro.galat}</p>}
        {ro.memuat && <div className="h-40 animate-pulse rounded-[20px] bg-white" aria-busy="true" />}
        {ro.baris && daftar.length === 0 && <p className={`${kartu} text-[13.5px] text-[#5B6B84]`}>{cari ? "Tidak ada RO yang cocok." : "Belum ada RO."}</p>}
        {tugas.galat && ro.baris && <p className="rounded-[14px] bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-bold text-[#8A6200]">Nama ketua tim belum tersedia (tampilan penugasan belum dipasang di basis data).</p>}

        <ul className="space-y-2.5">
          {daftar.map((r) => {
            const a = peta.adm.get(r.kode);
            const p = peta.real.get(r.kode);
            const s = peta.skor.get(r.kode);
            const k = peta.kek.get(r.kode);
            const ketua = ketuaPer.get(r.kode);
            const nKek = Number(k?.n_terbuka ?? 0);
            return (
              <li key={r.kode}>
                <Link href={`/sigap/ro/${encodeURIComponent(r.kode)}`} className={`${kartu} block min-h-[44px] active:bg-[#F0F5FF]`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-extrabold tracking-wide text-[#1F5FD1]">{r.kode}{r.sementara ? " · sementara" : ""}</p>
                      <p className="mt-0.5 break-words text-[14.5px] font-extrabold leading-snug text-[#0F2A52]">{r.nama}</p>
                    </div>
                    {s?.ada_rab_sah && s.kategori && (
                      <span className={`flex-none rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${WARNA_KATEGORI[s.kategori] ?? "bg-[#EEF2F7] text-[#44546F]"}`}>{s.kategori}</span>
                    )}
                  </div>
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
                    <div>
                      <dt className="text-[#6B7A93]">Pagu POK</dt>
                      <dd className="font-extrabold text-[#0F2A52]">{rupiah(a?.jumlah_item)}</dd>
                    </div>
                    <div>
                      <dt className="text-[#6B7A93]">Realisasi</dt>
                      <dd className="font-extrabold text-[#0F2A52]">{p ? persen(Number(p.real_sd), Number(p.pagu)) : "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-[#6B7A93]">Ketua tim</dt>
                      <dd className="break-words font-bold text-[#0F2A52]">{ketua?.length ? ketua.join(", ") : <span className="font-semibold text-[#8A6200]">Belum ditugaskan</span>}</dd>
                    </div>
                    <div>
                      <dt className="text-[#6B7A93]">Kekurangan RAB</dt>
                      <dd className="font-bold text-[#0F2A52]">{nKek > 0 ? `${angka(nKek)} catatan · ${rupiah(k?.jumlah_terbuka)}` : "Tidak ada"}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
