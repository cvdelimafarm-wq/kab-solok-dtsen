"use client";

// app/sigap/delego/ketersediaan/page.tsx
//
// (1 Nov 2026) Ketersediaan: cuti, izin, sakit, dinas luar. Pegawai mengajukan untuk diri sendiri (menunggu persetujuan Ketua Tim); pemberi delegasi mencatat langsung
// untuk siapa pun (langsung disetujui) dan memutuskan pengajuan. Yang disetujui mengurangi kapasitas harian di matriks beban.

import { useMemo, useState } from "react";
import { tambahHari, tglPendek } from "@/lib/delego/hitung";
import type { JenisKetersediaan, Ketersediaan } from "@/lib/delego/tipe";
import { aksiKeu, useKirim, useRekap } from "../data";
import { useKonteksDelego } from "../konteks";
import { KELAS } from "../merek";
import type { Nada } from "../merek";
import { Galat, Halaman, Info, Kartu, Kosong, Lencana, Medan, Memuat } from "../ui";

const NAMA: Record<JenisKetersediaan, string> = { cuti: "Cuti", izin: "Izin", sakit: "Sakit", dinas_luar: "Dinas luar", lainnya: "Lainnya" };
const NADA: Record<Ketersediaan["status"], Nada> = { diajukan: "biru", disetujui: "hijau", ditolak: "merah" };
const TEKS: Record<Ketersediaan["status"], string> = { diajukan: "Menunggu persetujuan", disetujui: "Disetujui", ditolak: "Ditolak" };

export default function KetersediaanHalaman() {
  const { hari, pemberi, hak } = useKonteksDelego();
  const dari = tambahHari(hari, -14);
  const sampai = tambahHari(hari, 48);
  const rekap = useRekap(dari, sampai);
  const kirim = useKirim(rekap.muat);
  const [akun, setAkun] = useState("");
  const [jenis, setJenis] = useState<JenisKetersediaan>("cuti");
  const [mulai, setMulai] = useState(hari);
  const [selesai, setSelesai] = useState(hari);
  const [setengah, setSetengah] = useState(false);
  const [catatan, setCatatan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const nama = useMemo(() => {
    const o = new Map<number, string>();
    for (const x of rekap.data?.orang ?? []) o.set(x.akun, x.nama);
    return o;
  }, [rekap.data]);
  const daftar = useMemo(() => [...(rekap.data?.ketersediaan ?? [])].sort((a, b) => (a.mulai < b.mulai ? 1 : -1)), [rekap.data]);
  const menunggu = daftar.filter((k) => k.status === "diajukan");
  const lain = daftar.filter((k) => k.status !== "diajukan");
  const satuHari = mulai === selesai;

  async function kirimForm() {
    setMengirim(true);
    setGalat(null);
    setOk(null);
    const r = await aksiKeu<{ status: string }>("keu_dlg_ketersediaan_catat", {
      p_data: { ...(akun ? { akun: Number(akun) } : {}), jenis, mulai, selesai, fraksi: satuHari && setengah ? 0.5 : 1, catatan: catatan.trim() },
    });
    setMengirim(false);
    if (!r.ok) {
      setGalat(r.pesan);
      return;
    }
    setOk(r.data.status === "disetujui" ? "Tercatat dan langsung berlaku." : "Pengajuan terkirim. Ketua Tim akan memutuskan.");
    setCatatan("");
    await rekap.muat();
  }

  const baris = (k: Ketersediaan) => (
    <li key={k.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
      <div className="min-w-0">
        <div className="text-[14px] font-semibold">
          {nama.get(k.akun) ?? `Akun ${k.akun}`} · {NAMA[k.jenis]}
          {angkaFraksi(k.fraksi) < 1 ? " (setengah hari)" : ""}
        </div>
        <div className="text-[12.5px] text-[#3B4A57]">
          {tglPendek(k.mulai)}
          {k.selesai !== k.mulai ? ` sampai ${tglPendek(k.selesai)}` : ""}
          {k.catatan ? ` · ${k.catatan}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Lencana nada={NADA[k.status]}>{TEKS[k.status]}</Lencana>
        {pemberi && k.status === "diajukan" && (
          <>
            <button type="button" className={KELAS.tombolKecilUtama} disabled={kirim.mengirim} onClick={() => void kirim.kirim("keu_dlg_ketersediaan_putus", { p_id: k.id, p_putusan: "setuju" })}>Setujui</button>
            <button type="button" className={KELAS.tombolKecil} disabled={kirim.mengirim} onClick={() => void kirim.kirim("keu_dlg_ketersediaan_putus", { p_id: k.id, p_putusan: "tolak" })}>Tolak</button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <Halaman judul="Ketersediaan" sub="Cuti, izin, sakit, dan dinas luar. Yang disetujui mengurangi kapasitas harian di matriks beban.">
      {rekap.memuat && !rekap.data && <Memuat />}
      {rekap.galat && !rekap.data && <Galat>{rekap.galat}</Galat>}
      {kirim.galat && <Galat>{kirim.galat}</Galat>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          {pemberi && menunggu.length > 0 && (
            <Kartu judul={`Menunggu keputusan Anda (${menunggu.length})`}>
              <ul className="m-0 list-none divide-y divide-[#EEF1F4] p-0">{menunggu.map(baris)}</ul>
            </Kartu>
          )}
          <Kartu judul="Daftar (2 pekan lalu sampai 7 pekan ke depan)">
            {daftar.length === 0 ? <Kosong>Belum ada catatan ketersediaan pada rentang ini.</Kosong> : <ul className="m-0 list-none divide-y divide-[#EEF1F4] p-0">{(pemberi ? lain : daftar).map(baris)}</ul>}
          </Kartu>
        </div>
        <Kartu judul={pemberi ? "Catat ketersediaan" : "Ajukan ketidakhadiran"}>
          <div className="space-y-3">
            {pemberi && (
              <Medan label="Pegawai" bantu="Dicatat langsung berlaku. Kosongkan untuk diri sendiri.">
                <select className={KELAS.isian} value={akun} onChange={(e) => setAkun(e.target.value)}>
                  <option value="">{hak.akun.nama} (saya)</option>
                  {(rekap.data?.orang ?? []).filter((o) => o.akun !== hak.akun.id && o.jenis === "organik").map((o) => (
                    <option key={o.akun} value={o.akun}>{o.nama}</option>
                  ))}
                </select>
              </Medan>
            )}
            <Medan label="Jenis">
              <select className={KELAS.isian} value={jenis} onChange={(e) => setJenis(e.target.value as JenisKetersediaan)}>
                {(Object.keys(NAMA) as JenisKetersediaan[]).map((j) => <option key={j} value={j}>{NAMA[j]}</option>)}
              </select>
            </Medan>
            <div className="grid grid-cols-2 gap-3">
              <Medan label="Mulai"><input type="date" className={KELAS.isian} value={mulai} onChange={(e) => { setMulai(e.target.value); if (selesai < e.target.value) setSelesai(e.target.value); }} /></Medan>
              <Medan label="Sampai"><input type="date" className={KELAS.isian} min={mulai} value={selesai} onChange={(e) => setSelesai(e.target.value)} /></Medan>
            </div>
            {satuHari && (
              <label className="flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" checked={setengah} onChange={(e) => setSetengah(e.target.checked)} /> Setengah hari saja
              </label>
            )}
            <Medan label="Catatan (opsional)"><input className={KELAS.isian} maxLength={200} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></Medan>
            {galat && <Galat>{galat}</Galat>}
            {ok && <Info>{ok}</Info>}
            <button type="button" className={`${KELAS.tombolUtama} w-full`} disabled={mengirim || !mulai || !selesai || selesai < mulai} onClick={() => void kirimForm()}>
              {mengirim ? "Mengirim..." : pemberi ? "Catat" : "Ajukan"}
            </button>
            <p className="m-0 text-[12.5px] text-[#3B4A57]">Paling lama 120 hari per catatan. Hari libur dan akhir pekan tidak menambah pengurangan kapasitas.</p>
          </div>
        </Kartu>
      </div>
    </Halaman>
  );
}

function angkaFraksi(x: string | number): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 1;
}
