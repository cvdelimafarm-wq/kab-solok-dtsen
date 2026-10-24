"use client";

// app/sigap/revisi/kertas/Rab.tsx
//
// (24 Okt 2026) Sub-tab "RAB" dan "RAB bulanan" halaman Kertas Kerja per KRO, serta matriks perubahan POK (hanya baris yang berubah) dengan ekspor CSV.
// Hanya membaca: menyusun dan mengubah RAB tetap di tab RAB tiap RO (tombol Atur). Logika murni: lib/keu/rabKro.ts.

import Link from "next/link";
import { useMemo, useState } from "react";
import { LABEL_STATUS_RAB } from "@/lib/keu/rab";
import { angka, rupiah } from "@/lib/keu/ro";
import { n } from "@/lib/keu/kk";
import type { BarisMx } from "@/lib/keu/matriks";
import {
  barisBerubah, keCsv, LABEL_STATUS_ITEM, NAMA_BULAN_PANJANG, NAMA_BULAN_PENDEK, RENTANG_MINGGU, rentangBulan, STATUS_RAB_ITEM,
  type BarisRabKro, type RingkasBulanan, type RingkasRabKro, type StatusRabItem,
} from "@/lib/keu/rabKro";
import type { WarnaChip } from "@/lib/keu/revisi";
import { caps, Catatan, Chip, judulKartu, kartu, kisi, kolom, Kosong, Kpi, label, tombolAktif, tombolKecil } from "../../keu-ui";

const WARNA_ITEM: Record<StatusRabItem, WarnaChip> = { sama: "hijau", rinci: "biru", belum: "kuning", selesai: "abu" };
const fmtD = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${angka(Math.abs(v))}`);
const warnaD = (v: number) => (v > 0 ? "text-[#0B6B3F]" : v < 0 ? "text-[#9B1C23]" : "text-[#5B6B84]");
const tautanRab = (ro: string, dari: string) => `/sigap/ro/${encodeURIComponent(ro)}?tab=rab${dari ? `&dari=${encodeURIComponent(dari)}` : ""}`;

export type StatusRabRo = { ro: string; status: string | null; nomor: number | string | null };

// ---------------------------------------------------------------- sub-tab RAB
export function SubRab({ baris, ringkas, statusRo, namaRo, dari }: { baris: BarisRabKro[]; ringkas: RingkasRabKro; statusRo: StatusRabRo[]; namaRo: Map<string, string>; dari: string }) {
  const [saring, setSaring] = useState<StatusRabItem | "">("");
  const [roPilih, setRoPilih] = useState("");
  const tampil = useMemo(() => baris.filter((b) => (!saring || b.status === saring) && (!roPilih || b.ro === roPilih)), [baris, saring, roPilih]);
  const ros = statusRo.map((x) => x.ro);
  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${kartu} flex flex-col gap-2`}>
        <h2 className={judulKartu}>RAB per item ({ringkas.total} item)</h2>
        <p className="text-[12.5px] text-[#5B6B84]">Bentuk paling sederhana: RAB = Item. Rincian volume, harga, dan jadwal pencairan disusun di tab RAB tiap RO (tombol Atur). Halaman ini menyandingkan RAB dengan POK Menjadi pada kertas kerja.</p>
        <div className="flex flex-wrap gap-1.5">
          {statusRo.map((x) => (
            <Link key={x.ro} href={tautanRab(x.ro, dari)} className="no-underline">
              <Chip warna={x.status === "disetujui" ? "hijau" : x.status ? "kuning" : "abu"}>{x.ro}: {x.status ? `${LABEL_STATUS_RAB[x.status] ?? x.status}${x.nomor ? ` v${x.nomor}` : ""}` : "belum ada RAB"}</Chip>
            </Link>
          ))}
        </div>
      </section>

      <div className={kisi}>
        <Kpi label="Status RAB per item" nilai={`${ringkas.sama + ringkas.rinci} dari ${ringkas.total}`} sub={`${ringkas.sama} RAB = Item · ${ringkas.rinci} rinci · ${ringkas.belum} belum ada RAB · ${ringkas.selesai} selesai`} warna={ringkas.belum === 0 ? "hj" : "kn"} />
        <Kpi label="Item yang sudah punya RAB" nilai={rupiah(ringkas.rab)} sub={`POK Menjadi ${rupiah(ringkas.pokBerRab)}`} />
        <Kpi label="Selisih RAB terhadap POK" nilai={fmtD(ringkas.selisih)} sub={ringkas.selisih > 0 ? "Kebutuhan RAB melebihi POK" : ringkas.selisih < 0 ? "POK melebihi RAB" : "RAB sama dengan POK"} warna={ringkas.selisih > 0 ? "mr" : "hj"} />
        <Kpi label="Item selesai: dana bebas" nilai={rupiah(ringkas.danaBebas)} sub="POK Menjadi dikurangi Booked dan Realisasi" />
      </div>

      <section className={`${kartu} flex flex-col gap-2`}>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={saring === "" ? tombolAktif : tombolKecil} onClick={() => setSaring("")}>Semua</button>
          {STATUS_RAB_ITEM.map((s) => <button key={s} type="button" className={saring === s ? tombolAktif : tombolKecil} onClick={() => setSaring(saring === s ? "" : s)}>{LABEL_STATUS_ITEM[s]} ({baris.filter((b) => b.status === s).length})</button>)}
          {ros.length > 1 && (
            <div><label className={label} htmlFor="rab-ro">RO</label>
              <select id="rab-ro" className={`${kolom} !w-auto`} value={roPilih} onChange={(e) => setRoPilih(e.target.value)}><option value="">Semua RO</option>{ros.map((r) => <option key={r} value={r}>{r} {(namaRo.get(r) ?? "").slice(0, 30)}</option>)}</select></div>
          )}
        </div>
        {tampil.length === 0 ? <Kosong teks="Tidak ada item untuk saringan ini." /> : (
          <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
            <table className="w-full min-w-[980px] text-left text-[12.5px]">
              <thead className="bg-[#EEF3FB] text-[#44546F]"><tr>
                <th className="px-2.5 py-2">RO</th><th className="px-2.5 py-2">Kode</th><th className="px-2.5 py-2">Uraian</th><th className="px-2.5 py-2">Akun</th>
                <th className="px-2.5 py-2 text-right">POK Menjadi</th><th className="px-2.5 py-2 text-right">RAB</th><th className="px-2.5 py-2 text-right">Selisih</th>
                <th className="px-2.5 py-2 text-right">Booked</th><th className="px-2.5 py-2 text-right">Realisasi</th><th className="px-2.5 py-2 text-right">Sisa</th>
                <th className="px-2.5 py-2">Status RAB</th><th className="px-2.5 py-2">Tindakan</th></tr></thead>
              <tbody>{tampil.map((b) => (
                <tr key={b.id} className="border-t border-[#EEF2F7] align-top">
                  <td className="px-2.5 py-2 font-mono text-[11.5px]">{b.ro.slice(-3)}</td><td className="px-2.5 py-2 font-mono text-[11.5px]">{b.kode || "-"}</td>
                  <td className="min-w-[220px] px-2.5 py-2 text-[#0F2A52]">{b.uraian}{b.prioritas && <span className="ml-1 text-[11px] text-[#6B4FB3]">{b.prioritas}</span>}</td>
                  <td className="px-2.5 py-2 font-mono text-[11.5px]">{b.akun}</td>
                  <td className="px-2.5 py-2 text-right font-mono">{angka(b.pok)}</td><td className="px-2.5 py-2 text-right font-mono">{b.rab === null ? "-" : angka(b.rab)}</td>
                  <td className={`px-2.5 py-2 text-right font-mono font-semibold ${b.selisih === null ? "" : warnaD(b.selisih)}`}>{b.selisih === null ? "-" : fmtD(b.selisih)}</td>
                  <td className="px-2.5 py-2 text-right font-mono">{angka(b.booked)}</td><td className="px-2.5 py-2 text-right font-mono">{angka(b.real)}</td>
                  <td className={`px-2.5 py-2 text-right font-mono ${b.sisa < 0 ? "text-[#9B1C23]" : ""}`}>{angka(b.sisa)}</td>
                  <td className="px-2.5 py-2"><Chip warna={WARNA_ITEM[b.status]}>{LABEL_STATUS_ITEM[b.status]}</Chip></td>
                  <td className="px-2.5 py-2"><Link href={tautanRab(b.ro, dari)} className="text-[12.5px] font-semibold text-[#1F5FD1]">Atur</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <Catatan>Versi RAB (v1 Salinan POK, v2 Penyesuaian kebutuhan) dan alasan versi belum tersedia di halaman ini; RAB aktif dikelola per RO dengan alur ajukan, setujui, dan sahkan.</Catatan>
    </div>
  );
}

// ---------------------------------------------------------------- sub-tab RAB bulanan
export function SubBulanan({ r, namaRo, dari, memuat, adaRab }: { r: RingkasBulanan; namaRo: Map<string, string>; dari: string; memuat: boolean; adaRab: boolean }) {
  const [buka, setBuka] = useState<Set<number>>(new Set());
  const alih = (b: number) => setBuka((s) => { const x = new Set(s); if (x.has(b)) x.delete(b); else x.add(b); return x; });
  if (memuat) return <div className="h-40 animate-pulse rounded-xl bg-white" aria-busy="true" />;
  if (!adaRab || r.item.length === 0) return <Kosong teks="Belum ada jadwal pencairan. Perkiraan ini muncul setelah RAB disusun beserta jadwal bulanannya (item yang selesai tidak ikut)." />;
  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${kartu} flex flex-col gap-2`}>
        <h2 className={judulKartu}>Perkiraan kebutuhan pencairan per bulan, dengan tag minggu</h2>
        <p className="text-[12.5px] text-[#5B6B84]">Disusun per bulan dari jadwal tiap rincian RAB. Tiap bulan punya nilai dan tag minggu (M1 tgl 1-7, M2 tgl 8-14, M3 tgl 15-21, M4 tgl 22 sampai akhir bulan). Hanya item yang sudah punya RAB dan belum selesai. Total per bulan menjadi dasar RPD. Untuk mengubah, tekan Atur: tab RAB terbuka pada RO itu.</p>
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[1200px] text-left text-[12px]">
            <thead className="bg-[#EEF3FB] text-[#44546F]"><tr>
              <th className="px-2.5 py-2">Item</th>
              {NAMA_BULAN_PENDEK.map((b) => <th key={b} className="px-2 py-2 text-right">{b}</th>)}
              <th className="px-2.5 py-2 text-right">Total RAB</th><th className="px-2.5 py-2" />
            </tr></thead>
            <tbody>
              {r.item.map((it) => (
                <tr key={it.itemId} className="border-t border-[#EEF2F7] align-top">
                  <td className="min-w-[220px] px-2.5 py-1.5"><div className="text-[#0F2A52]">{it.uraian}</div><div className="font-mono text-[11px] text-[#7A8AA3]">akun {it.akun} · RO {it.ro.slice(-3)} · {rentangBulan(it.nilai)}</div></td>
                  {it.nilai.map((v, i) => <td key={i} className={`px-2 py-1.5 text-right font-mono ${v > 0 ? "text-[#0F2A52]" : "text-[#B5C0D3]"}`}>{v > 0 ? <>{angka(v)}<div className="text-[10.5px] text-[#6B4FB3]">M{it.minggu[i]}</div></> : "-"}</td>)}
                  <td className="px-2.5 py-1.5 text-right font-mono font-semibold text-[#0F2A52]">{angka(it.total)}</td>
                  <td className="px-2.5 py-1.5"><Link href={tautanRab(it.ro, dari)} className="font-semibold text-[#1F5FD1]">Atur</Link></td>
                </tr>
              ))}
              <tr className="border-t-2 border-[#C5D0E2] bg-[#F5F8FE] font-semibold text-[#0F2A52]">
                <td className="px-2.5 py-2">Total perkiraan pencairan</td>
                {r.perBulan.map((v, i) => <td key={i} className="px-2 py-2 text-right font-mono">{v > 0 ? angka(v) : "-"}</td>)}
                <td className="px-2.5 py-2 text-right font-mono">{angka(r.total)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${kartu} flex flex-col gap-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={judulKartu}>Tag minggu per bulan</h2>
          <div className="flex gap-1.5">
            <button type="button" className={tombolKecil} onClick={() => setBuka(new Set(r.perBulan.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0)))}>Buka semua bulan</button>
            <button type="button" className={tombolKecil} onClick={() => setBuka(new Set())}>Ciutkan semua</button>
          </div>
        </div>
        <p className="text-[12px] text-[#5B6B84]">Klik nama bulan untuk membuka rincian minggu dan baris rincian yang dicairkan pada bulan itu.</p>
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[1000px] text-left text-[12px]">
            <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Tag minggu</th>{NAMA_BULAN_PENDEK.map((b, i) => <th key={b} className="px-2 py-2 text-right"><button type="button" aria-expanded={buka.has(i)} onClick={() => alih(i)} className={`font-bold ${buka.has(i) ? "text-[#1F5FD1]" : ""}`}>{b}</button></th>)}<th className="px-2.5 py-2 text-right">Total</th></tr></thead>
            <tbody>
              {[1, 2, 3, 4].map((m) => (
                <tr key={m} className="border-t border-[#EEF2F7]"><td className="px-2.5 py-1.5">M{m} <span className="text-[11px] text-[#7A8AA3]">{RENTANG_MINGGU[m]}</span></td>
                  {r.perMinggu.map((w, i) => <td key={i} className="px-2 py-1.5 text-right font-mono">{w[m - 1] > 0 ? angka(w[m - 1]) : "-"}</td>)}
                  <td className="px-2.5 py-1.5 text-right font-mono font-semibold">{angka(r.perMinggu.reduce((s, w) => s + w[m - 1], 0))}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {[...buka].sort((a, b) => a - b).map((b) => (
          <div key={b} className="rounded-lg border border-[#E8EDF5] bg-[#F9FBFE] p-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><span className={caps}>{NAMA_BULAN_PANJANG[b]}</span><span className="font-mono text-[12.5px] font-semibold">{rupiah(r.perBulan[b])}</span></div>
            {[1, 2, 3, 4].filter((m) => r.perMinggu[b][m - 1] > 0).map((m) => (
              <div key={m} className="mt-1.5">
                <div className="flex flex-wrap justify-between gap-2 text-[12.5px] font-semibold text-[#44546F]"><span>M{m} · {RENTANG_MINGGU[m]}</span><span className="font-mono">{rupiah(r.perMinggu[b][m - 1])}</span></div>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {(r.rincian.get(b) ?? []).filter((x) => x.minggu === m).map((x, i) => (
                    <li key={i} className="flex flex-wrap justify-between gap-2 text-[12px] text-[#1B2B4B]"><span className="min-w-0 break-words">{x.uraian}{x.ket ? ` · ${x.ket}` : ""} <span className="text-[#7A8AA3]">akun {x.akun} · RO {x.ro.slice(-3)}{namaRo.get(x.ro) ? "" : ""}</span></span><span className="font-mono">{rupiah(x.nilai)}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- matriks perubahan POK
export function PerubahanPok({ baris, kro }: { baris: BarisMx[]; kro: string }) {
  const b = useMemo(() => barisBerubah(baris), [baris]);
  const tot = useMemo(() => ({ s: b.reduce((x, y) => x + n(y.jumlah_semula), 0), m: b.reduce((x, y) => x + n(y.jumlah_menjadi), 0) }), [b]);
  const unduh = () => {
    const isi = b.map((x) => [x.ro_kode, x.nomor ?? "", x.akun_menjadi, x.uraian_semula ?? "", n(x.vol_semula), n(x.harga_semula), n(x.jumlah_semula), x.uraian_menjadi ?? "", n(x.vol_menjadi), n(x.harga_menjadi), n(x.jumlah_menjadi), n(x.selisih), x.booked, x.real, x.pemicu ?? ""]);
    const csv = keCsv(["RO", "Kode", "Akun", "Uraian semula", "Vol semula", "Harga semula", "Jumlah semula", "Uraian menjadi", "Vol menjadi", "Harga menjadi", "Jumlah menjadi", "Selisih", "Booked", "Realisasi", "Pemicu"], isi);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `perubahan-pok-${kro}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  return (
    <details className={`${kartu} flex flex-col gap-2`}>
      <summary className="flex min-h-[40px] cursor-pointer list-none flex-wrap items-center justify-between gap-2"><h2 className={judulKartu}>Matriks perubahan POK, semula menjadi ({b.length} baris)</h2><span className="text-[12px] text-[#5B6B84]">Klik untuk membuka</span></summary>
      <p className="text-[12.5px] text-[#5B6B84]">Hanya baris yang berubah. Disusun otomatis dari kertas kerja; tidak diketik ulang.</p>
      {b.length === 0 ? <p className="text-[13px] text-[#5B6B84]">Belum ada perubahan.</p> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
            <table className="w-full min-w-[1000px] text-left text-[12px]">
              <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2 py-2">RO</th><th className="px-2 py-2">Kode</th><th className="px-2 py-2">Uraian semula</th><th className="px-2 py-2 text-right">Jumlah semula</th><th className="px-2 py-2">Uraian menjadi</th><th className="px-2 py-2 text-right">Jumlah menjadi</th><th className="px-2 py-2 text-right">Selisih</th><th className="px-2 py-2 text-right">Booked</th><th className="px-2 py-2 text-right">Realisasi</th><th className="px-2 py-2">Pemicu</th></tr></thead>
              <tbody>{b.map((x) => (
                <tr key={x.id} className="border-t border-[#EEF2F7] align-top">
                  <td className="px-2 py-1.5 font-mono text-[11px]">{x.ro_kode.slice(-3)}</td><td className="px-2 py-1.5 font-mono text-[11px]">{x.nomor ?? "-"}</td>
                  <td className="min-w-[180px] px-2 py-1.5">{x.uraian_semula ?? "-"}<div className="text-[11px] text-[#7A8AA3]">{x.detail_id === null ? "" : `${angka(x.vol_semula)} ${x.sat_semula ?? ""} @ ${angka(x.harga_semula)}`}</div></td>
                  <td className="px-2 py-1.5 text-right font-mono">{angka(x.jumlah_semula)}</td>
                  <td className="min-w-[180px] px-2 py-1.5">{x.uraian_menjadi ?? "-"}<div className="text-[11px] text-[#7A8AA3]">akun {x.akun_menjadi} · {angka(x.vol_menjadi)} {x.sat_menjadi ?? ""} @ {angka(x.harga_menjadi)}</div></td>
                  <td className="px-2 py-1.5 text-right font-mono">{angka(x.jumlah_menjadi)}</td>
                  <td className={`px-2 py-1.5 text-right font-mono font-semibold ${warnaD(n(x.selisih))}`}>{fmtD(n(x.selisih))}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{angka(x.booked)}</td><td className="px-2 py-1.5 text-right font-mono">{angka(x.real)}</td>
                  <td className="px-2 py-1.5">{x.pemicu && <Chip warna="biru">{x.pemicu}</Chip>}</td>
                </tr>
              ))}
                <tr className="border-t-2 border-[#C5D0E2] bg-[#F5F8FE] font-semibold"><td className="px-2 py-2" colSpan={3}>Total baris berubah</td><td className="px-2 py-2 text-right font-mono">{angka(tot.s)}</td><td /><td className="px-2 py-2 text-right font-mono">{angka(tot.m)}</td><td className={`px-2 py-2 text-right font-mono ${warnaD(tot.m - tot.s)}`}>{fmtD(tot.m - tot.s)}</td><td colSpan={3} /></tr>
              </tbody>
            </table>
          </div>
          <button type="button" className={`${tombolKecil} self-start`} onClick={unduh}>Ekspor CSV (dibuka di Excel)</button>
        </>
      )}
    </details>
  );
}
