import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// (20 Okt 2026) maplibre-gl 6 memuat worker dari berkas terpisah. Aplikasi menyajikan salinannya dari /public/peta (PetaDasar.tsx -> setWorkerUrl).
// Uji ini gagal bila pustaka dinaikkan tetapi salinan/nama berkas belum diganti -- worker yang tidak cocok dengan pustaka membuat peta rusak diam-diam.
const akar = process.cwd();
const versi = JSON.parse(readFileSync(join(akar, "node_modules/maplibre-gl/package.json"), "utf8")).version as string;
const nama = `maplibre-gl-worker-${versi}.mjs`;

describe("worker maplibre-gl untuk peta jalan", () => {
  it("salinan di public/peta sama persis dengan worker pustaka yang terpasang", () => {
    const salinan = readFileSync(join(akar, "public/peta", nama));
    const asli = readFileSync(join(akar, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"));
    expect(salinan.equals(asli)).toBe(true);
  });
  it("PetaDasar.tsx dan next.config.js menunjuk berkas versi yang sama", () => {
    expect(readFileSync(join(akar, "app/sigap/pendataan/PetaDasar.tsx"), "utf8")).toContain(`"/peta/${nama}"`);
    expect(readFileSync(join(akar, "next.config.js"), "utf8")).toContain(`"/peta/${nama}"`);
  });
});
