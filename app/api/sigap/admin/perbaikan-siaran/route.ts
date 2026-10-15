// app/api/sigap/admin/perbaikan-siaran/route.ts
//
// (15 Okt 2026) SIARAN "Perbaiki administrasi" Transport Lokal ke SELURUH petugas sebuah kegiatan -- permintaan user (pagi ini langsung, lewat modal + push).
// Tanpa migrasi dan tanpa menghapus data. Aturan murni: lib/sigapPerbaikan.ts (tanggalSiaran, pesanSiaran).
//
//   POST { kegiatan_id, mode: "uji" }     -> UJI KERING: daftar petugas dan tanggal yang AKAN diberi kesempatan. Tidak menulis apa pun, tidak mengirim apa pun.
//   POST { kegiatan_id, mode: "kirim" }   -> (1) menambah baris izin 24 jam (sigap_izin_susulan, alasan = ALASAN_SIARAN) untuk tanggal yang BELUM PERNAH diberi izin
//                                            (sekali per tanggal), (2) mengirim push ke perangkat petugas (lib/sigapPush.kirimKeAkun), (3) mencatat sigap_push_log + sigap_audit.
//   Aman dijalankan ulang: tanggal yang sudah diberi izin tidak diberi lagi; push hanya dikirim ke akun yang belum menerimanya dalam 24 jam terakhir.
// Yang dinilai: hari kerja lampau sampai `batas` (bawaan = kemarin) yang belum lengkap. Izin: menu translok.izin_susulan level kelola pada kegiatan itu.
// Modal pengingat di aplikasi petugas muncul dengan sendirinya (jenis "perbaikan" di susunKekurangan) begitu izin ada -- tidak perlu langkah lain.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { aturanDari, hariIniWib, penugasanAkun, tanggalValid, type Db } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun, sesiDariHeader } from "@/lib/sigapAkses";
import { muatMasukanTranslok } from "@/lib/portal/kegiatan";
import { kirimKeAkun, pushSiap } from "@/lib/sigapPush";
import { ALASAN_SIARAN, AUDIT_SIARAN, JENDELA_PERBAIKAN_JAM, hariSebelum, pesanSiaran, tanggalSiaran } from "@/lib/sigapPerbaikan";
import type { IsianHari } from "@/lib/sigapKekurangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JENIS_LOG = "perbaikan_siaran";
const PARALEL = 4;
const ANGGARAN_MS = 50_000;
const MAKS_PETUGAS = 400;

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

type Baris = {
  penugasan_id: number;
  akun_id: number;
  nama: string;
  peran: string;
  /** tanggal yang AKAN diberi izin baru */
  tanggal: string[];
  /** tanggal yang sudah punya izin siaran aktif (siaran sebelumnya, masih dalam 24 jam) */
  sudah_diberi: string[];
  perangkat: boolean;
  sudah_push: boolean;
};

export async function POST(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) as unknown as Db;
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { data: adm } = await db.from("sigap_akun").select("id, nama, aktif").eq("id", akunId).maybeSingle();
    if (!adm || !adm.aktif) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db, akunId);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const kegiatanId = Number(body?.kegiatan_id);
    const mode = body?.mode === "kirim" ? "kirim" : body?.mode === "uji" ? "uji" : "";
    if (!Number.isInteger(kegiatanId) || kegiatanId <= 0 || !mode) return galat("Isian tidak sah.");
    if (!boleh(izin, "translok.izin_susulan", "kelola", kegiatanId)) return galat("Tidak punya izin memberi izin susulan pada kegiatan ini.", 403);

    const hariIni = hariIniWib();
    const batas = typeof body?.batas === "string" && tanggalValid(body.batas) && body.batas < hariIni ? body.batas : hariSebelum(hariIni);
    const nowMs = Date.now();
    const kirim = mode === "kirim";
    if (kirim && !pushSiap()) return galat("Kunci VAPID belum dipasang di server, push tidak bisa dikirim. Pakai mode uji dulu atau pasang kunci VAPID.", 503);

    const { data: keg } = await db.from("sigap_kegiatan").select("id, nama, jenis, wajib_laporan, jumlah_foto").eq("id", kegiatanId).maybeSingle();
    if (!keg) return galat("Kegiatan tidak ditemukan.", 404);
    const aturan = aturanDari(keg);

    // petugas aktif kegiatan ini yang SPJ-nya belum dikunci
    const { data: pens } = await db.from("sigap_penugasan").select("id, akun_id, peran").eq("kegiatan_id", kegiatanId).eq("aktif", true).is("dikunci_at", null).limit(MAKS_PETUGAS + 1);
    const daftar = (pens ?? []) as { id: number; akun_id: number; peran: string }[];
    if (daftar.length > MAKS_PETUGAS) return galat(`Petugas lebih dari ${MAKS_PETUGAS}; siaran dibatalkan demi keamanan.`);
    const penIds = daftar.map((p) => p.id);
    const akunIds = Array.from(new Set(daftar.map((p) => p.akun_id)));
    if (daftar.length === 0) return NextResponse.json({ ok: true, mode, hari_ini: hariIni, batas, push_siap: pushSiap(), ringkas: ringkasKosong(), rows: [] });

    const akunInfo = new Map<number, { nama: string; token: string }>();
    const perangkat = new Set<number>();
    const sudahPush = new Set<number>();
    const pernahIzin = new Map<number, Set<string>>();
    const siaranAktif = new Map<number, string[]>();
    for (let i = 0; i < akunIds.length; i += 200) {
      const potong = akunIds.slice(i, i + 200);
      const [{ data: ak }, { data: lang }] = await Promise.all([
        db.from("sigap_akun").select("id, nama, token").in("id", potong).eq("aktif", true),
        db.from("sigap_push_langganan").select("akun_id").in("akun_id", potong).eq("aktif", true),
      ]);
      for (const a of ak ?? []) if (a.token) akunInfo.set(a.id as number, { nama: a.nama as string, token: a.token as string });
      for (const l of lang ?? []) perangkat.add(l.akun_id as number);
    }
    for (let i = 0; i < penIds.length; i += 200) {
      const { data: iz } = await db.from("sigap_izin_susulan").select("penugasan_id, tanggal, alasan, berlaku_sampai").in("penugasan_id", penIds.slice(i, i + 200)).limit(20000);
      for (const z of iz ?? []) {
        const pid = z.penugasan_id as number;
        const t = z.tanggal as string;
        (pernahIzin.get(pid) ?? pernahIzin.set(pid, new Set()).get(pid)!).add(t);
        if (z.alasan === ALASAN_SIARAN && Date.parse(z.berlaku_sampai as string) > nowMs) (siaranAktif.get(pid) ?? siaranAktif.set(pid, []).get(pid)!).push(t);
      }
    }
    {
      const { data: log } = await db
        .from("sigap_push_log")
        .select("oleh_akun_id")
        .eq("jenis", JENIS_LOG)
        .eq("kegiatan_id", kegiatanId)
        .gte("dibuat_at", new Date(nowMs - JENDELA_PERBAIKAN_JAM * 3_600_000).toISOString())
        .gt("terkirim", 0)
        .limit(5000);
      for (const l of log ?? []) if (l.oleh_akun_id != null) sudahPush.add(l.oleh_akun_id as number);
    }

    // ---- hitung tanggal per penugasan (paralel terbatas)
    const antrean = Array.from(new Set(daftar.map((p) => p.akun_id))).filter((id) => akunInfo.has(id));
    const rows: Baris[] = [];
    const hasil = { terpotong: false, gagal_hitung: 0, izin_ditulis: 0, akun_push_ok: 0, akun_push_gagal: 0, perangkat_terkirim: 0 };
    let n = 0;
    const mulai = Date.now();

    async function olahAkun(id: number) {
      const info = akunInfo.get(id)!;
      const pen = await penugasanAkun(db, id);
      const mereka = pen.filter((p) => p.kegiatan_id === kegiatanId && penIds.includes(p.id) && (p.status_periode === "aktif" || p.status_periode === "tenggang") && !p.dikunci_at);
      if (mereka.length === 0) return;
      const masukan = await muatMasukanTranslok(db, id, info.token, mereka, nowMs, { namaPetugas: info.nama });
      const barisAkun: Baris[] = [];
      for (const m of masukan) {
        const isian: Record<string, IsianHari> = {};
        for (const [t, v] of Object.entries(m.isian)) {
          isian[t] = { laporan: v.laporan, slot: v.slot ?? Array.from({ length: v.foto }, (_, i) => i + 1), dianggap: !!v.dianggap, hasilLembar: v.hasilLembar ?? null, jorong: v.jorong ?? null };
        }
        const tanggal = tanggalSiaran({ hariKerja: m.hariKerja, isian, aturan, pernahIzin: pernahIzin.get(m.p.id) ?? new Set(), hariIni, batas });
        const sudah = (siaranAktif.get(m.p.id) ?? []).filter((t) => !tanggal.includes(t)).sort();
        if (tanggal.length === 0 && sudah.length === 0) continue;
        barisAkun.push({ penugasan_id: m.p.id, akun_id: id, nama: info.nama, peran: m.p.peran, tanggal, sudah_diberi: sudah, perangkat: perangkat.has(id), sudah_push: sudahPush.has(id) });
      }
      if (barisAkun.length === 0) return;

      if (kirim) {
        const sampai = new Date(nowMs + JENDELA_PERBAIKAN_JAM * 3_600_000).toISOString();
        const alasan = ALASAN_SIARAN;
        for (const b of barisAkun) {
          if (b.tanggal.length === 0) continue;
          const kegId = kegiatanId;
          const { error } = await db.from("sigap_izin_susulan").insert(
            b.tanggal.map((t) => ({ penugasan_id: b.penugasan_id, kegiatan_id: kegId, tanggal: t, alasan, diberikan_oleh: `${adm!.nama as string} (#${akunId})`, diberikan_at: new Date(nowMs).toISOString(), berlaku_sampai: sampai }))
          );
          if (error) throw error;
          hasil.izin_ditulis += b.tanggal.length;
        }
        // push: satu pesan per akun (gabungan tanggal), hanya bila belum menerimanya dalam 24 jam terakhir
        if (!sudahPush.has(id) && perangkat.has(id)) {
          const semuaTgl = Array.from(new Set(barisAkun.flatMap((b) => [...b.tanggal, ...b.sudah_diberi]))).sort();
          const pesan = pesanSiaran(semuaTgl);
          const url = `/sigap/perbaikan?p=${barisAkun[0].penugasan_id}`;
          const h = await kirimKeAkun(db, [id], { ...pesan, url, tag: "perbaikan-administrasi" });
          if (h.terkirim > 0) {
            hasil.akun_push_ok++;
            hasil.perangkat_terkirim += h.terkirim;
            await db.from("sigap_push_log").insert({ kegiatan_id: kegiatanId, oleh_akun_id: id, jenis: JENIS_LOG, judul: pesan.judul, isi: pesan.isi, url, jumlah_akun: 1, jumlah_perangkat: h.perangkat, terkirim: h.terkirim, gagal: h.gagal });
          } else hasil.akun_push_gagal++;
        }
      }
      rows.push(...barisAkun);
    }

    await Promise.all(
      Array.from({ length: PARALEL }, async () => {
        while (n < antrean.length) {
          if (Date.now() - mulai > ANGGARAN_MS) {
            hasil.terpotong = true;
            return;
          }
          const id = antrean[n++];
          try {
            await olahAkun(id);
          } catch (e) {
            hasil.gagal_hitung++;
            console.error("[api/sigap/admin/perbaikan-siaran akun]", id, e);
          }
        }
      })
    );

    rows.sort((a, b) => a.nama.localeCompare(b.nama) || a.penugasan_id - b.penugasan_id);
    const ringkas = {
      petugas_aktif: akunIds.length,
      perlu: new Set(rows.filter((r) => r.tanggal.length > 0).map((r) => r.akun_id)).size,
      hari_total: rows.reduce((a, r) => a + r.tanggal.length, 0),
      tanpa_perangkat: new Set(rows.filter((r) => !r.perangkat).map((r) => r.akun_id)).size,
      sudah_diberi_sebelumnya: new Set(rows.filter((r) => r.sudah_diberi.length > 0).map((r) => r.akun_id)).size,
    };
    if (kirim) {
      await catatAudit(db, akunId, AUDIT_SIARAN, { kegiatan_id: kegiatanId, batas, ...ringkas, ...hasil, penugasan: rows.filter((r) => r.tanggal.length > 0).map((r) => ({ id: r.penugasan_id, tanggal: r.tanggal })) });
    }
    return NextResponse.json({ ok: true, mode, hari_ini: hariIni, batas, push_siap: pushSiap(), ringkas, rows, hasil: kirim ? hasil : null, terpotong: hasil.terpotong, gagal_hitung: hasil.gagal_hitung });
  } catch (err) {
    console.error("[api/sigap/admin/perbaikan-siaran]", err);
    return galat(err instanceof Error ? err.message : "Terjadi kesalahan tak terduga", 500);
  }
}

function ringkasKosong() {
  return { petugas_aktif: 0, perlu: 0, hari_total: 0, tanpa_perangkat: 0, sudah_diberi_sebelumnya: 0 };
}
