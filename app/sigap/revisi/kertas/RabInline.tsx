"use client";

// app/sigap/revisi/kertas/RabInline.tsx
//
// (24 Okt 2026) Tahap 4l: sub-tab "RAB" halaman Kertas Kerja per KRO sesuai papan 1 mockup: tabel hierarkis RO > Komponen > Akun > Item
// dengan chip saringan status, RAB = Item, penanda Selesai, dan editor rincian RAB langsung di dalam tabel (keterangan, volume, satuan, harga,
// jadwal, bulan, tag minggu). Menulis lewat keu_tulis (keu_rab_item, keu_rab_baris) dan keu_rab_hapus_baris; hak dan aturan ditegakkan basis data.
// Logika murni: lib/keu/rabInline.ts, rabKro.ts, rab.ts.

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { bisaDiubah, dataItemRab, dataSamaDenganItem, jumlahBaris, LABEL_PERIODE, LABEL_STATUS_RAB, NAMA_BULAN, type BarisRabRow, type IsianBaris, type Periode } from "@/lib/keu/rab";
import { angka, rupiah } from "@/lib/keu/ro";
import { calonSamaDenganItem, drafBaru, drafDariRows, jumlahDraft, kelompokkanRab, rencanaSimpan, type Draft } from "@/lib/keu/rabInline";
import { LABEL_STATUS_ITEM, STATUS_RAB_ITEM, type BarisRabKro, type RingkasRabKro, type StatusRabItem } from "@/lib/keu/rabKro";
import type { WarnaChip } from "@/lib/keu/revisi";
import { Catatan, Chip, Galat, judulKartu, kartu, kisi, kolom, Kosong, Kpi, label, tombolAktif, tombolKecil, tombolUtama } from "../../keu-ui";
import { aksiKeu, tulisKeuKlien } from "../../ro/useKeu";

const WARNA_ITEM: Record<StatusRabItem, WarnaChip> = { sama: "hijau", rinci: "biru", belum: "kuning", selesai: "abu" };
const fmtD = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${angka(Math.abs(v))}`);
const warnaD = (v: number) => (v > 0 ? "text-[#0B6B3F]" : v < 0 ? "text-[#9B1C23]" : "text-[#5B6B84]");
const BULAN_INI = () => new Date().getMonth() + 1;
const GRID = "grid [grid-template-columns:minmax(220px,1fr)_96px_80px_110px_120px_96px_88px_88px_76px_88px]";

export type StatusRabRo = { ro: string; status: string | null; nomor: number | string | null; rabId?: number | null };

type Kerja = (langkah: () => Promise<string | null>) => Promise<boolean>;

/** Memastikan item RAB ada untuk item POK ini; mengembalikan id item atau pesan galat. */
async function pastikanItem(b: BarisRabKro, rabId: number, selesai = false): Promise<{ id: number } | { galat: string }> {
  if (b.itemId !== null) return { id: b.itemId };
  const r = await tulisKeuKlien<{ id: number }>("keu_rab_item", "insert", { ...dataItemRab(rabId, { kunci: b.kunci ?? "", komponen: b.komponen, akun: b.akun, uraian: b.uraian, satuan: b.satuan }, null), ...(selesai ? { selesai: true } : {}) });
  return r.ok ? { id: r.data.id } : { galat: r.pesan };
}

// ---------------------------------------------------------------- editor rincian
function EditorRincian({ b, rabId, rows, satuan, kerja, tutup }: { b: BarisRabKro; rabId: number; rows: BarisRabRow[]; satuan: string[]; kerja: Kerja; tutup: () => void }) {
  const [draft, setDraft] = useState<Draft[]>(() => (rows.length ? drafDariRows(rows) : [drafBaru("n0", b.satuan, BULAN_INI())]));
  const [pesan, setPesan] = useState<string[]>([]);
  const cacah = useRef(1);
  const rencana = useMemo(() => rencanaSimpan(rows, draft), [rows, draft]);
  const jumlah = jumlahDraft(draft);
  const ubah = (kunci: string, p: Partial<IsianBaris>) => setDraft((d) => d.map((x) => (x.kunci === kunci ? { ...x, f: { ...x.f, ...p } } : x)));
  const tambah = (dasar?: IsianBaris) => setDraft((d) => [...d, drafBaru(`n${cacah.current++}`, b.satuan, BULAN_INI(), dasar)]);
  const simpan = async () => {
    setPesan(rencana.galat);
    if (rencana.galat.length || !rencana.adaUbah) return;
    const ok = await kerja(async () => {
      const it = await pastikanItem(b, rabId);
      if ("galat" in it) return it.galat;
      for (const id of rencana.hapus) { const r = await aksiKeu("keu_rab_hapus_baris", { p_baris: id }); if (!r.ok) return r.pesan; }
      for (const u of rencana.ubah) { const r = await tulisKeuKlien("keu_rab_baris", "update", u.data, { id: u.id }); if (!r.ok) return r.pesan; }
      for (const x of rencana.baru) { const r = await tulisKeuKlien("keu_rab_baris", "insert", { ...x.data, item_id: it.id }); if (!r.ok) return r.pesan; }
      return null;
    });
    if (ok) tutup();
  };
  const kecil = "h-[28px] w-full min-w-0 rounded border border-[#C5D0E2] bg-white px-1.5 text-[12px] focus:outline-2 focus:outline-[#1F5FD1]";
  return (
    <div className="flex flex-col gap-2 border-t border-[#BFE3CE] bg-[#E5F6EC] px-3 py-2.5 text-[12px] text-[#0B4D2E] shadow-[inset_5px_0_0_#13794B]">
      <p>Setiap item POK boleh dirinci, mis. PML 2 x 170.000 dan PPL 10 x 170.000. Jumlah rincian masuk ke item. Bentuk paling sederhana: RAB = Item.</p>
      <div className="overflow-x-auto">
        <div className="min-w-[1000px]">
          <div className={`${GRID} gap-1 text-[11px] font-bold uppercase tracking-wide`}>
            <div>Rincian RAB</div><div className="text-right">Vol</div><div>Sat</div><div className="text-right">Harga</div><div className="text-right">Jumlah</div><div>Periode</div><div>Mulai</div><div>Sampai</div><div>Tag minggu</div><div>Aksi</div>
          </div>
          {draft.map((d, i) => {
            const j = jumlahBaris(d.f);
            return (
              <div key={d.kunci} className={`${GRID} mt-1 items-center gap-1`}>
                <input aria-label={`Keterangan rincian ${i + 1}`} className={kecil} maxLength={200} placeholder="Keterangan, mis. PML" value={d.f.ket} onChange={(e) => ubah(d.kunci, { ket: e.target.value })} />
                <input aria-label={`Volume rincian ${i + 1}`} className={`${kecil} text-right font-mono`} inputMode="decimal" value={d.f.volume} onChange={(e) => ubah(d.kunci, { volume: e.target.value.replace(/[^\d.,]/g, "").slice(0, 15) })} />
                <input aria-label={`Satuan rincian ${i + 1}`} list="rab-satuan" className={kecil} maxLength={20} value={d.f.satuan} onChange={(e) => ubah(d.kunci, { satuan: e.target.value })} />
                <input aria-label={`Harga satuan rincian ${i + 1}`} className={`${kecil} text-right font-mono`} inputMode="numeric" value={d.f.harga} onChange={(e) => ubah(d.kunci, { harga: e.target.value.replace(/[^\d]/g, "").slice(0, 18) })} />
                <div className="text-right font-mono font-semibold">{j === null ? "-" : angka(j)}</div>
                <select aria-label={`Periode rincian ${i + 1}`} className={kecil} value={d.f.periode} onChange={(e) => ubah(d.kunci, { periode: e.target.value as Periode, ...(e.target.value === "sekali" ? { bulan_sampai: d.f.bulan_mulai } : {}) })}>
                  {(Object.keys(LABEL_PERIODE) as Periode[]).map((k) => <option key={k} value={k}>{k === "sekali" ? "Sekali" : k === "bulanan" ? "Bulanan" : "Triwulanan"}</option>)}
                </select>
                <select aria-label={`Bulan mulai rincian ${i + 1}`} className={kecil} value={d.f.bulan_mulai} onChange={(e) => ubah(d.kunci, { bulan_mulai: Number(e.target.value), bulan_sampai: Math.max(d.f.bulan_sampai, Number(e.target.value)) })}>
                  {NAMA_BULAN.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}
                </select>
                <select aria-label={`Bulan sampai rincian ${i + 1}`} className={kecil} disabled={d.f.periode === "sekali"} value={d.f.periode === "sekali" ? d.f.bulan_mulai : d.f.bulan_sampai} onChange={(e) => ubah(d.kunci, { bulan_sampai: Number(e.target.value) })}>
                  {NAMA_BULAN.map((m, k) => <option key={m} value={k + 1} disabled={k + 1 < d.f.bulan_mulai}>{m}</option>)}
                </select>
                <select aria-label={`Tag minggu rincian ${i + 1}`} className={kecil} value={d.f.minggu} onChange={(e) => ubah(d.kunci, { minggu: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((m) => <option key={m} value={m}>M{m}</option>)}
                </select>
                <div className="flex gap-1">
                  <button type="button" title="Duplikat rincian" aria-label={`Duplikat rincian ${i + 1}`} className="h-[28px] rounded border border-[#9ACFB0] bg-white px-1.5 text-[11px] font-semibold" onClick={() => tambah(d.f)}>Duplikat</button>
                  <button type="button" title="Hapus rincian dari daftar" aria-label={`Hapus rincian ${i + 1}`} className="h-[28px] rounded border border-[#E9A39B] bg-white px-2 text-[13px] font-bold text-[#9B1C23]" onClick={() => setDraft((x) => x.filter((y) => y.kunci !== d.kunci))}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <datalist id="rab-satuan">{satuan.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={`${tombolKecil} !min-h-[32px]`} onClick={() => tambah()}>+ Baris rincian</button>
        <button type="button" className={`${tombolUtama} !min-h-[32px]`} disabled={!rencana.adaUbah} onClick={() => void simpan()}>Simpan rincian</button>
        <button type="button" className={`${tombolKecil} !min-h-[32px]`} onClick={tutup}>Tutup rincian</button>
        <span className="ml-auto font-semibold">Jumlah rincian {rupiah(jumlah)} · POK Menjadi {rupiah(b.pok)} · <span className={warnaD(b.pok - jumlah)}>sisa {fmtD(b.pok - jumlah)}</span></span>
      </div>
      {pesan.length > 0 && <Galat pesan={pesan} />}
    </div>
  );
}

// ---------------------------------------------------------------- tabel
export function SubRab({ baris, ringkas, statusRo, namaRo, namaKomp, namaAkun, dari, rincian, satuan, boleh, sesudah, aksiBar }: {
  baris: BarisRabKro[]; ringkas: RingkasRabKro; statusRo: StatusRabRo[]; namaRo: Map<string, string>; namaKomp: Map<string, string>; namaAkun: Map<string, string>;
  dari: string; rincian: Map<number, BarisRabRow[]>; satuan: string[]; boleh: (ro: string) => boolean | null; sesudah: () => Promise<void>; aksiBar?: ReactNode;
}) {
  const [saring, setSaring] = useState<StatusRabItem | "">("");
  const [roPilih, setRoPilih] = useState("");
  const [buka, setBuka] = useState<Set<number>>(new Set());
  const [tutup, setTutup] = useState<Set<string>>(new Set());
  const [galat, setGalat] = useState<string | null>(null);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const statusPer = useMemo(() => new Map(statusRo.map((x) => [x.ro, x])), [statusRo]);
  const bisaRo = (ro: string): number | null => {
    const s = statusPer.get(ro);
    return s?.rabId && bisaDiubah(s.status) && boleh(ro) === true ? s.rabId : null;
  };
  const tampil = useMemo(() => baris.filter((b) => (!saring || b.status === saring) && (!roPilih || b.ro === roPilih)), [baris, saring, roPilih]);
  const hierarki = useMemo(() => kelompokkanRab(tampil), [tampil]);
  const ros = statusRo.map((x) => x.ro);
  const calon = useMemo(() => calonSamaDenganItem(baris, (ro) => bisaRo(ro) !== null), [baris, statusPer, boleh]); // eslint-disable-line react-hooks/exhaustive-deps
  const alih = (k: string) => setTutup((t) => { const x = new Set(t); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  const jalan: Kerja = async (langkah) => {
    setSibuk(true); setGalat(null);
    const g = await langkah();
    if (g) setGalat(g);
    await sesudah();
    setSibuk(false);
    return !g;
  };

  const samaDenganItem = (b: BarisRabKro, rabId: number) => jalan(async () => {
    const it = await pastikanItem(b, rabId);
    if ("galat" in it) return it.galat;
    const r = await tulisKeuKlien("keu_rab_baris", "insert", dataSamaDenganItem(it.id, { volume: b.volume, satuan: b.satuan, pok: b.pok }, BULAN_INI(), 3));
    return r.ok ? null : r.pesan;
  });
  const selesai = (b: BarisRabKro, rabId: number, nilai: boolean) => jalan(async () => {
    if (b.itemId !== null) { const r = await tulisKeuKlien("keu_rab_item", "update", { selesai: nilai }, { id: b.itemId }); return r.ok ? null : r.pesan; }
    const it = await pastikanItem(b, rabId, nilai);
    return "galat" in it ? it.galat : null;
  });
  const semuaBelum = () => jalan(async () => {
    for (const b of calon) {
      const rabId = bisaRo(b.ro);
      if (rabId === null) continue;
      const it = await pastikanItem(b, rabId);
      if ("galat" in it) return it.galat;
      const r = await tulisKeuKlien("keu_rab_baris", "insert", dataSamaDenganItem(it.id, { volume: b.volume, satuan: b.satuan, pok: b.pok }, BULAN_INI(), 3));
      if (!r.ok) return r.pesan;
    }
    setKonfirmasi(false);
    return null;
  });
  const susun = (ro: string) => jalan(async () => { const r = await aksiKeu("keu_rab_baru", { p_ro: ro, p_dari: null }); return r.ok ? null : r.pesan; });

  return (
    <div className="flex flex-col gap-3.5">
      <section className={`${kartu} flex flex-col gap-2`}>
        <h2 className={judulKartu}>RAB rinci KRO, dari tab Anggaran ({ringkas.total} item)</h2>
        <p className="text-[12.5px] text-[#5B6B84]">Setiap item POK boleh dirinci, mis. PML 2 x 170.000 dan PPL 10 x 170.000. Jumlah rincian masuk ke item. Bentuk paling sederhana: RAB = Item. RAB hanya acuan kebutuhan: dibaca, tidak pernah ditulis ke POK.</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {statusRo.map((x) => (
            <span key={x.ro} className="inline-flex items-center gap-1">
              <Link href={`/sigap/ro/${encodeURIComponent(x.ro)}?tab=rab${dari ? `&dari=${encodeURIComponent(dari)}` : ""}`} className="no-underline" title="Buka tab RAB RO ini (ajukan, setujui, sahkan)">
                <Chip warna={x.status === "disetujui" ? "hijau" : x.status ? "kuning" : "abu"}>{x.ro}: {x.status ? `${LABEL_STATUS_RAB[x.status] ?? x.status}${x.nomor ? ` v${x.nomor}` : ""}` : "belum ada RAB"}</Chip>
              </Link>
              {(!x.status || x.status === "disetujui") && boleh(x.ro) === true && (
                <button type="button" disabled={sibuk} className={`${tombolKecil} !min-h-[28px] !px-2 !text-[12px]`} onClick={() => void susun(x.ro)}>{x.status ? "Susun revisi RAB" : "Susun RAB"}</button>
              )}
            </span>
          ))}
        </div>
      </section>

      <div className={kisi}>
        <Kpi label="Status RAB per item" nilai={`${ringkas.sama + ringkas.rinci} dari ${ringkas.total}`} sub={`${ringkas.sama} RAB = Item · ${ringkas.rinci} rinci · ${ringkas.belum} belum ada RAB · ${ringkas.selesai} selesai`} warna={ringkas.belum === 0 ? "hj" : "kn"} />
        <Kpi label="Item yang sudah punya RAB" nilai={rupiah(ringkas.rab)} sub={`POK Menjadi ${rupiah(ringkas.pokBerRab)}`} />
        <Kpi label="Selisih RAB terhadap POK" nilai={fmtD(ringkas.selisih)} sub={ringkas.selisih > 0 ? "Kebutuhan RAB melebihi POK" : ringkas.selisih < 0 ? "POK melebihi RAB" : "RAB sama dengan POK"} warna={ringkas.selisih > 0 ? "mr" : "hj"} />
        <Kpi label="Item selesai: dana bebas" nilai={rupiah(ringkas.danaBebas)} sub="POK Menjadi dikurangi Booked dan Realisasi" />
      </div>

      <section className={`${kartu} flex flex-col gap-2.5`}>
        <div className="flex flex-wrap items-end gap-1.5">
          <button type="button" className={saring === "" ? tombolAktif : tombolKecil} onClick={() => setSaring("")}>Semua ({baris.length})</button>
          {STATUS_RAB_ITEM.map((s) => <button key={s} type="button" className={saring === s ? tombolAktif : tombolKecil} onClick={() => setSaring(saring === s ? "" : s)}>{LABEL_STATUS_ITEM[s]} ({baris.filter((b) => b.status === s).length})</button>)}
          {ros.length > 1 && (
            <div><label className={label} htmlFor="rab-ro">RO</label>
              <select id="rab-ro" className={`${kolom} !w-auto`} value={roPilih} onChange={(e) => setRoPilih(e.target.value)}><option value="">Semua RO</option>{ros.map((r) => <option key={r} value={r}>{r} {(namaRo.get(r) ?? "").slice(0, 30)}</option>)}</select></div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={tombolKecil} onClick={() => setTutup(new Set(hierarki.map((r) => r.ro)))}>Ciutkan sampai RO</button>
          <button type="button" className={tombolKecil} onClick={() => setTutup(new Set())}>Buka semua</button>
          {!konfirmasi ? (
            <button type="button" disabled={sibuk || calon.length === 0} className={tombolKecil} title={calon.length === 0 ? "Tidak ada item yang belum ber-RAB pada RO yang dapat Anda ubah" : undefined} onClick={() => setKonfirmasi(true)}>Item yang belum: jadikan RAB = Item ({calon.length})</button>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-[#E2B84A] bg-[#FFF8E1] px-2.5 py-1 text-[12.5px] text-[#5A4300]">
              Membuat RAB = Item untuk {calon.length} item, dicairkan sekali bulan ini minggu M3.
              <button type="button" disabled={sibuk} className={`${tombolUtama} !min-h-[30px]`} onClick={() => void semuaBelum()}>{sibuk ? "Memproses…" : "Ya, buat"}</button>
              <button type="button" disabled={sibuk} className={`${tombolKecil} !min-h-[30px]`} onClick={() => setKonfirmasi(false)}>Batal</button>
            </span>
          )}
          <Link href="/sigap/realisasi" className={`${tombolKecil} inline-flex items-center no-underline`}>Unggah realisasi SPAN</Link>
          {aksiBar}
        </div>
        <Galat pesan={galat} />
        {tampil.length === 0 ? <Kosong teks="Tidak ada item untuk saringan ini." /> : (
          <div className="max-h-[78vh] overflow-auto rounded-xl border border-[#C5D0E2] bg-white">
            <div className="min-w-[1180px]">
              <div className="sticky top-0 z-10 grid [grid-template-columns:minmax(300px,1fr)_110px_110px_100px_96px_96px_96px_110px_150px] border-b border-[#C5D0E2] bg-[#E8EEF8] text-[11.5px] font-bold text-[#1B2B4B]">
                <div className="px-2 py-1.5">Uraian</div><div className="px-2 py-1.5 text-right">POK Jumlah</div><div className="px-2 py-1.5 text-right">RAB Jumlah</div><div className="px-2 py-1.5 text-right">Selisih</div>
                <div className="px-2 py-1.5 text-right">Booked</div><div className="px-2 py-1.5 text-right">Realisasi</div><div className="px-2 py-1.5 text-right">Sisa</div><div className="px-2 py-1.5">Status RAB</div><div className="px-2 py-1.5">Tindakan</div>
              </div>
              {hierarki.map((r) => {
                const rTutup = tutup.has(r.ro);
                return (
                  <div key={r.ro}>
                    <div className="grid [grid-template-columns:minmax(300px,1fr)_110px_110px_100px_96px_96px_96px_110px_150px] bg-[#1F3B63] text-[12.5px] font-semibold text-white">
                      <div className="flex items-center gap-1.5 px-2 py-1"><button type="button" aria-expanded={!rTutup} aria-label={rTutup ? "Buka RO" : "Ciutkan RO"} className="h-5 w-5 rounded text-[11px] hover:bg-white/15" onClick={() => alih(r.ro)}>{rTutup ? "▶" : "▼"}</button><span className="font-mono">{r.ro}</span><span className="truncate font-normal">{namaRo.get(r.ro) ?? ""}</span></div>
                      <div className="px-2 py-1 text-right font-mono">{angka(r.pok)}</div><div className="px-2 py-1 text-right font-mono">{angka(r.rab)}</div><div /><div /><div /><div /><div /><div />
                    </div>
                    {!rTutup && r.komponen.map((k) => {
                      const kk = `${r.ro}|${k.komponen}`, kTutup = tutup.has(kk);
                      return (
                        <div key={kk}>
                          <div className="grid [grid-template-columns:minmax(300px,1fr)_110px_110px_100px_96px_96px_96px_110px_150px] bg-[#D4E2F6] text-[12.5px] font-semibold text-[#12315E] shadow-[inset_4px_0_0_#2F6FD0]">
                            <div className="flex items-center gap-1.5 px-2 py-1 pl-5"><button type="button" aria-expanded={!kTutup} aria-label={kTutup ? "Buka komponen" : "Ciutkan komponen"} className="h-5 w-5 rounded text-[11px] hover:bg-black/10" onClick={() => alih(kk)}>{kTutup ? "▶" : "▼"}</button><span className="font-mono">{k.komponen}</span><span className="truncate">{namaKomp.get(kk) ?? ""}</span></div>
                            <div className="px-2 py-1 text-right font-mono">{angka(k.pok)}</div><div className="px-2 py-1 text-right font-mono">{angka(k.rab)}</div><div /><div /><div /><div /><div /><div />
                          </div>
                          {!kTutup && k.akun.map((a) => (
                            <div key={a.akun}>
                              <div className="grid [grid-template-columns:minmax(300px,1fr)_110px_110px_100px_96px_96px_96px_110px_150px] border-t border-[#E2B84A] bg-[#FFEFC2] text-[12.5px] font-semibold text-[#3B2A00] shadow-[inset_5px_0_0_#C98A00]">
                                <div className="flex items-center gap-1.5 px-2 py-1 pl-9"><span className="font-mono">{a.akun}</span><span className="truncate">{namaAkun.get(a.akun) ?? ""}</span><span className="font-normal opacity-80">· {a.baris.length} item</span></div>
                                <div className="px-2 py-1 text-right font-mono">{angka(a.pok)}</div><div className="px-2 py-1 text-right font-mono">{angka(a.rab)}</div><div /><div /><div /><div /><div /><div />
                              </div>
                              {a.baris.map((b) => {
                                const rabId = bisaRo(b.ro);
                                const terbuka = buka.has(b.id);
                                const rows = b.itemId !== null ? (rincian.get(b.itemId) ?? []) : [];
                                return (
                                  <div key={b.id} className="border-t border-[#EEF2F7]">
                                    <div className="grid [grid-template-columns:minmax(300px,1fr)_110px_110px_100px_96px_96px_96px_110px_150px] items-start text-[12px]">
                                      <div className="min-w-0 px-2 py-1.5 pl-12"><span className="font-semibold text-[#0F2A52]">{b.uraian}</span>{b.prioritas && <span className="ml-1 text-[11px] text-[#6B4FB3]">{b.prioritas}</span>}</div>
                                      <div className="px-2 py-1.5 text-right font-mono">{angka(b.pok)}</div>
                                      <div className="px-2 py-1.5 text-right font-mono">{b.rab === null ? "-" : angka(b.rab)}{rows.length > 0 && <div className="text-[10.5px] font-normal text-[#7A8AA3]">dari rincian</div>}</div>
                                      <div className={`px-2 py-1.5 text-right font-mono font-semibold ${b.selisih === null ? "" : warnaD(b.selisih)}`}>{b.selisih === null ? "-" : fmtD(b.selisih)}</div>
                                      <div className="px-2 py-1.5 text-right font-mono">{angka(b.booked)}</div><div className="px-2 py-1.5 text-right font-mono">{angka(b.real)}</div>
                                      <div className={`px-2 py-1.5 text-right font-mono ${b.sisa < 0 ? "text-[#9B1C23]" : ""}`}>{angka(b.sisa)}</div>
                                      <div className="px-2 py-1.5"><Chip warna={WARNA_ITEM[b.status]}>{LABEL_STATUS_ITEM[b.status]}</Chip></div>
                                      <div className="flex flex-wrap gap-1 px-2 py-1">
                                        {rabId !== null && b.kunci !== null && (
                                          <>
                                            {b.status === "belum" && <button type="button" disabled={sibuk} className="rounded border border-[#C5D0E2] bg-white px-1.5 py-0.5 text-[11.5px] font-semibold text-[#1B4B99]" onClick={() => void samaDenganItem(b, rabId)}>RAB = Item</button>}
                                            {b.status !== "selesai" && <button type="button" aria-expanded={terbuka} className="rounded border border-[#C5D0E2] bg-white px-1.5 py-0.5 text-[11.5px] font-semibold text-[#1B4B99]" onClick={() => setBuka((s) => { const x = new Set(s); if (x.has(b.id)) x.delete(b.id); else x.add(b.id); return x; })}>{terbuka ? "Tutup rincian" : "Rinci"}</button>}
                                            {b.status === "selesai" ? <button type="button" disabled={sibuk} className="rounded border border-[#C5D0E2] bg-white px-1.5 py-0.5 text-[11.5px] font-semibold" onClick={() => void selesai(b, rabId, false)}>Buka kembali</button> : <button type="button" disabled={sibuk} className="rounded border border-[#C5D0E2] bg-white px-1.5 py-0.5 text-[11.5px] font-semibold" onClick={() => void selesai(b, rabId, true)}>Selesai</button>}
                                          </>
                                        )}
                                        {rabId === null && <Link href={`/sigap/ro/${encodeURIComponent(b.ro)}?tab=rab${dari ? `&dari=${encodeURIComponent(dari)}` : ""}`} className="px-1 py-0.5 text-[11.5px] font-semibold text-[#1F5FD1]">Atur</Link>}
                                      </div>
                                    </div>
                                    {terbuka && rabId !== null && b.kunci !== null && <EditorRincian key={`${b.id}-${rows.map((x) => x.baris_id).join(",")}`} b={b} rabId={rabId} rows={rows} satuan={satuan} kerja={jalan} tutup={() => setBuka((s) => { const x = new Set(s); x.delete(b.id); return x; })} />}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      <Catatan>RAB aktif dikelola per RO dengan alur ajukan, setujui, dan sahkan; riwayat versinya ada di kartu Versi RAB di bawah. Alasan versi (wajib, minimal 10 karakter) belum disimpan oleh basis data, jadi belum ada isiannya di sini. Item baru atau Dana penggenap (tanpa kunci POK) diatur di tab RAB tiap RO.</Catatan>
    </div>
  );
}

export type VersiRabRow = { rab_id: number; ro_kode: string; nomor: number | string | null; status: string; n_item: number | string; jumlah_rab: number | string };
const LABEL_VERSI: Record<string, string> = { draf: "Draf", menunggu_ketua: "Menunggu ketua tim", menunggu_ppk: "Menunggu PPK", dikembalikan: "Dikembalikan", disetujui: "Disahkan", dibatalkan: "Dibatalkan" };
const WARNA_VERSI: Record<string, "abu" | "kuning" | "hijau" | "merah" | "biru"> = { draf: "abu", menunggu_ketua: "kuning", menunggu_ppk: "kuning", dikembalikan: "merah", disetujui: "hijau", dibatalkan: "abu" };

/** Riwayat versi RAB per RO (v1, v2, ...): nomor, status, jumlah item dan jumlah RAB. Hanya membaca. */
export function KartuVersiRab({ versi, namaRo }: { versi: VersiRabRow[]; namaRo: Map<string, string> }) {
  if (versi.length === 0) return null;
  const per = new Map<string, VersiRabRow[]>();
  for (const v of [...versi].sort((a, b) => Number(a.nomor ?? 0) - Number(b.nomor ?? 0))) { const a = per.get(v.ro_kode) ?? []; a.push(v); per.set(v.ro_kode, a); }
  return (
    <section className={`${kartu} flex flex-col gap-2`}>
      <h2 className={judulKartu}>Versi RAB</h2>
      <p className="text-[12.5px] text-[#5B6B84]">Tiap RO punya satu RAB aktif; versi lama tetap tercatat. Versi baru dibuat dari tab RAB di RO.</p>
      <div className="flex flex-col gap-1.5">
        {[...per.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ro, daftar]) => (
          <div key={ro} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#E8EDF5] bg-[#F9FBFE] px-2.5 py-1.5 text-[12.5px]">
            <span className="min-w-[200px] font-semibold text-[#0F2A52]"><span className="font-mono text-[11.5px]">{ro.split(".").pop()}</span> {namaRo.get(ro) ?? ""}</span>
            {daftar.map((v) => (
              <span key={v.rab_id} className="inline-flex items-center gap-1.5"><Chip warna={WARNA_VERSI[v.status] ?? "abu"}>v{v.nomor ?? "?"} · {LABEL_VERSI[v.status] ?? v.status}</Chip><span className="text-[11.5px] text-[#7A8AA3]">{Number(v.n_item)} item · {rupiah(Number(v.jumlah_rab))}</span></span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
