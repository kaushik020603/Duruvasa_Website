import { defineConfig, devices } from "@playwright/test";

const PORT = 4190;
const BASE = `http://127.0.0.1:${PORT}`;
// Locally we reuse the installed Chrome (no browser download). CI installs Playwright's Chromium.
const browser = process.env.CI ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL: BASE, trace: "retain-on-failure", screenshot: "only-on-failure", ...browser },
  // Order matters: the shared database is fresh, public specs run first (mobile, then desktop), admin specs last.
  projects: [
    { name: "mobile", testMatch: /01-public\.spec\.ts/, use: { ...devices["Pixel 7"], ...browser } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...browser, viewport: { width: 1280, height: 800 } } },
  ],
  // Serves the production build with a fresh, throwaway database. Run `npm run build` first.
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `${BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: String(PORT) },
  },
});
