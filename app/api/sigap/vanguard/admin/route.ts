// app/api/sigap/vanguard/admin/route.ts
//
// (1 Nov 2026) VANGUARD V3a: dasbor BPS Kabupaten Solok. Hanya baca. Izin: kegiatan pelatihan = menu `pelatihan.kelola`; kegiatan lain = `translok.monitoring`
// (tingkat lihat, sesuai lingkup kegiatan; lib/vanguard/dasbor.ts `menuDasbor`). Akun yang sedang "masuk sebagai" boleh melihat (hanya baca).
//   GET                                        -> { daftar:[{id, nama, jenis, menyala, percobaan}] } kegiatan yang boleh dilihat dan memakai Vanguard
//   GET ?kegiatan=ID                           -> { kegiatan, dasbor, terpotong }
//   GET ?kegiatan=ID&format=csv&bagian=skor|kesalahan -> berkas CSV (vanguard_skor_YYYYMMDD.csv / vanguard_kesalahan_YYYYMMDD.csv)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { boleh, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { keadaanVanguard } from "@/lib/vanguardAkses";
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
    const d = susunDasbor(peserta, perc.baris, kes.baris, namaLain);

    if (p.get("format") === "csv") {
      const bagian = p.get("bagian") === "kesalahan" ? "kesalahan" : "skor";
      const tgl = hariWib(new Date().toISOString()).replace(/-/g, "");
      const isi = bagian === "kesalahan" ? csvKesalahan(peserta.concat(idSemua.filter((i) => !penugasan.some((x) => x.akun_id === i)).map((i) => ({ akun_id: i, nama: namaLain[i], peran: null }))), kes.baris) : csvSkor(d);
      return new NextResponse(isi, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="vanguard_${bagian}_${tgl}.csv"`, "cache-control": "no-store" } });
    }
    return NextResponse.json({ kegiatan: kg, dasbor: d, terpotong: perc.terpotong || kes.terpotong });
  } catch {
    return galat("Gagal memuat dasbor Vanguard.", 500);
  }
}
