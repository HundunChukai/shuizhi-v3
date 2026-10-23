import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
// C4：dev 代理把 /api 转发到后端（默认 :8787），消除 CORS；base/build 不动，构建产物零影响。
const apiTarget = process.env.VITE_DEV_API_TARGET ?? "http://localhost:8787";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "next/link": path.resolve(root, "src/shims/next-link.tsx"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
