// lib/sigapKuisDb.ts
//
// (7 Okt 2026) SIGAP > Pelatihan > Kuis Live -- akses database & mesin ruang permainan (khusus server).
// Waktu SELALU dari jam server. Peralihan fase (soal -> jawaban) dilakukan "lazy" + idempoten saat ruang dibaca:
// update bersyarat (status & soal_ke), jadi aman walau banyak permintaan datang bersamaan.
// Beban: ~100 peserta polling tiap ~1,5 detik -> pembacaan ruang/soal di-cache di memori (500 ms - 20 detik) sehingga
// database hanya menerima beberapa kueri per detik. Jawaban peserta = satu insert per soal.

import type { Db } from "@/lib/sigap";
import type { Opsi } from "@/lib/sigapTes";
import { TOLERANSI_JAWAB_MS, hitungPoin, susunPeringkat, type SoalKuis, type StatusRuang } from "@/lib/sigapKuis";

export type RuangBaris = {
  id: number;
  kuis_id: number;
  kegiatan_id: number;
  status: StatusRuang;
  soal_ke: number;
  soal_mulai_at: string | null;
  soal_batas_at: string | null;
  versi: number;
  dibuka_at: string;
  selesai_at: string | null;
};
const KOLOM_RUANG = "id, kuis_id, kegiatan_id, status, soal_ke, soal_mulai_at, soal_batas_at, versi, dibuka_at, selesai_at";

// ---------------------------------------------------------------------------------------------
// Cache memori (per proses). Permintaan yang datang bersamaan berbagi satu kueri (promise yang sama).
// ---------------------------------------------------------------------------------------------
// disimpan di globalThis: satu cache untuk semua route handler (modul bisa terduplikasi antar bundle route / HMR)
const g = globalThis as { __sigapKuisCache?: Map<string, { t: number; p: Promise<unknown> }> };
const CACHE = (g.__sigapKuisCache ??= new Map<string, { t: number; p: Promise<unknown> }>());
export function dariCache<T>(kunci: string, ttlMs: number, ambil: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const e = CACHE.get(kunci);
  if (e && now - e.t < ttlMs) return e.p as Promise<T>;
  const p = ambil();
  CACHE.set(kunci, { t: now, p });
  p.catch(() => {
    if (CACHE.get(kunci)?.p === p) CACHE.delete(kunci);
  });
  if (CACHE.size > 800) for (const [k, v] of CACHE) if (now - v.t > 60_000) CACHE.delete(k);
  return p;
}
export function bersihkanCache(awalan: string) {
  for (const k of [...CACHE.keys()]) if (k.startsWith(awalan)) CACHE.delete(k);
}

// ---------------------------------------------------------------------------------------------
// Ruang, kuis, soal
// ---------------------------------------------------------------------------------------------
/** Ruang aktif milik kegiatan; bila tidak ada, ruang terakhir (agar podium/hasil tetap bisa dilihat). */
export function ruangTerkini(db: Db, kegiatanId: number): Promise<RuangBaris | null> {
  return dariCache(`ruang:${kegiatanId}`, 500, async () => {
    const { data: a } = await db.from("sigap_kuis_ruang").select(KOLOM_RUANG).eq("kegiatan_id", kegiatanId).neq("status", "selesai").maybeSingle();
    if (a) return a as RuangBaris;
    const { data: b } = await db.from("sigap_kuis_ruang").select(KOLOM_RUANG).eq("kegiatan_id", kegiatanId).order("id", { ascending: false }).limit(1).maybeSingle();
    return (b as RuangBaris | null) ?? null;
  });
}

export async function ruangById(db: Db, id: number): Promise<RuangBaris | null> {
  const { data } = await db.from("sigap_kuis_ruang").select(KOLOM_RUANG).eq("id", id).maybeSingle();
  return (data as RuangBaris | null) ?? null;
}

export function soalKuis(db: Db, kuisId: number): Promise<SoalKuis[]> {
  return dariCache(`soal:${kuisId}`, 20_000, async () => {
    const { data } = await db.from("sigap_kuis_soal").select("nomor, teks, opsi, kunci, detik").eq("kuis_id", kuisId).order("nomor");
    return ((data ?? []) as Record<string, unknown>[]).map((x) => ({
      nomor: Number(x.nomor),
      teks: String(x.teks),
      opsi: (Array.isArray(x.opsi) ? x.opsi : []) as Opsi[],
      kunci: String(x.kunci),
      bobot: 1,
      detik: Number(x.detik),
    }));
  });
}

export function infoKuis(db: Db, kuisId: number): Promise<{ id: number; judul: string }> {
  return dariCache(`kuis:${kuisId}`, 20_000, async () => {
    const { data } = await db.from("sigap_kuis").select("id, judul").eq("id", kuisId).maybeSingle();
    return { id: kuisId, judul: String(data?.judul ?? "Kuis") };
  });
}

// ---------------------------------------------------------------------------------------------
// Peserta, papan skor, sebaran
// ---------------------------------------------------------------------------------------------
export type PesertaRuang = { akun_id: number; nama: string };
export function daftarPeserta(db: Db, ruangId: number): Promise<PesertaRuang[]> {
  return dariCache(`peserta:${ruangId}`, 1000, async () => {
    const { data } = await db.from("sigap_kuis_peserta").select("akun_id").eq("ruang_id", ruangId).order("gabung_at").limit(2000);
    const ids = (data ?? []).map((x) => Number(x.akun_id));
    if (!ids.length) return [];
    const { data: a } = await db.from("sigap_akun").select("id, nama").in("id", ids).limit(2000);
    const nama = new Map((a ?? []).map((x) => [Number(x.id), String(x.nama)]));
    return ids.map((id) => ({ akun_id: id, nama: nama.get(id) ?? "Peserta" }));
  });
}

export type BarisPapan = { akun_id: number; nama: string; poin: number; benar: number; menjawab: number; rata_waktu_ms: number | null; peringkat: number };
/** Papan skor lengkap (terurut). Dikunci pada `versi` ruang: fase 'jawaban'/'selesai' tidak menerima jawaban baru. */
export function papanRuang(db: Db, ruangId: number, versi: number): Promise<BarisPapan[]> {
  return dariCache(`papan:${ruangId}:${versi}`, 20_000, async () => {
    const { data, error } = await db.rpc("sigap_kuis_papan", { p_ruang: ruangId });
    if (error) throw new Error(error.message);
    const nama = new Map((await daftarPeserta(db, ruangId)).map((p) => [p.akun_id, p.nama]));
    const baris = ((data ?? []) as Record<string, unknown>[]).map((x) => ({
      akun_id: Number(x.akun_id),
      nama: nama.get(Number(x.akun_id)) ?? "Peserta",
      poin: Number(x.poin),
      benar: Number(x.benar),
      menjawab: Number(x.menjawab),
      rata_waktu_ms: x.rata_waktu_ms == null ? null : Number(x.rata_waktu_ms),
    }));
    return susunPeringkat(baris);
  });
}

export type SebaranSoal = Record<number, { jumlah: Record<string, number>; benar: number; total: number }>;
export function sebaranRuang(db: Db, ruangId: number, versi: number): Promise<SebaranSoal> {
  return dariCache(`sebaran:${ruangId}:${versi}`, 20_000, async () => {
    const { data, error } = await db.rpc("sigap_kuis_per_soal", { p_ruang: ruangId });
    if (error) throw new Error(error.message);
    const out: SebaranSoal = {};
    for (const x of (data ?? []) as Record<string, unknown>[]) {
      const n = Number(x.nomor);
      const s = (out[n] ??= { jumlah: {}, benar: 0, total: 0 });
      s.jumlah[String(x.pilihan)] = Number(x.jumlah);
      s.benar += Number(x.jumlah_benar);
      s.total += Number(x.jumlah);
    }
    return out;
  });
}

async function jumlahMenjawab(db: Db, ruangId: number, nomor: number): Promise<number> {
  const { count } = await db.from("sigap_kuis_jawaban").select("akun_id", { count: "exact", head: true }).eq("ruang_id", ruangId).eq("nomor", nomor);
  return count ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Mesin ruang
// ---------------------------------------------------------------------------------------------
/** Peralihan otomatis soal -> jawaban (waktu habis + toleransi, atau semua sudah menjawab). Idempoten. */
export async function sinkronRuang(db: Db, ruang: RuangBaris, nowMs: number, semuaMenjawab = false): Promise<RuangBaris> {
  if (ruang.status !== "soal" || !ruang.soal_batas_at) return ruang;
  const habis = nowMs >= new Date(ruang.soal_batas_at).getTime() + TOLERANSI_JAWAB_MS;
  if (!habis && !semuaMenjawab) return ruang;
  const { data } = await db.from("sigap_kuis_ruang").update({ status: "jawaban", versi: ruang.versi + 1 }).eq("id", ruang.id).eq("status", "soal").eq("soal_ke", ruang.soal_ke).select(KOLOM_RUANG).maybeSingle();
  bersihkanCache("ruang:");
  if (data) return data as RuangBaris;
  return (await ruangById(db, ruang.id)) ?? ruang;
}

export type HasilLanjut = { ok: true; ruang: RuangBaris; berubah: boolean } | { ok: false; error: string; status: number };

/** Tombol "Lanjut" admin: lobi->soal 1, soal->jawaban, jawaban->soal berikut / selesai. `versiKlien` mencegah klik ganda melompati soal. */
export async function lanjutRuang(db: Db, ruangId: number, versiKlien: number | null, now: Date): Promise<HasilLanjut> {
  const r = await ruangById(db, ruangId);
  if (!r) return { ok: false, error: "Ruang tidak ditemukan.", status: 404 };
  if (r.status === "selesai") return { ok: false, error: "Kuis ini sudah selesai.", status: 409 };
  if (versiKlien !== null && versiKlien !== r.versi) return { ok: true, ruang: r, berubah: false }; // sudah berpindah (mis. waktu habis otomatis)
  const soal = await soalKuis(db, r.kuis_id);
  if (!soal.length) return { ok: false, error: "Kuis belum punya soal.", status: 409 };
  const versi = r.versi + 1;
  const mulaiSoal = (idx: number) => ({
    status: "soal" as const,
    soal_ke: idx + 1,
    soal_mulai_at: now.toISOString(),
    soal_batas_at: new Date(now.getTime() + soal[idx].detik * 1000).toISOString(),
    versi,
  });
  let upd: Record<string, unknown>;
  if (r.status === "lobi") upd = mulaiSoal(0);
  else if (r.status === "soal") upd = { status: "jawaban", versi };
  else if (r.soal_ke >= soal.length) upd = { status: "selesai", selesai_at: now.toISOString(), versi };
  else upd = mulaiSoal(r.soal_ke);
  const { data, error } = await db.from("sigap_kuis_ruang").update(upd).eq("id", r.id).eq("versi", r.versi).select(KOLOM_RUANG).maybeSingle();
  bersihkanCache("ruang:");
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data) return { ok: true, ruang: (await ruangById(db, r.id)) ?? r, berubah: false };
  return { ok: true, ruang: data as RuangBaris, berubah: true };
}

export async function akhiriRuang(db: Db, ruangId: number, now: Date): Promise<RuangBaris | null> {
  const r = await ruangById(db, ruangId);
  if (!r) return null;
  if (r.status === "selesai") return r;
  const { data } = await db.from("sigap_kuis_ruang").update({ status: "selesai", selesai_at: now.toISOString(), versi: r.versi + 1 }).eq("id", r.id).neq("status", "selesai").select(KOLOM_RUANG).maybeSingle();
  bersihkanCache("ruang:");
  return (data as RuangBaris | null) ?? (await ruangById(db, r.id));
}

export type HasilJawab = { ok: true; sudah?: boolean } | { ok: false; error: string; status: number };

/** Catat jawaban peserta (satu kali per soal). Waktu & poin dihitung server. */
export async function catatJawaban(db: Db, akunId: number, ruangId: number, nomor: number, pilihan: string, now: Date): Promise<HasilJawab> {
  const r = await ruangById(db, ruangId);
  if (!r) return { ok: false, error: "Ruang tidak ditemukan.", status: 404 };
  if (r.status !== "soal" || !r.soal_mulai_at || !r.soal_batas_at) return { ok: false, error: "Waktu menjawab soal ini sudah habis.", status: 409 };
  const soal = await soalKuis(db, r.kuis_id);
  const s = soal[r.soal_ke - 1];
  if (!s || s.nomor !== nomor) return { ok: false, error: "Soal sudah berganti.", status: 409 };
  const kode = String(pilihan ?? "").trim().toUpperCase();
  if (!s.opsi.some((o) => o.kode === kode)) return { ok: false, error: "Pilihan tidak valid.", status: 400 };
  const t = now.getTime();
  if (t > new Date(r.soal_batas_at).getTime() + TOLERANSI_JAWAB_MS) return { ok: false, error: "Waktu menjawab soal ini sudah habis.", status: 409 };
  const waktu = Math.min(s.detik * 1000, Math.max(0, t - new Date(r.soal_mulai_at).getTime()));
  const benar = kode === s.kunci;
  await db.from("sigap_kuis_peserta").upsert({ ruang_id: r.id, akun_id: akunId }, { onConflict: "ruang_id,akun_id", ignoreDuplicates: true });
  bersihkanCache(`peserta:${r.id}`); // daftar peserta berubah (gabung otomatis) -> hitungan "semua sudah menjawab" harus segar
  const { error } = await db.from("sigap_kuis_jawaban").insert({ ruang_id: r.id, akun_id: akunId, nomor, pilihan: kode, benar, waktu_ms: Math.round(waktu), poin: hitungPoin(benar, waktu, s.detik) });
  if (error) {
    if (error.code === "23505") return { ok: true, sudah: true };
    return { ok: false, error: error.message, status: 500 };
  }
  return { ok: true };
}

export async function gabungRuang(db: Db, akunId: number, ruang: RuangBaris): Promise<void> {
  await db.from("sigap_kuis_peserta").upsert({ ruang_id: ruang.id, akun_id: akunId }, { onConflict: "ruang_id,akun_id", ignoreDuplicates: true });
  bersihkanCache(`peserta:${ruang.id}`);
}

// ---------------------------------------------------------------------------------------------
// Keadaan utk layar admin (host) dan HP peserta
// ---------------------------------------------------------------------------------------------
const publik = (r: RuangBaris, total: number, judul: string) => ({ id: r.id, kuis_id: r.kuis_id, judul, status: r.status, soal_ke: r.soal_ke, total, versi: r.versi, mulai_at: r.soal_mulai_at, batas_at: r.soal_batas_at, dibuka_at: r.dibuka_at, selesai_at: r.selesai_at });

export async function keadaanHost(db: Db, ruang0: RuangBaris, now: Date) {
  const [soal, kuis, peserta] = await Promise.all([soalKuis(db, ruang0.kuis_id), infoKuis(db, ruang0.kuis_id), daftarPeserta(db, ruang0.id)]);
  let ruang = ruang0;
  let menjawab = 0;
  if (ruang.status === "soal") {
    const cur = soal[ruang.soal_ke - 1];
    if (cur) menjawab = await jumlahMenjawab(db, ruang.id, cur.nomor);
    ruang = await sinkronRuang(db, ruang, now.getTime(), peserta.length > 0 && menjawab >= peserta.length);
  }
  const cur = ruang.soal_ke > 0 ? soal[ruang.soal_ke - 1] : null;
  const tampilJawaban = ruang.status === "jawaban" || ruang.status === "selesai";
  const [papan, sebaran] = tampilJawaban ? await Promise.all([papanRuang(db, ruang.id, ruang.versi), sebaranRuang(db, ruang.id, ruang.versi)]) : [[], {} as SebaranSoal];
  return {
    sekarang: now.toISOString(),
    ruang: publik(ruang, soal.length, kuis.judul),
    soal: cur ? { nomor: cur.nomor, teks: cur.teks, opsi: cur.opsi, detik: cur.detik, kunci: ruang.status === "soal" ? null : cur.kunci } : null,
    jumlah_peserta: peserta.length,
    peserta: ruang.status === "lobi" ? peserta.map((p) => p.nama) : undefined,
    menjawab,
    sebaran: cur && tampilJawaban ? (sebaran[cur.nomor] ?? { jumlah: {}, benar: 0, total: 0 }) : null,
    papan: ruang.status === "selesai" ? papan.slice(0, 20) : papan.slice(0, 5),
    ada_soal_berikut: ruang.soal_ke < soal.length,
  };
}

export async function keadaanPeserta(db: Db, ruang0: RuangBaris, now: Date, akunId: number | null) {
  const [soal, kuis] = await Promise.all([soalKuis(db, ruang0.kuis_id), infoKuis(db, ruang0.kuis_id)]);
  const ruang = await sinkronRuang(db, ruang0, now.getTime(), false);
  const cur = ruang.soal_ke > 0 ? soal[ruang.soal_ke - 1] : null;
  const out: Record<string, unknown> = {
    sekarang: now.toISOString(),
    ruang: publik(ruang, soal.length, kuis.judul),
    soal: cur && (ruang.status === "soal" || ruang.status === "jawaban") ? { nomor: cur.nomor, teks: cur.teks, opsi: cur.opsi, detik: cur.detik, kunci: ruang.status === "jawaban" ? cur.kunci : null } : null,
  };
  if (akunId !== null) {
    const { data: g } = await db.from("sigap_kuis_peserta").select("akun_id").eq("ruang_id", ruang.id).eq("akun_id", akunId).maybeSingle();
    const saya: Record<string, unknown> = { gabung: !!g };
    if (cur && (ruang.status === "soal" || ruang.status === "jawaban")) {
      const { data: j } = await db.from("sigap_kuis_jawaban").select("pilihan, benar, poin, waktu_ms").eq("ruang_id", ruang.id).eq("akun_id", akunId).eq("nomor", cur.nomor).maybeSingle();
      saya.jawaban = j ? { pilihan: j.pilihan, benar: j.benar, poin: j.poin, waktu_ms: j.waktu_ms } : null;
    }
    if (ruang.status === "jawaban" || ruang.status === "selesai") {
      const papan = await papanRuang(db, ruang.id, ruang.versi);
      const aku = papan.find((p) => p.akun_id === akunId);
      saya.total_poin = aku?.poin ?? 0;
      saya.benar = aku?.benar ?? 0;
      saya.menjawab = aku?.menjawab ?? 0;
      saya.peringkat = aku?.peringkat ?? null;
      saya.jumlah_peserta = papan.length;
      out.papan = papan.slice(0, ruang.status === "selesai" ? 5 : 5).map((p) => ({ nama: p.nama, poin: p.poin, peringkat: p.peringkat }));
      if (ruang.status === "jawaban" && aku) {
        const di_atas = papan.filter((p) => p.poin > aku.poin).slice(-1)[0];
        saya.selisih_ke_atas = di_atas ? di_atas.poin - aku.poin : null;
      }
    }
    out.saya = saya;
  }
  return out;
}

/** Ringkasan untuk beranda peserta (langkah "Kuis Live"). */
export async function ringkasanKuisHub(db: Db, kegiatanId: number, akunId: number) {
  const [{ data: kuis }, ruang] = await Promise.all([db.from("sigap_kuis").select("id").eq("kegiatan_id", kegiatanId).eq("aktif", true), ruangTerkini(db, kegiatanId)]);
  const ids = (kuis ?? []).map((k) => Number(k.id));
  let adaSoal = false;
  if (ids.length) {
    const { data } = await db.from("sigap_kuis_soal").select("kuis_id").in("kuis_id", ids).limit(1);
    adaSoal = (data ?? []).length > 0;
  }
  if (!ruang && !adaSoal) return null;
  const aktif = !!ruang && ruang.status !== "selesai";
  let sudahGabung = false;
  let pernahIkut = false;
  let judul: string | null = null;
  if (ruang) {
    judul = (await infoKuis(db, ruang.kuis_id)).judul;
    const { data: g } = await db.from("sigap_kuis_peserta").select("ruang_id").eq("akun_id", akunId).limit(500);
    const ruangIds = (g ?? []).map((x) => Number(x.ruang_id));
    sudahGabung = aktif && ruangIds.includes(ruang.id);
    if (ruangIds.length) {
      const { data: s } = await db.from("sigap_kuis_ruang").select("id").in("id", ruangIds).eq("status", "selesai").eq("kegiatan_id", kegiatanId).limit(1);
      pernahIkut = (s ?? []).length > 0;
    }
  }
  return {
    ada_ruang_aktif: aktif,
    status: aktif ? ruang!.status : ruang ? "selesai" : null,
    judul,
    sudah_gabung: sudahGabung,
    pernah_ikut: pernahIkut,
    ada_ruang_selesai: !!ruang && (ruang.status === "selesai" || !aktif),
  };
}
