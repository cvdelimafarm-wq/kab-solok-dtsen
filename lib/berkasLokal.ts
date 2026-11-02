// lib/berkasLokal.ts  (khusus browser)
//
// (2 Nov 2026) Simpanan berkas instrumen di HP (Cache Storage): berkas yang sudah pernah diunduh langsung terbuka dari HP, tanpa unduh ulang dan tanpa sinyal.
// Berkas instrumen tidak pernah diubah isinya (unggahan baru = id baru), jadi kunci = id berkas. Bila Cache Storage tidak ada / penuh, semua fungsi diam-diam
// mengembalikan "tidak ada" dan halaman kembali mengunduh seperti biasa.

export const NAMA_SIMPANAN_BERKAS = "sigap-instrumen-v1";
const awalan = "/_berkas-lokal/";
export const kunciBerkasLokal = (id: number): string => `${awalan}${id}`;

const tersedia = (): boolean => typeof caches !== "undefined" && typeof caches.open === "function";

/** Id berkas yang sudah tersimpan di HP ini. */
export async function idBerkasTersimpan(): Promise<Set<number>> {
  if (!tersedia()) return new Set();
  try {
    const c = await caches.open(NAMA_SIMPANAN_BERKAS);
    const ks = await c.keys();
    const hasil = new Set<number>();
    for (const k of ks) {
      const p = new URL(k.url, "http://x").pathname;
      if (p.startsWith(awalan)) {
        const id = Number(p.slice(awalan.length));
        if (Number.isInteger(id) && id > 0) hasil.add(id);
      }
    }
    return hasil;
  } catch {
    return new Set();
  }
}

export async function simpanBerkasLokal(id: number, blob: Blob): Promise<boolean> {
  if (!tersedia()) return false;
  try {
    const c = await caches.open(NAMA_SIMPANAN_BERKAS);
    await c.put(kunciBerkasLokal(id), new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream" } }));
    return true;
  } catch {
    return false; // penyimpanan penuh / dimatikan
  }
}

export async function ambilBerkasLokal(id: number): Promise<Blob | null> {
  if (!tersedia()) return null;
  try {
    const c = await caches.open(NAMA_SIMPANAN_BERKAS);
    const r = await c.match(kunciBerkasLokal(id));
    return r ? await r.blob() : null;
  } catch {
    return null;
  }
}

export async function hapusBerkasLokal(id: number): Promise<void> {
  if (!tersedia()) return;
  try {
    const c = await caches.open(NAMA_SIMPANAN_BERKAS);
    await c.delete(kunciBerkasLokal(id));
  } catch {
    /* abaikan */
  }
}
