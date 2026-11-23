import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 3123);

export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // По умолчанию — Chromium из `npx playwright install chromium`; PW_CHANNEL=chrome — установленный Chrome.
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: "node server.mjs",
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
  },
});
