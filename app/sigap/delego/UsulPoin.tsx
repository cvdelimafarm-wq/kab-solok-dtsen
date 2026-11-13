"use client";

// app/sigap/delego/UsulPoin.tsx
//
// (13 Nov 2026, keputusan C) Sesudah pegawai melapor pada delegasi berjenis, ia diminta usul "berapa satuan wajar per hari" untuk jenis pekerjaan itu,
// sekali per jenis × survei per triwulan (keu_poin_usul_perlu / keu_poin_usul_simpan, SQL 20261113c). Usul menjadi salah satu sumber poin di
// Master > Poin beban kerja (dipakai bila pengusul cukup; pencilan dibuang). Tidak wajib: boleh dilewati.

import { useEffect, useState } from "react";
import { aksiKeu } from "./data";
import { KELAS } from "./merek";
import { Info } from "./ui";

type Perlu = { perlu: boolean; jenis?: string; satuan?: string; survei?: string; triwulan?: string };

export default function UsulPoin({ delegasi }: { delegasi: number }) {
  const [perlu, setPerlu] = useState<Perlu | null>(null);
  const [isi, setIsi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [status, setStatus] = useState<"" | "kirim" | "selesai" | "lewat">("");
  const [galat, setGalat] = useState<string | null>(null);
  useEffect(() => {
    let hidup = true;
    void aksiKeu<Perlu>("keu_poin_usul_perlu", { p_delegasi: delegasi }).then((r) => { if (hidup) setPerlu(r.ok ? r.data : { perlu: false }); });
    return () => { hidup = false; };
  }, [delegasi]);
  if (!perlu?.perlu || status === "lewat") return null;
  if (status === "selesai") return <Info>Terima kasih. Usul Anda dicatat untuk {perlu.jenis} ({perlu.survei}, {perlu.triwulan}).</Info>;
  const n = Number(isi.replace(",", "."));
  const sah = Number.isFinite(n) && n > 0 && n <= 10000;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[#B9D7D2] bg-[#EEF8F6] px-3 py-2.5">
      <p className="m-0 text-[13px] text-[#14212B]">
        <b>Satu pertanyaan singkat:</b> menurut pengalaman Anda, berapa <b>{perlu.satuan}</b> {perlu.jenis?.toLowerCase()} yang wajar selesai dalam satu hari kerja penuh (7,5 jam) untuk {perlu.survei}?
        Diminta sekali per triwulan; dipakai menyusun poin beban kerja.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block w-[120px]"><span className="mb-1 block text-[12px] font-semibold text-[#3B4A57]">{perlu.satuan} per hari</span>
          <input type="number" inputMode="decimal" min={0} step="any" className={KELAS.isian} value={isi} onChange={(e) => setIsi(e.target.value)} placeholder="mis. 12" />
        </label>
        <label className="block min-w-[160px] flex-1"><span className="mb-1 block text-[12px] font-semibold text-[#3B4A57]">Catatan (opsional)</span>
          <input className={KELAS.isian} maxLength={300} value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={KELAS.tombolUtama} disabled={!sah || status === "kirim"} onClick={() => {
          setStatus("kirim"); setGalat(null);
          void aksiKeu("keu_poin_usul_simpan", { p_delegasi: delegasi, p_per_hari: n, p_catatan: catatan.trim() }).then((r) => {
            if (r.ok) setStatus("selesai"); else { setStatus(""); setGalat(r.pesan); }
          });
        }}>Kirim usul</button>
        <button type="button" className={KELAS.tombolKecil} onClick={() => setStatus("lewat")}>Lewati</button>
      </div>
      {galat && <p role="alert" className="m-0 text-[12.5px] text-[#9B2C2C]">{galat}</p>}
    </div>
  );
}
