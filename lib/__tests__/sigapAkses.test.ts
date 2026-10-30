import { describe, expect, it } from "vitest";
import { boleh, bolehPsp, KEGIATAN_PSP, type PetaIzin } from "@/lib/sigapAkses";

const psp: PetaIzin = { "bencana.admin": { level: "kelola", semua: false, kegiatan: [1, 3] } };
const spdt: PetaIzin = { "bencana.admin": { level: "kelola", semua: false, kegiatan: [2] } };
const semua: PetaIzin = { "bencana.admin": { level: "kelola", semua: true, kegiatan: [] } };
const lihatPsp: PetaIzin = { "bencana.admin": { level: "lihat", semua: false, kegiatan: [1] } };

describe("bolehPsp — Kelola Pendataan khusus survei PSP", () => {
  it("KEGIATAN_PSP = 1", () => expect(KEGIATAN_PSP).toBe(1));
  it("pengelola PSP boleh", () => {
    expect(bolehPsp(psp, "lihat")).toBe(true);
    expect(bolehPsp(psp, "kelola")).toBe(true);
  });
  it("pengelola SPDT NTP TIDAK boleh masuk fitur PSP", () => {
    expect(bolehPsp(spdt, "lihat")).toBe(false);
    expect(bolehPsp(spdt, "kelola")).toBe(false);
  });
  it("lingkup semua (admin aplikasi) boleh", () => expect(bolehPsp(semua, "kelola")).toBe(true));
  it("level lihat tidak cukup untuk kelola", () => {
    expect(bolehPsp(lihatPsp, "lihat")).toBe(true);
    expect(bolehPsp(lihatPsp, "kelola")).toBe(false);
  });
  it("tanpa izin sama sekali ditolak", () => expect(bolehPsp({}, "lihat")).toBe(false));
});

describe("boleh per kegiatan (dipakai rute QC admin/dokumen)", () => {
  it("pengelola SPDT NTP hanya kegiatan 2", () => {
    expect(boleh(spdt, "bencana.admin", "kelola", 2)).toBe(true);
    expect(boleh(spdt, "bencana.admin", "lihat", 1)).toBe(false);
  });
  it("pengelola PSP tidak masuk kegiatan 2", () => expect(boleh(psp, "bencana.admin", "lihat", 2)).toBe(false));
  it("gabungan peran: kegiatan 1,2,3 semua terbuka", () => {
    const gab: PetaIzin = { "bencana.admin": { level: "kelola", semua: false, kegiatan: [1, 3, 2] } };
    for (const k of [1, 2, 3]) expect(boleh(gab, "bencana.admin", "kelola", k)).toBe(true);
    expect(boleh(gab, "bencana.admin", "lihat", 4)).toBe(false);
  });
});
