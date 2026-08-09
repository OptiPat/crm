import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const webRoot = path.resolve(__dirname);

/** Build via le lockfile racine (`npm run build:espace-portail`) — pas de npm install ici. */
export default defineConfig({
  root: webRoot,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.join(webRoot, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(webRoot, "../../src"),
    },
  },
});
