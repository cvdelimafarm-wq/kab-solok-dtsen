import { describe, expect, it } from "vitest";
import { teksTerakhir } from "../../app/portal/luring";

describe("pita luring: teks terakhir tersambung (WIB)", () => {
  const t = (iso: string) => Date.parse(iso);
  it("hari yang sama: pukul HH.MM; hari lain: tanggal + pukul", () => {
    expect(teksTerakhir(t("2026-11-13T07:05:00Z"), t("2026-11-13T09:00:00Z"))).toBe("pukul 14.05");
    expect(teksTerakhir(t("2026-11-12T07:05:00Z"), t("2026-11-13T09:00:00Z"))).toBe("12 Nov pukul 14.05");
  });
});
