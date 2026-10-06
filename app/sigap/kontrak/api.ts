// app/sigap/kontrak/api.ts  (hanya diimpor komponen klien)
//
// (6 Okt 2026) Helper fetch modul Pengadaan & Kontrak -- memakai sesi SIGAP yg sama (../admin/api).

import { fetchJson, bacaSesi, hapusSesi, keMasuk, SesiBerakhir } from "../admin/api";

export function ambilK<T>(param: Record<string, string | number>): Promise<T> {
  const q = new URLSearchParams(Object.entries(param).map(([k, v]) => [k, String(v)]));
  return fetchJson<T>(`/api/sigap/kontrak?${q.toString()}`);
}

export function aksiK<T = { ok: boolean }>(aksi: string, isi: Record<string, unknown> = {}): Promise<T> {
  return fetchJson<T>("/api/sigap/kontrak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aksi, ...isi }) });
}

/** Unduh berkas ber-Bearer lalu simpan dgn nama dari Content-Disposition. */
export async function unduhBerkas(url: string): Promise<void> {
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
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const nama = m ? decodeURIComponent(m[1]) : "dokumen";
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
