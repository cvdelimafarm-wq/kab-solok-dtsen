// app/api/sigap/arsip/ambil/route.ts
//
// (7 Nov 2026) Pintu pengambilan nomor untuk dokumen yang dibuat di dalam SIGAP (bukan dari menu Arsip). Tiap dokumen yang bernomor memanggil pintu ini
// dengan izin yang SAMA dengan izin mengurus dokumen itu sendiri; nomor lalu tercatat di buku (menu Arsip).
//
// GET                                                       -> { kode[] aktif, fungsi[], sering[], jenis[] aktif }   (untuk pilihan kode arsip Perka BPS 99/2018; semua akun yang masuk)
// POST { untuk:"st", penugasan_id, tanggal?, kka }            -> { nomor }  (kka wajib: kode arsip menurut isi surat, mis. VS.220 pelatihan petugas, VS.330 pengumpulan data)
//                                                                Surat tugas translok. Izin: Kelola menu `translok.penugasan` pada kegiatannya (sama dengan menyimpan ST).
//                                                              Ditolak bila penugasan sudah punya ST bernomor (tidak menimpa nomor yang ada).
// POST { untuk:"lanjutan", ident, jenis, kunci, tanggal?, kka? } -> { nomor }  Dokumen turunan identifikasi lanjutan (undangan, pengantar, surat tugas/SPK).
//                                                              Izin: hak susun atau hak setuju identifikasi RO itu (keu_boleh ident_susun / ident_setuju).
// Pengambilan idempoten: dokumen yang sama mendapat nomor yang sama selama nomornya belum dibatalkan. Tidak untuk sesi "masuk sebagai".

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { boleh, catatAudit, izinAkun, sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { panggilKeu } from "@/lib/keu/gerbang";
import { ambilNomor, muatSering } from "@/lib/arsip/db";
import { JENIS_ARSIP_LANJUTAN, rujukanLanjutan, rujukanPenugasan } from "@/lib/arsip/nomor";
import { NAMA_DOKUMEN } from "@/lib/keu/lanjutan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const bulat = (x: unknown): number | null => {
  const n = Number(x);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const teks = (x: unknown, maks = 300): string | null => (typeof x === "string" && x.trim() ? x.trim().slice(0, maks) : null);
const tgl = (x: unknown): string | null => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);

function dbServer() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) : null;
}

export async function GET(req: NextRequest) {
  try {
    const db = dbServer();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    if (!sesiLengkapDariHeader(req.headers)) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const [k, f, j, sering] = await Promise.all([
      db.from("arsip_kode").select("kode, nama, fungsi").eq("aktif", true).order("kode").limit(2000),
      db.from("arsip_fungsi").select("kode, nama").order("kode"),
      db.from("arsip_jenis").select("kode, nama, kka_bawaan, format").eq("aktif", true).order("urutan"),
      muatSering(db),
    ]);
    if (k.error || f.error || j.error) return galat("Fitur penomoran belum lengkap: jalankan SQL 20261107c_arsip_penomoran.sql lalu 20261107e_arsip_kka_perka99.sql terlebih dahulu.", 500);
    return NextResponse.json({ kode: k.data ?? [], fungsi: f.data ?? [], sering, jenis: j.data ?? [] });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbServer();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const sesi = sesiLengkapDariHeader(req.headers);
    if (!sesi) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (sesi.aktorId !== null) return galat("Mode masuk-sebagai hanya untuk melihat tampilan; tindakan ini tidak dijalankan.", 403);
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return galat("Permintaan tidak valid.");
    const { data: pelaku } = await db.from("sigap_akun").select("nama").eq("id", sesi.akunId).maybeSingle();
    const nama = (pelaku as { nama?: string } | null)?.nama ?? `Akun ${sesi.akunId}`;

    if (b.untuk === "st") {
      const pid = bulat(b.penugasan_id);
      if (!pid) return galat("Penugasan tidak valid.");
      const { data: pen } = await db.from("sigap_penugasan").select("id, kegiatan_id, akun_id, surat_tugas_id").eq("id", pid).maybeSingle();
      const p = pen as { id: number; kegiatan_id: number; akun_id: number; surat_tugas_id: number | null } | null;
      if (!p) return galat("Penugasan tidak ditemukan.", 404);
      const { izin } = await izinAkun(db, sesi.akunId);
      if (!boleh(izin, "translok.penugasan", "kelola", p.kegiatan_id)) return galat("Tidak punya izin mengelola Surat Tugas.", 403);
      if (p.surat_tugas_id) {
        const { data: st } = await db.from("sigap_surat_tugas").select("nomor_st").eq("id", p.surat_tugas_id).maybeSingle();
        const n = (st as { nomor_st?: string } | null)?.nomor_st;
        if (n) return galat(`Penugasan ini sudah punya Surat Tugas bernomor ${n}. Ubah nomornya langsung bila memang perlu.`, 409);
      }
      const { data: ak } = await db.from("sigap_akun").select("nama").eq("id", p.akun_id).maybeSingle();
      const petugas = (ak as { nama?: string } | null)?.nama ?? `Akun ${p.akun_id}`;
      const r = await ambilNomor(db, { jenis: "st", kka: teks(b.kka, 20), tanggal: tgl(b.tanggal), perihal: `Surat tugas ${petugas}`, kegiatanId: p.kegiatan_id, rujukan: rujukanPenugasan(p.id), akunId: sesi.akunId, nama });
      if (!r.ok) return galat(r.pesan, r.status);
      if (!r.sudah_ada) await catatAudit(db, sesi.akunId, "arsip.ambil", { id: r.id, nomor: r.nomor, jenis: "st", penugasan_id: p.id });
      return NextResponse.json({ ok: true, nomor: r.nomor, urut: r.urut, tahun: r.tahun, kka: r.kka, sudah_ada: r.sudah_ada });
    }

    if (b.untuk === "lanjutan") {
      const ident = bulat(b.ident);
      const jenisDok = String(b.jenis ?? "");
      const kunci = teks(b.kunci, 120);
      if (!ident || !kunci || !(jenisDok in JENIS_ARSIP_LANJUTAN)) return galat("Dokumen tidak valid.");
      const { data: row } = await db.from("keu_ident").select("ro_kode").eq("id", ident).maybeSingle();
      const ro = (row as { ro_kode?: string } | null)?.ro_kode;
      if (!ro) return galat("Identifikasi tidak ditemukan.", 404);
      const [susun, setuju] = await Promise.all([
        panggilKeu<boolean>(db, sesi.akunId, "keu_boleh", { p_kew: "ident_susun", p_ro: ro }),
        panggilKeu<boolean>(db, sesi.akunId, "keu_boleh", { p_kew: "ident_setuju", p_ro: ro }),
      ]);
      if (!((susun.ok && susun.data === true) || (setuju.ok && setuju.data === true))) return galat("Mengambil nomor dokumen hanya untuk ketua tim, admin RO, PPK, atau Tata Usaha RO ini.", 403);
      const jenisArsip = JENIS_ARSIP_LANJUTAN[jenisDok as keyof typeof JENIS_ARSIP_LANJUTAN];
      const namaDok = NAMA_DOKUMEN[jenisDok as keyof typeof NAMA_DOKUMEN] ?? jenisDok;
      const r = await ambilNomor(db, { jenis: jenisArsip, kka: teks(b.kka, 20), tanggal: tgl(b.tanggal), perihal: `${namaDok} (identifikasi ${ident}, ${kunci})`, rujukan: rujukanLanjutan(ident, jenisDok, kunci), akunId: sesi.akunId, nama });
      if (!r.ok) return galat(r.pesan, r.status);
      if (!r.sudah_ada) await catatAudit(db, sesi.akunId, "arsip.ambil", { id: r.id, nomor: r.nomor, jenis: jenisArsip, ident, dokumen: jenisDok, kunci });
      return NextResponse.json({ ok: true, nomor: r.nomor, urut: r.urut, tahun: r.tahun, kka: r.kka, sudah_ada: r.sudah_ada });
    }

    return galat("Jenis permintaan tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
