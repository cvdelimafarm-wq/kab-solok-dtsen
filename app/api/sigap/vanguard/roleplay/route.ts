// app/api/sigap/vanguard/roleplay/route.ts
//
// (8 Nov 2026) ROLEPLAY BERSAMA KELAS (Vanguard). Aturan: lib/vanguard/roleplay/*, akses dan data: lib/vanguardRoleplayDb.ts.
// Roleplay hanya ada bila DICENTANG di Kelola Pelatihan (/api/sigap/pelatihan/roleplay) dan Vanguard menyala; selain itu GET membalas { aktif:false, alasan }.
//
//   GET ?kegiatan=ID[&kelas=N][&langkah=NOMOR][&peserta=AKUN_ID]
//     peserta   -> { aktif:true, peran:"peserta", kelas, roleplay|null, langkah:[{nomor,teks,status}], isian, terkunci:[kunci], hasil|null }   (hasil hanya sesudah roleplay selesai; tanpa jawaban/nama peserta lain)
//     pengelola/instruktur -> { aktif:true, peran, kelas, kelas_pilihan:[], roleplay|null, langkah:[RingkasLangkah], pemetaan|null, rekap:[BarisRekap], review|null, jumlah_peserta }
//   POST { kegiatan, kelas, aksi, ... }  (ditolak pada mode lihat/masuk sebagai)
//     buka {judul?} · tambah_langkah {bagian,dari?,sampai?} · simpan {isian} (peserta) · periksa · buka_kembali · tandai {nomor,kunci,benar:[tanda]} ·
//     lanjut {berikut?:{bagian,dari?,sampai?}} · selesai    -> keadaan terbaru seperti GET
// Poin roleplay TIDAK masuk nilai pelatihan, bintang, sertifikasi, atau poin kinerja.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, catatAudit, sesiDariHeader } from "@/lib/sigapAkses";
import { muatKelasKegiatan } from "@/lib/sigapKelasKegiatan";
import {
  muatIsian, muatLangkah, muatPesertaDanIsian, muatRoleplay, muatTanda, peranRoleplay, simpanIsian, simpanTanda, type PeranRoleplay, type RoleplayBaris,
} from "@/lib/vanguardRoleplayDb";
import { bentrokCakupan, bersihkanIsian, gabungIsianTerkunci, periksaCakupan, satuanTerkunci } from "@/lib/vanguard/roleplay/isian";
import { petakanVariasi, satuanCakupan, satuanPerluTanda, sesiTuntasDitandai } from "@/lib/vanguard/roleplay/penilaian";
import { cakupanLangkah, ringkasLangkah, semuaSatuan, susunHasilPeserta, susunPemetaan, susunRekap, tandaGabungan, teksCakupan, type LangkahBaris } from "@/lib/vanguard/roleplay/susun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

const idPositif = (x: unknown): number | null => {
  const n = typeof x === "string" ? (/^\d{1,9}$/.test(x) ? Number(x) : NaN) : typeof x === "number" ? x : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

type Pemakai = Exclude<PeranRoleplay, { peran: null }>;

/** Boleh mengelola kelas ini? (pengelola: semua; instruktur: kelasnya) */
const bolehKelola = (p: Pemakai, kelas: number): boolean => p.peran === "pengelola" || (p.peran === "instruktur" && p.kelas.includes(kelas));

async function keadaanPeserta(db: Db, akunId: number, p: Extract<Pemakai, { peran: "peserta" }>, kegiatan: number) {
  if (p.kelas === null) return { aktif: true, peran: "peserta", kelas: null, roleplay: null, langkah: [], isian: null, terkunci: [], hasil: null, pesan: "Anda belum ditempatkan di kelas. Hubungi panitia." };
  const rp = await muatRoleplay(db, kegiatan, p.kelas);
  if (!rp) return { aktif: true, peran: "peserta", kelas: p.kelas, roleplay: null, langkah: [], isian: null, terkunci: [], hasil: null };
  const langkah = await muatLangkah(db, rp.id);
  const isian = await muatIsian(db, rp.id, akunId);
  let hasil = null;
  if (rp.status === "selesai") {
    const tanda = await muatTanda(db, langkah);
    hasil = susunHasilPeserta(akunId, isian, semuaSatuan(langkah), tandaGabungan(tanda));
  }
  return {
    aktif: true, peran: "peserta", kelas: p.kelas,
    roleplay: { id: rp.id, judul: rp.judul, status: rp.status },
    langkah: langkah.map((l) => ({ nomor: l.nomor, teks: teksCakupan(l), status: l.status })),
    isian: isian ?? { iv1: [], nilai: {} },
    terkunci: [...satuanTerkunci(langkah)],
    hasil,
  };
}

async function keadaanKelola(db: Db, p: Pemakai, kegiatan: number, kelas: number, opsi: { langkah?: number | null; peserta?: number | null }) {
  const master = (await muatKelasKegiatan(db, kegiatan)).map((k) => ({ nomor: k.nomor, nama: k.nama }));
  const pilihan = p.peran === "instruktur" ? master.filter((k) => p.kelas.includes(k.nomor)) : master;
  const rp = await muatRoleplay(db, kegiatan, kelas);
  const dasar = { aktif: true, peran: p.peran, kelas, kelas_pilihan: pilihan };
  if (!rp) return { ...dasar, roleplay: null, langkah: [], pemetaan: null, rekap: [], review: null, jumlah_peserta: (await muatPesertaDanIsian(db, kegiatan, kelas, 0)).peserta.length };
  const langkah = await muatLangkah(db, rp.id);
  const { peserta, nama } = await muatPesertaDanIsian(db, kegiatan, kelas, rp.id);
  const tanda = await muatTanda(db, langkah);
  const gab = tandaGabungan(tanda);
  const cakupan = semuaSatuan(langkah);
  const ringkas = langkah.map((l) => ringkasLangkah(l, peserta, tanda));
  const dipetakan = (opsi.langkah ? langkah.find((l) => l.nomor === opsi.langkah) : null) ?? [...langkah].reverse().find((l) => l.status !== "berjalan") ?? null;
  const reviewUntuk = opsi.peserta ? peserta.find((x) => x.akun_id === opsi.peserta) : null;
  return {
    ...dasar,
    roleplay: { id: rp.id, judul: rp.judul, status: rp.status, dibuat_at: rp.dibuat_at, selesai_at: rp.selesai_at },
    langkah: ringkas,
    pemetaan: dipetakan ? susunPemetaan(dipetakan, peserta, nama, tanda) : null,
    rekap: susunRekap(peserta, nama, cakupan, gab),
    review: reviewUntuk ? { akun_id: reviewUntuk.akun_id, nama: nama.get(reviewUntuk.akun_id) ?? `Akun ${reviewUntuk.akun_id}`, ...susunHasilPeserta(reviewUntuk.akun_id, reviewUntuk.isian, cakupan, gab) } : null,
    jumlah_peserta: peserta.length,
  };
}

async function keadaan(db: Db, akunId: number, p: Pemakai, kegiatan: number, kelas: number | null, opsi: { langkah?: number | null; peserta?: number | null } = {}) {
  if (p.peran === "peserta") return keadaanPeserta(db, akunId, p, kegiatan);
  if (kelas === null) return { aktif: true, peran: p.peran, kelas: null, kelas_pilihan: [], roleplay: null, langkah: [], pemetaan: null, rekap: [], review: null, jumlah_peserta: 0 };
  return keadaanKelola(db, p, kegiatan, kelas, opsi);
}

/** Kelas yang dilayani untuk pengelola/instruktur: ?kelas bila boleh, selain itu kelas pertama yang boleh. */
async function tentukanKelas(db: Db, p: Pemakai, kegiatan: number, diminta: number | null): Promise<number | null> {
  if (p.peran === "peserta") return p.kelas;
  if (diminta !== null) return bolehKelola(p, diminta) ? diminta : null;
  if (p.peran === "instruktur") return p.kelas[0] ?? null;
  const master = await muatKelasKegiatan(db, kegiatan);
  return master[0]?.nomor ?? null;
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const q = req.nextUrl.searchParams;
    const kegiatan = idPositif(q.get("kegiatan"));
    if (!kegiatan) return NextResponse.json({ aktif: false, alasan: "Pelatihan tidak ditentukan." });
    const p = await peranRoleplay(db as Db, akunId, kegiatan);
    if (p.peran === null) return NextResponse.json({ aktif: false, alasan: p.alasan });
    const kelasDiminta = idPositif(q.get("kelas"));
    const kelas = await tentukanKelas(db as Db, p, kegiatan, kelasDiminta);
    if (p.peran !== "peserta" && kelasDiminta !== null && kelas === null) return galat("Anda bukan instruktur kelas itu.", 403);
    return NextResponse.json(await keadaan(db as Db, akunId, p, kegiatan, kelas, { langkah: idPositif(q.get("langkah")), peserta: idPositif(q.get("peserta")) }));
  } catch {
    return galat("Gagal memuat roleplay.", 500);
  }
}

const langkahAkhir = (l: readonly LangkahBaris[]): LangkahBaris | null => (l.length ? l[l.length - 1] : null);

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat("Mode lihat (masuk sebagai) tidak dapat mengubah roleplay.", 403);
    let b: Record<string, unknown>;
    try { b = (await req.json()) as Record<string, unknown>; } catch { return galat("Isi permintaan tidak sah."); }
    if (!b || typeof b !== "object") return galat("Isi permintaan tidak sah.");
    const kegiatan = idPositif(b.kegiatan);
    if (!kegiatan) return galat("Pelatihan tidak ditentukan.");
    const p = await peranRoleplay(db as Db, akunId, kegiatan);
    if (p.peran === null) return galat(p.alasan, 403);
    const aksi = typeof b.aksi === "string" ? b.aksi : "";

    // ---- peserta: simpan isian ----
    if (aksi === "simpan") {
      if (p.peran !== "peserta") return galat("Hanya peserta yang mengisi jawaban.", 403);
      if (p.kelas === null) return galat("Anda belum ditempatkan di kelas.", 409);
      const rp = await muatRoleplay(db as Db, kegiatan, p.kelas);
      if (!rp || rp.status !== "berjalan") return galat("Roleplay belum dibuka atau sudah selesai.", 409);
      const langkah = await muatLangkah(db as Db, rp.id);
      const lama = await muatIsian(db as Db, rp.id, akunId);
      const g = gabungIsianTerkunci(bersihkanIsian(b.isian), lama, satuanTerkunci(langkah));
      if (!(await simpanIsian(db as Db, rp.id, akunId, g.isian))) return galat("Gagal menyimpan isian.", 500);
      return NextResponse.json({ ok: true, isian: g.isian, terkunci: [...satuanTerkunci(langkah)], ditolak: g.ditolak });
    }

    // ---- instruktur / pengelola ----
    if (p.peran === "peserta") return galat("Hanya instruktur atau panitia yang dapat mengelola roleplay.", 403);
    const kelas = idPositif(b.kelas);
    if (!kelas || !bolehKelola(p, kelas)) return galat("Anda tidak berhak mengelola roleplay kelas ini.", 403);
    const jawab = async () => NextResponse.json(await keadaan(db as Db, akunId, p, kegiatan, kelas, { langkah: idPositif(b.nomor) }));
    const rp: RoleplayBaris | null = await muatRoleplay(db as Db, kegiatan, kelas);

    if (aksi === "buka") {
      if (rp && rp.status === "berjalan") return galat("Roleplay kelas ini sedang berjalan.", 409);
      const judul = typeof b.judul === "string" && b.judul.trim() ? b.judul.trim().slice(0, 120) : "Roleplay bareng kelas";
      const { error } = await db.from("sigap_vanguard_roleplay").insert({ kegiatan_id: kegiatan, kelas, judul, dibuat_oleh: akunId });
      if (error) return galat((error as { code?: string }).code === "23505" ? "Roleplay kelas ini sedang berjalan." : "Gagal membuka roleplay.", (error as { code?: string }).code === "23505" ? 409 : 500);
      await catatAudit(db as Db, akunId, "vanguard_roleplay_buka", { kegiatan_id: kegiatan, kelas });
      return jawab();
    }

    if (!rp) return galat("Roleplay belum dibuka.", 409);
    if (rp.status !== "berjalan") return galat("Roleplay ini sudah selesai.", 409);
    const langkah = await muatLangkah(db as Db, rp.id);
    const akhir = langkahAkhir(langkah);
    const { peserta } = await muatPesertaDanIsian(db as Db, kegiatan, kelas, rp.id);

    const buatLangkah = async (mentah: unknown): Promise<string | null> => {
      const c = periksaCakupan(mentah);
      if (!c.ok) return c.pesan;
      const bentrok = bentrokCakupan(c.cakupan, langkah.map(cakupanLangkah));
      if (bentrok.length > 0) return "Sebagian isian pada cakupan itu sudah dipakai sesi lain pada roleplay ini.";
      const { error } = await db.from("sigap_vanguard_roleplay_langkah").insert({ roleplay_id: rp.id, nomor: (akhir?.nomor ?? 0) + 1, bagian: c.cakupan.bagian, dari: c.cakupan.dari ?? null, sampai: c.cakupan.sampai ?? null });
      return error ? "Gagal membuat sesi." : null;
    };

    if (aksi === "tambah_langkah") {
      if (akhir && akhir.status !== "selesai") return galat("Selesaikan sesi sebelumnya dulu (Periksa, tandai, lalu Lanjut).", 409);
      const g = await buatLangkah(b);
      return g ? galat(g, 409) : jawab();
    }

    if (!akhir) return galat("Buat sesi pertama dulu.", 409);

    if (aksi === "periksa") {
      if (akhir.status !== "berjalan") return galat("Sesi ini sudah diperiksa.", 409);
      const { error } = await db.from("sigap_vanguard_roleplay_langkah").update({ status: "diperiksa", diperiksa_at: new Date().toISOString() }).eq("id", akhir.id).eq("status", "berjalan");
      return error ? galat("Gagal memeriksa.", 500) : jawab();
    }

    if (aksi === "buka_kembali") {
      if (akhir.status !== "diperiksa") return galat("Hanya sesi yang sedang diperiksa yang dapat dibuka kembali.", 409);
      const { error } = await db.from("sigap_vanguard_roleplay_langkah").update({ status: "berjalan", diperiksa_at: null }).eq("id", akhir.id).eq("status", "diperiksa");
      return error ? galat("Gagal membuka kembali.", 500) : jawab();
    }

    if (aksi === "tandai") {
      if (akhir.status !== "diperiksa") return galat("Tekan Periksa dulu sebelum menandai jawaban.", 409);
      const kunci = typeof b.kunci === "string" ? b.kunci : "";
      if (!satuanPerluTanda(satuanCakupan(cakupanLangkah(akhir)), peserta).includes(kunci)) return galat("Isian itu tidak perlu ditandai pada sesi ini.", 400);
      if (!Array.isArray(b.benar) || b.benar.length > 60 || b.benar.some((x) => typeof x !== "string")) return galat("Daftar jawaban benar tidak sah.");
      const ada = new Set(petakanVariasi(kunci, peserta).map((v) => v.tanda));
      const benar = [...new Set(b.benar as string[])];
      if (benar.some((x) => !ada.has(x))) return galat("Ada jawaban yang bukan variasi peserta.", 400);
      return (await simpanTanda(db as Db, akhir.id, kunci, benar, akunId)) ? jawab() : galat("Gagal menyimpan tanda.", 500);
    }

    if (aksi === "lanjut" || aksi === "selesai") {
      if (akhir.status === "berjalan") return galat("Tekan Periksa dan tandai jawaban dulu.", 409);
      if (akhir.status === "diperiksa") {
        const tanda = await muatTanda(db as Db, [akhir]);
        if (!sesiTuntasDitandai(satuanCakupan(cakupanLangkah(akhir)), peserta, tanda.get(akhir.id) ?? new Map())) return galat("Masih ada jawaban yang belum ditandai.", 409);
        // Sesi berikutnya diperiksa SEBELUM sesi ini ditutup: bila cakupannya tidak sah atau bentrok, sesi ini tetap diperiksa (tidak setengah jalan).
        if (aksi === "lanjut" && b.berikut !== undefined && b.berikut !== null) {
          const c = periksaCakupan(b.berikut);
          if (!c.ok) return galat(c.pesan, 409);
          if (bentrokCakupan(c.cakupan, langkah.map(cakupanLangkah)).length > 0) return galat("Sebagian isian pada cakupan itu sudah dipakai sesi lain pada roleplay ini.", 409);
        }
        const { error } = await db.from("sigap_vanguard_roleplay_langkah").update({ status: "selesai", selesai_at: new Date().toISOString() }).eq("id", akhir.id).eq("status", "diperiksa");
        if (error) return galat("Gagal menyelesaikan sesi.", 500);
      }
      if (aksi === "lanjut") {
        if (b.berikut === undefined || b.berikut === null) return jawab();
        const g = await buatLangkah(b.berikut);
        return g ? galat(g, 409) : jawab();
      }
      const { error } = await db.from("sigap_vanguard_roleplay").update({ status: "selesai", selesai_at: new Date().toISOString() }).eq("id", rp.id).eq("status", "berjalan");
      if (error) return galat("Gagal menyelesaikan roleplay.", 500);
      await catatAudit(db as Db, akunId, "vanguard_roleplay_selesai", { kegiatan_id: kegiatan, kelas });
      return jawab();
    }

    return galat("Aksi tidak dikenal.");
  } catch {
    return galat("Gagal memproses roleplay.", 500);
  }
}

