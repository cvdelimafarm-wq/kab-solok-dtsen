// app/api/portal/admin/route.ts
//
// (7 Okt 2026) Admin Aplikasi -- permintaan user: "di atas admin anggaran ada juga admin aplikasi, yang saat ini
// tetap m. iqbal hadi, namun bisa ditambahkan/dikelola, jadi ada juga admin delego, admin dtsen, dll" dan
// periode "tgl selesai kegiatan + 7, namun ini dapat diedit dari admin anggaran".
//
// Izin:
//  - portal.kelola (Admin Aplikasi)           : semua aksi.
//  - translok.kegiatan kelola (Admin Anggaran): aksi periode & buka ulang (sesuai lingkup kegiatan).
//
// GET  ?cari=<nama>                 -> { akun: [...] }   (pencarian akun utk ditunjuk admin)
// GET                               -> { boleh_admin, boleh_periode, admin_aplikasi[], aplikasi[], kegiatan[] }
// POST { aksi:"tambah_admin", peran_kode, akun_id }
// POST { aksi:"cabut_admin", akun_peran_id }
// POST { aksi:"periode", kegiatan_id, hari_tenggang }
// POST { aksi:"buka_ulang", kegiatan_id, sampai: "YYYY-MM-DD" | null }   (null = tutup kembali sesuai jadwal)
// POST { aksi:"tautan_aplikasi", kode, href }

import { NextRequest, NextResponse } from "next/server";
import { hariIniWib, tanggalValid } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { statusPeriode } from "@/lib/portal/periode";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function konteks(req: NextRequest) {
  const db = dbPortal();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const { izin } = await izinAkun(db, akun.id);
  const bolehAdmin = boleh(izin, "portal.kelola", "kelola");
  const bolehPeriode = (kegiatanId?: number | null) => bolehAdmin || boleh(izin, "translok.kegiatan", "kelola", kegiatanId ?? null);
  if (!bolehAdmin && !boleh(izin, "translok.kegiatan", "kelola")) return { err: galat("Halaman ini untuk Admin Aplikasi dan Admin Anggaran.", 403) } as const;
  return { db, akun, izin, bolehAdmin, bolehPeriode } as const;
}

export async function GET(req: NextRequest) {
  const k = await konteks(req);
  if ("err" in k) return k.err;
  const { db, bolehAdmin, bolehPeriode } = k;

  const cari = req.nextUrl.searchParams.get("cari");
  if (cari !== null) {
    if (!bolehAdmin) return galat("Hanya Admin Aplikasi.", 403);
    const q = cari.trim().replace(/[%_,()]/g, "");
    if (q.length < 2) return NextResponse.json({ akun: [] });
    const { data } = await db.from("sigap_akun").select("id, nama, jenis").eq("aktif", true).ilike("nama", `%${q}%`).order("jenis", { ascending: false }).order("nama").limit(20);
    return NextResponse.json({ akun: data ?? [] });
  }

  const [{ data: peran }, { data: apl }, { data: ap }, { data: keg }] = await Promise.all([
    db.from("sigap_peran").select("id, kode, nama"),
    db.from("portal_aplikasi").select("kode, nama, uraian, href, peran_admin, urutan, aktif").order("urutan"),
    db.from("sigap_akun_peran").select("id, akun_id, peran_id, kegiatan_id"),
    db.from("sigap_kegiatan").select("id, kode, nama, tanggal_mulai, tanggal_selesai, hari_tenggang, dibuka_sampai, aktif, periode_diubah_oleh, periode_diubah_at").order("id", { ascending: false }),
  ]);
  const akunIds = Array.from(new Set((ap ?? []).map((x) => x.akun_id as number)));
  const { data: akun } = akunIds.length ? await db.from("sigap_akun").select("id, nama").in("id", akunIds) : { data: [] as { id: number; nama: string }[] };
  const namaAkun = (id: number) => ((akun ?? []).find((a) => a.id === id)?.nama as string) ?? `Akun ${id}`;
  const idPeran = (kode: string) => (peran ?? []).find((p) => p.kode === kode)?.id as number | undefined;
  const pemegang = (kode: string) =>
    (ap ?? [])
      .filter((x) => x.peran_id === idPeran(kode) && x.kegiatan_id == null)
      .map((x) => ({ akun_peran_id: x.id as number, akun_id: x.akun_id as number, nama: namaAkun(x.akun_id as number) }));
  const pemegangKeg = (kode: string, kegId: number) =>
    (ap ?? []).filter((x) => x.peran_id === idPeran(kode) && (x.kegiatan_id === kegId || x.kegiatan_id == null)).map((x) => namaAkun(x.akun_id as number));

  const hariIni = hariIniWib();
  return NextResponse.json({
    boleh_admin: bolehAdmin,
    hari_ini: hariIni,
    admin_aplikasi: pemegang("admin_aplikasi"),
    aplikasi: (apl ?? []).map((a) => ({
      kode: a.kode,
      nama: a.nama,
      uraian: a.uraian,
      href: a.href,
      aktif: a.aktif,
      peran_admin: a.peran_admin,
      nama_peran: ((peran ?? []).find((p) => p.kode === a.peran_admin)?.nama as string) ?? a.peran_admin,
      admin: pemegang(a.peran_admin as string),
    })),
    kegiatan: (keg ?? [])
      .filter((x) => bolehPeriode(x.id as number))
      .map((x) => ({
        ...x,
        pj: pemegangKeg("pj_kegiatan", x.id as number).filter((n, i, arr) => arr.indexOf(n) === i),
        periode: statusPeriode(
          { tanggal_mulai: x.tanggal_mulai as string | null, tanggal_selesai: x.tanggal_selesai as string | null, hari_tenggang: x.hari_tenggang as number | null, dibuka_sampai: x.dibuka_sampai as string | null },
          hariIni
        ),
      })),
  });
}

export async function POST(req: NextRequest) {
  const k = await konteks(req);
  if ("err" in k) return k.err;
  const { db, akun, bolehAdmin, bolehPeriode } = k;
  const body = await req.json().catch(() => null);
  const aksi = body?.aksi as string | undefined;
  const oleh = akun.nama;
  const audit = (detail: Record<string, unknown>) => catatAudit(db, akun.id, `portal.${aksi}`, detail);

  try {
    if (aksi === "tambah_admin" || aksi === "cabut_admin" || aksi === "tautan_aplikasi") {
      if (!bolehAdmin) return galat("Hanya Admin Aplikasi.", 403);

      if (aksi === "tambah_admin") {
        const kode = String(body?.peran_kode ?? "");
        const akunId = Number(body?.akun_id);
        const { data: apl } = await db.from("portal_aplikasi").select("peran_admin");
        const sah = new Set(["admin_aplikasi", ...(apl ?? []).map((a) => a.peran_admin as string)]);
        if (!sah.has(kode)) return galat("Peran admin tidak dikenal.");
        const [{ data: p }, { data: a }] = await Promise.all([
          db.from("sigap_peran").select("id").eq("kode", kode).maybeSingle(),
          db.from("sigap_akun").select("id, nama, aktif").eq("id", akunId).maybeSingle(),
        ]);
        if (!p || !a || !a.aktif) return galat("Peran atau akun tidak ditemukan.", 404);
        const { count } = await db.from("sigap_akun_peran").select("id", { count: "exact", head: true }).eq("akun_id", akunId).eq("peran_id", p.id).is("kegiatan_id", null);
        if ((count ?? 0) > 0) return galat(`${a.nama} sudah memegang peran ini.`);
        const { error } = await db.from("sigap_akun_peran").insert({ akun_id: akunId, peran_id: p.id, kegiatan_id: null, diberi_oleh: oleh });
        if (error) return galat(error.message, 500);
        await audit({ akun_id: akunId, nama: a.nama, peran: kode });
        return NextResponse.json({ ok: true });
      }

      if (aksi === "cabut_admin") {
        const id = Number(body?.akun_peran_id);
        const { data: x } = await db.from("sigap_akun_peran").select("id, akun_id, peran_id").eq("id", id).maybeSingle();
        if (!x) return galat("Data tidak ditemukan.", 404);
        const { data: p } = await db.from("sigap_peran").select("kode").eq("id", x.peran_id).maybeSingle();
        const kode = (p?.kode as string) ?? "";
        const { data: apl } = await db.from("portal_aplikasi").select("peran_admin");
        if (kode !== "admin_aplikasi" && !(apl ?? []).some((a) => a.peran_admin === kode)) return galat("Bukan peran admin aplikasi.");
        if (kode === "admin_aplikasi" || kode === "admin_anggaran") {
          const { count } = await db.from("sigap_akun_peran").select("id", { count: "exact", head: true }).eq("peran_id", x.peran_id);
          if ((count ?? 0) <= 1) return galat(kode === "admin_aplikasi" ? "Admin Aplikasi minimal harus 1 orang." : "Admin anggaran terakhir tidak bisa dicabut.");
        }
        // Mencabut penunjukan peran (bukan menghapus akun/data). Tercatat di audit.
        const { error } = await db.from("sigap_akun_peran").delete().eq("id", id);
        if (error) return galat(error.message, 400);
        await audit({ akun_id: x.akun_id, peran: kode });
        return NextResponse.json({ ok: true });
      }

      if (aksi === "tautan_aplikasi") {
        const kode = String(body?.kode ?? "");
        const href = String(body?.href ?? "").trim();
        if (href && !(href.startsWith("/") || /^https:\/\//.test(href))) return galat("Tautan harus diawali / atau https://");
        const { error } = await db.from("portal_aplikasi").update({ href: href || null }).eq("kode", kode);
        if (error) return galat(error.message, 500);
        await audit({ kode, href: href || null });
        return NextResponse.json({ ok: true });
      }
    }

    if (aksi === "periode" || aksi === "buka_ulang") {
      const kegId = Number(body?.kegiatan_id);
      if (!kegId) return galat("Pilih kegiatan.");
      if (!bolehPeriode(kegId)) return galat("Tidak punya izin mengatur periode kegiatan ini.", 403);
      const isi: Record<string, unknown> = { periode_diubah_oleh: oleh, periode_diubah_at: new Date().toISOString() };
      if (aksi === "periode") {
        const n = Number(body?.hari_tenggang);
        if (!Number.isInteger(n) || n < 0 || n > 365) return galat("Masa tenggang 0 s.d. 365 hari.");
        isi.hari_tenggang = n;
      } else {
        const sampai = body?.sampai;
        if (sampai !== null && !tanggalValid(sampai)) return galat("Tanggal buka ulang tidak valid.");
        if (sampai && (sampai as string) < hariIniWib()) return galat("Tanggal buka ulang sudah lewat.");
        isi.dibuka_sampai = sampai ?? null;
      }
      const { data: lama } = await db.from("sigap_kegiatan").select("nama, hari_tenggang, dibuka_sampai").eq("id", kegId).maybeSingle();
      if (!lama) return galat("Kegiatan tidak ditemukan.", 404);
      const { error } = await db.from("sigap_kegiatan").update(isi).eq("id", kegId);
      if (error) return galat(error.message, 500);
      await audit({ kegiatan_id: kegId, kegiatan: lama.nama, sebelum: { hari_tenggang: lama.hari_tenggang, dibuka_sampai: lama.dibuka_sampai }, sesudah: isi });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (err) {
    return galat(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga", 500);
  }
}
