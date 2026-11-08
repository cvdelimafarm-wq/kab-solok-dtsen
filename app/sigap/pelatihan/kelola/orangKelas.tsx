"use client";

// app/sigap/pelatihan/kelola/orangKelas.tsx
//
// (8 Nov 2026) Peserta & Kelas > "Orang & kelas": SATU pintu untuk orang dan kelas. Urutannya mengikuti pekerjaan: libatkan orang -> kelas -> peserta per kelas -> panitia
// (PengaturanKelasKelola), lalu instruktur per kelas (InstrukturKelola), lalu kelas menurut perencanaan sebagai PEMBANDING (hanya baca, dibuka bila perlu).
// Komponen aslinya tidak diubah; berkas ini hanya menyusunnya.

import { useState } from "react";
import { Kartu } from "../../admin/ui";
import InstrukturKelola from "./instruktur";
import KelasIdentKelola from "./kelasIdent";
import PengaturanKelasKelola from "./pengaturanKelas";

export default function OrangKelasKelola() {
  const [bukaRencana, setBukaRencana] = useState(false);
  const keInstruktur = () => {
    try {
      document.getElementById("bagian-instruktur")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      /* abaikan */
    }
  };
  return (
    <div className="space-y-3">
      <PengaturanKelasKelola bukaInstruktur={keInstruktur} />
      <section id="bagian-instruktur" className="scroll-mt-24">
        <InstrukturKelola />
      </section>
      <Kartu judul="Pembanding: kelas menurut perencanaan" ket="Hanya baca. Bandingkan dengan kelas di atas bila rencana identifikasi berubah.">
        <details onToggle={(e) => setBukaRencana((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-[13px] font-semibold text-[#1F5FD1]">{bukaRencana ? "Sembunyikan" : "Tampilkan rencana kelas"}</summary>
          <div className="mt-3">{bukaRencana && <KelasIdentKelola />}</div>
        </details>
      </Kartu>
    </div>
  );
}
