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

test.describe('Invite users', () => {
  test.describe('positive', () => {
    test('admin can invite a user by email', async ({ browser, baseURL }) => {
      const { manageUrl } = await createInviteOnlyEvent(browser, baseURL!)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      // Fill an email address
      await page.getByTestId('manage-invite-email-input').fill('alice@thuddle.dev')

      // Wait for user-exists check
      await expect(page.getByTestId('manage-invite-user-exists')).toBeVisible({ timeout: 10000 })

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

      // Fill first email
      await page.getByTestId('manage-invite-email-input').first().fill('alice@thuddle.dev')

      // Add another row
      await page.getByTestId('manage-invite-add-btn').click()

      // Fill second email
      await page.getByTestId('manage-invite-email-input').last().fill('bob@thuddle.dev')

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
      await adminPage.getByTestId('manage-invite-email-input').fill('alice@thuddle.dev')
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
      await adminPage.getByTestId('manage-invite-email-input').fill('alice@thuddle.dev')
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

    test('email lookup shows "User exists" for known user', async ({ browser, baseURL }) => {
      const { manageUrl } = await createPublicEvent(browser, baseURL!)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      await page.getByTestId('manage-invite-email-input').fill('alice@thuddle.dev')
      await expect(page.getByTestId('manage-invite-user-exists')).toBeVisible({ timeout: 10000 })

      await context.close()
    })

    test('email lookup shows "No user" for unknown email', async ({ browser, baseURL }) => {
      const { manageUrl } = await createPublicEvent(browser, baseURL!)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      await page.getByTestId('manage-invite-email-input').fill(`unknown-${uid()}@example.com`)
      await expect(page.getByTestId('manage-invite-no-user')).toBeVisible({ timeout: 10000 })

      await context.close()
    })
  })

  test.describe('negative', () => {
    test('send button is disabled when email is empty', async ({ browser, baseURL }) => {
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
