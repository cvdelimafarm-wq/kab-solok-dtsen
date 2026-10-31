// app/api/sigap/pengingat-push/route.ts
//
// (15 Okt 2026) Push TERJADWAL pengingat "yang belum dilengkapi" (foto/laporan/lembar/izin susulan Transport Lokal). Dipanggil CRON, bukan petugas.
// Aturan jadwal/dedup ada di lib/sigapPushJadwal.ts; isi pesan = isi kartu/modal (lib/sigapKekurangan.ts via kegiatanTranslok).
//
// (31 Okt 2026) MODE UTAMA: ?slot=auto -- SATU cron tiap 5 menit, jadwalnya diatur per kegiatan di Kelola Pendataan > 3 · Notifikasi
// (lib/pushPengaturan.ts, tabel sigap_push_pengaturan; tanpa pengaturan = bawaan 13.00 / 17.00 / 21.00 WIB):
//   POST /api/sigap/pengingat-push?slot=auto        cron "*/5 * * * *"     Header: Authorization: Bearer <SIGAP_CRON_SECRET>
//   tahap 1 (13.00) bila petugas belum punya 1 foto; tahap 2 (17.00) bila belum 4 foto; tahap 3 (21.00) bila hari ini belum lengkap.
//   HANYA petugas yang hari ini hari Translok-nya. Satu tahap per (tanggal, kegiatan) diklaim di sigap_push_klaim (cron tumpang tindih tidak menggandakan);
//   tiap proses mencatat denyut di sigap_push_denyut (kunci "pengingat") untuk kartu kesehatan di Kelola. &uji=1 = hanya menghitung (tidak mengklaim, tidak mengirim);
//   &uji=1&tahap=1|2|3 memaksa satu tahap di luar jamnya untuk melihat siapa yang AKAN diingatkan.
//   Perlu SQL skema-sql/fase-b/20261031d_push_pengaturan.sql; tanpa tabelnya tahap tidak dikerjakan (tidak ada kiriman ganda).
// MODE LAMA (?slot=pagi|siang|sore|malam, di bawah) tetap ada untuk uji manual, tetapi TIDAK mengikuti pengaturan Kelola; jangan dipasang bersama slot=auto.
//
// PEMANGGILAN MODE LAMA (Railway Cron, 4 kali sehari; jam cron UTC = WIB - 7):
//   POST /api/sigap/pengingat-push?slot=pagi    07.00 WIB  -> cron "0 0 * * *"
//   POST /api/sigap/pengingat-push?slot=siang   13.00 WIB  -> cron "0 6 * * *"
//   POST /api/sigap/pengingat-push?slot=sore    17.00 WIB  -> cron "0 10 * * *"
//   POST /api/sigap/pengingat-push?slot=malam   22.15 WIB  -> cron "15 15 * * *"
//   Header:  Authorization: Bearer <SIGAP_CRON_SECRET>      (variabel lingkungan di server; tanpa ini route menolak semua panggilan)
//   (31 Okt 2026) Slot siang (13.00) juga mengirim "belum mendata hari ini" bagi petugas yang hari ini hari kerjanya tetapi belum ada foto maupun isian
//   (aturan: lib/sigapBerandaKartu.ts pilihPeringatanPush; supervisor hanya pada hari ke-1,3,5,... periode). Pesan ini didahulukan di atas pengingat biasa.
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
import { JENIS_LOG_PUSH, MAKS_PUSH_PER_HARI, adalahSlotPush, awalHariWibIso, jamSenyap, pilihPushJadwal, slotDariJam, susunPesanPush, type RiwayatHariIni } from "@/lib/sigapPushJadwal";
import { pilihPeringatanPush } from "@/lib/sigapBerandaKartu"; // (31 Okt 2026) push 13.00: belum mendata hari ini
import { urlInternalAman } from "@/lib/sigapPushUtil";
import type { Db } from "@/lib/sigap";
import { bacaPengaturanSemua, catatDenyut, klaimTahap, selesaiKlaim } from "@/lib/portal/pushTerkelola";
import { bacaTranslok, kunciKlaimTranslok, tahapJatuhTempo, tanggalWib, type SetelanTranslok, type TahapTranslok } from "@/lib/pushPengaturan";
import { kunciKirimTranslok, putusanTranslok } from "@/lib/pushTranslok";

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

// ---------------------------------------------------------------------------------------------------------------- mode auto (31 Okt 2026)
async function jalankanAuto(db: Db, uji: boolean, mulai: number, paksaTahap: TahapTranslok | null) {
  const tanggal = tanggalWib(mulai);
  const hasil = { mode: "auto", tanggal, uji, kegiatan_jatuh_tempo: [] as { kegiatan_id: number; tahap: TahapTranslok }[], akun_diperiksa: 0, dikirim: 0, perangkat_terkirim: 0, gagal: 0, dilewati: {} as Record<string, number>, terpotong: false };
  if (jamSenyap(mulai)) {
    if (!uji) await catatDenyut(db, "pengingat", { ...hasil, dilewati: "jam senyap" });
    return NextResponse.json({ ok: true, ...hasil, jam_senyap: true });
  }
  try {
    // 1. kegiatan mana yang punya tahap jatuh tempo sekarang (pengaturan kegiatan bila ada, selain itu bawaan)
    const pengaturan = await bacaPengaturanSemua(db);
    const { data: kg } = await db.from("sigap_kegiatan").select("id").limit(500);
    const tugas = new Map<number, { tahap: TahapTranslok; setelan: SetelanTranslok }>();
    for (const k of kg ?? []) {
      const id = k.id as number;
      const setelan = bacaTranslok(pengaturan.get(id) ?? []);
      const tahap = paksaTahap && setelan.aktif ? paksaTahap : tahapJatuhTempo(setelan, mulai);
      if (!tahap) continue;
      if (!uji) {
        const klaim = await klaimTahap(db, tanggal, id, kunciKlaimTranslok(tahap), mulai);
        if (klaim !== "baru" && klaim !== "lanjut") continue;
      }
      tugas.set(id, { tahap, setelan });
      hasil.kegiatan_jatuh_tempo.push({ kegiatan_id: id, tahap });
    }
    if (tugas.size === 0) {
      if (!uji) await catatDenyut(db, "pengingat", hasil);
      return NextResponse.json({ ok: true, ...hasil });
    }

    // 2. akun yang punya perangkat aktif + riwayat kunci hari ini (cegah kembar bila klaim diambil alih)
    const { data: lang } = await db.from("sigap_push_langganan").select("akun_id").eq("aktif", true).limit(5000);
    const ids = Array.from(new Set((lang ?? []).map((x) => x.akun_id as number))).slice(0, MAKS_AKUN);
    const akunAktif: { id: number; nama: string; token: string }[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("sigap_akun").select("id, nama, token").in("id", ids.slice(i, i + 200)).eq("aktif", true);
      for (const a of data ?? []) if (a.token) akunAktif.push({ id: a.id as number, nama: a.nama as string, token: a.token as string });
    }
    const sudah = new Map<number, Set<string>>();
    const { data: log } = await db.from("sigap_push_log").select("oleh_akun_id, isi").eq("jenis", JENIS_LOG_PUSH).gte("dibuat_at", awalHariWibIso(mulai)).limit(20000);
    for (const r of log ?? []) {
      const id = r.oleh_akun_id as number | null;
      const isi = String(r.isi ?? "");
      if (id == null || !isi.startsWith(AWALAN_KUNCI)) continue;
      const set = sudah.get(id) ?? new Set<string>();
      set.add(isi.slice(AWALAN_KUNCI.length));
      sudah.set(id, set);
    }

    const waAdmin = normalisasiNomorWa(process.env.SIGAP_WA_ADMIN);
    const lewat = (alasan: string) => {
      hasil.dilewati[alasan] = (hasil.dilewati[alasan] ?? 0) + 1;
    };
    const rencana: { akun_id: number; kegiatan_id: number; tahap: number; judul: string }[] = [];

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
          const pen = await penugasanAkun(db, a.id);
          if (pen.length === 0) continue;
          const keg = await kegiatanTranslok(db, a.id, a.token, pen, Date.now(), { namaPetugas: a.nama, waAdmin });
          for (const k of keg) {
            const t = k.kegiatan_id !== undefined ? tugas.get(k.kegiatan_id) : undefined;
            if (!t || k.kegiatan_id === undefined) continue;
            const kunci = kunciKirimTranslok(t.tahap, tanggal, k.kegiatan_id);
            if (sudah.get(a.id)?.has(kunci)) {
              lewat("sudah_dikirim");
              continue;
            }
            const p = putusanTranslok({ tahap: t.tahap, setelan: t.setelan, hariIni: k.hariIni, kekurangan: k.kekurangan, nowMs: Date.now() });
            if (!p.kirim) {
              lewat(p.alasan);
              continue;
            }
            const pesan = susunPesanPush(p.kekurangan);
            if (uji) {
              rencana.push({ akun_id: a.id, kegiatan_id: k.kegiatan_id, tahap: t.tahap, judul: pesan.judul });
              hasil.dikirim++;
              continue;
            }
            const h = await kirimKeAkun(db, [a.id], { ...pesan, tag: "pengingat-translok" });
            if (h.terkirim > 0) {
              hasil.dikirim++;
              hasil.perangkat_terkirim += h.terkirim;
              await db.from("sigap_push_log").insert({
                kegiatan_id: k.kegiatan_id,
                oleh_akun_id: a.id,
                jenis: JENIS_LOG_PUSH,
                judul: pesan.judul,
                isi: `${AWALAN_KUNCI}${kunci}`,
                url: pesan.url,
                jumlah_akun: 1,
                jumlah_perangkat: h.perangkat,
                terkirim: h.terkirim,
                gagal: h.gagal,
              });
            } else {
              hasil.gagal++;
            }
          }
        } catch (e) {
          hasil.gagal++;
          console.error("[api/sigap/pengingat-push auto akun]", a.id, e);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALEL, Math.max(1, akunAktif.length)) }, pekerja));

    if (!uji) {
      if (!hasil.terpotong) for (const [id, t] of tugas) await selesaiKlaim(db, tanggal, id, kunciKlaimTranslok(t.tahap));
      await catatDenyut(db, "pengingat", hasil);
    }
    return NextResponse.json({ ok: true, ...hasil, ...(uji ? { rencana: rencana.slice(0, 100) } : {}) });
  } catch (err) {
    console.error("[api/sigap/pengingat-push auto]", err);
    return NextResponse.json({ error: "Gagal menjalankan pengingat terjadwal." }, { status: 500 });
  }
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
  if (sSlot === "auto") {
    // uji kering boleh memaksa satu tahap di luar jamnya: &uji=1&tahap=1|2|3 (tidak mengklaim, tidak mengirim)
    const t = Number(req.nextUrl.searchParams.get("tahap"));
    return jalankanAuto(db, uji, mulai, uji && (t === 1 || t === 2 || t === 3) ? t : null);
  }
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
          const riwayatAkun = riwayat.get(a.id) ?? { jumlah: 0, kunci: [] };
          // (31 Okt 2026) slot siang: peringatan "belum mendata hari ini" didahulukan (satu per kegiatan per hari, dalam batas kiriman harian)
          const peringatan = slot === "siang" && riwayatAkun.jumlah < MAKS_PUSH_PER_HARI ? pilihPeringatanPush(keg, Date.now(), new Set(riwayatAkun.kunci)) : null;
          if (semua.length === 0 && !peringatan) {
            hasil.tanpa_kekurangan++;
            continue;
          }
          const pilih = peringatan ? null : pilihPushJadwal(semua, slot, Date.now(), riwayatAkun);
          if (!pilih && !peringatan) {
            hasil.dilewati_batas_atau_kembar++;
            continue;
          }
          const pesan = peringatan ? { judul: peringatan.judul, isi: peringatan.isi, url: urlInternalAman(peringatan.url) ?? "/" } : susunPesanPush(pilih!);
          const kunciKirim = peringatan ? peringatan.kunci : kunciKekurangan(pilih!);
          const tagKirim = peringatan ? "pengingat-belum-mendata" : `pengingat-${pilih!.jenis}`;
          if (uji) {
            rencana.push({ akun_id: a.id, judul: pesan.judul, url: pesan.url });
            hasil.dikirim++;
            continue;
          }
          const h = await kirimKeAkun(db!, [a.id], { ...pesan, tag: tagKirim });
          if (h.terkirim > 0) {
            hasil.dikirim++;
            hasil.perangkat_terkirim += h.terkirim;
            await db!.from("sigap_push_log").insert({
              kegiatan_id: null,
              oleh_akun_id: a.id,
              jenis: JENIS_LOG_PUSH,
              judul: pesan.judul,
              isi: `${AWALAN_KUNCI}${kunciKirim}`,
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
