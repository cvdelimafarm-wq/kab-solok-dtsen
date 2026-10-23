"use client";

// app/sigap/foto/page.tsx   ->  /sigap/foto?kegiatan=<id>
//
// (19 Okt 2026) Halaman Kamera SIGAP bagi petugas: tab Kamera | Foto saya | Periksa (PML/admin).
// Hanya kegiatan yang saklarnya 'kamera' dipakai di sini; kegiatan 'unggah' tetap memakai halaman unggah foto lama.

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TombolKembali from "@/app/components/TombolKembali";
import KameraSigap from "./KameraSigap";
import FotoSaya from "./FotoSaya";
import PeriksaFoto from "./PeriksaFoto";
import { ambilJson } from "./klien";
import { bacaSesi } from "@/app/portal/sesi";

type Mode = { bawaan: string; nama_saya?: string; kegiatan: { kegiatan_id: number; penugasan_id: number; nama: string; peran?: string; jenis?: string; jumlah_foto: number; mode: string }[] };
type Tab = "kamera" | "saya" | "periksa";

function Isi() {
  const router = useRouter();
  const sp = useSearchParams();
  const [mode, setMode] = useState<Mode | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("kamera");
  const [pilih, setPilih] = useState<number | null>(Number(sp.get("kegiatan")) || null);
  // (23 Okt 2026) ?nomor=N dari tombol "Ganti foto" pada panel nomor foto: jepretan berikutnya langsung menggantikan Foto N
  const nomorGanti = Number(sp.get("nomor")) || null;

  useEffect(() => {
    if (!bacaSesi()) return router.replace("/");
    ambilJson<Mode>("/api/sigap/foto/mode").then(setMode).catch((e: Error) => {
      if (e.message === "SESI_BERAKHIR") return router.replace("/");
      setGalat(e.message);
    });
  }, [router]);

  const kamera = (mode?.kegiatan ?? []).filter((k) => k.mode === "kamera");
  const aktif = kamera.find((k) => k.kegiatan_id === pilih) ?? kamera[0] ?? null;

  const TabBtn = ({ t, teks }: { t: Tab; teks: string }) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-[44px] flex-1 rounded-xl text-sm font-bold ${tab === t ? "bg-[#0F2A52] text-white" : "bg-white text-[#0F2A52] border border-[#C9D3E6]"}`}>{teks}</button>
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-3 bg-[#F3F6FC] px-4 py-4">
      <div>
        <TombolKembali tema="terang" />
      </div>
      <div role="tablist" aria-label="Bagian foto" className="flex gap-2">
        <TabBtn t="kamera" teks="Kamera" />
        <TabBtn t="saya" teks="Foto saya" />
        <TabBtn t="periksa" teks="Periksa" />
      </div>
      {galat && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-sm text-[#9B1C23]">{galat}</div>}
      {tab === "kamera" && (
        <>
          {mode && kamera.length === 0 && <div className="rounded-lg bg-[#FFF4D6] px-3 py-3 text-sm text-[#5E4300]">Belum ada kegiatan Anda yang memakai Kamera SIGAP. Gunakan Unggah foto seperti biasa.</div>}
          {kamera.length > 1 && (
            <label className="flex flex-col gap-1 text-xs font-bold text-[#0F2A52]">Kegiatan
              <select value={aktif?.kegiatan_id ?? ""} onChange={(e) => setPilih(Number(e.target.value))} className="min-h-[44px] rounded-lg border border-[#C9D3E6] bg-white px-2 text-sm font-normal">
                {kamera.map((k) => <option key={k.kegiatan_id} value={k.kegiatan_id}>{k.nama}</option>)}
              </select>
            </label>
          )}
          {aktif && <KameraSigap key={aktif.kegiatan_id} kegiatanId={aktif.kegiatan_id} namaKegiatan={aktif.nama} jumlahNomor={aktif.jumlah_foto} namaSaya={mode?.nama_saya ?? ""} peran={aktif.peran ?? ""} jenis={aktif.jenis ?? null} nomorGanti={nomorGanti} />}
        </>
      )}
      {tab === "saya" && <FotoSaya />}
      {tab === "periksa" && <PeriksaFoto />}
    </main>
  );
}

export default function HalamanFoto() {
  return (
    <Suspense fallback={<div className="p-4 text-sm">Memuat…</div>}>
      <Isi />
    </Suspense>
  );
}
