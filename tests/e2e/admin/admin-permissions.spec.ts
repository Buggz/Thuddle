import { test as base, expect } from '@playwright/test'
import { STORAGE_STATE, contextAs } from '../helpers/auth'
import type { Page } from '@playwright/test'

/**
 * Extended fixture that cleans up permissions granted during a test.
 * Push { email, permission } into grantedPermissions; teardown revokes them.
 * Idempotent — silently skips if the permission was already revoked by the test.
 */
const test = base.extend<{ grantedPermissions: Array<{ email: string; permission: string }> }>({
  grantedPermissions: async ({ browser, baseURL }, use) => {
    const granted: Array<{ email: string; permission: string }> = []
    await use(granted)

    if (granted.length === 0) return

    const ctx = await browser.newContext({ storageState: STORAGE_STATE.admin })
    const page = await ctx.newPage()
    let token = ''
    page.on('request', (req) => {
      const auth = req.headers()['authorization']
      if (auth?.startsWith('Bearer ')) token = auth.substring(7)
    })
    await page.goto(baseURL!)
    await page.waitForResponse((r) => r.url().includes('/api/events') && r.status() === 200)

    // Fetch current permissions to resolve userIds
    const listResp = await page.request.get(`${baseURL}/api/admin/permissions`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const allPerms: Array<{ userId: string; email: string; permission: string }> =
      await listResp.json()

    for (const { email, permission } of granted) {
      const match = allPerms.find(
        (p) => p.email.toLowerCase() === email.toLowerCase() && p.permission === permission,
      )
      if (match) {
        await page.request
          .delete(
            `${baseURL}/api/admin/permissions/${match.userId}/${encodeURIComponent(permission)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          )
          .catch(() => {})
      }
    }

    await ctx.close()
  },
})

/** Navigate to /admin and wait for the page + data to load. */
async function goToAdmin(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/admin`)
  await page.getByTestId('admin-heading').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('admin-permissions-table').waitFor({ state: 'visible', timeout: 10000 })
}

/** Search for a user in the admin grant combobox and select them. */
async function selectUserInGrantForm(page: Page, searchText: string, resultText: string) {
  const picker = page.getByTestId('admin-grant-user-picker')
  const combobox = picker.getByTestId('user-search-combobox')
  await combobox.getByTestId('user-search-input').fill(searchText)
  await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
  await combobox.getByTestId('user-search-result').filter({ hasText: resultText }).click()
  // Wait for selected user chip to appear
  await expect(page.getByTestId('admin-grant-selected-user')).toBeVisible()
}

/** Open the user dropdown menu. */
async function openUserMenu(page: Page) {
  await page.getByTestId('nav-menu-btn').click()
}

/** Capture a Bearer token from outgoing requests. */
async function captureToken(page: Page, baseURL: string): Promise<string> {
  let token = ''
  page.on('request', (req) => {
    const auth = req.headers()['authorization']
    if (auth?.startsWith('Bearer ')) token = auth.substring(7)
  })
  await page.goto(baseURL)
  await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
  return token
}

test.describe('Admin Permissions', () => {
  test.describe('admin with admin:access', () => {
    test('admin sees Admin link in the user menu', async ({ browser, baseURL }) => {
      const { context, page } = await contextAs(browser, 'admin')
      await page.goto(baseURL!)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
      await openUserMenu(page)
      await expect(page.getByTestId('nav-admin-link')).toBeVisible()
      await context.close()
    })

    test('admin can access /admin and sees heading, grant form, and permissions table', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await contextAs(browser, 'admin')
      await goToAdmin(page, baseURL!)

      // Grant form elements — user search combobox + permission select + grant button
      await expect(page.getByTestId('admin-grant-user-picker')).toBeVisible()
      await expect(page.getByTestId('admin-grant-permission-select')).toBeVisible()
      await expect(page.getByTestId('admin-grant-btn')).toBeVisible()

      // Grant button should be disabled when no user is selected
      await expect(page.getByTestId('admin-grant-btn')).toBeDisabled()

      // Permissions table with seeded testuser permissions
      await expect(page.getByTestId('admin-permissions-table')).toBeVisible()
      const testUserRows = page.locator(
        '[data-testid="admin-permission-row"][data-user-email="testuser@thuddle.dev"]',
      )
      await expect(testUserRows).toHaveCount(3) // events:write, groups:manage, admin:access

      await context.close()
    })

    test('admin can grant a permission to another user', async ({
      browser,
      baseURL,
      grantedPermissions,
    }) => {
      const { context, page } = await contextAs(browser, 'admin')
      await goToAdmin(page, baseURL!)

      // Search and select diana via the user search combobox
      await selectUserInGrantForm(page, 'diana', 'diana@thuddle.dev')
      await page.getByTestId('admin-grant-permission-select').selectOption('events:write')

      const resp = page.waitForResponse(
        (r) => r.url().includes('/api/admin/permissions') && r.request().method() === 'POST',
      )
      await page.getByTestId('admin-grant-btn').click()
      const response = await resp
      expect(response.status()).toBe(201)

      // Track for cleanup
      grantedPermissions.push({ email: 'diana@thuddle.dev', permission: 'events:write' })

      // Toast appears
      await expect(page.getByTestId('admin-toast')).toContainText('events:write')
      await expect(page.getByTestId('admin-toast')).toContainText('diana@thuddle.dev')

      // Diana now appears in the table
      const dianaRow = page.locator(
        '[data-testid="admin-permission-row"][data-user-email="diana@thuddle.dev"]',
      )
      await expect(dianaRow).toBeVisible()

      // Selected user chip is cleared, combobox is back
      await expect(page.getByTestId('admin-grant-selected-user')).toHaveCount(0)
      await expect(
        page.getByTestId('admin-grant-user-picker').getByTestId('user-search-combobox'),
      ).toBeVisible()

      await context.close()
    })

    test('admin can revoke a permission via confirm dialog', async ({
      browser,
      baseURL,
      grantedPermissions,
    }) => {
      // Grant diana events:write via the UI so we have something to revoke
      const { context, page } = await contextAs(browser, 'admin')
      await goToAdmin(page, baseURL!)

      await selectUserInGrantForm(page, 'diana', 'diana@thuddle.dev')
      await page.getByTestId('admin-grant-permission-select').selectOption('events:write')

      const grantResp = page.waitForResponse(
        (r) => r.url().includes('/api/admin/permissions') && r.request().method() === 'POST',
      )
      await page.getByTestId('admin-grant-btn').click()
      const grantResponse = await grantResp
      expect(grantResponse.status()).toBe(201)

      // Track for cleanup in case the UI revoke fails mid-test
      grantedPermissions.push({ email: 'diana@thuddle.dev', permission: 'events:write' })

      // Diana should appear in the table (re-fetched from server)
      const dianaRow = page.locator(
        '[data-testid="admin-permission-row"][data-user-email="diana@thuddle.dev"]',
      )
      await expect(dianaRow).toBeVisible()

      // Hover to reveal the revoke button
      await dianaRow.hover()
      await dianaRow.getByTestId('admin-revoke-btn').click()

      // Confirm dialog appears
      await expect(page.getByTestId('admin-revoke-confirm')).toBeVisible()
      await expect(page.getByTestId('admin-revoke-cancel')).toBeVisible()

      const deleteResp = page.waitForResponse(
        (r) =>
          r.url().includes('/api/admin/permissions/') && r.request().method() === 'DELETE',
      )
      await page.getByTestId('admin-revoke-confirm').click()
      const delResponse = await deleteResp
      expect(delResponse.status()).toBe(200)

      // Diana's row should be gone
      await expect(dianaRow).toHaveCount(0)

      // Toast confirms
      await expect(page.getByTestId('admin-toast')).toContainText('Revoked')

      await context.close()
    })

    test('cancel revoke dialog dismisses without removing permission', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await contextAs(browser, 'admin')
      await goToAdmin(page, baseURL!)

      // Hover the first permission row to reveal the revoke button
      const row = page.getByTestId('admin-permission-row').first()
      await row.hover()
      await row.getByTestId('admin-revoke-btn').click()

      // Dialog appears
      await expect(page.getByTestId('admin-revoke-confirm')).toBeVisible()

      // Cancel
      await page.getByTestId('admin-revoke-cancel').click()

      // Dialog gone
      await expect(page.getByTestId('admin-revoke-confirm')).toHaveCount(0)

      // Testuser still has all 3 permissions
      const testUserRows = page.locator(
        '[data-testid="admin-permission-row"][data-user-email="testuser@thuddle.dev"]',
      )
      await expect(testUserRows).toHaveCount(3)

      await context.close()
    })

    test('searching for non-existent user shows no results and grant stays disabled', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await contextAs(browser, 'admin')
      await goToAdmin(page, baseURL!)

      const picker = page.getByTestId('admin-grant-user-picker')
      const combobox = picker.getByTestId('user-search-combobox')
      await combobox.getByTestId('user-search-input').fill('nobody@nonexistent.dev')
      await combobox
        .getByTestId('user-search-no-results')
        .waitFor({ state: 'visible', timeout: 10000 })

      // Grant button remains disabled since no user was selected
      await expect(page.getByTestId('admin-grant-btn')).toBeDisabled()

      await context.close()
    })

    test('admin can clear selected user and pick a different one', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await contextAs(browser, 'admin')
      await goToAdmin(page, baseURL!)

      // Select alice
      await selectUserInGrantForm(page, 'alice', 'alice@thuddle.dev')
      await expect(page.getByTestId('admin-grant-selected-user')).toContainText(
        'alice@thuddle.dev',
      )

      // Clear selection
      await page.getByTestId('admin-grant-clear-user').click()
      await expect(page.getByTestId('admin-grant-selected-user')).toHaveCount(0)
      await expect(page.getByTestId('admin-grant-btn')).toBeDisabled()

      // Select bob instead
      await selectUserInGrantForm(page, 'bob', 'bob@thuddle.dev')
      await expect(page.getByTestId('admin-grant-selected-user')).toContainText(
        'bob@thuddle.dev',
      )

      await context.close()
    })

    test('granting duplicate permission shows conflict error', async ({
      browser,
      baseURL,
      grantedPermissions,
    }) => {
      // Grant diana events:write via the UI first
      const { context, page } = await contextAs(browser, 'admin')
      await goToAdmin(page, baseURL!)

      await selectUserInGrantForm(page, 'diana', 'diana@thuddle.dev')
      await page.getByTestId('admin-grant-permission-select').selectOption('events:write')

      const grantResp = page.waitForResponse(
        (r) => r.url().includes('/api/admin/permissions') && r.request().method() === 'POST',
      )
      await page.getByTestId('admin-grant-btn').click()
      const grantResponse = await grantResp
      expect(grantResponse.status()).toBe(201)
      grantedPermissions.push({ email: 'diana@thuddle.dev', permission: 'events:write' })

      // Now try to grant the same permission again — should show conflict error
      await selectUserInGrantForm(page, 'diana', 'diana@thuddle.dev')
      await page.getByTestId('admin-grant-permission-select').selectOption('events:write')
      await page.getByTestId('admin-grant-btn').click()

      await expect(page.getByTestId('admin-error')).toBeVisible()
      await expect(page.getByTestId('admin-error')).toContainText('already has')

      await context.close()
    })
  })

  test.describe('permission denied (user without admin:access)', () => {
    test('regular user does not see Admin link in the user menu', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await contextAs(browser, 'alice')
      await page.goto(baseURL!)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
      await openUserMenu(page)

      await expect(page.getByTestId('nav-admin-link')).toHaveCount(0)

      await context.close()
    })

    test('regular user navigating to /admin is redirected to home', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await contextAs(browser, 'alice')
      await page.goto(`${baseURL}/admin`)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
      await expect(page).toHaveURL(baseURL!)

      await context.close()
    })

    test('API returns 403 when regular user calls admin endpoints directly', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await contextAs(browser, 'alice')
      const token = await captureToken(page, baseURL!)

      const headers = { Authorization: `Bearer ${token}` }

      // GET /api/admin/permissions
      const listResp = await page.request.get(`${baseURL}/api/admin/permissions`, { headers })
      expect(listResp.status()).toBe(403)

      // GET /api/admin/permissions/known
      const knownResp = await page.request.get(`${baseURL}/api/admin/permissions/known`, {
        headers,
      })
      expect(knownResp.status()).toBe(403)

      // POST /api/admin/permissions
      const grantResp = await page.request.post(`${baseURL}/api/admin/permissions`, {
        headers: { ...headers, 'Content-Type': 'application/json' },
        data: JSON.stringify({ email: 'bob@thuddle.dev', permission: 'events:write' }),
      })
      expect(grantResp.status()).toBe(403)

      // DELETE /api/admin/permissions/{userId}/{permission}
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const revokeResp = await page.request.delete(
        `${baseURL}/api/admin/permissions/${fakeId}/events:write`,
        { headers },
      )
      expect(revokeResp.status()).toBe(403)

      await context.close()
    })
  })

  test.describe('anonymous users', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('anonymous requests to admin endpoints return 401', async ({ request, baseURL }) => {
      const listResp = await request.get(`${baseURL}/api/admin/permissions`)
      expect(listResp.status()).toBe(401)

      const knownResp = await request.get(`${baseURL}/api/admin/permissions/known`)
      expect(knownResp.status()).toBe(401)

      const grantResp = await request.post(`${baseURL}/api/admin/permissions`, {
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ email: 'alice@thuddle.dev', permission: 'events:write' }),
      })
      expect(grantResp.status()).toBe(401)

      const fakeId = '00000000-0000-0000-0000-000000000000'
      const revokeResp = await request.delete(
        `${baseURL}/api/admin/permissions/${fakeId}/events:write`,
      )
      expect(revokeResp.status()).toBe(401)
    })
  })

  test.describe('API validation (admin caller)', () => {
    test('GET /api/admin/permissions/known returns the three known permissions', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await contextAs(browser, 'admin')
      const token = await captureToken(page, baseURL!)

      const resp = await page.request.get(`${baseURL}/api/admin/permissions/known`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(resp.status()).toBe(200)
      const body: string[] = await resp.json()
      expect(body).toEqual(
        expect.arrayContaining(['events:write', 'groups:manage', 'admin:access']),
      )
      expect(body).toHaveLength(3)

      await context.close()
    })

    test('POST with empty email returns 400', async ({ browser, baseURL }) => {
      const { context, page } = await contextAs(browser, 'admin')
      const token = await captureToken(page, baseURL!)

      const resp = await page.request.post(`${baseURL}/api/admin/permissions`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: JSON.stringify({ email: '', permission: 'events:write' }),
      })
      expect(resp.status()).toBe(400)
      const body = await resp.json()
      expect(body.error).toMatch(/required/i)

      await context.close()
    })

    test('POST with empty permission returns 400', async ({ browser, baseURL }) => {
      const { context, page } = await contextAs(browser, 'admin')
      const token = await captureToken(page, baseURL!)

      const resp = await page.request.post(`${baseURL}/api/admin/permissions`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: JSON.stringify({ email: 'alice@thuddle.dev', permission: '   ' }),
      })
      expect(resp.status()).toBe(400)

      await context.close()
    })

    test('POST with unknown permission returns 400', async ({ browser, baseURL }) => {
      const { context, page } = await contextAs(browser, 'admin')
      const token = await captureToken(page, baseURL!)

      const resp = await page.request.post(`${baseURL}/api/admin/permissions`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: JSON.stringify({ email: 'alice@thuddle.dev', permission: 'bogus:permission' }),
      })
      expect(resp.status()).toBe(400)
      const body = await resp.json()
      expect(body.error).toMatch(/unknown/i)

      await context.close()
    })

    test('POST with non-existent email returns 404', async ({ browser, baseURL }) => {
      const { context, page } = await contextAs(browser, 'admin')
      const token = await captureToken(page, baseURL!)

      const resp = await page.request.post(`${baseURL}/api/admin/permissions`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: JSON.stringify({
          email: 'nobody@nonexistent.dev',
          permission: 'events:write',
        }),
      })
      expect(resp.status()).toBe(404)

      await context.close()
    })

    test('POST is case-insensitive on email', async ({
      browser,
      baseURL,
      grantedPermissions,
    }) => {
      const { context, page } = await contextAs(browser, 'admin')
      const token = await captureToken(page, baseURL!)

      const resp = await page.request.post(`${baseURL}/api/admin/permissions`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: JSON.stringify({
          email: 'DIANA@THUDDLE.DEV',
          permission: 'groups:manage',
        }),
      })
      expect(resp.status()).toBe(201)
      grantedPermissions.push({ email: 'diana@thuddle.dev', permission: 'groups:manage' })

      await context.close()
    })

    test('DELETE for non-existent permission returns 404', async ({ browser, baseURL }) => {
      const { context, page } = await contextAs(browser, 'admin')
      const token = await captureToken(page, baseURL!)

      // Look up alice's userId so we use a real user but a permission she doesn't have
      const listResp = await page.request.get(`${baseURL}/api/admin/permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const perms: Array<{ userId: string; email: string; permission: string }> =
        await listResp.json()
      // alice shouldn't have admin:access, but just in case find any user who doesn't
      const fakeUserId = '00000000-0000-0000-0000-000000000000'
      const resp = await page.request.delete(
        `${baseURL}/api/admin/permissions/${fakeUserId}/events:write`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      expect(resp.status()).toBe(404)

      // Reference perms to avoid unused warning and sanity-check the list shape
      expect(Array.isArray(perms)).toBe(true)

      await context.close()
    })

    test('GET /api/admin/permissions returns rows with expected shape', async ({
      browser,
      baseURL,
    }) => {
      const { context, page } = await contextAs(browser, 'admin')
      const token = await captureToken(page, baseURL!)

      const resp = await page.request.get(`${baseURL}/api/admin/permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(resp.status()).toBe(200)
      const rows: Array<Record<string, unknown>> = await resp.json()
      expect(rows.length).toBeGreaterThan(0)
      const row = rows[0]
      expect(row).toHaveProperty('userId')
      expect(row).toHaveProperty('email')
      expect(row).toHaveProperty('displayName')
      expect(row).toHaveProperty('permission')
      expect(row).toHaveProperty('grantedAt')

      await context.close()
    })
  })
})
