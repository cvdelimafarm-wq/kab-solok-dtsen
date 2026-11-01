import { describe, expect, it } from "vitest";
import { bolehRevisitTerkunci, hariWib, penandaanTerkunci, tindakanDiizinkan } from "../kunciPenandaan";

// 1 Nov 2026 10:00 WIB = 03:00Z
const SEKARANG = Date.parse("2026-11-01T03:00:00Z");

describe("hariWib", () => {
  it("memakai tanggal WIB, bukan UTC", () => {
    expect(hariWib("2026-10-31T17:30:00Z")).toBe("2026-11-01"); // 00:30 WIB
    expect(hariWib("2026-10-31T16:59:00Z")).toBe("2026-10-31"); // 23:59 WIB
  });
  it("waktu kosong/tidak sah -> null", () => {
    expect(hariWib(null)).toBeNull();
    expect(hariWib("")).toBeNull();
    expect(hariWib("bukan tanggal")).toBeNull();
  });
});

describe("penandaanTerkunci", () => {
  it("belum ada hasil -> tidak terkunci", () => {
    expect(penandaanTerkunci({ hasil: null, status_at: "2026-10-20T03:00:00Z" }, SEKARANG)).toBe(false);
  });
  it("ditandai hari ini -> terbuka", () => {
    expect(penandaanTerkunci({ hasil: "terdampak", status_at: "2026-11-01T01:00:00Z" }, SEKARANG)).toBe(false);
    expect(penandaanTerkunci({ hasil: "terdampak", status_at: "2026-10-31T17:05:00Z" }, SEKARANG)).toBe(false); // 00:05 WIB hari ini
  });
  it("ditandai kemarin (WIB) -> terkunci", () => {
    expect(penandaanTerkunci({ hasil: "terdampak", status_at: "2026-10-31T16:55:00Z" }, SEKARANG)).toBe(true); // 23:55 WIB kemarin
    expect(penandaanTerkunci({ hasil: "tidak_terdampak", status_at: "2026-10-20T03:00:00Z" }, SEKARANG)).toBe(true);
  });
  it("status_at kosong -> tidak terkunci (jangan menebak)", () => {
    expect(penandaanTerkunci({ hasil: "terdampak", status_at: null }, SEKARANG)).toBe(false);
  });
});

describe("bolehRevisitTerkunci", () => {
  it("hanya bila Sub SLS ditandai revisit dan hasil sekarang bukan terdampak", () => {
    expect(bolehRevisitTerkunci({ hasil: "tidak_terdampak", status_at: null }, true)).toBe(true);
    expect(bolehRevisitTerkunci({ hasil: "tidak_ditemukan", status_at: null }, true)).toBe(true);
    expect(bolehRevisitTerkunci({ hasil: "terdampak", status_at: null }, true)).toBe(false);
    expect(bolehRevisitTerkunci({ hasil: "tidak_terdampak", status_at: null }, false)).toBe(false);
    expect(bolehRevisitTerkunci({ hasil: "tidak_terdampak", status_at: null }, undefined)).toBe(false);
    expect(bolehRevisitTerkunci({ hasil: null, status_at: null }, true)).toBe(false);
  });
});

describe("tindakanDiizinkan", () => {
  const lama = { hasil: "tidak_terdampak", status_at: "2026-10-30T03:00:00Z", ppl_akun_id: 7, revisit: false };
  const ya = (t: { hasil: string; revisit: boolean }, saya = 7, sub?: boolean) => tindakanDiizinkan(lama, t, saya, sub, SEKARANG);

  it("hari lalu: ganti hasil, kembalikan ke belum, ambil alih -> ditolak", () => {
    expect(ya({ hasil: "terdampak", revisit: false })).toBe(false);
    expect(ya({ hasil: "belum", revisit: false })).toBe(false);
    expect(ya({ hasil: "tidak_terdampak", revisit: false }, 9)).toBe(false); // rekan, hasil sama = ambil alih
  });
  it("hari lalu: tanda ulang identik oleh pemiliknya -> bukan perubahan, diizinkan", () => {
    expect(ya({ hasil: "tidak_terdampak", revisit: false })).toBe(true);
  });
  it("hari lalu: revisit diizinkan hanya bila Sub SLS ditandai", () => {
    expect(ya({ hasil: "terdampak", revisit: true }, 7, true)).toBe(true);
    expect(ya({ hasil: "terdampak", revisit: true }, 9, true)).toBe(true); // rekan tim boleh merevisit
    expect(ya({ hasil: "terdampak", revisit: true }, 7, false)).toBe(false);
  });
  it("revisit pada KK yang sudah terdampak tidak punya makna -> ditolak", () => {
    const td = { hasil: "terdampak", status_at: "2026-10-30T03:00:00Z", ppl_akun_id: 7, revisit: false };
    expect(tindakanDiizinkan(td, { hasil: "terdampak", revisit: true }, 7, true, SEKARANG)).toBe(false);
  });
  it("hari ini: bebas", () => {
    const hariIni = { hasil: "tidak_terdampak", status_at: "2026-11-01T01:00:00Z", ppl_akun_id: 9, revisit: false };
    expect(tindakanDiizinkan(hariIni, { hasil: "terdampak", revisit: false }, 7, false, SEKARANG)).toBe(true);
    expect(tindakanDiizinkan(hariIni, { hasil: "belum", revisit: false }, 7, false, SEKARANG)).toBe(true);
  });
  it("belum ada hasil: bebas", () => {
    expect(tindakanDiizinkan({ hasil: null, status_at: null, ppl_akun_id: null }, { hasil: "terdampak", revisit: false }, 7, false, SEKARANG)).toBe(true);
  });
});
