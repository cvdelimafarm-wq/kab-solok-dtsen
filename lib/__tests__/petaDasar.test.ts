import { describe, expect, it } from "vitest";
import { buatProyeksi, jarakMeter } from "@/lib/pendataan";
import { MPP_ZOOM0, bacaManifestDasar, berkasUntukTim, kameraDariPandang, labelUkuran, namaBerkasTim, salinanBerlaku, urlPublikBerkas } from "@/lib/petaDasar";

const titik = [
  { lat: -0.9559, lng: 100.6005 },
  { lat: -0.858, lng: 100.6524 },
  { lat: -0.91, lng: 100.62 },
];
const proj = buatProyeksi(titik, 360, 440, 28)!;

describe("kameraDariPandang", () => {
  it("pusat pandang awal = tengah kotak titik", () => {
    const k = kameraDariPandang(proj, { cx: 180, cy: 220, z: 1 }, 360, 440)!;
    expect(k.lat).toBeGreaterThan(-0.9559);
    expect(k.lat).toBeLessThan(-0.858);
    expect(k.lng).toBeGreaterThan(100.6005);
    expect(k.lng).toBeLessThan(100.6524);
  });
  it("kebalikan proyeksi tepat: titik di tengah pandang menghasilkan lat/lng aslinya", () => {
    const p = { cx: proj.x(100.62), cy: proj.y(-0.91), z: 2.5 };
    const k = kameraDariPandang(proj, p, 390, 520)!;
    expect(k.lng).toBeCloseTo(100.62, 6);
    expect(k.lat).toBeCloseTo(-0.91, 6);
  });
  it("skala: jarak dua titik di layar (piksel) = jarak nyata / meter per piksel peta", () => {
    const w = 390, h = 520, z = 1.7;
    const p = { cx: proj.x(100.62), cy: proj.y(-0.91), z };
    const k = kameraDariPandang(proj, p, w, h)!;
    const a = { lat: -0.9, lng: 100.61 };
    const b = { lat: -0.92, lng: 100.63 };
    const skalaPx = Math.min(w / (360 / z), h / (440 / z));
    const pxJarak = Math.hypot((proj.x(b.lng) - proj.x(a.lng)) * skalaPx, (proj.y(b.lat) - proj.y(a.lat)) * skalaPx);
    const mpp = (MPP_ZOOM0 * Math.cos((k.lat * Math.PI) / 180)) / 2 ** k.zoom;
    const meter = jarakMeter(a, b);
    expect(Math.abs(pxJarak * mpp - meter) / meter).toBeLessThan(0.01);
  });
  it("memperbesar pandang 2x menaikkan zoom peta tepat 1", () => {
    const a = kameraDariPandang(proj, { cx: 180, cy: 220, z: 1 }, 360, 440)!;
    const b = kameraDariPandang(proj, { cx: 180, cy: 220, z: 2 }, 360, 440)!;
    expect(b.zoom - a.zoom).toBeCloseTo(1, 6);
  });
  it("ukuran nol atau z tidak sah = null", () => {
    expect(kameraDariPandang(proj, { cx: 1, cy: 1, z: 1 }, 0, 440)).toBeNull();
    expect(kameraDariPandang(proj, { cx: 1, cy: 1, z: 0 }, 360, 440)).toBeNull();
  });
});

describe("manifest dan berkas", () => {
  const m = bacaManifestDasar({ versi: "20261020", dibuat: "2026-10-20", tim: { "96": { berkas: "tim-96.pmtiles", ukuran: 123456, versi: "20261020" }, x: { berkas: "a.pmtiles", ukuran: 1 }, "7": { berkas: "../jahat.txt", ukuran: 9 } } });
  it("hanya menerima kunci angka dan nama berkas aman", () => {
    expect(m && Object.keys(m.tim)).toEqual(["96"]);
    expect(berkasUntukTim(m, 96)?.berkas).toBe("tim-96.pmtiles");
    expect(berkasUntukTim(m, 5)).toBeNull();
    expect(bacaManifestDasar(null)).toBeNull();
    expect(bacaManifestDasar({ versi: 1 })).toBeNull();
  });
  it("salinan berlaku menurut versi, atau umur bila manifest tak diketahui", () => {
    const b = berkasUntukTim(m, 96);
    expect(salinanBerlaku({ versi: "20261020", disimpanAt: 1 }, b)).toBe(true);
    expect(salinanBerlaku({ versi: "20261001", disimpanAt: 1 }, b)).toBe(false);
    expect(salinanBerlaku({ versi: null, disimpanAt: 1 }, b)).toBe(false);
    const nu = 1_000_000_000_000;
    expect(salinanBerlaku({ versi: null, disimpanAt: nu - 59 * 86400000 }, null, nu)).toBe(true);
    expect(salinanBerlaku({ versi: null, disimpanAt: nu - 61 * 86400000 }, null, nu)).toBe(false);
  });
  it("nama, url, dan label ukuran", () => {
    expect(namaBerkasTim(96)).toBe("tim-96.pmtiles");
    expect(urlPublikBerkas("https://x.supabase.co/", "tim-96.pmtiles")).toBe("https://x.supabase.co/storage/v1/object/public/peta-dasar/tim-96.pmtiles");
    expect(labelUkuran(18 * 1024 * 1024)).toBe("18 MB");
    expect(labelUkuran(2.5 * 1024 * 1024)).toBe("2,5 MB");
    expect(labelUkuran(400)).toBe("1 KB");
  });
});
