"use client";

// app/sigap/ro/[kode]/Tab.tsx
//
// (24 Okt 2026) Isi tab halaman RO (hanya baca): Ringkasan, Anggaran, Administrasi. Gaya papan 9 dan 13 mockup: kartu KPI, tabel, filter, daftar item.
// Tiap tab mengambil datanya sendiri dan baru dimuat saat tab dibuka (hooks di app/sigap/ro/useKeu.ts, logika di lib/keu/ro.ts).

import Link from "next/link";
import { useMemo } from "react";
import { angka, persen, ringkasRo, rupiah, STATUS_RAB, urlBaca, type KomponenAnggaran } from "@/lib/keu/ro";
import type { WarnaChip } from "@/lib/keu/revisi";
import { Chip, Galat, judulKartu, kartu, kisi, Kosong, Kpi, Memuat, Potong, tombolKecil } from "../../keu-ui";
import { useAnggaranRo, useBacaKeu } from "../useKeu";

// ---------------------------------------------------------------- Ringkasan
type Skor = { total: number | string | null; kategori: string | null; ada_rab_sah: boolean; n_penarikan: number | string | null; n_volume: number | string | null; n_cakupan: number | string | null; n_disiplin: number | string | null; sampai_bulan: number | string };
type KekRo = { n_terbuka: number | string; jumlah_terbuka: number | string };
type AdmRo = { persen_terverifikasi: number | string | null; n_dok: number | string; n_belum: number | string };
const WARNA_KATEGORI_CHIP: Record<string, WarnaChip> = { Baik: "hijau", Cukup: "kuning", "Perlu pembinaan": "merah", Kurang: "merah" };
const tautTab = (kode: string, t: string) => `/sigap/ro/${encodeURIComponent(kode)}?tab=${t}`;

export function TabRingkasan({ kode }: { kode: string }) {
  const ang = useAnggaranRo(kode);
  const skor = useBacaKeu<Skor>(urlBaca("keu_v_skor_ro", { ro_kode: kode }, { urut: "-sampai_bulan", batas: 1 }));
  const kek = useBacaKeu<KekRo>(urlBaca("keu_v_kekurangan_ro", { ro_kode: kode }, { batas: 1 }));
  const adm = useBacaKeu<AdmRo>(urlBaca("keu_v_adm_ringkas", { ro_kode: kode }, { batas: 1 }));
  const r = useMemo(() => (ang.anggaran ? ringkasRo(ang.anggaran, skor.baris?.[0], kek.baris?.[0], adm.baris?.[0]) : null), [ang.anggaran, skor.baris, kek.baris, adm.baris]);

  if (ang.galat) return <Galat pesan={ang.galat} />;
  if (!r) return <Memuat />;
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`${kartu} flex flex-col gap-1`}>
        <h2 className={judulKartu}>Ringkasan RO</h2>
        <p className="text-[12.5px] text-[#5B6B84]">Gambaran satu RO: pagu, realisasi, status RAB, kekurangan, dan kelengkapan dokumen. Dari sini setiap kartu membuka tab yang bersangkutan.</p>
      </div>
      <div className={kisi}>
        <Kpi label="Pagu POK berlaku" nilai={rupiah(r.pok)} sub={`${angka(r.nItem)} baris POK`} />
        <Kpi label="Realisasi" nilai={rupiah(r.realisasi)} sub={`${persen(r.realisasi, r.pok)} dari pagu${ang.sampaiTanggal ? ` · s.d. ${ang.sampaiTanggal}` : ""}`} />
        <Kpi label="Jumlah RAB" nilai={rupiah(r.rabJumlah)} sub={ang.rab ? `RAB ${ang.rab.status.replace(/_/g, " ")}` : "Belum ada RAB"} />
        <Kpi label="Item sudah ber-RAB" nilai={`${angka(r.nItemBerRab)} / ${angka(r.nItem)}`} sub="dari seluruh baris POK" />
      </div>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        <section className={`${kartu} flex flex-col gap-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={judulKartu}>Skor kualitas RAB</h2>
            {r.skor?.kategori && <Chip warna={WARNA_KATEGORI_CHIP[r.skor.kategori] ?? "abu"}>{r.skor.kategori}</Chip>}
          </div>
          {r.skor ? (
            <p className="text-[26px] font-extrabold leading-none text-[#0F2A52]">{r.skor.total === null ? "-" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(r.skor.total)}</p>
          ) : (
            <p className="text-[13px] text-[#5B6B84]">Skor muncul setelah RO punya RAB yang disahkan.</p>
          )}
          <p className="text-[12px] text-[#5B6B84]">Rumus skor masih sementara dan menunggu keputusan PPK.</p>
        </section>

        <section className={`${kartu} flex flex-col gap-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={judulKartu}>Kekurangan RAB</h2>
            <Link href={tautTab(kode, "kekurangan")} className={`${tombolKecil} inline-flex items-center`}>Buka tab</Link>
          </div>
          {r.kekurangan.nTerbuka > 0 ? <Chip warna="kuning">{angka(r.kekurangan.nTerbuka)} catatan terbuka · {rupiah(r.kekurangan.jumlahTerbuka)}</Chip> : <Chip warna="hijau">Tidak ada catatan terbuka</Chip>}
          <p className="text-[12px] text-[#5B6B84]">Kebutuhan RAB yang melebihi pagu dicatat di sini, tidak ditulis ke POK.</p>
        </section>

        <section className={`${kartu} flex flex-col gap-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={judulKartu}>Administrasi</h2>
            <Link href={tautTab(kode, "administrasi")} className={`${tombolKecil} inline-flex items-center`}>Buka tab</Link>
          </div>
          {r.administrasi.nDok > 0 ? (
            <>
              <Chip warna={r.administrasi.nBelum > 0 ? "kuning" : "hijau"}>{r.administrasi.persenVerifikasi === null ? "-" : angka(r.administrasi.persenVerifikasi)}% dokumen terverifikasi</Chip>
              <p className="text-[12px] text-[#5B6B84]">{angka(r.administrasi.nBelum)} dokumen belum ada (dari {angka(r.administrasi.nDok)}).</p>
            </>
          ) : <p className="text-[13px] text-[#5B6B84]">Belum ada dokumen yang dipetakan.</p>}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Anggaran
function TabelAkun({ item }: { item: KomponenAnggaran["akun"][number]["item"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#DCE3EE] bg-white">
      <table className="w-full min-w-[640px] text-left text-[12.5px]">
        <thead className="bg-[#EEF3FB] text-[#44546F]">
          <tr><th className="px-2.5 py-2">Uraian item</th><th className="px-2.5 py-2">Volume</th><th className="px-2.5 py-2 text-right">POK</th><th className="px-2.5 py-2 text-right">Realisasi</th><th className="px-2.5 py-2 text-right">RAB</th><th className="px-2.5 py-2">Status RAB</th></tr>
        </thead>
        <tbody>
          {item.map((i) => (
            <tr key={i.detail_id} className="border-t border-[#EEF2F7] align-top">
              <td className="break-words px-2.5 py-2 font-semibold text-[#0F2A52]">{i.nomor_item ? `${i.nomor_item}. ` : ""}{i.uraian}</td>
              <td className="whitespace-nowrap px-2.5 py-2 text-[#5B6B84]">{angka(i.volume)} {i.satuan}</td>
              <td className="px-2.5 py-2 text-right font-semibold text-[#0F2A52]">{angka(i.pok)}</td>
              <td className="px-2.5 py-2 text-right font-semibold text-[#0F2A52]">{angka(i.realisasi)}</td>
              <td className="px-2.5 py-2 text-right font-semibold text-[#0F2A52]">{i.rab === null ? "-" : angka(i.rab)}</td>
              <td className="px-2.5 py-2 text-[#44546F]">{i.statusRab ? (STATUS_RAB[i.statusRab] ?? i.statusRab) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabAnggaran({ kode }: { kode: string }) {
  const ang = useAnggaranRo(kode);
  if (ang.galat) return <Galat pesan={ang.galat} />;
  if (!ang.anggaran) return <Memuat />;
  if (ang.anggaran.length === 0) return <Kosong teks="RO ini belum punya item pada POK yang berlaku." />;
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`${kartu} flex flex-col gap-1`}>
        <h2 className={judulKartu}>Anggaran: POK, realisasi, dan RAB</h2>
        <p className="text-[12.5px] text-[#5B6B84]">POK berlaku dibaca dari sistem, realisasi dari unggahan bendahara{ang.sampaiTanggal ? ` (sampai ${ang.sampaiTanggal})` : ""}, RAB dari ketua tim.</p>
      </div>
      {ang.terpotong && <Potong />}
      {ang.anggaran.map((k) => (
        <section key={k.komponen} className={`${kartu} flex flex-col gap-2`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={judulKartu}>Komponen {k.komponen}</h2>
            <p className="text-[14px] font-bold text-[#1F5FD1]">{rupiah(k.pok)}</p>
          </div>
          {k.akun.map((a) => (
            <details key={a.akun} className="rounded-lg border border-[#E8EDF5] bg-[#F9FBFE] px-3 py-1">
              <summary className="flex min-h-[44px] cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-[13px] font-semibold text-[#0F2A52]">
                <span><span className="font-mono">{a.akun}</span> · {a.item.length} item</span>
                <span className="text-[12.5px] font-normal text-[#44546F]">POK {rupiah(a.pok)} · realisasi {rupiah(a.realisasi)} ({persen(a.realisasi, a.pok)}) · RAB {rupiah(a.rab)}</span>
              </summary>
              <div className="pb-2.5"><TabelAkun item={a.item} /></div>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
