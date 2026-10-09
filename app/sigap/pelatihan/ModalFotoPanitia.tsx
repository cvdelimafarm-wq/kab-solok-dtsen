"use client";

// app/sigap/pelatihan/ModalFotoPanitia.tsx
//
// (9 Okt 2026) Pengingat panitia -- permintaan user: "upload foto pelatihan kemarin, pilih yang terbaik (maksimal 4 kelas x 4);
// tampilkan pop up/modal pesan ini dan berikan navigasi ke pengguna panitia".
// Tampil untuk akun yang boleh MENGELOLA Administrasi pelatihan (panitia, pengelola PSP, instruktur untuk kelasnya) selama
// masih ada kelas (dalam cakupannya) yang fotonya kurang dari 4. Tombol utama membuka Kelola Pelatihan > Administrasi
// langsung di kelas pertama yang belum lengkap, bagian foto. "Nanti" menyembunyikan sampai browser/aplikasi dibuka lagi.
// Dipasang di Beranda (/) dan Kelola Pelatihan.

import { useEffect, useRef, useState } from "react";
import { bacaSesi } from "@/app/sigap/admin/api";

type Ringkas = { boleh_kelola: boolean; maks: number; kelas: { kelas: number; jumlah: number }[] };
const KUNCI_NANTI = "sigap_ingat_foto_pelatihan_nanti";

export default function ModalFotoPanitia({ sembunyi = false }: { sembunyi?: boolean }) {
  const [d, setD] = useState<Ringkas | null>(null);
  const [tutup, setTutup] = useState(false);
  const tombol = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KUNCI_NANTI)) return;
    } catch {
      /* abaikan */
    }
    const sesi = bacaSesi();
    if (!sesi) return;
    fetch("/api/sigap/pelatihan/administrasi?bagian=foto_ringkas", { headers: { Authorization: `Bearer ${sesi}` }, cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Ringkas>) : null))
      .then((x) => x && setD(x))
      .catch(() => null); // tanpa izin / gagal -> tidak tampil apa-apa
  }, []);

  const kurang = d?.boleh_kelola ? d.kelas.filter((k) => k.jumlah < d.maks) : [];
  const tampil = !tutup && !sembunyi && kurang.length > 0;

  useEffect(() => {
    if (!tampil) return;
    tombol.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && nanti();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [tampil]);

  function nanti() {
    try {
      sessionStorage.setItem(KUNCI_NANTI, "1");
    } catch {
      /* abaikan */
    }
    setTutup(true);
  }

  if (!tampil || !d) return null;
  const tujuan = `/sigap/kelola/pelatihan?tab=administrasi&kelas=${kurang[0].kelas}&fokus=foto`;
  const totalMaks = d.kelas.length * d.maks;
  const totalAda = d.kelas.reduce((n, k) => n + Math.min(k.jumlah, d.maks), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={nanti}>
      <div role="dialog" aria-modal="true" aria-label="Unggah foto pelatihan" className="max-h-full w-full max-w-sm overflow-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF1CC] text-[20px]" aria-hidden>
            📷
          </span>
          <h2 className="min-w-0 flex-1 text-[18px] font-extrabold leading-tight text-[#8A6200]">Unggah foto pelatihan</h2>
        </div>
        <div className="mt-3 space-y-2 text-[14.5px] leading-relaxed text-[#1B2B4B]">
          <p>
            Mohon unggah foto <b>Pelatihan Petugas PSP Pascabencana (8 Oktober 2026)</b> dan pilih yang terbaik: <b>maksimal {d.maks} foto per kelas</b>
            {d.kelas.length > 1 ? ` (${d.kelas.length} kelas × ${d.maks} foto)` : ""}.
          </p>
          <p className="text-[13px] text-[#55657D]">Foto dipakai sebagai lampiran Laporan Pelatihan dan Laporan Instruktur.</p>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {d.kelas.map((k) => {
            const lengkap = k.jumlah >= d.maks;
            return (
              <li key={k.kelas}>
                <a
                  href={`/sigap/kelola/pelatihan?tab=administrasi&kelas=${k.kelas}&fokus=foto`}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-[13px] font-bold ${lengkap ? "border-[#BFE3CF] bg-[#EEF8F2] text-[#1E7A4C]" : "border-[#F1D9A6] bg-[#FFF8E8] text-[#8A6200]"}`}
                >
                  <span>Kelas {k.kelas}</span>
                  <span className="tabular-nums">{lengkap ? "✓ " : ""}{Math.min(k.jumlah, d.maks)}/{d.maks}</span>
                </a>
              </li>
            );
          })}
        </ul>
        {d.kelas.length > 1 && <p className="mt-2 text-[12px] text-[#6B7A90]">Terunggah {totalAda} dari {totalMaks} foto.</p>}
        <div className="mt-4 flex flex-col gap-2">
          <a ref={tombol} href={tujuan} className="flex w-full items-center justify-center rounded-xl bg-[#1F5FD1] px-4 py-3 text-center text-[14.5px] font-extrabold text-white shadow-sm hover:bg-[#1A4FB8]">
            Unggah foto Kelas {kurang[0].kelas} →
          </a>
          <button type="button" onClick={nanti} className="w-full rounded-xl border border-[#CBD6E6] bg-white px-4 py-2.5 text-[14px] font-bold text-[#1B2B4B] hover:bg-[#F5F8FE]">
            Nanti
          </button>
        </div>
      </div>
    </div>
  );
}
