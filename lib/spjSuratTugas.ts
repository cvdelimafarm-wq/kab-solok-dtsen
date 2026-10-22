// lib/spjSuratTugas.ts
//
// (23 Okt 2026) Pembantu bersama untuk API Surat Tugas SPJ. Dulu ketiganya diekspor langsung dari
// app/api/penyisiran/spj/surat-tugas/route.ts dan diimpor oleh .../[id]/file/route.ts -- Next.js 15 MENOLAK build
// bila berkas route.ts mengekspor selain GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS dan opsi route (runtime, dynamic, dst).
// Karena itu pembantu dipindah ke sini.

import { createClient } from "@/lib/supabaseServer";

export const UKURAN_MAKS_BYTE = 15 * 1024 * 1024; // 15MB -- cukup lega utk scan PDF/foto ST

export function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Nama file dibersihkan dari karakter yang bisa bermasalah di path Storage
// -- spasi & karakter aneh diganti "_", tapi ekstensi & sebagian besar
// nama asli tetap kelihatan (memudahkan penelusuran manual di dashboard
// Supabase kalau perlu).
export function bersihkanNamaFile(nama: string): string {
  return nama.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
}
