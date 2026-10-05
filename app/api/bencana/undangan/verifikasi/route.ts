// app/api/bencana/undangan/verifikasi/route.ts
//
// (4 Okt 2026) Langkah 1 "Undangan Konfirmasi Bersama" (1 link utk WA grup):
// petugas mengisi NAMA, NIK, EMAIL, TANGGAL LAHIR. Tidak ada login, jadi
// kecocokan keempatnya dipakai sbg "kunci" membuka datanya -- NIK jarang
// dipublikasikan, jadi orang lain yg kebetulan menerima link sulit memakainya.
//
// Hasil SELALU per kolom (permintaan admin: tampilkan JELAS kolom mana yg
// salah & mana yg benar):
//   'benar' | 'salah' | 'belum_ada' (tidak ada data pembanding -> tidak dinilai,
//   isian petugas disimpan) | 'belum_dicek' (nama tdk ditemukan).
// Salah >= MAKS_GAGAL kali -> nama itu terkunci KUNCI_MENIT menit (lihat lib/undangan.ts).
//
// POST { nama, nik, email, tanggal_lahir (YYYY-MM-DD) }
//   -> { ok:true, nama, tipe, path }  (path = halaman konfirmasi / tawaran menginap)
//   -> { ok:false, kolom:{...}, sisa_percobaan } kalau ada yg salah
//   -> 429 kalau terkunci

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  MAKS_GAGAL,
  cariPetugasByNama,
  catatGagal,
  cekKunci,
  dataBelumLengkap,
  emailValid,
  nikValid,
  normEmail,
  normNama,
  normNik,
  resetGagal,
  tanggalValid,
  tentukanTujuan,
} from "@/lib/undangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = "benar" | "salah" | "belum_ada" | "belum_dicek";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);
  const namaInput = typeof body?.nama === "string" ? body.nama.trim() : "";
  const nik = normNik(typeof body?.nik === "string" ? body.nik : "");
  const email = normEmail(typeof body?.email === "string" ? body.email : "");
  const tgl = typeof body?.tanggal_lahir === "string" ? body.tanggal_lahir.trim() : "";

  // Format dasar dicek dulu -- BUKAN percobaan salah (belum membandingkan dgn data).
  if (!namaInput) return NextResponse.json({ error: "Nama wajib diisi." }, { status: 400 });
  if (!nikValid(nik)) return NextResponse.json({ error: "NIK harus 16 digit angka." }, { status: 400 });
  if (!emailValid(email)) return NextResponse.json({ error: "Format email tidak valid." }, { status: 400 });
  if (!tanggalValid(tgl)) return NextResponse.json({ error: "Tanggal lahir tidak valid." }, { status: 400 });

  try {
    const kunci = `verif:${normNama(namaInput)}`;
    const kondisi = await cekKunci(db, kunci);
    if (kondisi.terkunci) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan yang salah. Coba lagi nanti atau hubungi admin.", terkunci_sampai: kondisi.sampai },
        { status: 429 }
      );
    }

    const cocok = await cariPetugasByNama(db, namaInput);
    if (cocok.length > 1) {
      return NextResponse.json({ error: "Ada lebih dari satu petugas dengan nama ini. Hubungi admin." }, { status: 409 });
    }

    let kolom: Record<"nama" | "nik" | "email" | "tanggal_lahir", Status>;
    let belumAda: ("nik" | "email" | "tanggal_lahir")[] = [];

    if (cocok.length === 0) {
      kolom = { nama: "salah", nik: "belum_dicek", email: "belum_dicek", tanggal_lahir: "belum_dicek" };
    } else {
      const kunciNama = normNama(namaInput);
      const { data: mitraSemua } = await db.from("bencana_mitra").select("nama, nik, email, tanggal_lahir");
      const baris = (mitraSemua ?? []).filter((m) => normNama(m.nama as string) === kunciNama);
      const nikSumber = baris.map((m) => normNik((m.nik as string) ?? "")).filter(nikValid);
      const emailSumber = baris.map((m) => normEmail((m.email as string) ?? "")).filter((e) => e !== "");
      // Tanggal lahir = tanggal EKSPLISIT dari data yg dikirim admin (bencana_mitra.tanggal_lahir),
      // BUKAN diturunkan dari NIK (tanggal di NIK bisa berbeda dgn tanggal lahir riil).
      const tglSumber = baris.map((m) => ((m.tanggal_lahir as string | null) ?? "").slice(0, 10)).filter((t) => t !== "");

      kolom = {
        nama: "benar",
        nik: nikSumber.length === 0 ? "belum_ada" : nikSumber.includes(nik) ? "benar" : "salah",
        email: emailSumber.length === 0 ? "belum_ada" : emailSumber.includes(email) ? "benar" : "salah",
        tanggal_lahir: tglSumber.length === 0 ? "belum_ada" : tglSumber.includes(tgl) ? "benar" : "salah",
      };
      belumAda = (["nik", "email", "tanggal_lahir"] as const).filter((k) => kolom[k] === "belum_ada");
    }

    const adaSalah = Object.values(kolom).includes("salah");
    if (adaSalah) {
      const g = await catatGagal(db, kunci);
      return NextResponse.json(
        {
          ok: false,
          kolom,
          sisa_percobaan: g.sisa,
          terkunci: g.terkunci,
          terkunci_sampai: g.sampai,
          maks_percobaan: MAKS_GAGAL,
        },
        { status: g.terkunci ? 429 : 200 }
      );
    }

    // ---- Berhasil: tandai "dibaca" (sudah mengisi & lolos verifikasi), simpan isian utk kolom tanpa data pembanding.
    const petugas = cocok[0];
    await resetGagal(db, kunci);
    const sekarang = new Date().toISOString();
    const { data: lama } = await db.from("bencana_undangan").select("diverifikasi_at").eq("petugas_id", petugas.id).maybeSingle();
    const payload: Record<string, unknown> = {
      petugas_id: petugas.id,
      diverifikasi_at: (lama?.diverifikasi_at as string | null) ?? sekarang,
      terakhir_masuk_at: sekarang,
    };
    if (belumAda.includes("nik")) payload.nik_isi = nik;
    if (belumAda.includes("email")) payload.email_isi = email;
    if (belumAda.includes("tanggal_lahir")) payload.tanggal_lahir_isi = tgl;
    const { error: errSimpan } = await db.from("bencana_undangan").upsert(payload, { onConflict: "petugas_id" });
    if (errSimpan) return NextResponse.json({ error: errSimpan.message }, { status: 500 });

    const tujuan = await tentukanTujuan(db, petugas);
    // (4 Okt 2026) Data utk analisis wilayah tugas belum lengkap -> halaman menawarkan formulir Lengkapi Data
    // (bisa dilewati) sebelum membuka undangan.
    // (5 Okt 2026) Plotting dibatalkan -> tidak perlu menawarkan Lengkapi Data; kirim pesan pembatalan.
    const dibatalkan = tujuan.tipe === "dibatalkan";
    const perluLengkapi = dibatalkan ? false : await dataBelumLengkap(db, petugas.id);
    return NextResponse.json({
      ok: true,
      kolom,
      nama: petugas.nama,
      tipe: tujuan.tipe,
      path: tujuan.path,
      pesan: dibatalkan ? tujuan.pesan : null,
      perlu_lengkapi: perluLengkapi,
      petugas_id: petugas.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
