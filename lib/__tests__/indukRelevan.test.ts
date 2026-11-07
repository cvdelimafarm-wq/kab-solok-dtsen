// lib/__tests__/indukRelevan.test.ts
//
// (7 Nov 2026) Kartu Seruti TW IV tidak boleh muncul di petugas yang tidak ditugaskan di Seruti (bug: 450 akun bencana ikut melihatnya).

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { indukRelevan, MODUL_KHAS_BENCANA, type SyaratRelevan } from "@/lib/sigapIndukRelevan";

// isi tahap nyata di sigap_tahap (7 Nov 2026)
const ISI_BENCANA = ["konfirmasi", "pelatihan", "translok:3", "monitoring_korwil", "wilayah_tim", "identifikasi", "pendataan", "translok:1"];
const ISI_SERUTI = ["pelatihan", "translok:7", "translok:6"];
const ISI_SPDT = ["spdt_lembar", "translok:2"];

const dasar: SyaratRelevan = { isiModul: [], petugasBencana: false, jumlahPenugasan: 0, pengelola: false, supervisorSpdt: false };
const s = (x: Partial<SyaratRelevan>): SyaratRelevan => ({ ...dasar, ...x });

describe("induk Seruti (tanpa modul khas bencana)", () => {
  it("petugas bencana TANPA penugasan Seruti tidak melihatnya (inti bug)", () => {
    expect(indukRelevan(s({ isiModul: ISI_SERUTI, petugasBencana: true }))).toBe(false);
  });
  it("akun tanpa penugasan apa pun tidak melihatnya", () => {
    expect(indukRelevan(s({ isiModul: ISI_SERUTI }))).toBe(false);
  });
  it("petugas yang ditugaskan di Seruti melihatnya, dengan atau tanpa id petugas bencana", () => {
    expect(indukRelevan(s({ isiModul: ISI_SERUTI, jumlahPenugasan: 2 }))).toBe(true);
    expect(indukRelevan(s({ isiModul: ISI_SERUTI, jumlahPenugasan: 1, petugasBencana: true }))).toBe(true);
  });
  it("panitia/instruktur pelatihan Seruti tetap melihatnya", () => {
    expect(indukRelevan(s({ isiModul: ISI_SERUTI, pengelola: true }))).toBe(true);
  });
  it("supervisor SPDT tidak otomatis melihat Seruti", () => {
    expect(indukRelevan(s({ isiModul: ISI_SERUTI, supervisorSpdt: true }))).toBe(false);
  });
});

describe("induk Pascabencana (modul khas bencana) tidak berubah", () => {
  it("petugas bencana melihatnya walau belum ada penugasan", () => {
    expect(indukRelevan(s({ isiModul: ISI_BENCANA, petugasBencana: true }))).toBe(true);
  });
  it("akun bukan petugas bencana dan tanpa penugasan tidak melihatnya", () => {
    expect(indukRelevan(s({ isiModul: ISI_BENCANA }))).toBe(false);
  });
  it("penugasan atau pengelola cukup", () => {
    expect(indukRelevan(s({ isiModul: ISI_BENCANA, jumlahPenugasan: 1 }))).toBe(true);
    expect(indukRelevan(s({ isiModul: ISI_BENCANA, pengelola: true }))).toBe(true);
  });
  it("setiap modul khas bencana saja sudah cukup mengenali induk bencana", () => {
    for (const m of MODUL_KHAS_BENCANA) expect(indukRelevan(s({ isiModul: [m], petugasBencana: true }))).toBe(true);
  });
});

describe("induk SPDT NTP tidak berubah", () => {
  it("petugas bencana tidak ikut melihatnya", () => {
    expect(indukRelevan(s({ isiModul: ISI_SPDT, petugasBencana: true }))).toBe(false);
  });
  it("penugasan atau supervisor melihatnya", () => {
    expect(indukRelevan(s({ isiModul: ISI_SPDT, jumlahPenugasan: 1 }))).toBe(true);
    expect(indukRelevan(s({ isiModul: ISI_SPDT, supervisorSpdt: true }))).toBe(true);
  });
});

describe("lib/portal/induk.ts memakai indukRelevan", () => {
  it("indukUntukAkun tidak lagi memakai syarat petugas_bencana_id sendiri untuk semua induk", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "portal", "induk.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
    expect(src).toMatch(/indukRelevan\(/);
    expect(src).toMatch(/const relevan = indukRelevan\(/); // bukan ekspresi sendiri
  });
});
