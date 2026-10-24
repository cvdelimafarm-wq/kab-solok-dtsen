"use client";

// app/sigap/realisasi/page.tsx
//
// (24 Okt 2026) Realisasi anggaran: bendahara mengunggah Excel Laporan Ketersediaan Dana Detail (GLP039). Berkas dibaca DI PERAMBAN
// (lib/keu/glp039.ts, tanpa unggah ke server), diperiksa (identitas s.d. dan sisa, jumlah akun, jumlah total), diperlihatkan sebagai
// pratinjau, lalu dikirim sebagai JSON ke keu_realisasi_masuk lewat gerbang. Hak (kewenangan `realisasi`) ditegakkan basis data;
// tombol hanya tampil bila akun berwenang. Semua pegawai organik boleh melihat daftar unggahan.

import { useCallback, useMemo, useRef, useState } from "react";
import TombolKembali from "@/app/components/TombolKembali";
import { argsRealisasiMasuk, bacaBerkasGlp, periksaUnggahan, type HasilBerkas } from "@/lib/keu/glp039-xlsx";
import { angka, rupiah, urlBaca } from "@/lib/keu/ro";
import { aksiKeu, useBacaKeu, useBoleh, useKirim } from "../ro/useKeu";

const kartu = "rounded-[20px] bg-white p-4 shadow-[0_4px_16px_rgba(15,42,82,0.08)]";
const kolom = "box-border min-h-[44px] w-full rounded-[12px] border-[1.5px] border-[#C5D0E2] bg-[#F8FBFF] px-3 text-[14px] font-semibold text-[#0F2A52]";
const label = "mb-1 block text-[12px] font-bold text-[#44546F]";
const tombol = "min-h-[44px] rounded-[12px] px-4 text-[13.5px] font-extrabold disabled:opacity-50";

type Unggah = {
  id: number; tahun: number; sampai_tanggal: string; nama_berkas: string; n_item: number | string; total_pagu: number | string;
  total_lock: number | string; total_sd: number | string; status: string; alasan_batal: string | null; dibuat_at: string;
};
type RingkasRo = { ro_kode: string; sampai_tanggal: string; n_item: number | string; pagu: number | string; real_sd: number | string; persen: number | string | null };

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

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-12 text-[#1B2B4B]">
      <header className="relative overflow-hidden bg-[linear-gradient(165deg,#1A4590_0%,#0F2A52_100%)] px-5 pb-16 pt-5 text-white">
        <div aria-hidden className="absolute -right-24 -top-28 h-60 w-60 rounded-full bg-white/[0.06]" />
        <div className="relative mx-auto flex max-w-xl items-center gap-2">
          <TombolKembali tema="gelap" className="max-w-[40%] flex-none" />
          <span className="truncate text-[12.5px] font-bold text-[#D3E0F5]">Kertas Kerja Revisi POK</span>
        </div>
        <h1 className="relative mx-auto mt-3 max-w-xl text-[20px] font-extrabold leading-tight tracking-[-0.3px]">Realisasi Anggaran</h1>
        <p className="relative mx-auto mt-1.5 max-w-xl text-[12.5px] text-[#A9BCD8]">Unggah Excel Laporan Ketersediaan Dana Detail (GLP039) dari SAKTI.</p>
      </header>

      <div className="relative z-10 mx-auto -mt-10 max-w-xl space-y-3 px-3.5">
        {boleh === true && (
          <section className={kartu} aria-labelledby="judul-unggah">
            <h2 id="judul-unggah" className="text-[15px] font-extrabold text-[#0F2A52]">Unggah laporan baru</h2>
            <p className="mt-1 text-[12.5px] text-[#5B6B84]">Berkas dibaca di perangkat Bapak/Ibu; yang dikirim hanya isi tabelnya setelah diperiksa. Satu tanggal data hanya dapat diterima satu kali.</p>
            <label htmlFor="berkas-glp" className={`${label} mt-3`}>Berkas Excel (.xlsx)</label>
            <input
              id="berkas-glp" ref={inputBerkas} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => void pilih(e.target.files?.[0])}
              className="block w-full text-[13px] file:mr-3 file:min-h-[44px] file:rounded-[12px] file:border-0 file:bg-[#1F5FD1] file:px-4 file:text-[13.5px] file:font-extrabold file:text-white"
            />
            {membaca && <p className="mt-2 text-[13px] font-bold text-[#44546F]" aria-live="polite">Membaca berkas...</p>}
            {galatBaca && <p role="alert" className="mt-2 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galatBaca}</p>}

            {b && ringkas && (
              <div className="mt-3 space-y-3">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
                  <div><dt className="text-[#6B7A93]">Item</dt><dd className="font-extrabold text-[#0F2A52]">{angka(ringkas.nItem)} item · {angka(ringkas.nRo)} RO</dd></div>
                  <div><dt className="text-[#6B7A93]">Pagu revisi</dt><dd className="font-extrabold text-[#0F2A52]">{rupiah(ringkas.pagu)}</dd></div>
                  <div><dt className="text-[#6B7A93]">Lock pagu</dt><dd className="font-extrabold text-[#0F2A52]">{rupiah(ringkas.lock)}</dd></div>
                  <div><dt className="text-[#6B7A93]">Realisasi s.d.</dt><dd className="font-extrabold text-[#0F2A52]">{rupiah(ringkas.realisasi)}</dd></div>
                  <div><dt className="text-[#6B7A93]">Sisa anggaran</dt><dd className="font-extrabold text-[#0F2A52]">{rupiah(ringkas.sisa)}</dd></div>
                  <div><dt className="text-[#6B7A93]">Ukuran berkas</dt><dd className="font-bold text-[#0F2A52]">{angka(Math.round(b.ukuran / 1024))} KB</dd></div>
                </dl>

                {b.hasil.galat.length > 0 && (
                  <div role="alert" className="rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[12.5px] text-[#7A1D22]">
                    <p className="font-extrabold">Berkas belum lolos pemeriksaan ({b.hasil.galat.length}):</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {b.hasil.galat.slice(0, 8).map((g) => <li key={g}>{g}</li>)}
                    </ul>
                    {b.hasil.galat.length > 8 && <p className="mt-1">dan {b.hasil.galat.length - 8} lainnya.</p>}
                  </div>
                )}
                {b.hasil.peringatan.length > 0 && (
                  <div className="rounded-[12px] border-l-4 border-[#B8860B] bg-[#FFF4D6] px-3 py-2 text-[12.5px] text-[#6B4E00]">
                    <ul className="list-disc space-y-0.5 pl-4">{b.hasil.peringatan.slice(0, 5).map((g) => <li key={g}>{g}</li>)}</ul>
                  </div>
                )}

                <div>
                  <label className={label} htmlFor="sampai-tanggal">Data sampai tanggal</label>
                  <input id="sampai-tanggal" type="date" className={kolom} value={sampai} onChange={(e) => setSampai(e.target.value)} />
                  <p className="mt-1 text-[12px] text-[#6B7A93]">{b.hasil.judul.find((t) => /Periode/i.test(t)) ?? "Periode tidak terbaca dari judul"}. Periksa tanggalnya sebelum mengirim.</p>
                  {sudahAda && <p className="mt-1 text-[12.5px] font-bold text-[#8A6200]">Sudah ada unggahan diterima untuk tanggal ini ({sudahAda.nama_berkas}). Batalkan dulu bila ingin menggantinya.</p>}
                </div>

                <button type="button" onClick={() => setLihatItem((x) => !x)} className={`${tombol} border-[1.5px] border-[#C5D0E2] bg-white text-[#0F2A52]`}>
                  {lihatItem ? "Sembunyikan item" : "Lihat item"}
                </button>
                {lihatItem && (
                  <div className="max-h-72 overflow-auto rounded-[12px] border border-[#DDE5F2]">
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
                <button type="button" disabled={mengirim || !!salah || !!sudahAda} onClick={() => void kirimUnggahan()} className={`${tombol} w-full bg-[#1F5FD1] text-white`}>
                  {mengirim ? "Mengirim..." : "Kirim realisasi"}
                </button>
              </div>
            )}
            {galatKirim && <p role="alert" className="mt-3 rounded-[12px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{galatKirim}</p>}
            {berhasil && <p role="status" className="mt-3 rounded-[12px] border-l-4 border-[#1F8A4C] bg-[#E6F6EC] px-3 py-2 text-[13px] font-bold text-[#14653A]">{berhasil}</p>}
          </section>
        )}
        {boleh === false && <p className={`${kartu} text-[13px] text-[#44546F]`}>Mengunggah realisasi hanya untuk bendahara. Halaman ini menampilkan daftar unggahan untuk dilihat.</p>}

        <section aria-labelledby="judul-daftar" className="space-y-2.5">
          <h2 id="judul-daftar" className="px-1 text-[14px] font-extrabold text-[#0F2A52]">Unggahan realisasi</h2>
          {daftar.galat && <p className="rounded-[14px] border-l-4 border-[#B42329] bg-[#FDE8E8] px-3 py-2 text-[13px] text-[#7A1D22]">{daftar.galat}</p>}
          {daftar.memuat && <div className="h-24 animate-pulse rounded-[20px] bg-white" aria-busy="true" />}
          {daftar.baris && daftar.baris.length === 0 && <p className={`${kartu} text-[13px] text-[#5B6B84]`}>Belum ada realisasi yang diunggah.</p>}
          {(daftar.baris ?? []).map((u) => (
            <article key={u.id} className={`${kartu} ${u.status === "diterima" ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-extrabold text-[#0F2A52]">s.d. {tgl(u.sampai_tanggal)}</p>
                  <p className="break-words text-[12px] text-[#6B7A93]">{u.nama_berkas}</p>
                </div>
                <span className={`flex-none rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ${u.status === "diterima" ? "bg-[#E6F6EC] text-[#14653A]" : "bg-[#EEF2F7] text-[#44546F]"}`}>{u.status === "diterima" ? "Diterima" : "Dibatalkan"}</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
                <div><dt className="text-[#6B7A93]">Item</dt><dd className="font-bold text-[#0F2A52]">{angka(u.n_item)}</dd></div>
                <div><dt className="text-[#6B7A93]">Pagu</dt><dd className="font-bold text-[#0F2A52]">{rupiah(u.total_pagu)}</dd></div>
                <div><dt className="text-[#6B7A93]">Realisasi s.d.</dt><dd className="font-bold text-[#0F2A52]">{rupiah(u.total_sd)}</dd></div>
                <div><dt className="text-[#6B7A93]">Lock pagu</dt><dd className="font-bold text-[#0F2A52]">{rupiah(u.total_lock)}</dd></div>
              </dl>
              {u.status !== "diterima" && u.alasan_batal && <p className="mt-2 text-[12.5px] text-[#5B6B84]">Alasan batal: {u.alasan_batal}</p>}
              {boleh === true && u.status === "diterima" && (
                batal?.id === u.id ? (
                  <div className="mt-3 space-y-2">
                    <label className={label} htmlFor={`alasan-${u.id}`}>Alasan pembatalan (minimal 5 huruf)</label>
                    <textarea id={`alasan-${u.id}`} rows={2} maxLength={300} className={`${kolom} py-2`} value={batal.alasan} onChange={(e) => setBatal({ id: u.id, alasan: e.target.value })} />
                    <div className="flex gap-2">
                      <button type="button" disabled={mengirim || batal.alasan.trim().length < 5} className={`${tombol} bg-[#B42329] text-white`} onClick={async () => { if (await kirim("keu_realisasi_batalkan", { p_unggah: u.id, p_alasan: batal.alasan.trim() })) setBatal(null); }}>Batalkan unggahan</button>
                      <button type="button" className={`${tombol} border-[1.5px] border-[#C5D0E2] bg-white text-[#0F2A52]`} onClick={() => setBatal(null)}>Kembali</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className={`${tombol} mt-3 border-[1.5px] border-[#C5D0E2] bg-white text-[#7A1D22]`} onClick={() => { hapusGalat(); setBatal({ id: u.id, alasan: "" }); }}>Batalkan unggahan</button>
                )
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
