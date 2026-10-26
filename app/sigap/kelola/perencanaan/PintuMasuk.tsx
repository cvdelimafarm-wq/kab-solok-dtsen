"use client";

// app/sigap/kelola/perencanaan/PintuMasuk.tsx
//
// (26 Okt 2026) Pintu masuk Perencanaan. Halaman /sigap/kelola/perencanaan dulu langsung membuka uji coba "Alur GSBPM" (data di browser).
// Fitur sesungguhnya sudah berbasis database dan punya halaman sendiri; halaman ini hanya menunjukkan urutannya dan menautkannya.
// Tidak ada data yang dibaca atau ditulis di sini. Hak akses tiap tujuan ditegakkan oleh halaman tujuan dan basis data.
// Uji coba lama tidak dihapus: tetap ada lewat tombol di bawah (hanya untuk Admin Aplikasi) dan lewat alamat lamanya (?ro=...).

import Link from "next/link";

export type TautanPintu = { id: string; judul: string; isi: string; href: string; label: string };

export const TAUTAN_PINTU: TautanPintu[] = [
  {
    id: "identifikasi",
    judul: "Identifikasi survei",
    isi: "Mulai dari sini. Jawab sekali: periode, jadwal, pelatihan, petugas, dan kebutuhan anggaran. Disahkan PPK, Tata Usaha, lalu KPA.",
    href: "/sigap/kelola/perencanaan/identifikasi",
    label: "Buka daftar survei",
  },
  {
    id: "kebijakan",
    judul: "Lembar kebijakan manajemen tim",
    isi: "Templat susunan tim, batas anggaran, dan parameter lain yang dipakai saat menyusun identifikasi.",
    href: "/sigap/kelola/perencanaan/kebijakan",
    label: "Buka lembar kebijakan",
  },
  {
    id: "notifikasi",
    judul: "Notifikasi",
    isi: "Pesan otomatis dari identifikasi lanjutan, lembar kebijakan, dan keputusan KPA yang ditujukan kepada Anda.",
    href: "/sigap/kelola/perencanaan/notifikasi",
    label: "Buka kotak masuk",
  },
  {
    id: "anggaran",
    judul: "Anggaran per RO",
    isi: "POK, RAB, kekurangan, administrasi, realisasi, dan jadwal revisi untuk tiap Rincian Output.",
    href: "/sigap/ro",
    label: "Buka daftar RO",
  },
];

export const LANGKAH_ALUR: { no: string; judul: string; isi: string }[] = [
  { no: "1", judul: "Identifikasi", isi: "Ketua tim, admin RO, atau PPK menyusun dan mengirim." },
  { no: "2", judul: "Persetujuan", isi: "PPK dan Tata Usaha menyetujui paralel, KPA mengesahkan." },
  { no: "3", judul: "Identifikasi lanjutan", isi: "Tim, petugas, jadwal, dan dokumen dipastikan (Fix)." },
  { no: "4", judul: "Kebutuhan dan usulan RAB", isi: "Rekrutmen mitra, status pengadaan, dan usulan RAB dari identifikasi." },
  { no: "5", judul: "Pelaksanaan dan Gap", isi: "Realisasi dibandingkan rencana; selisih ditandai." },
];

const kartu = "rounded-xl border border-[#E3E8EE] bg-white p-3.5";

export default function PintuMasuk({ bolehUji, keUji }: { bolehUji: boolean; keUji: () => void }) {
  return (
    <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
      <section className={`${kartu} flex flex-col gap-2.5`} aria-labelledby="h-alur">
        <h2 id="h-alur" className="m-0 text-[14.5px] font-bold text-[#0F2A52]">Urutan perencanaan</h2>
        <ol className="m-0 grid list-none gap-2 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
          {LANGKAH_ALUR.map((l) => (
            <li key={l.no} className="flex gap-2.5 rounded-lg bg-[#F3F6FB] p-2.5">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#1F5FD1] text-[12.5px] font-bold text-white" aria-hidden="true">{l.no}</span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-[#0F2A52]">{l.judul}</span>
                <span className="block text-[12.5px] leading-snug text-[#4D5B6B]">{l.isi}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="h-tujuan" className="flex flex-col gap-2.5">
        <h2 id="h-tujuan" className="m-0 text-[14.5px] font-bold text-[#0F2A52]">Buka</h2>
        <ul className="m-0 grid list-none gap-2.5 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {TAUTAN_PINTU.map((t) => (
            <li key={t.id}>
              <Link href={t.href} className={`${kartu} flex h-full flex-col gap-1 hover:bg-[#F7F9FC]`}>
                <strong className="text-[14.5px] text-[#0F2A52]">{t.judul}</strong>
                <span className="text-[13px] leading-snug text-[#4D5B6B]">{t.isi}</span>
                <span className="mt-auto pt-1.5 text-[13px] font-semibold text-[#1F5FD1]">{t.label} →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {bolehUji && (
        <section className={`${kartu} flex flex-wrap items-center gap-3`} aria-labelledby="h-uji">
          <div className="min-w-0 flex-1">
            <h2 id="h-uji" className="m-0 text-[14.5px] font-bold text-[#0F2A52]">Uji coba Alur GSBPM (lama)</h2>
            <p className="m-0 mt-0.5 text-[13px] leading-snug text-[#4D5B6B]">RO → kegiatan utama → tahap GSBPM. Data hanya tersimpan di browser ini dan tidak terlihat petugas. Tidak dihapus; dibiarkan untuk rujukan.</p>
          </div>
          <button type="button" onClick={keUji} className="rounded-md border border-[#BFCBDD] bg-white px-3 py-2 text-[13px] font-semibold text-[#1B2B4B] hover:bg-[#F7F9FC]">Buka uji coba</button>
        </section>
      )}
    </div>
  );
}
