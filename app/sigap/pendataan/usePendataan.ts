"use client";

// app/sigap/pendataan/usePendataan.ts
//
// (11 Okt 2026) Pengambil data & penyimpan hasil Lembar Pendataan keroyokan (/api/portal/pendataan).
// - Data tim (anggota, Sub SLS, ringkasan) dan daftar KK per Sub SLS lewat simpanan bersama (dataBersama.ts): langsung tampil, diperbarui di belakang.
// - Daftar KK semua Sub SLS tim diunduh diam-diam di belakang (satu per satu) supaya lembar tetap bisa dipakai tanpa sinyal.
// - Penandaan hasil memakai antrean kirim (antreanKirim.ts): tampil seketika di HP, dikirim saat ada sinyal; hasil terakhir menurut waktu kejadian.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { siapkanData, useData } from "@/app/portal/dataBersama";
import { kirimAtauAntre } from "@/app/portal/antreanKirim";
import { modeSimulasi } from "@/app/portal/simulasi";
import { API_PENDATAAN, pathKkSub, type DataKkSub, type DataTimPendataan, type HasilCatat, type KkLembar } from "@/lib/pendataan";

export function useTimPendataan() {
  const router = useRouter();
  const d = useData<DataTimPendataan>(API_PENDATAAN);
  useEffect(() => {
    if (d.galat === "SESI_BERAKHIR") router.replace("/");
  }, [d.galat, router]);
  const galat = !d.data && d.galat && d.galat !== "SESI_BERAKHIR" ? d.galat : null;
  return { data: d.data, galat, memuat: d.memuat, tiba: d.tiba };
}

export function useKkSub(idsubsls: string | null) {
  const d = useData<DataKkSub>(idsubsls ? pathKkSub(idsubsls) : API_PENDATAAN, { aktif: !!idsubsls });
  const data = idsubsls && d.data && Array.isArray((d.data as Partial<DataKkSub>).kk) && d.data.idsubsls === idsubsls ? d.data : null;
  const galat = !data && d.galat && d.galat !== "SESI_BERAKHIR" ? d.galat : null;
  return { data, galat, memuat: !!idsubsls && !data && !galat, tiba: d.tiba };
}

/** Unduh daftar KK semua Sub SLS tim satu per satu (jeda singkat) agar tersedia saat tanpa sinyal. Berhenti bila halaman ditutup / offline / simulasi. */
export function useUnduhKkLatar(idsubs: string[], dulukan: string | null) {
  const kunci = idsubs.join(",");
  useEffect(() => {
    if (!kunci || modeSimulasi()) return;
    let batal = false;
    const urut = [...(dulukan ? [dulukan] : []), ...idsubs.filter((i) => i !== dulukan)];
    (async () => {
      await new Promise((r) => setTimeout(r, 1500)); // beri jalan dulu pada Sub SLS yang sedang dibuka
      for (const id of urut) {
        if (batal) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        try {
          await siapkanData<DataKkSub>(pathKkSub(id), 10 * 60 * 1000);
        } catch {
          /* sinyal buruk: lewati, coba lagi saat halaman dibuka lagi */
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);
}

function uuid(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Tandai hasil satu KK (atau 'belum' = Urungkan). Tampil seketika; dikirim di belakang oleh antrean. */
export function tandaiKk(idsubsls: string, kk: Pick<KkLembar, "id">, hasil: HasilCatat, alasan?: string | null): { ok: true } | { ok: false; pesan: string } {
  return kirimAtauAntre(
    API_PENDATAAN,
    { kk_id: kk.id, hasil, alasan: alasan ?? null, waktu: new Date().toISOString(), kunci: uuid(), idsubsls },
    `kk:${kk.id}`
  );
}

export function inisial(nama: string): string {
  const k = nama.trim().split(/\s+/).filter(Boolean);
  if (k.length === 0) return "?";
  return (k[0][0] + (k[1]?.[0] ?? k[0][1] ?? "")).toUpperCase();
}
export const namaDepan = (nama: string) => nama.trim().split(/\s+/)[0] ?? nama;

export function jamWib(iso: string | null): string {
  if (!iso) return "-";
  const w = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(w.getUTCHours())}.${p(w.getUTCMinutes())}`;
}
/** "hari ini 09.12" / "kemarin 16.40" / "9 Okt 16.40" (WIB). */
export function waktuRingkas(iso: string | null, sekarang = Date.now()): string {
  if (!iso) return "-";
  const w = (t: number) => new Date(t + 7 * 3_600_000);
  const a = w(new Date(iso).getTime());
  const b = w(sekarang);
  const hari = (d: Date) => Math.floor(d.getTime() / 86_400_000);
  const selisih = hari(b) - hari(a);
  if (selisih <= 0) return `hari ini ${jamWib(iso)}`;
  if (selisih === 1) return `kemarin ${jamWib(iso)}`;
  const bln = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${a.getUTCDate()} ${bln[a.getUTCMonth()]} ${jamWib(iso)}`;
}
