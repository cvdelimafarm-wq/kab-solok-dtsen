// app/api/sigap/pelatihan/monitoring/route.ts
//
// (2 Nov 2026) Tab Monitoring: progres menurut hierarki.
// Siapa melihat siapa: panitia -> semua; instruktur -> kelasnya; peserta (korwil/PML/PPL) -> dirinya + bawahan (lib/hierarkiPelatihan.ts).
// GET (Bearer sesi; ?kegiatan=ID) -> { kegiatan_id, jenis, ringkas, hierarki_tersedia, aturan_versi, baris:[{akun_id,nama,peran,kedalaman,diri,kelas,undangan,pretest,posttest,hadir,nilai_akhir?,kelulusan?}], ringkasan:{...,kelulusan?} }
// (2 Nov 2026) Aturan versi 2: skor pretest/posttest = nilai percobaan PERTAMA; nilai_akhir dan kelulusan (lulus bila > ambang) hanya FLAG untuk laporan.

import { NextRequest, NextResponse } from "next/server";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";
import { izinAkun } from "@/lib/sigapAkses";
import { cakupanLihat, ringkasCakupan } from "@/lib/hierarkiPelatihan";
import { muatAturan } from "@/lib/sigapAturanDb";
import { hitungKelulusan, type StatusKelulusan } from "@/lib/sigapAturanTes";
import { muatNilaiAkhir } from "@/lib/sigapNilai";
import { muatProgres, muatSimpulHierarki, tentukanPengguna } from "@/lib/sigapPelatihanBaruDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const { izin } = await izinAkun(db, akun.id);
    const pengguna = await tentukanPengguna(db, kegiatanId, akun.id, izin);
    if (pengguna.jenis === "peserta" && !(await pesertaPelatihan(db, akun.id, kegiatanId))) return galat("Anda bukan peserta pelatihan ini.", 403);

    const { tersedia, simpul } = await muatSimpulHierarki(db, kegiatanId);
    const cakupan = cakupanLihat(pengguna, simpul);
    const progres = await muatProgres(db, kegiatanId, cakupan.map((b) => b.simpul.akun_id));
    const aturan = await muatAturan(db, kegiatanId);
    // aturan versi 2: nilai pertama + nilai akhir + kelulusan (tahan galat: bila gagal dihitung, kolom tambahan saja yang kosong)
    let nilai: Awaited<ReturnType<typeof muatNilaiAkhir>> | null = null;
    if (aturan.versi === 2) {
      try {
        nilai = await muatNilaiAkhir(db, kegiatanId, cakupan.map((b) => b.simpul.akun_id), aturan);
      } catch {
        nilai = null;
      }
    }
    const baris = cakupan.map((b) => {
      const p = progres.get(b.simpul.akun_id)!;
      const n = nilai?.per.get(b.simpul.akun_id);
      const pre = n && p.pretest.status === "selesai" ? { ...p.pretest, skor: n.pretest } : p.pretest;
      const post = n && p.posttest.status === "selesai" ? { ...p.posttest, skor: n.posttest } : p.posttest;
      const tambahan = n ? { nilai_akhir: n.akhir, kelulusan: (n.status_lulus ?? "belum_dinilai") as StatusKelulusan } : {};
      return { akun_id: b.simpul.akun_id, nama: b.simpul.nama, peran: b.simpul.peran, kedalaman: b.kedalaman, diri: b.diri, kelas: b.simpul.kelas, undangan: p.undangan, pretest: pre, posttest: post, hadir: p.hadir, ...tambahan };
    });
    const hitung = (f: (r: (typeof baris)[number]) => boolean) => baris.filter(f).length;
    return NextResponse.json({
      kegiatan_id: kegiatanId,
      jenis: pengguna.jenis,
      ringkas: ringkasCakupan(cakupan),
      hierarki_tersedia: tersedia,
      aturan_versi: aturan.versi,
      baris,
      ringkasan: {
        total: baris.length,
        undangan_terima: hitung((r) => r.undangan === "terima"),
        undangan_tolak: hitung((r) => r.undangan === "tolak"),
        pretest_selesai: hitung((r) => r.pretest.status === "selesai"),
        posttest_selesai: hitung((r) => r.posttest.status === "selesai"),
        hadir: hitung((r) => r.hadir),
        ...(nilai ? { kelulusan: hitungKelulusan(baris.map((r) => ("kelulusan" in r ? (r.kelulusan as StatusKelulusan) : "belum_dinilai"))) } : {}),
      },
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
