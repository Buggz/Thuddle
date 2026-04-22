import { test, expect } from '../helpers/fixtures'
import { uid, futureDates, contextAs } from '../helpers/auth'
import { adminApi, createEventApi, userApi } from '../helpers/auction'

/**
 * Helper: admin creates a public, open-join event.
 */
async function createPublicEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventId: string; eventUrl: string }> {
  const api = await adminApi(browser, baseURL)
  const { id } = await createEventApi(api, { title: `Leave ${uid()}` })
  await api.close()
  return { eventId: id, eventUrl: `${baseURL}/events/${id}` }
}

/**
 * Helper: admin creates an invite-only event and returns URLs + id.
 */
async function createInviteOnlyEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventId: string; eventUrl: string }> {
  const { context, page } = await contextAs(browser, 'admin')
  const title = `InvLeave ${uid()}`

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Private Venue')

  const dates = futureDates(5)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)
  await page.getByTestId('event-joinmode-select').selectOption('1') // InviteOnly

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await responsePromise
  const body = await resp.json()

  await context.close()
  return { eventId: body.id, eventUrl: `${baseURL}/events/${body.id}` }
}

/**
 * Helper: admin invites a user via API.
 */
async function inviteUserApi(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  eventId: string,
  email: string,
): Promise<void> {
  const api = await adminApi(browser, baseURL)
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/invitations`, {
    headers: api.headers,
    data: JSON.stringify({ emails: [email] }),
  })
  if (!resp.ok()) throw new Error(`Invite failed: ${resp.status()} ${await resp.text()}`)
  await api.close()
}

test.describe('Leave event', () => {
  test('open event: leave then rejoin', async ({ browser, baseURL, createdEvents }) => {
    const { eventId, eventUrl } = await createPublicEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Alice joins via UI
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Alice leaves
    await alicePage.getByTestId('event-leave-btn').click()
    await alicePage.getByTestId('confirm-dialog-confirm').click()

    // Assert join button reappears and joined badge disappears
    await expect(alicePage.getByTestId('event-joined-badge')).toHaveCount(0, { timeout: 10000 })
    await expect(alicePage.getByTestId('event-join-btn')).toBeVisible()

    // Alice rejoins
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    await aliceCtx.close()
  })

  test('invite-only event: leave preserves invitation', async ({ browser, baseURL, createdEvents }) => {
    const { eventId, eventUrl } = await createInviteOnlyEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Admin invites alice
    await inviteUserApi(browser, baseURL!, eventId, 'alice@thuddle.dev')

    // Alice joins via UI
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Alice leaves
    await alicePage.getByTestId('event-leave-btn').click()
    await alicePage.getByTestId('confirm-dialog-confirm').click()

    // Assert join button reappears (NOT invite-only message, proving invitation is intact)
    await expect(alicePage.getByTestId('event-joined-badge')).toHaveCount(0, { timeout: 10000 })
    await expect(alicePage.getByTestId('event-join-btn')).toBeVisible()
    await expect(alicePage.getByTestId('event-invite-only-msg')).toHaveCount(0)

    // Alice rejoins
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    await aliceCtx.close()
  })

  test('owner cannot leave', async ({ browser, baseURL, createdEvents }) => {
    const { eventId, eventUrl } = await createPublicEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Admin (owner) navigates to their own event page
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await adminPage.goto(eventUrl)
    await adminPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    // Verify leave button is absent (owner is not in EventParticipants)
    await expect(adminPage.getByTestId('event-leave-btn')).toHaveCount(0)
    await expect(adminPage.getByTestId('event-leave-btn-disabled')).toHaveCount(0)

    await adminCtx.close()
  })
})
