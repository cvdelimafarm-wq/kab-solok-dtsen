// lib/keu/__tests__/notifikasi.test.ts
//
// (25 Okt 2026, tahap 30) Uji notifikasi, pengecualian, dan ringkasan acuan hilir.

import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import { awalForm, normalisasi } from "../identifikasi";
import { isiPredefined } from "../kebijakan";
import type { IsiLanjutan } from "../lanjutan";
import { ringkasAcuan } from "../acuan";
import { aksiPengecualian, kunciObjek, LABEL_NOTIF, normalisasiDaftar, peringatanDikecualikan, putusanVersi, tautanAman, type BarisPengecualian } from "../notifikasi";

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
function form() { const f = awalForm(); f.nama = "UJI Survei"; f.periode = "Triwulanan"; f.keList = ["Triwulan I"]; f.instrumen = "FASIH"; return normalisasi(f); }

describe("notifikasi", () => {
  it("tautanAman hanya menerima alamat SIGAP", () => {
    expect(tautanAman("/sigap/kelola/perencanaan/identifikasi/3/lanjutan#lj-pengecualian")).toBe("/sigap/kelola/perencanaan/identifikasi/3/lanjutan#lj-pengecualian");
    expect(tautanAman("/sigap/kelola/perencanaan/kebijakan")).not.toBeNull();
    expect(tautanAman("https://jahat.example")).toBeNull();
    expect(tautanAman("//jahat.example/sigap/x")).toBeNull();
    expect(tautanAman("/sigap/../admin")).toBeNull();
    expect(tautanAman("javascript:alert(1)")).toBeNull();
    expect(tautanAman("")).toBeNull();
  });
  it("normalisasiDaftar tahan terhadap bentuk salah", () => {
    expect(normalisasiDaftar(null)).toEqual({ belum: 0, daftar: [] });
    expect(normalisasiDaftar({ belum: -3, daftar: "x" })).toEqual({ belum: 0, daftar: [] });
    const d = normalisasiDaftar({ belum: 2.9, daftar: [{ id: 1, jenis: "ident_fix", judul: "A" }, { id: "x" }, null] });
    expect(d.belum).toBe(2); expect(d.daftar).toHaveLength(1); expect(d.daftar[0].isi).toBe(""); expect(d.daftar[0].dibaca_at).toBeNull();
  });
  it("setiap jenis punya label", () => {
    for (const j of ["ident_fix", "ident_pasca_h15", "nama_terisi", "lembar_menunggu", "pengecualian_diajukan", "pengecualian_putus", "penugasan_diterapkan", "gap_keras", "gap_akhir"] as const) expect(LABEL_NOTIF[j].teks.length).toBeGreaterThan(3);
  });
});

describe("pengecualian", () => {
  const b = (o: Partial<BarisPengecualian>): Pick<BarisPengecualian, "status" | "otomatis" | "diajukan_oleh"> => ({ status: "diajukan", otomatis: false, diajukan_oleh: 7, ...o });
  it("aksi tersedia mencerminkan basis data", () => {
    expect(aksiPengecualian(b({}), true, 1)).toEqual(["putus"]);
    expect(aksiPengecualian(b({}), true, 7)).toEqual(["putus", "tarik"]);
    expect(aksiPengecualian(b({}), false, 7)).toEqual(["tarik"]);
    expect(aksiPengecualian(b({}), false, 1)).toEqual([]);
    expect(aksiPengecualian(b({ otomatis: true }), true, 7)).toEqual(["putus"]);
    expect(aksiPengecualian(b({ status: "disetujui" }), true, 7)).toEqual([]);
    expect(aksiPengecualian(b({}), false, null)).toEqual([]);
  });
  it("peringatan dikecualikan hanya bila disetujui dan bukan perubahan H-15", () => {
    const w = ["Kelas A: peserta 30 melebihi batas kebijakan 25 per kelas.", "Ani merangkap PJ lapangan."];
    const baris = [
      { jenis: "kebijakan" as const, objek: "  kelas a: peserta 30 melebihi batas kebijakan 25 per kelas. ", status: "disetujui" as const },
      { jenis: "rangkap" as const, objek: "Ani merangkap PJ lapangan.", status: "ditolak" as const },
      { jenis: "perubahan_h15" as const, objek: "Ani merangkap PJ lapangan.", status: "disetujui" as const },
    ];
    expect([...peringatanDikecualikan(w, baris)]).toEqual([w[0]]);
    expect(kunciObjek("  A   B ")).toBe("a b");
  });
  it("putusanVersi", () => {
    const r = [{ jenis: "perubahan_h15" as const, lanjutan_ver: 2, status: "ditolak" as const }, { jenis: "kebijakan" as const, lanjutan_ver: 1, status: "disetujui" as const }];
    expect(putusanVersi(r, 2)).toBe("ditolak"); expect(putusanVersi(r, 1)).toBeNull(); expect(putusanVersi(r, 5)).toBeNull();
  });
});

describe("ringkasAcuan", () => {
  const f = form();
  const lembar = isiPredefined();
  it("tanpa lanjutan: hanya RAB siap, lainnya menunggu", () => {
    const a = ringkasAcuan({ form: f, tahun: 2026, upd: null, isi: null, ver: null, status: null, lembar: null, kebijakanVer: null });
    expect(a.map((x) => x.modul)).toEqual(["RAB dan revisi", "Draf pengadaan", "Rencana realisasi", "Rekrutmen mitra", "Delego, laporan harian, evaluasi", "Bendahara (pencairan)"]);
    expect(a[0].siap).toBe(true); expect(a.slice(1).every((x) => !x.siap)).toBe(true);
    expect(a[0].dari).toContain("Identifikasi awal");
  });
  it("dengan lanjutan Final: semua modul siap dan memuat angka", () => {
    const isi = salin(vektor.base) as IsiLanjutan;
    const a = ringkasAcuan({ form: f, tahun: 2026, upd: null, isi, ver: 3, status: "final", lembar, kebijakanVer: 4 });
    expect(a.every((x) => x.siap)).toBe(true);
    expect(a[0].dari).toBe("Identifikasi lanjutan versi 3 (Final)");
    expect(a[0].butir.join(" ")).not.toContain("Masih Draf");
    expect(a[2].dari).toContain("lembar kebijakan versi 4");
    expect(a[3].butir[0]).toMatch(/mitra tercatat/);
    expect(a[2].butir.join(" ")).toContain(`${isi.petugas.length} petugas`);
  });
  it("Draf menambah peringatan; tanpa lembar Bendahara belum siap", () => {
    const isi = salin(vektor.base) as IsiLanjutan; isi.petugas[0].nama = ""; isi.petugas[0].menyusul = true;
    const a = ringkasAcuan({ form: f, tahun: 2026, upd: null, isi, ver: 1, status: "draf", lembar: null, kebijakanVer: null });
    expect(a[0].butir.join(" ")).toContain("Masih Draf");
    expect(a[3].butir.join(" ")).toContain("1 nama petugas masih menyusul");
    expect(a[5].siap).toBe(false);
  });
});
