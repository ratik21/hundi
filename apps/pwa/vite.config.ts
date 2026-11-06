import { execSync } from "node:child_process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const commit = execSync("git rev-parse --short HEAD").toString().trim();
const builtAt = new Date().toISOString().slice(0, 16);

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(`${commit} ${builtAt}`),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      manifest: {
        background_color: "#f1e9da",
        description: "Pay in USDT with no network.",
        display: "standalone",
        icons: [
          { sizes: "192x192", src: "icon-192.png", type: "image/png" },
          { sizes: "512x512", src: "icon-512.png", type: "image/png" },
          {
            purpose: "maskable",
            sizes: "512x512",
            src: "icon-512.png",
            type: "image/png",
          },
        ],
        name: "Hundi",
        scope: "/",
        short_name: "Hundi",
        start_url: "/",
        theme_color: "#f1e9da",
      },
      registerType: "autoUpdate",
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        globPatterns: ["**/*.{css,html,ico,js,png,svg,webmanifest}"],
        navigateFallback: "index.html",
        skipWaiting: true,
      },
    }),
  ],
});
