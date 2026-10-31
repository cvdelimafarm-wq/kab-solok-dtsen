// app/api/sigap/seleksi/route.ts
//
// (31 Okt 2026) Perekrutan petugas oleh PJ survei. Paket 2: rancangan + wilayah sampel + pratinjau kandidat. Paket 3: buka/tutup pendaftaran, push ajakan,
// pesan undangan berlink, daftar pendaftar. Tes, nilai, peringkat, dan pengumuman menyusul.
//   GET ?kegiatan_id=N                    -> { tabel_siap, boleh_kelola, seleksi[] }
//   GET ?id=N                             -> rancangan lengkap (+ wilayah), pratinjau kandidat, dan pendaftar
//   GET ?aksi=undangan&id=N               -> { teks } pesan undangan (tempel ke chat) berisi tautan registrasi
//   GET ?aksi=cari_wilayah&q=             -> sub-SLS (bencana_wilayah + koordinat) untuk dipilih sebagai wilayah sampel
//   POST { aksi: "simpan", ...rancangan } -> buat/ubah rancangan (hanya saat draft)
//   POST { aksi: "buka" | "tutup" | "batal", id }
//   POST { aksi: "ajakan", id }           -> push ajakan ke yang memenuhi syarat dan belum mendaftar (jeda 10 menit)
// Izin: Penugasan petugas (translok.penugasan) pada kegiatan itu, atau Kelola Peran & Akses. Tidak ada hapus.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, boleh, catatAudit, izinAkun, sesiDariHeader, type PetaIzin } from "@/lib/sigapAkses";
import { kirimKeAkun } from "@/lib/sigapPush";
import { nilaiKelayakan, normalWilayah, periksaRancangan, ringkasKelayakan, sisaKebutuhan, bacaSyarat, type HasilKelayakan, type WilayahSeleksi } from "@/lib/seleksiSyarat";
import { pesanPushAjakan, pesanUndangan } from "@/lib/seleksiDaftar";
import { bacaKandidat, bacaWilayah, tahunPoolKegiatan } from "@/lib/portal/seleksiKandidat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string | string[], status = 400) => NextResponse.json({ error: Array.isArray(pesan) ? pesan.join(" ") : pesan, rincian: Array.isArray(pesan) ? pesan : undefined }, { status });
const JEDA_AJAKAN_MS = 10 * 60_000;

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

async function sesi(req: NextRequest, db: Db) {
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return null;
  const { data: a } = await db.from("sigap_akun").select("id, aktif").eq("id", akunId).maybeSingle();
  if (!a || !a.aktif) return null;
  const { izin } = await izinAkun(db, akunId);
  return { akunId, izin };
}

const bolehLihat = (izin: PetaIzin, kegiatanId: number) => boleh(izin, "translok.penugasan", "lihat", kegiatanId) || boleh(izin, "akses.kelola", "lihat");
const bolehKelola = (izin: PetaIzin, kegiatanId: number) => boleh(izin, "translok.penugasan", "kelola", kegiatanId) || boleh(izin, "akses.kelola", "kelola");

type BarisSeleksi = {
  id: number; kegiatan_id: number; nama: string; jalur: string; status: string; kebutuhan_ppl: number; kebutuhan_pml: number; sudah_ppl: number; sudah_pml: number;
  syarat: unknown; jadwal_buka: string | null; jadwal_tutup: string | null; peringkat_level: string; tampil_nilai: boolean; dibuat_at: string; diubah_at: string;
};
const KOLOM_SELEKSI = "id, kegiatan_id, nama, jalur, status, kebutuhan_ppl, kebutuhan_pml, sudah_ppl, sudah_pml, syarat, jadwal_buka, jadwal_tutup, peringkat_level, tampil_nilai, dibuat_at, diubah_at";

type Tambahan = { dibuka_at: string | null; ditutup_at: string | null; ajakan_at: string | null; ajakan_jumlah: number };
/** Kolom paket 3 (SQL 20261031g); belum ada = nilai kosong, bukan galat. */
async function bacaTambahan(db: Db, id: number): Promise<Tambahan> {
  const { data, error } = await db.from("sigap_seleksi").select("dibuka_at, ditutup_at, ajakan_at, ajakan_jumlah").eq("id", id).maybeSingle();
  if (error || !data) return { dibuka_at: null, ditutup_at: null, ajakan_at: null, ajakan_jumlah: 0 };
  return data as Tambahan;
}

type Pendaftar = { akun_id: number; nama: string; kecamatan: string | null; peran: string; status: string; mendaftar_at: string };
async function bacaPendaftar(db: Db, seleksiId: number): Promise<{ siap: boolean; daftar: Pendaftar[] }> {
  const { data, error } = await db.from("sigap_seleksi_peserta").select("akun_id, peran, status, mendaftar_at").eq("seleksi_id", seleksiId).order("mendaftar_at");
  if (error) return { siap: false, daftar: [] };
  const ids = (data ?? []).map((x: { akun_id: number }) => x.akun_id);
  const { data: akun } = ids.length ? await db.from("sigap_akun").select("id, nama, alamat_kecamatan").in("id", ids) : { data: [] as { id: number; nama: string; alamat_kecamatan: string | null }[] };
  const nama = new Map<number, { nama: string; kec: string | null }>((akun ?? []).map((a: { id: number; nama: string; alamat_kecamatan: string | null }) => [a.id, { nama: a.nama, kec: a.alamat_kecamatan }]));
  return {
    siap: true,
    daftar: (data ?? []).map((x: { akun_id: number; peran: string; status: string; mendaftar_at: string }) => ({
      akun_id: x.akun_id, nama: nama.get(x.akun_id)?.nama ?? `#${x.akun_id}`, kecamatan: nama.get(x.akun_id)?.kec ?? null, peran: x.peran, status: x.status, mendaftar_at: x.mendaftar_at,
    })),
  };
}

async function muatSeleksi(db: Db, id: number) {
  const { data, error } = await db.from("sigap_seleksi").select(KOLOM_SELEKSI).eq("id", id).maybeSingle();
  return { baris: (data as BarisSeleksi | null) ?? null, galatDb: !!error };
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const s = await sesi(req, db);
    if (!s) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const sp = req.nextUrl.searchParams;

    if (sp.get("aksi") === "cari_wilayah") {
      const q = (sp.get("q") ?? "").trim().replace(/[%_,()]/g, " ").trim();
      if (q.length < 2) return NextResponse.json({ wilayah: [] });
      if (!(boleh(s.izin, "translok.penugasan", "lihat") || boleh(s.izin, "akses.kelola", "lihat"))) return galat("Tidak punya izin.", 403);
      const { data: w } = await db
        .from("bencana_wilayah")
        .select("idsubsls, kecamatan, nagari, sls, sub_sls")
        .or(`nagari.ilike.%${q}%,sls.ilike.%${q}%,kecamatan.ilike.%${q}%`)
        .order("idsubsls")
        .limit(60);
      const ids = (w ?? []).map((x: { idsubsls: string }) => x.idsubsls);
      const { data: k } = ids.length ? await db.from("bencana_subsls_koordinat").select("idsubsls, lat, lon").in("idsubsls", ids) : { data: [] as { idsubsls: string; lat: number; lon: number }[] };
      const peta = new Map<string, { lat: number; lon: number }>((k ?? []).map((x: { idsubsls: string; lat: number; lon: number }) => [x.idsubsls, x]));
      const hasil: WilayahSeleksi[] = (w ?? []).map((x: { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string }) => ({
        kode: x.idsubsls,
        nama: `${x.nagari} · ${x.sls}${x.sub_sls ? ` (${x.sub_sls})` : ""}`,
        kecamatan: x.kecamatan,
        nagari: x.nagari,
        lat: peta.get(x.idsubsls)?.lat ?? null,
        lng: peta.get(x.idsubsls)?.lon ?? null,
        jumlah_sampel: 0,
        kebutuhan_ppl: 0,
        kebutuhan_pml: 0,
      }));
      return NextResponse.json({ wilayah: hasil });
    }

    const id = Number(sp.get("id")) || null;
    if (id) {
      const { baris: b, galatDb } = await muatSeleksi(db, id);
      if (galatDb) return galat("Tabel seleksi belum dibuat (SQL 20261031f).", 500);
      if (!b) return galat("Seleksi tidak ditemukan.", 404);
      if (!bolehLihat(s.izin, b.kegiatan_id)) return galat("Tidak punya izin.", 403);

      if (sp.get("aksi") === "undangan") {
        const { data: keg } = await db.from("sigap_kegiatan").select("nama").eq("id", b.kegiatan_id).maybeSingle();
        return NextResponse.json({ teks: pesanUndangan({ namaKegiatan: (keg?.nama as string) ?? "kegiatan", namaSeleksi: b.nama, tutup: b.jadwal_tutup, seleksiId: b.id, asal: req.nextUrl.origin }) });
      }

      const wilayah = await bacaWilayah(db, id);
      const syarat = bacaSyarat(b.syarat);
      const tahun = await tahunPoolKegiatan(db, b.kegiatan_id);
      const { calon, poolSiap } = await bacaKandidat(db, tahun);
      const hasil: { id: number; nama: string; kecamatan: string | null; nagari: string | null; kelayakan: HasilKelayakan }[] = calon.map((c) => ({
        id: c.id,
        nama: c.nama,
        kecamatan: c.kecamatan,
        nagari: c.nagari ? normalWilayah(c.nagari) : null,
        kelayakan: nilaiKelayakan(c, wilayah, syarat),
      }));
      const urut = { memenuhi: 0, perlu_lokasi: 1, tidak: 2 } as const;
      hasil.sort((x, y) => urut[x.kelayakan.status] - urut[y.kelayakan.status] || (x.kelayakan.jarak_km ?? 1e9) - (y.kelayakan.jarak_km ?? 1e9) || x.nama.localeCompare(y.nama, "id"));
      const tambahan = await bacaTambahan(db, id);
      const pendaftar = await bacaPendaftar(db, id);
      return NextResponse.json({
        seleksi: { ...b, ...tambahan, syarat, wilayah, sisa_ppl: sisaKebutuhan(b.kebutuhan_ppl, b.sudah_ppl), sisa_pml: sisaKebutuhan(b.kebutuhan_pml, b.sudah_pml) },
        pratinjau: { tahun, pool_siap: poolSiap, ringkasan: ringkasKelayakan(hasil.map((h) => h.kelayakan)), kandidat: hasil },
        pendaftar: { tabel_siap: pendaftar.siap, daftar: pendaftar.daftar },
        boleh_kelola: bolehKelola(s.izin, b.kegiatan_id),
      });
    }

    const kegiatanId = Number(sp.get("kegiatan_id")) || null;
    if (!kegiatanId) return galat("Pilih kegiatan.");
    if (!bolehLihat(s.izin, kegiatanId)) return galat("Tidak punya izin.", 403);
    const { data, error } = await db.from("sigap_seleksi").select(KOLOM_SELEKSI).eq("kegiatan_id", kegiatanId).order("id", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ tabel_siap: false, boleh_kelola: bolehKelola(s.izin, kegiatanId), seleksi: [] });
    return NextResponse.json({ tabel_siap: true, boleh_kelola: bolehKelola(s.izin, kegiatanId), seleksi: data ?? [] });
  } catch {
    return galat("Gagal memuat seleksi.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const s = await sesi(req, db);
    if (!s) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers) !== null) return galat("Tidak dapat mengubah seleksi saat masuk sebagai akun lain.", 403);
    const isi = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!isi) return galat("Isian tidak terbaca.");

    // ---- perubahan status & ajakan
    if (isi.aksi === "batal" || isi.aksi === "buka" || isi.aksi === "tutup" || isi.aksi === "ajakan") {
      const id = Number(isi.id);
      if (!Number.isInteger(id) || id <= 0) return galat("Seleksi tidak sah.");
      const { baris: r } = await muatSeleksi(db, id);
      if (!r) return galat("Seleksi tidak ditemukan.", 404);
      if (!bolehKelola(s.izin, r.kegiatan_id)) return galat("Tidak punya izin.", 403);
      const sekarang = new Date().toISOString();

      if (isi.aksi === "batal") {
        if (r.status === "batal") return NextResponse.json({ ok: true });
        const { error } = await db.from("sigap_seleksi").update({ status: "batal", diubah_oleh: s.akunId, diubah_at: sekarang }).eq("id", id);
        if (error) return galat("Gagal membatalkan.", 500);
        await catatAudit(db, s.akunId, "seleksi_batal", { id }).catch(() => undefined);
        return NextResponse.json({ ok: true });
      }

      if (isi.aksi === "buka") {
        if (r.status !== "draft") return galat("Hanya seleksi berstatus draft yang dapat dibuka.");
        if (r.jalur !== "seleksi") return galat("Penunjukan langsung tidak memakai pendaftaran.");
        if (sisaKebutuhan(r.kebutuhan_ppl, r.sudah_ppl) + sisaKebutuhan(r.kebutuhan_pml, r.sudah_pml) <= 0) return galat("Tidak ada sisa kebutuhan yang perlu diseleksi.");
        const { error } = await db.from("sigap_seleksi").update({ status: "dibuka", dibuka_at: sekarang, diubah_oleh: s.akunId, diubah_at: sekarang }).eq("id", id);
        if (error) return galat("Gagal membuka. Pastikan SQL 20261031g sudah dijalankan.", 500);
        await catatAudit(db, s.akunId, "seleksi_buka", { id }).catch(() => undefined);
        return NextResponse.json({ ok: true });
      }

      if (isi.aksi === "tutup") {
        if (r.status !== "dibuka") return galat("Hanya seleksi yang sedang dibuka yang dapat ditutup.");
        const { error } = await db.from("sigap_seleksi").update({ status: "ditutup", ditutup_at: sekarang, diubah_oleh: s.akunId, diubah_at: sekarang }).eq("id", id);
        if (error) return galat("Gagal menutup.", 500);
        await catatAudit(db, s.akunId, "seleksi_tutup", { id }).catch(() => undefined);
        return NextResponse.json({ ok: true });
      }

      // ajakan
      if (r.status !== "dibuka") return galat("Ajakan hanya dapat dikirim saat pendaftaran dibuka.");
      const tambahan = await bacaTambahan(db, id);
      if (tambahan.ajakan_at && Date.now() - Date.parse(tambahan.ajakan_at) < JEDA_AJAKAN_MS) return galat("Ajakan baru saja dikirim. Tunggu 10 menit sebelum mengirim lagi.", 429);
      const wilayah = await bacaWilayah(db, id);
      const syarat = bacaSyarat(r.syarat);
      const tahun = await tahunPoolKegiatan(db, r.kegiatan_id);
      const { calon } = await bacaKandidat(db, tahun);
      const { daftar } = await bacaPendaftar(db, id);
      const sudah = new Set(daftar.filter((d) => d.status === "terdaftar").map((d) => d.akun_id));
      const sasaran = calon.filter((c) => !sudah.has(c.id) && nilaiKelayakan(c, wilayah, syarat).status === "memenuhi").map((c) => c.id);
      if (sasaran.length === 0) return galat("Tidak ada Mitra memenuhi syarat yang belum mendaftar.");
      const { data: keg } = await db.from("sigap_kegiatan").select("nama").eq("id", r.kegiatan_id).maybeSingle();
      const pesan = pesanPushAjakan({ namaSeleksi: r.nama, namaKegiatan: (keg?.nama as string) ?? "kegiatan", tutup: r.jadwal_tutup, seleksiId: id });
      const h = await kirimKeAkun(db, sasaran, { ...pesan, tag: `seleksi-${id}` });
      try {
        await db.from("sigap_push_log").insert({ kegiatan_id: r.kegiatan_id, oleh_akun_id: s.akunId, jenis: "seleksi_ajakan", judul: pesan.judul, isi: pesan.isi, url: pesan.url, jumlah_akun: h.akun_berlangganan.length, jumlah_perangkat: h.perangkat, terkirim: h.terkirim, gagal: h.gagal });
      } catch {
        /* riwayat hanya pelengkap */
      }
      await db.from("sigap_seleksi").update({ ajakan_at: sekarang, ajakan_jumlah: tambahan.ajakan_jumlah + 1 }).eq("id", id);
      await catatAudit(db, s.akunId, "seleksi_ajakan", { id, sasaran: sasaran.length, terkirim: h.terkirim }).catch(() => undefined);
      return NextResponse.json({ ok: true, sasaran: sasaran.length, berlangganan: h.akun_berlangganan.length, tanpa_push: sasaran.length - h.akun_berlangganan.length, terkirim: h.terkirim, gagal: h.gagal });
    }

    if (isi.aksi !== "simpan") return galat("Aksi tidak dikenal.");
    const p = periksaRancangan(isi);
    if (!p.ok) return galat(p.galat);
    const r = p.nilai;
    if (!bolehKelola(s.izin, r.kegiatan_id)) return galat("Tidak punya izin pada kegiatan ini.", 403);
    const { data: keg } = await db.from("sigap_kegiatan").select("id").eq("id", r.kegiatan_id).maybeSingle();
    if (!keg) return galat("Kegiatan tidak ditemukan.", 404);

    const nilai = {
      nama: r.nama, jalur: r.jalur, kebutuhan_ppl: r.kebutuhan_ppl, kebutuhan_pml: r.kebutuhan_pml, sudah_ppl: r.sudah_ppl, sudah_pml: r.sudah_pml,
      syarat: r.syarat, jadwal_buka: r.jadwal_buka, jadwal_tutup: r.jadwal_tutup, peringkat_level: r.peringkat_level, tampil_nilai: r.tampil_nilai,
      diubah_oleh: s.akunId, diubah_at: new Date().toISOString(),
    };
    let id = r.id ?? null;
    if (id) {
      const { data: ada } = await db.from("sigap_seleksi").select("id, kegiatan_id, status").eq("id", id).maybeSingle();
      if (!ada || ada.kegiatan_id !== r.kegiatan_id) return galat("Seleksi tidak ditemukan pada kegiatan ini.", 404);
      if (ada.status !== "draft") return galat("Hanya seleksi berstatus draft yang dapat diubah.");
      const { error } = await db.from("sigap_seleksi").update(nilai).eq("id", id);
      if (error) return galat("Gagal menyimpan.", 500);
    } else {
      const { data: baru, error } = await db.from("sigap_seleksi").insert({ ...nilai, kegiatan_id: r.kegiatan_id, dibuat_oleh: s.akunId }).select("id").single();
      if (error || !baru) return galat("Gagal menyimpan. Pastikan tabel seleksi sudah dibuat (SQL 20261031f).", 500);
      id = baru.id as number;
    }

    const { error: eHapus } = await db.from("sigap_seleksi_wilayah").delete().eq("seleksi_id", id);
    if (eHapus) return galat("Gagal memperbarui wilayah.", 500);
    if (r.wilayah.length > 0) {
      const { error: eIsi } = await db.from("sigap_seleksi_wilayah").insert(r.wilayah.map((w) => ({ seleksi_id: id, ...w })));
      if (eIsi) return galat("Rancangan tersimpan, tetapi wilayah gagal disimpan. Simpan ulang.", 500);
    }
    await catatAudit(db, s.akunId, r.id ? "seleksi_ubah" : "seleksi_buat", { id, kegiatan_id: r.kegiatan_id, jalur: r.jalur }).catch(() => undefined);
    return NextResponse.json({ ok: true, id });
  } catch {
    return galat("Gagal menyimpan seleksi.", 500);
  }
}
