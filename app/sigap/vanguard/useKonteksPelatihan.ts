"use client";

// app/sigap/vanguard/useKonteksPelatihan.ts
//
// (2 Nov 2026) Memuat KONTEKS PELATIHAN akun yang sedang masuk (GET /api/sigap/vanguard/konteks). `siap` = jawaban sudah ada (atau gagal / terlalu lama):
// layar menunggu `siap` sebelum menyusun kartu supaya peserta pelatihan tidak sempat melihat kartu yang kemudian disembunyikan.
// Gagal atau lebih dari 4 detik = konteks null (tampilan lama, tidak ada yang rusak).

import { useEffect, useState } from "react";
import { apiPortal } from "@/app/portal/sesi";
import type { KonteksPelatihan } from "@/lib/konteksVanguard";

const BATAS_TUNGGU_MS = 4000;

export function useKonteksPelatihan(): { konteks: KonteksPelatihan | null; siap: boolean } {
  const [d, setD] = useState<{ konteks: KonteksPelatihan | null; siap: boolean }>({ konteks: null, siap: false });
  useEffect(() => {
    let batal = false;
    const akhir = (konteks: KonteksPelatihan | null) => { if (!batal) setD((x) => (x.siap ? x : { konteks, siap: true })); };
    const timer = window.setTimeout(() => akhir(null), BATAS_TUNGGU_MS);
    apiPortal<{ konteks: KonteksPelatihan | null }>("/api/sigap/vanguard/konteks").then((r) => akhir(r.konteks ?? null)).catch(() => akhir(null));
    return () => { batal = true; window.clearTimeout(timer); };
  }, []);
  return d;
}
