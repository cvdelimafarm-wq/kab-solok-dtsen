// lib/__tests__/siapkanSupervisi.test.ts
//
// (27 Okt 2026) Prefetch Lembar Supervisi (app/portal/siapkan.ts) dan umur simpanan data QC / Monitoring Lapangan (app/portal/dataBersama.ts).
// Yang dijaga: modul "monitoring_korwil" menyiapkan tiga API dalam urutan yang benar, alamatnya SAMA dengan yang dipakai halaman (tanpa ?kelompok=,
// supaya kunci simpanan sama), akun yang tidak punya modul itu tidak ikut mengambil data Supervisi, dan profil umur data tiap API.

import { describe, expect, it } from "vitest";
import { DATA_SUPERVISI, DATA_SUPERVISI_QC_DULU, buatRencana } from "@/app/portal/siapkan";
import { profilDari } from "@/app/portal/dataBersama";
import type { TahapHasil } from "@/lib/sigapTahap";

type ModulMini = { kode: string; status?: string; href?: string | null };

/** Tahap minimal: hanya kolom yang dibaca buatRencana (rute, terkunci, modul). */
function tahap(modul: ModulMini[], opsi: { terkunci?: boolean; rute?: string } = {}): TahapHasil {
  return {
    terkunci: opsi.terkunci ?? false,
    rute: opsi.rute ?? "/sigap/kegiatan/pendataan/3",
    modul: modul.map((m) => ({ status: "info", href: null, ...m })),
  } as unknown as TahapHasil;
}

describe("DATA_SUPERVISI", () => {
  it("berisi tiga API: Monitoring dulu, lalu Lembar Quality Check, lalu Hasil QC", () => {
    expect(DATA_SUPERVISI).toEqual(["/api/portal/korwil/monitoring", "/api/portal/qc/kuesioner", "/api/portal/qc/hasil"]);
  });

  it("alamat tanpa ?kelompok= (kunci simpanan sama dengan halaman Supervisi untuk kelompok bawaan)", () => {
    for (const a of [...DATA_SUPERVISI, ...DATA_SUPERVISI_QC_DULU]) expect(a.includes("?")).toBe(false);
  });

  it("versi 'QC dulu' memuat API yang sama, Lembar Quality Check paling depan", () => {
    expect([...DATA_SUPERVISI_QC_DULU].sort()).toEqual([...DATA_SUPERVISI].sort());
    expect(DATA_SUPERVISI_QC_DULU[0]).toBe("/api/portal/qc/kuesioner");
  });
});

describe("buatRencana: modul monitoring_korwil", () => {
  it("menyiapkan ketiga API Supervisi bila tahap memuat modul itu", () => {
    const r = buatRencana([tahap([{ kode: "monitoring_korwil", href: "/sigap/korwil?dari=%2F" }])], false);
    expect(r.data).toEqual(DATA_SUPERVISI);
    expect(r.rute).toContain("/sigap/korwil?dari=%2F");
  });

  it("akun tanpa modul itu (PML/PPL biasa) tidak mengambil data Supervisi", () => {
    const r = buatRencana([tahap([{ kode: "pendataan", href: "/sigap/pendataan" }, { kode: "identifikasi", href: "/sigap/identifikasi" }])], true);
    expect(r.data.some((a) => a.includes("/qc/") || a.includes("/korwil/"))).toBe(false);
    expect(r.data).toEqual(["/api/portal/pendataan", "/api/portal/identifikasi"]);
  });

  it("tahap terkunci dilewati", () => {
    const r = buatRencana([tahap([{ kode: "monitoring_korwil" }], { terkunci: true })], false);
    expect(r.data).toEqual([]);
  });

  it("modul lain tetap menyiapkan satu API masing-masing dan tidak ganda bila muncul di dua tahap", () => {
    const r = buatRencana([tahap([{ kode: "pendataan" }, { kode: "spdt_lembar" }]), tahap([{ kode: "pendataan" }, { kode: "monitoring_korwil" }])], false);
    expect(r.data).toEqual(["/api/portal/pendataan", "/api/portal/spdt-kk", ...DATA_SUPERVISI]);
  });

  it("wilayah_tim dilewati untuk PML, tetap diambil untuk PPL", () => {
    expect(buatRencana([tahap([{ kode: "wilayah_tim" }])], true).data).toEqual([]);
    expect(buatRencana([tahap([{ kode: "wilayah_tim" }])], false).data).toEqual(["/api/portal/wilayah-tim"]);
  });
});

describe("profilDari: umur simpanan data baru", () => {
  const MENIT = 60_000;

  it("Lembar Quality Check dan Hasil QC: segar 2 menit, tanpa muat ulang berkala (isian tidak terganggu), basi saat ganti hari", () => {
    for (const p of ["/api/portal/qc/kuesioner", "/api/portal/qc/kuesioner?kelompok=2", "/api/portal/qc/hasil", "/api/portal/qc/hasil?kelompok=2"]) {
      const pr = profilDari(p);
      expect(pr.segarMs).toBe(2 * MENIT);
      expect(pr.interval).toBe(0);
      expect(pr.hariBaru).toBe(true);
    }
  });

  it("Monitoring Lapangan admin: segar 1 menit, muat ulang tiap 2 menit, basi saat ganti hari", () => {
    const pr = profilDari("/api/portal/lapangan");
    expect(pr.segarMs).toBe(1 * MENIT);
    expect(pr.interval).toBe(2 * MENIT);
    expect(pr.hariBaru).toBe(true);
  });

  it("Monitoring Korwil tidak berubah (45 detik / 1 menit / bergantung hari)", () => {
    const pr = profilDari("/api/portal/korwil/monitoring");
    expect(pr.segarMs).toBe(45 * 1000);
    expect(pr.interval).toBe(60 * 1000);
    expect(pr.hariBaru).toBe(true);
  });

  it("alamat QC admin (unggah kuesioner) memakai profil Lembar Quality Check (awalan terpanjang), bukan bawaan", () => {
    expect(profilDari("/api/portal/qc/kuesioner/admin").segarMs).toBe(2 * MENIT);
  });
});
