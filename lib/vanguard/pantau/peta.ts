// lib/vanguard/pantau/peta.ts  (murni)
//
// (1 Nov 2026) VANGUARD V6-pra: pemetaan nama isian Vanguard (id sel, rincian) ke nama kolom PANTAU. Dasar: skema 10 berkas ekspor "Data KP" dari PANTAU (skema.json = HANYA nama/tipe kolom, tanpa data responden).
// Id Vanguard TIDAK diganti (sudah tersimpan pada rekaman petugas); pemetaan ini dipakai untuk ekspor sebanding dengan PANTAU dan untuk memakai aturan anomali PANTAU sebagai validasi.
// Pola nama PANTAU: B{blok}{sub}R{rincian}K{kolom} (mis. B5ER3K4 = Blok V.E Rincian 3 Kolom 4). Tabel baris (ART): ART_B5A, ART_B5B (satu baris per catatan). Tabel komoditas: NOURUTKOMO = nomor rincian R.x.
// kepastian: "pasti" = kolom ada di skema dan pola/nilai contoh cocok dengan kuesioner; "dugaan" = kolom ada tetapi arti barisnya disimpulkan dari pola (perlu dikonfirmasi pada data PANTAU).

import skema from "./skema.json";

export type TabelPantau = keyof typeof skema;
export type PetaKolom = { tabel: TabelPantau; kolom: string; baris?: number; kepastian: "pasti" | "dugaan" };

export const SKEMA_PANTAU = skema as Record<string, { berkas: string; kolom: { n: string; t: string; p: number; d?: number }[] }>;
export const adaKolomPantau = (tabel: string, kolom: string): boolean => !!SKEMA_PANTAU[tabel]?.kolom.some((k) => k.n === kolom);

const E_BARIS: Record<string, number> = { badanUsaha: 2, rtLain: 3, nirlaba: 4, luarNegeri: 5 };
const F_BARIS: Record<string, number> = { pemerintah: 1, badanUsaha: 2, rtLain: 3, nirlaba: 4, luarNegeri: 5 };
const D_BARIS: Record<string, number> = { sewaLahan: 1, keuntunganModal: 2, keuntunganSaham: 3, bunga: 4 };
const G_SUB: Record<string, number> = { bangunanUsaha: 11, kendaraan: 12, mesin: 13, tanamanHewan: 14, lainnyaIP: 15 };
const G_UTAMA: Record<string, number> = { bangunanTinggal: 2, biayaPindahLahan: 3, lahan: 4, berharga: 5 };
const E_KOLOM: Record<string, number> = { uangD: 2, barangD: 3, uangB: 4, barangB: 5 };
const F_KOLOM: Record<string, number> = { bangunanD: 2, lahanD: 3, bangunanB: 4, lahanB: 5 };

/** Nama kolom PANTAU untuk sebuah id sel Vanguard (V.A sampai VII). null bila id tidak dikenal. */
export function petaSel(id: string): PetaKolom | null {
  let m: RegExpExecArray | null;
  if ((m = /^a(\d)_(uang|barang|lembur)$/.exec(id))) return { tabel: "ART_B5A", kolom: `B5AK${{ uang: 5, barang: 6, lembur: 7 }[m[2]]}`, baris: Number(m[1]), kepastian: "pasti" };
  if ((m = /^b(\d)_(produksi|biaya)$/.exec(id))) return { tabel: "ART_B5B", kolom: `B5BK${m[2] === "produksi" ? 5 : 6}`, baris: Number(m[1]), kepastian: "pasti" };
  if (id === "c_sewaRumah_produksi") return { tabel: "Rekap_B5A_B5E_RT", kolom: "B5CR1K2", kepastian: "pasti" };
  if (id === "c_hasilLain_produksi") return { tabel: "Rekap_B5A_B5E_RT", kolom: "B5CR2K2", kepastian: "pasti" };
  if (id === "c_hasilLain_biaya") return { tabel: "Rekap_B5A_B5E_RT", kolom: "B5CR2K3", kepastian: "pasti" };
  if ((m = /^d_(\w+)_(diterima|dibayar)$/.exec(id)) && D_BARIS[m[1]]) return { tabel: "Rekap_B5A_B5E_RT", kolom: `B5DR${D_BARIS[m[1]]}K${m[2] === "diterima" ? 2 : 3}`, kepastian: "pasti" };
  if (id === "e_pensiun_uang") return { tabel: "Rekap_B5A_B5E_RT", kolom: "B5ER11K2", kepastian: "pasti" };
  if ((m = /^e_(bantuan|badanUsaha|rtLain|nirlaba|luarNegeri)_(uangD|barangD|uangB|barangB)$/.exec(id))) {
    const r = m[1] === "bantuan" ? 12 : E_BARIS[m[1]];
    return { tabel: "Rekap_B5A_B5E_RT", kolom: `B5ER${r}K${E_KOLOM[m[2]]}`, kepastian: "pasti" };
  }
  if ((m = /^f_(\w+)_(bangunanD|lahanD|bangunanB|lahanB)$/.exec(id)) && F_BARIS[m[1]]) return { tabel: "Rekap_B5F_B5G_RT", kolom: `B5FR${F_BARIS[m[1]]}K${F_KOLOM[m[2]]}`, kepastian: "pasti" };
  if ((m = /^g_(\w+)_(tambah|kurang)$/.exec(id))) {
    const r = G_SUB[m[1]] ?? G_UTAMA[m[1]];
    if (r) return { tabel: "Rekap_B5F_B5G_RT", kolom: `B5GR${r}K${m[2] === "tambah" ? 2 : 3}`, kepastian: G_SUB[m[1]] ? "dugaan" : "pasti" };
  }
  if (id === "vi_g1") return { tabel: "Rekap_B6_B7_RT", kolom: "B6R1K4", kepastian: "dugaan" };
  if ((m = /^vii_p([1-5])$/.exec(id))) return { tabel: "Rekap_B6_B7_RT", kolom: `B7R${m[1]}K2`, kepastian: "dugaan" };
  if ((m = /^vii_g([1-5])$/.exec(id))) return { tabel: "Rekap_B6_B7_RT", kolom: `B7R${m[1]}K4`, kepastian: "dugaan" };
  return null;
}

// ---------------------------------------------------------------- Blok IV (komoditas)
/** Tabel komoditas PANTAU untuk sebuah nomor rincian: R.1–R.186 per rumah tangga, R.187–R.225 per ART (R401 = nomor urut ART), R.226–R.347 bukan makanan. */
export function tabelKomoditas(r: number): "Komoditi_Makanan_RT" | "Komoditi_Makanan_ART" | "Komoditi_Non_Makanan" | null {
  if (r >= 1 && r <= 186) return "Komoditi_Makanan_RT";
  if (r >= 187 && r <= 225) return "Komoditi_Makanan_ART";
  if (r >= 226 && r <= 347) return "Komoditi_Non_Makanan";
  return null;
}
/** Kolom kuesioner Blok IV.1 (5)–(10) ke kolom PANTAU. Makanan jadi/rokok per ART: KOLOM7 = kolom (4) kode sumber perolehan (0–3). */
export const KOLOM_IV1: Record<number, string> = { 5: "KOLOM1", 6: "KOLOM2", 7: "KOLOM3", 8: "KOLOM4", 9: "KOLOM5", 10: "KOLOM6" };
export const KOLOM_SUMBER_ART = "KOLOM7";
/** Blok IV.2: nilai sebulan (kolom 4) = KOLOM5, nilai setahun (kolom 5) = KOLOM6, banyaknya (kWh/m3/liter/kg) = KOLOM7. KOLOM4A dan KOLOM10–14 belum terkonfirmasi. */
export const KOLOM_IV2 = { sebulan: "KOLOM5", setahun: "KOLOM6", banyaknya: "KOLOM7" } as const;
/** Kunci baris komoditas PANTAU: NOURUTKOMO (= R.x); untuk tabel ART ditambah R401 (nomor urut ART) dan IDART. */
export const KUNCI_KOMODITAS = { rincian: "NOURUTKOMO", art: "R401", idArt: "IDART", kode: "KODECOICOP" } as const;

// ---------------------------------------------------------------- Rekap IV.3 (RT)
/** Rekap IV.3.2 (R.1–R.16, kolom 3–5) = B432R{r}K{k}; IV.3.3 memakai nama khusus (B433R1AK3 dst.). */
export const kolomRekapIv32 = (r: number, k: 3 | 4 | 5): string => `B432R${r}K${k}`;
