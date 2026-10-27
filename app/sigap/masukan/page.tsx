"use client";

// app/sigap/masukan/page.tsx
//
// (28 Okt 2026) Lembar masukan: menu cadangan tombol "Masukan" melayang (Beranda > Menu umum, menu akun/sidebar SIGAP). Semua akun yang masuk.
// Atas: isian masukan (FormMasukan). Bawah: "Masukan saya" -- status & catatan admin tiap masukan yang pernah dikirim.

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, keMasuk } from "../admin/api";
import { ambilJson } from "../foto/klien";
import FormMasukan from "@/app/components/FormMasukan";
import TombolKembali from "@/app/components/TombolKembali";
import { LABEL_JENIS, LABEL_STATUS, adalahJenis, adalahStatus } from "@/lib/sigapMasukan";

type Saya = { id: number; jenis: string; isi: string; halaman: string | null; ada_gambar: boolean; status: string; catatan_admin: string | null; dibuat_at: string; diubah_at: string };

const NADA: Record<string, string> = {
  baru: "bg-[#E3EEFB] text-[#1F5FD1]",
  dibaca: "bg-[#EEF1F5] text-[#4D5B6B]",
  diproses: "bg-[#FBEFD6] text-[#9A6200]",
  selesai: "bg-[#E3F6EC] text-[#13794B]",
  ditolak: "bg-[#F6E4E4] text-[#A13030]",
};

const tgl = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default function HalamanMasukan() {
  const [asal, setAsal] = useState<string | undefined>(undefined);
  const [daftar, setDaftar] = useState<Saya[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const d = await ambilJson<{ masukan: Saya[] }>("/api/sigap/masukan?saya=1");
      setDaftar(d.masukan);
      setGalat(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m === "SESI_BERAKHIR") return keMasuk();
      setGalat(m || "Gagal memuat masukan Anda.");
    }
  }, []);

  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    try {
      const d = new URLSearchParams(window.location.search).get("dari");
      if (d && d.startsWith("/") && !d.startsWith("//")) setAsal(d);
    } catch {
      /* tanpa halaman asal */
    }
    void muat();
  }, [muat]);

  return (
    <main className="min-h-screen bg-[#F5F8FE] pb-16 text-[#1B2B4B]">
      <header className="bg-gradient-to-b from-[#0F2A52] to-[#1A4590] px-4 pb-6 pt-3 text-white">
        <div className="mx-auto max-w-xl">
          <TombolKembali tema="gelap" induk="/" />
          <p className="mt-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#A9BCD8]">SIGAP</p>
          <h1 className="text-[22px] font-extrabold leading-tight">Kirim masukan</h1>
          <p className="mt-1 text-[13px] text-[#C7D6EE]">Laporkan masalah, usulkan perbaikan, atau ajukan pertanyaan. Admin akan membacanya.</p>
        </div>
      </header>

      <div className="mx-auto -mt-3 max-w-xl space-y-5 px-3.5">
        <section className="rounded-[20px] bg-white p-4 shadow-[0_10px_28px_rgba(15,42,82,.1)]" aria-label="Isian masukan">
          <FormMasukan halaman={asal} onSelesai={() => void muat()} />
        </section>

        <section aria-label="Masukan saya">
          <div className="mb-2 flex items-baseline gap-2 px-1">
            <h2 className="text-[15px] font-extrabold text-[#0F2A52]">Masukan saya</h2>
            {daftar && <span className="text-[11.5px] text-[#6B7A90]">{daftar.length} masukan</span>}
            <button type="button" onClick={() => void muat()} className="ml-auto min-h-[36px] px-2 text-[12.5px] font-bold text-[#1F5FD1]">
              Muat ulang
            </button>
          </div>
          {galat && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">{galat}</p>}
          {!daftar && !galat && <p className="px-1 text-[13px] text-[#6B7A90]">Memuat…</p>}
          {daftar && daftar.length === 0 && <p className="rounded-xl bg-white px-3 py-4 text-center text-[13px] text-[#6B7A90]">Belum ada masukan yang Anda kirim.</p>}
          <ul className="space-y-2">
            {(daftar ?? []).map((m) => (
              <li key={m.id} className="rounded-2xl border border-[#E3E8EE] bg-white p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[#EEF1F5] px-2 py-0.5 text-[11px] font-bold text-[#4D5B6B]">{adalahJenis(m.jenis) ? LABEL_JENIS[m.jenis] : m.jenis}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${NADA[m.status] ?? NADA.dibaca}`}>{adalahStatus(m.status) ? LABEL_STATUS[m.status] : m.status}</span>
                  <span className="ml-auto text-[11px] text-[#7B8794]">{tgl(m.dibuat_at)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-line break-words text-[13.5px] leading-snug">{m.isi}</p>
                {m.halaman && <p className="mt-1 text-[11px] text-[#7B8794]">Halaman: {m.halaman}</p>}
                {m.catatan_admin && (
                  <p className="mt-2 rounded-lg bg-[#F5F8FE] px-2.5 py-1.5 text-[12.5px] leading-snug text-[#1B2B4B]">
                    <b>Catatan admin:</b> {m.catatan_admin}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
