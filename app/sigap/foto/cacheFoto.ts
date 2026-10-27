// app/sigap/foto/cacheFoto.ts  (hanya klien)
//
// (28 Okt 2026) Simpanan foto bersama di memori HP untuk Foto Saya, Nomor foto, dan Periksa. Permintaan user: cek cache dan prefetch.
//  - Berkas yang sudah diunduh disimpan sebagai Blob (batas ±48 MB, yang paling lama tidak dipakai dilepas); komponen membuat blob URL sendiri
//    dari simpanan (murah, tanpa unduh ulang) dan melepasnya saat tidak dipakai.
//  - Unduhan yang sama yang sedang berjalan dibagi; kisi memakai ukuran 'mini' (±25 KB), bukan foto asli.
//  - Prefetch: saat browser menganggur, paling banyak 2 unduhan bersamaan, berhenti bila tanpa sinyal atau "hemat data" menyala.
// Berkas foto tak pernah berubah (nama berkas = kode acak), jadi simpanan tidak perlu dibasikan; yang dihapus server dijawab 410 dan tidak disimpan.

import { bacaSesi, pemilikSesi } from "@/app/portal/sesi";
import { SimpananBerat, jalurBerkasFoto, kunciFoto, pilihPrefetch, type UkuranBerkas } from "@/lib/sigapCacheFoto";

const kaca = new SimpananBerat<Blob>(48 * 1024 * 1024);
const terbang = new Map<string, Promise<Blob>>();
let pemilik: number | null | undefined;

type GalatBerkas = Error & { status?: number };
function galat(pesan: string, status?: number): GalatBerkas {
  const g: GalatBerkas = new Error(pesan);
  g.status = status;
  return g;
}

/** Akun yang sedang masuk berbeda dengan pemilik simpanan -> simpanan dikosongkan (foto milik akun lain tidak boleh terlihat). */
function pastikanPemilik(): void {
  const p = pemilikSesi() ?? null;
  if (p === pemilik) return;
  pemilik = p;
  kaca.kosongkan();
  terbang.clear();
}

export function sudahAdaFoto(id: number, ukuran: UkuranBerkas): boolean {
  pastikanPemilik();
  return kaca.ada(kunciFoto(id, ukuran));
}

/** Blob foto: dari simpanan bila ada; selain itu diunduh sekali (permintaan sama dibagi). Melempar galat bila gagal (410 = berkas dihapus). */
export function ambilBlobFoto(id: number, ukuran: UkuranBerkas): Promise<Blob> {
  pastikanPemilik();
  const kunci = kunciFoto(id, ukuran);
  const ada = kaca.ambil(kunci);
  if (ada) return Promise.resolve(ada);
  const jalan = terbang.get(kunci);
  if (jalan) return jalan;
  const s = bacaSesi();
  const p = (async () => {
    let res: Response;
    try {
      res = await fetch(jalurBerkasFoto(id, ukuran), { headers: s ? { Authorization: `Bearer ${s}` } : {} });
    } catch {
      throw galat("Tidak ada sambungan.");
    }
    if (!res.ok) throw galat(res.status === 410 ? "Berkas sudah dihapus atas persetujuan." : "Foto tidak bisa dimuat.", res.status);
    const blob = await res.blob();
    kaca.simpan(kunci, blob, blob.size);
    return blob;
  })().finally(() => terbang.delete(kunci));
  terbang.set(kunci, p);
  return p;
}

/** Blob URL baru dari simpanan/unduhan. Pemanggil WAJIB URL.revokeObjectURL saat selesai (blob di simpanan tidak ikut terbuang). */
export async function ambilFotoUrlCache(id: number, ukuran: UkuranBerkas): Promise<string> {
  return URL.createObjectURL(await ambilBlobFoto(id, ukuran));
}

// ---- prefetch ----
const antre: { id: number; ukuran: UkuranBerkas }[] = [];
let berjalan = 0;
let terjadwal = false;

type Koneksi = { saveData?: boolean };
const hemat = (): boolean => {
  if (typeof navigator === "undefined") return true;
  if (navigator.onLine === false) return true;
  return !!(navigator as Navigator & { connection?: Koneksi }).connection?.saveData;
};

function jalankanAntre(): void {
  terjadwal = false;
  if (hemat()) {
    antre.length = 0;
    return;
  }
  while (berjalan < 2 && antre.length) {
    const t = antre.shift()!;
    if (kaca.ada(kunciFoto(t.id, t.ukuran))) continue;
    berjalan++;
    ambilBlobFoto(t.id, t.ukuran)
      .catch(() => undefined)
      .finally(() => {
        berjalan--;
        jadwalkan();
      });
  }
}

function jadwalkan(): void {
  if (terjadwal || !antre.length || typeof window === "undefined") return;
  terjadwal = true;
  const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(jalankanAntre, { timeout: 2000 });
  else setTimeout(jalankanAntre, 300);
}

/** Muat dulu foto (ukuran tertentu) di belakang layar; yang sudah ada dilewati. `maks` membatasi jumlah per panggilan. */
export function siapkanFoto(ids: readonly number[], ukuran: UkuranBerkas, maks = 12): void {
  if (hemat()) return;
  pastikanPemilik();
  const baru = pilihPrefetch(ids, (id) => kaca.ada(kunciFoto(id, ukuran)) || antre.some((a) => a.id === id && a.ukuran === ukuran), maks);
  for (const id of baru) antre.push({ id, ukuran });
  jadwalkan();
}
