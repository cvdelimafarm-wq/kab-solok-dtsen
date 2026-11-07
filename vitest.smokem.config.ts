import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ esbuild: { jsx: "automatic" }, resolve: { alias: { "@": path.resolve(__dirname) } }, test: { include: ["smokeMaster.test.tsx"], environment: "node" } });
