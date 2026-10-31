// app/api/sigap/pengguna/route.ts
//
// (31 Okt 2026) Manajemen Pengguna: daftar akun Mitra Kepka dan Pegawai organik + penanda anggota pool per tahun.
//   GET  ?jenis=mitra|organik&tahun=2026   -> { tahun, jenis, tabel_pool_siap, boleh_kelola, ringkasan, akun[] }   (izin akses.kelola, level lihat)
//   POST { aksi: "set_pool", akun_ids[], tahun, status, no_kepka?, catatan? }                                   (izin akses.kelola, level kelola)
// NIK/NIP tidak dikirim utuh: hanya empat digit terakhir (samarkanId). Tabel sigap_mitra_pool belum dibuat = daftar tetap tampil, penanda dinonaktifkan.
// Akun "masuk sebagai" (aktor lain) tidak boleh mengubah pool.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, boleh, catatAudit, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { periksaPermintaanPool, ringkas, samarkanId, tahunSah, type AkunPengguna, type BarisPool, type JenisPengguna } from "@/lib/penggunaPool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

function tahunIniWib(): number {
  return Number(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 4));
}

async function sesi(req: NextRequest, db: Db) {
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return null;
  const { data: a } = await db.from("sigap_akun").select("id, aktif").eq("id", akunId).maybeSingle();
  if (!a || !a.aktif) return null;
  const { izin } = await izinAkun(db, akunId);
  return { akunId, izin };
}

type BarisAkun = {
  id: number;
  nama: string;
  jenis: string;
  nik: string | null;
  nip: string | null;
  alamat_kecamatan: string | null;
  domisili_lat: number | null;
  domisili_lng: number | null;
  domisili_sumber: string | null;
  verif_at: string | null;
  verif_jarak_m: number | null;
  terakhir_masuk_at: string | null;
  aktif: boolean;
};

const KOLOM = "id, nama, jenis, nik, nip, alamat_kecamatan, domisili_lat, domisili_lng, domisili_sumber, verif_at, verif_jarak_m, terakhir_masuk_at, aktif";

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const s = await sesi(req, db);
    if (!s) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (!boleh(s.izin, "akses.kelola", "lihat")) return galat("Tidak punya izin.", 403);

    const sp = req.nextUrl.searchParams;
    const jenis: JenisPengguna = sp.get("jenis") === "organik" ? "organik" : "mitra";
    const tahun = tahunSah(sp.get("tahun")) ?? tahunIniWib();

    // Akun per jenis (maks ±800; dibaca per halaman 1000 agar aman bila bertambah)
    const akun: BarisAkun[] = [];
    for (let dari = 0; dari < 5000; dari += 1000) {
      const { data, error } = await db.from("sigap_akun").select(KOLOM).eq("jenis", jenis).order("nama").range(dari, dari + 999);
      if (error) return galat("Gagal membaca akun.", 500);
      akun.push(...((data ?? []) as BarisAkun[]));
      if ((data ?? []).length < 1000) break;
    }

    // Pool hanya bermakna untuk Mitra
    const peta = new Map<number, BarisPool>();
    let tabelSiap = true;
    if (jenis === "mitra") {
      for (let dari = 0; dari < 5000; dari += 1000) {
        const { data, error } = await db.from("sigap_mitra_pool").select("akun_id, status, no_kepka, catatan").eq("tahun", tahun).order("akun_id").range(dari, dari + 999);
        if (error) {
          tabelSiap = false;
          break;
        }
        for (const b of data ?? []) peta.set(b.akun_id as number, { status: b.status as BarisPool["status"], no_kepka: (b.no_kepka as string | null) ?? null, catatan: (b.catatan as string | null) ?? null });
        if ((data ?? []).length < 1000) break;
      }
    }

    const daftar: AkunPengguna[] = akun.map((a) => ({
      id: a.id,
      nama: a.nama,
      jenis,
      nik: samarkanId(a.nik),
      nip: samarkanId(a.nip),
      alamat_kecamatan: a.alamat_kecamatan,
      domisili_lat: a.domisili_lat,
      domisili_lng: a.domisili_lng,
      domisili_sumber: a.domisili_sumber,
      verif_at: a.verif_at,
      verif_jarak_m: a.verif_jarak_m,
      terakhir_masuk_at: a.terakhir_masuk_at,
      aktif: a.aktif,
      pool: jenis === "mitra" ? peta.get(a.id) ?? null : null,
    }));

    return NextResponse.json({
      tahun,
      jenis,
      tabel_pool_siap: tabelSiap,
      boleh_kelola: boleh(s.izin, "akses.kelola", "kelola"),
      ringkasan: ringkas(daftar),
      akun: daftar,
    });
  } catch {
    return galat("Gagal memuat daftar pengguna.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const s = await sesi(req, db);
    if (!s) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (!boleh(s.izin, "akses.kelola", "kelola")) return galat("Tidak punya izin.", 403);
    if (aktorDariHeader(req.headers) !== null) return galat("Tidak dapat mengubah pool saat masuk sebagai akun lain.", 403);

    const isi = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!isi || isi.aksi !== "set_pool") return galat("Aksi tidak dikenal.");
    const p = periksaPermintaanPool(isi);
    if (!p.ok) return galat(p.pesan);
    const { akun_ids, tahun, status, no_kepka, catatan } = p.nilai;

    // Hanya akun jenis Mitra yang boleh masuk pool
    const { data: sah, error: e1 } = await db.from("sigap_akun").select("id").eq("jenis", "mitra").in("id", akun_ids);
    if (e1) return galat("Gagal memeriksa akun.", 500);
    const idSah = (sah ?? []).map((x: { id: number }) => x.id);
    if (idSah.length === 0) return galat("Tidak ada akun Mitra pada pilihan itu.");

    // Catatan/no Kepka yang kosong tidak menimpa isian lama
    const baris = idSah.map((id: number) => {
      const b: Record<string, unknown> = { akun_id: id, tahun, status, diubah_oleh: s.akunId, diubah_at: new Date().toISOString() };
      if (no_kepka !== null) b.no_kepka = no_kepka;
      if (catatan !== null) b.catatan = catatan;
      return b;
    });
    const { error: e2 } = await db.from("sigap_mitra_pool").upsert(baris, { onConflict: "akun_id,tahun" });
    if (e2) return galat("Gagal menyimpan. Pastikan tabel sigap_mitra_pool sudah dibuat (SQL 20261031e).", 500);

    await catatAudit(db, s.akunId, "pool_mitra", { tahun, status, jumlah: idSah.length, dilewati: akun_ids.length - idSah.length }).catch(() => undefined);
    return NextResponse.json({ ok: true, diproses: idSah.length, dilewati: akun_ids.length - idSah.length });
  } catch {
    return galat("Gagal menyimpan pool.", 500);
  }
}
