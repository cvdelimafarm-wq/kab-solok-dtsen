"use client";

// app/sigap/ro/page.tsx
//
// (24 Okt 2026) Daftar Rincian Output (RO) -- Kertas Kerja Revisi POK, hanya baca. Keputusan Bapak 24 Okt 2026: semua pegawai organik boleh
// MELIHAT semua RO; daftar mengikuti hak lihat itu. Mengubah RAB dan revisi tidak dilakukan di sini (hak ditegakkan basis data).
// Satu alamat per RO: /sigap/ro/<KODE> (aturan D-24).

import Link from "next/link";
import { useMemo, useState } from "react";
import { Catatan, Chip, Galat, HalamanKeu, Kpi, kartu, kisi, kolom, Memuat, tombolKecil, Tenang } from "../keu-ui";
import { angka, persen, rupiah, urlBaca } from "@/lib/keu/ro";
import type { WarnaChip } from "@/lib/keu/revisi";
import { useBacaKeu, usePenugasan } from "./useKeu";

type Ro = { kode: string; nama: string; sementara: boolean; aktif: boolean };
type Adm = { ro_kode: string; jumlah_item: number | string | null; n_item: number | string };
type Real = { ro_kode: string; real_sd: number | string; pagu: number | string; persen: number | string | null; sampai_tanggal: string };
type Skor = { ro_kode: string; total: number | string | null; kategori: string | null; ada_rab_sah: boolean; sampai_bulan: number | string };
type Kek = { ro_kode: string; n_terbuka: number | string; jumlah_terbuka: number | string };

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

  const totalPagu = (adm.baris ?? []).reduce((a, x) => a + Number(x.jumlah_item ?? 0), 0);
  const totalKek = (kek.baris ?? []).reduce((a, x) => a + Number(x.n_terbuka ?? 0), 0);
  const jumlahKek = (kek.baris ?? []).reduce((a, x) => a + Number(x.jumlah_terbuka ?? 0), 0);
  const nAktif = (ro.baris ?? []).filter((r) => r.aktif).length;
  const tanpaKetua = daftar.filter((r) => !ketuaPer.get(r.kode)?.length).length;
  const warnaKategori: Record<string, WarnaChip> = { Baik: "hijau", Cukup: "kuning", Kurang: "merah" };

  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Anggaran" }, { t: "Rincian Output (RO)" }]}
      judul="Rincian Output (RO): satu ruang kerja per RO"
      sub="Semua pegawai organik dapat melihat semua RO. Mengubah RAB, usulan, dan catatan hanya untuk yang berwenang pada RO itu (ditegakkan basis data)."
    >
      <Tenang>
        Pilih sebuah RO untuk membuka ruang kerjanya: Ringkasan, Anggaran, RAB, Administrasi, dan Kekurangan RAB berada di satu halaman dengan satu alamat per RO dan tab, jadi tautan yang dikirim lewat WhatsApp membawa penerima ke tempat yang sama.
      </Tenang>

      <div className={kisi}>
        <Kpi label="RO aktif" nilai={ro.baris ? angka(nAktif) : "-"} sub={tanpaKetua > 0 && tugas.baris ? `${angka(tanpaKetua)} belum punya ketua tim` : "semua ber-ketua tim"} />
        <Kpi label="Pagu POK seluruh RO" nilai={adm.baris ? rupiah(totalPagu) : "-"} sub="menurut POK yang berlaku" />
        <Kpi label="Kekurangan RAB terbuka" nilai={kek.baris ? angka(totalKek) : "-"} sub={kek.baris ? `${rupiah(jumlahKek)} dicatat` : undefined} warna={totalKek > 0 ? "kn" : undefined} />
      </div>

      <div className={`${kartu} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-bold text-[#0F2A52]">Daftar RO</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/sigap/realisasi" className={`${tombolKecil} inline-flex items-center`}>Realisasi anggaran</Link>
            <Link href="/sigap/revisi" className={`${tombolKecil} inline-flex items-center`}>Jadwal dan pengesahan revisi</Link>
          </div>
        </div>
        <div>
          <label htmlFor="cari-ro" className="sr-only">Cari RO</label>
          <input id="cari-ro" type="search" inputMode="search" autoComplete="off" placeholder="Cari kode atau nama RO" value={cari} onChange={(e) => setCari(e.target.value.slice(0, 60))} className={kolom} />
        </div>
        <Galat pesan={ro.galat} />
        {ro.memuat && <Memuat tinggi="h-40" />}
        {ro.baris && daftar.length === 0 && <p className="text-[13px] text-[#5B6B84]">{cari ? "Tidak ada RO yang cocok." : "Belum ada RO."}</p>}
        {tugas.galat && ro.baris && <Catatan>Nama ketua tim belum tersedia (tampilan penugasan belum dipasang di basis data).</Catatan>}

        <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]">
          {daftar.map((r) => {
            const a = peta.adm.get(r.kode);
            const p = peta.real.get(r.kode);
            const s = peta.skor.get(r.kode);
            const k = peta.kek.get(r.kode);
            const ketua = ketuaPer.get(r.kode);
            const nKek = Number(k?.n_terbuka ?? 0);
            return (
              <li key={r.kode} className="min-w-0">
                <Link href={`/sigap/ro/${encodeURIComponent(r.kode)}`} className="flex h-full min-h-[44px] flex-col gap-2 rounded-lg border border-[#DCE3EE] bg-white px-3 py-2.5 hover:bg-[#F3F8FE]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[13px] font-semibold text-[#1F5FD1]">{r.kode}{r.sementara ? " · sementara" : ""}</p>
                      <p className="break-words text-[13.5px] font-semibold leading-snug text-[#0F2A52]">{r.nama}</p>
                    </div>
                    {s?.ada_rab_sah && s.kategori && <Chip warna={warnaKategori[s.kategori] ?? "abu"}>{s.kategori}</Chip>}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
                    <div><dt className="text-[#5B6B84]">Pagu POK</dt><dd className="font-bold text-[#0F2A52]">{rupiah(a?.jumlah_item)}</dd></div>
                    <div><dt className="text-[#5B6B84]">Realisasi</dt><dd className="font-bold text-[#0F2A52]">{p ? persen(Number(p.real_sd), Number(p.pagu)) : "-"}</dd></div>
                    <div><dt className="text-[#5B6B84]">Ketua tim</dt><dd className="break-words font-semibold text-[#0F2A52]">{ketua?.length ? ketua.join(", ") : <span className="text-[#8A6200]">Belum ditugaskan</span>}</dd></div>
                    <div><dt className="text-[#5B6B84]">Kekurangan RAB</dt><dd className="font-semibold text-[#0F2A52]">{nKek > 0 ? `${angka(nKek)} catatan · ${rupiah(k?.jumlah_terbuka)}` : "Tidak ada"}</dd></div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </HalamanKeu>
  );
}
