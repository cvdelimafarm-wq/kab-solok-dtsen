import { describe, expect, it } from "vitest";
import { hitungLangkahPelatihan, masukanVanguard, statusLangkah, vanguardMendesak, type MasukanLangkah } from "../alurPelatihan";
import { putuskanAnjuran, bacaCatatanAnjuran, hariWib } from "../vanguardAnjuran";
import { namaBerkasTambahan } from "../instrumenTampil";
import { ringkasPeriode, tanggalLengkap } from "../jadwalPendataanTampil";

const dasar = (vanguard?: MasukanLangkah["vanguard"], fotoTranslok = false): MasukanLangkah => ({
  langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [] },
  tes: [],
  presensi: null,
  kuis: null,
  vanguard,
  fotoTranslok,
  mulaiMs: Date.parse("2026-11-09T01:00:00Z"),
  now: Date.parse("2026-11-09T04:00:00Z"),
});
const kode = (m: MasukanLangkah) => hitungLangkahPelatihan(m).map((l) => l.kode);

describe("langkah Vanguard", () => {
  it("tanpa data Vanguard: langkah tidak ada", () => {
    expect(kode(dasar())).not.toContain("vanguard");
    expect(kode(dasar(null))).not.toContain("vanguard");
  });
  it("berada di antara Instrumen dan Pretest", () => {
    const k = kode(dasar({ wajib: true, tuntas: false, hariIniSudah: false, benar: 0 }));
    expect(k.indexOf("vanguard")).toBe(k.indexOf("instrumen") + 1);
    expect(k.indexOf("pretest")).toBe(k.indexOf("vanguard") + 1);
  });
  it("mode wajib = langkah wajib; selesai hanya bila runtutan tuntas; bisa sekarang selama hari ini belum berlatih", () => {
    const cari = (v: NonNullable<MasukanLangkah["vanguard"]>) => hitungLangkahPelatihan(dasar(v)).find((l) => l.kode === "vanguard")!;
    expect(cari({ wajib: true, tuntas: false, hariIniSudah: false, benar: 3 })).toMatchObject({ tambahan: false, selesai: false, bisaSekarang: true });
    expect(cari({ wajib: true, tuntas: false, hariIniSudah: true, benar: 3 })).toMatchObject({ selesai: false, bisaSekarang: false });
    expect(cari({ wajib: true, tuntas: true, hariIniSudah: true, benar: 9 })).toMatchObject({ selesai: true });
  });
  it("mode tidak wajib = langkah tambahan; selesai setelah ada kasus benar", () => {
    const cari = (benar: number) => hitungLangkahPelatihan(dasar({ wajib: false, tuntas: false, hariIniSudah: false, benar })).find((l) => l.kode === "vanguard")!;
    expect(cari(0)).toMatchObject({ tambahan: true, selesai: false, bisaSekarang: true });
    expect(cari(2)).toMatchObject({ tambahan: true, selesai: true });
  });
  it("Vanguard wajib yang belum tuntas menjadi 'Berikutnya' sebelum Pretest", () => {
    const d = hitungLangkahPelatihan(dasar({ wajib: true, tuntas: false, hariIniSudah: true, benar: 1 }));
    const st = statusLangkah(d);
    expect(st[d.findIndex((l) => l.kode === "vanguard")]).toBe("sekarang");
    expect(st[d.findIndex((l) => l.kode === "pretest")]).toBe("menyusul");
  });
  it("masukanVanguard hanya untuk mode tercatat dan boleh", () => {
    expect(masukanVanguard(null)).toBeNull();
    expect(masukanVanguard({ mode: "bebas", boleh: true, riwayat: [] })).toBeNull();
    expect(masukanVanguard({ mode: "tercatat", boleh: false, riwayat: [] })).toBeNull();
    expect(masukanVanguard({ mode: "tercatat", boleh: true, riwayat: [{ benar: true }, { benar: false }] })).toEqual({ wajib: false, tuntas: false, hariIniSudah: false, benar: 1 });
    expect(masukanVanguard({ mode: "tercatat", boleh: true, riwayat: [], runtutan: { mode: "wajib", tuntas: false, hari_ini_sudah: true } })).toEqual({ wajib: true, tuntas: false, hariIniSudah: true, benar: 0 });
  });
  it("vanguardMendesak", () => {
    expect(vanguardMendesak(null)).toBe(false);
    expect(vanguardMendesak({ wajib: true, tuntas: false, hariIniSudah: false, benar: 5 })).toBe(true);
    expect(vanguardMendesak({ wajib: true, tuntas: false, hariIniSudah: true, benar: 5 })).toBe(false);
    expect(vanguardMendesak({ wajib: true, tuntas: true, hariIniSudah: false, benar: 5 })).toBe(false);
    expect(vanguardMendesak({ wajib: false, tuntas: false, hariIniSudah: false, benar: 0 })).toBe(true);
    expect(vanguardMendesak({ wajib: false, tuntas: false, hariIniSudah: false, benar: 1 })).toBe(false);
  });
});

describe("langkah foto: Foto Translok", () => {
  it("kedua langkah foto memakai nama pendek 'Foto Translok'", () => {
    const d = hitungLangkahPelatihan(dasar(null, true));
    expect(d.filter((l) => l.kode === "foto_awal" || l.kode === "foto_akhir").map((l) => l.singkat)).toEqual(["Foto Translok", "Foto Translok"]);
    expect(d.find((l) => l.kode === "foto_awal")!.judul).toContain("Translok");
  });
});

describe("pop-up anjuran Vanguard", () => {
  const sekarang = Date.parse("2026-11-09T01:00:00Z");
  it("tampil sekali sehari selama belum ada kasus benar; tidak untuk mode wajib", () => {
    expect(putuskanAnjuran({ wajib: false, benar: 0 }, null, sekarang)).toBe(true);
    expect(putuskanAnjuran({ wajib: false, benar: 0 }, { hari: hariWib(sekarang) }, sekarang)).toBe(false);
    expect(putuskanAnjuran({ wajib: false, benar: 0 }, { hari: "2026-11-08" }, sekarang)).toBe(true);
    expect(putuskanAnjuran({ wajib: false, benar: 2 }, null, sekarang)).toBe(false);
    expect(putuskanAnjuran({ wajib: true, benar: 0 }, null, sekarang)).toBe(false);
  });
  it("catatan sembarang tidak dipercaya", () => {
    expect(bacaCatatanAnjuran({ hari: 5 })).toBeNull();
    expect(bacaCatatanAnjuran("x")).toBeNull();
    expect(bacaCatatanAnjuran({ hari: "2026-11-09" })).toEqual({ hari: "2026-11-09" });
  });
});

describe("nama berkas Instrumen tidak ditulis dua kali", () => {
  it("sama dengan judul (selain ekstensi / huruf / tanda baca): disembunyikan", () => {
    expect(namaBerkasTambahan("2. Kuesioner Seruti Makanan 2026 (VSERUTI26.MAK) - 2026.04.30", "2. Kuesioner Seruti Makanan 2026 (VSERUTI26.MAK) - 2026.04.30.pdf")).toBeNull();
    expect(namaBerkasTambahan("Buku Pedoman", "buku_pedoman.PDF")).toBeNull();
  });
  it("berbeda: ditampilkan; kosong: disembunyikan", () => {
    expect(namaBerkasTambahan("Buku Pedoman", "pedoman-final-v3.pdf")).toBe("pedoman-final-v3.pdf");
    expect(namaBerkasTambahan("Buku Pedoman", "")).toBeNull();
    expect(namaBerkasTambahan("Buku Pedoman", null)).toBeNull();
  });
});

describe("kartu jadwal pendataan", () => {
  it("tanggal lengkap dengan nama hari", () => {
    expect(tanggalLengkap("2026-11-10")).toBe("Selasa, 10 November 2026");
    expect(tanggalLengkap("2026-11-30")).toBe("Senin, 30 November 2026");
    expect(tanggalLengkap("bukan-tanggal")).toBe("bukan-tanggal");
    expect(tanggalLengkap("2026-02-31")).toBe("2026-02-31");
  });
  it("belum mulai: hitung mundur dan lama", () => {
    const r = ringkasPeriode({ mulai: "2026-11-10", selesai: "2026-11-30" }, "2026-11-03")!;
    expect(r).toMatchObject({ status: "belum", hari: 21, ket: "Dimulai 7 hari lagi", persen: 0 });
    expect(ringkasPeriode({ mulai: "2026-11-10", selesai: "2026-11-30" }, "2026-11-09")!.ket).toBe("Dimulai besok");
  });
  it("berjalan dan selesai", () => {
    const b = ringkasPeriode({ mulai: "2026-11-10", selesai: "2026-11-30" }, "2026-11-12")!;
    expect(b).toMatchObject({ status: "berjalan", ket: "Berjalan: hari ke-3 dari 21" });
    expect(ringkasPeriode({ mulai: "2026-11-10", selesai: "2026-11-30" }, "2026-11-30")!.ket).toContain("hari terakhir");
    expect(ringkasPeriode({ mulai: "2026-11-10", selesai: "2026-11-30" }, "2026-12-01")).toMatchObject({ status: "selesai", persen: 100 });
  });
  it("tanggal rusak / terbalik: null", () => {
    expect(ringkasPeriode({ mulai: "", selesai: "2026-11-30" }, "2026-11-03")).toBeNull();
    expect(ringkasPeriode({ mulai: "2026-11-30", selesai: "2026-11-10" }, "2026-11-03")).toBeNull();
  });
});
