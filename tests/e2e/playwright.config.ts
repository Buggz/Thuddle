import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  use: {
    baseURL: process.env.THUDDLE_WEB_URL || 'http://localhost:50279',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Authenticate all users once before tests
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      dependencies: ['setup'],
    },
  ],
})
