// app/api/portal/pendataan/dokumen/route.ts
//
// (29 Okt 2026) Dokumen hasil pemeriksaan (PDF scan) dari PML. Tabel: bencana_dokumen_periksa (20261029g). Berkas: sigap-files/pemeriksaan/<kegiatan>/<pml>/<hash>.pdf.
// Logika murni ada di lib/dokumenPeriksa.ts.
//
// GET                          -> PML: { dokumen[] } milik timnya (PML saja; PPL ditolak)
// GET ?semua=1[&k=<kegiatan>]  -> admin/supervisor (izin bencana.admin: lihat): { dokumen[] dengan nama PML dan Sub SLS }
// GET ?unduh=<id>              -> { url, nama } tautan unduhan 5 menit. Boleh: admin (bencana.admin lihat) atau PML pemilik dokumen.
// POST multipart               -> PML: bidang berkas (PDF, maks 15 MB), judul, keterangan?, idsubsls?, tanggal_periksa? ; isi sama dari PML sama = duplikat (aman diulang)
// POST {aksi:"tarik", id}      -> PML menarik dokumennya (dihapus_at; berkas tidak dihapus)
// "Masuk sebagai" hanya boleh melihat. Semua perubahan dicatat di sigap_audit.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { ambilTim } from "@/lib/portal/pendataan";
import { BUCKET_SIGAP, type Db } from "@/lib/sigap";
import { galatServer } from "@/lib/sigapGalat";
import {
  KEGIATAN_DOKUMEN_BAWAAN,
  adalahPdf,
  jalurDokumen,
  namaUnduhan,
  periksaIsianDokumen,
  periksaUkuranDokumen,
  type DokumenPeriksa,
  type DokumenPeriksaAdmin,
} from "@/lib/dokumenPeriksa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAKS_AKTIF_PER_PML = 300;
const TTL_TAUTAN_DETIK = 300;
const KOLOM = "id, kegiatan_id, pml_id, akun_id, judul, keterangan, idsubsls, tanggal_periksa, file_path, nama_asli, ukuran_byte, diunggah_at";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

type Baris = {
  id: number; kegiatan_id: number; pml_id: number; akun_id: number; judul: string; keterangan: string | null; idsubsls: string | null;
  tanggal_periksa: string | null; file_path: string; nama_asli: string | null; ukuran_byte: number; diunggah_at: string;
};

const bacaK = (s: string | null): number => (s && /^\d{1,7}$/.test(s) && Number(s) >= 1 ? Number(s) : KEGIATAN_DOKUMEN_BAWAAN);

function keDokumen(b: Baris, oleh: string | null): DokumenPeriksa {
  return {
    id: b.id, kegiatan_id: b.kegiatan_id, pml_id: b.pml_id, judul: b.judul, keterangan: b.keterangan, idsubsls: b.idsubsls, tanggal_periksa: b.tanggal_periksa,
    nama_asli: b.nama_asli, ukuran_byte: b.ukuran_byte, diunggah_at: b.diunggah_at, diunggah_oleh: oleh,
  };
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function bolehAdmin(db: Db, akunId: number): Promise<boolean> {
  const { izin } = await izinAkun(db, akunId);
  return boleh(izin, "bencana.admin", "lihat");
}

async function namaAkun(db: Db, ids: number[]): Promise<Map<number, string>> {
  const uniq = Array.from(new Set(ids));
  const peta = new Map<number, string>();
  if (uniq.length === 0) return peta;
  const { data } = await db.from("sigap_akun").select("id, nama").in("id", uniq);
  for (const r of (data ?? []) as { id: number; nama: string }[]) peta.set(Number(r.id), String(r.nama ?? ""));
  return peta;
}

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const sp = req.nextUrl.searchParams;
  try {
    const unduh = sp.get("unduh");
    if (unduh) {
      const id = Number(unduh);
      if (!Number.isInteger(id) || id <= 0) return galat("Dokumen tidak ditemukan.", 404);
      const { data: b } = await db.from("bencana_dokumen_periksa").select(KOLOM).eq("id", id).is("dihapus_at", null).maybeSingle();
      if (!b) return galat("Dokumen tidak ditemukan atau sudah ditarik.", 404);
      const dok = b as Baris;
      const admin = await bolehAdmin(db, akun.id);
      if (!admin) {
        const tim = await ambilTim(db, akun);
        if (!tim || tim.saya.peran !== "pml" || tim.pml.id !== dok.pml_id) return galat("Tidak berhak mengunduh dokumen ini.", 403);
      }
      const { data: pml } = await db.from("bencana_petugas").select("nama").eq("id", dok.pml_id).maybeSingle();
      const nama = namaUnduhan(String((pml as { nama?: string } | null)?.nama ?? ""), dok.judul);
      const { data: ttd, error } = await db.storage.from(BUCKET_SIGAP).createSignedUrl(dok.file_path, TTL_TAUTAN_DETIK, { download: nama });
      if (error || !ttd?.signedUrl) return galat("Berkas tidak dapat dibuka. Coba lagi sebentar lagi.", 502);
      if (admin) await catatAudit(db, akun.id, "pendataan.dokumen_unduh", { dokumen_id: dok.id, pml_id: dok.pml_id }).catch(() => undefined);
      return NextResponse.json({ url: ttd.signedUrl, nama });
    }

    if (sp.get("semua") === "1") {
      if (!(await bolehAdmin(db, akun.id))) return galat("Tidak punya akses admin pendataan.", 403);
      const keg = bacaK(sp.get("k"));
      const { data, error } = await db.from("bencana_dokumen_periksa").select(KOLOM).eq("kegiatan_id", keg).is("dihapus_at", null).order("diunggah_at", { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);
      const baris = (data ?? []) as Baris[];
      const pmlIds = Array.from(new Set(baris.map((x) => x.pml_id)));
      const subIds = Array.from(new Set(baris.map((x) => x.idsubsls).filter((x): x is string => !!x)));
      const [pmlR, subR, oleh] = await Promise.all([
        pmlIds.length ? db.from("bencana_petugas").select("id, nama").in("id", pmlIds) : Promise.resolve({ data: [] as unknown[] }),
        subIds.length ? db.from("bencana_wilayah").select("idsubsls, kecamatan, nagari, sls, sub_sls").in("idsubsls", subIds) : Promise.resolve({ data: [] as unknown[] }),
        namaAkun(db, baris.map((x) => x.akun_id)),
      ]);
      const namaPml = new Map(((pmlR.data ?? []) as { id: number; nama: string }[]).map((x) => [Number(x.id), String(x.nama)]));
      const namaSub = new Map(
        ((subR.data ?? []) as { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string }[]).map((w) => [w.idsubsls, `${w.nagari}, ${w.kecamatan} · SLS ${w.sls} Sub ${w.sub_sls}`])
      );
      const dokumen: DokumenPeriksaAdmin[] = baris.map((b) => ({
        ...keDokumen(b, oleh.get(b.akun_id) ?? null),
        pml_nama: namaPml.get(b.pml_id) ?? `PML ${b.pml_id}`,
        sub_nama: b.idsubsls ? namaSub.get(b.idsubsls) ?? b.idsubsls : null,
      }));
      return NextResponse.json({ sekarang: new Date().toISOString(), kegiatan_id: keg, dokumen });
    }

    const tim = await ambilTim(db, akun);
    if (!tim) return galat("Dokumen pemeriksaan khusus anggota tim PML dan PPL.", 403);
    if (tim.saya.peran !== "pml") return galat("Unggah dan daftar dokumen pemeriksaan khusus PML.", 403);
    const { data, error } = await db
      .from("bencana_dokumen_periksa")
      .select(KOLOM)
      .eq("kegiatan_id", KEGIATAN_DOKUMEN_BAWAAN)
      .eq("pml_id", tim.pml.id)
      .is("dihapus_at", null)
      .order("diunggah_at", { ascending: false })
      .limit(MAKS_AKTIF_PER_PML);
    if (error) throw new Error(error.message);
    return NextResponse.json({ sekarang: new Date().toISOString(), dokumen: ((data ?? []) as Baris[]).map((b) => keDokumen(b, tim.pml.nama)) });
  } catch (e) {
    return galatServer("dokumen-periksa GET", e);
  }
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengunggah.', 403);
  try {
    const tim = await ambilTim(db, akun);
    if (!tim) return galat("Dokumen pemeriksaan khusus anggota tim PML dan PPL.", 403);
    if (tim.saya.peran !== "pml") return galat("Unggah dokumen pemeriksaan khusus PML.", 403);

    const tipe = req.headers.get("content-type") ?? "";
    if (!tipe.includes("multipart/form-data")) {
      const b = (await req.json().catch(() => null)) as { aksi?: unknown; id?: unknown } | null;
      if (!b || b.aksi !== "tarik") return galat("Aksi tidak dikenal.");
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return galat("Dokumen tidak ditemukan.", 404);
      const { data, error } = await db
        .from("bencana_dokumen_periksa")
        .update({ dihapus_at: new Date().toISOString(), dihapus_oleh: akun.id })
        .eq("id", id)
        .eq("pml_id", tim.pml.id)
        .is("dihapus_at", null)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return galat("Dokumen tidak ditemukan atau sudah ditarik.", 404);
      await catatAudit(db, akun.id, "pendataan.dokumen_tarik", { dokumen_id: id, pml_id: tim.pml.id }).catch(() => undefined);
      return NextResponse.json({ ok: true, id });
    }

    let form: FormData;
    try { form = await req.formData(); } catch { return galat("Isian tidak terbaca."); }
    const berkas = form.get("berkas");
    if (!(berkas instanceof File)) return galat("Berkas PDF wajib dipilih.");
    const salahUkuran = periksaUkuranDokumen(berkas.size);
    if (salahUkuran) return galat(salahUkuran, berkas.size > 0 ? 413 : 400);
    const buf = await berkas.arrayBuffer();
    if (!adalahPdf(new Uint8Array(buf))) return galat("Berkas bukan PDF. Simpan hasil scan sebagai PDF lalu pilih lagi.", 415);
    const isian = periksaIsianDokumen(
      { judul: form.get("judul"), keterangan: form.get("keterangan"), idsubsls: form.get("idsubsls"), tanggal_periksa: form.get("tanggal_periksa") },
      tim.sub.map((s) => s.idsubsls),
      berkas.name || null
    );
    if (!isian.ok) return galat(isian.pesan);

    const sha = await sha256Hex(buf);
    const keg = KEGIATAN_DOKUMEN_BAWAAN;
    const { data: ada } = await db.from("bencana_dokumen_periksa").select(KOLOM).eq("kegiatan_id", keg).eq("pml_id", tim.pml.id).eq("sha256", sha).is("dihapus_at", null).maybeSingle();
    if (ada) return NextResponse.json({ ok: true, duplikat: true, dokumen: keDokumen(ada as Baris, tim.pml.nama) });

    const { count } = await db.from("bencana_dokumen_periksa").select("id", { count: "exact", head: true }).eq("kegiatan_id", keg).eq("pml_id", tim.pml.id).is("dihapus_at", null);
    if ((count ?? 0) >= MAKS_AKTIF_PER_PML) return galat(`Sudah ada ${MAKS_AKTIF_PER_PML} dokumen aktif. Tarik dokumen yang tidak diperlukan dulu.`, 409);

    const jalur = jalurDokumen(keg, tim.pml.id, sha);
    const { error: eUnggah } = await db.storage.from(BUCKET_SIGAP).upload(jalur, Buffer.from(buf), { contentType: "application/pdf", upsert: true });
    if (eUnggah) return galat("Berkas gagal disimpan. Coba lagi.", 502);

    const { data: baru, error: eSimpan } = await db
      .from("bencana_dokumen_periksa")
      .insert({
        kegiatan_id: keg, pml_id: tim.pml.id, akun_id: akun.id, judul: isian.isi.judul, keterangan: isian.isi.keterangan, idsubsls: isian.isi.idsubsls,
        tanggal_periksa: isian.isi.tanggal_periksa, file_path: jalur, nama_asli: (berkas.name || "").slice(0, 200) || null, ukuran_byte: berkas.size, sha256: sha,
      })
      .select(KOLOM)
      .single();
    if (eSimpan) {
      // dua kiriman identik bersamaan: yang kedua kalah balapan, anggap duplikat
      if ((eSimpan as { code?: string }).code === "23505") {
        const { data: sama } = await db.from("bencana_dokumen_periksa").select(KOLOM).eq("kegiatan_id", keg).eq("pml_id", tim.pml.id).eq("sha256", sha).is("dihapus_at", null).maybeSingle();
        if (sama) return NextResponse.json({ ok: true, duplikat: true, dokumen: keDokumen(sama as Baris, tim.pml.nama) });
      }
      throw new Error(eSimpan.message);
    }
    await catatAudit(db, akun.id, "pendataan.dokumen_unggah", { dokumen_id: (baru as Baris).id, pml_id: tim.pml.id, ukuran: berkas.size, idsubsls: isian.isi.idsubsls }).catch(() => undefined);
    return NextResponse.json({ ok: true, duplikat: false, dokumen: keDokumen(baru as Baris, tim.pml.nama) });
  } catch (e) {
    return galatServer("dokumen-periksa POST", e);
  }
}
