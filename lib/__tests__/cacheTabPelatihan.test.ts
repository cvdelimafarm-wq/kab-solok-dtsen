import { describe, expect, it } from "vitest";
import { DATA_TAB, rencanaTab } from "@/lib/cacheTabPelatihan";

const PESERTA = [
  { kode: "hari-ini", href: "/sigap/pelatihan/hari-ini" },
  { kode: "instrumen", href: "/sigap/pelatihan/instrumen" },
  { kode: "pelatihan", href: "/sigap/pelatihan?tab=pelatihan" },
  { kode: "kamera", href: "/sigap/foto?kegiatan=7" },
  { kode: "monitoring", href: "/sigap/pelatihan/monitoring" },
];

describe("rencanaTab (prefetch tab pelatihan)", () => {
  it("tab aktif tidak ikut; tab lain diambil kode dan datanya", () => {
    const r = rencanaTab("hari-ini", PESERTA);
    expect(r.rute).toEqual(["/sigap/pelatihan/instrumen", "/sigap/pelatihan?tab=pelatihan", "/sigap/foto?kegiatan=7", "/sigap/pelatihan/monitoring"]);
    expect(r.data).toEqual([
      "/api/sigap/pelatihan/instrumen",
      "/api/sigap/pelatihan/materi",
      "/api/sigap/pelatihan",
      "/api/sigap/pelatihan/kelas",
      "/api/sigap/foto/mode",
      "/api/sigap/pelatihan/monitoring",
    ]);
    expect(r.data).not.toContain("/api/sigap/pelatihan/ketentuan");
  });
  it("kamera tanpa tautan (nonaktif) dilewati sepenuhnya", () => {
    const r = rencanaTab("instrumen", PESERTA.map((t) => (t.kode === "kamera" ? { ...t, href: null } : t)));
    expect(r.rute.some((x) => x.includes("foto"))).toBe(false);
    expect(r.data).not.toContain("/api/sigap/foto/mode");
  });
  it("alamat data pelatihan disesuaikan (kegiatan), data kamera tidak", () => {
    const r = rencanaTab("pelatihan", PESERTA, (u) => `${u}?kegiatan=7`);
    expect(r.data).toContain("/api/sigap/pelatihan/ketentuan?kegiatan=7");
    expect(r.data).toContain("/api/sigap/foto/mode");
    expect(r.data.some((x) => x.startsWith("/api/sigap/foto/mode?"))).toBe(false);
  });
  it("tab absen (panitia) hanya menyiapkan kodenya, tanpa data", () => {
    const r = rencanaTab("hari-ini", [{ kode: "hari-ini", href: "/a" }, { kode: "absen", href: "/sigap/pelatihan/absen" }]);
    expect(r.rute).toEqual(["/sigap/pelatihan/absen"]);
    expect(r.data).toEqual([]);
  });
  it("tautan luar atau protokol-relatif ditolak", () => {
    const r = rencanaTab("hari-ini", [{ kode: "instrumen", href: "https://jahat.example/x" }, { kode: "monitoring", href: "//jahat.example/x" }]);
    expect(r).toEqual({ rute: [], data: [] });
  });
  it("tes, kuis live, kuis pra, dan pulsa TIDAK pernah masuk daftar data", () => {
    const semua = Object.values(DATA_TAB).flat().join(" ");
    for (const terlarang of ["/tes", "/kuis", "kuis-pra", "/pulsa", "/presensi", "/absen"]) expect(semua).not.toContain(terlarang);
  });
});
