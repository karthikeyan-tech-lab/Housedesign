import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173/Housedesign/",
    ...devices["Pixel 7"],
    defaultBrowserType: "chromium",
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH === "bundled"
          ? undefined
          : process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173/Housedesign/",
    reuseExistingServer: !process.env.CI,
  },
});
