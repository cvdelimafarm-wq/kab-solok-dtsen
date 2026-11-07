// lib/__tests__/indukRelevan.test.ts
//
// (7 Nov 2026) Kartu kegiatan induk hanya untuk yang ditugaskan di kegiatan itu. Bug: roster seluruh mitra (petugas_bencana_id, ~450 akun)
// ikut melihat kartu Seruti TW IV dan Pascabencana.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { indukRelevan, type SyaratRelevan } from "@/lib/sigapIndukRelevan";

// isi tahap nyata di sigap_tahap (7 Nov 2026)
const ISI_BENCANA = ["konfirmasi", "pelatihan", "translok:3", "monitoring_korwil", "wilayah_tim", "identifikasi", "pendataan", "translok:1"];
const ISI_SERUTI = ["pelatihan", "translok:7", "translok:6"];
const ISI_SPDT = ["spdt_lembar", "translok:2"];

const s = (isiModul: string[], x: Partial<SyaratRelevan> = {}): SyaratRelevan => ({ isiModul, jumlahPenugasan: 0, pengelola: false, supervisorSpdt: false, ...x });

describe.each([
  ["Seruti TW IV", ISI_SERUTI],
  ["Pascabencana", ISI_BENCANA],
  ["SPDT NTP", ISI_SPDT],
])("induk %s", (_nama, isi) => {
  it("akun tanpa penugasan dan bukan pengelola tidak melihatnya", () => {
    expect(indukRelevan(s(isi))).toBe(false);
  });
  it("akun yang ditugaskan melihatnya", () => {
    expect(indukRelevan(s(isi, { jumlahPenugasan: 1 }))).toBe(true);
    expect(indukRelevan(s(isi, { jumlahPenugasan: 3 }))).toBe(true);
  });
  it("panitia/instruktur pelatihan induk ini melihatnya", () => {
    expect(indukRelevan(s(isi, { pengelola: true }))).toBe(true);
  });
});

describe("supervisor SPDT", () => {
  it("melihat SPDT NTP tanpa penugasan, tetapi tidak membuka induk lain", () => {
    expect(indukRelevan(s(ISI_SPDT, { supervisorSpdt: true }))).toBe(true);
    expect(indukRelevan(s(ISI_SERUTI, { supervisorSpdt: true }))).toBe(false);
    expect(indukRelevan(s(ISI_BENCANA, { supervisorSpdt: true }))).toBe(false);
  });
});

describe("lib/portal/induk.ts", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "..", "portal", "induk.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
  it("memutuskan relevansi lewat indukRelevan", () => {
    expect(src).toMatch(/const relevan = indukRelevan\(/);
  });
  it("petugas_bencana_id tidak lagi ikut menentukan induk mana yang tampil", () => {
    const ambil = src.slice(src.indexOf("const relevan = indukRelevan("));
    const kalimat = ambil.slice(0, ambil.indexOf(";"));
    expect(kalimat).not.toMatch(/petugas_bencana_id|petugasBencana/);
  });
});
