import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve(__dirname) } }, test: { include: ["smokePetaTim.test.tsx", "smokePetaSub.test.tsx", "smokeWilayah.test.tsx", "lib/__tests__/petaKegiatan.test.ts", "lib/__tests__/petaWilayah.test.ts"], environment: "node" } });
