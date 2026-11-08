// app/sigap/sampel/latarSubSls.ts
//
// (8 Nov 2026, E3) Giliran peta jalan di Lembar sampel. Peta jalan memakai satu peta WebGL (MapLibre) dan satu protokol PMTiles global per peta, jadi hanya BOLEH
// ada satu latar peta jalan hidup pada satu waktu walau beberapa kartu sub SLS membuka petanya. Kartu yang peta mininya baru dibuka mengambil giliran;
// kartu lain kembali ke kanvas biasa dan bisa mengambilnya lagi dengan satu ketukan.

import { useCallback, useEffect, useSyncExternalStore } from "react";

let pemegang: string | null = null;
const pendengar = new Set<() => void>();
const kabari = () => pendengar.forEach((f) => f());

export function ambilGiliran(id: string): void {
  if (pemegang === id) return;
  pemegang = id;
  kabari();
}
export function lepasGiliran(id: string): void {
  if (pemegang !== id) return;
  pemegang = null;
  kabari();
}
export const pemegangGiliran = () => pemegang;
/** hanya untuk tes */
export function setelUlangGiliran(): void {
  pemegang = null;
  pendengar.clear();
}

const langgan = (f: () => void) => {
  pendengar.add(f);
  return () => {
    pendengar.delete(f);
  };
};

/** `boleh` = kartu ini memang punya peta jalan yang bisa dipakai; bila ya, mengambil giliran saat peta mininya tampil dan melepasnya saat ditutup. */
export function useGiliranLatar(id: string, boleh: boolean): { punya: boolean; ambil: () => void } {
  const sekarang = useSyncExternalStore(langgan, pemegangGiliran, () => null);
  useEffect(() => {
    if (!boleh) return;
    ambilGiliran(id);
    return () => lepasGiliran(id);
  }, [id, boleh]);
  const ambil = useCallback(() => ambilGiliran(id), [id]);
  return { punya: boleh && sekarang === id, ambil };
}
