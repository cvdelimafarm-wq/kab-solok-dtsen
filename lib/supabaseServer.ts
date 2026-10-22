// lib/supabaseServer.ts
//
// (22 Okt 2026) Pengganti `createClient` dari "@supabase/supabase-js" UNTUK KODE SERVER (route API, halaman server, pustaka server).
// Alasan (catatan-kebocoran-memori-railway.md, 17 Okt 2026): hampir setiap route membuat klien baru per request TANPA opsi `auth`.
// Di Node, auth-js menyalakan `setInterval` 30 detik (auto refresh token) untuk tiap klien, sehingga klien tidak pernah dilepas
// dari memori: ~11,7 KB per klien x ~468 ribu request/minggu = gerigi memori sampai 2-2,7 GB di Railway (84% tagihan).
// Terukur (supabase-js 2.116.0, 20.000 klien): bawaan 11,69 KB/klien; dengan opsi di bawah 0,16 KB/klien.
//
// Cara pakai: ganti SATU baris impor, panggilan tidak berubah:
//   import { createClient } from "@supabase/supabase-js";   ->   import { createClient } from "@/lib/supabaseServer";
//
// Perilaku:
//  - Opsi auth dimatikan (autoRefreshToken/persistSession/detectSessionInUrl = false): klien service-role tidak punya sesi pengguna.
//  - Tanpa `opsi`, klien DIPAKAI BERSAMA per pasangan (url, kunci): klien service-role tanpa sesi tidak menyimpan keadaan per request,
//    jadi aman dipakai bersama. Dengan `opsi` (mis. header khusus per request) klien dibuat baru, tetap dengan auth dimatikan.
//  - JANGAN dipakai di kode browser/komponen "use client" atau untuk klien yang memang butuh sesi pengguna (kunci anon + login):
//    untuk itu tetap pakai lib/supabase/client.ts atau lib/supabase/server.ts.

import { createClient as buatKlien, type SupabaseClient, type SupabaseClientOptions } from "@supabase/supabase-js";

export type { SupabaseClient };

export const OPSI_AUTH_SERVER = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } as const;

const simpanan = new Map<string, SupabaseClient>();

/** Hanya untuk uji: kosongkan klien bersama. */
export function kosongkanKlienBersama(): void {
  simpanan.clear();
}

/** Jumlah klien bersama yang sedang disimpan (untuk uji). */
export function jumlahKlienBersama(): number {
  return simpanan.size;
}

export function createClient(url: string, kunci: string, opsi?: SupabaseClientOptions<"public">): SupabaseClient {
  if (opsi) {
    return buatKlien(url, kunci, { ...opsi, auth: { ...OPSI_AUTH_SERVER, ...(opsi.auth ?? {}) } });
  }
  const id = `${url}|${kunci}`;
  let klien = simpanan.get(id);
  if (!klien) {
    klien = buatKlien(url, kunci, { auth: { ...OPSI_AUTH_SERVER } });
    simpanan.set(id, klien);
  }
  return klien;
}
