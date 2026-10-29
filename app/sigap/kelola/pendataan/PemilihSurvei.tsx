"use client";

// app/sigap/kelola/pendataan/PemilihSurvei.tsx
//
// (29 Okt 2026) Pemilih SURVEI di atas isi Kelola Pendataan: seluruh tab (Ringkasan, 1 Persiapan ... 7 Administrasi & SPJ) menyesuaikan survei terpilih.
// Pilihan ikut di alamat (?k=<id kegiatan>; Pendataan Pascabencana = tanpa ?k). Daftar survei = kegiatan pada Ringkas akun (ambilRingkas).
// Tab yang BELUM mengikuti survei terpilih menampilkan <BelumUntukSurvei> (keterangan jelas, bukan data survei lain).

import { KEGIATAN_PENDATAAN } from "@/lib/sigapPendataanTab";
import { Kartu } from "../../admin/ui";
import type { KegiatanRingkas } from "../../admin/api";

export function namaSurvei(daftar: KegiatanRingkas[], id: number): string {
  return daftar.find((k) => k.id === id)?.nama ?? (id === KEGIATAN_PENDATAAN ? "Pendataan Pascabencana" : `Survei ${id}`);
}

export default function PemilihSurvei({ daftar, aktif, onPilih }: { daftar: KegiatanRingkas[]; aktif: number; onPilih: (id: number) => void }) {
  // Pascabencana selalu ada di daftar (alamat lama), survei nonaktif tetap bisa dipilih agar pengaturannya bisa disiapkan sebelum dimulai
  const item = [...daftar].sort((a, b) => Number(b.aktif) - Number(a.aktif) || a.id - b.id);
  if (!item.some((k) => k.id === aktif)) item.unshift({ id: aktif, kode: "", nama: namaSurvei(daftar, aktif), tanggal_mulai: null, tanggal_selesai: null, aktif: true });
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#DDE6F3] bg-white px-3.5 py-2.5">
      <label htmlFor="pilih-survei" className="text-[13px] font-extrabold text-[#0F2A52]">
        Survei
      </label>
      <select id="pilih-survei" value={aktif} onChange={(e) => onPilih(Number(e.target.value))} className="min-h-[40px] min-w-[220px] max-w-full flex-1 rounded-lg border border-[#C9D4E8] bg-white px-3 text-[14px] font-bold text-[#0F2A52] sm:flex-none">
        {item.map((k) => (
          <option key={k.id} value={k.id}>
            {k.nama}
            {k.aktif ? "" : " (tidak aktif)"}
          </option>
        ))}
      </select>
      <span className="text-[12.5px] text-[#6B7A90]">Semua tab di bawah mengikuti survei yang dipilih.</span>
    </div>
  );
}

/** Keterangan untuk tab yang belum mengikuti survei terpilih (menampilkan isi Pascabencana di sini akan menyesatkan). */
export function BelumUntukSurvei({ nama, tab, onKePascabencana, onKeQc }: { nama: string; tab: string; onKePascabencana: () => void; onKeQc: () => void }) {
  return (
    <Kartu judul={`${tab}: belum tersedia untuk ${nama}`} ket="tab ini belum mengikuti survei terpilih">
      <p className="text-[13px] leading-relaxed text-[#33455F]">
        Isi tab ini saat ini hanya untuk <b>Pendataan Pascabencana</b>, jadi tidak ditampilkan agar tidak tertukar dengan data {nama}. Penyesuaian tab ini per survei dikerjakan bertahap.
        Yang sudah mengikuti survei terpilih: tab <b>4 · QC</b> (QC Pemahaman Petugas).
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onKeQc} className="min-h-[42px] rounded-lg bg-[#0F2A52] px-4 text-[13.5px] font-bold text-white">
          Buka tab 4 · QC
        </button>
        <button type="button" onClick={onKePascabencana} className="min-h-[42px] rounded-lg border border-[#C9D4E8] bg-white px-4 text-[13.5px] font-bold text-[#0F2A52]">
          Kembali ke Pendataan Pascabencana
        </button>
      </div>
    </Kartu>
  );
}
