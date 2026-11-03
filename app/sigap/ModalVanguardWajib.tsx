"use client";

// app/sigap/ModalVanguardWajib.tsx
//
// (2 Nov 2026) Modal URGENT Vanguard "N hari berturut-turut" di tab Hari Ini. Hanya untuk mode "wajib".
//   - "ingatkan": paling banyak MAKS_MODAL_PER_HARI kali sehari (jarak minimal JEDA_MODAL_MENIT), tidak ikut batas modal pengingat biasa.
//   - "ucapan": sekali saat runtutan tuntas.
// Catatan tampil disimpan di HP (localStorage, dibungkus try/catch); bila tidak bisa disimpan, modal tampil paling banyak sekali per pemuatan halaman.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTutupDenganBack } from "@/app/portal/useTutupDenganBack";
import { alamatVanguard } from "@/lib/vanguard/navigasi";
import { teksRuntutan, type RuntutanKartu } from "@/lib/vanguardPelatihan";
import { catatModalTampil, putuskanModal, segarkanCatatan, urlSertifikasiVg, type CatatanModalVg, type KeputusanModal } from "@/lib/vanguardPengingat";

const kunciSimpan = (kegiatanId: number): string => `sigap-vg-modal-${kegiatanId}`;
const baca = (kegiatanId: number): unknown => {
  try { return JSON.parse(window.localStorage.getItem(kunciSimpan(kegiatanId)) ?? "null"); } catch { return null; }
};
const simpan = (kegiatanId: number, c: CatatanModalVg): void => {
  try { window.localStorage.setItem(kunciSimpan(kegiatanId), JSON.stringify(c)); } catch { /* tanpa penyimpanan: tampil sekali per pemuatan */ }
};

export default function ModalVanguardWajib({ kegiatanId, runtutan }: { kegiatanId: number; runtutan: RuntutanKartu }) {
  const [putusan, setPutusan] = useState<KeputusanModal | null>(null);

  useEffect(() => {
    const sekarang = Date.now();
    const catatan = segarkanCatatan(baca(kegiatanId), sekarang);
    const p = putuskanModal(runtutan.mode, runtutan, catatan, sekarang);
    if (!p.tampil) return;
    simpan(kegiatanId, catatModalTampil(catatan, p.tampil, sekarang));
    setPutusan(p);
  }, [kegiatanId, runtutan]);

  const tutup = () => setPutusan(null);
  useTutupDenganBack(putusan !== null, tutup);
  if (!putusan?.tampil) return null;

  const ucapan = putusan.tampil === "ucapan";
  const sertifikasi = putusan.kejadian === "sertifikasi"; // (3 Nov 2026) Latihan wajib tuntas, tinggal Sertifikasi wajib
  const t = teksRuntutan(runtutan);
  const href = alamatVanguard({ kegiatan: kegiatanId, dari: typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}` });
  const N = runtutan.hari_berturut;
  const hrefSertif = `${urlSertifikasiVg(kegiatanId)}&dari=${encodeURIComponent(typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`)}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="vg-modal-judul" onClick={tutup}>
      <div className="w-full max-w-[420px] rounded-[20px] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <b id="vg-modal-judul" className="block text-[17px] font-extrabold leading-snug text-[#2A1763]">
          {ucapan ? "Selamat, Menu wajib Vanguard selesai" : sertifikasi ? "Tinggal Sertifikasi wajib" : runtutan.terputus ? "Runtutan Vanguard terputus" : "Vanguard hari ini"}
        </b>
        <p className="mt-1.5 text-[14px] leading-snug text-[#333]">
          {ucapan ? `Latihan wajib ${N} hari dan Sertifikasi wajib sudah selesai. Pretest tidak lagi terkunci oleh Vanguard. Latihan bank soal tetap boleh dicoba sebanyak-banyaknya.` : sertifikasi ? "Latihan wajib sudah selesai. Kerjakan Sertifikasi wajib (sekitar 15 menit) agar Pretest terbuka." : t.ket}
        </p>
        {!ucapan && !sertifikasi && (
          <div className="mt-3 flex items-center gap-1.5" role="list" aria-label={t.judul}>
            {runtutan.petak.map((p, i) => (
              <span key={i} role="listitem" aria-label={`Hari ${i + 1}: ${p.status === "selesai" ? "selesai" : p.status === "hari_ini" ? "hari ini" : "belum"}`}
                className={`grid h-9 flex-1 place-items-center rounded-[10px] text-[12px] font-extrabold ${p.status === "selesai" ? "bg-[#3DDC97] text-[#06351F]" : p.status === "hari_ini" ? "border-2 border-[#FFC000] text-[#8A6100]" : "bg-[#EFEAFB] text-[#5B34C9]"}`}>
                {p.status === "selesai" ? "✓" : `H${i + 1}`}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={tutup} className="min-h-[44px] flex-1 rounded-[12px] border border-[#D6D0E8] bg-white text-[14px] font-bold text-[#2A1763]">{ucapan ? "Tutup" : "Nanti"}</button>
          {!ucapan && <Link href={sertifikasi ? hrefSertif : href} className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[12px] bg-[#FFC000] text-[14px] font-extrabold text-[#111]">{sertifikasi ? "Ke Sertifikasi wajib" : "Buka Menu wajib"}</Link>}
        </div>
      </div>
    </div>
  );
}
