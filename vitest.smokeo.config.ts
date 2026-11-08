import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve(__dirname) } }, test: { include: ["smokeObjek.test.tsx", "lib/__tests__/sampelObjek.test.ts"], environment: "node" } });
