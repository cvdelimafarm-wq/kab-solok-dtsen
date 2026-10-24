"use client";

// app/sigap/revisi/Tambahan.tsx
//
// (24 Okt 2026) Tambahan pagu resmi (DJA/DJPb) yang dicatat PPK: formulir catat, daftar, dan pembatalan (salah catat, dengan alasan; tanpa hapus).
// Keputusan penuhi/tunda/tolak untuk tiap catatan kekurangan diambil di tab Kekurangan RAB per RO.

import { useState } from "react";
import { argsTambahan, periksaTambahan, tambahanKosong, tglPanjang, type IsianTambahan } from "@/lib/keu/revisi";
import { rupiah } from "@/lib/keu/ro";
import { useKirim } from "../ro/useKeu";
import type { Jadwal } from "./KartuJadwal";
import { Chip, Galat, kartu, kolom, label, tombolBahaya, tombolKecil, tombolUtama } from "../keu-ui";

export type Tambahan = { id: number; ro_kode: string; jumlah: number | string; jalur: string; nomor_dokumen: string; tanggal_dokumen: string; status: string; dipenuhi_total: number | string | null; sisa_penggenap: number | string | null; alasan_batal: string | null };

function FormTambahan({ jadwal, tutup, sesudah }: { jadwal: Jadwal[]; tutup: () => void; sesudah: () => Promise<void> }) {
  const [v, setV] = useState<IsianTambahan>(tambahanKosong());
  const [salah, setSalah] = useState<string[]>([]);
  const { kirim, mengirim, galat } = useKirim(sesudah);
  const dipa = jadwal.filter((j) => j.jenis === "dipa_dja" || j.jenis === "dipa_djpb").map((j) => ({ id: j.jadwal_id, jenis: j.jenis }));
  const cocok = jadwal.filter((j) => v.jalur && j.jenis === `dipa_${v.jalur}`);
  const simpan = async () => {
    const g = periksaTambahan(v, dipa);
    setSalah(g);
    if (g.length) return;
    if (await kirim("keu_tambahan_pagu_catat", argsTambahan(v))) tutup();
  };
  const u = (p: Partial<IsianTambahan>) => setV((x) => ({ ...x, ...p }));
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-[#B7CDF5] bg-[#F7FAFE] p-3">
      <h3 className="text-[14px] font-bold text-[#0F2A52]">Catat tambahan pagu resmi</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={label} htmlFor="tp-ro">Kode RO</label><input id="tp-ro" className={kolom} placeholder="2906.BMA.005" maxLength={20} value={v.ro} onChange={(e) => u({ ro: e.target.value.toUpperCase() })} /></div>
        <div><label className={label} htmlFor="tp-jml">Jumlah (Rp)</label><input id="tp-jml" className={kolom} inputMode="numeric" value={v.jumlah} onChange={(e) => u({ jumlah: e.target.value.replace(/[^\d.]/g, "").slice(0, 18) })} /></div>
        <div><label className={label} htmlFor="tp-jalur">Jalur</label>
          <select id="tp-jalur" className={kolom} value={v.jalur} onChange={(e) => u({ jalur: e.target.value as IsianTambahan["jalur"], jadwal: "" })}><option value="">Pilih</option><option value="dja">DJA</option><option value="djpb">DJPb</option></select></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={label} htmlFor="tp-no">Nomor dokumen revisi</label><input id="tp-no" className={kolom} maxLength={120} value={v.nomor} onChange={(e) => u({ nomor: e.target.value })} /></div>
        <div><label className={label} htmlFor="tp-tg">Tanggal dokumen</label><input id="tp-tg" type="date" className={kolom} value={v.tanggal} onChange={(e) => u({ tanggal: e.target.value })} /></div>
      </div>
      {cocok.length > 0 && (
        <div><label className={label} htmlFor="tp-jd">Jadwal revisi (opsional)</label>
          <select id="tp-jd" className={kolom} value={v.jadwal} onChange={(e) => u({ jadwal: e.target.value })}><option value="">Tanpa jadwal</option>{cocok.map((j) => <option key={j.jadwal_id} value={j.jadwal_id}>{j.judul}</option>)}</select></div>
      )}
      <div><label className={label} htmlFor="tp-cat">Catatan (opsional)</label><input id="tp-cat" className={kolom} maxLength={300} value={v.catatan} onChange={(e) => u({ catatan: e.target.value })} /></div>
      <Galat pesan={[...salah, ...(galat ? [galat] : [])]} />
      <div className="flex gap-2">
        <button type="button" disabled={mengirim} onClick={() => void simpan()} className={tombolUtama}>{mengirim ? "Menyimpan..." : "Simpan"}</button>
        <button type="button" disabled={mengirim} onClick={tutup} className={tombolKecil}>Batal</button>
      </div>
    </div>
  );
}

export default function BagianTambahan({ jadwal, daftar, galatBaca, bolehSahkan, sesudah }: {
  jadwal: Jadwal[]; daftar: Tambahan[] | null; galatBaca: string | null; bolehSahkan: boolean; sesudah: () => Promise<void>;
}) {
  const [form, setForm] = useState(false);
  const [batal, setBatal] = useState<{ id: number; alasan: string } | null>(null);
  const { kirim, mengirim, galat } = useKirim(sesudah);
  return (
    <div className={`${kartu} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold text-[#0F2A52]">Tambahan pagu resmi</h2>
        {bolehSahkan && !form && <button type="button" onClick={() => setForm(true)} className={tombolUtama}>Catat tambahan</button>}
      </div>
      <p className="text-[12.5px] text-[#5B6B84]">Pagu tambahan dari DJA atau DJPb dicatat PPK dengan nomor dokumen resminya. Ketua tim lalu memutuskan penuhi, tunda, atau tolak tiap catatan kekurangan di tab Kekurangan RAB.</p>
      {form && <FormTambahan jadwal={jadwal} tutup={() => setForm(false)} sesudah={sesudah} />}
      <Galat pesan={galatBaca} />
      <Galat pesan={galat} />
      {daftar && daftar.length === 0 && <p className="text-[13px] text-[#5B6B84]">Belum ada tambahan pagu yang dicatat.</p>}
      {(daftar ?? []).map((t) => (
        <div key={t.id} className={`flex flex-col gap-1.5 rounded-[10px] border border-[#DCE3EE] px-3 py-2.5 ${t.status === "dibatalkan" ? "opacity-70" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <a href={`/sigap/ro/${encodeURIComponent(t.ro_kode)}?tab=kekurangan`} className="font-mono text-[13px] font-semibold text-[#1F5FD1]">{t.ro_kode}</a>
              <b className="text-[14px] text-[#0F2A52]">{rupiah(t.jumlah)}</b>
            </div>
            <Chip warna={t.status === "terbuka" ? "kuning" : t.status === "diputus" ? "hijau" : "abu"}>{t.status === "terbuka" ? "Menunggu keputusan" : t.status === "diputus" ? "Diputuskan" : "Dibatalkan"}</Chip>
          </div>
          <div className="break-words text-[12px] text-[#5B6B84]">{t.jalur.toUpperCase()} · {t.nomor_dokumen} · {tglPanjang(t.tanggal_dokumen)}</div>
          {t.status === "diputus" && <p className="text-[12.5px] text-[#44546F]">Dipenuhi {rupiah(t.dipenuhi_total)} · sisa penggenap {rupiah(t.sisa_penggenap)}</p>}
          {t.status === "dibatalkan" && t.alasan_batal && <p className="text-[12.5px] text-[#5B6B84]">Alasan batal: {t.alasan_batal}</p>}
          {bolehSahkan && t.status === "terbuka" && (
            batal?.id === t.id ? (
              <div className="space-y-2">
                <label className={label} htmlFor={`bt-${t.id}`}>Alasan membatalkan (minimal 5 huruf)</label>
                <textarea id={`bt-${t.id}`} rows={2} maxLength={300} className={`${kolom} py-2`} value={batal.alasan} onChange={(e) => setBatal({ id: t.id, alasan: e.target.value })} />
                <div className="flex gap-2">
                  <button type="button" disabled={mengirim || batal.alasan.trim().length < 5} className={tombolBahaya} onClick={async () => { if (await kirim("keu_tambahan_pagu_batal", { p_id: t.id, p_alasan: batal.alasan.trim() })) setBatal(null); }}>Batalkan catatan</button>
                  <button type="button" className={tombolKecil} onClick={() => setBatal(null)}>Kembali</button>
                </div>
              </div>
            ) : (
              <div><button type="button" className={tombolBahaya} onClick={() => setBatal({ id: t.id, alasan: "" })}>Batalkan (salah catat)</button></div>
            )
          )}
        </div>
      ))}
    </div>
  );
}
