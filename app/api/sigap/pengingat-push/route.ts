// app/api/sigap/pengingat-push/route.ts
//
// (15 Okt 2026) Push TERJADWAL pengingat "yang belum dilengkapi" (foto/laporan/lembar/izin susulan Transport Lokal). Dipanggil CRON, bukan petugas.
// Aturan jadwal/dedup ada di lib/sigapPushJadwal.ts; isi pesan = isi kartu/modal (lib/sigapKekurangan.ts via kegiatanTranslok).
//
// PEMANGGILAN (Railway Cron, 4 kali sehari; jam cron UTC = WIB - 7):
//   POST /api/sigap/pengingat-push?slot=pagi    07.00 WIB  -> cron "0 0 * * *"
//   POST /api/sigap/pengingat-push?slot=siang   13.00 WIB  -> cron "0 6 * * *"
//   POST /api/sigap/pengingat-push?slot=sore    17.00 WIB  -> cron "0 10 * * *"
//   POST /api/sigap/pengingat-push?slot=malam   22.15 WIB  -> cron "15 15 * * *"
//   Header:  Authorization: Bearer <SIGAP_CRON_SECRET>      (variabel lingkungan di server; tanpa ini route menolak semua panggilan)
//   Uji kering (tidak mengirim, tidak mencatat): tambahkan &uji=1 -> daftar yang AKAN dikirim.
// Perlu juga VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (lib/sigapPush.ts). Tanpa migrasi: riwayat kiriman dicatat di sigap_push_log
//   (jenis = 'pengingat_terjadwal', oleh_akun_id = PENERIMA, kegiatan_id kosong, isi = "[kunci] kode|judul" untuk mencegah kiriman kembar hari itu).

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { penugasanAkun } from "@/lib/sigap";
import { dbPortal } from "@/lib/portal/server";
import { kegiatanTranslok } from "@/lib/portal/kegiatan";
import { kirimKeAkun, pushSiap } from "@/lib/sigapPush";
import { normalisasiNomorWa, type Kekurangan } from "@/lib/sigapKekurangan";
import { kunciKekurangan } from "@/lib/sigapPengingat";
import { JENIS_LOG_PUSH, adalahSlotPush, awalHariWibIso, jamSenyap, pilihPushJadwal, slotDariJam, susunPesanPush, type RiwayatHariIni } from "@/lib/sigapPushJadwal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAKS_AKUN = 600;
const PARALEL = 4;
const ANGGARAN_MS = 50_000;
const AWALAN_KUNCI = "[kunci] ";

function rahasiaBenar(req: NextRequest): boolean | "belum_diset" {
  const rahasia = process.env.SIGAP_CRON_SECRET;
  if (!rahasia || rahasia.length < 16) return "belum_diset";
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(rahasia);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function jalankan(req: NextRequest) {
  const auth = rahasiaBenar(req);
  if (auth === "belum_diset") return NextResponse.json({ error: "SIGAP_CRON_SECRET belum diset di server (minimal 16 karakter)." }, { status: 503 });
  if (!auth) return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const uji = req.nextUrl.searchParams.get("uji") === "1";
  if (!uji && !pushSiap()) return NextResponse.json({ error: "Kunci VAPID belum dipasang di server." }, { status: 503 });

  const mulai = Date.now();
  const sSlot = req.nextUrl.searchParams.get("slot");
  if (sSlot !== null && !adalahSlotPush(sSlot)) return NextResponse.json({ error: "slot harus pagi, siang, sore, atau malam." }, { status: 400 });
  const slot = sSlot !== null ? sSlot : slotDariJam(mulai);
  if (jamSenyap(mulai)) return NextResponse.json({ ok: true, slot, dilewati: "jam senyap (23.00-05.59 WIB)" });

  try {
    // akun yang punya perangkat aktif
    const { data: lang } = await db.from("sigap_push_langganan").select("akun_id").eq("aktif", true).limit(5000);
    const ids = Array.from(new Set((lang ?? []).map((x) => x.akun_id as number))).slice(0, MAKS_AKUN);
    const akunAktif: { id: number; nama: string; token: string }[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("sigap_akun").select("id, nama, token").in("id", ids.slice(i, i + 200)).eq("aktif", true);
      for (const a of data ?? []) if (a.token) akunAktif.push({ id: a.id as number, nama: a.nama as string, token: a.token as string });
    }

    // riwayat kiriman hari ini (WIB) per penerima
    const riwayat = new Map<number, RiwayatHariIni>();
    const { data: log } = await db.from("sigap_push_log").select("oleh_akun_id, isi").eq("jenis", JENIS_LOG_PUSH).gte("dibuat_at", awalHariWibIso(mulai)).gt("terkirim", 0).limit(20000);
    for (const r of log ?? []) {
      const id = r.oleh_akun_id as number | null;
      if (id == null) continue;
      const h = riwayat.get(id) ?? { jumlah: 0, kunci: [] };
      h.jumlah++;
      const isi = String(r.isi ?? "");
      if (isi.startsWith(AWALAN_KUNCI)) h.kunci.push(isi.slice(AWALAN_KUNCI.length));
      riwayat.set(id, h);
    }

    const waAdmin = normalisasiNomorWa(process.env.SIGAP_WA_ADMIN);
    const hasil = { slot, uji, akun_diperiksa: 0, tanpa_kekurangan: 0, dilewati_batas_atau_kembar: 0, dikirim: 0, perangkat_terkirim: 0, gagal: 0, terpotong: false };
    const rencana: { akun_id: number; judul: string; url: string }[] = [];

    let i = 0;
    async function pekerja() {
      while (i < akunAktif.length) {
        if (Date.now() - mulai > ANGGARAN_MS) {
          hasil.terpotong = true;
          return;
        }
        const a = akunAktif[i++];
        hasil.akun_diperiksa++;
        try {
          const pen = await penugasanAkun(db!, a.id);
          if (pen.length === 0) {
            hasil.tanpa_kekurangan++;
            continue;
          }
          const keg = await kegiatanTranslok(db!, a.id, a.token, pen, Date.now(), { namaPetugas: a.nama, waAdmin });
          const semua: Kekurangan[] = keg.flatMap((k) => k.kekurangan ?? []);
          if (semua.length === 0) {
            hasil.tanpa_kekurangan++;
            continue;
          }
          const pilih = pilihPushJadwal(semua, slot, Date.now(), riwayat.get(a.id) ?? { jumlah: 0, kunci: [] });
          if (!pilih) {
            hasil.dilewati_batas_atau_kembar++;
            continue;
          }
          const pesan = susunPesanPush(pilih);
          if (uji) {
            rencana.push({ akun_id: a.id, judul: pesan.judul, url: pesan.url });
            hasil.dikirim++;
            continue;
          }
          const h = await kirimKeAkun(db!, [a.id], { ...pesan, tag: `pengingat-${pilih.jenis}` });
          if (h.terkirim > 0) {
            hasil.dikirim++;
            hasil.perangkat_terkirim += h.terkirim;
            await db!.from("sigap_push_log").insert({
              kegiatan_id: null,
              oleh_akun_id: a.id,
              jenis: JENIS_LOG_PUSH,
              judul: pesan.judul,
              isi: `${AWALAN_KUNCI}${kunciKekurangan(pilih)}`,
              url: pesan.url,
              jumlah_akun: 1,
              jumlah_perangkat: h.perangkat,
              terkirim: h.terkirim,
              gagal: h.gagal,
            });
          } else {
            hasil.gagal++;
          }
        } catch (e) {
          hasil.gagal++;
          console.error("[api/sigap/pengingat-push akun]", a.id, e);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALEL, Math.max(1, akunAktif.length)) }, pekerja));
    return NextResponse.json({ ok: true, ...hasil, ...(uji ? { rencana: rencana.slice(0, 100) } : {}) });
  } catch (err) {
    console.error("[api/sigap/pengingat-push]", err);
    return NextResponse.json({ error: "Gagal menjalankan pengingat terjadwal." }, { status: 500 });
  }
}

export const POST = jalankan;
export const GET = jalankan;
