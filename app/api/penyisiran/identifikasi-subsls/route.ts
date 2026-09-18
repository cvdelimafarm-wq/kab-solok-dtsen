// app/api/penyisiran/identifikasi-subsls/route.ts
//
// Daftar Sub SLS (mis. "JORONG USAK-01") + jumlah keluarga, KHUSUS
// dropdown filter di tab "Identifikasi PPL" -- BEDA dari
// /api/penyisiran/subsls (yang butuh kec+nagari dipilih manual dulu):
// di sini daftarnya otomatis dibatasi ke ID Sub SLS yang memang
// dialokasikan ke PPL yang sedang login (tabel ppl_alokasi_idsls, sama
// persis pola scoping dgn /api/penyisiran/identifikasi-list), krn PPL
// TIDAK pilih kecamatan/nagari manual sama sekali di tab ini -- jadi
// dropdown Sub SLS ini cuma perlu menyaring DI DALAM wilayah yang sudah
// otomatis ter-scope, bukan mempersempit dari seluruh kabupaten.
//
// Kalau token bukan role "identifikasi_ppl" (tidak ada subject/alokasi
// personal), balikan daftar kosong -- filter Sub SLS memang cuma relevan
// utk PPL yang login personal.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, ["penyisiran", "identifikasi", "identifikasi_ppl"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const pplId = getSessionSubject(token);
  if (!pplId) return NextResponse.json([]);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: alokasi, error: alokasiErr } = await supabase
    .from("ppl_alokasi_idsls")
    .select("idsubsls")
    .eq("ppl_id", pplId);
  if (alokasiErr) return NextResponse.json({ error: alokasiErr.message }, { status: 500 });

  const idsList = (alokasi ?? []).map((r: { idsubsls: string }) => r.idsubsls);
  if (idsList.length === 0) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("penyisiran_usaha")
    .select("idsubsls, sls_nama, subsls_kode")
    .in("idsubsls", idsList);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Diagregasi di JS (bukan RPC/group-by SQL) -- jumlah baris per PPL
  // biasanya kecil (satu alokasi personal, bukan seluruh kabupaten), jadi
  // tidak perlu fungsi database baru cuma utk ini.
  const map = new Map<string, { idsubsls: string; label: string; jumlah: number }>();
  for (const row of data ?? []) {
    const key = row.idsubsls;
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.jumlah += 1;
    } else {
      map.set(key, {
        idsubsls: key,
        label: `${row.sls_nama ?? ""}-${row.subsls_kode ?? ""}`,
        jumlah: 1,
      });
    }
  }

  const hasil = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  return NextResponse.json(hasil);
}
