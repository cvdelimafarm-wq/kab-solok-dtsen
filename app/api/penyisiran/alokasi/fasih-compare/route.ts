// app/api/penyisiran/alokasi/fasih-compare/route.ts
//
// "Monitoring Assignment FASIH" (tab Perencanaan Lapangan, permintaan
// user) -- pengelola mengunggah 1/beberapa file Excel hasil export dari
// aplikasi eksternal "FASIH" (assignment Pengawas/Pencacah yang SUDAH
// BERHASIL diproses di sana; formatnya SAMA PERSIS dgn file yang tadinya
// diupload KE FASIH lewat tombol "⬇ Export Excel Pengawas/Pencacah (per
// SUBSLS)" -- lihat .../alokasi/export-subsls/route.ts: kolom PROVINSI |
// KABUPATEN/KOTA | KECAMATAN | DESA | SLS | SUBSLS | Email Pengawas |
// Email Pencacah, satu baris per SUBSLS), lalu dibandingkan dgn data
// "sekarang" di sistem (penyisiran_alokasi_pilihan, hasil tag
// "📋 Identifikasi Wilayah Sampel SLS") utk mendeteksi 3 jenis selisih yang
// dikeluhkan user ("kadang ada perbedaan, update yang tidak terekap, atau
// proses assignment yang gagal"):
//   1. belum_di_fasih          -- SUDAH ditag di sistem, TIDAK ketemu di
//                                  data FASIH tersimpan (assignment
//                                  gagal/belum diproses FASIH).
//   2. sudah_tidak_ada_di_sistem -- ADA di data FASIH, TIDAK ketemu lagi di
//                                  sistem (sudah dipindah/dihapus di sistem
//                                  SESUDAH file terakhir diupload -- FASIH
//                                  jadi ketinggalan).
//   3. beda_pencacah           -- SUBSLS yg SAMA ada di keduanya, tapi
//                                  Email Pencacah-nya BEDA (update di
//                                  sistem yang belum ikut terekap ulang ke
//                                  FASIH).
// Kunci pencocokan: kombinasi kode wilayah (kec_kode, nagari_kode,
// sls_kode, subsls_kode) -- SAMA PERSIS dgn kolom KECAMATAN/DESA/SLS/SUBSLS
// di file Excel-nya (PROVINSI/KABUPATEN-KOTA diabaikan krn selalu
// 13/"03", khusus Kabupaten Solok).
//
// PERSISTENSI (permintaan lanjutan user, "kalau upload beberapa file, data
// assignment yang sama ditimpa oleh yang terbaru"): data FASIH yang
// diupload TIDAK cuma dihitung sekali-jalan lalu dibuang, tapi di-UPSERT ke
// tabel penyisiran_fasih_assignment (migrasi
// 20260922m_tambah_tabel_fasih_assignment.sql) -- satu baris per kombinasi
// kode wilayah, upload berikutnya utk SUBSLS yang SAMA otomatis MENIMPA
// baris lama (bukan menambah duplikat). Dengan begini:
//  - POST (upload) -- parse file baru -> upsert ke tabel -> hitung ulang
//    perbandingan dari data TERSIMPAN (bukan cuma dari file yg BARU
//    diupload kali ini) vs sistem SEKARANG -> balikan hasilnya.
//  - GET (tanpa upload) -- cukup hitung ulang perbandingan dari data yang
//    SUDAH tersimpan vs sistem SEKARANG -- dipakai utk (a) tab Perencanaan
//    Lapangan menampilkan hasil terakhir begitu dibuka (tanpa perlu upload
//    ulang), dan (b) FasihMismatchWarningBar (app/penyisiran/page.tsx,
//    HANYA muncul utk akun M. Iqbal Hadi, lihat apakahIqbalHadi di
//    lib/manajemenTargetAkses.ts) yang mem-poll endpoint ini tiap 30 detik.
// Krn KEDUA sisi (data FASIH tersimpan & penyisiran_alokasi_pilihan) selalu
// dibaca LIVE tiap panggilan, warning otomatis hilang begitu salah satu
// sisi berubah sampai keduanya cocok lagi -- TIDAK perlu logika "clear
// warning" terpisah.
//
// Akses endpoint (baik GET maupun POST) DIKUNCI ke 7 pengelola yang sama
// dgn tombol export (bolehAksesManajemenTarget) -- SAMA PERSIS pola
// gate-nya dgn .../alokasi/export-subsls/route.ts. Pembatasan "cuma akun
// M. Iqbal Hadi" utk WARNING BANNER-nya sendiri ada di SISI KLIEN
// (FasihMismatchWarningBar), BUKAN di endpoint ini -- ke-7 pengelola tetap
// bisa upload/lihat panelnya, cuma banner ambient di level halaman yang
// dibatasi 1 akun sesuai permintaan.
//
// Nama Kecamatan/Nagari/SLS utk baris #2 (sudah_tidak_ada_di_sistem) TIDAK
// bisa diambil dari penyisiran_alokasi_pilihan (krn justru sudah tidak ada
// di situ) -- makanya dilengkapi via RPC penyisiran_wilayah_nama_lookup()
// (migrasi 20260922l_tambah_lookup_nama_wilayah_subsls.sql) yang menyisir
// SEMUA kode wilayah yg PERNAH ada di penyisiran_usaha, tanpa filter aktif.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lebar padding kode wilayah -- SAMA dgn struktur idsubsls 16 digit yang
// dipakai di seluruh aplikasi ini (prov 2 + kab/kota 2 + kec 3 + desa 3 +
// sls 4 + subsls 2). Dipakai supaya kode yang kebetulan dibaca sbg ANGKA
// oleh Excel/library xlsx (kehilangan angka nol di depan, mis. desa "007"
// jadi 7) bisa dipulihkan balik ke bentuk teks yang benar sebelum
// dicocokkan -- lihat normalisasiKode().
const LEBAR_KODE: Record<"kec" | "nagari" | "sls" | "subsls", number> = {
  kec: 3,
  nagari: 3,
  sls: 4,
  subsls: 2,
};

interface SystemRow {
  kec_kode: string;
  nagari_kode: string;
  sls_kode: string;
  subsls_kode: string;
  kec_nama: string | null;
  nagari_nama: string | null;
  sls_nama: string | null;
  petugas_id: number;
  petugas_nama: string;
  email_pencacah: string | null;
  email_pengawas: string | null;
}

interface NamaLookupRow {
  kec_kode: string;
  nagari_kode: string;
  sls_kode: string;
  subsls_kode: string;
  kec_nama: string | null;
  nagari_nama: string | null;
  sls_nama: string | null;
}

interface FasihRow {
  kec_kode: string;
  nagari_kode: string;
  sls_kode: string;
  subsls_kode: string;
  email_pencacah: string;
  email_pengawas: string;
  sumber_file: string | null;
  diupload_oleh: string | null;
  diupload_at: string;
}

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Balikan sukses berisi nama akun yang login -- dipakai POST utk mengisi
// kolom diupload_oleh.
async function pastikanPengelola(req: NextRequest, supabase: any): Promise<{ error: NextResponse } | { nama: string }> {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return { error: NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 }) };
  }
  const subjectId = getSessionSubject(token);
  if (!subjectId) {
    return { error: NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 }) };
  }
  const { data: akun, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama")
    .eq("id", subjectId)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!bolehAksesManajemenTarget(akun?.nama ?? null)) {
    return {
      error: NextResponse.json(
        { error: "Fitur ini hanya dapat diakses oleh pengelola yang ditentukan." },
        { status: 403 }
      ),
    };
  }
  return { nama: akun.nama as string };
}

// Pulihkan kode wilayah yang kehilangan angka nol di depan (lihat komentar
// LEBAR_KODE) -- hanya di-pad kalau isinya MURNI digit; kalau sudah berupa
// teks apa adanya (termasuk yg kebetulan sudah benar) dibiarkan, cuma
// di-trim.
function normalisasiKode(nilai: unknown, lebar: number): string {
  const s = String(nilai ?? "").trim();
  if (/^\d+$/.test(s)) return s.padStart(lebar, "0");
  return s;
}

function normalisasiEmail(nilai: unknown): string {
  return String(nilai ?? "").trim().toLowerCase();
}

function kunci(kec: string, nagari: string, sls: string, subsls: string): string {
  return `${kec}|${nagari}|${sls}|${subsls}`;
}

// Cari indeks kolom di baris header, TIDAK case-sensitive & toleran spasi
// berlebih -- supaya tetap jalan walau FASIH export-nya sedikit beda
// kapitalisasi ("email pencacah" vs "Email Pencacah").
function cariKolom(header: unknown[], nama: string): number {
  const target = nama.trim().toLowerCase();
  return header.findIndex((h) => String(h ?? "").trim().toLowerCase() === target);
}

function urut(a: any, b: any) {
  return (
    String(a.kec_nama).localeCompare(String(b.kec_nama), "id") ||
    String(a.nagari_nama).localeCompare(String(b.nagari_nama), "id") ||
    String(a.sls_nama).localeCompare(String(b.sls_nama), "id") ||
    String(a.subsls_kode).localeCompare(String(b.subsls_kode), "id", { numeric: true })
  );
}

// Hitung ulang perbandingan dari data penyisiran_fasih_assignment yang
// TERSIMPAN (bukan dari file yang baru diupload) vs data SEKARANG di
// sistem -- dipakai bareng oleh GET & POST (lihat komentar besar di atas).
async function hitungPerbandingan(supabase: any) {
  const [{ data: sistemData, error: errSistem }, { data: namaData, error: errNama }, { data: fasihData, error: errFasih }] =
    await Promise.all([
      supabase.rpc("penyisiran_alokasi_export_subsls"),
      supabase.rpc("penyisiran_wilayah_nama_lookup"),
      supabase
        .from("penyisiran_fasih_assignment")
        .select("kec_kode, nagari_kode, sls_kode, subsls_kode, email_pencacah, email_pengawas, sumber_file, diupload_oleh, diupload_at"),
    ]);
  if (errSistem) return { error: NextResponse.json({ error: errSistem.message }, { status: 500 }) };
  if (errNama) return { error: NextResponse.json({ error: errNama.message }, { status: 500 }) };
  if (errFasih) return { error: NextResponse.json({ error: errFasih.message }, { status: 500 }) };

  const sistemRows = (sistemData ?? []) as SystemRow[];
  const namaRows = (namaData ?? []) as NamaLookupRow[];
  const fasihRows = (fasihData ?? []) as FasihRow[];

  const namaMap = new Map<string, { kec_nama: string | null; nagari_nama: string | null; sls_nama: string | null }>();
  for (const n of namaRows) {
    namaMap.set(kunci(n.kec_kode, n.nagari_kode, n.sls_kode, n.subsls_kode), {
      kec_nama: n.kec_nama,
      nagari_nama: n.nagari_nama,
      sls_nama: n.sls_nama,
    });
  }

  const sistemMap = new Map<string, SystemRow>();
  for (const s of sistemRows) {
    sistemMap.set(kunci(s.kec_kode, s.nagari_kode, s.sls_kode, s.subsls_kode), s);
  }

  const fasihMap = new Map<string, FasihRow>();
  let terakhirUploadAt: string | null = null;
  let terakhirUploadOleh: string | null = null;
  for (const f of fasihRows) {
    fasihMap.set(kunci(f.kec_kode, f.nagari_kode, f.sls_kode, f.subsls_kode), f);
    if (!terakhirUploadAt || f.diupload_at > terakhirUploadAt) {
      terakhirUploadAt = f.diupload_at;
      terakhirUploadOleh = f.diupload_oleh;
    }
  }

  const belumDiFasih: any[] = [];
  const bedaPencacah: any[] = [];
  for (const [k, s] of sistemMap) {
    const f = fasihMap.get(k);
    if (!f) {
      belumDiFasih.push({
        kec_nama: s.kec_nama,
        nagari_nama: s.nagari_nama,
        sls_nama: s.sls_nama,
        subsls_kode: s.subsls_kode,
        petugas_nama: s.petugas_nama,
        email_pencacah: s.email_pencacah,
        email_pengawas: s.email_pengawas,
      });
    } else if (normalisasiEmail(s.email_pencacah) !== normalisasiEmail(f.email_pencacah)) {
      bedaPencacah.push({
        kec_nama: s.kec_nama,
        nagari_nama: s.nagari_nama,
        sls_nama: s.sls_nama,
        subsls_kode: s.subsls_kode,
        petugas_nama: s.petugas_nama,
        email_pencacah_sistem: s.email_pencacah,
        email_pencacah_fasih: f.email_pencacah,
        sumber_file: f.sumber_file ?? "",
      });
    }
  }

  const sudahTidakAdaDiSistem: any[] = [];
  for (const [k, f] of fasihMap) {
    if (sistemMap.has(k)) continue;
    const nama = namaMap.get(k);
    sudahTidakAdaDiSistem.push({
      kec_nama: nama?.kec_nama ?? f.kec_kode,
      nagari_nama: nama?.nagari_nama ?? f.nagari_kode,
      sls_nama: nama?.sls_nama ?? f.sls_kode,
      subsls_kode: f.subsls_kode,
      email_pencacah: f.email_pencacah,
      email_pengawas: f.email_pengawas,
      sumber_file: f.sumber_file ?? "",
    });
  }

  belumDiFasih.sort(urut);
  sudahTidakAdaDiSistem.sort(urut);
  bedaPencacah.sort(urut);

  return {
    hasil: {
      ringkasan: {
        total_sistem: sistemMap.size,
        total_fasih: fasihMap.size,
        terakhir_upload_at: terakhirUploadAt,
        terakhir_upload_oleh: terakhirUploadOleh,
        jumlah_belum_di_fasih: belumDiFasih.length,
        jumlah_sudah_tidak_ada_di_sistem: sudahTidakAdaDiSistem.length,
        jumlah_beda_pencacah: bedaPencacah.length,
      },
      belum_di_fasih: belumDiFasih,
      sudah_tidak_ada_di_sistem: sudahTidakAdaDiSistem,
      beda_pencacah: bedaPencacah,
    },
  };
}

// GET -- hitung ulang perbandingan dari data yang SUDAH tersimpan, tanpa
// perlu upload apa pun. Dipakai tab Perencanaan Lapangan (tampilkan hasil
// terakhir begitu dibuka) & FasihMismatchWarningBar (poll ringkasan tiap 30
// detik, HANYA tampil utk akun M. Iqbal Hadi -- lihat komentar besar di
// atas file ini).
export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const gate = await pastikanPengelola(req, supabase);
  if ("error" in gate) return gate.error;

  const hasil = await hitungPerbandingan(supabase);
  if ("error" in hasil) return hasil.error;
  return NextResponse.json(hasil.hasil);
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const gate = await pastikanPengelola(req, supabase);
  if ("error" in gate) return gate.error;
  const namaPengelola = gate.nama;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Gagal membaca file yang diunggah." }, { status: 400 });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Belum ada file yang diunggah." }, { status: 400 });
  }

  // Baris yang akan di-UPSERT (permintaan user: "data assignment yang sama
  // ditimpa oleh yang terbaru") -- key Map memastikan SUBSLS yang muncul
  // >1x dalam batch upload yang SAMA juga otomatis "yang terakhir dibaca yang
  // menang", konsisten dgn perilaku upsert-nya sendiri thd data lama.
  const baruMap = new Map<
    string,
    {
      kec_kode: string;
      nagari_kode: string;
      sls_kode: string;
      subsls_kode: string;
      email_pencacah: string;
      email_pengawas: string;
      sumber_file: string;
    }
  >();
  let totalBarisFasihDibaca = 0;

  for (const file of files) {
    let aoa: unknown[][];
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: "buffer" });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
    } catch {
      return NextResponse.json({ error: `File "${file.name}" bukan file Excel yang valid.` }, { status: 400 });
    }
    if (aoa.length === 0) continue;

    const header = aoa[0];
    const idxKec = cariKolom(header, "KECAMATAN");
    const idxDesa = cariKolom(header, "DESA");
    const idxSls = cariKolom(header, "SLS");
    const idxSubsls = cariKolom(header, "SUBSLS");
    const idxPengawas = cariKolom(header, "Email Pengawas");
    const idxPencacah = cariKolom(header, "Email Pencacah");
    if ([idxKec, idxDesa, idxSls, idxSubsls, idxPencacah].some((i) => i === -1)) {
      return NextResponse.json(
        {
          error: `File "${file.name}" tidak sesuai format -- kolom wajib KECAMATAN/DESA/SLS/SUBSLS/"Email Pencacah" tidak lengkap. Pastikan formatnya sama dengan hasil "⬇ Export Excel Pengawas/Pencacah (per SUBSLS)".`,
        },
        { status: 400 }
      );
    }

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row || row.every((c) => String(c ?? "").trim() === "")) continue; // baris kosong, lewati
      const kec = normalisasiKode(row[idxKec], LEBAR_KODE.kec);
      const nagari = normalisasiKode(row[idxDesa], LEBAR_KODE.nagari);
      const sls = normalisasiKode(row[idxSls], LEBAR_KODE.sls);
      const subsls = normalisasiKode(row[idxSubsls], LEBAR_KODE.subsls);
      if (!kec || !nagari || !sls || !subsls) continue; // baris rusak/tidak lengkap, lewati
      const k = kunci(kec, nagari, sls, subsls);
      baruMap.set(k, {
        kec_kode: kec,
        nagari_kode: nagari,
        sls_kode: sls,
        subsls_kode: subsls,
        email_pencacah: normalisasiEmail(row[idxPencacah]),
        email_pengawas: idxPengawas === -1 ? "" : normalisasiEmail(row[idxPengawas]),
        sumber_file: file.name,
      });
      totalBarisFasihDibaca++;
    }
  }

  if (baruMap.size > 0) {
    const sekarang = new Date().toISOString();
    const rowsUpsert = Array.from(baruMap.values()).map((r) => ({
      ...r,
      diupload_oleh: namaPengelola,
      diupload_at: sekarang,
    }));
    const { error: errUpsert } = await supabase
      .from("penyisiran_fasih_assignment")
      .upsert(rowsUpsert, { onConflict: "kec_kode,nagari_kode,sls_kode,subsls_kode" });
    if (errUpsert) return NextResponse.json({ error: errUpsert.message }, { status: 500 });
  }

  const hasil = await hitungPerbandingan(supabase);
  if ("error" in hasil) return hasil.error;
  return NextResponse.json({
    ...hasil.hasil,
    ringkasan: {
      ...hasil.hasil.ringkasan,
      total_baris_fasih_dibaca: totalBarisFasihDibaca,
      jumlah_file: files.length,
      jumlah_subsls_diupdate: baruMap.size,
    },
  });
}
