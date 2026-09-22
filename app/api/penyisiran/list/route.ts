// app/api/penyisiran/list/route.ts
//
// Daftar keluarga (dipaginasi) utk panel kiri lembar pengecekan, dgn
// filter kecamatan/nagari/status/pencarian teks. Butuh token sesi valid
// dgn role "penyisiran" (PIN internal BPS) atau "penyisiran_petugas"
// (login personal). TIDAK PERNAH mengembalikan NIK/Nomor KK -- kolom itu
// memang tidak ada sama sekali di tabel penyisiran_usaha (sudah dibuang
// sejak di script Python), jadi tidak mungkin kebocor lewat sini.
//
// KHUSUS role "penyisiran_petugas": hasil query SELALU ditambah filter
// wilayah alokasi petugas ybs (.or() dari buildOrFilterWilayah(), lihat
// lib/wilayahAlokasiPetugas.ts) -- TIDAK PEDULI apa pun kec/nagari/subsls/
// q yang dikirim client, supaya petugas TIDAK BISA lihat data di luar
// SLS/Sub SLS yang sudah dipilihnya sendiri di kartu "Identifikasi Wilayah
// Sampel SLS" (termasuk lewat pencarian teks bebas `q` sekalipun tanpa
// kec/nagari -- makanya filter wilayah ditempel di LUAR blok if/else
// filter manual di bawah, bukan sbg salah satu opsi). Kalau petugas belum
// pernah submit alokasi SAMA SEKALI, langsung dikembalikan kosong (BUKAN
// "tampilkan semua") + flag `belumAdaWilayah` supaya FE bisa kasih pesan
// yang jelas. Role "penyisiran" (PIN admin) TIDAK terpengaruh apa pun,
// tetap bebas lihat semua data spt sebelumnya.
//
// KHUSUS akun PML (daftarIdUntukSesi()): wilayahnya = GABUNGAN wilayah
// SELURUH PPL yang diawasinya (pengawas_id) -- PML jadi bisa lihat kartu
// yang sama dgn PPL-nya, walau tidak pernah memilih wilayah sendiri. Hak
// ubah status/catatan/info tetap DIBATASI di /api/penyisiran/update (PML
// cuma boleh ubah prioritas_pasti), TIDAK di endpoint baca ini.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionRole, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { ambilWilayahAlokasi, buildOrFilterWilayah, daftarIdUntukSesi } from "@/lib/wilayahAlokasiPetugas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;
const KOLOM =
  "kode_identitas, idsubsls, kec_kode, kec_nama, nagari_kode, nagari_nama, " +
  "sls_kode, sls_nama, subsls_kode, nama_kk, nama_anggota_keluarga, alamat, lat, lng, " +
  "bukti_dutp, bukti_dtsen, bukti_pnm, pnm_sektor, pnm_subsektor, " +
  "dtsen_lapangan_usaha, catatan_sensus, status_kunjungan, catatan_petugas, " +
  "info_ppl, info_jorong, info_tetangga, identifikasi_ppl, identifikasi_ppl_at, " +
  "prioritas_pasti, tag_pml, tag_pml_oleh, tag_pml_at, tag_pml_catatan, penyisiran_oleh, updated_at, ditemukan_at";

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const sp = req.nextUrl.searchParams;
  const kec = sp.get("kec") || "";
  const nagari = sp.get("nagari") || "";
  const subsls = sp.get("subsls") || ""; // idsubsls (16 digit), dropdown filter tahap 3
  const status = sp.get("status") || "";
  // tagPml ("🚩 Ditandai PML" -- permintaan user supaya PPL/PML gampang
  // lihat kartu yg ditandai PML "Perlu Segera" tanpa buka satu-satu):
  // filter tambahan, independen dari `status` (kartu yg ditandai bisa
  // status APA SAJA, bukan cuma "belum"), makanya query param terpisah,
  // bukan ditumpuk ke STATUS_PILIHAN.
  const tagPml = sp.get("tag_pml") === "1";
  const q = (sp.get("q") || "").trim();
  const page = Math.max(1, Number(sp.get("page")) || 1);

  // Role "penyisiran_petugas" (login personal) SELALU dibatasi ke wilayah
  // alokasinya sendiri -- lihat komentar panjang di atas file ini. Belum
  // pernah submit alokasi = tidak ada apa pun yg boleh ditampilkan.
  let filterWilayah: string | null = null;
  if (getSessionRole(token) === "penyisiran_petugas") {
    const petugasId = Number(getSessionSubject(token));
    if (!Number.isFinite(petugasId) || petugasId <= 0) {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }
    let daftarId: number[];
    try {
      ({ ids: daftarId } = await daftarIdUntukSesi(supabase, petugasId));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal memuat data pengawasan." }, { status: 500 });
    }
    let pilihan;
    try {
      pilihan = await ambilWilayahAlokasi(supabase, daftarId);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal memuat wilayah alokasi." }, { status: 500 });
    }
    filterWilayah = buildOrFilterWilayah(pilihan);
    if (!filterWilayah) {
      return NextResponse.json({ rows: [], total: 0, page, pageSize: PAGE_SIZE, belumAdaWilayah: true });
    }
  } else if (!kec && !nagari && !q && !tagPml) {
    // Jangan biarkan query tanpa filter sama sekali menyapu SEMUA baris --
    // panel filter di client mewajibkan pilih kecamatan dulu, tapi dijaga
    // juga di sini kalau-kalau dipanggil langsung. TIDAK berlaku utk
    // "penyisiran_petugas" krn sudah pasti dibatasi filterWilayah di atas.
    return NextResponse.json(
      { error: "Pilih kecamatan (atau isi pencarian) terlebih dahulu." },
      { status: 400 }
    );
  }

  // Hanya baris `aktif = true` yg ditampilkan sbg target penyisiran --
  // kolom ini ditambah Sep 2026 utk penonaktifan (BUKAN hapus permanen)
  // hasil sisir HGBB: baris yg tidak match daftar HGBB & belum pernah
  // dikerjakan (status_kunjungan masih 'belum') ditandai nonaktif, tapi
  // datanya tetap ada & bisa diaktifkan lagi kapan saja (lihat kolom
  // nonaktif_alasan/nonaktif_at).
  let query = supabase.from("penyisiran_usaha").select(KOLOM, { count: "exact" }).eq("aktif", true);
  if (filterWilayah) query = query.or(filterWilayah);
  if (kec) query = query.eq("kec_kode", kec);
  if (nagari) query = query.eq("nagari_kode", nagari);
  if (subsls) query = query.eq("idsubsls", subsls);
  if (status) query = query.eq("status_kunjungan", status);
  if (tagPml) query = query.eq("tag_pml", true);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    // ikut cari di nama_anggota_keluarga jg (mis. nama pasangan) -- sengaja
    // TIDAK menghapus nama_kk dari pencarian krn data lama (blm diunggah
    // ulang lewat script Python yg sudah ditambah kolom ini) cuma punya
    // nama_kk saja.
    query = query.or(
      `nama_kk.ilike.${like},nama_anggota_keluarga.ilike.${like},alamat.ilike.${like},kode_identitas.ilike.${like}`
    );
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.order("nagari_nama", { ascending: true }).order("nama_kk", { ascending: true }).range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
