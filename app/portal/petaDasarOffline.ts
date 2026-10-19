// app/portal/petaDasarOffline.ts  (klien)
//
// (20 Okt 2026) Penyimpanan peta dasar (berkas .pmtiles per tim) di HP, untuk dipakai tanpa sinyal.
// Disimpan di Cache Storage yang sama dengan peta wilayah ("sigap-peta-v1", sesi.ts) pada kunci tetap /peta-cache/dasar/<berkas>; tidak ada kode lain
// yang menghapus kunci itu. Dibaca LANGSUNG oleh halaman (bukan lewat service worker), jadi service worker tidak perlu diubah.
// Unduhan hanya atas ketukan petugas (tombol), tidak otomatis: berkasnya puluhan MB.

import { NAMA_CACHE_PETA } from "./sesi";
import { cacheDidukung } from "./petaOffline";
import { bacaManifestDasar, jalurCacheDasar, jalurCacheGlyph, urlPublikBerkas, type BerkasTim, type ManifestDasar } from "@/lib/petaDasar";

const KUNCI_MANIFEST_DASAR = "sigap_peta_dasar_manifest_v1";
const NAMA_MANIFEST = "manifest.json";

export const alamatSupabase = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const urlBerkasDasar = (nama: string) => urlPublikBerkas(alamatSupabase(), nama);

// ------------------------------------------------------------------ manifest
function bacaManifestSimpanan(): ManifestDasar | null {
  try {
    const s = localStorage.getItem(KUNCI_MANIFEST_DASAR);
    return s ? bacaManifestDasar(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

/** Manifest terbaru dari Storage (batas 6 dtk). Gagal/luring: manifest terakhir yang tersimpan di HP (bisa null). */
export async function ambilManifestDasar(): Promise<{ manifest: ManifestDasar | null; dariJaringan: boolean }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { manifest: bacaManifestSimpanan(), dariJaringan: false };
  const ac = new AbortController();
  const batas = setTimeout(() => ac.abort(), 6000);
  try {
    const res = await fetch(`${urlBerkasDasar(NAMA_MANIFEST)}?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store", signal: ac.signal });
    if (!res.ok) return { manifest: bacaManifestSimpanan(), dariJaringan: false };
    const m = bacaManifestDasar(await res.json());
    if (m) {
      try {
        localStorage.setItem(KUNCI_MANIFEST_DASAR, JSON.stringify(m));
      } catch {
        /* penyimpanan penuh: abaikan */
      }
    }
    return { manifest: m ?? bacaManifestSimpanan(), dariJaringan: !!m };
  } catch {
    return { manifest: bacaManifestSimpanan(), dariJaringan: false };
  } finally {
    clearTimeout(batas);
  }
}

// ------------------------------------------------------------------ salinan di HP
export type InfoSalinan = { versi: string | null; disimpanAt: number; ukuran: number };

/** Keterangan salinan (tanpa membaca isi berkas). null = belum tersimpan. */
export async function infoSalinanDasar(nama: string): Promise<InfoSalinan | null> {
  if (!cacheDidukung()) return null;
  try {
    const c = await caches.open(NAMA_CACHE_PETA);
    const r = await c.match(jalurCacheDasar(nama));
    if (!r) return null;
    return { versi: r.headers.get("X-Versi"), disimpanAt: Number(r.headers.get("X-Disimpan")) || 0, ukuran: Number(r.headers.get("X-Ukuran")) || 0 };
  } catch {
    return null;
  }
}

export async function bacaBlobDasar(nama: string): Promise<Blob | null> {
  if (!cacheDidukung()) return null;
  try {
    const c = await caches.open(NAMA_CACHE_PETA);
    const r = await c.match(jalurCacheDasar(nama));
    return r ? await r.blob() : null;
  } catch {
    return null;
  }
}

export type HasilUnduhDasar = { ok: true } | { ok: false; pesan: string };

/** Unduh satu berkas peta tim ke Cache Storage. Memeriksa ruang, melaporkan kemajuan, dan memastikan ukuran sama dengan manifest. */
export async function unduhDasar(b: BerkasTim, onProgres: (diterima: number, total: number) => void, sinyal?: AbortSignal): Promise<HasilUnduhDasar> {
  if (!cacheDidukung()) return { ok: false, pesan: "Peramban ini tidak mendukung penyimpanan peta di HP." };
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota != null && est.usage != null && est.quota - est.usage < b.ukuran * 1.5) {
      return { ok: false, pesan: "Ruang penyimpanan HP tidak cukup untuk peta ini. Kosongkan ruang lalu coba lagi." };
    }
  } catch {
    /* tidak bisa memeriksa: lanjutkan */
  }
  let res: Response;
  try {
    res = await fetch(urlBerkasDasar(b.berkas), { signal: sinyal, cache: "no-store" });
  } catch {
    return { ok: false, pesan: "Tidak ada sinyal. Coba lagi saat sinyal bagus atau di Wi-Fi." };
  }
  if (!res.ok || !res.body) return { ok: false, pesan: res.status === 404 ? "Berkas peta untuk tim ini belum diunggah admin." : `Gagal mengunduh (${res.status}).` };
  const potongan: Uint8Array[] = [];
  let diterima = 0;
  try {
    const baca = res.body.getReader();
    for (;;) {
      const { done, value } = await baca.read();
      if (done) break;
      if (value) {
        potongan.push(value);
        diterima += value.length;
        onProgres(diterima, b.ukuran);
      }
    }
  } catch {
    return { ok: false, pesan: "Unduhan terputus. Coba lagi saat sinyal lebih baik." };
  }
  if (diterima !== b.ukuran) return { ok: false, pesan: "Unduhan tidak lengkap. Coba lagi." };
  try {
    const c = await caches.open(NAMA_CACHE_PETA);
    await c.put(
      jalurCacheDasar(b.berkas),
      new Response(new Blob(potongan as BlobPart[], { type: "application/octet-stream" }), {
        headers: { "Content-Type": "application/octet-stream", "X-Disimpan": String(Date.now()), "X-Versi": b.versi, "X-Ukuran": String(b.ukuran) },
      })
    );
  } catch {
    return { ok: false, pesan: "Penyimpanan HP penuh. Kosongkan ruang lalu coba lagi." };
  }
  try {
    await navigator.storage?.persist?.(); // minta agar tidak dibuang saat ruang HP menipis (boleh ditolak)
  } catch {
    /* abaikan */
  }
  return { ok: true };
}

// ------------------------------------------------------------------ huruf peta (glyph)
/** Huruf peta: dari Cache Storage bila ada, kalau tidak dari /peta/glyphs (berkas statis aplikasi) lalu disimpan untuk pemakaian tanpa sinyal. */
export async function muatGlyph(font: string, rentang: string): Promise<ArrayBuffer> {
  const kunci = jalurCacheGlyph(font, rentang);
  if (cacheDidukung()) {
    try {
      const c = await caches.open(NAMA_CACHE_PETA);
      const r = await c.match(kunci);
      if (r) return await r.arrayBuffer();
    } catch {
      /* lanjut ke jaringan */
    }
  }
  const res = await fetch(`/peta/glyphs/${encodeURIComponent(font)}/${rentang}.pbf`);
  if (!res.ok) throw new Error(`glyph ${res.status}`);
  const buf = await res.arrayBuffer();
  if (cacheDidukung()) {
    try {
      const c = await caches.open(NAMA_CACHE_PETA);
      await c.put(kunci, new Response(buf.slice(0), { headers: { "Content-Type": "application/x-protobuf", "X-Disimpan": String(Date.now()) } }));
    } catch {
      /* penyimpanan penuh: tetap dipakai sekali ini */
    }
  }
  return buf;
}

// ------------------------------------------------------------------ sumber PMTiles dari berkas di HP
/** Sumber PMTiles (antarmuka Source milik pustaka pmtiles) yang membaca dari Blob di memori/Cache Storage. */
export class SumberBlob {
  constructor(private blob: Blob, private nama: string) {}
  getKey(): string {
    return `blob:${this.nama}`;
  }
  async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
    return { data: await this.blob.slice(offset, offset + length).arrayBuffer() };
  }
}
