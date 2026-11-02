import { describe, expect, it } from "vitest";
import * as React from "react";
import { createElement as e } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DaftarProgres } from "@/app/sigap/pelatihan/AlurPelatihan";
import { hitungLangkahPelatihan, type MasukanLangkah } from "@/lib/alurPelatihan";
import { rincianProgres, ringkasRinci } from "@/lib/progresPelatihan";

(globalThis as unknown as { React: typeof React }).React = React;

const MULAI = new Date("2026-11-09T08:00:00+07:00").getTime();
const masukan = (o: Partial<MasukanLangkah> = {}): MasukanLangkah => ({
  langkah: { undangan_dibuka: false, instrumen_diunduh: false, foto_total: 5, slot: [] },
  tes: [
    { jenis: "pretest", status: "belum_buka" },
    { jenis: "posttest", status: "belum_buka" },
  ],
  presensi: null,
  kuis: null,
  fotoTranslok: true,
  mulaiMs: MULAI,
  now: MULAI - 86_400_000,
  ...o,
});
const rinci = (m: MasukanLangkah) => rincianProgres(hitungLangkahPelatihan(m), m);
const per = (r: ReturnType<typeof rinci>, k: string) => r.find((x) => x.kode === k)!;

describe("rincianProgres", () => {
  it("undangan dan instrumen yang belum pernah dibuka = Belum dibuka; sisanya Belum saatnya", () => {
    const r = rinci(masukan());
    expect(per(r, "undangan")).toMatchObject({ status: "belum_dibuka", teks: "Belum dibuka" });
    expect(per(r, "instrumen")).toMatchObject({ status: "belum_dibuka" });
    expect(per(r, "pretest")).toMatchObject({ status: "menyusul", teks: "Belum saatnya" });
    expect(ringkasRinci(r)).toMatchObject({ selesai: 0, persen: 0 });
  });
  it("selesai memakai kata Selesai dan dihitung dalam ringkasan", () => {
    const m = masukan({ langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [] } });
    const r = rinci(m);
    expect(per(r, "undangan").status).toBe("selesai");
    const s = ringkasRinci(r);
    expect(s.selesai).toBe(2);
    expect(s.persen).toBe(Math.round((2 / s.wajib) * 100));
  });
  it("foto: progres x/y; tes sedang dikerjakan = berjalan; tes dibuka = Belum dikerjakan; terlewat", () => {
    const m = masukan({
      langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [1, 2] },
      tes: [
        { jenis: "pretest", status: "terlewat" },
        { jenis: "posttest", status: "mengerjakan" },
      ],
      now: MULAI + 3_600_000,
    });
    const r = rinci(m);
    expect(per(r, "foto_awal")).toMatchObject({ status: "berjalan", progres: { x: 2, y: 3, satuan: "foto" }, teks: "2/3 foto" });
    expect(per(r, "posttest")).toMatchObject({ status: "berjalan", teks: "Sedang dikerjakan" });
    expect(per(r, "pretest")).toMatchObject({ status: "terlewat" });
    const buka = rinci(masukan({ tes: [{ jenis: "pretest", status: "buka" }, { jenis: "posttest", status: "belum_buka" }] }));
    expect(per(buka, "pretest")).toMatchObject({ status: "belum_dikerjakan", teks: "Belum dikerjakan" });
  });
  it("tahap terkunci menjelaskan alasannya", () => {
    const r = rinci(masukan({ tes: [{ jenis: "pretest", status: "buka", terkunci: { x: 1 } }, { jenis: "posttest", status: "belum_buka" }] }));
    expect(per(r, "pretest")).toMatchObject({ status: "terkunci" });
  });
});

describe("DaftarProgres", () => {
  it("satu baris per tahap, ringkasan x/y, tautan sesuai tujuan", () => {
    const m = masukan({ langkah: { undangan_dibuka: true, instrumen_diunduh: false, foto_total: 5, slot: [1] }, now: MULAI + 3_600_000 });
    const r = rinci(m);
    const h = renderToStaticMarkup(e(DaftarProgres, { rinci: r, hrefHariIni: "/sigap/pelatihan/hari-ini", hrefKamera: "/sigap/foto?kegiatan=7" }));
    expect(h.match(/<li>/g)?.length).toBe(r.length);
    expect(h).toContain("Progres pelatihan Anda");
    expect(h).toContain("1/");
    expect(h).toContain("Belum dibuka");
    expect(h).toContain("1/3 foto");
    expect(h).toContain('href="/sigap/pelatihan/instrumen"');
    expect(h).toContain('href="/sigap/pelatihan/hari-ini"');
    expect(h).toContain('href="/sigap/foto?kegiatan=7"');
    expect(h).toContain('role="progressbar"');
    expect(h).not.toContain("LANGKAH BERIKUTNYA");
  });
});
