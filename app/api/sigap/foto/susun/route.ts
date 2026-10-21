// app/api/sigap/foto/susun/route.ts
//
// (21 Okt 2026) Nomor foto Kamera SIGAP per hari: keadaan, susun otomatis, pasang foto cadangan, pindah/tukar nomor.
//
// GET  ?kegiatan=<id>&tanggal=YYYY-MM-DD(opsional, bawaan hari ini WIB)
//        -> { boleh, susulan, jumlah, nomor[1..jumlah] (terisi/kosong + foto), cadangan[], kosong[], saran }
// POST JSON { kegiatan_id, tanggal, aksi }
//        aksi 'isi'    : foto saya yang belum terpasang disusun otomatis ke nomor KOSONG (tidak menimpa apa pun)
//        aksi 'pasang' : { foto_id, slot } foto cadangan dipasang ke nomor pilihan (foto lama di nomor itu dilepas, tetap tersimpan sebagai cadangan)
//        aksi 'pindah' : { dari, ke } pindah/tukar nomor foto yang sudah terpasang (fungsi DB sigap_foto_pindah_nomor)
//
// Kunci akses sama dengan jalur foto lain (cekAksesIsian: hari kerja, 23.59 WIB, izin susulan, SPJ belum dikunci). Foto kepercayaan merah yang belum
// diperiksa dan foto "dipertanyakan" tidak ikut disusun. Foto yang diambil jauh dari wilayah tugas tidak ditempatkan di nomor berlokasi (2-4).
// Tidak ada penghapusan di sini.

import { NextRequest, NextResponse } from "next/server";
import { cekAksesIsian, hariIniWib, penugasanAkun, tanggalValid, type Db } from "@/lib/sigap";
import { WILAYAH_MERAH_M, jarakEfektifM, slotBerlokasi, slotValid } from "@/lib/sigapFoto";
import { nomorBerikutnya, nomorKosong, susunFoto, type Kandidat } from "@/lib/sigapFotoSusun";
import { jarakKeRumah, jarakKeWilayah, modeKegiatan } from "@/lib/sigapFotoServer";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Pen = Awaited<ReturnType<typeof penugasanAkun>>[number];
type FotoBaris = { id: number; kode: string; kepercayaan: string; alasan: string[] | null; diambil_at: string; status_periksa: string; lat: number | null; lng: number | null };

const KOLOM_FOTO = "id, kode, kepercayaan, alasan, diambil_at, status_periksa, lat, lng";

/** Foto di luar wilayah tugas (> batas merah dari KK wilayah DAN rumah petugas) tidak boleh menempati nomor berlokasi. */
async function diLuarWilayah(db: Db, akunId: number, f: { lat: number | null; lng: number | null }): Promise<boolean> {
  if (f.lat === null || f.lng === null) return false;
  const [jw, jr] = await Promise.all([jarakKeWilayah(db, akunId, f.lat, f.lng).catch(() => null), jarakKeRumah(db, akunId, f.lat, f.lng).catch(() => null)]);
  const je = jarakEfektifM(jw, jr);
  return je !== null && je > WILAYAH_MERAH_M;
}

async function keadaan(db: Db, akunId: number, pen: Pen, tanggal: string) {
  const jumlah = pen.kegiatan.jumlah_foto;
  const { data: dok } = await db.from("sigap_dokumentasi").select("id, slot, sumber, susulan, foto_id").eq("penugasan_id", pen.id).eq("tanggal", tanggal);
  const baris = (dok ?? []) as { id: number; slot: number; sumber: string; susulan: boolean; foto_id: number | null }[];
  const { data: saya } = await db.from("sigap_foto").select(KOLOM_FOTO).eq("akun_pengambil", akunId).eq("kegiatan_id", pen.kegiatan.id).eq("tanggal", tanggal).order("diambil_at", { ascending: true });
  const milik = (saya ?? []) as FotoBaris[];
  const idDok = baris.map((b) => b.foto_id).filter((x): x is number => x !== null);
  const dariRekan = idDok.filter((id) => !milik.some((m) => m.id === id));
  const { data: rekan } = dariRekan.length ? await db.from("sigap_foto").select(KOLOM_FOTO).in("id", dariRekan) : { data: [] as FotoBaris[] };
  const semua = new Map<number, FotoBaris>([...milik, ...((rekan ?? []) as FotoBaris[])].map((f) => [f.id, f]));
  const { data: tag } = milik.length
    ? await db.from("sigap_foto_tag").select("id, foto_id, status").eq("akun_id", akunId).eq("peran_tag", "pemotret").in("foto_id", milik.map((m) => m.id))
    : { data: [] as { id: number; foto_id: number; status: string }[] };
  const tagFoto = new Map(((tag ?? []) as { id: number; foto_id: number; status: string }[]).map((t) => [t.foto_id, t]));

  const terisi = new Set(baris.map((b) => b.slot));
  const cadangan = milik.filter((f) => {
    if (idDok.includes(f.id)) return false;
    const t = tagFoto.get(f.id);
    if (!t || (t.status !== "diajukan" && t.status !== "dilepas")) return false; // ditahan/ditolak/diterima ditangani jalur lain
    if (f.status_periksa === "dipertanyakan") return false;
    if (f.kepercayaan === "merah" && f.status_periksa !== "diperiksa") return false;
    return true;
  });
  return { jumlah, baris, semua, tagFoto, terisi, cadangan };
}

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId, akun } = m;
  const kegiatanId = Number(req.nextUrl.searchParams.get("kegiatan"));
  const tanggal = req.nextUrl.searchParams.get("tanggal") || hariIniWib();
  if (!Number.isInteger(kegiatanId) || kegiatanId <= 0) return galat("kegiatan wajib.");
  if (!tanggalValid(tanggal)) return galat("Tanggal tidak valid.");
  const pen = (await penugasanAkun(db, akunId)).find((p) => p.kegiatan.id === kegiatanId);
  if (!pen) return galat("Anda tidak terdaftar pada kegiatan ini.", 403);
  const k = await keadaan(db, akunId, pen, tanggal);
  const akses = await cekAksesIsian(db, akunId, pen.id, tanggal);
  const nomor = Array.from({ length: k.jumlah }, (_, i) => {
    const b = k.baris.find((x) => x.slot === i + 1);
    const f = b?.foto_id ? k.semua.get(b.foto_id) : undefined;
    return {
      slot: i + 1,
      terisi: !!b,
      sumber: b?.sumber ?? null,
      susulan: b?.susulan ?? false,
      foto: f ? { id: f.id, kode: f.kode, kepercayaan: f.kepercayaan, diambil_at: f.diambil_at } : null,
    };
  });
  return NextResponse.json({
    ok: true,
    boleh: !("error" in akses),
    susulan: !("error" in akses) && akses.susulan,
    alasan_tutup: "error" in akses ? akses.error : null,
    jumlah: k.jumlah,
    nomor,
    kosong: nomorKosong(k.terisi, k.jumlah),
    saran: nomorBerikutnya(k.terisi, k.jumlah),
    cadangan: k.cadangan.map((f) => ({ id: f.id, kode: f.kode, kepercayaan: f.kepercayaan, diambil_at: f.diambil_at })),
    // (21 Okt 2026) tombol "Rapikan nomor foto" dari layar kamera: membuka kartu hari tanggal ini, bagian foto (tautan dalam halaman kerja)
    href_kerja: `/sigap/translok/${akun.token}?p=${pen.id}&tab=${tanggal === hariIniWib() ? "hari_ini" : "hari_kerja"}&tgl=${tanggal}&fokus=foto`,
  });
}

export async function POST(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return galat("Isian tidak terbaca.");
  }
  const kegiatanId = Number(b.kegiatan_id);
  const tanggal = typeof b.tanggal === "string" && b.tanggal ? b.tanggal : hariIniWib();
  const aksi = b.aksi;
  if (!Number.isInteger(kegiatanId) || kegiatanId <= 0) return galat("kegiatan_id wajib.");
  if (!tanggalValid(tanggal)) return galat("Tanggal tidak valid.");
  if (aksi !== "isi" && aksi !== "pasang" && aksi !== "pindah") return galat("Aksi tidak dikenal.");

  if ((await modeKegiatan(db, [kegiatanId]))[kegiatanId] !== "kamera") return galat("Kegiatan ini memakai unggah foto (metode lama).", 403, { mode: "unggah" });
  const pen = (await penugasanAkun(db, akunId)).find((p) => p.kegiatan.id === kegiatanId);
  if (!pen) return galat("Anda tidak terdaftar pada kegiatan ini.", 403);
  const akses = await cekAksesIsian(db, akunId, pen.id, tanggal);
  if ("error" in akses) return galat(akses.error, akses.status);
  const k = await keadaan(db, akunId, pen, tanggal);

  // ---- pindah / tukar
  if (aksi === "pindah") {
    const dari = Number(b.dari);
    const ke = Number(b.ke);
    if (!slotValid(dari) || !slotValid(ke) || dari > k.jumlah || ke > k.jumlah) return galat("Nomor foto tidak valid.");
    const a = k.baris.find((x) => x.slot === dari);
    const t = k.baris.find((x) => x.slot === ke);
    if (!a) return galat("Nomor asal belum berisi foto.");
    for (const [baris, slotBaru] of [[a, ke], [t, dari]] as const) {
      if (!baris?.foto_id || !slotBerlokasi(slotBaru)) continue;
      const f = k.semua.get(baris.foto_id);
      if (f && (await diLuarWilayah(db, akunId, f))) return galat(`Foto ${f.kode} diambil jauh dari wilayah tugas, jadi tidak bisa dipakai untuk nomor ${slotBaru}.`, 422);
    }
    const { data, error } = await db.rpc("sigap_foto_pindah_nomor", { p_akun: akunId, p_penugasan: pen.id, p_tanggal: tanggal, p_dari: dari, p_ke: ke });
    if (error) return galat(error.message, 500);
    const r = data as { ok?: boolean; status?: string; error?: string };
    if (!r?.ok) return galat(`Gagal memindahkan: ${r?.error ?? "tidak diketahui"}`, 409);
    return NextResponse.json({ ok: true, status: r.status });
  }

  // ---- pasang satu foto cadangan ke nomor pilihan
  if (aksi === "pasang") {
    const fotoId = Number(b.foto_id);
    const slot = Number(b.slot);
    if (!slotValid(slot) || slot > k.jumlah) return galat("Nomor foto tidak valid.");
    const f = k.cadangan.find((x) => x.id === fotoId);
    if (!f) return galat("Foto tidak ada di daftar cadangan hari ini.", 404);
    if (slotBerlokasi(slot) && (await diLuarWilayah(db, akunId, f))) return galat("Foto ini diambil jauh dari wilayah tugas, jadi tidak bisa dipakai untuk nomor " + slot + ".", 422);
    const tag = k.tagFoto.get(f.id)!;
    if (tag.status === "dilepas") await db.from("sigap_foto_tag").update({ status: "diajukan" }).eq("id", tag.id);
    const { data, error } = await db.rpc("sigap_foto_tempatkan", { p_tag_id: tag.id, p_akun_id: akunId, p_penugasan_id: pen.id, p_slot: slot, p_susulan: akses.susulan, p_tahan: false });
    if (error) return galat(error.message, 500);
    const r = data as { ok?: boolean; error?: string };
    if (!r?.ok) return galat(`Gagal memasang: ${r?.error ?? "tidak diketahui"}`, 409);
    return NextResponse.json({ ok: true });
  }

  // ---- isi otomatis
  const kosong = nomorKosong(k.terisi, k.jumlah);
  if (!kosong.length || !k.cadangan.length) return NextResponse.json({ ok: true, ditempatkan: [], cadangan: k.cadangan.length, kosong });
  const kandidat: Kandidat[] = await Promise.all(
    k.cadangan.map(async (f) => ({ id: f.id, ms: new Date(f.diambil_at).getTime(), kuning: f.kepercayaan === "kuning", diLuarWilayah: await diLuarWilayah(db, akunId, f) }))
  );
  const { dipasang, cadangan } = susunFoto(kandidat, kosong, k.jumlah);
  const ditempatkan: { foto_id: number; kode: string; slot: number }[] = [];
  const gagal: { foto_id: number; error: string }[] = [];
  for (const p of dipasang) {
    const tag = k.tagFoto.get(p.id)!;
    if (tag.status === "dilepas") await db.from("sigap_foto_tag").update({ status: "diajukan" }).eq("id", tag.id);
    const { data, error } = await db.rpc("sigap_foto_tempatkan", { p_tag_id: tag.id, p_akun_id: akunId, p_penugasan_id: pen.id, p_slot: p.slot, p_susulan: akses.susulan, p_tahan: false });
    const r = data as { ok?: boolean; error?: string } | null;
    if (error || !r?.ok) gagal.push({ foto_id: p.id, error: error?.message ?? r?.error ?? "tidak diketahui" });
    else ditempatkan.push({ foto_id: p.id, kode: k.semua.get(p.id)?.kode ?? "", slot: p.slot });
  }
  if (ditempatkan.length) {
    await db.from("sigap_audit").insert({ akun_id: akunId, aksi: "foto.isi_otomatis", detail: { penugasan_id: pen.id, tanggal, susulan: akses.susulan, ditempatkan, cadangan: cadangan.map((c) => c.id), gagal } });
  }
  return NextResponse.json({ ok: true, ditempatkan, cadangan: cadangan.length, gagal, kosong: kosong.filter((s) => !ditempatkan.some((d) => d.slot === s)) });
}
