"use client";

// app/sigap/ro/[kode]/Tab.tsx
//
// (24 Okt 2026) Isi tab halaman RO (hanya baca): Ringkasan, Anggaran, Administrasi. Gaya papan 9 dan 13 mockup: kartu KPI, tabel, filter, daftar item.
// Tiap tab mengambil datanya sendiri dan baru dimuat saat tab dibuka (hooks di app/sigap/ro/useKeu.ts, logika di lib/keu/ro.ts).

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { angka, persen, ringkasRo, rupiah, urlBaca, type RealisasiLepas } from "@/lib/keu/ro";
import { arahGap, susunPohon, teksVolume, type NodeAkun, type SelItem, type Struktur, type Total } from "@/lib/keu/pokTata";
import type { WarnaChip } from "@/lib/keu/revisi";
import { golonganItem, kebutuhan, LABEL_GOLONGAN, ringkasGapRo, semuaItem, WARNA_GOLONGAN } from "@/lib/keu/kebutuhan";
import { KartuGap } from "./KartuGap";
import { RencanaTindakan } from "./RencanaTindakan";
import { Chip, Galat, judulKartu, kartu, kisi, Kosong, Kpi, Memuat, Potong, tombolKecil } from "../../keu-ui";
import { useAnggaranRo, useBacaKeu } from "../useKeu";

// ---------------------------------------------------------------- Ringkasan
type Skor = { total: number | string | null; kategori: string | null; ada_rab_sah: boolean; n_penarikan: number | string | null; n_volume: number | string | null; n_cakupan: number | string | null; n_disiplin: number | string | null; sampai_bulan: number | string };
type KekRo = { n_terbuka: number | string; jumlah_terbuka: number | string };
type AdmRo = { persen_terverifikasi: number | string | null; n_dok: number | string; n_belum: number | string };
const WARNA_KATEGORI_CHIP: Record<string, WarnaChip> = { Baik: "hijau", Cukup: "kuning", "Perlu pembinaan": "merah", Kurang: "merah" };
const tautTab = (kode: string, t: string) => `/sigap/ro/${encodeURIComponent(kode)}?tab=${t}`;

/** (13 Nov 2026, Fase 0) Realisasi yang belum terpetakan ke item POK: ikut total, ditampilkan terpisah (sumber sama dengan daftar RO). */
function KartuRealisasiLepas({ lepas }: { lepas: RealisasiLepas | null }) {
  if (!lepas || lepas.n === 0) return null;
  return (
    <section className={`${kartu} flex flex-col gap-1.5 border-[#F0C36D] bg-[#FFF8E6]`} aria-label="Realisasi belum terpetakan ke item POK">
      <h2 className={`${judulKartu} m-0`}>Realisasi belum terpetakan ke item POK: {rupiah(lepas.jumlah)} ({angka(lepas.n)} baris)</h2>
      <p className="m-0 text-[12.5px] text-[#5B6B84]">Sudah ikut total realisasi RO (sama dengan daftar RO), tetapi belum masuk baris item di bawah karena nomor itemnya belum dikenali pada POK berlaku.</p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]">
        {lepas.baris.map((b, i) => (
          <li key={`${b.nomor_item ?? "x"}-${i}`} className="flex flex-wrap justify-between gap-2 border-t border-[#F3E2B8] pt-1">
            <span className="min-w-0"><span className="font-mono">{b.komponen_kode}/{b.akun_kode}{b.nomor_item ? ` · ${b.nomor_item}` : ""}</span> {b.uraian}</span>
            <b className="whitespace-nowrap">{rupiah(b.real_sd)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
        <Kpi label="Realisasi" nilai={rupiah(r.realisasi + (ang.lepas?.jumlah ?? 0))} sub={`${persen(r.realisasi + (ang.lepas?.jumlah ?? 0), r.pok)} dari pagu${ang.sampaiTanggal ? ` · s.d. ${ang.sampaiTanggal}` : ""}${ang.lepas?.n ? ` · ${rupiah(ang.lepas.jumlah)} belum terpetakan` : ""}`} />
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
// (7 Nov 2026, permintaan Iqbal) Tata letak seperti POK: RO > Komponen > Sub komponen > Akun > Item, ditambah kolom Realisasi, RAB belum dibayar, Kebutuhan, dan Gap.
// Rumus ada di lib/keu/pokTata.ts, lib/keu/kebutuhan.ts, dan lib/keu/pembayaran.ts: RAB = kebutuhan ke depan yang belum dibayar (dikurangi baris yang ditutup catatan pembayaran);
// Kebutuhan = Realisasi + catatan pembayaran belum tercermin + RAB; Gap = Pagu - Kebutuhan.
// (7 Nov 2026, langkah 1 Kebutuhan; dikoreksi dari RAB - Realisasi) Golongan butir (Cukup/Lebih/Kurang/Belum dikaji) dan Kartu Gap: lib/keu/kebutuhan.ts.
type KolomAngka = { pok: ReactNode; real: ReactNode; rab: ReactNode; keb: ReactNode; gap: ReactNode };
const sel = "whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums";
const teksGap = (g: number | null) => {
  const arah = arahGap(g);
  if (arah === "belum") return <span className="text-[#8A97AD]">-</span>;
  const kelas = arah === "kurang" ? "font-bold text-[#B42318]" : arah === "lebih" ? "font-bold text-[#1B7A3E]" : "text-[#44546F]";
  return <span className={kelas}>{g !== null && g > 0 ? "+" : ""}{angka(g)}</span>;
};
const angkaKebutuhan = (realisasi: number, sisa: number | null, dicatat = 0) => { const k = kebutuhan(realisasi, sisa, dicatat); return k === null ? <span className="text-[#8A97AD]">-</span> : angka(k); };
const dariTotal = (t: Total): KolomAngka => ({
  pok: angka(t.pok), real: angka(t.realisasi), rab: t.nBerRab === 0 ? <span className="text-[#8A97AD]">-</span> : angka(t.rab), keb: angkaKebutuhan(t.realisasi, t.sisa, t.dicatat), gap: teksGap(t.gap),
});

function BarisPok({ kelas, kiri, vol, harga, k, kelasTd = "" }: { kelas: string; kiri: ReactNode; vol?: ReactNode; harga?: ReactNode; k: KolomAngka; kelasTd?: string }) {
  return (
    <tr className={`${kelas} align-top`}>
      <td className={`px-2.5 py-1.5 ${kelasTd}`}>{kiri}</td>
      <td className="whitespace-nowrap px-2.5 py-1.5 text-right text-[#44546F]">{vol}</td>
      <td className={`${sel} text-[#44546F]`}>{harga}</td>
      <td className={sel}>{k.pok}</td><td className={sel}>{k.real}</td><td className={sel}>{k.rab}</td><td className={sel}>{k.keb}</td><td className={sel}>{k.gap}</td>
    </tr>
  );
}

function BarisItem({ i }: { i: SelItem }) {
  const rab = i.sisa === null ? <span className="text-[#8A97AD]">-</span> : angka(i.sisa);
  return (
    <BarisPok
      kelas="border-t border-[#EEF2F7]" kelasTd="pl-9 text-[#1B2B4B]"
      kiri={<span className="break-words">- {i.nomor_item ? `${i.nomor_item}. ` : ""}{i.uraian}{i.selesai && <span className="ml-1.5 rounded-full bg-[#EEF2F7] px-1.5 text-[11px] text-[#44546F]">selesai</span>}<span className="ml-1.5 align-middle"><Chip warna={WARNA_GOLONGAN[golonganItem(i)]}>{LABEL_GOLONGAN[golonganItem(i)]}</Chip></span></span>}
      vol={`${teksVolume(i.volume)} ${i.satuan}`} harga={angka(i.harga)}
      k={{ pok: angka(i.pok), real: angka(i.realisasi), rab, keb: angkaKebutuhan(i.realisasi, i.sisa, i.dicatat), gap: teksGap(i.gap) }}
    />
  );
}

function BarisAkun({ a, buka, ubah }: { a: NodeAkun; buka: boolean; ubah: () => void }) {
  const nKurang = a.item.filter((i) => golonganItem(i) === "kurang").length;
  const nLebih = a.item.filter((i) => golonganItem(i) === "lebih").length;
  return (
    <>
      <BarisPok
        kelas="border-t border-[#DCE3EE] bg-[#F4F7FB] font-semibold text-[#0F2A52]" kelasTd="pl-6"
        kiri={(
          <button type="button" aria-expanded={buka} onClick={ubah} className="flex min-h-[32px] w-full items-start gap-1.5 text-left">
            <span aria-hidden className="mt-[1px] w-3 shrink-0 text-[#5B6B84]">{buka ? "▾" : "▸"}</span>
            <span><span className="font-mono">{a.kode}</span> <span className="underline decoration-[#C5D0E0] underline-offset-2">{a.nama || "Akun"}</span><span className="ml-1.5 font-normal text-[#5B6B84]">({a.item.length} item)</span>{nKurang > 0 && <span className="ml-1.5 font-semibold text-[#B42318]">{nKurang} kurang</span>}{nLebih > 0 && <span className="ml-1.5 font-semibold text-[#1B7A3E]">{nLebih} lebih</span>}</span>
          </button>
        )}
        k={dariTotal(a.total)}
      />
      {buka && a.item.map((i) => <BarisItem key={i.detail_id} i={i} />)}
    </>
  );
}

export function TabAnggaran({ kode }: { kode: string }) {
  const ang = useAnggaranRo(kode);
  const struktur = useBacaKeu<Struktur & { akun_kode: string }>(urlBaca("keu_v_pok_struktur", { ro_kode: kode }, { batas: 5000 }));
  const akun = useBacaKeu<{ kode: string; nama: string }>(urlBaca("keu_master_akun", {}, { batas: 3000, kolom: ["kode", "nama"] }));
  const ro = useBacaKeu<{ kode: string; nama: string }>(urlBaca("keu_ro", { kode }, { batas: 1, kolom: ["kode", "nama"] }));
  const [tutup, setTutup] = useState<Set<string>>(new Set());
  const namaAkun = useMemo(() => new Map((akun.baris ?? []).map((a) => [a.kode.slice(0, 6), a.nama] as const)), [akun.baris]);
  // struktur belum tersedia (SQL 20261107a belum dijalankan) = galat baca: tampilan memakai nama komponen baku dan satu sub komponen
  const pohon = useMemo(
    () => (ang.anggaran ? susunPohon(ang.anggaran, struktur.baris, namaAkun, { kode, nama: ro.baris?.[0]?.nama ?? "" }) : null),
    [ang.anggaran, struktur.baris, namaAkun, kode, ro.baris],
  );
  const kunciAkun = (k: string, s: string, a: string) => `${k}|${s}|${a}`;
  const semuaKunci = useMemo(() => (pohon ? pohon.komponen.flatMap((k) => k.sub.flatMap((s) => s.akun.map((a) => kunciAkun(k.kode, s.kode, a.kode)))) : []), [pohon]);

  if (ang.galat) return <Galat pesan={ang.galat} />;
  if (!ang.anggaran || !pohon) return <Memuat />;
  if (ang.anggaran.length === 0) return <Kosong teks="RO ini belum punya item pada POK yang berlaku." />;
  const t = pohon.total;
  const belumRab = t.nItem - t.nBerRab;
  const rg = ringkasGapRo(semuaItem(pohon), 3, ang.itemBaru ?? []);
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`${kartu} flex flex-col gap-1`}>
        <h2 className={judulKartu}>Anggaran: POK, realisasi, kebutuhan, dan gap</h2>
        <p className="text-[12.5px] text-[#5B6B84]">POK berlaku dibaca dari sistem, realisasi dari unggahan bendahara{ang.sampaiTanggal ? ` (sampai ${ang.sampaiTanggal})` : ""}, RAB dari ketua tim.</p>
      </div>
      <div className={kisi}>
        <Kpi label="Pagu POK" nilai={rupiah(t.pok)} sub={`${angka(t.nItem)} butir`} />
        <Kpi label="Realisasi" nilai={rupiah(t.realisasi + (ang.lepas?.jumlah ?? 0))} sub={`${persen(t.realisasi + (ang.lepas?.jumlah ?? 0), t.pok)} dari pagu${ang.lepas?.n ? ` · ${rupiah(ang.lepas.jumlah)} belum terpetakan` : ""}`} />
        <Kpi label="Kebutuhan" nilai={rupiah(rg.kebutuhanDikaji)} sub={`realisasi + catatan belum tercermin + RAB belum dibayar${rg.nBaru > 0 ? " + item baru" : ""}${belumRab > 0 ? ` · ${angka(belumRab)} butir belum ber-RAB tidak ikut` : ""}`} />
        <Kpi
          label="Gap" nilai={rg.bersih === null ? "-" : `${rg.bersih > 0 ? "+" : ""}${rupiah(rg.bersih)}`}
          sub={rg.bersih === null ? "terhitung bila ada butir yang ber-RAB" : `${belumRab > 0 ? `butir yang sudah ber-RAB · ` : ""}${rg.bersih < 0 ? "kebutuhan melebihi pagu" : "pagu mencukupi"}`} warna={rg.bersih === null ? undefined : rg.bersih < 0 ? "mr" : "hj"}
        />
      </div>
      <KartuRealisasiLepas lepas={ang.lepas} />
      <KartuGap r={rg} tunggak={{ n: ang.antrean.length, jumlah: ang.antrean.reduce((s, x) => s + x.tunggak, 0), tersedia: ang.bayarTersedia, kode }} />
      <RencanaTindakan kode={kode} item={semuaItem(pohon)} baru={rg.baru} />
      {ang.terpotong && <Potong />}
      <div className={`${kartu} flex flex-col gap-2 !p-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[12px] text-[#5B6B84]">
            RAB = kebutuhan ke depan yang belum dibayar (setelah dikurangi baris yang sudah ditutup di tab Pembayaran). Kebutuhan = realisasi + catatan pembayaran belum tercermin + RAB. Gap = pagu dikurangi kebutuhan (positif: pagu masih lebih; negatif: kurang). Butir yang belum ber-RAB ditandai “-” dan “Belum dikaji”.
          </p>
          <div className="flex gap-2">
            <button type="button" className={tombolKecil} onClick={() => setTutup(new Set())}>Buka semua akun</button>
            <button type="button" className={tombolKecil} onClick={() => setTutup(new Set(semuaKunci))}>Tutup semua akun</button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-[#DCE3EE] bg-white">
          <table aria-label="POK dengan realisasi, RAB belum dibayar, kebutuhan, dan gap" className="w-full min-w-[980px] border-collapse text-left text-[12.5px]">
            <thead className="bg-[#EEF3FB] text-[11.5px] text-[#44546F]">
              <tr>
                <th className="px-2.5 py-2">Kode / Uraian</th><th className="px-2.5 py-2 text-right">Volume</th><th className="px-2.5 py-2 text-right">Harga satuan</th>
                <th className="px-2.5 py-2 text-right">Pagu POK</th><th className="px-2.5 py-2 text-right">Realisasi</th><th className="px-2.5 py-2 text-right">RAB belum dibayar</th>
                <th className="px-2.5 py-2 text-right">Kebutuhan</th><th className="px-2.5 py-2 text-right">Gap</th>
              </tr>
            </thead>
            <tbody>
              <BarisPok
                kelas="bg-[#E3EEFF] font-bold text-[#0F2A52]"
                kiri={<span><span className="font-mono">{pohon.roKode}</span> {pohon.roNama.toUpperCase()}{belumRab > 0 && <span className="ml-2 rounded-full bg-[#FFF3D6] px-2 text-[11px] font-semibold text-[#8A6200]">{belumRab} butir belum ber-RAB</span>}</span>}
                k={dariTotal(pohon.total)}
              />
              {pohon.komponen.map((k) => (
                <KomponenBaris key={k.kode} k={k} tutup={tutup} setTutup={setTutup} kunciAkun={kunciAkun} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KomponenBaris({ k, tutup, setTutup, kunciAkun }: {
  k: import("@/lib/keu/pokTata").NodeKomponen; tutup: Set<string>; setTutup: (s: Set<string>) => void; kunciAkun: (k: string, s: string, a: string) => string;
}) {
  const ubah = (kunci: string) => { const baru = new Set(tutup); if (baru.has(kunci)) baru.delete(kunci); else baru.add(kunci); setTutup(baru); };
  return (
    <>
      <BarisPok kelas="border-t-2 border-[#C5D0E0] bg-[#EEF3FB] font-bold text-[#0F2A52]" kiri={<span><span className="font-mono">{k.kode}</span> {k.nama.toUpperCase()}</span>} kelasTd="pl-4" k={dariTotal(k.total)} />
      {k.sub.map((s) => (
        <FragmenSub key={s.kode} s={s} k={k} tutup={tutup} ubah={ubah} kunciAkun={kunciAkun} />
      ))}
    </>
  );
}

function FragmenSub({ s, k, tutup, ubah, kunciAkun }: {
  s: import("@/lib/keu/pokTata").NodeSub; k: import("@/lib/keu/pokTata").NodeKomponen; tutup: Set<string>; ubah: (kunci: string) => void;
  kunciAkun: (k: string, s: string, a: string) => string;
}) {
  return (
    <>
      <BarisPok kelas="border-t border-[#E2E8F2] italic text-[#44546F]" kelasTd="pl-5" kiri={<span><span className="font-mono not-italic">{s.kode}</span> {s.nama}</span>} k={dariTotal(s.total)} />
      {s.akun.map((a) => {
        const kunci = kunciAkun(k.kode, s.kode, a.kode);
        return <BarisAkun key={kunci} a={a} buka={!tutup.has(kunci)} ubah={() => ubah(kunci)} />;
      })}
    </>
  );
}
