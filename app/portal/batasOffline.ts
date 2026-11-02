// app/portal/batasOffline.ts  (klien)
//
// (2 Nov 2026) Pemuat batas Sub SLS per kecamatan, dengan salinan di HP untuk dipakai tanpa sinyal.
// Berkasnya statis di aplikasi (public/peta/batas/, 78-305 KB per kecamatan), jadi disimpan OTOMATIS di Cache Storage yang sama dengan peta
// ("sigap-peta-v1") pada kunci /peta-cache/batas/<berkas> begitu pernah dimuat; tidak perlu tombol unduh. Dibaca langsung oleh halaman,
// service worker tidak diubah. Salinan dipakai bila versinya cocok dengan manifest; bila manifest tidak terjangkau (luring) salinan apa pun dipakai.

import { cacheDidukung } from "./petaOffline";
import { NAMA_CACHE_PETA } from "./sesi";
import {
  JALUR_BATAS,
  NAMA_MANIFEST_BATAS,
  bacaBerkasBatas,
  bacaManifestBatas,
  jalurCacheBatas,
  type BerkasBatas,
  type KecBatas,
  type ManifestBatas,
} from "@/lib/batasSubsls";

const KUNCI_MANIFEST = "sigap_peta_batas_manifest_v1";

function bacaManifestSimpanan(): ManifestBatas | null {
  try {
    const s = localStorage.getItem(KUNCI_MANIFEST);
    return s ? bacaManifestBatas(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

/** Manifest terbaru (batas 6 dtk). Gagal/luring: manifest terakhir yang tersimpan di HP (bisa null). */
export async function ambilManifestBatas(): Promise<{ manifest: ManifestBatas | null; dariJaringan: boolean }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { manifest: bacaManifestSimpanan(), dariJaringan: false };
  const ac = new AbortController();
  const batas = setTimeout(() => ac.abort(), 6000);
  try {
    const res = await fetch(`${JALUR_BATAS}/${NAMA_MANIFEST_BATAS}`, { cache: "no-cache", signal: ac.signal });
    if (!res.ok) return { manifest: bacaManifestSimpanan(), dariJaringan: false };
    const m = bacaManifestBatas(await res.json());
    if (m) {
      try {
        localStorage.setItem(KUNCI_MANIFEST, JSON.stringify(m));
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

type Salinan = { versi: string | null; isi: BerkasBatas };

async function bacaSalinan(berkas: string): Promise<Salinan | null> {
  if (!cacheDidukung()) return null;
  try {
    const c = await caches.open(NAMA_CACHE_PETA);
    const r = await c.match(jalurCacheBatas(berkas));
    if (!r) return null;
    const isi = bacaBerkasBatas(await r.json());
    return isi ? { versi: r.headers.get("X-Versi"), isi } : null;
  } catch {
    return null;
  }
}

async function simpanSalinan(berkas: string, versi: string, teks: string): Promise<void> {
  if (!cacheDidukung()) return;
  try {
    const c = await caches.open(NAMA_CACHE_PETA);
    await c.put(
      jalurCacheBatas(berkas),
      new Response(teks, { headers: { "Content-Type": "application/json", "X-Versi": versi, "X-Disimpan": String(Date.now()), "X-Ukuran": String(teks.length) } })
    );
  } catch {
    /* penyimpanan HP penuh: batas tetap tampil sesi ini, hanya tidak tersimpan */
  }
}

export type HasilBatas = { ok: true; isi: BerkasBatas; dariSalinan: boolean } | { ok: false; alasan: "jaringan" | "berkas" };

/** Satu kecamatan: salinan HP bila versinya sama; selain itu dari jaringan (lalu disimpan); jaringan gagal -> salinan lama; tidak ada -> gagal. */
export async function muatBatasKecamatan(kec: KecBatas, versi: string, bolehSalinanLama = true): Promise<HasilBatas> {
  const salinan = await bacaSalinan(kec.berkas);
  if (salinan && salinan.versi === versi) return { ok: true, isi: salinan.isi, dariSalinan: true };
  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    const ac = new AbortController();
    const batas = setTimeout(() => ac.abort(), 20000);
    try {
      const res = await fetch(`${JALUR_BATAS}/${encodeURIComponent(kec.berkas)}?v=${encodeURIComponent(versi)}`, { signal: ac.signal });
      if (res.ok) {
        const teks = await res.text();
        let isi: BerkasBatas | null = null;
        try {
          isi = bacaBerkasBatas(JSON.parse(teks));
        } catch {
          isi = null;
        }
        if (isi) {
          void simpanSalinan(kec.berkas, versi, teks);
          return { ok: true, isi, dariSalinan: false };
        }
        if (!salinan) return { ok: false, alasan: "berkas" };
      }
    } catch {
      /* jaringan putus: jatuh ke salinan lama */
    } finally {
      clearTimeout(batas);
    }
  }
  if (salinan && bolehSalinanLama) return { ok: true, isi: salinan.isi, dariSalinan: true };
  return { ok: false, alasan: "jaringan" };
}

/** Siapkan salinan kecamatan di HP tanpa menampilkannya (saat sinyal ada): supaya batas juga tersedia di jorong lain milik tim saat luring. */
export async function siapkanSalinanBatas(kec: KecBatas, versi: string): Promise<void> {
  const salinan = await bacaSalinan(kec.berkas);
  if (salinan && salinan.versi === versi) return;
  await muatBatasKecamatan(kec, versi, false);
}
