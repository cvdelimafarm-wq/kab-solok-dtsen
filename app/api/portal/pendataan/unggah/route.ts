// app/api/portal/pendataan/unggah/route.ts
//
// (11 Okt 2026) Unggah daftar KK sasaran pendataan (admin, izin bencana.admin level kelola) -- permintaan user.
//  GET                       -> { batch[], total_aktif, total_didata, sampel[] }   (sampel = kode Sub SLS daftar awal, untuk penyaringan di peramban)
//  POST { aksi:"mulai", nama_berkas, kegiatan_id? }            -> { batch_id }
//  POST { aksi:"baris", batch_id, baris:[{no,data}] }          -> { diterima, diperbarui, sama, ditolak[{no,pesan}] }   (maks 500 baris per kiriman)
//  POST { aksi:"selesai", batch_id, ditolak:[{no,pesan}], catatan?:{nama:angka} } -> { diterima, ditolak }
//  POST { aksi:"batalkan", batch_id }                          -> { dinonaktifkan }   (lunak; hanya bila belum ada yang didata)
// Data ini pribadi (nama KK + koordinat rumah): hanya admin yang boleh mengunggah, dan tidak ada penghapusan permanen.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, izinAkun } from "@/lib/sigapAkses";
import { batalkanUnggah, batchAktif, daftarSampel, daftarUnggahan, kegiatanAda, mulaiUnggah, selesaiUnggah, terimaBaris, type TolakBaris } from "@/lib/portal/pendataan";
import { KEGIATAN_PENDATAAN_ID, MAKS_BARIS_UNGGAH } from "@/lib/pendataan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function pastikanAdmin(req: NextRequest, tulis: boolean) {
  const db = dbPortal();
  if (!db) return { err: NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 }) } as const;
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return { err: NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 }) } as const;
  if (tulis && aktorDariHeader(req.headers)) {
    return { err: NextResponse.json({ error: "Mode \"masuk sebagai\" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengunggah." }, { status: 403 }) } as const;
  }
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "bencana.admin", tulis ? "kelola" : "lihat")) {
    return { err: NextResponse.json({ error: "Tidak punya akses admin pendataan." }, { status: 403 }) } as const;
  }
  return { db, akun } as const;
}

export async function GET(req: NextRequest) {
  const x = await pastikanAdmin(req, false);
  if ("err" in x) return x.err;
  try {
    const kegiatan = Number(req.nextUrl.searchParams.get("kegiatan") ?? KEGIATAN_PENDATAAN_ID) || KEGIATAN_PENDATAAN_ID;
    const [u, sampel] = await Promise.all([daftarUnggahan(x.db, kegiatan), daftarSampel(x.db)]);
    return NextResponse.json({ sekarang: new Date().toISOString(), kegiatan_id: kegiatan, ...u, sampel });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat daftar unggahan." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const x = await pastikanAdmin(req, true);
  if ("err" in x) return x.err;
  const { db, akun } = x;
  try {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return NextResponse.json({ error: "Isian tidak terbaca." }, { status: 400 });

    if (b.aksi === "mulai") {
      const kegiatan = Number(b.kegiatan_id ?? KEGIATAN_PENDATAAN_ID);
      if (!Number.isInteger(kegiatan) || !(await kegiatanAda(db, kegiatan))) return NextResponse.json({ error: "Kegiatan tidak ditemukan." }, { status: 400 });
      const id = await mulaiUnggah(db, akun.id, kegiatan, typeof b.nama_berkas === "string" ? b.nama_berkas : "");
      return NextResponse.json({ ok: true, batch_id: id, kegiatan_id: kegiatan });
    }

    const batchId = Number(b.batch_id);
    if (!Number.isInteger(batchId) || batchId <= 0) return NextResponse.json({ error: "Unggahan tidak dikenal." }, { status: 400 });
    const batch = await batchAktif(db, batchId);
    if (!batch) return NextResponse.json({ error: "Unggahan tidak ditemukan." }, { status: 404 });

    if (b.aksi === "baris") {
      if (batch.dibatalkan_at) return NextResponse.json({ error: "Unggahan ini sudah dibatalkan." }, { status: 400 });
      const baris = Array.isArray(b.baris) ? (b.baris as unknown[]) : null;
      if (!baris || baris.length === 0 || baris.length > MAKS_BARIS_UNGGAH) return NextResponse.json({ error: `Kirim 1-${MAKS_BARIS_UNGGAH} baris per kiriman.` }, { status: 400 });
      const rapi = baris.map((r, i) => {
        const o = (r ?? {}) as { no?: unknown; data?: unknown };
        return { no: Number.isInteger(o.no) ? (o.no as number) : i + 1, data: o.data && typeof o.data === "object" ? (o.data as Record<string, unknown>) : {} };
      });
      return NextResponse.json({ ok: true, ...(await terimaBaris(db, batch.kegiatan_id, batchId, rapi)) });
    }

    if (b.aksi === "selesai") {
      const dt = Array.isArray(b.ditolak)
        ? (b.ditolak as unknown[]).flatMap((t): TolakBaris[] => {
            const o = (t ?? {}) as { no?: unknown; pesan?: unknown };
            return Number.isInteger(o.no) && typeof o.pesan === "string" ? [{ no: o.no as number, pesan: o.pesan.slice(0, 200) }] : [];
          })
        : [];
      // catatan penyaringan dari peramban (jumlah dilewati per status, diperbarui, dst.): hanya nama pendek -> angka
      const catatan: Record<string, number> = {};
      if (b.catatan && typeof b.catatan === "object") {
        for (const [k, v] of Object.entries(b.catatan as Record<string, unknown>).slice(0, 20)) {
          if (/^[a-z0-9_]{1,40}$/.test(k) && typeof v === "number" && Number.isFinite(v)) catatan[k] = Math.max(0, Math.round(v));
        }
      }
      return NextResponse.json({ ok: true, ...(await selesaiUnggah(db, akun.id, batchId, dt, catatan)) });
    }

    if (b.aksi === "batalkan") {
      const r = await batalkanUnggah(db, akun.id, batchId);
      if (!r.ok) return NextResponse.json({ error: r.pesan }, { status: 400 });
      return NextResponse.json({ ok: true, dinonaktifkan: r.dinonaktifkan });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memproses unggahan." }, { status: 500 });
  }
}
