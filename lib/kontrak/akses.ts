// lib/kontrak/akses.ts
//
// (6 Okt 2026) Cek sesi SIGAP + izin menu 'kontrak.kelola' utk API Pengadaan & Kontrak -- data kontrak
// memuat data pribadi/keuangan, jadi wajib login (permintaan user).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { boleh, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const MENU = "kontrak.kelola";

export async function aksesKontrak(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return { gagal: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return { gagal: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const { data: a } = await db.from("sigap_akun").select("id, nama, aktif").eq("id", akunId).maybeSingle();
  if (!a || !a.aktif) return { gagal: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const { izin } = await izinAkun(db, akunId);
  if (!boleh(izin, MENU, "lihat")) return { gagal: galat("Akun Anda belum diberi akses menu Pengadaan & Kontrak.", 403) } as const;
  return { db, akunId, nama: a.nama as string, kelola: boleh(izin, MENU, "kelola") } as const;
}

