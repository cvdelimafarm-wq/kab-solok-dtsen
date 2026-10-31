// app/api/portal/pendataan/route.ts
//
// (11 Okt 2026) Lembar Pendataan keroyokan PPL/PML -- permintaan user.
//  GET                  -> { sekarang, saya, pml, anggota[{akun_id,nama,peran,indeks}], sub[], ringkas[] }   (anggota tim: PML + semua PPL-nya)
//  GET ?sub=<idsubsls>  -> { idsubsls, kk[], konfig }                                                              (hanya Sub SLS milik tim)
//  POST { aksi:"tambah", idsubsls, nama, patokan?, lat?, lng?, hasil, waktu, kunci, paksa? }  (14 Okt 2026) tambah keluarga baru
//  POST { aksi:"batalkan_baru", kk_id, alasan? }  (21 Okt 2026) batalkan keluarga baru yang dobel/salah (PML tim atau PPL penambah)
//  GET ?sub=<idsubsls> juga memuat `revisit` (true = Sub SLS ditandai revisit; 31 Okt 2026)
//  POST { kk_id, hasil, alasan?, waktu, kunci, pos?, revisit? }  catat hasil satu KK (revisit:true hanya bermakna untuk hasil 'terdampak'). Idempoten lewat `kunci` (uuid dari HP); `waktu` = waktu kejadian di HP.
// "Masuk sebagai" (akun super) hanya boleh MELIHAT: mencatat ditolak supaya data lapangan tidak terisi tanpa sengaja.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader } from "@/lib/sigapAkses";
import { ambilTimMemo, batalkanKkBaru, catatHasil, daftarKk, periksaTambahKk, ringkasTim, tambahKk } from "@/lib/portal/pendataan";
import { periksaBatalKkBaru, periksaCatat } from "@/lib/pendataan";
import { kkProporsionalTim } from "@/lib/portal/korwilMonitor";
import { kegiatanSub, konfigKegiatan } from "@/lib/portal/lembarKonfig";
import { subBertandaRevisit } from "@/lib/portal/revisit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOLAK_BUKAN_TIM = "Lembar Pendataan khusus anggota tim PML dan PPL.";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const tim = await ambilTimMemo(db, akun);
    if (!tim) return NextResponse.json({ error: TOLAK_BUKAN_TIM }, { status: 403 });

    const idsubsls = req.nextUrl.searchParams.get("sub");
    if (idsubsls) {
      if (!tim.sub.some((s) => s.idsubsls === idsubsls)) return NextResponse.json({ error: "Sub SLS ini bukan wilayah tim Anda." }, { status: 403 });
      const kk = await daftarKk(db, idsubsls);
      // (27 Okt 2026) pengaturan tampilan kegiatan Sub SLS ini (nama/warna/bentuk tombol hasil, radar); tanpa pengaturan = tampilan bawaan
      const konfig = await konfigKegiatan(db, await kegiatanSub(db, idsubsls));
      // (31 Okt 2026) Sub SLS ditandai revisit oleh admin -> kartu KK menampilkan pilihan revisit (false bila SQL 20261031c belum dijalankan)
      const revisit = await subBertandaRevisit(db, idsubsls);
      return NextResponse.json({ sekarang: new Date().toISOString(), idsubsls, kk, konfig, revisit });
    }

    const [ringkas, prop] = await Promise.all([ringkasTim(db, tim.pml.id), kkProporsionalTim(db, tim.pml.id)]);
    const proporsional = prop ? { total: prop.total, didata: prop.didata } : null;
    return NextResponse.json({ sekarang: new Date().toISOString(), saya: tim.saya, pml: tim.pml, anggota: tim.anggota, sub: tim.sub, ringkas, proporsional });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat lembar pendataan." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  if (aktorDariHeader(req.headers)) {
    return NextResponse.json({ error: "Mode \"masuk sebagai\" hanya untuk melihat tampilan. Kembali ke akun Anda untuk menyimpan." }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => null);
    if (body && body.aksi === "tambah") {
      const t = periksaTambahKk(body);
      if (!t.ok) return NextResponse.json({ error: t.pesan }, { status: 400 });
      const r = await tambahKk(db, akun.id, t.isi);
      if (!r.ok) return NextResponse.json({ error: r.pesan, nama_ada: r.nama_ada ?? false }, { status: r.nama_ada ? 409 : 400 });
      return NextResponse.json({ ok: true, kk_id: r.kk_id, duplikat: r.duplikat });
    }
    if (body && body.aksi === "batalkan_baru") {
      const b = periksaBatalKkBaru(body);
      if (!b.ok) return NextResponse.json({ error: b.pesan }, { status: 400 });
      const r = await batalkanKkBaru(db, akun.id, b.isi.kk_id, b.isi.alasan);
      if (!r.ok) return NextResponse.json({ error: r.pesan }, { status: 403 });
      return NextResponse.json({ ok: true, kk_id: b.isi.kk_id, sudah: r.sudah });
    }
    const cek = periksaCatat(body);
    if (!cek.ok) return NextResponse.json({ error: cek.pesan }, { status: 400 });
    // keanggotaan tim diperiksa di fungsi database (bukan_wilayah_tim) -- satu panggilan saja, ringan untuk sinyal lemah
    const r = await catatHasil(db, akun.id, cek.isi);
    if (!r.ok) return NextResponse.json({ error: r.pesan }, { status: 400 });
    return NextResponse.json({ ok: true, kk_id: cek.isi.kk_id, terkini: r.terkini, duplikat: r.duplikat });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan." }, { status: 500 });
  }
}
