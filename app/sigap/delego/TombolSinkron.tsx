"use client";

// app/sigap/delego/TombolSinkron.tsx
//
// (1 Nov 2026) Menarik pekerjaan dari modul lain ke Delego tanpa kerja dua kali: revisi anggaran, dokumen administrasi, dan pengadaan hasil identifikasi
// dibuatkan butir untuk orang yang mengerjakannya, dan butir itu tertutup sendiri saat sumbernya selesai. Aman dijalankan berulang (tidak menggandakan).

import { useState } from "react";
import { aksiKeu } from "./data";
import { KELAS } from "./merek";
import { Galat, Info } from "./ui";

export default function TombolSinkron({ sesudah }: { sesudah?: () => void | Promise<void> }) {
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  async function jalan() {
    setSibuk(true);
    setPesan(null);
    setGalat(null);
    const r = await aksiKeu<{ dibuat: number; ditutup: number; sumber_aktif: number }>("keu_dlg_sinkron", {});
    setSibuk(false);
    if (!r.ok) {
      setGalat(r.pesan);
      return;
    }
    setPesan(`${r.data.dibuat} butir baru, ${r.data.ditutup} ditutup otomatis, ${r.data.sumber_aktif} sumber masih aktif.`);
    await sesudah?.();
  }
  return (
    <div className="space-y-2">
      <button type="button" className={KELAS.tombolKecil} disabled={sibuk} onClick={() => void jalan()} title="Tarik pekerjaan dari modul Revisi, Administrasi, dan Pengadaan">
        {sibuk ? "Menyinkronkan..." : "Sinkronkan dari modul lain"}
      </button>
      {pesan && <Info>{pesan}</Info>}
      {galat && <Galat>{galat}</Galat>}
    </div>
  );
}
