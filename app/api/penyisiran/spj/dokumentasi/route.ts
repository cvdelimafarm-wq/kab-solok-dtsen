// app/api/penyisiran/spj/dokumentasi/route.ts
//
// GET (tanpa query)              -> daftar Surat Tugas milik petugas yg
//                                    login (utk dipilih di UI).
// GET ?surat_tugas_id=&tanggal=  -> status 5 slot foto utk kombinasi
//                                    ST+tanggal itu (kosong/null kalau
//                                    belum diupload), lengkap dgn signed
//                                    URL preview.
// POST  (multipart)              -> upload/ganti SATU slot foto (field:
//                                    surat_tugas_id, tanggal, slot 1-5,
//                                    file). Kalau slot itu sudah pernah
//                                    diisi, file lama di Storage DIHAPUS
//                                    dulu supaya tidak ada file "yatim"
//                                    menumpuk tiap kali petugas mengganti
//                                    foto yang salah upload.
// DELETE ?id=                    -> hapus SATU foto (kosongkan slotnya).
//
// Foto DIBATASI ke image/jpeg & image/png saja (BUKAN semua "image/*" spt
// file Surat Tugas) -- krn foto ini nanti di-*embed* langsung ke PDF lewat
// pdf-lib (lib/pdf/dokumentasi.ts), yang cuma bisa embed 2 format itu.
// Format lain (mis. HEIC dari iPhone) ditolak dgn pesan yg jelas drpd
// gagal senyap saat PDF dibuat.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession } from "@/lib/spjAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UKURAN_MAKS_BYTE = 10 * 1024 * 1024; // 10MB/foto
const TIPE_DIIZINKAN = new Set(["image/jpeg", "image/png"]);

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

function bersihkanNamaFile(nama: string): string {
  return nama.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120);
}

// supabase diketik "any" (BUKAN ReturnType<typeof createClient>) -- tipe
// asli createClient dari @supabase/supabase-js generik/kompleks, dan
// ReturnType<typeof createClient> gagal di-compile Next.js production
// build (walau lolos di lokal/sandbox) dengan error
// `Type '"public"' is not assignable to type 'never'`. Pola yg sama & AMAN
// dipakai jg oleh pastikanPengelolaSpj() di lib/spjAuth.ts.
async function pastikanMilikSendiri(
  supabase: any,
  session: { jenis: string; petugasId: string },
  suratTugasId: number
): Promise<boolean> {
  const { data } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("id")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const suratTugasIdStr = req.nextUrl.searchParams.get("surat_tugas_id");
  const tanggal = req.nextUrl.searchParams.get("tanggal");

  if (suratTugasIdStr && tanggal) {
    const suratTugasId = Number(suratTugasIdStr);
    if (!Number.isFinite(suratTugasId)) return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
    if (!(await pastikanMilikSendiri(supabase, session, suratTugasId))) {
      return NextResponse.json({ error: "Surat Tugas ini bukan milik Anda." }, { status: 403 });
    }

    const { data: rows, error } = await supabase
      .from("spj_dokumentasi_foto")
      .select("id, slot, file_path, file_nama_asli")
      .eq("surat_tugas_id", suratTugasId)
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .eq("tanggal", tanggal);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const paths = (rows ?? []).map((r: { file_path: string }) => r.file_path);
    let urlPerPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signedList } = await supabase.storage.from("spj-files").createSignedUrls(paths, 300);
      const daftarSigned = (signedList ?? []) as { path: string; signedUrl: string | null }[];
      urlPerPath = new Map(
        daftarSigned.filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl as string])
      );
    }

    // Lokasi -- coba tarik dari Laporan (kalau sudah dibuat) utk tanggal
    // yg sama, supaya kop PDF Dokumentasi & Laporan konsisten tanpa
    // petugas perlu mengetik ulang. Kalau belum ada Laporan, dibiarkan
    // kosong (diisi manual lewat query pdf, lihat route pdf/route.ts).
    const { data: laporan } = await supabase
      .from("spj_laporan")
      .select("rekap_snapshot")
      .eq("surat_tugas_id", suratTugasId)
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .eq("tanggal", tanggal)
      .maybeSingle();
    let lokasi: string | null = null;
    const lokasiArr = (laporan?.rekap_snapshot as { lokasi?: { kecNama: string | null; nagariNama: string | null }[] } | null)
      ?.lokasi;
    if (lokasiArr && lokasiArr.length > 0) {
      const nagariUnik = [...new Set(lokasiArr.map((l) => l.nagariNama).filter(Boolean))];
      const kecUnik = [...new Set(lokasiArr.map((l) => l.kecNama).filter(Boolean))];
      lokasi = `Nagari ${nagariUnik.join(", ")}, Kec. ${kecUnik.join(", ")}`;
    }

    const foto = (rows ?? []).map((r: { id: number; slot: number; file_path: string; file_nama_asli: string | null }) => ({
      id: r.id,
      slot: r.slot,
      file_nama_asli: r.file_nama_asli,
      url: urlPerPath.get(r.file_path) ?? null,
    }));

    return NextResponse.json({ foto, lokasi });
  }

  // Tanpa query -- daftar ST milik petugas ybs (utk dropdown pemilihan).
  const { data: tautan, error: errTautan } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("surat_tugas_id")
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId);
  if (errTautan) return NextResponse.json({ error: errTautan.message }, { status: 500 });

  const ids = (tautan ?? []).map((t: { surat_tugas_id: number }) => t.surat_tugas_id);
  if (ids.length === 0) return NextResponse.json({ daftar: [] });

  const { data: stList, error: errSt } = await supabase
    .from("spj_surat_tugas")
    .select("id, nomor_st, tanggal_mulai, tanggal_selesai")
    .in("id", ids)
    .order("tanggal_mulai", { ascending: false });
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });

  const daftar = (stList ?? []).map((st: { id: number; nomor_st: string; tanggal_mulai: string; tanggal_selesai: string }) => ({
    surat_tugas_id: st.id,
    nomor_st: st.nomor_st,
    tanggal_mulai: st.tanggal_mulai,
    tanggal_selesai: st.tanggal_selesai,
  }));
  return NextResponse.json({ daftar });
}

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Data form tidak valid." }, { status: 400 });

  const suratTugasId = Number(form.get("surat_tugas_id"));
  const tanggal = String(form.get("tanggal") || "").trim();
  const slot = Number(form.get("slot"));
  const file = form.get("file");

  if (!Number.isFinite(suratTugasId)) return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return NextResponse.json({ error: "Tanggal tidak valid." }, { status: 400 });
  if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
    return NextResponse.json({ error: "Slot foto tidak valid (harus 1-5)." }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "File foto wajib diupload." }, { status: 400 });
  if (file.size > UKURAN_MAKS_BYTE) return NextResponse.json({ error: "Ukuran foto maksimal 10MB." }, { status: 400 });
  if (!TIPE_DIIZINKAN.has(file.type)) {
    return NextResponse.json({ error: "Foto harus berformat JPG atau PNG (format lain seperti HEIC belum didukung)." }, { status: 400 });
  }

  if (!(await pastikanMilikSendiri(supabase, session, suratTugasId))) {
    return NextResponse.json({ error: "Surat Tugas ini bukan milik Anda." }, { status: 403 });
  }
  const { data: st } = await supabase
    .from("spj_surat_tugas")
    .select("tanggal_mulai, tanggal_selesai")
    .eq("id", suratTugasId)
    .maybeSingle();
  if (!st) return NextResponse.json({ error: "Surat Tugas tidak ditemukan." }, { status: 404 });
  if (tanggal < st.tanggal_mulai || tanggal > st.tanggal_selesai) {
    return NextResponse.json(
      { error: `Tanggal harus dlm rentang ${st.tanggal_mulai} s/d ${st.tanggal_selesai} sesuai Surat Tugas.` },
      { status: 400 }
    );
  }

  // Kalau slot ini sudah pernah diisi, hapus file lamanya dulu di Storage
  // supaya tidak menumpuk file yatim tiap kali petugas ganti foto.
  const { data: lama } = await supabase
    .from("spj_dokumentasi_foto")
    .select("id, file_path")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId)
    .eq("tanggal", tanggal)
    .eq("slot", slot)
    .maybeSingle();

  const namaFileBersih = bersihkanNamaFile(file.name || `foto-slot${slot}`);
  const path = `dokumentasi/${session.jenis}-${session.petugasId}-${tanggal}-slot${slot}-${Date.now()}-${namaFileBersih}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: errUpload } = await supabase.storage.from("spj-files").upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (errUpload) return NextResponse.json({ error: `Gagal upload foto: ${errUpload.message}` }, { status: 500 });

  if (lama) {
    const { error: errUpdate } = await supabase
      .from("spj_dokumentasi_foto")
      .update({ file_path: path, file_nama_asli: file.name || null })
      .eq("id", lama.id);
    if (errUpdate) {
      await supabase.storage.from("spj-files").remove([path]);
      return NextResponse.json({ error: errUpdate.message }, { status: 500 });
    }
    await supabase.storage.from("spj-files").remove([lama.file_path]);
    return NextResponse.json({ ok: true, id: lama.id });
  }

  const { data: baru, error: errInsert } = await supabase
    .from("spj_dokumentasi_foto")
    .insert({
      surat_tugas_id: suratTugasId,
      petugas_jenis: session.jenis,
      petugas_id: session.petugasId,
      tanggal,
      slot,
      file_path: path,
      file_nama_asli: file.name || null,
    })
    .select("id")
    .single();
  if (errInsert || !baru) {
    await supabase.storage.from("spj-files").remove([path]);
    return NextResponse.json({ error: errInsert?.message || "Gagal menyimpan foto." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: baru.id });
}

export async function DELETE(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const idStr = req.nextUrl.searchParams.get("id");
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "ID foto tidak valid." }, { status: 400 });

  const { data: row, error: errRow } = await supabase
    .from("spj_dokumentasi_foto")
    .select("id, file_path, petugas_jenis, petugas_id")
    .eq("id", id)
    .maybeSingle();
  if (errRow) return NextResponse.json({ error: errRow.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Foto tidak ditemukan." }, { status: 404 });
  if (row.petugas_jenis !== session.jenis || String(row.petugas_id) !== String(session.petugasId)) {
    return NextResponse.json({ error: "Foto ini bukan milik Anda." }, { status: 403 });
  }

  const { error: errDelete } = await supabase.from("spj_dokumentasi_foto").delete().eq("id", id);
  if (errDelete) return NextResponse.json({ error: errDelete.message }, { status: 500 });
  await supabase.storage.from("spj-files").remove([row.file_path]);

  return NextResponse.json({ ok: true });
}
