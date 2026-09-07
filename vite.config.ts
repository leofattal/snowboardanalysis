import { defineConfig } from "vite";

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
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
