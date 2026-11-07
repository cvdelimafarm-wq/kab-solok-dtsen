// app/api/sigap/arsip/route.ts
//
// (7 Nov 2026) Menu Arsip: buku nomor surat, kode klasifikasi arsip, format nomor. Izin: menu `arsip.kelola` (lihat untuk membaca, kelola untuk mengubah).
// Logika: lib/arsip/nomor.ts (murni) dan lib/arsip/db.ts (basis data). SQL: 20261107c_arsip_penomoran.sql.
//
// GET  ?bagian=buku&tahun=&jenis=&status=&sumber=&cari=   -> { baris[], terpotong }
// GET  ?bagian=ringkas&tahun=                              -> { counter[], celah[], kembar[], tahun_ada[] }
// GET  ?bagian=pengaturan                                  -> { kode[], jenis[], register[], kegiatan[], kegiatan_semua[], unit }
// POST { aksi:"ambil", jenis, kka?, tanggal?, perihal?, kegiatan_id? }                 -> { nomor, ... }  (mengambil nomor untuk surat yang dibuat di luar SIGAP)
// POST { aksi:"catat_luar", jenis, urut, tanggal, perihal?, kka?, kegiatan_id?, nomor? } -> { nomor }      (mencatat nomor yang sudah terbit di luar SIGAP)
// POST { aksi:"batalkan", id, alasan }                     -> { nomor }
// POST { aksi:"atur_awal", register, tahun, terakhir }     -> { sebelumnya }   (hanya naik)
// POST { aksi:"simpan_kode", kode, nama, kelompok, catatan?, aktif, diverifikasi }
// POST { aksi:"simpan_jenis", kode, ...bagian yang diubah | baru:true + kategori }
// POST { aksi:"simpan_kka_kegiatan", kegiatan_id, kka|null }
// POST { aksi:"simpan_unit", unit }
// Tindakan menulis tidak berlaku untuk sesi "masuk sebagai".

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { boleh, catatAudit, izinAkun, sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { aturAwal, ambilNomor, batalkanNomor, catatLuar, muatBuku, muatPengaturan, muatRingkas, simpanJenis, simpanKkaKegiatan, simpanKode, simpanUnit } from "@/lib/arsip/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const bulat = (x: unknown): number | null => {
  const n = Number(x);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const teks = (x: unknown, maks = 300): string | null => (typeof x === "string" && x.trim() ? x.trim().slice(0, maks) : null);

function dbServer() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) : null;
}

export async function GET(req: NextRequest) {
  try {
    const db = dbServer();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const sesi = sesiLengkapDariHeader(req.headers);
    if (!sesi) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db, sesi.akunId);
    if (!boleh(izin, "arsip.kelola", "lihat")) return galat("Tidak punya izin membuka menu Arsip.", 403);
    const u = new URL(req.url);
    const bagian = u.searchParams.get("bagian") ?? "buku";
    const tahun = bulat(u.searchParams.get("tahun")) ?? Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).slice(0, 4));
    if (bagian === "buku") {
      const r = await muatBuku(db, {
        tahun: bulat(u.searchParams.get("tahun")), jenis: u.searchParams.get("jenis"), status: u.searchParams.get("status"),
        sumber: u.searchParams.get("sumber"), cari: u.searchParams.get("cari"),
      });
      return r.ok ? NextResponse.json({ baris: r.baris, terpotong: r.terpotong, boleh_kelola: boleh(izin, "arsip.kelola", "kelola") }) : galat(r.pesan, r.status);
    }
    if (bagian === "ringkas") {
      const r = await muatRingkas(db, tahun);
      return r.ok ? NextResponse.json({ counter: r.counter, celah: r.celah, kembar: r.kembar, tahun_ada: r.tahun_ada, tahun }) : galat(r.pesan, r.status);
    }
    if (bagian === "pengaturan") {
      const r = await muatPengaturan(db);
      return r.ok ? NextResponse.json({ kode: r.kode, jenis: r.jenis, register: r.register, kegiatan: r.kegiatan, kegiatan_semua: r.kegiatan_semua, unit: r.unit }) : galat(r.pesan, r.status);
    }
    return galat("Bagian tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbServer();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const sesi = sesiLengkapDariHeader(req.headers);
    if (!sesi) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (sesi.aktorId !== null) return galat("Mode masuk-sebagai hanya untuk melihat tampilan; tindakan ini tidak dijalankan.", 403);
    const { izin } = await izinAkun(db, sesi.akunId);
    if (!boleh(izin, "arsip.kelola", "kelola")) return galat("Tidak punya izin mengelola Arsip.", 403);
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return galat("Permintaan tidak valid.");
    const { data: pelaku } = await db.from("sigap_akun").select("nama").eq("id", sesi.akunId).maybeSingle();
    const nama = (pelaku as { nama?: string } | null)?.nama ?? `Akun ${sesi.akunId}`;
    const aksi = String(b.aksi ?? "");

    if (aksi === "ambil") {
      const jenis = teks(b.jenis, 40);
      if (!jenis) return galat("Pilih jenis dokumen.");
      const r = await ambilNomor(db, { jenis, kka: teks(b.kka, 20), tanggal: teks(b.tanggal, 10), perihal: teks(b.perihal, 300), kegiatanId: bulat(b.kegiatan_id), akunId: sesi.akunId, nama });
      if (!r.ok) return galat(r.pesan, r.status);
      await catatAudit(db, sesi.akunId, "arsip.ambil", { id: r.id, nomor: r.nomor, jenis });
      return NextResponse.json({ ok: true, id: r.id, nomor: r.nomor, urut: r.urut, tahun: r.tahun, kka: r.kka });
    }

    if (aksi === "catat_luar") {
      const jenis = teks(b.jenis, 40);
      const urut = bulat(b.urut);
      const tanggal = teks(b.tanggal, 10);
      if (!jenis || !urut || !tanggal) return galat("Jenis dokumen, nomor urut, dan tanggal surat wajib diisi.");
      const r = await catatLuar(db, { jenis, urut, tanggal, perihal: teks(b.perihal, 300), kka: teks(b.kka, 20), kegiatanId: bulat(b.kegiatan_id), nomorTeks: teks(b.nomor, 80), akunId: sesi.akunId, nama });
      if (!r.ok) return galat(r.pesan, r.status);
      await catatAudit(db, sesi.akunId, "arsip.catat_luar", { id: r.id, nomor: r.nomor, jenis });
      return NextResponse.json({ ok: true, id: r.id, nomor: r.nomor });
    }

    if (aksi === "batalkan") {
      const id = bulat(b.id);
      const alasan = teks(b.alasan, 300);
      if (!id || !alasan) return galat("Nomor dan alasan pembatalan wajib diisi.");
      const r = await batalkanNomor(db, id, alasan, sesi.akunId);
      if (!r.ok) return galat(r.pesan, r.status);
      await catatAudit(db, sesi.akunId, "arsip.batalkan", { id, nomor: r.nomor, alasan });
      return NextResponse.json({ ok: true, nomor: r.nomor });
    }

    if (aksi === "atur_awal") {
      const register = teks(b.register, 40);
      const tahun = bulat(b.tahun);
      const terakhir = Number(b.terakhir);
      if (!register || !tahun || !Number.isInteger(terakhir) || terakhir < 0) return galat("Register, tahun, dan nomor terakhir wajib diisi dengan benar.");
      const r = await aturAwal(db, register, tahun, terakhir, sesi.akunId);
      if (!r.ok) return galat(r.pesan, r.status);
      await catatAudit(db, sesi.akunId, "arsip.atur_awal", { register, tahun, terakhir, sebelumnya: r.sebelumnya });
      return NextResponse.json({ ok: true, sebelumnya: r.sebelumnya });
    }

    if (aksi === "simpan_kode") {
      const r = await simpanKode(db, { kode: String(b.kode ?? ""), nama: String(b.nama ?? ""), kelompok: String(b.kelompok ?? "substantif"), catatan: teks(b.catatan, 300), aktif: b.aktif !== false, diverifikasi: b.diverifikasi === true });
      if (!r.ok) return galat(r.pesan, r.status);
      await catatAudit(db, sesi.akunId, "arsip.kode", { kode: b.kode, aktif: b.aktif !== false, diverifikasi: b.diverifikasi === true });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "simpan_jenis") {
      const r = await simpanJenis(db, {
        kode: String(b.kode ?? ""),
        ...(typeof b.nama === "string" ? { nama: b.nama } : {}),
        ...(typeof b.register === "string" ? { register: b.register } : {}),
        ...(typeof b.format === "string" ? { format: b.format } : {}),
        ...(typeof b.keamanan === "string" ? { keamanan: b.keamanan } : {}),
        ...("kka_bawaan" in b ? { kka_bawaan: teks(b.kka_bawaan, 20) } : {}),
        ...(typeof b.aktif === "boolean" ? { aktif: b.aktif } : {}),
        ...(b.baru === true ? { baru: true, kategori: String(b.kategori ?? "") } : {}),
      });
      if (!r.ok) return galat(r.pesan, r.status);
      await catatAudit(db, sesi.akunId, "arsip.jenis", { kode: b.kode, format: b.format, aktif: b.aktif, baru: b.baru === true });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "simpan_kka_kegiatan") {
      const kid = bulat(b.kegiatan_id);
      if (!kid) return galat("Kegiatan tidak valid.");
      const r = await simpanKkaKegiatan(db, kid, teks(b.kka, 20));
      if (!r.ok) return galat(r.pesan, r.status);
      await catatAudit(db, sesi.akunId, "arsip.kka_kegiatan", { kegiatan_id: kid, kka: b.kka ?? null });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "simpan_unit") {
      const r = await simpanUnit(db, String(b.unit ?? ""), sesi.akunId);
      if (!r.ok) return galat(r.pesan, r.status);
      await catatAudit(db, sesi.akunId, "arsip.unit", { unit: b.unit });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
