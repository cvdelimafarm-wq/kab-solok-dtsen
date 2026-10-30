// app/api/portal/qc/admin/route.ts
//
// (26 Okt 2026) QC Pemahaman Petugas -- sisi admin (Kelola Pendataan > tab "QC Pemahaman"). Izin menu `bencana.admin`:
// "lihat" = melihat pengaturan, bank soal, rekap; "kelola" = mengubah. Semua perubahan dicatat di sigap_audit. Tidak ada penghapusan permanen
// (soal dimatikan lewat `aktif`; undian ulang hanya bila belum ada satu pun jawaban pada hari itu).
// (29 Okt 2026) QC berjalan PER KEGIATAN: semua aksi menerima `k` (id kegiatan; GET lewat ?k=, POST lewat body.k). Tanpa `k` = Pendataan Pascabencana (id 1).
// GET [?k=<kegiatan>][&tanggal=YYYY-MM-DD]           -> { boleh_kelola, kegiatan_id, kegiatan_nama, pengaturan, soal[], peserta, hari, hari_ada[], hari_berlaku, soal_hari, rekap[] }
// GET ?k=<kegiatan>&dari=YYYY-MM-DD&sampai=YYYY-MM-DD -> { rentang: DataRentang } matriks petugas x hari (maks 62 hari); ringan, tanpa bank soal
//   (30 Okt 2026) filter tanggal: ?tanggal= memilih satu hari, ?dari=&sampai= memilih rentang.
// GET ?k=<kegiatan>&semua=1                           -> { semua: DataSemua } rekap SEMUA hari ber-soal: rata-rata nilai per percobaan (P1..Pn) tiap petugas
// POST {aksi:"pengaturan", data:{...}}               -> simpan pengaturan
// POST {aksi:"soal", data:{id,paket,...}}            -> simpan (baru/ubah) satu soal
// POST {aksi:"soal_aktif", id, aktif}                -> hidup/matikan satu soal
// POST {aksi:"impor", soal:[...]}                    -> impor banyak soal sekaligus
// POST {aksi:"undi_ulang", tanggal}                  -> undi ulang set hari itu (hanya bila belum ada jawaban)
// POST {aksi:"susulan", tanggal, susulan:boolean}   -> tandai/cabut hari SUSULAN (terlewat jam batas: tanpa label terlambat, tetap memblokir)
// POST {aksi:"contoh_push", jenis:"rilis"|"ingat"|"rekap"} -> kirim CONTOH notifikasi ke perangkat admin sendiri

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatQc, bacaKegiatan, dataAdmin, imporSoal, kirimContoh, rentangAdmin, semuaAdmin, simpanPengaturan, simpanSoal, tandaiSusulan, ubahAktifSoal, undiUlang } from "@/lib/portal/qc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function tangani(tag: string, e: unknown): NextResponse {
  if (e instanceof GalatQc) return galat(e.message, e.status);
  return galatServer(tag, e);
}

// (30 Okt 2026) izin bencana.admin diperiksa menurut LINGKUP KEGIATAN yang diminta: pemegang peran dengan lingkup SPDT NTP tidak bisa membuka QC survei lain.
async function siapkan(req: NextRequest, tulis: boolean, keg: number) {
  const db = dbPortal();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  if (tulis && aktorDariHeader(req.headers)) return { err: galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengubah pengaturan.', 403) } as const;
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "bencana.admin", tulis ? "kelola" : "lihat", keg)) return { err: galat("Tidak punya akses admin pendataan untuk survei ini.", 403) } as const;
  return { db, akun, bisaKelola: boleh(izin, "bencana.admin", "kelola", keg) } as const;
}

export async function GET(req: NextRequest) {
  try {
    const keg = bacaKegiatan(req.nextUrl.searchParams.get("k"));
    const p = await siapkan(req, false, keg);
    if ("err" in p) return p.err;
    const tgl = req.nextUrl.searchParams.get("tanggal");
    const tanggal = tgl && /^\d{4}-\d{2}-\d{2}$/.test(tgl) ? tgl : null;
    const dari = req.nextUrl.searchParams.get("dari");
    const sampai = req.nextUrl.searchParams.get("sampai");
    if (req.nextUrl.searchParams.get("semua") === "1") return NextResponse.json({ semua: await semuaAdmin(p.db, keg) });
    if (dari || sampai) return NextResponse.json({ rentang: await rentangAdmin(p.db, keg, dari, sampai) });
    return NextResponse.json({ boleh_kelola: p.bisaKelola, ...(await dataAdmin(p.db, keg, tanggal)) });
  } catch (e) {
    return tangani("[api/portal/qc/admin GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const keg = bacaKegiatan(body?.k);
    const p = await siapkan(req, true, keg);
    if ("err" in p) return p.err;
    const { db, akun } = p;
    const aksi = String(body?.aksi ?? "");

    if (aksi === "pengaturan") {
      const hasil = await simpanPengaturan(db, keg, body?.data, akun.nama);
      await catatAudit(db, akun.id, "qc_pengaturan", { kegiatan: keg, data: body?.data });
      return NextResponse.json({ ok: true, pengaturan: hasil });
    }
    if (aksi === "soal") {
      const hasil = await simpanSoal(db, keg, body?.data);
      await catatAudit(db, akun.id, "qc_soal_simpan", { kegiatan: keg, id: (body?.data as { id?: unknown } | undefined)?.id });
      return NextResponse.json({ ok: true, ...(hasil as object) });
    }
    if (aksi === "soal_aktif") {
      if (typeof body?.id !== "string" || typeof body?.aktif !== "boolean") return galat("Permintaan tidak valid.");
      await ubahAktifSoal(db, keg, body.id, body.aktif);
      await catatAudit(db, akun.id, "qc_soal_aktif", { kegiatan: keg, id: body.id, aktif: body.aktif });
      return NextResponse.json({ ok: true });
    }
    if (aksi === "impor") {
      const hasil = await imporSoal(db, keg, body?.soal);
      await catatAudit(db, akun.id, "qc_soal_impor", { kegiatan: keg, ...hasil });
      return NextResponse.json({ ok: true, ...hasil });
    }
    if (aksi === "undi_ulang") {
      const ids = await undiUlang(db, keg, String(body?.tanggal ?? ""));
      await catatAudit(db, akun.id, "qc_undi_ulang", { kegiatan: keg, tanggal: body?.tanggal, jumlah: ids.length });
      return NextResponse.json({ ok: true, soal_ids: ids });
    }
    if (aksi === "susulan") {
      if (typeof body?.susulan !== "boolean") return galat("Permintaan tidak valid.");
      const at = await tandaiSusulan(db, keg, String(body?.tanggal ?? ""), body.susulan);
      await catatAudit(db, akun.id, "qc_susulan", { kegiatan: keg, tanggal: body?.tanggal, susulan: body.susulan });
      return NextResponse.json({ ok: true, susulan_at: at });
    }
    if (aksi === "contoh_push") {
      const jenis = body?.jenis;
      if (jenis !== "rilis" && jenis !== "ingat" && jenis !== "rekap") return galat("Jenis contoh tidak dikenal.");
      return NextResponse.json({ ok: true, ...(await kirimContoh(db, keg, akun.id, jenis)) });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return tangani("[api/portal/qc/admin POST]", e);
  }
}
