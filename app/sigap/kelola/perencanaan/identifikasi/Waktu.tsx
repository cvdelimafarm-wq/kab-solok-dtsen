"use client";

// app/sigap/kelola/perencanaan/identifikasi/Waktu.tsx
//
// (28 Okt 2026) Isian jadwal satu kegiatan (briefing, pelatihan, rapat) dengan penanda Perkiraan atau Fix.
// (6 Nov 2026) Disederhanakan: hanya RENTANG TANGGAL (mulai dan selesai; satu hari = tanggal yang sama) ditambah penanda Perkiraan/Fix.
// Dulu ada pilihan Satu tanggal/Rentang/Minggu dan, untuk Perkiraan, bulan + minggu ke-n. Data lama tetap terbaca (tanggalnya sudah tersimpan
// pada mulai dan selesai); begitu diubah, rekaman disimpan sebagai rentang biasa. Aturan ada di lib/keu/isianTanggal.ts dan waktu.ts.

import { kisi } from "@/app/sigap/keu-ui";
import { recPerk, ringkasRec, type WaktuRec } from "@/lib/keu/waktu";
import { rekDariRentang, rekDenganPerk } from "@/lib/keu/isianTanggal";
import { FixPerk, Isian, TglRentang } from "./Kontrol";

/**
 * Isian jadwal. `rec` = rekaman mentah periode ini (boleh kosong). `onUbah` menerima rekaman lengkap (mulai, selesai, perk, mode).
 * `nama` dipakai untuk label aksesibilitas, mis. "Pelatihan Triwulan I".
 */
export function WaktuIsian({ rec, tahun, mati, nama, onUbah }: { rec: WaktuRec | undefined; tahun: number; mati: boolean; nama: string; onUbah: (r: WaktuRec) => void }) {
  const r: WaktuRec = rec ?? { mulai: "", selesai: "" };
  const perk = recPerk(r);
  const ringkas = ringkasRec(r);
  return (
    <div className="flex flex-col gap-2.5">
      <div className={kisi}>
        <TglRentang nama={nama} mulai={r.mulai} selesai={r.selesai} mati={mati} onUbah={(x) => onUbah(rekDariRentang(r, x, tahun))} />
        <Isian judul="Kematangan">
          <FixPerk nama={`Jadwal ${nama}`} perk={perk} mati={mati} onPilih={(v) => onUbah(rekDenganPerk(r, v, tahun))} />
        </Isian>
      </div>
      <p className="m-0 text-[12.5px] text-[#44546F]">
        {ringkas ? <><strong className={perk ? "text-[#8A6200]" : "text-[#14653A]"}>{perk ? "≈ Perkiraan" : "Fix"}</strong>: {ringkas}</> : "Belum dijadwalkan. Isi tanggal mulai (satu hari: selesai terisi sama)."}
      </p>
    </div>
  );
}
