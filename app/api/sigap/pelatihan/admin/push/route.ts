// app/api/sigap/pelatihan/admin/push/route.ts
//
// (8 Okt 2026) SIGAP > Kelola Pelatihan > Notifikasi: panitia mengirim notifikasi push ke HP peserta (muncul walau aplikasi ditutup).
// Izin menu `pelatihan.kelola` (lihat = melihat daftar & riwayat; kelola = mengirim). Setiap pengiriman dicatat di sigap_push_log + sigap_audit.
// Tidak ada pengiriman otomatis: hanya saat panitia menekan Kirim.
//
// GET                                  -> { boleh_kelola, server_siap, hari, peserta: PesertaPush[], riwayat: RiwayatPush[] }
// POST { aksi:"kirim", akun_ids:[...], judul, isi, url? }  -> { ok, akun, tanpa_notifikasi, perangkat, terkirim, gagal }

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { hariIniWib } from "@/lib/sigap";
import { kirimKeAkun, pushSiap } from "@/lib/sigapPush";
import { MAKS_PENERIMA_PUSH, validasiPesanPush, type PesertaPush, type RiwayatPush, type StatusTesPush } from "@/lib/sigapPushUtil";
import { FILTER_BUKAN_ADMINISTRASI, akunDariRequest, dbAdmin, idKegiatanPelatihan, muatTesDaftar } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function siapkan(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariRequest(req, db);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const kegiatanId = await idKegiatanPelatihan(db);
  if (!kegiatanId) return { err: galat("Kegiatan pelatihan belum dibuat.", 404) } as const;
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return { err: galat("Tidak punya izin membuka menu ini.", 403) } as const;
  return { db, akun, kegiatanId, bisaKelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId) } as const;
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    const { db, kegiatanId } = p;
    const sekarang = Date.now();
    const hari = hariIniWib();
    const { data: pen } = await db.from("sigap_penugasan").select("akun_id, peran, kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(2000);
    const akunIds = [...new Set((pen ?? []).map((x) => x.akun_id as number))];
    const tesDaftar = await muatTesDaftar(db, kegiatanId);
    const idTes = new Map(tesDaftar.map((t) => [t.jenis as string, t.id as number]));
    const [{ data: ak }, { data: sesi }, { data: pres }, { data: sub }, { data: log }] = await Promise.all([
      akunIds.length ? db.from("sigap_akun").select("id, nama").in("id", akunIds).limit(2000) : Promise.resolve({ data: [] as { id: number; nama: string }[] }),
      akunIds.length ? db.from("sigap_tes_sesi").select("tes_id, akun_id, selesai_at, batas_at, percobaan, skor_terbaik").in("akun_id", akunIds).limit(5000) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      akunIds.length ? db.from("sigap_pelatihan_presensi").select("akun_id").eq("kegiatan_id", kegiatanId).eq("tanggal", hari).in("akun_id", akunIds).limit(5000) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      akunIds.length ? db.from("sigap_push_langganan").select("akun_id").eq("aktif", true).in("akun_id", akunIds).limit(5000) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      db.from("sigap_push_log").select("id, judul, isi, url, jumlah_akun, jumlah_perangkat, terkirim, gagal, dibuat_at, oleh_akun_id").eq("kegiatan_id", kegiatanId).order("dibuat_at", { ascending: false }).limit(20),
    ]);
    const nama = new Map((ak ?? []).map((a) => [a.id as number, String(a.nama ?? "")]));
    const jumlahNotif = new Map<number, number>();
    for (const s of sub ?? []) jumlahNotif.set(s.akun_id as number, (jumlahNotif.get(s.akun_id as number) ?? 0) + 1);
    const adaPresensi = new Set((pres ?? []).map((x) => x.akun_id as number));
    const statusTes = (akunId: number, jenis: string): StatusTesPush => {
      const id = idTes.get(jenis);
      const s = (sesi ?? []).find((x) => x.akun_id === akunId && x.tes_id === id);
      if (!s) return "belum";
      const selesai = !!s.selesai_at || new Date(String(s.batas_at)).getTime() <= sekarang || Number(s.percobaan ?? 1) > 1 || s.skor_terbaik != null;
      return selesai ? "selesai" : "mengerjakan";
    };
    const peserta: PesertaPush[] = (pen ?? [])
      .map((x) => ({
        akun_id: x.akun_id as number,
        nama: nama.get(x.akun_id as number) ?? "?",
        kelas: (x.kelas as number | null) ?? null,
        peran: String(x.peran),
        notif: jumlahNotif.get(x.akun_id as number) ?? 0,
        pretest: statusTes(x.akun_id as number, "pretest"),
        posttest: statusTes(x.akun_id as number, "posttest"),
        presensi_hari_ini: adaPresensi.has(x.akun_id as number),
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama));
    const olehIds = [...new Set((log ?? []).map((l) => l.oleh_akun_id as number | null).filter((x): x is number => !!x))];
    const { data: olehAk } = olehIds.length ? await db.from("sigap_akun").select("id, nama").in("id", olehIds) : { data: [] as { id: number; nama: string }[] };
    const olehNama = new Map((olehAk ?? []).map((a) => [a.id as number, String(a.nama ?? "")]));
    const riwayat: RiwayatPush[] = (log ?? []).map((l) => ({
      id: l.id as number,
      judul: String(l.judul),
      isi: String(l.isi),
      url: (l.url as string | null) ?? null,
      jumlah_akun: Number(l.jumlah_akun ?? 0),
      jumlah_perangkat: Number(l.jumlah_perangkat ?? 0),
      terkirim: Number(l.terkirim ?? 0),
      gagal: Number(l.gagal ?? 0),
      dibuat_at: String(l.dibuat_at),
      oleh: olehNama.get(l.oleh_akun_id as number) ?? null,
    }));
    return NextResponse.json({ boleh_kelola: p.bisaKelola, server_siap: pushSiap(), hari, sekarang: new Date(sekarang).toISOString(), peserta, riwayat });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin mengirim notifikasi pelatihan.", 403);
    const { db, akun, kegiatanId } = p;
    const body = await req.json().catch(() => null);
    if (String(body?.aksi ?? "") !== "kirim") return galat("Aksi tidak dikenal.");
    if (!pushSiap()) return galat("Pengiriman belum aktif: kunci VAPID belum dipasang di server (lihat catatan pemasangan).", 503);
    const v = validasiPesanPush(body);
    if (!v.ok) return galat(v.pesan, 422);
    const ids: unknown = body?.akun_ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((x) => !Number.isInteger(x) || x <= 0)) return galat("Pilih minimal satu penerima.");
    const unik = [...new Set(ids as number[])];
    if (unik.length > MAKS_PENERIMA_PUSH) return galat(`Maksimal ${MAKS_PENERIMA_PUSH} penerima sekali kirim.`);
    // hanya peserta aktif kegiatan ini (bukan peserta tambahan manual) yang boleh menerima
    const { data: sah } = await db.from("sigap_penugasan").select("akun_id").eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).in("akun_id", unik);
    const penerima = [...new Set((sah ?? []).map((x) => x.akun_id as number))];
    if (!penerima.length) return galat("Tidak ada penerima yang sah.", 422);
    const h = await kirimKeAkun(db, penerima, { ...v.nilai, tag: "panitia" });
    await db.from("sigap_push_log").insert({
      kegiatan_id: kegiatanId,
      oleh_akun_id: akun.id,
      jenis: "panitia",
      judul: v.nilai.judul,
      isi: v.nilai.isi,
      url: v.nilai.url,
      jumlah_akun: penerima.length,
      jumlah_perangkat: h.perangkat,
      terkirim: h.terkirim,
      gagal: h.gagal,
    });
    await catatAudit(db, akun.id, "pelatihan_push_kirim", { judul: v.nilai.judul, akun: penerima.length, perangkat: h.perangkat, terkirim: h.terkirim, gagal: h.gagal });
    return NextResponse.json({ ok: true, akun: penerima.length, tanpa_notifikasi: penerima.length - h.akun_berlangganan.length, perangkat: h.perangkat, terkirim: h.terkirim, gagal: h.gagal });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
