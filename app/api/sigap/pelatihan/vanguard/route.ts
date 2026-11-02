// app/api/sigap/pelatihan/vanguard/route.ts
//
// (2 Nov 2026) Kelola Pelatihan > Persiapan > Vanguard: menyalakan / mematikan Vanguard (simulasi pengisian kuesioner) untuk pelatihan ini. Dulu penyalaan hanya lewat SQL,
// centang "Fitur kegiatan" di Kelola Pendataan (izin bencana.admin), atau Identifikasi survei; pelatihan tidak punya tempat sehingga kotak pintasan dasbor tidak pernah muncul.
// Izin menu `pelatihan.kelola` (lihat = baca, kelola = ubah).
//
// GET                          -> { kegiatan_id, menyala, sumber:"centang"|"identifikasi"|"mati", centang:true|false|null, percobaan, boleh_kelola,
//                                    aturan:{mode,hari_berturut,sesi_min_per_hari,nilai_minimal}, blokir_tahap, tanggal_pretest, batas_mulai, ringkas:{...}|null }
// POST {menyala:true|false|null} -> true/false = centang manual (menang atas Identifikasi survei); null = hapus centang (ikuti Identifikasi survei) -> sama seperti GET
// POST {aturan:{mode,hari_berturut,sesi_min_per_hari,nilai_minimal}} -> (2 Nov 2026) aturan "latihan Vanguard N hari berturut-turut" (kolom vanguard_* pada sigap_pelatihan_aturan, SQL 20261102zp);
//        mode "wajib" mengunci Pretest sampai tuntas (bila Blokir antar tahapan menyala). Audit pelatihan_vanguard_aturan.

import { NextRequest, NextResponse } from "next/server";
import type { Db } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { KODE_FITUR_VANGUARD, keadaanVanguard } from "@/lib/vanguardAkses";
import { muatAturan } from "@/lib/sigapAturanDb";
import { muatTesDaftar } from "@/lib/sigapTesDb";
import { periksaAturanVanguard, tambahHari } from "@/lib/runtutanVanguard";
import { muatAturanVanguard, muatRuntutanBatch, simpanAturanVanguard, tanggalBukaPretest } from "@/lib/vanguardRuntutanDb";
import { ringkasRuntutanPeserta } from "@/lib/vanguardPelatihan";

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
  return { db: db as Db, akun, kegiatanId, bisaKelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId) } as const;
}

/** Peserta aktif (bukan peserta tambahan administrasi): dasar ringkasan runtutan untuk pengelola. */
async function akunPeserta(db: Db, kegiatanId: number): Promise<number[]> {
  try {
    const { data } = await db.from("sigap_penugasan").select("akun_id").eq("kegiatan_id", kegiatanId).eq("aktif", true).or("sumber.is.null,sumber.neq.administrasi").limit(5000);
    return Array.from(new Set(((data ?? []) as { akun_id: number }[]).map((r) => Number(r.akun_id))));
  } catch {
    return [];
  }
}

async function keadaan(db: Db, kegiatanId: number, bisaKelola: boolean) {
  const [kd, { data: c }, { count }, aturan, aturanNilai, tes] = await Promise.all([
    keadaanVanguard(db, kegiatanId),
    db.from("sigap_kegiatan_fitur").select("aktif").eq("kegiatan_id", kegiatanId).eq("fitur", KODE_FITUR_VANGUARD).maybeSingle(),
    db.from("sigap_vanguard_percobaan").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId),
    muatAturanVanguard(db, kegiatanId),
    muatAturan(db, kegiatanId),
    muatTesDaftar(db, kegiatanId).catch(() => []),
  ]);
  const aktif = (c as { aktif?: unknown } | null)?.aktif;
  const tanggalPretest = tanggalBukaPretest(tes);
  let ringkas: ReturnType<typeof ringkasRuntutanPeserta> | null = null;
  if (aturan.mode !== "tidak_ada" && kd.menyala) {
    const ids = await akunPeserta(db, kegiatanId);
    const b = await muatRuntutanBatch(db, kegiatanId, ids, Date.now(), tanggalPretest, aturan);
    ringkas = ringkasRuntutanPeserta([...b.peta.values()]);
  }
  return {
    kegiatan_id: kegiatanId, menyala: kd.menyala, sumber: kd.sumber, centang: typeof aktif === "boolean" ? aktif : null, percobaan: count ?? 0, boleh_kelola: bisaKelola,
    aturan, blokir_tahap: aturanNilai.blokir_tahap, tanggal_pretest: tanggalPretest, batas_mulai: tanggalPretest ? tambahHari(tanggalPretest, -aturan.hari_berturut) : null, ringkas,
  };
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    return NextResponse.json(await keadaan(p.db, p.kegiatanId, p.bisaKelola));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin mengubah Vanguard pelatihan ini.", 403);
    const body = (await req.json().catch(() => null)) as { menyala?: unknown; aturan?: unknown } | null;
    if (body && body.aturan !== undefined) {
      const cek = periksaAturanVanguard(body.aturan);
      if (!cek.ok) return galat(cek.pesan);
      const simpan = await simpanAturanVanguard(p.db, p.kegiatanId, cek.aturan, p.akun.nama);
      if (!simpan.ok) return galat(simpan.pesan, 409);
      await catatAudit(p.db, p.akun.id, "pelatihan_vanguard_aturan", { kegiatan_id: p.kegiatanId, ...cek.aturan });
      return NextResponse.json(await keadaan(p.db, p.kegiatanId, p.bisaKelola));
    }
    if (!body || !(body.menyala === true || body.menyala === false || body.menyala === null)) return galat("Pilihan tidak valid.");
    if (body.menyala === null) {
      const { error } = await p.db.from("sigap_kegiatan_fitur").delete().eq("kegiatan_id", p.kegiatanId).eq("fitur", KODE_FITUR_VANGUARD);
      if (error) return galat("Gagal menyimpan pilihan Vanguard.", 500);
    } else {
      const { error } = await p.db.from("sigap_kegiatan_fitur").upsert({ kegiatan_id: p.kegiatanId, fitur: KODE_FITUR_VANGUARD, aktif: body.menyala, diubah_oleh: p.akun.nama, diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id,fitur" });
      if (error) return galat("Gagal menyimpan pilihan Vanguard.", 500);
    }
    await catatAudit(p.db, p.akun.id, "pelatihan_vanguard", { kegiatan_id: p.kegiatanId, menyala: body.menyala });
    return NextResponse.json(await keadaan(p.db, p.kegiatanId, p.bisaKelola));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
