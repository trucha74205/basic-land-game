import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3100;
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: "npx vite build && npx tsx ../server/src/main.ts",
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), HOST: "127.0.0.1", STATIC_DIR: "dist", DATA_DIR: mkdtempSync(join(tmpdir(), "blg-e2e-")), AUTO_PASS_MIN_MS: "100", AUTO_PASS_MAX_MS: "200" },
  },
});
