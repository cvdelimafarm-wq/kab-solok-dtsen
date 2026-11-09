// app/api/sigap/pelatihan/instruktur/route.ts
//
// (3 Nov 2026) Kelola Pelatihan > Tim & Peserta > Instruktur. Izin menu `pelatihan.kelola` (lihat untuk membaca, kelola untuk mengubah).
//
// GET                           -> { instruktur[{akun_id,nama,kelas}], kelas[], boleh_kelola }
// GET ?cari=nama                -> { kandidat[{akun_id,nama,jenis}] }
// POST {aksi:"tetapkan", akun_id, kelas}  -> menetapkan / memindahkan kelas instruktur -> { ok }
// POST {aksi:"lepas", akun_id}            -> melepas instruktur -> { ok }

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { muatKelasKegiatan } from "@/lib/sigapKelasKegiatan";
import { cariAkun, kelasTersedia, lepasInstruktur, muatInstruktur, tetapkanInstruktur } from "@/lib/sigapInstrukturDb";
import { tambahPesertaAdministrasi } from "@/lib/sigapAdministrasiDaftar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function siapkan(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariRequest(req, db);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const kegiatanId = await idKegiatanPelatihan(db, req);
  if (!kegiatanId) return { err: galat("Pelatihan tidak ditemukan.", 404) } as const;
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return { err: galat("Tidak punya izin membuka menu ini.", 403) } as const;
  return { db, akun, kegiatanId, bisaKelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId) } as const;
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    const cari = req.nextUrl.searchParams.get("cari");
    if (cari !== null) return NextResponse.json({ kandidat: await cariAkun(p.db, cari) });
    const instruktur = await muatInstruktur(p.db, p.kegiatanId);
    return NextResponse.json({ kegiatan_id: p.kegiatanId, instruktur, kelas: await kelasTersedia(p.db, p.kegiatanId, instruktur), daftar_kelas: await muatKelasKegiatan(p.db, p.kegiatanId), boleh_kelola: p.bisaKelola });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin menetapkan instruktur.", 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return galat("Permintaan tidak valid.");
    const akunId = Number(body.akun_id);
    if (!Number.isInteger(akunId) || akunId <= 0) return galat("Akun tidak valid.");

    if (body.aksi === "tetapkan") {
      const hasil = await tetapkanInstruktur(p.db, p.kegiatanId, akunId, Number(body.kelas));
      if (!hasil.ok) return galat(hasil.pesan);
      await catatAudit(p.db, p.akun.id, "pelatihan_instruktur_tetapkan", { kegiatan_id: p.kegiatanId, akun_id: akunId, kelas: Number(body.kelas) });
      // (9 Nov 2026) Transport Lokal ikut peran instruktur: instruktur otomatis masuk daftar administrasi (peran instruktur, bukan peserta tes) supaya Kamera dan Translok aktif.
      // Sudah punya penugasan aktif (mis. PML) = tidak diubah; tarif instruktur belum diatur atau gagal = pelatihan tetap tersimpan, hanya diberi catatan.
      let translok: string | null = null;
      try {
        const t = await tambahPesertaAdministrasi(p.db, p.kegiatanId, { akunId, peran: "instruktur", kelas: Number(body.kelas) });
        if (t.ok) {
          translok = "aktif";
          await catatAudit(p.db, p.akun.id, "pelatihan_instruktur_translok", { kegiatan_id: p.kegiatanId, akun_id: akunId, penugasan_id: t.penugasan_id });
        } else if (t.status === 409 && /sudah ada di daftar/.test(t.pesan)) translok = "sudah";
        else translok = t.pesan;
      } catch {
        translok = null;
      }
      return NextResponse.json({ ok: true, translok });
    }
    if (body.aksi === "lepas") {
      const hasil = await lepasInstruktur(p.db, p.kegiatanId, akunId);
      if (!hasil.ok) return galat(hasil.pesan);
      await catatAudit(p.db, p.akun.id, "pelatihan_instruktur_lepas", { kegiatan_id: p.kegiatanId, akun_id: akunId });
      return NextResponse.json({ ok: true });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
