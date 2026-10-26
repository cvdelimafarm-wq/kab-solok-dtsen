import { describe, expect, it } from "vitest";
import {
  ZOOM_MAKS,
  ZOOM_MIN,
  arahGeserFoto,
  batasiGeser,
  batasiZoom,
  hariTetangga,
  jamDariIso,
  jarakDuaTitik,
  kelengkapanHari,
  kelompokLokasi,
  ringkasLokasi,
  susunSlotFoto,
  titikTengah,
  zoomKeTitik,
} from "../sigapRincianHari";

describe("kelompokLokasi / ringkasLokasi", () => {
  it("mengelompokkan per kecamatan+nagari sesuai urutan, membuang jorong dobel (tanpa beda huruf besar)", () => {
    const g = kelompokLokasi([
      { kecamatan: "Lembang", nagari: "Koto Baru", jorong: "Jorong A" },
      { kecamatan: "Kubung", nagari: "Salayo", jorong: "Jorong C" },
      { kecamatan: "lembang", nagari: "koto baru", jorong: "jorong a" },
      { kecamatan: "Lembang", nagari: "Koto Baru", jorong: "Jorong B" },
    ]);
    expect(g).toEqual([
      { kecamatan: "Lembang", nagari: "Koto Baru", jorong: ["Jorong A", "Jorong B"] },
      { kecamatan: "Kubung", nagari: "Salayo", jorong: ["Jorong C"] },
    ]);
  });
  it("mengabaikan baris kosong dan merapikan spasi", () => {
    expect(kelompokLokasi([{ kecamatan: "", nagari: " ", jorong: null }, { kecamatan: "  Gunung  Talang ", nagari: "Aia  Batumbuak", jorong: " Rt 02 " }])).toEqual([
      { kecamatan: "Gunung Talang", nagari: "Aia Batumbuak", jorong: ["Rt 02"] },
    ]);
    expect(kelompokLokasi(null)).toEqual([]);
    expect(kelompokLokasi(undefined)).toEqual([]);
  });
  it("ringkasLokasi menyusun satu baris", () => {
    expect(
      ringkasLokasi([
        { kecamatan: "Lembang", nagari: "Koto Baru", jorong: "Jorong A" },
        { kecamatan: "Lembang", nagari: "Koto Baru", jorong: "Jorong B" },
        { kecamatan: "Kubung", nagari: "Salayo", jorong: "Jorong C" },
      ])
    ).toBe("Koto Baru (Kec. Lembang): Jorong A, Jorong B · Salayo (Kec. Kubung): Jorong C");
  });
  it("ringkasLokasi tahan data tidak lengkap", () => {
    expect(ringkasLokasi([{ kecamatan: "Lembang", nagari: "", jorong: "" }])).toBe("Kec. Lembang");
    expect(ringkasLokasi([{ kecamatan: "", nagari: "Koto Baru", jorong: "" }])).toBe("Koto Baru");
    expect(ringkasLokasi([{ kecamatan: "", nagari: "", jorong: "Jorong A" }])).toBe("Jorong A");
    expect(ringkasLokasi([])).toBe("");
  });
});

describe("susunSlotFoto", () => {
  it("menampilkan semua nomor 1..jumlah; nomor tanpa foto = null; keterangan pendataan", () => {
    const s = susunSlotFoto([{ slot: 3, id: 30 }, { slot: 1, id: 10 }], 5);
    expect(s.map((x) => x.slot)).toEqual([1, 2, 3, 4, 5]);
    expect(s.map((x) => x.foto?.id ?? null)).toEqual([10, null, 30, null, null]);
    expect(s[0].label).toBe("Saat akan berangkat");
    expect(s[2].label).toBe("Saat mendata");
  });
  it("keterangan pelatihan untuk jenis pelatihan", () => {
    expect(susunSlotFoto([], 5, "pelatihan")[2].label).toBe("Saat pelatihan");
  });
  it("jumlah wajib lebih kecil dari nomor terbesar yang ada: ikut yang terbesar", () => {
    expect(susunSlotFoto([{ slot: 4 }], 2).length).toBe(4);
  });
  it("nomor di luar keterangan memakai 'Foto n'; dobel nomor dipakai yang pertama; data buruk diabaikan", () => {
    const s = susunSlotFoto([{ slot: 7, a: 1 }, { slot: 7, a: 2 }, { slot: 0 }, { slot: 1.5 }], 0);
    expect(s.length).toBe(7);
    expect(s[6].label).toBe("Foto 7");
    expect((s[6].foto as { a?: number } | null)?.a).toBe(1);
  });
  it("tanpa foto dan jumlah 0 = kosong", () => {
    expect(susunSlotFoto(null, 0)).toEqual([]);
    expect(susunSlotFoto(undefined, NaN)).toEqual([]);
  });
});

describe("hariTetangga", () => {
  const d = ["2026-10-22", "2026-10-20", "2026-10-21", "2026-10-21"];
  it("tengah, awal, akhir", () => {
    expect(hariTetangga(d, "2026-10-21")).toEqual({ sebelum: "2026-10-20", sesudah: "2026-10-22", nomor: 2, total: 3 });
    expect(hariTetangga(d, "2026-10-20")).toEqual({ sebelum: null, sesudah: "2026-10-21", nomor: 1, total: 3 });
    expect(hariTetangga(d, "2026-10-22")).toEqual({ sebelum: "2026-10-21", sesudah: null, nomor: 3, total: 3 });
  });
  it("tanggal tidak ada / daftar kosong", () => {
    expect(hariTetangga(d, "2026-11-01")).toEqual({ sebelum: null, sesudah: null, nomor: 0, total: 3 });
    expect(hariTetangga(null, "2026-10-21")).toEqual({ sebelum: null, sesudah: null, nomor: 0, total: 0 });
  });
});

describe("kelengkapanHari", () => {
  it("laporan wajib dan ada, foto cukup", () => {
    expect(kelengkapanHari({ adaLaporan: true, wajibLaporan: true, nFoto: 5, wajibFoto: 5 })).toEqual({ laporan: "ok", foto: "ok", nFoto: 5, wajibFoto: 5, kurangFoto: 0 });
  });
  it("laporan wajib tapi belum ada; foto kurang", () => {
    expect(kelengkapanHari({ adaLaporan: false, wajibLaporan: true, nFoto: 3, wajibFoto: 5 })).toEqual({ laporan: "kurang", foto: "kurang", nFoto: 3, wajibFoto: 5, kurangFoto: 2 });
  });
  it("laporan tidak wajib (mis. pelatihan)", () => {
    expect(kelengkapanHari({ adaLaporan: false, wajibLaporan: false, nFoto: 5, wajibFoto: 5 }).laporan).toBe("tidak_wajib");
  });
  it("foto lebih dari wajib tetap ok; angka buruk dianggap 0", () => {
    expect(kelengkapanHari({ adaLaporan: true, wajibLaporan: true, nFoto: 7, wajibFoto: 5 }).kurangFoto).toBe(0);
    expect(kelengkapanHari({ adaLaporan: true, wajibLaporan: true, nFoto: NaN, wajibFoto: NaN })).toMatchObject({ nFoto: 0, wajibFoto: 0, foto: "ok" });
  });
});

describe("jamDariIso", () => {
  it("mengubah ke jam WIB", () => {
    expect(jamDariIso("2026-10-20T03:57:00Z")).toBe("10.57");
    expect(jamDariIso("2026-10-20T17:30:00Z")).toBe("00.30");
  });
  it("kosong / tidak valid = strip", () => {
    expect(jamDariIso(null)).toBe("–");
    expect(jamDariIso("bukan tanggal")).toBe("–");
  });
});

describe("zoom penampil foto", () => {
  it("batasiZoom menjepit ke 1..5 dan NaN = 1", () => {
    expect(batasiZoom(0.3)).toBe(ZOOM_MIN);
    expect(batasiZoom(9)).toBe(ZOOM_MAKS);
    expect(batasiZoom(2.2)).toBe(2.2);
    expect(batasiZoom(NaN)).toBe(ZOOM_MIN);
  });
  it("jarak dan titik tengah dua jari", () => {
    expect(jarakDuaTitik({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(titikTengah({ x: 0, y: 10 }, { x: 10, y: 30 })).toEqual({ x: 5, y: 20 });
  });
  it("batasiGeser: skala 1 selalu 0; diperbesar boleh geser sejauh kelebihan ukuran/2", () => {
    const foto = { w: 300, h: 200 };
    const layar = { w: 400, h: 600 };
    expect(batasiGeser({ x: 50, y: 50 }, 1, foto, layar)).toEqual({ x: 0, y: 0 });
    // skala 3: foto 900x600; layar 400x600 -> x maks (900-400)/2 = 250; y: 600-600 = 0
    expect(batasiGeser({ x: 999, y: 999 }, 3, foto, layar)).toEqual({ x: 250, y: 0 });
    expect(batasiGeser({ x: -999, y: 10 }, 3, foto, layar)).toEqual({ x: -250, y: 0 });
    expect(batasiGeser({ x: 100, y: 0 }, 3, foto, layar)).toEqual({ x: 100, y: 0 });
  });
  it("batasiGeser menjepit skala di atas maksimum", () => {
    const r = batasiGeser({ x: 9999, y: 0 }, 99, { w: 100, h: 100 }, { w: 100, h: 100 });
    expect(r.x).toBe((100 * ZOOM_MAKS - 100) / 2);
  });
  it("zoomKeTitik: titik di tengah tidak menggeser; titik di tepi menjaga isi tetap di bawah jari", () => {
    expect(zoomKeTitik(1, 2, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    const g = zoomKeTitik(1, 2, { x: 100, y: -50 }, { x: 0, y: 0 });
    expect(g).toEqual({ x: -100, y: 50 });
    // isi di bawah jari sebelum: (100-0)/1 = 100; sesudah: (100-(-100))/2 = 100 -> sama
    expect((100 - g.x) / 2).toBe(100);
  });
  it("zoomKeTitik dengan skala lama tidak valid mengembalikan geseran semula", () => {
    expect(zoomKeTitik(0, 2, { x: 10, y: 10 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });
  it("arahGeserFoto: hanya saat belum diperbesar, jauh, dan dominan horizontal", () => {
    expect(arahGeserFoto(-80, 5, 1)).toBe(1);
    expect(arahGeserFoto(80, 5, 1)).toBe(-1);
    expect(arahGeserFoto(-30, 0, 1)).toBe(0);
    expect(arahGeserFoto(-80, 70, 1)).toBe(0);
    expect(arahGeserFoto(-80, 5, 2)).toBe(0);
  });
});
