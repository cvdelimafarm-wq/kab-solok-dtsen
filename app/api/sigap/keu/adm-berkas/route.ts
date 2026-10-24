// app/api/sigap/keu/adm-berkas/route.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK, tab Administrasi (papan 13) -- unggah dan unduh berkas dokumen kelengkapan per item POK.
// POST (multipart, Authorization: Bearer <sesi>)  bidang: berkas, detail (id item POK berlaku), dok (id master dokumen), catatan (opsional).
//   Server menghitung SHA-256, menyimpan berkas ke penyimpanan sigap-files (lokasi keu-adm/...), lalu memanggil keu_adm_aksi('unggah');
//   basis data yang memutuskan boleh atau tidaknya akun itu (pihak dokumen). Bila ditolak, berkas yatim di penyimpanan dibiarkan (tidak dihapus).
// GET ?adm=<id keu_adm_dok>  mengunduh berkas; hanya pegawai organik (sama dengan hak lihat halaman RO).
// Logika murni (jenis, ukuran, nama, lokasi) ada di lib/keu/adm.ts.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { panggilKeu } from "@/lib/keu/gerbang";
import { akunBolehBaca } from "@/lib/keu/baca";
import { lokasiBerkas, periksaBerkas, tipeIsi } from "@/lib/keu/adm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const bulat = (v: FormDataEntryValue | string | null): number | null => {
  const n = Number(v);
  return typeof v !== "object" && v !== null && Number.isInteger(n) && n > 0 ? n : null;
};

function klien() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const db = klien();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const sesi = sesiLengkapDariHeader(req.headers);
  if (!sesi) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  if (sesi.aktorId !== null) return galat("Mode masuk-sebagai hanya untuk melihat tampilan; tindakan ini tidak dijalankan.", 403);

  let form: FormData;
  try { form = await req.formData(); } catch { return galat("Isian tidak terbaca."); }
  const berkas = form.get("berkas");
  if (!(berkas instanceof File)) return galat("Berkas wajib dipilih.");
  const detail = bulat(form.get("detail"));
  const dok = bulat(form.get("dok"));
  if (!detail || !dok) return galat("detail dan dok wajib.");
  const salah = periksaBerkas(berkas.name, berkas.size);
  if (salah) return galat(salah, berkas.size > 0 && salah.includes("besar") ? 413 : 400);
  const catatan = String(form.get("catatan") ?? "").slice(0, 500);

  const { data: item } = await db.from("keu_v_adm_lembar").select("tahun, ro_kode").eq("detail_id", detail).maybeSingle();
  if (!item) return galat("Item tidak ditemukan pada POK yang berlaku.", 404);

  const isi = await berkas.arrayBuffer();
  const hash = await sha256Hex(isi);
  const path = lokasiBerkas(Number(item.tahun), String(item.ro_kode), detail, dok, hash, berkas.name);
  const tipe = tipeIsi(berkas.name);
  const { error: eUnggah } = await db.storage.from(BUCKET_SIGAP).upload(path, Buffer.from(isi), { contentType: tipe, upsert: true });
  if (eUnggah) return galat("Berkas gagal disimpan ke penyimpanan.", 502);

  const h = await panggilKeu(db, sesi.akunId, "keu_adm_aksi", {
    p_detail: detail, p_dok: dok, p_aksi: "unggah", p_catatan: catatan,
    p_berkas: { nama: berkas.name.trim().slice(0, 150), hash, ukuran: berkas.size, path },
  });
  if (!h.ok) return NextResponse.json({ error: h.galat.pesan, kode: h.galat.kode }, { status: h.galat.status });
  return NextResponse.json({ data: { adm_id: h.data, nama: berkas.name, ukuran: berkas.size, hash } });
}

export async function GET(req: NextRequest) {
  const db = klien();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const sesi = sesiLengkapDariHeader(req.headers);
  if (!sesi) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  if (!(await akunBolehBaca(db, sesi.akunId))) return galat("Hanya pegawai organik yang boleh mengunduh berkas ini.", 403);
  const id = bulat(req.nextUrl.searchParams.get("adm"));
  if (!id) return galat("adm wajib.");
  const { data: a } = await db.from("keu_adm_dok").select("berkas_nama, berkas_path, status").eq("id", id).maybeSingle();
  if (!a || !a.berkas_path) return galat("Berkas tidak ada (mungkin sudah dikembalikan).", 404);
  const { data, error } = await db.storage.from(BUCKET_SIGAP).download(String(a.berkas_path));
  if (error || !data) return galat("Berkas tidak ditemukan di penyimpanan.", 404);
  const nama = String(a.berkas_nama ?? "berkas").replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": tipeIsi(nama), "Content-Disposition": `attachment; filename="${nama}"`, "Cache-Control": "private, no-store" },
  });
}
