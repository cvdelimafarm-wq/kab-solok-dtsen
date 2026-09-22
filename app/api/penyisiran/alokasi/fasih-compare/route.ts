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
//                                  file FASIH yg diupload (assignment
//                                  gagal/belum diproses FASIH).
//   2. sudah_tidak_ada_di_sistem -- ADA di file FASIH, TIDAK ketemu lagi di
//                                  sistem (sudah dipindah/dihapus di sistem
//                                  SESUDAH file terakhir diexport ke
//                                  FASIH -- FASIH jadi ketinggalan).
//   3. beda_pencacah           -- SUBSLS yg SAMA ada di keduanya, tapi
//                                  Email Pencacah-nya BEDA (update di
//                                  sistem yang belum ikut terekap ulang ke
//                                  FASIH).
// Kunci pencocokan: kombinasi kode wilayah (kec_kode, nagari_kode,
// sls_kode, subsls_kode) -- SAMA PERSIS dgn kolom KECAMATAN/DESA/SLS/SUBSLS
// di file Excel-nya (PROVINSI/KABUPATEN-KOTA diabaikan krn selalu
// 13/"03", khusus Kabupaten Solok).
//
// Akses DIKUNCI ke pengelola yang sama dgn tombol export (lihat
// bolehAksesManajemenTarget) -- SAMA PERSIS pola gate-nya dgn
// .../alokasi/export-subsls/route.ts.
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

interface FasihEntry {
  email_pengawas: string;
  email_pencacah: string;
  sumber_file: Set<string>;
}

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function pastikanPengelola(req: NextRequest, supabase: any): Promise<null | NextResponse> {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  if (!subjectId) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }
  const { data: akun, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama")
    .eq("id", subjectId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!bolehAksesManajemenTarget(akun?.nama ?? null)) {
    return NextResponse.json(
      { error: "Fitur ini hanya dapat diakses oleh pengelola yang ditentukan." },
      { status: 403 }
    );
  }
  return null;
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

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const gate = await pastikanPengelola(req, supabase);
  if (gate) return gate;

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

  const fasihMap = new Map<string, FasihEntry>();
  let totalBarisFasih = 0;

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
      const emailPencacah = normalisasiEmail(row[idxPencacah]);
      const emailPengawas = idxPengawas === -1 ? "" : normalisasiEmail(row[idxPengawas]);
      const existing = fasihMap.get(k);
      if (existing) {
        existing.sumber_file.add(file.name);
        // Baris terakhir yang dibaca yang dipakai utk nilai emailnya --
        // kasus 1 SUBSLS muncul di >1 file cukup jarang & tetap kelihatan
        // dari daftar sumber_file kalau user perlu telusuri manual.
        existing.email_pencacah = emailPencacah;
        existing.email_pengawas = emailPengawas;
      } else {
        fasihMap.set(k, { email_pencacah: emailPencacah, email_pengawas: emailPengawas, sumber_file: new Set([file.name]) });
      }
      totalBarisFasih++;
    }
  }

  const [{ data: sistemData, error: errSistem }, { data: namaData, error: errNama }] = await Promise.all([
    supabase.rpc("penyisiran_alokasi_export_subsls"),
    supabase.rpc("penyisiran_wilayah_nama_lookup"),
  ]);
  if (errSistem) return NextResponse.json({ error: errSistem.message }, { status: 500 });
  if (errNama) return NextResponse.json({ error: errNama.message }, { status: 500 });

  const sistemRows = (sistemData ?? []) as SystemRow[];
  const namaRows = (namaData ?? []) as NamaLookupRow[];

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
    } else if (normalisasiEmail(s.email_pencacah) !== f.email_pencacah) {
      bedaPencacah.push({
        kec_nama: s.kec_nama,
        nagari_nama: s.nagari_nama,
        sls_nama: s.sls_nama,
        subsls_kode: s.subsls_kode,
        petugas_nama: s.petugas_nama,
        email_pencacah_sistem: s.email_pencacah,
        email_pencacah_fasih: f.email_pencacah,
        sumber_file: Array.from(f.sumber_file).join(", "),
      });
    }
  }

  const sudahTidakAdaDiSistem: any[] = [];
  for (const [k, f] of fasihMap) {
    if (sistemMap.has(k)) continue;
    const [kec, nagari, sls, subsls] = k.split("|");
    const nama = namaMap.get(k);
    sudahTidakAdaDiSistem.push({
      kec_nama: nama?.kec_nama ?? kec,
      nagari_nama: nama?.nagari_nama ?? nagari,
      sls_nama: nama?.sls_nama ?? sls,
      subsls_kode: subsls,
      email_pencacah: f.email_pencacah,
      email_pengawas: f.email_pengawas,
      sumber_file: Array.from(f.sumber_file).join(", "),
    });
  }

  function urut(a: any, b: any) {
    return (
      String(a.kec_nama).localeCompare(String(b.kec_nama), "id") ||
      String(a.nagari_nama).localeCompare(String(b.nagari_nama), "id") ||
      String(a.sls_nama).localeCompare(String(b.sls_nama), "id") ||
      String(a.subsls_kode).localeCompare(String(b.subsls_kode), "id", { numeric: true })
    );
  }
  belumDiFasih.sort(urut);
  sudahTidakAdaDiSistem.sort(urut);
  bedaPencacah.sort(urut);

  return NextResponse.json({
    ringkasan: {
      total_sistem: sistemMap.size,
      total_fasih: fasihMap.size,
      total_baris_fasih_dibaca: totalBarisFasih,
      jumlah_file: files.length,
      jumlah_belum_di_fasih: belumDiFasih.length,
      jumlah_sudah_tidak_ada_di_sistem: sudahTidakAdaDiSistem.length,
      jumlah_beda_pencacah: bedaPencacah.length,
    },
    belum_di_fasih: belumDiFasih,
    sudah_tidak_ada_di_sistem: sudahTidakAdaDiSistem,
    beda_pencacah: bedaPencacah,
  });
}
