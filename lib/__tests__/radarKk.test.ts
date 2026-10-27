import { describe, expect, it } from "vitest";
import { RADIUS_AWAL, RADIUS_MAKS, RADIUS_MIN, arahMataAngin, normalisasiRadius, susunBlip, hitungRadar, jarakM, mutuGps, perluPerbarui, pesanGalatRadar, teksJarak, teksRingkasRadar, type KkRadar } from "../radarKk";

const P = { lat: -0.8, lng: 100.6 };
// 1 derajat lintang ≈ 111.195 m -> 0,0001° ≈ 11,1 m
const geser = (utaraM: number, timurM: number) => ({ lat: P.lat + utaraM / 111195, lng: P.lng + timurM / (111195 * Math.cos((P.lat * Math.PI) / 180)) });
const K = (id: number, utaraM: number, timurM: number, hasil: string | null, ppl: number | null = null): KkRadar => ({ id, nama_kk: `KK${id}`, ...geser(utaraM, timurM), hasil, ppl_akun_id: ppl });

describe("jarak dan arah", () => {
  it("jarak sesuai geseran", () => {
    expect(Math.round(jarakM(P, geser(100, 0)))).toBe(100);
    expect(Math.round(jarakM(P, geser(30, 40)))).toBe(50);
  });
  it("8 arah mata angin", () => {
    expect(arahMataAngin(P, geser(50, 0))).toBe("utara");
    expect(arahMataAngin(P, geser(50, 50))).toBe("timur laut");
    expect(arahMataAngin(P, geser(0, 50))).toBe("timur");
    expect(arahMataAngin(P, geser(-50, 50))).toBe("tenggara");
    expect(arahMataAngin(P, geser(-50, 0))).toBe("selatan");
    expect(arahMataAngin(P, geser(-50, -50))).toBe("barat daya");
    expect(arahMataAngin(P, geser(0, -50))).toBe("barat");
    expect(arahMataAngin(P, geser(50, -50))).toBe("barat laut");
  });
});

describe("hitungRadar", () => {
  const kk: KkRadar[] = [
    K(1, 20, 0, "terdampak", 7),
    K(2, 0, 40, "tidak_terdampak", 8),
    K(3, -60, 0, "tidak_ditemukan", 7),
    K(4, 30, 30, null), // 42 m, belum
    K(5, 80, 0, null), // 80 m, belum
    K(6, 150, 0, null), // 150 m, belum (di luar 100)
    { id: 7, nama_kk: "tanpa", lat: null, lng: null, hasil: null, ppl_akun_id: null },
  ];
  it("menghitung dalam radius 100 m", () => {
    const r = hitungRadar(kk, P, RADIUS_AWAL, 7);
    expect(r.total).toBe(5);
    expect(r.sudah).toBe(3);
    expect(r.belum).toBe(2);
    expect(r.oleh_saya).toBe(2);
    expect([r.terdampak, r.tidak_terdampak, r.tidak_ditemukan]).toEqual([1, 1, 1]);
    expect(r.persen).toBe(60);
    expect(r.tanpa_koordinat).toBe(1);
    expect(r.terdekat_belum.map((x) => x.id)).toEqual([4, 5]);
    expect(r.terdekat_belum[0].arah).toBe("timur laut");
    expect(r.terdekat_belum_jauh).toBeNull();
  });
  it("radius 50 m dan radius kecil tanpa KK belum", () => {
    const r = hitungRadar(kk, P, 50, null);
    expect(r.total).toBe(3);
    expect(r.oleh_saya).toBe(0);
    expect(r.belum).toBe(1);
    const sepi = hitungRadar([K(1, 10, 0, "terdampak"), K(9, 300, 0, null), K(8, 200, 0, null)], P, 50, null);
    expect(sepi.belum).toBe(0);
    expect(sepi.terdekat_belum).toEqual([]);
    expect(sepi.terdekat_belum_jauh?.id).toBe(8);
  });
  it("tanpa KK sama sekali", () => {
    const r = hitungRadar([], P, 100, 1);
    expect(r.total).toBe(0);
    expect(r.persen).toBe(0);
    expect(teksRingkasRadar(r)).toBe("Tidak ada KK dalam 100 m");
  });
  it("paling banyak 5 KK belum terdekat, urut jarak", () => {
    const banyak = Array.from({ length: 8 }, (_, i) => K(i + 1, (8 - i) * 5, 0, null));
    const r = hitungRadar(banyak, P, 100, null);
    expect(r.belum).toBe(8);
    expect(r.terdekat_belum).toHaveLength(5);
    expect(r.terdekat_belum[0].id).toBe(8);
    expect(teksRingkasRadar(r)).toBe("8 KK dalam 100 m · 0 sudah · 8 belum");
  });
});

describe("pendukung", () => {
  it("perluPerbarui: bergerak atau lewat 10 detik", () => {
    const a = { posisi: P, waktu: 0 };
    expect(perluPerbarui(null, a)).toBe(true);
    expect(perluPerbarui(a, { posisi: geser(2, 0), waktu: 3000 })).toBe(false);
    expect(perluPerbarui(a, { posisi: geser(10, 0), waktu: 3000 })).toBe(true);
    expect(perluPerbarui(a, { posisi: geser(2, 0), waktu: 10000 })).toBe(true);
  });
  it("mutu GPS dan teks", () => {
    expect(mutuGps(8)).toBe("baik");
    expect(mutuGps(35)).toBe("cukup");
    expect(mutuGps(120)).toBe("lemah");
    expect(mutuGps(null)).toBe("lemah");
    expect(teksJarak(42)).toBe("40 m");
    expect(teksJarak(3)).toBe("5 m");
    expect(teksJarak(143)).toBe("140 m");
    expect(teksJarak(1250)).toBe("1,3 km");
    expect(pesanGalatRadar(1)).toMatch(/Izin/);
    expect(pesanGalatRadar(undefined)).toMatch(/tidak bisa/);
  });
});

describe("normalisasiRadius", () => {
  it("bebas dalam batas 10 sampai 1000 m", () => {
    expect(normalisasiRadius(75)).toBe(75);
    expect(normalisasiRadius("150")).toBe(150);
    expect(normalisasiRadius("87,6")).toBe(88);
    expect(normalisasiRadius(3)).toBe(RADIUS_MIN);
    expect(normalisasiRadius(99999)).toBe(RADIUS_MAKS);
    expect(normalisasiRadius("abc")).toBe(RADIUS_AWAL);
    expect(normalisasiRadius("", 200)).toBe(200);
    expect(normalisasiRadius(null)).toBe(RADIUS_AWAL);
  });
});

describe("susunBlip", () => {
  it("koordinat radar: timur kanan, utara atas, sudut dari utara searah jarum jam", () => {
    const b = susunBlip([K(1, 50, 0, null), K(2, 0, 50, "terdampak"), K(3, -50, 0, null), K(4, 0, -50, null), K(5, 500, 0, null)], P, 100);
    expect(b.map((x) => x.id).sort()).toEqual([1, 2, 3, 4]); // 5 di luar radius
    const per = Object.fromEntries(b.map((x) => [x.id, x]));
    expect(per[1].y).toBeCloseTo(0.5, 2);
    expect(per[1].sudut).toBeCloseTo(0, 0);
    expect(per[2].x).toBeCloseTo(0.5, 2);
    expect(Math.round(per[2].sudut)).toBe(90);
    expect(Math.round(per[3].sudut)).toBe(180);
    expect(Math.round(per[4].sudut)).toBe(270);
    expect(per[2].sudah).toBe(true);
    expect(per[1].sudah).toBe(false);
  });
  it("tanpa koordinat dilewati dan dibatasi 300 titik terdekat", () => {
    const banyak = Array.from({ length: 350 }, (_, i) => K(i + 1, (i % 90) + 1, 0, null));
    expect(susunBlip(banyak, P, 100)).toHaveLength(300);
    expect(susunBlip([{ id: 1, nama_kk: "x", lat: null, lng: null, hasil: null, ppl_akun_id: null }], P, 100)).toEqual([]);
  });
});
