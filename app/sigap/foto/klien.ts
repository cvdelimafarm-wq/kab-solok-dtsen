// app/sigap/foto/klien.ts  (hanya klien)
//
// (19 Okt 2026) Pembantu panggilan API Kamera SIGAP. apiPortal (app/portal/sesi.ts) selalu memasang Content-Type JSON sehingga TIDAK bisa
// dipakai untuk unggah multipart; di sini fetch sendiri dengan header Authorization yang sama. Sesi "masuk sebagai" (4 bagian) dijawab
// tiruan { simulasi: true } oleh middleware -- harus ditangani: foto TIDAK terkirim.

import { bacaSesi } from "@/app/portal/sesi";

export type GalatFoto = Error & { status?: number; kode?: string };

function galat(pesan: string, status?: number, kode?: string): GalatFoto {
  const g: GalatFoto = new Error(pesan);
  g.status = status;
  g.kode = kode;
  return g;
}

export type HasilKirim<T> = { simulasi: true } | { simulasi: false; data: T };

/** POST multipart. Melempar GalatFoto (status undefined = tidak ada sambungan). 401 -> "SESI_BERAKHIR" (halaman memutuskan arah). */
export async function kirimMultipart<T>(path: string, form: FormData, onProgres?: (bagian: number) => void): Promise<HasilKirim<T>> {
  const s = bacaSesi();
  let status: number;
  let json: Record<string, unknown>;
  if (onProgres) {
    // (27 Okt 2026) Dengan penghitung kemajuan unggah (fetch tidak punya): XMLHttpRequest. Jalur tanpa onProgres tetap fetch seperti semula.
    const hasil = await new Promise<{ status: number; teks: string }>((ok, tolak) => {
      const x = new XMLHttpRequest();
      x.open("POST", path);
      if (s) x.setRequestHeader("Authorization", `Bearer ${s}`);
      x.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgres(e.loaded / e.total);
      };
      x.upload.onload = () => onProgres(1);
      x.onload = () => ok({ status: x.status, teks: x.responseText });
      x.onerror = () => tolak(galat("Tidak ada sambungan."));
      x.ontimeout = () => tolak(galat("Tidak ada sambungan."));
      x.onabort = () => tolak(galat("Tidak ada sambungan."));
      x.send(form);
    });
    status = hasil.status;
    try {
      json = JSON.parse(hasil.teks) as Record<string, unknown>;
    } catch {
      json = {};
    }
  } else {
    let res: Response;
    try {
      res = await fetch(path, { method: "POST", body: form, headers: s ? { Authorization: `Bearer ${s}` } : {} });
    } catch (e) {
      throw galat(e instanceof Error ? e.message : "Tidak ada sambungan.");
    }
    status = res.status;
    json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  }
  if (status === 401) throw galat("SESI_BERAKHIR", 401);
  if (json.simulasi === true) return { simulasi: true };
  if (status < 200 || status >= 300) throw galat(typeof json.error === "string" ? json.error : `Gagal (${status})`, status, typeof json.kode === "string" ? json.kode : undefined);
  return { simulasi: false, data: json as T };
}

export async function ambilJson<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const s = bacaSesi();
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: { ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(s ? { Authorization: `Bearer ${s}` } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch (e) {
    throw galat(e instanceof Error ? e.message : "Tidak ada sambungan.");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 401) throw galat("SESI_BERAKHIR", 401);
  if (!res.ok) throw galat(typeof json.error === "string" ? json.error : `Gagal (${res.status})`, res.status);
  return json as T;
}

/** Foto ber-cap sebagai blob URL (tag <img> tidak bisa mengirim header Authorization). Pemanggil wajib URL.revokeObjectURL. */
export async function ambilFotoUrl(id: number): Promise<string> {
  const s = bacaSesi();
  const res = await fetch(`/api/sigap/foto/berkas?id=${id}`, { headers: s ? { Authorization: `Bearer ${s}` } : {} });
  if (!res.ok) throw galat(res.status === 410 ? "Berkas sudah dihapus atas persetujuan." : "Foto tidak bisa dimuat.", res.status);
  return URL.createObjectURL(await res.blob());
}
