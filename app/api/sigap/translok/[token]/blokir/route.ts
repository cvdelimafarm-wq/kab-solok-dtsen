// app/api/sigap/translok/[token]/blokir/route.ts
//
// (3 Nov 2026) Blokir sementara translok + "Ajukan unblock". Token = sigap_akun.token (seperti halaman translok).
//
// GET  ?kegiatan=ID  -> { saya: { status, modal } | null,            status blokir milik pemanggil (modal petugas)
//                         bisa_kelola, semua,                          pemanggil punya bawahan / Supervisor / admin?
//                         permintaan: [...],                           pengajuan unblock yang menunggu keputusannya
//                         bawahan: [...] }                              petugas yang boleh diblokir / dibuka olehnya
// POST { aksi:"ajukan", kegiatan_id, alasan }                 petugas yang diblokir mengajukan unblock -> notifikasi ke atasan & Supervisor
// POST { aksi:"setujui"|"tolak", id, catatan? }               atasan / Supervisor / admin memutuskan pengajuan
// POST { aksi:"blokir", kegiatan_id, akun_id, alasan }        atasan / Supervisor / admin memblokir sementara
// POST { aksi:"buka", kegiatan_id, akun_id }                  membuka langsung tanpa pengajuan

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { akunDariToken, penugasanAkun } from "@/lib/sigap";
import { catatAudit } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { kirimKeAkun } from "@/lib/sigapPush";
import {
  KOLOM_BLOKIR, MAKS_CATATAN, MAKS_ALASAN, bolehAjukan, bolehPutuskan, cekAlasan, memblokir, pesanBlokir, pesanKeputusan, pesanPengajuan,
  rapikanTeks, teksModalPetugas, urutkanBawahan, urutkanPermintaan, type BarisBlokir, type PermintaanTampil,
} from "@/lib/translokBlokir";
import { ambilBlokir, bawahanDikelola, bolehMengelola, penyetujuUntuk } from "@/lib/translokBlokirDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) : null;
}

const angka = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
};
const sapa = (nama: string) => nama.split(",")[0].trim();

export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const akun = await akunDariToken(db, token);
    if (!akun) return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 404 });
    const kegiatanId = angka(req.nextUrl.searchParams.get("kegiatan"));
    if (!kegiatanId) return NextResponse.json({ error: "Kegiatan tidak valid." }, { status: 400 });

    const sendiri = await ambilBlokir(db, kegiatanId, akun.id);
    const saya = sendiri && memblokir(sendiri.status) ? { status: sendiri.status, modal: teksModalPetugas(sendiri) } : null;

    const { daftar, semua } = await bawahanDikelola(db, akun.id, kegiatanId);
    const tampil = daftar.map((b) => ({ akun_id: b.akun_id, nama: b.nama, peran: b.peran, status: b.status, blokir: b.blokir }));
    const permintaan: PermintaanTampil[] = urutkanPermintaan(
      tampil
        .filter((b) => b.status === "diajukan" && b.blokir)
        .map((b) => ({ id: b.blokir!.id, kegiatan_id: kegiatanId, akun_id: b.akun_id, nama: b.nama, peran: b.peran, alasan: b.blokir!.alasan_unblock ?? "", diajukan_at: b.blokir!.diajukan_at }))
    );
    const bawahan = urutkanBawahan(tampil.map((b) => ({ akun_id: b.akun_id, nama: b.nama, peran: b.peran, status: b.status })));
    return NextResponse.json({ saya, bisa_kelola: daftar.length > 0 || semua, semua, permintaan, bawahan });
  } catch (e) {
    return galatServer("translok_blokir", e);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const akun = await akunDariToken(db, token);
    if (!akun) return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 404 });
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const aksi = typeof b.aksi === "string" ? b.aksi : "";
    const sekarang = new Date().toISOString();

    async function namaKegiatan(id: number): Promise<string> {
      const { data } = await db!.from("sigap_kegiatan").select("nama").eq("id", id).maybeSingle();
      return (data?.nama as string | undefined) ?? "";
    }
    async function dorong(ids: number[], pesan: { judul: string; isi: string }) {
      try { await kirimKeAkun(db!, ids, { ...pesan, url: "/", tag: "translok-blokir" }); } catch { /* push best-effort */ }
    }

    if (aksi === "ajukan") {
      const kegiatanId = angka(b.kegiatan_id);
      if (!kegiatanId) return NextResponse.json({ error: "Kegiatan tidak valid." }, { status: 400 });
      const cek = cekAlasan(b.alasan);
      if (!cek.ok) return NextResponse.json({ error: cek.pesan }, { status: 400 });
      const ada = await ambilBlokir(db, kegiatanId, akun.id);
      if (!ada || !bolehAjukan(ada.status)) return NextResponse.json({ error: ada && ada.status === "diajukan" ? "Pengajuan Anda masih menunggu persetujuan." : "Translok Anda tidak sedang diblokir." }, { status: 409 });
      const { data: baru, error } = await db
        .from("sigap_translok_blokir")
        .update({ status: "diajukan", alasan_unblock: cek.alasan, diajukan_at: sekarang })
        .eq("id", ada.id)
        .eq("status", "blokir")
        .select("id")
        .maybeSingle();
      if (error) return galatServer("translok_blokir", error);
      if (!baru) return NextResponse.json({ error: "Status blokir sudah berubah. Muat ulang halaman." }, { status: 409 });
      await catatAudit(db, akun.id, "translok_unblock_ajukan", { kegiatan_id: kegiatanId, alasan: cek.alasan });
      const p = await penyetujuUntuk(db, akun.id, kegiatanId);
      await dorong([...p.atasan, ...p.supervisor], pesanPengajuan(sapa(akun.nama), await namaKegiatan(kegiatanId)));
      return NextResponse.json({ ok: true });
    }

    if (aksi === "setujui" || aksi === "tolak") {
      const id = angka(b.id);
      if (!id) return NextResponse.json({ error: "Pengajuan tidak valid." }, { status: 400 });
      const { data: baris } = await db.from("sigap_translok_blokir").select(KOLOM_BLOKIR).eq("id", id).maybeSingle();
      const row = baris as BarisBlokir | null;
      if (!row) return NextResponse.json({ error: "Pengajuan tidak ditemukan." }, { status: 404 });
      if (!(await bolehMengelola(db, akun.id, row.akun_id, row.kegiatan_id))) return NextResponse.json({ error: "Anda tidak berwenang atas petugas ini." }, { status: 403 });
      if (!bolehPutuskan(row.status)) return NextResponse.json({ error: "Pengajuan ini sudah diputuskan. Muat ulang halaman." }, { status: 409 });
      const setuju = aksi === "setujui";
      const catatan = rapikanTeks(b.catatan, MAKS_CATATAN);
      const { data: ubah, error } = await db
        .from("sigap_translok_blokir")
        .update({ status: setuju ? "dibuka" : "blokir", keputusan_oleh: sapa(akun.nama), keputusan_at: sekarang, keputusan_catatan: catatan || null })
        .eq("id", id)
        .eq("status", "diajukan")
        .select("id")
        .maybeSingle();
      if (error) return galatServer("translok_blokir", error);
      if (!ubah) return NextResponse.json({ error: "Pengajuan ini sudah diputuskan. Muat ulang halaman." }, { status: 409 });
      await catatAudit(db, akun.id, setuju ? "translok_unblock_setujui" : "translok_unblock_tolak", { kegiatan_id: row.kegiatan_id, akun_id: row.akun_id, catatan });
      await dorong([row.akun_id], pesanKeputusan(setuju, sapa(akun.nama)));
      return NextResponse.json({ ok: true });
    }

    if (aksi === "blokir" || aksi === "buka") {
      const kegiatanId = angka(b.kegiatan_id);
      const target = angka(b.akun_id);
      if (!kegiatanId || !target) return NextResponse.json({ error: "Data tidak lengkap." }, { status: 400 });
      if (!(await bolehMengelola(db, akun.id, target, kegiatanId))) return NextResponse.json({ error: "Anda tidak berwenang atas petugas ini." }, { status: 403 });
      const pen = (await penugasanAkun(db, target)).find((p) => p.kegiatan.id === kegiatanId);
      if (!pen) return NextResponse.json({ error: "Petugas tidak terdaftar pada kegiatan ini." }, { status: 404 });
      const ada = await ambilBlokir(db, kegiatanId, target);

      if (aksi === "blokir") {
        const alasan = rapikanTeks(b.alasan, MAKS_ALASAN);
        const baru = { status: "blokir", alasan_blokir: alasan || "Diblokir sementara oleh atasan.", diblokir_oleh: sapa(akun.nama), diblokir_at: sekarang, alasan_unblock: null, diajukan_at: null, keputusan_oleh: null, keputusan_at: null, keputusan_catatan: null };
        const { error } = ada
          ? await db.from("sigap_translok_blokir").update(baru).eq("id", ada.id)
          : await db.from("sigap_translok_blokir").insert({ kegiatan_id: kegiatanId, akun_id: target, ...baru });
        if (error) return galatServer("translok_blokir", error);
        await catatAudit(db, akun.id, "translok_blokir", { kegiatan_id: kegiatanId, akun_id: target, alasan });
        await dorong([target], pesanBlokir(sapa(akun.nama)));
        return NextResponse.json({ ok: true });
      }

      if (!ada || !memblokir(ada.status)) return NextResponse.json({ error: "Petugas ini tidak sedang diblokir." }, { status: 409 });
      const { error } = await db.from("sigap_translok_blokir").update({ status: "dibuka", keputusan_oleh: sapa(akun.nama), keputusan_at: sekarang, keputusan_catatan: rapikanTeks(b.catatan, MAKS_CATATAN) || null }).eq("id", ada.id);
      if (error) return galatServer("translok_blokir", error);
      await catatAudit(db, akun.id, "translok_buka", { kegiatan_id: kegiatanId, akun_id: target });
      await dorong([target], pesanKeputusan(true, sapa(akun.nama)));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (e) {
    return galatServer("translok_blokir", e);
  }
}
