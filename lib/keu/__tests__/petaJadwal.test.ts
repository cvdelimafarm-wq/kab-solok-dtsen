import { describe, expect, it } from "vitest";
import { normalisasi, type Form } from "../identifikasi";
import { petaJadwal, posisiBar, tandaBulan, tandaMinggu } from "../petaJadwal";
import { ubahRec } from "../waktu";

const TW1 = "Triwulan I";
function contoh(ubah: (f: Form) => void = () => {}): Form {
  const f = normalisasi({
    nama: "Contoh", periode: "Triwulanan", keList: [TW1], adaUpdating: false, adaDiseminasi: true,
    jend: { mb: 2, mj: "tgl", mn: 1, sb: 2, sj: "akhir", sn: 0, perk: false },
    rel: {
      updating: { aM: "mulai", dM: -10, aS: "mulai", dS: -1, perk: false },
      pengolahan: { aM: "mulai", dM: 14, aS: "selesai", dS: 15, perk: false },
      pasca: { aM: "selesai", dM: 1, aS: "selesai", dS: 15, perk: true },
      diseminasi: { aM: "selesai", dM: 1, aS: "selesai", dS: 15, perk: true },
    },
    sesi: { briefing: { on: false }, pelatihan: { on: true, bentuk: "Luring", tempat: "Kantor", tgl: { [TW1]: { mulai: "2026-02-23", selesai: "2026-02-25" } } } },
    rapat: { persiapan: { on: true, media: ["Zoom"] }, pelaksanaan: { on: false }, evaluasi: { on: true, media: ["Tatap muka"] } },
    instrumen: "FASIH",
  });
  ubah(f);
  return f;
}

describe("petaJadwal", () => {
  it("urutan baris mengikuti alur kegiatan dan hanya memuat yang aktif", () => {
    const h = petaJadwal(contoh(), TW1, 2026);
    expect(h.baris.map((b) => b.kunci)).toEqual(["pelatihan", "rapat-persiapan", "pendataan", "pengolahan", "pasca", "rapat-evaluasi", "diseminasi"]);
  });
  it("tanggal dan penanda Fix/Perkiraan benar", () => {
    const h = petaJadwal(contoh(), TW1, 2026);
    const b = (k: string) => h.baris.find((x) => x.kunci === k)!;
    expect(b("pelatihan")).toMatchObject({ mulai: "2026-02-23", selesai: "2026-02-25", perk: false, ada: true });
    expect(b("pendataan")).toMatchObject({ mulai: "2026-03-01", selesai: "2026-03-31", perk: false });
    expect(b("pasca").perk).toBe(true);
    expect(b("rapat-evaluasi")).toMatchObject({ ada: false, perk: true }); // belum dijadwalkan
  });
  it("rapat dengan jadwal perkiraan tampil dan tercatat sebagai perkiraan", () => {
    const f = contoh((g) => { g.rapat.evaluasi.tgl = { [TW1]: ubahRec(undefined, { bulan: 3, minggu: 2 }, 2026) }; });
    const h = petaJadwal(f, TW1, 2026);
    expect(h.baris.find((x) => x.kunci === "rapat-evaluasi")).toMatchObject({ mulai: "2026-04-13", selesai: "2026-04-17", perk: true, ada: true });
    expect(h.akhir >= "2026-04-17").toBe(true);
  });
  it("sumbu mencakup semua baris berjadwal dengan margin", () => {
    const h = petaJadwal(contoh(), TW1, 2026);
    expect(h.awal).toBe("2026-02-21");
    expect(h.akhir >= "2026-04-15").toBe(true);
  });
  it("benturan: pelatihan beririsan, rapat evaluasi sebelum pendataan selesai, selesai < mulai", () => {
    const f = contoh((g) => {
      g.sesi.pelatihan.tgl[TW1] = { mulai: "2026-02-27", selesai: "2026-03-02", perk: false };
      g.rapat.evaluasi.tgl = { [TW1]: { mulai: "2026-03-10", selesai: "2026-03-12", perk: false } };
      g.rapat.persiapan.tgl = { [TW1]: { mulai: "2026-03-20", selesai: "2026-03-18", perk: false } };
    });
    const k = petaJadwal(f, TW1, 2026).konflik;
    expect(k).toContain("Pelatihan beririsan dengan pendataan.");
    expect(k).toContain("Rapat evaluasi dijadwalkan sebelum pendataan selesai.");
    expect(k).toContain("Rapat persiapan: tanggal selesai sebelum tanggal mulai.");
    expect(k).toContain("Rapat persiapan dijadwalkan setelah pendataan dimulai.");
  });
  it("contoh yang rapi tanpa benturan", () => {
    expect(petaJadwal(contoh(), TW1, 2026).konflik).toEqual([]);
  });
  it("tanpa jadwal sama sekali: sumbu kosong", () => {
    const f = contoh((g) => { g.sesi.pelatihan.on = false; g.rapat.persiapan.on = false; g.instrumen = "Tanpa pendataan"; g.adaDiseminasi = false; g.periode = "Tanpa periode"; });
    const h = petaJadwal(f, "Kegiatan", 2026);
    expect(h.awal).toBe("");
  });
});

describe("posisiBar, tandaBulan, tandaMinggu", () => {
  it("posisi dalam persen", () => {
    expect(posisiBar("2026-03-01", "2026-03-10", "2026-03-01", "2026-03-05")).toEqual({ kiri: 0, lebar: 50 });
    const p = posisiBar("2026-03-01", "2026-03-10", "2026-03-06", "2026-03-10");
    expect(p).toEqual({ kiri: 50, lebar: 50 });
  });
  it("satu hari tetap terlihat dan tidak keluar sumbu", () => {
    const p = posisiBar("2026-03-01", "2026-06-30", "2026-06-30", "2026-06-30");
    expect(p.lebar).toBeGreaterThanOrEqual(1.6);
    expect(p.kiri + p.lebar).toBeLessThanOrEqual(100.0001);
  });
  it("tanda bulan: awal bulan di dalam sumbu", () => {
    const t = tandaBulan("2026-02-21", "2026-04-20");
    expect(t.map((x) => x.tgl)).toEqual(["2026-03-01", "2026-04-01"]);
    expect(t[0].nama).toBe("Mar 2026");
    expect(t[1].nama).toBe("Apr");
    expect(tandaBulan("", "")).toEqual([]);
  });
  it("tanda minggu: Senin; kosong bila rentang panjang", () => {
    expect(tandaMinggu("2026-03-01", "2026-03-14").length).toBe(2); // Senin 2 dan 9 Maret
    expect(tandaMinggu("2026-01-01", "2026-12-31")).toEqual([]);
  });
});
