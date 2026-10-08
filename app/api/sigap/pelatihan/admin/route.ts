// app/api/sigap/pelatihan/admin/route.ts
//
// (7 Okt 2026) SIGAP > Pelatihan -- admin: unggah soal (template Excel), atur jadwal, monitoring peserta.
// Izin menu `pelatihan.kelola` (lihat = monitoring; kelola = soal & jadwal), lingkup kegiatan.
// Semua aksi tulis dicatat di sigap_audit.
//
// GET ?bagian=ringkas                  -> tes (jadwal, jumlah soal, jumlah sesi) + izin saya
// GET ?bagian=soal&jenis=pretest       -> soal lengkap dgn kunci (izin kelola)
// GET ?bagian=monitoring               -> peserta x (pretest, posttest), statistik, analisis per soal
// POST {aksi:"simpan_soal", jenis, soal:[{nomor,teks,opsi:[{kode,teks}],kunci,bobot}]}
// POST {aksi:"atur_jadwal", jenis, buka_at, tutup_at, durasi_menit, judul?, aktif?}

import { NextRequest, NextResponse } from "next/server";
import type { Db } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import {
  DAFTAR_JENIS_TES,
  bersihkanJawaban,
  jenisTesValid,
  statusTes,
  validasiSoalJson,
  type JenisTes,
  type SesiBaris,
  type SoalLengkap,
  type StatusTes,
  type TesBaris,
} from "@/lib/sigapTes";
import { FILTER_BUKAN_ADMINISTRASI, KOLOM_SESI_PUBLIK, akunDariRequest, dbAdmin, finalisasiBilaKedaluwarsa, idKegiatanPelatihan, jumlahSoal, muatSoal, muatTes, muatTesDaftar } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

/** Waktu dari klien: ISO berzona, atau "YYYY-MM-DDTHH:mm" (dianggap WIB). */
function bacaWaktu(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s.length === 16 ? `${s}:00` : s}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type StatusPeserta = StatusTes | "belum_mulai";

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return galat("Tidak punya izin membuka menu ini.", 403);
    const bisaKelola = boleh(izin, "pelatihan.kelola", "kelola", kegiatanId);
    const bagian = req.nextUrl.searchParams.get("bagian") ?? "ringkas";
    const sekarang = new Date();
    const daftar = await muatTesDaftar(db, kegiatanId);

    if (bagian === "ringkas") {
      const nSoal = await jumlahSoal(db, daftar.map((t) => t.id));
      const { data: sesi } = await db.from("sigap_tes_sesi").select("tes_id").in("tes_id", daftar.map((t) => t.id).concat([-1])).limit(5000);
      const nSesi = new Map<number, number>();
      for (const r of sesi ?? []) nSesi.set(r.tes_id as number, (nSesi.get(r.tes_id as number) ?? 0) + 1);
      return NextResponse.json({
        nama: akun.nama,
        sekarang: sekarang.toISOString(),
        boleh_kelola: bisaKelola,
        tes: daftar.map((t) => ({ ...t, jumlah_soal: nSoal.get(t.id) ?? 0, jumlah_sesi: nSesi.get(t.id) ?? 0 })),
      });
    }

    if (bagian === "soal") {
      if (!bisaKelola) return galat("Hanya pengelola yang boleh melihat kunci jawaban.", 403);
      const jenis = req.nextUrl.searchParams.get("jenis");
      if (!jenisTesValid(jenis)) return galat("Jenis tes tidak dikenal.");
      const tes = daftar.find((t) => t.jenis === jenis);
      if (!tes) return galat("Tes tidak ditemukan.", 404);
      return NextResponse.json({ tes, soal: await muatSoal(db, tes.id) });
    }

    if (bagian === "monitoring") return NextResponse.json(await monitoring(db, kegiatanId, daftar, sekarang));

    return galat("Bagian tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

async function monitoring(db: Db, kegiatanId: number, daftar: TesBaris[], sekarang: Date) {
  const { data: pen } = await db.from("sigap_penugasan").select("akun_id, peran, kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(2000);
  const akunIds = (pen ?? []).map((p) => p.akun_id as number);
  const { data: akun } = akunIds.length ? await db.from("sigap_akun").select("id, nama, jenis").in("id", akunIds).limit(2000) : { data: [] as Record<string, unknown>[] };
  const namaAkun = new Map((akun ?? []).map((a) => [a.id as number, { nama: a.nama as string, jenis: a.jenis as string }]));

  const soalPer = new Map<number, SoalLengkap[]>();
  const sesiPer = new Map<number, SesiBaris[]>();
  for (const t of daftar) {
    const soal = await muatSoal(db, t.id);
    soalPer.set(t.id, soal);
    const { data } = await db.from("sigap_tes_sesi").select(KOLOM_SESI_PUBLIK).eq("tes_id", t.id).limit(5000);
    const sesi: SesiBaris[] = [];
    for (const s of (data ?? []) as SesiBaris[]) sesi.push(await finalisasiBilaKedaluwarsa(db, s, soal, sekarang)); // nilai yg kedaluwarsa
    sesiPer.set(t.id, sesi);
  }

  const peserta = (pen ?? [])
    .map((p) => {
      const a = namaAkun.get(p.akun_id as number);
      const tes: Record<string, unknown> = {};
      for (const t of daftar) {
        const soal = soalPer.get(t.id) ?? [];
        const sesi = (sesiPer.get(t.id) ?? []).find((s) => s.akun_id === p.akun_id) ?? null;
        const st = statusTes(t, soal.length, sesi, sekarang);
        const status: StatusPeserta = st === "buka" || st === "belum_buka" ? "belum_mulai" : st;
        tes[t.jenis] = {
          status,
          mulai_at: sesi?.mulai_at ?? null,
          selesai_at: sesi?.selesai_at ?? null,
          batas_at: sesi?.batas_at ?? null,
          terjawab: sesi ? Object.keys(bersihkanJawaban(sesi.jawaban, soal)).length : 0,
          skor: sesi?.skor !== null && sesi?.skor !== undefined ? Number(sesi.skor) : null,
          benar: sesi?.benar ?? null,
          total: sesi?.total ?? null,
          // jawaban per nomor (hanya utk sesi selesai) -> dipakai monitoring utk menghitung ulang "Analisis per soal" sesuai filter
          jawab: sesi?.selesai_at ? bersihkanJawaban(sesi.jawaban, soal) : null,
        };
      }
      return { akun_id: p.akun_id as number, nama: a?.nama ?? "?", jenis_akun: a?.jenis ?? "mitra", peran: p.peran as string, kelas: (p.kelas as number | null) ?? null, tes };
    })
    .sort((x, y) => (x.kelas ?? 9) - (y.kelas ?? 9) || x.nama.localeCompare(y.nama));

  const statistik: Record<string, unknown> = {};
  const analisis: Record<string, unknown> = {};
  for (const t of daftar) {
    const soal = soalPer.get(t.id) ?? [];
    const sesi = sesiPer.get(t.id) ?? [];
    const selesai = sesi.filter((s) => s.selesai_at);
    const skor = selesai.map((s) => Number(s.skor ?? 0));
    const rata = skor.length ? Math.round((skor.reduce((a, b) => a + b, 0) / skor.length) * 100) / 100 : null;
    const mengerjakan = sesi.length - selesai.length;
    statistik[t.jenis] = {
      peserta: peserta.length,
      sudah_mulai: sesi.length,
      mengerjakan,
      selesai: selesai.length,
      belum_mulai: Math.max(0, peserta.length - sesi.length),
      rata_skor: rata,
      tertinggi: skor.length ? Math.max(...skor) : null,
      terendah: skor.length ? Math.min(...skor) : null,
    };
    analisis[t.jenis] = soal.map((s) => {
      const sebaran: Record<string, number> = {};
      s.opsi.forEach((o) => (sebaran[o.kode] = 0));
      let menjawab = 0;
      let benar = 0;
      for (const x of selesai) {
        const j = bersihkanJawaban(x.jawaban, soal)[String(s.nomor)];
        if (j) {
          menjawab++;
          sebaran[j] = (sebaran[j] ?? 0) + 1;
          if (j === s.kunci) benar++;
        }
      }
      return { nomor: s.nomor, teks: s.teks, kunci: s.kunci, bobot: s.bobot, menjawab, benar, persen_benar: selesai.length ? Math.round((benar / selesai.length) * 1000) / 10 : null, sebaran };
    });
  }
  return { sekarang: sekarang.toISOString(), tes: daftar, peserta, statistik, analisis };
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const body = await req.json().catch(() => null);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return galat("Tidak punya izin mengelola soal & jadwal pelatihan.", 403);
    const aksi = String(body?.aksi ?? "");
    const jenis = body?.jenis;
    if (!jenisTesValid(jenis) || !DAFTAR_JENIS_TES.includes(jenis)) return galat("Jenis tes tidak dikenal.");
    const tes = await muatTes(db, kegiatanId, jenis as JenisTes);
    if (!tes) return galat("Tes tidak ditemukan.", 404);

    if (aksi === "simpan_soal") {
      const { count } = await db.from("sigap_tes_sesi").select("id", { count: "exact", head: true }).eq("tes_id", tes.id);
      if ((count ?? 0) > 0) return galat(`Sudah ada ${count} peserta yang memulai ${jenis}. Soal tidak dapat diganti lagi.`, 409);
      const { soal, galat: daftarGalat } = validasiSoalJson(body?.soal);
      if (daftarGalat.length > 0) return NextResponse.json({ error: "Template soal belum benar.", rincian: daftarGalat.slice(0, 50) }, { status: 422 });
      const baris = soal.map((s) => ({ tes_id: tes.id, nomor: s.nomor, teks: s.teks, opsi: s.opsi, kunci: s.kunci, bobot: s.bobot }));
      const { error } = await db.from("sigap_tes_soal").upsert(baris, { onConflict: "tes_id,nomor" });
      if (error) return galat(error.message, 500);
      // soal lama yang nomornya tidak ada di unggahan baru dibuang (ganti penuh)
      const { error: e2 } = await db.from("sigap_tes_soal").delete().eq("tes_id", tes.id).not("nomor", "in", `(${soal.map((s) => s.nomor).join(",")})`);
      if (e2) return galat(e2.message, 500);
      await db.from("sigap_tes").update({ diubah_at: new Date().toISOString() }).eq("id", tes.id);
      await catatAudit(db, akun.id, "pelatihan_simpan_soal", { tes_id: tes.id, jenis, jumlah_soal: soal.length });
      return NextResponse.json({ ok: true, jumlah_soal: soal.length });
    }

    if (aksi === "atur_jadwal") {
      const buka = bacaWaktu(body?.buka_at);
      const tutup = bacaWaktu(body?.tutup_at);
      const durasi = Number(body?.durasi_menit);
      if (!buka || !tutup) return galat("Waktu buka/tutup tidak valid.");
      if (tutup.getTime() <= buka.getTime()) return galat("Waktu tutup harus setelah waktu buka.");
      if (!Number.isInteger(durasi) || durasi < 1 || durasi > 240) return galat("Durasi harus 1–240 menit.");
      const upd: Record<string, unknown> = { buka_at: buka.toISOString(), tutup_at: tutup.toISOString(), durasi_menit: durasi, diubah_at: new Date().toISOString() };
      if (typeof body?.judul === "string" && body.judul.trim()) upd.judul = body.judul.trim().slice(0, 200);
      if (typeof body?.aktif === "boolean") upd.aktif = body.aktif;
      const { error } = await db.from("sigap_tes").update(upd).eq("id", tes.id);
      if (error) return galat(error.message, 500);
      await catatAudit(db, akun.id, "pelatihan_atur_jadwal", { tes_id: tes.id, jenis, sebelum: { buka_at: tes.buka_at, tutup_at: tes.tutup_at, durasi_menit: tes.durasi_menit, aktif: tes.aktif }, sesudah: upd });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
