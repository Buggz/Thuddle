import { type Browser, type BrowserContext, type Page, type Response } from '@playwright/test'
import { randomUUID } from 'crypto'
import path from 'path'

// --- Storage state paths (populated by auth.setup.ts) ---

export const STORAGE_STATE = {
  admin: path.join(__dirname, '../playwright/.auth/admin.json'),
  alice: path.join(__dirname, '../playwright/.auth/alice.json'),
  bob: path.join(__dirname, '../playwright/.auth/bob.json'),
  charlie: path.join(__dirname, '../playwright/.auth/charlie.json'),
  diana: path.join(__dirname, '../playwright/.auth/diana.json'),
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

/** Return start/end date strings in the past. */
export function pastDates(daysAgo: number, hour = 10): { start: string; end: string } {
  const start = new Date()
  start.setDate(start.getDate() - daysAgo)
  start.setHours(hour, 0, 0, 0)
  const end = new Date(start)
  end.setHours(hour + 2, 0, 0, 0)
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

/**
 * Parse a JSON response body, throwing a diagnostic error with status + body
 * text if the body is not valid JSON. This prevents cryptic
 * "Unexpected end of JSON input" errors from swallowing the real server error.
 */
export async function expectJson<T = unknown>(resp: Response): Promise<T> {
  const status = resp.status()
  const url = resp.url()
  const method = resp.request().method()
  const text = await resp.text()
  if (!resp.ok()) {
    throw new Error(
      `Expected JSON response but got ${status} from ${method} ${url}\n` +
        `Body (${text.length} bytes): ${text.slice(0, 2000)}`,
    )
  }
  try {
    return JSON.parse(text) as T
  } catch (err) {
    throw new Error(
      `Response was ${status} but body is not valid JSON from ${method} ${url}\n` +
        `Parse error: ${(err as Error).message}\n` +
        `Body (${text.length} bytes): ${text.slice(0, 2000)}`,
    )
  }
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
