// lib/sigapKuisDb.ts
//
// (7-8 Okt 2026) SIGAP > Pelatihan > Adu Sigap -- akses database & mesin ruang permainan (khusus server).
// Satu ruang per (kegiatan, kelas); keempat kelas boleh berjalan paralel.
// Waktu SELALU dari jam server. Peralihan fase (soal -> jawaban -> soal berikut / selesai, mulai terjadwal) dilakukan
// "lazy" + idempoten saat ruang dibaca: update bersyarat pada `versi`, jadi aman walau banyak permintaan bersamaan.
// Beban: ~100 peserta polling tiap ~1,5 detik -> pembacaan ruang/soal di-cache di memori (500 ms - 20 detik) sehingga
// database hanya menerima beberapa kueri per detik. Jawaban peserta = satu insert per soal.

import type { Db } from "@/lib/sigap";
import type { Opsi } from "@/lib/sigapTes";
import {
  KELAS_GABUNGAN,
  KELAS_PILIHAN,
  labelKelas,
  PENGATURAN_DEFAULT,
  TOLERANSI_JAWAB_MS,
  bangunSoalMain,
  detikSoal,
  hitungPoin,
  namaTampil,
  normalisasiPengaturan,
  pilihSoalMerata,
  rngBenih,
  susunPeringkat,
  type Pengaturan,
  type SoalKuis,
  type SoalMain,
  type StatusRuang,
} from "@/lib/sigapKuis";

export type RuangBaris = {
  id: number;
  kuis_id: number;
  kegiatan_id: number;
  kelas: number;
  status: StatusRuang;
  soal_ke: number;
  soal_mulai_at: string | null;
  soal_batas_at: string | null;
  versi: number;
  dibuka_at: string;
  selesai_at: string | null;
  pengaturan: Pengaturan;
  soal_main: SoalMain[] | null;
  dijeda: boolean;
  dijeda_sisa_ms: number | null;
  lanjut_at: string | null;
  jadwal_at: string | null;
};
const KOLOM_RUANG = "id, kuis_id, kegiatan_id, kelas, status, soal_ke, soal_mulai_at, soal_batas_at, versi, dibuka_at, selesai_at, pengaturan, soal_main, dijeda, dijeda_sisa_ms, lanjut_at, jadwal_at";

function olahRuang(x: Record<string, unknown>): RuangBaris {
  return {
    id: Number(x.id),
    kuis_id: Number(x.kuis_id),
    kegiatan_id: Number(x.kegiatan_id),
    kelas: Number(x.kelas),
    status: x.status as StatusRuang,
    soal_ke: Number(x.soal_ke ?? 0),
    soal_mulai_at: (x.soal_mulai_at as string | null) ?? null,
    soal_batas_at: (x.soal_batas_at as string | null) ?? null,
    versi: Number(x.versi ?? 0),
    dibuka_at: String(x.dibuka_at),
    selesai_at: (x.selesai_at as string | null) ?? null,
    pengaturan: normalisasiPengaturan(x.pengaturan),
    soal_main: Array.isArray(x.soal_main) ? (x.soal_main as SoalMain[]) : null,
    dijeda: !!x.dijeda,
    dijeda_sisa_ms: x.dijeda_sisa_ms == null ? null : Number(x.dijeda_sisa_ms),
    lanjut_at: (x.lanjut_at as string | null) ?? null,
    jadwal_at: (x.jadwal_at as string | null) ?? null,
  };
}

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
/** Ruang aktif milik (kegiatan, kelas); bila tidak ada, ruang terakhir (agar podium/hasil tetap bisa dilihat). */
export function ruangKelas(db: Db, kegiatanId: number, kelas: number): Promise<RuangBaris | null> {
  return dariCache(`ruang:${kegiatanId}:${kelas}`, 500, async () => {
    const { data: a } = await db.from("sigap_kuis_ruang").select(KOLOM_RUANG).eq("kegiatan_id", kegiatanId).eq("kelas", kelas).neq("status", "selesai").maybeSingle();
    if (a) return olahRuang(a as Record<string, unknown>);
    const { data: b } = await db.from("sigap_kuis_ruang").select(KOLOM_RUANG).eq("kegiatan_id", kegiatanId).eq("kelas", kelas).order("id", { ascending: false }).limit(1).maybeSingle();
    return b ? olahRuang(b as Record<string, unknown>) : null;
  });
}

/** Ruang terkini tiap kelas (aktif didahulukan, bila tidak ada: yang terakhir). */
export function ruangSemuaKelas(db: Db, kegiatanId: number): Promise<Map<number, RuangBaris>> {
  return dariCache(`ruang:${kegiatanId}:semua`, 500, async () => {
    const { data } = await db.from("sigap_kuis_ruang").select(KOLOM_RUANG).eq("kegiatan_id", kegiatanId).order("id", { ascending: false }).limit(60);
    const out = new Map<number, RuangBaris>();
    for (const x of (data ?? []) as Record<string, unknown>[]) {
      const r = olahRuang(x);
      const ada = out.get(r.kelas);
      if (!ada || (ada.status === "selesai" && r.status !== "selesai")) out.set(r.kelas, r);
    }
    return out;
  });
}

export async function ruangById(db: Db, id: number): Promise<RuangBaris | null> {
  const { data } = await db.from("sigap_kuis_ruang").select(KOLOM_RUANG).eq("id", id).maybeSingle();
  return data ? olahRuang(data as Record<string, unknown>) : null;
}

export function soalKuis(db: Db, kuisId: number): Promise<SoalKuis[]> {
  return dariCache(`soal:${kuisId}`, 20_000, async () => {
    const { data } = await db.from("sigap_kuis_soal").select("nomor, teks, opsi, kunci, detik, topik, penjelasan").eq("kuis_id", kuisId).order("nomor");
    return ((data ?? []) as Record<string, unknown>[]).map((x) => ({
      nomor: Number(x.nomor),
      teks: String(x.teks),
      opsi: (Array.isArray(x.opsi) ? x.opsi : []) as Opsi[],
      kunci: String(x.kunci),
      bobot: 1,
      detik: Number(x.detik),
      topik: (x.topik as string | null) ?? null,
      penjelasan: (x.penjelasan as string | null) ?? null,
    }));
  });
}

export function infoKuis(db: Db, kuisId: number): Promise<{ id: number; judul: string }> {
  return dariCache(`kuis:${kuisId}`, 20_000, async () => {
    const { data } = await db.from("sigap_kuis").select("id, judul").eq("id", kuisId).maybeSingle();
    return { id: kuisId, judul: String(data?.judul ?? "Kuis") };
  });
}

/** Soal yang benar-benar dimainkan ruang ini (urutan + urutan opsi sesuai snapshot). */
export type SoalMainLengkap = {
  idx: number; // 0-based
  nomor: number;
  teks: string;
  opsi: Opsi[]; // sudah dalam urutan tampil
  kunci: string;
  detik: number; // waktu efektif
  topik: string | null;
  penjelasan: string | null;
};
export async function soalMainRuang(db: Db, ruang: RuangBaris): Promise<SoalMainLengkap[]> {
  const bank = await soalKuis(db, ruang.kuis_id);
  const peta = new Map(bank.map((s) => [s.nomor, s]));
  const main: SoalMain[] = ruang.soal_main ?? bank.map((s) => ({ n: s.nomor, o: s.opsi.map((o) => o.kode) }));
  const out: SoalMainLengkap[] = [];
  for (const m of main) {
    const s = peta.get(m.n);
    if (!s) continue;
    const opsi = m.o.map((k) => s.opsi.find((o) => o.kode === k)).filter((o): o is Opsi => !!o);
    out.push({ idx: out.length, nomor: s.nomor, teks: s.teks, opsi, kunci: s.kunci, detik: detikSoal(s, ruang.pengaturan), topik: s.topik, penjelasan: s.penjelasan });
  }
  return out;
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
async function hitungPapan(db: Db, ruangId: number): Promise<BarisPapan[]> {
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
}
/** Papan skor lengkap (terurut). Dikunci pada `versi` ruang: fase 'jawaban'/'selesai' tidak menerima jawaban baru. */
export function papanRuang(db: Db, ruangId: number, versi: number): Promise<BarisPapan[]> {
  return dariCache(`papan:${ruangId}:${versi}`, 20_000, () => hitungPapan(db, ruangId));
}
/** Papan skor "live" (admin/proyektor): segar tiap ~2 detik, juga saat soal sedang dijawab. */
export function papanLive(db: Db, ruangId: number): Promise<BarisPapan[]> {
  return dariCache(`papanlive:${ruangId}`, 2000, () => hitungPapan(db, ruangId));
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
// Pengaturan & pilihan soal per kelas
// ---------------------------------------------------------------------------------------------
export type KelasKonfig = { kegiatan_id: number; kelas: number; kuis_id: number | null; pengaturan: Pengaturan; soal_pilihan: number[]; diubah_at: string | null };

function olahKonfig(kegiatanId: number, kelas: number, x: Record<string, unknown> | null): KelasKonfig {
  return {
    kegiatan_id: kegiatanId,
    kelas,
    kuis_id: x?.kuis_id == null ? null : Number(x.kuis_id),
    pengaturan: normalisasiPengaturan(x?.pengaturan ?? PENGATURAN_DEFAULT),
    soal_pilihan: Array.isArray(x?.soal_pilihan) ? (x!.soal_pilihan as unknown[]).map(Number).filter((n) => Number.isInteger(n)) : [],
    diubah_at: (x?.diubah_at as string | null) ?? null,
  };
}

export async function konfigKelasSemua(db: Db, kegiatanId: number): Promise<KelasKonfig[]> {
  const { data } = await db.from("sigap_kuis_kelas").select("kelas, kuis_id, pengaturan, soal_pilihan, diubah_at").eq("kegiatan_id", kegiatanId).limit(20);
  const peta = new Map(((data ?? []) as Record<string, unknown>[]).map((x) => [Number(x.kelas), x]));
  return KELAS_PILIHAN.map((k) => olahKonfig(kegiatanId, k, peta.get(k) ?? null)); // (8 Okt 2026) + kelas 0 = Semua Kelas
}

/** Nomor soal (pada kuis `kuisId`) yang sudah dipilih kelas LAIN. */
export function dipakaiKelasLain(semua: KelasKonfig[], kelas: number, kuisId: number | null): Map<number, number[]> {
  const peta = new Map<number, number[]>();
  for (const k of semua) {
    if (k.kelas === kelas || kuisId === null || k.kuis_id !== kuisId) continue;
    for (const n of k.soal_pilihan) (peta.get(n) ?? peta.set(n, []).get(n)!).push(k.kelas);
  }
  return peta;
}

/** Pilih ulang soal acak-merata utk satu kelas (tidak menyimpan). */
export async function acakSoalKelas(db: Db, semua: KelasKonfig[], kelas: number, kuisId: number, p: Pengaturan, benih = Date.now()): Promise<number[]> {
  const bank = await soalKuis(db, kuisId);
  const hindari = new Set(dipakaiKelasLain(semua, kelas, kuisId).keys());
  return pilihSoalMerata(bank, p.jumlah, hindari, p.dahulukan_belum_dipakai, rngBenih(benih));
}

export type HasilSimpan = { ok: true; konfig: KelasKonfig } | { ok: false; error: string; status: number };
/** Simpan pengaturan kelas. Mode acak & pilihan kosong/tak sesuai jumlah -> dipilih ulang otomatis; mode manual -> pilihan dari admin. */
export async function simpanKonfigKelas(db: Db, kegiatanId: number, kelas: number, masuk: { kuis_id: number | null; pengaturan: unknown; soal_pilihan?: unknown; acak_ulang?: boolean }, akunId: number, now: Date): Promise<HasilSimpan> {
  const p = normalisasiPengaturan(masuk.pengaturan);
  const semua = await konfigKelasSemua(db, kegiatanId);
  let pilihan: number[] = [];
  if (masuk.kuis_id !== null) {
    const { data: k } = await db.from("sigap_kuis").select("id").eq("id", masuk.kuis_id).eq("kegiatan_id", kegiatanId).maybeSingle();
    if (!k) return { ok: false, error: "Kuis tidak ditemukan.", status: 404 };
    const bank = await soalKuis(db, masuk.kuis_id);
    const ada = new Set(bank.map((s) => s.nomor));
    if (Array.isArray(masuk.soal_pilihan)) pilihan = Array.from(new Set((masuk.soal_pilihan as unknown[]).map(Number))).filter((n) => ada.has(n));
    if (p.mode === "manual") {
      p.jumlah = Math.max(1, Math.min(bank.length || 1, pilihan.length || p.jumlah));
      pilihan = pilihan.slice(0, p.jumlah).sort((a, b) => a - b);
    } else {
      p.jumlah = Math.min(p.jumlah, Math.max(1, bank.length));
      if (masuk.acak_ulang || pilihan.length !== p.jumlah) pilihan = await acakSoalKelas(db, semua, kelas, masuk.kuis_id, p, Date.now());
      else pilihan.sort((a, b) => a - b);
    }
  }
  const baris = { kegiatan_id: kegiatanId, kelas, kuis_id: masuk.kuis_id, pengaturan: p, soal_pilihan: pilihan, diubah_at: now.toISOString(), diubah_oleh: akunId };
  const { error } = await db.from("sigap_kuis_kelas").upsert(baris, { onConflict: "kegiatan_id,kelas" });
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, konfig: olahKonfig(kegiatanId, kelas, baris as unknown as Record<string, unknown>) };
}

// ---------------------------------------------------------------------------------------------
// Mesin ruang
// ---------------------------------------------------------------------------------------------
export type HasilBuka = { ok: true; ruang: RuangBaris } | { ok: false; error: string; status: number };

/** Buka ruang utk satu kelas dari pengaturan yg tersimpan (snapshot pengaturan + urutan soal/opsi). */
export async function bukaRuang(db: Db, kegiatanId: number, kelas: number, akunId: number, now: Date): Promise<HasilBuka> {
  const semua = await konfigKelasSemua(db, kegiatanId);
  const k = semua.find((x) => x.kelas === kelas)!;
  if (k.kuis_id === null) return { ok: false, error: `${labelKelas(kelas)} belum memilih kuis. Atur dulu di Pengaturan Kelas.`, status: 409 };
  const bank = await soalKuis(db, k.kuis_id);
  if (!bank.length) return { ok: false, error: "Kuis belum punya soal.", status: 409 };
  let pilihan = k.soal_pilihan.filter((n) => bank.some((s) => s.nomor === n));
  if (k.pengaturan.mode === "manual" && !pilihan.length) return { ok: false, error: `${labelKelas(kelas)}: belum ada soal yang dicentang (mode Manual).`, status: 409 };
  if (!pilihan.length || (k.pengaturan.mode === "acak" && pilihan.length !== Math.min(k.pengaturan.jumlah, bank.length))) pilihan = await acakSoalKelas(db, semua, kelas, k.kuis_id, k.pengaturan);
  if (!pilihan.length) return { ok: false, error: "Tidak ada soal yang terpilih.", status: 409 };
  const main = bangunSoalMain(bank, pilihan, k.pengaturan, rngBenih(Date.now() ^ (kelas * 7919)));
  const { data, error } = await db
    .from("sigap_kuis_ruang")
    .insert({ kuis_id: k.kuis_id, kegiatan_id: kegiatanId, kelas, status: "lobi", dibuka_oleh: akunId, pengaturan: k.pengaturan, soal_main: main, jadwal_at: k.pengaturan.jadwal_mulai })
    .select(KOLOM_RUANG)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { ok: false, error: `${labelKelas(kelas)} masih punya ruang yang aktif. Stop dulu ruang tersebut.`, status: 409 };
    return { ok: false, error: error.message, status: 500 };
  }
  bersihkanCache("ruang:");
  void now;
  return { ok: true, ruang: olahRuang(data as Record<string, unknown>) };
}

/** Update bersyarat versi (optimistik). Mengembalikan baris baru, atau null bila sudah berubah. */
async function terapkan(db: Db, r: RuangBaris, upd: Record<string, unknown>): Promise<RuangBaris | null> {
  const { data } = await db.from("sigap_kuis_ruang").update({ ...upd, versi: r.versi + 1 }).eq("id", r.id).eq("versi", r.versi).select(KOLOM_RUANG).maybeSingle();
  bersihkanCache("ruang:");
  bersihkanCache(`peserta:${r.id}`);
  return data ? olahRuang(data as Record<string, unknown>) : null;
}

const NOL_JEDA = { dijeda: false, dijeda_sisa_ms: null, lanjut_at: null };
function mulaiSoal(main: SoalMainLengkap[], idx: number, now: Date) {
  return { ...NOL_JEDA, status: "soal", soal_ke: idx + 1, soal_mulai_at: now.toISOString(), soal_batas_at: new Date(now.getTime() + main[idx].detik * 1000).toISOString() };
}
function masukJawaban(r: RuangBaris, now: Date) {
  const p = r.pengaturan;
  return { ...NOL_JEDA, status: "jawaban", lanjut_at: p.lanjut_otomatis ? new Date(now.getTime() + p.jeda_pembahasan * 1000).toISOString() : null };
}
function soalBerikutAtauSelesai(r: RuangBaris, main: SoalMainLengkap[], now: Date) {
  return r.soal_ke >= main.length ? { ...NOL_JEDA, status: "selesai", selesai_at: now.toISOString() } : mulaiSoal(main, r.soal_ke, now);
}

/**
 * Peralihan otomatis (idempoten): lobi -> soal 1 (jadwal), soal -> jawaban (waktu habis + toleransi, atau semua sudah menjawab),
 * jawaban -> soal berikut/selesai (lanjut otomatis). Tidak berjalan saat ruang dijeda.
 */
export async function sinkronRuang(db: Db, ruang: RuangBaris, nowMs: number, semuaMenjawab = false): Promise<RuangBaris> {
  let r = ruang;
  const now = new Date(nowMs);
  for (let i = 0; i < 3; i++) {
    if (r.dijeda || r.status === "selesai") return r;
    let upd: Record<string, unknown> | null = null;
    if (r.status === "lobi") {
      if (r.pengaturan.mulai_otomatis && r.jadwal_at && nowMs >= new Date(r.jadwal_at).getTime()) {
        const main = await soalMainRuang(db, r);
        if (main.length) upd = mulaiSoal(main, 0, now);
      }
    } else if (r.status === "soal") {
      const habis = !!r.soal_batas_at && nowMs >= new Date(r.soal_batas_at).getTime() + TOLERANSI_JAWAB_MS;
      if (habis || semuaMenjawab) upd = masukJawaban(r, now);
      semuaMenjawab = false;
    } else if (r.status === "jawaban") {
      if (r.lanjut_at && nowMs >= new Date(r.lanjut_at).getTime()) upd = soalBerikutAtauSelesai(r, await soalMainRuang(db, r), now);
    }
    if (!upd) return r;
    const baru = await terapkan(db, r, upd);
    if (!baru) return (await ruangById(db, r.id)) ?? r;
    r = baru;
  }
  return r;
}

export type HasilLanjut = { ok: true; ruang: RuangBaris; berubah: boolean } | { ok: false; error: string; status: number };

/** Tombol "Start / Lanjut" admin: lobi->soal 1, soal->jawaban, jawaban->soal berikut / selesai. `versiKlien` mencegah klik ganda melompati soal. */
export async function lanjutRuang(db: Db, ruangId: number, versiKlien: number | null, now: Date): Promise<HasilLanjut> {
  const r = await ruangById(db, ruangId);
  if (!r) return { ok: false, error: "Ruang tidak ditemukan.", status: 404 };
  if (r.status === "selesai") return { ok: false, error: "Kuis ini sudah selesai.", status: 409 };
  if (versiKlien !== null && versiKlien !== r.versi) return { ok: true, ruang: r, berubah: false }; // sudah berpindah (mis. waktu habis otomatis)
  const main = await soalMainRuang(db, r);
  if (!main.length) return { ok: false, error: "Kuis belum punya soal.", status: 409 };
  let upd: Record<string, unknown>;
  if (r.status === "lobi") upd = mulaiSoal(main, 0, now);
  else if (r.status === "soal") upd = masukJawaban(r, now);
  else upd = soalBerikutAtauSelesai(r, main, now);
  const baru = await terapkan(db, r, upd);
  if (!baru) return { ok: true, ruang: (await ruangById(db, r.id)) ?? r, berubah: false };
  return { ok: true, ruang: baru, berubah: true };
}

/** Pause: bekukan hitung mundur soal (atau jeda lanjut otomatis). */
export async function jedaRuang(db: Db, ruangId: number, now: Date): Promise<HasilLanjut> {
  const r = await ruangById(db, ruangId);
  if (!r) return { ok: false, error: "Ruang tidak ditemukan.", status: 404 };
  if (r.dijeda) return { ok: true, ruang: r, berubah: false };
  if (r.status !== "soal" && r.status !== "jawaban") return { ok: false, error: "Kuis hanya bisa dijeda saat soal atau jawaban sedang tampil.", status: 409 };
  const t = now.getTime();
  const sisa = r.status === "soal" ? Math.max(0, new Date(r.soal_batas_at ?? t).getTime() - t) : r.lanjut_at ? Math.max(0, new Date(r.lanjut_at).getTime() - t) : null;
  const baru = await terapkan(db, r, { dijeda: true, dijeda_sisa_ms: sisa });
  return baru ? { ok: true, ruang: baru, berubah: true } : { ok: true, ruang: (await ruangById(db, r.id)) ?? r, berubah: false };
}

/** Resume: hitung mundur dilanjutkan dari sisa waktu; waktu menjawab peserta tidak ikut berkurang selama jeda. */
export async function lanjutkanRuang(db: Db, ruangId: number, now: Date): Promise<HasilLanjut> {
  const r = await ruangById(db, ruangId);
  if (!r) return { ok: false, error: "Ruang tidak ditemukan.", status: 404 };
  if (!r.dijeda) return { ok: true, ruang: r, berubah: false };
  const t = now.getTime();
  let upd: Record<string, unknown>;
  if (r.status === "soal") {
    const main = await soalMainRuang(db, r);
    const detik = main[r.soal_ke - 1]?.detik ?? 20;
    const sisa = Math.max(0, r.dijeda_sisa_ms ?? 0);
    upd = { dijeda: false, dijeda_sisa_ms: null, soal_batas_at: new Date(t + sisa).toISOString(), soal_mulai_at: new Date(t - (detik * 1000 - sisa)).toISOString() };
  } else {
    upd = { dijeda: false, dijeda_sisa_ms: null, lanjut_at: r.dijeda_sisa_ms == null ? null : new Date(t + r.dijeda_sisa_ms).toISOString() };
  }
  const baru = await terapkan(db, r, upd);
  return baru ? { ok: true, ruang: baru, berubah: true } : { ok: true, ruang: (await ruangById(db, r.id)) ?? r, berubah: false };
}

/** Restart: kembali ke lobi, jawaban dihapus, peserta tetap tergabung. Soal & urutan yang sama. */
export async function restartRuang(db: Db, ruangId: number): Promise<HasilLanjut> {
  const r = await ruangById(db, ruangId);
  if (!r) return { ok: false, error: "Ruang tidak ditemukan.", status: 404 };
  const { error: e1 } = await db.from("sigap_kuis_jawaban").delete().eq("ruang_id", r.id);
  if (e1) return { ok: false, error: e1.message, status: 500 };
  const { data, error } = await db
    .from("sigap_kuis_ruang")
    .update({ status: "lobi", soal_ke: 0, soal_mulai_at: null, soal_batas_at: null, selesai_at: null, ...NOL_JEDA, versi: r.versi + 1 })
    .eq("id", r.id)
    .select(KOLOM_RUANG)
    .maybeSingle();
  bersihkanCache("ruang:");
  bersihkanCache(`papan:${r.id}`);
  bersihkanCache(`papanlive:${r.id}`);
  bersihkanCache(`sebaran:${r.id}`);
  if (error) {
    if (error.code === "23505") return { ok: false, error: `${labelKelas(r.kelas)} sudah punya ruang aktif lain; Stop ruang itu dulu.`, status: 409 };
    return { ok: false, error: error.message, status: 500 };
  }
  return { ok: true, ruang: olahRuang(data as Record<string, unknown>), berubah: true };
}

/** Stop: akhiri kuis sekarang (podium + rekap dari jawaban yang sudah masuk). */
export async function akhiriRuang(db: Db, ruangId: number, now: Date): Promise<RuangBaris | null> {
  const r = await ruangById(db, ruangId);
  if (!r) return null;
  if (r.status === "selesai") return r;
  const { data } = await db.from("sigap_kuis_ruang").update({ status: "selesai", selesai_at: now.toISOString(), ...NOL_JEDA, versi: r.versi + 1 }).eq("id", r.id).neq("status", "selesai").select(KOLOM_RUANG).maybeSingle();
  bersihkanCache("ruang:");
  return data ? olahRuang(data as Record<string, unknown>) : await ruangById(db, r.id);
}

export type HasilJawab = { ok: true; sudah?: boolean } | { ok: false; error: string; status: number };

/** Catat jawaban peserta (satu kali per soal). Waktu & poin dihitung server. */
export async function catatJawaban(db: Db, akunId: number, ruangId: number, nomor: number, pilihan: string, now: Date): Promise<HasilJawab> {
  const r = await ruangById(db, ruangId);
  if (!r) return { ok: false, error: "Ruang tidak ditemukan.", status: 404 };
  if (r.dijeda) return { ok: false, error: "Kuis sedang dijeda oleh pemandu.", status: 409 };
  if (r.status !== "soal" || !r.soal_mulai_at || !r.soal_batas_at) return { ok: false, error: "Waktu menjawab soal ini sudah habis.", status: 409 };
  const main = await soalMainRuang(db, r);
  const s = main[r.soal_ke - 1];
  if (!s || s.nomor !== nomor) return { ok: false, error: "Soal sudah berganti.", status: 409 };
  const kode = String(pilihan ?? "").trim().toUpperCase();
  if (!s.opsi.some((o) => o.kode === kode)) return { ok: false, error: "Pilihan tidak valid.", status: 400 };
  const t = now.getTime();
  if (t > new Date(r.soal_batas_at).getTime() + TOLERANSI_JAWAB_MS) return { ok: false, error: "Waktu menjawab soal ini sudah habis.", status: 409 };
  if (!r.pengaturan.gabung_terlambat) {
    const { data: ikut } = await db.from("sigap_kuis_peserta").select("akun_id").eq("ruang_id", r.id).eq("akun_id", akunId).maybeSingle();
    if (!ikut) return { ok: false, error: "Kuis sudah dimulai; bergabung terlambat tidak diizinkan.", status: 403 };
  }
  const waktu = Math.min(s.detik * 1000, Math.max(0, t - new Date(r.soal_mulai_at).getTime()));
  const benar = kode === s.kunci;
  await db.from("sigap_kuis_peserta").upsert({ ruang_id: r.id, akun_id: akunId }, { onConflict: "ruang_id,akun_id", ignoreDuplicates: true });
  bersihkanCache(`peserta:${r.id}`); // daftar peserta berubah (gabung otomatis) -> hitungan "semua sudah menjawab" harus segar
  const { error } = await db.from("sigap_kuis_jawaban").insert({ ruang_id: r.id, akun_id: akunId, nomor, pilihan: kode, benar, waktu_ms: Math.round(waktu), poin: hitungPoin(benar, waktu, s.detik, r.pengaturan.bonus_kecepatan) });
  if (error) {
    if (error.code === "23505") return { ok: true, sudah: true };
    return { ok: false, error: error.message, status: 500 };
  }
  return { ok: true };
}

export type HasilGabung = { ok: true } | { ok: false; error: string; status: number };
export async function gabungRuang(db: Db, akunId: number, ruang: RuangBaris): Promise<HasilGabung> {
  if (ruang.status === "selesai") return { ok: false, error: "Kuis kelas ini sudah selesai.", status: 409 };
  if (ruang.status !== "lobi" && !ruang.pengaturan.gabung_terlambat) {
    const { data } = await db.from("sigap_kuis_peserta").select("akun_id").eq("ruang_id", ruang.id).eq("akun_id", akunId).maybeSingle();
    if (!data) return { ok: false, error: "Kuis sudah dimulai; bergabung terlambat tidak diizinkan.", status: 403 };
    return { ok: true };
  }
  await db.from("sigap_kuis_peserta").upsert({ ruang_id: ruang.id, akun_id: akunId }, { onConflict: "ruang_id,akun_id", ignoreDuplicates: true });
  bersihkanCache(`peserta:${ruang.id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Keadaan utk layar admin (host), pantau live, dan HP peserta
// ---------------------------------------------------------------------------------------------
const publik = (r: RuangBaris, total: number, judul: string) => ({
  id: r.id,
  kuis_id: r.kuis_id,
  kelas: r.kelas,
  judul,
  status: r.status,
  soal_ke: r.soal_ke,
  total,
  versi: r.versi,
  mulai_at: r.soal_mulai_at,
  batas_at: r.soal_batas_at,
  dibuka_at: r.dibuka_at,
  selesai_at: r.selesai_at,
  dijeda: r.dijeda,
  sisa_ms: r.dijeda ? r.dijeda_sisa_ms : null,
  lanjut_at: r.lanjut_at,
  jadwal_at: r.jadwal_at,
});

const pengaturanPublik = (p: Pengaturan) => ({ nama_mode: p.nama_mode, musik: p.musik, papan_live_hp: p.papan_live_hp, bonus_kecepatan: p.bonus_kecepatan, lanjut_otomatis: p.lanjut_otomatis, jeda_pembahasan: p.jeda_pembahasan, mulai_otomatis: p.mulai_otomatis, gabung_terlambat: p.gabung_terlambat });

export async function keadaanHost(db: Db, ruang0: RuangBaris, now: Date) {
  const [main, kuis, peserta] = await Promise.all([soalMainRuang(db, ruang0), infoKuis(db, ruang0.kuis_id), daftarPeserta(db, ruang0.id)]);
  let ruang = ruang0;
  let menjawab = 0;
  if (ruang.status === "soal") {
    const cur = main[ruang.soal_ke - 1];
    if (cur) menjawab = await jumlahMenjawab(db, ruang.id, cur.nomor);
  }
  ruang = await sinkronRuang(db, ruang, now.getTime(), ruang.status === "soal" && peserta.length > 0 && menjawab >= peserta.length);
  if (ruang.status !== "soal") menjawab = 0;
  const cur = ruang.soal_ke > 0 ? main[ruang.soal_ke - 1] : null;
  const tampilJawaban = ruang.status === "jawaban" || ruang.status === "selesai";
  const mode = ruang.pengaturan.nama_mode;
  const [papan, sebaran] = tampilJawaban ? await Promise.all([papanRuang(db, ruang.id, ruang.versi), sebaranRuang(db, ruang.id, ruang.versi)]) : [[], {} as SebaranSoal];
  return {
    sekarang: now.toISOString(),
    ruang: publik(ruang, main.length, kuis.judul),
    pengaturan: pengaturanPublik(ruang.pengaturan),
    soal: cur
      ? {
          nomor: cur.nomor,
          teks: cur.teks,
          opsi: cur.opsi,
          detik: cur.detik,
          topik: cur.topik,
          kunci: ruang.status === "soal" ? null : cur.kunci,
          penjelasan: ruang.status === "soal" ? null : cur.penjelasan,
        }
      : null,
    jumlah_peserta: peserta.length,
    peserta: ruang.status === "lobi" ? peserta.map((p) => namaTampil(p.nama, mode)) : undefined,
    menjawab,
    sebaran: cur && tampilJawaban ? (sebaran[cur.nomor] ?? { jumlah: {}, benar: 0, total: 0 }) : null,
    papan: (ruang.status === "selesai" ? papan.slice(0, 20) : papan.slice(0, 5)).map((p) => ({ ...p, nama_tampil: namaTampil(p.nama, mode) })),
    ada_soal_berikut: ruang.soal_ke < main.length,
  };
}

export async function keadaanPeserta(db: Db, ruang0: RuangBaris, now: Date, akunId: number | null) {
  const [main, kuis] = await Promise.all([soalMainRuang(db, ruang0), infoKuis(db, ruang0.kuis_id)]);
  const ruang = await sinkronRuang(db, ruang0, now.getTime(), false);
  const cur = ruang.soal_ke > 0 ? main[ruang.soal_ke - 1] : null;
  const tampil = ruang.status === "soal" || ruang.status === "jawaban";
  const out: Record<string, unknown> = {
    sekarang: now.toISOString(),
    ruang: publik(ruang, main.length, kuis.judul),
    pengaturan: pengaturanPublik(ruang.pengaturan),
    soal: cur && tampil ? { nomor: cur.nomor, teks: cur.teks, opsi: cur.opsi, detik: cur.detik, kunci: ruang.status === "jawaban" ? cur.kunci : null, penjelasan: ruang.status === "jawaban" ? cur.penjelasan : null } : null,
  };
  if (akunId !== null) {
    const { data: gb } = await db.from("sigap_kuis_peserta").select("akun_id").eq("ruang_id", ruang.id).eq("akun_id", akunId).maybeSingle();
    const saya: Record<string, unknown> = { gabung: !!gb };
    if (cur && tampil) {
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
      if (ruang.pengaturan.papan_live_hp || ruang.status === "selesai") {
        const mode = ruang.pengaturan.nama_mode;
        out.papan = papan.slice(0, 5).map((p) => ({ nama: namaTampil(p.nama, mode), poin: p.poin, peringkat: p.peringkat }));
      }
      if (ruang.status === "jawaban" && aku && ruang.pengaturan.papan_live_hp) {
        const di_atas = papan.filter((p) => p.poin > aku.poin).slice(-1)[0];
        saya.selisih_ke_atas = di_atas ? di_atas.poin - aku.poin : null;
      }
    }
    out.saya = saya;
  }
  return out;
}

/** Review jawaban & penjelasan utk peserta: hanya soal yang sudah dibuka jawabannya. */
export async function reviewPeserta(db: Db, ruang: RuangBaris, akunId: number) {
  const main = await soalMainRuang(db, ruang);
  const terbuka = (i: number) => ruang.status === "selesai" || i < ruang.soal_ke - 1 || (i === ruang.soal_ke - 1 && ruang.status === "jawaban");
  const { data } = await db.from("sigap_kuis_jawaban").select("nomor, pilihan, benar, poin, waktu_ms").eq("ruang_id", ruang.id).eq("akun_id", akunId).limit(500);
  const jw = new Map(((data ?? []) as Record<string, unknown>[]).map((x) => [Number(x.nomor), x]));
  const sebaran = await sebaranRuang(db, ruang.id, ruang.versi);
  const ikut = (await daftarPeserta(db, ruang.id)).length;
  const kuis = await infoKuis(db, ruang.kuis_id);
  const butir = main
    .filter((s) => terbuka(s.idx))
    .map((s) => {
      const j = jw.get(s.nomor);
      const sb = sebaran[s.nomor];
      return {
        urutan: s.idx + 1,
        nomor: s.nomor,
        teks: s.teks,
        topik: s.topik,
        opsi: s.opsi,
        kunci: s.kunci,
        penjelasan: s.penjelasan,
        pilihan: j ? String(j.pilihan) : null,
        benar: j ? !!j.benar : false,
        poin: j ? Number(j.poin) : 0,
        persen_benar: ikut && sb ? Math.round((sb.benar / ikut) * 100) : null,
      };
    });
  return { ruang: { id: ruang.id, kelas: ruang.kelas, judul: kuis.judul, status: ruang.status, total: main.length }, butir };
}

// ---------------------------------------------------------------------------------------------
// Pantau Live (admin): ringkasan keempat kelas
// ---------------------------------------------------------------------------------------------
export async function ringkasanLive(db: Db, kegiatanId: number, now: Date) {
  const [semua, ruangMap, { data: pen }] = await Promise.all([
    konfigKelasSemua(db, kegiatanId),
    ruangSemuaKelas(db, kegiatanId),
    db.from("sigap_penugasan").select("kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).limit(3000),
  ]);
  const anggota = new Map<number, number>();
  for (const p of pen ?? []) if (p.kelas != null) anggota.set(Number(p.kelas), (anggota.get(Number(p.kelas)) ?? 0) + 1);
  anggota.set(KELAS_GABUNGAN, (pen ?? []).length); // Semua Kelas = seluruh peserta
  const kuisIds = Array.from(new Set(semua.map((k) => k.kuis_id).filter((x): x is number => x !== null)));
  const judul = new Map<number, string>();
  for (const id of kuisIds) judul.set(id, (await infoKuis(db, id)).judul);
  const out = [];
  for (const k of semua) {
    const r0 = ruangMap.get(k.kelas) ?? null;
    let ruang: Record<string, unknown> | null = null;
    if (r0) {
      const [main, peserta] = await Promise.all([soalMainRuang(db, r0), daftarPeserta(db, r0.id)]);
      let r = r0;
      let menjawab = 0;
      if (r.status === "soal") menjawab = await jumlahMenjawab(db, r.id, main[r.soal_ke - 1]?.nomor ?? -1);
      r = await sinkronRuang(db, r, now.getTime(), r.status === "soal" && peserta.length > 0 && menjawab >= peserta.length);
      const mode = r.pengaturan.nama_mode;
      const papan = r.status === "lobi" ? [] : await papanLive(db, r.id);
      ruang = {
        ...publik(r, main.length, judul.get(r.kuis_id) ?? (await infoKuis(db, r.kuis_id)).judul),
        jumlah_peserta: peserta.length,
        menjawab: r.status === "soal" ? menjawab : 0,
        papan: papan.slice(0, 5).map((p) => ({ nama: p.nama, nama_tampil: namaTampil(p.nama, mode), poin: p.poin, benar: p.benar, peringkat: p.peringkat })),
        rata_poin: papan.length ? Math.round(papan.reduce((t, p) => t + p.poin, 0) / papan.length) : null,
      };
    }
    out.push({
      kelas: k.kelas,
      kuis_id: k.kuis_id,
      kuis_judul: k.kuis_id !== null ? (judul.get(k.kuis_id) ?? null) : null,
      jumlah_soal: k.soal_pilihan.length,
      anggota: anggota.get(k.kelas) ?? 0,
      terjadwal: k.pengaturan.jadwal_mulai,
      ruang,
    });
  }
  return { sekarang: now.toISOString(), kelas: out };
}

/** Ringkasan untuk beranda peserta (langkah "Adu Sigap"). `kelas` = kelas peserta; null (instruktur) -> ruang aktif mana pun. */
export async function ringkasanKuisHub(db: Db, kegiatanId: number, akunId: number, kelas: number | null) {
  const semuaRuang = await ruangSemuaKelas(db, kegiatanId);
  let ruang: RuangBaris | null = null;
  // (8 Okt 2026) ruang "Semua Kelas" yg aktif didahulukan untuk semua peserta
  const gab = semuaRuang.get(KELAS_GABUNGAN);
  if (gab && gab.status !== "selesai") ruang = gab;
  else if (kelas !== null) ruang = semuaRuang.get(kelas) ?? null;
  else ruang = [...semuaRuang.values()].find((r) => r.status !== "selesai") ?? null;
  let adaKonfig = false;
  if (!ruang && kelas !== null) {
    const { data } = await db.from("sigap_kuis_kelas").select("kuis_id").eq("kegiatan_id", kegiatanId).eq("kelas", kelas).maybeSingle();
    if (data?.kuis_id != null) {
      const { data: s } = await db.from("sigap_kuis_soal").select("kuis_id").eq("kuis_id", Number(data.kuis_id)).limit(1);
      adaKonfig = (s ?? []).length > 0;
    }
  }
  if (!ruang && !adaKonfig) return null;
  const aktif = !!ruang && ruang.status !== "selesai";
  let sudahGabung = false;
  let pernahIkut = false;
  let judul: string | null = null;
  if (ruang) {
    judul = (await infoKuis(db, ruang.kuis_id)).judul;
    const { data: gb } = await db.from("sigap_kuis_peserta").select("ruang_id").eq("akun_id", akunId).limit(500);
    const ruangIds = (gb ?? []).map((x) => Number(x.ruang_id));
    sudahGabung = aktif && ruangIds.includes(ruang.id);
    if (ruangIds.length) {
      const { data: s } = await db.from("sigap_kuis_ruang").select("id").in("id", ruangIds).eq("status", "selesai").eq("kegiatan_id", kegiatanId).limit(1);
      pernahIkut = (s ?? []).length > 0;
    }
  }
  return {
    ada_ruang_aktif: aktif,
    status: aktif ? ruang!.status : ruang ? "selesai" : null,
    kelas: ruang?.kelas ?? kelas,
    judul,
    sudah_gabung: sudahGabung,
    pernah_ikut: pernahIkut,
    ada_ruang_selesai: !!ruang && ruang.status === "selesai",
    jadwal_at: aktif ? ruang!.jadwal_at : null,
  };
}

/** Kelas bawaan seorang inda/instruktur (tabel sigap_kuis_instruktur_kelas): filter kelas langsung terbuka di kelasnya. null = tidak ada. */
export async function kelasInstruktur(db: Db, kegiatanId: number, akunId: number): Promise<number | null> {
  try {
    const { data } = await db.from("sigap_kuis_instruktur_kelas").select("kelas").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).maybeSingle();
    const k = Number(data?.kelas);
    return Number.isInteger(k) && k >= 1 && k <= 4 ? k : null;
  } catch {
    return null;
  }
}
