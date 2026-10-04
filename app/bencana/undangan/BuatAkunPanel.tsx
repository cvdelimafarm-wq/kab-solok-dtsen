"use client";

import { useState } from "react";

// (4 Okt 2026) Panel "Buat Akun" (nama + PIN 4 digit) -- tampil di halaman
// konfirmasi biasa & tawaran menginap SETELAH petugas menyatakan bersedia.
// Grup WhatsApp baru dibuka setelah akun dibuat (waUrl dikirim server hanya
// jika akun sudah ada). Akun dipakai untuk masuk lagi lewat /undangan.

type Props = {
  jenis: "biasa" | "menginap" | "pml";
  token: string;
  nama: string;
  punyaAkun: boolean;
  waUrl: string | null;
  onSelesai: () => void | Promise<void>;
};

export default function BuatAkunPanel({ jenis, token, nama, punyaAkun, waUrl, onSelesai }: Props) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pin)) return setError("PIN harus 4 digit angka.");
    if (pin !== pin2) return setError("Konfirmasi PIN tidak sama.");
    setBusy(true);
    try {
      const res = await fetch("/api/bencana/undangan/akun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jenis, token, pin }),
      });
      const json = await res.json();
      if (!res.ok) setError(json?.error ?? "Gagal membuat akun.");
      else await onSelesai();
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi internet.");
    } finally {
      setBusy(false);
    }
  }

  const tombolWa = waUrl ? (
    <a
      href={waUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#1E7A4C] px-4 py-3 text-[15px] font-extrabold text-white shadow-sm hover:bg-[#176540]"
    >
      Gabung Grup WhatsApp Petugas
    </a>
  ) : null;

  if (punyaAkun) {
    return (
      <section id="kartu-buat-pin" className="scroll-mt-4 rounded-[14px] border border-[#CFE3D7] bg-[#F1FAF5] p-4 text-sm text-[#1E5E3C] shadow-sm">
        <p className="text-[16px] font-extrabold">✓ Akun Anda sudah dibuat</p>
        <p className="mt-1 leading-relaxed">
          Untuk membuka halaman ini lagi, masuk lewat link undangan dengan nama <b>{nama}</b> dan PIN Anda.
        </p>
        {tombolWa && (
          <>
            <p className="mt-3 font-semibold">Langkah berikutnya: silakan gabung ke grup WhatsApp petugas.</p>
            {tombolWa}
          </>
        )}
      </section>
    );
  }

  return (
    <section id="kartu-buat-pin" className="scroll-mt-4 rounded-[14px] border-2 border-[#0F3D7A]/20 bg-white p-4 shadow-sm">
      <h2 className="text-[17px] font-extrabold text-[#13213A]">Buat akun Anda</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[#44546C]">
        Terima kasih sudah bersedia. Buat PIN 4 digit sebagai akun (nama: <b>{nama}</b>). Setelah itu Anda dapat bergabung ke grup WhatsApp petugas.
      </p>
      <form onSubmit={simpan} className="mt-3 flex flex-col gap-2">
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="PIN 4 digit"
          autoComplete="new-password"
          className="rounded-lg border border-[#D5DDE8] px-3 py-2.5 text-[15px] outline-none focus:border-[#0F3D7A]"
        />
        <input
          type="password"
          inputMode="numeric"
          value={pin2}
          onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="Ulangi PIN"
          autoComplete="new-password"
          className="rounded-lg border border-[#D5DDE8] px-3 py-2.5 text-[15px] outline-none focus:border-[#0F3D7A]"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-[46px] rounded-xl bg-[#0F3D7A] px-4 py-2.5 text-[15px] font-extrabold text-white disabled:opacity-60"
        >
          {busy ? "Menyimpan…" : "Buat Akun"}
        </button>
        {error && <p className="text-xs font-semibold text-[#C0392B]">{error}</p>}
        <p className="text-[11px] text-[#55657D]">Ingat PIN Anda. Jika lupa, hubungi admin.</p>
      </form>
    </section>
  );
}
