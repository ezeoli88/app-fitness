import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  workers: 1,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://127.0.0.1:8787' },
  webServer: {
    command: 'rm -rf .wrangler && npx wrangler d1 migrations apply rutina-db --local && npx wrangler dev --port 8787 --ip 127.0.0.1 --var DEV_BYPASS_ACCESS:1 --var OWNER_EMAIL:owner@example.com',
    cwd: '../worker',
    url: 'http://127.0.0.1:8787/api/health',
    timeout: 120_000,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
  ],
});
