import { defineConfig, devices } from "@playwright/test";

const feature = process.env.WERKMEISTER_FEATURE;
// shortcut: local_domain hardcoded to local.sandbox.com; read it from werkmeister once `feature test` exports it.
const LOCAL_DOMAIN = "local.sandbox.com";
const DEV_URL = "http://localhost:5173";
const baseURL = process.env.SMART_APP_URL ?? (feature ? `https://smart-app.${LOCAL_DOMAIN}` : DEV_URL);

export default defineConfig({
  testDir: "e2e",
  reporter: "line",
  retries: 0,
  timeout: 60_000, // the SMART launcher is a remote service
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    // Route to this workspace by cookie, not extraHTTPHeaders: an X-Feature header would also go
    // on fhirclient's cross-origin requests to the launcher and fail their CORS preflight.
    storageState: feature
      ? {
          cookies: [
            {
              name: "X-Feature",
              value: feature,
              domain: `.${LOCAL_DOMAIN}`,
              path: "/",
              expires: -1,
              httpOnly: false,
              secure: false,
              sameSite: "Lax",
            },
          ],
          origins: [],
        }
      : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer:
    baseURL === DEV_URL
      ? { command: "pnpm --filter smart-app dev", url: `${DEV_URL}/launch.html`, reuseExistingServer: true }
      : undefined,
});
