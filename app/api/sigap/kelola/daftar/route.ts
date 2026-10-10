// app/api/sigap/kelola/daftar/route.ts
//
// (10 Okt 2026) Halaman awal modul pengelolaan = daftar kegiatan dikelompokkan per kegiatan induk -- permintaan user
// ("tampilkan dulu list pelatihan berdasarkan kegiatan; demikian juga translok dan proses bisnis yang lain").
// GET ?modul=pelatihan|translok  (Authorization: Bearer <sesi>)
//   -> { modul, satuan, label_orang, grup: [{ induk_kode, induk_nama, kegiatan: [...] }] }
// Hanya kegiatan yang boleh dilihat akun (izin menu modul, per kegiatan). Konfigurasi modul: lib/sigapKelolaModul.ts.

import { NextRequest, NextResponse } from "next/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin } from "@/lib/sigapTesDb";
import { MODUL_KELOLA, kelompokkanPerInduk, modulKelolaValid, statusKegiatan, type KegiatanRingkas } from "@/lib/sigapKelolaModul";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Keg = KegiatanRingkas & { tanggal_mulai: string | null; tanggal_selesai: string | null };

export async function GET(req: NextRequest) {
  const kode = req.nextUrl.searchParams.get("modul");
  if (!modulKelolaValid(kode)) return NextResponse.json({ error: "Modul tidak dikenal." }, { status: 400 });
  const modul = MODUL_KELOLA[kode];
  const db = dbAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariRequest(req, db);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });

  const [{ izin }, { data: keg }, { data: induk }] = await Promise.all([
    izinAkun(db, akun.id),
    db.from("sigap_kegiatan").select("id, kode, nama, jenis, aktif, tanggal_mulai, tanggal_selesai").order("tanggal_mulai", { ascending: false }),
    db.from("sigap_induk").select("kode, nama, kegiatan_ids, urutan").eq("aktif", true).order("urutan"),
  ]);
  const terlihat = ((keg ?? []) as Keg[]).filter((k) => modul.cocok(k) && modul.menuIzin.some((m) => boleh(izin, m, "lihat", k.id)));

  const jumlah = new Map<number, number>();
  if (terlihat.length) {
    const { data: pen } = await db.from("sigap_penugasan").select("kegiatan_id").in("kegiatan_id", terlihat.map((k) => k.id)).eq("aktif", true);
    for (const p of pen ?? []) jumlah.set(Number(p.kegiatan_id), (jumlah.get(Number(p.kegiatan_id)) ?? 0) + 1);
  }
  const hariIni = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10); // WIB

  const baris = terlihat.map((k) => ({
    id: k.id,
    kode: k.kode,
    nama: k.nama,
    jenis: k.jenis,
    tanggal_mulai: k.tanggal_mulai,
    tanggal_selesai: k.tanggal_selesai,
    status: statusKegiatan(k, hariIni),
    jumlah_orang: jumlah.get(k.id) ?? 0,
    boleh_kelola: modul.menuKelola.some((m) => boleh(izin, m, "kelola", k.id)),
    tersambung: modul.tersambung(k),
  }));
  const daftarInduk = (induk ?? []).map((i) => ({ kode: String(i.kode), nama: String(i.nama), kegiatan_ids: ((i.kegiatan_ids as (number | string)[] | null) ?? []).map(Number) }));
  const grup = kelompokkanPerInduk(baris, daftarInduk, modul.satuan === "pelatihan" ? "Pelatihan lainnya" : "Kegiatan lainnya").map((g) => ({
    induk_kode: g.induk_kode,
    induk_nama: g.induk_nama,
    kegiatan: g.isi,
  }));
  return NextResponse.json({ modul: modul.kode, satuan: modul.satuan, label_orang: modul.labelOrang, grup });
}
