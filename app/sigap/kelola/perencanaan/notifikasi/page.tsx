"use client";

// app/sigap/kelola/perencanaan/notifikasi/page.tsx
//
// (25 Okt 2026, tahap 30) Notifikasi SIGAP milik akun yang masuk: lanjutan Final, perubahan sesudah H-15, nama petugas terisi, lembar kebijakan menunggu
// pengesahan, dan keputusan KPA. Notifikasi dibuat otomatis oleh basis data pada kejadian terkait; halaman ini hanya membaca dan menandai dibaca.

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import Bingkai from "@/app/sigap/kontrak/Bingkai";
import { Chip, Galat, judulKartu, kartu, Kosong, Memuat, tombolKecil } from "@/app/sigap/keu-ui";
import { LABEL_NOTIF, tautanAman } from "@/lib/keu/notifikasi";
import { useNotifikasi } from "./useNotifikasi";

const waktu = (iso: string): string => {
  try { return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)); } catch { return iso; }
};

function Isi() {
  const { data, galat, tandai } = useNotifikasi(200);
  const [hanyaBelum, setHanyaBelum] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const daftar = useMemo(() => (data?.daftar ?? []).filter((n) => !hanyaBelum || n.dibaca_at === null), [data, hanyaBelum]);
  const jalankan = async (id: number | null) => { setSibuk(true); await tandai(id); setSibuk(false); };

  return (
    <Bingkai
      aktif="identifikasi_survei"
      kecil="SIGAP · Notifikasi"
      jejak={["SIGAP", "Perencanaan", "Notifikasi"]}
      judul="Notifikasi"
      sub="Pesan otomatis dari identifikasi lanjutan, lembar kebijakan, dan keputusan KPA yang ditujukan kepada Anda."
      kembali={{ induk: "/sigap/kelola/perencanaan/identifikasi", label: "Identifikasi survei" }}
    >
      <div className="flex flex-col gap-3.5 text-[#1B2B4B]">
        <Galat pesan={galat} />
        <section className={`${kartu} flex flex-wrap items-center gap-2`} aria-labelledby="h-notif">
          <h2 id="h-notif" className={`${judulKartu} m-0`}>Kotak masuk</h2>
          {data && <Chip warna={data.belum > 0 ? "merah" : "hijau"}>{data.belum > 0 ? `${data.belum} belum dibaca` : "Semua sudah dibaca"}</Chip>}
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className={tombolKecil} aria-pressed={hanyaBelum} onClick={() => setHanyaBelum((v) => !v)}>{hanyaBelum ? "Tampilkan semua" : "Hanya yang belum dibaca"}</button>
            <button type="button" className={tombolKecil} disabled={sibuk || !data || data.belum === 0} onClick={() => void jalankan(null)}>Tandai semua dibaca</button>
          </div>
        </section>
        {!data && !galat && <Memuat />}
        {data && daftar.length === 0 && <Kosong teks={hanyaBelum ? "Tidak ada notifikasi yang belum dibaca." : "Belum ada notifikasi."} />}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {daftar.map((n) => {
            const label = LABEL_NOTIF[n.jenis] ?? { teks: n.jenis, nada: "abu" as const };
            const tautan = tautanAman(n.tautan);
            return (
              <li key={n.id} className={`${kartu} flex min-w-0 flex-col gap-1.5 ${n.dibaca_at === null ? "border-l-4 border-l-[#1F5FD1]" : "opacity-80"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip warna={label.nada}>{label.teks}</Chip>
                  <span className="text-[11.5px] text-[#5B6B84]">{waktu(n.dibuat_at)}{n.pemicu_nama ? ` · ${n.pemicu_nama}` : ""}</span>
                  {n.dibaca_at === null && <span className="rounded-full bg-[#E3EEFF] px-2 py-[1px] text-[11px] font-bold text-[#1F5FD1]">Baru</span>}
                </div>
                <strong className="text-[14px] text-[#0F2A52] [overflow-wrap:anywhere]">{n.judul}</strong>
                {n.isi && <p className="m-0 text-[13px] leading-snug text-[#44546F] [overflow-wrap:anywhere]">{n.isi}</p>}
                <div className="flex flex-wrap gap-2">
                  {tautan && <Link href={tautan} onClick={() => { if (n.dibaca_at === null) void tandai(n.id); }} className="rounded-md border border-[#1F5FD1] bg-[#E3EEFF] px-3 py-2 text-[12.5px] font-semibold text-[#1F5FD1] hover:bg-[#D3E4FF]">Buka</Link>}
                  {n.dibaca_at === null && <button type="button" className={tombolKecil} disabled={sibuk} onClick={() => void jalankan(n.id)}>Tandai dibaca</button>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Bingkai>
  );
}

export default function HalamanNotifikasi() {
  return (
    <Suspense fallback={null}>
      <Isi />
    </Suspense>
  );
}
