"use client";

// app/sigap/ro/[kode]/Rab.tsx
//
// (24 Okt 2026) Tab RAB: menyusun RAB per item POK (RAB = item, atau rincian), menandai item selesai, dan menjalankan alur persetujuan
// (ajukan, setuju ketua, sahkan, kembalikan, batalkan). Tombol hanya tampil bila akun berwenang; yang memutuskan penjaga tabel dan
// fungsi keu_rab_aksi di basis data. Logika murni: lib/keu/rab.ts.

import { useMemo, useState } from "react";
import {
  aksiTersedia, AKSI_BUTUH_CATATAN, barisKosong, bisaDiubah, bolehSusunBaru, dariIdent, dataBaris, dataItemRab, dataSamaDenganItem, diubahDariIdent, itemRabYatim, jumlahBaris,
  LABEL_AKSI, LABEL_PERIODE, LABEL_STATUS_RAB, NAMA_BULAN, periksaBaris, periksaCatatanAksi, petakanRab, type AksiRab, type BarisRabRow, type HakRab,
  type IsianBaris, type PemetaanItem, type Periode,
} from "@/lib/keu/rab";
import { PRIORITAS } from "@/lib/keu/kekurangan";
import { periksaAlasanVersi } from "@/lib/keu/rab";
import { angka, rupiah } from "@/lib/keu/ro";
import type { WarnaChip } from "@/lib/keu/revisi";
import { Chip, Galat, judulKartu, kartu, kisi, kolom, Kpi, label, Memuat, tombol } from "../../keu-ui";
import { aksiKeu, tulisKeuKlien, useAnggaranRo, useBoleh, useKirim, useRabRo } from "../useKeu";
import { RabPerSurvei } from "./RabPerSurvei";
import { UsulanIdentifikasi } from "./UsulanIdentifikasi";

const WARNA_STATUS: Record<string, WarnaChip> = { draf: "abu", dikembalikan: "merah", menunggu_ketua: "kuning", menunggu_ppk: "kuning", disetujui: "hijau" };
const LABEL_ITEM: Record<PemetaanItem["status"], string> = { belum: "Belum ada RAB", sama: "RAB = Item", rinci: "RAB rinci", selesai: "Selesai" };


function PilihBulan({ id, nilai, ubah, teks }: { id: string; nilai: number; ubah: (n: number) => void; teks: string }) {
  return (
    <div>
      <label className={label} htmlFor={id}>{teks}</label>
      <select id={id} className={kolom} value={nilai} onChange={(e) => ubah(Number(e.target.value))}>
        {NAMA_BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
      </select>
    </div>
  );
}
function PilihMinggu({ id, nilai, ubah }: { id: string; nilai: number; ubah: (n: number) => void }) {
  return (
    <div>
      <label className={label} htmlFor={id}>Minggu cair</label>
      <select id={id} className={kolom} value={nilai} onChange={(e) => ubah(Number(e.target.value))}>
        {[1, 2, 3, 4].map((m) => <option key={m} value={m}>Minggu {m}</option>)}
      </select>
    </div>
  );
}

// ------------------------------------------------------------ satu item POK
type Ctx = { rabId: number; editable: boolean; muat: () => Promise<void> };

function FormSama({ p, ctx, tutup }: { p: PemetaanItem; ctx: Ctx; tutup: () => void }) {
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [minggu, setMinggu] = useState(3);
  const [prioritas, setPrioritas] = useState(p.rab?.prioritas_kode ?? "");
  const { jalankan, mengirim, galat } = useKirim(ctx.muat);
  const simpan = async () => {
    const ok = await jalankan(async () => {
      let itemId = p.rab?.id;
      if (itemId === undefined) {
        const r = await tulisKeuKlien<{ id: number }>("keu_rab_item", "insert", dataItemRab(ctx.rabId, p.pok, prioritas));
        if (!r.ok) return r;
        itemId = r.data.id;
      }
      return tulisKeuKlien("keu_rab_baris", "insert", dataSamaDenganItem(itemId, p.pok, bulan, minggu));
    });
    if (ok) tutup();
  };
  return (
    <div className="mt-2 space-y-3 rounded-lg bg-[#F5F8FE] p-3">
      <p className="text-[12.5px] text-[#44546F]">RAB menyamai pagu POK ({rupiah(p.pok.pok)}), dicairkan sekali pada bulan dan minggu yang dipilih.</p>
      <div className="grid grid-cols-2 gap-3">
        <PilihBulan id={`sb-${p.pok.detail_id}`} nilai={bulan} ubah={setBulan} teks="Bulan cair" />
        <PilihMinggu id={`sm-${p.pok.detail_id}`} nilai={minggu} ubah={setMinggu} />
      </div>
      {!p.rab && (
        <div>
          <label className={label} htmlFor={`sp-${p.pok.detail_id}`}>Prioritas (boleh kosong)</label>
          <select id={`sp-${p.pok.detail_id}`} className={kolom} value={prioritas} onChange={(e) => setPrioritas(e.target.value)}>
            <option value="">Tanpa prioritas</option>
            {PRIORITAS.map((x) => <option key={x.kode} value={x.kode}>{x.nama}</option>)}
          </select>
        </div>
      )}
      {galat && <Galat pesan={galat} />}
      <div className="flex gap-2">
        <button type="button" onClick={simpan} disabled={mengirim} className={`${tombol} flex-1 bg-[#1F5FD1] text-white`}>{mengirim ? "Menyimpan…" : "Simpan RAB = Item"}</button>
        <button type="button" onClick={tutup} disabled={mengirim} className={`${tombol} bg-[#EEF2F7] text-[#44546F]`}>Batal</button>
      </div>
    </div>
  );
}

function FormBaris({ p, ctx, awal, barisId, tutup }: { p: PemetaanItem; ctx: Ctx; awal: IsianBaris; barisId?: number; tutup: () => void }) {
  const [v, setV] = useState<IsianBaris>(awal);
  const [pesan, setPesan] = useState<string[]>([]);
  const { jalankan, mengirim, galat } = useKirim(ctx.muat);
  const ubah = (x: Partial<IsianBaris>) => setV((a) => ({ ...a, ...x }));
  const jml = jumlahBaris(v);
  const simpan = async () => {
    const g = periksaBaris(v);
    setPesan(g);
    if (g.length) return;
    const ok = await jalankan(async () => {
      if (barisId !== undefined) return tulisKeuKlien("keu_rab_baris", "update", { ...dataBaris(v), sama_dengan_item: false, jumlah_tetap: null }, { id: barisId });
      let itemId = p.rab?.id;
      if (itemId === undefined) {
        const r = await tulisKeuKlien<{ id: number }>("keu_rab_item", "insert", dataItemRab(ctx.rabId, p.pok, null));
        if (!r.ok) return r;
        itemId = r.data.id;
      }
      return tulisKeuKlien("keu_rab_baris", "insert", { ...dataBaris(v), item_id: itemId, urut: p.baris.length + 1 });
    });
    if (ok) tutup();
  };
  return (
    <div className="mt-2 space-y-3 rounded-lg bg-[#F5F8FE] p-3">
      <div>
        <label className={label} htmlFor={`bk-${barisId ?? "n"}-${p.pok.detail_id}`}>Keterangan (mis. PML, PPL)</label>
        <input id={`bk-${barisId ?? "n"}-${p.pok.detail_id}`} className={kolom} maxLength={200} value={v.ket} onChange={(e) => ubah({ ket: e.target.value })} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={label} htmlFor={`bv-${p.pok.detail_id}`}>Volume</label>
          <input id={`bv-${p.pok.detail_id}`} className={kolom} inputMode="decimal" value={v.volume} onChange={(e) => ubah({ volume: e.target.value.replace(/[^\d.,]/g, "").slice(0, 15) })} />
        </div>
        <div>
          <label className={label} htmlFor={`bs-${p.pok.detail_id}`}>Satuan</label>
          <input id={`bs-${p.pok.detail_id}`} className={kolom} maxLength={20} value={v.satuan} onChange={(e) => ubah({ satuan: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor={`bh-${p.pok.detail_id}`}>Harga satuan</label>
          <input id={`bh-${p.pok.detail_id}`} className={kolom} inputMode="numeric" value={v.harga} onChange={(e) => ubah({ harga: e.target.value.replace(/[^\d.]/g, "").slice(0, 18) })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor={`bp-${p.pok.detail_id}`}>Jadwal</label>
          <select id={`bp-${p.pok.detail_id}`} className={kolom} value={v.periode} onChange={(e) => ubah({ periode: e.target.value as Periode })}>
            {(Object.keys(LABEL_PERIODE) as Periode[]).map((k) => <option key={k} value={k}>{LABEL_PERIODE[k]}</option>)}
          </select>
        </div>
        <PilihMinggu id={`bm-${p.pok.detail_id}`} nilai={v.minggu} ubah={(n) => ubah({ minggu: n })} />
        <PilihBulan id={`bbm-${p.pok.detail_id}`} nilai={v.bulan_mulai} ubah={(n) => ubah({ bulan_mulai: n, bulan_sampai: Math.max(v.bulan_sampai, n) })} teks={v.periode === "sekali" ? "Bulan cair" : "Mulai bulan"} />
        {v.periode !== "sekali" && <PilihBulan id={`bbs-${p.pok.detail_id}`} nilai={v.bulan_sampai} ubah={(n) => ubah({ bulan_sampai: n })} teks="Sampai bulan" />}
      </div>
      <p className="text-[13px] font-bold text-[#0F2A52]">Jumlah rincian: {jml === null ? "-" : rupiah(jml)}</p>
      {(pesan.length > 0 || galat) && (
        <ul role="alert" className="space-y-1 rounded-lg border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">
          {[...pesan, ...(galat ? [galat] : [])].map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={simpan} disabled={mengirim} className={`${tombol} flex-1 bg-[#1F5FD1] text-white`}>{mengirim ? "Menyimpan…" : "Simpan rincian"}</button>
        <button type="button" onClick={tutup} disabled={mengirim} className={`${tombol} bg-[#EEF2F7] text-[#44546F]`}>Batal</button>
      </div>
    </div>
  );
}

function ringkasJadwal(b: BarisRabRow): string {
  const m = NAMA_BULAN[b.bulan_mulai - 1], s = NAMA_BULAN[b.bulan_sampai - 1];
  return b.periode === "sekali" ? `${m}, minggu ${b.minggu}` : `${LABEL_PERIODE[b.periode]} ${m}–${s}, minggu ${b.minggu}`;
}

function KartuItem({ p, ctx }: { p: PemetaanItem; ctx: Ctx }) {
  const [mode, setMode] = useState<null | "sama" | "baris" | { ubah: number }>(null);
  const [hapusId, setHapusId] = useState<number | null>(null);
  const { jalankan, mengirim, galat } = useKirim(ctx.muat);
  const bisa = ctx.editable;
  const hapus = async (id: number) => { await jalankan(() => aksiKeu("keu_rab_hapus_baris", { p_baris: id })); setHapusId(null); };
  const selesai = (nilai: boolean) =>
    jalankan(async () => {
      if (p.rab) return tulisKeuKlien("keu_rab_item", "update", { selesai: nilai }, { id: p.rab.id });
      return tulisKeuKlien("keu_rab_item", "insert", { ...dataItemRab(ctx.rabId, p.pok, null), selesai: nilai });
    });
  return (
    <li className={`${kartu} !p-3`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-[13px] font-bold leading-snug text-[#0F2A52]">{p.pok.nomor_item ? `${p.pok.nomor_item}. ` : ""}{p.pok.uraian}</p>
        <Chip warna={p.status === "belum" ? "abu" : p.status === "selesai" ? "biru" : "hijau"}>{LABEL_ITEM[p.status]}</Chip>
      </div>
      <p className="mt-0.5 text-[12px] text-[#6B7A93]">Akun {p.pok.akun} · {angka(p.pok.volume)} {p.pok.satuan}</p>
      <dl className="mt-1.5 grid grid-cols-2 gap-2 text-[12.5px]">
        <div><dt className="text-[#6B7A93]">Pagu POK</dt><dd className="font-semibold text-[#0F2A52]">{angka(p.pok.pok)}</dd></div>
        <div><dt className="text-[#6B7A93]">RAB</dt><dd className="font-semibold text-[#0F2A52]">{p.status === "belum" ? "-" : angka(p.jumlahRab)}</dd></div>
      </dl>
      {p.selisih !== null && p.selisih !== 0 && p.status !== "selesai" && (
        <p className="mt-1 text-[12px] font-bold text-[#8A6200]">RAB {p.selisih > 0 ? "melebihi" : "kurang dari"} pagu POK sebesar {rupiah(Math.abs(p.selisih))}.</p>
      )}
      {p.baris.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {p.baris.map((b) => (
            <li key={b.baris_id} className="rounded-md bg-[#F5F8FE] px-3 py-2 text-[12.5px] text-[#44546F]">
              {mode !== null && typeof mode === "object" && mode.ubah === b.baris_id ? (
                <FormBaris p={p} ctx={ctx} barisId={b.baris_id} tutup={() => setMode(null)} awal={{ ket: b.ket, volume: String(b.volume).replace(".", ","), satuan: b.satuan, harga: String(Math.round(Number(b.harga_satuan))), periode: b.periode, bulan_mulai: b.bulan_mulai, bulan_sampai: b.bulan_sampai, minggu: b.minggu }} />
              ) : (
                <>
                  <p className="break-words font-bold text-[#0F2A52]">{b.ket || "Rincian"} · {rupiah(b.jumlah)}</p>
                  {dariIdent(b) && <p className="text-[11.5px] font-semibold text-[#1F4EA8]">Dari identifikasi{diubahDariIdent(b) ? " · diubah dari identifikasi" : ""}</p>}
                  <p>{angka(Number(b.volume))} {b.satuan}{b.sama_dengan_item ? "" : ` × ${angka(Number(b.harga_satuan))}`} · {ringkasJadwal(b)}</p>
                  {bisa && mode === null && hapusId === b.baris_id && (
                    <div className="mt-1.5 space-y-1.5 rounded-md bg-[#FDE8E8] px-2.5 py-2">
                      <p className="text-[12.5px] font-semibold text-[#7A1D22]">Hapus rincian ini? Tindakan ini tidak dapat dibatalkan.</p>
                      <div className="flex gap-2">
                        <button type="button" disabled={mengirim} onClick={() => void hapus(b.baris_id)} className={`${tombol} min-h-[40px] bg-[#B42329] text-white`}>{mengirim ? "Menghapus…" : "Ya, hapus"}</button>
                        <button type="button" disabled={mengirim} onClick={() => setHapusId(null)} className={`${tombol} min-h-[40px] bg-white text-[#44546F]`}>Batal</button>
                      </div>
                    </div>
                  )}
                  {bisa && mode === null && hapusId !== b.baris_id && (
                    <div className="mt-1.5 flex gap-2">
                      <button type="button" disabled={mengirim} onClick={() => setMode({ ubah: b.baris_id })} className={`${tombol} min-h-[40px] bg-[#E6EFFD] text-[#1F4EA8]`}>Ubah</button>
                      <button type="button" disabled={mengirim} onClick={() => setHapusId(b.baris_id)} className={`${tombol} min-h-[40px] bg-[#FDE8E8] text-[#9B1C23]`}>Hapus</button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {galat && <div className="mt-2"><Galat pesan={galat} /></div>}
      {bisa && mode === null && (
        <div className="mt-2 flex flex-wrap gap-2">
          {p.status === "belum" && <button type="button" disabled={mengirim} onClick={() => setMode("sama")} className={`${tombol} bg-[#1F5FD1] text-white`}>RAB = Item</button>}
          {p.status !== "selesai" && <button type="button" disabled={mengirim} onClick={() => setMode("baris")} className={`${tombol} bg-[#E6EFFD] text-[#1F4EA8]`}>{p.baris.length ? "Tambah rincian" : "Rinci"}</button>}
          {p.status === "selesai" ? (
            <button type="button" disabled={mengirim} onClick={() => selesai(false)} className={`${tombol} bg-[#EEF2F7] text-[#44546F]`}>Batalkan selesai</button>
          ) : (
            <button type="button" disabled={mengirim} onClick={() => selesai(true)} className={`${tombol} bg-[#EEF2F7] text-[#44546F]`}>Tandai selesai</button>
          )}
        </div>
      )}
      {mode === "sama" && <FormSama p={p} ctx={ctx} tutup={() => setMode(null)} />}
      {mode === "baris" && <FormBaris p={p} ctx={ctx} tutup={() => setMode(null)} awal={barisKosong(p.pok.satuan, new Date().getMonth() + 1)} />}
    </li>
  );
}

// ------------------------------------------------------------ alur persetujuan
function BilahAksi({ rabId, status, hak, muat }: { rabId: number; status: string; hak: HakRab; muat: () => Promise<void> }) {
  const aksi = aksiTersedia(status, hak);
  const [pilih, setPilih] = useState<AksiRab | null>(null);
  const [catatan, setCatatan] = useState("");
  const [pesan, setPesan] = useState<string | null>(null);
  const { kirim, mengirim, galat } = useKirim(muat);
  if (aksi.length === 0) return null;
  const jalan = async (a: AksiRab) => {
    const c = periksaCatatanAksi(a, catatan);
    setPesan(c);
    if (c) return;
    if (await kirim("keu_rab_aksi", { p_rab: rabId, p_aksi: a, p_catatan: catatan.trim() })) { setPilih(null); setCatatan(""); }
  };
  const butuhForm = (a: AksiRab) => AKSI_BUTUH_CATATAN.includes(a) || a === "batalkan";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {aksi.map((a) => (
          <button key={a} type="button" disabled={mengirim} onClick={() => (butuhForm(a) ? (setPilih(a), setPesan(null)) : jalan(a))}
            className={`${tombol} ${a === "ajukan" || a === "sahkan" || a === "setuju_ketua" ? "bg-[#1F5FD1] text-white" : "bg-[#FDE8E8] text-[#9B1C23]"}`}>
            {mengirim && pilih === null ? "Memproses…" : LABEL_AKSI[a]}
          </button>
        ))}
      </div>
      {pilih && (
        <div className="space-y-2 rounded-lg bg-[#F5F8FE] p-3">
          <label className={label} htmlFor="rab-catatan">{pilih === "kembalikan" ? "Alasan pengembalian" : "Catatan pembatalan (boleh kosong)"}</label>
          <textarea id="rab-catatan" className={`${kolom} py-2`} rows={2} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          {pesan && <p role="alert" className="text-[13px] text-[#7A1D22]">{pesan}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={mengirim} onClick={() => jalan(pilih)} className={`${tombol} flex-1 bg-[#B42329] text-white`}>{mengirim ? "Memproses…" : LABEL_AKSI[pilih]}</button>
            <button type="button" disabled={mengirim} onClick={() => { setPilih(null); setPesan(null); }} className={`${tombol} bg-[#EEF2F7] text-[#44546F]`}>Batal</button>
          </div>
        </div>
      )}
      {galat && <Galat pesan={galat} />}
    </div>
  );
}

// ------------------------------------------------------------ tab
export function TabRab({ kode }: { kode: string }) {
  const rab = useRabRo(kode);
  const ang = useAnggaranRo(kode);
  const hakRab = useBoleh("rab", kode);
  const hakDraf = useBoleh("draf", kode);
  const hakSetuju = useBoleh("setuju_ketua", kode);
  const hakSahkan = useBoleh("sahkan", kode);
  const hak: HakRab = { rab: hakRab === true, draf: hakDraf === true, setuju_ketua: hakSetuju === true, sahkan: hakSahkan === true };
  const items = useMemo(() => (ang.anggaran ?? []).flatMap((k) => k.akun.flatMap((a) => a.item)), [ang.anggaran]);
  const peta = useMemo(() => petakanRab(items, rab.itemRab, rab.barisRab), [items, rab.itemRab, rab.barisRab]);
  const yatim = useMemo(() => itemRabYatim(items, rab.itemRab), [items, rab.itemRab]);
  const sahTerbaru = useMemo(() => rab.riwayatRab.filter((r) => r.status === "disetujui").sort((a, b) => Number(b.nomor) - Number(a.nomor))[0] ?? null, [rab.riwayatRab]);
  const susun = useKirim(rab.muatSemua);
  const [alasanVersi, setAlasanVersi] = useState("");
  const [tampil, setTampil] = useState<"standar" | "survei">("standar");

  const galat = rab.galat ?? ang.galat;
  if (galat) return <Galat pesan={galat} />;
  if (!rab.siap || !ang.anggaran) return <Memuat tinggi="h-40" />;

  const status = rab.rab?.status ?? null;
  const editable = bisaDiubah(status) && (hak.rab || hak.draf);
  const totalPok = items.reduce((a, i) => a + i.pok, 0);
  const totalRab = peta.filter((x) => x.status !== "selesai").reduce((a, x) => a + x.jumlahRab, 0);
  const nBelum = peta.filter((x) => x.status === "belum").length;
  const ctx: Ctx = { rabId: rab.rab?.rab_id ?? 0, editable, muat: rab.muatSemua };

  return (
    <div className="space-y-3">
      <section className={`${kartu} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={judulKartu}>{rab.rab ? `RAB nomor ${rab.rab.nomor}` : "RAB"}</h2>
          {status && <Chip warna={WARNA_STATUS[status] ?? "abu"}>{LABEL_STATUS_RAB[status] ?? status}</Chip>}
        </div>
        {!rab.rab && <p className="text-[13px] text-[#5B6B84]">RO ini belum punya RAB.</p>}
        {rab.rab && (
          <div className={kisi}>
            <Kpi label="Pagu POK" nilai={rupiah(totalPok)} />
            <Kpi label="Jumlah RAB" nilai={rupiah(totalRab)} sub={`${nBelum} item belum ber-RAB`} />
            <Kpi label="Selisih RAB dengan POK" nilai={rupiah(Math.abs(totalRab - totalPok))} sub={totalRab > totalPok ? "RAB melebihi pagu; dicatat sebagai kekurangan" : totalRab < totalPok ? "RAB di bawah pagu" : "RAB tepat sama dengan pagu"} warna={totalRab > totalPok ? "kn" : undefined} />
          </div>
        )}
        {rab.rab && rab.alasanVersi && Number(rab.rab.nomor) > 1 && <p className="text-[12.5px] text-[#44546F]"><span className="font-semibold text-[#0F2A52]">Alasan versi {rab.rab.nomor}:</span> {rab.alasanVersi}</p>}
        {status === "dikembalikan" && rab.catatan && <p className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">Dikembalikan: {rab.catatan}</p>}
        {rab.rab && <BilahAksi rabId={rab.rab.rab_id} status={status!} hak={hak} muat={rab.muatSemua} />}
        {bolehSusunBaru(status, hak) && (
          <div className="space-y-2">
            {sahTerbaru && (
              <div>
                <label className={label} htmlFor="alasan-versi">Alasan versi baru (wajib, minimal 10 karakter)</label>
                <textarea id="alasan-versi" className={`${kolom} py-2`} rows={2} maxLength={500} value={alasanVersi} onChange={(e) => setAlasanVersi(e.target.value)} placeholder="Mis. kebutuhan bahan naik karena jumlah peserta bertambah" />
                {alasanVersi.trim() !== "" && periksaAlasanVersi(alasanVersi) && <p className="mt-1 text-[12px] text-[#9B1C23]">{periksaAlasanVersi(alasanVersi)}</p>}
              </div>
            )}
            <button type="button" disabled={susun.mengirim || (!!sahTerbaru && periksaAlasanVersi(alasanVersi) !== null)} onClick={() => (sahTerbaru ? susun.kirim("keu_rab_baru_alasan", { p_ro: kode, p_dari: sahTerbaru.rab_id, p_alasan: alasanVersi.trim() }) : susun.kirim("keu_rab_baru", { p_ro: kode, p_dari: null }))} className={`${tombol} bg-[#1F5FD1] text-white`}>
              {susun.mengirim ? "Menyiapkan…" : sahTerbaru ? "Susun revisi RAB (salinan dari RAB sah)" : "Susun RAB"}
            </button>
            {susun.galat && <Galat pesan={susun.galat} />}
          </div>
        )}
        {!rab.rab && !bolehSusunBaru(status, hak) && <p className="text-[12.5px] text-[#6B7A93]">Hanya ketua tim atau admin RO yang dapat menyusun RAB.</p>}
        {rab.rab && !editable && bisaDiubah(status) && <p className="text-[12.5px] text-[#6B7A93]">Hanya ketua tim atau admin RO yang dapat mengubah isi RAB.</p>}
      </section>

      {rab.rab && (
        <>
          {yatim.length > 0 && <p className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-[12.5px] font-bold text-[#8A6200]">{yatim.length} item RAB tidak lagi cocok dengan item POK berlaku (POK berubah). Hubungi PPK untuk pemadanan.</p>}
          <div role="group" aria-label="Tampilan RAB" className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={tampil === "standar"} onClick={() => setTampil("standar")} className={`${tombol} ${tampil === "standar" ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F7] text-[#44546F]"}`}>RAB standar</button>
            <button type="button" aria-pressed={tampil === "survei"} onClick={() => setTampil("survei")} className={`${tombol} ${tampil === "survei" ? "bg-[#0F2A52] text-white" : "bg-[#EEF2F7] text-[#44546F]"}`}>RAB per survei</button>
          </div>
          {tampil === "survei" ? (
            <RabPerSurvei kode={kode} rabId={ctx.rabId} editable={editable} peta={peta} itemRab={rab.itemRab} barisRab={rab.barisRab} muat={rab.muatSemua} />
          ) : (
            <>
              <UsulanIdentifikasi kode={kode} rabId={ctx.rabId} peta={peta} muat={rab.muatSemua} editable={editable} />
              <ul className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(380px,100%),1fr))]">{peta.map((p) => <KartuItem key={p.pok.detail_id} p={p} ctx={ctx} />)}</ul>
            </>
          )}
          {rab.jejak.length > 0 && (
            <details className={kartu}>
              <summary className="min-h-[40px] cursor-pointer list-none text-[13px] font-semibold text-[#0F2A52]">Jejak RAB ({rab.jejak.length})</summary>
              <ul className="mt-1 space-y-2">
                {rab.jejak.map((j) => (
                  <li key={j.id} className="text-[12.5px] text-[#44546F]">
                    <span className="font-bold text-[#0F2A52]">{j.aksi}</span> · {LABEL_STATUS_RAB[j.dari] ?? j.dari} → {LABEL_STATUS_RAB[j.ke] ?? j.ke} · {j.oleh_nama ?? "-"} · {new Date(j.waktu).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                    {j.catatan && <span className="block break-words text-[#6B7A93]">{j.catatan}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
