// app/api/penyisiran/alokasi/oh-monitoring/route.ts
//
// Dashboard monitoring kuota translok (Orang-Hari/OH) -- HANYA bisa
// diakses 4 nama pengelola yang SAMA dgn tab "Manajemen Target" (lihat
// lib/manajemenTargetAkses.ts: Bambang Suryanggono, Deswaty, M. Iqbal
// Hadi, Wisnu Dwi Jayanto), login menumpang akun & role "penyisiran_petugas"
// yang sama dgn tab "Perencanaan Lapangan"/"Penyisiran Usaha".
//
// KUOTA_OH_TRANSLOK = 280 (dikonfirmasi user, HARDCODE -- gampang diubah
// di sini kalau kuota resmi berubah). 1 baris aktif (dibatalkan_oleh IS
// NULL) di penyisiran_alokasi_hari_tugas = 1 OH terpakai. Kalau kuota
// habis, endpoint checklist petugas (.../alokasi/hari-tugas) TETAP
// mengizinkan centang baru -- dashboard ini cuma menampilkan
// peringatan/status, TIDAK mengunci apa pun (dikonfirmasi user).
//
// Baris di sini dikelompokkan per TANGGAL kalender (17-30 September 2026,
// lihat lib/penyisiranHari.ts) -- dikoreksi dari rencana awal "hari dalam
// seminggu".

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";
import { daftarTanggalPeriodeHariTugas } from "@/lib/penyisiranHari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TIDAK diekspor (Next.js App Router melarang route.ts mengekspor apa pun
// selain handler HTTP & const konfigurasi resmi runtime/dynamic/dst --
// lihat komentar lengkap di lib/penyisiranHari.ts utk kasus yg sama).
const KUOTA_OH_TRANSLOK = 280;

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  const petugasId = Number(subjectId);
  if (!subjectId || !Number.isFinite(petugasId) || petugasId <= 0) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: akun, error: akunErr } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama")
    .eq("id", petugasId)
    .maybeSingle();
  if (akunErr) return NextResponse.json({ error: akunErr.message }, { status: 500 });
  if (!bolehAksesManajemenTarget(akun?.nama)) {
    return NextResponse.json({ error: "Panel ini hanya dapat diakses oleh pengelola yang ditentukan." }, { status: 403 });
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("penyisiran_alokasi_hari_tugas")
    .select("petugas_id, tanggal, dibatalkan_oleh, dibatalkan_at, petugas_penyisiran_akun(nama)")
    .order("petugas_id", { ascending: true })
    .order("tanggal", { ascending: true });
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  type Baris = {
    petugas_id: number;
    tanggal: string;
    dibatalkan_oleh: string | null;
    dibatalkan_at: string | null;
    petugas_penyisiran_akun: { nama: string } | { nama: string }[] | null;
  };
  const list = (rows ?? []) as unknown as Baris[];

  const terpakai = list.filter((r) => !r.dibatalkan_oleh).length;

  const perPetugas = new Map<number, { petugas_id: number; petugas_nama: string; tanggal: Baris[] }>();
  for (const r of list) {
    const namaObj = Array.isArray(r.petugas_penyisiran_akun) ? r.petugas_penyisiran_akun[0] : r.petugas_penyisiran_akun;
    if (!perPetugas.has(r.petugas_id)) {
      perPetugas.set(r.petugas_id, { petugas_id: r.petugas_id, petugas_nama: namaObj?.nama ?? "-", tanggal: [] });
    }
    perPetugas.get(r.petugas_id)!.tanggal.push(r);
  }
  const rincian = Array.from(perPetugas.values())
    .map((p) => ({
      petugas_id: p.petugas_id,
      petugas_nama: p.petugas_nama,
      tanggal: p.tanggal.map((t) => ({ tanggal: t.tanggal, dibatalkan_oleh: t.dibatalkan_oleh, dibatalkan_at: t.dibatalkan_at })),
    }))
    .sort((a, b) => a.petugas_nama.localeCompare(b.petugas_nama));

  // Grid kalender per petugas x tanggal utk fitur "Monitoring Alokasi Hari
  // Tugas" (tampilan ringkas ala Gantt + kotak kuota, ada tombol "Salin
  // sebagai Gambar" utk dikirim ke grup WA -- lihat MonitoringAlokasiGrid
  // di app/penyisiran/perencanaan-lapangan.tsx). Status per sel:
  //  - "hijau" : direncanakan (baris AKTIF, dibatalkan_oleh masih kosong)
  //    DAN sudah ada minimal 1 foto dokumentasi SPJ (spj_dokumentasi_foto,
  //    petugas_jenis "penyisiran") utk kombinasi petugas+tanggal itu.
  //  - "merah" : direncanakan TAPI belum ada foto dokumentasi sama sekali
  //    -- dianggap tidak benar2 jalan ke lapangan (dikonfirmasi user).
  //  - "abu"   : tidak direncanakan -- baik krn memang belum ditandai/
  //    tidak tag, direncanakan libur, MAUPUN baris yg sudah dibatalkan
  //    pengelola (dibatalkan_oleh terisi) -- tidak ada field "libur"
  //    terpisah di skema, jadi ketiganya digabung jadi satu warna netral.
  // Baris grid = SEMUA petugas AKTIF digabung dgn petugas non-aktif yg
  // KEBETULAN masih py riwayat hari tugas (pola sama dgn tab "Monitoring
  // Petugas Penyisiran", monitoring-petugas.tsx) supaya riwayatnya tidak
  // hilang dari rekap.
  const { data: aktifRows, error: aktifErr } = await supabase
    .from("petugas_penyisiran_akun")
    .select("id, nama")
    .eq("aktif", true);
  if (aktifErr) return NextResponse.json({ error: aktifErr.message }, { status: 500 });

  const { data: dokRows, error: dokErr } = await supabase
    .from("spj_dokumentasi_foto")
    .select("petugas_id, tanggal")
    .eq("petugas_jenis", "penyisiran");
  if (dokErr) return NextResponse.json({ error: dokErr.message }, { status: 500 });

  const kunciDokumentasi = new Set(
    (dokRows ?? []).map((r: { petugas_id: number; tanggal: string }) => `${r.petugas_id}|${r.tanggal}`)
  );
  const kunciAktifPerTanggal = new Map<string, boolean>();
  for (const r of list) {
    kunciAktifPerTanggal.set(`${r.petugas_id}|${r.tanggal}`, !r.dibatalkan_oleh);
  }

  const namaPerId = new Map<number, string>();
  for (const a of aktifRows ?? []) namaPerId.set(a.id as number, a.nama as string);
  for (const p of perPetugas.values()) {
    if (!namaPerId.has(p.petugas_id)) namaPerId.set(p.petugas_id, p.petugas_nama);
  }

  const tanggalList = daftarTanggalPeriodeHariTugas();
  const gridBaris = Array.from(namaPerId.entries())
    .map(([petugasId, nama]) => {
      const status: Record<string, "hijau" | "merah" | "abu"> = {};
      for (const tgl of tanggalList) {
        const kunci = `${petugasId}|${tgl}`;
        const direncanakan = kunciAktifPerTanggal.get(kunci) === true;
        status[tgl] = !direncanakan ? "abu" : kunciDokumentasi.has(kunci) ? "hijau" : "merah";
      }
      return { petugas_id: petugasId, petugas_nama: nama, status };
    })
    .sort((a, b) => a.petugas_nama.localeCompare(b.petugas_nama));

  return NextResponse.json({
    kuota: KUOTA_OH_TRANSLOK,
    terpakai,
    sisa: KUOTA_OH_TRANSLOK - terpakai,
    rincian,
    grid: { tanggalList, baris: gridBaris },
  });
}
