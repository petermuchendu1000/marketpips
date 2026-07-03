// playwright.config.ts — E2E + automated accessibility (axe) config (Module 17.1).
// Excluded from `tsc` (tsconfig "exclude": ["e2e"]) and from vitest; runs only in
// the dedicated a11y/e2e CI job where Playwright browsers + deps are installed.
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile viewport matters for EA users; a11y must hold on small screens too.
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  // Start the app if a server isn't already provided (local runs).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
