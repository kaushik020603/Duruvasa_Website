/// <reference types="vitest" />
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = process.env.API_URL ?? "http://127.0.0.1:4180";
const ngrok = [".ngrok-free.app", ".ngrok.app", ".ngrok.io"];

// `vite build` makes the browser bundles; `vite build --ssr src/entry-server.tsx --outDir dist-ssr` makes the server-rendering bundle.
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  publicDir: isSsrBuild ? false : "public",
  build: isSsrBuild
    ? {}
    : { rollupOptions: { input: { main: resolve(__dirname, "index.html"), admin: resolve(__dirname, "admin/index.html") } } },
  // `allowedHosts` lets ngrok tunnels reach the dev server (leading dot matches any subdomain).
  server: {
    allowedHosts: ngrok,
    proxy: { "/api": { target: API, changeOrigin: false }, "/uploads": { target: API, changeOrigin: false } },
  },
  preview: { allowedHosts: ngrok, proxy: { "/api": API, "/uploads": API } },
  test: { environment: "node", include: ["src/**/*.test.ts", "server/**/*.test.ts", "shared/**/*.test.ts"], testTimeout: 30000 },
}));
