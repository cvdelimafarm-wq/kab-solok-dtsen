// lib/__tests__/batasVersi.test.ts
// (7 Nov 2026, tahap C2) Sisi server versi batas: simpan (pemeriksaan ulang + Storage + catatan), aktifkan/kembalikan, baca berkas versi aktif, riwayat.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sigap", () => ({}));
import { aktifkanVersiBatas, berkasBatasAktif, daftarVersiBatas, lupakanCacheBatas, muatIdBatasUntuk, namaBerkasBatasSah, simpanVersiBatas, versiAktifBatas } from "../portal/batasVersi";
import { kotak } from "./pembantuShapefile";

type Baris = Record<string, unknown>;

function dbFake(opsi: { tabelBelumAda?: boolean; gagalUnggah?: number; gagalInsert?: boolean; rpcGalat?: string } = {}) {
  const tabel: Record<string, Baris[]> = { master_batas_versi: [], sigap_akun: [{ id: 7, nama: "Iqbal" }] };
  const objek = new Map<string, string>();
  let unggah = 0;
  const hapus: string[][] = [];
  const rpcPanggil: unknown[] = [];
  const belum = { code: "42P01", message: 'relation "master_batas_versi" does not exist' };
  const db = {
    from(nama: string) {
      let hasil: Baris[] = [...(tabel[nama] ?? [])];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => { hasil = hasil.filter((r) => r[k] === v); return q; },
        in: (k: string, v: unknown[]) => { hasil = hasil.filter((r) => v.includes(r[k])); return q; },
        order: () => q,
        limit: (n: number) => { hasil = hasil.slice(0, n); return q; },
        insert: (b: Baris) => {
          if (opsi.gagalInsert) return Promise.resolve({ error: { message: "insert gagal" } });
          tabel[nama].push({ aktif: false, diaktifkan_at: null, ...b });
          return Promise.resolve({ error: null });
        },
        then: (ok: (v: unknown) => unknown) => ok(opsi.tabelBelumAda && nama === "master_batas_versi" ? { data: null, error: belum } : { data: hasil, error: null }),
      };
      return q;
    },
    storage: {
      from: () => ({
        upload: async (kunci: string, badan: Uint8Array) => {
          unggah += 1;
          if (opsi.gagalUnggah && unggah === opsi.gagalUnggah) return { error: { message: "disk penuh" } };
          objek.set(kunci, new TextDecoder().decode(badan));
          return { error: null };
        },
        download: async (kunci: string) => (objek.has(kunci) ? { data: { text: async () => objek.get(kunci)! }, error: null } : { data: null, error: { message: "tidak ada" } }),
        remove: async (daftar: string[]) => { hapus.push(daftar); for (const k of daftar) objek.delete(k); return { error: null }; },
      }),
    },
    rpc: async (nama: string, arg: { p_versi: string }) => {
      rpcPanggil.push([nama, arg]);
      if (opsi.rpcGalat) return { data: null, error: { message: opsi.rpcGalat } };
      if (arg.p_versi && !tabel.master_batas_versi.some((r) => r.versi === arg.p_versi)) return { data: { ok: false, pesan: "Versi tidak ditemukan." }, error: null };
      for (const r of tabel.master_batas_versi) r.aktif = !!arg.p_versi && r.versi === arg.p_versi;
      return { data: { ok: true, aktif: arg.p_versi || null }, error: null };
    },
  };
  return { db: db as never, tabel, objek, hapus, rpcPanggil };
}

const f = (id: string, x: number, sisi = 0.002) => ({ id, nm: "JORONG", kd: "01", bb: [x, -1.2, x + sisi, -1.2 + sisi], g: [[kotak(x, -1.2, sisi)]] });
const tiga = [f("1303040001000100", 100.85), f("1303040001000201", 100.86), f("1303050001000100", 100.9)];
const WAKTU = new Date("2026-11-08T08:30:00Z"); // 15.30 WIB

beforeEach(() => lupakanCacheBatas());

describe("namaBerkasBatasSah", () => {
  it("hanya manifest dan berkas kecamatan 7 digit", () => {
    expect(namaBerkasBatasSah("manifest.json")).toBe(true);
    expect(namaBerkasBatasSah("batas-1303040.json")).toBe(true);
    for (const n of ["../manifest.json", "batas-13030.json", "batas-1303040.json.exe", "x/batas-1303040.json", ""]) expect(namaBerkasBatasSah(n)).toBe(false);
  });
});

describe("simpanVersiBatas", () => {
  it("memeriksa ulang, menulis berkas per kecamatan + manifest, mencatat versi (tidak diaktifkan)", async () => {
    const { db, tabel, objek } = dbFake();
    const h = await simpanVersiBatas(db, 7, { fitur: tiga, namaAsal: "solok.zip", catatan: "pembaruan", ringkas: { baru: 2, hilang: "x", sistem: "UTM zona 47S", jenis: "shapefile", ekstra: 99 } }, WAKTU);
    expect(h).toMatchObject({ ok: true, versi: "202611081530", jumlah_subsls: 3, jumlah_kec: 2 });
    expect([...objek.keys()].sort()).toEqual(["202611081530/batas-1303040.json", "202611081530/batas-1303050.json", "202611081530/manifest.json"]);
    const baris = tabel.master_batas_versi[0];
    expect(baris).toMatchObject({ versi: "202611081530", dibuat_oleh: 7, nama_asal: "solok.zip", catatan: "pembaruan", jumlah_subsls: 3, aktif: false });
    expect(baris.ringkas).toEqual({ baru: 2, hilang: 0, berubah: 0, sama: 0, peringatan: 0, info: 0, sistem: "UTM zona 47S", jenis: "shapefile" });
  });
  it("menolak isi yang tidak sah walau browser mengaku sudah memeriksa (id bukan 16 digit, di luar kotak, ganda)", async () => {
    const { db, objek } = dbFake();
    const buruk = await simpanVersiBatas(db, 7, { fitur: [f("123", 100.85), f("1303040001000100", 110), f("1303040001000200", 100.85), f("1303040001000200", 100.86)] }, WAKTU);
    expect(buruk.ok).toBe(false);
    if (!buruk.ok) {
      expect(buruk.status).toBe(400);
      expect(buruk.pesan).toMatch(/menolak 3 temuan/);
    }
    expect(objek.size).toBe(0);
    expect((await simpanVersiBatas(db, 7, { fitur: [] }, WAKTU)).ok).toBe(false);
    expect((await simpanVersiBatas(db, 7, {}, WAKTU)).ok).toBe(false);
  });
  it("tanda waktu sama: 409; SQL belum dijalankan: 503", async () => {
    const a = dbFake();
    await simpanVersiBatas(a.db, 7, { fitur: tiga }, WAKTU);
    const dua = await simpanVersiBatas(a.db, 7, { fitur: tiga }, WAKTU);
    expect(dua).toMatchObject({ ok: false, status: 409 });
    const b = dbFake({ tabelBelumAda: true });
    expect(await simpanVersiBatas(b.db, 7, { fitur: tiga }, WAKTU)).toMatchObject({ ok: false, status: 503 });
  });
  it("gagal menulis berkas: yang sudah tertulis dibersihkan dan tidak ada catatan versi", async () => {
    const { db, tabel, objek, hapus } = dbFake({ gagalUnggah: 3 });
    const h = await simpanVersiBatas(db, 7, { fitur: tiga }, WAKTU);
    expect(h).toMatchObject({ ok: false, status: 500 });
    expect(hapus[0]).toHaveLength(2);
    expect(objek.size).toBe(0);
    expect(tabel.master_batas_versi).toHaveLength(0);
  });
  it("gagal mencatat versi: berkas dibersihkan", async () => {
    const { db, objek } = dbFake({ gagalInsert: true });
    expect(await simpanVersiBatas(db, 7, { fitur: tiga }, WAKTU)).toMatchObject({ ok: false, status: 500 });
    expect(objek.size).toBe(0);
  });
});

describe("aktifkan dan baca versi aktif", () => {
  it("tanpa versi aktif: berkas bawaan (null)", async () => {
    const { db } = dbFake();
    expect(await versiAktifBatas(db)).toBeNull();
    expect(await berkasBatasAktif(db, "manifest.json")).toBeNull();
  });
  it("aktifkan -> manifest dan berkas kecamatan dilayani dari Storage; nama liar ditolak", async () => {
    const { db } = dbFake();
    await simpanVersiBatas(db, 7, { fitur: tiga }, WAKTU);
    expect(await aktifkanVersiBatas(db, 7, "202611081530")).toEqual({ ok: true, aktif: "202611081530" });
    expect(await versiAktifBatas(db)).toBe("202611081530");
    const m = await berkasBatasAktif(db, "manifest.json");
    expect(JSON.parse(m!.isi).versi).toBe("202611081530");
    const k = await berkasBatasAktif(db, "batas-1303040.json");
    expect(JSON.parse(k!.isi).n).toBe(2);
    expect(await berkasBatasAktif(db, "../x")).toBeNull();
    expect(await berkasBatasAktif(db, "batas-9999999.json")).toBeNull(); // kecamatan yang tidak ada di versi itu
  });
  it("aktifkan menolak versi yang berkasnya tidak ada atau tanda tak sah; versi null = kembali ke bawaan", async () => {
    const { db, rpcPanggil } = dbFake();
    expect(await aktifkanVersiBatas(db, 7, "202611081530")).toMatchObject({ ok: false, status: 404 });
    expect(await aktifkanVersiBatas(db, 7, "../x")).toMatchObject({ ok: false, status: 400 });
    await simpanVersiBatas(db, 7, { fitur: tiga }, WAKTU);
    await aktifkanVersiBatas(db, 7, "202611081530");
    expect(await aktifkanVersiBatas(db, 7, null)).toEqual({ ok: true, aktif: null });
    expect(rpcPanggil.at(-1)).toEqual(["master_batas_aktifkan", { p_versi: "", p_akun: 7 }]);
    expect(await versiAktifBatas(db)).toBeNull(); // cache dibuang saat pindah versi
  });
  it("galat RPC dipetakan", async () => {
    const { db } = dbFake({ rpcGalat: "function public.master_batas_aktifkan(text, bigint) does not exist" });
    expect(await aktifkanVersiBatas(db, 7, null)).toMatchObject({ ok: false, status: 503 });
  });
  it("muatIdBatasUntuk memakai versi aktif (sumber unggahan)", async () => {
    const { db } = dbFake();
    await simpanVersiBatas(db, 7, { fitur: tiga }, WAKTU);
    await aktifkanVersiBatas(db, 7, "202611081530");
    const r = await muatIdBatasUntuk(db);
    expect(r?.ringkas).toMatchObject({ versi: "202611081530", dibaca: true, kecamatan: 2, poligon: 3, sumber: "unggahan" });
    expect(r?.ids.has("1303050001000100")).toBe(true);
  });
});

describe("daftarVersiBatas", () => {
  it("SQL belum dijalankan: siap false", async () => {
    expect((await daftarVersiBatas(dbFake({ tabelBelumAda: true }).db)).siap).toBe(false);
  });
  it("riwayat dengan nama pembuat dan versi aktif", async () => {
    const { db } = dbFake();
    await simpanVersiBatas(db, 7, { fitur: tiga, namaAsal: "a.zip" }, WAKTU);
    await aktifkanVersiBatas(db, 7, "202611081530");
    const d = await daftarVersiBatas(db);
    expect(d.siap).toBe(true);
    expect(d.aktif).toBe("202611081530");
    expect(d.versi[0]).toMatchObject({ versi: "202611081530", dibuat_oleh: "Iqbal", nama_asal: "a.zip", jumlah_subsls: 3, aktif: true });
  });
});
