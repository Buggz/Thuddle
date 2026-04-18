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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Stage 0: authenticate all users once before tests
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // Admin tests use a dedicated 5th user (diana) for permission
    // grant/revoke, so they can run in parallel with everything else.
    {
      name: 'admin',
      testMatch: /admin\/.*\.spec\.ts/,
      use: { browserName: 'chromium' },
      dependencies: ['setup'],
    },

    {
      name: 'chromium',
      testIgnore: /admin\/.*\.spec\.ts/,
      use: { browserName: 'chromium' },
      dependencies: ['setup'],
    },
  ],
})

