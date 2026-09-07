import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    // Dev proxy so the browser can call the Nebius OpenAI-compatible API
    // without CORS issues. In production this must be replaced by a real
    // server-side proxy (the API key must not ship to clients).
    proxy: {
      "/api/nebius": {
        target: "https://api.tokenfactory.nebius.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/nebius/, "/v1"),
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "EdgeCheck — Snowboard Coach",
        short_name: "EdgeCheck",
        description: "Upload a riding clip, get measured form stats and a coach-style breakdown.",
        theme_color: "#070b16",
        background_color: "#070b16",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html}"],
        navigateFallback: "index.html",
        // MediaPipe runtime + pose model are large; cache on first use, not precache.
        runtimeCaching: [
          {
            urlPattern: /\/(wasm|models)\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "mediapipe", expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "fonts", expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            // coaching API + supabase must never be cached
            urlPattern: /\/api\/nebius\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /supabase\.co\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
