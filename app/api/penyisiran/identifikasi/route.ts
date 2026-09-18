// app/api/penyisiran/identifikasi/route.ts
//
// Simpan hasil "Identifikasi" (Ada / Tidak Ada / Ragu usaha) -- ditulis
// ke kolom penyisiran_usaha.identifikasi_ppl yang DIPAKAI BERSAMA oleh
// KETIGA tab identifikasi personal:
//  - "Identifikasi PPL"      -> role "identifikasi_ppl" (ppl_akun)
//  - "Identifikasi Jorong"   -> role "identifikasi_jorong" (petugas_penyisiran_akun)
//  - "Identifikasi Tetangga/Lainnya" -> role "identifikasi_tetangga" (tetangga_akun)
//
// SENGAJA HANYA ketiga role personal ini yang diterima -- role lama
// "penyisiran"/"identifikasi" (PIN bersama) TIDAK BOLEH LAGI menulis ke
// endpoint ini, supaya tab "Penyisiran Usaha" (role "penyisiran") selalu
// menampilkan kolom ini sbg READ-ONLY (dibekukan): satu-satunya cara
// mengubahnya adalah lewat salah satu dari tiga tab Identifikasi di atas.
// (Sebelumnya role "penyisiran" ikut diterima "supaya supervisor internal
// boleh ikut mengisi" -- itu SUDAH DICABUT atas permintaan pengguna.)
//
// Role "identifikasi_ppl" (login personal PPL) dapat proteksi tambahan
// (defense in depth): baris yang mau diubah harus punya idsubsls yang
// memang ada di alokasi PPL tsb (ppl_alokasi_idsls) -- supaya PPL A tidak
// bisa mengubah data keluarga di wilayah PPL B walau tahu kode_identitas-
// nya (mis. dari sumber lain). Role "identifikasi_jorong" &
// "identifikasi_tetangga" TIDAK ada pengecekan alokasi wilayah serupa,
// krn keduanya memang bebas menyisir/melapor SLS/Sub SLS mana saja
// (tidak dibatasi wilayah pribadi).
//
// Utk KETIGA role personal ini, kolom identifikasi_ppl_oleh ikut diisi
// dgn nama pemilik sesi (dicari dari tabel akun yang sesuai perannya)
// supaya bisa ditelusuri siapa yang menjawab.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer, type PenyisiranRole } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(["belum", "ada", "tidak_ada", "ragu"]);

// Tabel akun sumber nama, per role personal -- dipakai jg utk
// identifikasi_ppl_oleh di bawah.
const TABEL_AKUN: Partial<Record<PenyisiranRole, string>> = {
  identifikasi_ppl: "ppl_akun",
  identifikasi_jorong: "petugas_penyisiran_akun",
  identifikasi_tetangga: "tetangga_akun",
};

export async function PATCH(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, ["identifikasi_ppl", "identifikasi_jorong", "identifikasi_tetangga"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const role = (token?.split(".")[0] ?? "") as PenyisiranRole;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const nilai = typeof body?.identifikasi_ppl === "string" ? body.identifikasi_ppl : "";

  if (!id || !VALID.has(nilai)) {
    return NextResponse.json({ error: "Data tidak lengkap / nilai tidak valid." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const subjectId = getSessionSubject(token);

  // Nilai LAMA identifikasi_ppl diambil sekalian di sini (bukan query
  // terpisah) -- dipakai baik utk cek alokasi PPL (role identifikasi_ppl)
  // MAUPUN utk tahu apakah nilainya benar2 berubah (dasar catat riwayat
  // di bawah, lihat penyisiran_riwayat).
  const { data: rowSekarang, error: rowErr } = await supabase
    .from("penyisiran_usaha")
    .select("idsubsls, identifikasi_ppl")
    .eq("kode_identitas", id)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!rowSekarang) return NextResponse.json({ error: "Data tidak ditemukan." }, { status: 404 });

  if (role === "identifikasi_ppl" && subjectId) {
    const { data: alokasi, error: alokasiErr } = await supabase
      .from("ppl_alokasi_idsls")
      .select("idsubsls")
      .eq("ppl_id", subjectId)
      .eq("idsubsls", rowSekarang.idsubsls)
      .maybeSingle();
    if (alokasiErr) return NextResponse.json({ error: alokasiErr.message }, { status: 500 });
    if (!alokasi) {
      return NextResponse.json(
        { error: "Keluarga ini bukan bagian dari wilayah yang dialokasikan ke Anda." },
        { status: 403 }
      );
    }
  }

  // Cari nama pemilik sesi utk diisi ke identifikasi_ppl_oleh -- tabel
  // sumbernya beda tergantung peran (lihat TABEL_AKUN di atas).
  let diisiOleh: string | null = null;
  const tabelAkun = TABEL_AKUN[role];
  if (subjectId && tabelAkun) {
    const { data: akun } = await supabase.from(tabelAkun).select("nama").eq("id", subjectId).maybeSingle();
    diisiOleh = akun?.nama ?? null;
  }

  const patch: Record<string, unknown> = { identifikasi_ppl: nilai, identifikasi_ppl_at: new Date().toISOString() };
  if (diisiOleh) patch.identifikasi_ppl_oleh = diisiOleh;
  // identifikasi_ppl_role dicatat terpisah dari nama (identifikasi_ppl_oleh)
  // krn nama yg sama bisa saja terdaftar di lebih dari satu tabel akun (mis.
  // petugas penyisiran yg sama juga terdaftar di tetangga_akun) -- dipakai
  // tab "Monitoring Petugas Penyisiran" utk memisahkan hitungan "diidentifikasi
  // lewat Jorong" vs "lewat Tetangga/Lainnya" per orang.
  patch.identifikasi_ppl_role = role;

  const { error } = await supabase.from("penyisiran_usaha").update(patch).eq("kode_identitas", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Catat ke penyisiran_riwayat HANYA kalau nilainya benar2 berubah --
  // lihat komentar rowSekarang di atas.
  if (rowSekarang.identifikasi_ppl !== nilai) {
    await supabase.from("penyisiran_riwayat").insert({
      kode_identitas: id,
      jenis: "identifikasi_ppl",
      nilai_lama: rowSekarang.identifikasi_ppl,
      nilai_baru: nilai,
      oleh_nama: diisiOleh,
      oleh_role: role || null,
    });
    // Kegagalan insert riwayat SENGAJA tidak digagalkan ke pengguna.
  }

  return NextResponse.json({ ok: true });
}
