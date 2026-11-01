// app/api/sigap/vanguard/admin/route.ts
//
// (1 Nov 2026) VANGUARD V3a: dasbor BPS Kabupaten Solok. Hanya baca. Izin: kegiatan pelatihan = menu `pelatihan.kelola`; kegiatan lain = `translok.monitoring`
// (tingkat lihat, sesuai lingkup kegiatan; lib/vanguard/dasbor.ts `menuDasbor`). Akun yang sedang "masuk sebagai" boleh melihat (hanya baca).
//   GET                                        -> { daftar:[{id, nama, jenis, menyala, percobaan}] } kegiatan yang boleh dilihat dan memakai Vanguard
//   GET ?kegiatan=ID                           -> { kegiatan, dasbor, terpotong, pengaturan, boleh_kelola }
//   POST { kegiatan, pengaturan }              -> simpan pengaturan per kegiatan (izin tingkat kelola pada menu yang sama; dicatat di sigap_audit)
//   GET ?kegiatan=ID&format=csv&bagian=skor|kesalahan -> berkas CSV (vanguard_skor_YYYYMMDD.csv / vanguard_kesalahan_YYYYMMDD.csv)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, boleh, catatAudit, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { keadaanVanguard } from "@/lib/vanguardAkses";
import { muatKalkulator, muatPengaturan, simpanPengaturan } from "@/lib/vanguardPengaturanDb";
import { periksaSimpan, statusJadwal } from "@/lib/vanguard/pengaturan";
import { csvKesalahan, csvSkor, hariWib, menuDasbor, susunDasbor, type BarisKesalahanDb, type BarisPercobaanDb, type Peserta } from "@/lib/vanguard/dasbor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const MAKS_BARIS = 50_000;
const HALAMAN = 1000;
const BUKAN_ADMINISTRASI = "sumber.is.null,sumber.neq.administrasi";

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

/** Membaca semua baris satu kegiatan per halaman 1000, sampai MAKS_BARIS. */
async function muatSemua<T>(db: Db, tabel: string, kolom: string, kegiatan: number): Promise<{ baris: T[]; terpotong: boolean }> {
  const baris: T[] = [];
  for (let dari = 0; dari < MAKS_BARIS; dari += HALAMAN) {
    const { data, error } = await db.from(tabel).select(kolom).eq("kegiatan_id", kegiatan).order("id", { ascending: true }).range(dari, dari + HALAMAN - 1);
    if (error) throw new Error(`gagal membaca ${tabel}`);
    const b = (data ?? []) as unknown as T[];
    baris.push(...b);
    if (b.length < HALAMAN) return { baris, terpotong: false };
  }
  return { baris, terpotong: true };
}

async function namaAkun(db: Db, ids: number[]): Promise<Map<number, string>> {
  const peta = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("sigap_akun").select("id, nama").in("id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as { id: number; nama: string }[]) peta.set(r.id, r.nama);
  }
  return peta;
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db as Db, akunId);
    const p = req.nextUrl.searchParams;

    // ---- daftar kegiatan ----
    if (!p.get("kegiatan")) {
      const { data: kg } = await db.from("sigap_kegiatan").select("id, nama, jenis, aktif").order("id", { ascending: false }).limit(300);
      const semua = ((kg ?? []) as { id: number; nama: string; jenis: string; aktif: boolean }[]).filter((k) => boleh(izin, menuDasbor(k.jenis), "lihat", k.id));
      const { data: pc } = await db.from("sigap_vanguard_percobaan").select("kegiatan_id").limit(5000);
      const jumlah = new Map<number, number>();
      for (const r of (pc ?? []) as { kegiatan_id: number }[]) jumlah.set(r.kegiatan_id, (jumlah.get(r.kegiatan_id) ?? 0) + 1);
      const daftar: { id: number; nama: string; jenis: string; menyala: boolean; percobaan: number }[] = [];
      for (const k of semua) {
        const n = jumlah.get(k.id) ?? 0;
        const kd = k.aktif || n > 0 ? await keadaanVanguard(db as Db, k.id) : { menyala: false };
        if (kd.menyala || n > 0) daftar.push({ id: k.id, nama: k.nama, jenis: k.jenis, menyala: kd.menyala, percobaan: n });
      }
      return NextResponse.json({ daftar });
    }

    // ---- satu kegiatan ----
    const kegiatan = /^\d{1,9}$/.test(p.get("kegiatan") ?? "") ? Number(p.get("kegiatan")) : null;
    if (!kegiatan) return galat("Kegiatan tidak sah.");
    const { data: k } = await db.from("sigap_kegiatan").select("id, nama, jenis").eq("id", kegiatan).maybeSingle();
    if (!k) return galat("Kegiatan tidak ditemukan.", 404);
    const kg = k as { id: number; nama: string; jenis: string };
    if (!boleh(izin, menuDasbor(kg.jenis), "lihat", kg.id)) return galat("Tidak punya izin melihat dasbor Vanguard kegiatan ini.", 403);

    const { data: pen } = await db.from("sigap_penugasan").select("akun_id, peran").eq("kegiatan_id", kegiatan).eq("aktif", true).or(BUKAN_ADMINISTRASI).limit(5000);
    const penugasan = (pen ?? []) as { akun_id: number; peran: string | null }[];
    const [perc, kes] = await Promise.all([
      muatSemua<BarisPercobaanDb>(db as Db, "sigap_vanguard_percobaan", "id, akun_id, kasus, nomor, benar, bintang, jml_salah, jml_fatal, petunjuk, lihat_jawaban, durasi_dtk, dibuat_at", kegiatan),
      muatSemua<BarisKesalahanDb>(db as Db, "sigap_vanguard_kesalahan", "id, akun_id, kasus, sel, jenis, tingkat", kegiatan),
    ]);
    const idSemua = [...new Set([...penugasan.map((x) => x.akun_id), ...perc.baris.map((x) => x.akun_id)])];
    const nama = await namaAkun(db as Db, idSemua);
    const peserta: Peserta[] = penugasan.map((x) => ({ akun_id: x.akun_id, nama: nama.get(x.akun_id) ?? `Akun ${x.akun_id}`, peran: x.peran }));
    const namaLain = Object.fromEntries(idSemua.map((id) => [id, nama.get(id) ?? `Akun ${id}`]));
    const peng = await muatPengaturan(db as Db, kegiatan);
    const kalkulator = await muatKalkulator(db as Db, kegiatan);
    const d = susunDasbor(peserta, perc.baris, kes.baris, namaLain, { pengaturan: peng, kalkulator });

    if (p.get("format") === "csv") {
      const bagian = p.get("bagian") === "kesalahan" ? "kesalahan" : "skor";
      const tgl = hariWib(new Date().toISOString()).replace(/-/g, "");
      const isi = bagian === "kesalahan" ? csvKesalahan(peserta.concat(idSemua.filter((i) => !penugasan.some((x) => x.akun_id === i)).map((i) => ({ akun_id: i, nama: namaLain[i], peran: null }))), kes.baris) : csvSkor(d);
      return new NextResponse(isi, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="vanguard_${bagian}_${tgl}.csv"`, "cache-control": "no-store" } });
    }
    return NextResponse.json({ kegiatan: kg, dasbor: d, terpotong: perc.terpotong || kes.terpotong, pengaturan: { ...peng, status: statusJadwal(peng, Date.now()) }, boleh_kelola: boleh(izin, menuDasbor(kg.jenis), "kelola", kg.id) });
  } catch {
    return galat("Gagal memuat dasbor Vanguard.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat("Mode lihat (masuk sebagai) tidak dapat mengubah pengaturan.", 403);
    let badan: unknown;
    try { badan = await req.json(); } catch { return galat("Isi permintaan tidak sah."); }
    const b = (typeof badan === "object" && badan !== null ? badan : {}) as Record<string, unknown>;
    const id = typeof b.kegiatan === "number" && Number.isInteger(b.kegiatan) && b.kegiatan > 0 ? b.kegiatan : null;
    if (!id) return galat("Kegiatan tidak sah.");
    const { data: k } = await db.from("sigap_kegiatan").select("id, nama, jenis").eq("id", id).maybeSingle();
    if (!k) return galat("Kegiatan tidak ditemukan.", 404);
    const kg = k as { id: number; nama: string; jenis: string };
    const { izin } = await izinAkun(db as Db, akunId);
    if (!boleh(izin, menuDasbor(kg.jenis), "kelola", kg.id)) return galat("Tidak punya izin mengatur Vanguard kegiatan ini.", 403);
    const cek = periksaSimpan(b.pengaturan);
    if (!cek.ok) return galat(cek.pesan);
    const { data: akun } = await db.from("sigap_akun").select("nama").eq("id", akunId).maybeSingle();
    const oleh = (akun as { nama?: string } | null)?.nama ?? `akun ${akunId}`;
    const s = await simpanPengaturan(db as Db, kg.id, cek.pengaturan, oleh);
    if (!s.ok) return galat(s.pesan, 500);
    await catatAudit(db as Db, akunId, "vanguard_pengaturan", { kegiatan_id: kg.id, pengaturan: cek.pengaturan });
    return NextResponse.json({ tersimpan: true, pengaturan: { ...cek.pengaturan, status: statusJadwal(cek.pengaturan, Date.now()) } });
  } catch {
    return galat("Gagal menyimpan pengaturan Vanguard.", 500);
  }
}
