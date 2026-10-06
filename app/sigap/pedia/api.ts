// app/sigap/pedia/api.ts  (hanya diimpor komponen klien)
//
// (7 Okt 2026) SIGAP PEDIA -- helper fetch klien (sesi SIGAP yg sama dgn admin).

import { bacaSesi, fetchJson, hapusSesi, keMasuk, SesiBerakhir } from "../admin/api";

export function ambilP<T>(param: Record<string, string | number | null | undefined>): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(param)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  return fetchJson<T>(`/api/sigap/pedia?${q.toString()}`);
}

export function aksiP<T = { ok: boolean }>(aksi: string, isi: Record<string, unknown> = {}): Promise<T> {
  return fetchJson<T>("/api/sigap/pedia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi, ...isi }) });
}

/** Unggah beberapa file sekaligus ke entri. */
export async function unggahFile(entriId: number, daftar: { file: File; jenis: string }[]) {
  const fd = new FormData();
  for (const d of daftar) {
    fd.append("file", d.file, d.file.name);
    fd.append("jenis", d.jenis);
  }
  return fetchJson<{ ok: boolean; hasil: { nama: string; ok: boolean; galat?: string; sha256?: string; tsa_status?: string; dkim?: string | null; lampiran?: number }[] }>(
    `/api/sigap/pedia/${entriId}/file`,
    { method: "POST", body: fd }
  );
}

/** Unduh berkas biner ber-Bearer (ZIP/XLSX) lalu simpan. */
export async function unduhBiner(url: string, cadangan = "unduhan"): Promise<void> {
  const s = bacaSesi();
  if (!s) {
    keMasuk();
    throw new SesiBerakhir();
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${s}` }, cache: "no-store" });
  if (res.status === 401) {
    hapusSesi();
    keMasuk();
    throw new SesiBerakhir();
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error ?? `Gagal mengunduh (${res.status}).`);
  }
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = cd.match(/filename\*=UTF-8''([^;]+)/) ?? cd.match(/filename="([^"]+)"/);
  const nama = m ? decodeURIComponent(m[1]) : cadangan;
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

export type Kartu = {
  id: number;
  nomor_registrasi: string;
  judul: string;
  kesimpulan: string | null;
  kanal: string;
  kanal_lain: string | null;
  nomor_tiket: string | null;
  sifat: string;
  status: string;
  perlu_ditinjau: boolean;
  alasan_tinjau: string | null;
  tgl_diajukan: string | null;
  tgl_dijawab: string | null;
  tahun: number;
  dibuat_at: string;
  menggantikan_id: number | null;
  kategori: { kode: string; nama: string } | null;
  induk: { kode: string; nama: string } | null;
  tag: string[];
};
