"use client";

// app/portal/AktifkanNotifikasi.tsx
//
// (8 Okt 2026) Kartu "Aktifkan notifikasi" (push) -- dipakai di Beranda portal dan halaman Langkah Pelatihan.
// Tampil hanya bila berguna: belum aktif (ajakan), diblokir (cara membuka blokir), iPhone belum dipasang (cara memasang), atau sudah aktif (kecil + uji).
// Tidak tampil bila browser tidak mendukung atau server belum diberi kunci VAPID.

import { useCallback, useEffect, useState } from "react";
import { aktifkanPush, bacaStatusPush, matikanPush, ujiPush, type StatusPush } from "./pushKlien";

const KUNCI_NANTI = "sigap_push_nanti";
const NANTI_MS = 24 * 3_600_000;

const nantiAktif = (): boolean => {
  try {
    const t = Number(localStorage.getItem(KUNCI_NANTI) ?? 0);
    return t > 0 && Date.now() - t < NANTI_MS;
  } catch {
    return false;
  }
};

export default function AktifkanNotifikasi() {
  const [status, setStatus] = useState<StatusPush>("memuat");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [sembunyi, setSembunyi] = useState(false);

  const muat = useCallback(async () => {
    const r = await bacaStatusPush();
    setStatus(r.status);
  }, []);

  useEffect(() => {
    setSembunyi(nantiAktif());
    muat();
  }, [muat]);

  async function aktifkan() {
    setSibuk(true);
    setPesan(null);
    const r = await aktifkanPush();
    setSibuk(false);
    if (!r.ok) {
      setPesan({ ok: false, teks: r.pesan ?? "Gagal mengaktifkan notifikasi." });
      await muat();
      return;
    }
    setStatus("aktif");
    setPesan({ ok: true, teks: "Notifikasi aktif. Anda akan menerima pengingat meski aplikasi ditutup." });
  }

  async function uji() {
    setSibuk(true);
    const r = await ujiPush();
    setSibuk(false);
    setPesan({ ok: r.ok, teks: r.pesan });
  }

  async function matikan() {
    setSibuk(true);
    await matikanPush();
    setSibuk(false);
    setPesan(null);
    await muat();
  }

  if (status === "memuat" || status === "tidak_didukung" || status === "belum_siap_server") return null;

  if (status === "aktif") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#BFE5CD] bg-[#F1FAF4] px-3.5 py-2.5 text-[13px] text-[#17623C]">
        <span aria-hidden>🔔</span>
        <span className="min-w-[160px] flex-1 font-semibold">{pesan?.teks ?? "Notifikasi aktif di perangkat ini."}</span>
        <button type="button" onClick={uji} disabled={sibuk} className="rounded-lg border border-[#9FD3B3] bg-white px-3 py-1.5 text-[12.5px] font-bold hover:bg-[#F8FFFA] disabled:opacity-60">
          {sibuk ? "…" : "Kirim uji"}
        </button>
        <button type="button" onClick={matikan} disabled={sibuk} className="text-[12.5px] underline underline-offset-2 disabled:opacity-60">
          Matikan
        </button>
      </div>
    );
  }

  if (status === "belum_aktif" && sembunyi) return null;

  const teks =
    status === "perlu_pasang_ios"
      ? "Di iPhone/iPad, pasang dulu aplikasinya: ketuk tombol Bagikan, pilih “Tambahkan ke Layar Utama”, lalu buka SIGAP dari ikon itu dan aktifkan notifikasi."
      : status === "diblokir"
        ? "Notifikasi diblokir di browser ini. Buka pengaturan situs (ikon gembok di alamat), ubah Notifikasi menjadi Izinkan, lalu muat ulang halaman."
        : "Aktifkan notifikasi agar pengingat pelatihan, presensi, dan tugas tetap sampai ke HP Anda walau aplikasi ditutup.";

  return (
    <div className="rounded-xl border border-[#BBD4F5] bg-[#F3F8FF] px-3.5 py-3 text-[#0F2A52]" role="status">
      <p className="flex items-start gap-2 text-[14px] font-extrabold leading-snug">
        <span aria-hidden>🔔</span>
        <span>{status === "belum_aktif" ? "Aktifkan notifikasi SIGAP" : "Notifikasi SIGAP"}</span>
      </p>
      <p className="mt-1 pl-7 text-[13px] leading-relaxed text-[#14202E]">{teks}</p>
      {pesan && !pesan.ok && <p className="mt-1 pl-7 text-[12.5px] font-semibold text-[#C0392B]">{pesan.teks}</p>}
      {status === "belum_aktif" && (
        <div className="mt-2 flex flex-wrap items-center gap-3 pl-7">
          <button type="button" onClick={aktifkan} disabled={sibuk} className="rounded-lg bg-[#1F5FD1] px-4 py-2 text-[13.5px] font-extrabold text-white hover:bg-[#1A50B5] disabled:opacity-60">
            {sibuk ? "Memproses…" : "Aktifkan notifikasi"}
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(KUNCI_NANTI, String(Date.now()));
              } catch {
                /* abaikan */
              }
              setSembunyi(true);
            }}
            className="text-[12.5px] text-[#55657D] underline underline-offset-2"
          >
            Nanti saja
          </button>
        </div>
      )}
    </div>
  );
}
