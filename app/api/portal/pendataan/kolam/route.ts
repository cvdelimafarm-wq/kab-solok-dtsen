// app/api/portal/pendataan/kolam/route.ts
//
// (16 Okt 2026) Kolam wilayah kerja: Sub SLS Terdampak yang belum terplot ke tim, dapat dipilih PML tim mana pun bila syaratnya terpenuhi.
//  GET                                        -> { sekarang, bisa_pilih, pml, progres, item[] }   anggota tim (PML dan PPL melihat yang SAMA; hanya PML bisa_pilih)
//  POST { aksi:"pilih", pilihan:[{idsubsls,ppl_akun_id}] }   PML tim: maks. 2 Sub SLS sekali pilih; wilayah awal > 70%; tambahan sebelumnya >= 50%;
//                                                           menghasilkan permintaan ke admin (dari_kolam) + baris alokasi tim (atomik di database)
// Pembatalan memakai route permintaan yang sudah ada ("batalkan" / "ajukan_batal"): Sub SLS kembali ke kolam.
// Sesi "masuk sebagai" hanya boleh MELIHAT: POST ditolak.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { AWALAN_MEMO_TIM, ambilTim, ambilTimMemo } from "@/lib/portal/pendataan";
import { buangMemo } from "@/lib/portal/memoSingkat";
import { dataKolam, pilihKolam } from "@/lib/portal/kolamWilayah";
import { aktorDariHeader } from "@/lib/sigapAkses";
import { periksaPilihan } from "@/lib/permintaanDaftar";
import { MAKS_PILIH_KOLAM } from "@/lib/kolamWilayah";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  try {
    const tim = await ambilTimMemo(db, akun);
    if (!tim) return galat("Kolam wilayah khusus anggota tim PML dan PPL.", 403);
    const { progres, item } = await dataKolam(db, tim.pml.id);
    return NextResponse.json({
      sekarang: new Date().toISOString(),
      bisa_pilih: tim.saya.peran === "pml" && !aktorDariHeader(req.headers),
      pml: tim.pml,
      progres,
      item,
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Gagal memuat.", 500);
  }
}

async function proses(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk menyimpan.', 403);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return galat("Permintaan tidak sah.");
  try {
    if (b.aksi !== "pilih") return galat("Aksi tidak dikenal.");
    const tim = await ambilTim(db, akun);
    if (!tim) return galat("Kolam wilayah khusus anggota tim PML dan PPL.", 403);
    const cek = periksaPilihan(b.pilihan, MAKS_PILIH_KOLAM);
    if (!cek.ok) return galat(cek.pesan, 400);
    const h = await pilihKolam(db, { id: akun.id }, tim, cek.pilihan);
    if ("galat" in h) return galat(h.galat, h.status);
    return NextResponse.json({ ok: true, ...h });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

/** (29 Okt 2026) Setelah ada penulisan, buang simpanan sementara supaya GET berikutnya langsung segar. */
export async function POST(req: NextRequest) {
  try {
    return await proses(req);
  } finally {
    buangMemo(AWALAN_MEMO_TIM);
  }
}
