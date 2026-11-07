import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve(__dirname) } }, test: { include: ["lib/keu/__tests__/isiNiat.test.ts", "lib/keu/__tests__/siklusRevisi.test.ts", "smokeIsiNiat.test.tsx"], environment: "node" } });
