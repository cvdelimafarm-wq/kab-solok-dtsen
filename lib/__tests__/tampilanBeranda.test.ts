// (3 Nov 2026) Pilihan tampilan Beranda: kartu (bawaan) atau ikon.
import { describe, expect, it } from "vitest";
import { DAFTAR_TAMPILAN, LABEL_TAMPILAN, bacaTampilanBeranda, kunciTampilanBeranda } from "../tampilanBeranda";

describe("bacaTampilanBeranda", () => {
  it("hanya 'ikon' yang memilih ikon; selain itu kartu (bawaan)", () => {
    expect(bacaTampilanBeranda("ikon")).toBe("ikon");
    expect(bacaTampilanBeranda("kartu")).toBe("kartu");
    for (const x of [null, undefined, "", "Ikon", "grid", "{}"]) expect(bacaTampilanBeranda(x as string | null | undefined)).toBe("kartu");
  });
  it("daftar dan label lengkap, kartu lebih dulu", () => {
    expect(DAFTAR_TAMPILAN).toEqual(["kartu", "ikon"]);
    expect(LABEL_TAMPILAN).toEqual({ kartu: "Kartu", ikon: "Ikon" });
  });
  it("kunci per akun", () => {
    expect(kunciTampilanBeranda(354)).toBe("sigap_beranda_tampilan_354");
    expect(kunciTampilanBeranda(null)).toBe("sigap_beranda_tampilan_0");
    expect(kunciTampilanBeranda(1)).not.toBe(kunciTampilanBeranda(2));
  });
});
