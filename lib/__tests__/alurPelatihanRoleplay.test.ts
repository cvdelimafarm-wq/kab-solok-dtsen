import { describe, expect, it } from "vitest";
import { LANGKAH_LEPAS, ROLEPLAY_BELUM_ADA, bacaLangkahDariAlamat, hitungLangkahPelatihan, progresLangkah, statusLangkah, type MasukanLangkah } from "@/lib/alurPelatihan";

// (8 Nov 2026) langkah 8 "Roleplaying by Vanguard" dan langkah lepas dari urutan.
const MULAI = new Date("2026-11-05T08:00:00+07:00").getTime();
const masukan = (o: Partial<MasukanLangkah> = {}): MasukanLangkah => ({
  langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [] },
  tes: [
    { jenis: "pretest", status: "selesai" },
    { jenis: "posttest", status: "belum_buka" },
  ],
  presensi: null,
  kuis: { pernah_ikut: false, ada_ruang_selesai: false, ada_ruang_aktif: false },
  absenSesi: { total: 0, hadir: 0, terbukaBelum: 0 },
  vanguard: { wajib: false, tuntas: false, hariIniSudah: false, benar: 3 },
  roleplay: ROLEPLAY_BELUM_ADA,
  fotoTranslok: true,
  mulaiMs: MULAI,
  now: MULAI - 86_400_000,
  ...o,
});

describe("langkah Roleplaying by Vanguard", () => {
  it("urutan: Vanguard(3) Pretest(4) Presensi(5) Absen sesi(6) Adu Sigap(7) Roleplay(8) Foto(9) Posttest(10) Foto(11)", () => {
    const d = hitungLangkahPelatihan(masukan());
    expect(d.map((l) => l.kode)).toEqual(["undangan", "instrumen", "vanguard", "pretest", "hadir", "sesi", "kuis", "roleplay", "foto_awal", "posttest", "foto_akhir"]);
    expect(d.findIndex((l) => l.kode === "roleplay") + 1).toBe(8);
  });
  it("tanpa masukan roleplay (bukan tampilan lima tab): langkah tidak ada", () => {
    const d = hitungLangkahPelatihan(masukan({ roleplay: null }));
    expect(d.some((l) => l.kode === "roleplay")).toBe(false);
  });
  it("roleplay: tambahan (tidak dihitung progres); menyusul bila belum ada sesi, sekarang bila sesi berjalan, selesai bila diumumkan", () => {
    const kode = (r: NonNullable<MasukanLangkah["roleplay"]>) => {
      const d = hitungLangkahPelatihan(masukan({ roleplay: r }));
      const i = d.findIndex((l) => l.kode === "roleplay");
      return { l: d[i], st: statusLangkah(d)[i], d };
    };
    expect(kode(ROLEPLAY_BELUM_ADA).st).toBe("menyusul");
    expect(kode({ ada: true, terbuka: true, sudahIsi: false, selesai: false }).st).toBe("sekarang");
    expect(kode({ ada: true, terbuka: false, sudahIsi: true, selesai: true }).st).toBe("selesai");
    const a = kode(ROLEPLAY_BELUM_ADA);
    expect(a.l.tambahan).toBe(true);
    expect(progresLangkah(a.d).wajib).toBe(progresLangkah(hitungLangkahPelatihan(masukan({ roleplay: null }))).wajib);
  });
  it("langkah lepas: presensi, absen sesi, roleplay, dua foto tidak menjadi penunjuk 'Berikutnya' dan tidak menahan langkah sesudahnya", () => {
    expect([...LANGKAH_LEPAS].sort()).toEqual(["foto_akhir", "foto_awal", "hadir", "roleplay", "sesi"]);
    // Pretest selesai, presensi belum (tidak terlewat, tidak bisa), tes sesudah belum buka: penunjuk tidak berhenti di Presensi.
    const d = hitungLangkahPelatihan(masukan({ presensi: { sudah: false, hari: { tanggal: "2026-11-05", sesi_hari: [] }, pengaturan: {} } }));
    const st = statusLangkah(d);
    const iHadir = d.findIndex((l) => l.kode === "hadir");
    const iPost = d.findIndex((l) => l.kode === "posttest");
    expect(d[iHadir].lepas).toBe(true);
    expect(st[iHadir]).not.toBe("sekarang");
    expect(st[iPost]).toBe("sekarang"); // langkah wajib berurutan pertama yang belum selesai
  });
  it("kode roleplay sah pada ?langkah=", () => {
    expect(bacaLangkahDariAlamat("roleplay")).toBe("roleplay");
    expect(bacaLangkahDariAlamat("xyz")).toBeNull();
  });
});
