import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({mode})=>({
  base:mode === "demo" ? "./" : "/",
  build:{outDir:mode === "demo" ? "dist-demo" : "dist"},
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4317",
      "/assets-file": "http://127.0.0.1:4317",
    },
  },
}));
