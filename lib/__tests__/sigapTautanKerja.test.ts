import { describe, expect, it } from "vitest";
import { adaTautanKerja, bacaTautanKerja, tanpaTautanKerja } from "../sigapTautanKerja";

describe("adaTautanKerja", () => {
  it("true bila ?tab=, ?tgl=, atau ?fokus= sah", () => {
    expect(adaTautanKerja("?p=298&tab=hari_ini&tgl=2026-10-23&fokus=foto")).toBe(true);
    expect(adaTautanKerja("?tab=arsip")).toBe(true);
    expect(adaTautanKerja("?tgl=2026-10-23")).toBe(true);
    expect(adaTautanKerja("?fokus=laporan")).toBe(true);
  });
  it("false bila hanya ?p= atau nilai asing", () => {
    expect(adaTautanKerja("")).toBe(false);
    expect(adaTautanKerja("?p=298")).toBe(false);
    expect(adaTautanKerja("?tab=entah&tgl=besok&fokus=x")).toBe(false);
  });
});

describe("bacaTautanKerja / tanpaTautanKerja", () => {
  it("tautan Rapikan nomor foto -> tab hari ini, fokus foto", () => {
    expect(bacaTautanKerja("?p=298&tab=hari_ini&tgl=2026-10-23&fokus=foto", ["2026-10-23"], "2026-10-23")).toEqual({ tab: "hari_ini", tgl: "2026-10-23", fokus: "foto" });
  });
  it("alamat dibersihkan tetapi ?p= dipertahankan", () => {
    expect(tanpaTautanKerja("/sigap/translok/t", "?p=298&tab=hari_ini&tgl=2026-10-23&fokus=foto")).toBe("/sigap/translok/t?p=298");
  });
});
