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
// kelompok spy tiap kelompok tetap 1 paket mandiri. Batas kelompok dihitung
// dari tanggal Hari Tugas sendiri (lib/spjSetHariTugas.ts, mode
// "per_rentang") -- lihat blok "kelompokSet" di bawah.
//
// Non-pengelola (petugas/tetangga login SPJ biasa) HANYA boleh mencetak
// data MILIKNYA SENDIRI -- field `petugas` dari body diabaikan sepenuhnya
// & dipaksa jadi [diri sendiri], sama spt pola akses lain di menu ini.
//
// Kalau hasilnya cuma 1 file (1 kelompok, tanpa dokumen yg dilewati),
// dikembalikan sbg PDF langsung. Kalau lebih dari 1 file ATAU ada dokumen
// yg dilewati (blm ada datanya), dibungkus jadi 1 file ZIP (pakai
// dependensi baru "jszip") berisi semua PDF + catatan
// "_dokumen_dilewati.txt" kalau ada yg dilewati.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
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

interface UnitCetak {
  petugasKey: string;
  petugasNama: string;
  jenis: JenisDokumen;
  tanggal: string | null; // null = dokumen tingkat-perjalanan
  urutanTanggal: string; // tanggal efektif utk penempatan di mode per_tanggal
  bytes: Uint8Array;
}

interface Penugasan {
  petugasJenis: SpjPetugasJenis;
  petugasId: number;
  nama: string;
  suratTugasId: number;
  nomorSt: string;
  tanggalMulaiEfektif: string;
  tanggalList: string[];
}

interface BarisMatriksMentah {
  petugas_jenis: SpjPetugasJenis;
  petugas_id: number;
  nama: string;
  surat_tugas_id: number;
  nomor_st: string;
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

async function gabungkanUnit(units: UnitCetak[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const u of units) {
    await embedKeMerged(merged, u.bytes);
  }
  return merged.save();
}

function kunciKelompok(u: UnitCetak, mode: Pengelompokan): string {
  if (mode === "per_orang") return u.petugasKey;
  if (mode === "per_tanggal") return u.tanggal ?? u.urutanTanggal;
  if (mode === "per_jenis") return u.jenis;
  return "semua";
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
        tanggalMulaiEfektif: b.tanggal,
        tanggalList: [],
      };
      petaPenugasan.set(key, p);
    }
    p.tanggalList.push(b.tanggal);
    if (b.tanggal < p.tanggalMulaiEfektif) p.tanggalMulaiEfektif = b.tanggal;
  }
  for (const p of petaPenugasan.values()) p.tanggalList.sort();
  const daftarPenugasan = Array.from(petaPenugasan.values()).sort(
    (a, b) => a.nama.localeCompare(b.nama, "id") || a.suratTugasId - b.suratTugasId
  );

  const unit: UnitCetak[] = [];
  const dilewati: string[] = [];

  for (const p of daftarPenugasan) {
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
    // Pernyataan) -- BUKAN langsung dijadikan unit PDF di sini, krn urutan
    // final SEKARANG per KELOMPOK tanggal dulu (lihat "kelompokSet" di
    // bawah), bukan per jenis dokumen lintas semua kelompok.
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
    // tiap kelompok tetap 1 paket SPJ yg lengkap & mandiri).
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
    // Batas KELOMPOK tanggal: dihitung dari tanggal Hari Tugas milik
    // penugasan ini sendiri (p.tanggalList, SUDAH difilter ke rentang Print
    // Builder), mode "per_rentang" -- tanggal yg BERURUTAN (selisih 1 hari)
    // digabung 1 kelompok, begitu ada "lubang" kelompok baru dimulai (mis.
    // 2,3,6,7,8 -> [2-3] & [6-8]). Ini menjamin SETIAP tanggal di
    // p.tanggalList pasti kebagian TEPAT 1 kelompok (tidak dobel/tidak ada
    // yg terlewat) -- beda dgn memakai batas SET tersimpan di baris
    // Kwitansi/Visum/Surat Pernyataan langsung, yg BISA lebih rinci (mis.
    // dibuat mode "per_hari") atau blm tentu menutupi semua tanggal (kalau
    // SET blm dibuat utk sebagian tanggal). Baris2 dokumen itu lalu
    // DIMASUKKAN ke kelompok yg MEMUAT rentangnya (bukan dicocokkan persis
    // sama) lewat kelompokMemuat() di bawah; kalau ada baris yg rentangnya
    // di luar SEMUA kelompok alami ini (kasus langka/data tdk konsisten),
    // kelompok tambahan disisipkan supaya baris itu tetap tercetak (drpd
    // hilang diam2).
    const kelompokSet: { tanggalMulai: string; tanggalSelesai: string }[] = hitungSetDariTanggal(
      p.tanggalList,
      "per_rentang"
    ).map((s) => ({ tanggalMulai: s.tanggalMulai, tanggalSelesai: s.tanggalSelesai }));
    const kelompokMemuat = (kel: { tanggalMulai: string; tanggalSelesai: string }, mulai: string, selesai: string) =>
      mulai >= kel.tanggalMulai && selesai <= kel.tanggalSelesai;
    const pastikanKelompokUtk = (mulai: string, selesai: string) => {
      if (!kelompokSet.some((k) => kelompokMemuat(k, mulai, selesai))) {
        kelompokSet.push({ tanggalMulai: mulai, tanggalSelesai: selesai });
      }
    };
    for (const k of kList) pastikanKelompokUtk(k.tanggal_mulai_set, k.tanggal_selesai_set);
    for (const v of vList) pastikanKelompokUtk(v.tanggal_mulai_set, v.tanggal_selesai_set);
    for (const sk of skList) pastikanKelompokUtk(sk.tanggal_mulai_set, sk.tanggal_selesai_set);
    kelompokSet.sort((a, b) => a.tanggalMulai.localeCompare(b.tanggalMulai));

    // ------------------------------------------------------------------
    // Susun unit PDF PER KELOMPOK tanggal dulu, urutan DLM 1 kelompok tetap
    // standar SPJ (lib/spjMatriks.ts -> URUTAN_CETAK_STANDAR): Kwitansi ->
    // Surat Tugas -> Visum -> Laporan -> Dokumentasi -> Surat Pernyataan --
    // baru lanjut ke kelompok tanggal berikutnya.
    for (const kel of kelompokSet) {
      if (dokumenDipilih.includes("kwitansi")) {
        for (const k of kList.filter((r) => kelompokMemuat(kel, r.tanggal_mulai_set, r.tanggal_selesai_set))) {
          const bytes = await buatPdfKwitansi({
            nomorSt: p.nomorSt,
            tanggalSpd: k.tanggal_spd,
            nominal: Number(k.nominal),
            terbilang: k.terbilang,
            untukPerjalananDinasPada: k.untuk_perjalanan_dinas_pada,
            tanggalKwitansi: k.tanggal_kwitansi,
            namaPenerima: namaAkun,
            idPenerima: akun?.nip ?? null,
            jabatanPenerima: akun?.jabatan ?? null,
          });
          unit.push({ petugasKey, petugasNama: p.nama, jenis: "kwitansi", tanggal: null, urutanTanggal: k.tanggal_mulai_set, bytes });
        }
      }

      if (suratTugasBytes) {
        unit.push({
          petugasKey,
          petugasNama: p.nama,
          jenis: "surat_tugas",
          tanggal: null,
          urutanTanggal: kel.tanggalMulai,
          bytes: suratTugasBytes,
        });
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
          unit.push({ petugasKey, petugasNama: p.nama, jenis: "visum", tanggal: null, urutanTanggal: v.tanggal_mulai_set, bytes });
        }
      }

      // Laporan & Dokumentasi HANYA utk tanggal2 dlm kelompok ini -- tetap
      // diproses BERSAMA per tanggal (Laporan tgl X lalu Dokumentasi tgl X)
      // sesuai standar SPJ yg sudah ditetapkan sebelumnya.
      const tanggalDlmKelompok = p.tanggalList.filter((t) => t >= kel.tanggalMulai && t <= kel.tanggalSelesai);
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
            unit.push({ petugasKey, petugasNama: p.nama, jenis: "laporan", tanggal: tgl, urutanTanggal: tgl, bytes });
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
            unit.push({ petugasKey, petugasNama: p.nama, jenis: "dokumentasi", tanggal: tgl, urutanTanggal: tgl, bytes });
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
          unit.push({
            petugasKey,
            petugasNama: p.nama,
            jenis: "surat_keterangan",
            tanggal: null,
            urutanTanggal: sk.tanggal_mulai_set,
            bytes,
          });
        }
      }
    }
  }

  if (unit.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada dokumen yang tersedia utk kombinasi petugas/tanggal/jenis dokumen ini." },
      { status: 400 }
    );
  }

  const peta = new Map<string, UnitCetak[]>();
  for (const u of unit) {
    const k = kunciKelompok(u, pengelompokan);
    if (!peta.has(k)) peta.set(k, []);
    peta.get(k)!.push(u);
  }
  let groupKeys = Array.from(peta.keys());
  if (pengelompokan === "per_orang") {
    groupKeys = groupKeys.sort((a, b) => peta.get(a)![0].petugasNama.localeCompare(peta.get(b)![0].petugasNama, "id"));
  } else if (pengelompokan === "per_tanggal") {
    groupKeys = groupKeys.sort();
  } else if (pengelompokan === "per_jenis") {
    groupKeys = groupKeys.sort(
      (a, b) => URUTAN_CETAK_STANDAR.indexOf(a as JenisDokumen) - URUTAN_CETAK_STANDAR.indexOf(b as JenisDokumen)
    );
  }

  const hasil: { nama: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < groupKeys.length; i++) {
    const k = groupKeys[i];
    const units = peta.get(k)!;
    const bytes = await gabungkanUnit(units);
    let label: string;
    if (pengelompokan === "per_orang") label = units[0].petugasNama;
    else if (pengelompokan === "per_tanggal") label = k;
    else if (pengelompokan === "per_jenis") label = LABEL_DOKUMEN[k as JenisDokumen];
    else label = `SPJ_${tanggalMulai}_${tanggalSelesai}`;
    const nomorUrut = String(i + 1).padStart(2, "0");
    const nama = pengelompokan === "gabung" ? `${namaFileAman(label)}.pdf` : `${nomorUrut}_${namaFileAman(label)}.pdf`;
    hasil.push({ nama, bytes });
  }

  if (hasil.length === 1 && dilewati.length === 0) {
    return new NextResponse(Buffer.from(hasil[0].bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${hasil[0].nama}"`,
      },
    });
  }

  const zip = new JSZip();
  for (const h of hasil) zip.file(h.nama, h.bytes);
  if (dilewati.length > 0) {
    zip.file(
      "_dokumen_dilewati.txt",
      "Dokumen berikut TIDAK tersedia di sistem & TIDAK ikut dicetak (belum diisi/diupload):\n\n" + dilewati.join("\n")
    );
  }
  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  return new NextResponse(Buffer.from(zipBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="SPJ_${tanggalMulai}_${tanggalSelesai}.zip"`,
    },
  });
}
