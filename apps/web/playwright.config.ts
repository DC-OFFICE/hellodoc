import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const browsersPath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ??
  (existsSync(join(rootDir, '..', '..', '.playwright-browsers'))
    ? join(rootDir, '..', '..', '.playwright-browsers')
    : existsSync(
          'C:\\Users\\ASUS\\AppData\\Local\\Temp\\cursor-sandbox-cache\\7612f6d274bf9957f9de9ce63332ffd5\\playwright',
        )
      ? 'C:\\Users\\ASUS\\AppData\\Local\\Temp\\cursor-sandbox-cache\\7612f6d274bf9957f9de9ce63332ffd5\\playwright'
      : undefined);

if (browsersPath) process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    // Prefer localhost so cookie CORS matches apps/api CORS_ORIGIN.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop-login',
      testMatch: /login\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tablet-login',
      testMatch: /login\.spec\.ts/,
      use: { ...devices['iPad (gen 7)'], defaultBrowserType: 'chromium' },
    },
    {
      name: 'mobile-login',
      testMatch: /login\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'desktop-auth',
      dependencies: ['setup'],
      testMatch: /(reception\.manager|reception\.receptionist|doctor|cashier|public-tracking|authorization)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tablet-responsive',
      dependencies: ['setup'],
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices['iPad (gen 7)'], defaultBrowserType: 'chromium' },
    },
    {
      name: 'mobile-responsive',
      dependencies: ['setup'],
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
  ],
});
