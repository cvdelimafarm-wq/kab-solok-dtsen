// app/api/sigap/pelatihan/admin/kehadiran/route.ts
//
// (7 Okt 2026) SIGAP > Kelola Pelatihan > Monitoring presensi & Transport Lokal + pengaturan titik presensi.
// Izin menu `pelatihan.kelola`: lihat = monitoring; kelola = pengaturan & presensi manual. Aksi tulis dicatat di sigap_audit.
//
// GET ?bagian=pengaturan              -> pengaturan presensi (titik, radius, jam, akurasi)
// GET ?bagian=presensi                -> peserta x status presensi (hadir / ditolak / belum) + statistik
// GET ?bagian=translok                -> peserta x foto Transport Lokal pada hari pelatihan
// GET ?bagian=foto&penugasan_id=N     -> foto (tautan sementara 1 jam) seorang peserta
// POST {aksi:"atur_presensi", lat, lng, radius_m, buka_at, tutup_at, akurasi_maks_m, tempat?}
// POST {aksi:"presensi_manual", akun_id, alasan}   -> panitia mencatat hadir (mis. GPS gagal)

import { NextRequest, NextResponse } from "next/server";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { UNDANGAN } from "@/lib/sigapTes";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, muatPengaturanPresensi, pesertaPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function bacaWaktu(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s.length === 16 ? `${s}:00` : s}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return galat("Tidak punya izin membuka menu ini.", 403);
    const bagian = req.nextUrl.searchParams.get("bagian") ?? "";
    const sekarang = new Date();

    if (bagian === "pengaturan") return NextResponse.json({ sekarang: sekarang.toISOString(), boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId), pengaturan: await muatPengaturanPresensi(db, kegiatanId) });

    // daftar peserta (penugasan aktif) + nama
    const { data: pen } = await db.from("sigap_penugasan").select("id, akun_id, peran, kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).limit(2000);
    const akunIds = (pen ?? []).map((p) => p.akun_id as number);
    const { data: ak } = akunIds.length ? await db.from("sigap_akun").select("id, nama").in("id", akunIds).limit(2000) : { data: [] as Record<string, unknown>[] };
    const nama = new Map((ak ?? []).map((a) => [a.id as number, a.nama as string]));
    const urut = <T extends { kelas: number | null; nama: string }>(a: T[]) => a.sort((x, y) => (x.kelas ?? 9) - (y.kelas ?? 9) || x.nama.localeCompare(y.nama));

    if (bagian === "presensi") {
      const { data: rows } = await db.from("sigap_pelatihan_presensi").select("akun_id, at, diterima, jarak_m, akurasi_m, manual, alasan, dicatat_oleh").eq("kegiatan_id", kegiatanId).order("at", { ascending: true }).limit(20000);
      const diterima = new Map<number, Record<string, unknown>>();
      const percobaan = new Map<number, Record<string, unknown>[]>();
      for (const r of rows ?? []) {
        const id = r.akun_id as number;
        if (r.diterima) diterima.set(id, r);
        else percobaan.set(id, [...(percobaan.get(id) ?? []), r]);
      }
      const peserta = urut(
        (pen ?? []).map((p) => {
          const id = p.akun_id as number;
          const d = diterima.get(id);
          const c = percobaan.get(id) ?? [];
          const terakhir = c[c.length - 1];
          return {
            akun_id: id,
            nama: nama.get(id) ?? "?",
            peran: p.peran as string,
            kelas: (p.kelas as number | null) ?? null,
            status: d ? "hadir" : c.length ? "ditolak" : "belum",
            at: (d?.at as string | undefined) ?? null,
            jarak_m: d?.jarak_m != null ? Number(d.jarak_m) : null,
            manual: !!d?.manual,
            alasan: (d?.alasan as string | undefined) ?? null,
            dicatat_oleh: (d?.dicatat_oleh as string | undefined) ?? null,
            percobaan: c.length,
            percobaan_terakhir_at: (terakhir?.at as string | undefined) ?? null,
            percobaan_jarak_m: terakhir?.jarak_m != null ? Number(terakhir.jarak_m) : null,
            percobaan_alasan: (terakhir?.alasan as string | undefined) ?? null,
          };
        })
      );
      const stat = { peserta: peserta.length, hadir: peserta.filter((p) => p.status === "hadir").length, ditolak: peserta.filter((p) => p.status === "ditolak").length, belum: peserta.filter((p) => p.status === "belum").length };
      return NextResponse.json({ sekarang: sekarang.toISOString(), boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId), pengaturan: await muatPengaturanPresensi(db, kegiatanId), stat, peserta });
    }

    if (bagian === "translok") {
      const { data: kg } = await db.from("sigap_kegiatan").select("jumlah_foto").eq("id", kegiatanId).maybeSingle();
      const total = Number(kg?.jumlah_foto) > 0 ? Number(kg?.jumlah_foto) : 5;
      const { data: fo } = await db.from("sigap_dokumentasi").select("penugasan_id, slot, diunggah_at").eq("kegiatan_id", kegiatanId).eq("tanggal", UNDANGAN.tanggal_iso).limit(20000);
      const per = new Map<number, { slot: Set<number>; terakhir: string }>();
      for (const f of fo ?? []) {
        const id = f.penugasan_id as number;
        const e = per.get(id) ?? { slot: new Set<number>(), terakhir: "" };
        e.slot.add(f.slot as number);
        if ((f.diunggah_at as string) > e.terakhir) e.terakhir = f.diunggah_at as string;
        per.set(id, e);
      }
      const peserta = urut(
        (pen ?? []).map((p) => {
          const e = per.get(p.id as number);
          return {
            akun_id: p.akun_id as number,
            penugasan_id: p.id as number,
            nama: nama.get(p.akun_id as number) ?? "?",
            peran: p.peran as string,
            kelas: (p.kelas as number | null) ?? null,
            slot: e ? [...e.slot].filter((s) => s >= 1 && s <= total).sort((a, b) => a - b) : [],
            terakhir_at: e?.terakhir || null,
          };
        })
      );
      const lengkap = peserta.filter((p) => p.slot.length >= total).length;
      const belum = peserta.filter((p) => p.slot.length === 0).length;
      return NextResponse.json({ sekarang: sekarang.toISOString(), tanggal: UNDANGAN.tanggal_iso, foto_total: total, stat: { peserta: peserta.length, lengkap, sebagian: peserta.length - lengkap - belum, belum }, peserta });
    }

    if (bagian === "foto") {
      const penugasanId = Number(req.nextUrl.searchParams.get("penugasan_id"));
      const ok = pen?.some((p) => p.id === penugasanId);
      if (!ok) return galat("Penugasan tidak ditemukan.", 404);
      const { data: fo } = await db.from("sigap_dokumentasi").select("slot, file_path, diunggah_at, susulan").eq("kegiatan_id", kegiatanId).eq("penugasan_id", penugasanId).eq("tanggal", UNDANGAN.tanggal_iso).order("slot");
      const foto = [];
      for (const f of fo ?? []) {
        const { data: s } = await db.storage.from(BUCKET_SIGAP).createSignedUrl(String(f.file_path), 3600);
        foto.push({ slot: f.slot as number, url: s?.signedUrl ?? null, diunggah_at: f.diunggah_at as string, susulan: !!f.susulan });
      }
      return NextResponse.json({ foto });
    }

    return galat("Bagian tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const body = await req.json().catch(() => null);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return galat("Tidak punya izin mengelola presensi pelatihan.", 403);
    const aksi = String(body?.aksi ?? "");

    if (aksi === "atur_presensi") {
      const lat = Number(body?.lat);
      const lng = Number(body?.lng);
      const radius = Number(body?.radius_m);
      const akurasi = Number(body?.akurasi_maks_m);
      const buka = bacaWaktu(body?.buka_at);
      const tutup = bacaWaktu(body?.tutup_at);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) return galat("Lintang (latitude) harus -90 s.d. 90.");
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) return galat("Bujur (longitude) harus -180 s.d. 180.");
      if (!Number.isInteger(radius) || radius < 10 || radius > 5000) return galat("Radius harus 10–5000 meter.");
      if (!Number.isInteger(akurasi) || akurasi < 10 || akurasi > 1000) return galat("Akurasi GPS maksimal harus 10–1000 meter.");
      if (!buka || !tutup) return galat("Jam buka/tutup presensi tidak valid.");
      if (tutup.getTime() <= buka.getTime()) return galat("Jam tutup harus setelah jam buka.");
      const sebelum = await muatPengaturanPresensi(db, kegiatanId);
      const baris = {
        kegiatan_id: kegiatanId,
        presensi_lat: lat,
        presensi_lng: lng,
        presensi_radius_m: radius,
        presensi_buka_at: buka.toISOString(),
        presensi_tutup_at: tutup.toISOString(),
        akurasi_maks_m: akurasi,
        tempat: typeof body?.tempat === "string" && body.tempat.trim() ? body.tempat.trim().slice(0, 120) : sebelum?.tempat ?? null,
        diubah_at: new Date().toISOString(),
      };
      const { error } = await db.from("sigap_pelatihan_pengaturan").upsert(baris, { onConflict: "kegiatan_id" });
      if (error) return galat(error.message, 500);
      await catatAudit(db, akun.id, "pelatihan_atur_presensi", { sebelum, sesudah: baris });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "presensi_manual") {
      const akunId = Number(body?.akun_id);
      const alasan = String(body?.alasan ?? "").trim();
      if (alasan.length < 5) return galat("Alasan wajib diisi (minimal 5 huruf).");
      const peserta = await pesertaPelatihan(db, akunId, kegiatanId);
      if (!peserta) return galat("Peserta tidak ditemukan.", 404);
      const { error } = await db.from("sigap_pelatihan_presensi").insert({
        kegiatan_id: kegiatanId,
        akun_id: akunId,
        penugasan_id: peserta.penugasan_id,
        at: new Date().toISOString(),
        diterima: true,
        manual: true,
        alasan: alasan.slice(0, 300),
        dicatat_oleh: `${akun.nama} (#${akun.id})`,
      });
      if (error) return galat(error.code === "23505" ? "Peserta ini sudah tercatat hadir." : error.message, error.code === "23505" ? 409 : 500);
      await catatAudit(db, akun.id, "pelatihan_presensi_manual", { akun_id: akunId, alasan });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
