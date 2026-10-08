// app/api/sigap/pelatihan/presensi/route.ts
//
// (7 Okt 2026) SIGAP > Pelatihan -- presensi peserta di lokasi pelatihan (radius 300 m dari Mami Hotel Solok).
// POST json {lat, lng, akurasi, sesi?} (Authorization: Bearer <sesi>) -> { ok:true, sudah, at, jarak_m } atau galat 4xx dgn { error, kode, jarak_m }.
// Waktu & penilaian jarak SELALU di server (jam server + koordinat titik dari tabel pengaturan).
// (8 Okt 2026) Presensi per SESI per hari (1-3 sesi, diatur panitia): `sesi` = kunci "YYYY-MM-DD#no"; bila tidak dikirim, dipakai
// sesi yang sedang dibuka dan belum tercatat. Satu presensi diterima per peserta per sesi.
// Titik lokasi: peserta diterima bila dalam radius SALAH SATU titik (Mami Hotel / Ully Hotel). Percobaan yang ditolak
// (di luar radius / GPS lemah) tetap dicatat utk monitoring panitia.

import { NextRequest, NextResponse } from "next/server";
import { keadaanHari, nilaiPresensi, posisiValid, susunHari } from "@/lib/sigapPresensi";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, muatPengaturanPresensi, muatRekamPresensi, pesertaPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400, ekstra: Record<string, unknown> = {}) => NextResponse.json({ error: pesan, ...ekstra }, { status });

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const peserta = await pesertaPelatihan(db, akun.id, kegiatanId);
    if (!peserta) return galat("Akun Anda tidak terdaftar sebagai peserta pelatihan.", 403);
    const peng = await muatPengaturanPresensi(db, kegiatanId);
    if (!peng) return galat("Presensi belum diatur panitia.", 404);

    const body = await req.json().catch(() => null);
    if (!posisiValid(body)) return galat("Lokasi tidak terbaca. Aktifkan lokasi (GPS) lalu coba lagi.", 400, { kode: "lokasi" });
    const pos = { lat: body.lat, lng: body.lng, akurasi: body.akurasi };

    const sekarang = new Date();
    const rekam = await muatRekamPresensi(db, kegiatanId, akun.id);
    const hari = susunHari(peng.jadwal, rekam, sekarang.getTime());
    const kead = keadaanHari(hari, sekarang.getTime());
    // sesi tujuan: yang diminta klien (harus sesi hari ini), selain itu sesi yang sedang dibuka / berikutnya / yang terakhir
    const diminta = typeof (body as Record<string, unknown>).sesi === "string" ? kead.sesi.find((s) => s.kunci === (body as Record<string, unknown>).sesi) : undefined;
    const sesi = diminta ?? kead.aktif ?? kead.berikutnya ?? kead.sesi.find((s) => s.status === "terlewat") ?? kead.sesi[kead.sesi.length - 1];
    if (!sesi) return galat("Presensi belum diatur panitia.", 404);
    if (sesi.at) return NextResponse.json({ ok: true, sudah: true, at: sesi.at, jarak_m: sesi.jarak_m });

    const h = nilaiPresensi(pos, { ...peng, buka_at: sesi.buka_at, tutup_at: sesi.tutup_at }, sekarang);
    const baris = {
      kegiatan_id: kegiatanId,
      akun_id: akun.id,
      penugasan_id: peserta.penugasan_id,
      tanggal: sesi.tanggal,
      sesi_no: sesi.no,
      at: sekarang.toISOString(),
      lat: pos.lat,
      lng: pos.lng,
      akurasi_m: pos.akurasi,
      jarak_m: Number.isFinite(h.jarak_m) ? Math.round(h.jarak_m * 10) / 10 : null,
      titik_nama: h.titik_nama,
    };

    if (h.kode !== "ok") {
      // catat percobaan ditolak (hanya saat jam presensi berjalan, supaya tidak menumpuk di luar jam)
      if (h.kode === "akurasi" || h.kode === "luar") await db.from("sigap_pelatihan_presensi").insert({ ...baris, diterima: false, alasan: h.kode === "luar" ? "di luar radius" : "akurasi GPS lemah" });
      return galat(sesi.nama && kead.total > 1 && (h.kode === "belum_buka" || h.kode === "sudah_tutup") ? `Presensi ${sesi.nama}: ${h.pesan}` : h.pesan, 422, { kode: h.kode, jarak_m: Number.isFinite(h.jarak_m) ? Math.round(h.jarak_m) : null });
    }

    const { error } = await db.from("sigap_pelatihan_presensi").insert({ ...baris, diterima: true });
    if (error) {
      // dua permintaan bersamaan: yang kedua kena indeks unik -> anggap sudah presensi
      const ulang = (await muatRekamPresensi(db, kegiatanId, akun.id)).find((r) => r.tanggal === sesi.tanggal && r.sesi_no === sesi.no);
      if (ulang) return NextResponse.json({ ok: true, sudah: true, at: ulang.at, jarak_m: ulang.jarak_m });
      if (error.code === "23505") return galat("Database belum diperbarui untuk presensi lebih dari satu sesi. Hubungi panitia.", 500);
      return galat(error.message, 500);
    }
    return NextResponse.json({ ok: true, sudah: false, at: baris.at, jarak_m: baris.jarak_m, titik: baris.titik_nama });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
