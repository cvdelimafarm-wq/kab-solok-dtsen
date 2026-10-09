// app/api/sigap/pelatihan/administrasi/route.ts
//
// (8 Okt 2026) SIGAP > Kelola Pelatihan > Administrasi. Izin menu `pelatihan.administrasi` (lihat = pantau & cetak;
// kelola = tambah/keluarkan peserta manual & simpan narasi laporan). Cakupan kelas: lihat cakupanKelas()
// di lib/sigapAdministrasi.ts. Aksi tulis dicatat di sigap_audit.
//
// GET ?bagian=ringkas                          -> cakupan kelas, kelas bawaan, izin
// GET ?bagian=peserta&kelas=N                  -> peserta kelas + status pengisian Transport Lokal + statistik
// GET ?bagian=kandidat&kelas=N&q=teks          -> pencarian Mitra+organik (belum jadi peserta) utk ditambahkan manual
// GET ?bagian=narasi&kelas=N                   -> narasi Laporan Pelatihan & Laporan Instruktur tersimpan
// GET ?bagian=pulsa_csv&kelas=N                  -> CSV nomor HP pengisian pulsa peserta kelas (diisi peserta lewat pop-up)
// GET ?bagian=foto_ringkas                    -> (9 Okt 2026) jumlah foto lampiran per kelas cakupan + batas
// GET ?bagian=foto&kelas=N                     -> foto lampiran laporan (tautan sementara); unggah/hapus: ./foto/route.ts
// GET ?bagian=cetak&kelas=N&penugasan=1,2&jenis=kwitansi,visum,daftar_hadir&format=gabungan|zip[&unduh=1]
// POST {aksi:"tambah_peserta", kelas, akun_id, peran?}   -> peserta manual (hanya administrasi)
// POST {aksi:"keluarkan_peserta", penugasan_id}          -> nonaktifkan peserta manual (tidak menghapus data)
// POST {aksi:"simpan_narasi", kelas, jenis:"pelatihan"|"instruktur", ringkasan, kendala, catatan}

import { NextRequest, NextResponse } from "next/server";
import { catatAudit } from "@/lib/sigapAkses";
import { GalatSpj, headerBerkas } from "@/lib/sigapDokumen";
import { UNDANGAN } from "@/lib/sigapTes";
import { muatSkema } from "@/lib/sigapNilai";
import { ringkasSkema } from "@/lib/sigapNilaiHitung";
import { PERAN_PESERTA, SUMBER_ADMINISTRASI, buatCetak, csvPulsaKelas, galatJson, kelasBoleh, muatFotoLaporan, muatNarasi, muatPeserta, parseJenisCetak, siapkanAdministrasi, MAKS_FOTO_LAPORAN, hitungFotoLaporan } from "@/lib/sigapAdministrasi";

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
      return NextResponse.json({ nama: k.akun.nama, boleh_kelola: k.bisaKelola, kelas: k.cakupan.kelas, semua_kelas: k.cakupan.semua, kelas_bawaan: k.cakupan.bawaan, tanggal: UNDANGAN.tanggal_iso });
    }
    // (9 Okt 2026) pengingat panitia: jumlah foto lampiran per kelas yang boleh diakses akun
    if (bagian === "foto_ringkas") {
      return NextResponse.json({ boleh_kelola: k.bisaKelola, maks: MAKS_FOTO_LAPORAN, kelas: await hitungFotoLaporan(k.db, k.kegiatanId, k.cakupan.kelas) });
    }

    const kelas = kelasBoleh(k, sp.get("kelas"));
    if (kelas instanceof NextResponse) return kelas;

    if (bagian === "peserta") {
      const [peserta, { skema, tersimpan }] = await Promise.all([muatPeserta(k.db, k.kegiatanId, kelas, { nilai: true }), muatSkema(k.db, k.kegiatanId)]);
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
      const isi = await csvPulsaKelas(k.db, k.kegiatanId, kelas);
      await catatAudit(k.db, k.akun.id, "pelatihan_administrasi_unduh_pulsa", { kelas });
      return new NextResponse(isi, {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Nomor_Pulsa_Pelatihan_Kelas${kelas}.csv`)}`, "Cache-Control": "no-store" },
      });
    }

    if (bagian === "foto") return NextResponse.json({ kelas, foto: await muatFotoLaporan(k.db, k.kegiatanId, kelas) });

    if (bagian === "narasi") return NextResponse.json({ kelas, ...(await muatNarasi(k.db, k.kegiatanId, kelas)) });

    if (bagian === "cetak") {
      const ids = (sp.get("penugasan") ?? "").split(",").map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
      if (ids.length === 0) return galat("Pilih minimal 1 petugas.");
      const jenis = parseJenisCetak(sp.get("jenis"));
      if (jenis.spj.length + jenis.pelatihan.length === 0) return galat("Pilih minimal 1 jenis dokumen.");
      const peserta = await muatPeserta(k.db, k.kegiatanId, kelas);
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
      const akunId = Number(body?.akun_id);
      const peran = String(body?.peran ?? "ppl").toLowerCase();
      if (!Number.isInteger(akunId) || akunId <= 0) return galat("Akun tidak valid.");
      if (!(PERAN_PESERTA as readonly string[]).includes(peran)) return galat("Peran harus PPL, PML, atau Korwil.");
      const { data: a } = await k.db.from("sigap_akun").select("id, nama, aktif").eq("id", akunId).maybeSingle();
      if (!a || !a.aktif) return galat("Akun tidak ditemukan atau tidak aktif.", 404);
      const { data: tarif } = await k.db.from("sigap_kegiatan_tarif").select("peran").eq("kegiatan_id", k.kegiatanId).eq("peran", peran).maybeSingle();
      if (!tarif) return galat(`Tarif untuk peran ${peran.toUpperCase()} belum diatur pada kegiatan ini.`);

      const { data: ada } = await k.db.from("sigap_penugasan").select("id, aktif").eq("kegiatan_id", k.kegiatanId).eq("akun_id", akunId).maybeSingle();
      if (ada?.aktif) return galat("Orang ini sudah menjadi peserta pelatihan.", 409);
      let penugasanId: number;
      if (ada) {
        const { error } = await k.db.from("sigap_penugasan").update({ aktif: true, peran, kelas, sumber: SUMBER_ADMINISTRASI }).eq("id", ada.id);
        if (error) return galat(error.message, 500);
        penugasanId = ada.id as number;
      } else {
        const { data: baru, error } = await k.db.from("sigap_penugasan").insert({ kegiatan_id: k.kegiatanId, akun_id: akunId, peran, kelas, aktif: true, sumber: SUMBER_ADMINISTRASI }).select("id").single();
        if (error || !baru) return galat(error?.message ?? "Gagal menambah peserta.", 500);
        penugasanId = baru.id as number;
      }
      // Hari kerja pelatihan, supaya halaman Transport Lokal peserta ini bisa diisi & SPJ-nya bisa dicetak.
      const { error: eHk } = await k.db.from("sigap_hari_kerja").upsert({ penugasan_id: penugasanId, akun_id: akunId, tanggal: UNDANGAN.tanggal_iso }, { onConflict: "penugasan_id,tanggal", ignoreDuplicates: true });
      if (eHk) {
        const bentrok = eHk.code === "23505";
        return galat(bentrok ? "Orang ini sudah punya hari kerja Transport Lokal pada tanggal pelatihan di kegiatan lain, sehingga tidak bisa ditambahkan." : eHk.message, bentrok ? 409 : 500);
      }
      await catatAudit(k.db, k.akun.id, "pelatihan_administrasi_tambah_peserta", { akun_id: akunId, nama: a.nama, kelas, peran, penugasan_id: penugasanId });
      return NextResponse.json({ ok: true, penugasan_id: penugasanId });
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
