import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@nexus/core": resolve(appDirectory, "../../packages/core/src/index.ts") } },
  build: { outDir: "dist", emptyOutDir: true }
});
