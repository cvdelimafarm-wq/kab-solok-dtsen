"use client";

// app/portal/GantiPinCepat.tsx
//
// (8 Okt 2026) Ganti PIN awal bersama (1303) dengan PIN sendiri -- satu layar, ±10 detik: ketik PIN baru, ulangi,
// otomatis tersimpan begitu kedua isian 4 digit dan sama. Dipakai sesudah masuk (Masuk.tsx) dan dari beranda (Beranda.tsx).

import { useEffect, useRef, useState } from "react";
import { PIN_AWAL, alasanPinDitolak } from "@/lib/sigapMasukNama";
import { bacaSesi } from "./sesi";

const INPUT = "h-14 w-full rounded-lg border border-[#CDD5DE] bg-white px-3.5 text-center text-[24px] tracking-[0.5em] text-[#14202E] outline-none transition focus:border-[#1F6FD1] focus:ring-4 focus:ring-[#1F6FD1]/10";

/**
 * `sesi` = token sesi (bila belum disimpan di browser, mis. sesaat setelah masuk). Kosong -> memakai sesi tersimpan.
 * `onSelesai` dipanggil setelah PIN tersimpan; `onNanti` bila pegawai memilih "Nanti saja".
 */
export default function GantiPinCepat({ sesi, onSelesai, onNanti, kartu = true }: { sesi?: string; onSelesai: () => void; onNanti: () => void; kartu?: boolean }) {
  const [pin1, setPin1] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [berhasil, setBerhasil] = useState(false);
  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref1.current?.focus();
  }, []);

  async function simpan(a: string, b: string) {
    if (busy) return;
    setError(null);
    const tolak = alasanPinDitolak(a);
    if (tolak) {
      setError(tolak);
      setPin2("");
      ref1.current?.focus();
      return;
    }
    if (a !== b) {
      setError("Kedua isian PIN belum sama. Ketik ulang PIN pada kolom kedua.");
      setPin2("");
      ref2.current?.focus();
      return;
    }
    const token = sesi ?? bacaSesi();
    if (!token) {
      setError("Sesi berakhir. Masuk ulang lalu coba lagi.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/sigap/masuk", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ aksi: "ganti_pin_awal", pin: a }) });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // PIN sudah bukan PIN awal -> anggap selesai
        onSelesai();
        return;
      }
      if (!res.ok || !j.ok) {
        setError(j.error ?? "PIN belum tersimpan. Coba lagi.");
        return;
      }
      setBerhasil(true);
      setTimeout(onSelesai, 1100);
    } catch {
      setError("Gagal terhubung. Periksa koneksi internet lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const isi = berhasil ? (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E3F4EE] text-[26px] text-[#1E7A4C]" aria-hidden>✓</span>
      <p className="text-[17px] font-bold text-[#1E7A4C]">PIN berhasil diganti</p>
      <p className="text-[13px] text-[#4D5B6B]">Gunakan PIN baru ini saat masuk berikutnya.</p>
    </div>
  ) : (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        simpan(pin1, pin2);
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="text-[20px] font-bold leading-tight">Ganti PIN {PIN_AWAL} sekarang</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#4D5B6B]">
          Anda masih memakai PIN awal <b>{PIN_AWAL}</b> yang sama dengan pegawai lain, sehingga orang lain bisa masuk memakai akun Anda. Buat PIN 4 digit milik Anda sendiri (±10 detik).
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pin-cepat-1" className="text-[13px] font-semibold text-[#4D5B6B]">PIN baru (4 digit)</label>
        <input
          ref={ref1}
          id="pin-cepat-1"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          className={INPUT}
          value={pin1}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setPin1(v);
            setError(null);
            if (v.length === 4) ref2.current?.focus();
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pin-cepat-2" className="text-[13px] font-semibold text-[#4D5B6B]">Ketik ulang PIN baru</label>
        <input
          ref={ref2}
          id="pin-cepat-2"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={4}
          className={INPUT}
          value={pin2}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setPin2(v);
            setError(null);
            if (v.length === 4 && pin1.length === 4) simpan(pin1, v); // otomatis simpan begitu lengkap
          }}
        />
      </div>
      <p className="text-[12px] text-[#7B8794]">Hindari angka berurutan atau berulang (1111, 1234). Catat PIN Anda di tempat yang aman.</p>
      {error && <p className="rounded-lg border-l-4 border-[#C2412D] bg-[#FDECEA] px-3 py-2 text-[13px] text-[#8A2B1D]" role="alert">{error}</p>}
      <button type="submit" disabled={busy || pin1.length !== 4 || pin2.length !== 4} className="h-12 rounded-lg bg-[#1E7A4C] text-[15px] font-semibold text-white transition hover:bg-[#17623C] disabled:opacity-50">
        {busy ? "Menyimpan..." : "Simpan PIN baru"}
      </button>
      <button type="button" onClick={onNanti} disabled={busy} className="text-[13px] text-[#7B8794] underline underline-offset-2 hover:text-[#4D5B6B]">
        Nanti saja
      </button>
    </form>
  );

  if (!kartu) return isi;
  return <div className="w-full max-w-[400px] rounded-[14px] border border-[#E3E8EE] bg-white p-7 text-[#14202E]">{isi}</div>;
}
