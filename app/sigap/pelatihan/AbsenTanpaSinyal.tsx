"use client";
// app/sigap/pelatihan/AbsenTanpaSinyal.tsx
//
// (14 Nov 2026, luring 3d) Kartu "Absen tanpa sinyal" di tab Hari ini: tampil saat HP tanpa sinyal atau masih ada absen yang belum terkirim.
// Peserta mengetik kode yang dibacakan instruktur; kode + jam HP disimpan di HP dan dikirim otomatis saat tersambung (lib/sigapAbsenLuring.ts di server
// mencari sesinya dari kode dan jam ketik; paling lambat 24 jam).

import { useCallback, useEffect, useState } from "react";
import { bacaSesi, fetchJson, pesanGalat } from "../admin/api";
import { Kartu } from "../admin/ui";
import { galatJaringan, selisihJamServer, tandaPemilik } from "@/lib/luringSimpan";
import { bacaAbsenLuring, tambahAbsenLuring, tulisAbsenLuring, type AbsenLuring } from "@/lib/absenLuringHp";
import { KODE_PANJANG } from "@/lib/sigapAbsen";

const jam = (ms: number) => new Date(ms).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });

export default function AbsenTanpaSinyal({ onTerkirim }: { onTerkirim?: () => void }) {
  const [online, setOnline] = useState(true);
  const [daftar, setDaftar] = useState<AbsenLuring[]>([]);
  const [kode, setKode] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const pemilik = typeof window === "undefined" ? "" : tandaPemilik(bacaSesi());

  const segarkan = useCallback(() => setDaftar(bacaAbsenLuring(localStorage, pemilik)), [pemilik]);

  const kirim = useCallback(async () => {
    if (!navigator.onLine) return;
    let item = bacaAbsenLuring(localStorage, pemilik);
    let ada = false;
    for (const it of item.filter((x) => x.status === "menunggu")) {
      try {
        await fetchJson("/api/sigap/pelatihan/absen", { method: "POST", body: JSON.stringify({ aksi: "kode_luring", kode: it.kode, hp_ms: it.hp_ms, selisih_ms: it.selisih_ms, kirim_hp_ms: Date.now() }) });
        item = item.map((x) => (x.id === it.id ? { ...x, status: "diterima" } : x));
        ada = true;
      } catch (e) {
        if (galatJaringan(e)) break;
        const pesan = pesanGalat(e);
        if (/coba lagi \d+ detik/i.test(pesan)) break; // batas salah ketik: coba lagi nanti
        item = item.map((x) => (x.id === it.id ? { ...x, status: "ditolak", pesan } : x));
      }
      tulisAbsenLuring(localStorage, pemilik, item);
    }
    segarkan();
    if (ada) onTerkirim?.();
  }, [pemilik, segarkan, onTerkirim]);

  useEffect(() => {
    setOnline(navigator.onLine);
    segarkan();
    const naik = () => {
      setOnline(true);
      void kirim();
    };
    const turun = () => setOnline(false);
    window.addEventListener("online", naik);
    window.addEventListener("offline", turun);
    void kirim();
    const t = window.setInterval(() => void kirim(), 30_000);
    return () => {
      window.removeEventListener("online", naik);
      window.removeEventListener("offline", turun);
      window.clearInterval(t);
    };
  }, [kirim, segarkan]);

  const menunggu = daftar.filter((x) => x.status === "menunggu");
  if (online && daftar.length === 0) return null;

  function simpan() {
    setGalat(null);
    const h = tambahAbsenLuring(localStorage, pemilik, kode, KODE_PANJANG, selisihJamServer(localStorage)?.selisih ?? 0);
    if (!h.ok) return setGalat(h.alasan);
    setKode("");
    segarkan();
    void kirim();
  }

  return (
    <Kartu judul={online ? "Absen tanpa sinyal" : "Absen tanpa sinyal · HP tidak tersambung"}>
      {!online && (
        <>
          <p className="text-[13px] leading-relaxed text-[#5B6B84]">Ketik kode absen yang dibacakan instruktur. Kode dan jamnya disimpan di HP, lalu dikirim otomatis saat ada sinyal (paling lambat 24 jam).</p>
          <form
            className="mt-2.5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              simpan();
            }}
          >
            <input
              value={kode}
              onChange={(e) => setKode(e.target.value.replace(/\D/g, "").slice(0, KODE_PANJANG))}
              inputMode="numeric"
              autoComplete="off"
              placeholder={"0".repeat(KODE_PANJANG)}
              aria-label="Kode absen dari instruktur"
              className="min-w-0 flex-1 rounded-xl border-2 border-[#CBD6E6] px-3 py-2.5 text-center font-mono text-[20px] font-extrabold tracking-[0.3em] text-[#0F2A52] outline-none focus:border-[#1F5FD1]"
            />
            <button type="submit" disabled={kode.length !== KODE_PANJANG} className="shrink-0 rounded-xl bg-[#1F5FD1] px-4 text-[14px] font-extrabold text-white disabled:opacity-50">
              Simpan
            </button>
          </form>
          {galat && <p className="mt-1.5 text-[12.5px] font-semibold text-[#B42329]">{galat}</p>}
        </>
      )}
      {daftar.length > 0 && (
        <ul className="mt-2.5 space-y-1 text-[12.5px]">
          {daftar.map((x) => (
            <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-x-2 border-t border-[#EDF0F4] pt-1">
              <span className="font-mono font-bold text-[#1B2B4B]">
                {x.kode} <span className="font-sans font-normal text-[#6B7A90]">· diketik {jam(x.hp_ms)}</span>
              </span>
              <span className={x.status === "diterima" ? "font-semibold text-[#13794B]" : x.status === "ditolak" ? "font-semibold text-[#B42329]" : "text-[#8A6200]"}>
                {x.status === "diterima" ? "✓ Tercatat hadir" : x.status === "ditolak" ? x.pesan ?? "Ditolak" : "Menunggu sinyal"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {online && menunggu.length > 0 && <p className="mt-2 text-[12px] text-[#6B7A90]">Mengirim absen yang tersimpan…</p>}
    </Kartu>
  );
}
