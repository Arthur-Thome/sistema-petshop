import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const candidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
].filter(Boolean);
const installedBrowser = candidates.find(candidate => fs.existsSync(candidate));

export default defineConfig({
  testDir: './e2e',
  outputDir: './node_modules/.cache/playwright-lote2-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: installedBrowser ? { executablePath: installedBrowser } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/login',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
