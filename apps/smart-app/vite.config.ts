import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // Dev only: lets the Werkmeister ingress host (smart-app.<local_domain>) reach the dev server.
  server: { allowedHosts: true },
  // Two entry pages: the EHR (or SMART launcher) opens launch.html, OAuth redirects back to index.html.
  build: {
    rollupOptions: {
      input: { launch: resolve(import.meta.dirname, "launch.html"), index: resolve(import.meta.dirname, "index.html") },
    },
  },
});
