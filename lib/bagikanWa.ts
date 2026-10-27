// lib/bagikanWa.ts  (murni)
//
// (27 Okt 2026) Bagikan foto ber-cap SIGAP ke WhatsApp (chat/grup) atau Story/Status WhatsApp. Peramban tidak bisa menembak langsung ke Status WhatsApp; yang bisa
// dilakukan adalah membuka lembar bagikan HP (Web Share dengan berkas) lalu petugas memilih WhatsApp -> kontak/grup atau "Status saya". Bila peramban tidak mendukung
// bagikan berkas (mis. komputer), foto diunduh agar bisa dilampirkan manual. Tampilan: app/sigap/foto/BagikanWa.tsx.

export type TujuanWa = "chat" | "status";
export type InfoFotoBagikan = { kode: string; lokasi?: string | null; diambil_at?: string | null; kegiatan?: string | null; asal?: string | null };

/** Nama berkas aman untuk disimpan/dibagikan: sigap-<kode>.jpg (huruf kecil, angka, strip). */
export function namaBerkasFoto(kode: string): string {
  const bersih = kode.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `sigap-${bersih || "foto"}.jpg`;
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "26 Okt 2026, 09.15 WIB" dari ISO UTC; "" bila tidak valid. */
export function waktuWib(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + 7 * 3_600_000);
  const jj = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${jj}.${mm} WIB`;
}

/** Alamat verifikasi foto = isi QR pada cap (cermin urlVerifikasi di lib/sigapFoto.ts; jaga tetap sama). */
export function tautanVerifikasi(kode: string, asal: string | null | undefined): string {
  const dasar = (asal && asal.trim() ? asal.trim() : "https://bps-solokkab.up.railway.app").replace(/\/+$/, "");
  return `${dasar}/verifikasi?k=${encodeURIComponent(kode)}`;
}

/** Keterangan yang menyertai foto (menjadi teks/keterangan di WhatsApp). */
export function teksBagikanFoto(f: InfoFotoBagikan): string {
  const keg = f.kegiatan && f.kegiatan.trim() ? f.kegiatan.trim() : null;
  const baris = [`Hai, saya berbagi foto ${keg ? `pendataan ${keg}` : "pendataan"} dari SIGAP BPS Kab. Solok.`];
  const w = waktuWib(f.diambil_at);
  if (w) baris.push(`Waktu: ${w}`);
  if (f.lokasi && f.lokasi.trim()) baris.push(`Lokasi: ${f.lokasi.trim()}`);
  baris.push(`Kode foto: ${f.kode}`);
  baris.push(`Link verifikasi: ${tautanVerifikasi(f.kode, f.asal)}`);
  return baris.join("\n");
}

/** Tautan WhatsApp untuk teks saja (cadangan; tidak bisa melampirkan foto). */
export function urlWaTeks(teks: string): string {
  return `https://wa.me/?text=${encodeURIComponent(teks)}`;
}

type NavBagikan = { share?: unknown; canShare?: (data: { files: File[] }) => boolean };
/** Peramban bisa membagikan berkas ini lewat lembar bagikan HP? */
export function bisaBagikanBerkas(nav: NavBagikan | null | undefined, berkas: File): boolean {
  if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [berkas] }) === true;
  } catch {
    return false;
  }
}

/** Petunjuk singkat sesudah lembar bagikan terbuka. */
export function petunjukTujuan(t: TujuanWa): string {
  return t === "status"
    ? "Di lembar bagikan pilih WhatsApp, lalu \"Status saya\" (Pembaruan > Status)."
    : "Di lembar bagikan pilih WhatsApp, lalu kontak atau grup tujuan.";
}
