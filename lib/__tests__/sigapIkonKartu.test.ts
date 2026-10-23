import { describe, it, expect } from "vitest";
import { ikonKartu } from "../sigapTugasUtama";

// (23 Okt 2026, audit Tahap 2) dua kartu Transport Lokal tidak boleh berikon sama.
describe("ikonKartu", () => {
  it("Transport Lokal kegiatan pendataan tetap 'motor'", () => {
    expect(ikonKartu("translok-12", "Transport Lokal — Pendataan Pascabencana 2026")).toBe("motor");
  });
  it("Transport Lokal kegiatan pelatihan berikon 'langkah' (beda dari pendataan)", () => {
    expect(ikonKartu("translok-7", "Transport Lokal — Translok Pelatihan Petugas PSP")).toBe("langkah");
  });
  it("tanpa judul: perilaku lama dipertahankan", () => {
    expect(ikonKartu("translok-3")).toBe("motor");
    expect(ikonKartu("admin-translok")).toBe("motor");
    expect(ikonKartu("kartu-tak-dikenal")).toBe("arsip");
  });
});
