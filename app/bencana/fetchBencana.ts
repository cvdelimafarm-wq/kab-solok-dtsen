// app/bencana/fetchBencana.ts
//
// (6 Nov 2026) Rute admin /api/bencana/** kini wajib sesi SIGAP + izin Pendataan Pascabencana (lib/gerbangRute.ts). Halaman /bencana
// dulu tidak mengirim sesi apa pun. Pembungkus ini menyisipkan `Authorization: Bearer <sesi>` dari localStorage (kunci yang sama dengan
// app/sigap/admin/api.ts) pada setiap panggilan ke rute admin. Tanpa sesi, permintaan tetap dikirim apa adanya dan server menjawab 401.
// Rute publik (wilayah, gate, jorong, dsb.) tidak memakai pembungkus ini.

const KUNCI_SESI = "sigap_sesi";
const KUNCI_SESI_SAMPAI = "sigap_sesi_sampai";

/** Sesi SIGAP yang masih berlaku di peramban ini, atau null. */
export function sesiBencana(): string | null {
  try {
    const s = localStorage.getItem(KUNCI_SESI);
    const sampai = localStorage.getItem(KUNCI_SESI_SAMPAI);
    if (!s) return null;
    if (sampai && new Date(sampai).getTime() < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

/** `fetch` biasa + header Bearer bila ada sesi. */
export function fetchBencana(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const sesi = sesiBencana();
  if (!sesi) return fetch(input, init);
  const h = new Headers(init.headers);
  if (!h.has("Authorization")) h.set("Authorization", `Bearer ${sesi}`);
  return fetch(input, { ...init, headers: h });
}
