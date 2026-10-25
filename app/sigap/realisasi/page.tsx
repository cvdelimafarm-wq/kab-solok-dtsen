"use client";

// app/sigap/realisasi/page.tsx
//
// (24 Okt 2026) Realisasi anggaran: bendahara mengunggah Excel Laporan Ketersediaan Dana Detail (GLP039). Berkas dibaca DI PERAMBAN
// (lib/keu/glp039.ts, tanpa unggah ke server), diperiksa (identitas s.d. dan sisa, jumlah akun, jumlah total), diperlihatkan sebagai
// pratinjau, lalu dikirim sebagai JSON ke keu_realisasi_masuk lewat gerbang. Hak (kewenangan `realisasi`) ditegakkan basis data;
// tombol hanya tampil bila akun berwenang. Semua pegawai organik boleh melihat daftar unggahan.

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { langkahBerjalan, langkahRealisasi, LABEL_STATUS_LANGKAH, RINGKAS_ATURAN_REALISASI, type StatusLangkah } from "@/lib/keu/alurRealisasi";
import { paguDariGlp } from "@/lib/keu/cekPagu";
import { argsRealisasiMasuk, bacaBerkasGlp, periksaUnggahan, type HasilBerkas } from "@/lib/keu/glp039-xlsx";
import { angka, persen, rupiah, urlBaca } from "@/lib/keu/ro";
import { aksiKeu, useBacaKeu, useBoleh, useKirim } from "../ro/useKeu";
import KartuCekPagu, { statusCek, useSisiSistem, type SumberSistem } from "../revisi/CekPaguAkun";
import BagianSkor from "./Skor";
import { Catatan, Chip, Galat, HalamanKeu, judulKartu, kartu, kolom, Kpi, kisi, label, Memuat, Tenang, tombol, tombolBahaya, tombolKecil, tombolUtama } from "../keu-ui";

type Unggah = {
  id: number; tahun: number; sampai_tanggal: string; nama_berkas: string; n_item: number | string; total_pagu: number | string;
  total_lock: number | string; total_sd: number | string; status: string; alasan_batal: string | null; dibuat_at: string;
};
type RingkasRo = { ro_kode: string; sampai_tanggal: string; n_item: number | string; pagu: number | string; real_sd: number | string; persen: number | string | null };

const KELAS_LANGKAH: Record<StatusLangkah, string> = {
  selesai: "border-[#BFE3CD] bg-[#F4FBF7]", sekarang: "border-[#1F5FD1] bg-[#EAF1FC]", perhatian: "border-[#E6C766] bg-[#FFF8E6]", menunggu: "border-[#DCE3EE] bg-white",
};
const WARNA_LANGKAH: Record<StatusLangkah, "hijau" | "biru" | "kuning" | "abu"> = { selesai: "hijau", sekarang: "biru", perhatian: "kuning", menunggu: "abu" };

const tgl = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

export default function HalamanRealisasi() {
  const daftar = useBacaKeu<Unggah>(urlBaca("keu_realisasi_unggah", {}, { urut: "-sampai_tanggal", batas: 200 }));
  const boleh = useBoleh("realisasi", null);
  const { kirim, jalankan, mengirim, galat: galatKirim, hapusGalat } = useKirim(daftar.muat);

  const [b, setB] = useState<HasilBerkas | null>(null);
  const [galatBaca, setGalatBaca] = useState<string | null>(null);
  const [membaca, setMembaca] = useState(false);
  const [sampai, setSampai] = useState("");
  const [lihatItem, setLihatItem] = useState(false);
  const [berhasil, setBerhasil] = useState<string | null>(null);
  const [batal, setBatal] = useState<{ id: number; alasan: string } | null>(null);
  const inputBerkas = useRef<HTMLInputElement>(null);

  // Cek pagu per akun per RO (hanya peringatan): laporan GLP039 vs POK berlaku atau kertas kerja yang sudah diterapkan/sah.
  const jadwal = useBacaKeu<{ id: number; judul: string; jenis: string; status: string }>(urlBaca("keu_revisi_jadwal", {}, { urut: "-id", batas: 100, kolom: ["id", "judul", "jenis", "status"] }));
  const pokBerlaku = useBacaKeu<{ id: number; nomor_revisi: number }>(urlBaca("keu_pok_versi", { status: "berlaku" }, { urut: "-id", batas: 1, kolom: ["id", "nomor_revisi"] }));
  const daftarRo = useBacaKeu<{ kode: string; nama: string }>(urlBaca("keu_ro", {}, { urut: "kode", batas: 2000, kolom: ["kode", "nama"] }));
  const [pembanding, setPembanding] = useState("pok");

  const pilih = useCallback(async (f: File | undefined) => {
    setB(null); setGalatBaca(null); setBerhasil(null); hapusGalat();
    if (!f) return;
    setMembaca(true);
    try {
      const hasil = await bacaBerkasGlp(await f.arrayBuffer(), f.name);
      setB(hasil);
      setSampai(hasil.hasil.sampaiTanggal ?? "");
    } catch (e) {
      setGalatBaca(e instanceof Error ? e.message : "Berkas tidak dapat dibaca.");
    } finally {
      setMembaca(false);
    }
  }, [hapusGalat]);

  const salah = periksaUnggahan(b, sampai);
  const tahun = sampai ? Number(sampai.slice(0, 4)) : 0;
  const sudahAda = useMemo(() => (daftar.baris ?? []).find((u) => u.status === "diterima" && (u.sampai_tanggal === sampai)), [daftar.baris, sampai]);
  const ringkas = b?.hasil.ringkas;

  const jadwalAcuan = useMemo(() => (jadwal.baris ?? []).filter((j) => j.status === "diterapkan" || j.status === "sah"), [jadwal.baris]);
  const sumber: SumberSistem = pembanding.startsWith("kertas:") ? { jenis: "kertas", jadwalId: Number(pembanding.slice(7)) } : { jenis: "pok" };
  const sisi = useSisiSistem(sumber, b !== null && b.hasil.item.length > 0);
  const resmiPagu = useMemo(() => (b && b.hasil.item.length > 0 ? paguDariGlp(b.hasil.item) : null), [b]);
  const cek = useMemo(
    () => statusCek(resmiPagu, sisi.sistem, sisi.galat, { lingkup: sumber.jenis === "kertas" ? "irisan" : "ro_resmi" }),
    [resmiPagu, sisi.sistem, sisi.galat, sumber.jenis],
  );
  const namaRo = useMemo(() => new Map((daftarRo.baris ?? []).map((r) => [r.kode, r.nama.replace(" (contoh)", "")])), [daftarRo.baris]);
  const namaSistem = sumber.jenis === "kertas" ? `kertas kerja #${sumber.jadwalId}` : `POK berlaku${pokBerlaku.baris?.[0] ? ` (revisi ${pokBerlaku.baris[0].nomor_revisi})` : ""}`;
  const tanggalSah = /^\d{4}-\d{2}-\d{2}$/.test(sampai) && !Number.isNaN(Date.parse(sampai));
  const langkah = useMemo(
    () => langkahRealisasi({
      boleh, adaBerkas: b !== null, membaca, galatBaca, berkasLolos: b ? b.hasil.ok : null, tanggalSah, sudahAdaTanggal: !!sudahAda,
      cek: cek.status, mengirim, diterima: berhasil !== null,
    }),
    [boleh, b, membaca, galatBaca, tanggalSah, sudahAda, cek.status, mengirim, berhasil],
  );
  const berjalan = langkahBerjalan(langkah);

  async function kirimUnggahan() {
    if (!b || salah) return;
    setBerhasil(null);
    const ok = await jalankan(() => aksiKeu("keu_realisasi_masuk", argsRealisasiMasuk(tahun, sampai, b.nama, b.hash, b.hasil)));
    if (ok) {
      setBerhasil(`Realisasi s.d. ${tgl(sampai)} diterima (${angka(b.hasil.ringkas.nItem)} item).`);
      setB(null);
      if (inputBerkas.current) inputBerkas.current.value = "";
    }
  }

  const terbaru = (daftar.baris ?? []).find((u) => u.status === "diterima") ?? null;
  return (
    <HalamanKeu
      jejak={[{ t: "SIGAP", href: "/sigap" }, { t: "Perencanaan", href: "/sigap/ro" }, { t: "Anggaran", href: "/sigap/ro" }, { t: "Realisasi anggaran" }]}
      judul="Realisasi anggaran mingguan (Excel Laporan Ketersediaan Dana Detail)"
    >
      <Tenang>
        <b>Bendahara</b> mengunggah Excel realisasi (GLP039) dari SAKTI/SPAN setiap minggu. Berkas dibaca di perangkat dan diperiksa lebih dulu; yang dikirim hanya isi tabelnya. Angka realisasi dipakai tab Anggaran per RO, peringatan SPAN, dan skor kualitas RAB. Semua pegawai organik dapat melihat daftar unggahan.
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px]">
          {RINGKAS_ATURAN_REALISASI.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </Tenang>
      <div className={kisi}>
        <Kpi label="Data terakhir diterima" nilai={terbaru ? tgl(terbaru.sampai_tanggal) : "-"} sub={terbaru ? terbaru.nama_berkas : "belum ada unggahan"} />
        <Kpi label="Realisasi kumulatif" nilai={terbaru ? rupiah(terbaru.total_sd) : "-"} sub={terbaru ? `${persen(Number(terbaru.total_sd), Number(terbaru.total_pagu))} dari pagu` : undefined} warna="hj" />
        <Kpi label="Item pada unggahan terakhir" nilai={terbaru ? angka(terbaru.n_item) : "-"} />
      </div>

      <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="judul-alur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="judul-alur" className={judulKartu}>Alur impor realisasi</h2>
          <span className="text-[12px] font-semibold text-[#5B6B84]">{berjalan ? `Langkah ${berjalan} dari ${langkah.length}` : "Semua langkah selesai"}</span>
        </div>
        <ol className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr))]">
          {langkah.map((l) => (
            <li key={l.kunci} aria-current={l.no === berjalan ? "step" : undefined}
              className={`flex min-w-0 flex-col gap-1.5 rounded-lg border p-3 ${KELAS_LANGKAH[l.status]}`}>
              <div className="flex items-center justify-between gap-2">
                <span aria-hidden className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-extrabold ${l.status === "selesai" ? "bg-[#1F8A4C] text-white" : l.status === "menunggu" ? "bg-[#E6EBF3] text-[#5B6B84]" : l.status === "perhatian" ? "bg-[#B8860B] text-white" : "bg-[#1F5FD1] text-white"}`}>{l.status === "selesai" ? "✓" : l.no}</span>
                <Chip warna={WARNA_LANGKAH[l.status]}>{LABEL_STATUS_LANGKAH[l.status]}</Chip>
              </div>
              <h3 className="text-[14px] font-bold text-[#0F2A52]">{l.no}. {l.judul}</h3>
              <span className="text-[11.5px] font-semibold text-[#5B6B84]">Oleh: {l.siapa}</span>
              <p className="text-[12px] leading-snug text-[#44546F]">{l.uraian}</p>
              <p className="mt-auto text-[12px] font-bold text-[#1B2B4B]" aria-live={l.no === berjalan ? "polite" : undefined}>{l.ket}</p>
            </li>
          ))}
        </ol>
      </section>
        {boleh === true && (
          <section className={`${kartu} flex flex-col gap-3`} aria-labelledby="judul-unggah">
            <h2 id="judul-unggah" className={judulKartu}>Langkah 1 sampai 4: unggah laporan baru</h2>
            <p className="text-[12.5px] text-[#5B6B84]">Berkas dibaca di perangkat Bapak/Ibu; yang dikirim hanya isi tabelnya setelah diperiksa. Satu tanggal data hanya dapat diterima satu kali.</p>
            <label htmlFor="berkas-glp" className={label}>Berkas Excel (.xlsx)</label>
            <input
              id="berkas-glp" ref={inputBerkas} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void pilih(e.target.files?.[0])}
              className="block w-full text-[13px] file:mr-3 file:min-h-[40px] file:rounded-md file:border-0 file:bg-[#1F5FD1] file:px-3 file:text-[13px] file:font-semibold file:text-white"
            />
            {membaca && <p className="text-[13px] font-bold text-[#44546F]" aria-live="polite">Membaca berkas...</p>}
            {galatBaca && <p role="alert" className="rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galatBaca}</p>}

            {b && ringkas && (
              <div className="space-y-3">
                <dl className="grid gap-x-3 gap-y-1.5 text-[12.5px] [grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))]">
                  <div><dt className="text-[#6B7A93]">Item</dt><dd className="font-extrabold text-[#0F2A52]">{angka(ringkas.nItem)} item · {angka(ringkas.nRo)} RO</dd></div>
                  <div><dt className="text-[#6B7A93]">Pagu revisi</dt><dd className="font-extrabold text-[#0F2A52]">{rupiah(ringkas.pagu)}</dd></div>
                  <div><dt className="text-[#6B7A93]">Lock pagu</dt><dd className="font-extrabold text-[#0F2A52]">{rupiah(ringkas.lock)}</dd></div>
                  <div><dt className="text-[#6B7A93]">Realisasi s.d.</dt><dd className="font-extrabold text-[#0F2A52]">{rupiah(ringkas.realisasi)}</dd></div>
                  <div><dt className="text-[#6B7A93]">Sisa anggaran</dt><dd className="font-extrabold text-[#0F2A52]">{rupiah(ringkas.sisa)}</dd></div>
                  <div><dt className="text-[#6B7A93]">Ukuran berkas</dt><dd className="font-bold text-[#0F2A52]">{angka(Math.round(b.ukuran / 1024))} KB</dd></div>
                </dl>

                {b.hasil.galat.length > 0 && (
                  <div role="alert" className="rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#7A1D22]">
                    <p className="font-extrabold">Berkas belum lolos pemeriksaan ({b.hasil.galat.length}):</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {b.hasil.galat.slice(0, 8).map((g) => <li key={g}>{g}</li>)}
                    </ul>
                    {b.hasil.galat.length > 8 && <p className="mt-1">dan {b.hasil.galat.length - 8} lainnya.</p>}
                  </div>
                )}
                {b.hasil.peringatan.length > 0 && (
                  <div className="rounded-md border-l-4 border-[#B8860B] bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#6B4E00]">
                    <ul className="list-disc space-y-0.5 pl-4">{b.hasil.peringatan.slice(0, 5).map((g) => <li key={g}>{g}</li>)}</ul>
                  </div>
                )}

                <div>
                  <label className={label} htmlFor="sampai-tanggal">Data sampai tanggal</label>
                  <input id="sampai-tanggal" type="date" className={kolom} value={sampai} onChange={(e) => setSampai(e.target.value)} />
                  <p className="text-[12px] text-[#6B7A93]">{b.hasil.judul.find((t) => /Periode/i.test(t)) ?? "Periode tidak terbaca dari judul"}. Periksa tanggalnya sebelum mengirim.</p>
                  {sudahAda && <p className="text-[12.5px] font-bold text-[#8A6200]">Sudah ada unggahan diterima untuk tanggal ini ({sudahAda.nama_berkas}). Batalkan dulu bila ingin menggantinya.</p>}
                </div>

                {b.hasil.ok && resmiPagu && (
                  <div className="flex flex-col gap-2">
                    <div className="max-w-[560px]">
                      <label className={label} htmlFor="pembanding-pagu">Langkah 3: bandingkan pagu laporan dengan</label>
                      <select id="pembanding-pagu" className={kolom} value={pembanding} onChange={(e) => setPembanding(e.target.value)}>
                        <option value="pok">POK berlaku{pokBerlaku.baris?.[0] ? ` (revisi ${pokBerlaku.baris[0].nomor_revisi})` : ""}</option>
                        {jadwalAcuan.map((j) => <option key={j.id} value={`kertas:${j.id}`}>Kertas kerja #{j.id} · {j.judul} ({j.status})</option>)}
                      </select>
                    </div>
                    <KartuCekPagu
                      hasil={cek.hasil} memuat={cek.status === "memuat"} galat={sisi.galat} terpotong={sisi.terpotong}
                      namaResmi="laporan realisasi" namaSistem={namaSistem} jadwalId={sumber.jenis === "kertas" ? sumber.jadwalId : null} namaRo={namaRo}
                    />
                  </div>
                )}

                <button type="button" onClick={() => setLihatItem((x) => !x)} className={tombolKecil}>
                  {lihatItem ? "Sembunyikan item" : "Lihat item"}
                </button>
                {lihatItem && (
                  <div className="max-h-72 overflow-auto rounded-md border border-[#DDE5F2]">
                    <table className="w-full min-w-[520px] text-left text-[12px]">
                      <thead className="sticky top-0 bg-[#EEF3FB] text-[#44546F]"><tr><th className="px-2 py-1.5">No.</th><th className="px-2 py-1.5">RO</th><th className="px-2 py-1.5">Uraian</th><th className="px-2 py-1.5 text-right">Pagu</th><th className="px-2 py-1.5 text-right">Real. s.d.</th></tr></thead>
                      <tbody>
                        {b.hasil.item.slice(0, 300).map((i) => (
                          <tr key={i.nomor_item} className="border-t border-[#EEF2F7]">
                            <td className="px-2 py-1 font-bold">{i.nomor_item}</td><td className="px-2 py-1">{i.ro_kode}</td>
                            <td className="px-2 py-1">{i.uraian}</td><td className="px-2 py-1 text-right">{angka(i.pagu)}</td><td className="px-2 py-1 text-right">{angka(i.real_sd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {salah && b.hasil.ok && <p className="text-[12.5px] font-bold text-[#8A6200]">{salah}</p>}
                <button type="button" disabled={mengirim || !!salah || !!sudahAda} onClick={() => void kirimUnggahan()} className={`${tombolUtama} w-full sm:w-auto`}>
                  {mengirim ? "Mengirim..." : "Kirim realisasi"}
                </button>
              </div>
            )}
            {galatKirim && <p role="alert" className="rounded-md border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galatKirim}</p>}
            {berhasil && <p role="status" className="rounded-md border-l-4 border-[#1F8A4C] bg-[#E6F6EC] px-3 py-2 text-[13px] font-bold text-[#14653A]">{berhasil}</p>}
          </section>
        )}
        {boleh === false && <Catatan>Mengunggah realisasi hanya untuk bendahara. Halaman ini menampilkan daftar unggahan untuk dilihat.</Catatan>}

        <section aria-labelledby="judul-daftar" className={`${kartu} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="judul-daftar" className={judulKartu}>Unggahan realisasi</h2>
            {terbaru && <Chip warna="hijau">Penyerapan terakhir: {rupiah(terbaru.total_sd)} dari pagu {rupiah(terbaru.total_pagu)} ({persen(Number(terbaru.total_sd), Number(terbaru.total_pagu))})</Chip>}
          </div>
          <Galat pesan={daftar.galat} />
          {daftar.memuat && <Memuat tinggi="h-24" />}
          {daftar.baris && daftar.baris.length === 0 && <p className="text-[13px] text-[#5B6B84]">Belum ada realisasi yang diunggah.</p>}
          {(daftar.baris ?? []).length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[#DCE3EE]">
              <table className="w-full min-w-[860px] text-left text-[12.5px]">
                <thead className="bg-[#EEF3FB] text-[#44546F]">
                  <tr><th className="px-2.5 py-2">Data s.d.</th><th className="px-2.5 py-2">Berkas</th><th className="px-2.5 py-2">Diunggah</th><th className="px-2.5 py-2 text-right">Item</th><th className="px-2.5 py-2 text-right">Realisasi kumulatif</th><th className="px-2.5 py-2">Penyerapan</th><th className="px-2.5 py-2">Hasil</th><th className="px-2.5 py-2">Aksi</th></tr>
                </thead>
                <tbody>
                  {(daftar.baris ?? []).map((u) => {
                    const lebar = Number(u.total_pagu) > 0 ? Math.min(100, (Number(u.total_sd) / Number(u.total_pagu)) * 100) : 0;
                    return (
                      <tr key={u.id} className={`border-t border-[#EEF2F7] align-top ${u.status === "diterima" ? "" : "opacity-70"}`}>
                        <td className="whitespace-nowrap px-2.5 py-2 font-semibold text-[#0F2A52]">{tgl(u.sampai_tanggal)}</td>
                        <td className="break-words px-2.5 py-2 text-[#5B6B84]">{u.nama_berkas}{u.status !== "diterima" && u.alasan_batal && <div className="mt-0.5 text-[#7A1D22]">Alasan batal: {u.alasan_batal}</div>}</td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-[#5B6B84]">{tgl(u.dibuat_at)}</td>
                        <td className="px-2.5 py-2 text-right">{angka(u.n_item)}</td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-right font-semibold text-[#0F2A52]">{rupiah(u.total_sd)}</td>
                        <td className="min-w-[110px] px-2.5 py-2"><div className="h-1.5 overflow-hidden rounded-[3px] bg-[#E6EBF3]" aria-hidden><i className="block h-full bg-[#1F5FD1]" style={{ width: `${lebar}%` }} /></div><span className="text-[11.5px] text-[#5B6B84]">{persen(Number(u.total_sd), Number(u.total_pagu))} dari pagu {rupiah(u.total_pagu)}</span></td>
                        <td className="px-2.5 py-2"><Chip warna={u.status === "diterima" ? "hijau" : "abu"}>{u.status === "diterima" ? "Diterima" : "Dibatalkan"}</Chip></td>
                        <td className="px-2.5 py-2">
                          {boleh === true && u.status === "diterima" && (
                            batal?.id === u.id ? (
                              <div className="flex min-w-[220px] flex-col gap-2">
                                <label className={label} htmlFor={`alasan-${u.id}`}>Alasan pembatalan (minimal 5 huruf)</label>
                                <textarea id={`alasan-${u.id}`} rows={2} maxLength={300} className={`${kolom} py-2`} value={batal.alasan} onChange={(e) => setBatal({ id: u.id, alasan: e.target.value })} />
                                <div className="flex gap-2">
                                  <button type="button" disabled={mengirim || batal.alasan.trim().length < 5} className={tombolBahaya} onClick={async () => { if (await kirim("keu_realisasi_batalkan", { p_unggah: u.id, p_alasan: batal.alasan.trim() })) setBatal(null); }}>Batalkan unggahan</button>
                                  <button type="button" className={tombolKecil} onClick={() => setBatal(null)}>Kembali</button>
                                </div>
                              </div>
                            ) : (
                              <button type="button" className={tombolBahaya} onClick={() => { hapusGalat(); setBatal({ id: u.id, alasan: "" }); }}>Batalkan</button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[12px] text-[#5B6B84]">Setiap baris Excel dicocokkan ke POK (RO, komponen, akun, uraian). Angka kumulatif per RO dan per akun dipakai tab Anggaran, tab Administrasi, dan skor RAB. Satu tanggal data hanya dapat diterima satu kali.</p>
        </section>

      <section aria-labelledby="judul-dampak" className={`${kartu} flex flex-col gap-2`}>
        <h2 id="judul-dampak" className={judulKartu}>Langkah 5: setelah diterima, angka ini dipakai di</h2>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-[#1B2B4B]">
          <li><Link href="/sigap/ro" className="font-semibold text-[#1F5FD1] underline">Tab Anggaran per RO</Link>: realisasi tiap item, akun, dan komponen.</li>
          <li><Link href="/sigap/revisi/kertas" className="font-semibold text-[#1F5FD1] underline">Kertas kerja revisi</Link>: batas R-06 (pagu Menjadi tidak boleh di bawah realisasi) dan kolom Realisasi.</li>
          <li>Peringatan SPAN (realisasi tanpa RAB, melebihi RAB, atau jatuh di bulan yang tidak terjadwal) dan skor kualitas RAB di bagian bawah halaman ini.</li>
        </ul>
        <p className="text-[12px] text-[#5B6B84]">Pagu pada laporan juga menjadi alat cek: bila pagu suatu akun berbeda dari POK, langkah 3 menampilkan peringatan dan tautan ke kertas kerja RO yang bersangkutan.</p>
      </section>

      <BagianSkor />
    </HalamanKeu>
  );
}
