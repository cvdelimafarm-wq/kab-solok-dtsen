"use client";

// app/sigap/foto/HasilFoto.tsx
//
// (27 Okt 2026) Layar hasil satu foto yang SUDAH terkirim: kode, tingkat kepercayaan, WhatsApp/Story, dan "Bagikan ke rekan?".
// Dulu tampil di layar pratinjau setelah menunggu server; kini foto dikirim di latar belakang, jadi layar ini dibuka dari kartu "Foto n terkirim"
// di atas kamera (sebagai lembar bawah) dan tidak mengganggu foto berikutnya yang sedang dipotret.

import { useState } from "react";
import BagikanFoto, { type TagPilihan } from "./BagikanFoto";
import BagikanWa from "./BagikanWa";
import { ambilJson, type GalatFoto } from "./klien";
import { LABEL_ALASAN, LABEL_KEPERCAYAAN, MAKS_TAG, labelFotoTanpaSinyal, type Kepercayaan } from "@/lib/sigapFoto";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";

export type DataHasil = {
  ok: true;
  sudah?: boolean;
  foto: { id: number; kode: string; kepercayaan: Kepercayaan; alasan: string[]; diambil_at?: string; diterima_at?: string | null };
  penempatan: { ok?: boolean; status?: string; error?: string } | null;
  ditahan: boolean;
  jumlah_tag: number;
};

export default function HasilFoto({
  hasil, nomor, judulNomor, tagAwal, kegiatanId, jumlahNomor, namaKegiatan, onTutup,
}: {
  hasil: DataHasil;
  nomor: number | null;
  /** mis. "Foto 2 · Tampak depan" (null = cadangan) */
  judulNomor: string | null;
  /** rekan yang sudah ditandai saat Kirim (tidak diajak dua kali) */
  tagAwal: TagPilihan[];
  kegiatanId: number;
  jumlahNomor: number;
  namaKegiatan: string;
  onTutup: () => void;
}) {
  const [bagiLangkah, setBagiLangkah] = useState<"tanya" | "pilih">("tanya");
  const [tagBagi, setTagBagi] = useState<TagPilihan[]>([]);
  const [sibukBagi, setSibukBagi] = useState(false);
  const [pesanBagi, setPesanBagi] = useState<string | null>(null);
  const [bagiN, setBagiN] = useState<number | null>(null); // jumlah rekan yang sudah diajak (null = belum membagikan)
  useTutupDenganBack(true, onTutup); // (29 Okt 2026) Back HP = "Tutup, lanjut memotret"

  /** Foto sudah terkirim: ajak rekan yang dipilih (foto tidak dikirim ulang; rekan memilih nomor fotonya sendiri). */
  async function bagiKeRekan() {
    if (tagBagi.length === 0 || sibukBagi) return;
    setSibukBagi(true);
    setPesanBagi(null);
    try {
      const r = await ambilJson<{ ok: boolean; simulasi?: boolean; ditambah?: number }>("/api/sigap/foto/tag", {
        method: "POST",
        body: { foto_id: hasil.foto.id, tag: tagBagi.map((t) => ({ akun_id: t.akun_id, slot_usulan: t.slot_usulan })) },
      });
      if (r.simulasi) setPesanBagi("Mode simulasi (masuk sebagai akun lain): ajakan TIDAK dikirim.");
      else setBagiN(r.ditambah ?? 0);
    } catch (e) {
      const g = e as GalatFoto;
      setPesanBagi(g.message === "SESI_BERAKHIR" ? "Sesi berakhir. Masuk kembali, lalu bagikan lewat Foto saya." : g.message);
    } finally {
      setSibukBagi(false);
    }
  }

  const sisaTag = MAKS_TAG - tagAwal.length;
  const tutup = (
    <button type="button" onClick={onTutup} className="min-h-[52px] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white">Tutup, lanjut memotret</button>
  );
  const tanpaSinyal = labelFotoTanpaSinyal(hasil.foto.alasan, hasil.foto.diambil_at, hasil.foto.diterima_at);

  return (
    <div className="fixed inset-0 z-[10040] flex items-end justify-center bg-black/40" role="presentation" onClick={onTutup}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Hasil foto terkirim"
        className="flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-[#F3F6FC] p-3 pb-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2 rounded-xl border border-[#C9D3E6] bg-white p-3">
          <div className="text-sm font-extrabold text-[#1E8E4E]">✓ {judulNomor ? `${judulNomor} sudah terkirim` : "Foto sudah terkirim"}</div>
          <div className="text-sm font-bold text-[#0F2A52]">Kode {hasil.foto.kode}</div>
          <div className="text-xs text-[#3C4C68]">Tingkat kepercayaan: <b>{LABEL_KEPERCAYAAN[hasil.foto.kepercayaan]}</b></div>
          {tanpaSinyal && <div className="text-xs font-semibold text-[#5E4300]">{tanpaSinyal}</div>}
          {hasil.foto.alasan.length > 0 && <ul className="list-disc pl-5 text-xs text-[#3C4C68]">{hasil.foto.alasan.map((a) => <li key={a}>{LABEL_ALASAN[a] ?? a}</li>)}</ul>}
          {hasil.ditahan && (
            <div className="text-xs font-semibold text-[#8A6200]">
              {hasil.penempatan?.status === "ditahan" && nomor !== null && judulNomor
                ? `Foto ini sudah ditandai untuk ${judulNomor}. Nomornya tercatat resmi setelah PML atau admin memeriksa.`
                : "Foto ditahan sampai PML atau admin memeriksa. Belum tercatat di nomor foto."}
            </div>
          )}
          {hasil.penempatan && hasil.penempatan.ok === false && <div className="text-xs text-[#9B1C23]">Belum masuk nomor foto: {hasil.penempatan.error}</div>}
          <p className="text-[11.5px] leading-snug text-[#55657D]">Salah nomor? Buka kartu hari (atau menu perbaikan), lalu ketuk dua foto untuk menukar urutannya.</p>
        </div>

        <BagikanWa fotoId={hasil.foto.id} kode={hasil.foto.kode} diambil_at={hasil.foto.diambil_at ?? null} kegiatan={namaKegiatan} />

        {bagiN !== null ? (
          <>
            <div role="status" className="rounded-xl bg-[#E3F6EC] px-3 py-2.5 text-sm font-semibold text-[#0B6B3F]">
              {bagiN > 0 ? `Ajakan terkirim ke ${bagiN} rekan. Mereka memilih nomor fotonya sendiri.` : "Semua rekan yang dipilih sudah pernah diajak."}
            </div>
            {tutup}
          </>
        ) : sisaTag <= 0 ? (
          tutup
        ) : bagiLangkah === "tanya" ? (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-[#0F2A52] bg-[#F4F7FC] p-3" role="group" aria-label="Bagikan foto ke rekan">
            <div className="text-sm font-extrabold text-[#0F2A52]">Bagikan foto ini ke rekan?</div>
            <p className="text-xs leading-relaxed text-[#3C4C68]">Foto tidak dikirim ulang. Rekan hanya menerima ajakan dan memilih sendiri nomor fotonya.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onTutup} className="min-h-[52px] rounded-2xl border-2 border-[#C9D3E6] bg-white text-sm font-extrabold text-[#0F2A52]">Tidak</button>
              <button type="button" onClick={() => setBagiLangkah("pilih")} className="min-h-[52px] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white">Ya, pilih rekan</button>
            </div>
            <p className="px-1 text-[11.5px] leading-snug text-[#55657D]">Tidak = lanjut memotret. Anda masih bisa membagikannya nanti lewat Foto saya (sampai akhir hari sesudah tanggal foto).</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border-2 border-[#0F2A52] bg-[#F4F7FC] p-3">
            <BagikanFoto kegiatanId={kegiatanId} jumlahNomor={jumlahNomor} nilai={tagBagi} onUbah={setTagBagi} kecuali={tagAwal.map((t) => t.akun_id)} maks={Math.max(0, sisaTag)} />
            {pesanBagi && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-sm text-[#9B1C23]">{pesanBagi}</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setBagiLangkah("tanya"); setTagBagi([]); setPesanBagi(null); }} disabled={sibukBagi} className="min-h-[52px] flex-1 rounded-2xl border-2 border-[#C9D3E6] bg-white text-sm font-bold text-[#0F2A52] disabled:opacity-50">Kembali</button>
              <button type="button" onClick={() => void bagiKeRekan()} disabled={sibukBagi || tagBagi.length === 0} className="min-h-[52px] flex-[2] rounded-2xl bg-[#0F2A52] text-sm font-extrabold text-white disabled:opacity-40">
                {sibukBagi ? "Mengirim…" : tagBagi.length ? `Kirim ajakan ke ${tagBagi.length} orang` : "Pilih rekan dulu"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
