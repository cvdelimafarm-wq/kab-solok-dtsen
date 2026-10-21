// app/sigap/foto/kirimAntrean.ts  (hanya klien)
//
// (21 Okt 2026) Pengirim antrean foto bersama. Dulu hanya layar kamera yang mengirim antrean, jadi foto yang tertinggal di HP (tanpa sinyal, atau
// pratinjau ditutup sebelum Kirim) baru terkirim bila petugas kembali membuka layar kamera. Sekarang juga dipanggil dari kartu hari (FotoKegiatan)
// dan halaman Foto, serta saat sinyal kembali.
//
// - DRAF: foto yang baru dipotret dan pratinjaunya masih terbuka (`draf: true`) dilewati selama masih baru (UMUR_DRAF_MS). Bila aplikasi
//   ditutup atau HP mati saat pratinjau, drafnya menjadi tua dan ikut terkirim apa adanya (dengan nomor terakhir yang dipilih).
// - Item yang ditolak server secara permanen (galat_terakhir terisi) tidak diulang otomatis; hanya diulang bila `paksa`.
// - Item hanya dibuang dari HP SETELAH server menjawab sukses/duplikat.

import { daftarAntrean, formDariItem, lepasAntrean, perbaruiAntrean, type ItemAntrean } from "./antreanFoto";
import { kirimMultipart, type GalatFoto } from "./klien";
import { pemilikSesi } from "@/app/portal/sesi";

export const UMUR_DRAF_MS = 90_000;

/** Draf yang pratinjaunya masih terbuka (detak baru): jangan dikirim dari luar layar kamera. */
export function drafMasihBaru(x: ItemAntrean, sekarang = Date.now()): boolean {
  return !!x.draf && sekarang - (x.jantung_ms ?? x.dibuat_ms) < UMUR_DRAF_MS;
}

let berjalan: Promise<number> | null = null;

/** Mengirim semua foto antrean milik akun yang sedang masuk. Mengembalikan jumlah yang berhasil terkirim. Aman dipanggil bersamaan. */
export function kirimSemuaAntrean(opsi: { paksa?: boolean } = {}): Promise<number> {
  if (berjalan) return berjalan;
  berjalan = (async () => {
    let terkirim = 0;
    try {
      const saya = pemilikSesi();
      let semua: ItemAntrean[] = [];
      try {
        semua = (await daftarAntrean()).filter((x) => x.akun_id === saya);
      } catch {
        return 0;
      }
      const sekarang = Date.now();
      for (const x of semua) {
        if (drafMasihBaru(x, sekarang)) continue; // pratinjau masih terbuka
        if (x.galat_terakhir && !opsi.paksa) continue; // ditolak permanen; jangan diulang terus
        try {
          const r = await kirimMultipart("/api/sigap/foto", formDariItem(x));
          if (r.simulasi) break;
          if (x.id !== undefined) await lepasAntrean(x.id);
          terkirim++;
        } catch (e) {
          const g = e as GalatFoto;
          if (g.status === undefined) break; // masih tanpa sinyal
          if (g.message === "SESI_BERAKHIR") break;
          if (g.status === 409 || g.status === 403 || g.status === 422 || g.status === 400) {
            if (x.id !== undefined) await perbaruiAntrean({ ...x, draf: false, galat_terakhir: g.message });
          }
        }
      }
    } finally {
      berjalan = null;
    }
    return terkirim;
  })();
  return berjalan;
}
