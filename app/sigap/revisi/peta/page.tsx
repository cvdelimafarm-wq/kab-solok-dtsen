"use client";

// app/sigap/revisi/peta/page.tsx
//
// (24 Okt 2026, tahap 8) Peta KRO Satker (papan 8 mockup): kecukupan seluruh KRO sekaligus, putusan tingkat Satker (POK - RAB seluruh KRO),
// jalur yang mungkin menurut tangga wewenang, tabel Kegiatan > KRO, serta Tampilan PPK: kekurangan pagu per KRO dan keputusan (Terima semua,
// Terima sebagian, Tunda) beserta sumber bagian yang diterima. RAB dan POK tidak diubah di halaman ini; keputusan PPK disimpan lewat
// keu_kk_putuskan (hak "sahkan"). Alamat: /sigap/revisi/peta?jadwal=<id>&dari=<alamat asal>. Logika murni: lib/keu/peta.ts dan lib/keu/kecukupan.ts.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LABEL_STATUS_JADWAL } from "@/lib/keu/revisi";
import { pilihRab, rupiah, urlBaca, type BarisRabRingkas } from "@/lib/keu/ro";
import { argsKeputusan, periksaKeputusan, type KeputusanKro } from "@/lib/keu/kk";
import { FAKTOR_BAWAAN, LABEL_KECUKUPAN, TOLERANSI_BAWAAN, WARNA_STATUS_KECUKUPAN } from "@/lib/keu/kecukupan";
import {
  hitungPeta, jalurPeta, kelompokKegiatan, keputusanDariBasis, ketKro, LABEL_PPK, ppkDaftar, ringkasPeta, susunPeta, teksSumber, vonisSatker,
  type DaftarKeputusan, type DetailPeta, type ItemPeta, type KeputusanPeta, type KkPeta, type NodePeta,
} from "@/lib/keu/peta";
import { caps, Chip, Galat, HalamanKeu, judulKartu, kartu, kisi, kolom, Kosong, Kpi, label, Memuat, Potong, tombolAktif, tombolKecil, tombolUtama } from "../../keu-ui";
import { useBacaKeu, useBoleh, useKirim } from "../../ro/useKeu";
import type { ParamMaster } from "../kertas/Kecukupan";
import type { KeputusanRow } from "../kertas/Bagian";

type Jadwal = { id: number; tahun: number; jenis: string; judul: string; status: string };
type DasarRab = "aktif" | "disetujui";

const angkaParam = (p: ParamMaster[], kode: string, bawaan: number): number => { const v = Number(p.find((x) => x.kode === kode)?.nilai); return Number.isFinite(v) && v > 0 ? v : bawaan; };
const koma = (v: number) => String(v).replace(".", ",");
const fmtSel = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "-"}${rupiah(Math.abs(v))}`);
const warnaSel = (v: number) => (v < 0 ? "text-[#9B1C23]" : v > 0 ? "text-[#0B6B3F]" : "text-[#5B6B84]");
const strip = (v: number, ada: boolean) => (ada ? rupiah(v) : "-");

function Vonis({ v }: { v: ReturnType<typeof vonisSatker> }) {
  return (
    <section className={`${kartu} flex flex-col gap-1.5`} style={{ borderLeft: `4px solid ${v.warna === "hijau" ? "#2E9E63" : v.warna === "merah" ? "#B42329" : "#9AA8BF"}` }}>
      <p className={caps}>Putusan tingkat Satker</p>
      <div><Chip warna={v.warna}>{v.label}</Chip></div>
      <p className="max-w-[90ch] text-[13px] text-[#1B2B4B]">{v.teks}</p>
      <p className="max-w-[90ch] text-[12px] text-[#5B6B84]">Bila jumlah seluruh KRO masih lebih dari atau sama dengan 0, pagu Satker cukup dan DJA tidak diperlukan; kekurangan satu KRO diselesaikan dengan pergeseran antar-KRO. Bila kurang dari 0, perlu pagu tambahan (DJA, tidak dijamin) atau cakupan kegiatan dikurangi.</p>
    </section>
  );
}

type DrafPpk = { m: KeputusanKro; jum: string; cat: string };

function BarisKeputusan({ r, draf, ubah, simpan, tersimpan, bolehPutus, mengirim, galat }: {
  r: ReturnType<typeof ppkDaftar>["rows"][number]; draf: DrafPpk | undefined; ubah: (d: DrafPpk | null) => void; simpan: () => void;
  tersimpan: KeputusanRow | undefined; bolehPutus: boolean; mengirim: boolean; galat: string[] | null;
}) {
  const pilih: KeputusanKro | "" = draf?.m ?? (tersimpan?.keputusan ?? "");
  const awal: DrafPpk = draf ?? { m: tersimpan?.keputusan ?? "semua", jum: tersimpan?.jumlah != null ? String(tersimpan.jumlah) : "", cat: tersimpan?.catatan ?? "" };
  const pasang = (m: KeputusanKro) => ubah({ ...awal, m, jum: m === "sebagian" && !awal.jum ? String(Math.round(r.kurang / 2)) : awal.jum });
  const tombol = (m: KeputusanKro, teks: string) => (
    <button type="button" disabled={!bolehPutus} aria-pressed={pilih === m} className={pilih === m ? tombolAktif : tombolKecil} onClick={() => pasang(m)}>{teks}</button>
  );
  return (
    <tr className="border-t border-[#EEF2F7] align-top">
      <td className="px-2.5 py-2"><b className="font-mono">{r.kro}</b><div className="text-[11.5px] text-[#5B6B84]">{r.nama}</div><div className="text-[11px] text-[#7A8AA3]">Kegiatan {r.keg}</div></td>
      <td className="px-2.5 py-2 text-right font-mono">{rupiah(r.Pc)}</td>
      <td className="px-2.5 py-2 text-right font-mono">{rupiah(r.R)}</td>
      <td className="px-2.5 py-2 text-right font-mono font-semibold text-[#9B1C23]">{rupiah(r.kurang)}</td>
      <td className="px-2.5 py-2">
        <div className="flex flex-col gap-1.5">
          <Chip warna={r.m === "" ? "kuning" : r.m === "tunda" ? "abu" : "hijau"}>{r.label}</Chip>
          {bolehPutus && (
            <>
              <div className="flex flex-wrap gap-1">{tombol("semua", "Terima semua")}{tombol("sebagian", "Terima sebagian")}{tombol("tunda", "Tunda")}</div>
              {draf && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-[#DCE3EE] bg-[#F9FBFE] p-2">
                  {draf.m === "sebagian" && (
                    <div><label className={label} htmlFor={`pj-${r.kro}`}>Jumlah diterima Rp</label><input id={`pj-${r.kro}`} inputMode="decimal" className={kolom} value={draf.jum} onChange={(e) => ubah({ ...draf, jum: e.target.value })} /></div>
                  )}
                  <div><label className={label} htmlFor={`pc-${r.kro}`}>Catatan</label><input id={`pc-${r.kro}`} className={kolom} value={draf.cat} onChange={(e) => ubah({ ...draf, cat: e.target.value })} /></div>
                  <Galat pesan={galat} />
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" disabled={mengirim || (galat?.length ?? 0) > 0} className={tombolUtama} onClick={simpan}>Simpan keputusan</button>
                    <button type="button" className={tombolKecil} onClick={() => ubah(null)}>Batal</button>
                  </div>
                </div>
              )}
              {!draf && tersimpan?.catatan && <p className="text-[11.5px] text-[#5B6B84]">Catatan: {tersimpan.catatan}</p>}
            </>
          )}
        </div>
      </td>
      <td className="px-2.5 py-2 text-right font-mono">{rupiah(r.diterima)}</td>
      <td className="px-2.5 py-2 text-right font-mono">{rupiah(r.tertunda + r.menunggu)}</td>
      <td className="px-2.5 py-2 text-[12.5px]">{teksSumber(r)}</td>
    </tr>
  );
}

function Isi() {
  const router = useRouter();
  const sp = useSearchParams();
  const dariMentah = sp.get("dari") ?? "";
  const dari = /^\/sigap\/[A-Za-z0-9/_.%-]*(\?[A-Za-z0-9=&_.%-]*)?$/.test(dariMentah) ? dariMentah : "";
  const dasarParam = sp.get("dasar");
  const dasar: DasarRab = dasarParam === "disetujui" ? "disetujui" : "aktif";

  const jadwal = useBacaKeu<Jadwal>(urlBaca("keu_revisi_jadwal", {}, { urut: "-id", batas: 100, kolom: ["id", "tahun", "jenis", "judul", "status"] }));
  const urutJadwal = useMemo(() => {
    const j = jadwal.baris ?? [];
    return [...j.filter((x) => x.status === "dibuka" || x.status === "terkumpul"), ...j.filter((x) => !(x.status === "dibuka" || x.status === "terkumpul"))];
  }, [jadwal.baris]);
  const jid = Number(sp.get("jadwal")) || urutJadwal[0]?.id || null;
  const jd = urutJadwal.find((x) => x.id === jid) ?? null;
  const ke = useCallback((p: { jadwal?: number | null; dasar?: DasarRab }) => {
    const q = new URLSearchParams();
    const j = p.jadwal === undefined ? jid : p.jadwal, d = p.dasar === undefined ? dasar : p.dasar;
    if (j) q.set("jadwal", String(j));
    if (d !== "aktif") q.set("dasar", d);
    if (dari) q.set("dari", dari);
    router.replace(`/sigap/revisi/peta?${q.toString()}`, { scroll: false });
  }, [router, jid, dasar, dari]);

  const pokBerlaku = useBacaKeu<{ id: number; nomor_revisi: number; tanggal_efektif: string | null }>(urlBaca("keu_pok_versi", { status: "berlaku" }, { urut: "-id", batas: 1, kolom: ["id", "nomor_revisi", "tanggal_efektif"] }));
  const idPok = pokBerlaku.baris?.[0]?.id ?? null;
  const node = useBacaKeu<NodePeta>(idPok !== null ? urlBaca("keu_v_pok_node_tampil", { versi_id: idPok, tingkat: ["program", "kegiatan", "kro", "ro"] }, { batas: 2000, kolom: ["id", "induk_id", "tingkat", "kode", "nama", "pagu", "ro_kode"] }) : null);
  const detail = useBacaKeu<DetailPeta>(idPok !== null ? urlBaca("keu_pok_detail", { versi_id: idPok }, { batas: 8000, kolom: ["kunci_stabil", "jumlah"] }) : null);
  const ringkasRab = useBacaKeu<BarisRabRingkas>(urlBaca("keu_v_rab_ringkas", {}, { batas: 3000 }));
  const param = useBacaKeu<ParamMaster>(urlBaca("keu_master_param", {}, { batas: 20 }));
  const kk = useBacaKeu<KkPeta>(jid !== null ? urlBaca("keu_v_kk_baris", { jadwal_id: jid }, { batas: 8000, kolom: ["ro_kode", "pok_kunci", "jumlah_menjadi", "rab_item_id", "penggenap"] }) : null);
  const putus = useBacaKeu<KeputusanRow>(jid !== null ? urlBaca("keu_kk_keputusan_kro", { jadwal_id: jid }, { batas: 500 }) : null);
  const bolehPutus = useBoleh("sahkan", null) === true;

  const faktor = angkaParam(param.baris ?? [], "faktor_kebutuhan", FAKTOR_BAWAAN), toleransi = angkaParam(param.baris ?? [], "toleransi_cukup", TOLERANSI_BAWAAN);
  const struktur = useMemo(() => susunPeta(node.baris ?? [], (detail.baris ?? []).map((d) => d.kunci_stabil)), [node.baris, detail.baris]);
  const rabTerpilih = useMemo(() => {
    const semua = (ringkasRab.baris ?? []).filter((r) => dasar === "aktif" || r.status === "disetujui");
    const hasil: { rab_id: number; ro_kode: string }[] = [];
    for (const ro of new Set(struktur.flatMap((s) => s.ro))) { const r = pilihRab(semua, ro); if (r) hasil.push({ rab_id: r.rab_id, ro_kode: ro }); }
    return hasil;
  }, [ringkasRab.baris, struktur, dasar]);
  const idRab = useMemo(() => rabTerpilih.map((r) => r.rab_id).sort((a, b) => a - b), [rabTerpilih]);
  const item = useBacaKeu<ItemPeta>(idRab.length ? urlBaca("keu_v_rab_item", { rab_id: idRab }, { batas: 20000, kolom: ["item_id", "rab_id", "pok_kunci", "baru", "status", "jumlah_rab", "selesai"] }) : null);

  const baris = useMemo(() => hitungPeta(struktur, rabTerpilih, item.baris ?? [], detail.baris ?? [], kk.baris ?? [], faktor, toleransi), [struktur, rabTerpilih, item.baris, detail.baris, kk.baris, faktor, toleransi]);
  const ringkas = useMemo(() => ringkasPeta(baris), [baris]);
  const vonis = useMemo(() => vonisSatker(ringkas, faktor), [ringkas, faktor]);
  const jalur = useMemo(() => jalurPeta(baris, ringkas), [baris, ringkas]);
  const kelompok = useMemo(() => kelompokKegiatan(baris), [baris]);
  const nTakPadan = useMemo(() => baris.reduce((s, b) => s + b.nTakPadan, 0), [baris]);

  const [draf, setDraf] = useState<Record<string, DrafPpk>>({});
  useEffect(() => { setDraf({}); }, [jid]);
  const tersimpan = useMemo(() => new Map((putus.baris ?? []).map((p) => [p.kro, p])), [putus.baris]);
  const keputusan: DaftarKeputusan = useMemo(() => {
    const d = keputusanDariBasis(putus.baris ?? []);
    for (const [kro, x] of Object.entries(draf)) d[kro] = { m: x.m as KeputusanPeta, jum: Number(x.jum.replace(/\./g, "").replace(",", ".")) || 0 };
    return d;
  }, [putus.baris, draf]);
  const ppk = useMemo(() => ppkDaftar(baris, keputusan), [baris, keputusan]);

  const segarkan = useCallback(async () => { await Promise.all([putus.muat(), item.muat(), kk.muat(), ringkasRab.muat()]); }, [putus, item, kk, ringkasRab]);
  const { kirim, mengirim, galat: galatKirim, hapusGalat } = useKirim(segarkan);

  const memuat = pokBerlaku.memuat || node.memuat || detail.memuat || ringkasRab.memuat || jadwal.memuat;
  const galatMuatan = jadwal.galat ?? pokBerlaku.galat ?? node.galat ?? detail.galat ?? ringkasRab.galat ?? item.galat ?? kk.galat ?? putus.galat;
  const terpotong = node.terpotong || detail.terpotong || ringkasRab.terpotong || item.terpotong || kk.terpotong;
  const ada = ringkas.nAda > 0;
  const kolomJudul = "px-2.5 py-2";

  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Revisi anggaran" }, { t: "Peta KRO Satker" }]}
      induk={dari || "/sigap/revisi"}
      labelKembali={dari.startsWith("/sigap/revisi/kertas") ? "Kertas kerja" : "Jadwal revisi"}
      penuh
      judul={<>Peta KRO Satker: kecukupan seluruh KRO</>}
      sub={pokBerlaku.baris?.[0] ? <>POK berlaku revisi {pokBerlaku.baris[0].nomor_revisi}{pokBerlaku.baris[0].tanggal_efektif ? `, efektif ${pokBerlaku.baris[0].tanggal_efektif}` : ""} · {struktur.length} KRO · RAB dibaca dari RAB masing-masing RO</> : undefined}
    >
      {galatMuatan && <Galat pesan={galatMuatan} />}
      {memuat && <Memuat />}

      <section className={`${kartu} flex flex-col gap-3`}>
        <p className="max-w-[100ch] text-[13px] text-[#1B2B4B]">
          Papan ini dipakai bila sebuah KRO masih berstatus Kurang setelah dana digeser di dalam KRO. Pada Revisi POK, kekurangan itu hanya dapat dikelola dengan menurunkan volume item yang boleh ditunda (kertas kerja), dan selisihnya tetap tercatat sebagai angka. Bila ingin ditutup, jenis revisinya menjadi Revisi DIPA, dan daftar kekurangan KRO diputuskan PPK pada Tampilan PPK di bawah. Jalurnya mengikuti tangga wewenang: sisa di KRO lain pada Kegiatan yang sama lewat Revisi DIPA jalur DJPb (tingkat 3), antar-Kegiatan dengan persetujuan Eselon I (tingkat 4), atau pagu tambahan lewat DJA (tidak dijamin). Sistem hanya menunjukkan pilihan, keputusan tetap di tim. RAB tidak pernah diubah.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className={label} htmlFor="pt-j">Jadwal revisi (kertas kerja dan keputusan)</label>
            <select id="pt-j" className={`${kolom} !w-auto max-w-full`} value={jd?.id ?? ""} onChange={(e) => ke({ jadwal: Number(e.target.value) })}>{urutJadwal.map((x) => <option key={x.id} value={x.id}>{x.judul}</option>)}</select></div>
          <div><label className={label} htmlFor="pt-d">RAB yang dibaca</label>
            <select id="pt-d" className={`${kolom} !w-auto max-w-full`} value={dasar} onChange={(e) => ke({ dasar: e.target.value as DasarRab })}><option value="aktif">RAB aktif (draf, diproses, atau disetujui)</option><option value="disetujui">Hanya RAB yang disetujui</option></select></div>
          {jd && <Chip warna={jd.status === "dibuka" ? "hijau" : jd.status === "terkumpul" ? "kuning" : "abu"}>{LABEL_STATUS_JADWAL[jd.status] ?? jd.status}</Chip>}
          <div className="ml-auto flex flex-wrap items-center gap-2 text-[12px] text-[#5B6B84]">
            <span>RAB menutup</span><span className="rounded-md border border-[#DCE3EE] bg-[#F5F8FE] px-2 py-1 font-mono font-semibold text-[#0F2A52]">{koma(faktor)}</span><span>dari kebutuhan riil</span>
            <span>Toleransi Cukup ±</span><span className="rounded-md border border-[#DCE3EE] bg-[#F5F8FE] px-2 py-1 font-mono font-semibold text-[#0F2A52]">{Math.round(toleransi * 100)}%</span>
          </div>
        </div>
        <p className="text-[12px] text-[#7A8AA3]">Faktor dan toleransi berlaku untuk seluruh kantor dan diatur di Master data. POK pembanding per item adalah angka Menjadi pada kertas kerja jadwal terpilih bila item itu sudah dimuat di sana, bila tidak POK berlaku.</p>
      </section>

      {!memuat && struktur.length === 0 && <Kosong teks="Struktur POK berlaku belum tersedia. Impor POK lebih dulu lewat halaman Unggah POK." />}

      {struktur.length > 0 && (
        <>
          <section className={`${kartu} flex flex-col gap-3`}>
            <h2 className={judulKartu}>Jumlah seluruh KRO</h2>
            <div className={kisi}>
              <Kpi label="POK" nilai={strip(ringkas.P, ada)} />
              <Kpi label="RAB" nilai={strip(ringkas.R, ada)} />
              <Kpi label="Kebutuhan riil" nilai={strip(ringkas.K, ada)} />
              <Kpi label="POK − RAB" nilai={ada ? fmtSel(ringkas.dPasti) : "-"} warna={ada ? (ringkas.dPasti >= 0 ? "hj" : "mr") : undefined} />
              <Kpi label="POK − kebutuhan riil" nilai={ada ? fmtSel(ringkas.dRiil) : "-"} warna={ada ? (ringkas.dRiil >= 0 ? "hj" : "kn") : undefined} />
            </div>
            <p className="text-[12px] text-[#5B6B84]">Dihitung pada item yang sudah punya RAB ({ringkas.nAda} dari {ringkas.nKro} KRO sudah punya RAB). Pagu seluruh Satker {rupiah(ringkas.pagu)}.{nTakPadan > 0 ? ` ${nTakPadan} item RAB belum terpadan ke POK berlaku sehingga dilewati (kunci item berubah pada POK terbaru; padankan lewat Unggah POK).` : ""}</p>
          </section>

          <Vonis v={vonis} />

          <section className="flex flex-col gap-2">
            <h2 className={judulKartu}>Jalur yang mungkin menurut peta</h2>
            <div className={kisi}>
              {jalur.map((j) => (
                <div key={j.judul} className={`${kartu} flex flex-col gap-1`}>
                  <p className="text-[13.5px] font-bold text-[#0F2A52]">{j.judul}</p>
                  <div><Chip warna="biru">{j.tingkat}</Chip></div>
                  <p className="text-[12.5px] text-[#1B2B4B]">{j.teks}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={`${kartu} flex flex-col gap-2`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className={`${judulKartu} mr-2`}>Peta Kegiatan dan KRO</h2>
              {(["kurang", "tipis", "cukup", "lebih"] as const).map((s) => <Chip key={s} warna={WARNA_STATUS_KECUKUPAN[s]}>{LABEL_KECUKUPAN[s]}</Chip>)}
            </div>
            <p className="text-[12px] text-[#5B6B84]">Status memakai aturan yang sama dengan panel Kecukupan KRO pada kertas kerja. Kode KRO yang muncul dua kali pada POK (dua blok alokasi) digabung menjadi satu, sesuai kertas kerja.</p>
            <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
              <table className="w-full min-w-[1100px] text-left text-[12.5px]">
                <thead className="bg-[#EEF3FB] text-[#44546F]"><tr>
                  <th className={kolomJudul}>Kegiatan atau KRO</th><th className={kolomJudul}>RO</th><th className={`${kolomJudul} text-right`}>POK dibandingkan</th><th className={`${kolomJudul} text-right`}>RAB</th><th className={`${kolomJudul} text-right`}>Kebutuhan riil</th>
                  <th className={kolomJudul}>Status</th><th className={`${kolomJudul} text-right`}>POK − RAB</th><th className={`${kolomJudul} text-right`}>POK − kebutuhan</th><th className={kolomJudul}>Keterangan</th>
                </tr></thead>
                <tbody>
                  {kelompok.flatMap((g) => [
                    <tr key={`g-${g.keg}`} className="border-t border-[#DCE3EE] bg-[#F5F8FE] align-top font-semibold">
                      <td className={kolomJudul} colSpan={2}>Kegiatan {g.keg} {g.nama}</td>
                      <td className={`${kolomJudul} text-right font-mono`}>{g.R > 0 ? rupiah(g.P) : "-"}</td><td className={`${kolomJudul} text-right font-mono`}>{g.R > 0 ? rupiah(g.R) : "-"}</td><td className={`${kolomJudul} text-right font-mono`}>{g.R > 0 ? rupiah(g.K) : "-"}</td>
                      <td className={kolomJudul} />
                      <td className={`${kolomJudul} text-right font-mono ${g.R > 0 ? warnaSel(g.P - g.R) : ""}`}>{g.R > 0 ? fmtSel(g.P - g.R) : "-"}</td>
                      <td className={`${kolomJudul} text-right font-mono ${g.R > 0 ? warnaSel(g.P - g.K) : ""}`}>{g.R > 0 ? fmtSel(g.P - g.K) : "-"}</td>
                      <td className={`${kolomJudul} text-[12px] font-normal text-[#44546F]`}>{g.ket}</td>
                    </tr>,
                    ...g.kro.map((b) => (
                      <tr key={b.kro} className="border-t border-[#EEF2F7] align-top">
                        <td className={kolomJudul}><b className="font-mono">{b.kro}</b><div className="text-[11.5px] text-[#5B6B84]">{b.nama}</div></td>
                        <td className={`${kolomJudul} font-mono text-[11.5px]`}>{b.ro.map((r) => `RO ${r.slice(9)}`).join(", ")}</td>
                        <td className={`${kolomJudul} text-right font-mono`}>{strip(b.Pc, b.nAda > 0)}</td><td className={`${kolomJudul} text-right font-mono`}>{strip(b.R, b.nAda > 0)}</td><td className={`${kolomJudul} text-right font-mono`}>{strip(b.K, b.nAda > 0)}</td>
                        <td className={kolomJudul}><Chip warna={WARNA_STATUS_KECUKUPAN[b.st]}>{LABEL_KECUKUPAN[b.st]}</Chip></td>
                        <td className={`${kolomJudul} text-right font-mono ${b.nAda > 0 ? warnaSel(b.dPasti) : ""}`}>{b.nAda > 0 ? fmtSel(b.dPasti) : "-"}</td>
                        <td className={`${kolomJudul} text-right font-mono ${b.nAda > 0 ? warnaSel(b.dRiil) : ""}`}>{b.nAda > 0 ? fmtSel(b.dRiil) : "-"}</td>
                        <td className={`${kolomJudul} text-[12px] text-[#44546F]`}>{ketKro(b)}</td>
                      </tr>
                    )),
                  ])}
                  <tr className="border-t-2 border-[#DCE3EE] bg-[#EEF3FB] font-bold">
                    <td className={kolomJudul} colSpan={2}>Jumlah seluruh KRO</td>
                    <td className={`${kolomJudul} text-right font-mono`}>{strip(ringkas.P, ada)}</td><td className={`${kolomJudul} text-right font-mono`}>{strip(ringkas.R, ada)}</td><td className={`${kolomJudul} text-right font-mono`}>{strip(ringkas.K, ada)}</td><td className={kolomJudul} />
                    <td className={`${kolomJudul} text-right font-mono ${ada ? warnaSel(ringkas.dPasti) : ""}`}>{ada ? fmtSel(ringkas.dPasti) : "-"}</td><td className={`${kolomJudul} text-right font-mono ${ada ? warnaSel(ringkas.dRiil) : ""}`}>{ada ? fmtSel(ringkas.dRiil) : "-"}</td><td className={kolomJudul} />
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-[#5B6B84]">Prioritas item (Inti, Penting, Dapat ditunda) diatur per item di tab RAB. Memangkas volume item adalah keputusan tim, bukan keputusan sistem. KRO yang belum punya RAB tidak ikut jumlah; lengkapi RAB-nya agar peta makin tegas.</p>
            {terpotong && <Potong />}
          </section>

          <section className={`${kartu} flex flex-col gap-3`}>
            <div>
              <h2 className={judulKartu}>Tampilan PPK: kekurangan pagu per KRO dan keputusan (Revisi DIPA)</h2>
              <p className="mt-1 max-w-[100ch] text-[12.5px] text-[#5B6B84]">Kekurangan pagu = RAB dikurangi POK pada KRO yang bersangkutan. Operator tidak menutupnya sendiri: PPK memutuskan per KRO apakah menerima semua usulan, menerima sebagian, atau menunda. Angka yang diterima menjadi bahan usulan Revisi DIPA (pemicu R-01) dan sumbernya ditelusuri menurut tangga wewenang; yang ditunda atau belum diputuskan tetap tercatat di Buku selisih. RAB tidak diubah, POK baru berubah setelah DIPA disahkan.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip warna="merah">Kekurangan {rupiah(ppk.total.kurang)}</Chip><Chip warna="hijau">Diterima {rupiah(ppk.total.diterima)}</Chip><Chip warna="abu">Ditunda {rupiah(ppk.total.ditunda)}</Chip><Chip warna="kuning">Menunggu {rupiah(ppk.total.menunggu)}</Chip>
            </div>
            {ppk.rows.length === 0 ? (
              <p className="rounded-lg border border-[#CBE8D7] bg-[#F1FAF5] px-3 py-2 text-[13px] text-[#0B6B3F]">{ada ? "Tidak ada KRO yang kekurangan pagu terhadap RAB." : "Belum ada RAB yang dapat dibandingkan, jadi belum ada kekurangan pagu."}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
                <table className="w-full min-w-[1060px] text-left text-[12.5px]">
                  <thead className="bg-[#EEF3FB] text-[#44546F]"><tr>
                    <th className={kolomJudul}>KRO</th><th className={`${kolomJudul} text-right`}>POK</th><th className={`${kolomJudul} text-right`}>RAB</th><th className={`${kolomJudul} text-right`}>Kekurangan</th><th className={kolomJudul}>Keputusan PPK</th>
                    <th className={`${kolomJudul} text-right`}>Diterima</th><th className={`${kolomJudul} text-right`}>Ditunda atau menunggu</th><th className={kolomJudul}>Sumber bagian yang diterima</th>
                  </tr></thead>
                  <tbody>
                    {ppk.rows.map((r) => {
                      const d = draf[r.kro];
                      const cek = d ? periksaKeputusan(d.m, d.jum, r.kurang) : [];
                      return (
                        <BarisKeputusan
                          key={r.kro} r={r} draf={d} tersimpan={tersimpan.get(r.kro)} bolehPutus={bolehPutus} mengirim={mengirim} galat={cek.length ? cek : galatKirim ? [galatKirim] : null}
                          ubah={(x) => { hapusGalat(); setDraf((s) => { const n = { ...s }; if (x) n[r.kro] = x; else delete n[r.kro]; return n; }); }}
                          simpan={() => { if (!jid || !d) return; void kirim("keu_kk_putuskan", argsKeputusan(jid, r.kro, d.m, d.jum, d.cat)).then((ok) => { if (ok) setDraf((s) => { const n = { ...s }; delete n[r.kro]; return n; }); }); }}
                        />
                      );
                    })}
                    <tr className="border-t-2 border-[#DCE3EE] bg-[#EEF3FB] font-bold">
                      <td className={kolomJudul} colSpan={3}>Jumlah</td><td className={`${kolomJudul} text-right font-mono`}>{rupiah(ppk.total.kurang)}</td><td className={kolomJudul} />
                      <td className={`${kolomJudul} text-right font-mono`}>{rupiah(ppk.total.diterima)}</td><td className={`${kolomJudul} text-right font-mono`}>{rupiah(ppk.total.ditunda + ppk.total.menunggu)}</td>
                      <td className={`${kolomJudul} text-[12px] font-semibold`}>DJPb {rupiah(ppk.total.djpb)} · Eselon I {rupiah(ppk.total.eselon)} · DJA {rupiah(ppk.total.dja)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {!bolehPutus && ppk.rows.length > 0 && <p className="text-[12px] text-[#5B6B84]">Hanya PPK yang memutuskan kekurangan per KRO. Keputusan yang sudah disimpan tampil pada kolom Keputusan PPK.</p>}
            <p className="max-w-[100ch] text-[12px] text-[#5B6B84]"><b>Cara kerja sumber:</b> bagian yang diterima lebih dulu ditutup dari sisa KRO lain pada Kegiatan yang sama (Revisi DIPA jalur DJPb, tingkat 3), lalu dari KRO pada Kegiatan lain dalam Program yang sama (persetujuan Eselon I, tingkat 4), dan sisanya menjadi usulan pagu tambahan atau antar-Program ke DJA (tingkat 5, tidak dijamin). Pembagian ini usulan sistem untuk membantu PPK; keputusan akhir tetap pada PPK dan pejabat berwenang. Status keputusan: {Object.values(LABEL_PPK).join(", ")}.</p>
          </section>
        </>
      )}
    </HalamanKeu>
  );
}

export default function HalamanPeta() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
