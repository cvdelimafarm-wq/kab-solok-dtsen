import { describe, expect, it } from "vitest";
import { PINTU_TAB, TAB_AWAL, TAB_PENDATAAN, bacaTabPendataan, labelTabPendataan, urlTabPendataan, type KodeTabPendataan } from "../sigapPendataanTab";

describe("TAB_PENDATAAN", () => {
  it("urutan runut mengikuti alur kerja; kode unik; Ringkasan paling depan", () => {
    expect(TAB_PENDATAAN.map((t) => t.kode)).toEqual(["ringkasan", "persiapan", "tim", "siaran", "monitoring", "pemeriksaan", "administrasi"]);
    expect(new Set(TAB_PENDATAAN.map((t) => t.kode)).size).toBe(TAB_PENDATAAN.length);
    expect(TAB_AWAL).toBe("ringkasan");
  });
  it("tab bernomor 1-6 berurutan", () => {
    const nomor = TAB_PENDATAAN.map((t) => /^(\d) ·/.exec(t.label)?.[1]).filter(Boolean);
    expect(nomor).toEqual(["1", "2", "3", "4", "5", "6"]);
  });
  it("label ditemukan per kode", () => {
    expect(labelTabPendataan("monitoring")).toBe("4 · Monitoring");
  });
});

describe("bacaTabPendataan", () => {
  it("kode dikenal -> tab itu (huruf besar/spasi diabaikan)", () => {
    expect(bacaTabPendataan("monitoring")).toBe("monitoring");
    expect(bacaTabPendataan("  Administrasi ")).toBe("administrasi");
  });
  it("alamat lama: ?tab=unggah -> Persiapan; tanpa ?tab / tak dikenal -> Ringkasan", () => {
    expect(bacaTabPendataan("unggah")).toBe("persiapan");
    expect(bacaTabPendataan(null)).toBe("ringkasan");
    expect(bacaTabPendataan(undefined)).toBe("ringkasan");
    expect(bacaTabPendataan("")).toBe("ringkasan");
    expect(bacaTabPendataan("entah")).toBe("ringkasan");
  });
});

describe("urlTabPendataan", () => {
  const P = "/sigap/kelola/pendataan";
  it("Ringkasan = tanpa ?tab", () => {
    expect(urlTabPendataan(P, "?tab=tim", "ringkasan")).toBe(P);
  });
  it("tab lain mengisi ?tab", () => {
    expect(urlTabPendataan(P, "", "siaran")).toBe(`${P}?tab=siaran`);
  });
  it("?v hanya hidup di Monitoring; parameter lain tetap", () => {
    expect(urlTabPendataan(P, "?tab=monitoring&v=poin", "monitoring")).toBe(`${P}?tab=monitoring&v=poin`);
    expect(urlTabPendataan(P, "?tab=monitoring&v=poin", "tim")).toBe(`${P}?tab=tim`);
    expect(urlTabPendataan(P, "?x=1&v=poin", "pemeriksaan")).toBe(`${P}?x=1&tab=pemeriksaan`);
  });
});

describe("PINTU_TAB", () => {
  const semua = Object.values(PINTU_TAB).flatMap((k) => (k ?? []).flatMap((g) => g.item));
  it("hanya tab yang isinya tautan memiliki pintu masuk", () => {
    const kunci = Object.keys(PINTU_TAB) as KodeTabPendataan[];
    expect(kunci.sort()).toEqual(["administrasi", "pemeriksaan", "tim"]);
  });
  it("id unik; item bertautan memakai alamat dalam aplikasi; item 'segera' tanpa tautan", () => {
    expect(new Set(semua.map((i) => i.id)).size).toBe(semua.length);
    for (const i of semua) {
      if (i.status === "segera") expect(i.href).toBeUndefined();
      else expect(i.href).toMatch(/^\/[a-z]/);
    }
  });
  it("tidak ada alamat tab admin transport yang salah ketik", () => {
    const tl = semua.filter((i) => i.href?.startsWith("/sigap/kelola/translok")).map((i) => i.href);
    expect(tl.sort()).toEqual(["/sigap/kelola/translok?tab=kegiatan", "/sigap/kelola/translok?tab=monitoring", "/sigap/kelola/translok?tab=penugasan", "/sigap/kelola/translok?tab=verifikasi"]);
  });
});
