"use client";

// app/sigap/pelatihan/kelola/persiapanGabung.tsx
//
// (2 Nov 2026) Tab Persiapan di Kelola Pelatihan kini berisi dua bagian: "Pengaturan" (tampilan peserta, ketentuan, absen, aturan nilai) dan "Instrumen"
// (unggah kuesioner, buku pedoman, PPT materi). Alamat: ?tab=persiapan&sub=instrumen.

import InstrumenKelola from "./instrumen";
import PersiapanKelola from "./tampilan";
import VanguardKelola from "./vanguardKelola";
import { PilihSub, useSub, type ItemSub } from "./GrupTab";
import BelajarAturan from "../../BelajarAturan";
import { kegiatanPelatihanAktif } from "../../admin/api";

const SUB: ItemSub[] = [
  { kode: "pengaturan", label: "Pengaturan", ket: "Tampilan peserta, ketentuan undangan, absen, dan aturan nilai." },
  { kode: "instrumen", label: "Instrumen", ket: "Kuesioner, buku pedoman, dan PPT materi yang diunduh peserta di tab Instrumen." },
  { kode: "vanguard", label: "Vanguard", ket: "Nyalakan simulasi pengisian kuesioner untuk pelatihan ini dan buka dasbor serta pengaturannya." },
  // (13 Nov 2026, keputusan B) satu sumber aturan kegiatan belajar dan mutu per waktu
  { kode: "belajar", label: "Belajar dan mutu", ket: "Pretest, Vanguard, posttest, dan kuis per waktu: dipakai, wajib, tenggat, blokir, dan pembatalan." },
];

export default function PersiapanGabung() {
  const [sub, pilih] = useSub(SUB);
  return (
    <div>
      <PilihSub daftar={SUB} aktif={sub} onPilih={pilih} label="Bagian persiapan" />
      {sub === "instrumen" ? <InstrumenKelola /> : sub === "vanguard" ? <VanguardKelola /> : sub === "belajar" ? <BelajarAturan kegiatanId={kegiatanPelatihanAktif()} /> : <PersiapanKelola />}
    </div>
  );
}
