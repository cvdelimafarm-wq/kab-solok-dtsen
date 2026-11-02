import { describe, expect, it } from "vitest";
import { normalisasi } from "../identifikasi";
import { awalLanjutan, normalisasiLanjutan } from "../lanjutan";

const FORM = normalisasi({ nama: "X", periode: "Triwulanan", keList: ["Triwulan IV"], sesi: { briefing: { on: true, bentuk: "Luring", tempat: "Kantor", pengajar: true, instr: { jumlah: 1, level: "Inda", asal: "Internal BPS", jam: 2, perk: true }, tgl: {} }, pelatihan: { on: false } }, peran: { ppl: { on: true, nMit: 1, nOrg: 1, status: "Organik dan mitra" } } });

describe("id akun pada isi lanjutan (tertaut)", () => {
  it("disimpan pada petugas dan instruktur bila sah, dibuang bila tidak sah, dan bentuk data lama tidak berubah (tanpa kunci akun)", () => {
    const g = awalLanjutan(FORM, 2026);
    const lama = JSON.parse(JSON.stringify(g));
    expect(JSON.stringify(normalisasiLanjutan(lama))).toBe(JSON.stringify(normalisasiLanjutan(normalisasiLanjutan(lama)))); // idempoten
    expect(normalisasiLanjutan(lama).petugas.every((p) => !("akun" in p))).toBe(true);
    expect(normalisasiLanjutan(lama).kelas.every((k) => (k.instruktur ?? []).every((y) => !("akun" in y)))).toBe(true);
    lama.petugas[0].akun = 354; lama.petugas[1].akun = -3; lama.petugas[2] = { ...lama.petugas[2], akun: "7" };
    lama.kelas[0].instruktur[0].akun = 563;
    const n = normalisasiLanjutan(lama);
    expect(n.petugas[0].akun).toBe(354);
    expect("akun" in n.petugas[1]).toBe(false);
    expect("akun" in (n.petugas[2] ?? {})).toBe(false);
    expect(n.kelas[0].instruktur?.[0].akun).toBe(563);
  });
});
