import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("@/lib/sigap", () => ({}));
import { muatIdBatas } from "../portal/batasServer";
import { dataMasterWilayah } from "../portal/masterWilayah";

const cincin = [[100, 0], [100.1, 0], [100.1, 0.1], [100, 0]];
const fitur = (id: string) => ({ id, nm: "x", kd: "k", bb: [100, 0, 100.1, 0.1], g: [[cincin]] });

function folderUji(opsi: { rusak?: boolean } = {}) {
  const d = mkdtempSync(path.join(tmpdir(), "batas-"));
  writeFileSync(path.join(d, "manifest.json"), JSON.stringify({ versi: "20261102", dibuat: "2026-11-02", kecamatan: { "1303110": { berkas: "batas-1303110.json", ukuran: 1, n: 2, bb: [100, 0, 100.1, 0.1] }, "1303120": { berkas: "batas-1303120.json", ukuran: 1, n: 1, bb: [100, 0, 100.1, 0.1] } } }));
  writeFileSync(path.join(d, "batas-1303110.json"), JSON.stringify({ versi: "20261102", fitur: [fitur("1303110005000101"), fitur("1303110005000102")] }));
  writeFileSync(path.join(d, "batas-1303120.json"), opsi.rusak ? "{bukan json" : JSON.stringify({ versi: "20261102", fitur: [fitur("1303120001000101")] }));
  return d;
}

describe("muatIdBatas", () => {
  it("membaca manifest dan semua berkas kecamatan", async () => {
    const r = await muatIdBatas(folderUji());
    expect(r?.ringkas).toMatchObject({ versi: "20261102", dibaca: true, kecamatan: 2, poligon: 3 });
    expect(r?.ids.has("1303120001000101")).toBe(true);
  });
  it("satu berkas rusak dilewati, yang lain tetap terbaca", async () => {
    const r = await muatIdBatas(folderUji({ rusak: true }));
    expect(r?.ringkas).toMatchObject({ kecamatan: 1, poligon: 2 });
    expect(r?.ids.has("1303120001000101")).toBe(false);
  });
  it("folder tanpa manifest -> null", async () => {
    expect(await muatIdBatas(mkdtempSync(path.join(tmpdir(), "kosong-")))).toBeNull();
  });
});

// db tiruan: tabel -> baris; mendukung select/eq/in/order/limit/range sederhana
type Baris = Record<string, unknown>;
function dbTiruan(tabel: Record<string, Baris[] | { error: { code: string; message: string } }>) {
  return {
    from(nama: string) {
      const sumber = tabel[nama];
      let hasil: Baris[] = Array.isArray(sumber) ? [...sumber] : [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => { hasil = hasil.filter((r) => r[k] === v); return q; },
        is: (k: string, v: unknown) => { hasil = hasil.filter((r) => (r[k] ?? null) === v); return q; },
        in: (k: string, v: unknown[]) => { hasil = hasil.filter((r) => v.includes(r[k])); return q; },
        order: () => q,
        limit: () => q,
        range: (a: number, b: number) => { hasil = hasil.slice(a, b + 1); return q; },
        then: (ok: (v: unknown) => unknown) => ok(Array.isArray(sumber) ? { data: hasil, error: null } : { data: null, error: (sumber as { error: unknown }).error }),
      };
      return q;
    },
  } as never;
}

const tampilan = [
  { idsubsls: "1303110005000101", kd_kec: "1303110", kecamatan: "KUBUNG", nagari: "G", sls: "S", sub_sls: "01", aktif: true, jumlah_kk: 5, kk_terbaru: null, gambar_peta: 1, jumlah_survei: 0, daftar_survei: [] },
  { idsubsls: "1303110005000102", kd_kec: "1303110", kecamatan: "KUBUNG", nagari: "G", sls: "S", sub_sls: "02", aktif: true, jumlah_kk: 0, kk_terbaru: null, gambar_peta: 0, jumlah_survei: 1, daftar_survei: [{ kegiatan_id: 6, kegiatan: "Seruti", nks: "A", target: 10, ppl: "Ani", pml: "Budi" }] },
];

describe("dataMasterWilayah", () => {
  it("SQL belum dijalankan: siap false, tidak melempar", async () => {
    const r = await dataMasterWilayah(dbTiruan({ master_v_subsls_status: { error: { code: "42P01", message: 'relation "master_v_subsls_status" does not exist' } } }));
    expect(r.siap).toBe(false);
    expect(r.baris).toEqual([]);
  });
  it("menggabungkan tampilan, usulan, dan rekap kegiatan tahun berjalan", async () => {
    const r = await dataMasterWilayah(dbTiruan({
      master_v_subsls_status: tampilan,
      sigap_sampel_ganti: [{ id: 3, kegiatan_id: 6, idsubsls: "1303110005000102", utama_kk_id: 11, alasan: "pindah", usul_master: true, status: "disetujui", diajukan_nama: "Ani", diajukan_at: "2026-11-12T01:00:00Z" }],
      master_kk: [{ id: 11, nama_kk: "Pak Uji" }],
      sigap_kegiatan: [{ id: 6, nama: "Seruti Triwulan IV 2026" }],
    }), new Date("2026-11-13T00:00:00Z"));
    expect(r.siap).toBe(true);
    expect(r.tahun).toBe(2026);
    expect(r.baris).toHaveLength(2);
    expect(r.kegiatan_tahun).toEqual([{ id: 6, nama: "Seruti", sub_sls: 1 }]);
    expect(r.usulan[0]).toMatchObject({ id: 3, kegiatan: "Seruti Triwulan IV 2026", nama_kk: "Pak Uji", kecamatan: "KUBUNG", status: "disetujui" });
  });
  it("usulan yang sudah diputuskan (usul_putusan terisi) tidak ditampilkan", async () => {
    const r = await dataMasterWilayah(dbTiruan({
      master_v_subsls_status: tampilan,
      sigap_sampel_ganti: [
        { id: 3, kegiatan_id: 6, idsubsls: "1303110005000102", utama_kk_id: 11, alasan: "pindah", usul_master: true, status: "disetujui", usul_putusan: "diterapkan", diajukan_at: "2026-11-12T01:00:00Z" },
        { id: 4, kegiatan_id: 6, idsubsls: "1303110005000102", utama_kk_id: 11, alasan: "kosong", usul_master: true, status: "disetujui", usul_putusan: null, diajukan_at: "2026-11-12T02:00:00Z" },
      ],
      master_kk: [{ id: 11, nama_kk: "Pak Uji" }],
      sigap_kegiatan: [{ id: 6, nama: "Seruti" }],
    }));
    expect(r.usulan.map((u) => u.id)).toEqual([4]);
  });
  it("tabel penggantian belum ada: usulan kosong, bagian lain tetap jalan", async () => {
    const r = await dataMasterWilayah(dbTiruan({ master_v_subsls_status: tampilan, sigap_sampel_ganti: { error: { code: "42P01", message: "does not exist" } } }));
    expect(r.siap).toBe(true);
    expect(r.usulan).toEqual([]);
  });
});
