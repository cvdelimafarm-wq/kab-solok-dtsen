import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/sigap";
import { petakanGalat } from "@/lib/keu/galat";
import { FUNGSI_BACA, panggilKeu, periksaMasukanPanggil, periksaMasukanTulis, tanganiPanggil, tanganiTulis, tulisKeu } from "@/lib/keu/gerbang";

type Panggilan = { nama: string; params: Record<string, unknown> };
function dbPalsu(balas: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const panggilan: Panggilan[] = [];
  const db = {
    rpc: async (nama: string, params: Record<string, unknown>) => {
      panggilan.push({ nama, params });
      return { data: balas.data ?? null, error: balas.error ?? null };
    },
  } as unknown as Db;
  return { db, panggilan };
}

describe("petakanGalat", () => {
  it("memetakan SQLSTATE yang dikenal dan meneruskan pesan Indonesia dari basis data", () => {
    expect(petakanGalat({ code: "42501", message: "Akun 7 tidak berwenang" })).toEqual({ status: 403, kode: "42501", pesan: "Akun 7 tidak berwenang" });
    expect(petakanGalat({ code: "23514", message: "Alasan minimal 5 huruf" }).status).toBe(422);
    expect(petakanGalat({ code: "23503", message: "x" }).status).toBe(422);
    expect(petakanGalat({ code: "23505", message: "sudah ada" }).status).toBe(409);
    expect(petakanGalat({ code: "P0002", message: "tidak ada" }).status).toBe(404);
    expect(petakanGalat({ code: "42P01", message: "x" }).status).toBe(404);
    expect(petakanGalat({ code: "22023", message: "x" }).status).toBe(400);
    expect(petakanGalat({ code: "P0001", message: "x" }).status).toBe(422);
  });
  it("memberi pesan umum bila pesan kosong", () => {
    expect(petakanGalat({ code: "42501", message: "" }).pesan).toMatch(/tidak berwenang/i);
    expect(petakanGalat({ code: "P0002" }).pesan).toMatch(/tidak ditemukan/i);
  });
  it("tidak membocorkan galat tak terduga", () => {
    const g = petakanGalat({ code: "XX000", message: 'relation "keu_rahasia" column "x" ...' });
    expect(g.status).toBe(500);
    expect(g.pesan).not.toMatch(/keu_rahasia/);
    expect(petakanGalat(null).status).toBe(500);
  });
  it("galat PostgREST (fungsi belum dimigrasi) menjadi 502 dengan petunjuk, tanpa pesan mentah", () => {
    const g = petakanGalat({ code: "PGRST202", message: "Could not find the function public.keu_jalankan" });
    expect(g.status).toBe(502);
    expect(g.pesan).toMatch(/migrasi/);
    expect(g.pesan).not.toMatch(/PGRST/);
  });
});

describe("periksaMasukanPanggil", () => {
  it("menerima fungsi sah dengan atau tanpa args", () => {
    expect(periksaMasukanPanggil({ fungsi: "keu_boleh", args: { p_kew: "sahkan" } })).toEqual({ ok: true, masukan: { fungsi: "keu_boleh", args: { p_kew: "sahkan" } } });
    expect(periksaMasukanPanggil({ fungsi: "keu_struktur_cocokkan" })).toEqual({ ok: true, masukan: { fungsi: "keu_struktur_cocokkan", args: {} } });
  });
  it("menolak badan, nama, dan args yang salah", () => {
    expect(periksaMasukanPanggil(null).ok).toBe(false);
    expect(periksaMasukanPanggil([]).ok).toBe(false);
    expect(periksaMasukanPanggil({}).ok).toBe(false);
    expect(periksaMasukanPanggil({ fungsi: "sigap_hapus_semua" }).ok).toBe(false);
    expect(periksaMasukanPanggil({ fungsi: "keu_x; drop table y" }).ok).toBe(false);
    expect(periksaMasukanPanggil({ fungsi: "KEU_boleh" }).ok).toBe(false);
    expect(periksaMasukanPanggil({ fungsi: "keu_boleh", args: [1] }).ok).toBe(false);
    expect(periksaMasukanPanggil({ fungsi: "keu_boleh", args: { "p kew": 1 } }).ok).toBe(false);
  });
  it("menolak p_akun dari klien", () => {
    const r = periksaMasukanPanggil({ fungsi: "keu_boleh", args: { p_akun: 1 } });
    expect(r.ok).toBe(false);
  });
  it("menolak args yang terlalu banyak", () => {
    const args: Record<string, number> = {};
    for (let i = 0; i < 60; i++) args[`a${i}`] = i;
    expect(periksaMasukanPanggil({ fungsi: "keu_boleh", args }).ok).toBe(false);
  });
});

describe("periksaMasukanTulis", () => {
  it("menerima insert dan update sah", () => {
    expect(periksaMasukanTulis({ tabel: "keu_master_satuan", op: "insert", data: { kode: "ZZ" } }).ok).toBe(true);
    const u = periksaMasukanTulis({ tabel: "keu_master_satuan", op: "update", data: { arti: "x" }, kunci: { kode: "ZZ" } });
    expect(u).toEqual({ ok: true, masukan: { tabel: "keu_master_satuan", op: "update", data: { arti: "x" }, kunci: { kode: "ZZ" } } });
  });
  it("menolak hapus, tabel non-keu_, data kosong, update tanpa kunci, insert dengan kunci", () => {
    expect(periksaMasukanTulis({ tabel: "keu_a", op: "delete", data: { a: 1 }, kunci: { id: 1 } }).ok).toBe(false);
    expect(periksaMasukanTulis({ tabel: "sigap_akun", op: "update", data: { super: true }, kunci: { id: 1 } }).ok).toBe(false);
    expect(periksaMasukanTulis({ tabel: "keu_a", op: "insert", data: {} }).ok).toBe(false);
    expect(periksaMasukanTulis({ tabel: "keu_a", op: "update", data: { a: 1 } }).ok).toBe(false);
    expect(periksaMasukanTulis({ tabel: "keu_a", op: "update", data: { a: 1 }, kunci: {} }).ok).toBe(false);
    expect(periksaMasukanTulis({ tabel: "keu_a", op: "insert", data: { a: 1 }, kunci: { id: 1 } }).ok).toBe(false);
    expect(periksaMasukanTulis({ tabel: "keu_a", op: "insert", data: { "a b": 1 } }).ok).toBe(false);
  });
});

describe("panggilKeu dan tulisKeu", () => {
  it("memanggil keu_jalankan dengan akun dari pemanggil", async () => {
    const { db, panggilan } = dbPalsu({ data: true });
    const h = await panggilKeu<boolean>(db, 7, "keu_boleh", { p_kew: "sahkan" });
    expect(h).toEqual({ ok: true, data: true });
    expect(panggilan).toEqual([{ nama: "keu_jalankan", params: { p_akun: 7, p_fungsi: "keu_boleh", p_args: { p_kew: "sahkan" } } }]);
  });
  it("memetakan galat basis data", async () => {
    const { db } = dbPalsu({ error: { code: "42501", message: "Akun 7 bukan PPK" } });
    const h = await panggilKeu(db, 7, "keu_struktur_cocokkan");
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.galat).toEqual({ status: 403, kode: "42501", pesan: "Akun 7 bukan PPK" });
  });
  it("tulisKeu memanggil keu_tulis", async () => {
    const { db, panggilan } = dbPalsu({ data: { kode: "ZZ" } });
    const h = await tulisKeu(db, 1, "keu_master_satuan", "insert", { kode: "ZZ" });
    expect(h).toEqual({ ok: true, data: { kode: "ZZ" } });
    expect(panggilan[0]).toEqual({ nama: "keu_tulis", params: { p_akun: 1, p_tabel: "keu_master_satuan", p_op: "insert", p_data: { kode: "ZZ" }, p_kunci: null } });
  });
});

describe("tanganiPanggil / tanganiTulis", () => {
  it("tanpa sesi -> 401 tanpa menyentuh basis data", async () => {
    const { db, panggilan } = dbPalsu({ data: 1 });
    expect((await tanganiPanggil(db, null, { fungsi: "keu_boleh" })).status).toBe(401);
    expect((await tanganiTulis(db, null, { tabel: "keu_a", op: "insert", data: { a: 1 } })).status).toBe(401);
    expect(panggilan).toHaveLength(0);
  });
  it("masukan salah -> 400 tanpa menyentuh basis data", async () => {
    const { db, panggilan } = dbPalsu({ data: 1 });
    expect((await tanganiPanggil(db, { akunId: 3, aktorId: null }, { fungsi: "bukan_keu" })).status).toBe(400);
    expect((await tanganiTulis(db, { akunId: 3, aktorId: null }, { tabel: "keu_a", op: "delete" })).status).toBe(400);
    expect(panggilan).toHaveLength(0);
  });
  it("sukses -> 200 dengan data; akun selalu dari sesi", async () => {
    const { db, panggilan } = dbPalsu({ data: "menunggu_ppk" });
    const r = await tanganiPanggil(db, { akunId: 4, aktorId: null }, { fungsi: "keu_struktur_aksi", args: { p_id: 9, p_aksi: "setuju_ketua" } });
    expect(r).toEqual({ status: 200, json: { data: "menunggu_ppk" } });
    expect(panggilan[0].params.p_akun).toBe(4);
  });
  it("galat basis data -> status dan pesan terpetakan", async () => {
    const { db } = dbPalsu({ error: { code: "23514", message: "Alasan pengembalian wajib diisi (minimal 5 huruf)" } });
    const r = await tanganiPanggil(db, { akunId: 4, aktorId: null }, { fungsi: "keu_struktur_aksi", args: { p_id: 9, p_aksi: "kembalikan" } });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("Alasan pengembalian wajib diisi (minimal 5 huruf)");
  });
  it("sesi masuk-sebagai: hanya fungsi baca; tulis ditolak 403", async () => {
    const { db, panggilan } = dbPalsu({ data: true });
    const sesi = { akunId: 4, aktorId: 1 };
    expect((await tanganiPanggil(db, sesi, { fungsi: "keu_struktur_aksi", args: { p_id: 1, p_aksi: "ajukan" } })).status).toBe(403);
    expect((await tanganiTulis(db, sesi, { tabel: "keu_master_satuan", op: "insert", data: { kode: "ZZ" } })).status).toBe(403);
    expect(panggilan).toHaveLength(0);
    expect((await tanganiPanggil(db, sesi, { fungsi: "keu_boleh", args: { p_kew: "rab" } })).status).toBe(200);
    expect(panggilan).toHaveLength(1);
  });
  it("daftar fungsi baca hanya berisi fungsi keu_ tanpa duplikat", () => {
    expect(new Set(FUNGSI_BACA).size).toBe(FUNGSI_BACA.length);
    expect(FUNGSI_BACA.every((f) => /^keu_[a-z0-9_]+$/.test(f))).toBe(true);
    expect(FUNGSI_BACA).not.toContain("keu_struktur_aksi");
  });
});
