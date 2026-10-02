// app/api/penyisiran/spj/laporan/route.ts
//
// GET  -> dua mode:
//   - mode "daftar" (default, tanpa query khusus): daftar Surat Tugas
//     milik petugas yg login, masing2 disertai daftar Laporan (per
//     tanggal) yg sudah pernah dibuat utknya.
//   - mode "preview" (?preview_surat_tugas_id=&preview_tanggal=): hitung
//     & KEMBALIKAN rekap template (persis logika yg dipakai POST mode
//     "template") TANPA menyimpan apa pun -- dipakai kartu Laporan
//     (app/penyisiran/administrasi-spj.tsx LaporanForm) utk menampilkan
//     "data hasil penyisiran" LANGSUNG saat petugas memilih tanggal,
//     sebelum/tanpa perlu menekan Simpan (permintaan user: "untuk laporan
//     langsung ditampilkan data hasil penyisiran").
// POST -> buat/perbarui (upsert, kunci: surat_tugas_id+petugas_jenis+
//         petugas_id+tanggal) SATU Laporan utk SATU tanggal dlm rentang
//         Surat Tugas tsb. Dua mode:
//   - "template": rekap ditarik OTOMATIS dari penyisiran_usaha, sumbernya
//     kolom identifikasi_ppl/identifikasi_ppl_at/identifikasi_ppl_oleh/
//     identifikasi_ppl_role yg ditulis tab Identifikasi Jorong/Tetangga
//     (BUKAN status_kunjungan/penyisiran_oleh_id tab "Penyisiran Usaha" --
//     itu role & tabel akun yg beda konteksnya, walau utk jenis
//     "penyisiran" kebetulan sama2 mengacu ke petugas_penyisiran_akun;
//     dipilih identifikasi_ppl krn itulah aktivitas yg BENAR2 dilakukan
//     lewat akun yg dipakai login menu SPJ ini, dan satu2nya yg tersedia
//     jg utk jenis "tetangga"), DITAMBAH rekap status_kunjungan (tab
//     "Penyisiran Usaha") yg tercatat lewat akun YANG SAMA (nama sama
//     persis) pada tanggal itu, ditarik dari penyisiran_riwayat (audit
//     log) -- lihat rekapStatusKunjungan di hitungRekapTemplate(). Hasil
//     tarikannya DISIMPAN sbg snapshot (kolom rekap_snapshot, jsonb)
//     supaya laporan yg sudah jadi tidak berubah diam2 kalau datanya
//     diedit belakangan di tab Identifikasi.
//   - "bebas": narasi bebas dari petugas, rekap_snapshot null.
//
// Kalau mode "template" tapi TIDAK ADA aktivitas yg CUKUP tercatat pada
// tanggal itu (lihat lib/spjLaporanAturan.ts utk aturan lengkapnya --
// singkatnya: SEBELUM 20 Sept 2026 cukup salah satu dari Penyisiran ATAU
// Identifikasi, SEJAK 20 Sept 2026 Penyisiran WAJIB & Identifikasi jadi
// opsional), request DITOLAK dgn pesan yg mengarahkan petugas melengkapi
// data di tab yg sesuai dulu, atau pakai mode "bebas" -- BUKAN diam2
// menyimpan laporan kosong. Batasan ini HANYA berlaku saat SIMPAN (POST) --
// mode "preview" (GET) tetap mengembalikan rekap apa adanya (boleh nol) krn
// tujuannya cuma menampilkan, bukan menyimpan.

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, tabelAkun, roleUntukJenis, type SpjSession } from "@/lib/spjAuth";
import { TANGGAL_WAJIB_PENYISIRAN, laporanTemplateBolehDisimpan } from "@/lib/spjLaporanAturan";
import { daftarHariKerjaPetugas } from "@/lib/spjHariKerja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Tanggal HARI INI menurut zona waktu Asia/Jakarta (WIB) -- formula SAMA
// persis dgn tanggalBesokJakarta() di app/api/penyisiran/update/route.ts
// (cuma tanpa +1 hari), dipakai menggerbangi Laporan Susulan (lihat
// komentar besar "LAPORAN SUSULAN" di bawah) supaya tanggalnya harus
// benar2 SUDAH LEWAT, bukan hari ini/mendatang.
function hariIniJakarta(): string {
  const jakarta = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return jakarta.toISOString().slice(0, 10);
}

// ---------- LAPORAN SUSULAN ----------
//
// (2 Okt 2026) Fitur BARU -- permintaan user: "SEKARANG ADA KENDALA
// INDISIPLIN PETUGAS DALAM MEMBUAT LAPORAN" -- petugas lupa/telat mengisi
// status_kunjungan (tab Penyisiran Usaha) di HARI yang sama, jadi saat mau
// bikin Laporan utk tanggal yg sudah lewat, mode "template" biasa ditolak
// krn tidak ada aktivitas Penyisiran yg tercatat PADA TANGGAL ITU (lihat
// lib/spjLaporanAturan.ts) -- padahal petugas MUNGKIN SAJA benar2 bekerja
// hari itu, cuma telat mencatatnya di sistem.
//
// Jalan keluarnya BUKAN menghitung ulang dari penyisiran_usaha/riwayat
// (datanya memang tidak ada/terlewat dicatat), tapi membiarkan petugas
// mengisi REKAP JUMLAH SECARA MANUAL (dari ingatan/catatan lapangan
// sendiri) utk tanggal yg sudah lewat -- PERSIS sesuai keputusan user saat
// ditanya: "buat menu Laporan Terlewat, bentuknya formulir, pilih tanggal,
// jumlah diisi manual sesuai format laporan (boleh menarik data sbg
// referensi, tapi nilai yg disimpan tetap yg diisi manual)".
//
// SUPAYA TETAP BISA DIPERTANGGUNGJAWABKAN (bukan sekadar re-buka pintu
// fabrikasi yg sudah sengaja ditutup lib/spjLaporanAturan.ts), fitur ini
// diberi 3 pagar:
//  1. Tanggal WAJIB salah satu dari Hari Tugas yg SUDAH DITAG petugas ybs
//     sendiri (daftarHariKerjaPetugas) -- tidak bisa asal pilih tanggal yg
//     bahkan tidak pernah ditugaskan.
//  2. Tanggal WAJIB sudah lewat (< hari ini WIB) -- bukan utk tanggal
//     hari ini/mendatang (itu jalurnya mode "template"/"bebas" biasa).
//  3. HANYA utk tanggal yg BELUM PERNAH ada Laporan -- bukan jalan utk
//     menimpa Laporan yg sudah ada.
// Hasilnya tetap mode "template" (DB enum tdk perlu diubah) tapi
// rekap_snapshot ditandai `diisiSusulan: true` + `catatanKeterlambatan` +
// `diisiSusulanPada` (kapan SEBENARNYA diisi, beda dari `tanggal` yg
// diklaim) -- supaya PDF (lib/pdf/laporan.ts) & siapa pun yg audit
// belakangan SELALU bisa membedakan laporan susulan dari laporan yg
// benar2 diisi real-time, TIDAK PERNAH menyamarkannya sbg data asli.
const KUNCI_STATUS_SUSULAN = [
  "ditemukan",
  "tidak_ditemukan",
  "tidak_bisa",
  "sudah_didata_se2026",
  "tidak_ada_usaha",
] as const;

function tanggalBerikutnya(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

interface LokasiRekap {
  kecNama: string | null;
  nagariNama: string | null;
  slsNama: string | null;
  subslsKode: string | null;
  waktuMulai: string | null;
  waktuSelesai: string | null;
  jumlah: number;
}

interface RekapTemplate {
  lokasi: LokasiRekap[];
  rekapIdentifikasi: { ada: number; tidak_ada: number; ragu: number; belum: number };
  totalAktivitas: number;
  jumlahDokumentasi: number;
  // Rekap perubahan status_kunjungan (tab "Penyisiran Usaha") oleh akun yg
  // SAMA persis (nama), pada tanggal yg sama -- BARU, terpisah dari
  // rekapIdentifikasi di atas (yg sumbernya tab Identifikasi Jorong/
  // Tetangga) krn dua aktivitas beda meski sering dilakukan orang yg
  // sama. Kunci = nilai status_kunjungan (lihat STATUS_VALID di
  // app/api/penyisiran/update/route.ts), nilai = jumlah keluarga.
  rekapStatusKunjungan: Record<string, number>;
  // Rincian lokasi utk aktivitas Penyisiran Usaha (status_kunjungan) di
  // atas -- dibangun dgn men-join kode_identitas dari penyisiran_riwayat
  // balik ke penyisiran_usaha (utk kec/nagari/sls/subsls). BARU: sejak
  // Penyisiran Usaha jadi wajib (20 Sept 2026) & Identifikasi opsional,
  // `lokasi` (yg sumbernya kolom identifikasi_ppl_*) makin sering kosong --
  // field inilah sumber lokasi yg SEHARUSNYA dipakai laporan PDF sbg
  // utama, dgn `lokasi` (identifikasi) sbg fallback kalau ini kosong.
  lokasiPenyisiran: LokasiRekap[];
}

// Ditarik keluar dari POST supaya bisa dipakai bareng oleh mode "preview"
// (GET, tanpa menyimpan) -- lihat komentar panjang di atas file ini.
async function hitungRekapTemplate(
  supabase: SupabaseClient,
  session: SpjSession,
  nama: string,
  suratTugasId: number,
  tanggal: string
): Promise<RekapTemplate> {
  const batasAtas = tanggalBerikutnya(tanggal);

  const [{ data: rows, error: errRows }, { data: riwayat, error: errRiwayat }, { count: jumlahDokumentasi }] =
    await Promise.all([
      supabase
        .from("penyisiran_usaha")
        .select("kec_nama, nagari_nama, sls_nama, subsls_kode, identifikasi_ppl, identifikasi_ppl_at")
        .eq("identifikasi_ppl_role", roleUntukJenis(session.jenis))
        .eq("identifikasi_ppl_oleh", nama)
        .gte("identifikasi_ppl_at", `${tanggal}T00:00:00+07:00`)
        .lt("identifikasi_ppl_at", `${batasAtas}T00:00:00+07:00`),
      supabase
        .from("penyisiran_riwayat")
        .select("nilai_baru, kode_identitas, created_at")
        .eq("jenis", "status_kunjungan")
        .eq("oleh_nama", nama)
        .gte("created_at", `${tanggal}T00:00:00+07:00`)
        .lt("created_at", `${batasAtas}T00:00:00+07:00`),
      supabase
        .from("spj_dokumentasi_foto")
        .select("id", { count: "exact", head: true })
        .eq("surat_tugas_id", suratTugasId)
        .eq("petugas_jenis", session.jenis)
        .eq("petugas_id", session.petugasId)
        .eq("tanggal", tanggal),
    ]);
  if (errRows) throw new Error(errRows.message);
  if (errRiwayat) throw new Error(errRiwayat.message);

  const peta = new Map<string, LokasiRekap>();
  const rekapIdentifikasi = { ada: 0, tidak_ada: 0, ragu: 0, belum: 0 };
  for (const r of (rows ?? []) as {
    kec_nama: string | null;
    nagari_nama: string | null;
    sls_nama: string | null;
    subsls_kode: string | null;
    identifikasi_ppl: string | null;
    identifikasi_ppl_at: string | null;
  }[]) {
    const key = `${r.kec_nama ?? ""}|${r.nagari_nama ?? ""}|${r.sls_nama ?? ""}|${r.subsls_kode ?? ""}`;
    const at = r.identifikasi_ppl_at;
    const ada = peta.get(key);
    if (ada) {
      ada.jumlah += 1;
      if (at && (!ada.waktuMulai || at < ada.waktuMulai)) ada.waktuMulai = at;
      if (at && (!ada.waktuSelesai || at > ada.waktuSelesai)) ada.waktuSelesai = at;
    } else {
      peta.set(key, {
        kecNama: r.kec_nama,
        nagariNama: r.nagari_nama,
        slsNama: r.sls_nama,
        subslsKode: r.subsls_kode,
        waktuMulai: at,
        waktuSelesai: at,
        jumlah: 1,
      });
    }
    if (r.identifikasi_ppl && r.identifikasi_ppl in rekapIdentifikasi) {
      (rekapIdentifikasi as Record<string, number>)[r.identifikasi_ppl] += 1;
    }
  }
  const lokasi = [...peta.values()].sort((a, b) => (a.waktuMulai ?? "").localeCompare(b.waktuMulai ?? ""));

  const riwayatRows = (riwayat ?? []) as { nilai_baru: string; kode_identitas: string | null; created_at: string }[];

  const rekapStatusKunjungan: Record<string, number> = {};
  for (const r of riwayatRows) {
    rekapStatusKunjungan[r.nilai_baru] = (rekapStatusKunjungan[r.nilai_baru] ?? 0) + 1;
  }

  // Join balik kode_identitas (dari riwayat status_kunjungan) -> lokasi
  // usaha (penyisiran_usaha) -- lihat komentar di interface RekapTemplate.
  // jumlah per lokasi dihitung dari BANYAKNYA baris riwayat (bukan jumlah
  // kode_identitas unik) supaya totalnya SAMA PERSIS dgn jumlah di
  // rekapStatusKunjungan (konsisten dgn kartu "Keluarga dikunjungi").
  const kodeUnik = [...new Set(riwayatRows.map((r) => r.kode_identitas).filter((k): k is string => !!k))];
  const lokasiUsahaMap = new Map<
    string,
    { kec_nama: string | null; nagari_nama: string | null; sls_nama: string | null; subsls_kode: string | null }
  >();
  if (kodeUnik.length > 0) {
    const { data: usahaRows, error: errUsaha } = await supabase
      .from("penyisiran_usaha")
      .select("kode_identitas, kec_nama, nagari_nama, sls_nama, subsls_kode")
      .in("kode_identitas", kodeUnik);
    if (errUsaha) throw new Error(errUsaha.message);
    for (const u of (usahaRows ?? []) as {
      kode_identitas: string;
      kec_nama: string | null;
      nagari_nama: string | null;
      sls_nama: string | null;
      subsls_kode: string | null;
    }[]) {
      lokasiUsahaMap.set(u.kode_identitas, u);
    }
  }

  const petaPenyisiran = new Map<string, LokasiRekap>();
  for (const r of riwayatRows) {
    const u = r.kode_identitas ? lokasiUsahaMap.get(r.kode_identitas) : undefined;
    const key = `${u?.kec_nama ?? ""}|${u?.nagari_nama ?? ""}|${u?.sls_nama ?? ""}|${u?.subsls_kode ?? ""}`;
    const at = r.created_at;
    const ada = petaPenyisiran.get(key);
    if (ada) {
      ada.jumlah += 1;
      if (at && (!ada.waktuMulai || at < ada.waktuMulai)) ada.waktuMulai = at;
      if (at && (!ada.waktuSelesai || at > ada.waktuSelesai)) ada.waktuSelesai = at;
    } else {
      petaPenyisiran.set(key, {
        kecNama: u?.kec_nama ?? null,
        nagariNama: u?.nagari_nama ?? null,
        slsNama: u?.sls_nama ?? null,
        subslsKode: u?.subsls_kode ?? null,
        waktuMulai: at,
        waktuSelesai: at,
        jumlah: 1,
      });
    }
  }
  const lokasiPenyisiran = [...petaPenyisiran.values()].sort((a, b) => (a.waktuMulai ?? "").localeCompare(b.waktuMulai ?? ""));

  return {
    lokasi,
    rekapIdentifikasi,
    totalAktivitas: (rows ?? []).length,
    jumlahDokumentasi: jumlahDokumentasi ?? 0,
    rekapStatusKunjungan,
    lokasiPenyisiran,
  };
}

// Cek kepemilikan ST + rentang tanggal + ambil nama akun -- dipakai bareng
// oleh mode "preview" (GET) & POST, supaya validasinya SELALU konsisten.
async function pastikanStMilikSesiDanTanggal(
  supabase: SupabaseClient,
  session: SpjSession,
  suratTugasId: number,
  tanggal: string
): Promise<{ error: string; status: number } | { nama: string }> {
  const { data: taut, error: errTaut } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("id")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId)
    .maybeSingle();
  if (errTaut) return { error: errTaut.message, status: 500 };
  if (!taut) return { error: "Surat Tugas ini bukan milik Anda.", status: 403 };

  const { data: stRow, error: errStRow } = await supabase
    .from("spj_surat_tugas")
    .select("tanggal_mulai, tanggal_selesai")
    .eq("id", suratTugasId)
    .maybeSingle();
  if (errStRow) return { error: errStRow.message, status: 500 };
  if (!stRow) return { error: "Surat Tugas tidak ditemukan.", status: 404 };
  if (tanggal < stRow.tanggal_mulai || tanggal > stRow.tanggal_selesai) {
    return {
      error: `Tanggal harus dlm rentang ${stRow.tanggal_mulai} s/d ${stRow.tanggal_selesai} sesuai Surat Tugas.`,
      status: 400,
    };
  }

  const { data: akun } = await supabase.from(tabelAkun(session.jenis)).select("nama").eq("id", session.petugasId).maybeSingle();
  const nama = akun?.nama ?? null;
  if (!nama) return { error: "Akun petugas tidak ditemukan.", status: 404 };

  return { nama };
}

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  // ---------- Mode "preview" ----------
  const previewSuratTugasId = req.nextUrl.searchParams.get("preview_surat_tugas_id");
  const previewTanggal = req.nextUrl.searchParams.get("preview_tanggal");
  if (previewSuratTugasId && previewTanggal) {
    const suratTugasId = Number(previewSuratTugasId);
    if (!Number.isFinite(suratTugasId)) return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(previewTanggal)) {
      return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
    }
    const cek = await pastikanStMilikSesiDanTanggal(supabase, session, suratTugasId, previewTanggal);
    if ("error" in cek) return NextResponse.json({ error: cek.error }, { status: cek.status });
    try {
      const rekap = await hitungRekapTemplate(supabase, session, cek.nama, suratTugasId, previewTanggal);
      return NextResponse.json({ rekap });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal menghitung rekap." }, { status: 500 });
    }
  }

  // ---------- Mode "daftar" (default) ----------
  const { data: tautan, error: errTautan } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("surat_tugas_id")
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId);
  if (errTautan) return NextResponse.json({ error: errTautan.message }, { status: 500 });

  const ids = (tautan ?? []).map((t: { surat_tugas_id: number }) => t.surat_tugas_id);
  if (ids.length === 0) return NextResponse.json({ daftar: [] });

  const [{ data: stList, error: errSt }, { data: laporanList, error: errLaporan }] = await Promise.all([
    supabase
      .from("spj_surat_tugas")
      .select("id, nomor_st, tanggal_mulai, tanggal_selesai")
      .in("id", ids)
      .order("tanggal_mulai", { ascending: false }),
    supabase
      .from("spj_laporan")
      .select("id, surat_tugas_id, tanggal, mode, narasi, rekap_snapshot, created_at")
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .in("surat_tugas_id", ids)
      .order("tanggal", { ascending: false }),
  ]);
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });
  if (errLaporan) return NextResponse.json({ error: errLaporan.message }, { status: 500 });

  const daftar = (stList ?? []).map((st: { id: number; nomor_st: string; tanggal_mulai: string; tanggal_selesai: string }) => ({
    surat_tugas_id: st.id,
    nomor_st: st.nomor_st,
    tanggal_mulai: st.tanggal_mulai,
    tanggal_selesai: st.tanggal_selesai,
    laporan: (laporanList ?? []).filter((l: { surat_tugas_id: number }) => l.surat_tugas_id === st.id),
  }));

  return NextResponse.json({ daftar });
}

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);
  const suratTugasId = Number(body?.surat_tugas_id);
  const tanggal = String(body?.tanggal || "").trim();
  const susulan = body?.susulan === true;
  const mode = body?.mode === "bebas" ? "bebas" : "template";
  const narasi = typeof body?.narasi === "string" ? body.narasi.trim() : "";

  if (!Number.isFinite(suratTugasId)) return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return NextResponse.json({ error: "Tanggal wajib diisi." }, { status: 400 });
  if (mode === "bebas" && !narasi && !susulan) {
    return NextResponse.json({ error: "Narasi wajib diisi utk mode Narasi Bebas." }, { status: 400 });
  }

  const cek = await pastikanStMilikSesiDanTanggal(supabase, session, suratTugasId, tanggal);
  if ("error" in cek) return NextResponse.json({ error: cek.error }, { status: cek.status });

  let rekapSnapshot: unknown = null;

  if (susulan) {
    // Pagar 1: tanggal wajib sudah lewat (lihat komentar besar "LAPORAN
    // SUSULAN" di atas file ini).
    const hariIni = hariIniJakarta();
    if (tanggal >= hariIni) {
      return NextResponse.json(
        { error: "Laporan Susulan hanya utk tanggal yang SUDAH LEWAT. Utk hari ini/mendatang, pakai form Laporan biasa." },
        { status: 400 }
      );
    }

    // Pagar 2: tanggal wajib salah satu Hari Tugas yg memang sudah ditag
    // petugas ini sendiri (bukan asal pilih tanggal).
    const hariKerja = await daftarHariKerjaPetugas(supabase, session);
    if (!hariKerja.tanggal.includes(tanggal)) {
      return NextResponse.json(
        {
          error:
            "Tanggal ini bukan Hari Tugas yang Anda tandai sendiri di Perencanaan Lapangan. " +
            "Laporan Susulan hanya boleh utk tanggal yang memang sudah ditag sbg Hari Tugas.",
        },
        { status: 400 }
      );
    }

    // Pagar 3: hanya utk tanggal yg BELUM PERNAH ada Laporan -- bukan
    // jalan menimpa Laporan yg sudah ada (edit Laporan yg sudah ada pakai
    // form biasa, bukan form susulan ini).
    const { data: laporanAda, error: errLaporanAda } = await supabase
      .from("spj_laporan")
      .select("id")
      .eq("surat_tugas_id", suratTugasId)
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .eq("tanggal", tanggal)
      .maybeSingle();
    if (errLaporanAda) return NextResponse.json({ error: errLaporanAda.message }, { status: 500 });
    if (laporanAda) {
      return NextResponse.json(
        { error: "Laporan utk tanggal ini sudah ada -- Laporan Susulan hanya utk tanggal yang belum pernah dilaporkan." },
        { status: 400 }
      );
    }

    const rekapManualMentah = body?.rekap_manual && typeof body.rekap_manual === "object" ? body.rekap_manual : {};
    const rekapManual: Record<string, number> = {};
    for (const k of KUNCI_STATUS_SUSULAN) {
      const v = Number((rekapManualMentah as Record<string, unknown>)[k]);
      rekapManual[k] = Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
    }
    const totalManual = Object.values(rekapManual).reduce((a, b) => a + b, 0);
    if (totalManual <= 0) {
      return NextResponse.json({ error: "Isi jumlah minimal 1 utk salah satu status kunjungan (tidak boleh semuanya 0)." }, { status: 400 });
    }

    const catatanKeterlambatan = typeof body?.catatan_keterlambatan === "string" ? body.catatan_keterlambatan.trim() : "";
    if (!catatanKeterlambatan) {
      return NextResponse.json({ error: "Alasan keterlambatan wajib diisi." }, { status: 400 });
    }

    const lokasiManualMentah = body?.lokasi_manual && typeof body.lokasi_manual === "object" ? body.lokasi_manual : {};
    const kecManual = typeof (lokasiManualMentah as Record<string, unknown>).kecamatan === "string" ? (lokasiManualMentah as Record<string, string>).kecamatan.trim() : "";
    const nagariManual = typeof (lokasiManualMentah as Record<string, unknown>).nagari === "string" ? (lokasiManualMentah as Record<string, string>).nagari.trim() : "";
    const jorongManual = typeof (lokasiManualMentah as Record<string, unknown>).jorong === "string" ? (lokasiManualMentah as Record<string, string>).jorong.trim() : "";

    // Jumlah Dokumentasi tetap DIHITUNG LIVE dari foto yg benar2 diupload
    // (bukan manual) -- kalau petugas sudah/mau upload foto utk tanggal
    // ini via tab Dokumentasi, biar tetap ikut tercatat di kartu angka.
    const { count: jumlahDokumentasi } = await supabase
      .from("spj_dokumentasi_foto")
      .select("id", { count: "exact", head: true })
      .eq("surat_tugas_id", suratTugasId)
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .eq("tanggal", tanggal);

    rekapSnapshot = {
      lokasi: [],
      rekapIdentifikasi: { ada: 0, tidak_ada: 0, ragu: 0, belum: 0 },
      totalAktivitas: 0,
      jumlahDokumentasi: jumlahDokumentasi ?? 0,
      rekapStatusKunjungan: rekapManual,
      lokasiPenyisiran:
        kecManual || nagariManual || jorongManual
          ? [
              {
                kecNama: kecManual || null,
                nagariNama: nagariManual || null,
                slsNama: jorongManual || null,
                subslsKode: null,
                waktuMulai: null,
                waktuSelesai: null,
                jumlah: totalManual,
              },
            ]
          : [],
      diisiSusulan: true,
      catatanKeterlambatan,
      diisiSusulanPada: new Date().toISOString(),
    };
  } else if (mode === "template") {
    let rekap: RekapTemplate;
    try {
      rekap = await hitungRekapTemplate(supabase, session, cek.nama, suratTugasId, tanggal);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal menghitung rekap." }, { status: 500 });
    }

    // Lihat lib/spjLaporanAturan.ts utk aturan lengkapnya -- SEBELUM 20 Sept
    // 2026: cukup salah satu (OR) dari Penyisiran ATAU Identifikasi. SEJAK
    // 20 Sept 2026: Penyisiran WAJIB, Identifikasi jadi opsional (boleh ada
    // boleh tidak, TIDAK LAGI cukup sendirian).
    const adaAktivitasPenyisiran = Object.values(rekap.rekapStatusKunjungan).some((v) => v > 0);
    const adaAktivitasIdentifikasi = rekap.totalAktivitas > 0;

    if (!laporanTemplateBolehDisimpan(tanggal, adaAktivitasPenyisiran, adaAktivitasIdentifikasi)) {
      const error =
        tanggal >= TANGGAL_WAJIB_PENYISIRAN
          ? "Tidak ada aktivitas Penyisiran Usaha (perubahan status kunjungan) yang tercatat pada tanggal ini. " +
            "Sejak 20 September 2026, Laporan wajib berdasarkan aktivitas di tab Penyisiran Usaha -- aktivitas " +
            "Identifikasi saja tidak lagi cukup. Silakan lengkapi checklist di tab Penyisiran Usaha dulu, atau " +
            "gunakan mode Narasi Bebas."
          : "Tidak ada aktivitas Penyisiran maupun Identifikasi yang tercatat pada tanggal ini. " +
            "Silakan koreksi/lengkapi data di salah satu tab tersebut dulu, atau gunakan mode Narasi Bebas.";
      return NextResponse.json({ error }, { status: 400 });
    }

    rekapSnapshot = rekap;
  }

  const { data: upserted, error: errUpsert } = await supabase
    .from("spj_laporan")
    .upsert(
      {
        surat_tugas_id: suratTugasId,
        petugas_jenis: session.jenis,
        petugas_id: session.petugasId,
        tanggal,
        mode,
        narasi: narasi || null,
        rekap_snapshot: rekapSnapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "surat_tugas_id,petugas_jenis,petugas_id,tanggal" }
    )
    .select("id")
    .single();
  if (errUpsert || !upserted) {
    return NextResponse.json({ error: errUpsert?.message || "Gagal menyimpan Laporan." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: upserted.id });
}
