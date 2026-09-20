// app/api/penyisiran/petugas-toggle-aktif/route.ts
//
// Aktifkan/nonaktifkan satu petugas -- dipakai fitur "Kelola Petugas
// Penyisiran" yang DEFAULT DISEMBUNYIKAN di tab "Monitoring Petugas
// Penyisiran". Petugas yang dinonaktifkan:
//  - tidak muncul lagi di dropdown "Nama Anda" (/api/penyisiran/penyisiran-names)
//    di tab Penyisiran Usaha,
//  - tidak bisa lagi login ke tab "Identifikasi Jorong" (/api/penyisiran/jorong-login)
//    MAUPUN "Identifikasi Tetangga/Lainnya" (/api/penyisiran/tetangga-login).
// Riwayat kunjungan/identifikasi yang SUDAH tercatat atas nama petugas itu
// TIDAK dihapus/disembunyikan.
//
// Satu roster dipakai lintas KETIGA fungsi tsb (Penyisiran Usaha,
// Identifikasi Jorong, Identifikasi Tetangga/Lainnya) -- tabel akunnya
// tetap DUA yang terpisah (petugas_penyisiran_akun & tetangga_akun, krn
// beda konteks login), tapi status aktif/nonaktif WAJIB SELALU disamakan
// di kedua tabel (dicocokkan lewat nama_norm) supaya tidak ada kondisi
// "aktif di satu tabel, nonaktif di tabel lain" utk orang yang sama.
// Kalau baris di tetangga_akun belum ada (org itu belum pernah terdaftar
// sbg tetangga/lainnya), toggle di sini TIDAK membuat baris baru di sana --
// cuma menyamakan yang SUDAH ada.
//
// Selain token sesi role "penyisiran" ATAU "penyisiran_petugas" (basic gate
// tab ini -- DIPERLUAS krn tab "Monitoring Petugas Penyisiran" skrg jg bisa
// dibuka pakai login personal petugas, permintaan user "cukup 1 login"),
// endpoint ini MEWAJIBKAN PIN diketik ulang (dicek server-side lewat
// checkPin(), sama PIN dgn PENYISIRAN_PIN) -- SENGAJA TIDAK ikut diperluas,
// supaya tombol aktif/nonaktif tidak kepencet asal oleh siapa saja yang
// sekadar membuka tab monitoring ini/sekadar login personal biasa.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer, checkPin } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const petugasId = typeof body?.petugas_id === "number" ? body.petugas_id : null;
  const aktif = typeof body?.aktif === "boolean" ? body.aktif : null;
  const pin = typeof body?.pin === "string" ? body.pin : "";

  if (!petugasId || aktif === null) {
    return NextResponse.json({ error: "Data tidak lengkap." }, { status: 400 });
  }
  if (!checkPin(pin, "penyisiran")) {
    return NextResponse.json({ error: "PIN salah." }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: petugas, error: getErr } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama_norm")
    .eq("id", petugasId)
    .maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!petugas) return NextResponse.json({ error: "Petugas tidak ditemukan." }, { status: 404 });

  const { error } = await supabase.from("petugas_penyisiran_akun").update({ aktif }).eq("id", petugasId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Samakan status aktif di tetangga_akun (kalau org yg sama juga
  // terdaftar di sana, dicocokkan via nama_norm) -- lihat komentar di atas.
  await supabase.from("tetangga_akun").update({ aktif }).eq("nama_norm", petugas.nama_norm);

  return NextResponse.json({ ok: true });
}
