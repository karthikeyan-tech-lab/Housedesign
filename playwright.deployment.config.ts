import { defineConfig } from "@playwright/test";
import browserConfig from "./playwright.config";

export default defineConfig({
  ...browserConfig,
  testDir: "./tests/deployment",
  webServer: {
    command: "node tests/serve-production.mjs",
    url: "http://127.0.0.1:4174/",
    reuseExistingServer: false,
  },
  use: { ...browserConfig.use, baseURL: "http://127.0.0.1:4174/" },
});
