import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Tests in the same file run serially (they often share setup state such as a
  // created event); different files run in parallel across workers.
  fullyParallel: false,
  retries: 1,
  workers: process.env.CI ? 2 : 4,
  use: {
    baseURL: process.env.THUDDLE_WEB_URL || 'http://localhost:50279',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Stage 0: authenticate all users once before tests
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // Stage 1: admin tests run first (they mutate global user permissions
    // which other specs could observe). Since `fullyParallel: false` keeps
    // same-file tests serial and the admin project is a single file, this
    // stage runs effectively single-threaded.
    {
      name: 'admin',
      testMatch: /admin\/.*\.spec\.ts/,
      use: { browserName: 'chromium' },
      dependencies: ['setup'],
    },

    // Stage 2: everything else runs in parallel across files after admin
    // completes.
    {
      name: 'chromium',
      testIgnore: /admin\/.*\.spec\.ts/,
      use: { browserName: 'chromium' },
      dependencies: ['admin'],
    },
  ],
})

