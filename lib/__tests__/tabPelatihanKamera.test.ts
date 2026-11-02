import { describe, expect, it } from "vitest";
import "./reactGlobal"; // JSX klasik: React global harus ada SEBELUM TabPelatihan dimuat (ikon dibuat saat modul dimuat)
import { createElement as e } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TabPelatihan, daftarTab } from "@/app/sigap/pelatihan/TabPelatihan";


describe("bilah 5 tab: Kamera SIGAP timbul", () => {
  it("peserta: lima tab dengan Kamera di tengah menuju halaman Kamera SIGAP kegiatan", () => {
    const tab = daftarTab("/sigap/foto?kegiatan=7");
    expect(tab.map((t) => t.kode)).toEqual(["hari-ini", "instrumen", "pelatihan", "kamera", "monitoring"]);
    expect(tab.find((t) => t.kode === "kamera")?.href).toBe("/sigap/foto?kegiatan=7");
  });
  it("tombol kamera bulat, timbul (margin negatif), bergaris putih, dan berlabel akses", () => {
    const h = renderToStaticMarkup(e(TabPelatihan, { aktif: "hari-ini", kameraHref: "/sigap/foto?kegiatan=7" }));
    expect(h).toContain('href="/sigap/foto?kegiatan=7"');
    expect(h).toContain('aria-label="Buka Kamera SIGAP"');
    expect(h).toContain("-mt-5");
    expect(h).toContain("rounded-full");
    expect(h).toContain("ring-white");
  });
  it("tanpa tautan kamera (bukan peserta): tombol tetap tampil tetapi nonaktif, tanpa tautan", () => {
    const h = renderToStaticMarkup(e(TabPelatihan, { aktif: "hari-ini", kameraHref: null }));
    expect(h).toContain("aria-disabled");
    expect(h).not.toContain("/sigap/foto");
    expect(h).toContain("Kamera");
  });
  it("tab lain tetap berupa tautan biasa dan lencana Instrumen tampil", () => {
    const h = renderToStaticMarkup(e(TabPelatihan, { aktif: "instrumen", kameraHref: "/sigap/foto?kegiatan=7", lencana: { instrumen: 2 } }));
    expect(h).toContain('href="/sigap/pelatihan/instrumen"');
    expect(h).toContain("2 belum selesai");
    expect(h).toContain('href="/sigap/pelatihan/monitoring"');
  });
});
