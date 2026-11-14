// lib/__tests__/statusPengisianWa.test.ts
// (14 Nov 2026) Penjaga salin status WA (K7): hanya status pengisian, teks pengantar tetap tanpa angka dan nama.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hitungStatusWa, tahapanTersediaWa, teksPengantarWa } from "@/lib/statusPengisianWa";

const b = (kelas: number, undangan: string, hadir: boolean, pre: string, post: string) => ({ kelas, undangan, hadir, pretest: { status: pre }, posttest: { status: post }, materi: null });
const baris = [b(1, "terima", true, "selesai", "selesai"), b(1, "terima", false, "selesai", "belum"), b(2, "belum", false, "belum", "belum")];

describe("status pengisian WA", () => {
  it("menghitung sudah/belum per tahapan dan per kelas; jumlahnya sama dengan total", () => {
    const s = hitungStatusWa(baris, null, ["undangan", "hadir", "pretest", "posttest"]);
    expect(s.total).toBe(3);
    expect(s.tahapan.map((t) => [t.sudah, t.belum])).toEqual([[2, 1], [1, 2], [2, 1], [1, 2]]);
    for (const t of s.tahapan) expect(t.sudah + t.belum).toBe(s.total);
    const k1 = hitungStatusWa(baris, 1, ["pretest"]);
    expect(k1).toMatchObject({ total: 2, tahapan: [{ sudah: 2, belum: 0, terisi: "100%" }] });
  });
  it("materi hanya ditawarkan bila ada materi wajib", () => {
    expect(tahapanTersediaWa(baris)).toEqual(["undangan", "hadir", "pretest", "posttest"]);
    expect(tahapanTersediaWa([{ ...baris[0], materi: { belum: 1 } }])).toContain("materi");
  });
  it("teks pengantar sesuai templat Ketua Tim, tanpa angka hasil dan nama", () => {
    const t = teksPengantarWa({ kegiatan: "Pelatihan Seruti TW IV", kelas: 1, waktu: new Date("2026-11-14T07:30:00Z"), tautan: "https://x/sigap" });
    expect(t).toBe("*Status pengisian · Pelatihan Seruti TW IV · Kelas 1*\nSabtu, 14 November 2026 pukul 14.30 WIB\n\nYang belum, mohon segera melengkapi di SIGAP: https://x/sigap");
  });
  it("layar: lembar salin memakai gambar tabel dan tidak memuat nilai/nama", () => {
    const komp = readFileSync("app/sigap/pelatihan/monitoring/SalinStatusWa.tsx", "utf8");
    expect(komp).toMatch(/hitungStatusWa/);
    expect(komp).toMatch(/teksPengantarWa/);
    expect(komp).toMatch(/image\/png/);
    expect(komp).not.toMatch(/\.nama\b/);
    expect(komp).not.toMatch(/skor|nilai_akhir/);
  });
});
