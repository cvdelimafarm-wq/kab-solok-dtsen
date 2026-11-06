// app/api/sigap/pelatihan/koreksi/route.ts
//
// (6 Nov 2026) Kelola Pelatihan > Kendala (tahap kedua): kendala tes, pindah kelas / atasan, tambah peserta mendadak. Izin menu `pelatihan.kelola`
// (lihat untuk membaca, kelola untuk menerapkan). Logika: lib/sigapKoreksiDb.ts. Tabel: SQL 20261106a_pelatihan_koreksi.
//
// GET                                  -> { tersedia, soal_siap, tes[+soal], peserta[], kelas[], riwayat[], boleh_kelola }
// GET ?cari=kata                       -> { kandidat[] } mitra aktif yang belum menjadi peserta (>= 2 huruf)
// GET ?pratinjau=soal&tes=ID&nomor=1,2 -> { dampak } nilai peserta bila soal itu dinonaktifkan (tanpa menyimpan)
// POST {aksi:"tambah_waktu"|"buka_ulang", akun_id, tes_id, menit, alasan}
// POST {aksi:"nonaktif_soal", tes_id, nomor:[..], alasan}
// POST {aksi:"pindah", akun_id, kelas?, atasan_akun_id?, bawahan_ikut?, alasan}
// POST {aksi:"tambah_peserta", akun_id, peran, kelas, atasan_akun_id?, alasan}
// POST {aksi:"urungkan", id}

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { cariKandidat } from "@/lib/sigapKendalaDb";
import { bukaUlangSesi, muatPapanKoreksi, nonaktifkanSoal, pindahPeserta, pratinjauSoal, tambahPeserta, tambahWaktu, urungkanKoreksi } from "@/lib/sigapKoreksiDb";

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

const angka = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
/** undefined = tidak diubah; null / "" = kosongkan; angka = nilai baru. */
const angkaOpsional = (v: unknown): number | null | undefined => (v === undefined ? undefined : v === null || v === "" ? null : angka(v));

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    const sp = req.nextUrl.searchParams;
    const cari = sp.get("cari");
    if (cari !== null) return NextResponse.json({ kandidat: cari.trim().length >= 2 ? await cariKandidat(p.db, p.kegiatanId, cari, null) : [] });
    if (sp.get("pratinjau") === "soal") {
      const nomor = (sp.get("nomor") ?? "").split(",").map((x) => Number(x.trim())).filter((x) => x > 0);
      const h = await pratinjauSoal(p.db, p.kegiatanId, Number(sp.get("tes")), nomor);
      if (!h.ok) return galat(h.pesan);
      return NextResponse.json({ dampak: h.dampak });
    }
    return NextResponse.json({ kegiatan_id: p.kegiatanId, ...(await muatPapanKoreksi(p.db, p.kegiatanId)), boleh_kelola: p.bisaKelola });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin menerapkan koreksi pelatihan.", 403);
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return galat("Permintaan tidak valid.");
    const { db, kegiatanId } = p;
    const oleh = p.akun.id;
    const alasan = typeof b.alasan === "string" ? b.alasan : "";

    if (b.aksi === "tambah_waktu" || b.aksi === "buka_ulang") {
      const inp = { akun_id: angka(b.akun_id), tes_id: angka(b.tes_id), menit: angka(b.menit), alasan };
      const h = b.aksi === "tambah_waktu" ? await tambahWaktu(db, kegiatanId, oleh, inp) : await bukaUlangSesi(db, kegiatanId, oleh, inp);
      if (!h.ok) return galat(h.pesan);
      await catatAudit(db, oleh, b.aksi === "tambah_waktu" ? "pelatihan_koreksi_tambah_waktu" : "pelatihan_koreksi_buka_ulang", { kegiatan_id: kegiatanId, ...inp, koreksi_id: h.id });
      return NextResponse.json({ ok: true, id: h.id, ringkas: h.ringkas });
    }
    if (b.aksi === "nonaktif_soal") {
      const nomor = Array.isArray(b.nomor) ? b.nomor.map(angka) : [];
      const h = await nonaktifkanSoal(db, kegiatanId, oleh, { tes_id: angka(b.tes_id), nomor, alasan });
      if (!h.ok) return galat(h.pesan);
      await catatAudit(db, oleh, "pelatihan_koreksi_soal_nonaktif", { kegiatan_id: kegiatanId, tes_id: angka(b.tes_id), nomor, alasan, koreksi_id: h.id, berubah: h.dampak.berubah });
      return NextResponse.json({ ok: true, id: h.id, ringkas: h.ringkas, dampak: h.dampak });
    }
    if (b.aksi === "pindah") {
      const inp = { akun_id: angka(b.akun_id), kelas: angkaOpsional(b.kelas), atasan_akun_id: angkaOpsional(b.atasan_akun_id), bawahan_ikut: b.bawahan_ikut === true, alasan };
      const h = await pindahPeserta(db, kegiatanId, oleh, inp);
      if (!h.ok) return galat(h.pesan);
      await catatAudit(db, oleh, "pelatihan_koreksi_pindah", { kegiatan_id: kegiatanId, ...inp, koreksi_id: h.id });
      return NextResponse.json({ ok: true, id: h.id, ringkas: h.ringkas });
    }
    if (b.aksi === "tambah_peserta") {
      const kelas = angkaOpsional(b.kelas);
      const inp = { akun_id: angka(b.akun_id), peran: String(b.peran ?? ""), kelas: kelas === undefined ? null : kelas, atasan_akun_id: angkaOpsional(b.atasan_akun_id) ?? null, alasan };
      const h = await tambahPeserta(db, kegiatanId, oleh, inp);
      if (!h.ok) return galat(h.pesan);
      await catatAudit(db, oleh, "pelatihan_koreksi_tambah_peserta", { kegiatan_id: kegiatanId, ...inp, koreksi_id: h.id });
      return NextResponse.json({ ok: true, id: h.id, ringkas: h.ringkas });
    }
    if (b.aksi === "urungkan") {
      const id = angka(b.id);
      const h = await urungkanKoreksi(db, kegiatanId, id, oleh);
      if (!h.ok) return galat(h.pesan);
      await catatAudit(db, oleh, "pelatihan_koreksi_urungkan", { kegiatan_id: kegiatanId, koreksi_id: id });
      return NextResponse.json({ ok: true, ringkas: h.ringkas });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
