import { test as setup, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const authDir = path.join(__dirname, 'playwright/.auth')
fs.mkdirSync(authDir, { recursive: true })

const accounts = [
  { name: 'admin', username: 'testuser', password: 'testpassword' },
  { name: 'alice', username: 'alice', password: 'testpassword' },
  { name: 'bob', username: 'bob', password: 'testpassword' },
  { name: 'charlie', username: 'charlie', password: 'testpassword' },
  { name: 'diana', username: 'diana', password: 'testpassword' },
]

for (const account of accounts) {
  const authFile = path.join(authDir, `${account.name}.json`)

  setup(`authenticate as ${account.name}`, async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle', timeout: 120_000 })
    await page.getByTestId('auth-login-btn').click()

    // Wait for Keycloak login form to be fully interactive
    await page.locator('#username').waitFor({ state: 'visible' })
    await page.locator('#password').waitFor({ state: 'visible' })

    // Fill and verify (Keycloak JS can clear values)
    await page.locator('#username').fill(account.username)
    await page.locator('#password').fill(account.password)

    if ((await page.locator('#username').inputValue()) !== account.username) {
      await page.locator('#username').clear()
      await page.locator('#username').pressSequentially(account.username, { delay: 30 })
    }
    if ((await page.locator('#password').inputValue()) !== account.password) {
      await page.locator('#password').clear()
      await page.locator('#password').pressSequentially(account.password, { delay: 30 })
    }

    await page.locator('#kc-login').click()

    // Wait for redirect back and profile to fully load
    await page.waitForURL((url) => !url.toString().includes('/realms/'), { timeout: 30000 })
    await expect(page.getByTestId('user-display-name')).toBeVisible({ timeout: 15000 })

    // Save authenticated state
    await page.context().storageState({ path: authFile })
  })
}
