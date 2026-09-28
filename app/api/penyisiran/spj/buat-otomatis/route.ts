// app/api/penyisiran/spj/buat-otomatis/route.ts
//
// POST -> "Buat Otomatis": membuat Kwitansi/Visum/Surat Pernyataan Kendaraan
// LANGSUNG dari data yg SUDAH ADA di sistem (TANPA isi manual), sesuai
// permintaan user 23 Sep 2026 -- lihat lib/spjSetHariTugas.ts utk penjelasan
// lengkap model "SET tanggal" yg mendasari fitur ini.
//
// (24 Sep 2026, permintaan user -- GANTI aturan 23 Sep): mode SET SEMPAT
// dibuat TETAP per jenis dokumen (BUKAN lagi pilihan bebas `body.mode` spt
// sebelumnya -- field itu SUDAH TIDAK DIPAKAI lagi & diabaikan kalau masih
// dikirim client lama).
// (25 Sep 2026, GANTI BALIK permintaan 24 Sep): Kwitansi 1-lembar-per-hari
// ternyata TIDAK dipakai -- dibalik lagi ke "per_rentang" spt semula, SAMA
// PERSIS dgn Visum/Surat Pernyataan (bukan dihitung ulang terpisah lagi).
// (27 Sep 2026) Setiap klik "Buat Otomatis" jg merapikan dulu SET lama yg
// blm konsisten dgn tanggal Hari Tugas saat ini (lihat rencanakanPerbaikanSet,
// lib/spjSetHariTugas.ts) sebelum membuat baris baru -- hasil perbaikan
// dilaporkan lewat field `perbaikan` pada response.
//
// (28 Sep 2026) SELURUH logic INTI di atas (hitung SET, perbaikan SET,
// generate Kwitansi/Visum/Surat Pernyataan) DIPINDAHKAN ke
// lib/spjBuatOtomatisInti.ts (prosesBuatOtomatisPenugasan) SUPAYA BISA
// DIPAKAI ULANG oleh app/api/penyisiran/spj/buat-otomatis-semua/route.ts
// (tombol baru "Jalankan untuk SEMUA petugas sekaligus") TANPA duplikasi --
// ditemukan lewat laporan user "sebagian petugas seperti PPL Ilham tidak
// ada spj lain selain ST yang muncul" -> setelah dicek ke SELURUH petugas,
// ternyata BUKAN bug: Kwitansi/Visum/Surat Pernyataan memang belum pernah
// "Buat Otomatis"-kan utk mereka (tombolnya 3 buah TERPISAH di 3 tab
// berbeda, gampang ada yg kelewat). File INI (route per-1-petugas) SEKARANG
// HANYA berisi: validasi sesi, resolusi target petugas (diri sendiri vs
// body.petugas khusus pengelola), pengecekan kepemilikan Surat Tugas, lalu
// panggil prosesBuatOtomatisPenugasan() & terjemahkan hasilnya (camelCase)
// jadi bentuk response JSON snake_case yg SAMA PERSIS spt sebelumnya (supaya
// frontend BuatOtomatisBlok yg sudah ada TIDAK perlu diubah sama sekali).
//
// Non-pengelola (petugas/tetangga biasa) HANYA boleh membuat dokumen utk
// dirinya sendiri (field `petugas` di body diabaikan, sama spt pola akses
// menu SPJ lainnya -- lihat app/api/penyisiran/spj/cetak/route.ts).
// Pengelola (lolos pastikanPengelolaSpj) boleh menunjuk petugas lain lewat
// body.petugas -- supaya bisa membereskan dokumen SPJ petugas lain lgsg dari
// menu pengelola (Monitoring/Cetak SPJ), bukan cuma dari sesi petugas ybs.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj, SpjPetugasJenis } from "@/lib/spjAuth";
import { TARIF_TRANSLOK_PER_HARI_DEFAULT } from "@/lib/spjSetHariTugas";
import { prosesBuatOtomatisPenugasan, JENIS_DOKUMEN_SET, JenisDokumenSet } from "@/lib/spjBuatOtomatisInti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });

  const suratTugasId = Number(body.surat_tugas_id);
  if (!Number.isFinite(suratTugasId)) {
    return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
  }

  // `body.mode` SUDAH TIDAK DIPAKAI lagi sejak 24 Sep 2026 (diabaikan kalau
  // masih dikirim client lama) -- mode SEKARANG tetap per jenis dokumen.
  const dokumenMentah: unknown[] = Array.isArray(body.dokumen) ? body.dokumen : [];
  const dokumenDipilih: JenisDokumenSet[] =
    dokumenMentah.length > 0 ? JENIS_DOKUMEN_SET.filter((j) => dokumenMentah.includes(j)) : [...JENIS_DOKUMEN_SET];
  if (dokumenDipilih.length === 0) {
    return NextResponse.json({ error: "Pilih minimal 1 jenis dokumen." }, { status: 400 });
  }

  const tarifPerHariInput = Number(body.tarif_per_hari);
  const tarifPerHari = Number.isFinite(tarifPerHariInput) && tarifPerHariInput > 0 ? tarifPerHariInput : TARIF_TRANSLOK_PER_HARI_DEFAULT;

  // Target petugas: non-pengelola SELALU dipaksa dirinya sendiri (sama spt
  // pola akses menu SPJ lain, lihat komentar di atas file ini & di
  // app/api/penyisiran/spj/cetak/route.ts).
  let targetJenis: SpjPetugasJenis;
  let targetId: string;
  if (namaPengelola && body.petugas && typeof body.petugas === "object") {
    const j = (body.petugas as { jenis?: unknown }).jenis;
    const id = (body.petugas as { id?: unknown }).id;
    if (j !== "penyisiran" && j !== "tetangga") {
      return NextResponse.json({ error: "Jenis petugas tidak valid." }, { status: 400 });
    }
    targetJenis = j;
    targetId = String(id ?? "");
    if (!targetId) return NextResponse.json({ error: "Petugas tidak valid." }, { status: 400 });
  } else {
    targetJenis = session.jenis;
    targetId = String(session.petugasId);
  }

  // Pastikan Surat Tugas ini memang ditautkan ke petugas TARGET -- mencegah
  // membuat dokumen SPJ utk ST milik orang lain (jg berlaku ke pengelola --
  // body.petugas tetap harus benar2 ditautkan ke ST tsb).
  const { data: taut, error: errTaut } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("id")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", targetJenis)
    .eq("petugas_id", targetId)
    .maybeSingle();
  if (errTaut) return NextResponse.json({ error: errTaut.message }, { status: 500 });
  if (!taut) return NextResponse.json({ error: "Surat Tugas ini bukan milik petugas yang dimaksud." }, { status: 403 });

  const hasil = await prosesBuatOtomatisPenugasan(supabase, {
    suratTugasId,
    targetJenis,
    targetId,
    dokumenDipilih,
    tarifPerHari,
  });

  if (!hasil.ok) {
    return NextResponse.json({ error: hasil.error, navigasi: hasil.navigasi }, { status: hasil.navigasi ? 400 : 500 });
  }

  return NextResponse.json({
    ok: true,
    nomor_st: hasil.nomorSt,
    set: hasil.set.map((s) => ({ tanggal_mulai: s.tanggalMulai, tanggal_selesai: s.tanggalSelesai, jumlah_hari: s.jumlahHari })),
    hasil: hasil.hasil,
    peringatan: hasil.peringatan,
    perbaikan: hasil.perbaikan,
    // (28 Sep 2026) Baris dokumen LAMA yg dihapus TOTAL krn rentang
    // tanggalnya sudah tidak beririsan sama sekali dgn Hari Tugas saat ini
    // -- lihat komentar besar di lib/spjSetHariTugas.ts (kasus 17-30 diganti
    // jadi 18-30, baris lama dulu nyangkut & tercetak dobel).
    dihapus_krn_usang: hasil.dihapusKrnUsang,
    ringkasan_proses: hasil.ringkasanProses,
  });
}
