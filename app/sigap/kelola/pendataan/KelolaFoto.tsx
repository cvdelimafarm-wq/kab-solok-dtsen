"use client";

// app/sigap/kelola/pendataan/KelolaFoto.tsx  (isi halaman /sigap/kelola/foto; 23 Okt 2026 dipindah ke komponen agar bisa disematkan di tab Pemeriksaan Kelola Pendataan)
//
// (19 Okt 2026) Kelola > Foto kamera. Hanya akun super / izin MENU_ADMIN_FOTO (lib/sigapFotoServer.ts).
//  1. Saklar: bawaan global + per kegiatan (Ikuti bawaan / Kamera SIGAP / Unggah foto). Dimatikan = kembali ke unggah foto lama.
//  2. Foto perlu diperiksa (kuning/merah belum ditandai).
//  3. Masa simpan & usulan hapus: sistem TIDAK menghapus. Admin mengusulkan, akun super menyetujui, lalu pemilik menghapus berkas manual.

import { useCallback, useEffect, useState } from "react";
import TombolKembali from "@/app/components/TombolKembali";
import { useRouter } from "next/navigation";
import { ambilJson } from "@/app/sigap/foto/klien";
import PeriksaFoto from "@/app/sigap/foto/PeriksaFoto";
import { bacaSesi } from "@/app/portal/sesi";
import { MASA_SIMPAN_TAHUN } from "@/lib/sigapFoto";

type Kegiatan = { id: number; kode: string; nama: string; jenis: string; mode: "ikuti" | "kamera" | "unggah"; efektif: "kamera" | "unggah" };
type Pengaturan = { bawaan: "kamera" | "unggah"; kegiatan: Kegiatan[] };
type FotoHapus = { id: number; kode: string; kegiatan_id: number; tanggal: string; simpan_sampai: string | null; ukuran_byte: number | null; file_path: string; usul_hapus_at: string | null; hapus_disetujui_at: string | null; dipakai_bukti: boolean };
type Usulan = { kedaluwarsa: FotoHapus[]; tanpa_tag: FotoHapus[]; diusulkan: FotoHapus[]; disetujui: FotoHapus[]; akun_super: boolean };

const URUT = { ikuti: "kamera", kamera: "unggah", unggah: "ikuti" } as const;
const LABEL = { ikuti: "Ikuti bawaan", kamera: "Kamera SIGAP", unggah: "Unggah foto" } as const;
const kb = (n: number | null) => (n ? `${Math.round(n / 1024)} KB` : "-");

function Daftar({ judul, ket, baris, aksi, muat, super_ }: { judul: string; ket: string; baris: FotoHapus[]; aksi: "usul" | "setuju" | "batal" | null; muat: () => void; super_: boolean }) {
  const [pilih, setPilih] = useState<number[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const bisa = aksi !== null && (aksi !== "setuju" || super_);
  async function jalan(a: "usul" | "setuju" | "batal") {
    setSibuk(true);
    setPesan(null);
    try {
      await ambilJson("/api/sigap/foto/usulan-hapus", { method: "POST", body: { aksi: a, foto_ids: pilih } });
      setPilih([]);
      muat();
    } catch (e) {
      setPesan((e as Error).message);
    } finally {
      setSibuk(false);
    }
  }
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <h3 className="text-sm font-extrabold text-[#0F2A52]">{judul} ({baris.length})</h3>
      <p className="text-xs text-[#3C4C68]">{ket}</p>
      {baris.length === 0 && <div className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs text-[#3C4C68]">Tidak ada.</div>}
      <ul className="flex flex-col gap-1">
        {baris.map((f) => (
          <li key={f.id}>
            <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-[#E1E7F2] px-3 py-2 text-xs text-[#33425E]">
              {bisa && <input type="checkbox" className="h-5 w-5 accent-[#0F2A52]" checked={pilih.includes(f.id)} onChange={() => setPilih((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))} />}
              <span className="min-w-0 flex-1">
                <b className="text-[#0F2A52]">{f.kode}</b> · {f.tanggal} · {kb(f.ukuran_byte)}{f.simpan_sampai ? ` · simpan s.d. ${f.simpan_sampai}` : ""}
                {f.dipakai_bukti && <span className="ml-2 rounded-full bg-[#FFF4D6] px-2 py-0.5 font-bold text-[#8A6200]">dipakai sebagai bukti</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {pesan && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-xs text-[#9B1C23]">{pesan}</div>}
      {bisa && baris.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {aksi === "usul" && <button type="button" disabled={sibuk || !pilih.length} onClick={() => void jalan("usul")} className="min-h-[44px] rounded-xl bg-[#0F2A52] px-4 text-sm font-bold text-white disabled:opacity-40">Usulkan hapus ({pilih.length})</button>}
          {aksi === "setuju" && <button type="button" disabled={sibuk || !pilih.length} onClick={() => void jalan("setuju")} className="min-h-[44px] rounded-xl bg-[#0F2A52] px-4 text-sm font-bold text-white disabled:opacity-40">Setujui dihapus ({pilih.length})</button>}
          {(aksi === "setuju" || aksi === "batal") && <button type="button" disabled={sibuk || !pilih.length} onClick={() => void jalan("batal")} className="min-h-[44px] rounded-xl border-2 border-[#C9D3E6] px-4 text-sm font-bold text-[#0F2A52] disabled:opacity-40">Batalkan usulan</button>}
        </div>
      )}
    </section>
  );
}

export default function KelolaFoto({ tertanam = false }: { tertanam?: boolean }) {
  const router = useRouter();
  const [p, setP] = useState<Pengaturan | null>(null);
  const [u, setU] = useState<Usulan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(() => {
    if (!bacaSesi()) return router.replace("/");
    Promise.all([ambilJson<Pengaturan>("/api/sigap/foto/pengaturan"), ambilJson<Usulan>("/api/sigap/foto/usulan-hapus")])
      .then(([a, b]) => { setP(a); setU(b); setGalat(null); })
      .catch((e: Error) => {
        if (e.message === "SESI_BERAKHIR") return router.replace("/");
        setGalat(e.message);
      });
  }, [router]);
  useEffect(muat, [muat]);

  async function simpan(body: Record<string, unknown>) {
    setSibuk(true);
    try {
      await ambilJson("/api/sigap/foto/pengaturan", { method: "POST", body });
      muat();
    } catch (e) {
      setGalat((e as Error).message);
    } finally {
      setSibuk(false);
    }
  }

  if (galat && !p) return <div className={tertanam ? "" : "mx-auto max-w-3xl p-4"}><div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-sm text-[#9B1C23]">{galat}</div><div className="mt-3"><TombolKembali tema="terang" induk="/sigap/kelola/pendataan?tab=pemeriksaan" /></div></div>;
  if (!p || !u) return <div className={tertanam ? "text-sm" : "p-4 text-sm"}>Memuat…</div>;

  const seg = (on: boolean) => `min-h-[48px] flex-1 rounded-xl border-2 px-3 text-sm font-extrabold ${on ? "border-[#0F2A52] bg-[#0F2A52] text-white" : "border-[#C9D3E6] bg-white text-[#0F2A52]"}`;

  return (
    <div className={tertanam ? "flex w-full flex-col gap-4" : "mx-auto flex w-full max-w-3xl flex-col gap-4 bg-[#F3F6FC] px-4 py-5"}>
      {!tertanam && (
      <header>
        <TombolKembali tema="terang" induk="/sigap/kelola/pendataan?tab=pemeriksaan" className="mb-2" />
        <div className="text-xs font-bold tracking-widest text-[#8A6200]">KELOLA · FOTO KAMERA</div>
        <h1 className="text-2xl font-extrabold text-[#0F2A52]">Saklar Kamera SIGAP</h1>
      </header>
      )}
      {galat && <div role="alert" className="rounded-lg bg-[#FDE8E8] px-3 py-2 text-sm text-[#9B1C23]">{galat}</div>}

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-extrabold text-[#0F2A52]">Bawaan untuk semua kegiatan</h2>
        <div role="group" aria-label="Mode foto bawaan" className="flex gap-2">
          <button type="button" aria-pressed={p.bawaan === "kamera"} disabled={sibuk} onClick={() => void simpan({ bawaan: "kamera" })} className={seg(p.bawaan === "kamera")}>Kamera SIGAP (baru)</button>
          <button type="button" aria-pressed={p.bawaan === "unggah"} disabled={sibuk} onClick={() => void simpan({ bawaan: "unggah" })} className={seg(p.bawaan === "unggah")}>Unggah foto (lama)</button>
        </div>
        <p className="rounded-lg bg-[#EEF2F7] px-3 py-2 text-xs leading-relaxed text-[#33425E]">Berlaku untuk foto berikutnya. Foto yang sudah ada tidak berubah dan tidak dihapus. Dimatikan = layar petugas kembali ke tombol Unggah foto yang sekarang. Setiap perubahan dicatat (siapa, kapan, dari apa ke apa).</p>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-extrabold text-[#0F2A52]">Per kegiatan</h2>
        <ul className="flex flex-col">
          {p.kegiatan.map((k) => (
            <li key={k.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[#E6ECF6] py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-[#0F2A52]">{k.nama}</div>
                <div className="text-xs text-[#3C4C68]">Berlaku: <b>{k.efektif === "kamera" ? "Kamera SIGAP" : "Unggah foto (lama)"}</b></div>
              </div>
              <button type="button" disabled={sibuk} onClick={() => void simpan({ kegiatan: [{ kegiatan_id: k.id, mode: URUT[k.mode] }] })} aria-label={`Ganti pengaturan ${k.nama}, sekarang ${LABEL[k.mode]}`} className="min-h-[44px] rounded-xl border-2 border-[#C9D3E6] bg-[#F3F6FC] px-3 text-sm font-bold text-[#0F2A52]">{LABEL[k.mode]} ⇅</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-extrabold text-[#0F2A52]">Foto yang perlu diperiksa</h2>
        <PeriksaFoto />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-extrabold text-[#0F2A52]">Masa simpan ({MASA_SIMPAN_TAHUN} tahun) dan penghapusan</h2>
        <p className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs leading-relaxed text-[#5E4300]">Sistem tidak pernah menghapus foto sendiri. Daftar di bawah hanya menandai. Foto baru dihapus setelah persetujuan akun super; berkas fisik dihapus manual oleh pemilik (lihat panduan), lalu kolom file_dihapus_at diisi.</p>
        <Daftar judul="Masa simpan habis" ket={`Sudah lewat ${MASA_SIMPAN_TAHUN} tahun sejak kegiatan selesai.`} baris={u.kedaluwarsa} aksi="usul" muat={muat} super_={u.akun_super} />
        <Daftar judul="Tidak pernah dipakai sebagai nomor foto" ket="Lebih dari 90 hari dan tidak diterima siapa pun." baris={u.tanpa_tag} aksi="usul" muat={muat} super_={u.akun_super} />
        <Daftar judul="Diusulkan dihapus" ket={u.akun_super ? "Menunggu persetujuan Anda." : "Menunggu persetujuan akun super."} baris={u.diusulkan} aksi={u.akun_super ? "setuju" : "batal"} muat={muat} super_={u.akun_super} />
        <Daftar judul="Disetujui, berkas belum dihapus" ket="Hapus berkas fisik secara manual sesuai panduan, lalu catat file_dihapus_at." baris={u.disetujui} aksi={u.akun_super ? "batal" : null} muat={muat} super_={u.akun_super} />
      </section>
    </div>
  );
}
