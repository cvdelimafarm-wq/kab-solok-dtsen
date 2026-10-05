// app/api/sigap/translok/[token]/route.ts
//
// (5 Okt 2026) SIGAP Transport Lokal -- halaman petugas, GENERIK utk semua kegiatan (permintaan user).
// Token = sigap_akun.token (didapat setelah masuk nama + PIN di /sigap/masuk).
//
// GET  -> { akun, hari_ini, penugasan:[{..., hari_kerja[], hari[], kelompok[], tanggal_kegiatan_lain[]}], lokasi_opsi, kecamatan_opsi }
// POST { aksi:"profil", alamat_kecamatan?, selesai_onboarding? }
// POST { aksi:"hari_kerja", penugasan_id, tanggal:[...] }   -> simpan rencana hari kerja (daftar lengkap)
// POST { aksi:"realisasi", penugasan_id, tanggal, lokasi[], jumlah_realisasi, kendala }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  BUCKET_SIGAP,
  JUMLAH_FOTO,
  akunDariToken,
  cekAksesIsian,
  hariIniWib,
  kelompokTanggal,
  penugasanAkun,
  rentangTanggal,
  tanggalValid,
} from "@/lib/sigap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

type Lokasi = { kecamatan: string; nagari: string; jorong: string; idsubsls?: string | null };

function samarkan(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, "");
  return t.length <= 8 ? t : `${t.slice(0, 4)}••••${t.slice(-4)}`;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const akun = await akunDariToken(db, token);
    if (!akun) return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 404 });
    const penugasan = await penugasanAkun(db, akun.id);
    if (penugasan.length === 0) return NextResponse.json({ error: "Anda belum ditugaskan pada kegiatan transport lokal mana pun. Hubungi admin anggaran / PJ kegiatan." }, { status: 403 });
    const ids = penugasan.map((p) => p.id);
    const hariIni = hariIniWib();

    const [{ data: hk }, { data: realisasi }, { data: foto }, { data: izin }] = await Promise.all([
      db.from("sigap_hari_kerja").select("penugasan_id, tanggal").eq("akun_id", akun.id),
      db.from("sigap_realisasi").select("penugasan_id, tanggal, lokasi, jumlah_realisasi, kendala, diperbarui_at").in("penugasan_id", ids),
      db.from("sigap_dokumentasi").select("penugasan_id, tanggal, slot, file_path, susulan, diunggah_at").in("penugasan_id", ids),
      db.from("sigap_izin_susulan").select("penugasan_id, tanggal, berlaku_sampai").in("penugasan_id", ids).gt("berlaku_sampai", new Date().toISOString()),
    ]);

    // URL bertanda tangan (1 jam) utk pratinjau foto.
    const paths = (foto ?? []).map((f) => f.file_path as string);
    const urlMap = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await db.storage.from(BUCKET_SIGAP).createSignedUrls(paths, 3600);
      for (const s of signed ?? []) if (s.path && s.signedUrl) urlMap.set(s.path, s.signedUrl);
    }

    const hasil = penugasan.map((p) => {
      const hariKerja = (hk ?? []).filter((h) => h.penugasan_id === p.id).map((h) => h.tanggal as string).sort();
      const lain = (hk ?? []).filter((h) => h.penugasan_id !== p.id).map((h) => h.tanggal as string);
      const hari = hariKerja.map((t) => {
        const r = (realisasi ?? []).find((x) => x.penugasan_id === p.id && x.tanggal === t) ?? null;
        const f = (foto ?? [])
          .filter((x) => x.penugasan_id === p.id && x.tanggal === t)
          .map((x) => ({ slot: x.slot as number, url: urlMap.get(x.file_path as string) ?? null, susulan: !!x.susulan, diunggah_at: x.diunggah_at as string }))
          .sort((a, b) => a.slot - b.slot);
        const iz = (izin ?? []).find((x) => x.penugasan_id === p.id && x.tanggal === t);
        const kunci = t === hariIni ? "hari_ini" : iz ? "izin" : t > hariIni ? "akan_datang" : "terlewat";
        const lengkap = !!r && f.length >= JUMLAH_FOTO;
        return { tanggal: t, realisasi: r, foto: f, kunci, lengkap, izin_sampai: (iz?.berlaku_sampai as string | undefined) ?? null };
      });
      // Hari dibayar: hari kerja yg belum lewat (masih bisa dilengkapi) + hari lampau yg lengkap / sedang izin susulan.
      const dibayar = hari.filter((h) => h.tanggal >= hariIni || h.lengkap || h.kunci === "izin").map((h) => h.tanggal);
      const kelompok = kelompokTanggal(dibayar).map((k) => ({ ...k, nominal: k.jumlah_hari * p.tarif }));
      return { ...p, hari_kerja: hariKerja, hari, kelompok, tanggal_kegiatan_lain: lain };
    });

    // Opsi lokasi: master wilayah kabupaten (kec > nagari > jorong), diambil per halaman (>1000 baris).
    const wil: { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string }[] = [];
    for (let i = 0; i < 5000; i += 1000) {
      const { data: hal } = await db.from("bencana_wilayah").select("idsubsls, kecamatan, nagari, sls, sub_sls").order("idsubsls").range(i, i + 999);
      wil.push(...((hal ?? []) as typeof wil));
      if (!hal || hal.length < 1000) break;
    }
    wil.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan) || a.nagari.localeCompare(b.nagari) || a.sls.localeCompare(b.sls));
    const master = new Map<string, { kecamatan: string; nagari: string; jorong: string }>();
    for (const w of wil) {
      const key = `${w.kecamatan}|${w.nagari}|${w.sls}`;
      if (!master.has(key)) master.set(key, { kecamatan: w.kecamatan, nagari: w.nagari, jorong: w.sls });
    }
    // Wilayah tim (khusus kegiatan Pascabencana, dari plotting bencana) -- pintasan pilihan lokasi.
    let subTim: { idsubsls: string; kecamatan: string; nagari: string; jorong: string; sub_sls: string }[] = [];
    if (akun.petugas_bencana_id && penugasan.some((p) => p.kegiatan.kode.startsWith("pascabencana"))) {
      const { data: pb } = await db.from("bencana_petugas").select("id, peran, atasan_id").eq("id", akun.petugas_bencana_id).maybeSingle();
      const pmlTim = pb ? (pb.peran === "pml" ? (pb.id as number) : ((pb.atasan_id as number | null) ?? null)) : null;
      if (pmlTim) {
        const { data: al } = await db.from("bencana_alokasi_subsls").select("idsubsls").eq("pml_id", pmlTim);
        const set = new Set((al ?? []).map((a) => a.idsubsls as string));
        subTim = wil.filter((w) => set.has(w.idsubsls)).map((w) => ({ idsubsls: w.idsubsls, kecamatan: w.kecamatan, nagari: w.nagari, jorong: w.sls, sub_sls: w.sub_sls }));
      }
    }

    return NextResponse.json({
      akun: {
        nama: akun.nama,
        jenis: akun.jenis,
        identitas: akun.jenis === "organik" ? { label: "NIP", nilai: samarkan(akun.nip) } : { label: "NIK", nilai: samarkan(akun.nik) },
        alamat_kecamatan: akun.alamat_kecamatan,
        onboarding_selesai: !!akun.onboarding_selesai_at,
      },
      hari_ini: hariIni,
      penugasan: hasil,
      lokasi_opsi: { wilayah_tim: subTim, master: Array.from(master.values()) },
      kecamatan_opsi: Array.from(new Set(wil.map((w) => w.kecamatan))).sort(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const body = await req.json().catch(() => null);
  try {
    const akun = await akunDariToken(db, token);
    if (!akun) return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk kembali." }, { status: 404 });
    const aksi = body?.aksi;

    // ---------------- Profil (kecamatan tempat tinggal) & tanda panduan selesai ----------------
    if (aksi === "profil") {
      const ubah: Record<string, unknown> = {};
      if (typeof body?.alamat_kecamatan === "string" && body.alamat_kecamatan.trim()) ubah.alamat_kecamatan = body.alamat_kecamatan.trim().slice(0, 100);
      if (body?.selesai_onboarding === true) ubah.onboarding_selesai_at = new Date().toISOString();
      if (Object.keys(ubah).length === 0) return NextResponse.json({ ok: true });
      const { error } = await db.from("sigap_akun").update(ubah).eq("id", akun.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ---------------- Rencana hari kerja ----------------
    if (aksi === "hari_kerja") {
      const penugasanId = Number(body?.penugasan_id);
      const pen = (await penugasanAkun(db, akun.id)).find((p) => p.id === penugasanId);
      if (!pen) return NextResponse.json({ error: "Anda tidak terdaftar pada kegiatan ini." }, { status: 403 });
      if (pen.dikunci_at) return NextResponse.json({ error: "SPJ kegiatan ini sudah diverifikasi & dikunci admin." }, { status: 403 });
      if (!pen.periode.mulai || !pen.periode.selesai) return NextResponse.json({ error: "Periode kegiatan belum ditetapkan admin anggaran." }, { status: 400 });
      const diminta = Array.from(new Set(((Array.isArray(body?.tanggal) ? body.tanggal : []) as unknown[]).filter(tanggalValid))).sort();
      const hariIni = hariIniWib();
      const periode = new Set(rentangTanggal(pen.periode.mulai, pen.periode.selesai));
      const luar = diminta.filter((t) => !periode.has(t));
      if (luar.length) return NextResponse.json({ error: `Tanggal di luar periode kegiatan: ${luar.join(", ")}.` }, { status: 400 });

      const { data: lama } = await db.from("sigap_hari_kerja").select("tanggal").eq("penugasan_id", pen.id);
      const lamaSet = new Set((lama ?? []).map((x) => x.tanggal as string));
      const mintaSet = new Set(diminta);
      const tambah = diminta.filter((t) => !lamaSet.has(t));
      const hapus = Array.from(lamaSet).filter((t) => !mintaSet.has(t));
      // Tanggal lewat terkunci (tidak bisa ditambah / dilepas).
      const lewat = [...tambah, ...hapus].filter((t) => t < hariIni);
      if (lewat.length) return NextResponse.json({ error: `Tanggal yang sudah lewat tidak bisa diubah: ${lewat.join(", ")}.` }, { status: 400 });
      if (pen.maks_hari && diminta.length > pen.maks_hari) return NextResponse.json({ error: `Melebihi maksimal ${pen.maks_hari} hari untuk peran Anda.` }, { status: 400 });
      // Hari yg sudah ada laporan/foto tidak bisa dilepas.
      if (hapus.length) {
        const [{ data: r }, { data: f }] = await Promise.all([
          db.from("sigap_realisasi").select("tanggal").eq("penugasan_id", pen.id).in("tanggal", hapus),
          db.from("sigap_dokumentasi").select("tanggal").eq("penugasan_id", pen.id).in("tanggal", hapus),
        ]);
        const terisi = Array.from(new Set([...(r ?? []), ...(f ?? [])].map((x) => x.tanggal as string)));
        if (terisi.length) return NextResponse.json({ error: `Tanggal yang sudah berisi laporan/foto tidak bisa dilepas: ${terisi.join(", ")}.` }, { status: 400 });
      }
      // 1 tanggal = 1 kegiatan.
      if (tambah.length) {
        const { data: bentrok } = await db.from("sigap_hari_kerja").select("tanggal").eq("akun_id", akun.id).neq("penugasan_id", pen.id).in("tanggal", tambah);
        if ((bentrok ?? []).length) return NextResponse.json({ error: `Tanggal sudah dipakai kegiatan lain: ${(bentrok ?? []).map((x) => x.tanggal).join(", ")}.` }, { status: 409 });
      }
      if (hapus.length) {
        const { error } = await db.from("sigap_hari_kerja").delete().eq("penugasan_id", pen.id).in("tanggal", hapus);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (tambah.length) {
        const { error } = await db.from("sigap_hari_kerja").insert(tambah.map((t) => ({ penugasan_id: pen.id, akun_id: akun.id, tanggal: t })));
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const log = [...tambah.map((t) => ({ t, aksi: "tambah" })), ...hapus.map((t) => ({ t, aksi: "hapus" }))];
      if (log.length) await db.from("sigap_hari_kerja_riwayat").insert(log.map((x) => ({ penugasan_id: pen.id, tanggal: x.t, aksi: x.aksi, oleh: `petugas:${akun.nama}` })));
      return NextResponse.json({ ok: true, ditambah: tambah.length, dilepas: hapus.length });
    }

    // ---------------- Laporan harian (realisasi manual) ----------------
    if (aksi === "realisasi") {
      const akses = await cekAksesIsian(db, akun.id, Number(body?.penugasan_id), body?.tanggal);
      if ("error" in akses) return NextResponse.json({ error: akses.error }, { status: akses.status });
      const lokasiRaw: unknown[] = Array.isArray(body?.lokasi) ? body.lokasi : [];
      const lokasi: Lokasi[] = lokasiRaw
        .map((l) => l as Record<string, unknown>)
        .filter((l) => typeof l?.kecamatan === "string" && typeof l?.nagari === "string" && typeof l?.jorong === "string")
        .map((l) => ({ kecamatan: String(l.kecamatan), nagari: String(l.nagari), jorong: String(l.jorong), idsubsls: typeof l.idsubsls === "string" ? l.idsubsls : null }))
        .slice(0, 10);
      if (lokasi.length === 0) return NextResponse.json({ error: "Pilih minimal 1 lokasi." }, { status: 400 });
      const jumlah = Number(body?.jumlah_realisasi);
      if (!Number.isInteger(jumlah) || jumlah < 0 || jumlah > 500) return NextResponse.json({ error: `Jumlah ${akses.penugasan.kegiatan.satuan_realisasi} tidak valid.` }, { status: 400 });
      const kendala = typeof body?.kendala === "string" ? body.kendala.trim().slice(0, 1000) : "";
      const { error } = await db.from("sigap_realisasi").upsert(
        {
          penugasan_id: akses.penugasan.id,
          kegiatan_id: akses.penugasan.kegiatan.id,
          tanggal: akses.tanggal,
          lokasi,
          jumlah_realisasi: jumlah,
          kendala: kendala || null,
          diperbarui_at: new Date().toISOString(),
        },
        { onConflict: "penugasan_id,tanggal" }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
