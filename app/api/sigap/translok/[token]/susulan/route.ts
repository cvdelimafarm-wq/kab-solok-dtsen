// app/api/sigap/translok/[token]/susulan/route.ts
//
// (3 Nov 2026) "Ajukan susulan" translok. Token = sigap_akun.token (seperti halaman translok). Aturan murni: lib/translokSusulan.ts; data: lib/translokSusulanDb.ts.
//
// GET  ?penugasan=ID[&kandidat=1]  -> { saya: [pengajuan milik pemanggil pada kegiatan itu],
//                                       masuk: [pengajuan yang menunggu keputusan pemanggil],
//                                       kandidat?: [tanggal lampau + bisa/tidak diajukan] }   (kandidat hanya bila diminta: lebih berat)
// POST { aksi:"ajukan", penugasan_id, tanggal, alasan }   petugas mengajukan -> notifikasi ke 2 tingkat atasan terdekat
// POST { aksi:"batal", id }                               petugas membatalkan pengajuannya yang masih menunggu
// POST { aksi:"setujui"|"tolak", id, catatan? }           atasan (2 tingkat terdekat) / admin translok memutuskan
//   setujui = hari kerja dibuat bila belum ada + izin susulan 24 jam; petugas melengkapi foto (unggah) dan laporan (formulir) seperti hari berizin lainnya.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { akunDariToken, penugasanAkun } from "@/lib/sigap";
import { catatAudit } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { kirimKeAkun } from "@/lib/sigapPush";
import { rapikanTeks } from "@/lib/translokBlokir";
import {
  MAKS_CATATAN_SUSULAN, cekAlasanSusulan, cekPengajuan, pesanKeputusanSusulan, pesanPengajuanSusulan, tanggalValid, urutkanSusulan,
  type FaktaPengajuan,
} from "@/lib/translokSusulan";
import { ambilSusulan, bolehMemutuskan, kandidatSusulan, muatFakta, penerimaPengajuan, setujuiSusulan, susulanMasuk, susulanSaya } from "@/lib/translokSusulanDb";

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
    const penugasanId = angka(req.nextUrl.searchParams.get("penugasan"));
    if (!penugasanId) return NextResponse.json({ error: "Penugasan tidak valid." }, { status: 400 });
    const pen = (await penugasanAkun(db, akun.id)).find((p) => p.id === penugasanId);
    if (!pen) return NextResponse.json({ error: "Anda tidak terdaftar pada kegiatan ini." }, { status: 403 });

    const [saya, masuk] = await Promise.all([susulanSaya(db, akun.id, pen.kegiatan.id), susulanMasuk(db, akun.id, pen.kegiatan.id)]);
    const kandidat = req.nextUrl.searchParams.get("kandidat") === "1" ? await kandidatSusulan(db, akun.id, pen) : undefined;
    return NextResponse.json({ saya, masuk: urutkanSusulan(masuk), ...(kandidat ? { kandidat } : {}) });
  } catch (e) {
    return galatServer("translok_susulan", e);
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

    async function dorong(ids: number[], pesan: { judul: string; isi: string }, url = "/") {
      try { await kirimKeAkun(db!, ids, { ...pesan, url, tag: "translok-susulan" }); } catch { /* push best-effort */ }
    }

    if (aksi === "ajukan") {
      const penugasanId = angka(b.penugasan_id);
      if (!penugasanId) return NextResponse.json({ error: "Penugasan tidak valid." }, { status: 400 });
      if (!tanggalValid(b.tanggal)) return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
      const tanggal = b.tanggal;
      const alasan = cekAlasanSusulan(b.alasan);
      if (!alasan.ok) return NextResponse.json({ error: alasan.pesan }, { status: 400 });
      const pen = (await penugasanAkun(db, akun.id)).find((p) => p.id === penugasanId);
      if (!pen) return NextResponse.json({ error: "Anda tidak terdaftar pada kegiatan ini." }, { status: 403 });
      const fakta = (await muatFakta(db, akun.id, pen, [tanggal])).get(tanggal) as FaktaPengajuan;
      const cek = cekPengajuan(fakta);
      if (!cek.ok) return NextResponse.json({ error: cek.pesan }, { status: 409 });

      const { data: baru, error } = await db
        .from("sigap_translok_susulan")
        .insert({ kegiatan_id: pen.kegiatan.id, penugasan_id: pen.id, akun_id: akun.id, tanggal, alasan: alasan.alasan, mode: cek.mode })
        .select("id")
        .maybeSingle();
      if (error) {
        // indeks unik parsial: sudah ada pengajuan terbuka untuk tanggal itu (dua ketukan beruntun)
        if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "Pengajuan untuk tanggal itu masih menunggu persetujuan." }, { status: 409 });
        return galatServer("translok_susulan", error);
      }
      await catatAudit(db, akun.id, "translok_susulan_ajukan", { kegiatan_id: pen.kegiatan.id, penugasan_id: pen.id, tanggal, mode: cek.mode, alasan: alasan.alasan });
      const penerima = await penerimaPengajuan(db, akun.id, pen.kegiatan.id);
      await dorong(penerima, pesanPengajuanSusulan(sapa(akun.nama), pen.kegiatan.nama, tanggal));
      return NextResponse.json({ ok: true, id: baru?.id ?? null, mode: cek.mode, penyetuju: penerima.length });
    }

    if (aksi === "batal") {
      const id = angka(b.id);
      if (!id) return NextResponse.json({ error: "Pengajuan tidak valid." }, { status: 400 });
      const { data: ubah, error } = await db
        .from("sigap_translok_susulan")
        .update({ status: "dibatalkan", keputusan_at: new Date().toISOString() })
        .eq("id", id)
        .eq("akun_id", akun.id)
        .eq("status", "diajukan")
        .select("id, kegiatan_id, tanggal")
        .maybeSingle();
      if (error) return galatServer("translok_susulan", error);
      if (!ubah) return NextResponse.json({ error: "Pengajuan tidak ditemukan atau sudah diputuskan." }, { status: 409 });
      await catatAudit(db, akun.id, "translok_susulan_batal", { id, kegiatan_id: ubah.kegiatan_id, tanggal: ubah.tanggal });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "setujui" || aksi === "tolak") {
      const id = angka(b.id);
      if (!id) return NextResponse.json({ error: "Pengajuan tidak valid." }, { status: 400 });
      const row = await ambilSusulan(db, id);
      if (!row) return NextResponse.json({ error: "Pengajuan tidak ditemukan." }, { status: 404 });
      if (!(await bolehMemutuskan(db, akun.id, row))) return NextResponse.json({ error: "Anda tidak berwenang memutuskan pengajuan ini." }, { status: 403 });
      if (row.status !== "diajukan") return NextResponse.json({ error: "Pengajuan ini sudah diputuskan. Muat ulang halaman." }, { status: 409 });
      const catatan = rapikanTeks(b.catatan, MAKS_CATATAN_SUSULAN);
      const setuju = aksi === "setujui";
      const { data: tk } = await db.from("sigap_akun").select("token").eq("id", row.akun_id).maybeSingle();
      const tautan = tk?.token ? `/sigap/translok/${encodeURIComponent(String(tk.token))}?p=${row.penugasan_id}&tab=hari_ini&tgl=${row.tanggal}&fokus=foto` : "/";

      if (setuju) {
        const pen = (await penugasanAkun(db, row.akun_id)).find((p) => p.id === row.penugasan_id);
        if (!pen) return NextResponse.json({ error: "Penugasan petugas ini sudah tidak aktif." }, { status: 409 });
        const hasil = await setujuiSusulan(db, row, { id: akun.id, nama: sapa(akun.nama) }, catatan, pen);
        if (!hasil.ok) return NextResponse.json({ error: hasil.pesan }, { status: hasil.status });
        await catatAudit(db, akun.id, "translok_susulan_setujui", { id, kegiatan_id: row.kegiatan_id, akun_id: row.akun_id, tanggal: row.tanggal, mode: hasil.mode, izin_sampai: hasil.izin_sampai, catatan });
        await dorong([row.akun_id], pesanKeputusanSusulan(true, sapa(akun.nama), row.tanggal), tautan);
        return NextResponse.json({ ok: true, izin_sampai: hasil.izin_sampai, mode: hasil.mode });
      }

      const { data: ubah, error } = await db
        .from("sigap_translok_susulan")
        .update({ status: "ditolak", keputusan_oleh: sapa(akun.nama), keputusan_akun_id: akun.id, keputusan_at: new Date().toISOString(), keputusan_catatan: catatan || null })
        .eq("id", id)
        .eq("status", "diajukan")
        .select("id")
        .maybeSingle();
      if (error) return galatServer("translok_susulan", error);
      if (!ubah) return NextResponse.json({ error: "Pengajuan ini sudah diputuskan. Muat ulang halaman." }, { status: 409 });
      await catatAudit(db, akun.id, "translok_susulan_tolak", { id, kegiatan_id: row.kegiatan_id, akun_id: row.akun_id, tanggal: row.tanggal, catatan });
      await dorong([row.akun_id], pesanKeputusanSusulan(false, sapa(akun.nama), row.tanggal));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (e) {
    return galatServer("translok_susulan", e);
  }
}

