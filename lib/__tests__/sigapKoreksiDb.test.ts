// (6 Nov 2026) Koreksi pelatihan: tambah waktu, buka ulang, nonaktifkan soal + hitung ulang nilai, pindah kelas/atasan, tambah peserta, urungkan, papan.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseServer", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/sigapAkses", () => ({ sesiDariHeader: () => null }));

import { PESAN_SQL, bukaUlangSesi, muatPapanKoreksi, nonaktifkanSoal, pindahPeserta, pratinjauSoal, tambahPeserta, tambahWaktu, urungkanKoreksi } from "../sigapKoreksiDb";
import { finalisasiSesi, jumlahSoal, muatSoal } from "../sigapTesDb";
import type { SesiBaris, SoalLengkap } from "../sigapTes";

type Baris = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Tabel = Record<string, Baris[]>;

/** Basis data tiruan di memori. `tolakKolom`: select yang menyebut kolom itu pada tabel itu menghasilkan galat (kolom belum ada). */
function dbTiruan(awal: Tabel, tolakKolom?: { tabel: string; kolom: string }) {
  const tabel: Tabel = JSON.parse(JSON.stringify(awal));
  const urut: Record<string, number> = {};
  const db = {
    from(t: string) {
      const filter: ((r: Baris) => boolean)[] = [];
      let op = "select";
      let isi: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
      let konflik: string[] = [];
      let batas = Infinity;
      let kolomPilih = "";
      let urutan: { k: string; naik: boolean } | null = null;
      const q: any = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      const jalan = () => {
        if (!tabel[t]) return { data: null, error: { message: "tabel tidak ada" } };
        if (op === "select" && tolakKolom && tolakKolom.tabel === t && kolomPilih.includes(tolakKolom.kolom)) return { data: null, error: { message: `column ${tolakKolom.kolom} does not exist` } };
        const cocok = tabel[t].filter((r) => filter.every((f) => f(r)));
        if (op === "insert") {
          const baru = (Array.isArray(isi) ? isi : [isi]).map((v: Baris) => ({ id: v.id ?? (urut[t] = (urut[t] ?? 1000) + 1), ...v }));
          tabel[t].push(...JSON.parse(JSON.stringify(baru)));
          return { data: baru, error: null };
        }
        if (op === "upsert") {
          const v = JSON.parse(JSON.stringify(isi)) as Baris;
          const ada = tabel[t].find((r) => konflik.every((k) => r[k] === v[k]));
          if (ada) Object.assign(ada, v);
          else tabel[t].push({ ...v });
          return { data: [ada ?? v], error: null };
        }
        if (op === "update") {
          for (const r of cocok) Object.assign(r, JSON.parse(JSON.stringify(isi)));
          return { data: cocok, error: null };
        }
        if (op === "delete") {
          tabel[t] = tabel[t].filter((r) => !cocok.includes(r));
          return { data: cocok, error: null };
        }
        let hasil = [...cocok];
        if (urutan) {
          const { k, naik } = urutan;
          hasil.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (naik ? 1 : -1));
        }
        hasil = hasil.slice(0, batas);
        return { data: JSON.parse(JSON.stringify(hasil)), error: null };
      };
      q.select = (k?: string) => ((kolomPilih = k ?? kolomPilih), q);
      q.insert = (v: unknown) => ((op = "insert"), (isi = v), q);
      q.update = (v: unknown) => ((op = "update"), (isi = v), q);
      q.delete = () => ((op = "delete"), q);
      q.upsert = (v: unknown, o?: { onConflict?: string }) => ((op = "upsert"), (isi = v), (konflik = (o?.onConflict ?? "id").split(",")), q);
      q.eq = (k: string, v: unknown) => (filter.push((r) => r[k] === v), q);
      q.neq = (k: string, v: unknown) => (filter.push((r) => r[k] !== v), q);
      q.is = (k: string, v: unknown) => (filter.push((r) => (r[k] ?? null) === v), q);
      q.not = (k: string, o: string, v: unknown) => (filter.push((r) => (o === "is" ? (r[k] ?? null) !== v : true)), q);
      q.in = (k: string, v: unknown[]) => (filter.push((r) => v.includes(r[k])), q);
      q.or = (s: string) => {
        const bagian = s.split(",").map((b) => b.split("."));
        filter.push((r) => bagian.some(([k, o, v]) => (o === "is" ? (r[k] ?? null) === null : r[k] !== v)));
        return q;
      };
      q.order = (k: string, o?: { ascending?: boolean }) => ((urutan = { k, naik: o?.ascending !== false }), q);
      q.limit = (n: number) => ((batas = n), q);
      q.maybeSingle = async () => {
        const r = jalan();
        return { data: r.error ? null : ((r.data as Baris[])[0] ?? null), error: r.error };
      };
      q.single = async () => {
        const r = jalan();
        return { data: r.error ? null : ((r.data as Baris[])[0] ?? null), error: r.error };
      };
      q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(jalan()).then(res, rej);
      return q;
    },
  };
  return { db: db as never, tabel };
}

const K = 7;
const TES = 1;
const opsi = [{ kode: "A", teks: "x" }, { kode: "B", teks: "y" }];
const soal = (nomor: number, kunci: string, aktif = true) => ({ tes_id: TES, nomor, teks: `s${nomor}`, opsi, kunci, bobot: 1, aktif });
const sesi = (id: number, akun_id: number, o: Baris = {}): Baris => ({ id, tes_id: TES, akun_id, mulai_at: "2026-11-09T02:00:00Z", batas_at: "2026-11-09T02:30:00Z", selesai_at: null, jawaban: {}, skor: null, benar: null, total: null, percobaan: 1, skor_terbaik: null, skor_awal: null, ...o });
const akun = (id: number, nama: string, kec = "Koto Parik") => ({ id, nama, jenis: "mitra", aktif: true, alamat_kecamatan: kec });
const pen = (id: number, akun_id: number, peran: string, o: Baris = {}) => ({ id, kegiatan_id: K, akun_id, peran, kelas: 2, aktif: true, sumber: "st", maks_hari: 5, ...o });
const hier = (akun_id: number, atasan: number | null, peran = "ppl") => ({ kegiatan_id: K, akun_id, peran_pelatihan: peran, atasan_akun_id: atasan, sumber: "salin_psp", diubah_oleh: null });
const tesRow = (o: Baris = {}) => ({ id: TES, kegiatan_id: K, jenis: "posttest", judul: "Posttest", buka_at: "2026-11-09T01:00:00Z", tutup_at: "2026-11-09T09:00:00Z", durasi_menit: 30, aktif: true, ulang_maks: 2, nilai_lulus: 70, wajib_lulus: true, ...o });

const SEKARANG = new Date("2026-11-09T02:10:00Z");

function dasar(): Tabel {
  return {
    sigap_kegiatan: [{ id: K, kode: "pelatihan_seruti_tw4_2026" }],
    sigap_pelatihan_aturan: [],
    sigap_pelatihan_koreksi: [],
    sigap_tes: [tesRow()],
    sigap_tes_soal: [soal(1, "A"), soal(2, "B"), soal(3, "A")],
    sigap_tes_sesi: [],
    sigap_tes_sesi_arsip: [],
    sigap_akun: [akun(1, "Pml Satu"), akun(2, "Ppl Dua"), akun(3, "Ppl Tiga"), akun(4, "Pml Empat"), akun(5, "Calon Lima"), akun(6, "Ppl Enam"), akun(8, "Ppl Tolak")],
    sigap_penugasan: [pen(11, 1, "pml"), pen(12, 2, "ppl", { maks_hari: 4 }), pen(13, 3, "ppl", { maks_hari: 4 }), pen(14, 4, "pml", { kelas: 3 })],
    sigap_pelatihan_hierarki: [hier(2, 1), hier(3, 1), hier(1, null, "pml"), hier(4, null, "pml")],
    sigap_pelatihan_undangan_respons: [],
    sigap_pelatihan_presensi: [],
  };
}

describe("tambahWaktu", () => {
  it("memperpanjang batas dari sisa waktu, mencatat, lalu bisa diurungkan", async () => {
    const t = dasar();
    t.sigap_tes_sesi = [sesi(21, 2)];
    const { db, tabel } = dbTiruan(t);
    const h = await tambahWaktu(db, K, 99, { akun_id: 2, tes_id: TES, menit: 15, alasan: "HP mati" }, SEKARANG);
    expect(h.ok).toBe(true);
    expect(new Date(tabel.sigap_tes_sesi[0].batas_at).toISOString()).toBe("2026-11-09T02:45:00.000Z"); // 02.30 + 15
    expect(tabel.sigap_pelatihan_koreksi).toHaveLength(1);
    expect(tabel.sigap_pelatihan_koreksi[0]).toMatchObject({ jenis: "tes_waktu", akun_id: 2, alasan: "HP mati", oleh: 99 });
    const u = await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(u.ok).toBe(true);
    expect(tabel.sigap_tes_sesi[0].batas_at).toBe("2026-11-09T02:30:00Z");
    expect(tabel.sigap_pelatihan_koreksi[0].dibatalkan_at).not.toBeNull();
  });
  it("waktu sudah lewat tetapi belum dinilai: dihitung dari sekarang", async () => {
    const t = dasar();
    t.sigap_tes_sesi = [sesi(21, 2, { batas_at: "2026-11-09T02:00:00Z" })];
    const { db, tabel } = dbTiruan(t);
    const h = await tambahWaktu(db, K, 99, { akun_id: 2, tes_id: TES, menit: 10, alasan: "Sinyal hilang" }, SEKARANG);
    expect(h.ok).toBe(true);
    expect(new Date(tabel.sigap_tes_sesi[0].batas_at).toISOString()).toBe("2026-11-09T02:20:00.000Z");
  });
  it("menolak: tanpa alasan, menit tidak sah, sudah selesai, belum mulai, tes milik kegiatan lain, tabel belum ada", async () => {
    const t = dasar();
    t.sigap_tes_sesi = [sesi(21, 2), sesi(22, 3, { selesai_at: "2026-11-09T02:20:00Z", skor: 50 })];
    const { db } = dbTiruan(t);
    const dasarInp = { akun_id: 2, tes_id: TES, menit: 10, alasan: "x y" };
    expect((await tambahWaktu(db, K, 1, { ...dasarInp, alasan: " " }, SEKARANG)).ok).toBe(false);
    expect((await tambahWaktu(db, K, 1, { ...dasarInp, menit: 0 }, SEKARANG)).ok).toBe(false);
    expect((await tambahWaktu(db, K, 1, { ...dasarInp, menit: 500 }, SEKARANG)).ok).toBe(false);
    const selesai = await tambahWaktu(db, K, 1, { ...dasarInp, akun_id: 3 }, SEKARANG);
    expect(selesai.ok === false && selesai.pesan).toMatch(/Buka ulang/);
    const belum = await tambahWaktu(db, K, 1, { ...dasarInp, akun_id: 6 }, SEKARANG);
    expect(belum.ok === false && belum.pesan).toMatch(/belum memulai/);
    expect((await tambahWaktu(db, 99, 1, dasarInp, SEKARANG)).ok).toBe(false);
    const tanpaTabel = dbTiruan({ ...dasar(), sigap_pelatihan_koreksi: undefined as never });
    const r = await tambahWaktu(tanpaTabel.db, K, 1, dasarInp, SEKARANG);
    expect(r.ok === false && r.pesan).toBe(PESAN_SQL);
  });
  it("tidak bisa diurungkan setelah peserta selesai", async () => {
    const t = dasar();
    t.sigap_tes_sesi = [sesi(21, 2)];
    const { db, tabel } = dbTiruan(t);
    await tambahWaktu(db, K, 99, { akun_id: 2, tes_id: TES, menit: 15, alasan: "HP mati" }, SEKARANG);
    tabel.sigap_tes_sesi[0].selesai_at = "2026-11-09T02:20:00Z";
    const u = await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(u.ok).toBe(false);
    expect(tabel.sigap_pelatihan_koreksi[0].dibatalkan_at ?? null).toBeNull();
  });
});

describe("bukaUlangSesi", () => {
  const selesai = () => sesi(21, 2, { selesai_at: "2026-11-09T02:20:00Z", skor: 66.67, benar: 2, total: 3, skor_awal: 66.67, jawaban: { "1": "A", "2": "B", "3": "B" } });
  it("membuka kembali: jawaban tetap, skor dikosongkan, batas = sekarang + menit; urungkan memulihkan semuanya", async () => {
    const t = dasar();
    t.sigap_tes_sesi = [selesai()];
    const { db, tabel } = dbTiruan(t);
    const h = await bukaUlangSesi(db, K, 99, { akun_id: 2, tes_id: TES, menit: 20, alasan: "Terkirim tidak sengaja" }, SEKARANG);
    expect(h.ok).toBe(true);
    const s = tabel.sigap_tes_sesi[0];
    expect(s).toMatchObject({ selesai_at: null, skor: null, benar: null, total: null, skor_awal: null, jawaban: { "1": "A", "2": "B", "3": "B" } });
    expect(new Date(s.batas_at).toISOString()).toBe("2026-11-09T02:30:00.000Z");
    const u = await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(u.ok).toBe(true);
    expect(tabel.sigap_tes_sesi[0]).toMatchObject({ selesai_at: "2026-11-09T02:20:00Z", skor: 66.67, benar: 2, total: 3, skor_awal: 66.67, batas_at: "2026-11-09T02:30:00Z" });
  });
  it("tidak bisa diurungkan bila peserta sudah mengubah jawaban", async () => {
    const t = dasar();
    t.sigap_tes_sesi = [selesai()];
    const { db, tabel } = dbTiruan(t);
    await bukaUlangSesi(db, K, 99, { akun_id: 2, tes_id: TES, menit: 20, alasan: "Salah kirim" }, SEKARANG);
    tabel.sigap_tes_sesi[0].jawaban = { "1": "A", "2": "A", "3": "B" };
    const u = await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(u.ok === false && u.pesan).toMatch(/mengubah jawabannya/);
  });
  it("percobaan berjalan yang waktunya lewat dialihkan ke tambah waktu; yang masih berjalan ditolak", async () => {
    const t = dasar();
    t.sigap_tes_sesi = [sesi(21, 2, { batas_at: "2026-11-09T02:00:00Z" }), sesi(22, 3)];
    const { db, tabel } = dbTiruan(t);
    expect((await bukaUlangSesi(db, K, 99, { akun_id: 2, tes_id: TES, menit: 10, alasan: "Sinyal" }, SEKARANG)).ok).toBe(true);
    expect(tabel.sigap_pelatihan_koreksi[0].jenis).toBe("tes_waktu");
    const lagi = await bukaUlangSesi(db, K, 99, { akun_id: 3, tes_id: TES, menit: 10, alasan: "Sinyal" }, SEKARANG);
    expect(lagi.ok === false && lagi.pesan).toMatch(/Tambah waktu/);
  });
});

describe("soal dinonaktifkan: bacaan", () => {
  it("muatSoal dan jumlahSoal hanya menghitung soal aktif; tanpa kolom aktif semua dianggap aktif", async () => {
    const t = dasar();
    t.sigap_tes_soal = [soal(1, "A"), soal(2, "B", false), soal(3, "A")];
    const { db } = dbTiruan(t);
    expect((await muatSoal(db, TES)).map((s) => s.nomor)).toEqual([1, 3]);
    expect((await jumlahSoal(db, [TES])).get(TES)).toBe(2);
    // basis data lama: kolom aktif tidak ada, jadi barisnya pun tidak memuatnya
    const lama = dbTiruan({ ...t, sigap_tes_soal: t.sigap_tes_soal.map(({ aktif: _a, ...r }) => (void _a, r)) }, { tabel: "sigap_tes_soal", kolom: "aktif" });
    expect((await muatSoal(lama.db, TES)).map((s) => s.nomor)).toEqual([1, 2, 3]);
    expect((await jumlahSoal(lama.db, [TES])).get(TES)).toBe(3);
  });
  it("finalisasiSesi menyimpan jawaban soal yang dinonaktifkan tetapi tidak menilainya", async () => {
    const t = dasar();
    t.sigap_tes_sesi = [sesi(21, 2, { jawaban: { "1": "A", "2": "B", "3": "B" } })];
    const { db, tabel } = dbTiruan(t);
    const aktif: SoalLengkap[] = [{ nomor: 1, teks: "s1", opsi, kunci: "A", bobot: 1 }, { nomor: 3, teks: "s3", opsi, kunci: "A", bobot: 1 }];
    const h = await finalisasiSesi(db, tabel.sigap_tes_sesi[0] as unknown as SesiBaris, aktif, new Date("2026-11-09T02:20:00Z"));
    expect(h.skor).toBe(50);
    expect(tabel.sigap_tes_sesi[0].jawaban).toEqual({ "1": "A", "2": "B", "3": "B" });
  });
});

describe("nonaktifkanSoal", () => {
  /** Tiga soal (kunci A,B,A). Peserta 2: A,B,B -> 66,67. Peserta 3: percobaan ke-2 (B,B,B -> 33,33 sekarang; percobaan 1 di arsip A,A,A -> 66,67; terbaik 66,67). */
  function tabelNilai(): Tabel {
    const t = dasar();
    t.sigap_tes_sesi = [
      sesi(21, 2, { selesai_at: "2026-11-09T02:20:00Z", skor: 66.67, benar: 2, total: 3, skor_awal: 66.67, jawaban: { "1": "A", "2": "B", "3": "B" } }),
      sesi(22, 3, { selesai_at: "2026-11-09T02:25:00Z", skor: 33.33, benar: 1, total: 3, percobaan: 2, skor_terbaik: 66.67, skor_awal: 66.67, jawaban: { "1": "B", "2": "B", "3": "B" } }),
      sesi(23, 6, { jawaban: { "1": "A" } }), // masih mengerjakan: tidak disentuh
    ];
    t.sigap_tes_sesi_arsip = [{ id: 1, sesi_id: 22, tes_id: TES, akun_id: 3, percobaan: 1, jawaban: { "1": "A", "2": "A", "3": "A" }, skor: 66.67, benar: 2, total: 3 }];
    return t;
  }
  it("pratinjau menghitung dampak tanpa menyimpan", async () => {
    const { db, tabel } = dbTiruan(tabelNilai());
    const salinan = JSON.stringify(tabel);
    const h = await pratinjauSoal(db, K, TES, [3]);
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.dampak.peserta_selesai).toBe(2);
    expect(JSON.stringify(tabel)).toBe(salinan);
    // tanpa soal 3: peserta 2 (A,B) = 100; peserta 3 sekarang (B,B)=50, arsip (A,A)=50
    expect(h.dampak.berubah).toBe(2);
  });
  it("menonaktifkan soal 3: nilai sesi, arsip, skor terbaik dan skor awal dihitung ulang; aturan versi 2 memakai percobaan pertama", async () => {
    const { db, tabel } = dbTiruan(tabelNilai());
    const h = await nonaktifkanSoal(db, K, 99, { tes_id: TES, nomor: [3], alasan: "Kunci salah" });
    expect(h.ok).toBe(true);
    expect(tabel.sigap_tes_soal.find((s) => s.nomor === 3)?.aktif).toBe(false);
    const p2 = tabel.sigap_tes_sesi.find((s) => s.id === 21)!;
    expect(p2).toMatchObject({ skor: 100, benar: 2, total: 2, skor_awal: 100 });
    const p3 = tabel.sigap_tes_sesi.find((s) => s.id === 22)!;
    expect(p3).toMatchObject({ skor: 50, benar: 1, total: 2, skor_terbaik: 50, skor_awal: 50 });
    expect(tabel.sigap_tes_sesi_arsip[0]).toMatchObject({ skor: 50, benar: 1, total: 2 });
    expect(tabel.sigap_tes_sesi.find((s) => s.id === 23)!.skor).toBeNull();
    // jawaban tidak berubah
    expect(p2.jawaban).toEqual({ "1": "A", "2": "B", "3": "B" });
    expect(tabel.sigap_pelatihan_koreksi[0]).toMatchObject({ jenis: "soal_nonaktif", tes_id: TES, alasan: "Kunci salah" });
    if (h.ok) {
      expect(h.dampak.rata_sebelum).toBe(66.67);
      expect(h.dampak.rata_sesudah).toBe(75);
      expect(h.dampak.lulus_naik).toBe(1); // peserta 2: 66,67 -> 100 (> 70)
      expect(h.dampak.lulus_turun).toBe(0);
    }
  });
  it("urungkan mengaktifkan soal lagi dan memulihkan nilai semula", async () => {
    const { db, tabel } = dbTiruan(tabelNilai());
    await nonaktifkanSoal(db, K, 99, { tes_id: TES, nomor: [3], alasan: "Kunci salah" });
    const u = await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(u.ok).toBe(true);
    expect(tabel.sigap_tes_soal.every((s) => s.aktif === true)).toBe(true);
    expect(tabel.sigap_tes_sesi.find((s) => s.id === 21)).toMatchObject({ skor: 66.67, benar: 2, total: 3 });
    expect(tabel.sigap_tes_sesi.find((s) => s.id === 22)).toMatchObject({ skor: 33.33, skor_terbaik: 66.67, skor_awal: 66.67 });
    expect(tabel.sigap_tes_sesi_arsip[0].skor).toBe(66.67);
    const lagi = await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(lagi.ok === false && lagi.pesan).toMatch(/sudah diurungkan/);
  });
  it("aturan versi 1 (PSP): nilai resmi = tertinggi", async () => {
    const t = tabelNilai();
    t.sigap_kegiatan = [{ id: K, kode: "pelatihan_psp_pascabencana_2026" }];
    const { db } = dbTiruan(t);
    const h = await pratinjauSoal(db, K, TES, [3]);
    expect(h.ok && h.dampak.rata_sebelum).toBe(66.67);
    expect(h.ok && h.dampak.rata_sesudah).toBe(75); // peserta 2: 100, peserta 3: tertinggi(50,50)=50
  });
  it("menolak: tanpa alasan, nomor tidak ada, sudah nonaktif, menonaktifkan semua soal, kolom/tabel belum ada", async () => {
    const t = tabelNilai();
    t.sigap_tes_soal[1].aktif = false;
    const { db } = dbTiruan(t);
    expect((await nonaktifkanSoal(db, K, 1, { tes_id: TES, nomor: [3], alasan: "" })).ok).toBe(false);
    expect((await nonaktifkanSoal(db, K, 1, { tes_id: TES, nomor: [9], alasan: "salah" })).ok).toBe(false);
    const non = await nonaktifkanSoal(db, K, 1, { tes_id: TES, nomor: [2], alasan: "salah" });
    expect(non.ok === false && non.pesan).toMatch(/sudah nonaktif/);
    const semua = await nonaktifkanSoal(db, K, 1, { tes_id: TES, nomor: [1, 3], alasan: "salah" });
    expect(semua.ok === false && semua.pesan).toMatch(/Minimal satu soal/);
    const lama = dbTiruan(tabelNilai(), { tabel: "sigap_tes_soal", kolom: "aktif" });
    const r = await nonaktifkanSoal(lama.db, K, 1, { tes_id: TES, nomor: [3], alasan: "salah" });
    expect(r.ok === false && r.pesan).toBe(PESAN_SQL);
  });
  it("gagal di tengah penghitungan: soal diaktifkan kembali dan catatan dihapus", async () => {
    const t = tabelNilai();
    const { db, tabel } = dbTiruan(t);
    // paksa galat pada update arsip dengan membungkus from()
    const asli = (db as { from: (t: string) => Baris }).from.bind(db);
    let pertama = true;
    (db as { from: (t: string) => Baris }).from = (nama: string) => {
      const q = asli(nama);
      if (nama === "sigap_tes_sesi_arsip" && pertama) {
        const upd = q.update;
        q.update = (v: unknown) => {
          pertama = false;
          upd(v);
          q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "boom" } }).then(res);
          return q;
        };
      }
      return q;
    };
    const h = await nonaktifkanSoal(db, K, 99, { tes_id: TES, nomor: [3], alasan: "Kunci salah" });
    expect(h.ok).toBe(false);
    expect(tabel.sigap_tes_soal.every((s) => s.aktif === true)).toBe(true);
    expect(tabel.sigap_pelatihan_koreksi).toHaveLength(0);
    expect(tabel.sigap_tes_sesi.find((s) => s.id === 21)).toMatchObject({ skor: 66.67, total: 3 });
  });
});

describe("pindahPeserta", () => {
  it("pindah kelas dan atasan sekaligus; bawahan ikut pindah kelas; urungkan memulihkan", async () => {
    const { db, tabel } = dbTiruan(dasar());
    const h = await pindahPeserta(db, K, 99, { akun_id: 1, kelas: 3, atasan_akun_id: 4, bawahan_ikut: true, alasan: "Dipindah ke kelas 3" });
    expect(h.ok).toBe(true);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 1)?.kelas).toBe(3);
    expect(tabel.sigap_penugasan.filter((p) => [2, 3].includes(p.akun_id)).every((p) => p.kelas === 3)).toBe(true);
    expect(tabel.sigap_pelatihan_hierarki.find((x) => x.akun_id === 1)?.atasan_akun_id).toBe(4);
    expect(tabel.sigap_pelatihan_hierarki.find((x) => x.akun_id === 1)?.sumber).toBe("manual");
    const u = await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(u.ok).toBe(true);
    expect(tabel.sigap_penugasan.filter((p) => [1, 2, 3].includes(p.akun_id)).every((p) => p.kelas === 2)).toBe(true);
    expect(tabel.sigap_pelatihan_hierarki.find((x) => x.akun_id === 1)?.atasan_akun_id).toBeNull();
  });
  it("hanya atasan: kelas tidak disentuh; peserta tanpa baris hierarki dibuatkan baris, urungkan menghapusnya", async () => {
    const t = dasar();
    t.sigap_pelatihan_hierarki = [hier(2, 1)];
    const { db, tabel } = dbTiruan(t);
    const h = await pindahPeserta(db, K, 99, { akun_id: 3, atasan_akun_id: 1, alasan: "Atasan baru" });
    expect(h.ok).toBe(true);
    expect(tabel.sigap_pelatihan_hierarki.find((x) => x.akun_id === 3)).toMatchObject({ atasan_akun_id: 1, peran_pelatihan: "ppl" });
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 3)?.kelas).toBe(2);
    await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(tabel.sigap_pelatihan_hierarki.find((x) => x.akun_id === 3)).toBeUndefined();
  });
  it("menolak: tidak ada perubahan, atasan diri sendiri, atasan melingkar, atasan bukan peserta, bukan peserta, kelas tidak sah", async () => {
    const { db } = dbTiruan(dasar());
    const coba = (x: Baris) => pindahPeserta(db, K, 99, { akun_id: 2, alasan: "uji", ...x } as never);
    expect((await coba({ kelas: 2 })).ok).toBe(false);
    expect((await coba({ atasan_akun_id: 2 })).ok).toBe(false);
    expect((await pindahPeserta(db, K, 99, { akun_id: 1, atasan_akun_id: 2, alasan: "uji" })).ok).toBe(false); // 2 ada di bawah 1
    expect((await coba({ atasan_akun_id: 5 })).ok).toBe(false);
    expect((await pindahPeserta(db, K, 99, { akun_id: 5, kelas: 1, alasan: "uji" })).ok).toBe(false);
    expect((await coba({ kelas: 0 })).ok).toBe(false);
    expect((await coba({ kelas: 3, alasan: "" })).ok).toBe(false);
  });
  it("tidak bisa diurungkan bila kelas sudah diubah lagi", async () => {
    const { db, tabel } = dbTiruan(dasar());
    await pindahPeserta(db, K, 99, { akun_id: 2, kelas: 3, alasan: "pindah" });
    tabel.sigap_penugasan.find((p) => p.akun_id === 2)!.kelas = 4;
    const u = await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(u.ok).toBe(false);
  });
});

describe("tambahPeserta", () => {
  it("peserta baru mewarisi maks_hari sekelas seperan, masuk hierarki dengan atasan pilihan; urungkan menghapusnya", async () => {
    const { db, tabel } = dbTiruan(dasar());
    const h = await tambahPeserta(db, K, 99, { akun_id: 5, peran: "ppl", kelas: 2, atasan_akun_id: 1, alasan: "Menggantikan peserta yang sakit" });
    expect(h.ok).toBe(true);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 5)).toMatchObject({ kegiatan_id: K, peran: "ppl", kelas: 2, aktif: true, maks_hari: 4, sumber: "koreksi:99" });
    expect(tabel.sigap_pelatihan_hierarki.find((x) => x.akun_id === 5)).toMatchObject({ atasan_akun_id: 1, peran_pelatihan: "ppl", sumber: "manual" });
    const u = await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(u.ok).toBe(true);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 5)).toBeUndefined();
    expect(tabel.sigap_pelatihan_hierarki.find((x) => x.akun_id === 5)).toBeUndefined();
  });
  it("mengaktifkan kembali baris penugasan nonaktif; urungkan mengembalikan seperti semula", async () => {
    const t = dasar();
    t.sigap_penugasan.push(pen(15, 5, "ppl", { aktif: false, kelas: 1, sumber: "st", maks_hari: 2 }));
    const { db, tabel } = dbTiruan(t);
    expect((await tambahPeserta(db, K, 99, { akun_id: 5, peran: "pml", kelas: 3, alasan: "kembali" })).ok).toBe(true);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 5)).toMatchObject({ aktif: true, peran: "pml", kelas: 3 });
    expect(tabel.sigap_penugasan.filter((p) => p.akun_id === 5)).toHaveLength(1);
    await urungkanKoreksi(db, K, tabel.sigap_pelatihan_koreksi[0].id, 99);
    expect(tabel.sigap_penugasan.find((p) => p.akun_id === 5)).toMatchObject({ aktif: false, peran: "ppl", kelas: 1, maks_hari: 2 });
  });
  it("menolak: sudah peserta, peserta tambahan administrasi, menolak undangan, atasan bukan peserta, peran/kelas tidak sah, tanpa alasan, akun tidak aktif", async () => {
    const t = dasar();
    t.sigap_penugasan.push(pen(16, 6, "ppl", { sumber: "administrasi" }));
    t.sigap_pelatihan_undangan_respons = [{ kegiatan_id: K, akun_id: 8, respons: "tolak" }];
    t.sigap_akun.push({ id: 9, nama: "Mati", jenis: "mitra", aktif: false, alamat_kecamatan: "x" });
    const { db } = dbTiruan(t);
    const coba = (x: Baris) => tambahPeserta(db, K, 99, { akun_id: 5, peran: "ppl", kelas: 2, alasan: "uji", ...x } as never);
    expect((await coba({ akun_id: 2 })).ok).toBe(false);
    const adm = await coba({ akun_id: 6 });
    expect(adm.ok === false && adm.pesan).toMatch(/Administrasi/i);
    const tolak = await coba({ akun_id: 8 });
    expect(tolak.ok === false && tolak.pesan).toMatch(/menolak/);
    expect((await coba({ atasan_akun_id: 5 })).ok).toBe(false);
    expect((await coba({ peran: "admin" })).ok).toBe(false);
    expect((await coba({ kelas: 0 })).ok).toBe(false);
    expect((await coba({ alasan: "" })).ok).toBe(false);
    expect((await coba({ akun_id: 9 })).ok).toBe(false);
  });
  it("tidak bisa diurungkan setelah ia punya jejak tes/presensi atau sudah menjadi atasan", async () => {
    const a = dbTiruan(dasar());
    await tambahPeserta(a.db, K, 99, { akun_id: 5, peran: "ppl", kelas: 2, alasan: "uji" });
    a.tabel.sigap_pelatihan_presensi.push({ kegiatan_id: K, akun_id: 5 });
    expect((await urungkanKoreksi(a.db, K, a.tabel.sigap_pelatihan_koreksi[0].id, 99)).ok).toBe(false);
    const b = dbTiruan(dasar());
    await tambahPeserta(b.db, K, 99, { akun_id: 5, peran: "pml", kelas: 2, alasan: "uji" });
    b.tabel.sigap_pelatihan_hierarki.push(hier(6, 5));
    expect((await urungkanKoreksi(b.db, K, b.tabel.sigap_pelatihan_koreksi[0].id, 99)).ok).toBe(false);
  });
});

describe("muatPapanKoreksi", () => {
  it("mengembalikan tes+soal, peserta dengan status tes, kelas, dan riwayat dengan kemampuan urungkan", async () => {
    const t = dasar();
    t.sigap_tes_soal[1].aktif = false;
    t.sigap_tes_sesi = [sesi(21, 2), sesi(22, 3, { selesai_at: "2026-11-09T02:20:00Z", skor: 50 }), sesi(23, 1, { batas_at: "2026-11-09T02:00:00Z" })];
    const { db } = dbTiruan(t);
    await tambahWaktu(db, K, 99, { akun_id: 2, tes_id: TES, menit: 5, alasan: "uji" }, SEKARANG);
    const p = await muatPapanKoreksi(db, K, SEKARANG);
    expect(p.tersedia).toBe(true);
    expect(p.soal_siap).toBe(true);
    expect(p.tes[0].soal.map((s) => [s.nomor, s.aktif])).toEqual([[1, true], [2, false], [3, true]]);
    const st = (id: number) => p.peserta.find((x) => x.akun_id === id)!.tes.posttest?.status ?? "belum";
    expect([st(2), st(3), st(1), st(4)]).toEqual(["mengerjakan", "selesai", "waktu_habis", "belum"]);
    expect(p.peserta.find((x) => x.akun_id === 2)).toMatchObject({ atasan_nama: "Pml Satu", kelas: 2 });
    expect(p.peserta.find((x) => x.akun_id === 1)?.bawahan).toBe(2);
    expect(p.kelas).toEqual([2, 3]);
    expect(p.riwayat).toHaveLength(1);
    expect(p.riwayat[0]).toMatchObject({ jenis: "tes_waktu", nama: "Ppl Dua", bisa_urung: true, oleh_nama: expect.any(String) });
  });
  it("tabel koreksi belum ada: tersedia=false tetapi daftar peserta tetap terbaca", async () => {
    const { db } = dbTiruan({ ...dasar(), sigap_pelatihan_koreksi: undefined as never });
    const p = await muatPapanKoreksi(db, K, SEKARANG);
    expect(p.tersedia).toBe(false);
    expect(p.peserta.length).toBe(4);
  });
});
