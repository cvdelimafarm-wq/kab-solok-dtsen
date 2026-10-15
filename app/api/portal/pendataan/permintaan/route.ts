// app/api/portal/pendataan/permintaan/route.ts
//
// (13 Okt 2026) Kartu plotting tim: permintaan daftar KK "keluar" di FASIH -- permintaan user.
//  GET                -> { sekarang, tanggal, maks, bisa_kirim, permintaan[] }   anggota tim (PML dan PPL melihat yang SAMA; hanya PML bisa_kirim)
//  GET ?admin=1       -> { sekarang, boleh_kelola, permintaan[] (+email) }       admin bencana.admin (lihat); boleh_kelola = level kelola
//  POST { aksi:"buat", pilihan:[{idsubsls,ppl_akun_id}] }   PML tim: batas total per PML naik bertahap 7/9/11 (15/16/17 Okt 2026); admin diberi push
//  POST { aksi:"batalkan", id }                              PML tim: hanya yang masih menunggu
//  POST { aksi:"ajukan_batal", id }                          PML tim: batalkan assignment yang SUDAH keluar di FASIH; langsung berlaku (tanpa persetujuan), admin & PPL dikabari
//  POST { aksi:"batal_diproses", ids:[...] }                 admin level kelola: tandai pembatalan sudah dihapus di FASIH
//  POST { aksi:"email", id, sebagai:"pengawas"|"pencacah", email }  admin level kelola: isi email FASIH yang belum ada (bencana_petugas.email_fasih)
//  POST { aksi:"selesai", ids:[...] }                        admin bencana.admin level kelola: tandai sudah keluar di FASIH; PML & PPL diberi push
//  POST { aksi:"tarik", ids:[...] }                          admin level kelola: tarik kembali "sudah keluar" -> "menunggu" (salah klik; tanpa notifikasi)
// Sesi "masuk sebagai" hanya boleh MELIHAT: semua POST ditolak.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { ambilTim } from "@/lib/portal/pendataan";
import { ajukanPembatalan, batalkanPermintaan, buatPermintaan, permintaanSemua, permintaanTim, prosesPembatalan, selesaikanPermintaan, simpanEmailFasih, tarikPermintaan } from "@/lib/portal/permintaanDaftar";
import { aktorDariHeader, boleh, izinAkun } from "@/lib/sigapAkses";
import { batasPengajuan, periksaIds, periksaPilihan, tanggalWib } from "@/lib/permintaanDaftar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  try {
    if (req.nextUrl.searchParams.get("admin") === "1") {
      const { izin } = await izinAkun(db, akun.id);
      if (!boleh(izin, "bencana.admin", "lihat")) return galat("Khusus admin pendataan.", 403);
      return NextResponse.json({ sekarang: new Date().toISOString(), boleh_kelola: boleh(izin, "bencana.admin", "kelola"), permintaan: await permintaanSemua(db) });
    }
    const tim = await ambilTim(db, akun);
    if (!tim) return galat("Kartu plotting khusus anggota tim PML dan PPL.", 403);
    return NextResponse.json({
      sekarang: new Date().toISOString(),
      tanggal: tanggalWib(Date.now()),
      maks: batasPengajuan(tanggalWib(Date.now())),
      bisa_kirim: tim.saya.peran === "pml" && !aktorDariHeader(req.headers),
      permintaan: await permintaanTim(db, tim.pml.id),
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Gagal memuat.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk menyimpan.', 403);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return galat("Permintaan tidak sah.");
  try {
    if (b.aksi === "buat" || b.aksi === "batalkan" || b.aksi === "ajukan_batal") {
      const tim = await ambilTim(db, akun);
      if (!tim) return galat("Kartu plotting khusus anggota tim PML dan PPL.", 403);
      if (b.aksi === "buat") {
        const cek = periksaPilihan(b.pilihan);
        if (!cek.ok) return galat(cek.pesan, 400);
        const h = await buatPermintaan(db, { id: akun.id, nama: (akun as { nama?: string | null }).nama }, tim, cek.pilihan);
        if ("galat" in h) return galat(h.galat, h.status);
        return NextResponse.json({ ok: true, ...h });
      }
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return galat("Permintaan tidak sah.");
      if (b.aksi === "ajukan_batal") {
        const hb = await ajukanPembatalan(db, { id: akun.id }, tim, id);
        if ("galat" in hb) return galat(hb.galat, hb.status);
        return NextResponse.json({ ok: true, dikirim: hb.dikirim });
      }
      const h = await batalkanPermintaan(db, { id: akun.id }, tim, id);
      if ("galat" in h) return galat(h.galat, h.status);
      return NextResponse.json({ ok: true });
    }
    if (b.aksi === "selesai") {
      const { izin } = await izinAkun(db, akun.id);
      if (!boleh(izin, "bencana.admin", "kelola")) return galat("Tidak punya izin menandai permintaan pendataan.", 403);
      const ids = periksaIds(b.ids);
      if (!ids) return galat("Pilih minimal satu permintaan.");
      const h = await selesaikanPermintaan(db, { id: akun.id }, ids);
      if ("galat" in h) return galat(h.galat, h.status);
      return NextResponse.json({ ok: true, ...h });
    }
    if (b.aksi === "batal_diproses") {
      const { izin } = await izinAkun(db, akun.id);
      if (!boleh(izin, "bencana.admin", "kelola")) return galat("Tidak punya izin menandai pembatalan.", 403);
      const ids = periksaIds(b.ids);
      if (!ids) return galat("Pilih minimal satu pembatalan.");
      const h = await prosesPembatalan(db, { id: akun.id }, ids);
      if ("galat" in h) return galat(h.galat, h.status);
      return NextResponse.json({ ok: true, ...h });
    }
    if (b.aksi === "tarik") {
      const { izin } = await izinAkun(db, akun.id);
      if (!boleh(izin, "bencana.admin", "kelola")) return galat("Tidak punya izin menarik tanda sudah keluar.", 403);
      const ids = periksaIds(b.ids);
      if (!ids) return galat("Pilih minimal satu permintaan.");
      const h = await tarikPermintaan(db, { id: akun.id }, ids);
      if ("galat" in h) return galat(h.galat, h.status);
      return NextResponse.json({ ok: true, ...h });
    }
    if (b.aksi === "email") {
      const { izin } = await izinAkun(db, akun.id);
      if (!boleh(izin, "bencana.admin", "kelola")) return galat("Tidak punya izin mengisi email petugas.", 403);
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0 || (b.sebagai !== "pengawas" && b.sebagai !== "pencacah")) return galat("Permintaan tidak sah.");
      const h = await simpanEmailFasih(db, { id: akun.id }, id, b.sebagai, b.email);
      if ("galat" in h) return galat(h.galat, h.status);
      return NextResponse.json({ ok: true, email: h.email });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
