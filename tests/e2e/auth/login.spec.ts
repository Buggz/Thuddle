import { test, expect } from '@playwright/test'
import { loginAs, users } from '../helpers/auth'

test.describe('Login', () => {
  test.describe('positive', () => {
    test('user can log in via Keycloak and see authenticated state', async ({ browser, baseURL }) => {
      const { context, page } = await loginAs(browser, users.admin, baseURL!)

      // Should be back on the homepage
      await expect(page).toHaveURL(baseURL!)

      // Authenticated navbar elements should be visible
      await expect(page.getByTestId('user-display-name')).toBeVisible()
      await expect(page.getByTestId('event-create-btn')).toBeVisible()
      await expect(page.getByTestId('nav-menu-btn')).toBeVisible()

      // Sign In button should be gone
      await expect(page.getByTestId('auth-login-btn')).not.toBeVisible()

      await context.close()
    })

    test('user display name is shown after login', async ({ browser, baseURL }) => {
      const { context, page } = await loginAs(browser, users.admin, baseURL!)

      await expect(page.getByTestId('user-display-name')).toHaveText(/Test User|testuser/i)

      await context.close()
    })

    test('menu opens and shows profile and sign out links', async ({ browser, baseURL }) => {
      const { context, page } = await loginAs(browser, users.admin, baseURL!)

      await page.getByTestId('nav-menu-btn').click()
      await expect(page.getByTestId('nav-profile-link')).toBeVisible()
      await expect(page.getByTestId('auth-logout-btn')).toBeVisible()

      await context.close()
    })
  })

  test.describe('negative', () => {
    test('anonymous user sees Sign In button, not authenticated controls', async ({ page, baseURL }) => {
      await page.goto(baseURL!)

      // Sign In button should be visible
      await expect(page.getByTestId('auth-login-btn')).toBeVisible()

      // Authenticated elements should not be present
      await expect(page.getByTestId('user-display-name')).not.toBeVisible()
      await expect(page.getByTestId('event-create-btn')).not.toBeVisible()
      await expect(page.getByTestId('nav-menu-btn')).not.toBeVisible()
    })

    test('anonymous user is redirected to Keycloak when accessing /profile', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/profile`)

      // Should be redirected to Keycloak login
      await expect(page).toHaveURL(/\/realms\/Thuddle\/protocol\/openid-connect\/auth/)
    })

    test('anonymous user is redirected to Keycloak when accessing /events/create', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/events/create`)

      // Should be redirected to Keycloak login
      await expect(page).toHaveURL(/\/realms\/Thuddle\/protocol\/openid-connect\/auth/)
    })
  })
})
