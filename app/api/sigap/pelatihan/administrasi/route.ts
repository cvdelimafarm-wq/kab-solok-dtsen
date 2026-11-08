// app/api/sigap/pelatihan/administrasi/route.ts
//
// (8 Okt 2026) SIGAP > Kelola Pelatihan > Administrasi. Izin menu `pelatihan.administrasi` (lihat = pantau & cetak;
// kelola = tambah/keluarkan peserta manual & simpan narasi laporan). Cakupan kelas: lihat cakupanKelas()
// di lib/sigapAdministrasi.ts. Aksi tulis dicatat di sigap_audit.
//
// GET ?bagian=ringkas                          -> cakupan kelas, kelas bawaan, izin
// GET ?bagian=peserta&kelas=N                  -> peserta kelas + status pengisian Transport Lokal + statistik
// GET ?bagian=peserta|cetak|pulsa_csv ... &kelompok=instruktur  -> daftar instruktur (terpisah); tanpa kelompok = peserta + panitia
// GET ?bagian=kandidat&kelas=N&q=teks          -> pencarian Mitra+organik (belum jadi peserta) utk ditambahkan manual
// GET ?bagian=narasi&kelas=N                   -> narasi Laporan Pelatihan & Laporan Instruktur tersimpan
// GET ?bagian=pulsa_csv&kelas=N                  -> CSV nomor HP pengisian pulsa peserta kelas (diisi peserta lewat pop-up)
// GET ?bagian=foto_ringkas                    -> (9 Okt 2026) jumlah foto lampiran per kelas cakupan; (9 Nov 2026) + ringkasan per hari (4 per hari per kelas)
// GET ?bagian=foto&kelas=N                     -> foto lampiran laporan (tautan sementara); unggah/hapus: ./foto/route.ts
// GET ?bagian=cetak&kelas=N&penugasan=1,2&jenis=kwitansi,visum,daftar_hadir&format=gabungan|zip[&unduh=1]
// POST {aksi:"tambah_peserta", kelas, akun_id, peran?}   -> peserta manual / panitia / instruktur (hanya administrasi; peran ppl|pml|korwil|panitia|instruktur)
// POST {aksi:"keluarkan_peserta", penugasan_id}          -> nonaktifkan peserta manual (tidak menghapus data)
// POST {aksi:"simpan_narasi", kelas, jenis:"pelatihan"|"instruktur", ringkasan, kendala, catatan}

import { NextRequest, NextResponse } from "next/server";
import { catatAudit } from "@/lib/sigapAkses";
import { GalatSpj, headerBerkas } from "@/lib/sigapDokumen";
import { undanganUntuk } from "@/lib/sigapTesDb";
import { muatSkema } from "@/lib/sigapNilai";
import { ringkasSkema } from "@/lib/sigapNilaiHitung";
import { hariIniWib } from "@/lib/sigap";
import { SUMBER_ADMINISTRASI, buatCetak, kelompokDari, tambahPesertaAdministrasi, csvPulsaKelas, galatJson, kelasBoleh, muatFotoLaporan, muatNarasi, muatPeserta, parseJenisCetak, siapkanAdministrasi, MAKS_FOTO_LAPORAN, hitungFotoLaporan, muatHariKegiatan } from "@/lib/sigapAdministrasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const galat = galatJson;

export async function GET(req: NextRequest) {
  try {
    const k = await siapkanAdministrasi(req, false);
    if (k instanceof NextResponse) return k;
    const sp = req.nextUrl.searchParams;
    const bagian = sp.get("bagian") ?? "ringkas";

    if (bagian === "ringkas") {
      return NextResponse.json({ nama: k.akun.nama, boleh_kelola: k.bisaKelola, kelas: k.cakupan.kelas, semua_kelas: k.cakupan.semua, kelas_bawaan: k.cakupan.bawaan, tanggal: (await undanganUntuk(k.db, k.kegiatanId)).tanggal_iso });
    }
    // (9 Okt 2026) pengingat panitia: jumlah foto lampiran per kelas yang boleh diakses akun
    if (bagian === "foto_ringkas") {
      const [kelasFoto, hari, keg] = await Promise.all([hitungFotoLaporan(k.db, k.kegiatanId, k.cakupan.kelas), muatHariKegiatan(k.db, k.kegiatanId), k.db.from("sigap_kegiatan").select("nama").eq("id", k.kegiatanId).maybeSingle()]);
      return NextResponse.json({ boleh_kelola: k.bisaKelola, maks: MAKS_FOTO_LAPORAN, per_hari: MAKS_FOTO_LAPORAN, hari, hari_ini: hariIniWib(), nama: (keg.data?.nama as string | null) ?? null, kegiatan_id: k.kegiatanId, kelas: kelasFoto });
    }

    const kelas = kelasBoleh(k, sp.get("kelas"));
    if (kelas instanceof NextResponse) return kelas;

    if (bagian === "peserta") {
      const [peserta, { skema, tersimpan }] = await Promise.all([muatPeserta(k.db, k.kegiatanId, kelas, { nilai: true, kelompok: kelompokDari(sp.get("kelompok")) }), muatSkema(k.db, k.kegiatanId)]);
      const hitung = (s: string) => peserta.filter((p) => p.status === s).length;
      return NextResponse.json({
        kelas,
        stat: { peserta: peserta.length, belum: hitung("belum"), draft: hitung("draft"), sudah: hitung("sudah"), terverifikasi: hitung("terverifikasi"), pulsa: peserta.filter((p) => p.pulsa).length },
        skema: { ...skema, ringkas: ringkasSkema(skema), tersimpan },
        peserta,
      });
    }

    if (bagian === "kandidat") {
      const q = (sp.get("q") ?? "").trim().replace(/[%,()*]/g, " ").trim();
      if (q.length < 2) return NextResponse.json({ kandidat: [] });
      const { data: ak } = await k.db.from("sigap_akun").select("id, nama, jenis, alamat_kecamatan").eq("aktif", true).ilike("nama", `%${q}%`).order("nama").limit(40);
      const ids = (ak ?? []).map((a) => a.id as number);
      const { data: pen } = ids.length ? await k.db.from("sigap_penugasan").select("akun_id, aktif, kelas").eq("kegiatan_id", k.kegiatanId).in("akun_id", ids) : { data: [] as Record<string, unknown>[] };
      const sudah = new Map((pen ?? []).filter((p) => p.aktif).map((p) => [p.akun_id as number, p.kelas as number | null]));
      return NextResponse.json({
        kandidat: (ak ?? [])
          .filter((a) => !sudah.has(a.id as number))
          .slice(0, 20)
          .map((a) => ({ akun_id: a.id as number, nama: String(a.nama ?? ""), jenis: String(a.jenis ?? "mitra"), kecamatan: (a.alamat_kecamatan as string | null) ?? null })),
        sudah_peserta: (ak ?? []).filter((a) => sudah.has(a.id as number)).map((a) => ({ akun_id: a.id as number, nama: String(a.nama ?? ""), kelas: sudah.get(a.id as number) ?? null })),
      });
    }

    if (bagian === "pulsa_csv") {
      const isi = await csvPulsaKelas(k.db, k.kegiatanId, kelas, kelompokDari(sp.get("kelompok")));
      await catatAudit(k.db, k.akun.id, "pelatihan_administrasi_unduh_pulsa", { kelas });
      return new NextResponse(isi, {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Nomor_Pulsa_Pelatihan_Kelas${kelas}.csv`)}`, "Cache-Control": "no-store" },
      });
    }

    if (bagian === "foto") return NextResponse.json({ kelas, ...(await muatFotoLaporan(k.db, k.kegiatanId, kelas)) });

    if (bagian === "narasi") return NextResponse.json({ kelas, ...(await muatNarasi(k.db, k.kegiatanId, kelas)) });

    if (bagian === "cetak") {
      const ids = (sp.get("penugasan") ?? "").split(",").map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
      if (ids.length === 0) return galat("Pilih minimal 1 petugas.");
      const jenis = parseJenisCetak(sp.get("jenis"));
      if (jenis.spj.length + jenis.pelatihan.length === 0) return galat("Pilih minimal 1 jenis dokumen.");
      const peserta = await muatPeserta(k.db, k.kegiatanId, kelas, { kelompok: kelompokDari(sp.get("kelompok")) });
      const pilih = ids.map((id) => peserta.find((p) => p.penugasan_id === id)).filter((p): p is NonNullable<typeof p> => !!p);
      if (pilih.length !== new Set(ids).size) return galat("Ada petugas yang bukan peserta kelas ini atau sudah tidak aktif. Muat ulang halaman.", 400);
      const urut = pilih.sort((a, b) => a.nama.localeCompare(b.nama));
      const format = sp.get("format") === "zip" ? "zip" : "gabungan";
      const hasil = await buatCetak(k.db, k.kegiatanId, kelas, urut, jenis, format);
      await catatAudit(k.db, k.akun.id, "pelatihan_administrasi_cetak", { kelas, petugas: urut.length, jenis, format });
      const disposisi = sp.get("unduh") === "1" || format === "zip" ? "attachment" : "inline";
      return new NextResponse(Buffer.from(hasil.bytes), { status: 200, headers: headerBerkas(hasil, disposisi) });
    }

    return galat("Bagian tidak dikenal.");
  } catch (e) {
    if (e instanceof GalatSpj) return galat(e.message, e.status);
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const k = await siapkanAdministrasi(req, true);
    if (k instanceof NextResponse) return k;
    const aksi = String(body?.aksi ?? "");

    if (aksi === "tambah_peserta") {
      const kelas = kelasBoleh(k, body?.kelas);
      if (kelas instanceof NextResponse) return kelas;
      const h = await tambahPesertaAdministrasi(k.db, k.kegiatanId, { akunId: Number(body?.akun_id), peran: String(body?.peran ?? "ppl"), kelas });
      if (!h.ok) return galat(h.pesan, h.status);
      await catatAudit(k.db, k.akun.id, "pelatihan_administrasi_tambah_peserta", { akun_id: Number(body?.akun_id), nama: h.nama, kelas, peran: String(body?.peran ?? "ppl"), penugasan_id: h.penugasan_id });
      return NextResponse.json({ ok: true, penugasan_id: h.penugasan_id });
    }

    if (aksi === "keluarkan_peserta") {
      const id = Number(body?.penugasan_id);
      const { data: p } = await k.db.from("sigap_penugasan").select("id, akun_id, kelas, sumber, aktif").eq("id", id).eq("kegiatan_id", k.kegiatanId).maybeSingle();
      if (!p || !p.aktif) return galat("Peserta tidak ditemukan.", 404);
      if (p.sumber !== SUMBER_ADMINISTRASI) return galat("Hanya peserta tambahan manual yang boleh dikeluarkan dari sini.", 403);
      const kelas = kelasBoleh(k, p.kelas);
      if (kelas instanceof NextResponse) return kelas;
      const { error } = await k.db.from("sigap_penugasan").update({ aktif: false }).eq("id", id);
      if (error) return galat(error.message, 500);
      await catatAudit(k.db, k.akun.id, "pelatihan_administrasi_keluarkan_peserta", { penugasan_id: id, akun_id: p.akun_id, kelas });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "simpan_narasi") {
      const kelas = kelasBoleh(k, body?.kelas);
      if (kelas instanceof NextResponse) return kelas;
      const jenis = body?.jenis === "instruktur" ? "instruktur" : body?.jenis === "pelatihan" ? "pelatihan" : null;
      if (!jenis) return galat("Jenis laporan tidak valid.");
      const teks = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 4000) : null);
      const baris = { kegiatan_id: k.kegiatanId, kelas, jenis, ringkasan: teks(body?.ringkasan), kendala: teks(body?.kendala), catatan: teks(body?.catatan), diubah_at: new Date().toISOString(), diubah_oleh: `${k.akun.nama} (#${k.akun.id})` };
      const { error } = await k.db.from("sigap_pelatihan_laporan").upsert(baris, { onConflict: "kegiatan_id,kelas,jenis" });
      if (error) return galat(error.message, 500);
      await catatAudit(k.db, k.akun.id, "pelatihan_administrasi_simpan_narasi", { kelas, jenis });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
