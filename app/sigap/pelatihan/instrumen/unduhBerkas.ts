// app/sigap/pelatihan/instrumen/unduhBerkas.ts  (khusus browser)
//
// (2 Nov 2026) Buka atau unduh berkas instrumen. Pertama kali: diunduh dari server (dicatat sebagai "sudah mempelajari instrumen") lalu DISIMPAN di HP.
// Berikutnya: langsung terbuka dari HP, tanpa unduh ulang dan tanpa sinyal. PDF / gambar dibuka di tab baru; format lain disimpan ke HP dengan nama aslinya.

import { bacaSesi, keMasuk, SesiBerakhir, urlPelatihan } from "../../admin/api";
import { ambilBerkasLokal, simpanBerkasLokal } from "@/lib/berkasLokal";
import { bisaDibukaDiTab, ekstensi } from "@/lib/instrumenBerkas";

const URL_INSTRUMEN = "/api/sigap/pelatihan/instrumen";
const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** Membuka blob: PDF / gambar di tab baru, lainnya sebagai unduhan bernama asli. Mengembalikan false bila tab baru diblokir browser. */
export function bukaBlob(blob: Blob, nama: string): boolean {
  const mime = MIME[ekstensi(nama)];
  const isi = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
  const obj = URL.createObjectURL(isi);
  setTimeout(() => URL.revokeObjectURL(obj), 5 * 60_000);
  if (bisaDibukaDiTab(nama)) return window.open(obj, "_blank") !== null;
  const a = document.createElement("a");
  a.href = obj;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

export type HasilUnduh = { dari: "hp" | "server"; dibuka: boolean; tersimpan: boolean };

export async function unduhBerkas(b: { id: number; nama_file: string }): Promise<HasilUnduh> {
  const lokal = await ambilBerkasLokal(b.id);
  if (lokal) return { dari: "hp", dibuka: bukaBlob(lokal, b.nama_file), tersimpan: true };

  const res = await fetch(urlPelatihan(`${URL_INSTRUMEN}?unduh=${b.id}`), { headers: { Authorization: `Bearer ${bacaSesi() ?? ""}` }, cache: "no-store" });
  if (res.status === 401) {
    keMasuk();
    throw new SesiBerakhir();
  }
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Gagal (${res.status}).`);
  let blob: Blob;
  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    const { url } = (await res.json()) as { url: string };
    const isi = await fetch(url).catch(() => null);
    if (!isi || !isi.ok) {
      window.location.href = url; // cadangan: unduh langsung dari tautan sementara (tidak tersimpan di HP)
      return { dari: "server", dibuka: true, tersimpan: false };
    }
    blob = await isi.blob();
  } else {
    blob = await res.blob();
  }
  const tersimpan = await simpanBerkasLokal(b.id, blob);
  return { dari: "server", dibuka: bukaBlob(blob, b.nama_file), tersimpan };
}
