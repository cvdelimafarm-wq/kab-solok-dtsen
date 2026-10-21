// lib/sigapFotoSusun.ts  (murni; aman dipakai klien dan server)
//
// (21 Okt 2026) Aturan penomoran foto Kamera SIGAP.
//   1) Foto pertama hari itu otomatis diusulkan ke nomor 1, kedua ke nomor 2, dst: nomor KOSONG terkecil (`nomorBerikutnya`). Petugas boleh memilih nomor lain.
//   2) Saat melengkapi (susulan), foto Kamera SIGAP yang belum terpasang disusun otomatis ke nomor yang masih kosong (`susunFoto`):
//        - jumlah foto <= jumlah nomor kosong: urut waktu ke nomor kosong dari yang terkecil;
//        - jumlah foto  > jumlah nomor kosong ("foto lebih dari 5"): foto bertanda kuning disisihkan dulu; bila masih berlebih, dipilih foto yang
//          letaknya dalam urutan waktu sepadan dengan nomornya (nomor 1 = paling awal, nomor terakhir = paling akhir, nomor tengah = tengah).
//          Foto yang tidak terpilih menjadi CADANGAN (tetap tersimpan, tidak dibuang).
//        - foto yang diambil jauh dari wilayah tugas (`diLuarWilayah`) tidak ditempatkan di nomor berlokasi (2-4), sama seperti saat potret.

import { SLOT_BERLOKASI } from "./sigapFoto";

export type Kandidat = { id: number; ms: number; kuning?: boolean; diLuarWilayah?: boolean };
export type Penempatan = { id: number; slot: number };
export type HasilSusun = { dipasang: Penempatan[]; cadangan: Kandidat[] };

const berlokasi = (s: number) => (SLOT_BERLOKASI as readonly number[]).includes(s);

/** Nomor kosong terkecil (1..jumlah) dari himpunan nomor yang sudah terisi; null bila semua terisi. */
export function nomorBerikutnya(terisi: Iterable<number>, jumlah = 5): number | null {
  const ada = new Set(terisi);
  for (let n = 1; n <= jumlah; n++) if (!ada.has(n)) return n;
  return null;
}

/** Nomor kosong (urut naik) dari himpunan nomor terisi. */
export function nomorKosong(terisi: Iterable<number>, jumlah = 5): number[] {
  const ada = new Set(terisi);
  const hasil: number[] = [];
  for (let n = 1; n <= jumlah; n++) if (!ada.has(n)) hasil.push(n);
  return hasil;
}

/**
 * Menyusun foto Kamera SIGAP yang belum terpasang ke nomor yang masih kosong. Tidak pernah menimpa nomor yang sudah terisi
 * (pemanggil hanya memberi nomor kosong). Hasil deterministik: urutan waktu, lalu id.
 */
export function susunFoto(kandidat: Kandidat[], kosong: number[], jumlah = 5): HasilSusun {
  const slotKosong = Array.from(new Set(kosong.filter((s) => Number.isInteger(s) && s >= 1 && s <= jumlah))).sort((a, b) => a - b);
  const urut = [...kandidat].sort((a, b) => a.ms - b.ms || a.id - b.id);
  if (!slotKosong.length || !urut.length) return { dipasang: [], cadangan: urut };

  // Berlebih: sisihkan foto kuning (perlu perhatian) lebih dulu, mulai dari yang paling awal
  let pakai = urut;
  if (pakai.length > slotKosong.length) {
    const sisih = new Set<number>();
    for (const k of pakai) {
      if (pakai.length - sisih.size <= slotKosong.length) break;
      if (k.kuning) sisih.add(k.id);
    }
    pakai = pakai.filter((k) => !sisih.has(k.id));
  }
  const berlebih = pakai.length > slotKosong.length;
  const n = pakai.length;

  const sisa = pakai.map((k, i) => ({ k, i }));
  const dipasang: Penempatan[] = [];
  for (const s of slotKosong) {
    if (!sisa.length) break;
    const sasaran = berlebih ? Math.round(((s - 1) / Math.max(1, jumlah - 1)) * (n - 1)) : 0;
    let terbaik = -1;
    for (let j = 0; j < sisa.length; j++) {
      const c = sisa[j];
      if (c.k.diLuarWilayah && berlokasi(s)) continue;
      if (terbaik === -1 || Math.abs(c.i - sasaran) < Math.abs(sisa[terbaik].i - sasaran)) terbaik = j;
    }
    if (terbaik === -1) continue;
    dipasang.push({ id: sisa[terbaik].k.id, slot: s });
    sisa.splice(terbaik, 1);
  }
  const dipakai = new Set(dipasang.map((p) => p.id));
  return { dipasang, cadangan: urut.filter((k) => !dipakai.has(k.id)) };
}

/** Teks panduan untuk petugas: nomor mana saja yang masih kosong. */
export function ringkasKosong(kosong: number[]): string {
  if (!kosong.length) return "Semua nomor foto sudah terisi.";
  return `Nomor yang masih kosong: ${kosong.join(", ")}.`;
}
