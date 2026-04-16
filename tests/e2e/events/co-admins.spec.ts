import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates, contextAs } from '../helpers/auth'

/**
 * Admin creates a public open event and returns its URLs + id.
 */
async function createEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventId: string; eventUrl: string; manageUrl: string }> {
  const title = `CoAdmin ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Co-Admin Venue')

  const dates = futureDates(5)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await responsePromise
  const body = await resp.json()

  await context.close()
  return {
    eventId: body.id,
    eventUrl: `${baseURL}/events/${body.id}`,
    manageUrl: `${baseURL}/events/${body.id}/manage`,
  }
}

/** Navigate to the manage page co-admins tab. */
async function goToCoAdminsTab(page: import('@playwright/test').Page, manageUrl: string) {
  await page.goto(manageUrl)
  await page.getByTestId('manage-tab-coadmins').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('manage-tab-coadmins').click()
}

/** Search for a user in the co-admin combobox and select them. */
async function searchAndSelectCoAdmin(
  page: import('@playwright/test').Page,
  query: string,
  resultText: string,
) {
  const combobox = page.getByTestId('user-search-combobox').first()
  const input = combobox.getByTestId('user-search-input')
  await input.fill(query)
  await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
  await combobox.getByTestId('user-search-result').filter({ hasText: resultText }).click()
}

test.describe('Co-admins', () => {
  test.describe('positive', () => {
    test('owner can add a co-admin', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToCoAdminsTab(page, manageUrl)

      // Initially empty
      await expect(page.getByTestId('manage-coadmin-empty')).toBeVisible()

      // Search for alice and add her
      const addResp = page.waitForResponse(
        (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
      )
      await searchAndSelectCoAdmin(page, 'alice', 'alice@thuddle.dev')
      const resp = await addResp
      expect(resp.status()).toBe(200)

      // Alice appears in the list
      await expect(page.getByTestId('manage-coadmin-row')).toBeVisible()
      await expect(page.getByTestId('manage-coadmin-row')).toContainText('alice@thuddle.dev')

      // Empty state is gone
      await expect(page.getByTestId('manage-coadmin-empty')).not.toBeVisible()

      await context.close()
    })

    test('owner can remove a co-admin', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToCoAdminsTab(page, manageUrl)

      // Add alice first
      const addResp = page.waitForResponse(
        (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
      )
      await searchAndSelectCoAdmin(page, 'alice', 'alice@thuddle.dev')
      await addResp

      await expect(page.getByTestId('manage-coadmin-row')).toBeVisible()

      // Remove alice
      const removeResp = page.waitForResponse(
        (r) => r.url().includes('/co-admins/') && r.request().method() === 'DELETE',
      )
      await page.getByTestId('manage-coadmin-remove-btn').click()
      const resp = await removeResp
      expect(resp.status()).toBe(200)

      // List is empty again
      await expect(page.getByTestId('manage-coadmin-empty')).toBeVisible()

      await context.close()
    })

    test('owner can add multiple co-admins', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToCoAdminsTab(page, manageUrl)

      // Add alice
      const addAlice = page.waitForResponse(
        (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
      )
      await searchAndSelectCoAdmin(page, 'alice', 'alice@thuddle.dev')
      await addAlice

      // Add bob
      const addBob = page.waitForResponse(
        (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
      )
      await searchAndSelectCoAdmin(page, 'bob', 'bob@thuddle.dev')
      await addBob

      // Both appear
      await expect(page.getByTestId('manage-coadmin-row')).toHaveCount(2)

      await context.close()
    })

    test('co-admin sees Manage Event link on event page', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Owner adds alice as co-admin
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToCoAdminsTab(adminPage, manageUrl)
      const addResp = adminPage.waitForResponse(
        (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
      )
      await searchAndSelectCoAdmin(adminPage, 'alice', 'alice@thuddle.dev')
      await addResp
      await adminCtx.close()

      // Alice opens the event and sees the Manage link
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await expect(alicePage.getByTestId('event-manage-link')).toBeVisible()

      await aliceCtx.close()
    })

    test('co-admin can access manage page', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Owner adds alice as co-admin
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToCoAdminsTab(adminPage, manageUrl)
      const addResp = adminPage.waitForResponse(
        (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
      )
      await searchAndSelectCoAdmin(adminPage, 'alice', 'alice@thuddle.dev')
      await addResp
      await adminCtx.close()

      // Alice can navigate to the manage page
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(manageUrl)
      await alicePage.getByTestId('manage-tab-about').waitFor({ state: 'visible', timeout: 20000 })

      // She can see the form
      await alicePage.getByTestId('manage-tab-about').click()
      await expect(alicePage.getByTestId('manage-title-input')).toBeVisible()

      await aliceCtx.close()
    })

    test('co-admin persists after page reload', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToCoAdminsTab(page, manageUrl)

      // Add alice
      const addResp = page.waitForResponse(
        (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
      )
      await searchAndSelectCoAdmin(page, 'alice', 'alice@thuddle.dev')
      await addResp
      await expect(page.getByTestId('manage-coadmin-row')).toBeVisible()

      // Reload and verify
      await page.reload()
      await goToCoAdminsTab(page, manageUrl)
      await expect(page.getByTestId('manage-coadmin-row')).toBeVisible()
      await expect(page.getByTestId('manage-coadmin-row')).toContainText('alice@thuddle.dev')

      await context.close()
    })

    test('already-added co-admin is excluded from search results', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToCoAdminsTab(page, manageUrl)

      // Add alice
      const addResp = page.waitForResponse(
        (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
      )
      await searchAndSelectCoAdmin(page, 'alice', 'alice@thuddle.dev')
      await addResp

      // Search for alice again — she should not appear in results
      const combobox = page.getByTestId('user-search-combobox').first()
      const input = combobox.getByTestId('user-search-input')
      await input.fill('alice')
      await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })

      await expect(
        combobox.getByTestId('user-search-result').filter({ hasText: 'alice@thuddle.dev' }),
      ).not.toBeVisible()

      await context.close()
    })
  })

  test.describe('negative', () => {
    test('cannot add unknown email as co-admin', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToCoAdminsTab(page, manageUrl)

      // Type an unknown email — the "invite unknown" option should NOT appear
      const combobox = page.getByTestId('user-search-combobox').first()
      const input = combobox.getByTestId('user-search-input')
      await input.fill('nobody@example.com')
      await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })

      await expect(combobox.getByTestId('user-search-invite-option')).not.toBeVisible()

      // No co-admin was added
      await expect(page.getByTestId('manage-coadmin-empty')).toBeVisible()

      await context.close()
    })

    test('non-owner cannot access manage page', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Bob (not a co-admin) tries to go to manage page
      const { context, page } = await contextAs(browser, 'bob')
      await page.goto(manageUrl)

      // Should not see the manage tabs (redirected or error shown)
      await expect(page.getByTestId('manage-tab-about')).not.toBeVisible({ timeout: 10000 })

      await context.close()
    })

    test('non-owner does not see Manage Event link', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Bob views the event
      const { context, page } = await contextAs(browser, 'bob')
      await page.goto(eventUrl)
      await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

      await expect(page.getByTestId('event-manage-link')).not.toBeVisible()

      await context.close()
    })

    test('removed co-admin loses Manage Event link', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Owner adds alice as co-admin
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToCoAdminsTab(adminPage, manageUrl)
      const addResp = adminPage.waitForResponse(
        (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
      )
      await searchAndSelectCoAdmin(adminPage, 'alice', 'alice@thuddle.dev')
      await addResp

      // Owner removes alice
      const removeResp = adminPage.waitForResponse(
        (r) => r.url().includes('/co-admins/') && r.request().method() === 'DELETE',
      )
      await adminPage.getByTestId('manage-coadmin-remove-btn').click()
      await removeResp
      await adminCtx.close()

      // Alice no longer sees the manage link
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

      await expect(alicePage.getByTestId('event-manage-link')).not.toBeVisible()

      await aliceCtx.close()
    })

    test('anonymous user cannot access manage page', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const page = await context.newPage()
      await page.goto(manageUrl)

      // Should be redirected to login or see no manage UI
      await expect(page.getByTestId('manage-tab-about')).not.toBeVisible({ timeout: 10000 })

      await context.close()
    })
  })
})
