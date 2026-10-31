// app/api/sigap/pelatihan/nilai/route.ts
//
// (8 Okt 2026) Skema nilai akhir pelatihan (Pretest + Posttest + Kuis Adu Sigap) -- dipakai Soal & Jadwal, Monitoring, Administrasi.
// Izin: lihat = pelatihan.kelola ATAU pelatihan.administrasi (level lihat); ubah = pelatihan.kelola level kelola.
// GET  -> { skema, tersimpan, boleh_ubah, kuis: { "<akun_id>": KuisNilai }, disiplin?: { "<akun_id>": 0-100|null }, sikap?: { "<akun_id>": 0-100 }, sikap_tersedia?: boolean }
//         (disiplin/sikap hanya bila skema memakainya; 31 Okt 2026)
//         (nilai Pretest/Posttest sudah ada di data Monitoring; peramban menghitung nilai akhir dari skema + data ini)
// POST { aksi: "simpan_skema", skema: { pakai, bobot, dasar_kuis, tambahan?, lulus_akhir? } } -> sama seperti GET
// POST { aksi: "simpan_sikap", item: [{ akun_id, nilai: 0-100 | null }] } -> sama seperti GET (hanya peserta pelatihan ini)

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { muatDisiplin, muatKuisNilai, muatSikap, muatSkema, periksaItemSikap, simpanSikap, simpanSkema } from "@/lib/sigapNilai";
import { ringkasSkema, tambahanDari, validasiSkema } from "@/lib/sigapNilaiHitung";
import { FILTER_BUKAN_ADMINISTRASI } from "@/lib/sigapTesDb";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function siapkan(req: NextRequest, tulis: boolean) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariRequest(req, db);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const kegiatanId = await idKegiatanPelatihan(db, req);
  if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
  const { izin } = await izinAkun(db, akun.id);
  const bolehUbah = boleh(izin, "pelatihan.kelola", "kelola", kegiatanId);
  const bolehLihat = bolehUbah || boleh(izin, "pelatihan.kelola", "lihat", kegiatanId) || boleh(izin, "pelatihan.administrasi", "lihat", kegiatanId);
  if (!bolehLihat) return galat("Tidak punya izin melihat nilai pelatihan.", 403);
  if (tulis && !bolehUbah) return galat("Hanya pengelola pelatihan yang boleh mengubah skema nilai.", 403);
  return { db, akun, kegiatanId, bolehUbah };
}

async function muatSemua(k: Exclude<Awaited<ReturnType<typeof siapkan>>, NextResponse>) {
  const [{ skema, tersimpan }, kuis] = await Promise.all([muatSkema(k.db, k.kegiatanId), muatKuisNilai(k.db, k.kegiatanId)]);
  const tam = tambahanDari(skema);
  const dasar = { skema, tersimpan, boleh_ubah: k.bolehUbah, kuis: Object.fromEntries(kuis) };
  if (!tam.disiplin.pakai && !tam.sikap.pakai) return dasar;
  const { data: pen } = await k.db.from("sigap_penugasan").select("akun_id").eq("kegiatan_id", k.kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(5000);
  const ids = Array.from(new Set(((pen ?? []) as { akun_id: number }[]).map((r) => Number(r.akun_id))));
  const [disiplin, sikap] = await Promise.all([tam.disiplin.pakai ? muatDisiplin(k.db, k.kegiatanId, ids) : null, tam.sikap.pakai ? muatSikap(k.db, k.kegiatanId) : null]);
  return {
    ...dasar,
    ...(disiplin ? { disiplin: Object.fromEntries(disiplin) } : {}),
    ...(sikap ? { sikap: Object.fromEntries(sikap.peta), sikap_tersedia: sikap.tersedia } : {}),
  };
}

export async function GET(req: NextRequest) {
  try {
    const k = await siapkan(req, false);
    if (k instanceof NextResponse) return k;
    return NextResponse.json(await muatSemua(k));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const k = await siapkan(req, true);
    if (k instanceof NextResponse) return k;
    if (body?.aksi === "simpan_sikap") {
      const p = periksaItemSikap(body?.item);
      if (!p.ok) return galat(p.error);
      const { data: pen } = await k.db.from("sigap_penugasan").select("akun_id").eq("kegiatan_id", k.kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).in("akun_id", p.item.map((x) => x.akun_id));
      const sah = new Set(((pen ?? []) as { akun_id: number }[]).map((r) => Number(r.akun_id)));
      if (p.item.some((x) => !sah.has(x.akun_id))) return galat("Ada akun yang bukan peserta pelatihan ini.");
      await simpanSikap(k.db, k.kegiatanId, p.item, k.akun.id);
      await catatAudit(k.db, k.akun.id, "pelatihan_sikap_simpan", { kegiatan_id: k.kegiatanId, jumlah: p.item.length });
      return NextResponse.json({ ok: true, ...(await muatSemua(k)) });
    }
    if (body?.aksi !== "simpan_skema") return galat("Aksi tidak dikenal.");
    const v = validasiSkema(body?.skema);
    if (!v.ok) return galat(v.error);
    await simpanSkema(k.db, k.kegiatanId, v.skema, k.akun.id);
    await catatAudit(k.db, k.akun.id, "pelatihan_skema_nilai_simpan", { skema: ringkasSkema(v.skema), dasar_kuis: v.skema.dasar_kuis, kegiatan_id: k.kegiatanId });
    return NextResponse.json({ ok: true, ...(await muatSemua(k)) });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
