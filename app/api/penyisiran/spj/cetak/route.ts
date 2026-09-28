// app/api/penyisiran/spj/cetak/route.ts
//
// POST -> "Print Builder": menyusun ulang dokumen SPJ yang SUDAH ADA di
// sistem (Kwitansi/Surat Tugas/Visum/Laporan/Dokumentasi/Surat Pernyataan)
// jadi satu atau beberapa PDF gabungan, sesuai pilihan pengelola (petugas +
// rentang tanggal + jenis dokumen + mode pengelompokan) -- lihat menu
// "Cetak SPJ" di app/penyisiran/spj-cetak.tsx.
//
// Urutan dokumen di dalam SETIAP PDF gabungan SELALU mengikuti standar
// SPJ yang dikunci sistem (lib/spjMatriks.ts -> URUTAN_CETAK_STANDAR):
// Kwitansi -> Surat Tugas -> Visum -> [per tanggal: Laporan -> Dokumentasi]
// -> Surat Pernyataan -- BUKAN urutan centang pengguna.
//
// Surat Tugas TETAP dokumen TINGKAT PERJALANAN (1 file scan berlaku utk
// SELURUH rentang 1 Surat Tugas). Kwitansi/Visum/Surat Pernyataan SEJAK
// 23 Sep 2026 TIDAK LAGI 1 dokumen per ST -- BISA ADA BEBERAPA baris (SET
// tanggal, lihat lib/spjSetHariTugas.ts & migrasi
// 20260923_spj_dokumen_per_set_hari_tugas.sql), jadi SEMUA SET yg overlap
// rentang tanggal Print Builder ikut disertakan (bukan cuma 1). Utk mode
// pengelompokan "per_tanggal", tiap SET dokumen ini ditempatkan di file
// tanggal AWAL SET-nya sendiri (urutanTanggal = tanggal_mulai_set baris
// itu, bukan lagi tanggal_mulai Surat Tugas) -- supaya tiap SET nongol di
// tanggal yg benar2 diwakilinya, bukan selalu di tanggal paling awal ST.
//
// (24 Sep 2026) Kalau tanggal Hari Tugas 1 ST TERPUTUS (ada "lubang", mis.
// tagnya tgl 2-3 & 6-8), dokumen SEKARANG disusun per KELOMPOK tanggal yg
// tersambung dulu -- 1 kelompok = paket LENGKAP Kwitansi->Surat Tugas->
// Visum->Laporan->Dokumentasi->Surat Pernyataan utk rentang itu -- baru
// lanjut ke kelompok tanggal berikutnya (BUKAN lagi dikelompokkan per JENIS
// dokumen dulu lintas SEMUA kelompok tanggal spt sebelumnya). Surat Tugas
// (1 file scan yg sama utk seluruh ST) SENGAJA disisipkan ULANG di setiap
// kelompok spy tiap kelompok tetap 1 paket mandiri.
//
// (24 Sep 2026, GANTI lagi) Sejak Kwitansi berubah jadi SELALU 1 lembar per
// hari (lihat app/api/penyisiran/spj/buat-otomatis/route.ts), batas
// kelompok TIDAK BISA lagi dihitung dari Kwitansi (semuanya cuma 1 hari) --
// SEKARANG diambil dari baris VISUM (SELALU "per_rentang", jadi itu SUMBER
// kebenaran rentang tersambung/terputus), dgn fallback ke tanggalList kalau
// Visum tidak ada datanya sama sekali. "Surat Tugas jumlahnya mengacu ke
// jumlah Visum" (permintaan user) otomatis terpenuhi krn 1 kelompok = 1
// baris Visum = 1 salinan Surat Tugas. Lihat blok "kelompokSet" di bawah.
//
// Non-pengelola (petugas/tetangga login SPJ biasa) HANYA boleh mencetak
// data MILIKNYA SENDIRI -- field `petugas` dari body diabaikan sepenuhnya
// & dipaksa jadi [diri sendiri], sama spt pola akses lain di menu ini.
//
// Kalau hasilnya cuma 1 file (1 kelompok, tanpa dokumen yg dilewati),
// dikembalikan sbg PDF langsung. Kalau lebih dari 1 file ATAU ada dokumen
// yg dilewati (blm ada datanya), dibungkus jadi 1 file ZIP (pakai
// dependensi "jszip") berisi semua PDF + catatan "_dokumen_dilewati.txt"
// kalau ada yg dilewati.
//
// ---------------------------------------------------------------------
// (27 Sep 2026) PEROMBAKAN BESAR alur memori -- ditemukan lewat investigasi
// bug "setelah klik Generate PDF lama merespon, lalu Gagal (502)": versi
// LAMA endpoint ini mengumpulkan SELURUH dokumen (Kwitansi/Visum/Laporan/
// Dokumentasi-dgn-foto/dst) utk SEMUA petugas & SEMUA tanggal terpilih jadi
// SATU array besar di memori (`unit[]`) SEBELUM mulai menggabungkan/
// menghasilkan file apa pun. Utk cetak 1-beberapa petugas ini masih aman,
// tapi begitu pengelola mencetak BANYAK petugas sekaligus (mis. 35 orang x
// 14 hari x 6 jenis dokumen -- kasus nyata yg memicu bug ini), total
// byte foto & PDF yg ditahan bersamaan menembus batas memori container
// Railway -> proses di-KILL paksa oleh sistem (OOM), container restart,
// permintaan yg sedang jalan terputus -> muncul sbg "Gagal (502)" di sisi
// pengguna. Menjelaskan ke SETIAP pengguna supaya "jangan cetak semua
// orang sekaligus, cicil per beberapa orang" bukan solusi yg realistis --
// jadi pembagian beban ini SEKARANG dilakukan OTOMATIS oleh sistem sendiri,
// transparan tanpa perlu pengguna tahu triknya:
//
//  1. Dokumen TIDAK LAGI ditahan sbg array bytes mentah menunggu digabung
//     di akhir -- begitu 1 dokumen selesai dibuat (mis. 1 lembar Kwitansi,
//     atau 1 PDF Dokumentasi lengkap dgn foto2nya), byte-nya LANGSUNG
//     disisipkan (embed) ke PDFDocument gabungan milik GRUP-nya
//     (`grupTerbuka`, per mode pengelompokan -- lihat `tambahKeGrup`), lalu
//     dibuang dari memori (tinggal bagian dari PDF gabungan, bukan byte
//     terpisah lagi).
//  2. KHUSUS mode "per_orang" (yg paling sering dipicu utk cetak banyak
//     org sekaligus): begitu SEMUA Surat Tugas milik 1 petugas selesai
//     diproses, PDF gabungan org itu LANGSUNG di-final-kan, ditulis ke
//     file sementara di disk (bukan RAM), lalu dibuang total dari memori
//     SEBELUM lanjut ke petugas berikutnya (`finalisasiGrup`, dipanggil di
//     `for (const p of daftarPenugasan)` saat mendeteksi ini ST TERAKHIR
//     milik petugas itu -- 1 org bisa py >1 Surat Tugas yg overlap rentang
//     cetak, jadi baru difinalisasi setelah SEMUA ST org itu selesai, spy
//     tetap 1 file per orang spt sebelumnya). Artinya memori HANYA perlu
//     menampung data 1 (atau sedikit) orang pd satu waktu, brp pun jumlah
//     petugas yg dipilih.
//  3. Mode lain ("per_tanggal"/"per_jenis"/"gabung") tetap perlu menahan
//     grup terbuka sampai SELURUH petugas selesai diproses (krn grupnya
//     memang menggabung lintas petugas) -- tapi ini jauh lebih ringan drpd
//     dulu krn: (a) foto Dokumentasi SEKARANG dikompres dulu sebelum
//     di-embed (lihat lib/pdf/dokumentasi.ts, perbaikan terpisah tgl yg
//     sama), & (b) byte MENTAH per-dokumen tetap tidak pernah menumpuk --
//     yg bertambah cuma ukuran PDF gabungan yg memang jadi keluarannya.
//  4. File hasil akhir (baik 1 PDF langsung maupun beberapa PDF dlm ZIP)
//     DIBACA DARI DISK secara STREAMING ke response, bukan lagi digabung
//     jadi 1 buffer raksasa di RAM dulu (JSZip `generateNodeStream` dgn
//     `streamFiles:true` + sumber tiap file berupa `fs.createReadStream`,
//     bukan Buffer) -- jadi tahap "membungkus jadi ZIP" juga tidak lagi
//     jadi titik OOM tersendiri utk banyak file besar.
//  5. File sementara ditulis ke folder unik per permintaan di dalam
//     os.tmpdir() (`spj-cetak/<uuid acak>/`), dibersihkan begitu stream
//     respons selesai/gagal, DITAMBAH sapuan folder basi (>15 menit,
//     jaga2 kalau ada proses yg crash di tengah jalan) tiap kali endpoint
//     ini dipanggil -- tidak menumpuk sampah di disk container.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj, tabelAkun, SpjPetugasJenis } from "@/lib/spjAuth";
import { buatPdfVisum } from "@/lib/pdf/visum";
import { buatPdfKwitansi } from "@/lib/pdf/kwitansi";
import { buatPdfLaporan, LaporanRekapSnapshot } from "@/lib/pdf/laporan";
import { buatPdfDokumentasi, DokumentasiFotoInput } from "@/lib/pdf/dokumentasi";
import { buatPdfSuratKeterangan } from "@/lib/pdf/suratKeterangan";
import { hitungLokasiTugas, teksLokasiTugas } from "@/lib/spjLokasiTugas";
import { hitungKecamatanTugas } from "@/lib/spjWilayahTugas";
import { hitungSetDariTanggal } from "@/lib/spjSetHariTugas";
import { JenisDokumen, LABEL_DOKUMEN, URUTAN_CETAK_STANDAR, kunciPetugas } from "@/lib/spjMatriks";
import { labelJabatanDokumenSpj } from "@/lib/spjFormat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pengelompokan = "per_orang" | "per_tanggal" | "per_jenis" | "gabung";
const MODE_VALID: Pengelompokan[] = ["per_orang", "per_tanggal", "per_jenis", "gabung"];

// Info minimal ttg 1 dokumen -- dipakai HANYA utk menentukan kunci/label
// grupnya (`tambahKeGrup`), byte-nya dikirim terpisah & LANGSUNG dibuang
// stlh di-embed (lihat catatan perombakan 27 Sep 2026 di atas).
interface UnitInfo {
  petugasKey: string;
  petugasNama: string;
  jenis: JenisDokumen;
  tanggal: string | null; // null = dokumen tingkat-perjalanan
  urutanTanggal: string; // tanggal efektif utk penempatan di mode per_tanggal
}

interface Penugasan {
  petugasJenis: SpjPetugasJenis;
  petugasId: number;
  nama: string;
  suratTugasId: number;
  nomorSt: string;
  // Tanggal ST diterbitkan/ditandatangani (spj_surat_tugas.tanggal_terbit,
  // dirambatkan lewat RPC spj_matriks_kelengkapan) -- dipakai sbg field
  // "Tanggal" pada Kwitansi cetak-gabungan, lihat lib/pdf/kwitansi.ts.
  tanggalTerbitSt: string;
  tanggalMulaiEfektif: string;
  tanggalList: string[];
}

interface BarisMatriksMentah {
  petugas_jenis: SpjPetugasJenis;
  petugas_id: number;
  nama: string;
  surat_tugas_id: number;
  nomor_st: string;
  tanggal_terbit: string;
  tanggal: string;
}

function namaFileAman(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
}

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Coba sisipkan `bytes` ke dokumen gabungan sbg halaman PDF asli dulu
// (Surat Tugas biasanya scan PDF); kalau gagal dibaca sbg PDF, coba sbg
// gambar (Surat Tugas kadang cuma foto/scan JPEG/PNG) & taruh di 1
// halaman A4 baru, di-scale supaya muat & tetap proporsional.
async function embedKeMerged(merged: PDFDocument, bytes: Uint8Array): Promise<boolean> {
  try {
    const src = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
    return true;
  } catch {
    // bukan PDF valid -- lanjut coba sbg gambar di bawah.
  }
  const A4: [number, number] = [595.28, 841.89];
  const percobaan = [
    () => merged.embedJpg(bytes),
    () => merged.embedPng(bytes),
  ];
  for (const coba of percobaan) {
    try {
      const img = await coba();
      const page = merged.addPage(A4);
      const scale = Math.min((A4[0] * 0.92) / img.width, (A4[1] * 0.92) / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// Pembersihan folder sementara -- lihat catatan perombakan 27 Sep 2026.
const TMP_ROOT = path.join(os.tmpdir(), "spj-cetak");
const TMP_KEDALUWARSA_MS = 15 * 60 * 1000; // 15 menit

async function bersihkanTmpKedaluwarsa(): Promise<void> {
  let entries: fs.Dirent[] = [];
  try {
    entries = await fsp.readdir(TMP_ROOT, { withFileTypes: true });
  } catch {
    return; // TMP_ROOT blm ada sama sekali -- tidak ada yg perlu dibersihkan.
  }
  const batas = Date.now() - TMP_KEDALUWARSA_MS;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = path.join(TMP_ROOT, e.name);
    try {
      const st = await fsp.stat(p);
      if (st.mtimeMs < batas) await fsp.rm(p, { recursive: true, force: true });
    } catch {
      // folder mgkn lg dipakai proses lain / sudah terhapus -- lewati saja.
    }
  }
}

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });

  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });

  const tanggalMulai = String(body.tanggal_mulai || "");
  const tanggalSelesai = String(body.tanggal_selesai || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(tanggalMulai) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(tanggalSelesai) ||
    tanggalMulai > tanggalSelesai
  ) {
    return NextResponse.json({ error: "Rentang tanggal tidak valid." }, { status: 400 });
  }

  const dokumenMentah: unknown[] = Array.isArray(body.dokumen) ? body.dokumen : [];
  const dokumenDipilih = URUTAN_CETAK_STANDAR.filter((j) => dokumenMentah.includes(j));
  if (dokumenDipilih.length === 0) {
    return NextResponse.json({ error: "Pilih minimal 1 jenis dokumen." }, { status: 400 });
  }

  const pengelompokan: Pengelompokan = MODE_VALID.includes(body.pengelompokan) ? body.pengelompokan : "gabung";

  // Non-pengelola SELALU dipaksa cuma boleh mencetak data miliknya sendiri
  // -- field `petugas` dari body TIDAK dipakai sama sekali dlm kasus ini.
  let petugasTarget: { jenis: SpjPetugasJenis; id: number }[];
  if (namaPengelola) {
    const raw: unknown[] = Array.isArray(body.petugas) ? body.petugas : [];
    petugasTarget = raw
      .filter(
        (p): p is { jenis: string; id: unknown } =>
          !!p && typeof p === "object" && ((p as { jenis?: string }).jenis === "penyisiran" || (p as { jenis?: string }).jenis === "tetangga")
      )
      .map((p) => ({ jenis: p.jenis as SpjPetugasJenis, id: Number((p as { id: unknown }).id) }))
      .filter((p) => Number.isFinite(p.id));
    if (petugasTarget.length === 0) {
      return NextResponse.json({ error: "Pilih minimal 1 petugas." }, { status: 400 });
    }
  } else {
    petugasTarget = [{ jenis: session.jenis, id: Number(session.petugasId) }];
  }

  const { data: matriksData, error: errMatriks } = await supabase.rpc("spj_matriks_kelengkapan");
  if (errMatriks) return NextResponse.json({ error: errMatriks.message }, { status: 500 });

  const petugasSet = new Set(petugasTarget.map((p) => `${p.jenis}:${p.id}`));
  const barisTerpilih = ((matriksData ?? []) as BarisMatriksMentah[]).filter(
    (b) => petugasSet.has(`${b.petugas_jenis}:${b.petugas_id}`) && b.tanggal >= tanggalMulai && b.tanggal <= tanggalSelesai
  );
  if (barisTerpilih.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada Surat Tugas yang cocok dgn petugas & rentang tanggal yang dipilih." },
      { status: 400 }
    );
  }

  // Kelompokkan baris harian jadi per "penugasan" (petugas + 1 Surat
  // Tugas) beserta daftar tanggal (dlm rentang pilihan) yg relevan.
  const petaPenugasan = new Map<string, Penugasan>();
  for (const b of barisTerpilih) {
    const key = `${b.petugas_jenis}:${b.petugas_id}:${b.surat_tugas_id}`;
    let p = petaPenugasan.get(key);
    if (!p) {
      p = {
        petugasJenis: b.petugas_jenis,
        petugasId: b.petugas_id,
        nama: b.nama,
        suratTugasId: b.surat_tugas_id,
        nomorSt: b.nomor_st,
        tanggalTerbitSt: b.tanggal_terbit,
        tanggalMulaiEfektif: b.tanggal,
        tanggalList: [],
      };
      petaPenugasan.set(key, p);
    }
    p.tanggalList.push(b.tanggal);
    if (b.tanggal < p.tanggalMulaiEfektif) p.tanggalMulaiEfektif = b.tanggal;
  }
  for (const p of petaPenugasan.values()) p.tanggalList.sort();
  // Diurutkan per NAMA dulu (lalu suratTugasId) -- PENTING: ini yg membuat
  // semua Surat Tugas milik 1 org (mode "per_orang", petugasKey yg sama)
  // SELALU bertetangga dlm array ini, jadi finalisasi-per-orang di bawah
  // (`ini ST TERAKHIR milik org ini?`) aman dipakai tanpa perlu pengurutan
  // ulang di akhir.
  const daftarPenugasan = Array.from(petaPenugasan.values()).sort(
    (a, b) => a.nama.localeCompare(b.nama, "id") || a.suratTugasId - b.suratTugasId
  );

  // Bersihkan folder sementara basi dari permintaan2 sebelumnya (jaga2 kalau
  // ada yg crash di tengah jalan), lalu siapkan folder khusus permintaan ini.
  await bersihkanTmpKedaluwarsa();
  const tmpDir = path.join(TMP_ROOT, crypto.randomUUID());
  await fsp.mkdir(tmpDir, { recursive: true });
  const bersihkanTmpDirIni = () => fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  const dilewati: string[] = [];

  // ------------------------------------------------------------------
  // Grup terbuka (per mode pengelompokan) -- lihat catatan perombakan
  // 27 Sep 2026 di atas berkas ini utk alasan lengkap kenapa dokumen
  // LANGSUNG di-embed ke sini (bukan ditahan sbg array bytes terpisah).
  interface GrupAktif {
    doc: PDFDocument;
    label: string;
  }
  const grupTerbuka = new Map<string, GrupAktif>();
  const hasilFiles: { nama: string; path: string }[] = [];
  let counterFile = 0;

  function labelUntukGrup(info: UnitInfo): string {
    if (pengelompokan === "per_orang") return info.petugasNama;
    if (pengelompokan === "per_tanggal") return info.tanggal ?? info.urutanTanggal;
    if (pengelompokan === "per_jenis") return LABEL_DOKUMEN[info.jenis];
    return `SPJ_${tanggalMulai}_${tanggalSelesai}`;
  }
  function kunciUntukGrup(info: UnitInfo): string {
    if (pengelompokan === "per_orang") return info.petugasKey;
    if (pengelompokan === "per_tanggal") return info.tanggal ?? info.urutanTanggal;
    if (pengelompokan === "per_jenis") return info.jenis;
    return "semua";
  }
  async function tambahKeGrup(info: UnitInfo, bytes: Uint8Array): Promise<void> {
    const key = kunciUntukGrup(info);
    let g = grupTerbuka.get(key);
    if (!g) {
      g = { doc: await PDFDocument.create(), label: labelUntukGrup(info) };
      grupTerbuka.set(key, g);
    }
    await embedKeMerged(g.doc, bytes);
    // `bytes` sengaja tidak disimpan di mana pun lagi -- setelah baris di
    // atas, satu2nya jejaknya tinggal di dalam `g.doc` (PDFDocument
    // gabungan), siap di-GC begitu fungsi ini selesai.
  }
  async function finalisasiGrup(key: string): Promise<void> {
    const g = grupTerbuka.get(key);
    if (!g) return; // grup tsb tdk pernah terisi dokumen apa pun -- lewati.
    grupTerbuka.delete(key);
    const bytes = await g.doc.save();
    counterFile++;
    const nomorUrut = String(counterFile).padStart(2, "0");
    const nama = pengelompokan === "gabung" ? `${namaFileAman(g.label)}.pdf` : `${nomorUrut}_${namaFileAman(g.label)}.pdf`;
    const filePath = path.join(tmpDir, `f${counterFile}.pdf`);
    await fsp.writeFile(filePath, bytes);
    hasilFiles.push({ nama, path: filePath });
  }

  try {
    for (let idxP = 0; idxP < daftarPenugasan.length; idxP++) {
      const p = daftarPenugasan[idxP];
      const petugasKey = kunciPetugas({ petugas_jenis: p.petugasJenis, petugas_id: p.petugasId });
      // Kolom "jabatan" (utk label PPL/PML & pemilihan NIK/NIP di Kwitansi)
      // HANYA ada di petugas_penyisiran_akun -- tetangga_akun tidak py kolom
      // itu, jadi select-nya dibedakan per jenis spy tidak error "column does
      // not exist". DUA query .select() TERPISAH (bukan 1 ternary di dalam
      // .select()) krn tipe supabase-js mem-parse string select() scr LITERAL
      // -- union dari 2 string literal bikin hasilnya ParserError di
      // TypeScript walau valid di runtime; hasilnya di-cast manual ke bentuk
      // yg sama (`jabatan` opsional).
      const { data: akunRaw } =
        p.petugasJenis === "penyisiran"
          ? await supabase.from(tabelAkun(p.petugasJenis)).select("nama, nip, jabatan").eq("id", p.petugasId).maybeSingle()
          : await supabase.from(tabelAkun(p.petugasJenis)).select("nama, nip").eq("id", p.petugasId).maybeSingle();
      const akun = akunRaw as { nama: string | null; nip: string | null; jabatan?: string | null } | null;
      const namaAkun = akun?.nama ?? p.nama;
      const peranLabel = labelJabatanDokumenSpj(p.petugasJenis, akun?.jabatan ?? null);

      // Ambil dulu SEMUA baris dokumen level-SET (Kwitansi/Visum/Surat
      // Pernyataan) -- lalu langsung digabung per KELOMPOK tanggal (lihat
      // "kelompokSet" di bawah), bukan per jenis dokumen lintas semua
      // kelompok.
      const { data: kListRaw } = dokumenDipilih.includes("kwitansi")
        ? await supabase
            .from("spj_kwitansi")
            .select("*")
            .eq("surat_tugas_id", p.suratTugasId)
            .eq("petugas_jenis", p.petugasJenis)
            .eq("petugas_id", p.petugasId)
            .lte("tanggal_mulai_set", tanggalSelesai)
            .gte("tanggal_selesai_set", tanggalMulai)
            .order("tanggal_mulai_set", { ascending: true })
        : { data: [] as Record<string, any>[] };
      const kList = kListRaw ?? [];
      if (dokumenDipilih.includes("kwitansi") && kList.length === 0) {
        dilewati.push(`Kwitansi -- ${p.nama} (${p.nomorSt})`);
      }

      const { data: vListRaw } = dokumenDipilih.includes("visum")
        ? await supabase
            .from("spj_visum")
            .select("*")
            .eq("surat_tugas_id", p.suratTugasId)
            .eq("petugas_jenis", p.petugasJenis)
            .eq("petugas_id", p.petugasId)
            .lte("tanggal_mulai_set", tanggalSelesai)
            .gte("tanggal_selesai_set", tanggalMulai)
            .order("tanggal_mulai_set", { ascending: true })
        : { data: [] as Record<string, any>[] };
      const vList = vListRaw ?? [];
      if (dokumenDipilih.includes("visum") && vList.length === 0) {
        dilewati.push(`Visum -- ${p.nama} (${p.nomorSt})`);
      }

      const { data: skListRaw } = dokumenDipilih.includes("surat_keterangan")
        ? await supabase
            .from("spj_surat_pernyataan_kendaraan")
            .select("*")
            .eq("surat_tugas_id", p.suratTugasId)
            .eq("petugas_jenis", p.petugasJenis)
            .eq("petugas_id", p.petugasId)
            .lte("tanggal_mulai_set", tanggalSelesai)
            .gte("tanggal_selesai_set", tanggalMulai)
            .order("tanggal_mulai_set", { ascending: true })
        : { data: [] as Record<string, any>[] };
      const skList = skListRaw ?? [];
      if (dokumenDipilih.includes("surat_keterangan") && skList.length === 0) {
        dilewati.push(`Surat Pernyataan -- ${p.nama} (${p.nomorSt})`);
      }

      // Surat Tugas -- 1 file scan yg SAMA, diambil SEKALI lalu disisipkan
      // ULANG di setiap kelompok tanggal (permintaan user 24 Sep 2026, spy
      // tiap kelompok tetap 1 paket SPJ yg lengkap & mandiri) -- TAPI HANYA
      // kalau kelompok itu benar2 akan jadi FILE TERPISAH (mode
      // "per_tanggal", kunci grup = tanggal, beda per kelompok). Utk mode
      // "per_orang"/"gabung"/"per_jenis", kunci grup TIDAK berubah antar
      // kelompok (tetap petugasKey / "semua" / "surat_tugas" berapa pun
      // banyaknya kelompok petugas ini) -- pemanggilan tanpa penjagaan akan
      // menyisipkan SCAN YANG SAMA PERSIS berkali-kali (1x per kelompok) ke
      // SATU PDF gabungan yg sama, jadi halaman Surat Tugas DOBEL/TRIPEL
      // dst tanpa guna (bukan cuma beda nilai spt Kwitansi/Visum/Surat
      // Pernyataan yg memang boleh >1 baris kalau tanggalnya beda).
      //
      // (28 Sep 2026, laporan user -- PDF "01_Velmarniati" berisi Surat
      // Tugas & beberapa dokumen lain persis dobel) Ditemukan lewat PDF yg
      // dikirim user: petugas dgn data yg SEMPAT terbagi jd 2 kelompok
      // (baik krn Hari Tugas beneran terputus, ATAU sisa baris SET usang yg
      // BARU diperbaiki hari ini di lib/spjSetHariTugas.ts) dicetak mode
      // "per_orang" -> Surat Tugas-nya kepasang 2x dlm 1 file yg sama.
      // `kunciStYgSudahDisisipkan` melacak kunci grup mana yg SUDAH dapat
      // Surat Tugas-nya utk petugas/ST ini (di-reset tiap `p`, aman lintas
      // petugas krn Set baru dibuat tiap iterasi) -- kunci yg sama tidak
      // akan disisipi ulang.
      const kunciStYgSudahDisisipkan = new Set<string>();
      // (28 Sep 2026) Sama spt `kunciStYgSudahDisisipkan` di atas, tapi utk
      // Laporan/Dokumentasi -- 1 TANGGAL yg sama bisa msh "termuat" di 2
      // kelompok Visum yg tumpang tindih (kasus SET lama/baru blm dibereskan,
      // lihat komentar besar di `kelompokMemuat` di bawah), jadi tanpa
      // penjagaan ini Laporan/Dokumentasi tgl tsb jg akan tersisip 2x persis
      // spt kasus Kwitansi/Visum/Surat Pernyataan yg dilaporkan user.
      const tanggalLaporanSudahDiproses = new Set<string>();
      let suratTugasBytes: Uint8Array | null = null;
      if (dokumenDipilih.includes("surat_tugas")) {
        const { data: st } = await supabase.from("spj_surat_tugas").select("file_path").eq("id", p.suratTugasId).maybeSingle();
        const blob = st?.file_path ? (await supabase.storage.from("spj-files").download(st.file_path)).data : null;
        if (blob) {
          suratTugasBytes = new Uint8Array(await blob.arrayBuffer());
        } else {
          dilewati.push(`Surat Tugas -- ${p.nama} (${p.nomorSt})`);
        }
      }

      const { data: laporanRows } = dokumenDipilih.includes("laporan")
        ? await supabase
            .from("spj_laporan")
            .select("*")
            .eq("surat_tugas_id", p.suratTugasId)
            .eq("petugas_jenis", p.petugasJenis)
            .eq("petugas_id", p.petugasId)
            .in("tanggal", p.tanggalList)
        : { data: [] as Record<string, unknown>[] };
      const petaLaporan = new Map((laporanRows ?? []).map((r) => [String(r.tanggal), r]));

      // Kecamatan domisili petugas -- utk baris lokasi tandatangan Surat
      // Pernyataan (24 Sep 2026, SATU sumber sama dgn Kwitansi/Visum,
      // lib/spjWilayahTugas.ts).
      const tempatKedudukanPetugas = dokumenDipilih.includes("surat_keterangan")
        ? (await hitungKecamatanTugas(supabase, { jenis: p.petugasJenis, petugasId: String(p.petugasId) })).domisili
        : null;

      // ------------------------------------------------------------------
      // Batas KELOMPOK tanggal: diambil dari baris VISUM (24 Sep 2026,
      // permintaan user -- "Surat Tugas jumlahnya mengacu ke jumlah Visum")
      // krn Visum SELALU dibuat mode "per_rentang" (lihat
      // app/api/penyisiran/spj/buat-otomatis/route.ts) -- itu SUMBER
      // kebenaran rentang tanggal yg tersambung/terputus, BUKAN lagi
      // dihitung ulang independen dari tanggalList. Kwitansi (SELALU 1
      // lembar/hari) & Surat Pernyataan (SELALU mengikuti rentang Visum yg
      // sama) otomatis masuk kelompok yg MEMUAT tanggalnya lewat
      // kelompokMemuat() di bawah.
      //
      // Fallback ke tanggalList (mode "per_rentang", gabung tanggal
      // berurutan) HANYA kalau Visum tidak dipilih/tidak ada datanya sama
      // sekali di print job ini -- spy Kwitansi/Laporan/Dokumentasi-only
      // print tetap terkelompok rapi. `pastikanKelompokUtk` tetap jadi jaring
      // pengaman: kalau ada baris Kwitansi/Surat Pernyataan yg rentangnya
      // (msh) di luar SEMUA kelompok Visum (data lama/tdk konsisten),
      // kelompok tambahan disisipkan drpd baris itu hilang diam2 dari cetakan.
      const kelompokSet: { tanggalMulai: string; tanggalSelesai: string }[] =
        vList.length > 0
          ? Array.from(new Set(vList.map((v) => `${v.tanggal_mulai_set}|${v.tanggal_selesai_set}`))).map((s) => {
              const [tanggalMulai2, tanggalSelesai2] = s.split("|");
              return { tanggalMulai: tanggalMulai2, tanggalSelesai: tanggalSelesai2 };
            })
          : hitungSetDariTanggal(p.tanggalList, "per_rentang").map((s) => ({
              tanggalMulai: s.tanggalMulai,
              tanggalSelesai: s.tanggalSelesai,
            }));
      // (28 Sep 2026, laporan user -- PDF "31_Velmarniati" Kwitansi/Visum/
      // Surat Pernyataan varian "18" tercetak DOBEL, sedangkan varian "17"
      // yg sudah usang cuma sekali) DULU `kelompokMemuat` pakai tes
      // CONTAINMENT (mulai>=kel.mulai && selesai<=kel.selesai) -- ini BENAR
      // selama Kwitansi masih model "1 lembar per hari" (butuh cek apakah 1
      // hari ada DI DALAM rentang kelompok yg lebih besar), tapi SEJAK
      // 25 Sep 2026 Kwitansi/Visum/Surat Pernyataan SEMUA dihitung "per_rentang"
      // dgn SET tanggal yg SAMA PERSIS lintas ke-3 jenis dokumen itu -- jadi
      // di kondisi normal (sudah diperbaiki via "Buat Otomatis") rentang 1
      // baris dokumen SELALU sama PERSIS dgn 1 kelompok, tidak pernah cuma
      // "di dalam"-nya. Masalahnya: SEBELUM "Buat Otomatis" diklik ulang stlh
      // Hari Tugas diubah, baris SET LAMA (mis. 17-30) & baris SET BARU (mis.
      // 18-30) bisa SAMA2 masih ada di DB sekaligus (blm dibereskan) -- Visum
      // jd punya 2 kelompok tanggal (17-30 & 18-30) yg SALING TUMPANG TINDIH.
      // Dgn tes containment, baris 18-30 (mulai=18,selesai=30) TERHITUNG
      // "di dalam" KEDUA kelompok itu (18>=17 && 30<=30 -> masuk kelompok
      // 17-30 JUGA, bukan cuma kelompok 18-30 miliknya sendiri) -> tersisip
      // 2x ke PDF gabungan. Baris 17-30 TIDAK kena masalah yg sama (18>=17
      // tp 17-30 TIDAK match kelompok 18-30 krn 17>=18 salah), makanya cuma
      // varian "18" yg dobel, varian "17" tetap sekali -- PERSIS sesuai laporan
      // user. Diganti jadi tes KESAMAAN PERSIS (bukan containment) supaya 1
      // baris dokumen HANYA pernah masuk ke 1 kelompok (miliknya sendiri) --
      // aman krn kelompokSet & baris kList/vList/skList SEKARANG selalu
      // dibangun dari rentang SET yg SAMA PERSIS (bukan sub-rentang lagi),
      // & `pastikanKelompokUtk` di bawah tetap menjamin ada kelompok yg PAS
      // utk baris manapun (ditambahkan dari nilai baris itu sendiri kalau
      // blm ada), jadi tidak ada baris yg jd hilang tercetak akibat perubahan
      // ini.
      const kelompokMemuat = (kel: { tanggalMulai: string; tanggalSelesai: string }, mulai: string, selesai: string) =>
        mulai === kel.tanggalMulai && selesai === kel.tanggalSelesai;
      const pastikanKelompokUtk = (mulai: string, selesai: string) => {
        if (!kelompokSet.some((k) => kelompokMemuat(k, mulai, selesai))) {
          kelompokSet.push({ tanggalMulai: mulai, tanggalSelesai: selesai });
        }
      };
      for (const k of kList) pastikanKelompokUtk(k.tanggal_mulai_set, k.tanggal_selesai_set);
      for (const sk of skList) pastikanKelompokUtk(sk.tanggal_mulai_set, sk.tanggal_selesai_set);
      kelompokSet.sort((a, b) => a.tanggalMulai.localeCompare(b.tanggalMulai));

      // ------------------------------------------------------------------
      // Susun dokumen PER KELOMPOK tanggal dulu, urutan DLM 1 kelompok tetap
      // standar SPJ (lib/spjMatriks.ts -> URUTAN_CETAK_STANDAR): Kwitansi ->
      // Surat Tugas -> Visum -> Laporan -> Dokumentasi -> Surat Pernyataan --
      // baru lanjut ke kelompok tanggal berikutnya. Setiap dokumen SELESAI
      // dibuat LANGSUNG disisipkan ke grupnya (`tambahKeGrup`) & byte-nya
      // dibuang -- lihat catatan perombakan 27 Sep 2026 di atas berkas ini.
      for (const kel of kelompokSet) {
        if (dokumenDipilih.includes("kwitansi")) {
          for (const k of kList.filter((r) => kelompokMemuat(kel, r.tanggal_mulai_set, r.tanggal_selesai_set))) {
            const bytes = await buatPdfKwitansi({
              nomorSt: p.nomorSt,
              tanggalTerbitSt: p.tanggalTerbitSt,
              nominal: Number(k.nominal),
              terbilang: k.terbilang,
              untukPerjalananDinasPada: k.untuk_perjalanan_dinas_pada,
              tanggalKwitansi: k.tanggal_kwitansi,
              namaPenerima: namaAkun,
              idPenerima: akun?.nip ?? null,
              jabatanPenerima: akun?.jabatan ?? null,
            });
            await tambahKeGrup(
              { petugasKey, petugasNama: p.nama, jenis: "kwitansi", tanggal: null, urutanTanggal: k.tanggal_mulai_set },
              bytes
            );
          }
        }

        if (suratTugasBytes) {
          const infoSuratTugas: UnitInfo = { petugasKey, petugasNama: p.nama, jenis: "surat_tugas", tanggal: null, urutanTanggal: kel.tanggalMulai };
          const kunciSuratTugas = kunciUntukGrup(infoSuratTugas);
          // Lihat komentar besar di deklarasi `kunciStYgSudahDisisipkan` di
          // atas -- cuma disisipkan lagi kalau kelompok ini benar2 menuju
          // FILE/grup yg BEDA dari kelompok sebelumnya (mode "per_tanggal"),
          // supaya tidak dobel di mode "per_orang"/"gabung"/"per_jenis".
          if (!kunciStYgSudahDisisipkan.has(kunciSuratTugas)) {
            kunciStYgSudahDisisipkan.add(kunciSuratTugas);
            await tambahKeGrup(infoSuratTugas, suratTugasBytes);
          }
        }

        if (dokumenDipilih.includes("visum")) {
          for (const v of vList.filter((r) => kelompokMemuat(kel, r.tanggal_mulai_set, r.tanggal_selesai_set))) {
            const bytes = await buatPdfVisum({
              nomorSt: p.nomorSt,
              namaPetugas: namaAkun,
              rencanaTujuan: v.rencana_tujuan,
              tempatKedudukan: v.tempat_kedudukan,
              tanggalBerangkat: v.tanggal_berangkat,
              tanggalTibaTujuan: v.tanggal_tiba_tujuan,
              tanggalBerangkatKembali: v.tanggal_berangkat_kembali,
              tanggalTibaKembali: v.tanggal_tiba_kembali,
            });
            await tambahKeGrup(
              { petugasKey, petugasNama: p.nama, jenis: "visum", tanggal: null, urutanTanggal: v.tanggal_mulai_set },
              bytes
            );
          }
        }

        // Laporan & Dokumentasi HANYA utk tanggal2 dlm kelompok ini -- tetap
        // diproses BERSAMA per tanggal (Laporan tgl X lalu Dokumentasi tgl X)
        // sesuai standar SPJ yg sudah ditetapkan sebelumnya.
        const tanggalDlmKelompok = p.tanggalList.filter(
          (t) => t >= kel.tanggalMulai && t <= kel.tanggalSelesai && !tanggalLaporanSudahDiproses.has(t)
        );
        for (const t of tanggalDlmKelompok) tanggalLaporanSudahDiproses.add(t);
        for (const tgl of tanggalDlmKelompok) {
          if (dokumenDipilih.includes("laporan")) {
            const l = petaLaporan.get(tgl);
            if (l) {
              const bytes = await buatPdfLaporan({
                nomorSt: p.nomorSt,
                namaPetugas: namaAkun,
                peranLabel,
                petugasJenis: p.petugasJenis,
                tanggal: String(l.tanggal),
                mode: l.mode === "bebas" ? "bebas" : "template",
                narasi: (l.narasi as string | null) ?? null,
                rekap: (l.rekap_snapshot as LaporanRekapSnapshot | null) ?? null,
              });
              await tambahKeGrup({ petugasKey, petugasNama: p.nama, jenis: "laporan", tanggal: tgl, urutanTanggal: tgl }, bytes);
            } else {
              dilewati.push(`Laporan ${tgl} -- ${p.nama} (${p.nomorSt})`);
            }
          }

          if (dokumenDipilih.includes("dokumentasi")) {
            const { data: fotoRows } = await supabase
              .from("spj_dokumentasi_foto")
              .select("slot, file_path")
              .eq("surat_tugas_id", p.suratTugasId)
              .eq("petugas_jenis", p.petugasJenis)
              .eq("petugas_id", p.petugasId)
              .eq("tanggal", tgl)
              .order("slot", { ascending: true });
            const foto: DokumentasiFotoInput[] = [];
            for (const r of (fotoRows ?? []) as { slot: number; file_path: string }[]) {
              const { data: blob } = await supabase.storage.from("spj-files").download(r.file_path);
              if (!blob) continue;
              const bytes2 = new Uint8Array(await blob.arrayBuffer());
              foto.push({ slot: r.slot, bytes: bytes2, contentType: blob.type === "image/png" ? "image/png" : "image/jpeg" });
            }
            if (foto.length > 0) {
              // Lokasi dihitung LANGSUNG dari aktivitas Penyisiran Usaha/
              // Identifikasi milik petugas pd tanggal itu (BUKAN dari
              // rekap_snapshot Laporan, yg bisa kosong/belum ada) -- lihat
              // lib/spjLokasiTugas.ts & komentar sama di
              // app/api/penyisiran/spj/dokumentasi/pdf/route.ts.
              let lokasi = "-";
              try {
                const hasilLokasi = await hitungLokasiTugas(supabase, { nama: namaAkun, jenis: p.petugasJenis, tanggal: tgl });
                lokasi = teksLokasiTugas(hasilLokasi);
              } catch {
                // biarkan "-" drpd menggagalkan seluruh pencetakan gabungan.
              }
              const bytes = await buatPdfDokumentasi({ nomorSt: p.nomorSt, namaPetugas: namaAkun, peranLabel, tanggal: tgl, lokasi, foto });
              await tambahKeGrup({ petugasKey, petugasNama: p.nama, jenis: "dokumentasi", tanggal: tgl, urutanTanggal: tgl }, bytes);
            } else {
              dilewati.push(`Dokumentasi ${tgl} -- ${p.nama} (${p.nomorSt})`);
            }
          }
        }

        if (dokumenDipilih.includes("surat_keterangan")) {
          for (const sk of skList.filter((r) => kelompokMemuat(kel, r.tanggal_mulai_set, r.tanggal_selesai_set))) {
            const bytes = await buatPdfSuratKeterangan({
              nomorSt: p.nomorSt,
              namaPetugas: namaAkun,
              nip: akun?.nip ?? null,
              jenis: p.petugasJenis,
              tanggalMulaiSet: sk.tanggal_mulai_set,
              tanggalSelesaiSet: sk.tanggal_selesai_set,
              jabatan: akun?.jabatan ?? null,
              tempatKedudukan: tempatKedudukanPetugas,
            });
            await tambahKeGrup(
              { petugasKey, petugasNama: p.nama, jenis: "surat_keterangan", tanggal: null, urutanTanggal: sk.tanggal_mulai_set },
              bytes
            );
          }
        }
      }

      // Mode "per_orang": begitu SEMUA Surat Tugas milik petugas ini selesai
      // diproses (dideteksi dari: entri berikutnya di daftarPenugasan, kalau
      // ada, sudah beda org -- lihat urutan sort di atas), langsung
      // final-kan & buang PDF gabungan org ini dari memori SEBELUM lanjut
      // ke petugas berikutnya. Inilah inti perbaikan memori utk kasus
      // "cetak semua petugas sekaligus".
      if (pengelompokan === "per_orang") {
        const berikutnya = daftarPenugasan[idxP + 1];
        const kunciBerikutnya = berikutnya
          ? kunciPetugas({ petugas_jenis: berikutnya.petugasJenis, petugas_id: berikutnya.petugasId })
          : null;
        if (kunciBerikutnya !== petugasKey) {
          await finalisasiGrup(petugasKey);
        }
      }
    }

    // Mode selain "per_orang" -- grupnya menggabung lintas petugas, jadi
    // baru bisa difinalisasi SEKARANG (setelah semua petugas selesai
    // diproses), diurutkan dulu spy penomoran file sesuai urutan tampil yg
    // sudah berlaku sebelumnya (per_tanggal = kronologis, per_jenis =
    // URUTAN_CETAK_STANDAR, gabung = cuma 1 file).
    if (pengelompokan !== "per_orang") {
      let sisaKunci = Array.from(grupTerbuka.keys());
      if (pengelompokan === "per_tanggal") {
        sisaKunci = sisaKunci.sort();
      } else if (pengelompokan === "per_jenis") {
        sisaKunci = sisaKunci.sort(
          (a, b) => URUTAN_CETAK_STANDAR.indexOf(a as JenisDokumen) - URUTAN_CETAK_STANDAR.indexOf(b as JenisDokumen)
        );
      }
      for (const key of sisaKunci) {
        await finalisasiGrup(key);
      }
    }

    if (hasilFiles.length === 0) {
      await bersihkanTmpDirIni();
      return NextResponse.json(
        { error: "Tidak ada dokumen yang tersedia utk kombinasi petugas/tanggal/jenis dokumen ini." },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------------
    // Kirim hasil -- STREAMING dari disk, bukan menahan semuanya sbg 1
    // buffer raksasa di RAM dulu (lihat catatan perombakan 27 Sep 2026).
    if (hasilFiles.length === 1 && dilewati.length === 0) {
      const satu = hasilFiles[0];
      const ukuran = (await fsp.stat(satu.path)).size;
      const nodeStream = fs.createReadStream(satu.path);
      nodeStream.on("close", bersihkanTmpDirIni);
      nodeStream.on("error", bersihkanTmpDirIni);
      const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
      return new NextResponse(webStream, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${satu.nama}"`,
          "Content-Length": String(ukuran),
        },
      });
    }

    const zip = new JSZip();
    for (const h of hasilFiles) {
      // Sumber berupa STREAM (bukan Buffer) -- JSZip membacanya sedikit
      // demi sedikit saat generateNodeStream jalan, bukan memuat semua
      // file sekaligus ke RAM sebelum mulai mengompres.
      zip.file(h.nama, fs.createReadStream(h.path));
    }
    if (dilewati.length > 0) {
      zip.file(
        "_dokumen_dilewati.txt",
        "Dokumen berikut TIDAK tersedia di sistem & TIDAK ikut dicetak (belum diisi/diupload):\n\n" + dilewati.join("\n")
      );
    }
    const zipNodeStream = zip.generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE" });
    zipNodeStream.on("end", bersihkanTmpDirIni);
    zipNodeStream.on("error", bersihkanTmpDirIni);
    const zipWebStream = Readable.toWeb(zipNodeStream as unknown as Readable) as unknown as ReadableStream;
    return new NextResponse(zipWebStream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="SPJ_${tanggalMulai}_${tanggalSelesai}.zip"`,
      },
    });
  } catch (err) {
    await bersihkanTmpDirIni();
    throw err;
  }
}
