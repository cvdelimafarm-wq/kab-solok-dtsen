// app/portal/navigasi.ts  (hanya klien)
//
// (8 Okt 2026) Pembantu tombol "kembali" bertingkat: jejak halaman di sessionStorage (diisi PenjagaKembali), dan keAtas() = naik satu layer.

import { bisaKembali, indukDari } from "@/lib/sigapNavigasi";

const KUNCI_JEJAK = "sigap_jejak";

export function bacaJejak(): string[] {
  try {
    const a = JSON.parse(sessionStorage.getItem(KUNCI_JEJAK) ?? "[]");
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function simpanJejak(j: string[]) {
  try {
    sessionStorage.setItem(KUNCI_JEJAK, JSON.stringify(j));
  } catch {
    /* abaikan */
  }
}

/** Naik satu layer: bila halaman sebelumnya memang induknya -> router.back() (riwayat tidak menumpuk), selain itu ganti ke induk. */
export function keAtas(router: { back: () => void; replace: (href: string) => void }, induk?: string) {
  const tujuan = induk ?? indukDari(window.location.pathname) ?? "/";
  if (bisaKembali(bacaJejak(), tujuan)) router.back();
  else router.replace(tujuan);
}
