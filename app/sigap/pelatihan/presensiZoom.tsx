"use client";

// app/sigap/pelatihan/presensiZoom.tsx
//
// (1 Nov 2026) Presensi DARING pada langkah Presensi halaman peserta: rapat Zoom pelatihan (atur panitia di Kelola Pelatihan > Rapat Zoom), tombol buka Zoom, dan kolom TOKEN.
// Hadir dengan token yang benar otomatis menjadi presensi sesi yang jamnya beririsan (server: lib/portal/rapatPeserta.ts). Mesin sama dengan modal rapat di Beranda.
// API: /api/sigap/pelatihan/rapat. Tampil untuk kelas Daring (dan Hybrid, di samping presensi lokasi).

import { useCallback, useEffect, useState } from "react";
import { fetchJson, pesanGalat, urlPelatihan, waktuWib } from "../admin/api";
import type { StatusRapat } from "@/lib/sigapRapat";

type RapatPeserta = { id: number; judul: string; mulai_at: string; selesai_at: string; buka_at: string; tutup_at: string; tautan: string | null; meeting_id: string | null; passcode: string | null; status: StatusRapat; hadir_at: string | null };
type Jawab = { rapat: RapatPeserta | null; sekarang: string };

const TOMBOL = "inline-flex min-h-[42px] items-center justify-center rounded-[12px] px-4 text-[13.5px] font-bold";

export default function PresensiZoom({ segarkan }: { segarkan: () => void }) {
  const [d, setD] = useState<Jawab | null>(null);
  const [token, setToken] = useState("");
  const [kirim, setKirim] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);

  const muat = useCallback(async () => {
    try {
      setD(await fetchJson<Jawab>(urlPelatihan("/api/sigap/pelatihan/rapat")));
    } catch {
      /* diam: kartu hanya bantuan, presensi lain tetap jalan */
    }
  }, []);
  useEffect(() => {
    void muat();
    const t = setInterval(() => document.visibilityState === "visible" && void muat(), 30_000);
    return () => clearInterval(t);
  }, [muat]);

  async function hadir(r: RapatPeserta) {
    setKirim(true);
    setPesan(null);
    try {
      const j = await fetchJson<{ ok: boolean; sudah?: boolean; presensi_sesi?: string | null }>(urlPelatihan("/api/sigap/pelatihan/rapat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rapat_id: r.id, token }),
      });
      setToken("");
      setPesan({ jenis: "ok", teks: j.presensi_sesi ? `Kehadiran tercatat sebagai presensi ${j.presensi_sesi}.` : "Kehadiran rapat tercatat. Bila presensi sesi belum muncul, hubungi panitia (jadwal sesi presensi perlu diatur)." });
      await muat();
      segarkan();
    } catch (e) {
      setPesan({ jenis: "galat", teks: pesanGalat(e) });
    } finally {
      setKirim(false);
    }
  }

  const r = d?.rapat ?? null;
  if (!d) return <p className="text-[13px] text-[#7B8794]">Memuat rapat Zoom…</p>;
  if (!r) return <p className="text-[13px] text-[#5B6B84]">💻 Presensi daring memakai rapat Zoom. Belum ada rapat yang dijadwalkan panitia untuk pelatihan ini; presensi dibuka saat rapat dimulai.</p>;

  return (
    <div className="rounded-[14px] border border-[#CFE0F7] bg-[#F4F8FE] p-3" data-testid="presensi-zoom">
      <p className="text-[13.5px] font-extrabold text-[#0F2A52]">💻 {r.judul}</p>
      <p className="mt-0.5 text-[12.5px] text-[#55657D]">
        {waktuWib(r.mulai_at)} – {waktuWib(r.selesai_at)} WIB · presensi dibuka {waktuWib(r.buka_at)}, ditutup {waktuWib(r.tutup_at)} WIB
      </p>
      {(r.tautan || r.meeting_id) && (
        <p className="mt-1.5 text-[12.5px] text-[#34455F]">
          {r.tautan && (
            <a href={r.tautan} target="_blank" rel="noopener noreferrer" className="font-bold text-[#1F5FD1] underline">
              Buka Zoom →
            </a>
          )}
          {r.meeting_id ? ` · ID rapat ${r.meeting_id}` : ""}
          {r.passcode ? ` · passcode ${r.passcode}` : ""}
        </p>
      )}
      {r.status === "sudah" && <p className="mt-2 text-[13px] font-bold text-[#13794B]">✓ Kehadiran Anda tercatat{r.hadir_at ? ` pukul ${waktuWib(r.hadir_at)} WIB` : ""}.</p>}
      {r.status === "belum" && <p className="mt-2 text-[13px] text-[#5B6B84]">Kolom token aktif mendekati jam rapat.</p>}
      {r.status === "tutup" && <p className="mt-2 text-[13px] text-[#8A6200]">Presensi rapat sudah ditutup. Hubungi panitia bila Anda hadir.</p>}
      {r.status === "buka" && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Ketik token dari rapat"
            aria-label="Token hadir rapat Zoom"
            autoComplete="off"
            className="min-h-[42px] min-w-[170px] flex-1 rounded-[12px] border border-[#D9E3F2] bg-white px-3 text-[14px] text-[#1B2B4B]"
          />
          <button type="button" disabled={kirim || token.trim().length === 0} onClick={() => void hadir(r)} className={`${TOMBOL} ${kirim || token.trim().length === 0 ? "cursor-not-allowed bg-[#DDE6F3] text-[#6B7A90]" : "bg-[#1F5FD1] text-white hover:bg-[#1A4FB8]"}`}>
            {kirim ? "Mencatat…" : "Hadir"}
          </button>
        </div>
      )}
      {pesan && <p className={`mt-2 text-[12.5px] ${pesan.jenis === "ok" ? "text-[#13794B]" : "text-[#B42329]"}`}>{pesan.teks}</p>}
    </div>
  );
}
