import type { Browser, Page } from '@playwright/test'
import { test, expect } from '../helpers/fixtures'
import { uid, futureDates, contextAs, STORAGE_STATE } from '../helpers/auth'

/** Open a page authenticated as `user` and capture a bearer token from a real API call. */
async function openWithBearerToken(
  browser: Browser,
  user: keyof typeof STORAGE_STATE,
  baseURL: string,
): Promise<{ context: import('@playwright/test').BrowserContext; page: Page; token: string }> {
  const context = await browser.newContext({ storageState: STORAGE_STATE[user] })
  const page = await context.newPage()
  let token = ''
  page.on('request', (req) => {
    const auth = req.headers()['authorization']
    if (auth?.startsWith('Bearer ')) token = auth.substring(7)
  })
  await page.goto(baseURL)
  await page.waitForResponse((r) => r.url().includes('/api/events') && r.status() === 200)
  return { context, page, token }
}

/** Admin creates an invite-only event and returns its URLs + id. */
async function createInviteOnlyEvent(
  browser: Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string; manageUrl: string }> {
  const title = `Rescind ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Private Venue')

  const dates = futureDates(5)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)
  await page.getByTestId('event-joinmode-select').selectOption('1')

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await responsePromise
  const body = await resp.json()

  await context.close()
  return {
    eventUrl: `${baseURL}/events/${body.id}`,
    eventId: body.id,
    manageUrl: `${baseURL}/events/${body.id}/manage`,
  }
}

/** Navigate to the manage page attendees tab. */
async function goToAttendeesTab(page: Page, manageUrl: string) {
  await page.goto(manageUrl)
  await page.getByTestId('manage-tab-attendees').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('manage-tab-attendees').click()
}

/** Invite a known user via the user-search combobox and click send. */
async function inviteKnownUser(page: Page, query: string, resultText: string) {
  const combobox = page.getByTestId('user-search-combobox').first()
  const input = combobox.getByTestId('user-search-input')
  await input.fill(query)
  await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
  await combobox.getByTestId('user-search-result').filter({ hasText: resultText }).click()

  const inviteResp = page.waitForResponse(
    (r) => r.url().includes('/invitations') && r.request().method() === 'POST',
  )
  await page.getByTestId('manage-invite-send-btn').click()
  await inviteResp
  await expect(page.getByTestId('manage-pending-invitation')).toHaveCount(1)
}

/** Invite an unknown email via the combobox and click send. */
async function inviteUnknownEmail(page: Page, email: string) {
  const combobox = page.getByTestId('user-search-combobox').first()
  const input = combobox.getByTestId('user-search-input')
  await input.fill(email)
  await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
  await combobox.getByTestId('user-search-invite-option').click()

  const inviteResp = page.waitForResponse(
    (r) => r.url().includes('/invitations') && r.request().method() === 'POST',
  )
  await page.getByTestId('manage-invite-send-btn').click()
  await inviteResp
  await expect(page.getByTestId('manage-pending-invitation')).toHaveCount(1)
}

test.describe('Rescind invitation', () => {
  test.describe('positive', () => {
    test('admin can rescind a pending invitation', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventId } = await createInviteOnlyEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      await inviteKnownUser(page, 'alice', 'alice@thuddle.dev')

      // Auto-accept the confirmation dialog
      page.on('dialog', (d) => d.accept())

      const rescindResp = page.waitForResponse(
        (r) => r.url().includes('/invitations') && r.request().method() === 'DELETE',
      )
      await page.getByTestId('manage-rescind-invitation-btn-alice@thuddle.dev').click()
      const resp = await rescindResp
      expect(resp.status()).toBe(200)

      // Pending row disappears
      await expect(page.getByTestId('manage-pending-invitation')).toHaveCount(0)

      await context.close()
    })

    test('admin can rescind invitation for an unknown email', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventId } = await createInviteOnlyEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      const email = `unknown-${uid()}@example.com`
      await inviteUnknownEmail(page, email)

      page.on('dialog', (d) => d.accept())

      const rescindResp = page.waitForResponse(
        (r) => r.url().includes('/invitations') && r.request().method() === 'DELETE',
      )
      await page.getByTestId(`manage-rescind-invitation-btn-${email}`).click()
      const resp = await rescindResp
      expect(resp.status()).toBe(200)

      await expect(page.getByTestId('manage-pending-invitation')).toHaveCount(0)

      await context.close()
    })

    test('rescinded user can no longer join invite-only event', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventUrl, eventId } = await createInviteOnlyEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Admin invites alice
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToAttendeesTab(adminPage, manageUrl)
      await inviteKnownUser(adminPage, 'alice', 'alice@thuddle.dev')

      // Admin rescinds the invitation
      adminPage.on('dialog', (d) => d.accept())
      const rescindResp = adminPage.waitForResponse(
        (r) => r.url().includes('/invitations') && r.request().method() === 'DELETE',
      )
      await adminPage.getByTestId('manage-rescind-invitation-btn-alice@thuddle.dev').click()
      await rescindResp
      await expect(adminPage.getByTestId('manage-pending-invitation')).toHaveCount(0)
      await adminCtx.close()

      // Alice now visits the event — should see invite-only block (no join button)
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await expect(alicePage.getByTestId('event-invite-only-msg')).toBeVisible({ timeout: 20000 })
      await expect(alicePage.getByTestId('event-join-btn')).toHaveCount(0)
      await aliceCtx.close()
    })

    test('co-admin can rescind a pending invitation', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventId } = await createInviteOnlyEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Admin promotes alice to co-admin and invites bob
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToAttendeesTab(adminPage, manageUrl)
      await inviteKnownUser(adminPage, 'bob', 'bob@thuddle.dev')

      // Add alice as co-admin via the co-admins tab — selecting from the
      // combobox triggers the add immediately (no separate add button).
      await adminPage.getByTestId('manage-tab-coadmins').click()
      const coadminCombobox = adminPage.getByTestId('user-search-combobox').first()
      await coadminCombobox.getByTestId('user-search-input').fill('alice')
      await coadminCombobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
      const addResp = adminPage.waitForResponse(
        (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
      )
      await coadminCombobox.getByTestId('user-search-result').filter({ hasText: 'alice@thuddle.dev' }).click()
      await addResp
      await expect(adminPage.getByTestId('manage-coadmin-row')).toHaveCount(1)
      await adminCtx.close()

      // Alice (co-admin) rescinds bob's invitation
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await goToAttendeesTab(alicePage, manageUrl)
      await expect(alicePage.getByTestId('manage-pending-invitation')).toHaveCount(1)

      alicePage.on('dialog', (d) => d.accept())
      const rescindResp = alicePage.waitForResponse(
        (r) => r.url().includes('/invitations') && r.request().method() === 'DELETE',
      )
      await alicePage.getByTestId('manage-rescind-invitation-btn-bob@thuddle.dev').click()
      const resp = await rescindResp
      expect(resp.status()).toBe(200)

      await expect(alicePage.getByTestId('manage-pending-invitation')).toHaveCount(0)
      await aliceCtx.close()
    })

    test('cancelling the confirmation dialog leaves invitation intact', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventId } = await createInviteOnlyEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      await inviteKnownUser(page, 'alice', 'alice@thuddle.dev')

      // Dismiss the confirmation dialog
      page.on('dialog', (d) => d.dismiss())

      // No DELETE request should fire — race against a short timeout
      let deleteFired = false
      page.on('response', (r) => {
        if (r.url().includes('/invitations') && r.request().method() === 'DELETE') {
          deleteFired = true
        }
      })

      await page.getByTestId('manage-rescind-invitation-btn-alice@thuddle.dev').click()
      await page.waitForTimeout(500)

      expect(deleteFired).toBe(false)
      await expect(page.getByTestId('manage-pending-invitation')).toHaveCount(1)

      await context.close()
    })
  })

  test.describe('negative', () => {
    test('non-admin user cannot rescind invitation via API', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventId } = await createInviteOnlyEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Admin invites bob
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToAttendeesTab(adminPage, manageUrl)
      await inviteKnownUser(adminPage, 'bob', 'bob@thuddle.dev')
      await adminCtx.close()

      // Charlie (no role on the event) tries to rescind via API directly
      const { context: charlieCtx, page: charliePage, token: charlieToken } =
        await openWithBearerToken(browser, 'charlie', baseURL!)
      const resp = await charliePage.request.delete(
        `${baseURL}/api/events/${eventId}/invitations?email=${encodeURIComponent('bob@thuddle.dev')}`,
        { headers: { Authorization: `Bearer ${charlieToken}` } },
      )
      expect([401, 403]).toContain(resp.status())
      await charlieCtx.close()

      // Confirm invitation is still there
      const { context: adminCtx2, page: adminPage2 } = await contextAs(browser, 'admin')
      await goToAttendeesTab(adminPage2, manageUrl)
      await expect(adminPage2.getByTestId('manage-pending-invitation')).toHaveCount(1)
      await adminCtx2.close()
    })

    test('rescinding a non-existent invitation returns 404', async ({ browser, baseURL, createdEvents }) => {
      const { eventId } = await createInviteOnlyEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page, token } = await openWithBearerToken(browser, 'admin', baseURL!)
      const email = `nobody-${uid()}@example.com`
      const resp = await page.request.delete(
        `${baseURL}/api/events/${eventId}/invitations?email=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      expect(resp.status()).toBe(404)
      await context.close()
    })
  })
})
