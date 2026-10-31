// app/api/sigap/pengguna/route.ts
//
// (31 Okt 2026) Manajemen Pengguna: daftar akun Mitra Kepka dan Pegawai organik + penanda anggota pool per tahun.
//   GET  ?jenis=mitra|organik&tahun=2026   -> { tahun, jenis, tabel_pool_siap, boleh_kelola, ringkasan, akun[] }   (izin akses.kelola, level lihat)
//   Mitra juga membawa nagari, no_hp, email, tanggal_lahir, nilai_se2026 (bencana_mitra / bencana_petugas; penilaian dari sigap_penilaian_mitra bila SQL 20261031j sudah jalan; lihat lib/portal/rincianAkun).
//   POST { aksi: "ubah_profil_pegawai", profil_id, domisili_kecamatan, domisili_nagari, kantor_kecamatan, kantor_semua? }  (izin akses.kelola, level kelola)
//   POST { aksi: "set_pool", akun_ids[], tahun, status, no_kepka?, catatan? }                                   (izin akses.kelola, level kelola)
//   jenis=organik juga mengirim { pegawai[], ringkasan_pegawai, profil_siap } dari sigap_pegawai_profil (SQL 20261031h); ?nip=penuh (izin kelola) membuka NIP utuh dan dicatat di audit.
// NIK/NIP tidak dikirim utuh: hanya empat digit terakhir (samarkanId). Tabel sigap_mitra_pool belum dibuat = daftar tetap tampil, penanda dinonaktifkan.
// Akun "masuk sebagai" (aktor lain) tidak boleh mengubah pool.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, boleh, catatAudit, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { bentukDaftarPegawai, periksaUbahProfil, ringkasPegawai, susunDaftarWilayah, type DaftarWilayah, type ProfilPegawai } from "@/lib/pegawaiOrganik";
import { periksaPermintaanPool, ringkas, samarkanId, tahunSah, type AkunPengguna, type BarisPool, type JenisPengguna } from "@/lib/penggunaPool";
import { rincianPerAkun } from "@/lib/portal/rincianAkun";

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
  mitra_id: number | null;
  petugas_bencana_id: number | null;
  domisili_lat: number | null;
  domisili_lng: number | null;
  domisili_sumber: string | null;
  verif_at: string | null;
  verif_jarak_m: number | null;
  terakhir_masuk_at: string | null;
  aktif: boolean;
};

const KOLOM = "id, nama, jenis, nik, nip, alamat_kecamatan, mitra_id, petugas_bencana_id, domisili_lat, domisili_lng, domisili_sumber, verif_at, verif_jarak_m, terakhir_masuk_at, aktif";

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

    const rincian = await rincianPerAkun(db, akun);
    const akunNagari = akun.map((a) => ({ ...a, alamat_nagari: rincian.get(a.id)?.nagari ?? null }));

    const daftar: AkunPengguna[] = akun.map((a) => ({
      id: a.id,
      nama: a.nama,
      jenis,
      nik: samarkanId(a.nik),
      nip: samarkanId(a.nip),
      alamat_kecamatan: a.alamat_kecamatan,
      alamat_nagari: rincian.get(a.id)?.nagari ?? null,
      // data pendaftaran hanya untuk Mitra (halaman ini butuh izin akses.kelola)
      ...(jenis === "mitra"
        ? { no_hp: rincian.get(a.id)?.no_hp ?? null, email: rincian.get(a.id)?.email ?? null, tanggal_lahir: rincian.get(a.id)?.tanggal_lahir ?? null, nilai_se2026: rincian.get(a.id)?.nilai_se2026 ?? null }
        : {}),
      domisili_lat: a.domisili_lat,
      domisili_lng: a.domisili_lng,
      domisili_sumber: a.domisili_sumber,
      verif_at: a.verif_at,
      verif_jarak_m: a.verif_jarak_m,
      terakhir_masuk_at: a.terakhir_masuk_at,
      aktif: a.aktif,
      pool: jenis === "mitra" ? peta.get(a.id) ?? null : null,
    }));

    const bolehKelola = boleh(s.izin, "akses.kelola", "kelola");

    // Profil kepegawaian (hanya jenis organik). Tabel belum dibuat -> profil_siap=false, tampilan kembali ke daftar akun biasa.
    let pegawai = null;
    let ringkasanPegawai = null;
    let profilSiap = false;
    let wilayah: DaftarWilayah | null = null;
    if (jenis === "organik") {
      const { data, error } = await db
        .from("sigap_pegawai_profil")
        .select("id, nip_lama, urutan, akun_id, nama_lengkap, nip_baru, jabatan, status_pegawai, jenis_kelamin, tanggal_lahir, tmt, tmt_teks, email, domisili_kecamatan, domisili_nagari, kantor_kecamatan")
        .order("urutan");
      if (!error) {
        profilSiap = true;
        const nipPenuh = sp.get("nip") === "penuh" && bolehKelola;
        const baris = bentukDaftarPegawai((data ?? []) as ProfilPegawai[], akunNagari, Date.now(), nipPenuh);
        pegawai = baris;
        ringkasanPegawai = ringkasPegawai(baris);
        // daftar kecamatan/nagari untuk pilihan isian (bencana_wilayah, ±1.100 baris)
        const { data: w } = await db.from("bencana_wilayah").select("kecamatan, nagari").range(0, 1999);
        wilayah = susunDaftarWilayah((w ?? []) as { kecamatan: string | null; nagari: string | null }[]);
        if (nipPenuh) await catatAudit(db, s.akunId, "lihat_nip_pegawai", { jumlah: baris.length }).catch(() => undefined);
      }
    }

    return NextResponse.json({
      tahun,
      jenis,
      tabel_pool_siap: tabelSiap,
      boleh_kelola: bolehKelola,
      ringkasan: ringkas(daftar),
      akun: daftar,
      profil_siap: profilSiap,
      pegawai,
      ringkasan_pegawai: ringkasanPegawai,
      wilayah,
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
    if (isi?.aksi === "ubah_profil_pegawai") {
      const u = periksaUbahProfil(isi);
      if (!u.ok) return galat(u.pesan);
      const n = u.nilai;
      const { data: ada, error: e0 } = await db.from("sigap_pegawai_profil").select("id").eq("id", n.profil_id).maybeSingle();
      if (e0) return galat("Gagal membaca profil. Pastikan SQL 20261031h sudah dijalankan.", 500);
      if (!ada) return galat("Pegawai tidak ditemukan.", 404);
      const sekarang = new Date().toISOString();
      const { error: e1 } = await db.from("sigap_pegawai_profil").update({ domisili_kecamatan: n.domisili_kecamatan, domisili_nagari: n.domisili_nagari, kantor_kecamatan: n.kantor_kecamatan, diubah_at: sekarang }).eq("id", n.profil_id);
      if (e1) return galat("Gagal menyimpan.", 500);
      let semua = 0;
      if (n.kantor_semua) {
        const { data: u2, error: e2 } = await db.from("sigap_pegawai_profil").update({ kantor_kecamatan: n.kantor_kecamatan, diubah_at: sekarang }).gte("id", 0).select("id");
        if (e2) return galat("Domisili tersimpan, tetapi kecamatan kantor semua pegawai gagal diubah.", 500);
        semua = (u2 ?? []).length;
      }
      await catatAudit(db, s.akunId, "profil_pegawai", { profil_id: n.profil_id, kantor_semua: n.kantor_semua, diubah: semua || 1 }).catch(() => undefined);
      return NextResponse.json({ ok: true, diubah_semua: semua });
    }
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
