// app/api/penyisiran/tambah-manual/route.ts
//
// "➕ Tambah Target KK Baru" (permintaan user) -- petugas lapangan bisa
// menambah 1 keluarga baru yang DITEMUKAN SAAT MENYISIR tapi belum ada di
// daftar bulk-upload, langsung dari tab Penyisiran Usaha (tombol melayang
// di samping "🔒 Edit Semua Info Lapangan"). Sengaja modal-nya SEDERHANA
// (permintaan user "jangan ribet") -- HANYA: Nama KRT (wajib), wilayah
// Kecamatan->Nagari->Sub SLS (wajib, dropdown, BUKAN ketik manual -- lihat
// alasan di bawah), Alamat (opsional). Field lain (GPS, bukti DUTP/DTSEN/
// PNM, sektor PNM, dst) SENGAJA TIDAK ada di form ini -- diisi belakangan
// lewat kartu/detail yg SUDAH ADA begitu baris ini muncul di daftar,
// PERSIS spt baris hasil upload biasa (checklist/RowCard tidak butuh tahu
// apakah baris ini manual atau bukan, cuma beda di 2 kolom penanda
// ditambah_manual/ditambah_manual_oleh, lihat migrasi
// 20260922f_tambah_manual_penyisiran_usaha.sql).
//
// Kenapa wilayah HARUS pilih dari dropdown (bukan ketik bebas): (1) supaya
// nama kecamatan/nagari/SLS konsisten dgn data yg sudah ada (tidak ada typo
// varian baru), (2) idsubsls (kode 16 digit) WAJIB persis sama dgn baris
// yg sudah ada di Sub SLS itu supaya baris baru ini otomatis ikut kehitung
// di filter/monitoring yg sudah ada. kode_identitas & nama/kode wilayah
// TIDAK PERNAH dipercaya dari body -- server SELALU mengambil ulang
// kec_nama/nagari_nama/sls_kode/sls_nama/subsls_kode dari BARIS LAIN yg
// sudah ada persis di idsubsls yg dipilih (query "contoh" di bawah), sama
// spt prinsip "jangan percaya nama dari client" di endpoint lain.
//
// Akses: role "penyisiran" (PIN admin) ATAU "penyisiran_petugas" (login
// personal PPL/PML) -- SENGAJA TIDAK dibatasi khusus PPL (beda dgn
// pembatasan tulis status_kunjungan utk PML di /update) krn mencatat
// keluarga yg terlewat adalah tindakan data-entry yang wajar utk PML jg
// lakukan, user tidak memberi sinyal membatasi ini ke salah satu peran.
//
// Defense-in-depth wilayah (role "penyisiran_petugas" SAJA, pola sama dgn
// /api/penyisiran/list): Sub SLS yg dipilih WAJIB ada di dalam alokasi
// wilayah sesi yg login (gabungan PPL+seluruh PPL yg diawasi kalau PML,
// lihat daftarIdUntukSesi) -- dicek di server, BUKAN cuma krn dropdown FE
// sudah otomatis kescope (defense kalau body dimanipulasi).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionRole, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { ambilWilayahAlokasi, daftarIdUntukSesi, type AlokasiWilayahRow } from "@/lib/wilayahAlokasiPetugas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cocokWilayah(
  pilihan: AlokasiWilayahRow[],
  row: { kec_kode: string; nagari_kode: string; sls_kode: string; subsls_kode: string }
): boolean {
  return pilihan.some(
    (p) =>
      p.kec_kode === row.kec_kode &&
      p.nagari_kode === row.nagari_kode &&
      p.sls_kode === row.sls_kode &&
      (!p.subsls_kode_list || p.subsls_kode_list.length === 0 || p.subsls_kode_list.includes(row.subsls_kode))
  );
}

export async function POST(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const namaKk = typeof body?.nama_kk === "string" ? body.nama_kk.trim() : "";
  const idsubsls = typeof body?.idsubsls === "string" ? body.idsubsls.trim() : "";
  const alamat = typeof body?.alamat === "string" && body.alamat.trim() ? body.alamat.trim() : null;
  const petugasId = typeof body?.petugas_id === "number" ? body.petugas_id : null;
  const petugasNama =
    typeof body?.petugas_nama === "string" && body.petugas_nama.trim() ? body.petugas_nama.trim() : null;

  if (!namaKk) {
    return NextResponse.json({ error: "Nama KRT wajib diisi." }, { status: 400 });
  }
  if (!idsubsls) {
    return NextResponse.json({ error: "Pilih Kecamatan / Nagari / Sub SLS dulu." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Nama & kode wilayah TIDAK PERNAH dipercaya dari body -- diambil ulang
  // dari baris lain yg SUDAH ADA persis di Sub SLS yg dipilih (idsubsls =
  // kode 16 digit gabungan kec+nagari+sls+subsls, lihat komentar di atas
  // file ini) supaya nama & kode selalu konsisten dgn data yg sudah ada,
  // walau dropdown FE dimanipulasi.
  const { data: contoh, error: contohErr } = await supabase
    .from("penyisiran_usaha")
    .select("kec_kode, kec_nama, nagari_kode, nagari_nama, sls_kode, sls_nama, subsls_kode")
    .eq("idsubsls", idsubsls)
    .eq("aktif", true)
    .limit(1)
    .maybeSingle();
  if (contohErr) return NextResponse.json({ error: contohErr.message }, { status: 500 });
  if (!contoh) {
    return NextResponse.json({ error: "Sub SLS yang dipilih tidak ditemukan." }, { status: 400 });
  }

  // Defense-in-depth: role "penyisiran_petugas" HANYA boleh menambah baris
  // di dalam wilayah yg sudah dialokasikan ke sesi ybs (pola sama dgn
  // /api/penyisiran/list) -- role "penyisiran" (PIN admin) bebas spt biasa.
  if (getSessionRole(token) === "penyisiran_petugas") {
    const subjectId = Number(getSessionSubject(token));
    if (!Number.isFinite(subjectId) || subjectId <= 0) {
      return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
    }
    let daftarId: number[];
    try {
      ({ ids: daftarId } = await daftarIdUntukSesi(supabase, subjectId));
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Gagal memuat data pengawasan." },
        { status: 500 }
      );
    }
    let pilihan: AlokasiWilayahRow[];
    try {
      pilihan = await ambilWilayahAlokasi(supabase, daftarId);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Gagal memuat wilayah alokasi." },
        { status: 500 }
      );
    }
    if (!cocokWilayah(pilihan, contoh)) {
      return NextResponse.json(
        {
          error:
            'Sub SLS ini di luar wilayah yang sudah Anda pilih di kartu "Identifikasi Wilayah Sampel SLS".',
        },
        { status: 403 }
      );
    }
  }

  // kode_identitas: format "{idsubsls} - MANUAL - {timestamp}" -- pola sama
  // dgn data hasil upload ("{idsubsls} - {SUMBER} - {urutan}"), "MANUAL"
  // menggantikan {SUMBER} & timestamp ms menggantikan {urutan} (tidak butuh
  // penghitung urutan tersendiri, cukup unik & mudah dibedakan sekilas).
  const kodeIdentitas = `${idsubsls} - MANUAL - ${Date.now()}`;

  const { data: baru, error: insertErr } = await supabase
    .from("penyisiran_usaha")
    .insert({
      kode_identitas: kodeIdentitas,
      idsubsls,
      kec_kode: contoh.kec_kode,
      kec_nama: contoh.kec_nama,
      nagari_kode: contoh.nagari_kode,
      nagari_nama: contoh.nagari_nama,
      sls_kode: contoh.sls_kode,
      sls_nama: contoh.sls_nama,
      subsls_kode: contoh.subsls_kode,
      nama_kk: namaKk,
      alamat,
      status_kunjungan: "belum",
      aktif: true,
      ditambah_manual: true,
      ditambah_manual_oleh: petugasNama,
      penyisiran_oleh_id: petugasId,
      penyisiran_oleh: petugasNama,
    })
    .select(
      "kode_identitas, idsubsls, kec_kode, kec_nama, nagari_kode, nagari_nama, " +
        "sls_kode, sls_nama, subsls_kode, nama_kk, nama_anggota_keluarga, alamat, lat, lng, " +
        "bukti_dutp, bukti_dtsen, bukti_pnm, pnm_sektor, pnm_subsektor, " +
        "dtsen_lapangan_usaha, catatan_sensus, status_kunjungan, catatan_petugas, " +
        "info_ppl, info_jorong, info_tetangga, identifikasi_ppl, identifikasi_ppl_at, " +
        "prioritas_pasti, tag_pml, tag_pml_oleh, tag_pml_at, penyisiran_oleh, updated_at, ditemukan_at"
    )
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ row: baru });
}
