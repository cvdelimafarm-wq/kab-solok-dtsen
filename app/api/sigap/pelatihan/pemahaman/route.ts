// app/api/sigap/pelatihan/pemahaman/route.ts
//
// (14 Nov 2026) Templat monitoring pemahaman, langkah 3: data mode Hari H dan Evaluasi untuk tes pelatihan.
// GET (Bearer sesi; ?kegiatan=ID&jenis=pretest|posttest) -> HasilPemahamanTes (lib/pemahamanTes.ts) + { kegiatan_id, jenis, tes:{judul,buka_at,tutup_at,aktif}, sekarang, cakupan }
// Hak lihat ditegakkan di SERVER (putusan Ketua Tim 14 Nov): panitia semua; instruktur kelasnya; PML dirinya + timnya (hierarki satu sumber);
// peserta hanya dirinya. Nama, jawaban, dan siapa yang salah hanya untuk orang dalam cakupan; statistik soal juga dihitung dari cakupan itu.

import { NextRequest, NextResponse } from "next/server";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, muatSemuaSoal, pesertaPelatihan } from "@/lib/sigapTesDb";
import { izinAkun } from "@/lib/sigapAkses";
import { cakupanLihat, ringkasCakupan } from "@/lib/hierarkiPelatihan";
import { TUBUH_GERBANG } from "@/lib/gerbangUndangan";
import { muatSimpulHierarki, periksaGerbang, tentukanPengguna } from "@/lib/sigapPelatihanBaruDb";
import { nilaiLulus } from "@/lib/sigapTes";
import { hitungPemahamanTes, type ArsipPertamaMasuk, type SesiTesMasuk } from "@/lib/pemahamanTes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const JENIS = new Set(["pretest", "posttest"]);

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const jenis = req.nextUrl.searchParams.get("jenis") ?? "pretest";
    if (!JENIS.has(jenis)) return galat("Jenis tes tidak dikenal.");
    const { izin } = await izinAkun(db, akun.id);
    const pengguna = await tentukanPengguna(db, kegiatanId, akun.id, izin);
    if (pengguna.jenis === "peserta" && !(await pesertaPelatihan(db, akun.id, kegiatanId))) return galat("Anda bukan peserta pelatihan ini.", 403);
    if (pengguna.jenis === "peserta" && (await periksaGerbang(db, kegiatanId, akun.id)) !== "boleh") return NextResponse.json(TUBUH_GERBANG, { status: 403 });

    const { simpul } = await muatSimpulHierarki(db, kegiatanId);
    const cakupan = cakupanLihat(pengguna, simpul);
    const namaPer = new Map(simpul.map((s) => [s.akun_id, s.nama]));
    const peserta = cakupan.map((b) => ({
      akun_id: b.simpul.akun_id,
      nama: b.simpul.nama,
      kelas: b.simpul.kelas,
      tim: b.simpul.atasan_akun_id != null ? (namaPer.get(b.simpul.atasan_akun_id) ?? null) : null,
      peran: b.simpul.peran,
    }));
    const ids = peserta.map((p) => p.akun_id);

    const { data: keg } = await db.from("sigap_kegiatan").select("nama").eq("id", kegiatanId).maybeSingle();
    const kegiatanNama = (keg as { nama?: string } | null)?.nama ?? `Pelatihan ${kegiatanId}`;
    const { data: tesRows } = await db.from("sigap_tes").select("id, jenis, judul, buka_at, tutup_at, aktif, nilai_lulus").eq("kegiatan_id", kegiatanId).in("jenis", ["pretest", "posttest"]);
    const tesPer = new Map(((tesRows ?? []) as { id: number; jenis: string; judul: string; buka_at: string | null; tutup_at: string | null; aktif: boolean; nilai_lulus: number | null }[]).map((t) => [t.jenis, t]));
    const tes = tesPer.get(jenis);
    if (!tes) return NextResponse.json({ kegiatan_id: kegiatanId, jenis, tes: null, sekarang: new Date().toISOString(), cakupan: ringkasCakupan(cakupan), pemahaman: null });

    const bacaSesi = async (tesId: number): Promise<SesiTesMasuk[]> => {
      const out: SesiTesMasuk[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await db
          .from("sigap_tes_sesi")
          .select("akun_id, mulai_at, batas_at, selesai_at, jawaban, jawaban_waktu, skor, skor_awal, skor_terbaik, percobaan")
          .eq("tes_id", tesId)
          .in("akun_id", ids.slice(i, i + 200));
        for (const r of (data ?? []) as Record<string, unknown>[])
          out.push({
            akun_id: Number(r.akun_id),
            mulai_at: (r.mulai_at as string | null) ?? null,
            batas_at: (r.batas_at as string | null) ?? null,
            selesai_at: (r.selesai_at as string | null) ?? null,
            jawaban: (r.jawaban as Record<string, string> | null) ?? null,
            jawaban_waktu: r.jawaban_waktu,
            skor: r.skor == null ? null : Number(r.skor),
            skor_awal: r.skor_awal == null ? null : Number(r.skor_awal),
            skor_terbaik: r.skor_terbaik == null ? null : Number(r.skor_terbaik),
            percobaan: Number(r.percobaan ?? 1),
          });
      }
      return out;
    };

    const [soal, sesi] = await Promise.all([muatSemuaSoal(db, tes.id), bacaSesi(tes.id)]);
    // percobaan pertama yang sudah diarsipkan (peserta yang mengulang)
    const arsip: ArsipPertamaMasuk[] = [];
    const ulang = sesi.filter((s) => s.percobaan > 1).map((s) => s.akun_id);
    for (let i = 0; i < ulang.length; i += 200) {
      const q = (kolom: string) => db.from("sigap_tes_sesi_arsip").select(kolom).eq("tes_id", tes.id).eq("percobaan", 1).in("akun_id", ulang.slice(i, i + 200));
      let r = await q("akun_id, jawaban, jawaban_waktu, mulai_at, selesai_at, skor");
      if (r.error) r = await q("akun_id, jawaban, mulai_at, selesai_at, skor"); // SQL 20261114y belum dijalankan
      for (const a of (r.data ?? []) as unknown as Record<string, unknown>[])
        arsip.push({ akun_id: Number(a.akun_id), jawaban: (a.jawaban as Record<string, string> | null) ?? null, jawaban_waktu: a.jawaban_waktu, mulai_at: (a.mulai_at as string | null) ?? null, selesai_at: (a.selesai_at as string | null) ?? null, skor: a.skor == null ? null : Number(a.skor) });
    }
    // posttest dibanding pretest (nilai pertama)
    let pembanding: Map<number, number> | undefined;
    const pre = tesPer.get("pretest");
    if (jenis === "posttest" && pre) {
      pembanding = new Map();
      for (const s of await bacaSesi(pre.id)) {
        const v = s.skor_awal ?? (s.percobaan === 1 && s.selesai_at ? s.skor : null);
        if (v !== null) pembanding.set(s.akun_id, v);
      }
    }

    const pemahaman = hitungPemahamanTes({
      jenis,
      soal: soal.filter((q) => q.aktif !== false).map((q) => ({ nomor: q.nomor, teks: q.teks, opsi: q.opsi, kunci: q.kunci, topik: q.topik ?? null, bobot: q.bobot })),
      sesi,
      arsipPertama: arsip,
      peserta,
      nilaiLulus: nilaiLulus(tes),
      nowMs: Date.now(),
      pembanding,
    });
    return NextResponse.json({
      kegiatan_id: kegiatanId,
      kegiatan_nama: kegiatanNama,
      jenis,
      tes: { judul: tes.judul, buka_at: tes.buka_at, tutup_at: tes.tutup_at, aktif: tes.aktif },
      sekarang: new Date().toISOString(),
      cakupan: ringkasCakupan(cakupan),
      peran_pemantau: pengguna.jenis,
      pemahaman,
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
