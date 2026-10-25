"use client";

// app/sigap/ro/[kode]/UsulanIdentifikasi.tsx
//
// (26 Okt 2026, tahap 33) Kartu "Usulan dari identifikasi" pada tab RAB: kebutuhan biaya dari identifikasi survei (lanjutan bila ada, kalau tidak identifikasi
// awal yang sah) ditawarkan sebagai usulan baris RAB. Tidak ada yang tertulis kecuali pengguna menekan "Salin ke RAB" pada satu usulan; baris RAB yang sudah
// ada tidak ditimpa. Tarif lembar kebijakan = batas tertinggi (harga lebih rendah boleh); jadwal cair disarankan dari tanggal selesai kegiatan (paling lambat H+N; N dari parameter hari_cair_maks pada lembar kebijakan, bawaan 5).
// Kartu kedua "Rencana realisasi dari identifikasi" (hanya baca): perkiraan pencairan menurut bulan dan minggu saran, dan penjagaan sederhana: anggaran akun
// yang dibutuhkan ADA atau BELUM ADA pada POK RO (berapa pun nilainya; nominal tidak dibandingkan dengan pagu).
// Logika murni: lib/keu/usulanRab.ts. Data dibaca lewat pintu baca hilir keu_v_ident_acuan (tahap 30); menulis memakai tabel RAB yang sama dengan tab ini.

import { useMemo, useState } from "react";
import { normalisasi } from "@/lib/keu/identifikasi";
import type { IsiKebijakan } from "@/lib/keu/kebijakan";
import { awalLanjutan, jadwalPendataan, normalisasiLanjutan, rincianBiaya, type StatusLanjutan } from "@/lib/keu/lanjutan";
import { dataBaris, dataItemRab, jumlahBaris, NAMA_BULAN, periksaBaris, type IsianBaris, type PemetaanItem } from "@/lib/keu/rab";
import { rupiah, urlBaca } from "@/lib/keu/ro";
import {
  isianDari, jagaAnggaran, jendelaCair, kandidatItem, labelSumber, namaItem, periksaCair, periksaHarga, rencanaBulanan, ringkasUsulan, sudahDisalin, teksJendela, usulanDari,
  type JendelaCair, type UsulanBaris,
} from "@/lib/keu/usulanRab";
import { Chip, Galat, judulKartu, kartu, kolom, label, Memuat, tombol } from "../../keu-ui";
import { tulisKeuKlien, useBacaKeu, useKirim } from "../useKeu";

type BarisAcuan = {
  ident_id: number; tahun: number; ro_kode: string; nama: string; ident_ver: number; form_sah: unknown | null; upd: Record<string, { mulai: string; selesai: string }> | null;
  lanjutan_ada: boolean; lanjutan_ver: number | null; lanjutan_status: StatusLanjutan | null; pasca_h15: boolean; lanjutan_isi: unknown | null; kebijakan_id: number | null; kebijakan_ver: number | null;
};
type LembarBerlaku = { lembar_id: number; tahun: number; ver: number; isi: IsiKebijakan; berlaku_at: string | null };

export type PropsUsulan = { kode: string; rabId: number; peta: PemetaanItem[]; muat: () => Promise<void> };

// ------------------------------------------------------------ satu usulan
function BarisUsulan({ u, sumber, props, tersedia, jendela }: { u: UsulanBaris; sumber: string; props: PropsUsulan; tersedia: PemetaanItem[]; jendela: JendelaCair }) {
  const [v, setV] = useState<IsianBaris>(() => isianDari(u, sumber));
  const [itemId, setItemId] = useState<string>(tersedia.length === 1 ? String(tersedia[0].pok.detail_id) : "");
  const [pesan, setPesan] = useState<string[]>([]);
  const { jalankan, mengirim, galat } = useKirim(props.muat);
  const ubah = (x: Partial<IsianBaris>) => setV((a) => ({ ...a, ...x }));
  const jml = jumlahBaris(v);
  const peringatan = [periksaHarga(v.harga, u.batasHarga), periksaCair(u.lambat, v.bulan_mulai, v.minggu, u.hariCair)].filter((x): x is string => x !== null);
  const pilihan = tersedia.find((p) => String(p.pok.detail_id) === itemId) ?? null;
  const id = (s: string) => `us-${u.kunci}-${s}`.replace(/[^\w-]/g, "_");

  const salin = async () => {
    const g = periksaBaris(v);
    if (!pilihan) g.unshift("Pilih item POK tujuan.");
    setPesan(g);
    if (g.length || !pilihan) return;
    const ok = await jalankan(async () => {
      let rid = pilihan.rab?.id;
      if (rid === undefined) {
        const r = await tulisKeuKlien<{ id: number }>("keu_rab_item", "insert", dataItemRab(props.rabId, pilihan.pok, null));
        if (!r.ok) return r;
        rid = r.data.id;
      }
      return tulisKeuKlien("keu_rab_baris", "insert", { ...dataBaris(v), item_id: rid, urut: pilihan.baris.length + 1 });
    });
    if (ok) setPesan([]);
  };

  return (
    <li className="space-y-2 rounded-lg bg-[#F5F8FE] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 break-words text-[13px] font-bold leading-snug text-[#0F2A52]">{u.uraian}</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip warna="abu">Akun {u.akun}</Chip>
          {u.perk && <Chip warna="kuning">Perkiraan</Chip>}
        </div>
      </div>
      {u.catatan && <p className="text-[12px] text-[#6B7A93]">{u.catatan}</p>}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={label} htmlFor={id("v")}>Volume</label>
          <input id={id("v")} className={kolom} inputMode="decimal" value={v.volume} onChange={(e) => ubah({ volume: e.target.value.replace(/[^\d.,]/g, "").slice(0, 15) })} />
        </div>
        <div>
          <label className={label} htmlFor={id("s")}>Satuan</label>
          <input id={id("s")} className={kolom} maxLength={20} value={v.satuan} onChange={(e) => ubah({ satuan: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor={id("h")}>Harga satuan</label>
          <input id={id("h")} className={kolom} inputMode="numeric" value={v.harga} onChange={(e) => ubah({ harga: e.target.value.replace(/[^\d.]/g, "").slice(0, 18) })} />
        </div>
      </div>
      <p className="text-[12px] text-[#5B6B84]">
        {u.batasHarga !== null
          ? `Harga awal = batas tertinggi kebijakan (${rupiah(u.batasHarga)}). Isi lebih rendah bila tarif survei ini lebih kecil.`
          : "Tarif belum ada pada lembar kebijakan: isi harga satuan sendiri."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor={id("b")}>Bulan cair</label>
          <select id={id("b")} className={kolom} value={v.bulan_mulai} onChange={(e) => ubah({ bulan_mulai: Number(e.target.value), bulan_sampai: Number(e.target.value) })}>
            {NAMA_BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={id("m")}>Minggu cair</label>
          <select id={id("m")} className={kolom} value={v.minggu} onChange={(e) => ubah({ minggu: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((m) => <option key={m} value={m}>Minggu {m}</option>)}
          </select>
        </div>
      </div>
      <p className="text-[12px] text-[#5B6B84]">
        {u.selesai ? `Kegiatan berakhir ${u.selesai}; pencairan ${teksJendela(jendela)}${u.lambat ? `: ${u.lambat}` : ""}.` : "Tanggal kegiatan belum lengkap pada identifikasi: bulan dan minggu cair perlu dipilih sendiri."}
      </p>
      <div>
        <label className={label} htmlFor={id("i")}>Item POK tujuan</label>
        <select id={id("i")} className={kolom} value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {tersedia.length !== 1 && <option value="">Pilih item…</option>}
          {tersedia.map((p) => <option key={p.pok.detail_id} value={p.pok.detail_id}>{namaItem(p.pok)} (akun {p.pok.akun}, pagu {rupiah(p.pok.pok)})</option>)}
        </select>
      </div>
      <p className="text-[13px] font-bold text-[#0F2A52]">Jumlah rincian: {jml === null ? "-" : rupiah(jml)}</p>
      {peringatan.length > 0 && (
        <ul className="space-y-1 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
          {peringatan.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      {(pesan.length > 0 || galat) && <Galat pesan={[...pesan, ...(galat ? [galat] : [])]} />}
      <button type="button" disabled={mengirim} onClick={() => void salin()} className={`${tombol} bg-[#1F5FD1] text-white`}>{mengirim ? "Menyalin…" : "Salin ke RAB"}</button>
    </li>
  );
}

// ------------------------------------------------------------ bahan usulan untuk satu identifikasi
type Bahan = { daftar: UsulanBaris[]; galat: string | null; jendela: JendelaCair };

function hitungBahan(b: BarisAcuan, lembar: IsiKebijakan | null): Bahan {
  const jendela = jendelaCair(lembar);
  if (b.form_sah === null) return { daftar: [], galat: null, jendela };
  try {
    const f = normalisasi(b.form_sah);
    const isi = b.lanjutan_ada && b.lanjutan_isi ? normalisasiLanjutan(b.lanjutan_isi) : awalLanjutan(f, b.tahun);
    const pendataan = jadwalPendataan(f, b.tahun, b.upd).filter((j) => j.mulai && j.selesai);
    return { daftar: usulanDari(rincianBiaya(isi, f, lembar), isi, pendataan, new Date().getMonth() + 1, jendela.hari), galat: null, jendela };
  } catch {
    return { daftar: [], galat: "Isi identifikasi tidak dapat dibaca untuk usulan RAB.", jendela };
  }
}

const sumberDari = (b: BarisAcuan) => labelSumber({ lanjutanAda: b.lanjutan_ada, lanjutanVer: b.lanjutan_ver, lanjutanStatus: b.lanjutan_status });

/** `lembarVer` = versi lembar kebijakan yang BERLAKU sekarang (dipakai menghitung tarif dan jendela); bukan versi yang dipakai saat lanjutan disusun. */
function KeteranganSumber({ b, lembarVer }: { b: BarisAcuan; lembarVer: number | null }) {
  return (
    <p className="text-[12.5px] text-[#44546F]">
      Sumber: <span className="font-semibold text-[#0F2A52]">{sumberDari(b).panjang}</span>{lembarVer ? `; tarif dan jendela dari lembar kebijakan versi ${lembarVer}` : "; belum ada lembar kebijakan yang berlaku"}.
      {b.lanjutan_status === "draf" && " Masih Draf: angka dapat berubah."}
    </p>
  );
}

// ------------------------------------------------------------ kartu usulan
function IsiUsulan({ b, daftar, props, jendela, lembarVer }: { b: BarisAcuan; daftar: UsulanBaris[]; props: PropsUsulan; jendela: JendelaCair; lembarVer: number | null }) {
  const sumber = sumberDari(b);
  const r = ringkasUsulan(daftar, props.peta);
  return (
    <div className="space-y-3">
      <KeteranganSumber b={b} lembarVer={lembarVer} />
      <p className="rounded-lg bg-[#EAF1FC] px-3 py-2 text-[12.5px] leading-relaxed text-[#1B2B4B]">
        Usulan hanya saran. Tarif kebijakan adalah batas tertinggi: harga yang lebih rendah boleh, yang lebih tinggi diberi peringatan. Baris RAB yang sudah ada tidak diubah.
      </p>
      {daftar.length === 0 && <p className="text-[13px] text-[#6B7A93]">Identifikasi ini belum menghasilkan kebutuhan biaya.</p>}
      <ul className="space-y-2.5">
        {daftar.map((u) => {
          if (sudahDisalin(u, props.peta)) {
            return (
              <li key={u.kunci} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#F5F8FE] px-3 py-2 text-[12.5px] text-[#44546F]">
                <span className="min-w-0 break-words">{u.uraian}</span><Chip warna="hijau">Sudah disalin</Chip>
              </li>
            );
          }
          const k = kandidatItem(u.akun, props.peta);
          if (k.bisa.length === 0) {
            return (
              <li key={u.kunci} className="space-y-1 rounded-lg bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
                <p className="break-words font-semibold">{u.uraian}</p>
                <p>
                  {k.sama.length > 0
                    ? `Item POK akun ${u.akun} sudah berstatus "RAB = Item". Ubah dulu menjadi rincian bila ingin memakai usulan ini.`
                    : `Tidak ada item POK akun ${u.akun} yang dapat menampung usulan ini (belum ada pada POK RO, atau sudah ditandai selesai).`}
                </p>
              </li>
            );
          }
          return <BarisUsulan key={u.kunci} u={u} sumber={sumber.pendek} props={props} tersedia={k.bisa} jendela={jendela} />;
        })}
      </ul>
      <p className="text-[12px] text-[#6B7A93]">
        {r.jumlah} usulan: {r.sudah} sudah disalin, {r.siap} siap disalin{r.siap > 0 ? ` (${rupiah(r.total)})` : ""}, {r.butuhHarga} menunggu volume atau harga, {r.tanpaItem} tanpa item POK.
      </p>
    </div>
  );
}

// ------------------------------------------------------------ kartu rencana realisasi (hanya baca)
function IsiRencana({ b, daftar, peta, jendela, lembarVer }: { b: BarisAcuan; daftar: UsulanBaris[]; peta: PemetaanItem[]; jendela: JendelaCair; lembarVer: number | null }) {
  const jaga = useMemo(() => jagaAnggaran(daftar, peta), [daftar, peta]);
  const rencana = useMemo(() => rencanaBulanan(daftar, peta), [daftar, peta]);
  const belumAda = jaga.filter((x) => x.status === "belum_ada");
  if (daftar.length === 0) return <p className="text-[13px] text-[#6B7A93]">Identifikasi ini belum menghasilkan kebutuhan biaya, jadi belum ada rencana realisasi.</p>;
  return (
    <div className="space-y-3">
      <KeteranganSumber b={b} lembarVer={lembarVer} />
      <div className="space-y-1.5">
        <p className={label}>Anggaran pada POK RO (hanya ada atau belum ada, berapa pun nilainya)</p>
        {belumAda.length > 0 && (
          <p role="status" className="rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] font-semibold text-[#5C4300]">
            {belumAda.length} akun yang dibutuhkan identifikasi belum ada anggarannya pada POK RO ini.
          </p>
        )}
        <ul className="space-y-1.5">
          {jaga.map((x) => (
            <li key={x.akun} className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-[#F5F8FE] px-3 py-2 text-[12.5px] text-[#44546F]">
              <span className="min-w-0 break-words">
                <span className="font-bold text-[#0F2A52]">Akun {x.akun}{x.nama ? ` · ${x.nama}` : ""}</span> · {x.usulan} kebutuhan
                {x.status === "ada" ? <span className="block text-[#6B7A93]">{x.item.join("; ")}</span> : <span className="block text-[#5C4300]">{x.pesan}</span>}
              </span>
              <Chip warna={x.status === "ada" ? "hijau" : "kuning"}>{x.status === "ada" ? "Ada" : "Belum ada"}</Chip>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1.5">
        <p className={label}>Perkiraan pencairan menurut jadwal identifikasi</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[300px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-[11.5px] text-[#5B6B84]">
                <th className="py-1 pr-3 font-semibold">Bulan</th><th className="py-1 pr-3 font-semibold">Minggu</th>
                <th className="py-1 pr-3 text-right font-semibold">Baris</th><th className="py-1 text-right font-semibold">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {rencana.sel.map((x) => (
                <tr key={`${x.bulan}-${x.minggu}`} className="border-t border-[#E3E9F2] text-[#0F2A52]">
                  <td className="py-1 pr-3">{NAMA_BULAN[x.bulan - 1]}</td><td className="py-1 pr-3">M{x.minggu}</td>
                  <td className="py-1 pr-3 text-right">{x.baris}{x.sudahDisalin > 0 ? ` (${x.sudahDisalin} di RAB)` : ""}</td>
                  <td className="py-1 text-right tabular-nums">{x.jumlah > 0 ? rupiah(x.jumlah) : "-"}{x.tanpaHarga > 0 ? ` +${x.tanpaHarga} tanpa harga` : ""}</td>
                </tr>
              ))}
              <tr className="border-t border-[#C5D0E2] font-bold text-[#0F2A52]">
                <td className="py-1 pr-3" colSpan={3}>Total terhitung</td><td className="py-1 text-right tabular-nums">{rupiah(rencana.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[#6B7A93]">
          {rencana.tanpaHarga} dari {daftar.length} kebutuhan belum punya volume atau harga sehingga belum masuk jumlah; {rencana.sudahDisalin} sudah menjadi baris RAB.
          Kebutuhan yang belum disalin memakai harga awal dari tarif kebijakan (batas tertinggi), jadi jumlah ini batas atas; yang sudah disalin dihitung dari baris RAB-nya.
          {rencana.selesaiAkhir ? ` Kegiatan berakhir paling akhir ${rencana.selesaiAkhir}; pencairan ${teksJendela(jendela)}${rencana.lambatAkhir ? `: ${rencana.lambatAkhir}` : ""}.` : " Tanggal kegiatan belum lengkap pada identifikasi."}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ kartu-kartu
/**
 * Dua kartu pada tab RAB: "Usulan dari identifikasi" (hanya bila RAB dapat diubah pengguna ini) dan "Rencana realisasi dari identifikasi" (hanya baca,
 * tampil untuk semua yang melihat RAB). Kegagalan membaca identifikasi menyembunyikan kartu tanpa mengganggu tab RAB.
 */
export function UsulanIdentifikasi(props: PropsUsulan & { editable: boolean }) {
  const acuan = useBacaKeu<BarisAcuan>(urlBaca("keu_v_ident_acuan", { ro_kode: props.kode }, { urut: "-tahun", batas: 20 }));
  const [pilih, setPilih] = useState<number | null>(null);
  const daftarIdent = useMemo(() => (acuan.baris ?? []).filter((x) => x.form_sah !== null), [acuan.baris]);
  const b = daftarIdent.find((x) => x.ident_id === pilih) ?? daftarIdent[0] ?? null;
  const lembar = useBacaKeu<LembarBerlaku>(b ? urlBaca("keu_v_kebijakan_berlaku", { tahun: b.tahun }, { batas: 1 }) : null);
  const siap = b !== null && (lembar.baris !== null || lembar.galat !== null);
  const lembarVer = lembar.baris?.[0]?.ver ?? null;
  const bahan = useMemo(() => (b && siap ? hitungBahan(b, lembar.baris?.[0]?.isi ?? null) : null), [b, siap, lembar.baris]);

  if (acuan.galat || acuan.baris === null || b === null) return null;
  const ringkasan = `${b.nama} (${sumberDari(b).pendek})`;
  const pemilih = daftarIdent.length > 1 && (
    <div>
      <label className={label} htmlFor="usulan-ident">Identifikasi sumber</label>
      <select id="usulan-ident" className={kolom} value={b.ident_id} onChange={(e) => setPilih(Number(e.target.value))}>
        {daftarIdent.map((x) => <option key={x.ident_id} value={x.ident_id}>{x.nama} ({x.tahun})</option>)}
      </select>
    </div>
  );
  const isiKartu = (isi: (d: UsulanBaris[], j: JendelaCair) => JSX.Element) => (
    !bahan ? <Memuat tinggi="h-16" /> : bahan.galat ? <Galat pesan={bahan.galat} /> : isi(bahan.daftar, bahan.jendela)
  );

  return (
    <div className="space-y-3">
      {pemilih}
      {props.editable && (
        <details className={kartu}>
          <summary className="min-h-[40px] cursor-pointer list-none">
            <span className={judulKartu}>Usulan dari identifikasi</span><span className="ml-2 text-[12.5px] text-[#6B7A93]">{ringkasan}</span>
          </summary>
          <div className="mt-2">{isiKartu((d, j) => <IsiUsulan b={b} daftar={d} props={props} jendela={j} lembarVer={lembarVer} />)}</div>
        </details>
      )}
      <details className={kartu}>
        <summary className="min-h-[40px] cursor-pointer list-none">
          <span className={judulKartu}>Rencana realisasi dari identifikasi</span><span className="ml-2 text-[12.5px] text-[#6B7A93]">{ringkasan}</span>
        </summary>
        <div className="mt-2">{isiKartu((d, j) => <IsiRencana b={b} daftar={d} peta={props.peta} jendela={j} lembarVer={lembarVer} />)}</div>
      </details>
    </div>
  );
}
