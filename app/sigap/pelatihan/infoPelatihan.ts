"use client";

// app/sigap/pelatihan/infoPelatihan.ts
//
// (1 Nov 2026) Hook bersama: info pelatihan yang sedang dilayani (nama, induk) untuk header, kartu pulsa, judul tes, dan tombol kembali.
// Satu permintaan per halaman (dibagi antar komponen). Gagal -> null (layar memakai teks netral "Pelatihan").

import { useEffect, useState } from "react";
import { fetchJson, kegiatanPelatihanAktif } from "../admin/api";
import type { InfoPelatihan } from "@/lib/sigapPelatihanNama";

const bagi = new Map<string, Promise<InfoPelatihan | null>>();

function muatInfo(): Promise<InfoPelatihan | null> {
  const kunci = String(kegiatanPelatihanAktif() ?? "otomatis");
  let p = bagi.get(kunci);
  if (!p) {
    p = fetchJson<InfoPelatihan>("/api/sigap/pelatihan/info").catch(() => null);
    bagi.set(kunci, p);
  }
  return p;
}

export function useInfoPelatihan(): InfoPelatihan | null {
  const [info, setInfo] = useState<InfoPelatihan | null>(null);
  useEffect(() => {
    let batal = false;
    void muatInfo().then((r) => {
      if (!batal && r && r.kegiatan_id !== null) setInfo(r);
    });
    return () => {
      batal = true;
    };
  }, []);
  return info;
}
