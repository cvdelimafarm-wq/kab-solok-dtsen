"use client";

// app/sigap/ro/[kode]/RabPerSurvei.tsx
//
// (28 Okt 2026) Tampilan "RAB per survei" pada tab RAB: satu identifikasi survei diubah menjadi rincian RAB. Pengguna mengisi hari dibayar translok/penginapan
// per periode (batas = hari kerja pendataan), memilih pecah per periode atau gabung untuk tiap jenis belanja, menautkan tiap rincian ke item POK (beberapa
// rincian boleh ke satu item; satu item boleh diisi beberapa survei, terlihat pada batang item), atau menambah item baru di RAB bila item POK belum ada
// (bahan revisi POK). Hasilnya ditulis ke RAB yang sama dengan tampilan standar, dengan penanda sumber (ident_id, ident_kunci) supaya dapat dikenali,
// ditandai "diubah dari identifikasi", dan diperbarui bila identifikasi direvisi. Tidak ada yang tertulis sebelum pengguna menekan tombol salin.
// Logika murni: lib/keu/rabPerSurvei.ts, rabSurvei.ts, rab.ts, batangItem.ts.

import { useEffect, useMemo, useState } from "react";
import BatangItem from "@/app/sigap/kelola/perencanaan/identifikasi/BatangItem";
import { bangunLibur, type Libur } from "@/lib/keu/hariKerja";
import { normalisasi } from "@/lib/keu/identifikasi";
import type { IsiKebijakan } from "@/lib/keu/kebijakan";
import { awalLanjutan, jadwalPendataan, normalisasiLanjutan, rincianBiaya, type IsiLanjutan, type StatusLanjutan } from "@/lib/keu/lanjutan";
import { bacaVolume, dataBarisIdent, dataItemRab, jumlahBaris, NAMA_BULAN, periksaBaris, type BarisRabRow, type IsianBaris, type ItemRabRow, type PemetaanItem } from "@/lib/keu/rab";
import {
  bacaTujuan, barisTanpaPasangan, batangPerItem, berbedaDariSaran, bacaHari, dataItemBaru, dataPerbarui, hariDariTeks, KELOMPOK_RINCIAN, keadaanRincian, kolomHari, komponenUntukAkun,
  kunciItemBaru, modeAman, penandaDari, periksaNamaItem, pilihanTujuan, rencanaDari, rincianCampuran, ringkasSurvei, selisihSaran, terpasangPer, TUJUAN_TAMBAH,
  type ItemBaruRow, type KeadaanRincian, type KelompokRincian, type Mendatang, type ModeKelompok, type PilihanTujuan, type RencanaRincian, type Terpasang,
} from "@/lib/keu/rabPerSurvei";
import { periksaHariBayar, type PeriodeJadwal } from "@/lib/keu/rabSurvei";
import { rupiah, urlBaca } from "@/lib/keu/ro";
import { jendelaCair, labelSumber, periksaCair, periksaHarga, teksJendela, type JendelaCair } from "@/lib/keu/usulanRab";
import { Chip, Galat, judulKartu, kartu, kolom, label, Memuat, tombol } from "../../keu-ui";
import { tulisKeuKlien, useBacaKeu, useKirim, type HasilAksi } from "../useKeu";

type BarisAcuan = {
  ident_id: number; tahun: number; ro_kode: string; nama: string; ident_ver: number; form_sah: unknown | null; upd: Record<string, { mulai: string; selesai: string }> | null;
  lanjutan_ada: boolean; lanjutan_ver: number | null; lanjutan_status: StatusLanjutan | null; pasca_h15: boolean; lanjutan_isi: unknown | null; kebijakan_id: number | null; kebijakan_ver: number | null;
};
type LembarBerlaku = { lembar_id: number; tahun: number; ver: number; isi: IsiKebijakan; berlaku_at: string | null };

export type PropsRabSurvei = {
  kode: string; rabId: number; editable: boolean; peta: PemetaanItem[]; itemRab: ItemRabRow[]; barisRab: BarisRabRow[]; muat: () => Promise<void>;
};

/** Perubahan pengguna atas saran identifikasi (hanya bagian yang diubah). */
type Ubah = Partial<{ volume: string; satuan: string; harga: string; bulan_mulai: number; minggu: number; tujuan: string; nama: string; ubahNama: boolean }>;

const simpanKunci = (kode: string, identId: number) => `sigap.rabps.${kode}.${identId}`;
type Simpanan = { hari: Record<string, string>; mode: ModeKelompok };
function bacaSimpanan(kunci: string): Simpanan {
  try {
    const t = typeof window === "undefined" ? null : window.localStorage.getItem(kunci);
    const o = t ? (JSON.parse(t) as { hari?: unknown; mode?: unknown }) : {};
    const hari: Record<string, string> = {};
    if (o.hari && typeof o.hari === "object") for (const [k, v] of Object.entries(o.hari as Record<string, unknown>)) if (typeof v === "string" && bacaHari(v) !== null) hari[k] = v;
    return { hari, mode: modeAman(o.mode) };
  } catch {
    return { hari: {}, mode: modeAman(null) };
  }
}

const NAMA_MODE: Record<string, string> = { periode: "Pecah per periode", gabung: "Gabung semua periode" };
const WARNA_KEADAAN: Record<KeadaanRincian, "hijau" | "biru" | "kuning" | "abu"> = { sudah: "hijau", siap: "biru", isi_hari: "kuning", belum_angka: "abu" };
const TEKS_KEADAAN: Record<KeadaanRincian, string> = { sudah: "Sudah di RAB", siap: "Siap disalin", isi_hari: "Isi hari dibayar", belum_angka: "Volume atau harga belum ada" };

// ------------------------------------------------------------ satu rincian
type PropsBaris = {
  rc: RencanaRincian; terpasang: Terpasang | undefined; ubah: Ubah; setUbah: (u: Ubah) => void; pilihan: PilihanTujuan; isian: IsianBaris; keadaan: KeadaanRincian;
  editable: boolean; peta: PemetaanItem[]; itemBaru: ItemBaruRow[]; jendela: JendelaCair; sibuk: boolean;
  salin: () => void; perbarui: () => void;
};

function BarisSurvei({ rc, terpasang, ubah, setUbah, pilihan, isian, keadaan, editable, peta, itemBaru, jendela, sibuk, salin, perbarui }: PropsBaris) {
  const id = (s: string) => `rps-${rc.r.kunci}-${s}`.replace(/[^\w-]/g, "_");
  const jml = jumlahBaris(isian);
  const tujuan = ubah.tujuan ?? pilihan.awal;
  const t = bacaTujuan(tujuan);
  const diubahSebelum = keadaan !== "sudah" && berbedaDariSaran(rc.saran, isian);
  const sink = terpasang ? selisihSaran(rc.r, terpasang) : null;
  const peringatan = keadaan === "sudah" ? [] : [periksaHarga(isian.harga, rc.batasHarga), periksaCair(rc.lambat, isian.bulan_mulai, isian.minggu, jendela.hari)].filter((x): x is string => x !== null);
  const namaTujuan = (() => {
    if (!terpasang) return "";
    const k = terpasang.itemRab.pok_kunci;
    if (k) return peta.find((p) => p.pok.kunci === k)?.pok.uraian ?? "item POK";
    return itemBaru.find((i) => i.id === terpasang.itemRab.id)?.uraian ?? "item baru di RAB";
  })();
  const saranNama = pilihan.hasil.saranNama;
  const tampilNama = t?.jenis === "tambah";
  const tawarNama = t?.jenis === "pok" && pilihan.hasil.status === "perlu_nama" && saranNama !== null;
  const g = keadaan === "sudah" ? null : periksaBaris(isian);

  return (
    <li className="space-y-2 rounded-lg bg-[#F5F8FE] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 break-words text-[13px] font-bold leading-snug text-[#0F2A52]">{rc.r.uraian}</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip warna="abu">Akun {rc.r.akun}</Chip>
          {rc.r.perk && <Chip warna="kuning">Perkiraan</Chip>}
          <Chip warna={WARNA_KEADAAN[keadaan]}>{TEKS_KEADAAN[keadaan]}</Chip>
          {(terpasang?.diubah || diubahSebelum) && <Chip warna="ungu">Diubah dari identifikasi</Chip>}
        </div>
      </div>
      {rc.r.catatan && <p className="text-[12px] text-[#6B7A93]">{rc.r.catatan}</p>}
      {rc.r.hari !== null && rc.r.kelompok === "Translok dan penginapan" && (
        <p className="text-[12px] text-[#44546F]">{rc.r.hari} {rc.r.uraian.startsWith("Penginapan") ? "malam" : "hari"} dibayar{rc.r.hariMaks ? ` (maksimal ${rc.r.uraian.startsWith("Penginapan") ? Math.max(rc.r.hariMaks - 1, 0) : rc.r.hariMaks} dari hari kerja pendataan)` : ""}.</p>
      )}

      {terpasang ? (
        <div className="space-y-1.5 text-[12.5px] text-[#44546F]">
          <p>
            <span className="font-bold text-[#0F2A52]">{Number(terpasang.baris.volume)} {terpasang.baris.satuan} × {rupiah(terpasang.baris.harga_satuan)} = {rupiah(terpasang.baris.jumlah)}</span>
            {" "}pada item «{namaTujuan}»{terpasang.itemRab.pok_kunci ? "" : " (item baru di RAB)"}.
          </p>
          {terpasang.diubah && (
            <p className="text-[#5B3A8C]">Saran identifikasi saat disalin: {terpasang.baris.ident_vol ?? "-"} × {terpasang.baris.ident_harga !== null && terpasang.baris.ident_harga !== undefined ? rupiah(terpasang.baris.ident_harga) : "-"}.</p>
          )}
          {sink?.berubah && (
            <div role="status" className="space-y-1.5 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
              <p className="font-semibold">Identifikasi berubah sesudah rincian ini disalin.</p>
              <p>Saran sekarang: {sink.volume ? `volume ${rc.saran.volume || "-"}` : ""}{sink.volume && sink.harga ? ", " : ""}{sink.harga ? `harga ${rc.saran.harga ? rupiah(Number(rc.saran.harga)) : "-"}` : ""}.{terpasang.diubah ? " Rincian ini pernah Anda ubah: memperbarui akan menimpa angka yang berubah." : ""}</p>
              {editable && <button type="button" disabled={sibuk} onClick={perbarui} className={`${tombol} bg-[#1F5FD1] text-white`}>{sibuk ? "Memperbarui…" : "Perbarui dari identifikasi"}</button>}
            </div>
          )}
        </div>
      ) : !editable ? (
        <p className="text-[12.5px] text-[#44546F]">Saran: {rc.saran.volume || "-"} {rc.saran.satuan} × {rc.saran.harga ? rupiah(Number(rc.saran.harga)) : "-"}. Hanya ketua tim atau admin RO yang dapat menyalin ke RAB.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label} htmlFor={id("v")}>Volume</label>
              <input id={id("v")} className={kolom} inputMode="decimal" value={isian.volume} onChange={(e) => setUbah({ volume: e.target.value.replace(/[^\d.,]/g, "").slice(0, 15) })} />
            </div>
            <div>
              <label className={label} htmlFor={id("s")}>Satuan</label>
              <input id={id("s")} className={kolom} maxLength={20} value={isian.satuan} onChange={(e) => setUbah({ satuan: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor={id("h")}>Harga satuan</label>
              <input id={id("h")} className={kolom} inputMode="numeric" value={isian.harga} onChange={(e) => setUbah({ harga: e.target.value.replace(/[^\d.]/g, "").slice(0, 18) })} />
            </div>
          </div>
          <p className="text-[12px] text-[#5B6B84]">
            {rc.batasHarga !== null ? `Harga awal = batas tertinggi kebijakan (${rupiah(rc.batasHarga)}); harga lebih rendah boleh.` : "Tarif belum ada pada lembar kebijakan: isi harga satuan sendiri."}
            {" "}Volume dan harga boleh diubah; rincian yang berbeda dari saran ditandai «diubah dari identifikasi».
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor={id("b")}>Bulan cair</label>
              <select id={id("b")} className={kolom} value={isian.bulan_mulai} onChange={(e) => setUbah({ bulan_mulai: Number(e.target.value) })}>
                {NAMA_BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor={id("m")}>Minggu cair</label>
              <select id={id("m")} className={kolom} value={isian.minggu} onChange={(e) => setUbah({ minggu: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((m) => <option key={m} value={m}>Minggu {m}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[12px] text-[#5B6B84]">
            {rc.selesai ? `Kegiatan berakhir ${rc.selesai}; pencairan ${teksJendela(jendela)}${rc.lambat ? `: ${rc.lambat}` : ""}.` : "Tanggal kegiatan belum lengkap pada identifikasi: bulan dan minggu cair perlu dipilih sendiri."}
          </p>
          <div>
            <label className={label} htmlFor={id("i")}>Item tujuan (sangat disarankan ditautkan ke item POK)</label>
            <select id={id("i")} className={kolom} value={tujuan} onChange={(e) => setUbah({ tujuan: e.target.value })}>
              <option value="">Pilih item…</option>
              {pilihan.opsi.map((o) => <option key={o.nilai} value={o.nilai}>{o.label}</option>)}
            </select>
            <p className="mt-1 text-[12px] text-[#5B6B84]">{pilihan.hasil.pesan}</p>
          </div>
          {tampilNama && (
            <div>
              <label className={label} htmlFor={id("n")}>Nama item baru di RAB</label>
              <input id={id("n")} className={kolom} maxLength={200} value={ubah.nama ?? saranNama ?? ""} onChange={(e) => setUbah({ nama: e.target.value })} />
              <p className="mt-1 text-[12px] text-[#5B6B84]">Item ini ikut RAB sebagai bahan revisi POK. Rincian lain dengan akun dan nama yang sama berbagi satu item.</p>
            </div>
          )}
          {tawarNama && (
            <label className="flex items-start gap-2 text-[12.5px] text-[#44546F]">
              <input type="checkbox" className="mt-1" checked={ubah.ubahNama ?? false} onChange={(e) => setUbah({ ubahNama: e.target.checked })} />
              <span>Saran perbaiki penamaan: ubah nama item pada RAB menjadi «{saranNama}» (usulan semula-menjadi untuk revisi POK; item POK tidak berubah).</span>
            </label>
          )}
          <p className="text-[13px] font-bold text-[#0F2A52]">Jumlah rincian: {jml === null ? "-" : rupiah(jml)}</p>
          {peringatan.length > 0 && (
            <ul className="space-y-1 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
              {peringatan.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          {g && g.length > 0 && keadaan !== "isi_hari" && <p className="text-[12px] text-[#6B7A93]">Belum bisa disalin: {g.join(" ")}</p>}
          <button type="button" disabled={sibuk || keadaan === "isi_hari"} onClick={salin} className={`${tombol} bg-[#1F5FD1] text-white`}>{sibuk ? "Menyalin…" : "Salin ke RAB"}</button>
        </>
      )}
    </li>
  );
}

// ------------------------------------------------------------ satu identifikasi
type BahanIdent = { f: ReturnType<typeof normalisasi>; isi: IsiLanjutan; periode: PeriodeJadwal[] };

function bahanDari(b: BarisAcuan): BahanIdent | null {
  if (b.form_sah === null) return null;
  try {
    const f = normalisasi(b.form_sah);
    const isi = b.lanjutan_ada && b.lanjutan_isi ? normalisasiLanjutan(b.lanjutan_isi) : awalLanjutan(f, b.tahun);
    const periode = jadwalPendataan(f, b.tahun, b.upd);
    return { f, isi, periode };
  } catch {
    return null;
  }
}

function IsiSurvei({ b, bahan, lembar, libur, props, itemBaru, muatItemBaru, namaIdent }: {
  b: BarisAcuan; bahan: BahanIdent; lembar: IsiKebijakan | null; libur: Libur; props: PropsRabSurvei; itemBaru: ItemBaruRow[]; muatItemBaru: () => Promise<void>; namaIdent: ReadonlyMap<number, string>;
}) {
  const kunciSimpan = simpanKunci(props.kode, b.ident_id);
  const [awal] = useState(() => bacaSimpanan(kunciSimpan));
  const [hariTeks, setHariTeks] = useState<Record<string, string>>(awal.hari);
  const [mode, setMode] = useState<ModeKelompok>(awal.mode);
  const [ubahPer, setUbahPer] = useState<Record<string, Ubah>>({});
  const [pesan, setPesan] = useState<string[]>([]);
  const muatSemua = async () => { await props.muat(); await muatItemBaru(); };
  const { jalankan, mengirim, galat } = useKirim(muatSemua);

  useEffect(() => {
    try { window.localStorage.setItem(kunciSimpan, JSON.stringify({ hari: hariTeks, mode })); } catch { /* simpanan peramban tidak wajib */ }
  }, [kunciSimpan, hariTeks, mode]);

  const jendela = useMemo(() => jendelaCair(lembar), [lembar]);
  const sumber = labelSumber({ lanjutanAda: b.lanjutan_ada, lanjutanVer: b.lanjutan_ver, lanjutanStatus: b.lanjutan_status });
  const periodeSah = useMemo(() => bahan.periode.filter((p) => p.mulai && p.selesai), [bahan.periode]);
  const rincian = useMemo(() => rincianBiaya(bahan.isi, bahan.f, lembar), [bahan, lembar]);
  const kolHari = useMemo(() => kolomHari(rincian, periodeSah, libur), [rincian, periodeSah, libur]);
  const hariBayar = useMemo(() => hariDariTeks(hariTeks), [hariTeks]);
  const rs = useMemo(() => rincianCampuran(rincian, periodeSah, mode, hariBayar, libur), [rincian, periodeSah, mode, hariBayar, libur]);
  const rencana = useMemo(() => rencanaDari(rs, bahan.isi, periodeSah, new Date().getMonth() + 1, jendela.hari, libur, sumber.pendek), [rs, bahan.isi, periodeSah, jendela.hari, libur, sumber.pendek]);
  const terpasang = useMemo(() => terpasangPer(b.ident_id, props.barisRab, props.itemRab), [b.ident_id, props.barisRab, props.itemRab]);
  const yatim = useMemo(() => barisTanpaPasangan(b.ident_id, rs, props.barisRab), [b.ident_id, rs, props.barisRab]);
  const pilihan = useMemo(() => rencana.map((rc) => pilihanTujuan(rc.r, props.peta, itemBaru, b.nama)), [rencana, props.peta, itemBaru, b.nama]);

  const isianDari = (rc: RencanaRincian, u: Ubah): IsianBaris => ({
    ...rc.saran,
    ...(u.volume !== undefined ? { volume: u.volume } : {}), ...(u.satuan !== undefined ? { satuan: u.satuan } : {}), ...(u.harga !== undefined ? { harga: u.harga } : {}),
    ...(u.bulan_mulai !== undefined ? { bulan_mulai: u.bulan_mulai, bulan_sampai: u.bulan_mulai } : {}), ...(u.minggu !== undefined ? { minggu: u.minggu } : {}),
  });
  const baris = rencana.map((rc, i) => {
    const u = ubahPer[rc.r.kunci] ?? {};
    const isian = isianDari(rc, u);
    const ada = terpasang.get(rc.r.kunci);
    const keadaan = keadaanRincian(rc, ada !== undefined, isian);
    return { rc, u, isian, ada, keadaan, pil: pilihan[i], tujuan: u.tujuan ?? pilihan[i].awal };
  });
  const ringkas = ringkasSurvei(baris.map((x) => ({ k: x.keadaan, jumlah: x.ada ? Number(x.ada.baris.jumlah) : jumlahBaris(x.isian) })));

  const mendatang: Mendatang[] = baris
    .filter((x) => x.keadaan === "siap" || x.keadaan === "belum_angka")
    .flatMap((x) => {
      const v = bacaVolume(x.isian.volume);
      return x.tujuan !== "" && x.tujuan !== TUJUAN_TAMBAH && v !== null ? [{ tujuan: x.tujuan, identId: b.ident_id, jumlah: jumlahBaris(x.isian), volume: v }] : [];
    });
  const batang = useMemo(() => batangPerItem(props.peta, itemBaru, props.barisRab, namaIdent, mendatang), [props.peta, itemBaru, props.barisRab, namaIdent, mendatang]);
  const akanDibuat = baris.filter((x) => x.keadaan !== "sudah" && x.tujuan === TUJUAN_TAMBAH);

  const ubahBaris = (kunci: string, u: Ubah) => setUbahPer((a) => ({ ...a, [kunci]: { ...a[kunci], ...u } }));

  // ---- tulis
  type Rencana = typeof baris[number];
  const terapkan = async (daftar: Rencana[]) => {
    const g: string[] = [];
    for (const x of daftar) {
      const awalan = `${x.rc.r.uraian}: `;
      for (const m of periksaBaris(x.isian)) g.push(awalan + m);
      const t = bacaTujuan(x.tujuan);
      if (!t) g.push(`${awalan}pilih item tujuan.`);
      else if (t.jenis === "tambah") {
        const m = periksaNamaItem(x.u.nama ?? x.pil.hasil.saranNama ?? "");
        if (m) g.push(awalan + m);
        if (komponenUntukAkun(x.rc.r.akun, props.peta) === null) g.push(`${awalan}tidak ada item POK pada RO ini sebagai acuan komponen untuk item baru.`);
      }
    }
    setPesan(g);
    if (g.length || daftar.length === 0) return;
    const ok = await jalankan(async (): Promise<HasilAksi<unknown>> => {
      const idPok = new Map<number, number>(); // detail_id -> id item RAB
      const idBaru = new Map<string, number>(itemBaru.map((i) => [kunciItemBaru(i.akun_kode, i.uraian), i.id]));
      const urut = new Map<number, number>();
      const urutBerikut = (itemId: number): number => {
        const n = urut.get(itemId) ?? props.barisRab.filter((r) => r.item_id === itemId).length;
        urut.set(itemId, n + 1);
        return n + 1;
      };
      const sudahNama = new Set<number>();
      for (const x of daftar) {
        const t = bacaTujuan(x.tujuan);
        if (!t) continue;
        let itemId: number;
        if (t.jenis === "pok") {
          const p = props.peta.find((q) => q.pok.detail_id === t.id);
          if (!p) return { ok: false, pesan: "Item POK tujuan tidak ditemukan; muat ulang halaman." };
          let rid = idPok.get(t.id) ?? p.rab?.id;
          if (rid === undefined) {
            const r = await tulisKeuKlien<{ id: number }>("keu_rab_item", "insert", dataItemRab(props.rabId, p.pok, null));
            if (!r.ok) return r;
            rid = r.data.id;
          }
          idPok.set(t.id, rid);
          itemId = rid;
          const saranNama = x.pil.hasil.saranNama;
          if (x.u.ubahNama && saranNama && x.pil.hasil.status === "perlu_nama" && !sudahNama.has(rid)) {
            const r = await tulisKeuKlien("keu_rab_item", "update", { uraian: saranNama.slice(0, 200) }, { id: rid });
            if (!r.ok) return r;
            sudahNama.add(rid);
          }
        } else if (t.jenis === "baru") {
          itemId = t.id;
        } else {
          const nama = (x.u.nama ?? x.pil.hasil.saranNama ?? "").trim();
          const kunci = kunciItemBaru(x.rc.r.akun, nama);
          let rid = idBaru.get(kunci);
          if (rid === undefined) {
            const komponen = komponenUntukAkun(x.rc.r.akun, props.peta);
            if (komponen === null) return { ok: false, pesan: "Tidak ada komponen acuan untuk item baru." };
            const r = await tulisKeuKlien<{ id: number }>("keu_rab_item", "insert", dataItemBaru(props.rabId, { akun: x.rc.r.akun, nama, satuan: x.isian.satuan, komponen }));
            if (!r.ok) return r;
            rid = r.data.id;
            idBaru.set(kunci, rid);
          }
          itemId = rid;
        }
        const penanda = penandaDari(b.ident_id, b.ident_ver, x.rc.r, x.rc.saran);
        const r = await tulisKeuKlien("keu_rab_baris", "insert", { ...dataBarisIdent(x.isian, penanda), item_id: itemId, urut: urutBerikut(itemId) });
        if (!r.ok) return r;
      }
      return { ok: true, data: null };
    });
    if (ok) setPesan([]);
  };

  const perbaruiBaris = async (x: Rencana) => {
    if (!x.ada) return;
    const data = dataPerbarui(x.rc.saran, b.ident_ver, selisihSaran(x.rc.r, x.ada));
    if (!data) { setPesan(["Saran identifikasi belum punya angka untuk memperbarui rincian ini."]); return; }
    setPesan([]);
    await jalankan(() => tulisKeuKlien("keu_rab_baris", "update", data, { id: x.ada!.baris.baris_id }));
  };

  const siapSemua = baris.filter((x) => x.keadaan === "siap");
  const kelompokAda = KELOMPOK_RINCIAN.filter((k) => rincian.some((r) => r.kelompok === k));

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-[#44546F]">
        Sumber: <span className="font-semibold text-[#0F2A52]">{sumber.panjang}</span>{lembar ? "; tarif dan jendela dari lembar kebijakan yang berlaku" : "; belum ada lembar kebijakan yang berlaku"}.
        {b.lanjutan_status === "draf" && " Masih Draf: angka dapat berubah."}
      </p>
      <p className="rounded-lg bg-[#EAF1FC] px-3 py-2 text-[12.5px] leading-relaxed text-[#1B2B4B]">
        Rincian di sini langsung masuk RAB standar (tab sebelah). Tarif kebijakan adalah batas tertinggi: harga lebih rendah boleh. Tidak ada yang tertulis sebelum Anda menekan Salin ke RAB.
      </p>
      {rs.length === 0 && <p className="text-[13px] text-[#6B7A93]">Identifikasi ini belum menghasilkan kebutuhan biaya.</p>}

      {kolHari.length > 0 && (
        <section className="space-y-2 rounded-lg border border-[#DCE3EE] p-3">
          <p className={label}>Hari dibayar translok dan penginapan (isian manual per periode)</p>
          <p className="text-[12px] text-[#5B6B84]">Petugas boleh mendata lebih lama dari hari yang dibayar. Isian tidak boleh melebihi hari kerja pendataan (Senin–Jumat tanpa hari libur); penginapan maksimal hari kerja dikurangi satu (cek aturan).</p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
            {kolHari.map((k) => {
              const n = bacaHari(hariTeks[k.kunci] ?? "");
              const salah = n === null ? null : periksaHariBayar(n, k.maks, k.penginapan);
              return (
                <div key={k.kunci}>
                  <label className={label} htmlFor={`rps-h-${k.kunci}`.replace(/[^\w-]/g, "_")}>{k.uraian} · {k.periode} ({k.penginapan ? "malam" : "hari"} dibayar, maks {k.batas})</label>
                  <input
                    id={`rps-h-${k.kunci}`.replace(/[^\w-]/g, "_")} className={kolom} inputMode="numeric" value={hariTeks[k.kunci] ?? ""}
                    onChange={(e) => setHariTeks((a) => ({ ...a, [k.kunci]: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                  />
                  <p className={`mt-1 text-[12px] ${salah ? "font-semibold text-[#9B1C23]" : "text-[#6B7A93]"}`}>
                    {salah ?? `${k.orang ?? "?"} orang · ${k.mulai} s.d. ${k.selesai} · ${k.maks} hari kerja`}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {periodeSah.length > 1 && kelompokAda.length > 0 && (
        <section className="space-y-2 rounded-lg border border-[#DCE3EE] p-3">
          <p className={label}>Pecah atau gabung per jenis belanja</p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr))]">
            {kelompokAda.map((k) => (
              <div key={k}>
                <label className={label} htmlFor={`rps-m-${k}`.replace(/\W/g, "_")}>{k}</label>
                <select id={`rps-m-${k}`.replace(/\W/g, "_")} className={kolom} value={mode[k]} onChange={(e) => setMode((a) => ({ ...a, [k as KelompokRincian]: e.target.value === "gabung" ? "gabung" : "periode" }))}>
                  {Object.entries(NAMA_MODE).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-[#5B6B84]">Mengubah pilihan ini mengganti rincian yang ditawarkan; baris RAB yang sudah disalin tidak diubah atau dihapus.</p>
        </section>
      )}

      {KELOMPOK_RINCIAN.map((k) => {
        const isi = baris.filter((x) => x.rc.r.kelompok === k);
        if (isi.length === 0) return null;
        return (
          <section key={k} className="space-y-2">
            <p className={label}>{k}</p>
            <ul className="space-y-2.5">
              {isi.map((x) => (
                <BarisSurvei
                  key={x.rc.r.kunci} rc={x.rc} terpasang={x.ada} ubah={x.u} setUbah={(u) => ubahBaris(x.rc.r.kunci, u)} pilihan={x.pil} isian={x.isian} keadaan={x.keadaan}
                  editable={props.editable} peta={props.peta} itemBaru={itemBaru} jendela={jendela} sibuk={mengirim}
                  salin={() => void terapkan([x])} perbarui={() => void perbaruiBaris(x)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {props.editable && siapSemua.length > 0 && (
        <button type="button" disabled={mengirim} onClick={() => void terapkan(siapSemua)} className={`${tombol} bg-[#0F2A52] text-white`}>
          {mengirim ? "Menyalin…" : `Salin semua yang siap (${siapSemua.length}, ${rupiah(ringkas.totalSiap)})`}
        </button>
      )}
      {(pesan.length > 0 || galat) && <Galat pesan={[...pesan, ...(galat ? [galat] : [])]} />}
      <p className="text-[12px] text-[#6B7A93]">
        {ringkas.jumlah} rincian: {ringkas.sudah} sudah di RAB ({rupiah(ringkas.totalSudah)}), {ringkas.siap} siap disalin ({rupiah(ringkas.totalSiap)}), {ringkas.isiHari} menunggu hari dibayar, {ringkas.belumAngka} menunggu volume atau harga.
      </p>

      {akanDibuat.length > 0 && (
        <section className="space-y-1.5 rounded-lg bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
          <p className="font-semibold">Item baru yang akan dibuat di RAB (bahan revisi POK):</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {[...new Set(akanDibuat.map((x) => `${x.rc.r.akun.slice(0, 6)} · ${(x.u.nama ?? x.pil.hasil.saranNama ?? "").trim()}`))].map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>
      )}

      {batang.length > 0 && (
        <section className="space-y-2">
          <p className={label}>Batang item: satu item diisi beberapa survei (dasar rupiah)</p>
          <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(380px,100%),1fr))]">
            {batang.map((x) => x.kap ? (
              <BatangItem key={x.kunci} judul={x.judul} akun={x.akun} satuan={x.satuan} kap={x.kap} sumbangan={x.sumbangan} dasar="rupiah" />
            ) : (
              <div key={x.kunci} className="space-y-1 rounded-xl border border-[#DCE3EE] bg-white p-3.5 text-[12.5px] text-[#44546F]">
                <p className="text-[14px] font-bold text-[#0F2A52]">{x.judul}</p>
                <p>Item baru di RAB (akun {x.akun}): belum ada pagu POK, jadi tidak ada batas yang dibandingkan.</p>
                <p>{x.sumbangan.map((s) => `${s.nama}: ${s.jumlah === null ? "harga belum ada" : rupiah(s.jumlah)}`).join("; ")}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {yatim.length > 0 && (
        <section role="status" className="space-y-1 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
          <p className="font-semibold">{yatim.length} baris RAB berasal dari identifikasi ini tetapi tidak cocok lagi dengan rincian yang ditawarkan sekarang.</p>
          <p>Penyebabnya identifikasi diubah atau pilihan pecah/gabung berbeda dari saat disalin. Baris tidak dihapus otomatis; ubah atau hapus lewat tampilan RAB standar bila perlu.</p>
          <ul className="list-disc pl-5">{yatim.map((y) => <li key={y.baris_id} className="break-words">{y.ket || y.ident_kunci}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------ pembungkus: pilih identifikasi dan baca bahan
export function RabPerSurvei(props: PropsRabSurvei) {
  const acuan = useBacaKeu<BarisAcuan>(urlBaca("keu_v_ident_acuan", { ro_kode: props.kode }, { urut: "-tahun", batas: 20 }));
  const [pilih, setPilih] = useState<number | null>(null);
  const daftarIdent = useMemo(() => (acuan.baris ?? []).filter((x) => x.form_sah !== null), [acuan.baris]);
  const b = daftarIdent.find((x) => x.ident_id === pilih) ?? daftarIdent[0] ?? null;
  const lembar = useBacaKeu<LembarBerlaku>(b ? urlBaca("keu_v_kebijakan_berlaku", { tahun: b.tahun }, { batas: 1 }) : null);
  const hariLibur = useBacaKeu<{ tanggal: string; aktif: boolean }>(b ? urlBaca("keu_v_libur", {}, { urut: "tanggal", batas: 2000 }) : null);
  const itemBaru = useBacaKeu<ItemBaruRow>(urlBaca("keu_rab_item", { rab_id: props.rabId, pok_kunci: null }, { batas: 500, kolom: ["id", "akun_kode", "uraian", "satuan", "komponen_kode", "selesai"] }));
  const siap = b !== null && (lembar.baris !== null || lembar.galat !== null) && (hariLibur.baris !== null || hariLibur.galat !== null) && itemBaru.baris !== null;
  const bahan = useMemo(() => (b ? bahanDari(b) : null), [b]);
  const libur = useMemo(() => bangunLibur(hariLibur.baris), [hariLibur.baris]);
  const namaIdent = useMemo(() => new Map(daftarIdent.map((x) => [x.ident_id, x.nama] as const)), [daftarIdent]);

  if (acuan.galat) return <Galat pesan={acuan.galat} />;
  if (acuan.baris === null) return <Memuat tinggi="h-24" />;
  if (b === null) return <p className={`${kartu} text-[13px] text-[#5B6B84]`}>RO ini belum punya identifikasi survei yang disahkan, jadi belum ada rincian untuk RAB per survei.</p>;

  return (
    <section className={`${kartu} space-y-3`}>
      <h2 className={judulKartu}>RAB per survei</h2>
      {daftarIdent.length > 1 && (
        <div>
          <label className={label} htmlFor="rps-ident">Identifikasi survei</label>
          <select id="rps-ident" className={kolom} value={b.ident_id} onChange={(e) => setPilih(Number(e.target.value))}>
            {daftarIdent.map((x) => <option key={x.ident_id} value={x.ident_id}>{x.nama} ({x.tahun})</option>)}
          </select>
        </div>
      )}
      {daftarIdent.length === 1 && <p className="text-[13px] font-semibold text-[#0F2A52]">{b.nama} ({b.tahun})</p>}
      {itemBaru.galat && <Galat pesan={itemBaru.galat} />}
      {!siap || !bahan ? (
        bahan === null && siap ? <Galat pesan="Isi identifikasi tidak dapat dibaca untuk RAB per survei." /> : <Memuat tinggi="h-24" />
      ) : (
        <IsiSurvei
          key={b.ident_id} b={b} bahan={bahan} lembar={lembar.baris?.[0]?.isi ?? null} libur={libur} props={props}
          itemBaru={itemBaru.baris ?? []} muatItemBaru={itemBaru.muat} namaIdent={namaIdent}
        />
      )}
    </section>
  );
}
