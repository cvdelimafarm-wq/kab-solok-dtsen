// app/api/sigap/kontrak/route.ts
//
// (6 Okt 2026) API modul Pengadaan & Kontrak -- permintaan user: halaman pengisian data kontrak yg
// terisi otomatis, user hanya verifikasi & edit. Wajib sesi SIGAP + izin menu 'kontrak.kelola'
// (lihat = baca, kelola = ubah). Data kontrak memuat data pribadi/keuangan -> tidak publik.
// Tidak ada hapus permanen: paket dibatalkan (status 'batal'), penyedia dinonaktifkan.
//
// GET ?bagian=daftar&tahun=     -> paket per tahun
// GET ?bagian=paket&id=         -> paket + master tahunnya + penyedia (hitung dilakukan di klien/unduh)
// GET ?bagian=referensi&tahun=  -> master tahun + daftar penyedia aktif + nomor urut berikutnya
// POST { aksi: buat_paket | simpan_paket | duplikat | ubah_status | simpan_master | simpan_penyedia }

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catatAudit } from "@/lib/sigapAkses";
import { aksesKontrak } from "@/lib/kontrak/akses";
import { FIELD_MASTER, hitung, type Isian } from "@/lib/kontrak/isi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function nomorBerikut(db: SupabaseClient, tahun: number): Promise<number> {
  const { data } = await db.from("kontrak_paket").select("nomor_urut").eq("tahun", tahun).neq("status", "batal").order("nomor_urut", { ascending: false, nullsFirst: false }).limit(1);
  return ((data?.[0]?.nomor_urut as number | null) ?? 0) + 1;
}

export async function GET(req: NextRequest) {
  const s = await aksesKontrak(req);
  if ("gagal" in s) return s.gagal;
  const { db } = s;
  const q = req.nextUrl.searchParams;
  const bagian = q.get("bagian") ?? "daftar";
  const tahun = Number(q.get("tahun")) || new Date().getFullYear();

  if (bagian === "daftar") {
    const { data, error } = await db
      .from("kontrak_paket")
      .select("id, tahun, nomor_urut, nama, status, penyedia_id, isian, timpa, diubah_at, diubah_oleh")
      .eq("tahun", tahun)
      .order("nomor_urut", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false });
    if (error) return galat(error.message, 500);
    const { data: pen } = await db.from("kontrak_penyedia").select("id, nama");
    const { data: th } = await db.from("kontrak_master_tahun").select("tahun").order("tahun");
    return NextResponse.json({
      kelola: s.kelola,
      tahun,
      daftar_tahun: (th ?? []).map((x) => x.tahun),
      paket: (data ?? []).map((p) => {
        const isian = (p.isian ?? {}) as Record<string, unknown>;
        return {
          id: p.id,
          nomor_urut: p.nomor_urut,
          nama: p.nama,
          status: p.status,
          penyedia: (pen ?? []).find((x) => x.id === p.penyedia_id)?.nama ?? null,
          tanggal_mulai: (isian.tanggal_mulai as string) ?? null,
          jumlah_item: Array.isArray(isian.items) ? isian.items.length : 0,
          // (6 Okt 2026) nilai kontrak (hasil nego) utk kolom daftar
          nilai: Array.isArray(isian.items) && isian.items.length ? hitung({}, null, { ...(isian as Isian), tahun: p.tahun }, (p.timpa ?? {}) as Record<string, string>).nilai.Nilai_Nego : null,
          diubah_at: p.diubah_at,
          diubah_oleh: p.diubah_oleh,
        };
      }),
    });
  }

  if (bagian === "referensi") {
    const [{ data: m }, { data: pen }, n] = await Promise.all([
      db.from("kontrak_master_tahun").select("tahun, data, diubah_at, diubah_oleh").eq("tahun", tahun).maybeSingle(),
      db.from("kontrak_penyedia").select("*").eq("aktif", true).order("nama"),
      nomorBerikut(db, tahun),
    ]);
    return NextResponse.json({ kelola: s.kelola, tahun, master: m?.data ?? {}, master_info: m ?? null, penyedia: pen ?? [], nomor_berikut: n, field_master: FIELD_MASTER });
  }

  if (bagian === "paket") {
    const id = Number(q.get("id"));
    const { data: p } = await db.from("kontrak_paket").select("*").eq("id", id).maybeSingle();
    if (!p) return galat("Paket tidak ditemukan.", 404);
    const [{ data: m }, { data: pen }] = await Promise.all([
      db.from("kontrak_master_tahun").select("data").eq("tahun", p.tahun).maybeSingle(),
      db.from("kontrak_penyedia").select("*").eq("aktif", true).order("nama"),
    ]);
    return NextResponse.json({ kelola: s.kelola, paket: p, master: m?.data ?? {}, penyedia: pen ?? [] });
  }

  return galat("Bagian tidak dikenal.");
}

export async function POST(req: NextRequest) {
  const s = await aksesKontrak(req);
  if ("gagal" in s) return s.gagal;
  if (!s.kelola) return galat("Akun Anda hanya punya akses lihat.", 403);
  const { db, akunId, nama } = s;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const aksi = String(b.aksi ?? "");
  const kini = new Date().toISOString();

  if (aksi === "buat_paket" || aksi === "duplikat") {
    let isian: Record<string, unknown> = {};
    let tahun = Number(b.tahun) || new Date().getFullYear();
    let penyedia_id: number | null = null;
    let namaPaket = String(b.nama ?? "").trim();
    if (aksi === "duplikat") {
      const { data: asal } = await db.from("kontrak_paket").select("*").eq("id", Number(b.id)).maybeSingle();
      if (!asal) return galat("Paket asal tidak ditemukan.", 404);
      tahun = Number(b.tahun) || asal.tahun;
      // salin isian kecuali tanggal & nomor dari penyedia (harus baru)
      isian = { ...(asal.isian as Record<string, unknown>) };
      for (const k of ["tanggal_mulai", "Nomor_Surat_Penawaran", "Permohonan_Pembayaran", "Nomor_Kuitansi"]) delete isian[k];
      penyedia_id = asal.penyedia_id;
      namaPaket = namaPaket || `${asal.nama} (salinan)`;
    }
    const nomor = await nomorBerikut(db, tahun);
    isian = { durasi_hari: 1, items: [], pembanding: [], ...isian, tahun, nomor_urut: nomor, Nama_Kegiatan_Pengadaan: namaPaket };
    const { data, error } = await db
      .from("kontrak_paket")
      .insert({ tahun, nomor_urut: nomor, nama: namaPaket, penyedia_id, isian, timpa: {}, dibuat_oleh: nama, diubah_oleh: nama })
      .select("id")
      .single();
    if (error) return galat(error.message, 500);
    await catatAudit(db, akunId, `kontrak.${aksi}`, { id: data.id, asal: b.id ?? null, nama: namaPaket });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (aksi === "simpan_paket") {
    const id = Number(b.id);
    const isian = (b.isian ?? {}) as Record<string, unknown>;
    const timpa = (b.timpa ?? {}) as Record<string, string>;
    const { data: lama } = await db.from("kontrak_paket").select("id, status").eq("id", id).maybeSingle();
    if (!lama) return galat("Paket tidak ditemukan.", 404);
    const { error } = await db
      .from("kontrak_paket")
      .update({
        isian,
        timpa,
        tahun: Number(isian.tahun) || undefined,
        nomor_urut: Number(isian.nomor_urut) || null,
        nama: String(isian.Nama_Kegiatan_Pengadaan ?? "").trim(),
        penyedia_id: b.penyedia_id ? Number(b.penyedia_id) : null,
        diubah_oleh: nama,
        diubah_at: kini,
      })
      .eq("id", id);
    if (error) return galat(error.message, 500);
    return NextResponse.json({ ok: true, disimpan_at: kini });
  }

  if (aksi === "ubah_status") {
    const st = String(b.status);
    if (!["draf", "final", "batal"].includes(st)) return galat("Status tidak valid.");
    const { error } = await db.from("kontrak_paket").update({ status: st, diubah_oleh: nama, diubah_at: kini }).eq("id", Number(b.id));
    if (error) return galat(error.message, 500);
    await catatAudit(db, akunId, "kontrak.ubah_status", { id: b.id, status: st });
    return NextResponse.json({ ok: true });
  }

  if (aksi === "simpan_master") {
    const tahun = Number(b.tahun);
    if (!tahun) return galat("Tahun wajib.");
    const data: Record<string, string> = {};
    for (const f of FIELD_MASTER) data[f.k] = String((b.data as Record<string, unknown>)?.[f.k] ?? "").trim();
    const { error } = await db.from("kontrak_master_tahun").upsert({ tahun, data, diubah_at: kini, diubah_oleh: nama });
    if (error) return galat(error.message, 500);
    await catatAudit(db, akunId, "kontrak.simpan_master", { tahun });
    return NextResponse.json({ ok: true });
  }

  if (aksi === "simpan_penyedia") {
    const p = (b.penyedia ?? {}) as Record<string, unknown>;
    const kolom = ["nama", "npwp", "alamat", "kota", "label_pimpinan", "nama_pimpinan", "nik", "nomor_rekening", "bank", "nama_rekening", "bidang"];
    const baris: Record<string, unknown> = { diubah_at: kini };
    for (const k of kolom) baris[k] = String(p[k] ?? "").trim() || null;
    if (!baris.nama) return galat("Nama penyedia wajib diisi.");
    if (p.aktif === false) baris.aktif = false;
    const q = p.id ? db.from("kontrak_penyedia").update(baris).eq("id", Number(p.id)).select("id").single() : db.from("kontrak_penyedia").insert(baris).select("id").single();
    const { data, error } = await q;
    if (error) return galat(error.message, 500);
    await catatAudit(db, akunId, "kontrak.simpan_penyedia", { id: data.id, nama: baris.nama, aktif: baris.aktif ?? true });
    return NextResponse.json({ ok: true, id: data.id });
  }

  return galat("Aksi tidak dikenal.");
}
