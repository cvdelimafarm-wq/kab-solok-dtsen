// app/api/sigap/kelola/umpan-balik/route.ts
//
// (10 Nov 2026) Pemantau induk UMPAN BALIK PENGGUNA di SIGAP Kelola. Dibangun dari registri lib/umpanBalik.ts: setiap fitur yang mengumpulkan
// umpan balik (masukan, penilaian, usulan, polling, ...) otomatis muncul di sini dengan jumlah, yang menunggu tindak lanjut, dan waktu terakhir masuk.
//   GET -> { sumber:[{ kode, nama, ket, alamat, total, menunggu|null, terakhir|null, cuplikan:[{ nama, teks, waktu }] }] }
// Setiap sumber hanya tampil bila akun punya izin yang sama dengan rute bacanya (kolom `izin` di registri). Tanpa satu pun izin -> 403.
// Hanya baca. Penilaian rahasia (tanpa `cuplikan` di registri) tidak pernah menampilkan isi, hanya angka.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { boleh, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { UMPAN_BALIK, type SumberUmpanBalik } from "@/lib/umpanBalik";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const MAKS_CUPLIKAN = 3;
const PANJANG_CUPLIKAN = 90;

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

const potong = (s: unknown): string => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > PANJANG_CUPLIKAN ? `${t.slice(0, PANJANG_CUPLIKAN - 1)}…` : t;
};

async function ringkas(db: Db, s: SumberUmpanBalik) {
  const [{ count: total, error: eTotal }, menunggu, { data: akhir }] = await Promise.all([
    db.from(s.tabel).select("*", { count: "exact", head: true }),
    s.menunggu ? db.from(s.tabel).select("*", { count: "exact", head: true }).eq(s.menunggu.kolom, s.menunggu.nilai) : Promise.resolve({ count: null }),
    db.from(s.tabel).select(s.cuplikan ? `${s.kolomWaktu}, ${s.cuplikan.kolomTeks}, ${s.cuplikan.kolomAkun}` : s.kolomWaktu).order(s.kolomWaktu, { ascending: false }).limit(s.cuplikan ? MAKS_CUPLIKAN : 1),
  ]);
  if (eTotal) return { kode: s.kode, nama: s.nama, ket: s.ket, alamat: s.alamat, galat: true as const };
  const baris = (akhir ?? []) as unknown as Record<string, unknown>[];
  let cuplikan: { nama: string; teks: string; waktu: string }[] = [];
  if (s.cuplikan && baris.length > 0) {
    const ids = [...new Set(baris.map((b) => Number(b[s.cuplikan!.kolomAkun])).filter((n) => Number.isInteger(n) && n > 0))];
    const nama = new Map<number, string>();
    if (ids.length > 0) {
      const { data } = await db.from("sigap_akun").select("id, nama").in("id", ids).limit(50);
      for (const a of (data ?? []) as { id: number; nama: string | null }[]) nama.set(a.id, a.nama ?? `Akun ${a.id}`);
    }
    cuplikan = baris.map((b) => ({ nama: nama.get(Number(b[s.cuplikan!.kolomAkun])) ?? "—", teks: potong(b[s.cuplikan!.kolomTeks]), waktu: String(b[s.kolomWaktu] ?? "") }));
  }
  return {
    kode: s.kode, nama: s.nama, ket: s.ket, alamat: s.alamat,
    total: total ?? 0,
    menunggu: s.menunggu ? (menunggu as { count: number | null }).count ?? 0 : null,
    terakhir: baris.length > 0 ? String(baris[0][s.kolomWaktu] ?? "") || null : null,
    cuplikan,
  };
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db as Db, akunId);
    const boleh_ = UMPAN_BALIK.filter((s) => boleh(izin, s.izin.menu, s.izin.level, s.izin.kegiatan ?? null));
    if (boleh_.length === 0) return galat("Tidak berwenang melihat umpan balik pengguna.", 403);
    const sumber = await Promise.all(boleh_.map((s) => ringkas(db as Db, s)));
    return NextResponse.json({ sumber });
  } catch {
    return galat("Gagal memuat umpan balik.", 500);
  }
}
