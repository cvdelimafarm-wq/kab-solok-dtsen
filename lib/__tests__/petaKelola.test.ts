// (23 Okt 2026, Dokumen Induk SIGAP v2) Uji peta alamat next.config.js: alamat baru dilayani lewat rewrite, alamat lama dialihkan 307 (query dipertahankan
// oleh Next), tidak ada pengalihan berantai / berputar. Tautan petugas /sigap/translok/<token> tidak boleh tersentuh.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type Aturan = { source: string; destination: string; permanent?: boolean };
const require = createRequire(import.meta.url);
const cfg = require("../../next.config.js") as { redirects: () => Promise<Aturan[]>; rewrites: () => Promise<Aturan[]> };

describe("peta alamat kelola", () => {
  it("alamat baru Monitoring dan Administrasi & SPJ dilayani lewat rewrite ke berkas halaman lama", async () => {
    const rw = await cfg.rewrites();
    expect(rw).toContainEqual({ source: "/sigap/kelola/monitoring/:path*", destination: "/sigap/kelola/lapangan/:path*" });
    expect(rw).toContainEqual({ source: "/sigap/kelola/spj/:path*", destination: "/sigap/admin/:path*" });
    expect(rw).toContainEqual({ source: "/sigap/kelola/pelatihan/:path*", destination: "/sigap/pelatihan/kelola/:path*" });
  });

  it("alamat lama dialihkan sementara (307) ke alamat baru", async () => {
    const rd = await cfg.redirects();
    const ke = (s: string) => rd.find((r) => r.source === `${s}/:path*`);
    expect(ke("/sigap/kelola/lapangan")).toMatchObject({ destination: "/sigap/kelola/monitoring/:path*", permanent: false });
    expect(ke("/sigap/admin")).toMatchObject({ destination: "/sigap/kelola/spj/:path*", permanent: false });
    expect(ke("/sigap/kelola/translok")).toMatchObject({ destination: "/sigap/kelola/spj/:path*", permanent: false });
    expect(ke("/sigap/pelatihan/kelola")).toMatchObject({ destination: "/sigap/kelola/pelatihan/:path*", permanent: false });
  });

  it("alamat /sigap/kelola/translok tidak lagi dilayani rewrite (hanya pengalihan)", async () => {
    const rw = await cfg.rewrites();
    expect(rw.some((r) => r.source.startsWith("/sigap/kelola/translok"))).toBe(false);
  });

  it("tujuan pengalihan tidak pernah menjadi sumber pengalihan lain (tidak berantai/berputar)", async () => {
    const rd = await cfg.redirects();
    const sumber = new Set(rd.map((r) => r.source.replace("/:path*", "")));
    for (const r of rd) expect(sumber.has(r.destination.replace("/:path*", ""))).toBe(false);
  });

  it("halaman petugas /sigap/translok/<token> dan API /api/sigap/admin tidak ikut dialihkan", async () => {
    const rd = await cfg.redirects();
    for (const r of rd) {
      expect(r.source.startsWith("/sigap/translok")).toBe(false);
      expect(r.source.startsWith("/api/")).toBe(false);
    }
  });
});
