import { resolve } from "node:path";
import { defineConfig } from "vite";

const page = (name: string) => resolve(import.meta.dirname, `${name}.html`);

export default defineConfig({
  // Dev only: lets the Werkmeister ingress host (cerner-smart-app.<local_domain>) reach the dev server.
  server: { allowedHosts: true },
  // launch.html = EHR launch, launch-patient.html = standalone patient launch; both redirect back to index.html.
  build: {
    rollupOptions: {
      input: { launch: page("launch"), "launch-patient": page("launch-patient"), index: page("index") },
    },
  },
});
