import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

const dasar = vi.hoisted(() => ({ nilai: { siapCek: true, online: true, berkas: null, sumber: null, berlaku: false, adaVersiBaru: false, ada: false, lapisan: "jalan", setLapisan() {}, unduh: { fase: "diam", diterima: 0, total: 0, pesan: null }, mulaiUnduh() {}, batalkanUnduh() {} } as Record<string, unknown> }));
vi.mock("next/dynamic", () => ({ default: () => (p: { proj: { lebar: number; tinggi: number } }) => <div data-latar={`${p.proj.lebar}x${p.proj.tinggi}`} /> }));
vi.mock("@/app/sigap/pendataan/useDasar", () => ({ useDasarTim: () => dasar.nilai }));
vi.mock("@/app/sigap/pendataan/KontrolPetaDasar", () => ({ default: () => <div data-kontrol="1" /> }));
import { FigurPetaSub, LatarSubSls } from "@/app/sigap/sampel/PetaSubSls";
import { ambilGiliran, lepasGiliran, pemegangGiliran, setelUlangGiliran } from "@/app/sigap/sampel/latarSubSls";
import { siapkanPetaSub } from "@/lib/petaWilayah";

const kk = [
  { id: 1, nama_kk: "A", lat: -0.95, lng: 100.5 },
  { id: 2, nama_kk: "B", lat: -0.951, lng: 100.502 },
];
const gambar = siapkanPetaSub(null, kk, new Map([[1, "utama"]]))!;

beforeEach(() => {
  setelUlangGiliran();
  dasar.nilai = { ...dasar.nilai, sumber: null, lapisan: "jalan", berkas: null, ada: false };
});

describe("giliran latar peta jalan", () => {
  it("satu pemegang pada satu waktu; melepas hanya oleh pemegangnya", () => {
    ambilGiliran("a");
    expect(pemegangGiliran()).toBe("a");
    ambilGiliran("b");
    expect(pemegangGiliran()).toBe("b");
    lepasGiliran("a"); // bukan pemegang: tidak berpengaruh
    expect(pemegangGiliran()).toBe("b");
    lepasGiliran("b");
    expect(pemegangGiliran()).toBeNull();
  });
});

describe("peta mini sub SLS dengan latar peta jalan", () => {
  it("peta membawa proyeksi kanvas untuk latar", () => {
    expect(gambar.proyeksi.lebar).toBe(gambar.lebar);
    expect(gambar.proyeksi.tinggi).toBe(gambar.tinggi);
  });

  it("tanpa kunci peta: seperti sebelumnya (kanvas biasa, tanpa tombol peta jalan)", () => {
    const h = renderToString(<FigurPetaSub gambar={gambar} keterangan={null} idsubsls="1303040001000100" />);
    expect(h).toContain("bg-[#F4F8FD]");
    expect(h).not.toContain("Peta jalan di sini");
    expect(h).not.toContain("data-latar");
    expect(h).toMatch(/Utama (<!-- -->)?1/);
  });

  it("dengan kunci peta tetapi giliran belum dipegang: tombol untuk mengambilnya, tanpa pemuatan peta jalan", () => {
    const h = renderToString(<FigurPetaSub gambar={gambar} keterangan={null} kunciDasar={100071000011} idsubsls="1303040001000100" />);
    expect(h).toContain("Peta jalan di sini");
    expect(h).not.toContain("data-latar");
  });

  it("memegang giliran dan ada sumber: latar dimuat dengan kanvas sub SLS, kontrol tampil, SVG tetap tergambar", () => {
    dasar.nilai = { ...dasar.nilai, sumber: { tipe: "online", url: "https://x/y.pmtiles" } };
    const h = renderToString(<LatarSubSls kunci={100071000011} aktif proj={gambar.proyeksi} anak={(siap) => <svg data-siap={String(siap)} />} />);
    expect(h).toContain(`data-latar="${gambar.lebar}x${gambar.tinggi}"`);
    expect(h).toContain('data-kontrol="1"');
    expect(h).toContain('data-siap="false"'); // masih memuat: SVG belum bening
  });

  it("memegang giliran tetapi lapisan 'Titik saja' atau tanpa sumber: tanpa latar", () => {
    dasar.nilai = { ...dasar.nilai, sumber: { tipe: "online", url: "u" }, lapisan: "titik" };
    expect(renderToString(<LatarSubSls kunci={1} aktif proj={gambar.proyeksi} anak={() => <i />} />)).not.toContain("data-latar");
    dasar.nilai = { ...dasar.nilai, sumber: null, lapisan: "jalan" };
    expect(renderToString(<LatarSubSls kunci={1} aktif proj={gambar.proyeksi} anak={() => <i />} />)).not.toContain("data-latar");
  });

  it("tidak memegang giliran: tidak memuat latar dan tanpa kontrol", () => {
    dasar.nilai = { ...dasar.nilai, sumber: { tipe: "online", url: "u" } };
    const h = renderToString(<LatarSubSls kunci={1} aktif={false} proj={gambar.proyeksi} anak={() => <i />} />);
    expect(h).not.toContain("data-latar");
    expect(h).not.toContain("data-kontrol");
  });
});
