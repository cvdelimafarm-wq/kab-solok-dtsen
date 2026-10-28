"use client";

// app/sigap/admin/TabUnduhSpj.tsx
//
// (28 Okt 2026) Unduh SPJ untuk tim administrasi (Kelola Pendataan > Administrasi & SPJ > Unduh SPJ) -- permintaan user:
//  - rentang cetak (default semua hari pendataan) untuk pembayaran bertahap; rentang & nilai kwitansi, visum, surat pernyataan, laporan, dokumentasi mengikuti rentang;
//  - urutan: menurut tim (korwil, lalu tiap PML diikuti PPL-nya) atau abjad; peran: semua / korwil / PML / PPL saja;
//  - jenis dokumen yang dicetak boleh dipilih; keluaran PDF gabungan terurut (dibagi per MAKS_PER_PDF petugas) atau ZIP berisi PDF per petugas.
// Dijalankan dari browser: PDF gabungan tiap petugas diambil satu per satu lewat /api/sigap/admin/dokumen (dengan ?dari=&sampai=), lalu disusun.
// Gagal satu petugas tidak menghentikan yang lain. Logika murni di lib/sigapSpjCetak.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ambil, ambilBlob, pesanGalat, rupiah, SesiBerakhir } from "./api";
import { bagiBatch, ringkasanMassal, unikanNama, MAKS_PER_ZIP, type HasilMassal } from "@/lib/sigapUnduhMassal";
import {
  LABEL_JENIS,
  URUTAN_JENIS,
  type JenisDok,
  MAKS_PER_PDF,
  PILIHAN_PERAN,
  dibayarDalamRentang,
  namaBerkasCetak,
  rentangValid,
  ringkasCetak,
  saringPeran,
  teksRentang,
  teksUrutan,
  urutkanPetugas,
  type FilterPeran,
  type FormatCetak,
  type PetugasCetak,
  type UrutCetak,
} from "@/lib/sigapSpjCetak";
import { BTN, BTN_O, Chip, INPUT, Kartu, KartuAngka, Memuat, Pesan, TabelKartu, TD, TH } from "./ui";
import KepalaKolom from "./KepalaKolom";
import { adaSaring, nilaiBeda, terapkanTabel, type Saring, type Urut } from "@/lib/sigapTabelKolom";

type Baris = PetugasCetak & { dikunci_at: string | null };
type Data = { kegiatan: { kode: string } | null; rows: Baris[]; hari_min: string | null; hari_maks: string | null };

const LABEL_PERAN: Record<string, string> = { korwil: "Korwil", pml: "PML", ppl: "PPL", supervisor: "Supervisor" };
type KolomTabel = "nama" | "peran" | "tim" | "hari" | "nilai";
const KOLOM_TABEL: { id: KolomTabel; label: string; angka: boolean }[] = [
  { id: "nama", label: "Petugas", angka: false },
  { id: "peran", label: "Peran", angka: false },
  { id: "tim", label: "Tim (PML)", angka: false },
  { id: "hari", label: "Hari di rentang", angka: true },
  { id: "nilai", label: "Nilai kwitansi", angka: true },
];

function simpanBlob(blob: Blob, nama: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function TabUnduhSpj({ kegiatanId }: { kegiatanId: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [peran, setPeran] = useState<FilterPeran>("semua");
  const [urut, setUrut] = useState<UrutCetak>("tim");
  const [format, setFormat] = useState<FormatCetak>("pdf");
  const [jenis, setJenis] = useState<Set<JenisDok>>(new Set(URUTAN_JENIS));
  const [keluar, setKeluar] = useState<Set<number>>(new Set()); // penugasan yang dicentang keluar
  const [cari, setCari] = useState("");
  const [saring, setSaring] = useState<Saring<KolomTabel>>({}); // (28 Okt 2026) cari / filter per kolom (tampilan tabel saja)
  const [urutTabel, setUrutTabel] = useState<Urut<KolomTabel>>(null);
  const [proses, setProses] = useState<{ selesai: number; total: number; nama: string } | null>(null);
  const [konfirmasi, setKonfirmasi] = useState(false); // (28 Okt 2026) modal konfirmasi menggantikan window.confirm
  const batal = useRef(false);

  const muat = useCallback(async () => {
    try {
      const d = await ambil<Data>("verifikasi", { kegiatan_id: kegiatanId, tim: 1 });
      setData(d);
      setDari((x) => x || d.hari_min || "");
      setSampai((x) => x || d.hari_maks || "");
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [kegiatanId]);
  useEffect(() => {
    muat();
  }, [muat]);

  const semuaHari = !!data && dari === (data.hari_min ?? "") && sampai === (data.hari_maks ?? "");
  const rentangOk = rentangValid(dari || null, sampai || null) && (!!dari === !!sampai);
  // Rentang yang dikirim ke server: kosong bila = semua hari pendataan (berkas beku petugas yang sudah dikunci tetap dipakai).
  const dariKirim = semuaHari || !rentangOk ? null : dari;
  const sampaiKirim = semuaHari || !rentangOk ? null : sampai;
  const dariHitung = rentangOk ? dari || null : null;
  const sampaiHitung = rentangOk ? sampai || null : null;

  const daftar = useMemo(() => urutkanPetugas(saringPeran(data?.rows ?? [], peran), urut), [data, peran, urut]);
  // nilai sel tiap kolom (rentang dan nilai kwitansi mengikuti rentang cetak)
  const nilaiSel = useCallback(
    (p: Baris, k: KolomTabel): string | number => {
      if (k === "nama") return p.nama;
      if (k === "peran") return LABEL_PERAN[p.peran] ?? p.peran;
      if (k === "tim") return p.peran === "pml" ? "" : p.tim_nama ?? "";
      const n = dibayarDalamRentang(p.dibayar, dariHitung, sampaiHitung).length;
      return k === "hari" ? n : n * p.tarif;
    },
    [dariHitung, sampaiHitung]
  );
  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const dasar = q ? daftar.filter((p) => p.nama.toLowerCase().includes(q)) : daftar;
    return terapkanTabel(dasar, saring, urutTabel, nilaiSel);
  }, [daftar, cari, saring, urutTabel, nilaiSel]);
  const terpilih = useMemo(() => daftar.filter((p) => !keluar.has(p.penugasan_id)), [daftar, keluar]);
  const siap = useMemo(() => terpilih.filter((p) => dibayarDalamRentang(p.dibayar, dariHitung, sampaiHitung).length > 0), [terpilih, dariHitung, sampaiHitung]);
  const ringkas = useMemo(() => ringkasCetak(terpilih, dariHitung, sampaiHitung), [terpilih, dariHitung, sampaiHitung]);

  const maksBerkas = format === "zip" ? MAKS_PER_ZIP : MAKS_PER_PDF;
  const berkas = Math.ceil(siap.length / maksBerkas);
  const belumKunci = siap.filter((p) => !p.dikunci_at).length;
  const jenisParam = jenis.size === URUTAN_JENIS.length ? "semua" : URUTAN_JENIS.filter((j) => jenis.has(j)).join(",");
  const kode = data?.kegiatan?.kode || `kegiatan-${kegiatanId}`;

  function ubahJenis(j: JenisDok) {
    setJenis((lama) => {
      const baru = new Set(lama);
      if (baru.has(j)) baru.delete(j);
      else baru.add(j);
      return baru;
    });
  }
  // (28 Okt 2026) centang / kosongkan semua petugas yang tampil (mengikuti pencarian)
  const semuaTercentang = tampil.length > 0 && tampil.every((p) => !keluar.has(p.penugasan_id));
  const adaTercentang = tampil.some((p) => !keluar.has(p.penugasan_id));
  function aturSemua(centangSemua: boolean) {
    setKeluar((lama) => {
      const baru = new Set(lama);
      for (const p of tampil) {
        if (centangSemua) baru.delete(p.penugasan_id);
        else baru.add(p.penugasan_id);
      }
      return baru;
    });
  }
  function centang(id: number) {
    setKeluar((lama) => {
      const baru = new Set(lama);
      if (baru.has(id)) baru.delete(id);
      else baru.add(id);
      return baru;
    });
  }

  const urlDokumen = (p: Baris) => {
    const q = new URLSearchParams({ penugasan_id: String(p.penugasan_id), jenis: jenisParam, format: "gabungan", unduh: "1" });
    if (dariKirim && sampaiKirim) {
      q.set("dari", dariKirim);
      q.set("sampai", sampaiKirim);
    }
    return `/api/sigap/admin/dokumen?${q.toString()}`;
  };

  /** Validasi lalu buka modal konfirmasi (bukan window.confirm). */
  function bukaKonfirmasi() {
    if (!rentangOk) return setGalat("Rentang tanggal tidak valid: isi tanggal awal dan akhir, awal tidak boleh setelah akhir.");
    if (jenis.size === 0) return setGalat("Pilih minimal satu jenis dokumen.");
    if (siap.length === 0) return setGalat("Tidak ada petugas terpilih yang punya hari dibayar pada rentang ini.");
    setGalat(null);
    setKonfirmasi(true);
  }

  async function unduh() {
    setKonfirmasi(false);
    const maks = format === "zip" ? MAKS_PER_ZIP : MAKS_PER_PDF;
    const batch = bagiBatch(siap, maks);
    setGalat(null);
    setOk(null);
    batal.current = false;
    const hasil: HasilMassal = { berhasil: [], dilewati: [], dibatalkan: false };
    let selesai = 0;
    setProses({ selesai: 0, total: siap.length, nama: "" });
    try {
      const JSZip = format === "zip" ? (await import("jszip")).default : null;
      const { PDFDocument } = await import("pdf-lib");
      for (let b = 0; b < batch.length; b++) {
        const zip = JSZip ? new JSZip() : null;
        const gabung = format === "pdf" ? await PDFDocument.create() : null;
        const dipakai = new Set<string>();
        let isi = 0;
        for (const p of batch[b]) {
          if (batal.current) {
            hasil.dibatalkan = true;
            break;
          }
          setProses({ selesai, total: siap.length, nama: p.nama });
          try {
            const f = await ambilBlob(urlDokumen(p));
            if (zip) zip.file(unikanNama(f.namaFile || `SPJ_${p.nama}.pdf`, dipakai), f.blob);
            else if (gabung) {
              const sumber = await PDFDocument.load(await f.blob.arrayBuffer(), { ignoreEncryption: true });
              for (const hal of await gabung.copyPages(sumber, sumber.getPageIndices())) gabung.addPage(hal);
            }
            hasil.berhasil.push(p.nama);
            isi++;
          } catch (e) {
            if (e instanceof SesiBerakhir) return;
            hasil.dilewati.push({ nama: p.nama, alasan: pesanGalat(e) });
          }
          selesai++;
        }
        if (isi > 0) {
          const nama = namaBerkasCetak(kode, dariKirim, sampaiKirim, b + 1, batch.length, format);
          if (zip) simpanBlob(await zip.generateAsync({ type: "blob", compression: "STORE" }), nama);
          else if (gabung) simpanBlob(new Blob([new Uint8Array(await gabung.save())], { type: "application/pdf" }), nama);
        }
        if (hasil.dibatalkan) break;
      }
    } catch (e) {
      setGalat(`Unduh terhenti: ${pesanGalat(e)}`);
      return;
    } finally {
      setProses(null);
    }
    const teks = ringkasanMassal(hasil, siap.length).replace("masuk ZIP", format === "zip" ? "masuk ZIP" : "masuk PDF");
    if (hasil.dilewati.length > 0 || hasil.berhasil.length === 0) setGalat(teks);
    else setOk(teks);
  }

  if (galat && !data) return <Pesan onTutup={() => muat()}>{galat}</Pesan>;
  if (!data) return <Memuat />;

  const label = "block text-[12px] font-semibold text-[#5B6B84]";
  return (
    <div className="space-y-3">
      {galat && <Pesan onTutup={() => setGalat(null)}>{galat}</Pesan>}
      {ok && (
        <Pesan jenis="ok" onTutup={() => setOk(null)}>
          {ok}
        </Pesan>
      )}
      {proses && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#C9D9F0] bg-[#F2F7FE] px-3 py-2.5">
          <span className="min-w-0 flex-1 text-[13px] text-[#1F4E8C]">
            Menyusun SPJ {Math.min(proses.selesai + 1, proses.total)}/{proses.total}
            {proses.nama ? ` · ${proses.nama}` : ""}… jangan tutup halaman ini.
          </span>
          <button type="button" className={BTN_O} onClick={() => (batal.current = true)}>
            Batalkan
          </button>
        </div>
      )}

      {konfirmasi && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Konfirmasi unduh SPJ" onKeyDown={(e) => e.key === "Escape" && setKonfirmasi(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-[16px] font-extrabold text-[#0F2A52]">Unduh SPJ {siap.length} petugas?</h3>
            <dl className="mt-3 space-y-1.5 text-[13px] text-[#1B2B4B]">
              <div className="flex gap-2"><dt className="w-28 shrink-0 text-[#6B7A90]">Rentang</dt><dd className="font-semibold">{teksRentang(dariKirim, sampaiKirim)}</dd></div>
              <div className="flex gap-2"><dt className="w-28 shrink-0 text-[#6B7A90]">Dokumen</dt><dd className="font-semibold">{jenis.size === URUTAN_JENIS.length ? "Semua dokumen" : URUTAN_JENIS.filter((j) => jenis.has(j)).map((j) => LABEL_JENIS[j]).join(", ")}</dd></div>
              <div className="flex gap-2"><dt className="w-28 shrink-0 text-[#6B7A90]">Keluaran</dt><dd className="font-semibold">{format === "zip" ? "ZIP berisi PDF per petugas" : "PDF gabungan terurut"}{berkas > 1 ? ` · ${berkas} berkas (maks. ${maksBerkas} petugas per berkas)` : ""}</dd></div>
              <div className="flex gap-2"><dt className="w-28 shrink-0 text-[#6B7A90]">Urutan</dt><dd className="font-semibold">{teksUrutan(urut, peran)}</dd></div>
              <div className="flex gap-2"><dt className="w-28 shrink-0 text-[#6B7A90]">Nilai kwitansi</dt><dd className="font-semibold text-[#047857]">{rupiah(ringkas.nominal)} <span className="font-normal text-[#6B7A90]">({ringkas.hari} hari-orang)</span></dd></div>
            </dl>
            {belumKunci > 0 && (
              <p className="mt-3 rounded-lg bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#8A6200]">
                {belumKunci} dari {siap.length} petugas belum dikunci: dokumen dirakit dari data saat ini, jadi nilai bisa berubah bila isian berubah. Tidak wajib dikunci untuk mengunduh.
              </p>
            )}
            <p className="mt-3 text-[12.5px] text-[#6B7A90]">Proses berjalan satu per satu dan bisa memakan beberapa menit; jangan tutup halaman ini.{berkas > 1 ? " Browser bisa meminta izin mengunduh beberapa berkas." : ""}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={BTN_O} onClick={() => setKonfirmasi(false)} autoFocus>
                Batal
              </button>
              <button type="button" className={BTN} onClick={unduh}>
                ⬇ Unduh sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      <Kartu judul="Unduh SPJ" ket="Untuk pembayaran bertahap: pilih rentang tanggal, peran, urutan, dan dokumen yang dicetak." />
      <Kartu>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <span className={label}>Rentang cetak</span>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <input type="date" value={dari} min={data.hari_min ?? undefined} max={sampai || data.hari_maks || undefined} onChange={(e) => setDari(e.target.value)} className={INPUT} aria-label="Tanggal awal" />
              <span className="text-[12px] text-[#6B7A90]">s.d.</span>
              <input type="date" value={sampai} min={dari || data.hari_min || undefined} max={data.hari_maks ?? undefined} onChange={(e) => setSampai(e.target.value)} className={INPUT} aria-label="Tanggal akhir" />
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-[#6B7A90]">
              <span>{semuaHari ? "Semua hari pendataan." : rentangOk ? "Rentang dipilih sendiri." : "Isi tanggal awal dan akhir."}</span>
              {!semuaHari && (
                <button type="button" className="font-semibold text-[#1F5FD1]" onClick={() => (setDari(data.hari_min ?? ""), setSampai(data.hari_maks ?? ""))}>
                  Semua hari
                </button>
              )}
            </div>
          </div>
          <div>
            <label className={label}>
              Peran
              <select value={peran} onChange={(e) => setPeran(e.target.value as FilterPeran)} className={`${INPUT} mt-1 w-full`}>
                {PILIHAN_PERAN.map((o) => (
                  <option key={o.kode} value={o.kode}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label className={label}>
              Urutan
              <select value={urut} onChange={(e) => setUrut(e.target.value as UrutCetak)} className={`${INPUT} mt-1 w-full`}>
                <option value="tim">Menurut tim (PML dulu, lalu PPL-nya)</option>
                <option value="abjad">Abjad nama</option>
              </select>
            </label>
            <p className="mt-1 text-[12px] text-[#6B7A90]">{teksUrutan(urut, peran)}</p>
          </div>
          <div className="sm:col-span-2">
            <span className={label}>Dokumen yang dicetak</span>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
              {URUTAN_JENIS.map((j) => (
                <label key={j} className="flex items-center gap-1.5 text-[13px] text-[#1B2B4B]">
                  <input type="checkbox" checked={jenis.has(j)} onChange={() => ubahJenis(j)} />
                  {LABEL_JENIS[j]}
                </label>
              ))}
              <button type="button" className="text-[12px] font-semibold text-[#1F5FD1]" onClick={() => setJenis(new Set(jenis.size === URUTAN_JENIS.length ? [] : URUTAN_JENIS))}>
                {jenis.size === URUTAN_JENIS.length ? "Kosongkan" : "Pilih semua"}
              </button>
            </div>
          </div>
          <div>
            <label className={label}>
              Keluaran
              <select value={format} onChange={(e) => setFormat(e.target.value as FormatCetak)} className={`${INPUT} mt-1 w-full`}>
                <option value="pdf">PDF gabungan terurut (siap cetak)</option>
                <option value="zip">ZIP berisi PDF per petugas</option>
              </select>
            </label>
          </div>
        </div>
      </Kartu>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KartuAngka label="Petugas dicetak" nilai={siap.length} ket={ringkas.tanpaHari > 0 ? `${ringkas.tanpaHari} tanpa hari dibayar di rentang` : "semua punya hari dibayar"} />
        <KartuAngka label="Hari dibayar" nilai={ringkas.hari} ket="hari-orang dalam rentang" />
        <KartuAngka label="Nilai kwitansi" nilai={rupiah(ringkas.nominal)} ket="mengikuti rentang" warna="#047857" />
        <div className="flex items-center">
          <button type="button" className={`${BTN} w-full py-3 text-[14px]`} onClick={bukaKonfirmasi} disabled={!!proses || siap.length === 0 || !rentangOk || jenis.size === 0}>
            {proses ? "Menyusun…" : `⬇ Unduh SPJ · ${siap.length}`}
          </button>
        </div>
      </div>

      <Kartu
        judul="Urutan cetak"
        ket="Hilangkan centang untuk melewatkan petugas. Cari, urut, dan filter kolom hanya mengubah tampilan; nomor No tetap urutan cetak."
        kanan={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BTN_O} onClick={() => (setSaring({}), setUrutTabel(null))} disabled={!adaSaring(saring) && urutTabel === null}>
              Hapus filter kolom
            </button>
            <button type="button" className={BTN_O} onClick={() => aturSemua(true)} disabled={semuaTercentang}>
              Centang semua
            </button>
            <button type="button" className={BTN_O} onClick={() => aturSemua(false)} disabled={!adaTercentang}>
              Kosongkan semua
            </button>
            <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama…" className={`${INPUT} w-40`} />
          </div>
        }
      />
      <TabelKartu>
        <thead>
          <tr>
            <th className={TH}>
              <input
                type="checkbox"
                checked={semuaTercentang}
                ref={(el) => {
                  if (el) el.indeterminate = adaTercentang && !semuaTercentang;
                }}
                onChange={() => aturSemua(!semuaTercentang)}
                aria-label="Centang atau kosongkan semua petugas yang tampil"
                title="Centang / kosongkan semua yang tampil"
              />
            </th>
            <th className={TH} title="Nomor urut cetak">No</th>
            {KOLOM_TABEL.map((k) => (
              <th key={k.id} className={TH}>
                <KepalaKolom id={k.id} label={k.label} saring={saring} setSaring={setSaring} urut={urutTabel} setUrut={setUrutTabel} opsi={() => nilaiBeda(daftar, k.id, nilaiSel, k.angka)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tampil.length === 0 && (
            <tr>
              <td colSpan={7} className={`${TD} py-8 text-center text-[#7B8794]`}>
                Tidak ada petugas yang cocok.
              </td>
            </tr>
          )}
          {tampil.map((p) => {
            const n = dibayarDalamRentang(p.dibayar, dariHitung, sampaiHitung).length;
            const no = daftar.indexOf(p) + 1;
            return (
              <tr key={p.penugasan_id} className={n === 0 ? "opacity-50" : ""}>
                <td className={TD}>
                  <input type="checkbox" checked={!keluar.has(p.penugasan_id)} onChange={() => centang(p.penugasan_id)} aria-label={`Ikutkan ${p.nama}`} />
                </td>
                <td className={TD}>{no}</td>
                <td className={`${TD} font-semibold text-[#1B2B4B]`}>{p.nama}</td>
                <td className={TD}>
                  <Chip w={p.peran === "ppl" ? "mut" : "navy"}>{LABEL_PERAN[p.peran] ?? p.peran}</Chip>
                </td>
                <td className={`${TD} text-[#5B6B84]`}>{p.peran === "pml" ? "—" : p.tim_nama ?? "—"}</td>
                <td className={TD}>{n > 0 ? `${n} hari` : "tidak ada"}</td>
                <td className={TD}>{n > 0 ? rupiah(n * p.tarif) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </TabelKartu>
    </div>
  );
}
