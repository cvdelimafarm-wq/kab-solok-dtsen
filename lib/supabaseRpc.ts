// lib/supabaseRpc.ts
//
// (3 Okt 2026) AKAR MASALAH ditemukan utk bug "Saran" & "Skor Jarak" yg
// terus-menerus kosong/"tidak tersedia" utk SEBAGIAN Sub SLS, padahal data
// lokasi di database sudah benar & fetch FE sudah cache:"no-store" (sempat
// dikira bug cache browser, TERNYATA BUKAN):
//
// Supabase/PostgREST PUNYA BATAS BAKU (db-max-rows, defaultnya 1000 baris)
// utk HASIL RPC yg berbentuk tabel -- BERAPAPUN range yg diminta client,
// SERVER tetap memotong ke 1000 baris per request (dikonfirmasi lgsg lewat
// panggilan REST: minta Range 0-1999, balasannya tetap Content-Range
// "0-999/1084", status 206 Partial Content). RPC bencana_subsls_titik_jarak()
// mengembalikan 1084 baris (SATU utk tiap Sub SLS di kabupaten), TANPA
// ORDER BY -- jadi tiap kali dipanggil polos (supabase.rpc(...) tanpa
// paging), app CUMA dapat 1000 baris PERTAMA dlm urutan fisik tabel, dan
// ~84 Sub SLS SELALU hilang titiknya di SETIAP request (bukan sesekali,
// bukan soal cache/stale tab) -- ini yg bikin popover "Saran" tampil
// "titik Sub SLS ini belum tersedia" utk SEMUA kandidat sekaligus (bukan
// cuma 1 org) di baris² ybs, dan jg bikin Skor Jarak/jarak_status tetap
// "tanpa_data" walau PPL yg diplot lokasinya sudah "riil" (lihat
// reassign/route.ts) -- krn `.find()` ke daftar titik yg terpotong itu
// gagal menemukan baris Sub SLS ybs.
//
// Dipakai di SEMUA tempat yg memanggil bencana_subsls_titik_jarak() --
// app/api/bencana/alokasi/route.ts, .../alokasi/beban/route.ts,
// .../alokasi/reassign/route.ts, app/api/bencana/wilayah/route.ts.
// JANGAN panggil `supabase.rpc("bencana_subsls_titik_jarak")` langsung lagi
// di tempat baru -- selalu lewat rpcSemua() di sini, supaya kalau suatu
// saat RPC lain jg tumbuh melewati 1000 baris, tinggal pakai helper yg sama.
//
// Cara kerja: ambil per 1000 baris (UKURAN_HALAMAN) pakai .range(), ulangi
// dgn offset berikutnya SELAMA halaman yg baru saja diambil masih penuh
// (persis 1000 baris -- tanda mungkin masih ada halaman berikutnya);
// berhenti begitu satu halaman balik LEBIH PENDEK dari UKURAN_HALAMAN
// (tanda itu halaman terakhir). Semua halaman digabung SEBELUM
// dikembalikan ke pemanggil, jadi pemanggil tetap terima satu array
// lengkap spt biasa & tidak perlu tahu soal paging ini sama sekali.

import type { SupabaseClient } from "@supabase/supabase-js";

const UKURAN_HALAMAN = 1000;

export async function rpcSemua<T = unknown>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  namaFungsi: string,
  params?: Record<string, unknown>
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const semua: T[] = [];
  let dari = 0;
  // Batas pengaman (100 halaman = 100.000 baris) supaya kalau suatu saat
  // ada bug lain di sisi RPC (mis. selalu balas persis 1000 baris tanpa
  // pernah habis), loop ini tidak jalan tanpa henti.
  for (let halaman = 0; halaman < 100; halaman++) {
    const { data, error } = await supabase
      .rpc(namaFungsi, params ?? {})
      .range(dari, dari + UKURAN_HALAMAN - 1);
    if (error) return { data: null, error };
    const baris = (data ?? []) as T[];
    semua.push(...baris);
    if (baris.length < UKURAN_HALAMAN) break;
    dari += UKURAN_HALAMAN;
  }
  return { data: semua, error: null };
}
