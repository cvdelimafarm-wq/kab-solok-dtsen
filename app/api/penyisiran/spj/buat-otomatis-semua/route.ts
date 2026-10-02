// app/api/penyisiran/spj/buat-otomatis-semua/route.ts
//
// (28 Sep 2026) POST -> "Jalankan untuk SEMUA petugas sekaligus": versi
// BULK dari app/api/penyisiran/spj/buat-otomatis/route.ts -- menjalankan
// prosesBuatOtomatisPenugasan() (lib/spjBuatOtomatisInti.ts) utk SETIAP
// kombinasi (petugas, Surat Tugas) yg ada di sistem, bukan cuma 1 org/1
// klik spt tombol lama.
//
// Latar belakang: laporan user "sebagian petugas seperti PPL Ilham tidak
// ada spj lain selain ST yang muncul setelah generate" -> setelah dicek ke
// SELURUH petugas (permintaan user "cek semua petugas"), ternyata BUKAN
// bug cetak/generate -- Kwitansi/Visum/Surat Pernyataan memang belum
// pernah "Buat Otomatis"-kan utk sejumlah petugas, krn tombolnya ADA 3
// TERPISAH di 3 tab berbeda (Visum/Kwitansi/Surat Keterangan) -- gampang
// ada yg kelewat, apalagi kalau Hari Tugas org itu baru ditandai/ditambah
// belakangan (tombol "Buat Otomatis" tidak otomatis dijalankan ulang
// sendiri). User diberi 3 opsi penyelesaian & memilih dibuatkan tombol
// baru yg menjalankan proses ini utk SEMUA petugas sekaligus, supaya tidak
// perlu "menjelaskan trik ini ke berbagai user" (prinsip yg sama dgn
// perbaikan memory Cetak SPJ sebelumnya) -- pengelola tinggal klik 1x
// secara berkala (atau kapan saja curiga ada yg kurang) drpd mengecek
// manual satu2.
//
// KHUSUS PENGELOLA -- endpoint ini melihat/memproses SEMUA petugas, jadi
// non-pengelola ditolak 403 (beda dgn buat-otomatis/route.ts yg boleh
// dipakai petugas biasa utk dirinya sendiri).
//
// Cara kerja: enumerasi SETIAP pasangan (surat_tugas_id, petugas_jenis,
// petugas_id) dari tabel spj_surat_tugas_petugas (1 org bisa py >1 Surat
// Tugas, masing2 diproses terpisah -- SAMA seperti kalau pengelola klik
// "Buat Otomatis" manual utk tiap ST), panggil prosesBuatOtomatisPenugasan
// SATU per SATU (bukan Promise.all -- sengaja SEKUENSIAL spy tidak
// membanjiri Supabase dgn ratusan request paralel & supaya urutan hasil
// stabil/mudah dibaca), lalu akumulasikan:
//   - Total dibuat/diperbaiki per jenis dokumen (utk ringkasan cepat).
//   - Daftar "butuh_perhatian": kombinasi yg GAGAL (error keras, mis.
//     Hari Tugas belum ditandai) ATAU py peringatan wilayah_tugas_kosong
//     -- ini yg TIDAK BISA diperbaiki lewat tombol ini sendiri (perlu
//     pengelola/petugas ybs melengkapi data dulu, lihat `navigasi`).
// Nama petugas diresolusi via tabelAkun() supaya daftar "butuh_perhatian"
// langsung terbaca (bukan cuma id mentah).
//
// TIDAK ada penolakan/validasi kepemilikan ST per petugas di sini (beda
// dgn buat-otomatis/route.ts) -- krn pasangan (petugas, ST) di sini
// LANGSUNG diambil dari spj_surat_tugas_petugas itu sendiri (sumber
// kebenaran kepemilikan), bukan dari input body yg perlu divalidasi.
//
// (2 Okt 2026) Opsional body.petugas: [{jenis, id}] -- kalau dikirim,
// HANYA pasangan (petugas, ST) milik petugas-petugas itu yg diproses
// (bukan SELURUH sistem). Dipakai wizard "Cetak SPJ" (app/penyisiran/
// spj-cetak.tsx, SpjCetakTab.handleGenerate) supaya SEBELUM menyusun PDF,
// Kwitansi/Visum/Surat Pernyataan yg belum lengkap dilengkapi dulu --
// tapi DIBATASI ke petugas yg sedang dicentang di wizard itu saja (bukan
// seluruh kabupaten), supaya tidak lambat/boros tiap kali generate. Kalau
// body.petugas tidak dikirim/kosong, perilaku lama dipertahankan (proses
// SEMUA pasangan) -- dipakai tombol "🔁 Jalankan untuk SEMUA petugas
// sekaligus" di tab Monitoring SPJ.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj, tabelAkun, SpjPetugasJenis } from "@/lib/spjAuth";
import { TARIF_TRANSLOK_PER_HARI_DEFAULT } from "@/lib/spjSetHariTugas";
import { prosesBuatOtomatisPenugasan, JENIS_DOKUMEN_SET, JenisDokumenSet } from "@/lib/spjBuatOtomatisInti";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

interface ButuhPerhatian {
  petugas_jenis: SpjPetugasJenis;
  petugas_id: string;
  nama: string | null;
  surat_tugas_id: number;
  nomor_st: string | null;
  kode: string; // "error" (gagal keras) ATAU kode peringatan spt "wilayah_tugas_kosong"
  jenis?: JenisDokumenSet;
  pesan: string;
  navigasi?: { halaman: string; keterangan: string };
}

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);
  if (!namaPengelola) {
    return NextResponse.json({ error: "Hanya pengelola yang boleh menjalankan proses ini utk semua petugas." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const dokumenMentah: unknown[] = Array.isArray(body?.dokumen) ? body.dokumen : [];
  const dokumenDipilih: JenisDokumenSet[] =
    dokumenMentah.length > 0 ? JENIS_DOKUMEN_SET.filter((j) => dokumenMentah.includes(j)) : [...JENIS_DOKUMEN_SET];
  const tarifPerHariInput = Number(body?.tarif_per_hari);
  const tarifPerHari = Number.isFinite(tarifPerHariInput) && tarifPerHariInput > 0 ? tarifPerHariInput : TARIF_TRANSLOK_PER_HARI_DEFAULT;

  // Filter opsional ke petugas tertentu saja -- lihat komentar besar di
  // atas file ini. Kunci dicocokkan sbg "jenis:id" (id dinormalisasi jadi
  // string spy konsisten dgn petugas_id yg juga string di tabel).
  const petugasFilterMentah: unknown[] = Array.isArray(body?.petugas) ? body.petugas : [];
  const petugasFilter = new Set(
    petugasFilterMentah
      .map((p) => {
        if (!p || typeof p !== "object") return null;
        const jenis = (p as { jenis?: unknown }).jenis;
        const id = (p as { id?: unknown }).id;
        if ((jenis !== "penyisiran" && jenis !== "tetangga") || (typeof id !== "number" && typeof id !== "string")) {
          return null;
        }
        return `${jenis}:${id}`;
      })
      .filter((k): k is string => k !== null)
  );

  // Setiap pasangan (Surat Tugas, petugas) yg ada di sistem -- 1 org bisa
  // muncul >1 kali kalau py >1 Surat Tugas (masing2 diproses terpisah,
  // sama seperti kalau diklik manual per-ST).
  const { data: tautanRaw, error: errTautan } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("surat_tugas_id, petugas_jenis, petugas_id");
  if (errTautan) return NextResponse.json({ error: errTautan.message }, { status: 500 });
  const tautanSemua = (tautanRaw ?? []) as { surat_tugas_id: number; petugas_jenis: SpjPetugasJenis; petugas_id: string }[];
  const tautan =
    petugasFilter.size > 0
      ? tautanSemua.filter((t) => petugasFilter.has(`${t.petugas_jenis}:${t.petugas_id}`))
      : tautanSemua;

  if (tautan.length === 0) {
    return NextResponse.json({
      ok: true,
      total_pasangan: 0,
      total_dibuat: 0,
      total_diperbaiki: 0,
      total_dihapus_usang: 0,
      hasil_per_jenis: [],
      butuh_perhatian: [],
      dihapus_krn_usang: [],
      ringkasan:
        petugasFilter.size > 0
          ? "Tidak ada Surat Tugas yang ditautkan ke petugas yang dipilih."
          : "Belum ada Surat Tugas yang ditautkan ke petugas mana pun.",
    });
  }

  // Nama petugas -- diambil sekali per tabel akun (bukan per baris) spy
  // tidak query berulang2 utk org yg sama.
  const idPenyisiran = Array.from(new Set(tautan.filter((t) => t.petugas_jenis === "penyisiran").map((t) => t.petugas_id)));
  const idTetangga = Array.from(new Set(tautan.filter((t) => t.petugas_jenis === "tetangga").map((t) => t.petugas_id)));
  const namaMap = new Map<string, string | null>();
  if (idPenyisiran.length > 0) {
    const { data } = await supabase.from(tabelAkun("penyisiran")).select("id, nama").in("id", idPenyisiran);
    for (const r of (data ?? []) as { id: string | number; nama: string | null }[]) namaMap.set(`penyisiran:${r.id}`, r.nama);
  }
  if (idTetangga.length > 0) {
    const { data } = await supabase.from(tabelAkun("tetangga")).select("id, nama").in("id", idTetangga);
    for (const r of (data ?? []) as { id: string | number; nama: string | null }[]) namaMap.set(`tetangga:${r.id}`, r.nama);
  }

  const totalPerJenis = new Map<JenisDokumenSet, { dibuat: number; diperbaiki: number; sudahAda: number }>();
  for (const j of JENIS_DOKUMEN_SET) totalPerJenis.set(j, { dibuat: 0, diperbaiki: 0, sudahAda: 0 });
  const butuhPerhatian: ButuhPerhatian[] = [];
  // (28 Sep 2026) Rekap baris dokumen LAMA yg dihapus TOTAL (bukan
  // digabung/diperluas) krn rentang tanggalnya sudah tidak beririsan lagi
  // dgn Hari Tugas SAAT INI (mis. Hari Tugas 17-30 diganti jadi 18-30) --
  // lihat komentar besar di lib/spjSetHariTugas.ts. Disertakan nama
  // petugas + nomor ST supaya pengelola bisa cross-check kalau perlu
  // (walau ini penghapusan yg DIHARAPKAN/benar, bukan error).
  const dihapusKrnUsangSemua: {
    petugas_jenis: SpjPetugasJenis;
    petugas_id: string;
    nama: string | null;
    surat_tugas_id: number;
    nomor_st: string | null;
    jenis: JenisDokumenSet;
    tanggal_mulai: string;
    tanggal_selesai: string;
  }[] = [];
  let totalDibuat = 0;
  let totalDiperbaiki = 0;
  let totalDihapusUsang = 0;

  // SENGAJA sekuensial (bukan Promise.all) -- lihat komentar besar di
  // atas file ini kenapa (hindari membanjiri Supabase & urutan hasil
  // stabil).
  for (const t of tautan) {
    const nama = namaMap.get(`${t.petugas_jenis}:${t.petugas_id}`) ?? null;
    const hasil = await prosesBuatOtomatisPenugasan(supabase, {
      suratTugasId: t.surat_tugas_id,
      targetJenis: t.petugas_jenis,
      targetId: t.petugas_id,
      dokumenDipilih,
      tarifPerHari,
    });

    if (!hasil.ok) {
      butuhPerhatian.push({
        petugas_jenis: t.petugas_jenis,
        petugas_id: t.petugas_id,
        nama,
        surat_tugas_id: t.surat_tugas_id,
        nomor_st: hasil.nomorSt ?? null,
        kode: "error",
        pesan: hasil.error ?? "Gagal tanpa pesan.",
        navigasi: hasil.navigasi,
      });
      continue;
    }

    for (const h of hasil.hasil) {
      const acc = totalPerJenis.get(h.jenis)!;
      acc.dibuat += h.dibuat;
      acc.diperbaiki += h.diperbaiki;
      acc.sudahAda += h.sudahAda;
      totalDibuat += h.dibuat;
      totalDiperbaiki += h.diperbaiki;
    }
    for (const p of hasil.peringatan) {
      butuhPerhatian.push({
        petugas_jenis: t.petugas_jenis,
        petugas_id: t.petugas_id,
        nama,
        surat_tugas_id: t.surat_tugas_id,
        nomor_st: hasil.nomorSt ?? null,
        kode: p.kode,
        jenis: p.jenis,
        pesan: p.pesan,
        navigasi: p.navigasi,
      });
    }
    for (const d of hasil.dihapusKrnUsang) {
      totalDihapusUsang++;
      dihapusKrnUsangSemua.push({
        petugas_jenis: t.petugas_jenis,
        petugas_id: t.petugas_id,
        nama,
        surat_tugas_id: t.surat_tugas_id,
        nomor_st: hasil.nomorSt ?? null,
        jenis: d.jenis,
        tanggal_mulai: d.tanggalMulai,
        tanggal_selesai: d.tanggalSelesai,
      });
    }
  }

  const hasilPerJenis = JENIS_DOKUMEN_SET.map((j) => ({ jenis: j, ...totalPerJenis.get(j)! }));

  const ringkasan =
    totalDibuat === 0 && totalDiperbaiki === 0 && totalDihapusUsang === 0
      ? `Tidak ada perubahan -- semua ${tautan.length} pasangan petugas+Surat Tugas sudah lengkap & konsisten.${
          butuhPerhatian.length > 0 ? ` ${butuhPerhatian.length} butuh perhatian pengelola/petugas ybs (lihat daftar).` : ""
        }`
      : `Diproses ${tautan.length} pasangan petugas+Surat Tugas: ${totalDibuat} baris dokumen baru dibuat, ${totalDiperbaiki} SET lama dirapikan ulang${
          totalDihapusUsang > 0 ? `, ${totalDihapusUsang} baris dokumen lama dihapus krn tanggalnya sudah tidak ada lagi di Hari Tugas saat ini` : ""
        }.${butuhPerhatian.length > 0 ? ` ${butuhPerhatian.length} butuh perhatian pengelola/petugas ybs (lihat daftar).` : ""}`;

  return NextResponse.json({
    ok: true,
    total_pasangan: tautan.length,
    total_dibuat: totalDibuat,
    total_diperbaiki: totalDiperbaiki,
    total_dihapus_usang: totalDihapusUsang,
    hasil_per_jenis: hasilPerJenis,
    butuh_perhatian: butuhPerhatian,
    dihapus_krn_usang: dihapusKrnUsangSemua,
    ringkasan,
  });
}
