import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a real Supabase project — they exercise RLS,
 * which is the whole point. Point `E2E_BASE_URL` at a running instance seeded
 * with `supabase/seed.sql`, or leave it unset to let Playwright start `next dev`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false, // the tests share one unit's data
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
});
