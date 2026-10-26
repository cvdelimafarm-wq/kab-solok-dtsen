import { describe, expect, it } from "vitest";
import { UMUR_TAMPILAN_MS, bacaTampilanKerja, kemasTampilan, kunciTampilanKerja, panduanSelesai } from "../sigapPanduan";

describe("panduanSelesai", () => {
  it("selesai bila tombol Selesai pernah tersimpan", () => {
    expect(panduanSelesai("2026-10-20T01:00:00Z", 0)).toBe(true);
  });
  it("selesai bila sudah punya hari kerja walau tombol belum tersimpan", () => {
    expect(panduanSelesai(null, 3)).toBe(true);
    expect(panduanSelesai(undefined, 1)).toBe(true);
  });
  it("belum selesai bila tidak ada keduanya", () => {
    expect(panduanSelesai(null, 0)).toBe(false);
    expect(panduanSelesai(undefined, 0)).toBe(false);
    expect(panduanSelesai("", 0)).toBe(false);
  });
  it("angka hari kerja tidak valid dianggap 0", () => {
    expect(panduanSelesai(null, NaN)).toBe(false);
    expect(panduanSelesai(null, -2)).toBe(false);
  });
});

describe("tampilan tersimpan", () => {
  const T = 1_800_000_000_000;
  it("kunci per token", () => {
    expect(kunciTampilanKerja("abc")).toBe("sigap-kerja-tampilan:abc");
  });
  it("bolak-balik: kemas lalu baca", () => {
    const mentah = kemasTampilan({ tab: "arsip", langkah: null, pen: 49 }, T);
    expect(bacaTampilanKerja(mentah, T + 5 * 60_000)).toEqual({ tab: "arsip", langkah: null, pen: 49 });
    expect(bacaTampilanKerja(kemasTampilan({ tab: "hari_ini", langkah: 4, pen: null }, T), T + 1000)).toEqual({ tab: "hari_ini", langkah: 4, pen: null });
  });
  it("kedaluwarsa setelah 1 jam; waktu dari masa depan ditolak", () => {
    const mentah = kemasTampilan({ tab: "hari_ini", langkah: null, pen: null }, T);
    expect(bacaTampilanKerja(mentah, T + UMUR_TAMPILAN_MS)).not.toBeNull();
    expect(bacaTampilanKerja(mentah, T + UMUR_TAMPILAN_MS + 1)).toBeNull();
    expect(bacaTampilanKerja(mentah, T - 120_000)).toBeNull();
  });
  it("kosong, rusak, atau isi asing = null", () => {
    expect(bacaTampilanKerja(null, T)).toBeNull();
    expect(bacaTampilanKerja("", T)).toBeNull();
    expect(bacaTampilanKerja("{bukan json", T)).toBeNull();
    expect(bacaTampilanKerja("123", T)).toBeNull();
    expect(bacaTampilanKerja(JSON.stringify({ tab: "admin", langkah: null, pen: null, t: T }), T)).toBeNull();
    expect(bacaTampilanKerja(JSON.stringify({ tab: "arsip", langkah: 9, pen: null, t: T }), T)).toBeNull();
    expect(bacaTampilanKerja(JSON.stringify({ tab: "arsip", langkah: 0, pen: null, t: T }), T)).toBeNull();
    expect(bacaTampilanKerja(JSON.stringify({ tab: "arsip", langkah: "2", pen: null, t: T }), T)).toBeNull();
    expect(bacaTampilanKerja(JSON.stringify({ tab: "arsip", langkah: null, pen: -1, t: T }), T)).toBeNull();
    expect(bacaTampilanKerja(JSON.stringify({ tab: "arsip", langkah: null, pen: "7", t: T }), T)).toBeNull();
    expect(bacaTampilanKerja(JSON.stringify({ tab: "arsip", langkah: null, pen: null }), T)).toBeNull();
  });
  it("langkah/pen yang tidak ada diperlakukan null", () => {
    expect(bacaTampilanKerja(JSON.stringify({ tab: "hari_kerja", t: T }), T)).toEqual({ tab: "hari_kerja", langkah: null, pen: null });
  });
});
