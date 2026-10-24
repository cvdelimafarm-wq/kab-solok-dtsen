"use client";

// app/sigap/revisi/kertas/Rab.tsx
//
// (24 Okt 2026) Sub-tab "RAB" dan "RAB bulanan" halaman Kertas Kerja per KRO, serta matriks perubahan POK (hanya baris yang berubah) dengan ekspor CSV.
// Hanya membaca: menyusun dan mengubah RAB tetap di tab RAB tiap RO (tombol Atur). Logika murni: lib/keu/rabKro.ts.

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { angka } from "@/lib/keu/ro";
import { n } from "@/lib/keu/kk";
import type { BarisMx } from "@/lib/keu/matriks";
import {
  barisBerubah, barisJadwalBeda, bayangBiru, kelompokBulanan, keCsv, ketBulan, NAMA_BULAN_PANJANG, NAMA_BULAN_PENDEK, PILIHAN_FORMAT, RENTANG_MINGGU, rentangBulan, susunBulanan, susunPencairan,
  teksBeda, teksCatatanPencairan, teksTag, USULAN_TAG, type FormatBulanan, type ItemBulanan, type JadwalItem,
} from "@/lib/keu/rabKro";
import { lembarExcel, susunIsiLembar } from "@/lib/keu/lembarPerubahan";
import { Catatan, Chip, judulKartu, kartu, Kosong, tombolAktif, tombolKecil } from "../../keu-ui";

const fmtD = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${angka(Math.abs(v))}`);
const warnaD = (v: number) => (v > 0 ? "text-[#0B6B3F]" : v < 0 ? "text-[#9B1C23]" : "text-[#5B6B84]");
const tautanRab = (ro: string, dari: string) => `/sigap/ro/${encodeURIComponent(ro)}?tab=rab${dari ? `&dari=${encodeURIComponent(dari)}` : ""}`;

// ---------------------------------------------------------------- sub-tab RAB bulanan dan panel perkiraan pencairan
export type StateBulanan = { format: FormatBulanan; ro: string };

const bln = (v: number) => (v > 0 ? angka(v) : "–");
const putar = (buka: boolean) => ({ transform: buka ? "rotate(90deg)" : "rotate(0deg)" });
const Panah = ({ buka }: { buka: boolean }) => (
  <span className="inline-flex" style={putar(buka)}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2l4 4-4 4" /></svg></span>
);

/** Pilihan format (ke samping / lipat per bulan) dan saringan RO; dipakai bersama oleh RAB bulanan dan perkiraan pencairan. */
function BarFormat({ st, ubah, roDaftar }: { st: StateBulanan; ubah: (s: StateBulanan) => void; roDaftar: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[12px] text-[#7A8AA3]">Format:</span>
      {PILIHAN_FORMAT.map((f) => <button key={f.kode} type="button" aria-pressed={st.format === f.kode} className={st.format === f.kode ? tombolAktif : tombolKecil} onClick={() => ubah({ ...st, format: f.kode })}>{f.nama}</button>)}
      <span className="w-2.5" />
      {["", ...roDaftar].map((ro) => <button key={ro || "semua"} type="button" aria-pressed={st.ro === ro} className={st.ro === ro ? tombolAktif : tombolKecil} onClick={() => ubah({ ...st, ro })}>{ro ? `RO ${ro.split(".").pop()}` : "Semua RO"}</button>)}
    </div>
  );
}

type PropBulanan = {
  jadwal: JadwalItem[]; jumlahRincian: Map<number, number>; kodeItem: Map<number, string>; namaRo: Map<string, string>; roDaftar: string[];
  st: StateBulanan; ubah: (s: StateBulanan) => void; dari: string; memuat: boolean; adaRab: boolean;
};

const KOSONG = "Belum ada jadwal pencairan. Perkiraan ini muncul setelah RAB disusun beserta jadwal bulanannya (item yang selesai tidak ikut).";

function CatatanBeda({ jadwal, jumlahRincian }: { jadwal: JadwalItem[]; jumlahRincian: Map<number, number> }) {
  const beda = useMemo(() => barisJadwalBeda(jadwal, jumlahRincian), [jadwal, jumlahRincian]);
  return beda.length > 0 ? <Catatan>{teksBeda(beda.length)}</Catatan> : null;
}

export function SubBulanan({ jadwal, jumlahRincian, kodeItem, namaRo, roDaftar, st, ubah, dari, memuat, adaRab }: PropBulanan) {
  const [buka, setBuka] = useState<Set<number>>(new Set());
  const alih = (id: number) => setBuka((x) => { const y = new Set(x); if (y.has(id)) y.delete(id); else y.add(id); return y; });
  const semua = useMemo(() => susunBulanan(saringRo(jadwal, st.ro)), [jadwal, st.ro]);
  const k = useMemo(() => kelompokBulanan(semua.item), [semua]);
  if (memuat) return <div className="h-40 animate-pulse rounded-xl bg-white" aria-busy="true" />;
  if (!adaRab || jadwal.length === 0) return <Kosong teks={KOSONG} />;
  const kode = (it: ItemBulanan) => kodeItem.get(it.itemId) ?? "";
  const nama = (r: string) => `${r.split(".").pop()} ${namaRo.get(r) ?? ""}`.trim();
  return (
    <section className={`${kartu} flex flex-col gap-2.5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 max-w-[60ch]">
          <h2 className={judulKartu}>RAB bulanan: nilai pencairan tiap item per bulan, dengan tag minggu</h2>
          <p className="text-[12.5px] text-[#5B6B84]">Gabungan jadwal semua baris rincian pada tab RAB. Hanya item yang sudah punya RAB dan belum selesai. Untuk mengubah, tekan Atur: tab RAB terbuka pada RO itu dengan jadwal per bulan.</p>
        </div>
        <BarFormat st={st} ubah={ubah} roDaftar={roDaftar} />
      </div>
      <CatatanBeda jadwal={saringRo(jadwal, st.ro)} jumlahRincian={jumlahRincian} />
      {k.kelompok.length === 0 ? <Kosong teks="Tidak ada jadwal pencairan pada RO ini." /> : st.format === "samping" ? (
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[1820px] text-left text-[12px]">
            <thead className="bg-[#EEF3FB] text-[#44546F]"><tr>
              <th className="min-w-[300px] px-2.5 py-2">Item</th>
              {NAMA_BULAN_PENDEK.map((b) => <th key={b} className="px-2 py-2 text-right">{b}</th>)}
              <th className="px-2.5 py-2 text-right">Total RAB</th><th className="px-2.5 py-2" />
            </tr></thead>
            <tbody>
              {k.kelompok.map((g) => (
                <Fragment key={g.ro}>
                  <tr className="border-t border-[#DCE3EE] bg-[#F5F8FE] font-semibold text-[#0F2A52]">
                    <td className="px-2.5 py-1.5"><span className="font-mono text-[11.5px] text-[#44546F]">{g.ro.split(".").pop()}</span> {namaRo.get(g.ro) ?? g.ro}<div className="text-[11px] font-normal text-[#7A8AA3]">{g.item.length} item ber-RAB</div></td>
                    {g.perBulan.map((v, i) => <td key={i} className="px-2 py-1.5 text-right font-mono">{bln(v)}</td>)}
                    <td className="px-2.5 py-1.5 text-right font-mono">{angka(g.total)}</td><td />
                  </tr>
                  {g.item.map((it) => (
                    <tr key={it.itemId} className="border-t border-[#EEF2F7] align-top">
                      <td className="min-w-[300px] px-2.5 py-1.5"><span className="font-mono text-[11.5px] text-[#44546F]">{kode(it)}</span> <span className="text-[#0F2A52]">{it.uraian}</span><div className="text-[11px] text-[#7A8AA3]">akun {it.akun} · {it.nBaris} baris rincian · {rentangBulan(it.nilai)}</div></td>
                      {it.nilai.map((v, i) => <td key={i} className="px-2 py-1.5 text-right font-mono" style={{ background: bayangBiru(v, k.maks) }}>{bln(v)}<div className="font-sans text-[10.5px] text-[#7A8AA3]">{v > 0 ? teksTag(it.tag[i]) : ""}</div></td>)}
                      <td className="px-2.5 py-1.5 text-right font-mono font-semibold text-[#0F2A52]">{angka(it.total)}</td>
                      <td className="px-2.5 py-1.5"><Link href={tautanRab(it.ro, dari)} className={tombolKecil + " inline-flex items-center"}>Atur</Link></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="border-t-2 border-[#C5D0E2] bg-[#F5F8FE] font-semibold text-[#0F2A52]">
                <td className="px-2.5 py-2">Total RAB bulanan</td>
                {k.perBulan.map((v, i) => <td key={i} className="px-2 py-2 text-right font-mono">{bln(v)}</td>)}
                <td className="px-2.5 py-2 text-right font-mono">{angka(k.total)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[900px] text-left text-[12px]">
            <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Item, bulan</th><th className="px-2.5 py-2 text-right">Nilai</th><th className="px-2.5 py-2">Tag minggu</th><th className="px-2.5 py-2" /></tr></thead>
            <tbody>
              {k.kelompok.map((g) => (
                <Fragment key={g.ro}>
                  <tr className="border-t border-[#DCE3EE] bg-[#F5F8FE] font-semibold text-[#0F2A52]"><td className="px-2.5 py-1.5">{nama(g.ro)}</td><td className="px-2.5 py-1.5 text-right font-mono">{angka(g.total)}</td><td /><td /></tr>
                  {g.item.map((it) => {
                    const b = buka.has(it.itemId);
                    return (
                      <Fragment key={it.itemId}>
                        <tr className="border-t border-[#EEF2F7] align-top">
                          <td className="px-2.5 py-1.5"><button type="button" aria-label="Buka atau ciutkan item" aria-expanded={b} className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-[#44546F]" onClick={() => alih(it.itemId)}><Panah buka={b} /></button><span className="font-mono text-[11.5px] text-[#44546F]">{kode(it)}</span> <span className="text-[#0F2A52]">{it.uraian}</span><div className="pl-7 text-[11px] text-[#7A8AA3]">akun {it.akun} · {it.nBaris} baris rincian</div></td>
                          <td className="px-2.5 py-1.5 text-right font-mono font-semibold text-[#0F2A52]">{angka(it.total)}</td>
                          <td className="px-2.5 py-1.5 text-[11.5px] text-[#7A8AA3]">{it.nilai.filter((v) => v > 0).length} bulan pencairan</td>
                          <td className="px-2.5 py-1.5"><Link href={tautanRab(it.ro, dari)} className={tombolKecil + " inline-flex items-center"}>Atur</Link></td>
                        </tr>
                        {b && it.nilai.map((v, i) => v > 0 ? (
                          <tr key={i} className="border-t border-[#F1F4F9]">
                            <td className="py-1 pl-[50px] pr-2.5">{NAMA_BULAN_PANJANG[i]}</td>
                            <td className="px-2.5 py-1 text-right font-mono">{angka(v)}</td>
                            <td className="px-2.5 py-1"><Chip warna="biru">{teksTag(it.tag[i])}</Chip> <span className="text-[11px] text-[#7A8AA3]">{it.tag[i].length === 1 ? RENTANG_MINGGU[it.tag[i][0]] : ""}</span></td><td />
                          </tr>
                        ) : null)}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
              <tr className="border-t-2 border-[#C5D0E2] bg-[#F5F8FE] font-semibold text-[#0F2A52]"><td className="px-2.5 py-2">Total RAB bulanan</td><td className="px-2.5 py-2 text-right font-mono">{angka(k.total)}</td><td /><td /></tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-[#7A8AA3]">Tag minggu adalah perkiraan kas (M1 tgl 1-7, M2 tgl 8-14, M3 tgl 15-21, M4 tgl 22 sampai akhir bulan), bukan tanggal pasti.</p>
    </section>
  );
}

const saringRo = (jadwal: JadwalItem[], kode: string): JadwalItem[] => (kode ? jadwal.filter((j) => j.ro_kode === kode) : jadwal);

/** Panel pada tab RAB: perkiraan kebutuhan pencairan per bulan dengan tag minggu (dasar RPD), ditambah usulan tag bawaan. */
export function PanelPerkiraan({ jadwal, jumlahRincian, roDaftar, st, ubah, belumRab, memuat }: Pick<PropBulanan, "jadwal" | "jumlahRincian" | "roDaftar" | "st" | "ubah" | "memuat"> & { belumRab: number }) {
  const [buka, setBuka] = useState<Set<number>>(new Set());
  const alih = (no: number) => setBuka((x) => { const y = new Set(x); if (y.has(no)) y.delete(no); else y.add(no); return y; });
  const pc = useMemo(() => susunPencairan(jadwal, st.ro || null), [jadwal, st.ro]);
  if (memuat) return <div className="h-40 animate-pulse rounded-xl bg-white" aria-busy="true" />;
  return (
    <section className={`${kartu} flex flex-col gap-2.5`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 max-w-[60ch]">
          <h2 className={judulKartu}>Perkiraan kebutuhan pencairan per bulan, dengan tag minggu</h2>
          <p className="text-[12.5px] text-[#5B6B84]">Disusun per bulan dari jadwal tiap baris rincian. Tiap bulan punya nilai dan tag minggu (M1 tgl 1-7, M2 8-14, M3 15-21, M4 22 sampai akhir bulan). Hanya item yang sudah punya RAB dan belum selesai. Total per bulan menjadi dasar RPD.</p>
        </div>
        <BarFormat st={st} ubah={ubah} roDaftar={roDaftar} />
      </div>
      <CatatanBeda jadwal={saringRo(jadwal, st.ro)} jumlahRincian={jumlahRincian} />
      {st.format === "samping" ? (
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[1500px] text-left text-[12px]">
            <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Tag minggu</th>{NAMA_BULAN_PENDEK.map((b) => <th key={b} className="px-2 py-2 text-right">{b}</th>)}<th className="px-2.5 py-2 text-right">Total</th></tr></thead>
            <tbody>
              {[1, 2, 3, 4].map((m) => (
                <tr key={m} className="border-t border-[#EEF2F7]">
                  <td className="px-2.5 py-1.5 font-semibold">M{m}<div className="text-[11px] font-normal text-[#7A8AA3]">{RENTANG_MINGGU[m]}</div></td>
                  {pc.bulan.map((b) => <td key={b.no} className="px-2 py-1.5 text-right font-mono" style={{ background: bayangBiru(b.minggu[m - 1], pc.maks) }}>{bln(b.minggu[m - 1])}</td>)}
                  <td className="px-2.5 py-1.5 text-right font-mono font-semibold">{angka(pc.bulan.reduce((s, b) => s + b.minggu[m - 1], 0))}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[#C5D0E2] bg-[#F5F8FE] font-semibold text-[#0F2A52]"><td className="px-2.5 py-2">Total bulan</td>{pc.bulan.map((b) => <td key={b.no} className="px-2 py-2 text-right font-mono">{bln(b.total)}</td>)}<td className="px-2.5 py-2 text-right font-mono">{angka(pc.total)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={tombolKecil} onClick={() => setBuka(new Set(pc.bulan.filter((b) => b.total > 0).map((b) => b.no)))}>Buka semua bulan</button>
            <button type="button" className={tombolKecil} onClick={() => setBuka(new Set())}>Ciutkan semua</button>
            <span className="text-[12px] text-[#7A8AA3]">Klik nama bulan untuk membuka rincian minggu dan baris rincian yang dicairkan pada bulan itu.</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
            <table className="w-full min-w-[900px] text-left text-[12px]">
              <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Bulan, minggu, rincian</th><th className="px-2.5 py-2 text-right">Nilai</th><th className="px-2.5 py-2">Keterangan</th></tr></thead>
              <tbody>
                {pc.bulan.map((b) => {
                  const o = buka.has(b.no);
                  return (
                    <Fragment key={b.no}>
                      <tr className="border-t border-[#DCE3EE] bg-[#F5F8FE]">
                        <td className="px-2.5 py-1.5 font-semibold"><button type="button" aria-label="Buka atau ciutkan bulan" aria-expanded={o} className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-[#44546F]" onClick={() => alih(b.no)}><Panah buka={o} /></button>{NAMA_BULAN_PANJANG[b.no - 1]}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-semibold">{bln(b.total)}</td>
                        <td className="px-2.5 py-1.5 text-[11.5px] text-[#7A8AA3]">{ketBulan(b)}</td>
                      </tr>
                      {o && [1, 2, 3, 4].map((m) => (
                        <tr key={m} className="border-t border-[#F1F4F9]">
                          <td className="py-1 pl-[34px] pr-2.5">Minggu {m} <span className="text-[11px] text-[#7A8AA3]">{RENTANG_MINGGU[m]}</span></td>
                          <td className="px-2.5 py-1 text-right font-mono" style={{ background: bayangBiru(b.minggu[m - 1], pc.maks) }}>{bln(b.minggu[m - 1])}</td>
                          <td className="px-2.5 py-1 text-[11.5px] text-[#7A8AA3]">{b.minggu[m - 1] > 0 ? `${b.rincian.filter((d) => d.minggu === m).length} baris rincian` : ""}</td>
                        </tr>
                      ))}
                      {o && b.rincian.map((d, i) => (
                        <tr key={`d${i}`} className="border-t border-[#F8FAFC]">
                          <td className="py-1 pl-[58px] pr-2.5"><Chip warna="biru">M{d.minggu}</Chip> {d.uraian}{d.ket && <div className="text-[11px] text-[#7A8AA3]">{d.ket}</div>}</td>
                          <td className="px-2.5 py-1 text-right font-mono">{angka(d.nilai)}</td>
                          <td className="px-2.5 py-1 text-[11.5px] text-[#7A8AA3]">akun {d.akun} · RO {d.ro.split(".").pop()}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
                <tr className="border-t-2 border-[#C5D0E2] bg-[#F5F8FE] font-semibold text-[#0F2A52]"><td className="px-2.5 py-2">Total perkiraan pencairan</td><td className="px-2.5 py-2 text-right font-mono">{angka(pc.total)}</td><td /></tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[12px] text-[#7A8AA3]">{teksCatatanPencairan(belumRab, angka)}</p>
      <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
        <table className="w-full min-w-[900px] text-left text-[12px]">
          <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Usulan tag minggu bawaan (ilustrasi, dapat diubah)</th><th className="px-2.5 py-2">Akun</th><th className="px-2.5 py-2 text-right">Tag</th><th className="px-2.5 py-2">Alasan</th></tr></thead>
          <tbody>
            {USULAN_TAG.map((t) => (
              <tr key={t.akun} className="border-t border-[#EEF2F7]"><td className="px-2.5 py-1.5 font-semibold">{t.nama}</td><td className="px-2.5 py-1.5 font-mono text-[11.5px]">{t.akun}</td><td className="px-2.5 py-1.5 text-right"><Chip warna="biru">M{t.tag}</Chip></td><td className="px-2.5 py-1.5 text-[#5B6B84]">{t.alasan}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- matriks perubahan POK
export function PerubahanPok({ baris, kro, jenisJadwal, jenisNama }: { baris: BarisMx[]; kro: string; jenisJadwal: string; jenisNama: string }) {
  const b = useMemo(() => barisBerubah(baris), [baris]);
  const lembar = useMemo(() => susunIsiLembar(baris, kro, jenisJadwal, jenisNama), [baris, kro, jenisJadwal, jenisNama]);
  const [galatEkspor, setGalatEkspor] = useState("");
  const simpan = (blob: Blob, nama: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const unduhExcel = async () => {
    setGalatEkspor("");
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet(lembarExcel(lembar));
      ws["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 9 }, { wch: 40 }, { wch: 9 }, { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 9 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Perubahan POK");
      const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      simpan(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `perubahan-pok-${kro}.xlsx`);
    } catch { setGalatEkspor("Berkas Excel gagal dibuat. Coba lagi, atau pakai ekspor CSV."); }
  };
  const unduhPdf = async () => {
    setGalatEkspor("");
    try {
      const { buatPdfLembar } = await import("@/lib/keu/lembarPdf");
      const bytes = await buatPdfLembar(lembar);
      simpan(new Blob([bytes as BlobPart], { type: "application/pdf" }), `perubahan-pok-${kro}.pdf`);
    } catch { setGalatEkspor("Berkas PDF gagal dibuat. Coba lagi, atau pakai ekspor Excel."); }
  };
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
          <div className="grid gap-3 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-3 text-[12.5px] sm:grid-cols-3">
            <div><div className="text-[11px] text-[#7A8AA3]">Jenis revisi</div><div className="font-semibold text-[#0F2A52]">{lembar.jenis}</div></div>
            <div><div className="text-[11px] text-[#7A8AA3]">Disusun</div><div className="font-semibold text-[#0F2A52]">{lembar.disusun}</div><div className="text-[11px] text-[#7A8AA3]">{lembar.catatanTanggal}</div></div>
            <div><div className="text-[11px] text-[#7A8AA3]">Penetap</div><div className="font-semibold text-[#0F2A52]">{lembar.penetap}</div><div className="text-[11px] text-[#7A8AA3]">{lembar.catatanPenetap}</div></div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={tombolKecil} onClick={() => void unduhExcel()}>Ekspor Excel</button>
            <button type="button" className={tombolKecil} onClick={() => void unduhPdf()}>Ekspor PDF</button>
            <button type="button" className={tombolKecil} onClick={unduh}>Ekspor CSV</button>
          </div>
          {galatEkspor && <p role="alert" className="text-[12.5px] text-[#9B1C23]">{galatEkspor}</p>}
        </>
      )}
    </details>
  );
}
