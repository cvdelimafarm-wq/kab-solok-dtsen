"use client";

// app/sigap/kelola/arsip/PaketPbj.tsx
//
// (7 Nov 2026) Kartu "Nomor dokumen pengadaan barang/jasa (satu paket)" di tab Ambil / catat nomor.
// Satu urutan per tahun untuk seluruh dokumen pengadaan (PPK, Pejabat Pengadaan, penyedia), pola NNN/PPK-BPSKAB/SOLOK/K/tahun.
// Nomor diambil berurutan sesuai urutan dokumen pada jadwal pekerjaan. Idempoten per nama paket + dokumen: menekan lagi tidak menambah nomor.

import { useMemo, useState } from "react";
import { pesanGalat, SesiBerakhir } from "../../admin/api";
import { BTN, BTN_O, INPUT, Kartu, Pesan, TD, TH, TabelKartu } from "../../admin/ui";
import { DAFTAR_PBJ } from "@/lib/arsip/pbj";
import { aksiA, hariIniWib } from "./api";

type Hasil = { kode: string; nama: string; nomor: string; sudah_ada: boolean };

export default function PaketPbj({ onUbah }: { onUbah: () => void }) {
  const [paket, setPaket] = useState("");
  const [tanggalDasar, setTanggalDasar] = useState(hariIniWib());
  const [baris, setBaris] = useState<Record<string, { pilih: boolean; tanggal: string }>>(() => Object.fromEntries(DAFTAR_PBJ.map((b) => [b.kode, { pilih: b.bernomorBawaan, tanggal: hariIniWib() }])));
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil[] | null>(null);
  const [tersalin, setTersalin] = useState(false);

  const dipilih = useMemo(() => DAFTAR_PBJ.filter((b) => baris[b.kode]?.pilih), [baris]);
  const siap = paket.trim().length >= 5 && dipilih.length > 0 && dipilih.every((b) => /^\d{4}-\d{2}-\d{2}$/.test(baris[b.kode].tanggal));

  function samakanTanggal() {
    setBaris((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, tanggal: tanggalDasar }])));
  }

  async function ambil() {
    setSibuk(true);
    setGalat(null);
    setHasil(null);
    try {
      const r = await aksiA<{ hasil: Hasil[] }>("ambil_paket", { paket: paket.trim(), butir: dipilih.map((b) => ({ kode: b.kode, tanggal: baris[b.kode].tanggal })) });
      setHasil(r.hasil);
      setTersalin(false);
      onUbah();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
      onUbah();
    } finally {
      setSibuk(false);
    }
  }

  async function salin() {
    if (!hasil) return;
    try { await navigator.clipboard.writeText(hasil.map((h) => `${h.nama}\t${h.nomor}`).join("\n")); setTersalin(true); } catch { setTersalin(false); }
  }

  return (
    <Kartu judul="Nomor dokumen pengadaan barang/jasa (satu paket)" ket="Pola NNN/PPK-BPSKAB/SOLOK/K/tahun. Satu urutan per tahun untuk semua dokumen pengadaan; nomor diambil berurutan sesuai jadwal pekerjaan.">
      {galat && <div className="mb-3"><Pesan onTutup={() => setGalat(null)}>{galat}</Pesan></div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-0.5 text-[12px] font-bold text-[#5B6B84] sm:col-span-2">Nama paket pengadaan *
          <input className={INPUT} value={paket} maxLength={120} placeholder="mis. Paket Meeting Susenas September dan Seruti Triwulan III 2026" onChange={(e) => setPaket(e.target.value)} />
        </label>
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-0.5 text-[12px] font-bold text-[#5B6B84]">Tanggal untuk semua
            <input type="date" className={INPUT} value={tanggalDasar} onChange={(e) => setTanggalDasar(e.target.value)} />
          </label>
          <button type="button" className={BTN_O} onClick={samakanTanggal}>Samakan</button>
        </div>
      </div>
      <div className="mt-3">
        <TabelKartu>
          <thead><tr><th className={TH}>Ambil</th><th className={TH}>Dokumen</th><th className={TH}>Pelaksana</th><th className={TH}>Tanggal</th></tr></thead>
          <tbody>
            {DAFTAR_PBJ.map((b, i) => (
              <tr key={b.kode}>
                <td className={TD}><input type="checkbox" aria-label={`Ambil nomor ${b.nama}`} checked={baris[b.kode].pilih} onChange={(e) => setBaris((p) => ({ ...p, [b.kode]: { ...p[b.kode], pilih: e.target.checked } }))} /></td>
                <td className={TD}><span className="text-[#5B6B84]">{i + 1}.</span> {b.nama}</td>
                <td className={TD}>{b.pelaksana}</td>
                <td className={TD}><input type="date" className={INPUT} value={baris[b.kode].tanggal} onChange={(e) => setBaris((p) => ({ ...p, [b.kode]: { ...p[b.kode], tanggal: e.target.value } }))} /></td>
              </tr>
            ))}
          </tbody>
        </TabelKartu>
      </div>
      <p className="mb-0 mt-2 text-[12px] text-[#5B6B84]">
        Nama paket yang sama dan dokumen yang sama selalu mendapat nomor yang sama, jadi aman ditekan ulang. Bila nomor paket sebelumnya belum tercatat di buku, atur dulu &quot;nomor terakhir&quot; register Pengadaan barang/jasa di tab Pengaturan.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={BTN} disabled={!siap || sibuk} onClick={() => void ambil()}>{sibuk ? "Mengambil…" : `Ambil ${dipilih.length} nomor`}</button>
      </div>
      {hasil && (
        <div className="mt-3 rounded-lg border border-[#BFE3CF] bg-[#F1FAF5] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-[12.5px] font-bold text-[#0F6340]">{hasil.filter((h) => !h.sudah_ada).length} nomor baru, {hasil.filter((h) => h.sudah_ada).length} sudah ada sebelumnya</p>
            <button type="button" className={BTN_O} onClick={() => void salin()}>{tersalin ? "Tersalin" : "Salin semua"}</button>
          </div>
          <TabelKartu>
            <thead><tr><th className={TH}>Dokumen</th><th className={TH}>Nomor</th></tr></thead>
            <tbody>{hasil.map((h) => <tr key={h.kode}><td className={TD}>{h.nama}</td><td className={`${TD} whitespace-nowrap font-mono font-semibold`}>{h.nomor}</td></tr>)}</tbody>
          </TabelKartu>
        </div>
      )}
    </Kartu>
  );
}
