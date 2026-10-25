import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3001",
    browserName: "chromium",
    channel: "msedge",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node backend/server.js",
    url: "http://127.0.0.1:3001/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
