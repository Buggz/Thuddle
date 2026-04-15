import { type Browser, type BrowserContext, type Page } from '@playwright/test'

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
 * Log in via Keycloak and return an authenticated browser context + page.
 * The caller is responsible for closing the context when done.
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

  // Keycloak login form
  await page.locator('#username').fill(user.username)
  await page.locator('#password').fill(user.password)
  await page.locator('#kc-login').click()

  // Wait for redirect back to the app
  await page.waitForURL((url) => !url.toString().includes('/realms/'))

  return { context, page }
}
