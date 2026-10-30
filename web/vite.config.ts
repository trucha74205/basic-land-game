/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

const target = process.env.DEV_SERVER ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Basic Land Game",
        short_name: "Basic Lands",
        description: "Two-player Basic Land Game",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#1f1f2e",
        theme_color: "#1f1f2e",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: { rollupFormat: "iife", globPatterns: ["**/*.{js,css,html,ttf,png,jpg,json,svg}"], maximumFileSizeToCacheInBytes: 3_000_000 },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { proxy: { "/api": target, "/img": target, "/ws": { target, ws: true } } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./test/setup.ts"], include: ["test/**/*.test.{ts,tsx}"] },
});
