import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates, contextAs } from '../helpers/auth'
import type { Browser, Page } from '@playwright/test'

/**
 * Open a user context and navigate to `url`, waiting for the SignalR hub
 * negotiate response (set up BEFORE navigation to avoid races) and the
 * event-detail to be visible so SSO has completed.
 */
async function openWithRealtime(
  browser: Browser,
  user: Parameters<typeof contextAs>[1],
  url: string,
): Promise<{ context: Awaited<ReturnType<typeof contextAs>>['context']; page: Page }> {
  const { context, page } = await contextAs(browser, user)
  // Register the listener BEFORE goto so the negotiate response isn't missed.
  const negotiatePromise = page
    .waitForResponse(
      (r) => r.url().includes('/hubs/thuddle') && r.status() < 400,
      { timeout: 20000 },
    )
    .catch(() => null)
  await page.goto(url)
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
  await negotiatePromise
  // Small grace period for the WebSocket handshake to complete and subscriptions
  // to be established server-side.
  await page.waitForTimeout(500)
  return { context, page }
}

/** Admin creates a public open event and returns its URL + id. */
async function createEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string }> {
  const title = `Participants ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Participants Venue')

  const dates = futureDates(7)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await responsePromise
  const body = await resp.json()

  await context.close()
  return { eventUrl: `${baseURL}/events/${body.id}`, eventId: body.id }
}

test.describe('Participants tab', () => {
  test('shows empty state when no one has joined', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)

    const { context, page } = await contextAs(browser, 'alice')
    await page.goto(eventUrl)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    await page.getByTestId('event-tab-attendees').click()
    await expect(page.getByTestId('participants-empty')).toBeVisible()

    await context.close()
  })

  test('shows participant after user joins event', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Alice joins
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    await aliceCtx.close()

    // Bob visits the event and checks the attendees tab
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await bobPage.goto(eventUrl)
    await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    await bobPage.getByTestId('event-tab-attendees').click()

    await expect(bobPage.getByTestId('participants-list')).toBeVisible()
    const items = bobPage.getByTestId('participant-item')
    await expect(items).toHaveCount(1)

    await bobCtx.close()
  })

  test('participant count badge updates after joining', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Use openWithRealtime so alice is fully subscribed to the event group
    // before she clicks Join — otherwise she'll miss the ParticipantChanged broadcast.
    const { context, page } = await openWithRealtime(browser, 'alice', eventUrl)

    // Count should be 0 before joining
    await expect(page.getByTestId('event-tab-attendees')).toContainText('0')

    // Join
    await page.getByTestId('event-join-btn').click()
    await expect(page.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Count should now be 1
    await expect(page.getByTestId('event-tab-attendees')).toContainText('1')

    await context.close()
  })

  test('multiple participants appear in the list', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Alice joins
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    await aliceCtx.close()

    // Bob joins
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await bobPage.goto(eventUrl)
    await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await bobPage.getByTestId('event-join-btn').click()
    await expect(bobPage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    await bobCtx.close()

    // Charlie views the attendees tab
    const { context: charlieCtx, page: charliePage } = await contextAs(browser, 'charlie')
    await charliePage.goto(eventUrl)
    await charliePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    await charliePage.getByTestId('event-tab-attendees').click()

    await expect(charliePage.getByTestId('participants-list')).toBeVisible()
    await expect(charliePage.getByTestId('participant-item')).toHaveCount(2)

    await charlieCtx.close()
  })

  test('anonymous user can view participants on public event', async ({ page, baseURL, createdEvents }) => {
    // Need an event with a participant — use admin context for setup, then anonymous page
    const browser = page.context().browser()!
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Alice joins
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    await aliceCtx.close()

    // Anonymous user views the event
    const anonContext = await browser.newContext()
    const anonPage = await anonContext.newPage()
    await anonPage.goto(eventUrl)
    await anonPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    await anonPage.getByTestId('event-tab-attendees').click()
    await expect(anonPage.getByTestId('participants-list')).toBeVisible()
    await expect(anonPage.getByTestId('participant-item')).toHaveCount(1)

    await anonContext.close()
  })
})

/**
 * Sets up an event with owner (admin), co-host (alice), and regular attendee (charlie),
 * all joined as participants. Returns the event URL and ID.
 */
async function createEventWithRoles(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string }> {
  const { eventUrl, eventId } = await createEvent(browser, baseURL)

  // Owner (admin) joins the event
  const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
  await adminPage.goto(eventUrl)
  await adminPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
  await adminPage.getByTestId('event-join-btn').click()
  await expect(adminPage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

  // Promote alice to co-admin via manage page
  const manageUrl = `${eventUrl}/manage`
  await adminPage.goto(manageUrl)
  await adminPage.getByTestId('manage-tab-coadmins').waitFor({ state: 'visible', timeout: 20000 })
  await adminPage.getByTestId('manage-tab-coadmins').click()
  const addResp = adminPage.waitForResponse(
    (r) => r.url().includes('/co-admins') && r.request().method() === 'POST',
  )
  const combobox = adminPage.getByTestId('user-search-combobox').first()
  await combobox.getByTestId('user-search-input').fill('alice')
  await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
  await combobox.getByTestId('user-search-result').filter({ hasText: 'alice@thuddle.dev' }).click()
  await addResp
  await adminCtx.close()

  // Alice (co-host) joins
  const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
  await alicePage.goto(eventUrl)
  await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
  await alicePage.getByTestId('event-join-btn').click()
  await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
  await aliceCtx.close()

  // Charlie (regular attendee) joins
  const { context: charlieCtx, page: charliePage } = await contextAs(browser, 'charlie')
  await charliePage.goto(eventUrl)
  await charliePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
  await charliePage.getByTestId('event-join-btn').click()
  await expect(charliePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
  await charlieCtx.close()

  return { eventUrl, eventId }
}

test.describe('Participant role badges', () => {
  test('owner and co-host badges render correctly, regular attendee has none', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const { eventUrl, eventId } = await createEventWithRoles(browser, baseURL!)
    createdEvents.push(eventId)

    // Bob (uninvolved observer) views the attendees tab
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await bobPage.goto(eventUrl)
    await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await bobPage.getByTestId('event-tab-attendees').click()
    await expect(bobPage.getByTestId('participants-list')).toBeVisible()
    await expect(bobPage.getByTestId('participant-item')).toHaveCount(3)

    // Exactly one Owner badge with correct text
    const ownerBadge = bobPage.getByTestId('participant-role-owner')
    await expect(ownerBadge).toHaveCount(1)
    await expect(ownerBadge).toBeVisible()
    await expect(ownerBadge).toHaveText('Owner')

    // Exactly one Co-host badge with correct text
    const cohostBadge = bobPage.getByTestId('participant-role-co-host')
    await expect(cohostBadge).toHaveCount(1)
    await expect(cohostBadge).toBeVisible()
    await expect(cohostBadge).toHaveText('Co-host')

    // Charlie's row has no role badge at all
    const charlieRow = bobPage.getByTestId('participant-item').filter({ hasText: 'Charlie' })
    await expect(charlieRow).toBeVisible()
    await expect(charlieRow.locator('[data-testid^="participant-role-"]')).toHaveCount(0)

    await bobCtx.close()
  })

  test('no participant row displays the old "Attendee" subtitle', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const { eventUrl, eventId } = await createEventWithRoles(browser, baseURL!)
    createdEvents.push(eventId)

    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await bobPage.goto(eventUrl)
    await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await bobPage.getByTestId('event-tab-attendees').click()
    await expect(bobPage.getByTestId('participants-list')).toBeVisible()

    const rows = bobPage.getByTestId('participant-item')
    const count = await rows.count()
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).not.toContainText('Attendee', { ignoreCase: false })
    }

    await bobCtx.close()
  })
})
