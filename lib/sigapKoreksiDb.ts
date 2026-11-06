// lib/sigapKoreksiDb.ts  (khusus server)
//
// (6 Nov 2026) Kelola Pelatihan > Kendala, tahap kedua. Lima tindakan koreksi, semuanya dengan ALASAN WAJIB, tercatat di sigap_pelatihan_koreksi
// (siapa, kapan, apa, keadaan sebelumnya) dan dapat DIURUNGKAN selama keadaannya belum berubah:
//   tes_waktu       tambah waktu untuk peserta yang sedang mengerjakan (atau yang waktunya baru habis dan belum dinilai)
//   tes_buka_ulang  buka kembali percobaan yang sudah selesai: jawaban tersimpan tetap, waktu tambahan diberikan, skor dihitung lagi saat peserta mengirim
//   soal_nonaktif   soal bermasalah dinonaktifkan (tidak dihapus) lalu nilai SEMUA peserta (percobaan berjalan + arsip) dihitung ulang dari jawaban yang tersimpan
//   pindah          pindah kelas dan/atau atasan seorang peserta (bawahan langsung boleh ikut pindah kelas)
//   peserta_tambah  tambah peserta mendadak: mewarisi kelas, maks_hari, dan atasan pilihan; ia perlu menerima undangan di HP
// Dampak ditampilkan SEBELUM diterapkan (pratinjau nilai untuk soal; ringkasan untuk lainnya). SQL: 20261106a_pelatihan_koreksi.sql.
// Tanpa SQL itu semua fungsi tulis menolak dengan petunjuk dan papan mengembalikan tersedia=false; fitur lain tidak terpengaruh.
//
// Yang diubah hanya data pelatihan ini. Data survei lapangan TIDAK disentuh.

import { FILTER_BUKAN_ADMINISTRASI, muatSemuaSoal, muatTesDaftar } from "@/lib/sigapTesDb";
import { bersihkanJawaban, hitungSkor, type SoalLengkap, type TesBaris } from "@/lib/sigapTes";
import { muatAturan } from "@/lib/sigapAturanDb";
import { lulusMenurut, nilaiResmiTes } from "@/lib/sigapAturanTes";

import type { Db } from "@/lib/sigap";
type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type JenisKoreksi = "tes_waktu" | "tes_buka_ulang" | "soal_nonaktif" | "pindah" | "peserta_tambah";
export const LABEL_KOREKSI: Record<JenisKoreksi, string> = {
  tes_waktu: "Tambah waktu tes",
  tes_buka_ulang: "Buka ulang tes",
  soal_nonaktif: "Soal dinonaktifkan",
  pindah: "Pindah kelas / atasan",
  peserta_tambah: "Peserta ditambahkan",
};
export const PESAN_SQL = "Bagian ini belum aktif. Jalankan dulu SQL 20261106a_pelatihan_koreksi di Supabase, lalu muat ulang halaman.";
export const MENIT_MAKS = 180;

const PERAN_SAH = ["ppl", "pml", "korwil"] as const;
const peranSah = (x: unknown): x is (typeof PERAN_SAH)[number] => typeof x === "string" && (PERAN_SAH as readonly string[]).includes(x);

const num = (x: unknown): number => Number(x);
const angkaAtauNull = (x: unknown): number | null => (x === null || x === undefined || x === "" ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const sama = (a: unknown, b: unknown): boolean => {
  const x = angkaAtauNull(a);
  const y = angkaAtauNull(b);
  return x === null || y === null ? x === y : Math.abs(x - y) < 1e-9;
};
const samaWaktu = (a: unknown, b: unknown): boolean => !!a && !!b && new Date(String(a)).getTime() === new Date(String(b)).getTime();
const bulat2 = (n: number) => Math.round(n * 100) / 100;

export type Gagal = { ok: false; pesan: string };
const gagal = (pesan: string): Gagal => ({ ok: false, pesan });

export function jamWib(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(":", ".");
}

function periksaAlasan(x: unknown): { ok: true; alasan: string } | Gagal {
  const a = typeof x === "string" ? x.trim().replace(/\s+/g, " ") : "";
  if (a.length < 3) return gagal("Tulis alasannya dulu (minimal 3 huruf).");
  return { ok: true, alasan: a.slice(0, 500) };
}

// ----------------------------------------------------------------------------
// Pembacaan dasar
// ----------------------------------------------------------------------------

export async function tabelAda(db: Db): Promise<boolean> {
  try {
    const { error } = await db.from("sigap_pelatihan_koreksi").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

/** Kolom sigap_tes_soal.aktif ada? (SQL 20261106a) */
export async function kolomAktifAda(db: Db): Promise<boolean> {
  try {
    const { error } = await db.from("sigap_tes_soal").select("aktif").limit(1);
    return !error;
  } catch {
    return false;
  }
}

type Penugasan = { id: number; akun_id: number; peran: string; kelas: number | null; aktif: boolean; sumber: string | null; maks_hari: number | null };
const KOLOM_PEN = "id, akun_id, peran, kelas, aktif, sumber, maks_hari";
const rapikanPen = (r: Obj): Penugasan => ({ id: num(r.id), akun_id: num(r.akun_id), peran: String(r.peran), kelas: r.kelas == null ? null : num(r.kelas), aktif: r.aktif !== false, sumber: r.sumber ?? null, maks_hari: r.maks_hari == null ? null : num(r.maks_hari) });

async function penugasanAktif(db: Db, kegiatanId: number): Promise<Penugasan[]> {
  const { data } = await db.from("sigap_penugasan").select(KOLOM_PEN).eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(5000);
  return ((data ?? []) as Obj[]).map(rapikanPen);
}

/** Baris penugasan apa pun (aktif atau tidak) untuk satu akun pada kegiatan ini. */
async function penugasanAkun(db: Db, kegiatanId: number, akunId: number): Promise<Penugasan | null> {
  const { data } = await db.from("sigap_penugasan").select(KOLOM_PEN).eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).maybeSingle();
  return data ? rapikanPen(data as Obj) : null;
}

type Hier = { akun_id: number; peran_pelatihan: string; atasan_akun_id: number | null; sumber: string | null; diubah_oleh: string | null };
const rapikanHier = (r: Obj): Hier => ({ akun_id: num(r.akun_id), peran_pelatihan: String(r.peran_pelatihan), atasan_akun_id: r.atasan_akun_id == null ? null : num(r.atasan_akun_id), sumber: r.sumber ?? null, diubah_oleh: r.diubah_oleh ?? null });

async function hierarkiSemua(db: Db, kegiatanId: number): Promise<Hier[]> {
  const { data } = await db.from("sigap_pelatihan_hierarki").select("akun_id, peran_pelatihan, atasan_akun_id, sumber, diubah_oleh").eq("kegiatan_id", kegiatanId).limit(5000);
  return ((data ?? []) as Obj[]).map(rapikanHier);
}

async function namaAkunPeta(db: Db, ids: readonly number[]): Promise<Map<number, { nama: string; kecamatan: string | null }>> {
  const peta = new Map<number, { nama: string; kecamatan: string | null }>();
  const unik = Array.from(new Set(ids));
  if (unik.length === 0) return peta;
  const { data } = await db.from("sigap_akun").select("id, nama, alamat_kecamatan").in("id", unik).limit(5000);
  for (const a of (data ?? []) as Obj[]) peta.set(num(a.id), { nama: String(a.nama), kecamatan: a.alamat_kecamatan ?? null });
  return peta;
}

async function tesKegiatan(db: Db, kegiatanId: number, tesId: number): Promise<TesBaris | null> {
  const daftar = await muatTesDaftar(db, kegiatanId);
  return daftar.find((t) => num(t.id) === tesId) ?? null;
}

// ----------------------------------------------------------------------------
// Catatan koreksi
// ----------------------------------------------------------------------------

async function catat(db: Db, kegiatanId: number, oleh: number, x: { jenis: JenisKoreksi; akun_id: number | null; tes_id: number | null; alasan: string; detail: Obj; snapshot: Obj }): Promise<number | null> {
  const { data, error } = await db
    .from("sigap_pelatihan_koreksi")
    .insert({ kegiatan_id: kegiatanId, jenis: x.jenis, akun_id: x.akun_id, tes_id: x.tes_id, alasan: x.alasan, detail: x.detail, snapshot: x.snapshot, oleh })
    .select("id")
    .single();
  if (error || !data) return null;
  return num((data as Obj).id);
}
const hapusCatatan = async (db: Db, id: number) => {
  await db.from("sigap_pelatihan_koreksi").delete().eq("id", id);
};
const perbaruiDetail = async (db: Db, id: number, detail: Obj) => {
  await db.from("sigap_pelatihan_koreksi").update({ detail }).eq("id", id);
};

// ----------------------------------------------------------------------------
// Sesi tes
// ----------------------------------------------------------------------------

type Sesi = { id: number; tes_id: number; akun_id: number; mulai_at: string; batas_at: string; selesai_at: string | null; jawaban: Record<string, string>; skor: number | null; benar: number | null; total: number | null; percobaan: number; skor_terbaik: number | null; skor_awal?: number | null };
const KOLOM_SESI = "id, tes_id, akun_id, mulai_at, batas_at, selesai_at, jawaban, skor, benar, total, percobaan, skor_terbaik";
const rapikanSesi = (r: Obj): Sesi => ({
  id: num(r.id),
  tes_id: num(r.tes_id),
  akun_id: num(r.akun_id),
  mulai_at: r.mulai_at,
  batas_at: r.batas_at,
  selesai_at: r.selesai_at ?? null,
  jawaban: (r.jawaban as Record<string, string>) ?? {},
  skor: angkaAtauNull(r.skor),
  benar: angkaAtauNull(r.benar),
  total: angkaAtauNull(r.total),
  percobaan: r.percobaan == null ? 1 : num(r.percobaan),
  skor_terbaik: angkaAtauNull(r.skor_terbaik),
  skor_awal: r.skor_awal === undefined ? undefined : angkaAtauNull(r.skor_awal),
});

/** Baca sesi dengan skor_awal; bila kolom belum ada, tanpa kolom itu. */
async function bacaSesi(db: Db, tesId: number, akunId: number): Promise<Sesi | null> {
  const q = (k: string) => db.from("sigap_tes_sesi").select(k).eq("tes_id", tesId).eq("akun_id", akunId).maybeSingle();
  let r = await q(`${KOLOM_SESI}, skor_awal`);
  if (r.error) r = await q(KOLOM_SESI);
  return r.data ? rapikanSesi(r.data as Obj) : null;
}

export type HasilTes = { ok: true; id: number; ringkas: string } | Gagal;

type InputWaktu = { akun_id: number; tes_id: number; menit: number; alasan: string };

async function siapkanTes(db: Db, kegiatanId: number, inp: InputWaktu): Promise<{ ok: true; tes: TesBaris; alasan: string; sesi: Sesi | null; nama: string } | Gagal> {
  if (!Number.isInteger(inp.akun_id) || inp.akun_id <= 0) return gagal("Peserta tidak valid.");
  if (!Number.isInteger(inp.tes_id) || inp.tes_id <= 0) return gagal("Tes tidak valid.");
  if (!Number.isInteger(inp.menit) || inp.menit < 1 || inp.menit > MENIT_MAKS) return gagal(`Waktu tambahan harus 1–${MENIT_MAKS} menit.`);
  const al = periksaAlasan(inp.alasan);
  if (!al.ok) return al;
  if (!(await tabelAda(db))) return gagal(PESAN_SQL);
  const tes = await tesKegiatan(db, kegiatanId, inp.tes_id);
  if (!tes) return gagal("Tes itu bukan milik pelatihan ini.");
  if (!tes.aktif) return gagal("Tes ini sedang dinonaktifkan.");
  const sesi = await bacaSesi(db, inp.tes_id, inp.akun_id);
  const nama = (await namaAkunPeta(db, [inp.akun_id])).get(inp.akun_id)?.nama ?? `Akun ${inp.akun_id}`;
  return { ok: true, tes, alasan: al.alasan, sesi, nama };
}

const labelTes = (t: TesBaris) => (t.jenis === "pretest" ? "Pretest" : "Posttest");

/** Tambah waktu: percobaan masih berjalan (atau waktunya baru lewat dan belum dinilai). Waktu baru = sisa waktu (bila masih ada) + tambahan. */
export async function tambahWaktu(db: Db, kegiatanId: number, oleh: number, inp: InputWaktu, sekarang: Date = new Date()): Promise<HasilTes> {
  const s = await siapkanTes(db, kegiatanId, inp);
  if (!s.ok) return s;
  const { tes, sesi, nama, alasan } = s;
  if (!sesi) return gagal(`${nama} belum memulai ${labelTes(tes)}. Bila tes sudah ditutup, pakai “Buka kunci” (izin hari ini).`);
  if (sesi.selesai_at) return gagal(`${nama} sudah menyelesaikan ${labelTes(tes)}. Pakai “Buka ulang” agar ia bisa melanjutkan.`);
  const dasar = Math.max(new Date(sesi.batas_at).getTime(), sekarang.getTime());
  const baru = new Date(dasar + inp.menit * 60_000).toISOString();
  const id = await catat(db, kegiatanId, oleh, {
    jenis: "tes_waktu",
    akun_id: inp.akun_id,
    tes_id: inp.tes_id,
    alasan,
    detail: { menit: inp.menit, tes: tes.jenis, ringkas: `${nama}: ${labelTes(tes)} ditambah ${inp.menit} menit (sampai ${jamWib(baru)})` },
    snapshot: { sesi_id: sesi.id, batas_sebelum: sesi.batas_at, batas_sesudah: baru },
  });
  if (id === null) return gagal("Tindakan belum dapat dicatat.");
  const { data, error } = await db.from("sigap_tes_sesi").update({ batas_at: baru, diubah_at: sekarang.toISOString() }).eq("id", sesi.id).is("selesai_at", null).select("id");
  if (error || !data || (data as unknown[]).length === 0) {
    await hapusCatatan(db, id);
    return gagal("Keadaan peserta berubah (mungkin baru saja mengirim). Muat ulang lalu coba lagi.");
  }
  return { ok: true, id, ringkas: `${nama}: ${labelTes(tes)} ditambah ${inp.menit} menit, berlaku sampai pukul ${jamWib(baru)} WIB.` };
}

/** Buka ulang percobaan yang sudah selesai: jawaban tersimpan tetap, skor dikosongkan sementara, waktu = sekarang + tambahan. */
export async function bukaUlangSesi(db: Db, kegiatanId: number, oleh: number, inp: InputWaktu, sekarang: Date = new Date()): Promise<HasilTes> {
  const s = await siapkanTes(db, kegiatanId, inp);
  if (!s.ok) return s;
  const { tes, sesi, nama, alasan } = s;
  if (!sesi) return gagal(`${nama} belum memulai ${labelTes(tes)}. Bila tes sudah ditutup, pakai “Buka kunci” (izin hari ini).`);
  if (!sesi.selesai_at) {
    // waktunya sudah lewat tetapi belum dinilai: sama dengan tambah waktu
    if (new Date(sesi.batas_at).getTime() <= sekarang.getTime()) return tambahWaktu(db, kegiatanId, oleh, inp, sekarang);
    return gagal(`${nama} masih mengerjakan ${labelTes(tes)}. Pakai “Tambah waktu”.`);
  }
  const baru = new Date(sekarang.getTime() + inp.menit * 60_000).toISOString();
  const id = await catat(db, kegiatanId, oleh, {
    jenis: "tes_buka_ulang",
    akun_id: inp.akun_id,
    tes_id: inp.tes_id,
    alasan,
    detail: { menit: inp.menit, tes: tes.jenis, skor_sebelum: sesi.skor, ringkas: `${nama}: ${labelTes(tes)} dibuka ulang ${inp.menit} menit${sesi.skor != null ? ` (skor ${sesi.skor} dikosongkan sementara)` : ""}` },
    snapshot: {
      sesi_id: sesi.id,
      percobaan: sesi.percobaan,
      sebelum: { selesai_at: sesi.selesai_at, batas_at: sesi.batas_at, skor: sesi.skor, benar: sesi.benar, total: sesi.total, skor_awal: sesi.skor_awal ?? null },
      jawaban: sesi.jawaban,
      batas_sesudah: baru,
    },
  });
  if (id === null) return gagal("Tindakan belum dapat dicatat.");
  const dasar: Obj = { selesai_at: null, batas_at: baru, skor: null, benar: null, total: null, diubah_at: sekarang.toISOString() };
  const tulis = (isi: Obj) => db.from("sigap_tes_sesi").update(isi).eq("id", sesi.id).not("selesai_at", "is", null).select("id");
  // percobaan pertama: skor_awal (nilai resmi aturan versi 2) ikut dikosongkan sampai dinilai ulang
  let r = sesi.percobaan <= 1 && sesi.skor_awal !== undefined ? await tulis({ ...dasar, skor_awal: null }) : await tulis(dasar);
  if (r.error && sesi.percobaan <= 1) r = await tulis(dasar);
  if (r.error || !r.data || (r.data as unknown[]).length === 0) {
    await hapusCatatan(db, id);
    return gagal("Keadaan peserta berubah. Muat ulang lalu coba lagi.");
  }
  return { ok: true, id, ringkas: `${nama}: ${labelTes(tes)} dibuka ulang, lanjut dari jawaban tersimpan sampai pukul ${jamWib(baru)} WIB. Skor dihitung lagi saat ia mengirim.` };
}

// ----------------------------------------------------------------------------
// Hitung ulang nilai (soal dinonaktifkan / diaktifkan kembali)
// ----------------------------------------------------------------------------

export type DampakSoal = {
  /** Peserta yang punya percobaan selesai pada tes ini. */
  peserta_selesai: number;
  /** Peserta yang nilai resminya berubah. */
  berubah: number;
  rata_sebelum: number | null;
  rata_sesudah: number | null;
  /** Hanya bila tes wajib lulus: yang menjadi lulus / tidak lagi lulus. */
  lulus_naik: number;
  lulus_turun: number;
  contoh: { akun_id: number; nama: string; sebelum: number | null; sesudah: number | null }[];
};

type Arsip = { sesi_id: number; percobaan: number; jawaban: Record<string, string>; skor: number | null; benar: number | null; total: number | null };

async function bacaSemuaSesi(db: Db, tesId: number): Promise<{ sesi: Sesi[]; punyaAwal: boolean }> {
  const q = (k: string) => db.from("sigap_tes_sesi").select(k).eq("tes_id", tesId).limit(10000);
  let r = await q(`${KOLOM_SESI}, skor_awal`);
  let punyaAwal = true;
  if (r.error) {
    punyaAwal = false;
    r = await q(KOLOM_SESI);
  }
  return { sesi: ((r.data ?? []) as Obj[]).map(rapikanSesi), punyaAwal };
}

/**
 * Hitung ulang skor tiap percobaan SELESAI (sesi berjalan dan arsip) terhadap `soalAktif`. `tulis=false` hanya menghitung dampak.
 * Jawaban dibaca dari penyimpanan (termasuk jawaban untuk soal yang sedang nonaktif), sehingga hasilnya selalu turunan dari jawaban dan soal aktif:
 * mengaktifkan kembali sebuah soal selalu memulihkan nilai semula.
 */
export async function hitungUlangTes(db: Db, kegiatanId: number, tes: TesBaris, soalAktif: SoalLengkap[], semuaSoal: SoalLengkap[], tulis: boolean): Promise<{ ok: true; dampak: DampakSoal } | Gagal> {
  const { sesi: semuaSesi, punyaAwal } = await bacaSemuaSesi(db, tes.id);
  const selesai = semuaSesi.filter((s) => s.selesai_at);
  const arsipPer = new Map<number, Arsip[]>();
  if (selesai.length > 0) {
    const { data } = await db.from("sigap_tes_sesi_arsip").select("sesi_id, percobaan, jawaban, skor, benar, total").in("sesi_id", selesai.map((s) => s.id)).limit(20000);
    for (const r of (data ?? []) as Obj[]) {
      const a: Arsip = { sesi_id: num(r.sesi_id), percobaan: num(r.percobaan), jawaban: (r.jawaban as Record<string, string>) ?? {}, skor: angkaAtauNull(r.skor), benar: angkaAtauNull(r.benar), total: angkaAtauNull(r.total) };
      const l = arsipPer.get(a.sesi_id) ?? [];
      l.push(a);
      arsipPer.set(a.sesi_id, l);
    }
  }
  const aturan = await muatAturan(db, kegiatanId);
  const hitung = (jawaban: Record<string, string>) => hitungSkor(soalAktif, bersihkanJawaban(jawaban, semuaSoal));
  const ambang = tes.wajib_lulus ? (tes.nilai_lulus != null ? Number(tes.nilai_lulus) : 70) : null;

  type Tulis = { sesi: Sesi; isi: Obj; arsip: { a: Arsip; skor: number; benar: number; total: number }[] };
  const kerja: Tulis[] = [];
  const sebelumResmi: (number | null)[] = [];
  const sesudahResmi: (number | null)[] = [];
  const perubahan: { akun_id: number; sebelum: number | null; sesudah: number | null }[] = [];
  let berubah = 0;
  let lulusNaik = 0;
  let lulusTurun = 0;

  for (const s of selesai) {
    const arsip = (arsipPer.get(s.id) ?? []).sort((a, b) => a.percobaan - b.percobaan);
    const h = hitung(s.jawaban);
    const arsipBaru = arsip.map((a) => {
      const x = hitung(a.jawaban);
      return { a, skor: x.skor, benar: x.benar, total: x.total };
    });
    const terbaikBaru = arsipBaru.length > 0 ? Math.max(...arsipBaru.map((x) => x.skor)) : s.skor_terbaik;
    const awalLama = arsip.find((a) => a.percobaan === 1)?.skor ?? null;
    const awalArsipBaru = arsipBaru.find((x) => x.a.percobaan === 1)?.skor ?? null;
    const awalBaru = s.percobaan <= 1 ? h.skor : awalArsipBaru ?? s.skor_awal ?? null;

    const sebelum = nilaiResmiTes(aturan.versi, { percobaan: s.percobaan, selesai_at: s.selesai_at, skor: s.skor, skor_terbaik: s.skor_terbaik, skor_awal: s.skor_awal }, awalLama);
    const sesudah = nilaiResmiTes(aturan.versi, { percobaan: s.percobaan, selesai_at: s.selesai_at, skor: h.skor, skor_terbaik: terbaikBaru, skor_awal: awalBaru }, awalArsipBaru);
    sebelumResmi.push(sebelum);
    sesudahResmi.push(sesudah);

    const isi: Obj = {};
    if (!sama(s.skor, h.skor)) isi.skor = h.skor;
    if (!sama(s.benar, h.benar)) isi.benar = h.benar;
    if (!sama(s.total, h.total)) isi.total = h.total;
    if (!sama(s.skor_terbaik, terbaikBaru)) isi.skor_terbaik = terbaikBaru;
    if (punyaAwal && !sama(s.skor_awal ?? null, awalBaru) && awalBaru !== null) isi.skor_awal = awalBaru;
    const arsipUbah = arsipBaru.filter((x) => !sama(x.a.skor, x.skor) || !sama(x.a.benar, x.benar) || !sama(x.a.total, x.total));
    if (Object.keys(isi).length > 0 || arsipUbah.length > 0) kerja.push({ sesi: s, isi, arsip: arsipUbah });

    if (!sama(sebelum, sesudah)) {
      berubah++;
      perubahan.push({ akun_id: s.akun_id, sebelum, sesudah });
    }
    if (ambang !== null && sebelum !== null && sesudah !== null) {
      const dulu = lulusMenurut(aturan.versi, sebelum, ambang);
      const kini = lulusMenurut(aturan.versi, sesudah, ambang);
      if (!dulu && kini) lulusNaik++;
      if (dulu && !kini) lulusTurun++;
    }
  }

  if (tulis) {
    for (let i = 0; i < kerja.length; i += 15) {
      const bagian = kerja.slice(i, i + 15);
      const hasil = await Promise.all(
        bagian.map(async (k) => {
          const galat: boolean[] = [];
          if (Object.keys(k.isi).length > 0) {
            const { error } = await db.from("sigap_tes_sesi").update(k.isi).eq("id", k.sesi.id).not("selesai_at", "is", null);
            galat.push(!!error);
          }
          for (const x of k.arsip) {
            const { error } = await db.from("sigap_tes_sesi_arsip").update({ skor: x.skor, benar: x.benar, total: x.total }).eq("sesi_id", x.a.sesi_id).eq("percobaan", x.a.percobaan);
            galat.push(!!error);
          }
          return galat.some(Boolean);
        })
      );
      if (hasil.some(Boolean)) return gagal("Sebagian nilai gagal dihitung ulang.");
    }
  }

  const rata = (xs: (number | null)[]) => {
    const ada = xs.filter((x): x is number => x !== null);
    return ada.length > 0 ? bulat2(ada.reduce((a, b) => a + b, 0) / ada.length) : null;
  };
  const urut = perubahan.sort((a, b) => Math.abs((b.sesudah ?? 0) - (b.sebelum ?? 0)) - Math.abs((a.sesudah ?? 0) - (a.sebelum ?? 0))).slice(0, 10);
  const nama = await namaAkunPeta(db, urut.map((x) => x.akun_id));
  return {
    ok: true,
    dampak: {
      peserta_selesai: selesai.length,
      berubah,
      rata_sebelum: rata(sebelumResmi),
      rata_sesudah: rata(sesudahResmi),
      lulus_naik: lulusNaik,
      lulus_turun: lulusTurun,
      contoh: urut.map((x) => ({ ...x, nama: nama.get(x.akun_id)?.nama ?? `Akun ${x.akun_id}` })),
    },
  };
}

type InputSoal = { tes_id: number; nomor: number[]; alasan: string };

function periksaNomor(semua: { nomor: number; aktif: boolean }[], nomor: unknown): { ok: true; nomor: number[] } | Gagal {
  if (!Array.isArray(nomor) || nomor.length === 0) return gagal("Pilih soal yang bermasalah dulu.");
  const n = Array.from(new Set(nomor.map(Number)));
  if (n.some((x) => !Number.isInteger(x) || x <= 0)) return gagal("Nomor soal tidak valid.");
  for (const x of n) {
    const s = semua.find((y) => y.nomor === x);
    if (!s) return gagal(`Soal nomor ${x} tidak ditemukan.`);
    if (!s.aktif) return gagal(`Soal nomor ${x} sudah nonaktif.`);
  }
  if (semua.filter((s) => s.aktif && !n.includes(s.nomor)).length === 0) return gagal("Minimal satu soal harus tetap aktif.");
  return { ok: true, nomor: n.sort((a, b) => a - b) };
}

/** Pratinjau dampak menonaktifkan soal (tidak menulis apa pun). */
export async function pratinjauSoal(db: Db, kegiatanId: number, tesId: number, nomor: unknown): Promise<{ ok: true; dampak: DampakSoal } | Gagal> {
  const tes = await tesKegiatan(db, kegiatanId, tesId);
  if (!tes) return gagal("Tes itu bukan milik pelatihan ini.");
  const semua = await muatSemuaSoal(db, tesId);
  const n = periksaNomor(semua, nomor);
  if (!n.ok) return n;
  const aktifBaru = semua.filter((s) => s.aktif && !n.nomor.includes(s.nomor));
  return hitungUlangTes(db, kegiatanId, tes, aktifBaru, semua, false);
}

const bersihSoal = (s: SoalLengkap & { aktif?: boolean }): SoalLengkap => ({ nomor: s.nomor, teks: s.teks, opsi: s.opsi, kunci: s.kunci, bobot: s.bobot });

export type HasilSoal = { ok: true; id: number; ringkas: string; dampak: DampakSoal } | Gagal;

/** Nonaktifkan soal bermasalah lalu hitung ulang nilai semua peserta. Gagal di tengah jalan -> soal diaktifkan kembali dan nilai dihitung ulang seperti semula. */
export async function nonaktifkanSoal(db: Db, kegiatanId: number, oleh: number, inp: InputSoal): Promise<HasilSoal> {
  if (!Number.isInteger(inp.tes_id) || inp.tes_id <= 0) return gagal("Tes tidak valid.");
  const al = periksaAlasan(inp.alasan);
  if (!al.ok) return al;
  if (!(await tabelAda(db)) || !(await kolomAktifAda(db))) return gagal(PESAN_SQL);
  const tes = await tesKegiatan(db, kegiatanId, inp.tes_id);
  if (!tes) return gagal("Tes itu bukan milik pelatihan ini.");
  const semua = await muatSemuaSoal(db, inp.tes_id);
  const n = periksaNomor(semua, inp.nomor);
  if (!n.ok) return n;
  const aktifBaru = semua.filter((s) => s.aktif && !n.nomor.includes(s.nomor)).map(bersihSoal);
  const semuaBersih = semua.map(bersihSoal);
  const daftar = n.nomor.join(", ");

  const id = await catat(db, kegiatanId, oleh, {
    jenis: "soal_nonaktif",
    akun_id: null,
    tes_id: inp.tes_id,
    alasan: al.alasan,
    detail: { tes: tes.jenis, nomor: n.nomor, ringkas: `${labelTes(tes)}: soal nomor ${daftar} dinonaktifkan` },
    snapshot: { nomor: n.nomor },
  });
  if (id === null) return gagal("Tindakan belum dapat dicatat.");

  const pulih = async () => {
    await db.from("sigap_tes_soal").update({ aktif: true }).eq("tes_id", inp.tes_id).in("nomor", n.nomor);
    await hitungUlangTes(db, kegiatanId, tes, semuaBersih, semuaBersih, true);
    await hapusCatatan(db, id);
  };
  const { error } = await db.from("sigap_tes_soal").update({ aktif: false }).eq("tes_id", inp.tes_id).in("nomor", n.nomor);
  if (error) {
    await hapusCatatan(db, id);
    return gagal("Soal belum dapat dinonaktifkan.");
  }
  const h = await hitungUlangTes(db, kegiatanId, tes, aktifBaru, semuaBersih, true);
  if (!h.ok) {
    await pulih();
    return gagal("Penghitungan ulang nilai gagal; soal diaktifkan kembali dan nilai dikembalikan seperti semula.");
  }
  const d = h.dampak;
  const ringkas = `Soal nomor ${daftar} ${labelTes(tes)} dinonaktifkan. ${d.berubah} dari ${d.peserta_selesai} peserta nilainya berubah${d.rata_sebelum !== null && d.rata_sesudah !== null ? ` (rata-rata ${d.rata_sebelum} → ${d.rata_sesudah})` : ""}.`;
  await perbaruiDetail(db, id, { tes: tes.jenis, nomor: n.nomor, ringkas, dampak: { ...d, contoh: undefined } });
  return { ok: true, id, ringkas, dampak: d };
}

// ----------------------------------------------------------------------------
// Pindah kelas / atasan
// ----------------------------------------------------------------------------

export type InputPindah = { akun_id: number; kelas?: number | null; atasan_akun_id?: number | null; bawahan_ikut?: boolean; alasan: string };
type SnapPindah = {
  akun_id: number;
  penugasan_id: number;
  kelas_sebelum: number | null;
  kelas_sesudah: number | null;
  kelas_berubah: boolean;
  atasan_berubah: boolean;
  atasan_sebelum: number | null;
  atasan_sesudah: number | null;
  hierarki_sebelum: Hier | null;
  bawahan: { akun_id: number; penugasan_id: number; kelas_sebelum: number | null }[];
};
export type HasilBiasa = { ok: true; id: number; ringkas: string } | Gagal;

const kelasSah = (k: unknown): k is number => typeof k === "number" && Number.isInteger(k) && k >= 1 && k <= 99;

/** Rantai atasan dari `mulai` ke atas melewati `target`? (membuat atasan melingkar) */
function melingkar(hier: Hier[], target: number, mulai: number): boolean {
  const peta = new Map(hier.map((h) => [h.akun_id, h.atasan_akun_id]));
  const lihat = new Set<number>();
  let id: number | null = mulai;
  while (id !== null && !lihat.has(id)) {
    if (id === target) return true;
    lihat.add(id);
    id = peta.get(id) ?? null;
  }
  return false;
}

export async function pindahPeserta(db: Db, kegiatanId: number, oleh: number, inp: InputPindah): Promise<HasilBiasa> {
  if (!Number.isInteger(inp.akun_id) || inp.akun_id <= 0) return gagal("Peserta tidak valid.");
  const al = periksaAlasan(inp.alasan);
  if (!al.ok) return al;
  if (!(await tabelAda(db))) return gagal(PESAN_SQL);
  if (inp.kelas !== undefined && inp.kelas !== null && !kelasSah(inp.kelas)) return gagal("Nomor kelas tidak valid.");
  if (inp.atasan_akun_id !== undefined && inp.atasan_akun_id !== null && (!Number.isInteger(inp.atasan_akun_id) || inp.atasan_akun_id <= 0)) return gagal("Atasan tidak valid.");

  const aktif = await penugasanAktif(db, kegiatanId);
  const pen = aktif.find((p) => p.akun_id === inp.akun_id);
  if (!pen) return gagal("Nama itu bukan peserta aktif pelatihan ini.");
  const hier = await hierarkiSemua(db, kegiatanId);
  const hierIni = hier.find((h) => h.akun_id === inp.akun_id) ?? null;

  const kelasBerubah = inp.kelas !== undefined && (inp.kelas ?? null) !== pen.kelas;
  const atasanLama = hierIni?.atasan_akun_id ?? null;
  const atasanBerubah = inp.atasan_akun_id !== undefined && (inp.atasan_akun_id ?? null) !== atasanLama;
  if (!kelasBerubah && !atasanBerubah) return gagal("Tidak ada yang berubah: kelas dan atasan sama dengan sekarang.");

  const atasanBaru = atasanBerubah ? inp.atasan_akun_id ?? null : atasanLama;
  if (atasanBerubah && atasanBaru !== null) {
    if (atasanBaru === inp.akun_id) return gagal("Atasan tidak boleh diri sendiri.");
    if (!aktif.some((p) => p.akun_id === atasanBaru)) return gagal("Atasan harus peserta aktif pelatihan ini.");
    if (melingkar(hier, inp.akun_id, atasanBaru)) return gagal("Pilihan itu membuat atasan melingkar (atasan itu sendiri berada di bawah peserta ini).");
  }
  if (atasanBerubah && !hierIni && !peranSah(pen.peran)) return gagal("Peran peserta ini tidak punya hierarki, jadi atasannya tidak dapat diatur.");

  const kelasBaru = kelasBerubah ? inp.kelas ?? null : pen.kelas;
  const bawahan: SnapPindah["bawahan"] = [];
  if (kelasBerubah && inp.bawahan_ikut) {
    const idBawahan = new Set(hier.filter((h) => h.atasan_akun_id === inp.akun_id).map((h) => h.akun_id));
    for (const p of aktif) if (idBawahan.has(p.akun_id) && p.kelas !== kelasBaru) bawahan.push({ akun_id: p.akun_id, penugasan_id: p.id, kelas_sebelum: p.kelas });
  }

  const snap: SnapPindah = {
    akun_id: inp.akun_id,
    penugasan_id: pen.id,
    kelas_sebelum: pen.kelas,
    kelas_sesudah: kelasBaru,
    kelas_berubah: kelasBerubah,
    atasan_berubah: atasanBerubah,
    atasan_sebelum: atasanLama,
    atasan_sesudah: atasanBaru,
    hierarki_sebelum: hierIni,
    bawahan,
  };
  const nama = await namaAkunPeta(db, [inp.akun_id, atasanLama ?? 0, atasanBaru ?? 0].filter((x) => x > 0));
  const n = (id: number | null) => (id === null ? "tanpa atasan" : nama.get(id)?.nama ?? `Akun ${id}`);
  const bagian: string[] = [];
  if (kelasBerubah) bagian.push(`kelas ${pen.kelas ?? "—"} → ${kelasBaru ?? "—"}${bawahan.length ? ` (+${bawahan.length} bawahan ikut)` : ""}`);
  if (atasanBerubah) bagian.push(`atasan ${n(atasanLama)} → ${n(atasanBaru)}`);
  const namaIni = nama.get(inp.akun_id)?.nama ?? `Akun ${inp.akun_id}`;
  const ringkas = `${namaIni}: ${bagian.join("; ")}`;

  const id = await catat(db, kegiatanId, oleh, { jenis: "pindah", akun_id: inp.akun_id, tes_id: null, alasan: al.alasan, detail: { ringkas }, snapshot: snap });
  if (id === null) return gagal("Tindakan belum dapat dicatat.");
  try {
    if (kelasBerubah) {
      const { error } = await db.from("sigap_penugasan").update({ kelas: kelasBaru }).eq("id", pen.id);
      if (error) throw new Error("kelas");
      for (const b of bawahan) {
        const r = await db.from("sigap_penugasan").update({ kelas: kelasBaru }).eq("id", b.penugasan_id);
        if (r.error) throw new Error("kelas bawahan");
      }
    }
    if (atasanBerubah) {
      const { error } = await db
        .from("sigap_pelatihan_hierarki")
        .upsert({ kegiatan_id: kegiatanId, akun_id: inp.akun_id, peran_pelatihan: hierIni?.peran_pelatihan ?? pen.peran, atasan_akun_id: atasanBaru, sumber: "manual", diubah_oleh: String(oleh), diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id,akun_id" });
      if (error) throw new Error("atasan");
    }
  } catch {
    try {
      await pulihkanPindah(db, kegiatanId, snap);
    } catch {
      return gagal("Perpindahan gagal sebagian. Periksa tab Tim & Peserta.");
    }
    await hapusCatatan(db, id);
    return gagal("Perpindahan gagal; keadaan dikembalikan seperti semula.");
  }
  return { ok: true, id, ringkas: `${ringkas}.` };
}

async function pulihkanPindah(db: Db, kegiatanId: number, snap: SnapPindah): Promise<void> {
  if (snap.kelas_berubah) {
    await db.from("sigap_penugasan").update({ kelas: snap.kelas_sebelum }).eq("id", snap.penugasan_id);
    // bawahan hanya dikembalikan bila masih berada di kelas hasil perpindahan (tidak menimpa perubahan sesudahnya)
    for (const b of snap.bawahan) {
      const q = db.from("sigap_penugasan").update({ kelas: b.kelas_sebelum }).eq("id", b.penugasan_id);
      await (snap.kelas_sesudah === null ? q.is("kelas", null) : q.eq("kelas", snap.kelas_sesudah));
    }
  }
  if (snap.atasan_berubah) {
    const h = snap.hierarki_sebelum;
    if (h) {
      await db
        .from("sigap_pelatihan_hierarki")
        .upsert({ kegiatan_id: kegiatanId, akun_id: h.akun_id, peran_pelatihan: h.peran_pelatihan, atasan_akun_id: h.atasan_akun_id, sumber: h.sumber, diubah_oleh: h.diubah_oleh, diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id,akun_id" });
    } else {
      await db.from("sigap_pelatihan_hierarki").delete().eq("kegiatan_id", kegiatanId).eq("akun_id", snap.akun_id);
    }
  }
}

// ----------------------------------------------------------------------------
// Tambah peserta mendadak
// ----------------------------------------------------------------------------

export type InputTambah = { akun_id: number; peran: string; kelas: number | null; atasan_akun_id?: number | null; alasan: string };
type SnapTambah = { akun_id: number; penugasan_sebelum: Penugasan | null; hierarki_sebelum: Hier | null; penugasan_id: number | null };

/** maks_hari yang diwarisi: peserta aktif sekelas seperan, lalu seperan; kosong bila tak ada. */
function warisMaksHari(aktif: Penugasan[], peran: string, kelas: number | null): number | null {
  const ambil = (daftar: Penugasan[]) => {
    const hitung = new Map<number, number>();
    for (const p of daftar) if (p.maks_hari !== null) hitung.set(p.maks_hari, (hitung.get(p.maks_hari) ?? 0) + 1);
    return [...hitung.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
  };
  return ambil(aktif.filter((p) => p.peran === peran && p.kelas === kelas)) ?? ambil(aktif.filter((p) => p.peran === peran));
}

export async function tambahPeserta(db: Db, kegiatanId: number, oleh: number, inp: InputTambah): Promise<HasilBiasa> {
  if (!Number.isInteger(inp.akun_id) || inp.akun_id <= 0) return gagal("Pilih nama yang akan ditambahkan.");
  if (!peranSah(inp.peran)) return gagal("Pilih peran: PPL, PML, atau Korwil.");
  if (inp.kelas !== null && !kelasSah(inp.kelas)) return gagal("Nomor kelas tidak valid.");
  const al = periksaAlasan(inp.alasan);
  if (!al.ok) return al;
  if (!(await tabelAda(db))) return gagal(PESAN_SQL);

  const { data: ak } = await db.from("sigap_akun").select("id, nama, aktif").eq("id", inp.akun_id).maybeSingle();
  if (!ak) return gagal("Akun tidak ditemukan.");
  if ((ak as Obj).aktif === false) return gagal("Akun ini tidak aktif.");
  const nama = String((ak as Obj).nama);
  const lama = await penugasanAkun(db, kegiatanId, inp.akun_id);
  if (lama?.aktif && lama.sumber === "administrasi") return gagal(`${nama} tercatat sebagai peserta tambahan administrasi. Ubah dari tab Administrasi.`);
  if (lama?.aktif) return gagal(`${nama} sudah menjadi peserta pelatihan ini.`);
  const { data: tl } = await db.from("sigap_pelatihan_undangan_respons").select("respons").eq("kegiatan_id", kegiatanId).eq("akun_id", inp.akun_id).maybeSingle();
  if ((tl as Obj | null)?.respons === "tolak") return gagal(`${nama} sudah menolak undangan pelatihan ini.`);

  const aktif = await penugasanAktif(db, kegiatanId);
  const atasan = inp.atasan_akun_id ?? null;
  if (atasan !== null && !aktif.some((p) => p.akun_id === atasan)) return gagal("Atasan harus peserta aktif pelatihan ini.");
  const hierLama = (await hierarkiSemua(db, kegiatanId)).find((h) => h.akun_id === inp.akun_id) ?? null;
  const maks = warisMaksHari(aktif, inp.peran, inp.kelas);
  const sumber = `koreksi:${oleh}`;
  const snap: SnapTambah = { akun_id: inp.akun_id, penugasan_sebelum: lama, hierarki_sebelum: hierLama, penugasan_id: lama?.id ?? null };

  let namaAtasan = "";
  if (atasan !== null) namaAtasan = (await namaAkunPeta(db, [atasan])).get(atasan)?.nama ?? `Akun ${atasan}`;
  const ringkas = `${nama} ditambahkan sebagai ${inp.peran.toUpperCase()}${inp.kelas !== null ? ` kelas ${inp.kelas}` : ""}${atasan !== null ? `, atasan ${namaAtasan}` : ""}`;
  const id = await catat(db, kegiatanId, oleh, { jenis: "peserta_tambah", akun_id: inp.akun_id, tes_id: null, alasan: al.alasan, detail: { ringkas, peran: inp.peran, kelas: inp.kelas, atasan }, snapshot: snap });
  if (id === null) return gagal("Tindakan belum dapat dicatat.");

  try {
    if (lama) {
      const { error } = await db.from("sigap_penugasan").update({ aktif: true, peran: inp.peran, kelas: inp.kelas, sumber, maks_hari: maks }).eq("id", lama.id);
      if (error) throw new Error("penugasan");
    } else {
      const { data, error } = await db.from("sigap_penugasan").insert({ kegiatan_id: kegiatanId, akun_id: inp.akun_id, peran: inp.peran, kelas: inp.kelas, aktif: true, sumber, maks_hari: maks }).select("id").single();
      if (error || !data) throw new Error("penugasan");
      snap.penugasan_id = num((data as Obj).id);
    }
    const { error } = await db
      .from("sigap_pelatihan_hierarki")
      .upsert({ kegiatan_id: kegiatanId, akun_id: inp.akun_id, peran_pelatihan: inp.peran, atasan_akun_id: atasan, sumber: "manual", diubah_oleh: String(oleh), diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id,akun_id" });
    if (error) throw new Error("hierarki");
    await db.from("sigap_pelatihan_koreksi").update({ snapshot: snap }).eq("id", id);
  } catch {
    try {
      await pulihkanTambah(db, kegiatanId, snap);
    } catch {
      return gagal("Penambahan gagal sebagian. Periksa tab Tim & Peserta.");
    }
    await hapusCatatan(db, id);
    return gagal("Penambahan gagal; keadaan dikembalikan seperti semula.");
  }
  return { ok: true, id, ringkas: `${ringkas}. ${nama} perlu menerima undangan di HP.` };
}

async function pulihkanTambah(db: Db, kegiatanId: number, snap: SnapTambah): Promise<void> {
  const h = snap.hierarki_sebelum;
  if (h) {
    await db
      .from("sigap_pelatihan_hierarki")
      .upsert({ kegiatan_id: kegiatanId, akun_id: h.akun_id, peran_pelatihan: h.peran_pelatihan, atasan_akun_id: h.atasan_akun_id, sumber: h.sumber, diubah_oleh: h.diubah_oleh, diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id,akun_id" });
  } else {
    await db.from("sigap_pelatihan_hierarki").delete().eq("kegiatan_id", kegiatanId).eq("akun_id", snap.akun_id);
  }
  const p = snap.penugasan_sebelum;
  if (p) {
    await db.from("sigap_penugasan").update({ aktif: p.aktif, peran: p.peran, kelas: p.kelas, sumber: p.sumber, maks_hari: p.maks_hari }).eq("id", p.id);
  } else {
    const { error } = await db.from("sigap_penugasan").delete().eq("kegiatan_id", kegiatanId).eq("akun_id", snap.akun_id);
    if (error) await db.from("sigap_penugasan").update({ aktif: false }).eq("kegiatan_id", kegiatanId).eq("akun_id", snap.akun_id); // sudah ada jejak lain: cukup dinonaktifkan
  }
}

// ----------------------------------------------------------------------------
// Urungkan: pemeriksaan "keadaan belum berubah" (murni) + konteks yang dimuat sekali
// ----------------------------------------------------------------------------

export type BarisKoreksi = { id: number; kegiatan_id: number; jenis: JenisKoreksi; akun_id: number | null; tes_id: number | null; alasan: string; detail: Obj; snapshot: Obj; oleh: number | null; at: string; dibatalkan_at: string | null };
const KOLOM_KOREKSI = "id, kegiatan_id, jenis, akun_id, tes_id, alasan, detail, snapshot, oleh, at, dibatalkan_at";
const rapikanKoreksi = (r: Obj): BarisKoreksi => ({ ...r, id: num(r.id), kegiatan_id: num(r.kegiatan_id), akun_id: r.akun_id == null ? null : num(r.akun_id), tes_id: r.tes_id == null ? null : num(r.tes_id), oleh: r.oleh == null ? null : num(r.oleh), detail: r.detail ?? {}, snapshot: r.snapshot ?? {}, dibatalkan_at: r.dibatalkan_at ?? null }) as BarisKoreksi;

export type Konteks = {
  sesi: Map<number, Sesi>;
  soalNonaktif: Map<number, Set<number>>; // tes_id -> nomor yang sedang nonaktif
  penugasan: Map<number, Penugasan>; // per id baris
  hierarki: Map<number, Hier>; // per akun
  jejakTes: Set<number>; // akun yang punya sesi tes
  jejakPresensi: Set<number>; // akun yang punya presensi
};

async function muatKonteks(db: Db, kegiatanId: number, baris: readonly BarisKoreksi[]): Promise<Konteks> {
  const buka = baris.filter((b) => !b.dibatalkan_at);
  const sesiIds = buka.map((b) => (b.jenis === "tes_waktu" || b.jenis === "tes_buka_ulang" ? num(b.snapshot.sesi_id) : 0)).filter((x) => x > 0);
  const sesi = new Map<number, Sesi>();
  if (sesiIds.length > 0) {
    const q = (k: string) => db.from("sigap_tes_sesi").select(k).in("id", sesiIds).limit(5000);
    let r = await q(`${KOLOM_SESI}, skor_awal`);
    if (r.error) r = await q(KOLOM_SESI);
    for (const x of (r.data ?? []) as Obj[]) sesi.set(num(x.id), rapikanSesi(x));
  }
  const soalNonaktif = new Map<number, Set<number>>();
  for (const b of buka.filter((x) => x.jenis === "soal_nonaktif" && x.tes_id !== null)) {
    if (soalNonaktif.has(b.tes_id as number)) continue;
    const semua = await muatSemuaSoal(db, b.tes_id as number);
    soalNonaktif.set(b.tes_id as number, new Set(semua.filter((s) => !s.aktif).map((s) => s.nomor)));
  }
  const penugasan = new Map<number, Penugasan>();
  const hierarki = new Map<number, Hier>();
  if (buka.some((b) => b.jenis === "pindah" || b.jenis === "peserta_tambah")) {
    const { data } = await db.from("sigap_penugasan").select(KOLOM_PEN).eq("kegiatan_id", kegiatanId).limit(5000);
    for (const r of (data ?? []) as Obj[]) penugasan.set(num(r.id), rapikanPen(r));
    for (const h of await hierarkiSemua(db, kegiatanId)) hierarki.set(h.akun_id, h);
  }
  const jejakTes = new Set<number>();
  const jejakPresensi = new Set<number>();
  const tambah = buka.filter((b) => b.jenis === "peserta_tambah" && b.akun_id !== null).map((b) => b.akun_id as number);
  if (tambah.length > 0) {
    const { data: s } = await db.from("sigap_tes_sesi").select("akun_id").in("akun_id", tambah).limit(5000);
    for (const r of (s ?? []) as Obj[]) jejakTes.add(num(r.akun_id));
    const { data: p } = await db.from("sigap_pelatihan_presensi").select("akun_id").eq("kegiatan_id", kegiatanId).in("akun_id", tambah).limit(5000);
    for (const r of (p ?? []) as Obj[]) jejakPresensi.add(num(r.akun_id));
  }
  return { sesi, soalNonaktif, penugasan, hierarki, jejakTes, jejakPresensi };
}

/** Apakah koreksi ini masih bisa diurungkan (keadaan yang dikoreksi belum berubah)? Murni. */
export function bisaUrung(k: BarisKoreksi, c: Konteks): { ok: true } | Gagal {
  if (k.dibatalkan_at) return gagal("Tindakan ini sudah diurungkan.");
  const sn = k.snapshot;
  if (k.jenis === "tes_waktu") {
    const s = c.sesi.get(num(sn.sesi_id));
    if (!s) return gagal("Sesi peserta tidak ditemukan.");
    if (s.selesai_at) return gagal("Peserta sudah selesai mengerjakan, tidak dapat diurungkan.");
    if (!samaWaktu(s.batas_at, sn.batas_sesudah)) return gagal("Waktu peserta sudah diubah lagi, tidak dapat diurungkan.");
    return { ok: true };
  }
  if (k.jenis === "tes_buka_ulang") {
    const s = c.sesi.get(num(sn.sesi_id));
    if (!s) return gagal("Sesi peserta tidak ditemukan.");
    if (s.selesai_at) return gagal("Peserta sudah mengirim ulang, tidak dapat diurungkan.");
    if (s.percobaan !== num(sn.percobaan) || !samaWaktu(s.batas_at, sn.batas_sesudah)) return gagal("Percobaan peserta sudah berubah, tidak dapat diurungkan.");
    if (JSON.stringify(sortKunci(s.jawaban)) !== JSON.stringify(sortKunci(sn.jawaban ?? {}))) return gagal("Peserta sudah mengubah jawabannya, tidak dapat diurungkan.");
    return { ok: true };
  }
  if (k.jenis === "soal_nonaktif") {
    const non = c.soalNonaktif.get(k.tes_id ?? -1) ?? new Set<number>();
    const nomor = (sn.nomor as number[]) ?? [];
    if (!nomor.some((n) => non.has(n))) return gagal("Soal itu sudah aktif kembali.");
    return { ok: true };
  }
  if (k.jenis === "pindah") {
    const p = c.penugasan.get(num(sn.penugasan_id));
    if (!p) return gagal("Data penugasan tidak ditemukan.");
    if (sn.kelas_berubah && p.kelas !== (sn.kelas_sesudah ?? null)) return gagal("Kelas peserta sudah diubah lagi, tidak dapat diurungkan.");
    if (sn.atasan_berubah && (c.hierarki.get(num(sn.akun_id))?.atasan_akun_id ?? null) !== (sn.atasan_sesudah ?? null)) return gagal("Atasan peserta sudah diubah lagi, tidak dapat diurungkan.");
    return { ok: true };
  }
  if (k.jenis === "peserta_tambah") {
    const akun = num(sn.akun_id);
    const p = c.penugasan.get(num(sn.penugasan_id));
    if (!p || !p.aktif) return gagal("Peserta ini sudah tidak aktif.");
    if (c.jejakTes.has(akun) || c.jejakPresensi.has(akun)) return gagal("Peserta ini sudah mulai mengikuti pelatihan (tes atau presensi), tidak dapat diurungkan.");
    for (const h of c.hierarki.values()) if (h.atasan_akun_id === akun) return gagal("Peserta ini sudah menjadi atasan petugas lain, tidak dapat diurungkan.");
    return { ok: true };
  }
  return gagal("Jenis tindakan tidak dikenal.");
}

function sortKunci(o: Record<string, unknown>): [string, unknown][] {
  return Object.entries(o ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

export async function urungkanKoreksi(db: Db, kegiatanId: number, id: number, oleh: number): Promise<{ ok: true; ringkas: string } | Gagal> {
  if (!Number.isInteger(id) || id <= 0) return gagal("Tindakan tidak valid.");
  if (!(await tabelAda(db))) return gagal(PESAN_SQL);
  const { data } = await db.from("sigap_pelatihan_koreksi").select(KOLOM_KOREKSI).eq("id", id).eq("kegiatan_id", kegiatanId).maybeSingle();
  if (!data) return gagal("Tindakan tidak ditemukan.");
  const k = rapikanKoreksi(data as Obj);
  const c = await muatKonteks(db, kegiatanId, [k]);
  const b = bisaUrung(k, c);
  if (!b.ok) return b;
  const sn = k.snapshot;
  try {
    if (k.jenis === "tes_waktu") {
      const { data: r, error } = await db.from("sigap_tes_sesi").update({ batas_at: sn.batas_sebelum }).eq("id", num(sn.sesi_id)).is("selesai_at", null).select("id");
      if (error || !r || (r as unknown[]).length === 0) return gagal("Waktu peserta berubah saat diurungkan. Muat ulang lalu coba lagi.");
    } else if (k.jenis === "tes_buka_ulang") {
      const sb = sn.sebelum as Obj;
      const isi: Obj = { selesai_at: sb.selesai_at, batas_at: sb.batas_at, skor: sb.skor, benar: sb.benar, total: sb.total };
      const tulis = (x: Obj) => db.from("sigap_tes_sesi").update(x).eq("id", num(sn.sesi_id)).is("selesai_at", null).select("id");
      let r = num(sn.percobaan) <= 1 && sb.skor_awal !== undefined && sb.skor_awal !== null ? await tulis({ ...isi, skor_awal: sb.skor_awal }) : await tulis(isi);
      if (r.error) r = await tulis(isi);
      if (r.error || !r.data || (r.data as unknown[]).length === 0) return gagal("Keadaan peserta berubah saat diurungkan. Muat ulang lalu coba lagi.");
    } else if (k.jenis === "soal_nonaktif") {
      const tes = await tesKegiatan(db, kegiatanId, k.tes_id ?? -1);
      if (!tes) return gagal("Tes tidak ditemukan.");
      const { error } = await db.from("sigap_tes_soal").update({ aktif: true }).eq("tes_id", tes.id).in("nomor", sn.nomor as number[]);
      if (error) return gagal("Soal belum dapat diaktifkan kembali.");
      const semua = (await muatSemuaSoal(db, tes.id)).map(bersihSoal);
      const aktifSemua = (await muatSemuaSoal(db, tes.id)).filter((s) => s.aktif).map(bersihSoal);
      const h = await hitungUlangTes(db, kegiatanId, tes, aktifSemua, semua, true);
      if (!h.ok) return gagal("Soal sudah aktif kembali tetapi penghitungan ulang nilai gagal. Coba urungkan lagi atau hubungi admin.");
    } else if (k.jenis === "pindah") {
      await pulihkanPindah(db, kegiatanId, sn as SnapPindah);
    } else if (k.jenis === "peserta_tambah") {
      await pulihkanTambah(db, kegiatanId, sn as SnapTambah);
    }
  } catch {
    return gagal("Tindakan belum dapat diurungkan.");
  }
  const { error } = await db.from("sigap_pelatihan_koreksi").update({ dibatalkan_at: new Date().toISOString(), dibatalkan_oleh: oleh }).eq("id", id);
  if (error) return gagal("Keadaan dipulihkan tetapi catatannya belum diperbarui.");
  return { ok: true, ringkas: `Diurungkan: ${String(k.detail.ringkas ?? LABEL_KOREKSI[k.jenis])}` };
}

// ----------------------------------------------------------------------------
// Papan
// ----------------------------------------------------------------------------

export type StatusTesPeserta = "belum" | "mengerjakan" | "selesai" | "waktu_habis";
export type PesertaKoreksi = {
  akun_id: number;
  nama: string;
  peran: string;
  kelas: number | null;
  atasan_akun_id: number | null;
  atasan_nama: string | null;
  bawahan: number;
  kecamatan: string | null;
  tes: Record<string, { status: StatusTesPeserta; batas_at: string | null; selesai_at: string | null; skor: number | null; percobaan: number } | null>;
};
export type TesKoreksi = {
  id: number;
  jenis: string;
  judul: string;
  buka_at: string;
  tutup_at: string;
  durasi_menit: number;
  aktif: boolean;
  soal: { nomor: number; teks: string; kunci: string; bobot: number; aktif: boolean }[];
};
export type RiwayatKoreksi = { id: number; jenis: JenisKoreksi; label: string; akun_id: number | null; nama: string | null; alasan: string; ringkas: string; at: string; oleh_nama: string | null; dibatalkan_at: string | null; bisa_urung: boolean; alasan_tak_bisa: string | null };
export type PapanKoreksi = { tersedia: boolean; soal_siap: boolean; sekarang: string; tes: TesKoreksi[]; peserta: PesertaKoreksi[]; kelas: number[]; riwayat: RiwayatKoreksi[] };

export async function muatPapanKoreksi(db: Db, kegiatanId: number, sekarang: Date = new Date()): Promise<PapanKoreksi> {
  const kosong: PapanKoreksi = { tersedia: false, soal_siap: false, sekarang: sekarang.toISOString(), tes: [], peserta: [], kelas: [], riwayat: [] };
  try {
    const tersedia = await tabelAda(db);
    const soalSiap = await kolomAktifAda(db);
    const daftarTes = (await muatTesDaftar(db, kegiatanId)).filter((t) => t.jenis === "pretest" || t.jenis === "posttest");
    const tes: TesKoreksi[] = [];
    for (const t of daftarTes) {
      const soal = await muatSemuaSoal(db, num(t.id));
      tes.push({ id: num(t.id), jenis: t.jenis, judul: t.judul, buka_at: t.buka_at, tutup_at: t.tutup_at, durasi_menit: num(t.durasi_menit), aktif: t.aktif !== false, soal: soal.map((s) => ({ nomor: s.nomor, teks: s.teks, kunci: s.kunci, bobot: s.bobot, aktif: s.aktif })) });
    }
    const pen = await penugasanAktif(db, kegiatanId);
    const hier = await hierarkiSemua(db, kegiatanId);
    const atasanDari = new Map(hier.map((h) => [h.akun_id, h.atasan_akun_id]));
    const bawahan = new Map<number, number>();
    for (const h of hier) if (h.atasan_akun_id !== null) bawahan.set(h.atasan_akun_id, (bawahan.get(h.atasan_akun_id) ?? 0) + 1);

    const sesiPer = new Map<string, Obj>();
    if (tes.length > 0 && pen.length > 0) {
      const { data } = await db.from("sigap_tes_sesi").select("tes_id, akun_id, batas_at, selesai_at, skor, percobaan").in("tes_id", tes.map((t) => t.id)).limit(20000);
      for (const r of (data ?? []) as Obj[]) sesiPer.set(`${num(r.tes_id)}:${num(r.akun_id)}`, r);
    }
    const baris = tersedia ? ((await db.from("sigap_pelatihan_koreksi").select(KOLOM_KOREKSI).eq("kegiatan_id", kegiatanId).order("at", { ascending: false }).limit(60)).data ?? []) : [];
    const koreksi = (baris as Obj[]).map(rapikanKoreksi);
    const ids = [...pen.map((p) => p.akun_id), ...[...atasanDari.values()].filter((x): x is number => x !== null), ...koreksi.flatMap((k) => [k.akun_id, k.oleh].filter((x): x is number => x !== null))];
    const info = await namaAkunPeta(db, ids);
    const nama = (id: number) => info.get(id)?.nama ?? `Akun ${id}`;

    const peserta: PesertaKoreksi[] = pen
      .map((p) => {
        const atasan = atasanDari.get(p.akun_id) ?? null;
        const t: PesertaKoreksi["tes"] = {};
        for (const x of tes) {
          const s = sesiPer.get(`${x.id}:${p.akun_id}`);
          if (!s) {
            t[x.jenis] = null;
            continue;
          }
          const status: StatusTesPeserta = s.selesai_at ? "selesai" : new Date(s.batas_at).getTime() <= sekarang.getTime() ? "waktu_habis" : "mengerjakan";
          t[x.jenis] = { status, batas_at: s.batas_at ?? null, selesai_at: s.selesai_at ?? null, skor: angkaAtauNull(s.skor), percobaan: s.percobaan == null ? 1 : num(s.percobaan) };
        }
        return { akun_id: p.akun_id, nama: nama(p.akun_id), peran: p.peran, kelas: p.kelas, atasan_akun_id: atasan, atasan_nama: atasan !== null ? nama(atasan) : null, bawahan: bawahan.get(p.akun_id) ?? 0, kecamatan: info.get(p.akun_id)?.kecamatan ?? null, tes: t };
      })
      .sort((a, b) => a.nama.localeCompare(b.nama));

    const ctx = tersedia ? await muatKonteks(db, kegiatanId, koreksi) : null;
    const riwayat: RiwayatKoreksi[] = koreksi.map((k) => {
      const b = ctx && !k.dibatalkan_at ? bisaUrung(k, ctx) : null;
      return {
        id: k.id,
        jenis: k.jenis,
        label: LABEL_KOREKSI[k.jenis] ?? k.jenis,
        akun_id: k.akun_id,
        nama: k.akun_id !== null ? nama(k.akun_id) : null,
        alasan: k.alasan,
        ringkas: String(k.detail.ringkas ?? ""),
        at: k.at,
        oleh_nama: k.oleh !== null ? nama(k.oleh) : null,
        dibatalkan_at: k.dibatalkan_at,
        bisa_urung: b?.ok === true,
        alasan_tak_bisa: b && !b.ok ? b.pesan : null,
      };
    });
    const kelas = Array.from(new Set(pen.map((p) => p.kelas).filter((x): x is number => x !== null))).sort((a, b) => a - b);
    return { tersedia, soal_siap: soalSiap, sekarang: sekarang.toISOString(), tes, peserta, kelas, riwayat };
  } catch {
    return kosong;
  }
}
