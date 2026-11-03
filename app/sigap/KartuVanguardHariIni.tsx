"use client";

// app/sigap/KartuVanguardHariIni.tsx
//
// (1 Nov 2026) Kartu VANGUARD di tab Hari Ini petugas (halaman Translok): tampil HANYA bila Vanguard menyala di kegiatan ini (centang manual atau jawaban Ya pada
// Identifikasi survei) dan akun adalah peserta aktif; keduanya diputuskan server (GET /api/sigap/vanguard?kegiatan=ID). Masuk lewat kartu ini = mode tercatat
// (membawa ?k=ID) dan membawa alamat halaman ini sebagai jalan pulang ("Kembali ke SIGAP" kembali ke tab Hari Ini). Gagal memuat = tidak tampil apa pun.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Lambang } from "@/app/sigap/vanguard/Logo";
import ModalVanguardWajib from "@/app/sigap/ModalVanguardWajib"; // (2 Nov 2026) modal urgent mode wajib
import ModalVanguardAnjuran from "@/app/sigap/ModalVanguardAnjuran"; // (3 Nov 2026) pop-up ringan sekali sehari untuk mode tidak wajib
import RemarkBawahanVanguard from "@/app/sigap/vanguard/RemarkBawahanVanguard"; // (1 Nov 2026) remark pendampingan khusus untuk level di atas
import { useVanguardSaya } from "@/app/sigap/vanguardSaya"; // (3 Nov 2026) satu simpanan bersama dengan lajur langkah pelatihan
import { alamatVanguard } from "@/lib/vanguard/navigasi";
import { teksRuntutan } from "@/lib/vanguardPelatihan";

// (3 Nov 2026) Kartu disorot (cincin kuning + penanda) saat Vanguard perlu perhatian sekarang (wajib belum tuntas dan hari ini belum berlatih; atau belum pernah berlatih),
// dan memiliki id "langkah-vanguard" sebagai tujuan ikon langkah di lajur pelatihan.
export default function KartuVanguardHariIni({ kegiatanId }: { kegiatanId: number }) {
  const vg = useVanguardSaya(kegiatanId);
  const [href, setHref] = useState<string>(() => alamatVanguard({ kegiatan: kegiatanId, dari: "/" }));

  useEffect(() => {
    setHref(alamatVanguard({ kegiatan: kegiatanId, dari: `${window.location.pathname}${window.location.search}` }));
  }, [kegiatanId]);

  if (!vg.ada) return <RemarkBawahanVanguard kegiatanId={kegiatanId} />;
  const d = { benar: vg.benar, runtutan: vg.runtutan };
  const sorot = vg.mendesak;
  const t = d.runtutan ? teksRuntutan(d.runtutan) : null;
  return (
    <>
    {d.runtutan && d.runtutan.mode === "wajib" ? <ModalVanguardWajib kegiatanId={kegiatanId} runtutan={d.runtutan} /> : <ModalVanguardAnjuran kegiatanId={kegiatanId} benar={vg.benar} />}
    <Link
      id="langkah-vanguard"
      href={href}
      aria-label={d.runtutan ? "Buka Vanguard: Menu wajib dan Latihan bank soal" : "Buka Vanguard: latihan isi kuesioner, hasil Anda dicatat"}
      className={`block scroll-mt-24 rounded-[18px] bg-gradient-to-br from-[#2A1763] to-[#5B34C9] p-3.5 text-white active:opacity-95 ${sorot ? "shadow-[0_0_0_3px_#FFC000,0_10px_26px_rgba(91,52,201,.45)]" : "shadow-[0_8px_22px_rgba(42,23,99,.28)]"}`}
    >
      <span className="flex items-center gap-3">
        <span className="grid h-[44px] w-[44px] flex-none place-items-center rounded-[12px] bg-white"><Lambang px={24} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-extrabold leading-snug">{d.runtutan ? "Vanguard" : "Vanguard · latihan isi kuesioner"}</b>
          <span className="block text-[12.5px] leading-snug text-[#D9CFF8]">{d.runtutan ? "Menu wajib dan Latihan bank soal" : `${d.benar > 0 ? `${d.benar} kasus sudah benar` : "Pelatihan petugas"} · hasil Anda dicatat`}</span>
        </span>
        {sorot ? (
          <span className="flex-none rounded-full bg-[#FFC000] px-2.5 py-[3px] text-[11px] font-extrabold text-[#111]">{d.runtutan?.mode === "wajib" ? "Wajib hari ini" : "Ayo mulai"}</span>
        ) : !d.runtutan ? (
          <span className="flex-none rounded-full bg-[#E3F6EC] px-2.5 py-[3px] text-[11px] font-bold text-[#0F5C38]">Dicatat</span>
        ) : null}
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
          <b className="mt-2 block text-[13px] font-extrabold leading-snug">Menu wajib · {t.judul}</b>
          <span className={`block text-[12.5px] leading-snug ${t.peringatan ? "font-bold text-[#FFD38A]" : "text-[#D9CFF8]"}`}>{t.ket}</span>
        </span>
      )}
      <span className="mt-2.5 inline-flex min-h-[44px] items-center rounded-[12px] bg-[#FFC000] px-4 text-[13.5px] font-extrabold text-[#111]">{d.runtutan && ((!d.runtutan.hari_ini_sudah && !d.runtutan.tuntas) || (d.runtutan.tuntas && d.runtutan.sertifikasi_selesai === false)) ? "Buka Menu wajib" : "Buka Vanguard"}</span>
    </Link>
    <RemarkBawahanVanguard kegiatanId={kegiatanId} />
    </>
  );
}
