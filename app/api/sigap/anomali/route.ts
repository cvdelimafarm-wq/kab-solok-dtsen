// app/api/sigap/anomali/route.ts
//
// (31 Okt 2026) Lingkar anomali petugas: impor anomali (template SIGAP) -> penugasan otomatis ke petugas -> konfirmasi petugas -> rekap.
// Tabel: sigap_anomali_batch / sigap_anomali_temuan / sigap_anomali_alias (SQL 20261031o). TIDAK menyentuh kp_anomali_*.
// Lihat lib/sigapAnomali.ts untuk pemetaan kolom, pencocokan nama, dan validasi.
//
// GET  ?mode=saya                      -> temuan milik akun yang masuk (semua survei) + ringkasan
// GET  ?mode=tim                       -> temuan petugas yang PML-nya akun ini (pml_akun_id), hanya baca
// GET  ?mode=admin&kegiatan=ID         -> rekap kegiatan (admin: izin translok.penugasan level kelola pada kegiatan itu): temuan, antrean pencocokan, batch
// GET  ?mode=akun&kegiatan=ID          -> daftar akun aktif (untuk memilih saat mencocokkan), admin saja
// POST { aksi: "impor", kegiatan_id, sumber, fase, periode?, nama_berkas?, baris: [...] }   admin
// POST { aksi: "cocokkan", kegiatan_id, nama_asal, akun_id, simpan_alias? }                 admin
// POST { aksi: "konfirmasi", id, penyebab, catatan? }                                       petugas pemilik temuan

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun, type PetaIzin } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin } from "@/lib/sigapTesDb";
import { bersihkanBarisAnomali, cocokkanNama, kunciTemuan, normNama, pmlTerbanyak, ringkasTemuan, validasiKonfirmasi, type Kandidat } from "@/lib/sigapAnomali";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (error: string, status = 400) => NextResponse.json({ error }, { status });
const MENU_ADMIN = "translok.penugasan";
const bolehAdmin = (izin: PetaIzin, kegiatanId: number) => boleh(izin, MENU_ADMIN, "kelola", kegiatanId);
const angka = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
type Db = NonNullable<ReturnType<typeof dbAdmin>>;

async function namaAkun(db: Db, ids: number[]): Promise<Map<number, string>> {
  const u = Array.from(new Set(ids.filter((x) => x > 0)));
  const peta = new Map<number, string>();
  for (let i = 0; i < u.length; i += 200) {
    const { data } = await db.from("sigap_akun").select("id, nama").in("id", u.slice(i, i + 200));
    for (const r of (data ?? []) as { id: number; nama: string }[]) peta.set(Number(r.id), String(r.nama));
  }
  return peta;
}

async function akunAktif(db: Db): Promise<Kandidat[]> {
  const { data } = await db.from("sigap_akun").select("id, nama").eq("aktif", true).limit(5000);
  return ((data ?? []) as { id: number; nama: string }[]).map((r) => ({ id: Number(r.id), nama: String(r.nama) }));
}

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariRequest(req, db);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const q = req.nextUrl.searchParams;
  const mode = q.get("mode") ?? "saya";
  const KOLOM = "id, batch_id, kegiatan_id, akun_id, pml_akun_id, nama_asal, kode_temuan, id_sampel, periode, fase, keterangan, rincian, status, penyebab, catatan, dikonfirmasi_at, dibuat_at";

  if (mode === "saya" || mode === "tim") {
    const kolomAkun = mode === "saya" ? "akun_id" : "pml_akun_id";
    const { data } = await db.from("sigap_anomali_temuan").select(KOLOM).eq(kolomAkun, akun.id).neq("status", "perlu_cocok").order("status", { ascending: false }).order("id", { ascending: false }).limit(1000);
    const t = (data ?? []) as Record<string, unknown>[];
    const kegIds = Array.from(new Set(t.map((x) => Number(x.kegiatan_id))));
    const kodes = Array.from(new Set(t.map((x) => String(x.kode_temuan))));
    const [{ data: keg }, { data: kat }, nama] = await Promise.all([
      kegIds.length ? db.from("sigap_kegiatan").select("id, nama").in("id", kegIds) : Promise.resolve({ data: [] }),
      kodes.length ? db.from("kp_anomali_pengaturan").select("kode, kelompok, rekomendasi, catatan").in("kode", kodes) : Promise.resolve({ data: [] }),
      namaAkun(db, t.map((x) => Number(x.akun_id))),
    ]);
    const namaKeg = new Map(((keg ?? []) as { id: number; nama: string }[]).map((k) => [Number(k.id), String(k.nama)]));
    const katalog = new Map(((kat ?? []) as { kode: string; kelompok: string | null; rekomendasi: string | null; catatan: string | null }[]).map((k) => [k.kode, k]));
    return NextResponse.json({
      ringkas: ringkasTemuan(t.map((x) => ({ status: String(x.status) }))),
      temuan: t.map((x) => ({ ...x, kegiatan_nama: namaKeg.get(Number(x.kegiatan_id)) ?? "", petugas_nama: nama.get(Number(x.akun_id)) ?? "", kelompok: katalog.get(String(x.kode_temuan))?.kelompok ?? null, rekomendasi: katalog.get(String(x.kode_temuan))?.rekomendasi ?? null, makna: katalog.get(String(x.kode_temuan))?.catatan ?? null })),
    });
  }

  const kegId = angka(q.get("kegiatan"));
  if (!kegId) return galat("Kegiatan tidak sah.");
  const { izin } = await izinAkun(db, akun.id);
  if (!bolehAdmin(izin, kegId)) return galat("Anda tidak punya izin mengelola anomali kegiatan ini.", 403);

  if (mode === "akun") return NextResponse.json({ akun: await akunAktif(db) });

  if (mode === "admin") {
    const [{ data: tm }, { data: bt }, { data: kg }, alias] = await Promise.all([
      db.from("sigap_anomali_temuan").select(KOLOM).eq("kegiatan_id", kegId).order("id", { ascending: false }).limit(5000),
      db.from("sigap_anomali_batch").select("id, sumber, fase, periode, nama_berkas, total, cocok, perlu_cocok, duplikat, dibuat_at, diimpor_oleh").eq("kegiatan_id", kegId).order("id", { ascending: false }).limit(50),
      db.from("sigap_kegiatan").select("id, nama").eq("id", kegId).maybeSingle(),
      Promise.resolve(null),
    ]);
    void alias;
    const t = (tm ?? []) as Record<string, unknown>[];
    const nama = await namaAkun(db, t.flatMap((x) => [Number(x.akun_id), Number(x.pml_akun_id)]));
    // antrean pencocokan: nama asal yang belum ketemu, dikelompokkan, dengan saran dari pencocokan nama
    const antre = new Map<string, number>();
    for (const x of t) if (x.status === "perlu_cocok") antre.set(String(x.nama_asal), (antre.get(String(x.nama_asal)) ?? 0) + 1);
    const semuaAkun = antre.size > 0 ? await akunAktif(db) : [];
    const perluCocok = Array.from(antre.entries()).map(([nama_asal, jumlah]) => {
      const h = cocokkanNama(nama_asal, semuaAkun);
      const ids = h.status === "ambigu" ? h.kandidat : h.status === "tidak" ? h.saran : [];
      return { nama_asal, jumlah, alasan: h.status === "ambigu" ? "ambigu" : "tidak_ketemu", usulan: ids.map((id) => ({ id, nama: semuaAkun.find((a) => a.id === id)?.nama ?? String(id) })) };
    });
    return NextResponse.json({
      kegiatan: kg ?? { id: kegId, nama: `Kegiatan ${kegId}` },
      ringkas: ringkasTemuan(t.map((x) => ({ status: String(x.status) }))),
      temuan: t.map((x) => ({ ...x, petugas_nama: x.akun_id ? (nama.get(Number(x.akun_id)) ?? "") : "", pml_nama: x.pml_akun_id ? (nama.get(Number(x.pml_akun_id)) ?? "") : "" })),
      perlu_cocok: perluCocok.sort((a, b) => b.jumlah - a.jumlah),
      batch: bt ?? [],
    });
  }
  return galat("Mode tidak dikenal.");
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariRequest(req, db);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const aksi = String(body?.aksi ?? "");

  // ---------------------------------------------------------------- konfirmasi petugas
  if (aksi === "konfirmasi") {
    const id = angka(body?.id);
    if (!id) return galat("Temuan tidak sah.");
    const v = validasiKonfirmasi(body);
    if (!v.ok) return galat(v.error);
    const { data: t } = await db.from("sigap_anomali_temuan").select("id, akun_id, status").eq("id", id).maybeSingle();
    if (!t || Number(t.akun_id) !== akun.id) return galat("Temuan ini bukan milik Anda.", 403);
    if (t.status === "perlu_cocok") return galat("Temuan belum ditetapkan ke petugas.", 409);
    const { error } = await db.from("sigap_anomali_temuan").update({ status: "dikonfirmasi", penyebab: v.data.penyebab, catatan: v.data.catatan, dikonfirmasi_at: new Date().toISOString(), dikonfirmasi_oleh: akun.id }).eq("id", id);
    if (error) return galat(error.message, 500);
    await catatAudit(db, akun.id, "anomali_konfirmasi", { temuan_id: id, penyebab: v.data.penyebab });
    return NextResponse.json({ ok: true });
  }

  // ---------------------------------------------------------------- admin
  const kegId = angka(body?.kegiatan_id);
  if (!kegId) return galat("Kegiatan tidak sah.");
  const { izin } = await izinAkun(db, akun.id);
  if (!bolehAdmin(izin, kegId)) return galat("Anda tidak punya izin mengelola anomali kegiatan ini.", 403);
  const { data: keg } = await db.from("sigap_kegiatan").select("id, nama").eq("id", kegId).maybeSingle();
  if (!keg) return galat("Kegiatan tidak ditemukan.", 404);

  async function pmlUntuk(ids: number[]): Promise<Map<number, number | null>> {
    const hasil = new Map<number, number | null>();
    if (ids.length === 0) return hasil;
    const { data } = await db!.from("sigap_sampel").select("ppl_akun_id, pml_akun_id").eq("kegiatan_id", kegId).limit(30000);
    const baris = ((data ?? []) as { ppl_akun_id: number | null; pml_akun_id: number | null }[]).map((r) => ({ ppl_akun_id: r.ppl_akun_id === null ? null : Number(r.ppl_akun_id), pml_akun_id: r.pml_akun_id === null ? null : Number(r.pml_akun_id) }));
    for (const id of ids) hasil.set(id, pmlTerbanyak(baris, id));
    return hasil;
  }

  if (aksi === "cocokkan") {
    const namaAsal = String(body?.nama_asal ?? "");
    const akunId = angka(body?.akun_id);
    if (!namaAsal || !akunId) return galat("Nama atau akun tidak sah.");
    const { data: a } = await db.from("sigap_akun").select("id").eq("id", akunId).maybeSingle();
    if (!a) return galat("Akun tidak ditemukan.", 404);
    const pml = (await pmlUntuk([akunId])).get(akunId) ?? null;
    const { data: diubah, error } = await db.from("sigap_anomali_temuan").update({ akun_id: akunId, pml_akun_id: pml, status: "menunggu" }).eq("kegiatan_id", kegId).eq("nama_asal", namaAsal).eq("status", "perlu_cocok").select("id");
    if (error) return galat(error.message, 500);
    if (body?.simpan_alias !== false) {
      const n = normNama(namaAsal);
      if (n) await db.from("sigap_anomali_alias").upsert({ alias_norm: n, akun_id: akunId, dibuat_oleh: akun.id }, { onConflict: "alias_norm" });
    }
    await catatAudit(db, akun.id, "anomali_cocokkan", { kegiatan_id: kegId, nama_asal: namaAsal, akun_id: akunId, jumlah: (diubah ?? []).length });
    return NextResponse.json({ ok: true, diubah: (diubah ?? []).length });
  }

  if (aksi === "impor") {
    const b = bersihkanBarisAnomali(body?.baris);
    if (!b.ok) return galat(b.error);
    const sumber = ["pantau", "vsen26m", "lain"].includes(String(body?.sumber)) ? String(body?.sumber) : "lain";
    const fase = body?.fase === "pemeriksaan" ? "pemeriksaan" : "pra_pelatihan";
    const periode = String(body?.periode ?? "").trim().slice(0, 40) || null;
    const namaBerkas = String(body?.nama_berkas ?? "").trim().slice(0, 200) || null;

    const [kandidat, { data: al }] = await Promise.all([akunAktif(db), db.from("sigap_anomali_alias").select("alias_norm, akun_id").limit(10000)]);
    const alias = new Map(((al ?? []) as { alias_norm: string; akun_id: number }[]).map((r) => [r.alias_norm, Number(r.akun_id)]));
    const hasil = b.baris.map((r) => {
      const h = cocokkanNama(r.id_anggota, kandidat, alias);
      const periodeBaris = r.periode ?? periode;
      return { r, periodeBaris, akunId: h.status === "cocok" ? h.akunId : null, kunci: kunciTemuan(kegId, r.id_anggota, r.kode, r.id_sampel, periodeBaris) };
    });
    // buang ganda di dalam berkas dan yang sudah ada di database
    const lihat = new Set<string>();
    const unik = hasil.filter((x) => (lihat.has(x.kunci) ? false : (lihat.add(x.kunci), true)));
    const ada = new Set<string>();
    for (let i = 0; i < unik.length; i += 200) {
      const { data } = await db.from("sigap_anomali_temuan").select("kunci").eq("kegiatan_id", kegId).in("kunci", unik.slice(i, i + 200).map((x) => x.kunci));
      for (const r of (data ?? []) as { kunci: string }[]) ada.add(r.kunci);
    }
    const baru = unik.filter((x) => !ada.has(x.kunci));
    const duplikat = hasil.length - baru.length;
    const cocok = baru.filter((x) => x.akunId !== null).length;

    const { data: batch, error: eB } = await db.from("sigap_anomali_batch").insert({ kegiatan_id: kegId, periode, sumber, fase, nama_berkas: namaBerkas, total: hasil.length, cocok, perlu_cocok: baru.length - cocok, duplikat, diimpor_oleh: akun.id }).select("id").single();
    if (eB || !batch) return galat(`Impor gagal: ${eB?.message ?? "tidak ada hasil"}`, 500);
    const pml = await pmlUntuk(Array.from(new Set(baru.map((x) => x.akunId).filter((x): x is number => x !== null))));
    const rows = baru.map((x) => ({
      batch_id: Number(batch.id),
      kegiatan_id: kegId,
      akun_id: x.akunId,
      pml_akun_id: x.akunId ? (pml.get(x.akunId) ?? null) : null,
      nama_asal: x.r.id_anggota,
      kode_temuan: x.r.kode,
      id_sampel: x.r.id_sampel,
      periode: x.periodeBaris,
      fase,
      keterangan: x.r.keterangan,
      rincian: x.r.rincian,
      kunci: x.kunci,
      status: x.akunId ? "menunggu" : "perlu_cocok",
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("sigap_anomali_temuan").insert(rows.slice(i, i + 500));
      if (error) return galat(`Sebagian temuan gagal disimpan (batch ${batch.id}): ${error.message}`, 500);
    }
    await catatAudit(db, akun.id, "anomali_impor", { kegiatan_id: kegId, batch_id: Number(batch.id), total: hasil.length, baru: baru.length, cocok, duplikat, sumber, fase });
    return NextResponse.json({ ok: true, batch_id: Number(batch.id), total: hasil.length, baru: baru.length, cocok, perlu_cocok: baru.length - cocok, duplikat });
  }
  return galat("Aksi tidak dikenal.");
}
