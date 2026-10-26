// lib/keu/__tests__/statusPengadaan.test.ts
//
// (26 Okt 2026, tahap 35) Uji status pelacakan pengadaan: kode butir tetap, peta status, ringkasan, butir yatim, dan pemeriksa masukan.

import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import type { IsiLanjutan } from "../lanjutan";
import { normalisasi } from "../identifikasi";
import { kodeTetap, susunPengadaan, type ItemPengadaan } from "../pengadaan";
import { argumenCatat, LABEL_STATUS, URUTAN_STATUS, periksaCatatan, petaStatus, ringkasStatus, statusBerikut, statusButir } from "../statusPengadaan";

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const dasar = (): IsiLanjutan => salin(vektor.base) as unknown as IsiLanjutan;
const formKosong = () => normalisasi({ nama: "UJI", periode: "Triwulanan", keList: ["Triwulan I"], instrumen: "FASIH" } as never);

const item = (id: string, perlu: string[] = []): ItemPengadaan => ({
  kunci: "pg1", id, kelompok: "Pelatihan", jenis: "Konsumsi", uraian: `Butir ${id}`, akun: "521211", volume: 1, satuan: "orang", tarif: null, nilai: null, tempat: "", paket: "",
  butuhMulai: null, butuhSelesai: null, perkiraan: false, perlu, catatan: [],
});

describe("kodeTetap", () => {
  it("huruf kecil, hanya a-z 0-9 _ -, digabung titik dua", () => {
    expect(kodeTetap("k1", "paket")).toBe("k1:paket");
    expect(kodeTetap("Kelas Satu!", "Konsumsi")).toBe("kelas-satu:konsumsi");
    expect(kodeTetap("rapat", "evaluasi")).toBe("rapat:evaluasi");
    expect(kodeTetap("", "paket")).toBe("paket");
  });
  it("maksimal 80 huruf dan lolos pola basis data", () => {
    const k = kodeTetap("x".repeat(200), "paket");
    expect(k.length).toBeLessThanOrEqual(80);
    expect(/^[a-z0-9:_-]{1,80}$/.test(k)).toBe(true);
  });
});

describe("susunPengadaan: kode butir tetap", () => {
  it("setiap butir punya kode unik yang lolos pola basis data", () => {
    const isi = dasar();
    isi.kelas.push({ ...isi.kelas[0], id: "k2", mulai: "2026-03-05", selesai: "2026-03-06" });
    const form = formKosong();
    const daftar = susunPengadaan(isi, form, 2026, null, [{ mulai: "2026-03-10", selesai: "2026-03-31" }], []);
    expect(daftar.length).toBeGreaterThan(1);
    const ids = daftar.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(/^[a-z0-9:_-]{1,80}$/.test(id), id).toBe(true);
    expect(ids).toContain("k1:paket");
    expect(ids).toContain("k2:paket");
  });
  it("kode tidak bergeser bila kelas lain ditambahkan di depan", () => {
    const a = dasar();
    const b = dasar();
    b.kelas.unshift({ ...b.kelas[0], id: "k0", mulai: "2026-02-20", selesai: "2026-02-21" });
    const form = formKosong();
    const idA = susunPengadaan(a, form, 2026, null, [{ mulai: "2026-03-10", selesai: "2026-03-31" }], []).find((d) => d.id.startsWith("k1:"))!;
    const idB = susunPengadaan(b, form, 2026, null, [{ mulai: "2026-03-10", selesai: "2026-03-31" }], []).find((d) => d.id.startsWith("k1:"))!;
    expect(idB.id).toBe(idA.id);
    expect(idB.kunci).not.toBe(idA.kunci); // nomor urut boleh bergeser, kode tetap tidak
  });
  it("dua kelas tanpa kode tidak berbagi satu kode", () => {
    const isi = dasar();
    isi.kelas = [{ ...isi.kelas[0], id: "" }, { ...isi.kelas[0], id: "", mulai: "2026-03-05", selesai: "2026-03-06" }];
    const ids = susunPengadaan(isi, formKosong(), 2026, null, [], []).map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("petaStatus dan statusButir", () => {
  it("memetakan baris; baris rusak dilewati; tanpa baris = belum", () => {
    const peta = petaStatus([
      { item: "k1:paket", status: "diajukan", rujukan: "Perm 1", catatan: "", diubah_oleh_nama: "Iqbal", diubah_at: "2026-10-26T01:00:00Z" },
      { item: "rapat:evaluasi", status: "ngawur" as never },
      { item: "", status: "selesai" },
      { status: "selesai" },
    ]);
    expect(peta.size).toBe(1);
    expect(peta.get("k1:paket")).toEqual({ status: "diajukan", rujukan: "Perm 1", catatan: "", oleh: "Iqbal", waktu: "2026-10-26T01:00:00Z" });
    expect(statusButir(peta, "k1:paket")).toBe("diajukan");
    expect(statusButir(peta, "tidak:ada")).toBe("belum");
    expect(petaStatus(null).size).toBe(0);
  });
});

describe("ringkasStatus", () => {
  const daftar = [item("a"), item("b", ["tanggal belum ada"]), item("c"), item("d")];
  it("menghitung per status; butir tanpa catatan = belum", () => {
    const peta = petaStatus([{ item: "a", status: "selesai" }, { item: "b", status: "diajukan" }, { item: "c", status: "batal" }]);
    const r = ringkasStatus(daftar, peta);
    expect(r.per).toEqual({ belum: 1, diajukan: 1, diproses: 0, selesai: 1, batal: 1 });
    expect(r.jumlah).toBe(4);
    expect(r.diajukanBelumLengkap).toBe(1);
    expect(r.yatim).toEqual([]);
  });
  it("butir yang tercatat tetapi hilang dari draf dilaporkan sebagai yatim (kecuali berstatus belum)", () => {
    const peta = petaStatus([{ item: "a", status: "diproses" }, { item: "lama:paket", status: "diajukan" }, { item: "lama2:paket", status: "belum" }]);
    const r = ringkasStatus(daftar, peta, [{ item: "lama:paket", uraian: "Kelas lama: paket" }]);
    expect(r.yatim).toEqual([{ id: "lama:paket", uraian: "Kelas lama: paket", status: "diajukan" }]);
    expect(r.per.belum).toBe(3);
  });
});

describe("statusBerikut dan pemeriksa masukan", () => {
  it("urutan lazim", () => {
    expect(statusBerikut("belum")).toBe("diajukan");
    expect(statusBerikut("diajukan")).toBe("diproses");
    expect(statusBerikut("diproses")).toBe("selesai");
    expect(statusBerikut("selesai")).toBeNull();
    expect(statusBerikut("batal")).toBeNull();
  });
  it("label lengkap untuk semua status", () => {
    for (const s of URUTAN_STATUS) expect(LABEL_STATUS[s].teks.length).toBeGreaterThan(3);
  });
  it("sama dengan aturan basis data: batal wajib alasan, batas panjang", () => {
    expect(periksaCatatan("batal", "", "")).toContain("wajib");
    expect(periksaCatatan("batal", "", "duh")).toContain("wajib");
    expect(periksaCatatan("batal", "", "Kelas dibatalkan")).toBeNull();
    expect(periksaCatatan("diajukan", "r".repeat(101), "")).toContain("100");
    expect(periksaCatatan("diajukan", "", "c".repeat(301))).toContain("300");
    expect(periksaCatatan("selesai", " SPK 1 ", "  ")).toBeNull();
  });
  it("argumen fungsi: dipangkas dan nama parameter cocok dengan SQL", () => {
    const a = argumenCatat(7, { id: "k1:paket", uraian: "u".repeat(300) }, "diajukan", "  Perm 1 ", " ok ");
    expect(Object.keys(a).sort()).toEqual(["p_catatan", "p_ident", "p_item", "p_rujukan", "p_status", "p_uraian"]);
    expect(a.p_uraian).toHaveLength(200);
    expect(a.p_rujukan).toBe("Perm 1");
    expect(a.p_catatan).toBe("ok");
  });
});
