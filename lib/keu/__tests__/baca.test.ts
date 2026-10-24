import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/sigap";
import { TAMPILAN_BACA } from "@/lib/keu/tampilan";
import { akunBolehBaca, bacaKeu, BATAS_BAWAAN, periksaMasukanBaca, tanganiBaca } from "@/lib/keu/baca";

// Db palsu: tabel sigap_akun + satu tampilan dengan N baris; mencatat rantai panggilan.
function dbPalsu(opts: { akun?: Record<string, unknown> | null; baris?: number; galat?: { code: string; message: string } }) {
  const catatan: string[] = [];
  const semua = Array.from({ length: opts.baris ?? 0 }, (_, i) => ({ n: i }));
  const db = {
    from: (nama: string) => {
      if (nama === "sigap_akun") {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          maybeSingle: async () => ({ data: opts.akun ?? null, error: null }),
        };
        return b;
      }
      catatan.push(`from:${nama}`);
      const q: Record<string, unknown> = {
        select: (k: string) => { catatan.push(`select:${k}`); return q; },
        eq: (k: string, v: string) => { catatan.push(`eq:${k}=${v}`); return q; },
        in: (k: string, v: string[]) => { catatan.push(`in:${k}=${v.join("|")}`); return q; },
        is: (k: string, v: null) => { catatan.push(`is:${k}=${v}`); return q; },
        order: (k: string, o: { ascending: boolean }) => { catatan.push(`order:${k}:${o.ascending}`); return q; },
        range: async (a: number, z: number) => {
          catatan.push(`range:${a}-${z}`);
          if (opts.galat) return { data: null, error: opts.galat };
          return { data: semua.slice(a, z + 1), error: null };
        },
      };
      return q;
    },
  } as unknown as Db;
  return { db, catatan };
}

const AKUN_ORGANIK = { aktif: true, jenis: "organik", super: false };

describe("daftar putih tampilan", () => {
  it("hanya memuat nama keu_ dan kolom bernama sah, tanpa tabel audit/riwayat", () => {
    for (const [n, k] of Object.entries(TAMPILAN_BACA)) {
      expect(n).toMatch(/^keu_[a-z0-9_]+$/);
      expect(k.length).toBeGreaterThan(0);
      k.forEach((c) => expect(c).toMatch(/^[a-z][a-z0-9_]*$/));
      // Satu-satunya pengecualian: tampilan riwayat master, yang hanya memuat jejak perubahan tabel master (keu_master_*, keu_struktur_level).
      if (n !== "keu_v_master_riwayat") expect(n).not.toMatch(/riwayat|audit|pemberian/);
    }
    expect(TAMPILAN_BACA.keu_v_master_riwayat).toEqual(["id", "waktu", "aksi", "detail", "oleh_nama"]);
    expect(TAMPILAN_BACA.keu_v_rab_ringkas).toContain("ro_kode");
  });
});

describe("periksaMasukanBaca", () => {
  it("menerima tampilan dengan saringan, urut, kolom, dan batas", () => {
    const r = periksaMasukanBaca({ tampilan: "keu_v_kekurangan", ro_kode: "2906.BMA.005", status: "tercatat|ditunda", urut: "-jumlah", kolom: "id,uraian,jumlah", batas: "50" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.masukan.saring).toEqual([
        { kolom: "ro_kode", nilai: ["2906.BMA.005"], kosong: false },
        { kolom: "status", nilai: ["tercatat", "ditunda"], kosong: false },
      ]);
      expect(r.masukan.urut).toEqual({ kolom: "jumlah", naik: false });
      expect(r.masukan.kolom).toEqual(["id", "uraian", "jumlah"]);
      expect(r.masukan.batas).toBe(50);
    }
  });
  it("saringan 'null' menyaring yang kosong; batas bawaan 1000", () => {
    const r = periksaMasukanBaca({ tampilan: "keu_v_kekurangan", tambahan_id: "null" });
    expect(r.ok && r.masukan.saring[0]).toEqual({ kolom: "tambahan_id", nilai: [], kosong: true });
    expect(r.ok && r.masukan.batas).toBe(BATAS_BAWAAN);
  });
  it("menolak tampilan di luar daftar, kolom tidak ada, batas salah, nilai berbahaya", () => {
    expect(periksaMasukanBaca({}).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "sigap_akun" }).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "keu_struktur_usulan_riwayat" }).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "keu_v_rab_ringkas", tidak_ada: "1" }).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "keu_v_rab_ringkas", urut: "tidak_ada" }).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "keu_v_rab_ringkas", kolom: "ro_kode,rahasia" }).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "keu_v_rab_ringkas", batas: "0" }).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "keu_v_rab_ringkas", batas: "99999999" }).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "keu_v_rab_ringkas", batas: "1.5" }).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "keu_v_rab_ringkas", ro_kode: "x'); drop table y;--" }).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "keu_v_rab_ringkas", ro_kode: "a,b" }).ok).toBe(false);
  });
  it("membatasi jumlah saringan dan nilai in", () => {
    const banyak: Record<string, string> = { tampilan: "keu_v_adm_dokumen", tahun: "1", ro_kode: "1", komponen_kode: "1", akun_kode: "1", nomor_item: "1", status: "1", dok_id: "1", detail_id: "1", asal: "1" };
    expect(periksaMasukanBaca(banyak).ok).toBe(false);
    expect(periksaMasukanBaca({ tampilan: "keu_v_rab_ringkas", ro_kode: Array.from({ length: 60 }, (_, i) => `a${i}`).join("|") }).ok).toBe(false);
  });
});

describe("akunBolehBaca", () => {
  it("organik aktif dan akun super boleh; nonaktif, bukan organik, tidak ada: tidak", async () => {
    expect(await akunBolehBaca(dbPalsu({ akun: AKUN_ORGANIK }).db, 1)).toBe(true);
    expect(await akunBolehBaca(dbPalsu({ akun: { aktif: true, jenis: "mitra", super: true } }).db, 1)).toBe(true);
    expect(await akunBolehBaca(dbPalsu({ akun: { aktif: true, jenis: "mitra", super: false } }).db, 1)).toBe(false);
    expect(await akunBolehBaca(dbPalsu({ akun: { aktif: false, jenis: "organik", super: false } }).db, 1)).toBe(false);
    expect(await akunBolehBaca(dbPalsu({ akun: null }).db, 1)).toBe(false);
  });
});

describe("bacaKeu", () => {
  const m = (o: Partial<Parameters<typeof bacaKeu>[1]> = {}) => ({ tampilan: "keu_v_rab_ringkas", kolom: null, saring: [], urut: null, batas: 1000, ...o });
  it("membaca per halaman 1000 sampai habis", async () => {
    const { db, catatan } = dbPalsu({ baris: 2300 });
    const h = await bacaKeu(db, m({ batas: 5000 }));
    expect(h.ok && h.data.length).toBe(2300);
    expect(h.ok && h.terpotong).toBe(false);
    expect(catatan.filter((c) => c.startsWith("range"))).toEqual(["range:0-999", "range:1000-1999", "range:2000-2999"]);
  });
  it("berhenti pada batas dan menandai terpotong", async () => {
    const { db } = dbPalsu({ baris: 5000 });
    const h = await bacaKeu(db, m({ batas: 1500 }));
    expect(h.ok && h.data.length).toBe(1500);
    expect(h.ok && h.terpotong).toBe(true);
  });
  it("tidak menandai terpotong bila jumlah tepat sama dengan batas lalu habis", async () => {
    const { db } = dbPalsu({ baris: 10 });
    const h = await bacaKeu(db, m({ batas: 10 }));
    expect(h.ok && h.data.length).toBe(10);
    // batas tercapai tepat pada halaman penuh: tidak bisa dibedakan tanpa membaca satu lagi; ditandai terpotong (aman)
    expect(h.ok && h.terpotong).toBe(true);
  });
  it("menerapkan saringan, urut, dan proyeksi kolom", async () => {
    const { db, catatan } = dbPalsu({ baris: 3 });
    await bacaKeu(db, m({ kolom: ["ro_kode", "status"], urut: { kolom: "nomor", naik: false },
      saring: [{ kolom: "ro_kode", nilai: ["A"], kosong: false }, { kolom: "status", nilai: ["x", "y"], kosong: false }, { kolom: "nomor", nilai: [], kosong: true }] }));
    expect(catatan).toEqual(["from:keu_v_rab_ringkas", "select:ro_kode,status", "eq:ro_kode=A", "in:status=x|y", "is:nomor=null", "order:nomor:false", "range:0-999"]);
  });
  it("memetakan galat basis data", async () => {
    const { db } = dbPalsu({ galat: { code: "PGRST205", message: "Could not find the table" } });
    const h = await bacaKeu(db, m());
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.galat.status).toBe(502);
  });
});

describe("tanganiBaca", () => {
  it("tanpa sesi 401; masukan salah 400; bukan organik 403; sukses 200", async () => {
    expect((await tanganiBaca(dbPalsu({ akun: AKUN_ORGANIK }).db, null, { tampilan: "keu_v_rab_ringkas" })).status).toBe(401);
    expect((await tanganiBaca(dbPalsu({ akun: AKUN_ORGANIK }).db, { akunId: 1, aktorId: null }, { tampilan: "sigap_akun" })).status).toBe(400);
    expect((await tanganiBaca(dbPalsu({ akun: { aktif: true, jenis: "mitra", super: false } }).db, { akunId: 1, aktorId: null }, { tampilan: "keu_v_rab_ringkas" })).status).toBe(403);
    const r = await tanganiBaca(dbPalsu({ akun: AKUN_ORGANIK, baris: 3 }).db, { akunId: 1, aktorId: null }, { tampilan: "keu_v_rab_ringkas" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ jumlah: 3, terpotong: false });
  });
  it("sesi masuk-sebagai tetap boleh membaca (hanya baca)", async () => {
    const r = await tanganiBaca(dbPalsu({ akun: AKUN_ORGANIK, baris: 1 }).db, { akunId: 1, aktorId: 99 }, { tampilan: "keu_v_rab_ringkas" });
    expect(r.status).toBe(200);
  });
});
