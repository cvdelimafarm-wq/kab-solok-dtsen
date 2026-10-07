"use client";

// app/sigap/admin/ResetPin.tsx
//
// (7 Okt 2026) Dialog "Reset PIN" untuk admin: konfirmasi -> server membuat PIN SEMENTARA 4 digit (tampil sekali,
// berlaku 24 jam; petugas wajib menggantinya saat masuk). Disertai pesan WhatsApp siap kirim (dikirim manual oleh admin).
// Dipakai di Kelola Pelatihan > Monitoring > Akses Pelatihan dan di Kelola Peran & Akses > Log Login.

import { useEffect, useRef, useState } from "react";
import { fetchJson, pesanGalat, SesiBerakhir, waktuWib } from "./api";

type Hasil = { pin: string; nama: string; sampai: string; hp: string | null };

/** Nomor HP -> tautan WhatsApp (628…) dengan teks terisi. Hanya membuka WhatsApp; pesan dikirim sendiri oleh admin. */
function tautanWa(hp: string, teks: string) {
  const d = hp.replace(/\D/g, "");
  const n = d.startsWith("0") ? `62${d.slice(1)}` : d.startsWith("62") ? d : `62${d}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(teks)}`;
}

export default function ResetPin({ url, akunId, nama, hp, tutup, sesudah }: { url: string; akunId: number; nama: string; hp?: string | null; tutup: () => void; sesudah?: () => void }) {
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [tersalin, setTersalin] = useState(false);
  const tombol = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    tombol.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !sibuk && tutup();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [tutup, sibuk]);

  async function reset() {
    setSibuk(true);
    setGalat(null);
    try {
      const r = await fetchJson<{ ok: boolean } & Hasil>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi: "reset_pin", akun_id: akunId }) });
      setHasil({ pin: r.pin, nama: r.nama, sampai: r.sampai, hp: r.hp ?? hp ?? null });
      sesudah?.();
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    } finally {
      setSibuk(false);
    }
  }

  const pesan = hasil
    ? `Halo ${hasil.nama}, PIN sementara SIGAP Anda: ${hasil.pin}\n\nBerlaku sampai ${waktuWib(hasil.sampai)}. Masuk di ${typeof window !== "undefined" ? window.location.origin : ""} dengan nama lengkap + PIN ini, lalu Anda akan diminta membuat PIN baru. Jangan bagikan PIN ini kepada siapa pun.`
    : "";

  async function salin() {
    try {
      await navigator.clipboard.writeText(pesan);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2500);
    } catch {
      setGalat("Gagal menyalin. Salin manual dari kotak pesan.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => !sibuk && tutup()}>
      <div role="dialog" aria-modal="true" aria-labelledby="judul-reset-pin" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="judul-reset-pin" className="text-[17px] font-extrabold text-[#14202E]">
          🔑 Reset PIN
        </h2>
        {!hasil ? (
          <>
            <p className="mt-2 text-[14px] leading-relaxed text-[#14202E]">
              Reset PIN <b>{nama}</b>? PIN lama langsung tidak berlaku. Sistem membuat <b>PIN sementara</b> yang berlaku 24 jam; petugas akan diminta membuat PIN baru saat masuk.
            </p>
            {galat && <p className="mt-2 rounded-lg bg-[#FDECEA] px-3 py-2 text-[13px] font-semibold text-[#8A2B1D]">{galat}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={tutup} disabled={sibuk} className="flex-1 rounded-xl border border-[#CDD5DE] bg-white px-4 py-2.5 text-[14px] font-bold text-[#14202E] hover:bg-[#F8FAFC] disabled:opacity-50">
                Batal
              </button>
              <button ref={tombol} type="button" onClick={reset} disabled={sibuk} className="flex-1 rounded-xl bg-[#1F6FD1] px-4 py-2.5 text-[14px] font-extrabold text-white hover:bg-[#1A5DB0] disabled:opacity-60">
                {sibuk ? "Memproses…" : "Buat PIN sementara"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[13.5px] text-[#55657D]">PIN sementara untuk <b className="text-[#14202E]">{hasil.nama}</b> — hanya tampil sekarang:</p>
            <p className="my-2 rounded-xl bg-[#F3F8FF] py-3 text-center text-[34px] font-extrabold tracking-[0.35em] text-[#0F3D7A]" aria-label="PIN sementara">
              {hasil.pin}
            </p>
            <p className="text-[12.5px] text-[#55657D]">Berlaku sampai {waktuWib(hasil.sampai)}. Kirim ke petugas lewat WhatsApp; PIN ini tidak disimpan dalam bentuk terbaca.</p>
            <textarea readOnly value={pesan} rows={5} className="mt-2 w-full rounded-lg border border-[#CDD5DE] bg-[#F8FAFC] p-2 text-[12.5px] text-[#14202E]" />
            {galat && <p className="mt-1 text-[12.5px] font-semibold text-[#C0392B]">{galat}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={salin} className="flex-1 rounded-xl border border-[#CDD5DE] bg-white px-3 py-2.5 text-[13.5px] font-bold text-[#14202E] hover:bg-[#F8FAFC]">
                {tersalin ? "✓ Tersalin" : "📋 Salin pesan"}
              </button>
              {hasil.hp && (
                <a href={tautanWa(hasil.hp, pesan)} target="_blank" rel="noreferrer" className="flex-1 rounded-xl bg-[#1E7A4C] px-3 py-2.5 text-center text-[13.5px] font-extrabold text-white hover:bg-[#17623C]">
                  Buka WhatsApp
                </a>
              )}
            </div>
            <button ref={tombol} type="button" onClick={tutup} className="mt-2 w-full rounded-xl bg-[#14202E] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-[#0B1520]">
              Selesai
            </button>
          </>
        )}
      </div>
    </div>
  );
}
