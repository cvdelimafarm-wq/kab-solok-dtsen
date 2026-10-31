// app/api/sigap/pelatihan/buat/route.ts
//
// (31 Okt 2026) Membuat pelatihan baru di bawah sebuah survei (kegiatan induk) -- permintaan Iqbal: boleh oleh admin dan PJ.
// POST { survei: <sigap_induk.kode>, nama, tanggal_mulai: YYYY-MM-DD, tanggal_selesai?: YYYY-MM-DD }
//   -> { ok: true, pelatihan: { id, kode, nama }, survei, tersalin }
// Yang dibuat: (1) baris sigap_kegiatan berjenis 'pelatihan'; (2) pretest + posttest bawaan (TIDAK aktif, wajib lulus mati); (3) kegiatan ditautkan ke sigap_induk.kegiatan_ids;
// (4) peran pengelola pelatihan yang sudah ada pada survei itu (lingkup ke kegiatan survei, punya menu pelatihan.kelola) disalin ke pelatihan baru supaya PJ/admin
// berlingkup-kegiatan langsung melihatnya. Tidak ada hapus; bila langkah sesudah (1) gagal, kegiatan dinonaktifkan dan galat dikembalikan.
// Izin: peran admin_anggaran / admin_aplikasi / pj_kegiatan yang lingkupnya mencakup survei (lib/sigapPelatihanSurvei.ts: bolehBuatPelatihan).

import { NextRequest, NextResponse } from "next/server";
import { catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin } from "@/lib/sigapTesDb";
import { bolehBuatPelatihan, kodePelatihan, tesBawaan, validasiPelatihanBaru } from "@/lib/sigapPelatihanSurvei";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariRequest(req, db);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kodeSurvei = String(body?.survei ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(kodeSurvei)) return galat("Survei tidak sah.");
  const v = validasiPelatihanBaru(body);
  if (!v.ok) return galat(v.error);

  const { data: induk } = await db.from("sigap_induk").select("kode, nama, kegiatan_ids, aktif").eq("kode", kodeSurvei).maybeSingle();
  if (!induk || induk.aktif === false) return galat("Survei tidak ditemukan.", 404);
  const idsInduk = ((induk.kegiatan_ids as (number | string)[] | null) ?? []).map(Number);

  const { peran } = await izinAkun(db, akun.id);
  if (!bolehBuatPelatihan(peran, idsInduk)) return galat("Hanya admin atau PJ kegiatan survei ini yang boleh membuat pelatihan.", 403);

  // kode kegiatan unik
  const dasar = kodePelatihan(kodeSurvei, v.data.nama, v.data.tanggal_mulai);
  const { data: ada } = await db.from("sigap_kegiatan").select("kode").like("kode", `${dasar}%`).limit(200);
  const dipakai = new Set(((ada ?? []) as { kode: string }[]).map((r) => r.kode));
  let kode = dasar;
  for (let i = 2; dipakai.has(kode) && i < 200; i++) kode = `${dasar}_${i}`.slice(0, 84);
  if (dipakai.has(kode)) return galat("Kode pelatihan tidak dapat dibuat. Ubah nama pelatihan.");

  const { data: baru, error: eKeg } = await db
    .from("sigap_kegiatan")
    .insert({ kode, nama: v.data.nama, jenis: "pelatihan", strategi: "pelatihan", satuan_realisasi: "peserta", wajib_laporan: false, jumlah_foto: 5, tanggal_mulai: v.data.tanggal_mulai, tanggal_selesai: v.data.tanggal_selesai, aktif: true })
    .select("id, kode, nama")
    .single();
  if (eKeg || !baru) return galat(`Pelatihan gagal dibuat: ${eKeg?.message ?? "tidak ada hasil"}`, 500);
  const idBaru = Number(baru.id);

  const batal = async (pesan: string) => {
    await db.from("sigap_kegiatan").update({ aktif: false }).eq("id", idBaru);
    return galat(`${pesan} Pelatihan dinonaktifkan; hubungi admin aplikasi bila perlu.`, 500);
  };

  const tes = tesBawaan(v.data.nama, v.data.tanggal_mulai, v.data.tanggal_selesai).map((t) => ({ kegiatan_id: idBaru, ...t }));
  const { error: eTes } = await db.from("sigap_tes").insert(tes);
  if (eTes) return batal(`Pretest/posttest bawaan gagal dibuat: ${eTes.message}.`);

  const { error: eInduk } = await db.from("sigap_induk").update({ kegiatan_ids: [...idsInduk, idBaru] }).eq("kode", kodeSurvei);
  if (eInduk) return batal(`Gagal menautkan ke survei: ${eInduk.message}.`);

  // salin peran pengelola pelatihan (lingkup kegiatan survei) ke pelatihan baru
  let tersalin = 0;
  try {
    const { data: izinPel } = await db.from("sigap_peran_izin").select("peran_id").eq("menu_kode", "pelatihan.kelola");
    const peranPel = new Set(((izinPel ?? []) as { peran_id: number }[]).map((r) => Number(r.peran_id)));
    const { data: ap } = await db.from("sigap_akun_peran").select("akun_id, peran_id, kegiatan_id").in("kegiatan_id", idsInduk.length ? idsInduk : [-1]);
    const sudah = new Set<string>();
    const baris: { akun_id: number; peran_id: number; kegiatan_id: number; diberi_oleh: string }[] = [];
    for (const r of (ap ?? []) as { akun_id: number; peran_id: number; kegiatan_id: number | null }[]) {
      if (r.kegiatan_id === null || !peranPel.has(Number(r.peran_id))) continue;
      const kunci = `${r.akun_id}:${r.peran_id}`;
      if (sudah.has(kunci)) continue;
      sudah.add(kunci);
      baris.push({ akun_id: Number(r.akun_id), peran_id: Number(r.peran_id), kegiatan_id: idBaru, diberi_oleh: `sistem:buat_pelatihan:${akun.id}` });
    }
    if (baris.length > 0) {
      const { error } = await db.from("sigap_akun_peran").insert(baris);
      if (error) throw new Error(error.message);
      tersalin = baris.length;
    }
  } catch (e) {
    return batal(`Gagal menyalin hak akses pengelola: ${e instanceof Error ? e.message : String(e)}.`);
  }

  await catatAudit(db, akun.id, "pelatihan_buat", { kegiatan_id: idBaru, kode, survei: kodeSurvei, nama: v.data.nama, tanggal_mulai: v.data.tanggal_mulai, tanggal_selesai: v.data.tanggal_selesai, peran_tersalin: tersalin });
  return NextResponse.json({ ok: true, pelatihan: { id: idBaru, kode: String(baru.kode), nama: String(baru.nama) }, survei: kodeSurvei, tersalin });
}
