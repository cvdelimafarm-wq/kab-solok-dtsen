"use client";

// app/sigap/KartuVanguardHariIni.tsx
//
// (1 Nov 2026) Kartu VANGUARD di tab Hari Ini petugas (halaman Translok): tampil HANYA bila Vanguard menyala di kegiatan ini (centang manual atau jawaban Ya pada
// Identifikasi survei) dan akun adalah peserta aktif; keduanya diputuskan server (GET /api/sigap/vanguard?kegiatan=ID). Masuk lewat kartu ini = mode tercatat
// (membawa ?k=ID) dan membawa alamat halaman ini sebagai jalan pulang ("Kembali ke SIGAP" kembali ke tab Hari Ini). Gagal memuat = tidak tampil apa pun.

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import { Lambang } from "@/app/sigap/vanguard/Logo";
import ModalVanguardWajib from "@/app/sigap/ModalVanguardWajib"; // (2 Nov 2026) modal urgent mode wajib
import RemarkBawahanVanguard from "@/app/sigap/vanguard/RemarkBawahanVanguard"; // (1 Nov 2026) remark pendampingan khusus untuk level di atas
import { alamatVanguard } from "@/lib/vanguard/navigasi";
import { teksRuntutan, type RuntutanKartu } from "@/lib/vanguardPelatihan";

type Keadaan = { mode: "bebas" | "tercatat"; boleh: boolean; riwayat: { kasus: string; benar: boolean }[]; runtutan?: RuntutanKartu | null };

export default function KartuVanguardHariIni({ kegiatanId }: { kegiatanId: number }) {
  const [d, setD] = useState<{ benar: number; runtutan: RuntutanKartu | null } | null>(null);
  const [href, setHref] = useState<string>(() => alamatVanguard({ kegiatan: kegiatanId, dari: "/" }));

  useEffect(() => {
    setHref(alamatVanguard({ kegiatan: kegiatanId, dari: `${window.location.pathname}${window.location.search}` }));
    let batal = false;
    apiPortal<Keadaan>(`/api/sigap/vanguard?kegiatan=${kegiatanId}`)
      .then((r) => { if (!batal) setD(r.mode === "tercatat" && r.boleh ? { benar: r.riwayat.filter((x) => x.benar).length, runtutan: r.runtutan ?? null } : null); })
      .catch(() => { /* diam: kartu Vanguard hanya tambahan */ });
    return () => { batal = true; };
  }, [kegiatanId]);

  if (!d) return <RemarkBawahanVanguard kegiatanId={kegiatanId} />;
  const t = d.runtutan ? teksRuntutan(d.runtutan) : null;
  return (
    <>
    {d.runtutan && d.runtutan.mode === "wajib" && <ModalVanguardWajib kegiatanId={kegiatanId} runtutan={d.runtutan} />}
    <Link href={href} aria-label="Buka Vanguard: latihan isi kuesioner, hasil Anda dicatat" className="block rounded-[18px] bg-gradient-to-br from-[#2A1763] to-[#5B34C9] p-3.5 text-white shadow-[0_8px_22px_rgba(42,23,99,.28)] active:opacity-95">
      <span className="flex items-center gap-3">
        <span className="grid h-[44px] w-[44px] flex-none place-items-center rounded-[12px] bg-white"><Lambang px={24} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-extrabold leading-snug">Vanguard · latihan isi kuesioner</b>
          <span className="block text-[12.5px] leading-snug text-[#D9CFF8]">{d.benar > 0 ? `${d.benar} kasus sudah benar` : "Pelatihan petugas"} · hasil Anda dicatat</span>
        </span>
        <span className="flex-none rounded-full bg-[#E3F6EC] px-2.5 py-[3px] text-[11px] font-bold text-[#0F5C38]">Dicatat</span>
      </span>
      {d.runtutan && t && (
        <span className="mt-3 block rounded-[12px] bg-white/10 p-2.5">
          <span className="flex items-center gap-1.5" role="list" aria-label={t.judul}>
            {d.runtutan.petak.map((p, i) => (
              <span key={i} role="listitem" aria-label={`Hari ${i + 1}: ${p.status === "selesai" ? "selesai" : p.status === "hari_ini" ? "hari ini" : "belum"}`}
                className={`grid h-9 flex-1 place-items-center rounded-[10px] text-[12px] font-extrabold ${p.status === "selesai" ? "bg-[#3DDC97] text-[#06351F]" : p.status === "hari_ini" ? "border-2 border-[#FFC000] bg-transparent text-[#FFC000]" : "bg-white/15 text-[#D9CFF8]"}`}>
                {p.status === "selesai" ? "✓" : `H${i + 1}`}
              </span>
            ))}
          </span>
          <b className="mt-2 block text-[13px] font-extrabold leading-snug">{t.judul}</b>
          <span className={`block text-[12.5px] leading-snug ${t.peringatan ? "font-bold text-[#FFD38A]" : "text-[#D9CFF8]"}`}>{t.ket}</span>
        </span>
      )}
      <span className="mt-2.5 inline-flex min-h-[44px] items-center rounded-[12px] bg-[#FFC000] px-4 text-[13.5px] font-extrabold text-[#111]">{d.runtutan && !d.runtutan.hari_ini_sudah && !d.runtutan.tuntas ? "Latihan hari ini" : "Buka Vanguard"}</span>
    </Link>
    <RemarkBawahanVanguard kegiatanId={kegiatanId} />
    </>
  );
}
