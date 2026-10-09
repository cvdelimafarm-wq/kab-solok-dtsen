"use client";

// app/sigap/kegiatan/useInduk.ts
//
// (9 Okt 2026) Pengambil data bersama halaman tahapan (Layer 2) dan halaman tahap (Layer 3) sebuah kegiatan induk:
// definisi induk + tahap (/api/portal/induk), data pelatihan (/api/sigap/pelatihan) dan ringkasan Transport Lokal (/api/portal/kegiatan).
// Disegarkan tiap 45 detik saat layar terlihat, jam server dipakai untuk hitung mundur.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPortal, bacaSesi } from "@/app/portal/sesi";
import type { RingkasKegiatan } from "@/lib/sigapKegiatan";
import { susunTahap, type Induk, type TahapHasil } from "@/lib/sigapTahap";
import type { HubTugas } from "@/lib/sigapTugasUtama";

type HubBeranda = HubTugas & { sekarang: string };

export function useInduk(kode: string) {
  const router = useRouter();
  const [induk, setInduk] = useState<Induk | null>(null);
  const [hub, setHub] = useState<HubBeranda | null>(null);
  const [hubMuat, setHubMuat] = useState<"memuat" | "siap" | "gagal">("memuat");
  const [keg, setKeg] = useState<RingkasKegiatan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [, setTik] = useState(0);

  const muat = useCallback(async () => {
    if (!bacaSesi()) return router.replace("/");
    try {
      const d = await apiPortal<{ sekarang: string; induk: Induk[] }>(`/api/portal/induk?kode=${encodeURIComponent(kode)}`);
      setOffset(Date.parse(d.sekarang) - Date.now());
      setInduk(d.induk[0] ?? null);
      setGalat(null);
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") return router.replace("/");
      // kegiatan tidak ada / bukan untuk akun ini: kembali ke Beranda, bukan halaman galat buntu
      if (e instanceof Error && /tidak ditemukan/i.test(e.message)) return router.replace("/");
      setGalat(e instanceof Error ? e.message : "Gagal memuat.");
    }
    try {
      const h = await apiPortal<HubBeranda>("/api/sigap/pelatihan");
      setHub(h);
      setHubMuat("siap");
    } catch {
      setHubMuat((m) => (m === "siap" ? m : "gagal"));
    }
    try {
      const k = await apiPortal<{ kegiatan: RingkasKegiatan[] }>("/api/portal/kegiatan");
      setKeg(k.kegiatan);
    } catch {
      /* Transport Lokal tidak tampil bila gagal; tahap lain tetap jalan */
    }
  }, [kode, router]);

  useEffect(() => {
    muat();
    const a = setInterval(() => document.visibilityState === "visible" && muat(), 45_000);
    const b = setInterval(() => setTik((x) => x + 1), 30_000);
    const c = () => document.visibilityState === "visible" && muat();
    document.addEventListener("visibilitychange", c);
    return () => {
      clearInterval(a);
      clearInterval(b);
      document.removeEventListener("visibilitychange", c);
    };
  }, [muat]);

  const nowMs = Date.now() + offset;
  const siap = !!induk && keg !== null && hubMuat !== "memuat";
  const tahap: TahapHasil[] = useMemo(
    () => (induk && siap ? susunTahap({ induk, hub, hubMuat, keg: keg ?? [], nowMs }) : []),
    // `nowMs` berubah tiap render; dihitung ulang saat data atau tik berubah
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [induk, hub, hubMuat, keg, siap, Math.floor(nowMs / 30_000)]
  );
  return { induk, tahap, siap, galat, nowMs, muat, hub };
}
