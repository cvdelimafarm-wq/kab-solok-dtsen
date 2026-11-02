// lib/sigapPelatihanBaruDb.ts  (khusus server)
//
// (2 Nov 2026) Pelatihan 5 tab, tahap A-B: akses basis data untuk hierarki, ketentuan, respons undangan, dan ringkasan progres Monitoring.
// TAHAN SQL BELUM DIJALANKAN (20261102zh / 20261102zi): tabel belum ada -> tampilan LAMA tetap (tab_baru false), hierarki "belum tersedia", penyimpanan menolak
// dengan pesan jelas. Tidak ada yang melempar galat ke halaman lama.

import type { Db } from "@/lib/sigap";
import { boleh, type PetaIzin } from "@/lib/sigapAkses";
import { FILTER_BUKAN_ADMINISTRASI } from "@/lib/sigapTesDb";
import { bacaKetentuan, bersihkanButir, hariIniWib, kegiatanSudahSelesai, KETENTUAN_BAWAAN, tampilanBaruAktif, type Ketentuan, type ResponsUndangan } from "@/lib/ketentuanPelatihan";
import { periksaPerubahan, type MasukanPerubahan } from "@/lib/hierarkiImpor";
import type { Pengguna, PeranPelatihan, SimpulHierarki } from "@/lib/hierarkiPelatihan";

const PERAN_SAH: PeranPelatihan[] = ["ppl", "pml", "korwil"];
const jadiPeran = (x: unknown): PeranPelatihan | null => (PERAN_SAH.includes(x as PeranPelatihan) ? (x as PeranPelatihan) : null);

// ---------- Ketentuan dan respons ----------

export async function muatKetentuan(db: Db, kegiatanId: number): Promise<Ketentuan> {
  try {
    const { data, error } = await db.from("sigap_pelatihan_ketentuan").select("tab_baru, butir, versi").eq("kegiatan_id", kegiatanId).maybeSingle();
    if (error || !data) return { ...KETENTUAN_BAWAAN };
    return bacaKetentuan(data);
  } catch {
    return { ...KETENTUAN_BAWAAN };
  }
}

export type Tampilan = {
  ketentuan: Ketentuan;
  /** Tampilan lima tab yang berlaku sekarang (pengaturan manual, atau otomatis menurut tanggal kegiatan). */
  tab_baru: boolean;
  otomatis: boolean;
  kegiatan_selesai: boolean;
};

/** Ketentuan + keputusan tampilan. Bawaan OTOMATIS: baru selama pelatihan belum selesai. Gagal baca tanggal -> dianggap belum selesai. */
export async function muatTampilan(db: Db, kegiatanId: number): Promise<Tampilan> {
  const ketentuan = await muatKetentuan(db, kegiatanId);
  let selesai = false;
  try {
    const { data } = await db.from("sigap_kegiatan").select("tanggal_mulai, tanggal_selesai").eq("id", kegiatanId).maybeSingle();
    const k = data as { tanggal_mulai?: string | null; tanggal_selesai?: string | null } | null;
    selesai = kegiatanSudahSelesai(k?.tanggal_selesai ?? null, k?.tanggal_mulai ?? null, hariIniWib());
  } catch {
    selesai = false;
  }
  return { ketentuan, tab_baru: tampilanBaruAktif(ketentuan.tab_pengaturan, selesai), otomatis: ketentuan.tab_pengaturan === null, kegiatan_selesai: selesai };
}

export async function muatRespons(db: Db, kegiatanId: number, akunId: number): Promise<ResponsUndangan> {
  try {
    const { data, error } = await db.from("sigap_pelatihan_undangan_respons").select("respons, alasan, versi_ketentuan, dijawab_at").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).maybeSingle();
    if (error || !data) return null;
    const r = data as { respons: string; alasan: string | null; versi_ketentuan: number; dijawab_at: string };
    if (r.respons !== "terima" && r.respons !== "tolak") return null;
    return { respons: r.respons, alasan: r.alasan ?? null, versi_ketentuan: r.versi_ketentuan, dijawab_at: r.dijawab_at };
  } catch {
    return null;
  }
}

export async function simpanRespons(db: Db, kegiatanId: number, akunId: number, respons: "terima" | "tolak", alasan: string | null, versi: number): Promise<{ ok: true } | { ok: false; pesan: string }> {
  try {
    const { error } = await db
      .from("sigap_pelatihan_undangan_respons")
      .upsert({ kegiatan_id: kegiatanId, akun_id: akunId, respons, alasan, versi_ketentuan: versi, dijawab_at: new Date().toISOString() }, { onConflict: "kegiatan_id,akun_id" });
    if (error) return { ok: false, pesan: "Jawaban belum dapat disimpan. Pastikan SQL 20261102zi_pelatihan_ketentuan_undangan sudah dijalankan." };
    return { ok: true };
  } catch {
    return { ok: false, pesan: "Jawaban belum dapat disimpan." };
  }
}

/**
 * Menyimpan ketentuan PJ. Versi naik 1 bila daftar butir berubah. `tab_baru`: undefined = tidak diubah, true/false = manual, null = kembali ke OTOMATIS.
 * Kolom tab_baru harus boleh null (SQL 20261102zj).
 */
export async function simpanKetentuan(db: Db, kegiatanId: number, masuk: { butir?: unknown; tab_baru?: boolean | null }, oleh: string): Promise<{ ok: true; ketentuan: Ketentuan } | { ok: false; pesan: string }> {
  try {
    const lama = await muatKetentuan(db, kegiatanId);
    const butir = masuk.butir === undefined ? lama.butir : bersihkanButir(masuk.butir);
    const berubah = JSON.stringify(butir) !== JSON.stringify(lama.butir);
    const baru: Ketentuan = { tab_pengaturan: masuk.tab_baru === undefined ? lama.tab_pengaturan : masuk.tab_baru, butir, versi: berubah ? lama.versi + 1 : lama.versi, ada: true };
    const { error } = await db
      .from("sigap_pelatihan_ketentuan")
      .upsert({ kegiatan_id: kegiatanId, tab_baru: baru.tab_pengaturan, butir: baru.butir, versi: baru.versi, diubah_oleh: oleh.slice(0, 120), diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id" });
    if (error) return { ok: false, pesan: "Ketentuan belum dapat disimpan. Pastikan SQL 20261102zi dan 20261102zj sudah dijalankan." };
    return { ok: true, ketentuan: baru };
  } catch {
    return { ok: false, pesan: "Ketentuan belum dapat disimpan." };
  }
}

// ---------- Hierarki ----------

export type DataHierarki = { tersedia: boolean; simpul: SimpulHierarki[] };

/**
 * Simpul hierarki satu kegiatan: baris `sigap_pelatihan_hierarki` + peserta aktif yang belum punya baris (ditambahkan sebagai simpul tanpa atasan, supaya tidak hilang diam-diam).
 * `tersedia` = tabel ada dan berisi; bila false layar Monitoring menampilkan catatan "hierarki belum disusun". Yang menolak undangan ditandai `tersembunyi`.
 */
export async function muatSimpulHierarki(db: Db, kegiatanId: number): Promise<DataHierarki> {
  let baris: { akun_id: number; peran_pelatihan: string; atasan_akun_id: number | null; sumber?: string | null; diubah_oleh?: string | null }[] = [];
  let tersedia = false;
  try {
    const { data, error } = await db.from("sigap_pelatihan_hierarki").select("akun_id, peran_pelatihan, atasan_akun_id, sumber, diubah_oleh").eq("kegiatan_id", kegiatanId).limit(5000);
    if (!error) {
      baris = (data ?? []) as typeof baris;
      tersedia = baris.length > 0;
    }
  } catch {
    /* tabel belum ada */
  }
  const { data: pen } = await db.from("sigap_penugasan").select("akun_id, peran, kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(5000);
  const penugasan = (pen ?? []) as { akun_id: number; peran: string; kelas: number | null }[];
  const kelasPer = new Map<number, number | null>();
  for (const p of penugasan) kelasPer.set(p.akun_id, p.kelas === null || p.kelas === undefined ? null : Number(p.kelas));

  const peranPer = new Map<number, PeranPelatihan>();
  const atasanPer = new Map<number, number | null>();
  const asalPer = new Map<number, "bawaan" | "salinan" | "manual">();
  for (const b of baris) {
    const peran = jadiPeran(b.peran_pelatihan);
    if (!peran) continue;
    peranPer.set(b.akun_id, peran);
    atasanPer.set(b.akun_id, b.atasan_akun_id ?? null);
    // baris "salin awal" tanpa atasan tercatat manual oleh fungsi salin, tetapi belum diubah siapa pun -> tetap bawaan
    asalPer.set(b.akun_id, b.sumber === "salin_psp" || b.sumber === "salin_sampel" ? "salinan" : b.diubah_oleh === "salin awal" ? "bawaan" : "manual");
  }
  for (const p of penugasan) {
    if (peranPer.has(p.akun_id)) continue;
    const peran = jadiPeran(p.peran);
    if (!peran) continue; // peran lain (mis. panitia) bukan bagian hierarki
    peranPer.set(p.akun_id, peran);
    atasanPer.set(p.akun_id, null);
  }
  const ids = Array.from(peranPer.keys());
  if (ids.length === 0) return { tersedia, simpul: [] };
  const [{ data: akun }, tolak] = await Promise.all([
    db.from("sigap_akun").select("id, nama").in("id", ids).limit(5000),
    muatPenolak(db, kegiatanId),
  ]);
  const nama = new Map(((akun ?? []) as { id: number; nama: string }[]).map((a) => [a.id, a.nama]));
  const simpul: SimpulHierarki[] = ids.map((id) => ({
    akun_id: id,
    nama: nama.get(id) ?? `Akun ${id}`,
    peran: peranPer.get(id)!,
    atasan_akun_id: atasanPer.get(id) ?? null,
    kelas: kelasPer.get(id) ?? null,
    tersembunyi: tolak.has(id),
    asal: asalPer.get(id) ?? "bawaan",
  }));
  return { tersedia, simpul };
}

/** Akun yang menolak undangan kegiatan ini (kosong bila tabel belum ada). */
export async function muatPenolak(db: Db, kegiatanId: number): Promise<Set<number>> {
  try {
    const { data, error } = await db.from("sigap_pelatihan_undangan_respons").select("akun_id").eq("kegiatan_id", kegiatanId).eq("respons", "tolak").limit(5000);
    if (error) return new Set();
    return new Set(((data ?? []) as { akun_id: number }[]).map((r) => r.akun_id));
  } catch {
    return new Set();
  }
}

/** Siapa pengguna ini di mata hierarki: panitia (izin lihat Kelola Pelatihan), instruktur (punya kelas), atau peserta. */
export async function tentukanPengguna(db: Db, kegiatanId: number, akunId: number, izin: PetaIzin): Promise<Pengguna> {
  if (boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return { jenis: "panitia" };
  try {
    const { data } = await db.from("sigap_kuis_instruktur_kelas").select("kelas").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).limit(1);
    const baris = ((data ?? []) as { kelas: number | null }[])[0];
    if (baris) return { jenis: "instruktur", kelas: baris.kelas === null || baris.kelas === undefined ? null : Number(baris.kelas) };
  } catch {
    /* abaikan */
  }
  return { jenis: "peserta", akun_id: akunId };
}

export type ResultAtur = { ok: true } | { ok: false; pesan: string };

/** Mengubah atasan (dan/atau peran) satu peserta. Menolak diri sendiri, atasan yang bukan peserta, dan siklus. */
export async function aturAtasan(db: Db, kegiatanId: number, akunId: number, atasanId: number | null, peran: PeranPelatihan | null, oleh: string, simpulSekarang: readonly SimpulHierarki[]): Promise<ResultAtur> {
  const ini = simpulSekarang.find((s) => s.akun_id === akunId);
  if (!ini) return { ok: false, pesan: "Akun itu bukan peserta pelatihan ini." };
  if (atasanId !== null) {
    if (atasanId === akunId) return { ok: false, pesan: "Atasan tidak boleh diri sendiri." };
    if (!simpulSekarang.some((s) => s.akun_id === atasanId)) return { ok: false, pesan: "Atasan harus peserta pelatihan ini." };
    // siklus: rantai atasan dari calon atasan tidak boleh kembali ke akunId
    const peta = new Map(simpulSekarang.map((s) => [s.akun_id, s]));
    let id: number | null = atasanId;
    const lihat = new Set<number>();
    while (id !== null && !lihat.has(id)) {
      if (id === akunId) return { ok: false, pesan: "Pilihan itu membuat atasan melingkar." };
      lihat.add(id);
      id = peta.get(id)?.atasan_akun_id ?? null;
    }
  }
  try {
    const { error } = await db
      .from("sigap_pelatihan_hierarki")
      .upsert(
        { kegiatan_id: kegiatanId, akun_id: akunId, peran_pelatihan: peran ?? ini.peran, atasan_akun_id: atasanId, sumber: "manual", diubah_oleh: oleh.slice(0, 120), diubah_at: new Date().toISOString() },
        { onConflict: "kegiatan_id,akun_id" }
      );
    if (error) return { ok: false, pesan: "Hierarki belum dapat disimpan. Pastikan SQL 20261102zh_pelatihan_hierarki sudah dijalankan." };
    return { ok: true };
  } catch {
    return { ok: false, pesan: "Hierarki belum dapat disimpan." };
  }
}

/** Menerapkan daftar perubahan hierarki sekaligus (impor template). Diperiksa ulang di server; semua atau tidak sama sekali. */
export async function terapkanPerubahan(db: Db, kegiatanId: number, perubahan: readonly MasukanPerubahan[], oleh: string, simpulSekarang: readonly SimpulHierarki[]): Promise<ResultAtur & { diterapkan?: number }> {
  if (perubahan.length === 0) return { ok: true, diterapkan: 0 };
  if (perubahan.length > 2000) return { ok: false, pesan: "Terlalu banyak perubahan sekaligus." };
  const salah = periksaPerubahan(simpulSekarang, perubahan);
  if (salah) return { ok: false, pesan: salah };
  const waktu = new Date().toISOString();
  try {
    const { error } = await db.from("sigap_pelatihan_hierarki").upsert(
      perubahan.map((p) => ({ kegiatan_id: kegiatanId, akun_id: p.akun_id, peran_pelatihan: p.peran, atasan_akun_id: p.atasan_akun_id, sumber: "manual", diubah_oleh: oleh.slice(0, 120), diubah_at: waktu })),
      { onConflict: "kegiatan_id,akun_id" }
    );
    if (error) return { ok: false, pesan: "Hierarki belum dapat disimpan. Pastikan SQL 20261102zh_pelatihan_hierarki sudah dijalankan." };
    return { ok: true, diterapkan: perubahan.length };
  } catch {
    return { ok: false, pesan: "Hierarki belum dapat disimpan." };
  }
}

// ---------- Ringkasan progres untuk Monitoring ----------

export type ProgresTes = { status: "belum" | "mengerjakan" | "selesai"; skor: number | null };
export type ProgresPeserta = { undangan: "belum" | "terima" | "tolak"; pretest: ProgresTes; posttest: ProgresTes; hadir: boolean };

const TES_KOSONG: ProgresTes = { status: "belum", skor: null };

/** Progres ringkas beberapa akun sekaligus (empat pembacaan bersamaan). Pembacaan yang gagal dianggap kosong, bukan galat. */
export async function muatProgres(db: Db, kegiatanId: number, akunIds: readonly number[]): Promise<Map<number, ProgresPeserta>> {
  const hasil = new Map<number, ProgresPeserta>();
  for (const id of akunIds) hasil.set(id, { undangan: "belum", pretest: { ...TES_KOSONG }, posttest: { ...TES_KOSONG }, hadir: false });
  if (akunIds.length === 0) return hasil;
  const ids = [...akunIds];
  type Hasil = { data: unknown[] | null };
  const aman = async (q: PromiseLike<Hasil>): Promise<Hasil> => {
    try {
      return await q;
    } catch {
      return { data: null };
    }
  };
  const [resp, tesRows, presensi] = await Promise.all([
    aman(db.from("sigap_pelatihan_undangan_respons").select("akun_id, respons").eq("kegiatan_id", kegiatanId).in("akun_id", ids).limit(5000)),
    aman(db.from("sigap_tes").select("id, jenis").eq("kegiatan_id", kegiatanId).in("jenis", ["pretest", "posttest"])),
    aman(db.from("sigap_pelatihan_presensi").select("akun_id").eq("kegiatan_id", kegiatanId).eq("diterima", true).in("akun_id", ids).limit(10000)),
  ]);
  for (const r of (resp.data ?? []) as { akun_id: number; respons: string }[]) {
    const p = hasil.get(r.akun_id);
    if (p && (r.respons === "terima" || r.respons === "tolak")) p.undangan = r.respons;
  }
  for (const r of (presensi.data ?? []) as { akun_id: number }[]) {
    const p = hasil.get(r.akun_id);
    if (p) p.hadir = true;
  }
  const jenisPerTes = new Map(((tesRows.data ?? []) as { id: number; jenis: string }[]).map((t) => [t.id, t.jenis]));
  if (jenisPerTes.size > 0) {
    try {
      const { data } = await db.from("sigap_tes_sesi").select("tes_id, akun_id, selesai_at, skor, skor_terbaik").in("tes_id", Array.from(jenisPerTes.keys())).in("akun_id", ids).limit(10000);
      for (const s of (data ?? []) as { tes_id: number; akun_id: number; selesai_at: string | null; skor: number | string | null; skor_terbaik: number | string | null }[]) {
        const p = hasil.get(s.akun_id);
        const jenis = jenisPerTes.get(s.tes_id);
        if (!p || (jenis !== "pretest" && jenis !== "posttest")) continue;
        const nilai = s.skor_terbaik ?? s.skor;
        const baru: ProgresTes = { status: s.selesai_at ? "selesai" : "mengerjakan", skor: s.selesai_at && nilai !== null && nilai !== undefined ? Number(nilai) : null };
        const lama = p[jenis];
        // beberapa percobaan: yang sudah selesai tidak diturunkan oleh percobaan berikutnya yang masih berjalan; antar-selesai ambil skor tertinggi
        if (lama.status === "selesai" && baru.status !== "selesai") continue;
        if (lama.status === "selesai" && baru.status === "selesai" && (baru.skor ?? -1) <= (lama.skor ?? -1)) continue;
        p[jenis] = baru;
      }
    } catch {
      /* abaikan: kolom tes kosong */
    }
  }
  return hasil;
}
