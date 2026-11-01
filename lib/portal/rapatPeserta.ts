// lib/portal/rapatPeserta.ts  (hanya server)
//
// (1 Nov 2026) Logika sisi peserta untuk rapat Zoom, dipakai bersama /api/sigap/rapat (modal Beranda, semua rapat) dan /api/sigap/pelatihan/rapat (langkah presensi pelatihan,
// disaring ke satu kegiatan). Perilaku /api/sigap/rapat tidak berubah. Tambahan: hadir pada rapat PELATIHAN juga dicatat sebagai presensi sesi (jembatanPresensiPelatihan).

import { BATAS_SALAH, JENDELA_SALAH_MS, bolehHadir, cocokToken, keBentukPetugas, pilihRapat, type Rapat } from "@/lib/sigapRapat";
import { pilihSesiRapat, terlambatPresensi } from "@/lib/sigapRapatSesi";
import { akunSasaran, hadirAkun, muatRapat, muatRapatAktif } from "@/lib/sigapRapatDb";
import { muatPengaturanPresensi, muatRekamPresensi, pesertaPelatihan, type dbAdmin } from "@/lib/sigapTesDb";
import { kunciSesi } from "@/lib/sigapPresensi";

type Db = NonNullable<ReturnType<typeof dbAdmin>>;
export type Jawaban = { status: number; json: Record<string, unknown> };

const galat = (pesan: string, status = 400, ekstra: Record<string, unknown> = {}): Jawaban => ({ status, json: { error: pesan, ...ekstra } });

/**
 * Hadir pada rapat pelatihan -> presensi sesi pelatihan yang jendelanya beririsan dengan jam rapat (tanpa lokasi; titik "Zoom (token rapat)").
 * Terbaik-usaha: tidak pernah melempar, tidak menimpa presensi yang sudah ada. Mengembalikan keterangan untuk klien.
 */
export async function jembatanPresensiPelatihan(db: Db, r: Rapat, akunId: number, sumber: "mandiri" | "manual", sekarang: Date = new Date()): Promise<{ dicatat: boolean; alasan?: string; sesi?: string }> {
  try {
    const { data: keg } = await db.from("sigap_kegiatan").select("jenis").eq("id", r.sasaran_kegiatan_id).maybeSingle();
    if (keg?.jenis !== "pelatihan") return { dicatat: false, alasan: "bukan_pelatihan" };
    const peserta = await pesertaPelatihan(db, akunId, r.sasaran_kegiatan_id);
    if (!peserta) return { dicatat: false, alasan: "bukan_peserta" };
    const peng = await muatPengaturanPresensi(db, r.sasaran_kegiatan_id);
    if (!peng || peng.jadwal.length === 0) return { dicatat: false, alasan: "presensi_belum_diatur" };
    const rekam = await muatRekamPresensi(db, r.sasaran_kegiatan_id, akunId);
    const sudah = new Set(rekam.map((x) => kunciSesi(x.tanggal, x.sesi_no)));
    const sesi = pilihSesiRapat(peng.jadwal, r.mulai_at, r.selesai_at, sudah);
    if (!sesi) return { dicatat: false, alasan: sudah.size > 0 ? "sesi_sudah_tercatat" : "tidak_ada_sesi_beririsan" };
    const { error } = await db.from("sigap_pelatihan_presensi").insert({
      kegiatan_id: r.sasaran_kegiatan_id,
      akun_id: akunId,
      penugasan_id: peserta.penugasan_id,
      tanggal: sesi.tanggal,
      sesi_no: sesi.no,
      at: sekarang.toISOString(),
      lat: null,
      lng: null,
      akurasi_m: null,
      jarak_m: null,
      titik_nama: "Zoom (token rapat)",
      diterima: true,
      terlambat: terlambatPresensi(sekarang.getTime(), sesi),
      manual: sumber === "manual",
      alasan: sumber === "manual" ? `Dicatat manual dari rapat Zoom: ${r.judul}`.slice(0, 200) : `Presensi daring (token rapat Zoom): ${r.judul}`.slice(0, 200),
    });
    if (error) return { dicatat: false, alasan: error.code === "23505" ? "sesi_sudah_tercatat" : "gagal_simpan" };
    return { dicatat: true, sesi: sesi.nama };
  } catch {
    return { dicatat: false, alasan: "galat" };
  }
}

/** Rapat aktif yang menyasar akun (opsional hanya untuk satu kegiatan); yang paling relevan dipilih. */
export async function ambilRapatPeserta(db: Db, akunId: number, kegiatanId: number | null): Promise<Jawaban> {
  const sekarang = Date.now();
  const kandidat: Rapat[] = [];
  for (const r of await muatRapatAktif(db)) {
    if (kegiatanId !== null && r.sasaran_kegiatan_id !== kegiatanId) continue;
    if (await akunSasaran(db, akunId, r)) kandidat.push(r);
  }
  const r = pilihRapat(kandidat, sekarang);
  if (!r) return { status: 200, json: { rapat: null, sekarang: new Date(sekarang).toISOString() } };
  return { status: 200, json: { rapat: keBentukPetugas(r, await hadirAkun(db, r.id, akunId), sekarang), sekarang: new Date(sekarang).toISOString() } };
}

/** Hadir lewat token. `kegiatanId` (bila diisi) membatasi rapat pada kegiatan itu. */
export async function hadirRapatPeserta(db: Db, akunId: number, body: Record<string, unknown> | null, kegiatanId: number | null): Promise<Jawaban> {
  const rapatId = Number(body?.rapat_id);
  if (!Number.isInteger(rapatId)) return galat("Rapat tidak valid.");
  const r = await muatRapat(db, rapatId);
  if (!r || !r.aktif) return galat("Rapat tidak ditemukan atau tidak aktif.", 404);
  if (kegiatanId !== null && r.sasaran_kegiatan_id !== kegiatanId) return galat("Rapat ini bukan untuk kegiatan ini.", 403, { kode: "bukan_sasaran" });
  if (!(await akunSasaran(db, akunId, r))) return galat("Akun Anda bukan sasaran presensi rapat ini.", 403, { kode: "bukan_sasaran" });

  const sudah = await hadirAkun(db, r.id, akunId);
  if (sudah) {
    const jembatan = await jembatanPresensiPelatihan(db, r, akunId, "mandiri");
    return { status: 200, json: { ok: true, sudah: true, hadir_at: sudah, presensi_sesi: jembatan.dicatat ? jembatan.sesi : null } };
  }

  const sekarang = Date.now();
  const izin = bolehHadir(r, false, sekarang);
  if (!izin.ok) return galat(izin.pesan, 422, { kode: izin.kode });

  const sejak = new Date(sekarang - JENDELA_SALAH_MS).toISOString();
  const { count } = await db.from("sigap_rapat_coba").select("id", { count: "exact", head: true }).eq("rapat_id", r.id).eq("akun_id", akunId).eq("ok", false).gte("at", sejak);
  if ((count ?? 0) >= BATAS_SALAH) return galat("Terlalu banyak token salah. Tunggu beberapa menit lalu coba lagi, atau tanyakan token ke panitia.", 429, { kode: "dibatasi" });

  if (!cocokToken(body?.token, r.token)) {
    await db.from("sigap_rapat_coba").insert({ rapat_id: r.id, akun_id: akunId, ok: false });
    const sisa = Math.max(0, BATAS_SALAH - 1 - (count ?? 0));
    return galat(`Token salah. Cek token yang diumumkan di rapat Zoom (sisa ${sisa} percobaan).`, 422, { kode: "token_salah", sisa });
  }

  const hadirAt = new Date(sekarang).toISOString();
  const { error } = await db.from("sigap_rapat_hadir").insert({ rapat_id: r.id, akun_id: akunId, hadir_at: hadirAt, sumber: "mandiri" });
  if (error) {
    const ulang = await hadirAkun(db, r.id, akunId);
    if (ulang) return { status: 200, json: { ok: true, sudah: true, hadir_at: ulang } };
    return galat(error.message, 500);
  }
  await db.from("sigap_rapat_coba").insert({ rapat_id: r.id, akun_id: akunId, ok: true });
  const jembatan = await jembatanPresensiPelatihan(db, r, akunId, "mandiri", new Date(sekarang));
  return { status: 200, json: { ok: true, sudah: false, hadir_at: hadirAt, presensi_sesi: jembatan.dicatat ? jembatan.sesi : null } };
}
