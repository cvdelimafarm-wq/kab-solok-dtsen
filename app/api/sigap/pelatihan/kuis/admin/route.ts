// app/api/sigap/pelatihan/kuis/admin/route.ts
//
// (7-8 Okt 2026) SIGAP > Pelatihan > Adu Sigap -- sisi ADMIN (Kelola Pelatihan). Satu ruang per kelas (1-4), paralel.
// Izin menu `pelatihan.kelola` (lihat = layar host, pantau live & rekap; kelola = bank soal, pengaturan kelas, Start/Pause/Restart/Stop).
//
// GET ?bagian=daftar                   -> bank kuis (jumlah soal, topik) + pengaturan 4 kelas + riwayat ruang + izin
// GET ?bagian=soal&kuis_id=            -> soal lengkap dgn kunci, topik, penjelasan (izin kelola)
// GET ?bagian=ruang&kelas=N | &ruang_id= -> keadaan layar host
// GET ?bagian=live                     -> ringkasan live keempat kelas (Pantau Live)
// GET ?bagian=rekap&ruang_id=          -> rekap per peserta + statistik per soal (+ kunci, penjelasan)
// POST {aksi:"buat_kuis", judul} | {aksi:"ubah_judul", kuis_id, judul} | {aksi:"hapus_kuis", kuis_id} | {aksi:"duplikat_kuis", kuis_id}
//      {aksi:"simpan_soal", kuis_id, soal:[{nomor,teks,opsi:[{kode,teks}],kunci,detik,topik,penjelasan}]}
//      {aksi:"simpan_kelas", kelas, kuis_id, pengaturan, soal_pilihan, acak_ulang}
//      {aksi:"buka_ruang", kelas} | {aksi:"lanjut", ruang_id, versi} | {aksi:"jeda"|"lanjutkan"|"restart"|"akhiri"|"hapus_ruang", ruang_id}

import { NextRequest, NextResponse } from "next/server";
import type { Db } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { MAKS_SOAL } from "@/lib/sigapTes";
import {
  kelasSah, KELAS_GABUNGAN, TOPIK_UMUM, validasiKuisJson } from "@/lib/sigapKuis";
import {
  akhiriRuang,
  bersihkanCache,
  bukaRuang,
  daftarPeserta,
  jedaRuang,
  keadaanHost,
  konfigKelasSemua,
  lanjutRuang,
  lanjutkanRuang,
  papanRuang,
  restartRuang,
  ringkasanLive,
  ruangById,
  ruangKelas,
  sebaranRuang,
  simpanKonfigKelas,
  soalKuis,
  soalMainRuang,
  type RuangBaris,
  kelasInstruktur,
} from "@/lib/sigapKuisDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const kelasValid = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return kelasSah(n) ? n : null; // (8 Okt 2026) 0 = Semua Kelas (ruang gabungan)
};

type KuisBaris = { id: number; kegiatan_id: number; judul: string; aktif: boolean; dibuat_at: string; diubah_at: string };

async function kuisMilik(db: Db, kuisId: unknown, kegiatanId: number): Promise<KuisBaris | null> {
  const id = Number(kuisId);
  if (!Number.isInteger(id)) return null;
  const { data } = await db.from("sigap_kuis").select("id, kegiatan_id, judul, aktif, dibuat_at, diubah_at").eq("id", id).eq("kegiatan_id", kegiatanId).maybeSingle();
  return (data as KuisBaris | null) ?? null;
}

async function ruangMilik(db: Db, ruangId: unknown, kegiatanId: number): Promise<RuangBaris | null> {
  const id = Number(ruangId);
  if (!Number.isInteger(id)) return null;
  const r = await ruangById(db, id);
  return r && r.kegiatan_id === kegiatanId ? r : null;
}

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
    const bagian = req.nextUrl.searchParams.get("bagian") ?? "daftar";
    const now = new Date();

    if (bagian === "daftar") {
      const { data: kuis } = await db.from("sigap_kuis").select("id, judul, aktif, dibuat_at, diubah_at").eq("kegiatan_id", kegiatanId).order("id");
      const ids = (kuis ?? []).map((k) => Number(k.id));
      const { data: soal } = ids.length ? await db.from("sigap_kuis_soal").select("kuis_id, detik, topik").in("kuis_id", ids).limit(5000) : { data: [] as Record<string, unknown>[] };
      const nSoal = new Map<number, { n: number; detik: number; topik: Record<string, number> }>();
      for (const s of soal ?? []) {
        const e = nSoal.get(Number(s.kuis_id)) ?? { n: 0, detik: 0, topik: {} };
        e.n++;
        e.detik += Number(s.detik);
        const t = String(s.topik ?? "").trim() || TOPIK_UMUM;
        e.topik[t] = (e.topik[t] ?? 0) + 1;
        nSoal.set(Number(s.kuis_id), e);
      }
      const { data: ruang } = await db.from("sigap_kuis_ruang").select("id, kuis_id, kelas, status, soal_ke, dibuka_at, selesai_at").eq("kegiatan_id", kegiatanId).order("id", { ascending: false }).limit(200);
      const rIds = (ruang ?? []).map((r) => Number(r.id));
      const { data: pes } = rIds.length ? await db.from("sigap_kuis_peserta").select("ruang_id").in("ruang_id", rIds).limit(20000) : { data: [] as Record<string, unknown>[] };
      const nPes = new Map<number, number>();
      for (const p of pes ?? []) nPes.set(Number(p.ruang_id), (nPes.get(Number(p.ruang_id)) ?? 0) + 1);
      const { data: pen } = await db.from("sigap_penugasan").select("kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).limit(3000);
      const anggota: Record<number, number> = {};
      for (const p of pen ?? []) if (p.kelas != null) anggota[Number(p.kelas)] = (anggota[Number(p.kelas)] ?? 0) + 1;
      anggota[KELAS_GABUNGAN] = (pen ?? []).length; // (8 Okt 2026) Semua Kelas = seluruh peserta
      return NextResponse.json({
        sekarang: now.toISOString(),
        boleh_kelola: bisaKelola,
        maks_soal: MAKS_SOAL,
        kelas_saya: await kelasInstruktur(db, kegiatanId, akun.id),
        kuis: (kuis ?? []).map((k) => ({ ...k, jumlah_soal: nSoal.get(Number(k.id))?.n ?? 0, total_detik: nSoal.get(Number(k.id))?.detik ?? 0, topik: nSoal.get(Number(k.id))?.topik ?? {} })),
        kelas: (await konfigKelasSemua(db, kegiatanId)).map((k) => ({ ...k, anggota: anggota[k.kelas] ?? 0 })),
        ruang: (ruang ?? []).map((r) => ({ ...r, jumlah_peserta: nPes.get(Number(r.id)) ?? 0 })),
      });
    }

    if (bagian === "soal") {
      if (!bisaKelola) return galat("Hanya pengelola yang boleh melihat kunci jawaban.", 403);
      const kuis = await kuisMilik(db, req.nextUrl.searchParams.get("kuis_id"), kegiatanId);
      if (!kuis) return galat("Kuis tidak ditemukan.", 404);
      bersihkanCache(`soal:${kuis.id}`);
      return NextResponse.json({ kuis, soal: await soalKuis(db, kuis.id) });
    }

    if (bagian === "ruang") {
      const rid = req.nextUrl.searchParams.get("ruang_id");
      const kelas = kelasValid(req.nextUrl.searchParams.get("kelas"));
      const ruang = rid ? await ruangMilik(db, rid, kegiatanId) : kelas !== null ? await ruangKelas(db, kegiatanId, kelas) : null;
      if (!ruang) return NextResponse.json({ ada: false, sekarang: now.toISOString(), boleh_kelola: bisaKelola });
      return NextResponse.json({ ada: true, boleh_kelola: bisaKelola, ...(await keadaanHost(db, ruang, now)) });
    }

    if (bagian === "live") {
      return NextResponse.json({ boleh_kelola: bisaKelola, ...(await ringkasanLive(db, kegiatanId, now)) });
    }

    if (bagian === "rekap") {
      const ruang = await ruangMilik(db, req.nextUrl.searchParams.get("ruang_id"), kegiatanId);
      if (!ruang) return galat("Ruang tidak ditemukan.", 404);
      bersihkanCache(`papan:${ruang.id}:`);
      bersihkanCache(`sebaran:${ruang.id}:`);
      bersihkanCache(`peserta:${ruang.id}`);
      const [soal, papan, sebaran, ikut, kuis] = await Promise.all([soalMainRuang(db, ruang), papanRuang(db, ruang.id, ruang.versi), sebaranRuang(db, ruang.id, ruang.versi), daftarPeserta(db, ruang.id), db.from("sigap_kuis").select("judul").eq("id", ruang.kuis_id).maybeSingle()]);
      // (8 Okt 2026) ruang Semua Kelas (kelas 0): daftar seluruh peserta pelatihan, tidak difilter kelas
      let qPen = db.from("sigap_penugasan").select("akun_id, peran, kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true);
      if (ruang.kelas !== KELAS_GABUNGAN) qPen = qPen.eq("kelas", ruang.kelas);
      const { data: pen } = await qPen.limit(2000);
      const ids = Array.from(new Set((pen ?? []).map((p) => Number(p.akun_id)).concat(ikut.map((p) => p.akun_id))));
      const { data: ak } = ids.length ? await db.from("sigap_akun").select("id, nama, jenis").in("id", ids).limit(2000) : { data: [] as Record<string, unknown>[] };
      const infoAkun = new Map((ak ?? []).map((a) => [Number(a.id), { nama: String(a.nama), jenis: String(a.jenis) }]));
      const infoPen = new Map((pen ?? []).map((p) => [Number(p.akun_id), { peran: String(p.peran), kelas: (p.kelas as number | null) ?? null }]));
      const poinPer = new Map(papan.map((p) => [p.akun_id, p]));
      const peserta = ids
        .map((id) => {
          const a = infoAkun.get(id);
          const p = poinPer.get(id);
          const t = infoPen.get(id);
          return { akun_id: id, nama: a?.nama ?? "?", jenis_akun: a?.jenis ?? "mitra", peran: t?.peran ?? (a?.jenis ? "Inda/instruktur" : ""), kelas: t?.kelas ?? ruang.kelas, ikut: !!p, poin: p?.poin ?? null, benar: p?.benar ?? null, menjawab: p?.menjawab ?? null, rata_waktu_ms: p?.rata_waktu_ms ?? null, peringkat: p?.peringkat ?? null };
        })
        .sort((a, b) => (a.peringkat ?? 1e9) - (b.peringkat ?? 1e9) || (a.kelas ?? 9) - (b.kelas ?? 9) || a.nama.localeCompare(b.nama));
      return NextResponse.json({
        sekarang: now.toISOString(),
        ruang: { id: ruang.id, kuis_id: ruang.kuis_id, kelas: ruang.kelas, judul: String(kuis.data?.judul ?? "Kuis"), status: ruang.status, dibuka_at: ruang.dibuka_at, selesai_at: ruang.selesai_at },
        jumlah_soal: soal.length,
        peserta,
        soal: soal.map((s) => {
          const x = sebaran[s.nomor] ?? { jumlah: {}, benar: 0, total: 0 };
          const jumlah: Record<string, number> = {};
          s.opsi.forEach((o) => (jumlah[o.kode] = x.jumlah[o.kode] ?? 0));
          return { nomor: s.nomor, teks: s.teks, topik: s.topik, penjelasan: s.penjelasan, kunci: s.kunci, detik: s.detik, opsi: s.opsi, menjawab: x.total, benar: x.benar, persen_benar: ikut.length ? Math.round((x.benar / ikut.length) * 1000) / 10 : null, sebaran: jumlah };
        }),
      });
    }

    return galat("Bagian tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
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
    if (!boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return galat("Tidak punya izin mengelola Kuis Live.", 403);
    const aksi = String(body?.aksi ?? "");
    const now = new Date();
    const judulBersih = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 150) : "");

    if (aksi === "buat_kuis") {
      const judul = judulBersih(body?.judul);
      if (!judul) return galat("Judul kuis wajib diisi.");
      const { data, error } = await db.from("sigap_kuis").insert({ kegiatan_id: kegiatanId, judul, dibuat_oleh: akun.id }).select("id").maybeSingle();
      if (error) return galat(error.message, 500);
      await catatAudit(db, akun.id, "pelatihan_kuis_buat", { kuis_id: data?.id, judul });
      return NextResponse.json({ ok: true, kuis_id: data?.id });
    }

    if (aksi === "ubah_judul") {
      const kuis = await kuisMilik(db, body?.kuis_id, kegiatanId);
      if (!kuis) return galat("Kuis tidak ditemukan.", 404);
      const judul = judulBersih(body?.judul);
      if (!judul) return galat("Judul kuis wajib diisi.");
      const { error } = await db.from("sigap_kuis").update({ judul, diubah_at: now.toISOString() }).eq("id", kuis.id);
      if (error) return galat(error.message, 500);
      bersihkanCache(`kuis:${kuis.id}`);
      await catatAudit(db, akun.id, "pelatihan_kuis_judul", { kuis_id: kuis.id, sebelum: kuis.judul, sesudah: judul });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "hapus_kuis") {
      const kuis = await kuisMilik(db, body?.kuis_id, kegiatanId);
      if (!kuis) return galat("Kuis tidak ditemukan.", 404);
      const { count } = await db.from("sigap_kuis_ruang").select("id", { count: "exact", head: true }).eq("kuis_id", kuis.id).neq("status", "selesai");
      if ((count ?? 0) > 0) return galat("Kuis sedang dimainkan. Akhiri ruangnya dulu.", 409);
      const { error } = await db.from("sigap_kuis").delete().eq("id", kuis.id); // soal, ruang, peserta, jawaban ikut terhapus (cascade)
      if (error) return galat(error.message, 500);
      bersihkanCache("soal:");
      bersihkanCache("kuis:");
      bersihkanCache("ruang:");
      await catatAudit(db, akun.id, "pelatihan_kuis_hapus", { kuis_id: kuis.id, judul: kuis.judul });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "duplikat_kuis") {
      const kuis = await kuisMilik(db, body?.kuis_id, kegiatanId);
      if (!kuis) return galat("Kuis tidak ditemukan.", 404);
      const soal = await soalKuis(db, kuis.id);
      const { data, error } = await db.from("sigap_kuis").insert({ kegiatan_id: kegiatanId, judul: `${kuis.judul} (salinan)`.slice(0, 150), dibuat_oleh: akun.id }).select("id").maybeSingle();
      if (error || !data) return galat(error?.message ?? "Gagal menyalin.", 500);
      if (soal.length) {
        const { error: e2 } = await db.from("sigap_kuis_soal").insert(soal.map((s) => ({ kuis_id: data.id, nomor: s.nomor, teks: s.teks, opsi: s.opsi, kunci: s.kunci, detik: s.detik, topik: s.topik, penjelasan: s.penjelasan })));
        if (e2) return galat(e2.message, 500);
      }
      await catatAudit(db, akun.id, "pelatihan_kuis_duplikat", { dari: kuis.id, kuis_id: data.id });
      return NextResponse.json({ ok: true, kuis_id: data.id });
    }

    if (aksi === "simpan_soal") {
      const kuis = await kuisMilik(db, body?.kuis_id, kegiatanId);
      if (!kuis) return galat("Kuis tidak ditemukan.", 404);
      const { count } = await db.from("sigap_kuis_ruang").select("id", { count: "exact", head: true }).eq("kuis_id", kuis.id);
      if ((count ?? 0) > 0) return galat(`Kuis ini sudah pernah dimainkan (${count} ruang). Soal tidak dapat diganti; salin kuis lalu ubah salinannya.`, 409);
      const { soal, galat: daftarGalat } = validasiKuisJson(body?.soal);
      if (daftarGalat.length > 0) return NextResponse.json({ error: "Template soal belum benar.", rincian: daftarGalat.slice(0, 50) }, { status: 422 });
      if (soal.length === 0) return galat("Tidak ada soal yang terbaca.");
      const baris = soal.map((s) => ({ kuis_id: kuis.id, nomor: s.nomor, teks: s.teks, opsi: s.opsi, kunci: s.kunci, detik: s.detik, topik: s.topik, penjelasan: s.penjelasan }));
      const { error } = await db.from("sigap_kuis_soal").upsert(baris, { onConflict: "kuis_id,nomor" });
      if (error) return galat(error.message, 500);
      const { error: e2 } = await db.from("sigap_kuis_soal").delete().eq("kuis_id", kuis.id).not("nomor", "in", `(${soal.map((s) => s.nomor).join(",")})`);
      if (e2) return galat(e2.message, 500);
      await db.from("sigap_kuis").update({ diubah_at: now.toISOString() }).eq("id", kuis.id);
      bersihkanCache(`soal:${kuis.id}`);
      await catatAudit(db, akun.id, "pelatihan_kuis_simpan_soal", { kuis_id: kuis.id, jumlah_soal: soal.length });
      return NextResponse.json({ ok: true, jumlah_soal: soal.length });
    }

    if (aksi === "simpan_kelas") {
      const kelas = kelasValid(body?.kelas);
      if (kelas === null) return galat("Kelas tidak valid.");
      const kuisId = body?.kuis_id === null || body?.kuis_id === undefined || body?.kuis_id === "" ? null : Number(body.kuis_id);
      if (kuisId !== null && !Number.isInteger(kuisId)) return galat("Kuis tidak valid.");
      const h = await simpanKonfigKelas(db, kegiatanId, kelas, { kuis_id: kuisId, pengaturan: body?.pengaturan, soal_pilihan: body?.soal_pilihan, acak_ulang: body?.acak_ulang === true }, akun.id, now);
      if (!h.ok) return galat(h.error, h.status);
      await catatAudit(db, akun.id, "pelatihan_kuis_atur_kelas", { kelas, kuis_id: kuisId, jumlah: h.konfig.soal_pilihan.length, mode: h.konfig.pengaturan.mode });
      return NextResponse.json({ ok: true, konfig: h.konfig });
    }

    if (aksi === "buka_ruang") {
      const kelas = kelasValid(body?.kelas);
      if (kelas === null) return galat("Kelas tidak valid.");
      const h = await bukaRuang(db, kegiatanId, kelas, akun.id, now);
      if (!h.ok) return galat(h.error, h.status);
      await catatAudit(db, akun.id, "pelatihan_kuis_buka_ruang", { kelas, kuis_id: h.ruang.kuis_id, ruang_id: h.ruang.id });
      return NextResponse.json({ ok: true, ruang_id: h.ruang.id, ...(await keadaanHost(db, h.ruang, now)) });
    }

    if (aksi === "lanjut" || aksi === "jeda" || aksi === "lanjutkan" || aksi === "restart") {
      const ruang = await ruangMilik(db, body?.ruang_id, kegiatanId);
      if (!ruang) return galat("Ruang tidak ditemukan.", 404);
      let h;
      if (aksi === "lanjut") {
        const v = body?.versi === undefined || body?.versi === null ? null : Number(body.versi);
        h = await lanjutRuang(db, ruang.id, v !== null && Number.isInteger(v) ? v : null, now);
      } else if (aksi === "jeda") h = await jedaRuang(db, ruang.id, now);
      else if (aksi === "lanjutkan") h = await lanjutkanRuang(db, ruang.id, now);
      else h = await restartRuang(db, ruang.id);
      if (!h.ok) return galat(h.error, h.status);
      if (h.berubah) await catatAudit(db, akun.id, `pelatihan_kuis_${aksi}`, { ruang_id: ruang.id, kelas: ruang.kelas, status: h.ruang.status, soal_ke: h.ruang.soal_ke });
      return NextResponse.json({ ok: true, berubah: h.berubah, ...(await keadaanHost(db, h.ruang, now)) });
    }

    if (aksi === "akhiri") {
      const ruang = await ruangMilik(db, body?.ruang_id, kegiatanId);
      if (!ruang) return galat("Ruang tidak ditemukan.", 404);
      const r = await akhiriRuang(db, ruang.id, now);
      await catatAudit(db, akun.id, "pelatihan_kuis_akhiri", { ruang_id: ruang.id, kelas: ruang.kelas });
      return NextResponse.json({ ok: true, ...(r ? await keadaanHost(db, r, now) : {}) });
    }

    if (aksi === "hapus_ruang") {
      const ruang = await ruangMilik(db, body?.ruang_id, kegiatanId);
      if (!ruang) return galat("Ruang tidak ditemukan.", 404);
      if (ruang.status !== "selesai") return galat("Stop ruang dulu sebelum dihapus.", 409);
      const { error } = await db.from("sigap_kuis_ruang").delete().eq("id", ruang.id);
      if (error) return galat(error.message, 500);
      bersihkanCache("ruang:");
      await catatAudit(db, akun.id, "pelatihan_kuis_hapus_ruang", { ruang_id: ruang.id, kuis_id: ruang.kuis_id, kelas: ruang.kelas });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
