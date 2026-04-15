import { test, expect } from '@playwright/test'
import { STORAGE_STATE, uid, futureDates, contextAs } from '../helpers/auth'

/**
 * Admin creates an invite-only event and returns its URLs + id.
 */
async function createInviteOnlyEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string; manageUrl: string }> {
  const title = `Invite ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Private Venue')

  const dates = futureDates(5)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)
  await page.getByTestId('event-joinmode-select').selectOption('InviteOnly')

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

/**
 * Admin creates a public open event and returns its URLs + id.
 */
async function createPublicEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string; manageUrl: string }> {
  const title = `InvPub ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Open Venue')

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
    eventUrl: `${baseURL}/events/${body.id}`,
    eventId: body.id,
    manageUrl: `${baseURL}/events/${body.id}/manage`,
  }
}

/** Navigate to the manage page attendees tab. */
async function goToAttendeesTab(page: import('@playwright/test').Page, manageUrl: string) {
  await page.goto(manageUrl)
  await page.getByTestId('manage-tab-attendees').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('manage-tab-attendees').click()
}

/** Type into the user search combobox and pick a result from the dropdown. */
async function searchAndSelectUser(
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

/** Type into the user search combobox and pick the "invite unknown email" option. */
async function searchAndSelectUnknownEmail(
  page: import('@playwright/test').Page,
  email: string,
) {
  const combobox = page.getByTestId('user-search-combobox').first()
  const input = combobox.getByTestId('user-search-input')
  await input.fill(email)
  await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
  await combobox.getByTestId('user-search-invite-option').click()
}

test.describe('Invite users', () => {
  test.describe('positive', () => {
    test('admin can search and invite a known user', async ({ browser, baseURL }) => {
      const { manageUrl } = await createInviteOnlyEvent(browser, baseURL!)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      // Search for alice and select her
      await searchAndSelectUser(page, 'alice', 'alice@thuddle.dev')

      // Chip should appear
      await expect(page.getByTestId('manage-invite-chip')).toBeVisible()

      // Send invitation
      const inviteResp = page.waitForResponse(
        (r) => r.url().includes('/invitations') && r.request().method() === 'POST',
      )
      await page.getByTestId('manage-invite-send-btn').click()
      await inviteResp

      // Success message
      await expect(page.getByTestId('manage-invite-success')).toBeVisible({ timeout: 5000 })

      // Pending invitation appears in the table
      await expect(page.getByTestId('manage-pending-invitation')).toBeVisible()

      await context.close()
    })

    test('admin can invite multiple users at once', async ({ browser, baseURL }) => {
      const { manageUrl } = await createInviteOnlyEvent(browser, baseURL!)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      // Search and select alice
      await searchAndSelectUser(page, 'alice', 'alice@thuddle.dev')

      // Search and select bob
      await searchAndSelectUser(page, 'bob', 'bob@thuddle.dev')

      // Both chips visible
      await expect(page.getByTestId('manage-invite-chip')).toHaveCount(2)

      // Send invitations
      const inviteResp = page.waitForResponse(
        (r) => r.url().includes('/invitations') && r.request().method() === 'POST',
      )
      await page.getByTestId('manage-invite-send-btn').click()
      await inviteResp

      await expect(page.getByTestId('manage-invite-success')).toBeVisible({ timeout: 5000 })

      // Both pending invitations should appear
      await expect(page.getByTestId('manage-pending-invitation')).toHaveCount(2)

      await context.close()
    })

    test('invited user can join invite-only event', async ({ browser, baseURL }) => {
      const { manageUrl, eventUrl } = await createInviteOnlyEvent(browser, baseURL!)

      // Admin invites alice
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToAttendeesTab(adminPage, manageUrl)
      await searchAndSelectUser(adminPage, 'alice', 'alice@thuddle.dev')
      const inviteResp = adminPage.waitForResponse(
        (r) => r.url().includes('/invitations') && r.request().method() === 'POST',
      )
      await adminPage.getByTestId('manage-invite-send-btn').click()
      await inviteResp
      await adminCtx.close()

      // Alice navigates to event and can join
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await alicePage.getByTestId('event-join-btn').waitFor({ state: 'visible', timeout: 20000 })
      await alicePage.getByTestId('event-join-btn').click()
      await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

      await aliceCtx.close()
    })

    test('invited user appears as attendee after joining', async ({ browser, baseURL }) => {
      const { manageUrl, eventUrl } = await createInviteOnlyEvent(browser, baseURL!)

      // Admin invites alice
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToAttendeesTab(adminPage, manageUrl)
      await searchAndSelectUser(adminPage, 'alice', 'alice@thuddle.dev')
      const inviteResp = adminPage.waitForResponse(
        (r) => r.url().includes('/invitations') && r.request().method() === 'POST',
      )
      await adminPage.getByTestId('manage-invite-send-btn').click()
      await inviteResp
      await adminCtx.close()

      // Alice joins
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await alicePage.getByTestId('event-join-btn').waitFor({ state: 'visible', timeout: 20000 })
      await alicePage.getByTestId('event-join-btn').click()
      await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
      await aliceCtx.close()

      // Admin checks attendees list — alice is shown, no pending invitation
      const { context: adminCtx2, page: adminPage2 } = await contextAs(browser, 'admin')
      await goToAttendeesTab(adminPage2, manageUrl)
      await expect(adminPage2.getByTestId('manage-attendee-row')).toBeVisible({ timeout: 10000 })
      await expect(adminPage2.getByTestId('manage-attendee-row')).toContainText('alice@thuddle.dev')
      // Pending invitation for alice should be gone (she joined)
      await expect(adminPage2.getByTestId('manage-pending-invitation')).toHaveCount(0)

      await adminCtx2.close()
    })

    test('search shows matching users in dropdown', async ({ browser, baseURL }) => {
      const { manageUrl } = await createPublicEvent(browser, baseURL!)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      const combobox = page.getByTestId('user-search-combobox').first()
      await combobox.getByTestId('user-search-input').fill('alice')
      await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
      await expect(combobox.getByTestId('user-search-result')).toBeVisible()
      await expect(combobox.getByTestId('user-search-result').first()).toContainText('alice@thuddle.dev')

      await context.close()
    })

    test('typing unknown email shows invite option', async ({ browser, baseURL }) => {
      const { manageUrl } = await createPublicEvent(browser, baseURL!)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      const unknownEmail = `unknown-${uid()}@example.com`
      const combobox = page.getByTestId('user-search-combobox').first()
      await combobox.getByTestId('user-search-input').fill(unknownEmail)
      await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
      await expect(combobox.getByTestId('user-search-invite-option')).toBeVisible()
      await expect(combobox.getByTestId('user-search-invite-option')).toContainText(unknownEmail)

      await context.close()
    })

    test('admin can invite unknown email', async ({ browser, baseURL }) => {
      const { manageUrl } = await createPublicEvent(browser, baseURL!)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      const unknownEmail = `unknown-${uid()}@example.com`
      await searchAndSelectUnknownEmail(page, unknownEmail)

      // Chip appears
      await expect(page.getByTestId('manage-invite-chip')).toBeVisible()
      await expect(page.getByTestId('manage-invite-chip')).toContainText(unknownEmail)

      // Send invitation
      const inviteResp = page.waitForResponse(
        (r) => r.url().includes('/invitations') && r.request().method() === 'POST',
      )
      await page.getByTestId('manage-invite-send-btn').click()
      await inviteResp

      await expect(page.getByTestId('manage-invite-success')).toBeVisible({ timeout: 5000 })
      await expect(page.getByTestId('manage-pending-invitation')).toBeVisible()

      await context.close()
    })
  })

  test.describe('negative', () => {
    test('send button is disabled when no users are selected', async ({ browser, baseURL }) => {
      const { manageUrl } = await createPublicEvent(browser, baseURL!)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      await expect(page.getByTestId('manage-invite-send-btn')).toBeDisabled()

      await context.close()
    })

    test('uninvited user cannot join invite-only event', async ({ browser, baseURL }) => {
      const { eventUrl } = await createInviteOnlyEvent(browser, baseURL!)

      // Bob is NOT invited — should see invite-only message
      const { context, page } = await contextAs(browser, 'bob')
      await page.goto(eventUrl)
      await expect(page.getByTestId('event-invite-only-msg')).toBeVisible({ timeout: 20000 })

      await context.close()
    })
  })
})
