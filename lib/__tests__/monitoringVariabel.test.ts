// Menguji lib/monitoringVariabel.ts: dropdown "Pantau menurut" di Monitoring pelatihan.
import { describe, expect, it } from "vitest";
import { daftarStatus, hitungPerStatus, kodeStatus, keteranganPantau, saringBaris, statusUntuk, statusVanguard, variabelTersedia, type BarisPantau, type VgBaris } from "../monitoringVariabel";

const vg = (o: Partial<VgBaris> = {}): VgBaris => ({ mode: "wajib", berturut: 0, hari_berturut: 3, latihan_tuntas: false, hari_ini_sudah: false, terputus: false, sertifikasi_selesai: false, ...o });
const baris = (o: Partial<BarisPantau> = {}): BarisPantau => ({ undangan: "belum", pretest: { status: "belum" }, posttest: { status: "belum" }, hadir: false, materi: null, kunci: [], izin: { pretest: null, posttest: null }, ...o });

describe("variabel yang ditawarkan", () => {
  it("hanya yang punya data: materi, Vanguard, kelulusan disembunyikan bila kosong", () => {
    const k = variabelTersedia([baris(), baris()]).map((v) => v.kode);
    expect(k).toEqual(["semua", "undangan", "hadir", "pretest", "posttest", "kunci"]);
  });
  it("materi, Vanguard (aturan atau bank soal saja), dan kelulusan muncul bila ada datanya", () => {
    const k = variabelTersedia([baris({ materi: { belum: 1, manual: false } }), baris({ bank: { percobaan: 4, benar: 2 } }), baris({ kelulusan: "lulus" })]).map((v) => v.kode);
    expect(k).toEqual(["semua", "undangan", "hadir", "materi", "vanguard", "pretest", "posttest", "kunci", "kelulusan"]);
  });
});

describe("status Vanguard", () => {
  it("lengkap = latihan tuntas dan sertifikasi beres (atau tidak disyaratkan)", () => {
    expect(statusVanguard(vg({ latihan_tuntas: true, sertifikasi_selesai: true }))).toBe("selesai");
    expect(statusVanguard(vg({ mode: "opsional", latihan_tuntas: true, sertifikasi_selesai: null }))).toBe("selesai");
  });
  it("latihan tuntas tetapi sertifikasi belum = tinggal sertifikasi", () => {
    expect(statusVanguard(vg({ latihan_tuntas: true, sertifikasi_selesai: false }))).toBe("tinggal_sertifikasi");
  });
  it("berjalan / terputus / belum mulai; tanpa aturan = belum mulai", () => {
    expect(statusVanguard(vg({ berturut: 2 }))).toBe("berjalan");
    expect(statusVanguard(vg({ hari_ini_sudah: true }))).toBe("berjalan");
    expect(statusVanguard(vg({ terputus: true }))).toBe("terputus");
    expect(statusVanguard(vg())).toBe("belum_mulai");
    expect(statusVanguard(null)).toBe("belum_mulai");
  });
});

describe("hitung dan saring per status", () => {
  const data = [baris({ undangan: "terima" }), baris({ undangan: "terima" }), baris({ undangan: "tolak" }), baris()];
  it("undangan: terima / tolak / belum", () => {
    const h = hitungPerStatus("undangan", data).map((x) => [x.status.kode, x.jumlah]);
    expect(h).toEqual([["terima", 2], ["tolak", 1], ["belum", 1]]);
    expect(saringBaris("undangan", "tolak", data)).toHaveLength(1);
    expect(saringBaris("undangan", null, data)).toHaveLength(4);
    expect(saringBaris("semua", "tolak", data)).toHaveLength(4);
  });
  it("jumlah semua status = jumlah baris (tidak ada yang hilang) untuk setiap variabel", () => {
    const lengkap = [baris({ materi: { belum: 2, manual: false }, vanguard: vg({ berturut: 1 }), kelulusan: "lulus", kunci: [{ tahap: "pretest" }] }), baris({ izin: { pretest: "menunggu", posttest: null } }), baris()];
    for (const v of ["undangan", "hadir", "materi", "vanguard", "pretest", "posttest", "kunci", "kelulusan"] as const) {
      expect(hitungPerStatus(v, lengkap).reduce((a, x) => a + x.jumlah, 0), v).toBe(lengkap.length);
      expect(daftarStatus(v).length).toBeGreaterThan(1);
    }
  });
  it("kunci: permintaan buka kunci menang atas terkunci biasa", () => {
    expect(kodeStatus("kunci", baris({ kunci: [{ tahap: "pretest" }], izin: { pretest: "menunggu", posttest: null } }))).toBe("izin_menunggu");
    expect(kodeStatus("kunci", baris({ kunci: [{ tahap: "pretest" }] }))).toBe("terkunci");
    expect(kodeStatus("kunci", baris())).toBe("lancar");
  });
});

describe("keterangan", () => {
  it("Vanguard: latihan wajib, sertifikasi, dan bank soal dalam satu baris", () => {
    const b = baris({ vanguard: vg({ berturut: 2 }), bank: { percobaan: 12, benar: 9 } });
    expect(keteranganPantau("vanguard", b)).toBe("Latihan wajib 2 dari 3 hari · Sertifikasi wajib belum · Bank soal 12 percobaan, 9 benar");
    expect(keteranganPantau("vanguard", baris())).toBe("Belum ada aktivitas Vanguard");
  });
  it("status undangan punya warna: ditolak = bad, diterima = ok", () => {
    expect(statusUntuk("undangan", baris({ undangan: "tolak" })).nada).toBe("bad");
    expect(statusUntuk("undangan", baris({ undangan: "terima" })).nada).toBe("ok");
  });
});
