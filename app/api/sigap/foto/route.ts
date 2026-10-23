// app/api/sigap/foto/route.ts
//
// (19 Okt 2026) Kamera SIGAP.
// POST (multipart, Authorization: Bearer <sesi>) -- foto baru dari kamera dalam aplikasi.
//   Bidang: berkas (JPEG/PNG/WebP), kegiatan_id, token, elapsed_mono_ms, elapsed_wall_ms, waktu_hp (ms epoch), lat, lng, akurasi,
//           posisi_umur_ms, slot (nomor foto 1-5 untuk pemotret, opsional), tag (JSON: [{akun_id, slot_usulan?}]).
//   Server: memeriksa saklar & penugasan & hari kerja/23.59 (cekAksesIsian), menetapkan waktu resmi dari token, menilai kepercayaan,
//           mencetak cap, menyimpan berkas, mencatat tag, dan menempatkan foto pemotret ke nomor foto (sigap_dokumentasi) bila hijau/kuning.
// GET ?tanggal=YYYY-MM-DD (opsional) -- foto saya: yang saya ambil, dan yang menunggu keputusan saya.
//
// Kegagalan membaca saklar tidak pernah memaksa kamera. Tidak ada penghapusan di sini.

import { NextRequest, NextResponse } from "next/server";
import { cekAksesIsian, penugasanAkun, BUCKET_SIGAP } from "@/lib/sigap";
import { tanggalWib } from "@/lib/sigapPresensi";
import {
  MAKS_AKURASI_DISPENSASI_M, MAKS_TAG, jarakEfektifM, jarakHamming, kecepatanKmJam, kodeDariByte, nilaiKepercayaan, posisiMasukanValid, simpanSampai,
  slotBerlokasi, slotValid, teksKoordinat, teksWaktuWib, TOLERANSI_KIRIM_HARI, urlVerifikasi, waktuResmi, type PeranTag,
} from "@/lib/sigapFoto";
import { bubuhiCap, sidikGambar } from "@/lib/sigapFotoCap";
import {
  ambilPembanding, bacaTokenPotret, jarakKeRumah, jarakKeWilayah, kodeAcak, modeKegiatan, rekanTim, sha256Hex, teksLokasi,
} from "@/lib/sigapFotoServer";
import { angka, galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAKS_BYTE = 15 * 1024 * 1024;
const TIPE_OK = new Set(["image/jpeg", "image/png", "image/webp"]);

type TagMasukan = { akun_id: number; slot_usulan: number | null };

function bacaTag(mentah: FormDataEntryValue | null): TagMasukan[] | null {
  if (mentah === null || mentah === "") return [];
  try {
    const arr = JSON.parse(String(mentah));
    if (!Array.isArray(arr)) return null;
    const hasil: TagMasukan[] = [];
    for (const x of arr) {
      const id = Number(x?.akun_id);
      if (!Number.isInteger(id) || id <= 0) return null;
      const s = x?.slot_usulan == null ? null : Number(x.slot_usulan);
      if (s !== null && !slotValid(s)) return null;
      if (!hasil.some((h) => h.akun_id === id)) hasil.push({ akun_id: id, slot_usulan: s });
    }
    return hasil;
  } catch {
    return null;
  }
}

function ringkas(f: Record<string, unknown>) {
  return {
    id: f.id, kode: f.kode, kegiatan_id: f.kegiatan_id, tanggal: f.tanggal, diambil_at: f.diambil_at, diterima_at: f.diterima_at, lokasi_teks: f.lokasi_teks,
    kepercayaan: f.kepercayaan, alasan: f.alasan, status_periksa: f.status_periksa, ukuran_byte: f.ukuran_byte,
  };
}

export async function POST(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId, akun } = m;
  const terimaMs = Date.now();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return galat("Isian tidak terbaca.");
  }
  const berkas = form.get("berkas");
  if (!(berkas instanceof File)) return galat("Berkas foto wajib.");
  if (berkas.size > MAKS_BYTE) return galat("Berkas terlalu besar (maks 15 MB).", 413);
  if (berkas.size < 5000) return galat("Berkas terlalu kecil.");
  if (berkas.type && !TIPE_OK.has(berkas.type)) return galat("Format foto tidak didukung (JPEG/PNG/WebP).");

  const kegiatanId = angka(form.get("kegiatan_id"));
  if (!kegiatanId) return galat("kegiatan_id wajib.");
  const nomorMentah = angka(form.get("slot"));
  if (nomorMentah !== null && !slotValid(nomorMentah)) return galat("Nomor foto tidak valid.");
  const nomor = nomorMentah as 1 | 2 | 3 | 4 | 5 | null;
  const posisi = { lat: angka(form.get("lat")), lng: angka(form.get("lng")), akurasi: angka(form.get("akurasi")) };
  if (!posisiMasukanValid(posisi)) return galat("Lokasi tidak terbaca. Aktifkan lokasi lalu potret ulang.", 422, { kode: "lokasi" });
  // (21 Okt 2026) Akurasi 300-5000 m = dispensasi: diterima, ditandai kuning "akurasi_kasar" (lihat nilaiKepercayaan) untuk diperiksa PML/admin.
  if (posisi.akurasi > MAKS_AKURASI_DISPENSASI_M) return galat(`Akurasi lokasi ±${Math.round(posisi.akurasi)} m terlalu kasar (maks ${MAKS_AKURASI_DISPENSASI_M} m). Aktifkan lokasi tepat dan pindah ke tempat terbuka lalu potret ulang.`, 422, { kode: "akurasi" });
  const tagMasukan = bacaTag(form.get("tag"));
  if (tagMasukan === null) return galat("Daftar tag tidak valid.");
  if (tagMasukan.some((t) => t.akun_id === akunId)) return galat("Tidak perlu menandai diri sendiri.");
  if (tagMasukan.length > MAKS_TAG) return galat(`Maksimal ${MAKS_TAG} orang per foto.`);

  // 1) Saklar & penugasan
  const mode = (await modeKegiatan(db, [kegiatanId]))[kegiatanId];
  if (mode !== "kamera") return galat("Kegiatan ini memakai unggah foto (metode lama).", 403, { mode: "unggah" });
  const pen = (await penugasanAkun(db, akunId)).find((p) => p.kegiatan.id === kegiatanId);
  if (!pen) return galat("Anda tidak terdaftar pada kegiatan ini.", 403);

  // 2) Berkas: idempoten bila HP mengulang kiriman yang sama
  const mentah = Buffer.from(await berkas.arrayBuffer());
  const shaAsli = sha256Hex(mentah);
  {
    const { data: ada } = await db.from("sigap_foto").select("*").eq("sha256_asli", shaAsli).maybeSingle();
    if (ada) {
      if (ada.akun_pengambil === akunId) return NextResponse.json({ ok: true, sudah: true, foto: ringkas(ada) });
      return galat("Foto ini sudah pernah dikirim.", 409, { kode: "duplikat" });
    }
  }

  // 3) Waktu resmi
  const tok = bacaTokenPotret(form.get("token"), akunId);
  if (tok) {
    const { data: pakai } = await db.from("sigap_foto").select("id").eq("token_nonce", tok.nonce).maybeSingle();
    if (pakai) return galat("Token potret sudah dipakai.", 409, { kode: "token_terpakai" });
  }
  const w = waktuResmi({
    tokenT: tok ? tok.t : null,
    elapsedMonoMs: tok ? angka(form.get("elapsed_mono_ms")) : null,
    elapsedWallMs: angka(form.get("elapsed_wall_ms")),
    waktuHpMs: angka(form.get("waktu_hp")),
    terimaMs,
    paket: tok?.paket === true, // (23 Okt 2026) token paket = foto tanpa sinyal: waktu dari jam HP, hasil selalu kuning
  });
  const tanggal = tanggalWib(w.diambilMs);

  // 4) Hari kerja, 23.59, kunci, periode -- sama seperti jalur unggah lama
  // (23 Okt 2026) Foto tanpa sinyal yang waktunya lolos (w.offline) boleh terkirim sampai TOLERANSI_KIRIM_HARI hari sesudah tanggalnya.
  const akses = await cekAksesIsian(db, akunId, pen.id, tanggal, w.offline ? { toleransiOfflineHari: TOLERANSI_KIRIM_HARI } : {});
  if ("error" in akses) return galat(akses.error, akses.status);

  // 5) Tag: rekan tim vs di luar tim
  let tagBaru: { akun_id: number; peran_tag: PeranTag; slot_usulan: number | null }[] = [];
  if (tagMasukan.length) {
    const tim = new Set((await rekanTim(db, akunId, kegiatanId)).map((r) => r.akun_id));
    const { data: ak } = await db.from("sigap_akun").select("id").eq("aktif", true).in("id", tagMasukan.map((t) => t.akun_id));
    const aktif = new Set((ak ?? []).map((a) => a.id as number));
    if (tagMasukan.some((t) => !aktif.has(t.akun_id))) return galat("Ada petugas yang dipilih tidak ditemukan atau tidak aktif.");
    tagBaru = tagMasukan.map((t) => ({ akun_id: t.akun_id, peran_tag: tim.has(t.akun_id) ? ("tim" as const) : ("luar_tim" as const), slot_usulan: t.slot_usulan }));
  }

  // 6) Penilaian kepercayaan
  const cekLokasi = nomor !== null && slotBerlokasi(nomor);
  const [jarakWilayah, jarakRumah, pembanding] = await Promise.all([
    cekLokasi ? jarakKeWilayah(db, akunId, posisi.lat, posisi.lng) : Promise.resolve(null),
    cekLokasi ? jarakKeRumah(db, akunId, posisi.lat, posisi.lng).catch(() => null) : Promise.resolve(null),
    ambilPembanding(db, akunId, kegiatanId, posisi.lat, posisi.lng, tanggal, cekLokasi),
  ]);
  let sidik: string | null = null;
  try {
    sidik = await sidikGambar(mentah);
  } catch {
    return galat("Berkas bukan gambar yang valid.");
  }
  let hamMin: number | null = null;
  for (const s of pembanding.sidikLain) {
    const d = jarakHamming(sidik, s);
    if (d !== null && (hamMin === null || d < hamMin)) hamMin = d;
  }
  const umurPosisi = angka(form.get("posisi_umur_ms"));
  const kecepatan = pembanding.sebelumnya
    ? kecepatanKmJam(pembanding.sebelumnya, { lat: posisi.lat, lng: posisi.lng, ms: w.diambilMs })
    : null;
  const nilai = nilaiKepercayaan({
    akurasiM: posisi.akurasi,
    waktu: w,
    umurPosisiMs: umurPosisi !== null && umurPosisi <= 24 * 3600_000 ? umurPosisi : null,
    jarakWilayahM: jarakEfektifM(jarakWilayah, jarakRumah), // (20 Okt 2026) titik terdekat dari KK atau rumah petugas
    kecepatanKmJam: kecepatan,
    koordinatIdentik: pembanding.koordinatIdentik,
    hammingTerdekat: hamMin,
  });

  // 7) Cap & simpan berkas
  const lokasi = await teksLokasi(db, akunId, posisi.lat, posisi.lng);
  let kode = "";
  let stempel: { buf: Buffer } | null = null;
  const asal = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  for (let i = 0; i < 4; i++) {
    kode = kodeAcak(kodeDariByte);
    const { data: bentrok } = await db.from("sigap_foto").select("id").eq("kode", kode).maybeSingle();
    if (!bentrok) break;
    kode = "";
  }
  if (!kode) return galat("Gagal membuat kode verifikasi. Coba lagi.", 500);
  try {
    stempel = await bubuhiCap(mentah, {
      waktu: teksWaktuWib(w.diambilMs),
      koordinat: teksKoordinat(posisi.lat, posisi.lng, posisi.akurasi),
      lokasi,
      pemotret: akun.nama,
      peran: pen.peran.toUpperCase(),
      kegiatan: pen.kegiatan.nama,
      kode,
      urlVerifikasi: urlVerifikasi(kode, asal),
    });
  } catch (e) {
    return galat(e instanceof Error ? `Gagal memproses gambar: ${e.message}` : "Gagal memproses gambar.", 422);
  }
  const jalur = `kamera/${kegiatanId}/${tanggal}/${kode}.jpg`;
  const { error: errUnggah } = await db.storage.from(BUCKET_SIGAP).upload(jalur, stempel.buf, { contentType: "image/jpeg", upsert: false });
  if (errUnggah) return galat(`Gagal menyimpan berkas: ${errUnggah.message}`, 500);

  // 8) Catat
  const { data: foto, error: errFoto } = await db
    .from("sigap_foto")
    .insert({
      kode, kegiatan_id: kegiatanId, akun_pengambil: akunId, tanggal,
      diambil_at: new Date(w.diambilMs).toISOString(), diterima_at: new Date(terimaMs).toISOString(),
      waktu_hp: angka(form.get("waktu_hp")) !== null ? new Date(angka(form.get("waktu_hp")) as number).toISOString() : null,
      selisih_detik: w.selisihHpDetik, waktu_terverifikasi: w.terverifikasi,
      lat: posisi.lat, lng: posisi.lng, akurasi_m: posisi.akurasi,
      posisi_at: umurPosisi !== null ? new Date(w.diambilMs - umurPosisi).toISOString() : null,
      jarak_wilayah_m: jarakWilayah === 99999 ? null : jarakWilayah, lokasi_teks: lokasi,
      file_path: jalur, ukuran_byte: stempel.buf.length, sha256: sha256Hex(stempel.buf), sha256_asli: shaAsli, sidik_gambar: sidik,
      token_nonce: tok ? tok.nonce : null, kepercayaan: nilai.tingkat, alasan: nilai.alasan,
      simpan_sampai: simpanSampai(pen.periode.selesai, tanggal),
    })
    .select("*")
    .single();
  if (errFoto || !foto) {
    // Gagal mencatat: buang berkas yatim yang baru saja kita unggah sendiri (bukan data pengguna).
    await db.storage.from(BUCKET_SIGAP).remove([jalur]);
    if (errFoto?.code === "23505") return galat("Foto ini sudah pernah dikirim.", 409, { kode: "duplikat" });
    return galat(`Gagal mencatat foto: ${errFoto?.message ?? "tidak diketahui"}`, 500);
  }

  const { data: tagPemotret } = await db
    .from("sigap_foto_tag")
    .insert({ foto_id: foto.id, akun_id: akunId, peran_tag: "pemotret", status: "diajukan", slot_usulan: nomor })
    .select("id")
    .single();
  if (tagBaru.length) {
    await db.from("sigap_foto_tag").insert(tagBaru.map((t) => ({ foto_id: foto.id, akun_id: t.akun_id, peran_tag: t.peran_tag, slot_usulan: t.slot_usulan })));
  }

  let penempatan: unknown = null;
  if (nomor !== null && tagPemotret) {
    const { data, error } = await db.rpc("sigap_foto_tempatkan", {
      p_tag_id: tagPemotret.id, p_akun_id: akunId, p_penugasan_id: pen.id, p_slot: nomor, p_susulan: akses.susulan, p_tahan: nilai.tingkat === "merah",
    });
    penempatan = error ? { ok: false, error: error.message } : data;
  }

  return NextResponse.json({
    ok: true,
    foto: ringkas(foto),
    penempatan,
    ditahan: nilai.tingkat === "merah",
    jumlah_tag: tagBaru.length,
  });
}

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  const tanggal = req.nextUrl.searchParams.get("tanggal");
  let q = db.from("sigap_foto").select("id, kode, kegiatan_id, tanggal, diambil_at, diterima_at, lokasi_teks, kepercayaan, alasan, status_periksa, ukuran_byte").eq("akun_pengambil", akunId).order("diambil_at", { ascending: false }).limit(100);
  if (tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal)) q = q.eq("tanggal", tanggal);
  const [{ data: saya }, { data: tagSaya }] = await Promise.all([
    q,
    db.from("sigap_foto_tag").select("id, foto_id, peran_tag, status, penugasan_id, slot, slot_usulan, diajukan_at").eq("akun_id", akunId).order("diajukan_at", { ascending: false }).limit(200),
  ]);
  const fotoIds = Array.from(new Set([...(saya ?? []).map((f) => f.id as number), ...(tagSaya ?? []).map((t) => t.foto_id as number)]));
  const { data: semua } = fotoIds.length
    ? await db.from("sigap_foto").select("id, kode, kegiatan_id, tanggal, diambil_at, lokasi_teks, kepercayaan, status_periksa, akun_pengambil").in("id", fotoIds)
    : { data: [] as Record<string, unknown>[] };
  const peta = new Map((semua ?? []).map((f) => [f.id as number, f]));
  const pemotretIds = Array.from(new Set((semua ?? []).map((f) => f.akun_pengambil as number)));
  const { data: nama } = pemotretIds.length ? await db.from("sigap_akun").select("id, nama").in("id", pemotretIds) : { data: [] as Record<string, unknown>[] };
  const namaPeta = new Map((nama ?? []).map((a) => [a.id as number, a.nama as string]));
  const idSaya = (saya ?? []).map((f) => f.id as number);
  const tagSemua = idSaya.length ? (await db.from("sigap_foto_tag").select("foto_id, akun_id, peran_tag, status, slot").in("foto_id", idSaya)).data ?? [] : [];
  const idTag = Array.from(new Set(tagSemua.map((t) => t.akun_id as number)));
  const { data: namaTag } = idTag.length ? await db.from("sigap_akun").select("id, nama").in("id", idTag) : { data: [] as Record<string, unknown>[] };
  const petaTag = new Map((namaTag ?? []).map((a) => [a.id as number, a.nama as string]));
  return NextResponse.json({
    diambil: (saya ?? []).map((f) => ({ ...f, tag: tagSemua.filter((t) => t.foto_id === f.id).map((t) => ({ ...t, nama: petaTag.get(t.akun_id as number) ?? "-" })) })),
    untuk_saya: (tagSaya ?? [])
      .filter((t) => t.peran_tag !== "pemotret")
      .map((t) => {
        const f = peta.get(t.foto_id as number);
        return { ...t, foto: f ? { ...f, pemotret: namaPeta.get(f.akun_pengambil as number) ?? "-" } : null };
      }),
  });
}
