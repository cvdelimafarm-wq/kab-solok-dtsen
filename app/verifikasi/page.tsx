"use client";

// app/verifikasi/page.tsx   ->  /verifikasi?k=SGP-XXXX-XXXX-XXXX   (PUBLIK, tanpa login)
//
// (19 Okt 2026) Verifikasi foto Kamera SIGAP. Langkah 1: kode (atau QR yang membuka halaman ini dengan ?k=). Langkah 2: unggah foto untuk dibandingkan.
// Yang menentukan keaslian adalah catatan server; teks pada gambar hanya kunci untuk membukanya. Halaman ini tidak menampilkan koordinat tepat atau foto arsip.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { normalisasiKode } from "@/lib/sigapFoto";

type Catatan = { kode: string; waktu: string; waktu_dari_server: boolean; lokasi: string | null; kegiatan: string | null; pengambil: string | null; dalam_pemeriksaan: boolean; berkas_dihapus: boolean };
type Jawab = { ada?: boolean; hasil?: "cocok" | "mirip" | "beda"; pesan?: string; catatan?: Catatan; error?: string; kode?: string };

function Isi() {
  const sp = useSearchParams();
  const awal = sp.get("k") ?? "";
  const [kode, setKode] = useState(awal);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [j, setJ] = useState<Jawab | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function periksa(k: string, f: File | null) {
    setSibuk(true);
    setJ(null);
    try {
      const norm = normalisasiKode(k);
      let res: Response;
      if (f) {
        const form = new FormData();
        form.append("berkas", f);
        if (k.trim()) form.append("k", k.trim());
        res = await fetch("/api/verifikasi-foto", { method: "POST", body: form });
      } else {
        if (!norm) return setJ({ error: "Kode tidak valid. Format: SGP-XXXX-XXXX-XXXX." });
        res = await fetch(`/api/verifikasi-foto?k=${encodeURIComponent(norm)}`);
      }
      setJ((await res.json().catch(() => ({ error: "Jawaban tidak terbaca." }))) as Jawab);
    } catch {
      setJ({ error: "Tidak ada sambungan." });
    } finally {
      setSibuk(false);
    }
  }

  useEffect(() => {
    if (awal && normalisasiKode(awal)) void periksa(awal, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gaya = j?.hasil === "cocok" || (j?.ada && !j.hasil) ? "bg-[#E3F6EC] text-[#0B6B3F]" : j?.hasil === "mirip" ? "bg-[#FFF4D6] text-[#5E4300]" : "bg-[#FDE8E8] text-[#9B1C23]";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 bg-[#F3F6FC] px-4 py-6 text-[#13264A]">
      <header>
        <div className="text-xs font-bold tracking-widest text-[#8A6200]">SIGAP · BPS KABUPATEN SOLOK</div>
        <h1 className="text-2xl font-extrabold text-[#0F2A52]">Verifikasi foto</h1>
        <p className="mt-1 text-sm text-[#3C4C68]">Masukkan kode pada cap foto (atau pindai QR-nya), lalu bila perlu unggah foto untuk dibandingkan.</p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); void periksa(kode, berkas); }} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-bold text-[#0F2A52]">1 · Kode verifikasi
          <input value={kode} onChange={(e) => setKode(e.target.value)} placeholder="SGP-XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="min-h-[48px] rounded-xl border border-[#C9D3E6] px-3 text-base font-semibold tracking-wide" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-[#0F2A52]">2 · Foto yang diterima (opsional)
          <input type="file" accept="image/*" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} className="min-h-[48px] rounded-xl border border-[#C9D3E6] bg-white px-2 py-2 text-sm font-normal" />
        </label>
        <button type="submit" disabled={sibuk || (!kode.trim() && !berkas)} className="min-h-[52px] rounded-xl bg-[#0F2A52] text-sm font-extrabold text-white disabled:opacity-40">{sibuk ? "Memeriksa…" : "Periksa"}</button>
      </form>

      {j && (
        <section role="status" aria-live="polite" className={`flex flex-col gap-2 rounded-2xl px-4 py-3 text-sm ${gaya}`}>
          {j.error && <div className="font-bold">{j.error}</div>}
          {j.ada === false && <div className="font-bold">{j.pesan ?? "Kode ini tidak ditemukan di catatan SIGAP."}</div>}
          {j.pesan && j.ada !== false && <div className="font-bold">{j.pesan}</div>}
          {j.ada && !j.pesan && <div className="font-bold">Kode tercatat di SIGAP.</div>}
          {j.catatan && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="font-bold">Kode</dt><dd>{j.catatan.kode}</dd>
              <dt className="font-bold">Waktu</dt><dd>{j.catatan.waktu}{j.catatan.waktu_dari_server ? "" : " (jam server saat diterima)"}</dd>
              <dt className="font-bold">Kegiatan</dt><dd>{j.catatan.kegiatan ?? "-"}</dd>
              <dt className="font-bold">Pengambil</dt><dd>{j.catatan.pengambil ?? "-"}</dd>
              {j.catatan.lokasi && <><dt className="font-bold">Wilayah</dt><dd>{j.catatan.lokasi}</dd></>}
            </dl>
          )}
          {j.catatan?.dalam_pemeriksaan && <div className="font-bold">Foto ini sedang dalam pemeriksaan.</div>}
          {j.catatan?.berkas_dihapus && <div>Berkas foto arsip sudah dihapus; catatan tetap tersimpan.</div>}
        </section>
      )}

      <p className="text-xs leading-relaxed text-[#3C4C68]">Yang menentukan keaslian adalah catatan server SIGAP. Teks pada gambar hanyalah kunci untuk membukanya. Koordinat tepat dan foto arsip hanya dapat dilihat petugas berwenang setelah masuk.</p>
    </main>
  );
}

export default function HalamanVerifikasi() {
  return (
    <Suspense fallback={<div className="p-4 text-sm">Memuat…</div>}>
      <Isi />
    </Suspense>
  );
}
