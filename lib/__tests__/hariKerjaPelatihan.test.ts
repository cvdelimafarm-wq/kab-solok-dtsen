import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sigap", () => ({
  hariIniWib: () => "2026-11-02",
  rentangTanggal: (a: string, b: string) => {
    const out: string[] = [];
    const d = new Date(`${a}T00:00:00Z`);
    while (d <= new Date(`${b}T00:00:00Z`)) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  },
}));
vi.mock("@/lib/sigapTesDb", () => ({ FILTER_BUKAN_ADMINISTRASI: "sumber.is.null" }));

import { bangunMatriks, fotoHanyaHariKerja, itemDariMatriks, kunciIsi, periksaItem, periksaKuota, ringkasMatriks, type BarisHK, type PesertaHK } from "@/lib/hariKerjaPelatihan";
import { muatHariKerja, ubahHariKerja } from "@/lib/sigapHariKerjaDb";

const HARI_INI = "2026-11-02";
const T = "2026-11-09";
const p = (akun: number, pen: number, maks: number | null = null): PesertaHK => ({ penugasan_id: pen, akun_id: akun, nama: `P${akun}`, peran: "ppl", maks_hari: maks, kelas: null });
const hk = (id: number, pen: number, akun: number, keg: number, uji = false, tanggal = T): BarisHK => ({ id, penugasan_id: pen, akun_id: akun, tanggal, uji_coba: uji, kegiatan_id: keg, kegiatan_nama: keg === 7 ? "Pelatihan" : "Pendataan" });

describe("bangunMatriks", () => {
  it("kosong, ada, dipakai kegiatan lain, terkunci", () => {
    const peserta = [p(1, 101), p(2, 102), p(3, 103), p(4, 104), p(5, 105)];
    const baris = [hk(1, 101, 1, 7), hk(2, 202, 2, 1), hk(3, 203, 3, 1), hk(4, 204, 4, 1, true)];
    const terisi = new Set([kunciIsi(203, T)]);
    const m = bangunMatriks(peserta, [T], baris, terisi, HARI_INI);
    expect(m.map((b) => b.sel[0].status)).toEqual(["ada", "lain", "terkunci_lain", "terkunci_lain", "kosong"]);
    expect(m[0].sel[0]).toMatchObject({ bisa_lepas: true, bisa_buat: false });
    expect(m[1].sel[0]).toMatchObject({ bisa_pindah: true, kegiatan_id: 1 });
    expect(m[2].sel[0].bisa_pindah).toBe(false);
    expect(m[3].sel[0].alasan).toMatch(/uji coba/);
    expect(m[4].sel[0]).toMatchObject({ bisa_buat: true });
    expect(ringkasMatriks(m)).toMatchObject({ ada: 1, kosong: 1, lain: 1, terkunci_lain: 2, bisa_buat: 1, bisa_pindah: 1, lengkap: 1 });
  });
  it("hari berisi atau lewat tidak boleh dilepas / ditambah", () => {
    const m = bangunMatriks([p(1, 101), p(2, 102)], ["2026-11-01", T], [hk(1, 101, 1, 7, false, T)], new Set([kunciIsi(101, T)]), HARI_INI);
    expect(m[0].sel[1]).toMatchObject({ status: "ada", berisi: true, bisa_lepas: false });
    expect(m[1].sel[0]).toMatchObject({ status: "kosong", bisa_buat: false });
  });
});

describe("periksaItem dan kuota", () => {
  const m = bangunMatriks([p(1, 101, 1), p(2, 102)], [T, "2026-11-10"], [hk(1, 101, 1, 7)], new Set(), HARI_INI);
  it("kuota maks_hari", () => {
    expect(periksaKuota(1, 1, 1)).toMatch(/Melebihi/);
    expect(periksaKuota(null, 5, 5)).toBeNull();
    expect(periksaItem(m, "buat", { akun_id: 1, tanggal: "2026-11-10" })).toMatch(/Melebihi maksimal 1/);
    expect(periksaItem(m, "buat", { akun_id: 2, tanggal: "2026-11-10" })).toBeNull();
  });
  it("aksi yang tidak cocok dengan status ditolak", () => {
    expect(periksaItem(m, "buat", { akun_id: 1, tanggal: T })).toMatch(/Sudah/);
    expect(periksaItem(m, "lepas", { akun_id: 2, tanggal: T })).toMatch(/Bukan hari kerja/);
    expect(periksaItem(m, "pindah", { akun_id: 2, tanggal: T })).toMatch(/kosong/);
    expect(periksaItem(m, "buat", { akun_id: 99, tanggal: T })).toMatch(/Bukan peserta/);
    expect(periksaItem(m, "buat", { akun_id: 2, tanggal: "2026-12-01" })).toMatch(/luar jadwal/);
  });
  it("itemDariMatriks menghormati kuota", () => {
    expect(itemDariMatriks(m, "buat")).toEqual([{ akun_id: 2, tanggal: T }, { akun_id: 2, tanggal: "2026-11-10" }]);
  });
});

describe("fotoHanyaHariKerja", () => {
  it("hanya pelatihan", () => {
    expect(fotoHanyaHariKerja("pelatihan")).toBe(true);
    expect(fotoHanyaHariKerja("pendataan")).toBe(false);
    expect(fotoHanyaHariKerja(undefined)).toBe(false);
  });
});

// ---- basis data palsu ----
type Baris = Record<string, unknown>;
function buatDb(awal: Record<string, Baris[]>, gagalInsert: (t: string, r: Baris) => boolean = () => false) {
  const tabel: Record<string, Baris[]> = JSON.parse(JSON.stringify(awal));
  let id = 1000;
  const db = {
    from(nama: string) {
      const rows = (tabel[nama] ??= []);
      const f: ((r: Baris) => boolean)[] = [];
      let aksi = "select";
      let isi: Baris | Baris[] = {};
      const b: Record<string, unknown> = {};
      const jalan = () => {
        const cocok = rows.filter((r) => f.every((x) => x(r)));
        if (aksi === "select") return { data: cocok.map((r) => ({ ...r })), error: null };
        if (aksi === "delete") {
          for (const r of cocok) rows.splice(rows.indexOf(r), 1);
          return { data: null, error: null };
        }
        for (const r of Array.isArray(isi) ? isi : [isi]) {
          if (gagalInsert(nama, r)) return { data: null, error: { message: "gagal" } };
          if (nama === "sigap_hari_kerja" && rows.some((x) => x.akun_id === r.akun_id && x.tanggal === r.tanggal)) return { data: null, error: { message: "dup", code: "23505" } };
          rows.push({ id: ++id, ...r });
        }
        return { data: null, error: null };
      };
      b.eq = (k: string, v: unknown) => (f.push((r) => r[k] === v), b);
      b.in = (k: string, v: unknown[]) => (f.push((r) => v.includes(r[k])), b);
      b.is = (k: string, v: unknown) => (f.push((r) => (r[k] ?? null) === v), b);
      b.gt = (k: string, v: string) => (f.push((r) => String(r[k]) > v), b);
      b.or = () => b;
      b.select = () => b;
      b.limit = () => b;
      b.insert = (v: Baris | Baris[]) => ((aksi = "insert"), (isi = v), b);
      b.delete = () => ((aksi = "delete"), b);
      b.maybeSingle = () => {
        const h = jalan();
        return Promise.resolve({ data: (h.data as Baris[])[0] ?? null, error: h.error });
      };
      b.then = (ok: (h: unknown) => unknown, no?: (e: unknown) => unknown) => Promise.resolve(jalan()).then(ok, no);
      return b;
    },
  };
  return { db: db as never, tabel };
}

const dasar = () => ({
  sigap_kegiatan: [{ id: 7, nama: "Pelatihan Seruti", tanggal_mulai: T, tanggal_selesai: T }, { id: 1, nama: "Pascabencana", tanggal_mulai: "2026-10-10", tanggal_selesai: "2026-11-10" }],
  sigap_penugasan: [
    { id: 101, kegiatan_id: 7, akun_id: 1, peran: "ppl", maks_hari: null, kelas: null, aktif: true },
    { id: 102, kegiatan_id: 7, akun_id: 2, peran: "ppl", maks_hari: null, kelas: null, aktif: true },
    { id: 103, kegiatan_id: 7, akun_id: 3, peran: "pml", maks_hari: null, kelas: null, aktif: true },
    { id: 104, kegiatan_id: 7, akun_id: 4, peran: "panitia", maks_hari: null, kelas: null, aktif: true },
    { id: 202, kegiatan_id: 1, akun_id: 2, peran: "ppl", maks_hari: null, kelas: null, aktif: true },
    { id: 203, kegiatan_id: 1, akun_id: 3, peran: "pml", maks_hari: null, kelas: null, aktif: true },
  ],
  sigap_akun: [{ id: 1, nama: "Ani" }, { id: 2, nama: "Budi" }, { id: 3, nama: "Cici" }, { id: 4, nama: "Pak P" }],
  sigap_hari_kerja: [
    { id: 1, penugasan_id: 101, akun_id: 1, tanggal: T, uji_coba_sampai: null },
    { id: 2, penugasan_id: 202, akun_id: 2, tanggal: T, uji_coba_sampai: null },
    { id: 3, penugasan_id: 203, akun_id: 3, tanggal: T, uji_coba_sampai: null },
  ],
  sigap_realisasi: [{ penugasan_id: 203, tanggal: T }],
  sigap_dokumentasi: [],
  sigap_izin_susulan: [],
  sigap_hari_kerja_riwayat: [],
});

describe("muatHariKerja", () => {
  it("peserta saja (tanpa panitia), status per sel, nama kegiatan lain", async () => {
    const { db } = buatDb(dasar());
    const d = await muatHariKerja(db, 7);
    expect(d.matriks.map((b) => b.peserta.nama)).toEqual(["Cici", "Ani", "Budi"]); // pml sebelum ppl, urut nama
    expect(d.matriks.map((b) => b.sel[0].status)).toEqual(["terkunci_lain", "ada", "lain"]);
    expect(d.matriks[2].sel[0].kegiatan_nama).toBe("Pascabencana");
  });
});

describe("ubahHariKerja", () => {
  it("pindah memasang di pelatihan, melepas di kegiatan lain, mencatat riwayat; yang terkunci dilewati", async () => {
    const { db, tabel } = buatDb(dasar());
    const h = await ubahHariKerja(db, 7, "pindah", [{ akun_id: 2, tanggal: T }, { akun_id: 3, tanggal: T }], "Iqbal");
    expect(h.berhasil).toBe(1);
    expect(h.dilewati).toHaveLength(1);
    expect(h.dilewati[0]).toMatchObject({ akun_id: 3 });
    expect(tabel.sigap_hari_kerja.filter((r) => r.akun_id === 2).map((r) => r.penugasan_id)).toEqual([102]);
    expect(tabel.sigap_hari_kerja_riwayat.map((r) => `${r.penugasan_id}:${r.aksi}`).sort()).toEqual(["102:tambah", "202:hapus"]);
    expect(tabel.sigap_hari_kerja_riwayat[0].oleh).toBe("admin:Iqbal");
  });
  it("pindah dikembalikan bila gagal memasang di pelatihan", async () => {
    const { db, tabel } = buatDb(dasar(), (t, r) => t === "sigap_hari_kerja" && r.penugasan_id === 102);
    const h = await ubahHariKerja(db, 7, "pindah", [{ akun_id: 2, tanggal: T }], "Iqbal");
    expect(h.berhasil).toBe(0);
    expect(tabel.sigap_hari_kerja.filter((r) => r.akun_id === 2).map((r) => r.penugasan_id)).toEqual([202]);
  });
  it("buat dan lepas, tidak melepas milik kegiatan lain", async () => {
    const { db, tabel } = buatDb(dasar());
    const d = await muatHariKerja(db, 7);
    const lepas = await ubahHariKerja(db, 7, "lepas", [{ akun_id: 1, tanggal: T }, { akun_id: 2, tanggal: T }], "Iqbal", d);
    expect(lepas.berhasil).toBe(1);
    expect(lepas.dilewati[0].akun_id).toBe(2);
    expect(tabel.sigap_hari_kerja.some((r) => r.penugasan_id === 202)).toBe(true);
    const buat = await ubahHariKerja(db, 7, "buat", [{ akun_id: 1, tanggal: T }], "Iqbal");
    expect(buat.berhasil).toBe(1);
    expect(tabel.sigap_hari_kerja.some((r) => r.penugasan_id === 101)).toBe(true);
  });
});
