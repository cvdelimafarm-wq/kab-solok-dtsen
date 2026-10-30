// app/sigap/kelola/pendataan/fotoKlien.ts  (hanya klien)
//
// (30 Okt 2026) Mengambil gambar foto dokumentasi untuk pemilih foto dan Laporan. Tag <img> tidak bisa mengirim header Authorization, jadi gambar
// diambil dengan fetch + blob. Antrean membatasi unduhan serentak (HP/jaringan desa), gambar kecil disimpan sementara di memori.

import { bacaSesi } from "@/app/portal/sesi";

export const alamatGambar = (kegiatanId: number, id: number, u: "kecil" | "sedang"): string => `/api/portal/pendataan/laporan/foto/gambar?k=${kegiatanId}&id=${id}&u=${u}`;

let aktif = 0;
const antre: (() => void)[] = [];
async function denganBatas<T>(f: () => Promise<T>, maks = 4): Promise<T> {
  if (aktif >= maks) await new Promise<void>((lanjut) => antre.push(lanjut));
  aktif++;
  try {
    return await f();
  } finally {
    aktif--;
    antre.shift()?.();
  }
}

export async function ambilBlob(kegiatanId: number, id: number, u: "kecil" | "sedang"): Promise<Blob> {
  return denganBatas(async () => {
    const s = bacaSesi();
    const res = await fetch(alamatGambar(kegiatanId, id, u), { headers: s ? { Authorization: `Bearer ${s}` } : {} });
    if (!res.ok) throw new Error(res.status === 401 ? "Sesi berakhir." : res.status === 404 ? "Foto tidak ada." : `Gagal memuat foto (${res.status}).`);
    return res.blob();
  });
}

const MAKS_SIMPAN = 400;
const simpanan = new Map<string, string>();
const berjalan = new Map<string, Promise<string>>();

/** Alamat objek (blob:) gambar kecil; dipakai ulang selama halaman terbuka. */
export function gambarKecil(kegiatanId: number, id: number): Promise<string> {
  const kunci = `${kegiatanId}:${id}`;
  const ada = simpanan.get(kunci);
  if (ada) return Promise.resolve(ada);
  const sedang = berjalan.get(kunci);
  if (sedang) return sedang;
  const p = ambilBlob(kegiatanId, id, "kecil")
    .then((b) => {
      const url = URL.createObjectURL(b);
      simpanan.set(kunci, url);
      if (simpanan.size > MAKS_SIMPAN) {
        const tertua = simpanan.keys().next().value;
        if (tertua !== undefined) {
          const u = simpanan.get(tertua);
          simpanan.delete(tertua);
          if (u) URL.revokeObjectURL(u);
        }
      }
      return url;
    })
    .finally(() => berjalan.delete(kunci));
  berjalan.set(kunci, p);
  return p;
}

export function gambarKecilTersimpan(kegiatanId: number, id: number): string | null {
  return simpanan.get(`${kegiatanId}:${id}`) ?? null;
}

export type GambarSiap = { jpeg: Uint8Array; lebar: number; tinggi: number; uri: string };

async function ukuranGambar(blob: Blob): Promise<{ lebar: number; tinggi: number }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(blob);
    const r = { lebar: bmp.width, tinggi: bmp.height };
    bmp.close();
    return r;
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((ok, gagal) => {
      const im = new Image();
      im.onload = () => ok({ lebar: im.naturalWidth, tinggi: im.naturalHeight });
      im.onerror = () => gagal(new Error("Gambar tidak terbaca."));
      im.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function keUri(blob: Blob): Promise<string> {
  return new Promise((ok, gagal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => gagal(new Error("Gambar tidak terbaca."));
    r.readAsDataURL(blob);
  });
}

/**
 * Menyiapkan gambar ukuran sedang untuk laporan (cetak dan Word). Foto yang gagal dimuat dilewati (laporan memberi tulisan pengganti) dan dihitung.
 * `onKemajuan(selesai, total)` dipanggil setiap satu foto selesai.
 */
export async function siapkanGambar(kegiatanId: number, ids: number[], onKemajuan?: (selesai: number, total: number) => void): Promise<{ gambar: Record<number, GambarSiap>; gagal: number }> {
  const unik = Array.from(new Set(ids));
  const gambar: Record<number, GambarSiap> = {};
  let gagal = 0;
  let selesai = 0;
  await Promise.all(
    unik.map(async (id) => {
      try {
        const blob = await ambilBlob(kegiatanId, id, "sedang");
        const [uk, uri, buf] = await Promise.all([ukuranGambar(blob), keUri(blob), blob.arrayBuffer()]);
        gambar[id] = { jpeg: new Uint8Array(buf), lebar: uk.lebar, tinggi: uk.tinggi, uri };
      } catch {
        gagal++;
      } finally {
        selesai++;
        onKemajuan?.(selesai, unik.length);
      }
    }),
  );
  return { gambar, gagal };
}
