"use client";

// app/sigap/revisi/kertas/page.tsx
//
// (24 Okt 2026) Kertas Kerja Revisi POK per KRO (papan 1 mockup): satu halaman lebar di bawah Anggaran > Revisi anggaran. Kepala (KRO, status draf,
// Kembali ke semula), KPI (kelengkapan RAB, realisasi SPAN, pagu KRO), jenis revisi + saran sistem + tenggat Pasal 175, pemeriksaan R-01..R-17,
// kecukupan KRO terhadap RAB + buku selisih per item, matriks 15 kolom (Matriks.tsx), lalu form ganti akun, item baru, Dana penggenap, dan buku geseran.
// Alamat: /sigap/revisi/kertas?jadwal=<id>&kro=<2903.BMA>&ro=<kode>&dari=<alamat asal>. Semua orang organik boleh melihat; yang memutuskan basis data.
// Logika murni: lib/keu/matriks.ts dan lib/keu/kk.ts.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LABEL_JENIS_JADWAL, LABEL_STATUS_JADWAL, statusTenggat, tglPanjang } from "@/lib/keu/revisi";
import { rupiah, urlBaca } from "@/lib/keu/ro";
import { n, sisaTerhadapPagu, type BarisKk, type BarisPeriksa, type Geseran, type Kecukupan } from "@/lib/keu/kk";
import {
  bangunPohon, bukuSelisihItem, gabungKetersediaan, JENIS_NAMA, kpiMatriks, kroDariRo, rencanaKembali, roDalamKro, sarankanJenis,
  type ItemKecukupan, type Ketersediaan, type PrioritasMaster, type RingkasRoKk,
} from "@/lib/keu/matriks";
import { caps, Catatan, Chip, Galat, HalamanKeu, judulKartu, kartu, kisi, kolom, Kosong, Kpi, label, Memuat, Potong, tombolBahaya, tombolKecil, tombolUtama } from "../../keu-ui";
import { aksiKeu, tulisKeuKlien, useBacaKeu, useBoleh, useKirim } from "../../ro/useKeu";
import { FormBaru, FormPenggenap, KartuGeseran, KartuKecukupan, KartuPeriksa, PanelPasangan, type AkunMaster, type KeputusanRow } from "./Bagian";
import Matriks, { type RincianRab } from "./Matriks";

type Jadwal = { id: number; tahun: number; jenis: string; judul: string; status: string; buka: string; tutup: string };
type RoRow = { kode: string; nama: string; sementara: boolean; aktif: boolean };
type Real = { detail_id: number; nomor_item: string | null; lock_pagu: number | string | null; real_sd: number | string | null; sampai_tanggal: string };
type R06 = { kk_baris_id: number; kekurangan: number | string };
type Tenggat = { kode: string; nama: string; tanggal: string; sisa_hari: number | string | null };
type ItemKec = ItemKecukupan & { rab_id: number };
type BarisRabRow = { baris_id: number; item_id: number; ket: string | null; volume: number | string; satuan: string | null; harga_satuan: number | string; jumlah: number | string };

const PESAN_IZIN: Record<string, string> = {
  jadwal: "kertas kerja hanya dapat diubah saat jadwal dibuka atau terkumpul",
  tutup: "jendela usulan sudah ditutup; hanya PPK yang dapat mengubah",
  hak: "akun Anda tidak berwenang mengubah (ketua tim, admin RO, atau PPK)",
  usulan: "usulan RO sedang diproses atau sudah disetujui; terkunci",
};
const fmtSel = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${rupiah(Math.abs(v))}`);

/** Izin tiap RO (keu_kk_izin): 'ok' berarti boleh mengubah. null = belum diketahui. */
function useIzinBanyak(ros: string[], jadwal: number | null, ulang: number): Record<string, string | null> {
  const kunci = ros.join("|");
  const [izin, setIzin] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let hidup = true;
    setIzin({});
    if (jadwal === null || !kunci) return;
    for (const ro of kunci.split("|")) {
      void aksiKeu<string>("keu_kk_izin", { p_ro: ro, p_jadwal: jadwal }).then((r) => { if (hidup) setIzin((s) => ({ ...s, [ro]: r.ok ? String(r.data) : "hak" })); });
    }
    return () => { hidup = false; };
  }, [kunci, jadwal, ulang]);
  return izin;
}

function KembaliSemula({ rows, geseran, boleh, sesudah }: { rows: BarisKk[]; geseran: Geseran[]; boleh: (ro: string) => boolean; sesudah: () => Promise<void> }) {
  const [yakin, setYakin] = useState(false);
  const { jalankan, mengirim, galat } = useKirim(sesudah);
  const ro = useMemo(() => rows.filter((b) => boleh(b.ro_kode)), [rows, boleh]);
  const rencana = useMemo(() => rencanaKembali(ro, geseran), [ro, geseran]);
  const jumlah = rencana.batalGeseran.length + rencana.hapus.length + rencana.reset.length;
  if (!yakin) return <button type="button" disabled={jumlah === 0} className={tombolKecil} onClick={() => setYakin(true)} title={jumlah === 0 ? "Kertas kerja sudah sama dengan Semula" : undefined}>Kembali ke semula</button>;
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-[#E2B84A] bg-[#FFF8E1] p-2.5 text-[12.5px] text-[#5A4300]">
      <p>Mengembalikan kertas kerja ke POK berlaku: {rencana.hapus.length} baris buatan dihapus, {rencana.reset.length} baris resmi dikembalikan volume dan harganya, {rencana.batalGeseran.length} geseran dibatalkan. Hanya RO yang Anda berwenang mengubahnya. Item resmi tidak pernah dihapus.</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button" disabled={mengirim} className={tombolBahaya}
          onClick={() => void jalankan(async () => {
            for (const id of rencana.batalGeseran) { const r = await tulisKeuKlien("keu_kk_geseran", "update", { batal: true }, { id }); if (!r.ok) return r; }
            for (const id of rencana.hapus) { const r = await aksiKeu("keu_kk_hapus_baris", { p_baris: id }); if (!r.ok) return r; }
            for (const x of rencana.reset) { const r = await tulisKeuKlien("keu_kk_baris", "update", { vol_menjadi: x.vol, harga_menjadi: x.harga }, { id: x.id }); if (!r.ok) return r; }
            return { ok: true as const, data: null };
          }).then((ok) => { if (ok) setYakin(false); })}
        >Ya, kembalikan ke semula</button>
        <button type="button" className={tombolKecil} onClick={() => setYakin(false)}>Batal</button>
      </div>
      <Galat pesan={galat} />
    </div>
  );
}

function BukuSelisih({ item, baris, prioritas }: { item: ItemKec[]; baris: BarisKk[]; prioritas: PrioritasMaster[] }) {
  const buku = useMemo(() => bukuSelisihItem(item, baris, prioritas), [item, baris, prioritas]);
  if (item.length === 0) return null;
  return (
    <section className={`${kartu} flex flex-col gap-2`}>
      <h2 className={judulKartu}>Buku selisih per item (kebutuhan RAB yang belum terdanai)</h2>
      <p className="text-[12.5px] text-[#5B6B84]">Urut prioritas: yang paling atas paling dahulu didanai. Kurang = RAB dikurangi POK Menjadi pada item yang sama.</p>
      {buku.length === 0 ? <p className="text-[13px] text-[#0B6B3F]">Semua item RAB tercukupi oleh POK Menjadi.</p> : (
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead className="bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2.5 py-2">Prioritas</th><th className="px-2.5 py-2">Item</th><th className="px-2.5 py-2">RO</th><th className="px-2.5 py-2">Akun</th><th className="px-2.5 py-2 text-right">RAB</th><th className="px-2.5 py-2 text-right">POK menjadi</th><th className="px-2.5 py-2 text-right">Kurang</th></tr></thead>
            <tbody>{buku.map((x) => (
              <tr key={x.itemId} className="border-t border-[#EEF2F7]">
                <td className="px-2.5 py-2">{x.prioritas ? <Chip warna="ungu">{x.prioritas} {x.prioritasNama ?? ""}</Chip> : <span className="text-[#7A8AA3]">belum ditetapkan</span>}</td>
                <td className="px-2.5 py-2">{x.uraian}{x.selesai && <span className="ml-1 text-[11px] text-[#0B6B3F]">(selesai)</span>}</td>
                <td className="px-2.5 py-2 font-mono text-[11.5px]">{x.ro}</td><td className="px-2.5 py-2 font-mono text-[11.5px]">{x.akun}</td>
                <td className="px-2.5 py-2 text-right font-mono">{rupiah(x.rab)}</td><td className="px-2.5 py-2 text-right font-mono">{rupiah(x.pok)}</td><td className="px-2.5 py-2 text-right font-mono font-semibold text-[#9B1C23]">{rupiah(x.kurang)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Isi() {
  const router = useRouter();
  const sp = useSearchParams();
  const roParam = sp.get("ro");
  const dariMentah = sp.get("dari") ?? "";
  const dari = /^\/sigap\/[A-Za-z0-9/_.%-]*(\?[A-Za-z0-9=&_.%-]*)?$/.test(dariMentah) ? dariMentah : "";

  const jadwal = useBacaKeu<Jadwal>(urlBaca("keu_revisi_jadwal", {}, { urut: "-id", batas: 100, kolom: ["id", "tahun", "jenis", "judul", "status", "buka", "tutup"] }));
  const semuaRo = useBacaKeu<RoRow>(urlBaca("keu_ro", {}, { urut: "kode", batas: 2000, kolom: ["kode", "nama", "sementara", "aktif"] }));
  const urutJadwal = useMemo(() => {
    const j = jadwal.baris ?? [];
    return [...j.filter((x) => x.status === "dibuka" || x.status === "terkumpul"), ...j.filter((x) => !(x.status === "dibuka" || x.status === "terkumpul"))];
  }, [jadwal.baris]);
  const jid = Number(sp.get("jadwal")) || urutJadwal[0]?.id || null;
  const jd = urutJadwal.find((x) => x.id === jid) ?? null;

  const daftarRo = useMemo(() => (semuaRo.baris ?? []).filter((r) => r.aktif), [semuaRo.baris]);
  const namaRo = useMemo(() => new Map(daftarRo.map((r) => [r.kode, r.nama.replace(" (contoh)", "")])), [daftarRo]);
  const daftarKro = useMemo(() => [...new Set(daftarRo.map((r) => kroDariRo(r.kode)).filter((k): k is string => k !== null))].sort(), [daftarRo]);
  const kro = sp.get("kro") && daftarKro.includes(sp.get("kro")!) ? sp.get("kro")! : (roParam ? kroDariRo(roParam) : null) ?? daftarKro[0] ?? null;
  const roKro = useMemo(() => (kro ? roDalamKro(daftarRo.map((r) => r.kode), kro) : []), [daftarRo, kro]);

  const ke = useCallback((p: { jadwal?: number | null; kro?: string | null }) => {
    const q = new URLSearchParams();
    const j = p.jadwal === undefined ? jid : p.jadwal, k = p.kro === undefined ? kro : p.kro;
    if (j) q.set("jadwal", String(j));
    if (k) q.set("kro", k);
    if (dari) q.set("dari", dari);
    router.replace(`/sigap/revisi/kertas?${q.toString()}`, { scroll: false });
  }, [router, jid, kro, dari]);

  const [ulang, setUlang] = useState(0);
  const izin = useIzinBanyak(roKro, jid, ulang);
  const bisaUbah = useCallback((ro: string) => izin[ro] === "ok", [izin]);
  const bolehSahkan = useBoleh("sahkan", null) === true;

  const siap = jid !== null && kro !== null;
  const u = (t: string, saring: Record<string, string | number | (string | number)[]>, opsi: { batas?: number; urut?: string; kolom?: string[] } = {}) => (siap ? urlBaca(t, { jadwal_id: jid!, ...saring }, { batas: 5000, ...opsi }) : null);
  const baris = useBacaKeu<BarisKk>(u("keu_v_kk_baris", { kro: kro ?? "" }, { urut: "urut" }));
  const real = useBacaKeu<Real>(siap && roKro.length ? urlBaca("keu_v_realisasi_item_sekarang", { ro_kode: roKro }, { batas: 5000, kolom: ["detail_id", "nomor_item", "lock_pagu", "real_sd", "sampai_tanggal"] }) : null);
  const r06 = useBacaKeu<R06>(siap && roKro.length ? urlBaca("keu_v_kk_r06", { jadwal_id: jid!, ro_kode: roKro }, { batas: 5000, kolom: ["kk_baris_id", "kekurangan"] }) : null);
  const ringkas = useBacaKeu<RingkasRoKk>(u("keu_v_kk_ringkas", {}, { batas: 1000, kolom: ["ro_kode", "kro", "selisih"] }));
  const periksa = useBacaKeu<BarisPeriksa>(u("keu_v_kk_periksa", {}));
  const kec = useBacaKeu<Kecukupan>(u("keu_v_kk_kecukupan", {}));
  const kecItem = useBacaKeu<ItemKec>(u("keu_v_kk_kecukupan_item", { kro: kro ?? "" }));
  const geseran = useBacaKeu<Geseran>(u("keu_kk_geseran", {}, { urut: "id" }));
  const putus = useBacaKeu<KeputusanRow>(u("keu_kk_keputusan_kro", {}));
  const akun = useBacaKeu<AkunMaster>(urlBaca("keu_master_akun", { aktif: "true" }, { kolom: ["kode", "nama"], urut: "kode", batas: 3000 }));
  const sat = useBacaKeu<{ kode: string }>(urlBaca("keu_master_satuan", { aktif: "true" }, { kolom: ["kode"], urut: "urut", batas: 200 }));
  const prioritas = useBacaKeu<PrioritasMaster>(urlBaca("keu_master_prioritas", {}, { urut: "urut", batas: 50 }));
  const tenggat = useBacaKeu<Tenggat>(urlBaca("keu_v_tenggat", {}, { urut: "tanggal", batas: 20 }));
  const rabIds = useMemo(() => [...new Set((kecItem.baris ?? []).map((x) => Number(x.rab_id)))].filter(Boolean), [kecItem.baris]);
  const rabBaris = useBacaKeu<BarisRabRow>(rabIds.length ? urlBaca("keu_v_rab_baris", { rab_id: rabIds }, { batas: 20000, urut: "urut", kolom: ["baris_id", "item_id", "ket", "volume", "satuan", "harga_satuan", "jumlah"] }) : null);

  const segarkan = useCallback(async () => {
    await Promise.all([baris.muat(), real.muat(), r06.muat(), ringkas.muat(), periksa.muat(), kec.muat(), kecItem.muat(), geseran.muat(), putus.muat(), rabBaris.muat()]);
    setUlang((x) => x + 1);
  }, [baris, real, r06, ringkas, periksa, kec, kecItem, geseran, putus, rabBaris]);
  const { jalankan: muatBaris, mengirim: memuatBaris, galat: galatMuat } = useKirim(segarkan);

  const rows = baris.baris;
  const mx = useMemo(() => {
    if (!rows) return null;
    const per = new Map<number, Ketersediaan>();
    for (const r of real.baris ?? []) per.set(Number(r.detail_id), { nomor: r.nomor_item, booked: n(r.lock_pagu), real: n(r.real_sd) });
    const kurang = new Map<number, number>();
    for (const r of r06.baris ?? []) kurang.set(Number(r.kk_baris_id), n(r.kekurangan));
    return gabungKetersediaan(rows, per, kurang);
  }, [rows, real.baris, r06.baris]);
  const pohon = useMemo(() => bangunPohon(mx ?? []), [mx]);
  const kpi = useMemo(() => kpiMatriks(mx ?? []), [mx]);
  const saran = useMemo(() => sarankanJenis(ringkas.baris ?? [], rows ?? []), [ringkas.baris, rows]);
  const sampaiTanggal = real.baris?.[0]?.sampai_tanggal ?? null;
  const rincian = useMemo(() => {
    const per = new Map<number, RincianRab[]>();
    for (const r of rabBaris.baris ?? []) { const a = per.get(Number(r.item_id)) ?? []; a.push(r as RincianRab & BarisRabRow); per.set(Number(r.item_id), a); }
    const m = new Map<number, RincianRab[]>();
    for (const b of mx ?? []) if (b.rab_item_id !== null && per.has(b.rab_item_id)) m.set(b.id, per.get(b.rab_item_id)!);
    return m;
  }, [rabBaris.baris, mx]);

  // formulir bawah matriks
  const [pasang, setPasang] = useState<BarisKk | null>(null);
  const [tambah, setTambah] = useState<{ ro: string; komponen: string; akun: string } | null>(null);
  const roBisa = useMemo(() => roKro.filter((r) => bisaUbah(r)), [roKro, bisaUbah]);
  const [roAksi, setRoAksi] = useState("");
  const roPilih = roBisa.includes(roAksi) ? roAksi : (roBisa[0] ?? "");
  const barisRoPilih = useMemo(() => (rows ?? []).filter((b) => b.ro_kode === roPilih), [rows, roPilih]);
  const komponenRo = useMemo(() => [...new Set(barisRoPilih.map((b) => b.komponen_kode))].sort(), [barisRoPilih]);
  const komponenDari = (ro: string) => [...new Set((rows ?? []).filter((b) => b.ro_kode === ro).map((b) => b.komponen_kode))].sort();
  const roKosong = useMemo(() => roBisa.filter((r) => !(rows ?? []).some((b) => b.ro_kode === r)), [roBisa, rows]);
  const tenggatTampil = (tenggat.baris ?? []).slice(0, 4);
  const mesin = ringkas.baris ? saran : null;
  const beda = jd && mesin && mesin.jenis && jd.jenis !== mesin.jenis;

  const galatMuatan = jadwal.galat ?? semuaRo.galat ?? baris.galat;
  const pesanIzin = roKro.filter((r) => izin[r] && izin[r] !== "ok").map((r) => `${r}: ${PESAN_IZIN[izin[r]!] ?? "tidak dapat diubah"}`);

  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Revisi anggaran" }, { t: "Kertas kerja" }]}
      induk={dari || "/sigap/revisi"}
      labelKembali={dari.startsWith("/sigap/ro/") ? "RO" : "Jadwal revisi"}
      judul={<>Kertas Kerja Revisi POK{jd ? `, TA ${jd.tahun}` : ""}</>}
      sub={kro ? <>KRO {kro} · {roKro.length} RO{mx ? ` · ${kpi.nItem} detail · ${rupiah(kpi.menjadi)}` : ""}</> : undefined}
    >
      {galatMuatan && <Galat pesan={galatMuatan} />}
      {(jadwal.memuat || semuaRo.memuat) && <Memuat />}
      {jadwal.baris && jadwal.baris.length === 0 && <Kosong teks="Belum ada jadwal revisi. PPK membuat dan membuka jadwal lewat halaman Jadwal revisi." />}

      {jd && kro && (
        <>
          <section className={`${kartu} flex flex-col gap-3`}>
            <div className="flex flex-wrap items-end gap-2">
              <div><label className={label} htmlFor="kk-j">Jadwal revisi</label>
                <select id="kk-j" className={`${kolom} !w-auto max-w-full`} value={jd.id} onChange={(e) => ke({ jadwal: Number(e.target.value) })}>{urutJadwal.map((x) => <option key={x.id} value={x.id}>{x.judul}</option>)}</select></div>
              <div><label className={label} htmlFor="kk-k">KRO</label>
                <select id="kk-k" className={`${kolom} !w-auto max-w-full`} value={kro} onChange={(e) => ke({ kro: e.target.value })}>{daftarKro.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
              <Chip warna={jd.status === "dibuka" ? "hijau" : jd.status === "terkumpul" ? "kuning" : "abu"}>{jd.status === "dibuka" || jd.status === "terkumpul" ? "Draf, belum diterapkan" : (LABEL_STATUS_JADWAL[jd.status] ?? jd.status)}</Chip>
              <Chip warna="biru">{LABEL_JENIS_JADWAL[jd.jenis] ?? jd.jenis}</Chip>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {roKosong.length > 0 && (
                  <button type="button" disabled={memuatBaris} className={tombolUtama} onClick={() => void muatBaris(async () => {
                    for (const ro of roKosong) { const r = await aksiKeu("keu_kk_muat_ro", { p_jadwal: jd.id, p_ro: ro }); if (!r.ok) return r; }
                    return { ok: true as const, data: null };
                  })}>Muat baris POK ({roKosong.length} RO)</button>
                )}
                {rows && <KembaliSemula rows={rows} geseran={geseran.baris ?? []} boleh={bisaUbah} sesudah={segarkan} />}
              </div>
            </div>
            <p className="text-[12.5px] text-[#5B6B84]">{daftarKro.length} KRO. RO dalam KRO ini: {roKro.map((r) => `${r} ${namaRo.get(r) ?? ""}`.trim()).join("; ") || "-"}. Semula = POK berlaku, tidak dapat diubah. Menjadi = usulan; setiap RO harus tepat sampai pagu resmi.</p>
            <Galat pesan={galatMuat} />
            {pesanIzin.length > 0 && <Catatan>Hanya lihat untuk RO berikut: {pesanIzin.join("; ")}.</Catatan>}
          </section>

          {mx && (
            <div className={kisi}>
              <Kpi label="Kelengkapan RAB" nilai={kpi.pctRab === null ? "-" : `${kpi.pctRab}%`} sub={`${kpi.nBerRab} dari ${kpi.nItem} item sudah terhubung RAB`} warna={kpi.pctRab === 100 ? "hj" : kpi.pctRab !== null && kpi.pctRab < 50 ? "mr" : "kn"} />
              <Kpi label="Realisasi TA lalu" nilai="-" sub="Belum ada arsip TA sebelumnya" />
              <Kpi label="Realisasi resmi SPAN" nilai={rupiah(kpi.real)} sub={sampaiTanggal ? `s.d. ${tglPanjang(sampaiTanggal)} · Booked ${rupiah(kpi.booked)}` : "Belum ada unggahan realisasi"} />
              <Kpi label="Pagu KRO (Semula / Menjadi)" nilai={rupiah(kpi.menjadi)} sub={`Semula ${rupiah(kpi.semula)} · Selisih ${fmtSel(kpi.selisih)}`} warna={kpi.selisih === 0 ? "hj" : "mr"} />
            </div>
          )}

          <section className={`${kartu} flex flex-col gap-2`}>
            <h2 className={judulKartu}>Jenis revisi</h2>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span>Jadwal ini: <b>{LABEL_JENIS_JADWAL[jd.jenis] ?? jd.jenis}</b></span>
              {mesin && <><span className="text-[#7A8AA3]">·</span><span>Disarankan sistem: <b>{mesin.jenisNama}</b> (tingkat {mesin.tingkat}: {mesin.tingkatNama})</span></>}
            </div>
            {mesin && mesin.alasan.length > 0 && <ul className="list-disc pl-5 text-[12.5px] text-[#44546F]">{mesin.alasan.map((a) => <li key={a}>{a}</li>)}</ul>}
            {beda && <Catatan>Jenis jadwal ({LABEL_JENIS_JADWAL[jd.jenis] ?? jd.jenis}) berbeda dari saran sistem ({JENIS_NAMA[mesin!.jenis!]}). Saran dihitung dari seluruh kertas kerja jadwal ini; PPK yang menentukan jenisnya.</Catatan>}
            <div className="flex flex-col gap-1">
              <div className={caps}>Tenggat Pasal 175</div>
              {tenggatTampil.length === 0 && <p className="text-[12.5px] text-[#5B6B84]">Belum ada tenggat yang diatur.</p>}
              {tenggatTampil.map((t) => { const s = statusTenggat(t.sisa_hari); return (
                <div key={t.kode} className="flex flex-wrap items-center justify-between gap-2 text-[13px]"><span>{t.nama.replace(/^Tenggat /, "")}</span><Chip warna={s.warna}>{tglPanjang(t.tanggal)}{s.teks ? `, ${s.teks}` : ""}</Chip></div>
              ); })}
            </div>
          </section>

          <KartuPeriksa p={periksa.baris ?? []} />
          <KartuKecukupan jadwal={jd.id} ro={roKro.join(", ")} kro={kro} kec={kec.baris ?? []} keputusan={putus.baris ?? []} bolehPutus={bolehSahkan} sesudah={segarkan} />
          <BukuSelisih item={kecItem.baris ?? []} baris={rows ?? []} prioritas={prioritas.baris ?? []} />

          {baris.terpotong && <Potong />}
          {!mx ? <Memuat tinggi="h-64" /> : mx.length === 0 ? (
            <Kosong teks={roBisa.length > 0 ? "Kertas kerja KRO ini masih kosong. Klik \"Muat baris POK\" untuk menyalin POK berlaku sebagai kolom Semula." : "Kertas kerja KRO ini belum dimuat."} />
          ) : (
            <Matriks pohon={pohon} semua={mx} namaRo={namaRo} bisaUbah={bisaUbah} rincian={rincian} sesudah={segarkan} onGanti={(b) => setPasang(b)} onTambah={(d) => setTambah(d)} />
          )}

          {pasang && <PanelPasangan b={pasang} jadwal={jd.id} akun={akun.baris ?? []} sesudah={segarkan} tutup={() => setPasang(null)} />}
          {tambah && <FormBaru key={`${tambah.ro}-${tambah.komponen}-${tambah.akun}`} jadwal={jd.id} ro={tambah.ro} komponen={komponenDari(tambah.ro)} akun={akun.baris ?? []} satuan={(sat.baris ?? []).map((s) => s.kode)} sesudah={segarkan} awal={{ komponen: tambah.komponen, akun: tambah.akun }} onTutup={() => setTambah(null)} />}

          {roBisa.length > 0 && mx && mx.length > 0 && (
            <section className={`${kartu} flex flex-col gap-2.5`}>
              <h2 className={judulKartu}>Item baru dan Dana penggenap</h2>
              <div className="max-w-[420px]"><label className={label} htmlFor="kk-ra">RO</label>
                <select id="kk-ra" className={kolom} value={roPilih} onChange={(e) => setRoAksi(e.target.value)}>{roBisa.map((r) => <option key={r} value={r}>{r} {(namaRo.get(r) ?? "").slice(0, 40)}</option>)}</select></div>
              {roPilih && komponenRo.length > 0 && (
                <>
                  <p className="text-[12.5px] text-[#5B6B84]">Sisa pagu RO {roPilih}: <b>{rupiah(sisaTerhadapPagu(barisRoPilih))}</b>{sisaTerhadapPagu(barisRoPilih) > 0 ? ". Dana penggenap menampung sisa ini." : sisaTerhadapPagu(barisRoPilih) < 0 ? ". Jumlah Menjadi melebihi pagu RO; kurangi pada baris lain." : ". Sudah tepat sampai pagu."}</p>
                  <FormBaru key={`b-${roPilih}`} jadwal={jd.id} ro={roPilih} komponen={komponenRo} akun={akun.baris ?? []} satuan={(sat.baris ?? []).map((s) => s.kode)} sesudah={segarkan} />
                  <FormPenggenap key={`p-${roPilih}`} jadwal={jd.id} ro={roPilih} komponen={komponenRo} akun={akun.baris ?? []} sisa={sisaTerhadapPagu(barisRoPilih)} sesudah={segarkan} />
                </>
              )}
            </section>
          )}

          {mx && <KartuGeseran jadwal={jd.id} baris={rows ?? []} geseran={geseran.baris ?? []} bisaUbah={roBisa.length > 0} sesudah={segarkan} />}
        </>
      )}
    </HalamanKeu>
  );
}

export default function HalamanKertasKro() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
