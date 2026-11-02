// Menguji sigapTesDb ASLI untuk perubahan 2 Nov 2026: skor_awal saat finalisasi, wajib_100, aturan versi pada keadaan tes.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseServer", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/sigapAkses", () => ({ sesiDariHeader: () => null }));

import { finalisasiSesi, susunKeadaan, muatTes } from "../sigapTesDb";
import type { SesiBaris, SoalLengkap, TesBaris } from "../sigapTes";

const soal: SoalLengkap[] = [
  { nomor: 1, teks: "a", opsi: [{ kode: "A", teks: "x" }, { kode: "B", teks: "y" }], kunci: "A", bobot: 1 },
  { nomor: 2, teks: "b", opsi: [{ kode: "A", teks: "x" }, { kode: "B", teks: "y" }], kunci: "B", bobot: 1 },
];
const sesi = (o: Partial<SesiBaris> = {}): SesiBaris => ({ id: 9, tes_id: 1, akun_id: 5, mulai_at: "2026-11-09T02:00:00Z", batas_at: "2026-11-09T02:30:00Z", selesai_at: null, jawaban: { "1": "A", "2": "A" }, skor: null, benar: null, total: null, diubah_at: "2026-11-09T02:10:00Z", percobaan: 1, skor_terbaik: null, ...o });

/** Db tiruan untuk update sesi: merekam isi update; bila `tolakKolom` ada di isi, mengembalikan galat kolom. */
function dbUpdate(opsi: { tolakKolom?: string } = {}) {
  const rekam: Record<string, unknown>[] = [];
  const db = {
    from() {
      let isi: Record<string, unknown> = {};
      const q: Record<string, unknown> = {
        update(x: Record<string, unknown>) { isi = x; return q; },
        eq() { return q; },
        is() { return q; },
        select() { return q; },
        maybeSingle() {
          if (opsi.tolakKolom && opsi.tolakKolom in isi) return Promise.resolve({ data: null, error: { message: `column "${opsi.tolakKolom}" of relation does not exist` } });
          rekam.push(isi);
          return Promise.resolve({ data: { ...sesi(), ...isi }, error: null });
        },
      };
      return q;
    },
  } as never;
  return { db, rekam };
}

describe("finalisasiSesi menyimpan skor_awal", () => {
  it("percobaan pertama: skor_awal = skor", async () => {
    const { db, rekam } = dbUpdate();
    const h = await finalisasiSesi(db, sesi(), soal, new Date("2026-11-09T02:20:00Z"));
    expect(rekam[0].skor).toBe(50);
    expect(rekam[0].skor_awal).toBe(50);
    expect(h.skor).toBe(50);
  });
  it("percobaan ke-2: skor_awal TIDAK ditimpa", async () => {
    const { db, rekam } = dbUpdate();
    await finalisasiSesi(db, sesi({ percobaan: 2, skor_terbaik: 50 }), soal, new Date("2026-11-09T02:20:00Z"));
    expect("skor_awal" in rekam[0]).toBe(false);
  });
  it("kolom skor_awal belum ada: penilaian tetap berhasil tanpa kolom itu", async () => {
    const { db, rekam } = dbUpdate({ tolakKolom: "skor_awal" });
    const h = await finalisasiSesi(db, sesi(), soal, new Date("2026-11-09T02:20:00Z"));
    expect(rekam).toHaveLength(1);
    expect("skor_awal" in rekam[0]).toBe(false);
    expect(h.skor).toBe(50);
  });
  it("sesi yang sudah selesai tidak diubah", async () => {
    const { db, rekam } = dbUpdate();
    const s = sesi({ selesai_at: "2026-11-09T02:25:00Z", skor: 100 });
    expect(await finalisasiSesi(db, s, soal, new Date())).toBe(s);
    expect(rekam).toHaveLength(0);
  });
});

describe("keadaan tes: wajib 100 dan versi aturan", () => {
  const tes = (o: Partial<TesBaris> = {}): TesBaris => ({ id: 1, kegiatan_id: 7, jenis: "pretest", judul: "Pretest", buka_at: "2026-11-09T01:00:00Z", durasi_menit: 30, tutup_at: "2026-11-09T09:00:00Z", aktif: true, ulang_maks: 1, nilai_lulus: 70, wajib_lulus: false, wajib_100: true, ...o });
  /** Db tiruan baca: tabel -> baris. */
  function dbBaca(t: Record<string, Record<string, unknown>[]>) {
    return {
      from(nama: string) {
        let baris = [...(t[nama] ?? [])];
        const q: Record<string, unknown> = {
          select() { return q; },
          eq(k: string, v: unknown) { baris = baris.filter((r) => r[k] === v); return q; },
          in(k: string, v: unknown[]) { baris = baris.filter((r) => v.includes(r[k])); return q; },
          order() { return q; },
          limit() { return q; },
          not() { return q; },
          maybeSingle() { return Promise.resolve({ data: baris[0] ?? null, error: null }); },
          then(ok: (v: unknown) => unknown) { return Promise.resolve({ data: baris, error: null }).then(ok); },
        };
        return q;
      },
    } as never;
  }
  const tabel = (s: Record<string, unknown> | null) => ({
    sigap_tes_soal: soal.map((x) => ({ tes_id: 1, ...x })),
    sigap_tes_sesi: s ? [{ ...sesi(), ...s }] : [],
    sigap_kegiatan: [{ id: 7, kode: "pelatihan_seruti_tw4_2026" }],
    sigap_pelatihan_aturan: [],
  });
  const SEKARANG = new Date("2026-11-09T04:00:00Z");

  it("wajib 100 belum tercapai: boleh ulang, belum tuntas, tanpa batas", async () => {
    const k = await susunKeadaan(dbBaca(tabel({ selesai_at: "2026-11-09T02:20:00Z", skor: 50, benar: 1, total: 2, percobaan: 4 })), tes(), 5, SEKARANG);
    expect(k.wajib_100).toBe(true);
    expect(k.tuntas).toBe(false);
    expect(k.bisa_ulang).toBe(true);
    expect(k.ulang_maks).toBe(999);
    expect(k.aturan_versi).toBe(2);
    expect(k.lulus).toBeNull();
  });
  it("100 tercapai: tuntas dan tidak ditawari mengulang", async () => {
    const k = await susunKeadaan(dbBaca(tabel({ selesai_at: "2026-11-09T02:20:00Z", skor: 100, benar: 2, total: 2 })), tes(), 5, SEKARANG);
    expect(k.tuntas).toBe(true);
    expect(k.bisa_ulang).toBe(false);
  });
  it("tanpa wajib 100: perilaku lama (pretest tidak boleh mengulang), tuntas = selesai", async () => {
    const k = await susunKeadaan(dbBaca(tabel({ selesai_at: "2026-11-09T02:20:00Z", skor: 50, benar: 1, total: 2 })), tes({ wajib_100: false }), 5, SEKARANG);
    expect(k.wajib_100).toBe(false);
    expect(k.bisa_ulang).toBe(false);
    expect(k.tuntas).toBe(true);
  });
  it("PSP (tanpa baris aturan) tetap versi 1", async () => {
    const t = tabel({ selesai_at: "2026-11-09T02:20:00Z", skor: 50, benar: 1, total: 2 });
    t.sigap_kegiatan = [{ id: 7, kode: "pelatihan_psp_pascabencana_2026" }];
    const k = await susunKeadaan(dbBaca(t), tes({ wajib_100: false }), 5, SEKARANG);
    expect(k.aturan_versi).toBe(1);
  });
  it("hasil sesudah tutup pada versi 2 memakai percobaan pertama", async () => {
    const t = tabel({ selesai_at: "2026-11-09T05:00:00Z", skor: 100, benar: 2, total: 2, percobaan: 2, skor_terbaik: 50, jawaban: { "1": "A", "2": "B" } });
    (t as Record<string, unknown[]>).sigap_tes_sesi_arsip = [{ sesi_id: 9, percobaan: 1, jawaban: { "1": "A", "2": "A" }, skor: 50 }];
    const k = await susunKeadaan(dbBaca(t as never), tes({ wajib_100: false, ulang_maks: 2, jenis: "posttest" }), 5, new Date("2026-11-09T10:00:00Z"));
    expect(k.hasil?.skor).toBe(50);
    expect(k.hasil?.dari_percobaan).toBe(1);
  });
  it("hasil sesudah tutup pada versi 1 tetap yang tertinggi", async () => {
    const t = tabel({ selesai_at: "2026-11-09T05:00:00Z", skor: 100, benar: 2, total: 2, percobaan: 2, skor_terbaik: 50, jawaban: { "1": "A", "2": "B" } });
    t.sigap_kegiatan = [{ id: 7, kode: "pelatihan_psp_pascabencana_2026" }];
    (t as Record<string, unknown[]>).sigap_tes_sesi_arsip = [{ sesi_id: 9, percobaan: 1, jawaban: { "1": "A", "2": "A" }, skor: 50 }];
    const k = await susunKeadaan(dbBaca(t as never), tes({ wajib_100: false, ulang_maks: 2, jenis: "posttest" }), 5, new Date("2026-11-09T10:00:00Z"));
    expect(k.hasil?.skor).toBe(100);
  });
});

describe("muatTes tiga tingkat kolom", () => {
  it("jatuh ke tingkat lebih lama bila kolom wajib_100 belum ada", async () => {
    const panggilan: string[] = [];
    const db = {
      from() {
        let kolom = "";
        const q: Record<string, unknown> = {
          select(k: string) { kolom = k; return q; },
          eq() { return q; },
          maybeSingle() {
            panggilan.push(kolom);
            if (kolom.includes("wajib_100")) return Promise.resolve({ data: null, error: { message: "column wajib_100 does not exist" } });
            return Promise.resolve({ data: { id: 1, jenis: "pretest", nilai_lulus: "70.00", wajib_lulus: false }, error: null });
          },
        };
        return q;
      },
    } as never;
    const t = await muatTes(db, 7, "pretest");
    expect(panggilan).toHaveLength(2);
    expect(t?.nilai_lulus).toBe(70);
    expect(t?.wajib_100).toBeUndefined();
  });
});
