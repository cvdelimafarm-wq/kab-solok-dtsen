import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve(__dirname) } }, test: { environment: "node", include: ["lib/keu/__tests__/usulanSampel.test.ts", "lib/__tests__/seleksiTurunanObjek.test.ts", "lib/__tests__/smokeUsulanSampel.test.tsx"] } });
