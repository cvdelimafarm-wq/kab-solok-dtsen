"use client";

// app/portal/simulasi.ts
//
// (11 Okt 2026) Mode "masuk sebagai" = SIMULASI -- keputusan user: "hanya lihat, tapi usahakan saya bisa simulasi pengisian seperti upload foto
// atau mengetik identifikasi dll. tapi datanya tidak dikirim". Akun super bisa menekan tombol apa pun seperti petugas (isi, unggah, simpan),
// tetapi SEMUA penulisan berhenti di HP ini:
//  - fetch / XMLHttpRequest / sendBeacon dengan metode selain GET/HEAD ke /api/* (atau unggah langsung ke Supabase Storage) tidak dikirim;
//    pemanggil menerima jawaban tiruan 200 { ok: true, simulasi: true } supaya alur layar berjalan seperti biasa;
//  - pengecualian: /api/sigap/masuk (Ganti akun / Kembali ke akun saya) dan /api/portal/sso (membuka aplikasi penyisiran) -- keduanya
//    hanya menerbitkan sesi, tidak mengubah data petugas;
//  - tiap penulisan yang ditahan memicu event "sigap-simulasi" (spanduk menampilkan "Simulasi: tidak dikirim").
// Penjaga kedua ada di server (middleware.ts): sesi "masuk sebagai" (4 bagian) yang menulis ke /api/* dijawab tiruan tanpa menyentuh database.
// Dipasang sekali saat modul ini dimuat (diimpor oleh BannerLihatSebagai di layout), SEBELUM komponen lain sempat mengirim (ping, push, antrean).

import { bacaLihatSebagai } from "./sesi";

export const EVENT_SIMULASI = "sigap-simulasi";
const BEBAS = ["/api/sigap/masuk", "/api/portal/sso"];

export const modeSimulasi = (): boolean => typeof window !== "undefined" && !!bacaLihatSebagai();

function urlDari(input: RequestInfo | URL): URL | null {
  try {
    const s = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(s, window.location.href);
  } catch {
    return null;
  }
}

/** Penulisan yang harus ditahan dalam mode simulasi? */
export function harusDitahan(metode: string | undefined, input: RequestInfo | URL): boolean {
  const m = (metode ?? "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  if (!modeSimulasi()) return false;
  const u = urlDari(input);
  if (!u) return false;
  if (u.origin === window.location.origin) {
    if (!u.pathname.startsWith("/api/")) return false;
    return !BEBAS.some((b) => u.pathname === b || u.pathname.startsWith(`${b}/`));
  }
  // unggah langsung ke Supabase Storage (tautan bertanda tangan) juga ditahan
  return /\.supabase\.co$/.test(u.hostname) && u.pathname.includes("/storage/");
}

const JAWABAN = JSON.stringify({ ok: true, simulasi: true, pesan: "Simulasi: data tidak dikirim ke server." });

function kabari(input: RequestInfo | URL, metode: string) {
  const u = urlDari(input);
  try {
    window.dispatchEvent(new CustomEvent(EVENT_SIMULASI, { detail: { metode, jalur: u ? u.pathname : String(input) } }));
  } catch {
    /* abaikan */
  }
}

let terpasang = false;
function pasang() {
  if (terpasang || typeof window === "undefined") return;
  terpasang = true;

  const fetchAsli = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const metode = init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET");
    if (harusDitahan(metode, input)) {
      kabari(input, metode);
      return Promise.resolve(new Response(JAWABAN, { status: 200, headers: { "Content-Type": "application/json", "X-Simulasi": "1" } }));
    }
    return fetchAsli(input, init);
  };

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const beaconAsli = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      if (harusDitahan("POST", url)) {
        kabari(url, "POST");
        return true;
      }
      return beaconAsli(url, data);
    };
  }

  // XMLHttpRequest (unggah foto dengan progres): open() mencatat tujuan, send() menjawab tiruan tanpa mengirim
  if (typeof XMLHttpRequest !== "undefined") {
    const proto = XMLHttpRequest.prototype;
    const openAsli = proto.open;
    const sendAsli = proto.send;
    type Xhr = XMLHttpRequest & { __simMetode?: string; __simUrl?: string };
    proto.open = function (this: Xhr, metode: string, url: string | URL, ...sisa: unknown[]) {
      this.__simMetode = metode;
      this.__simUrl = String(url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (openAsli as any).call(this, metode, url, ...sisa);
    } as typeof proto.open;
    proto.send = function (this: Xhr, body?: Document | XMLHttpRequestBodyInit | null) {
      if (this.__simUrl && harusDitahan(this.__simMetode, this.__simUrl)) {
        kabari(this.__simUrl, this.__simMetode ?? "POST");
        const isi = (k: string, v: unknown) => Object.defineProperty(this, k, { configurable: true, get: () => v });
        isi("readyState", 4);
        isi("status", 200);
        isi("statusText", "OK");
        isi("responseText", JAWABAN);
        isi("response", this.responseType === "json" ? JSON.parse(JAWABAN) : JAWABAN);
        isi("responseURL", this.__simUrl);
        setTimeout(() => {
          try {
            this.upload?.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: 1, total: 1 }));
            this.upload?.dispatchEvent(new ProgressEvent("load"));
          } catch {
            /* abaikan */
          }
          this.dispatchEvent(new Event("readystatechange"));
          this.dispatchEvent(new ProgressEvent("load"));
          this.dispatchEvent(new ProgressEvent("loadend"));
        }, 150);
        return;
      }
      return sendAsli.call(this, body);
    };
  }
}

pasang();
