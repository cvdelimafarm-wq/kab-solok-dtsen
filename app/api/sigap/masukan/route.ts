// app/api/sigap/masukan/route.ts
//
// (28 Okt 2026) Tombol "Masukan" melayang + menu "Usulan perbaikan" di SIGAP Kelola.
// POST (multipart: jenis, isi, halaman, peran, versi, perangkat, gambar?)  -> akun mana pun yang masuk mengirim masukan (maks 10 per jam).
// GET ?saya=1                       -> masukan milik akun ini (status + catatan admin), terbaru dulu, maks 30.
// GET [?status=baru|...]            -> ADMIN (portal.kelola = kelola): semua usulan + ringkasan status.
// GET ?gambar=<id>                  -> ADMIN atau pengirimnya: foto layar (image/jpeg).
// PATCH {id, status?, catatan?}     -> ADMIN: ubah status / catatan. Tidak ada DELETE (tidak ada hapus permanen).
// Semua perubahan dicatat di sigap_audit. Mode "masuk sebagai" (simulasi) tidak boleh mengirim/mengubah.

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";
import { galatServer } from "@/lib/sigapGalat";
import { buatFotoKecil } from "@/lib/sigapFotoKecil";
import { GAMBAR_MAKS_BYTE, GAMBAR_TIPE, adalahStatus, hitungStatus, jalurGambar, jalurGambarSah, periksaCatatan, periksaMasukan, urutkanMasukan } from "@/lib/sigapMasukan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KOLOM = "id, akun_id, jenis, isi, halaman, peran, versi, perangkat, gambar_path, status, catatan_admin, diubah_oleh, dibuat_at, diubah_at";
const MAKS_PER_JAM = 10;

type BarisMasukan = { id: number; akun_id: number; diubah_oleh: number | null; gambar_path: string | null; status: string; dibuat_at: string; [k: string]: unknown };
type BarisSaya = { gambar_path: string | null; [k: string]: unknown };

async function bolehAdmin(db: Parameters<typeof izinAkun>[0], akunId: number): Promise<boolean> {
  const { izin } = await izinAkun(db, akunId);
  return boleh(izin, "portal.kelola", "kelola");
}

export async function POST(req: NextRequest) {
  try {
    const m = await masukFoto(req);
    if (m instanceof NextResponse) return m;
    const { db, akunId } = m;
    if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengirim masukan.', 403);

    const f = await req.formData().catch(() => null);
    if (!f) return galat("Isian tidak terbaca.");
    // peran diisi server dari akun (bukan dari isian HP) supaya dapat dipercaya saat menelusuri masalah
    const { peran } = await izinAkun(db, akunId);
    const peranTeks = Array.from(new Set(peran.map((p) => p.nama))).join(", ") || m.akun.jenis;
    const h = periksaMasukan({ jenis: f.get("jenis"), isi: f.get("isi"), halaman: f.get("halaman"), peran: peranTeks, versi: f.get("versi"), perangkat: f.get("perangkat") });
    if (!h.ok) return galat(h.pesan);

    const sejam = new Date(Date.now() - 3600_000).toISOString();
    const { count, error: eHitung } = await db.from("sigap_masukan").select("id", { count: "exact", head: true }).eq("akun_id", akunId).gte("dibuat_at", sejam);
    if (eHitung) throw eHitung;
    if ((count ?? 0) >= MAKS_PER_JAM) return galat("Terlalu banyak masukan dalam satu jam. Coba lagi sebentar lagi.", 429);

    // Foto layar (opsional): diperiksa tipe & ukuran, lalu dikodekan ulang JPEG <= 1280 px (membuang metadata dan memastikan benar-benar gambar).
    let gambarPath: string | null = null;
    const g = f.get("gambar");
    if (g && typeof g !== "string" && g.size > 0) {
      if (!(GAMBAR_TIPE as readonly string[]).includes(g.type)) return galat("Foto layar harus JPEG, PNG, atau WebP.");
      if (g.size > GAMBAR_MAKS_BYTE) return galat("Foto layar terlalu besar (maks 3 MB).");
      let jpeg: Buffer;
      try {
        jpeg = await buatFotoKecil(Buffer.from(await g.arrayBuffer()), 1280, 78);
      } catch {
        return galat("Foto layar tidak bisa dibaca.");
      }
      gambarPath = jalurGambar(akunId, randomBytes(12).toString("hex"), "image/jpeg");
      const { error: eUnggah } = await db.storage.from(BUCKET_SIGAP).upload(gambarPath, jpeg, { contentType: "image/jpeg", upsert: false });
      if (eUnggah) throw eUnggah;
    }

    const { data, error } = await db.from("sigap_masukan").insert({ akun_id: akunId, ...h.nilai, gambar_path: gambarPath }).select("id").single();
    if (error) throw error;
    await catatAudit(db, akunId, "masukan.kirim", { id: data.id, jenis: h.nilai.jenis, halaman: h.nilai.halaman, gambar: !!gambarPath });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return galatServer("[api/sigap/masukan POST]", e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const m = await masukFoto(req);
    if (m instanceof NextResponse) return m;
    const { db, akunId } = m;
    const q = req.nextUrl.searchParams;

    const idGambar = Number(q.get("gambar"));
    if (q.has("gambar")) {
      if (!Number.isInteger(idGambar) || idGambar <= 0) return galat("id wajib.");
      const { data: r } = await db.from("sigap_masukan").select("akun_id, gambar_path").eq("id", idGambar).maybeSingle();
      if (!r || !jalurGambarSah(r.gambar_path)) return galat("Foto layar tidak ada.", 404);
      if (r.akun_id !== akunId && !(await bolehAdmin(db, akunId))) return galat("Tidak punya akses.", 403);
      const { data, error } = await db.storage.from(BUCKET_SIGAP).download(r.gambar_path);
      if (error || !data) return galat("Berkas tidak ditemukan.", 404);
      return new NextResponse(Buffer.from(await data.arrayBuffer()), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", Vary: "Authorization" } });
    }

    if (q.get("saya") === "1") {
      const { data, error } = await db.from("sigap_masukan").select("id, jenis, isi, halaman, gambar_path, status, catatan_admin, dibuat_at, diubah_at").eq("akun_id", akunId).order("dibuat_at", { ascending: false }).limit(30);
      if (error) throw error;
      return NextResponse.json({ masukan: ((data ?? []) as BarisSaya[]).map(({ gambar_path, ...r }) => ({ ...r, ada_gambar: !!gambar_path })) });
    }

    if (!(await bolehAdmin(db, akunId))) return galat("Hanya admin aplikasi yang boleh membaca usulan.", 403);
    const status = q.get("status");
    let kueri = db.from("sigap_masukan").select(KOLOM).order("dibuat_at", { ascending: false }).limit(300);
    if (status && adalahStatus(status)) kueri = kueri.eq("status", status);
    const { data, error } = await kueri;
    if (error) throw error;
    const baris = (data ?? []) as BarisMasukan[];
    const idAkun = Array.from(new Set(baris.flatMap((r) => [r.akun_id, r.diubah_oleh]).filter((x): x is number => typeof x === "number")));
    const nama = new Map<number, string>();
    if (idAkun.length) {
      const { data: ak, error: eAk } = await db.from("sigap_akun").select("id, nama").in("id", idAkun);
      if (eAk) throw eAk;
      for (const a of (ak ?? []) as { id: number; nama: string }[]) nama.set(a.id, a.nama);
    }
    const hasil = urutkanMasukan(baris).map(({ gambar_path, ...r }) => ({ ...r, ada_gambar: !!gambar_path, nama_pengirim: nama.get(r.akun_id) ?? "—", nama_pengubah: r.diubah_oleh ? (nama.get(r.diubah_oleh) ?? null) : null }));
    // ringkasan selalu menghitung semua status (bukan hanya yang disaring)
    const { data: semua } = await db.from("sigap_masukan").select("status").limit(5000);
    return NextResponse.json({ masukan: hasil, hitung: hitungStatus((semua ?? []) as { status: string }[]) });
  } catch (e) {
    return galatServer("[api/sigap/masukan GET]", e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const m = await masukFoto(req);
    if (m instanceof NextResponse) return m;
    const { db, akunId } = m;
    if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengubah.', 403);
    if (!(await bolehAdmin(db, akunId))) return galat("Hanya admin aplikasi yang boleh mengubah usulan.", 403);
    const b = (await req.json().catch(() => null)) as { id?: unknown; status?: unknown; catatan?: unknown } | null;
    const id = Number(b?.id);
    if (!Number.isInteger(id) || id <= 0) return galat("id wajib.");
    const ubah: Record<string, unknown> = { diubah_oleh: akunId, diubah_at: new Date().toISOString() };
    if (b?.status !== undefined) {
      if (!adalahStatus(b.status)) return galat("Status tidak dikenal.");
      ubah.status = b.status;
    }
    if (b?.catatan !== undefined) ubah.catatan_admin = periksaCatatan(b.catatan) || null;
    if (Object.keys(ubah).length === 2) return galat("Tidak ada yang diubah.");
    const { data, error } = await db.from("sigap_masukan").update(ubah).eq("id", id).select("id, status, catatan_admin, diubah_at").maybeSingle();
    if (error) throw error;
    if (!data) return galat("Usulan tidak ditemukan.", 404);
    await catatAudit(db, akunId, "masukan.ubah", { id, status: ubah.status ?? null, catatan: b?.catatan !== undefined });
    return NextResponse.json({ ok: true, masukan: data });
  } catch (e) {
    return galatServer("[api/sigap/masukan PATCH]", e);
  }
}
