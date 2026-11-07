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
import { bacaVolume, barisKosong, dataBarisIdent, dataItemRab, jumlahBaris, NAMA_BULAN, periksaBaris, type BarisRabRow, type IsianBaris, type ItemRabRow, type PemetaanItem } from "@/lib/keu/rab";
import {
  dataUbahTerpasang, bacaTujuan, barisSudahAda, barisTanpaPasangan, batangPerItem, berbedaDariSaran, bacaHari, dataAmbilAlih, dataItemBaru, dataPerbarui, hariDariTeks, jelaskanVolume, KELOMPOK_RINCIAN, keadaanRincian,
  kolomHari, komponenUntukAkun, kunciItemBaru, langkahAlur, modeAman, penandaDari, periksaNamaItem, periksaSiapLengkap, pilihanTujuan, rencanaDari, rincianCampuran, ringkasHari, ringkasSurvei,
  selisihSaran, SUB_HONOR, subHonor, terpasangPer, TUJUAN_TAMBAH,
  type ItemBaruRow, type KeadaanRincian, type KelompokRincian, type Mendatang, type ModeKelompok, type PilihanTujuan, type RencanaRincian, type Terpasang,
} from "@/lib/keu/rabPerSurvei";
import { adaBarisStatus, analisisRevisi, CATATAN_JENIS_REVISI, dataStatusBaru, dataStatusUbah, LABEL_STATUS_SURVEI, NAMA_PEMICU, ringkasPemicu, statusDari, type BarisStatusSurvei, type ItemRabLengkap } from "@/lib/keu/rabStatus";
import { periksaHariBayar, type PeriodeJadwal } from "@/lib/keu/rabSurvei";
import { alokasiHari, totalAlokasi } from "@/lib/keu/rabPerSurvei";
import { infoTahap, itemBelumTerkaitSurvei, kelompokkanTahap, KET_TAHAP, NAMA_TAHAP, ringkasBarisSurvei, tahapRincian, teksMingguCair, teksSelesai, type Tahap } from "@/lib/keu/rabTahap";
import { rupiah, urlBaca } from "@/lib/keu/ro";
import { jendelaCair, labelSumber, periksaCair, periksaHarga, type JendelaCair } from "@/lib/keu/usulanRab";
import { Chip, Galat, judulKartu, kartu, kolom, label, Memuat, tombol, tombolKecil } from "../../keu-ui";
import { tulisKeuKlien, useBacaKeu, useKirim, type HasilAksi } from "../useKeu";
import SelectCari from "@/app/components/SelectCari";

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
type Simpanan = { hari: Record<string, string>; mode: ModeKelompok; tidak: string[] };
function bacaSimpanan(kunci: string): Simpanan {
  try {
    const t = typeof window === "undefined" ? null : window.localStorage.getItem(kunci);
    const o = t ? (JSON.parse(t) as { hari?: unknown; mode?: unknown; tidak?: unknown }) : {};
    const hari: Record<string, string> = {};
    if (o.hari && typeof o.hari === "object") for (const [k, v] of Object.entries(o.hari as Record<string, unknown>)) if (typeof v === "string" && bacaHari(v) !== null) hari[k] = v;
    const tidak = Array.isArray(o.tidak) ? o.tidak.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
    return { hari, mode: modeAman(o.mode), tidak };
  } catch {
    return { hari: {}, mode: modeAman(null), tidak: [] };
  }
}

const NAMA_MODE: Record<string, string> = { periode: "Pecah per periode", gabung: "Gabung semua periode" };
const WARNA_KEADAAN: Record<KeadaanRincian, "hijau" | "biru" | "kuning" | "abu"> = { sudah: "hijau", tidak: "abu", siap: "biru", isi_hari: "kuning", belum_angka: "abu", butuh_item: "kuning", cek_dobel: "kuning" };
const TEKS_KEADAAN: Record<KeadaanRincian, string> = {
  sudah: "Sudah di RAB", tidak: "Tidak dialokasikan", siap: "Siap disusun", isi_hari: "Isi hari dibayar", belum_angka: "Volume atau harga belum ada", butuh_item: "Pilih item tujuan", cek_dobel: "Butuh keputusan: baris sudah ada",
};

/** Warna dan keterangan tiap jenis belanja supaya antar topik jelas berbeda. */
const TOPIK: Record<KelompokRincian, { garis: string; latar: string; ket: string }> = {
  Pelatihan: { garis: "#1F5FD1", latar: "#EEF4FF", ket: "Konsumsi atau paket kelas. Volume = peserta × hari kelas." },
  "Translok dan penginapan": { garis: "#0E8A6D", latar: "#EAF8F4", ket: "Transport lokal dan penginapan petugas. Volume = petugas × hari (atau malam) dibayar, hari kalender." },
  Honor: { garis: "#7A4FBF", latar: "#F3EEFB", ket: "Honor instruktur (per JP) dan honor petugas lapangan. Honor petugas: harga satuan diisi sendiri (tarif di SPKL)." },
  Rapat: { garis: "#C9780A", latar: "#FFF4E3", ket: "Konsumsi rapat persiapan, pelaksanaan, dan evaluasi. Jumlah peserta rapat diisi sendiri." },
  "Lain-lain": { garis: "#5B6B84", latar: "#F1F4F9", ket: "Biaya lain dari identifikasi, mis. pulsa peserta pelatihan." },
};

/** Warna tiap tahap kegiatan (Bagian B dikelompokkan per tahap; jenis belanja menjadi sub-kelompok di dalamnya). */
const WARNA_TAHAP: Record<Tahap, { garis: string; latar: string }> = {
  Pelatihan: { garis: "#1F5FD1", latar: "#F4F8FF" },
  Pendataan: { garis: "#0B7A60", latar: "#F2FBF8" },
  "Lain-lain": { garis: "#5B6B84", latar: "#F6F8FB" },
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
  const teks = { selesai: "selesai", berjalan: "berjalan", menunggu: "menunggu" } as const;
  return (
    <ol aria-label={`Alur penyusunan RAB survei (RO ${kode})`} className="flex flex-wrap gap-2">
      {langkah.map((l) => {
        const href = tautan(l.tautan);
        return (
          <li key={l.no} title={l.ket} className="flex items-center gap-2 rounded-full border border-[#DCE3EE] bg-white py-1 pl-1 pr-3 text-[12.5px]">
            <span aria-hidden className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: warna[l.keadaan] }}>{l.keadaan === "selesai" ? "✓" : l.no}</span>
            <span className="font-semibold text-[#0F2A52]">{l.judul}</span>
            <span className="text-[#6B7A93]">· {teks[l.keadaan]}</span>
            {href && <Link href={href} className="font-semibold text-[#1F5FD1] underline">Buka</Link>}
          </li>
        );
      })}
    </ol>
  );
}

function PanelJelas({ id, baris }: { id: string; baris: string[] }) {
  return (
    <div id={id} role="note" className="space-y-0.5 rounded-md bg-[#EAF1FC] px-3 py-1.5 text-[12.5px] leading-relaxed text-[#1B2B4B]">
      <p className="font-semibold">Asal angka</p>
      {baris.map((t) => <p key={t}>{t}</p>)}
      <p className="text-[#5B6B84]">Saran dari identifikasi; boleh diubah.</p>
    </div>
  );
}

/** Empat langkah di layar ini; langkah pertama yang belum selesai ditandai "sekarang". */
function PanduanLangkah({ langkah }: { langkah: { judul: string; ket: string; selesai: boolean }[] }) {
  const sekarang = langkah.findIndex((l) => !l.selesai);
  return (
    <ol aria-label="Langkah di halaman ini" className="flex flex-wrap gap-2">
      {langkah.map((l, i) => {
        const warna = l.selesai ? "#0E8A6D" : i === sekarang ? "#1F5FD1" : "#8A97AD";
        return (
          <li key={l.judul} title={l.ket} aria-current={i === sekarang ? "step" : undefined}
            className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[13px]" style={{ borderColor: i === sekarang ? "#1F5FD1" : "#DCE3EE", background: i === sekarang ? "#EEF4FF" : "#fff" }}>
            <span aria-hidden className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: warna }}>{l.selesai ? "✓" : i + 1}</span>
            <span className="font-semibold text-[#0F2A52]">{l.judul}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------ satu rincian (satu baris tabel)
type PropsBaris = {
  rc: RencanaRincian; terpasang: Terpasang | undefined; ubah: Ubah; setUbah: (u: Ubah) => void; pilihan: PilihanTujuan; isian: IsianBaris; keadaan: KeadaanRincian;
  editable: boolean; peta: PemetaanItem[]; itemBaru: ItemBaruRow[]; jendela: JendelaCair; sibuk: boolean; penjelasan: string[]; sudahAda: BarisRabRow[];
  perbarui: () => void; simpanTerpasang: (barisId: number, data: Record<string, unknown>) => Promise<boolean>;
  tidak: boolean; setTidak: (v: boolean) => void;
};

/** Kolom tabel rincian; jumlah kolom dipakai baris tambahan (colSpan). */
const KOLOM_RINCIAN = ["Rincian", "Volume", "Satuan", "Harga satuan (Rp)", "Jumlah", "Cair", "Masuk ke item", "Status"] as const;
const inp = "h-9 w-full rounded-md border border-[#C5D0E2] bg-white px-2 text-[13px] text-[#0F2A52] focus:border-[#1F5FD1] focus:outline-none focus:ring-1 focus:ring-[#1F5FD1]";
const sel = "!min-h-[36px] !px-2 !text-[13px]";
const tombolMini = "rounded-md border border-[#C5D0E2] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#1F5FD1] disabled:opacity-50";
const teksAngka = (v: number | string): string => String(Number(v)).replace(".", ",");

function BarisSurvei({ rc, terpasang, ubah, setUbah, pilihan, isian, keadaan, editable, peta, itemBaru, jendela, sibuk, penjelasan, sudahAda, perbarui, simpanTerpasang, tidak, setTidak }: PropsBaris) {
  const id = (s: string) => `rps-${rc.r.kunci}-${s}`.replace(/[^\w-]/g, "_");
  const [detail, setDetail] = useState(false);
  const [ubahJadwal, setUbahJadwal] = useState(false);
  // (29 Okt 2026) ubah volume dan harga baris yang sudah di RAB langsung dari tabel
  const [edit, setEdit] = useState<{ volume: string; satuan: string; harga: string } | null>(null);
  const [galatEdit, setGalatEdit] = useState<string[]>([]);
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
  const adaOpsiPok = pilihan.opsi.some((o) => o.jenis === "pok");
  // (29 Okt 2026) Jadwal cair otomatis = hari terakhir kegiatan + 1 minggu; pilihan manual hanya bila pengguna menekan Ubah, atau tanggal kegiatan belum lengkap.
  const jadwalManual = rc.selesai === null || ubahJadwal || ubah.bulan_mulai !== undefined || ubah.minggu !== undefined;

  // Isi sel: baris yang sudah di RAB (atau sedang diubah), baris yang bisa diisi, atau saran saja (tanpa hak ubah).
  const bisaIsi = terpasang ? edit !== null : editable;
  const nilai = terpasang
    ? (edit ?? { volume: teksAngka(terpasang.baris.volume), satuan: terpasang.baris.satuan, harga: String(Math.round(Number(terpasang.baris.harga_satuan))) })
    : { volume: isian.volume, satuan: isian.satuan, harga: isian.harga };
  const ubahNilai = (u: Partial<{ volume: string; satuan: string; harga: string }>) => { if (terpasang) setEdit({ ...(edit ?? nilai), ...u }); else setUbah(u); };
  const jml = terpasang && edit === null ? Number(terpasang.baris.jumlah) : jumlahBaris({ ...barisKosong(nilai.satuan), volume: nilai.volume, harga: nilai.harga });
  const hargaTeks = nilai.harga !== "" && Number.isFinite(Number(nilai.harga)) ? rupiah(Number(nilai.harga)) : "–";

  const adaBarisTambahan = detail || tampilNama || tawarNama || pesanDobel || peringatan.length > 0 || edit !== null || sink?.berubah === true
    || (editable && !terpasang && !adaOpsiPok) || (g !== null && g.length > 0 && keadaan !== "isi_hari" && keadaan !== "siap");
  const sel2 = "align-top border-b border-[#E6ECF5] px-2 py-1.5";

  if (tidak) {
    return (
      <tr className="bg-[#F6F7F9] text-[#7A869B]">
        <td colSpan={KOLOM_RINCIAN.length - 1} className={sel2}>
          <p className="break-words text-[13px] leading-snug line-through">{rc.r.uraian}</p>
          <p className="mt-0.5 text-[11.5px]">Akun {rc.r.akun} · tidak ikut RAB dan tidak menghalangi «Tandai Siap».</p>
        </td>
        <td className={`${sel2} w-[150px]`}>
          <div className="flex flex-col items-start gap-1.5">
            <Chip warna="abu">Tidak dialokasikan</Chip>
            {editable && <button type="button" className={tombolMini} onClick={() => setTidak(false)}>Batalkan tanda</button>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className="hover:bg-[#FAFBFE]">
        <td className={`${sel2} min-w-[200px]`}>
          <p className="break-words text-[13px] font-semibold leading-snug text-[#0F2A52]">{rc.r.uraian}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[#6B7A93]">
            <span>Akun {rc.r.akun}</span>
            {rc.r.perk && <span className="font-semibold text-[#8A6200]">Perkiraan</span>}
            <button type="button" aria-expanded={detail} aria-controls={id("detail")} onClick={() => setDetail(!detail)} className="font-semibold text-[#1F5FD1] underline">{detail ? "Tutup detail" : "Detail"}</button>
          </div>
        </td>
        <td className={`${sel2} w-[84px]`}>
          {bisaIsi
            ? <input aria-label={`Volume: ${rc.r.uraian}`} className={`${inp} text-right tabular-nums`} inputMode="decimal" value={nilai.volume} onChange={(e) => ubahNilai({ volume: e.target.value.replace(/[^\d.,]/g, "").slice(0, 15) })} />
            : <p className="py-1.5 text-right tabular-nums">{nilai.volume || "–"}</p>}
        </td>
        <td className={`${sel2} w-[96px]`}>
          {bisaIsi
            ? <input aria-label={`Satuan: ${rc.r.uraian}`} className={inp} maxLength={20} value={nilai.satuan} onChange={(e) => ubahNilai({ satuan: e.target.value })} />
            : <p className="py-1.5">{nilai.satuan || "–"}</p>}
        </td>
        <td className={`${sel2} w-[116px]`}>
          {bisaIsi
            ? <input aria-label={`Harga satuan: ${rc.r.uraian}`} className={`${inp} text-right tabular-nums`} inputMode="numeric" value={nilai.harga} onChange={(e) => ubahNilai({ harga: e.target.value.replace(/[^\d.]/g, "").slice(0, 18) })} />
            : <p className="py-1.5 text-right tabular-nums">{hargaTeks}</p>}
        </td>
        <td className={`${sel2} w-[104px] text-right`}>
          <p className="py-1.5 font-bold tabular-nums text-[#0F2A52]" aria-live="polite">{jml === null || Number.isNaN(jml) ? "–" : rupiah(jml)}</p>
        </td>
        <td className={`${sel2} w-[150px]`}>
          {terpasang ? (
            <p className="whitespace-nowrap py-1.5 text-[12.5px]">{NAMA_BULAN[Number(terpasang.baris.bulan_mulai) - 1] ?? "–"} · mgg {terpasang.baris.minggu}</p>
          ) : !editable ? (
            <p className="whitespace-nowrap py-1.5 text-[12.5px]">{NAMA_BULAN[isian.bulan_mulai - 1]} · mgg {isian.minggu}</p>
          ) : jadwalManual ? (
            <div className="flex flex-wrap items-center gap-1">
              <div className="w-[68px]">
                <SelectCari id={id("b")} aria-label="Bulan cair" className={`${kolom} ${sel}`} value={isian.bulan_mulai} onChange={(e) => setUbah({ bulan_mulai: Number(e.target.value) })}>
                  {NAMA_BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
                </SelectCari>
              </div>
              <div className="w-[62px]">
                <SelectCari id={id("m")} aria-label="Minggu cair" className={`${kolom} ${sel}`} value={isian.minggu} onChange={(e) => setUbah({ minggu: Number(e.target.value) })}>
                  {[1, 2, 3, 4].map((m) => <option key={m} value={m}>Mgg {m}</option>)}
                </SelectCari>
              </div>
              {rc.selesai !== null && <button type="button" className="text-[12px] font-semibold text-[#1F5FD1] underline" onClick={() => { setUbah({ bulan_mulai: undefined, minggu: undefined }); setUbahJadwal(false); }}>Otomatis</button>}
            </div>
          ) : (
            <div className="flex items-center gap-2 whitespace-nowrap py-1.5" title={`Otomatis: akhir kegiatan ${rc.selesai} + 1 minggu`}>
              <span className="text-[12.5px] font-semibold text-[#0F2A52]">{NAMA_BULAN[isian.bulan_mulai - 1]} · mgg {isian.minggu}</span>
              <button type="button" className="text-[12px] font-semibold text-[#1F5FD1] underline" onClick={() => setUbahJadwal(true)}>Ubah</button>
            </div>
          )}
        </td>
        <td className={`${sel2} w-[232px]`}>
          {terpasang ? (
            <p className="break-words py-1.5 text-[12.5px]">{namaTujuan}{terpasang.itemRab.pok_kunci ? "" : <span className="text-[#6B7A93]"> (item baru)</span>}</p>
          ) : !editable ? (
            <p className="py-1.5 text-[12.5px] text-[#6B7A93]">–</p>
          ) : (
            <div className="w-[220px] max-w-full">
              <SelectCari id={id("i")} aria-label={`Masuk ke item: ${rc.r.uraian}`} className={`${kolom} ${sel}`} value={tujuan} onChange={(e) => setUbah({ tujuan: e.target.value, dobel: undefined, pakaiId: undefined })}>
                <option value="">Pilih item…</option>
                {pilihan.opsi.map((o) => <option key={o.nilai} value={o.nilai}>{o.label}</option>)}
              </SelectCari>
            </div>
          )}
        </td>
        <td className={`${sel2} w-[170px]`}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Chip warna={WARNA_KEADAAN[keadaan]}>{TEKS_KEADAAN[keadaan]}</Chip>
            {(terpasang?.diubah || diubahSebelum) && <span className="text-[11.5px] font-semibold text-[#5B3A8C]">Diubah dari saran</span>}
            {!terpasang && editable && (
              <button type="button" className={tombolMini} onClick={() => setTidak(true)} title="Biaya ini memang tidak ada pada survei ini; rincian tidak ikut RAB">
                Tidak dialokasikan
              </button>
            )}
            {terpasang && editable && edit === null && (
              <button type="button" disabled={sibuk} className={tombolMini}
                onClick={() => { setGalatEdit([]); setEdit({ volume: teksAngka(terpasang.baris.volume), satuan: terpasang.baris.satuan, harga: String(Math.round(Number(terpasang.baris.harga_satuan))) }); }}>
                Ubah angka
              </button>
            )}
          </div>
        </td>
      </tr>

      {adaBarisTambahan && (
        <tr>
          <td colSpan={KOLOM_RINCIAN.length} className="border-b border-[#E6ECF5] bg-[#F8FAFD] px-3 py-1.5">
            <div id={id("detail")} className="space-y-1.5 text-[12.5px] text-[#44546F]">
              {detail && (
                <div className="space-y-1">
                  {rc.r.catatan && <p>{rc.r.catatan}</p>}
                  {rc.r.hari !== null && rc.r.kelompok === "Translok dan penginapan" && (
                    <p>Alokasi {rc.r.hari} {jenisHari} per petugas{rc.r.hari === 0 ? ": isi volume sendiri atau ubah alokasi di Pengaturan hari." : "."}</p>
                  )}
                  <PanelJelas id={id("jelas")} baris={penjelasan} />
                  <p>
                    <span className="font-semibold">Pilihan item</span> berisi butir POK RO ini dengan akun {rc.r.akun} (yang belum «RAB = Item» atau selesai), item baru di RAB, dan opsi tambah item baru. {pilihan.hasil.pesan}
                  </p>
                  {rc.batasHarga !== null ? <p>Harga maksimal {rupiah(rc.batasHarga)} (kebijakan); lebih rendah boleh.</p> : <p>Tarif belum ada di kebijakan: isi harga sendiri.</p>}
                  {terpasang?.diubah && <p className="text-[#5B3A8C]">Saran saat disalin: {terpasang.baris.ident_vol ?? "-"} × {terpasang.baris.ident_harga !== null && terpasang.baris.ident_harga !== undefined ? rupiah(terpasang.baris.ident_harga) : "-"}.</p>}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {editable && !terpasang && !adaOpsiPok && (
                <p className="min-w-0 flex-1 basis-[320px] rounded-md border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-1 text-[#5C4300]">
                  Tidak ada butir POK akun {rc.r.akun} di RO ini, jadi rincian ini masuk sebagai <span className="font-semibold">item baru di RAB</span> (bahan revisi POK).
                </p>
              )}
              {tampilNama && (
                <div className="flex min-w-0 flex-1 basis-[320px] items-center gap-2">
                  <label className="text-[12px] font-semibold text-[#5B6B84]" htmlFor={id("n")}>Nama item baru</label>
                  <input id={id("n")} className={`${inp} flex-1`} maxLength={200} value={ubah.nama ?? saranNama ?? ""} onChange={(e) => setUbah({ nama: e.target.value })} />
                </div>
              )}
              </div>
              {tawarNama && (
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={ubah.ubahNama ?? false} onChange={(e) => setUbah({ ubahNama: e.target.checked })} />
                  <span>Perbaiki nama item di RAB menjadi «{saranNama}» (item POK tidak berubah; tercatat sebagai pemicu P-02).</span>
                </label>
              )}
              {pesanDobel && (
                <div role="group" aria-label="Baris yang sudah ada pada item ini" className="space-y-1.5 rounded-md border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[#5C4300]">
                  <p className="font-semibold">Item ini sudah punya {sudahAda.length} baris RAB buatan Anda. Pilih satu agar tidak ganda:</p>
                  <ul className="space-y-1">
                    {sudahAda.map((b) => (
                      <li key={b.baris_id} className="flex flex-wrap items-center justify-between gap-2 break-words">
                        <span>{b.ket || "(tanpa keterangan)"}: {Number(b.volume)} {b.satuan} × {rupiah(b.harga_satuan)} = {rupiah(b.jumlah)}</span>
                        {editable && (
                          <button type="button" disabled={sibuk} aria-pressed={ubah.dobel === "pakai" && ubah.pakaiId === b.baris_id} onClick={() => setUbah({ dobel: "pakai", pakaiId: b.baris_id })}
                            className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${ubah.dobel === "pakai" && ubah.pakaiId === b.baris_id ? "bg-[#1F5FD1] text-white" : "border border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>Pakai baris ini</button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button type="button" disabled={sibuk} aria-pressed={ubah.dobel === "baru"} onClick={() => setUbah({ dobel: "baru", pakaiId: undefined })}
                    className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${ubah.dobel === "baru" ? "bg-[#1F5FD1] text-white" : "border border-[#C5D0E2] bg-white text-[#1B2B4B]"}`}>Tetap tambah baris baru</button>
                </div>
              )}
              {peringatan.length > 0 && (
                <ul className="space-y-0.5 rounded-md border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-1.5 text-[#5C4300]">
                  {peringatan.map((x) => <li key={x}>{x}</li>)}
                </ul>
              )}
              {g && g.length > 0 && keadaan !== "isi_hari" && keadaan !== "siap" && <p className="text-[#6B7A93]">Belum bisa disusun: {g.join(" ")} Bila biaya ini memang tidak ada, klik «Tidak dialokasikan» di kolom Status.</p>}

              {edit !== null && terpasang && (
                <div className="space-y-1.5">
                  {galatEdit.length > 0 && <ul role="alert" className="list-disc pl-5 font-semibold text-[#9B1C23]">{galatEdit.map((x) => <li key={x}>{x}</li>)}</ul>}
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={sibuk} className={`${tombol} bg-[#0F2A52] text-white`}
                      onClick={async () => {
                        const r = dataUbahTerpasang(terpasang.baris, edit);
                        setGalatEdit(r.galat);
                        if (!r.data) return;
                        if (await simpanTerpasang(terpasang.baris.baris_id, r.data)) setEdit(null);
                      }}>{sibuk ? "Menyimpan…" : "Simpan"}</button>
                    <button type="button" disabled={sibuk} className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`} onClick={() => { setEdit(null); setGalatEdit([]); }}>Batal</button>
                    <span>Menyimpan mengembalikan status survei ke Draf.</span>
                  </div>
                </div>
              )}
              {sink?.berubah && terpasang && (
                <div role="status" className="space-y-1 rounded-md border-l-4 border-[#C98A00] bg-[#FFF8E6] px-3 py-2 text-[#5C4300]">
                  <p className="font-semibold">Identifikasi berubah sejak rincian ini disusun.</p>
                  <p>Saran sekarang: {sink.volume ? `volume ${rc.saran.volume || "-"}` : ""}{sink.volume && sink.harga ? ", " : ""}{sink.harga ? `harga ${rc.saran.harga ? rupiah(Number(rc.saran.harga)) : "-"}` : ""}.{terpasang.diubah ? " Memperbarui menimpa angka yang pernah Anda ubah." : ""}</p>
                  {editable && <button type="button" disabled={sibuk} onClick={perbarui} className={`${tombol} bg-[#1F5FD1] text-white`}>{sibuk ? "Memperbarui…" : "Perbarui dari identifikasi"}</button>}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
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
  // (7 Nov 2026) Rincian yang ditandai «tidak dialokasikan» (kunci rincian); tersimpan di peramban ini, seperti isian hari.
  const [tidakDialokasi, setTidakDialokasi] = useState<string[]>(awal.tidak);
  const [ubahPer, setUbahPer] = useState<Record<string, Ubah>>({});
  const [pesan, setPesan] = useState<string[]>([]);
  const muatSemua = async () => { await props.muat(); await muatItemBaru(); await muatStatus(); };
  const { jalankan, mengirim, galat } = useKirim(muatSemua);

  useEffect(() => {
    try { window.localStorage.setItem(kunciSimpan, JSON.stringify({ hari: hariTeks, mode, tidak: tidakDialokasi })); } catch { /* simpanan peramban tidak wajib */ }
  }, [kunciSimpan, hariTeks, mode, tidakDialokasi]);

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
    const tidak = ada === undefined && tidakDialokasi.includes(rc.r.kunci);
    const keadaan: KeadaanRincian = tidak ? "tidak" : keadaanRincian(rc, ada !== undefined, isian, { tujuan, dobel: sudahAda.length > 0 && u.dobel === undefined });
    return { rc, u, isian, ada, keadaan, tidak, pil: pilihan[i], tujuan, sudahAda, penjelasan: jelaskanVolume(rc.r, bahan.isi) };
  });
  // Satu baris lama hanya boleh diambil alih oleh satu rincian.
  const diambil = new Map<number, string>();
  for (const x of baris0) if (!x.tidak && x.u.dobel === "pakai" && x.u.pakaiId !== undefined) diambil.set(x.u.pakaiId, x.rc.r.kunci);
  const baris = baris0.map((x) => ({ ...x, tersedia: x.sudahAda.filter((y) => !diambil.has(y.baris_id) || diambil.get(y.baris_id) === x.rc.r.kunci) }));
  const ringkas = ringkasSurvei(baris.filter((x) => !x.tidak).map((x) => ({ k: x.keadaan, jumlah: x.ada ? Number(x.ada.baris.jumlah) : jumlahBaris(x.isian) })));

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
  const akanDibuat = baris.filter((x) => x.keadaan !== "sudah" && !x.tidak && x.tujuan === TUJUAN_TAMBAH);
  const nTidak = baris.filter((x) => x.tidak).length;

  const barisSurvei = (x: typeof baris[number]) => (
    <BarisSurvei
      key={x.rc.r.kunci} rc={x.rc} terpasang={x.ada} ubah={x.u} setUbah={(u) => ubahBaris(x.rc.r.kunci, u)} pilihan={x.pil} isian={x.isian} keadaan={x.keadaan}
      editable={props.editable} peta={props.peta} itemBaru={itemBaru} jendela={jendela} sibuk={mengirim} penjelasan={x.penjelasan} sudahAda={x.tersedia}
      perbarui={() => void perbaruiBaris(x)} simpanTerpasang={simpanTerpasang}
      tidak={x.tidak} setTidak={(v) => setTidakDialokasi((a) => (v ? [...a.filter((k) => k !== x.rc.r.kunci), x.rc.r.kunci] : a.filter((k) => k !== x.rc.r.kunci)))}
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

  const simpanTerpasang = async (barisId: number, data: Record<string, unknown>): Promise<boolean> => {
    setPesan([]);
    return jalankan(() => tulisKeuKlien("keu_rab_baris", "update", data, { id: barisId }));
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
  // ---- tahapan kegiatan (7 Nov 2026): pengelompokan Bagian B dan saran pencairan per tahap
  const namaKelas = bahan.isi.kelas.map((k) => k.nama || (k.sesi === "briefing" ? "Briefing" : "Pelatihan"));
  const tahapAda = kelompokkanTahap(baris, (x) => tahapRincian(x.rc.r, namaKelas));
  const infoPerTahap = new Map<Tahap, ReturnType<typeof infoTahap>>(
    tahapAda.map((g) => [g.tahap, infoTahap(g.isi.map((x) => x.rc.selesai), new Date().getMonth() + 1, jendela.hari, libur)] as const),
  );
  const samakanCair = (daftar: typeof baris, c: { bulan: number; minggu: number }) => { for (const x of daftar) ubahBaris(x.rc.r.kunci, { bulan_mulai: c.bulan, minggu: c.minggu }); };
  const alur = langkahAlur({ lanjutanAda: b.lanjutan_ada, lanjutanVer: b.lanjutan_ver, lanjutanStatus: b.lanjutan_status, jumlah: ringkas.jumlah, sudah: ringkas.sudah, siap: status === "siap", berubah: berubahSemua.length });
  const adaPengaturan = kolHari.length > 0 || (periodeSah.length > 1 && kelompokAda.length > 0);

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-[#44546F]">
        Sumber: <span className="font-semibold text-[#0F2A52]">{sumber.panjang}</span>{lembar ? "" : " · belum ada lembar kebijakan"}{b.lanjutan_status === "draf" ? " · masih Draf, angka bisa berubah" : ""}
      </p>

      <PenunjukAlur langkah={alur} kode={props.kode} identId={b.ident_id} />

      <PanduanLangkah langkah={[
        { judul: "Isi hari dibayar", ket: "Berapa hari tiap petugas dibayar (Pengaturan hari).", selesai: kolHari.length === 0 || kolHari.some((k) => (bacaHari(hariEfektif[k.kunci]) ?? 0) > 0) },
        { judul: "Periksa rincian", ket: "Volume, harga, jadwal cair, dan item tujuan.", selesai: baris.length > 0 && baris.every((x) => x.keadaan === "sudah" || x.keadaan === "siap" || x.keadaan === "tidak") },
        { judul: "Susun RAB", ket: "Satu tombol untuk semua rincian yang lengkap.", selesai: ringkas.jumlah > 0 && ringkas.sudah === ringkas.jumlah },
        { judul: "Tandai Siap", ket: "Nyatakan RAB survei ini siap diajukan.", selesai: status === "siap" },
      ]} />
      <p className="text-[12px] text-[#5B6B84]">Belum ada yang masuk RAB RO sampai Anda menekan <span className="font-semibold">Susun RAB</span>.</p>
      {rs.length === 0 && <p className="text-[13px] text-[#6B7A93]">Identifikasi ini belum menghasilkan kebutuhan biaya.</p>}

      {adaPengaturan && (
        <Bagian huruf="A" judul="Pengaturan hari" ket="Isi dulu: volume translok dan penginapan baru terhitung bila hari lebih dari 0." garis="#0F2A52">
          {kolHari.length > 0 && (() => {
            const hariAngka: Record<string, number | null> = Object.fromEntries(kolHari.map((k) => [k.kunci, bacaHari(hariEfektif[k.kunci])]));
            const tot = totalAlokasi(kolHari, hariAngka);
            const persenIsi = tot.maksRupiah > 0 ? Math.min(100, Math.round((tot.isiRupiah / tot.maksRupiah) * 100)) : 0;
            const orangHariMaks = kolHari.reduce((t, k) => t + (alokasiHari(k, null).maksOrangHari ?? 0), 0);
            const grupHari = [
              { judul: "Translok (transport lokal)", isi: kolHari.filter((k) => !k.penginapan) },
              { judul: "Penginapan", isi: kolHari.filter((k) => k.penginapan) },
            ].filter((x) => x.isi.length > 0);
            const kepala = ["Jenis dan periode", "Petugas", "Hari dibayar per petugas", "Maks hari", "Orang-hari terisi / maks", "Tarif per hari", "Anggaran terisi", "Anggaran maksimal", "Status"];
            return (
              <div className="space-y-3">
                <div className="grid gap-3 rounded-xl border border-[#C5D1E6] bg-[#F4F8FF] p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="space-y-1.5">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-[#44546F]">Alokasi maksimal transportasi dan penginapan</p>
                    <p className="text-[22px] font-bold leading-none text-[#0F2A52]">{rupiah(tot.maksRupiah)}</p>
                    <p className="text-[12.5px] text-[#44546F]">
                      = petugas × hari kalender pendataan × tarif ({orangHariMaks.toLocaleString("id-ID")} orang-hari maksimal). Terisi {rupiah(tot.isiRupiah)} ({persenIsi}%).
                    </p>
                    {tot.kolomTanpaTarif > 0 && <p className="text-[12px] text-[#7A5A00]">{tot.kolomTanpaTarif} baris belum bisa dirupiahkan (tarif belum ada, mis. translok lebih dari 8 jam atau penginapan), jadi tidak masuk angka ini.</p>}
                  </div>
                  <div className="h-3 w-full min-w-[160px] overflow-hidden rounded-full bg-[#DCE5F3] sm:w-56" role="img" aria-label={`Terisi ${persenIsi} persen dari maksimal`}>
                    <div className="h-full rounded-full bg-[#1F5FD1]" style={{ width: `${persenIsi}%` }} />
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-[#CBD5E5]">
                  <table className="w-full min-w-[1000px] border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-[#EEF2F8] text-left text-[11.5px] font-bold uppercase tracking-wide text-[#44546F]">
                        {kepala.map((h, i) => <th key={h} scope="col" className={`px-2 py-2 ${i >= 1 && i <= 7 && i !== 2 ? "text-right" : ""}`}>{h}</th>)}
                      </tr>
                    </thead>
                    {grupHari.map((gh) => (
                      <tbody key={gh.judul}>
                        <tr><th colSpan={kepala.length} scope="colgroup" className="border-y border-[#D5DDEB] bg-[#F1F4F9] px-3 py-1.5 text-left text-[12.5px] font-bold text-[#0F2A52]" style={{ borderLeft: "6px solid #0B7A60" }}>{gh.judul}</th></tr>
                        {gh.isi.map((k) => {
                          const teks = hariTeks[k.kunci] ?? "0";
                          const n = bacaHari(teks === "" ? "0" : teks);
                          const salah = n === null ? null : periksaHariBayar(n, k.maks, k.penginapan);
                          const ada = n !== null && n > 0;
                          const al = alokasiHari(k, n);
                          const idIsi = `rps-h-${k.kunci}`.replace(/[^\w-]/g, "_");
                          const satuanHari = k.penginapan ? "malam" : "hari";
                          const td = "border-b border-[#E6ECF5] px-2 py-1.5 align-top";
                          return (
                            <tr key={k.kunci} className="hover:bg-[#FAFBFE]">
                              <td className={`${td} min-w-[220px]`}>
                                <label className="block break-words font-semibold leading-snug text-[#0F2A52]" htmlFor={idIsi}>{k.uraian}</label>
                                <p className="text-[11.5px] text-[#6B7A93]">{k.periode} · {k.mulai} s.d. {k.selesai} ({k.maks} hari kalender)</p>
                              </td>
                              <td className={`${td} text-right tabular-nums`}>{k.orang ?? "–"}</td>
                              <td className={`${td} w-[150px]`}>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    id={idIsi} className={`${inp} !w-16 text-center font-bold`} style={salah ? { borderColor: "#C62828", color: "#9B1C23" } : undefined} inputMode="numeric"
                                    aria-invalid={salah ? true : undefined} aria-describedby={`${idIsi}-info`} value={teks}
                                    onFocus={(e) => e.currentTarget.select()}
                                    onChange={(e) => setHariTeks((a) => ({ ...a, [k.kunci]: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                                  />
                                  <span className="text-[12px] text-[#5B6B84]">{satuanHari}</span>
                                </div>
                                <p id={`${idIsi}-info`} className="mt-1 text-[12px] font-semibold text-[#9B1C23]">{salah ?? ""}</p>
                              </td>
                              <td className={`${td} text-right tabular-nums`}>{k.batas}</td>
                              <td className={`${td} text-right tabular-nums`}>{al.maksOrangHari === null ? "–" : `${(al.isiOrangHari ?? 0).toLocaleString("id-ID")} / ${al.maksOrangHari.toLocaleString("id-ID")}`}</td>
                              <td className={`${td} text-right tabular-nums`}>{k.tarif === null ? "–" : rupiah(k.tarif)}</td>
                              <td className={`${td} text-right tabular-nums`}>{al.isiRupiah === null ? "–" : rupiah(al.isiRupiah)}</td>
                              <td className={`${td} text-right font-bold tabular-nums text-[#0F2A52]`}>{al.maksRupiah === null ? "–" : rupiah(al.maksRupiah)}</td>
                              <td className={`${td} w-[130px]`}><Chip warna={salah ? "merah" : ada ? "hijau" : "abu"}>{salah ? "Melebihi maks" : ada ? "Terisi" : "Belum diisi"}</Chip></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    ))}
                  </table>
                </div>
                <p className="text-[12px] text-[#5B6B84]">Maksimal = hari kalender pendataan (penginapan: dikurangi satu malam). Anggaran memakai tarif bila ada di kebijakan.</p>
              </div>
            );
          })()}

          {periodeSah.length > 1 && kelompokAda.length > 0 && (
            <div className="space-y-2">
              <p className={subJudul}>Pecah atau gabung per jenis belanja</p>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr))]">
                {kelompokAda.map((k) => (
                  <div key={k}>
                    <label className={label} htmlFor={`rps-m-${k}`.replace(/\W/g, "_")}>{k}</label>
                    <SelectCari id={`rps-m-${k}`.replace(/\W/g, "_")} className={kolom} value={mode[k]} onChange={(e) => setMode((a) => ({ ...a, [k as KelompokRincian]: e.target.value === "gabung" ? "gabung" : "periode" }))}>
                      {Object.entries(NAMA_MODE).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </SelectCari>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-[#5B6B84]">Baris RAB yang sudah disusun tidak berubah.</p>
            </div>
          )}
        </Bagian>
      )}

      <Bagian huruf="B" judul="Rincian biaya per tahapan" ket="Periksa angka, jadwal cair, dan item tujuan tiap baris. Klik «Detail» untuk asal angka." garis="#0F2A52">
        {tahapAda.map((g, urutTahap) => {
          const w = WARNA_TAHAP[g.tahap];
          const info = infoPerTahap.get(g.tahap)!;
          const belumDisusun = g.isi.filter((x) => x.keadaan !== "sudah");
          const jmlX = (x: typeof baris[number]): number => (x.tidak ? 0 : x.ada ? Number(x.ada.baris.jumlah) || 0 : jumlahBaris(x.isian) ?? 0);
          const totalTahap = g.isi.reduce((t, x) => t + jmlX(x), 0);
          const grup = KELOMPOK_RINCIAN.flatMap((k) => {
            const rk = g.isi.filter((x) => x.rc.r.kelompok === k);
            if (rk.length === 0) return [];
            if (k !== "Honor") return [{ kunci: k as string, judul: k as string, warna: TOPIK[k].garis, isi: rk }];
            return SUB_HONOR.flatMap((sg) => {
              const r2 = rk.filter((x) => subHonor(x.rc.r.uraian) === sg.kode);
              return r2.length > 0 ? [{ kunci: `Honor-${sg.kode}`, judul: `Honor · ${sg.nama}`, warna: TOPIK.Honor.garis, isi: r2 }] : [];
            });
          });
          return (
            <section key={g.tahap} aria-label={NAMA_TAHAP[g.tahap]} className="overflow-hidden rounded-xl border-2 bg-white" style={{ borderColor: w.garis }}>
              <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-3 text-white" style={{ background: w.garis }}>
                <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-[16px] font-bold" style={{ color: w.garis }}>{urutTahap + 1}</span>
                <div className="min-w-0 flex-1 basis-[200px]">
                  <h4 className="text-[16px] font-bold leading-snug">{NAMA_TAHAP[g.tahap]}</h4>
                  <p className="text-[12.5px] opacity-90">{g.isi.length} rincian{g.isi.some((x) => x.tidak) ? ` (${g.isi.filter((x) => x.tidak).length} tidak dialokasikan)` : ""} · {rupiah(totalTahap)}</p>
                </div>
                <dl className="space-y-0.5 text-[12.5px] leading-snug">
                  <div><dt className="inline opacity-85">Pekerjaan selesai: </dt><dd className="inline font-bold">{teksSelesai(info.selesai)}</dd></div>
                  <div><dt className="inline opacity-85">Saran cair (+1 minggu): </dt><dd className="inline font-bold">{teksMingguCair(info.cair)}</dd></div>
                </dl>
                {props.editable && info.cair && belumDisusun.length > 0 && (
                  <button type="button" className="rounded-md bg-white px-3 py-1.5 text-[12.5px] font-bold" style={{ color: w.garis }} onClick={() => samakanCair(belumDisusun, info.cair!)}>
                    Samakan jadwal cair
                  </button>
                )}
              </header>
              {info.tanpaTanggal > 0 && (
                <p className="border-b border-[#F0DFA8] bg-[#FFF8E6] px-3.5 py-1.5 text-[12.5px] text-[#5C4300]">
                  {info.tanpaTanggal} rincian belum punya tanggal selesai: pilih jadwal cair sendiri atau lengkapi di{" "}
                  <Link href={`/sigap/kelola/perencanaan/identifikasi/${b.ident_id}/lanjutan`} className="font-semibold underline">identifikasi lanjutan</Link>.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1020px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-[#EEF2F8] text-left text-[11.5px] font-bold uppercase tracking-wide text-[#44546F]">
                      {KOLOM_RINCIAN.map((k, i) => <th key={k} scope="col" className={`px-2 py-1.5 ${i === 1 || i === 3 || i === 4 ? "text-right" : ""}`}>{k}</th>)}
                    </tr>
                  </thead>
                  {grup.map((gr) => (
                    <tbody key={gr.kunci}>
                      <tr>
                        <th colSpan={KOLOM_RINCIAN.length} scope="colgroup" className="border-b px-3 py-2 text-left text-[13px] font-bold text-[#0F2A52]" style={{ background: `color-mix(in srgb, ${gr.warna} 16%, white)`, borderLeft: `8px solid ${gr.warna}`, borderTop: `3px solid ${gr.warna}`, borderBottomColor: gr.warna }}>
                          <span aria-hidden className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-baseline" style={{ background: gr.warna }} />
                          {gr.judul} <span className="font-medium text-[#44546F]">· {gr.isi.length} rincian · {rupiah(gr.isi.reduce((t, x) => t + jmlX(x), 0))}</span>
                        </th>
                      </tr>
                      {gr.isi.map(barisSurvei)}
                    </tbody>
                  ))}
                </table>
              </div>
            </section>
          );
        })}
        {tahapAda.length === 0 && <p className="text-[12.5px] text-[#5B6B84]">Belum ada rincian biaya. Lengkapi dulu identifikasi lanjutan.</p>}
      </Bagian>

      <Bagian huruf="C" judul="Susun RAB dan status" ket="Susun semua rincian yang lengkap sekaligus, lalu tandai Siap." garis="#0F2A52">
        <p className="text-[12.5px] text-[#44546F]">
          {ringkas.jumlah} rincian{nTidak > 0 ? ` (+${nTidak} tidak dialokasikan)` : ""}: {ringkas.sudah} sudah di RAB ({rupiah(ringkas.totalSudah)}), {ringkas.siap} siap disusun ({rupiah(ringkas.totalSiap)}), {ringkas.butuh} butuh keputusan, {ringkas.isiHari} menunggu hari dibayar, {ringkas.belumAngka} menunggu volume atau harga.
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
              ? "Gap memakai RAB survei ini. Mengubah rincian mengembalikan ke Draf."
              : "Selama Draf, Gap memakai kebutuhan dari identifikasi."}
            {!props.editable && " RAB sedang dikunci (diajukan atau disahkan)."}
          </p>
          {props.editable && (status === "siap"
            ? <button type="button" disabled={mengirim} onClick={() => void ubahStatus("draf")} className={`${tombol} bg-white text-[#1B2B4B] ring-1 ring-[#C5D0E2]`}>Kembalikan ke Draf</button>
            : <button type="button" disabled={mengirim || cekSiap.galat !== null} onClick={() => void ubahStatus("siap")} className={`${tombol} bg-[#0F2A52] text-white`}>Tandai Siap diajukan</button>)}
        </div>
        {status !== "siap" && cekSiap.galat && <p className="text-[12px] font-semibold text-[#7A5A00]">Belum bisa ditandai Siap: {cekSiap.galat}</p>}
        {cekSiap.peringatan && <p className="text-[12px] text-[#6B7A93]">Catatan: {cekSiap.peringatan}</p>}
      </Bagian>

      {(batang.length > 0 || pemicu.length > 0 || yatim.length > 0) && (
        <Bagian huruf="D" judul="Pantauan" ket="Bacaan saja." garis="#5B6B84">
          {batang.length > 0 && (
            <div className="space-y-2">
              <p className={subJudul}>Item yang diisi beberapa survei (rupiah)</p>
              <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(380px,100%),1fr))]">
                {batang.map((x) => x.kap ? (
                  <BatangItem key={x.kunci} judul={x.judul} akun={x.akun} satuan={x.satuan} kap={x.kap} sumbangan={x.sumbangan} dasar="rupiah" />
                ) : (
                  <div key={x.kunci} className="space-y-1 rounded-xl border border-[#DCE3EE] bg-white p-3.5 text-[12.5px] text-[#44546F]">
                    <p className="text-[14px] font-bold text-[#0F2A52]">{x.judul}</p>
                    <p>Item baru di RAB (akun {x.akun}): belum ada pagu POK.</p>
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
              <p className="font-semibold">{yatim.length} baris RAB dari identifikasi ini tidak cocok lagi dengan rincian sekarang.</p>
              <p>Identifikasi atau pilihan pecah/gabung berubah. Baris tidak dihapus otomatis; ubah lewat RAB standar bila perlu.</p>
              <ul className="list-disc pl-5">{yatim.map((y) => <li key={y.baris_id} className="break-words">{y.ket || y.ident_kunci}</li>)}</ul>
            </div>
          )}
        </Bagian>
      )}
    </div>
  );
}

// ------------------------------------------------------------ item POK yang belum tercakup survei mana pun
function BelumTerkaitSurvei({ peta }: { peta: PemetaanItem[] }) {
  const daftar = useMemo(() => itemBelumTerkaitSurvei(peta), [peta]);
  if (daftar.length === 0) return null;
  const total = daftar.reduce((t, p) => t + (Number(p.pok.pok) || 0), 0);
  return (
    <details className="rounded-xl border border-[#DCE3EE] bg-[#F9FAFC] p-3">
      <summary className="cursor-pointer text-[13.5px] font-bold text-[#0F2A52]">
        Belum terkait survei: {daftar.length} butir POK, pagu {rupiah(total)}
      </summary>
      <p className="mt-2 text-[12.5px] text-[#44546F]">
        Butir ini belum diisi dari identifikasi survei mana pun (belum ada baris RAB bertanda identifikasi). Isi lewat tampilan «RAB standar» bila memang di luar survei, atau tambahkan kebutuhannya pada identifikasi survei yang sesuai.
      </p>
      <ul className="mt-2 max-h-72 divide-y divide-[#E6EBF3] overflow-y-auto rounded-lg border border-[#E6EBF3] bg-white text-[12.5px]">
        {daftar.map((p) => (
          <li key={p.pok.detail_id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-1.5">
            <span className="min-w-0 break-words text-[#0F2A52]">{p.pok.nomor_item ? `${p.pok.nomor_item}. ` : ""}{p.pok.uraian} <span className="text-[#6B7A93]">· akun {p.pok.akun}</span></span>
            <span className="whitespace-nowrap font-semibold tabular-nums text-[#0F2A52]">{rupiah(Number(p.pok.pok) || 0)}</span>
          </li>
        ))}
      </ul>
    </details>
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
        <div role="tablist" aria-label="Pilih survei" className="grid gap-2 sm:grid-cols-2">
          {daftarIdent.map((x) => {
            const aktif = x.ident_id === b.ident_id;
            const rg = ringkasBarisSurvei(x.ident_id, props.barisRab);
            const st = statusDari(statusSurvei.baris ?? [], x.ident_id);
            return (
              <button
                key={x.ident_id} type="button" role="tab" aria-selected={aktif} onClick={() => setPilih(x.ident_id)}
                className={`rounded-xl border-2 p-3 text-left transition ${aktif ? "border-[#0F2A52] bg-[#EEF3FB]" : "border-[#DCE3EE] bg-white hover:border-[#9FB3D3]"}`}
              >
                <span className="block text-[14px] font-bold leading-snug text-[#0F2A52]">{x.nama} <span className="font-normal text-[#5B6B84]">({x.tahun})</span></span>
                <span className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Chip warna={st === "siap" ? "hijau" : "abu"}>{LABEL_STATUS_SURVEI[st]}</Chip>
                  <span className="text-[12px] text-[#44546F]">{rg.n === 0 ? "belum ada baris RAB" : `${rg.n} baris RAB · ${rupiah(rg.jumlah)}`}</span>
                </span>
              </button>
            );
          })}
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
      <BelumTerkaitSurvei peta={props.peta} />
    </section>
  );
}
