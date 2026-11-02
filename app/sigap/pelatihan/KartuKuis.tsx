"use client";

// app/sigap/pelatihan/KartuKuis.tsx
//
// (3 Nov 2026) Kartu "Kuis Adu Sigap" di tab Hari ini. Dulu kuis hanya muncul bila panitia sudah membuat ruang kuis, sehingga peserta tidak melihat apa pun; kini kartunya
// selalu ada dengan status yang jelas (belum dibuka / dibuka / sudah ikut / terlewat). Kuis TIDAK di-cache: isi kartu memantau ruang tiap ~5 detik (IsiKuis).

import { IsiKuis } from "./IsiKuis";
import { KUIS_KOSONG, useHub } from "./komponen";

export default function KartuKuis() {
  const { data, muat } = useHub(30_000);
  if (!data?.peserta) return null;
  const k = data.kuis ?? KUIS_KOSONG;
  const chip = k.ada_ruang_aktif
    ? { t: "Dibuka sekarang", c: "bg-[#E3EEFF] text-[#1F5FD1]" }
    : k.pernah_ikut
      ? { t: "Sudah ikut", c: "bg-[#E3F6EC] text-[#13794B]" }
      : k.ada_ruang_selesai
        ? { t: "Terlewat", c: "bg-[#FDE8E8] text-[#B42329]" }
        : { t: "Belum dibuka", c: "bg-[#EEF2F7] text-[#6B7A90]" };
  const tepi = k.ada_ruang_aktif ? "border-[#B9D2FB] bg-[#F3F8FF]" : k.pernah_ikut ? "border-[#BFE5D0] bg-[#F3FBF7]" : "border-[#DDE6F3] bg-white";
  return (
    <section id="langkah-kuis" aria-label="Kuis Adu Sigap" className={`rounded-[18px] border p-4 ${tepi}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Kuis Adu Sigap</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${chip.c}`}>{chip.t}</span>
        <span className="text-[11.5px] font-semibold text-[#6B7A90]">tambahan</span>
      </div>
      <div className="mt-1.5">
        <IsiKuis k={k} segarkan={() => void muat()} />
      </div>
    </section>
  );
}
