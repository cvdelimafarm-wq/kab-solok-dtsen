import { describe, expect, it } from "vitest";
import { jedaPolaQc } from "@/lib/sigapQcPola";

describe("jedaPolaQc", () => {
  it("belum ada status: 1 menit", () => expect(jedaPolaQc(null)).toBe(60_000));
  it("wajib mengisi: 1 menit", () => expect(jedaPolaQc({ aktif: true, perlu: true })).toBe(60_000));
  it("aktif tapi tidak perlu: 3 menit", () => expect(jedaPolaQc({ aktif: true, perlu: false })).toBe(180_000));
  it("tidak aktif: 5 menit", () => expect(jedaPolaQc({ aktif: false })).toBe(300_000));
});
