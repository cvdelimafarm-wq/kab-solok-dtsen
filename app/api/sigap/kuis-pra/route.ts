// app/api/sigap/kuis-pra/route.ts
//
// (31 Okt 2026) KUIS PRA PELATIHAN: soal dipilih per petugas menurut riwayat anomalinya (sigap_anomali_temuan) dari bank soal QC berkode KT-<KODE>-<urut>.
// Modul ringan terpisah dari mesin QC Pemahaman. Tabel: sigap_kuis_pra_pengaturan / sigap_kuis_pra_percobaan (SQL 20261031p; prasyarat 20261031o).
// Kegiatan = pelatihan (?kegiatan=ID; bila tidak ada, pelatihan peserta seperti halaman peserta lain). Logika: lib/sigapKuisPra.ts.
//
// GET  ?mode=peserta (bawaan)  -> { tersedia, pengaturan, status, percobaan, berjalan }  (peserta pelatihan)
// GET  ?mode=admin             -> { pengaturan, pilihan_kegiatan, rekap }                (izin pelatihan.kelola lihat)
// POST { aksi: "mulai" }                         peserta: membuat percobaan baru dengan soal per petugas
// POST { aksi: "jawab", percobaan_id, jawaban }  peserta: menilai; mengembalikan tinjauan + pembahasan
// POST { aksi: "simpan_pengaturan", ... }        admin (pelatihan.kelola kelola)

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, FILTER_BUKAN_ADMINISTRASI, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { kodeDariIdSoal, nilaiJawaban, pilihSoalKuisPra, rapatKode, statusKuisPra, validasiPengaturanKuisPra, type PengaturanKuisPra, type PercobaanRingkas } from "@/lib/sigapKuisPra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (error: string, status = 400) => NextResponse.json({ error }, { status });
type Db = NonNullable<ReturnType<typeof dbAdmin>>;

const BAWAAN: PengaturanKuisPra & { kegiatan_anomali_id: number | null; kegiatan_bank_id: number | null } = { aktif: false, jumlah_soal: 10, maks_percobaan: 3, nilai_lulus: 70, wajib_lulus: false, buka_at: null, tutup_at: null, kegiatan_anomali_id: null, kegiatan_bank_id: null };

async function muatPengaturan(db: Db, kegiatanId: number) {
  const { data, error } = await db.from("sigap_kuis_pra_pengaturan").select("aktif, kegiatan_anomali_id, kegiatan_bank_id, jumlah_soal, maks_percobaan, nilai_lulus, wajib_lulus, buka_at, tutup_at").eq("kegiatan_id", kegiatanId).maybeSingle();
  if (error) return { ada: false as const, tabelAda: false, p: BAWAAN };
  if (!data) return { ada: false as const, tabelAda: true, p: BAWAAN };
  const d = data as Record<string, unknown>;
  return {
    ada: true as const,
    tabelAda: true,
    p: {
      aktif: d.aktif === true,
      jumlah_soal: Number(d.jumlah_soal),
      maks_percobaan: Number(d.maks_percobaan),
      nilai_lulus: Number(d.nilai_lulus),
      wajib_lulus: d.wajib_lulus === true,
      buka_at: (d.buka_at as string | null) ?? null,
      tutup_at: (d.tutup_at as string | null) ?? null,
      kegiatan_anomali_id: d.kegiatan_anomali_id === null ? null : Number(d.kegiatan_anomali_id),
      kegiatan_bank_id: d.kegiatan_bank_id === null ? null : Number(d.kegiatan_bank_id),
    },
  };
}

async function pesertaDi(db: Db, akunId: number, kegiatanId: number): Promise<boolean> {
  const { data } = await db.from("sigap_penugasan").select("id").eq("akun_id", akunId).eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(1);
  return (data ?? []).length > 0;
}

type SoalRow = { id: string; paket: number; judul_paket: string | null; pertanyaan: string; opsi: Record<string, string>; kunci: string; penjelasan: string | null; kata_kunci: string[] | null };
const opsiArray = (o: Record<string, string>) => Object.keys(o).sort().map((k) => ({ kode: k, teks: o[k] }));
const soalKlien = (s: SoalRow) => ({ id: s.id, judul_paket: s.judul_paket ?? "", pertanyaan: s.pertanyaan, kata_kunci: s.kata_kunci ?? [], opsi: opsiArray(s.opsi) });

async function soalDari(db: Db, ids: string[], bankId: number | null): Promise<SoalRow[]> {
  if (ids.length === 0) return [];
  let q = db.from("sigap_qc_soal").select("id, paket, judul_paket, pertanyaan, opsi, kunci, penjelasan, kata_kunci").in("id", ids);
  if (bankId !== null) q = q.eq("kegiatan_id", bankId);
  const { data } = await q;
  const peta = new Map(((data ?? []) as SoalRow[]).map((s) => [s.id, s]));
  return ids.map((id) => peta.get(id)).filter((s): s is SoalRow => !!s);
}

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariRequest(req, db);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const mode = req.nextUrl.searchParams.get("mode") ?? "peserta";
  const mulaiMs = Date.now();

  if (mode === "admin") {
    const kegiatanId = await idKegiatanPelatihan(db, req);
    if (!kegiatanId) return galat("Pelatihan tidak ditemukan.", 404);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return galat("Tidak punya izin melihat kuis pra.", 403);
    const { tabelAda, p } = await muatPengaturan(db, kegiatanId);
    const [{ data: keg }, { data: bank }, { data: pen }] = await Promise.all([
      db.from("sigap_kegiatan").select("id, nama, jenis").order("id"),
      db.from("sigap_qc_soal").select("kegiatan_id, id").like("id", "KT-%").eq("aktif", true).limit(5000),
      db.from("sigap_penugasan").select("akun_id").eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(5000),
    ]);
    const jumlahBank = new Map<number, number>();
    for (const r of (bank ?? []) as { kegiatan_id: number }[]) jumlahBank.set(Number(r.kegiatan_id), (jumlahBank.get(Number(r.kegiatan_id)) ?? 0) + 1);
    const pilihan = ((keg ?? []) as { id: number; nama: string; jenis: string }[]).map((k) => ({ id: Number(k.id), nama: String(k.nama), jenis: String(k.jenis), soal_kt: jumlahBank.get(Number(k.id)) ?? 0 }));

    const akunIds = Array.from(new Set(((pen ?? []) as { akun_id: number }[]).map((r) => Number(r.akun_id))));
    const [{ data: akunRows }, { data: perc }, { data: tm }] = await Promise.all([
      akunIds.length ? db.from("sigap_akun").select("id, nama").in("id", akunIds) : Promise.resolve({ data: [] }),
      tabelAda && akunIds.length ? db.from("sigap_kuis_pra_percobaan").select("akun_id, ke, skor, selesai_at").eq("kegiatan_id", kegiatanId).in("akun_id", akunIds) : Promise.resolve({ data: [] }),
      p.kegiatan_anomali_id && akunIds.length ? db.from("sigap_anomali_temuan").select("akun_id, status").eq("kegiatan_id", p.kegiatan_anomali_id).in("akun_id", akunIds).neq("status", "perlu_cocok").limit(20000) : Promise.resolve({ data: [] }),
    ]);
    const nama = new Map(((akunRows ?? []) as { id: number; nama: string }[]).map((a) => [Number(a.id), String(a.nama)]));
    const percPer = new Map<number, PercobaanRingkas[]>();
    for (const r of (perc ?? []) as { akun_id: number; ke: number; skor: number | null; selesai_at: string | null }[]) {
      const a = percPer.get(Number(r.akun_id)) ?? [];
      a.push({ ke: Number(r.ke), skor: r.skor === null ? null : Number(r.skor), selesai: r.selesai_at !== null });
      percPer.set(Number(r.akun_id), a);
    }
    const anomali = new Map<number, number>();
    for (const r of (tm ?? []) as { akun_id: number }[]) anomali.set(Number(r.akun_id), (anomali.get(Number(r.akun_id)) ?? 0) + 1);
    const rekap = akunIds
      .map((id) => {
        const s = statusKuisPra(p, percPer.get(id) ?? [], mulaiMs);
        return { akun_id: id, nama: nama.get(id) ?? `#${id}`, anomali: anomali.get(id) ?? 0, percobaan: (percPer.get(id) ?? []).length, terbaik: s.terbaik, lulus: s.lulus, status: s.status };
      })
      .sort((a, b) => a.nama.localeCompare(b.nama));
    return NextResponse.json({ tabel_ada: tabelAda, boleh_ubah: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId), kegiatan_id: kegiatanId, pengaturan: p, pilihan_kegiatan: pilihan, rekap });
  }

  // peserta
  const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
  if (!kegiatanId) return NextResponse.json({ tersedia: false });
  if (!(await pesertaDi(db, akun.id, kegiatanId))) return NextResponse.json({ tersedia: false });
  const { ada, p } = await muatPengaturan(db, kegiatanId);
  if (!ada || !p.aktif) return NextResponse.json({ tersedia: false });
  const { data: perc } = await db.from("sigap_kuis_pra_percobaan").select("id, ke, soal_ids, skor, selesai_at").eq("kegiatan_id", kegiatanId).eq("akun_id", akun.id).order("ke");
  const rows = (perc ?? []) as { id: number; ke: number; soal_ids: string[]; skor: number | null; selesai_at: string | null }[];
  const ringkas: PercobaanRingkas[] = rows.map((r) => ({ ke: Number(r.ke), skor: r.skor === null ? null : Number(r.skor), selesai: r.selesai_at !== null }));
  const status = statusKuisPra(p, ringkas, mulaiMs);
  const berjalan = rows.find((r) => r.selesai_at === null) ?? null;
  const soal = berjalan ? await soalDari(db, berjalan.soal_ids, p.kegiatan_bank_id) : [];
  return NextResponse.json({
    tersedia: true,
    kegiatan_id: kegiatanId,
    pengaturan: { jumlah_soal: p.jumlah_soal, maks_percobaan: p.maks_percobaan, nilai_lulus: p.nilai_lulus, wajib_lulus: p.wajib_lulus, buka_at: p.buka_at, tutup_at: p.tutup_at },
    status,
    percobaan: ringkas,
    berjalan: berjalan ? { id: Number(berjalan.id), ke: Number(berjalan.ke), soal: soal.map(soalKlien) } : null,
  });
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariRequest(req, db);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const aksi = String(body?.aksi ?? "");

  if (aksi === "simpan_pengaturan") {
    const kegiatanId = await idKegiatanPelatihan(db, req);
    if (!kegiatanId) return galat("Pelatihan tidak ditemukan.", 404);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return galat("Hanya pengelola pelatihan yang boleh mengubah kuis pra.", 403);
    const v = validasiPengaturanKuisPra(body);
    if (!v.ok) return galat(v.error);
    const { error } = await db.from("sigap_kuis_pra_pengaturan").upsert({ kegiatan_id: kegiatanId, ...v.data, diubah_at: new Date().toISOString(), diubah_oleh: akun.id }, { onConflict: "kegiatan_id" });
    if (error) return galat(/relation|does not exist|schema cache/i.test(error.message) ? "Tabel kuis pra belum ada. Jalankan SQL 20261031p_kuis_pra.sql." : error.message, 500);
    await catatAudit(db, akun.id, "kuis_pra_simpan", { kegiatan_id: kegiatanId, aktif: v.data.aktif, jumlah_soal: v.data.jumlah_soal });
    return NextResponse.json({ ok: true });
  }

  const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
  if (!kegiatanId || !(await pesertaDi(db, akun.id, kegiatanId))) return galat("Anda bukan peserta pelatihan ini.", 403);
  const { ada, p } = await muatPengaturan(db, kegiatanId);
  if (!ada || !p.aktif) return galat("Kuis pra belum dibuka.", 409);
  const { data: perc } = await db.from("sigap_kuis_pra_percobaan").select("id, ke, soal_ids, skor, selesai_at").eq("kegiatan_id", kegiatanId).eq("akun_id", akun.id).order("ke");
  const rows = (perc ?? []) as { id: number; ke: number; soal_ids: string[]; skor: number | null; selesai_at: string | null }[];
  const ringkas: PercobaanRingkas[] = rows.map((r) => ({ ke: Number(r.ke), skor: r.skor === null ? null : Number(r.skor), selesai: r.selesai_at !== null }));
  const st = statusKuisPra(p, ringkas, Date.now());

  if (aksi === "mulai") {
    if (st.status === "lanjut") return galat("Masih ada percobaan yang berjalan.", 409);
    if (st.status !== "bisa_mulai") return galat(st.status === "lulus" ? "Anda sudah lulus kuis pra." : st.status === "habis" ? "Kesempatan percobaan sudah habis." : st.status === "belum_buka" ? "Kuis pra belum dibuka." : "Kuis pra sudah ditutup.", 409);
    let bankQ = db.from("sigap_qc_soal").select("id").like("id", "KT-%").eq("aktif", true);
    if (p.kegiatan_bank_id !== null) bankQ = bankQ.eq("kegiatan_id", p.kegiatan_bank_id);
    const { data: bank } = await bankQ.limit(5000);
    let riwayat: { kode: string; jumlah: number }[] = [];
    if (p.kegiatan_anomali_id !== null) {
      const { data: tm } = await db.from("sigap_anomali_temuan").select("kode_temuan").eq("kegiatan_id", p.kegiatan_anomali_id).eq("akun_id", akun.id).neq("status", "perlu_cocok").limit(5000);
      const hitung = new Map<string, number>();
      for (const r of (tm ?? []) as { kode_temuan: string }[]) hitung.set(rapatKode(r.kode_temuan), (hitung.get(rapatKode(r.kode_temuan)) ?? 0) + 1);
      riwayat = Array.from(hitung.entries()).map(([kode, jumlah]) => ({ kode, jumlah }));
    }
    const pilih = pilihSoalKuisPra((bank ?? []) as { id: string }[], riwayat, p.jumlah_soal, `${akun.id}:${st.keBerikut}:${kegiatanId}`);
    if (pilih.soalIds.length === 0) return galat("Bank soal kuis pra belum tersedia. Hubungi panitia.", 409);
    const { data: baru, error } = await db.from("sigap_kuis_pra_percobaan").insert({ kegiatan_id: kegiatanId, akun_id: akun.id, ke: st.keBerikut, soal_ids: pilih.soalIds }).select("id, ke").single();
    if (error || !baru) return galat(error?.message ?? "Gagal memulai kuis.", 500);
    const soal = await soalDari(db, pilih.soalIds, p.kegiatan_bank_id);
    return NextResponse.json({ ok: true, berjalan: { id: Number(baru.id), ke: Number(baru.ke), soal: soal.map(soalKlien) }, dari_riwayat: pilih.dariRiwayat });
  }

  if (aksi === "jawab") {
    const id = Number(body?.percobaan_id);
    const r = rows.find((x) => Number(x.id) === id);
    if (!r) return galat("Percobaan tidak ditemukan.", 404);
    if (r.selesai_at !== null) return galat("Percobaan ini sudah dinilai.", 409);
    const jawab = (body?.jawaban ?? {}) as Record<string, unknown>;
    const soal = await soalDari(db, r.soal_ids, p.kegiatan_bank_id);
    const kunci = Object.fromEntries(soal.map((s) => [s.id, s.kunci]));
    const h = nilaiJawaban(kunci, jawab);
    const bersih = Object.fromEntries(Object.keys(kunci).map((k) => [k, String(jawab[k] ?? "").trim().toUpperCase().slice(0, 1)]));
    const { error } = await db.from("sigap_kuis_pra_percobaan").update({ jawaban: bersih, benar: h.benar, jumlah: h.jumlah, skor: h.skor, selesai_at: new Date().toISOString() }).eq("id", id).is("selesai_at", null);
    if (error) return galat(error.message, 500);
    const baru = statusKuisPra(p, [...ringkas.filter((x) => x.ke !== Number(r.ke)), { ke: Number(r.ke), skor: h.skor, selesai: true }], Date.now());
    return NextResponse.json({
      ok: true,
      hasil: { ...h, lulus: h.skor >= p.nilai_lulus, nilai_lulus: p.nilai_lulus },
      status: baru,
      tinjau: soal.map((s) => ({ ...soalKlien(s), kunci: s.kunci, jawaban: bersih[s.id] || null, benar: bersih[s.id] === s.kunci.toUpperCase(), penjelasan: s.penjelasan ?? "", kode_temuan: kodeDariIdSoal(s.id) })),
    });
  }
  return galat("Aksi tidak dikenal.");
}
