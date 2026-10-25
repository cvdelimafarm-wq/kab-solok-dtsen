// app/api/sigap/foto/susun/route.ts
//
// (21 Okt 2026) Nomor foto Kamera SIGAP per hari: keadaan, susun otomatis, pasang foto cadangan, pindah/tukar nomor.
//
// GET  ?kegiatan=<id>&tanggal=YYYY-MM-DD(opsional, bawaan hari ini WIB)
//        -> { boleh, susulan, jumlah, nomor[1..jumlah] (terisi/kosong + foto), cadangan[], kosong[], saran }
// POST JSON { kegiatan_id, tanggal, aksi }
//        aksi 'isi'    : foto saya yang belum terpasang disusun otomatis ke nomor KOSONG (tidak menimpa apa pun)
//        aksi 'pasang' : { foto_id, slot } foto cadangan dipasang ke nomor pilihan (foto lama di nomor itu dilepas, tetap tersimpan sebagai cadangan); foto merah belum diperiksa -> dipesan sebagai tahanan
//        aksi 'pindah' : { dari, ke } pindah/tukar nomor foto yang sudah terpasang (fungsi DB sigap_foto_pindah_nomor)
//        aksi 'urutkan': (23 Okt 2026) foto Kamera SIGAP pada nomor terisi diurutkan menurut jam (terawal ke terakhir) lewat rangkaian 'pindah'
//                        yang sama; aturan di lib/sigapUrutanFoto.ts (sama dengan peringatan jam). Semua cek dilakukan SEBELUM menulis; bila satu
//                        langkah gagal, langkah yang sudah jalan dibatalkan (penukaran dapat dibalik), jadi urutan tidak pernah setengah berubah.
//        Pindah/pasang/urutkan menerima `harap_*` (opsional): apa yang dilihat petugas di layar. Bila keadaan di server sudah berbeda
//        (mis. diubah dari HP lain) jawabannya 409 dan tidak ada yang diubah.
//
// Kunci akses (cekAksesSusunFoto, 25 Okt 2026): hari kerja, SPJ belum dikunci, dan umur tanggal <= 5 hari (batas 23.59 WIB tidak berlaku untuk mengatur nomor). Foto kepercayaan merah yang belum
// diperiksa dan foto "dipertanyakan" tidak ikut disusun. Foto yang diambil jauh dari wilayah tugas tidak ditempatkan di nomor berlokasi (2-4).
// (21 Okt 2026) Foto kuning/merah TETAP ikut bernomor: kuning langsung masuk nomor (hanya ditandai), merah dan yang belum diperiksa diberi
// nomor sebagai TAHANAN (tag 'ditahan' + slot; belum ditulis ke nomor foto sampai PML/admin memeriksa, lalu sigap_foto_lepas_tahan memasangnya
// di nomor itu). Nomor tahanan tidak dipakai lagi oleh nomor otomatis foto lain. Hanya foto "dipertanyakan" yang tidak ikut.
// Tidak ada penghapusan di sini.

import { NextRequest, NextResponse } from "next/server";
import { cekAksesSusunFoto, hariIniWib, penugasanAkun, tanggalValid, type Db } from "@/lib/sigap";
import { WILAYAH_MERAH_M, jarakEfektifM, slotBerlokasi, slotValid } from "@/lib/sigapFoto";
import { BATAS_HARI_SUSUN, nomorBerikutnya, nomorKosong, susunFoto, umurHari, type Kandidat } from "@/lib/sigapFotoSusun";
import { kunciLangkah, rencanaUrutJam, type IsiNomor, type Langkah } from "@/lib/sigapUrutanFoto";
import { jarakKeRumah, jarakKeWilayah, modeKegiatan } from "@/lib/sigapFotoServer";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Pen = Awaited<ReturnType<typeof penugasanAkun>>[number];
type FotoBaris = { id: number; kode: string; kepercayaan: string; alasan: string[] | null; diambil_at: string; status_periksa: string; lat: number | null; lng: number | null };

type TagBaris = { id: number; foto_id: number; status: string; slot?: number | null; penugasan_id?: number | null };

const KOLOM_FOTO = "id, kode, kepercayaan, alasan, diambil_at, status_periksa, lat, lng";

/** Foto di luar wilayah tugas (> batas merah dari KK wilayah DAN rumah petugas) tidak boleh menempati nomor berlokasi. */
async function diLuarWilayah(db: Db, akunId: number, f: { lat: number | null; lng: number | null }): Promise<boolean> {
  if (f.lat === null || f.lng === null) return false;
  const [jw, jr] = await Promise.all([jarakKeWilayah(db, akunId, f.lat, f.lng).catch(() => null), jarakKeRumah(db, akunId, f.lat, f.lng).catch(() => null)]);
  const je = jarakEfektifM(jw, jr);
  return je !== null && je > WILAYAH_MERAH_M;
}

// (23 Okt 2026) lat/lng ikut dikirim (hanya foto milik/rekan sendiri) untuk lembar detail foto; tidak dipakai menilai apa pun
const ringkas = (f: FotoBaris) => ({ id: f.id, kode: f.kode, kepercayaan: f.kepercayaan, diambil_at: f.diambil_at, lat: f.lat, lng: f.lng });

/** Isi sebuah nomor seperti yang dilihat petugas: "kosong", "manual" (unggahan tanpa foto Kamera SIGAP), atau id fotonya. */
type Harap = "kosong" | "manual" | number;
const isiNomor = (baris: { slot: number; foto_id: number | null }[], slot: number): Harap => {
  const b = baris.find((x) => x.slot === slot);
  return !b ? "kosong" : b.foto_id === null ? "manual" : b.foto_id;
};
const harapAda = (b: Record<string, unknown>, kunci: string) => Object.prototype.hasOwnProperty.call(b, kunci) && b[kunci] !== undefined && b[kunci] !== null;
const SUSUNAN_BERUBAH = "Susunan foto sudah berubah (mungkin dari HP lain). Muat ulang halaman, lalu coba lagi. Urutan tidak diubah.";

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
    ? await db.from("sigap_foto_tag").select("id, foto_id, status, slot, penugasan_id").eq("akun_id", akunId).eq("peran_tag", "pemotret").in("foto_id", milik.map((m) => m.id))
    : { data: [] as TagBaris[] };
  const tagFoto = new Map(((tag ?? []) as TagBaris[]).map((t) => [t.foto_id, t]));

  const terisi = new Set(baris.map((b) => b.slot));
  const jumlahValid = (n: number) => Number.isInteger(n) && n >= 1 && n <= jumlah;
  const merahBelumPeriksa = (f: FotoBaris) => f.kepercayaan === "merah" && f.status_periksa !== "diperiksa";
  // Foto yang sudah punya nomor sebagai TAHANAN (menunggu diperiksa): nomornya dipesan, belum tertulis di nomor foto.
  const tahanan = new Map<number, FotoBaris>(); // slot -> foto
  for (const f of milik) {
    const t = tagFoto.get(f.id);
    if (t?.status === "ditahan" && t.penugasan_id === pen.id && t.slot && jumlahValid(Number(t.slot)) && !terisi.has(Number(t.slot)) && !tahanan.has(Number(t.slot))) tahanan.set(Number(t.slot), f);
  }
  const cadangan = milik.filter((f) => {
    if (idDok.includes(f.id)) return false;
    const t = tagFoto.get(f.id);
    if (!t || (t.status !== "diajukan" && t.status !== "dilepas")) return false; // ditahan/ditolak/diterima ditangani jalur lain
    if (f.status_periksa === "dipertanyakan") return false;
    if (merahBelumPeriksa(f)) return false;
    return true;
  });
  // merah belum diperiksa yang belum bernomor: tetap diberi nomor (tahanan) saat susun otomatis
  const perluTahan = milik.filter((f) => {
    if (idDok.includes(f.id)) return false;
    const t = tagFoto.get(f.id);
    return !!t && (t.status === "diajukan" || t.status === "dilepas") && merahBelumPeriksa(f) && f.status_periksa !== "dipertanyakan";
  });
  return { jumlah, baris, semua, tagFoto, terisi, cadangan, tahanan, perluTahan };
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
  const akses = await cekAksesSusunFoto(db, akunId, pen.id, tanggal);
  const nomor = Array.from({ length: k.jumlah }, (_, i) => {
    const b = k.baris.find((x) => x.slot === i + 1);
    const f = b?.foto_id ? k.semua.get(b.foto_id) : undefined;
    return {
      slot: i + 1,
      terisi: !!b,
      sumber: b?.sumber ?? null,
      susulan: b?.susulan ?? false,
      foto: f ? ringkas(f) : null,
      ditahan: !b && k.tahanan.has(i + 1) ? ringkas(k.tahanan.get(i + 1)!) : null,
    };
  });
  const dipesan = new Set([...k.terisi, ...k.tahanan.keys()]);
  return NextResponse.json({
    ok: true,
    boleh: !("error" in akses),
    susulan: !("error" in akses) && akses.susulan,
    // (25 Okt 2026) hari yang sudah lewat tetap bisa diatur sampai umurnya melewati BATAS_HARI_SUSUN; sisa_hari = berapa hari lagi (0 = hari terakhir)
    lampau: !("error" in akses) && akses.lampau,
    sisa_hari: !("error" in akses) && akses.lampau ? Math.max(0, BATAS_HARI_SUSUN - umurHari(tanggal, hariIniWib())) : null,
    alasan_tutup: "error" in akses ? akses.error : null,
    jumlah: k.jumlah,
    nomor,
    kosong: nomorKosong(k.terisi, k.jumlah),
    // saran nomor berikutnya melewati nomor yang sudah dipesan foto tahanan (kuning/merah menunggu diperiksa)
    saran: nomorBerikutnya(dipesan, k.jumlah),
    ditahan: [...k.tahanan.keys()].sort((a, b) => a - b),
    // foto merah belum diperiksa ikut ditampilkan (tahan: true): bisa diberi nomor, tetapi nomornya baru tertulis setelah diperiksa
    cadangan: [...k.cadangan.map((f) => ({ ...ringkas(f), tahan: false })), ...k.perluTahan.map((f) => ({ ...ringkas(f), tahan: true }))].sort((a, b) => a.diambil_at.localeCompare(b.diambil_at)),
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
  if (aksi !== "isi" && aksi !== "pasang" && aksi !== "pindah" && aksi !== "urutkan") return galat("Aksi tidak dikenal.");

  if ((await modeKegiatan(db, [kegiatanId]))[kegiatanId] !== "kamera") return galat("Kegiatan ini memakai unggah foto (metode lama).", 403, { mode: "unggah" });
  const pen = (await penugasanAkun(db, akunId)).find((p) => p.kegiatan.id === kegiatanId);
  if (!pen) return galat("Anda tidak terdaftar pada kegiatan ini.", 403);
  const akses = await cekAksesSusunFoto(db, akunId, pen.id, tanggal);
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
    if ((harapAda(b, "harap_dari") && b.harap_dari !== isiNomor(k.baris, dari)) || (harapAda(b, "harap_ke") && b.harap_ke !== isiNomor(k.baris, ke))) return galat(SUSUNAN_BERUBAH, 409);
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

  // ---- urutkan sesuai jam (23 Okt 2026)
  if (aksi === "urutkan") {
    const isi: IsiNomor[] = k.baris
      .filter((r) => r.slot >= 1 && r.slot <= k.jumlah)
      .map((r) => {
        const f = r.foto_id !== null ? k.semua.get(r.foto_id) : undefined;
        return { slot: r.slot, fotoId: r.foto_id, ms: f ? new Date(f.diambil_at).getTime() : null };
      });
    const rencana = rencanaUrutJam(isi);
    if (Array.isArray(b.harap_langkah)) {
      const diminta = (b.harap_langkah as unknown[]).map((p) => (Array.isArray(p) ? ([Number(p[0]), Number(p[1])] as Langkah) : ([NaN, NaN] as Langkah)));
      if (kunciLangkah(diminta) !== kunciLangkah(rencana.langkah)) return galat(SUSUNAN_BERUBAH, 409);
    }
    if (!rencana.langkah.length) return NextResponse.json({ ok: true, status: "sudah_urut", langkah: [] });
    // semua syarat dicek dulu: foto yang jauh dari wilayah tugas tidak boleh berakhir di nomor berlokasi (2-4), sama seperti 'pindah'
    for (const u of rencana.berubah) {
      if (!slotBerlokasi(u.slot)) continue;
      const f = k.semua.get(u.fotoId);
      if (f && (await diLuarWilayah(db, akunId, f))) return galat(`Foto ${f.kode} diambil jauh dari wilayah tugas, jadi tidak bisa dipakai untuk nomor ${u.slot}. Urutan tidak diubah.`, 422);
    }
    const jalan = async (x: number, y: number) => {
      try {
        const { data, error } = await db.rpc("sigap_foto_pindah_nomor", { p_akun: akunId, p_penugasan: pen.id, p_tanggal: tanggal, p_dari: x, p_ke: y });
        const r = data as { ok?: boolean; error?: string } | null;
        return error || !r?.ok ? (error?.message ?? r?.error ?? "tidak diketahui") : null;
      } catch (e) {
        return e instanceof Error ? e.message : "tidak diketahui";
      }
    };
    const selesai: Langkah[] = [];
    for (const [x, y] of rencana.langkah) {
      const gagal = await jalan(x, y);
      if (gagal) {
        for (const [p, q] of [...selesai].reverse()) await jalan(p, q); // penukaran dibalik persis urutan terbalik
        return galat(`Gagal mengurutkan: ${gagal}. Urutan foto tidak diubah.`, 409);
      }
      selesai.push([x, y]);
    }
    await db.from("sigap_audit").insert({ akun_id: akunId, aksi: "foto.diurutkan_jam", detail: { penugasan_id: pen.id, tanggal, langkah: rencana.langkah, berubah: rencana.berubah } });
    return NextResponse.json({ ok: true, status: "urut", langkah: rencana.langkah });
  }

  // ---- pasang satu foto cadangan ke nomor pilihan
  if (aksi === "pasang") {
    const fotoId = Number(b.foto_id);
    const slot = Number(b.slot);
    if (!slotValid(slot) || slot > k.jumlah) return galat("Nomor foto tidak valid.");
    const f = k.cadangan.find((x) => x.id === fotoId) ?? k.perluTahan.find((x) => x.id === fotoId);
    if (!f) return galat("Foto tidak ada di daftar cadangan hari ini.", 404);
    const tahan = k.perluTahan.some((x) => x.id === fotoId); // merah belum diperiksa: nomor dipesan dulu (tahanan)
    if (harapAda(b, "harap_isi") && b.harap_isi !== isiNomor(k.baris, slot)) return galat(SUSUNAN_BERUBAH, 409);
    if (slotBerlokasi(slot) && (await diLuarWilayah(db, akunId, f))) return galat("Foto ini diambil jauh dari wilayah tugas, jadi tidak bisa dipakai untuk nomor " + slot + ".", 422);
    const tag = k.tagFoto.get(f.id)!;
    if (tag.status === "dilepas") await db.from("sigap_foto_tag").update({ status: "diajukan" }).eq("id", tag.id);
    const { data, error } = await db.rpc("sigap_foto_tempatkan", { p_tag_id: tag.id, p_akun_id: akunId, p_penugasan_id: pen.id, p_slot: slot, p_susulan: akses.susulan || akses.lampau, p_tahan: tahan });
    if (error) return galat(error.message, 500);
    const r = data as { ok?: boolean; error?: string };
    if (!r?.ok) return galat(`Gagal memasang: ${r?.error ?? "tidak diketahui"}`, 409);
    return NextResponse.json({ ok: true, ditahan: tahan });
  }

  // ---- isi otomatis
  // Nomor yang sudah dipesan foto tahanan tidak diisi foto lain. Tahap 1: foto hijau/kuning -> langsung masuk nomor. Tahap 2: foto merah
  // belum diperiksa -> diberi nomor sebagai TAHANAN pada nomor yang masih sisa (nomor foto baru terisi setelah diperiksa PML/admin).
  const kosongAsli = nomorKosong(k.terisi, k.jumlah);
  const kosong = kosongAsli.filter((s) => !k.tahanan.has(s));
  if (!kosong.length || (!k.cadangan.length && !k.perluTahan.length)) return NextResponse.json({ ok: true, ditempatkan: [], ditahan: [], cadangan: k.cadangan.length, kosong: kosongAsli });
  const jadikan = async (f: FotoBaris) => ({ id: f.id, ms: new Date(f.diambil_at).getTime(), kuning: f.kepercayaan === "kuning", diLuarWilayah: await diLuarWilayah(db, akunId, f) });
  const kandidat: Kandidat[] = await Promise.all(k.cadangan.map(jadikan));
  const { dipasang, cadangan } = susunFoto(kandidat, kosong, k.jumlah);
  const ditempatkan: { foto_id: number; kode: string; slot: number }[] = [];
  const ditahan: { foto_id: number; kode: string; slot: number }[] = [];
  const gagal: { foto_id: number; error: string }[] = [];
  const pasang = async (id: number, slot: number, tahan: boolean) => {
    const tag = k.tagFoto.get(id)!;
    if (tag.status === "dilepas") await db.from("sigap_foto_tag").update({ status: "diajukan" }).eq("id", tag.id);
    const { data, error } = await db.rpc("sigap_foto_tempatkan", { p_tag_id: tag.id, p_akun_id: akunId, p_penugasan_id: pen.id, p_slot: slot, p_susulan: akses.susulan || akses.lampau, p_tahan: tahan });
    const r = data as { ok?: boolean; error?: string } | null;
    if (error || !r?.ok) gagal.push({ foto_id: id, error: error?.message ?? r?.error ?? "tidak diketahui" });
    else (tahan ? ditahan : ditempatkan).push({ foto_id: id, kode: k.semua.get(id)?.kode ?? "", slot });
  };
  for (const p of dipasang) await pasang(p.id, p.slot, false);
  const sisa = kosong.filter((s) => !dipasang.some((p) => p.slot === s));
  if (sisa.length && k.perluTahan.length) {
    const kandMerah: Kandidat[] = await Promise.all(k.perluTahan.map(jadikan));
    // foto merah memang sering jauh dari wilayah: nomor berlokasi (2-4) tidak diberikan bila di luar wilayah, sama seperti foto lain
    const hasilMerah = susunFoto(kandMerah, sisa, k.jumlah);
    for (const p of hasilMerah.dipasang) await pasang(p.id, p.slot, true);
  }
  if (ditempatkan.length || ditahan.length) {
    await db.from("sigap_audit").insert({ akun_id: akunId, aksi: "foto.isi_otomatis", detail: { penugasan_id: pen.id, tanggal, susulan: akses.susulan, ditempatkan, ditahan, cadangan: cadangan.map((c) => c.id), gagal } });
  }
  const terpakai = new Set([...ditempatkan, ...ditahan].map((d) => d.slot));
  return NextResponse.json({ ok: true, ditempatkan, ditahan, cadangan: cadangan.length, gagal, kosong: kosongAsli.filter((s) => !terpakai.has(s)) });
}
