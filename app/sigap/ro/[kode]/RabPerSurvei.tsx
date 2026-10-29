"use client";

// app/sigap/ro/[kode]/RabPerSurvei.tsx
//
// (28 Okt 2026) Tampilan "RAB per survei" pada tab RAB: satu identifikasi survei diubah menjadi rincian RAB. Pengguna mengisi jatah hari dibayar translok/penginapan
// per periode (hari KALENDER), memilih pecah per periode atau gabung untuk tiap jenis belanja, menautkan tiap rincian ke item POK (beberapa
// rincian boleh ke satu item; satu item boleh diisi beberapa survei, terlihat pada batang item), atau menambah item baru di RAB bila item POK belum ada
// (bahan revisi POK). Hasilnya ditulis ke RAB yang sama dengan tampilan standar, dengan penanda sumber (ident_id, ident_kunci) supaya dapat dikenali,
// ditandai "diubah dari identifikasi", dan diperbarui bila identifikasi direvisi.
//
// (29 Okt 2026) Perubahan susunan layar atas masukan pengguna:
//  - penunjuk alur 4 langkah di atas (identifikasi awal > RAB awal > identifikasi lanjutan > perbarui RAB), dengan tautan;
//  - layar dibagi bagian A (pengaturan), B (rincian per jenis belanja, tiap jenis berwarna sendiri), C (Susun RAB dan status), D (pantauan);
//  - satu tombol "Susun RAB" menggantikan tombol salin per baris; "Tandai Siap" hanya boleh bila semua rincian ber-angka sudah masuk RAB;
//  - tombol «?» menjelaskan asal volume; kotak "sudah ada baris" mencegah dobel (Pakai baris ini / Tetap tambah baris baru).
// Tidak ada yang tertulis sebelum pengguna menekan Susun RAB. Logika murni: lib/keu/rabPerSurvei.ts, rabSurvei.ts, rab.ts, batangItem.ts.

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import BatangItem from "@/app/sigap/kelola/perencanaan/identifikasi/BatangItem";
import { bangunLibur, type Libur } from "@/lib/keu/hariKerja";
import { normalisasi } from "@/lib/keu/identifikasi";
import type { IsiKebijakan } from "@/lib/keu/kebijakan";
import { awalLanjutan, jadwalPendataan, normalisasiLanjutan, rincianBiaya, type IsiLanjutan, type StatusLanjutan } from "@/lib/keu/lanjutan";
import { bacaVolume, dataBarisIdent, dataItemRab, jumlahBaris, NAMA_BULAN, periksaBaris, type BarisRabRow, type IsianBaris, type ItemRabRow, type PemetaanItem } from "@/lib/keu/rab";
import {
  bacaTujuan, barisSudahAda, barisTanpaPasangan, batangPerItem, berbedaDariSaran, bacaHari, dataAmbilAlih, dataItemBaru, dataPerbarui, hariDariTeks, jelaskanVolume, KELOMPOK_RINCIAN, keadaanRincian,
  kolomHari, komponenUntukAkun, kunciItemBaru, langkahAlur, modeAman, penandaDari, periksaNamaItem, periksaSiapLengkap, pilihanTujuan, rencanaDari, rincianCampuran, ringkasHari, ringkasSurvei,
  selisihSaran, SUB_HONOR, subHonor, terpasangPer, TUJUAN_TAMBAH,
  type ItemBaruRow, type KeadaanRincian, type KelompokRincian, type Mendatang, type ModeKelompok, type PilihanTujuan, type RencanaRincian, type Terpasang,
} from "@/lib/keu/rabPerSurvei";
import { adaBarisStatus, analisisRevisi, CATATAN_JENIS_REVISI, dataStatusBaru, dataStatusUbah, LABEL_STATUS_SURVEI, NAMA_PEMICU, ringkasPemicu, statusDari, type BarisStatusSurvei, type ItemRabLengkap } from "@/lib/keu/rabStatus";
import { periksaHariBayar, type PeriodeJadwal } from "@/lib/keu/rabSurvei";
import { rupiah, urlBaca } from "@/lib/keu/ro";
import { jendelaCair, labelSumber, periksaCair, periksaHarga, type JendelaCair } from "@/lib/keu/usulanRab";
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

/** Perubahan pengguna atas saran identifikasi (hanya bagian yang diubah). `dobel`/`pakaiId` = keputusan bila item tujuan sudah berisi baris RAB buatan sendiri. */
type Ubah = Partial<{ volume: string; satuan: string; harga: string; bulan_mulai: number; minggu: number; tujuan: string; nama: string; ubahNama: boolean; dobel: "pakai" | "baru"; pakaiId: number }>;

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
const WARNA_KEADAAN: Record<KeadaanRincian, "hijau" | "biru" | "kuning" | "abu"> = { sudah: "hijau", siap: "biru", isi_hari: "kuning", belum_angka: "abu", butuh_item: "kuning", cek_dobel: "kuning" };
const TEKS_KEADAAN: Record<KeadaanRincian, string> = {
  sudah: "Sudah di RAB", siap: "Siap disusun", isi_hari: "Isi hari dibayar", belum_angka: "Volume atau harga belum ada", butuh_item: "Pilih item tujuan", cek_dobel: "Butuh keputusan: baris sudah ada",
};

/** Warna dan keterangan tiap jenis belanja supaya antar topik jelas berbeda. */
const TOPIK: Record<KelompokRincian, { garis: string; latar: string; ket: string }> = {
  Pelatihan: { garis: "#1F5FD1", latar: "#EEF4FF", ket: "Konsumsi atau paket kelas. Volume = peserta × hari kelas." },
  "Translok dan penginapan": { garis: "#0E8A6D", latar: "#EAF8F4", ket: "Transport lokal dan penginapan petugas. Volume = petugas × hari (atau malam) dibayar, hari kalender." },
  Honor: { garis: "#7A4FBF", latar: "#F3EEFB", ket: "Honor instruktur (per JP) dan honor petugas lapangan. Honor petugas: harga satuan diisi sendiri (tarif di SPKL)." },
  Rapat: { garis: "#C9780A", latar: "#FFF4E3", ket: "Konsumsi rapat persiapan, pelaksanaan, dan evaluasi. Jumlah peserta rapat diisi sendiri." },
  "Lain-lain": { garis: "#5B6B84", latar: "#F1F4F9", ket: "Biaya lain dari identifikasi, mis. pulsa peserta pelatihan." },
};

const subJudul = "text-[11px] font-bold uppercase tracking-[0.04em] text-[#5B6B84]";

// ------------------------------------------------------------ pembantu tampilan
function Bagian({ huruf, judul, ket, garis, children }: { huruf: string; judul: string; ket?: string; garis: string; children: ReactNode }) {
  const gaya: CSSProperties = { borderLeftColor: garis };
  return (
    <section className="space-y-3 rounded-xl border border-[#DCE3EE] border-l-[6px] bg-white p-3.5" style={gaya}>
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: garis }}>{huruf}</span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold leading-snug text-[#0F2A52]">{judul}</h3>
          {ket && <p className="text-[12.5px] leading-relaxed text-[#5B6B84]">{ket}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function PenunjukAlur({ langkah, kode, identId }: { langkah: ReturnType<typeof langkahAlur>; kode: string; identId: number }) {
  const tautan = (t: "identifikasi" | "lanjutan" | null): string | null =>
    t === "identifikasi" ? `/sigap/kelola/perencanaan/identifikasi/${identId}` : t === "lanjutan" ? `/sigap/kelola/perencanaan/identifikasi/${identId}/lanjutan` : null;
  const warna = { selesai: "#0E8A6D", berjalan: "#1F5FD1", menunggu: "#8A97AD" } as const;
  const teks = { selesai: "Selesai", berjalan: "Sedang berjalan", menunggu: "Menunggu" } as const;
  return (
    <section aria-label={`Alur penyusunan RAB survei (RO ${kode})`} className="space-y-2 rounded-xl border border-[#DCE3EE] bg-[#F8FAFD] p-3.5">
      <p className={subJudul}>Alur penyusunan RAB survei</p>
      <ol className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
        {langkah.map((l) => {
          const href = tautan(l.tautan);
          return (
            <li key={l.no} className="space-y-1 rounded-lg border border-[#DCE3EE] bg-white p-2.5" style={{ borderTopColor: warna[l.keadaan], borderTopWidth: 4 }}>
              <div className="flex items-center gap-2">
                <span aria-hidden className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: warna[l.keadaan] }}>{l.no}</span>
                <p className="min-w-0 text-[13px] font-bold leading-snug text-[#0F2A52]">{l.judul}</p>
              </div>
              <p className="text-[11.5px] font-semibold" style={{ color: warna[l.keadaan] }}>{teks[l.keadaan]}</p>
              <p className="text-[12px] leading-relaxed text-[#44546F]">{l.ket}</p>
              {href && <Link href={href} className="inline-block text-[12.5px] font-semibold text-[#1F5FD1] underline">{l.no === 1 ? "Buka identifikasi awal →" : "Buka identifikasi lanjutan →"}</Link>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TombolTanya({ buka, setBuka, idPanel }: { buka: boolean; setBuka: (b: boolean) => void; idPanel: string }) {
  return (
    <button
      type="button" aria-expanded={buka} aria-controls={idPanel} aria-label="Dari mana angka ini?" title="Dari mana angka ini?" onClick={() => setBuka(!buka)}
      className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border text-[13px] font-bold ${buka ? "border-[#1F5FD1] bg-[#1F5FD1] text-white" : "border-[#1F5FD1] bg-white text-[#1F5FD1]"}`}
    >?</button>
  );
}

function PanelJelas({ id, baris }: { id: string; baris: string[] }) {
  return (
    <div id={id} role="note" className="space-y-0.5 rounded-lg bg-[#EAF1FC] px-3 py-2 text-[12.5px] leading-relaxed text-[#1B2B4B]">
      <p className="font-semibold">Dari mana angka ini?</p>
      {baris.map((t) => <p key={t}>{t}</p>)}
      <p className="text-[#5B6B84]">Angka ini saran dari identifikasi. Volume boleh Anda ubah; rincian yang berbeda dari saran ditandai «diubah dari identifikasi».</p>
    </div>
  );
}

/** Strip panduan di atas halaman: empat langkah di layar ini, langkah pertama yang belum selesai ditandai "sekarang". */
function PanduanLangkah({ langkah }: { langkah: { judul: string; ket: string; selesai: boolean }[] }) {
  const sekarang = langkah.findIndex((l) => !l.selesai);
  return (
    <ol aria-label="Langkah di halaman ini" className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
      {langkah.map((l, i) => {
        const warna = l.selesai ? "#0E8A6D" : i === sekarang ? "#1F5FD1" : "#8A97AD";
        return (
          <li key={l.judul} className="flex items-start gap-2 rounded-lg border bg-white px-2.5 py-2" style={{ borderColor: i === sekarang ? "#1F5FD1" : "#DCE3EE" }} aria-current={i === sekarang ? "step" : undefined}>
            <span aria-hidden className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: warna }}>{l.selesai ? "✓" : i + 1}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold leading-snug text-[#0F2A52]">{l.judul}{i === sekarang && <span className="ml-1.5 text-[11px] font-semibold text-[#1F5FD1]">sekarang</span>}</p>
              <p className="text-[12px] leading-snug text-[#5B6B84]">{l.ket}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Petunjuk satu kalimat di tiap rincian: apa yang perlu dilakukan berikutnya. */
const BERIKUTNYA: Record<KeadaanRincian, string | null> = {
  sudah: null,
  siap: "Siap. Tekan Susun RAB di bagian C.",
  isi_hari: "Berikutnya: isi alokasi hari di bagian A.",
  belum_angka: "Berikutnya: isi volume dan harga satuan.",
  butuh_item: "Berikutnya: pilih item tujuan.",
  cek_dobel: "Berikutnya: pilih «Pakai baris ini» atau «Tetap tambah baris baru».",
};

// ------------------------------------------------------------ satu rincian
type PropsBaris = {
  rc: RencanaRincian; terpasang: Terpasang | undefined; ubah: Ubah; setUbah: (u: Ubah) => void; pilihan: PilihanTujuan; isian: IsianBaris; keadaan: KeadaanRincian;
  editable: boolean; peta: PemetaanItem[]; itemBaru: ItemBaruRow[]; jendela: JendelaCair; sibuk: boolean; penjelasan: string[]; sudahAda: BarisRabRow[];
  perbarui: () => void;
};

function BarisSurvei({ rc, terpasang, ubah, setUbah, pilihan, isian, keadaan, editable, peta, itemBaru, jendela, sibuk, penjelasan, sudahAda, perbarui }: PropsBaris) {
  const id = (s: string) => `rps-${rc.r.kunci}-${s}`.replace(/[^\w-]/g, "_");
  const [tanya, setTanya] = useState(false);
  const [ubahJadwal, setUbahJadwal] = useState(false);
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
  const pesanDobel = sudahAda.length > 0 && keadaan !== "sudah";
  const jenisHari = rc.r.uraian.startsWith("Penginapan") ? "malam" : "hari";
  // (29 Okt 2026) Jadwal cair otomatis = hari terakhir kegiatan + 1 minggu; pilihan manual hanya bila pengguna menekan Ubah, atau tanggal kegiatan belum lengkap.
  const jadwalManual = rc.selesai === null || ubahJadwal || ubah.bulan_mulai !== undefined || ubah.minggu !== undefined;
  const berikut = BERIKUTNYA[keadaan];

  return (
    <li className="space-y-2.5 rounded-lg border border-[#DCE3EE] bg-white p-3">
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
        <p className="text-[12px] text-[#44546F]">Alokasi {rc.r.hari} {jenisHari} per petugas{rc.r.hari === 0 ? " (volume diisi sendiri, atau ubah alokasi di bagian A)" : ""}.</p>
      )}
      {berikut && keadaan !== "siap" && <p className="text-[12.5px] font-semibold text-[#1F5FD1]">{berikut}</p>}

      {terpasang ? (
        <div className="space-y-1.5 text-[12.5px] text-[#44546F]">
          <p>
            <span className="font-bold text-[#0F2A52]">{Number(terpasang.baris.volume)} {terpasang.baris.satuan} × {rupiah(terpasang.baris.harga_satuan)} = {rupiah(terpasang.baris.jumlah)}</span>
            {" "}pada item «{namaTujuan}»{terpasang.itemRab.pok_kunci ? "" : " (item baru di RAB)"}.
          </p>
          <div className="flex items-center gap-2">
            <TombolTanya buka={tanya} setBuka={setTanya} idPanel={id("jelas")} />
            <span className="text-[12px] text-[#5B6B84]">Dari mana volume saran ini?</span>
          </div>
          {tanya && <PanelJelas id={id("jelas")} baris={penjelasan} />}
          {terpasang.diubah && (
            <p className="text-[#5B3A8C]">Saran identifikasi saat disalin: {terpasang.baris.ident_vol ?? "-"} × {terpasang.baris.ident_harga !== null && terpasang.baris.ident_harga !== undefined ? rupiah(terpasang.baris.ident_harga) : "-"}.</p>
          )}
          {sink?.berubah && (
            <div role="status" className="space-y-1.5 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
              <p className="font-semibold">Identifikasi berubah sesudah rincian ini disusun ke RAB.</p>
              <p>Saran sekarang: {sink.volume ? `volume ${rc.saran.volume || "-"}` : ""}{sink.volume && sink.harga ? ", " : ""}{sink.harga ? `harga ${rc.saran.harga ? rupiah(Number(rc.saran.harga)) : "-"}` : ""}.{terpasang.diubah ? " Rincian ini pernah Anda ubah: memperbarui akan menimpa angka yang berubah." : ""}</p>
              {editable && <button type="button" disabled={sibuk} onClick={perbarui} className={`${tombol} bg-[#1F5FD1] text-white`}>{sibuk ? "Memperbarui…" : "Perbarui dari identifikasi"}</button>}
            </div>
          )}
        </div>
      ) : !editable ? (
        <div className="space-y-1.5">
          <p className="text-[12.5px] text-[#44546F]">Saran: {rc.saran.volume || "-"} {rc.saran.satuan} × {rc.saran.harga ? rupiah(Number(rc.saran.harga)) : "-"}. Hanya ketua tim atau admin RO yang dapat menyusun RAB.</p>
          <div className="flex items-center gap-2">
            <TombolTanya buka={tanya} setBuka={setTanya} idPanel={id("jelas")} />
            <span className="text-[12px] text-[#5B6B84]">Dari mana volume saran ini?</span>
          </div>
          {tanya && <PanelJelas id={id("jelas")} baris={penjelasan} />}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <label className="block text-[11.5px] font-semibold text-[#5B6B84]" htmlFor={id("v")}>Volume</label>
                  <TombolTanya buka={tanya} setBuka={setTanya} idPanel={id("jelas")} />
                </div>
                <input id={id("v")} className={kolom} inputMode="decimal" value={isian.volume} onChange={(e) => setUbah({ volume: e.target.value.replace(/[^\d.,]/g, "").slice(0, 15) })} />
              </div>
              <div>
                <label className={`${label} mt-[2px]`} htmlFor={id("s")}>Satuan</label>
                <input id={id("s")} className={kolom} maxLength={20} value={isian.satuan} onChange={(e) => setUbah({ satuan: e.target.value })} />
              </div>
              <div>
                <label className={`${label} mt-[2px]`} htmlFor={id("h")}>Harga satuan (Rp)</label>
                <input id={id("h")} className={kolom} inputMode="numeric" value={isian.harga} onChange={(e) => setUbah({ harga: e.target.value.replace(/[^\d.]/g, "").slice(0, 18) })} />
              </div>
              <div>
                <p className={`${label} mt-[2px]`}>Jumlah</p>
                <p className="flex min-h-[40px] items-center rounded-md bg-[#F1F4F9] px-2.5 text-[14px] font-bold text-[#0F2A52]" aria-live="polite">{jml === null ? "–" : rupiah(jml)}</p>
              </div>
            </div>
            {tanya && <PanelJelas id={id("jelas")} baris={penjelasan} />}
            <p className="text-[12px] text-[#5B6B84]">{rc.batasHarga !== null ? `Harga maksimal ${rupiah(rc.batasHarga)} (kebijakan); harga lebih rendah boleh.` : "Tarif belum ada di lembar kebijakan: isi harga satuan sendiri."}</p>
          </div>

          <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
            {jadwalManual ? (
              <>
                <div className="w-[150px]">
                  <label className={label} htmlFor={id("b")}>Bulan cair</label>
                  <select id={id("b")} className={kolom} value={isian.bulan_mulai} onChange={(e) => setUbah({ bulan_mulai: Number(e.target.value) })}>
                    {NAMA_BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
                  </select>
                </div>
                <div className="w-[120px]">
                  <label className={label} htmlFor={id("m")}>Minggu cair</label>
                  <select id={id("m")} className={kolom} value={isian.minggu} onChange={(e) => setUbah({ minggu: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map((m) => <option key={m} value={m}>Minggu {m}</option>)}
                  </select>
                </div>
                {rc.selesai !== null
                  ? <button type="button" className={`${tombol} bg-white text-[#1F5FD1] ring-1 ring-[#C5D0E2]`} onClick={() => { setUbah({ bulan_mulai: undefined, minggu: undefined }); setUbahJadwal(false); }}>Kembali otomatis</button>
                  : <p className="basis-full text-[12px] text-[#5B6B84]">Tanggal kegiatan belum lengkap pada identifikasi: pilih bulan dan minggu cair sendiri.</p>}
              </>
            ) : (
              <p className="text-[13px] text-[#0F2A52]">
                <span className="font-semibold">Cair: {NAMA_BULAN[isian.bulan_mulai - 1]}, minggu {isian.minggu}</span>
                <span className="text-[#5B6B84]"> · otomatis dari akhir kegiatan {rc.selesai} + 1 minggu </span>
                <button type="button" className="font-semibold text-[#1F5FD1] underline" onClick={() => setUbahJadwal(true)}>Ubah</button>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div>
              <label className={label} htmlFor={id("i")}>Masuk ke item mana? (disarankan item POK)</label>
              <select id={id("i")} className={kolom} value={tujuan} onChange={(e) => setUbah({ tujuan: e.target.value, dobel: undefined, pakaiId: undefined })}>
                <option value="">Pilih item…</option>
                {pilihan.opsi.map((o) => <option key={o.nilai} value={o.nilai}>{o.label}</option>)}
              </select>
              <p className="mt-1 text-[12px] text-[#5B6B84]">{pilihan.hasil.pesan}</p>
            </div>
            {tampilNama && (
              <div>
                <label className={label} htmlFor={id("n")}>Nama item baru di RAB</label>
                <input id={id("n")} className={kolom} maxLength={200} value={ubah.nama ?? saranNama ?? ""} onChange={(e) => setUbah({ nama: e.target.value })} />
                <p className="mt-1 text-[12px] text-[#5B6B84]">Saran nama = jenis belanja + nama kegiatan; ubah bila perlu. Item ini ikut RAB sebagai bahan revisi POK. Rincian lain dengan akun dan nama yang sama berbagi satu item.</p>
              </div>
            )}
            {tawarNama && (
              <label className="flex items-start gap-2 text-[12.5px] text-[#44546F]">
                <input type="checkbox" className="mt-1" checked={ubah.ubahNama ?? false} onChange={(e) => setUbah({ ubahNama: e.target.checked })} />
                <span>Saran perbaiki penamaan: ubah nama item pada RAB menjadi «{saranNama}». Item POK tidak berubah; perubahan nama ini tampil sebagai pemicu P-02 (redaksi berubah) di bagian Pemantauan, dan usulan semula-menjadinya disusun di tab Revisi (cek aturan).</span>
              </label>
            )}
            {pesanDobel && (
              <div role="group" aria-label="Baris yang sudah ada pada item ini" className="space-y-2 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
                <p className="font-semibold">Item ini sudah berisi {sudahAda.length} baris RAB yang Anda buat sendiri.</p>
                <ul className="space-y-1">
                  {sudahAda.map((b) => (
                    <li key={b.baris_id} className="flex flex-wrap items-center justify-between gap-2 break-words">
                      <span>{b.ket || "(tanpa keterangan)"}: {Number(b.volume)} {b.satuan} × {rupiah(b.harga_satuan)} = {rupiah(b.jumlah)}</span>
                      {editable && (
                        <button
                          type="button" disabled={sibuk} aria-pressed={ubah.dobel === "pakai" && ubah.pakaiId === b.baris_id}
                          onClick={() => setUbah({ dobel: "pakai", pakaiId: b.baris_id })}
                          className={`${tombol} ${ubah.dobel === "pakai" && ubah.pakaiId === b.baris_id ? "bg-[#1F5FD1] text-white" : "bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]"}`}
                        >Pakai baris ini</button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button" disabled={sibuk} aria-pressed={ubah.dobel === "baru"} onClick={() => setUbah({ dobel: "baru", pakaiId: undefined })}
                    className={`${tombol} ${ubah.dobel === "baru" ? "bg-[#1F5FD1] text-white" : "bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]"}`}
                  >Tetap tambah baris baru</button>
                  {ubah.dobel === "pakai" && <span>Baris yang dipilih akan diambil alih: keterangan, volume, harga, dan jadwalnya diganti dengan isian rincian ini.</span>}
                  {ubah.dobel === "baru" && <span>Baris lama dibiarkan; jumlah item bertambah dengan baris baru.</span>}
                  {ubah.dobel === undefined && <span>Pilih salah satu supaya tidak ada jumlah ganda.</span>}
                </div>
              </div>
            )}
          </div>

          {peringatan.length > 0 && (
            <ul className="space-y-1 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
              {peringatan.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          {g && g.length > 0 && keadaan !== "isi_hari" && <p className="text-[12px] text-[#6B7A93]">Belum bisa disusun ke RAB: {g.join(" ")}</p>}
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

function IsiSurvei({ b, bahan, lembar, libur, props, itemBaru, muatItemBaru, namaIdent, statusRows, muatStatus }: {
  b: BarisAcuan; bahan: BahanIdent; lembar: IsiKebijakan | null; libur: Libur; props: PropsRabSurvei; itemBaru: ItemBaruRow[]; muatItemBaru: () => Promise<void>; namaIdent: ReadonlyMap<number, string>;
  statusRows: BarisStatusSurvei[]; muatStatus: () => Promise<void>;
}) {
  const kunciSimpan = simpanKunci(props.kode, b.ident_id);
  const [awal] = useState(() => bacaSimpanan(kunciSimpan));
  const [hariTeks, setHariTeks] = useState<Record<string, string>>(awal.hari);
  const [mode, setMode] = useState<ModeKelompok>(awal.mode);
  const [ubahPer, setUbahPer] = useState<Record<string, Ubah>>({});
  const [pesan, setPesan] = useState<string[]>([]);
  const muatSemua = async () => { await props.muat(); await muatItemBaru(); await muatStatus(); };
  const { jalankan, mengirim, galat } = useKirim(muatSemua);

  useEffect(() => {
    try { window.localStorage.setItem(kunciSimpan, JSON.stringify({ hari: hariTeks, mode })); } catch { /* simpanan peramban tidak wajib */ }
  }, [kunciSimpan, hariTeks, mode]);

  const jendela = useMemo(() => jendelaCair(lembar), [lembar]);
  const sumber = labelSumber({ lanjutanAda: b.lanjutan_ada, lanjutanVer: b.lanjutan_ver, lanjutanStatus: b.lanjutan_status });
  // Nama kegiatan untuk saran nama item: persis seperti tampil di pilihan identifikasi, "nama (tahun)".
  const namaSurvei = `${b.nama} (${b.tahun})`;
  const periodeSah = useMemo(() => bahan.periode.filter((p) => p.mulai && p.selesai), [bahan.periode]);
  const rincian = useMemo(() => rincianBiaya(bahan.isi, bahan.f, lembar), [bahan, lembar]);
  const kolHari = useMemo(() => kolomHari(rincian, periodeSah, libur), [rincian, periodeSah, libur]);
  // (29 Okt 2026) Alokasi hari yang belum diisi tampil dan dihitung sebagai 0 (volume baru terhitung setelah alokasi lebih dari 0).
  const hariEfektif = useMemo(() => Object.fromEntries(kolHari.map((k) => [k.kunci, hariTeks[k.kunci] || "0"])), [kolHari, hariTeks]);
  const hariBayar = useMemo(() => hariDariTeks(hariEfektif), [hariEfektif]);
  const rs = useMemo(() => rincianCampuran(rincian, periodeSah, mode, hariBayar, libur), [rincian, periodeSah, mode, hariBayar, libur]);
  const rencana = useMemo(() => rencanaDari(rs, bahan.isi, periodeSah, new Date().getMonth() + 1, jendela.hari, libur, sumber.pendek), [rs, bahan.isi, periodeSah, jendela.hari, libur, sumber.pendek]);
  const terpasang = useMemo(() => terpasangPer(b.ident_id, props.barisRab, props.itemRab), [b.ident_id, props.barisRab, props.itemRab]);
  const yatim = useMemo(() => barisTanpaPasangan(b.ident_id, rs, props.barisRab), [b.ident_id, rs, props.barisRab]);
  const pilihan = useMemo(() => rencana.map((rc) => pilihanTujuan(rc.r, props.peta, itemBaru, namaSurvei)), [rencana, props.peta, itemBaru, namaSurvei]);

  const isianDari = (rc: RencanaRincian, u: Ubah): IsianBaris => ({
    ...rc.saran,
    ...(u.volume !== undefined ? { volume: u.volume } : {}), ...(u.satuan !== undefined ? { satuan: u.satuan } : {}), ...(u.harga !== undefined ? { harga: u.harga } : {}),
    ...(u.bulan_mulai !== undefined ? { bulan_mulai: u.bulan_mulai, bulan_sampai: u.bulan_mulai } : {}), ...(u.minggu !== undefined ? { minggu: u.minggu } : {}),
  });
  const baris0 = rencana.map((rc, i) => {
    const u = ubahPer[rc.r.kunci] ?? {};
    const isian = isianDari(rc, u);
    const ada = terpasang.get(rc.r.kunci);
    const tujuan = u.tujuan ?? pilihan[i].awal;
    const sudahAda = ada ? [] : barisSudahAda(tujuan, props.peta, props.barisRab);
    const keadaan = keadaanRincian(rc, ada !== undefined, isian, { tujuan, dobel: sudahAda.length > 0 && u.dobel === undefined });
    return { rc, u, isian, ada, keadaan, pil: pilihan[i], tujuan, sudahAda, penjelasan: jelaskanVolume(rc.r, bahan.isi) };
  });
  // Satu baris lama hanya boleh diambil alih oleh satu rincian.
  const diambil = new Map<number, string>();
  for (const x of baris0) if (x.u.dobel === "pakai" && x.u.pakaiId !== undefined) diambil.set(x.u.pakaiId, x.rc.r.kunci);
  const baris = baris0.map((x) => ({ ...x, tersedia: x.sudahAda.filter((y) => !diambil.has(y.baris_id) || diambil.get(y.baris_id) === x.rc.r.kunci) }));
  const ringkas = ringkasSurvei(baris.map((x) => ({ k: x.keadaan, jumlah: x.ada ? Number(x.ada.baris.jumlah) : jumlahBaris(x.isian) })));

  const mendatang: Mendatang[] = baris
    .filter((x) => x.keadaan === "siap" || x.keadaan === "belum_angka" || x.keadaan === "cek_dobel")
    .flatMap((x) => {
      const v = bacaVolume(x.isian.volume);
      return x.tujuan !== "" && x.tujuan !== TUJUAN_TAMBAH && v !== null ? [{ tujuan: x.tujuan, identId: b.ident_id, jumlah: jumlahBaris(x.isian), volume: v }] : [];
    });
  // Baris lama yang akan diambil alih tidak dihitung dua kali pada batang.
  const petaBatang = props.peta.map((p) => ({ ...p, baris: p.baris.filter((y) => !diambil.has(y.baris_id)) }));
  const barisBatang = props.barisRab.filter((y) => !diambil.has(y.baris_id));
  const batang = batangPerItem(petaBatang, itemBaru, barisBatang, namaIdent, mendatang);
  const akanDibuat = baris.filter((x) => x.keadaan !== "sudah" && x.tujuan === TUJUAN_TAMBAH);

  const barisSurvei = (x: typeof baris[number]) => (
    <BarisSurvei
      key={x.rc.r.kunci} rc={x.rc} terpasang={x.ada} ubah={x.u} setUbah={(u) => ubahBaris(x.rc.r.kunci, u)} pilihan={x.pil} isian={x.isian} keadaan={x.keadaan}
      editable={props.editable} peta={props.peta} itemBaru={itemBaru} jendela={jendela} sibuk={mengirim} penjelasan={x.penjelasan} sudahAda={x.tersedia}
      perbarui={() => void perbaruiBaris(x)}
    />
  );
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
      if (x.sudahAda.length > 0) {
        if (x.u.dobel === undefined) g.push(`${awalan}item tujuan sudah berisi baris RAB: pilih «Pakai baris ini» atau «Tetap tambah baris baru».`);
        else if (x.u.dobel === "pakai" && !x.tersedia.some((y) => y.baris_id === x.u.pakaiId)) g.push(`${awalan}baris yang dipilih untuk diambil alih tidak tersedia; pilih lagi.`);
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
        if (x.u.dobel === "pakai" && x.u.pakaiId !== undefined) {
          // ambil alih baris buatan sendiri: isian + penanda, item dan urutan tetap
          const r = await tulisKeuKlien("keu_rab_baris", "update", dataAmbilAlih(x.isian, penanda), { id: x.u.pakaiId });
          if (!r.ok) return r;
        } else {
          const r = await tulisKeuKlien("keu_rab_baris", "insert", { ...dataBarisIdent(x.isian, penanda), item_id: itemId, urut: urutBerikut(itemId) });
          if (!r.ok) return r;
        }
      }
      return { ok: true, data: null };
    });
    if (ok) {
      setPesan([]);
      setUbahPer((a) => { const n = { ...a }; for (const x of daftar) delete n[x.rc.r.kunci]; return n; });
    }
  };

  const perbaruiBaris = async (x: Rencana) => {
    if (!x.ada) return;
    const data = dataPerbarui(x.rc.saran, b.ident_ver, selisihSaran(x.rc.r, x.ada));
    if (!data) { setPesan(["Saran identifikasi belum punya angka untuk memperbarui rincian ini."]); return; }
    setPesan([]);
    await jalankan(() => tulisKeuKlien("keu_rab_baris", "update", data, { id: x.ada!.baris.baris_id }));
  };

  // ---- status tersimpan per survei
  const status = statusDari(statusRows, b.ident_id);
  const nTerpasang = terpasang.size;
  const cekSiap = periksaSiapLengkap(nTerpasang, ringkas);
  const ubahStatus = async (baru: "draf" | "siap") => {
    if (baru === "siap" && cekSiap.galat) { setPesan([cekSiap.galat]); return; }
    setPesan([]);
    await jalankan(() => adaBarisStatus(statusRows, b.ident_id)
      ? tulisKeuKlien("keu_rab_survei", "update", dataStatusUbah(baru), { rab_id: props.rabId, ident_id: b.ident_id })
      : tulisKeuKlien("keu_rab_survei", "insert", dataStatusBaru(props.rabId, b.ident_id, baru)));
  };

  // ---- pemicu revisi (hanya menandai; jenis revisi ditetapkan PPK)
  const itemLengkap = useMemo<ItemRabLengkap[]>(() => props.itemRab.flatMap((i) =>
    i.uraian === undefined || i.akun_kode === undefined || i.komponen_kode === undefined
      ? []
      : [{ id: i.id, pok_kunci: i.pok_kunci, akun_kode: i.akun_kode, uraian: i.uraian, satuan: i.satuan ?? "", komponen_kode: i.komponen_kode, selesai: i.selesai }]), [props.itemRab]);
  const pemicu = useMemo(() => analisisRevisi(props.peta, itemLengkap, props.barisRab, b.ident_id), [props.peta, itemLengkap, props.barisRab, b.ident_id]);
  const ringkasP = ringkasPemicu(pemicu);

  // ---- perbarui semua yang berubah
  const berubahSemua = baris.filter((x) => x.ada !== undefined && selisihSaran(x.rc.r, x.ada).berubah);
  const perbaruiSemua = async () => {
    setPesan([]);
    await jalankan(async (): Promise<HasilAksi<unknown>> => {
      for (const x of berubahSemua) {
        if (!x.ada) continue;
        const data = dataPerbarui(x.rc.saran, b.ident_ver, selisihSaran(x.rc.r, x.ada));
        if (!data) continue;
        const r = await tulisKeuKlien("keu_rab_baris", "update", data, { id: x.ada.baris.baris_id });
        if (!r.ok) return r;
      }
      return { ok: true, data: null };
    });
  };

  const siapSemua = baris.filter((x) => x.keadaan === "siap");
  const butuhKeputusan = baris.filter((x) => x.keadaan === "butuh_item" || x.keadaan === "cek_dobel");
  const kelompokAda = KELOMPOK_RINCIAN.filter((k) => rincian.some((r) => r.kelompok === k));
  const alur = langkahAlur({ lanjutanAda: b.lanjutan_ada, lanjutanVer: b.lanjutan_ver, lanjutanStatus: b.lanjutan_status, jumlah: ringkas.jumlah, sudah: ringkas.sudah, siap: status === "siap", berubah: berubahSemua.length });
  const adaPengaturan = kolHari.length > 0 || (periodeSah.length > 1 && kelompokAda.length > 0);

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-[#44546F]">
        Sumber: <span className="font-semibold text-[#0F2A52]">{sumber.panjang}</span>{lembar ? "; tarif dan jendela dari lembar kebijakan yang berlaku" : "; belum ada lembar kebijakan yang berlaku"}.
        {b.lanjutan_status === "draf" && " Masih Draf: angka dapat berubah."}
      </p>

      <PenunjukAlur langkah={alur} kode={props.kode} identId={b.ident_id} />

      <PanduanLangkah langkah={[
        { judul: "Isi alokasi hari", ket: "Bagian A: berapa hari tiap petugas dibayar.", selesai: kolHari.length === 0 || kolHari.some((k) => (bacaHari(hariEfektif[k.kunci]) ?? 0) > 0) },
        { judul: "Periksa rincian", ket: "Bagian B: angka, jadwal cair, item tujuan.", selesai: baris.length > 0 && baris.every((x) => x.keadaan === "sudah" || x.keadaan === "siap") },
        { judul: "Susun RAB", ket: "Bagian C: satu tombol untuk semua rincian lengkap.", selesai: ringkas.jumlah > 0 && ringkas.sudah === ringkas.jumlah },
        { judul: "Tandai Siap", ket: "Bagian C: nyatakan survei ini siap diajukan.", selesai: status === "siap" },
      ]} />
      <p className="text-[12px] text-[#5B6B84]">Tidak ada yang tertulis ke RAB RO (tab sebelah) sebelum Anda menekan <span className="font-semibold">Susun RAB</span>. Tarif kebijakan adalah batas tertinggi; harga lebih rendah boleh.</p>
      {rs.length === 0 && <p className="text-[13px] text-[#6B7A93]">Identifikasi ini belum menghasilkan kebutuhan biaya.</p>}

      {adaPengaturan && (
        <Bagian huruf="A" judul="Pengaturan hari dan pecah/gabung" ket="Isi dulu bagian ini; volume translok dan penginapan baru terhitung setelah alokasi hari lebih dari 0." garis="#1F5FD1">
          {kolHari.length > 0 && (
            <div className="space-y-2">
              <p className={subJudul}>Alokasi hari dibayar per petugas</p>
              <p className="text-[12.5px] leading-relaxed text-[#44546F]">
                Berapa hari (atau malam) <span className="font-semibold">setiap petugas</span> dibayar, bukan lamanya pendataan. Dihitung <span className="font-semibold">hari kalender</span> (akhir pekan dan libur ikut); penginapan maksimal hari kalender dikurangi satu (cek aturan).
                Isian <span className="font-semibold text-[#0E8A6D]">hijau</span> = ada alokasi, <span className="font-semibold text-[#9B1C23]">merah</span> = melebihi hari pendataan.
              </p>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
                {kolHari.map((k) => {
                  const teks = hariTeks[k.kunci] ?? "0";
                  const n = bacaHari(teks === "" ? "0" : teks);
                  const salah = n === null ? null : periksaHariBayar(n, k.maks, k.penginapan);
                  const ada = n !== null && n > 0;
                  const warna = salah ? { garis: "#C62828", latar: "#FDECEC", teks: "#9B1C23" } : ada ? { garis: "#0E8A6D", latar: "#EAF8F4", teks: "#0B6B53" } : { garis: "#DCE3EE", latar: "#F8FAFD", teks: "#0F2A52" };
                  const idIsi = `rps-h-${k.kunci}`.replace(/[^\w-]/g, "_");
                  const satuanHari = k.penginapan ? "malam" : "hari";
                  return (
                    <div key={k.kunci} className="space-y-1.5 rounded-lg border p-2.5" style={{ borderColor: warna.garis, background: warna.latar }}>
                      <label className="block text-[13px] font-bold leading-snug text-[#0F2A52]" htmlFor={idIsi}>{k.uraian} · {k.periode}</label>
                      <div className="flex items-center gap-2">
                        <input
                          id={idIsi} className={`${kolom} !w-20 text-center font-bold`} style={{ borderColor: warna.garis, color: warna.teks, background: "#fff" }} inputMode="numeric" aria-invalid={salah ? true : undefined} aria-describedby={`${idIsi}-info`} value={teks}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setHariTeks((a) => ({ ...a, [k.kunci]: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                        />
                        <span className="text-[12.5px] text-[#44546F]">{satuanHari} per petugas (maks {k.batas})</span>
                      </div>
                      <p id={`${idIsi}-info`} className={`text-[12.5px] ${salah ? "font-semibold text-[#9B1C23]" : "text-[#44546F]"}`}>
                        {salah ?? (n !== null ? ringkasHari(k.orang, n, k.penginapan) : "")}
                      </p>
                      <p className="text-[12px] text-[#6B7A93]">Pendataan {k.mulai} s.d. {k.selesai} = {k.maks} hari kalender.</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {periodeSah.length > 1 && kelompokAda.length > 0 && (
            <div className="space-y-2">
              <p className={subJudul}>Pecah atau gabung per jenis belanja</p>
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
              <p className="text-[12px] text-[#5B6B84]">Mengubah pilihan ini mengganti rincian yang ditawarkan; baris RAB yang sudah disusun tidak diubah atau dihapus.</p>
            </div>
          )}
        </Bagian>
      )}

      <Bagian huruf="B" judul="Rincian per jenis belanja" ket="Tiap jenis belanja punya warna sendiri. Periksa angka, jadwal cair, dan item tujuan tiap rincian; klik «?» pada Volume untuk melihat asal angkanya." garis="#0F2A52">
        {KELOMPOK_RINCIAN.map((k) => {
          const isi = baris.filter((x) => x.rc.r.kelompok === k);
          if (isi.length === 0) return null;
          const w = TOPIK[k];
          return (
            <div key={k} className="space-y-2 rounded-xl border p-2.5" style={{ borderColor: w.garis, background: w.latar }}>
              <div className="flex items-start gap-2">
                <span aria-hidden className="mt-1 h-3 w-3 flex-none rounded-full" style={{ background: w.garis }} />
                <div className="min-w-0">
                  <p className="text-[14px] font-bold leading-snug text-[#0F2A52]">{k} <span className="font-normal text-[#5B6B84]">({isi.length} rincian)</span></p>
                  <p className="text-[12px] text-[#44546F]">{w.ket}</p>
                </div>
              </div>
              {k === "Honor" ? (
                <div className="space-y-3">
                  {SUB_HONOR.map((sg) => {
                    const rs2 = isi.filter((x) => subHonor(x.rc.r.uraian) === sg.kode);
                    if (rs2.length === 0 && !sg.selalu) return null;
                    return (
                      <div key={sg.kode} className="space-y-2 rounded-lg border border-[#DCCFF0] bg-white/60 p-2">
                        <p className="text-[13px] font-bold text-[#4B2E83]">{sg.nama} <span className="font-normal text-[#5B6B84]">({rs2.length} rincian)</span></p>
                        {rs2.length > 0 ? <ul className="space-y-2.5">{rs2.map(barisSurvei)}</ul> : <p className="text-[12px] text-[#6B7A93]">{sg.kosong}</p>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ul className="space-y-2.5">{isi.map(barisSurvei)}</ul>
              )}
            </div>
          );
        })}
      </Bagian>

      <Bagian huruf="C" judul="Susun RAB dan status" ket="Satu tombol menyusun semua rincian yang sudah lengkap ke RAB. Setelah itu nyatakan survei ini Siap diajukan." garis="#0F2A52">
        <p className="text-[12.5px] text-[#44546F]">
          {ringkas.jumlah} rincian: {ringkas.sudah} sudah di RAB ({rupiah(ringkas.totalSudah)}), {ringkas.siap} siap disusun ({rupiah(ringkas.totalSiap)}), {ringkas.butuh} butuh keputusan, {ringkas.isiHari} menunggu hari dibayar, {ringkas.belumAngka} menunggu volume atau harga.
        </p>

        {akanDibuat.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
            <p className="font-semibold">Item baru yang akan dibuat di RAB (bahan revisi POK):</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {[...new Set(akanDibuat.map((x) => `${x.rc.r.akun.slice(0, 6)} · ${(x.u.nama ?? x.pil.hasil.saranNama ?? "").trim()}`))].map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
        )}

        {butuhKeputusan.length > 0 && (
          <div role="status" className="space-y-1 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
            <p className="font-semibold">{butuhKeputusan.length} rincian butuh keputusan Anda sebelum bisa disusun:</p>
            <ul className="list-disc pl-5">
              {butuhKeputusan.map((x) => <li key={x.rc.r.kunci} className="break-words">{x.rc.r.uraian}: {x.keadaan === "butuh_item" ? "pilih item tujuan" : "item tujuan sudah berisi baris; pilih Pakai baris ini atau Tetap tambah baris baru"}</li>)}
            </ul>
          </div>
        )}

        {props.editable && berubahSemua.length > 0 && (
          <div role="status" className="space-y-1.5 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
            <p className="font-semibold">{berubahSemua.length} rincian berbeda dari saran identifikasi terbaru.</p>
            <p>Memperbarui menimpa volume atau harga yang berubah pada rincian tersebut (termasuk yang pernah Anda ubah) dan mengembalikan status ke Draf.</p>
            <button type="button" disabled={mengirim} onClick={() => void perbaruiSemua()} className={`${tombol} bg-[#1F5FD1] text-white`}>{mengirim ? "Memperbarui…" : `Perbarui semua yang berubah (${berubahSemua.length})`}</button>
          </div>
        )}

        {props.editable ? (
          <button type="button" disabled={mengirim || siapSemua.length === 0} onClick={() => void terapkan(siapSemua)} className={`${tombol} bg-[#0F2A52] text-white`}>
            {mengirim ? "Menyusun…" : siapSemua.length > 0 ? `Susun RAB (${siapSemua.length} rincian, ${rupiah(ringkas.totalSiap)})` : "Susun RAB (tidak ada rincian yang siap)"}
          </button>
        ) : (
          <p className="text-[12.5px] text-[#6B7A93]">Hanya ketua tim atau admin RO yang dapat menyusun RAB.</p>
        )}
        {(pesan.length > 0 || galat) && <Galat pesan={[...pesan, ...(galat ? [galat] : [])]} />}

        <div className="flex flex-wrap items-center gap-2 border-t border-[#E6ECF5] pt-3">
          <p className={label}>Status RAB survei ini</p>
          <Chip warna={status === "siap" ? "hijau" : "abu"}>{LABEL_STATUS_SURVEI[status]}</Chip>
          <p className="min-w-0 flex-1 basis-[220px] text-[12px] text-[#5B6B84]">
            {status === "siap"
              ? "Gap memakai rincian RAB survei ini untuk kebutuhan biaya. Menambah, mengubah, atau menghapus rincian mengembalikan status ke Draf."
              : "Selama Draf, Gap tetap memakai kebutuhan dari identifikasi. Nyatakan Siap bila RAB survei ini sudah lengkap."}
            {!props.editable && " RAB sedang tidak dapat diubah (sudah diajukan atau disahkan), jadi status tidak dapat diganti."}
          </p>
          {props.editable && (status === "siap"
            ? <button type="button" disabled={mengirim} onClick={() => void ubahStatus("draf")} className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`}>Kembalikan ke Draf</button>
            : <button type="button" disabled={mengirim || cekSiap.galat !== null} onClick={() => void ubahStatus("siap")} className={`${tombol} bg-[#0F2A52] text-white`}>Tandai Siap diajukan</button>)}
        </div>
        {status !== "siap" && cekSiap.galat && <p className="text-[12px] font-semibold text-[#7A5A00]">Belum bisa ditandai Siap: {cekSiap.galat}</p>}
        {cekSiap.peringatan && <p className="text-[12px] text-[#6B7A93]">Catatan: {cekSiap.peringatan}</p>}
      </Bagian>

      {(batang.length > 0 || pemicu.length > 0 || yatim.length > 0) && (
        <Bagian huruf="D" judul="Pantauan" ket="Hanya bacaan: batang item, pemicu revisi, dan baris yang tidak cocok lagi." garis="#5B6B84">
          {batang.length > 0 && (
            <div className="space-y-2">
              <p className={subJudul}>Batang item: satu item diisi beberapa survei (dasar rupiah)</p>
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
            </div>
          )}

          {pemicu.length > 0 && (
            <div className="space-y-1.5 text-[12.5px] text-[#44546F]">
              <p className={subJudul}>Pemicu revisi dari survei ini ({ringkasP.total})</p>
              <ul className="space-y-1.5">
                {pemicu.map((x, i) => (
                  <li key={`${x.kode}-${x.itemId}-${i}`} className="break-words">
                    <span className="font-semibold text-[#0F2A52]">{x.kode} · {NAMA_PEMICU[x.kode]}</span>: {x.pesan}
                  </li>
                ))}
              </ul>
              <p>{CATATAN_JENIS_REVISI}</p>
              <Link href={`/sigap/ro/${encodeURIComponent(props.kode)}?tab=revisi`} className="inline-block font-semibold text-[#1F5FD1] underline">Buka tab Revisi →</Link>
            </div>
          )}

          {yatim.length > 0 && (
            <div role="status" className="space-y-1 rounded-lg border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#5C4300]">
              <p className="font-semibold">{yatim.length} baris RAB berasal dari identifikasi ini tetapi tidak cocok lagi dengan rincian yang ditawarkan sekarang.</p>
              <p>Penyebabnya identifikasi diubah atau pilihan pecah/gabung berbeda dari saat disusun. Baris tidak dihapus otomatis; ubah atau hapus lewat tampilan RAB RO bila perlu.</p>
              <ul className="list-disc pl-5">{yatim.map((y) => <li key={y.baris_id} className="break-words">{y.ket || y.ident_kunci}</li>)}</ul>
            </div>
          )}
        </Bagian>
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
  const statusSurvei = useBacaKeu<BarisStatusSurvei>(urlBaca("keu_rab_survei", { rab_id: props.rabId }, { batas: 500, kolom: ["rab_id", "ident_id", "status", "catatan", "diubah_oleh", "diubah_at"] }));
  const siap = b !== null && (statusSurvei.baris !== null || statusSurvei.galat !== null) && (lembar.baris !== null || lembar.galat !== null) && (hariLibur.baris !== null || hariLibur.galat !== null) && itemBaru.baris !== null;
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
      {(itemBaru.galat ?? statusSurvei.galat) && <Galat pesan={(itemBaru.galat ?? statusSurvei.galat) as string} />}
      {!siap || !bahan ? (
        bahan === null && siap ? <Galat pesan="Isi identifikasi tidak dapat dibaca untuk RAB per survei." /> : <Memuat tinggi="h-24" />
      ) : (
        <IsiSurvei
          key={b.ident_id} b={b} bahan={bahan} lembar={lembar.baris?.[0]?.isi ?? null} libur={libur} props={props}
          itemBaru={itemBaru.baris ?? []} muatItemBaru={itemBaru.muat} namaIdent={namaIdent} statusRows={statusSurvei.baris ?? []} muatStatus={statusSurvei.muat}
        />
      )}
    </section>
  );
}
