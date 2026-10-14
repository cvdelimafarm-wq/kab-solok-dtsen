// lib/__tests__/sigapTautanKerja.test.ts
// (14 Okt 2026) Uji pembaca tautan dalam halaman kerja translok (lib/sigapTautanKerja.ts).
import { describe, expect, it } from "vitest";
import { bacaTautanKerja, tanpaTautanKerja } from "@/lib/sigapTautanKerja";

const HARI = ["2026-10-12", "2026-10-13", "2026-10-14"];
const HI = "2026-10-14";

describe("bacaTautanKerja", () => {
  it("tanpa parameter = null (perilaku lama: tab Hari Ini)", () => {
    expect(bacaTautanKerja("?p=46", HARI, HI)).toBeNull();
    expect(bacaTautanKerja("", HARI, HI)).toBeNull();
  });
  it("tab sah dibaca; nilai asing diabaikan", () => {
    expect(bacaTautanKerja("?p=46&tab=hari_kerja", HARI, HI)).toEqual({ tab: "hari_kerja", tgl: null, fokus: null });
    expect(bacaTautanKerja("?tab=arsip", HARI, HI)).toEqual({ tab: "arsip", tgl: null, fokus: null });
    expect(bacaTautanKerja("?tab=admin", HARI, HI)).toBeNull();
    expect(bacaTautanKerja("?tab=<script>", HARI, HI)).toBeNull();
  });
  it("fokus tanpa tanggal = hari ini di tab Hari Ini", () => {
    expect(bacaTautanKerja("?fokus=foto", HARI, HI)).toEqual({ tab: "hari_ini", tgl: HI, fokus: "foto" });
    expect(bacaTautanKerja("?tab=hari_ini&fokus=laporan", HARI, HI)).toEqual({ tab: "hari_ini", tgl: HI, fokus: "laporan" });
  });
  it("tanggal lampau tanpa tab = tab Hari Kerja; tanggal di luar daftar penugasan diabaikan", () => {
    expect(bacaTautanKerja("?tgl=2026-10-13", HARI, HI)).toEqual({ tab: "hari_kerja", tgl: "2026-10-13", fokus: null });
    expect(bacaTautanKerja("?tgl=2026-10-13&fokus=foto", HARI, HI)).toEqual({ tab: "hari_kerja", tgl: "2026-10-13", fokus: "foto" });
    expect(bacaTautanKerja("?tgl=2026-09-01", HARI, HI)).toBeNull();
    expect(bacaTautanKerja("?tgl=bukan-tanggal", HARI, HI)).toBeNull();
    expect(bacaTautanKerja("?tab=hari_kerja&tgl=2026-09-01", HARI, HI)).toEqual({ tab: "hari_kerja", tgl: null, fokus: null });
  });
  it("tab Arsip membuang tanggal dan bagian", () => {
    expect(bacaTautanKerja("?tab=arsip&tgl=2026-10-13&fokus=foto", HARI, HI)).toEqual({ tab: "arsip", tgl: null, fokus: null });
  });
  it("izin susulan: tab hari_kerja + tgl + fokus", () => {
    expect(bacaTautanKerja("?p=46&tab=hari_kerja&tgl=2026-10-12&fokus=foto", HARI, HI)).toEqual({ tab: "hari_kerja", tgl: "2026-10-12", fokus: "foto" });
  });
});

describe("tanpaTautanKerja", () => {
  it("membuang tab/tgl/fokus, mempertahankan p", () => {
    expect(tanpaTautanKerja("/sigap/translok/tok", "?p=46&tab=hari_kerja&tgl=2026-10-13&fokus=foto")).toBe("/sigap/translok/tok?p=46");
    expect(tanpaTautanKerja("/sigap/translok/tok", "?tab=arsip")).toBe("/sigap/translok/tok");
  });
});
