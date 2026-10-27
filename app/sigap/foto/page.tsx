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
import { bacaSesi, pemilikSesi } from "@/app/portal/sesi";
import { siapkanData, useData } from "@/app/portal/dataBersama";
import { galatSinyal, jalurFotoSaya } from "@/lib/sigapFotoCache";

type Mode = { bawaan: string; nama_saya?: string; kegiatan: { kegiatan_id: number; penugasan_id: number; nama: string; peran?: string; jenis?: string; jumlah_foto: number; mode: string }[] };
type Tab = "kamera" | "saya" | "periksa";

// (23 Okt 2026) Daftar kegiatan bermode kamera disimpan di HP tiap kali berhasil dimuat, supaya Kamera SIGAP tetap bisa dibuka di daerah tanpa sinyal.
// Hanya dipakai bila permintaan gagal karena TIDAK ADA SAMBUNGAN (bukan bila server menolak); saklar yang dimatikan terbaca lagi begitu ada sinyal.
const kunciMode = (akun: number) => `sigap-foto-mode:${akun}`;
function bacaModeTersimpan(): Mode | null {
  const akun = pemilikSesi();
  if (!akun) return null;
  try {
    const d = JSON.parse(localStorage.getItem(kunciMode(akun)) ?? "null") as Mode | null;
    return d && Array.isArray(d.kegiatan) ? d : null;
  } catch {
    return null;
  }
}
function simpanMode(d: Mode) {
  const akun = pemilikSesi();
  if (!akun) return;
  try {
    localStorage.setItem(kunciMode(akun), JSON.stringify(d));
  } catch {
    /* penyimpanan penuh/dimatikan */
  }
}

function Isi() {
  const router = useRouter();
  const sp = useSearchParams();
  // (27 Okt 2026) Mode kegiatan dari simpanan bersama (dataBersama.ts): kamera langsung tampil dari data terakhir, diperbarui diam-diam di belakang.
  // Dulu halaman menunggu jawaban server setiap dibuka, sehingga di sinyal lemah kamera terasa macet.
  const md = useData<Mode>("/api/sigap/foto/mode");
  const [cadangan, setCadangan] = useState<Mode | null>(null); // simpanan lama (kunci sigap-foto-mode) bila belum ada simpanan bersama dan tanpa sinyal
  const [tab, setTab] = useState<Tab>("kamera");
  const [pilih, setPilih] = useState<number | null>(Number(sp.get("kegiatan")) || null);
  // (23 Okt 2026) ?nomor=N dari tombol "Ganti foto" pada panel nomor foto: jepretan berikutnya langsung menggantikan Foto N
  const nomorGanti = Number(sp.get("nomor")) || null;

  useEffect(() => {
    if (!bacaSesi()) router.replace("/");
  }, [router]);
  useEffect(() => {
    if (md.galat === "SESI_BERAKHIR") router.replace("/");
  }, [md.galat, router]);
  useEffect(() => {
    if (md.data) simpanMode(md.data); // tetap ditulis: cadangan untuk HP yang belum punya simpanan bersama
  }, [md.data]);
  const galatMode = md.galat && md.galat !== "SESI_BERAKHIR" ? md.galat : null;
  const sinyalMati = !!galatMode && galatSinyal(galatMode, typeof navigator !== "undefined" ? navigator.onLine : undefined);
  useEffect(() => {
    if (!md.data && sinyalMati) setCadangan(bacaModeTersimpan());
  }, [md.data, sinyalMati]);
  const mode = md.data ?? cadangan;
  const tanpaSinyal = sinyalMati && !!mode; // daftar kegiatan dari simpanan di HP karena tidak ada sambungan
  const galat = !mode ? galatMode : null;

  // Daftar "Foto saya" disiapkan di belakang sesudah kamera tampil, supaya tab itu langsung terbuka berisi.
  useEffect(() => {
    if (!md.data) return;
    const t = setTimeout(() => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void siapkanData(jalurFotoSaya(false)).catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
  }, [md.data]);

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
      {tanpaSinyal && <div role="status" className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs font-semibold leading-snug text-[#5E4300]">Tidak ada sinyal. Kamera tetap bisa dipakai: foto tersimpan di HP dan terkirim otomatis saat ada sinyal.</div>}
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
