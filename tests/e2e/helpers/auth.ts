import { type Browser, type BrowserContext, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import path from 'path'

// --- Storage state paths (populated by auth.setup.ts) ---

export const STORAGE_STATE = {
  admin: path.join(__dirname, '../playwright/.auth/admin.json'),
  alice: path.join(__dirname, '../playwright/.auth/alice.json'),
  bob: path.join(__dirname, '../playwright/.auth/bob.json'),
  charlie: path.join(__dirname, '../playwright/.auth/charlie.json'),
}

// --- Test-data helpers ---

/** Short unique suffix for test data names. */
export function uid(): string {
  return randomUUID().slice(0, 8)
}

/** Format a Date for datetime-local input. */
export function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Return start/end date strings offset from today. */
export function futureDates(daysFromNow: number, hour = 10): { start: string; end: string } {
  const start = new Date()
  start.setDate(start.getDate() + daysFromNow)
  start.setHours(hour, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: formatLocal(start), end: formatLocal(end) }
}

// --- Browser context helpers ---

/** Create a browser context pre-authenticated as the given user. */
export async function contextAs(
  browser: Browser,
  user: keyof typeof STORAGE_STATE,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: STORAGE_STATE[user] })
  const page = await context.newPage()
  return { context, page }
}

// --- UI login (used only by auth/login.spec.ts) ---

export interface TestUser {
  username: string
  password: string
}

export const users = {
  admin: { username: 'testuser', password: 'testpassword' },
  alice: { username: 'alice', password: 'testpassword' },
  bob: { username: 'bob', password: 'testpassword' },
  charlie: { username: 'charlie', password: 'testpassword' },
} as const satisfies Record<string, TestUser>

/**
 * Log in via Keycloak UI and return an authenticated context + page.
 * Used by login flow tests; other tests should use storageState instead.
 */
export async function loginAs(
  browser: Browser,
  user: TestUser,
  baseURL: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()

  await page.goto(baseURL)
  await page.getByTestId('auth-login-btn').click()

  await page.locator('#username').waitFor({ state: 'visible' })
  await page.locator('#password').waitFor({ state: 'visible' })

  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)

  if ((await page.locator('#username').inputValue()) !== user.username) {
    await page.locator('#username').clear()
    await page.locator('#username').pressSequentially(user.username, { delay: 30 })
  }
  if ((await page.locator('#password').inputValue()) !== user.password) {
    await page.locator('#password').clear()
    await page.locator('#password').pressSequentially(user.password, { delay: 30 })
  }

  await page.locator('#kc-login').click()

  await page.waitForURL((url) => !url.toString().includes('/realms/'), { timeout: 30000 })
  await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 15000 })

  return { context, page }
}
