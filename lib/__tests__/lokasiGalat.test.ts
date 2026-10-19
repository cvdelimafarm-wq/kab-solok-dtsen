import { describe, expect, it } from "vitest";
import { bacaPosisi, GalatBacaLokasi, jenisGalatLokasi, layakCobaJaringan, pesanGalatLokasi } from "@/lib/lokasiGalat";

type Opsi = PositionOptions;
/** Geolocation palsu: urutan hasil per panggilan; "kode:N" = galat, objek = posisi. */
const geoPalsu = (urutan: (number | { lat: number; lng: number; acc: number })[]) => {
  const opsiDipakai: Opsi[] = [];
  return {
    opsiDipakai,
    geo: {
      getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void, err: (e: { code?: number }) => void, opsi?: Opsi) => {
        opsiDipakai.push(opsi ?? {});
        const x = urutan.shift();
        if (typeof x === "number") err({ code: x });
        else if (x) ok({ coords: { latitude: x.lat, longitude: x.lng, accuracy: x.acc } });
        else err({});
      },
    },
  };
};

describe("jenisGalatLokasi & pesan", () => {
  it("memetakan kode GeolocationPositionError", () => {
    expect(jenisGalatLokasi(1)).toBe("izin");
    expect(jenisGalatLokasi(2)).toBe("tidak_tersedia");
    expect(jenisGalatLokasi(3)).toBe("waktu_habis");
    expect(jenisGalatLokasi(undefined)).toBe("tak_dikenal");
    expect(jenisGalatLokasi(99)).toBe("tak_dikenal");
  });
  it("hanya izin yang menyuruh membuka izin; waktu habis tidak menyalahkan izin", () => {
    expect(pesanGalatLokasi("izin")).toMatch(/Izin lokasi/);
    expect(pesanGalatLokasi("waktu_habis")).not.toMatch(/Izin/);
    expect(pesanGalatLokasi("tidak_tersedia")).not.toMatch(/Izin/);
  });
  it("opsi tidak wajib menambah kalimat boleh dilewati", () => {
    expect(pesanGalatLokasi("waktu_habis", true)).toMatch(/tidak wajib/);
    expect(pesanGalatLokasi("waktu_habis")).not.toMatch(/tidak wajib/);
  });
  it("layak dicoba lewat jaringan: posisi tidak tersedia & waktu habis saja", () => {
    expect(layakCobaJaringan("tidak_tersedia")).toBe(true);
    expect(layakCobaJaringan("waktu_habis")).toBe(true);
    expect(layakCobaJaringan("izin")).toBe(false);
    expect(layakCobaJaringan("tak_dikenal")).toBe(false);
  });
});

describe("bacaPosisi", () => {
  it("GPS berhasil: satu panggilan, akurasi tinggi", async () => {
    const { geo, opsiDipakai } = geoPalsu([{ lat: -0.8, lng: 100.6, acc: 8 }]);
    expect(await bacaPosisi(geo)).toEqual({ lat: -0.8, lng: 100.6, akurasi: 8 });
    expect(opsiDipakai).toHaveLength(1);
    expect(opsiDipakai[0].enableHighAccuracy).toBe(true);
  });
  it("waktu habis -> dicoba lagi lewat jaringan dan berhasil", async () => {
    const { geo, opsiDipakai } = geoPalsu([3, { lat: -0.8, lng: 100.6, acc: 900 }]);
    const p = await bacaPosisi(geo);
    expect(p.akurasi).toBe(900);
    expect(opsiDipakai).toHaveLength(2);
    expect(opsiDipakai[1].enableHighAccuracy).toBe(false);
  });
  it("posisi tidak tersedia lalu jaringan gagal juga -> galat jenis terakhir", async () => {
    const { geo } = geoPalsu([2, 3]);
    await expect(bacaPosisi(geo)).rejects.toMatchObject({ jenis: "waktu_habis" });
  });
  it("izin ditolak -> langsung galat izin, tanpa percobaan kedua", async () => {
    const { geo, opsiDipakai } = geoPalsu([1]);
    await expect(bacaPosisi(geo)).rejects.toBeInstanceOf(GalatBacaLokasi);
    expect(opsiDipakai).toHaveLength(1);
  });
  it("getCurrentPosition melempar -> galat tak_dikenal (tidak menggantung)", async () => {
    const geo = { getCurrentPosition: () => { throw new Error("x"); } };
    await expect(bacaPosisi(geo)).rejects.toMatchObject({ jenis: "tak_dikenal" });
  });
});
