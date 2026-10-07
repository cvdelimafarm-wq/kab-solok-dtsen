"use client";

// app/sigap/pelatihan/komponen.tsx
//
// (7 Okt 2026) SIGAP > Pelatihan -- bagian bersama halaman peserta: kerangka (header + tab
// Undangan | Pelatihan), pengambil data hub, jam server & hitung mundur. Mockup disetujui user.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bacaSesi, fetchJson, keluar, keMasuk, pesanGalat, SesiBerakhir } from "../admin/api";
import { BarisTab, HeaderAdmin, Memuat, Pesan } from "../admin/ui";
import { useDetak } from "../useDetak";
import type { JenisTes, StatusTes, UNDANGAN } from "@/lib/sigapTes";

export type TesHub = {
  jenis: JenisTes;
  judul: string;
  buka_at: string;
  tutup_at: string;
  durasi_menit: number;
  status: StatusTes;
  jumlah_soal: number;
  sesi: { mulai_at: string; batas_at: string; selesai_at: string | null; terjawab: number } | null;
  hasil_tertunda: boolean;
  skor: number | null;
  benar: number | null;
  total: number | null;
};

export type Hub = {
  nama: string;
  jenis_akun: string;
  peserta: { penugasan_id: number; peran: string; kelas: number | null } | null;
  undangan: typeof UNDANGAN;
  tes: TesHub[];
  sekarang: string;
  kegiatan_id: number;
  boleh_lihat_kelola: boolean;
  boleh_kelola: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Detik -> "mm:ss" atau "h:mm:ss". */
export function formatSisa(detik: number): string {
  const s = Math.max(0, Math.floor(detik));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** ISO -> "09.15" (WIB). */
export function jamWib(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())}`;
}

export const peranLabel = (p: string) => p.toUpperCase();

/** Jam server: offset dihitung dari `sekarang` respons API; tick tiap detik. */
export function useJamServer() {
  const offset = useRef(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const setujukan = useCallback((sekarangIso: string) => {
    offset.current = new Date(sekarangIso).getTime() - Date.now();
  }, []);
  const sekarang = () => Date.now() + offset.current;
  return { setujukan, sekarang };
}

/** Ambil data hub (/api/sigap/pelatihan). `interval` ms utk segar otomatis (0 = tidak). */
export function useHub(interval = 0) {
  const [data, setData] = useState<Hub | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const jam = useJamServer();
  const { setujukan } = jam;
  const muat = useCallback(async () => {
    try {
      const d = await fetchJson<Hub>("/api/sigap/pelatihan");
      setujukan(d.sekarang);
      setData(d);
      setGalat(null);
    } catch (e) {
      if (!(e instanceof SesiBerakhir)) setGalat(pesanGalat(e));
    }
  }, [setujukan]);
  useEffect(() => {
    if (!bacaSesi()) return keMasuk();
    muat();
  }, [muat]);
  useEffect(() => {
    if (!interval) return;
    const t = setInterval(muat, interval);
    return () => clearInterval(t);
  }, [interval, muat]);
  return { data, galat, muat, jam };
}

/**
 * Panggil `aksi` sekali saat hitung mundur menuju `targetIso` mencapai nol
 * (mis. muat ulang data saat tes dibuka). Aman utk dipanggil tiap render.
 */
export function useSaatLewat(targetIso: string | null, sekarangMs: () => number, aksi: () => void, kunci: string) {
  const sudah = useRef<string>("");
  useEffect(() => {
    if (!targetIso) return;
    if (sekarangMs() >= new Date(targetIso).getTime() && sudah.current !== kunci + targetIso) {
      sudah.current = kunci + targetIso;
      aksi();
    }
  });
}

export function Kerangka({
  aktif,
  judul,
  sub,
  nama,
  children,
}: {
  aktif: "undangan" | "pelatihan";
  judul: React.ReactNode;
  sub?: React.ReactNode;
  nama?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [sesiDetak] = useState(() => (typeof window === "undefined" ? null : bacaSesi()));
  useDetak({ sesi: sesiDetak }, "pelatihan");
  return (
    <div className="min-h-screen bg-[#F3F5F8] text-[#14202E]">
      <HeaderAdmin
        kecil="SIGAP · Pelatihan PSP Pascabencana 2026"
        judul={judul}
        onKeluar={keluar}
        kanan={
          <>
            <a href="/sigap" className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold hover:bg-white/20">
              ← Portal
            </a>
            {nama && <span className="hidden max-w-[160px] truncate text-[11.5px] text-blue-100 sm:inline">{nama}</span>}
          </>
        }
      >
        {sub && <p className="mt-1 text-[12.5px] text-blue-100">{sub}</p>}
      </HeaderAdmin>
      <BarisTab
        tab={[
          { kode: "undangan" as const, label: "✉️ Undangan" },
          { kode: "pelatihan" as const, label: "📝 Pelatihan" },
        ]}
        aktif={aktif}
        onPilih={(k) => router.push(k === "undangan" ? "/sigap/pelatihan/undangan" : "/sigap/pelatihan")}
      />
      <main className="mx-auto max-w-3xl space-y-3 px-3 pb-16 pt-4 sm:px-4">{children}</main>
    </div>
  );
}

/** Bagian isi umum: memuat / galat. */
export function Keadaan({ memuat, galat }: { memuat: boolean; galat: string | null }) {
  if (galat) return <Pesan jenis="galat">{galat}</Pesan>;
  if (memuat) return <Memuat />;
  return null;
}
