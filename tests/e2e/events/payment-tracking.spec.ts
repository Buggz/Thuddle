import { test, expect } from '../helpers/fixtures'
import { uid, futureDates, contextAs } from '../helpers/auth'

/**
 * Admin creates a public event WITH a cost, returns URLs + id.
 */
async function createEventWithCost(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  cost: number = 9.99,
): Promise<{ eventId: string; eventUrl: string; manageUrl: string }> {
  const title = `Pay ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Payment Venue')

  const dates = futureDates(5)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)
  await page.getByTestId('event-cost-input').fill(cost.toString())

  const createResp = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await createResp
  const body = await resp.json()
  const eventId = body.id

  await context.close()
  return {
    eventId,
    eventUrl: `${baseURL}/events/${eventId}`,
    manageUrl: `${baseURL}/events/${eventId}/manage`,
  }
}

/**
 * Have a user join an event and return their userId from the API response.
 */
async function joinEvent(
  browser: import('@playwright/test').Browser,
  user: 'alice' | 'bob' | 'charlie',
  eventUrl: string,
): Promise<string> {
  const { context, page } = await contextAs(browser, user)
  await page.goto(eventUrl)
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

  const joinResp = page.waitForResponse(
    (r) => r.url().includes('/join') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-join-btn').click()
  const resp = await joinResp
  const body = await resp.json()
  await expect(page.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

  await context.close()
  return body.userId
}

/** Navigate to manage page attendees tab. */
async function goToAttendeesTab(page: import('@playwright/test').Page, manageUrl: string) {
  await page.goto(manageUrl)
  await page.getByTestId('manage-tab-attendees').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('manage-tab-attendees').click()
}

test.describe('Payment tracking', () => {
  test.describe('positive', () => {
    test('paid column is visible when event has a cost', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl, manageUrl } = await createEventWithCost(browser, baseURL!)
      createdEvents.push(eventId)

      // Have alice join
      await joinEvent(browser, 'alice', eventUrl)

      // Admin opens attendees tab
      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      await expect(page.getByTestId('manage-attendee-row')).toBeVisible()
      await expect(page.getByTestId('manage-payment-toggle-btn')).toBeVisible()
      // Default state is Unpaid
      await expect(page.getByTestId('manage-payment-toggle-btn')).toContainText('Unpaid')

      await context.close()
    })

    test('admin can mark attendee as paid', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl, manageUrl } = await createEventWithCost(browser, baseURL!)
      createdEvents.push(eventId)

      await joinEvent(browser, 'alice', eventUrl)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      // Click Unpaid -> Paid
      const paymentResp = page.waitForResponse(
        (r) => r.url().includes('/payment') && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-payment-toggle-btn').click()
      const resp = await paymentResp
      expect(resp.status()).toBe(200)
      const body = await resp.json()
      expect(body.hasPaid).toBe(true)

      await expect(page.getByTestId('manage-payment-toggle-btn')).toContainText('Paid')

      await context.close()
    })

    test('admin can toggle paid back to unpaid', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl, manageUrl } = await createEventWithCost(browser, baseURL!)
      createdEvents.push(eventId)

      await joinEvent(browser, 'alice', eventUrl)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      // Mark as paid
      const payResp = page.waitForResponse(
        (r) => r.url().includes('/payment') && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-payment-toggle-btn').click()
      await payResp
      await expect(page.getByTestId('manage-payment-toggle-btn')).toContainText('Paid')

      // Toggle back to unpaid
      const unpayResp = page.waitForResponse(
        (r) => r.url().includes('/payment') && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-payment-toggle-btn').click()
      const resp = await unpayResp
      expect(resp.status()).toBe(200)
      const body = await resp.json()
      expect(body.hasPaid).toBe(false)

      await expect(page.getByTestId('manage-payment-toggle-btn')).toContainText('Unpaid')

      await context.close()
    })

    test('payment status persists after page reload', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl, manageUrl } = await createEventWithCost(browser, baseURL!)
      createdEvents.push(eventId)

      await joinEvent(browser, 'alice', eventUrl)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      // Mark as paid
      const payResp = page.waitForResponse(
        (r) => r.url().includes('/payment') && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-payment-toggle-btn').click()
      await payResp
      await expect(page.getByTestId('manage-payment-toggle-btn')).toContainText('Paid')

      // Reload and verify
      await page.reload()
      await goToAttendeesTab(page, manageUrl)
      await expect(page.getByTestId('manage-payment-toggle-btn')).toContainText('Paid')

      await context.close()
    })

    test('admin can track payments for multiple attendees independently', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl, manageUrl } = await createEventWithCost(browser, baseURL!)
      createdEvents.push(eventId)

      await joinEvent(browser, 'alice', eventUrl)
      await joinEvent(browser, 'bob', eventUrl)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      const buttons = page.getByTestId('manage-payment-toggle-btn')
      await expect(buttons).toHaveCount(2)

      // Both start as Unpaid
      await expect(buttons.nth(0)).toContainText('Unpaid')
      await expect(buttons.nth(1)).toContainText('Unpaid')

      // Mark only the first attendee as paid
      const payResp = page.waitForResponse(
        (r) => r.url().includes('/payment') && r.request().method() === 'PUT',
      )
      await buttons.nth(0).click()
      await payResp
      await expect(buttons.nth(0)).toContainText('Paid')

      // Second attendee is still Unpaid
      await expect(buttons.nth(1)).toContainText('Unpaid')

      await context.close()
    })

    test('joined paid event shows "Payment not yet registered" badge', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl } = await createEventWithCost(browser, baseURL!, 15.99)
      createdEvents.push(eventId)

      await joinEvent(browser, 'alice', eventUrl)

      // Alice's view: payment badge should show "Payment not yet registered"
      const { context, page } = await contextAs(browser, 'alice')
      await page.goto(eventUrl)
      await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

      const badge = page.getByTestId('event-payment-badge')
      await expect(badge).toBeVisible({ timeout: 10000 })
      await expect(badge).toContainText(/payment not yet registered/i)

      await context.close()
    })

    test('admin marks paid: alice\'s badge updates to "Paid" via realtime', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const { eventId, eventUrl, manageUrl } = await createEventWithCost(browser, baseURL!, 20.0)
      createdEvents.push(eventId)

      const aliceUserId = await joinEvent(browser, 'alice', eventUrl)

      // Open alice's view and keep it open
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await expect(alicePage.getByTestId('event-payment-badge')).toContainText(/payment not yet registered/i)

      // In a separate admin context, toggle payment for alice
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToAttendeesTab(adminPage, manageUrl)

      const paymentResp = adminPage.waitForResponse(
        (r) => r.url().includes('/payment') && r.request().method() === 'PUT',
      )
      await adminPage.getByTestId('manage-payment-toggle-btn').click()
      await paymentResp

      // Alice's still-open page should update the badge to "Paid" via realtime
      await expect(alicePage.getByTestId('event-payment-badge')).toContainText('Paid', {
        timeout: 10000,
      })

      await adminCtx.close()
      await aliceCtx.close()
    })

    test('dashboard card shows "Payment not yet registered" badge for unpaid joined event', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const { eventId, eventUrl } = await createEventWithCost(browser, baseURL!, 25.0)
      createdEvents.push(eventId)

      await joinEvent(browser, 'alice', eventUrl)

      const { context, page } = await contextAs(browser, 'alice')
      await page.goto(`${baseURL}/`)
      await page.getByTestId('event-list').waitFor({ state: 'visible', timeout: 20000 })

      // Find the card for this event by id
      const card = page.locator(`[data-testid="event-card"][data-event-id="${eventId}"]`)
      await expect(card.getByTestId('event-card-payment-badge')).toBeVisible({ timeout: 10000 })
      await expect(card.getByTestId('event-card-payment-badge')).toContainText(/payment not yet registered/i)

      await context.close()
    })

    test('dashboard card shows "Paid" badge after admin marks payment', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const { eventId, eventUrl, manageUrl } = await createEventWithCost(browser, baseURL!, 30.0)
      createdEvents.push(eventId)

      const aliceUserId = await joinEvent(browser, 'alice', eventUrl)

      // Admin marks alice as paid
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToAttendeesTab(adminPage, manageUrl)
      const paymentResp = adminPage.waitForResponse(
        (r) => r.url().includes('/payment') && r.request().method() === 'PUT',
      )
      await adminPage.getByTestId('manage-payment-toggle-btn').click()
      await paymentResp
      await adminCtx.close()

      // Alice loads the dashboard fresh — should see "Paid" pill
      const { context, page } = await contextAs(browser, 'alice')
      await page.goto(`${baseURL}/`)
      await page.getByTestId('event-list').waitFor({ state: 'visible', timeout: 20000 })

      const card = page.locator(`[data-testid="event-card"][data-event-id="${eventId}"]`)
      await expect(card.getByTestId('event-card-payment-badge')).toBeVisible({ timeout: 10000 })
      await expect(card.getByTestId('event-card-payment-badge')).toContainText('Paid')

      await context.close()
    })
  })

  test.describe('negative', () => {
    test('paid column is hidden when event has no cost', async ({ browser, baseURL, createdEvents }) => {
      // Create event without setting a cost
      const title = `Free ${uid()}`
      const { context: createCtx, page: createPage } = await contextAs(browser, 'admin')
      await createPage.goto(baseURL!)
      await createPage.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
      await createPage.getByTestId('event-create-btn').click()

      await createPage.getByTestId('event-title-input').fill(title)
      await createPage.getByTestId('event-location-input').fill('Free Venue')

      const dates = futureDates(5)
      await createPage.getByTestId('event-start-input').fill(dates.start)
      await createPage.getByTestId('event-end-input').fill(dates.end)

      const createResp = createPage.waitForResponse(
        (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
      )
      await createPage.getByTestId('event-submit-btn').click()
      const resp = await createResp
      const body = await resp.json()
      createdEvents.push(body.id)
      const eventUrl = `${baseURL}/events/${body.id}`
      const manageUrl = `${baseURL}/events/${body.id}/manage`
      await createCtx.close()

      // Have alice join
      await joinEvent(browser, 'alice', eventUrl)

      // Admin checks attendees — no Paid column
      const { context, page } = await contextAs(browser, 'admin')
      await goToAttendeesTab(page, manageUrl)

      await expect(page.getByTestId('manage-attendee-row')).toBeVisible()
      await expect(page.getByTestId('manage-payment-toggle-btn')).not.toBeVisible()

      await context.close()
    })

    test('non-owner cannot toggle payment status', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl, manageUrl } = await createEventWithCost(browser, baseURL!)
      createdEvents.push(eventId)

      await joinEvent(browser, 'alice', eventUrl)

      // Bob (not admin) tries to access the manage page
      const { context, page } = await contextAs(browser, 'bob')
      await page.goto(manageUrl)

      // Should not see manage tabs
      await expect(page.getByTestId('manage-tab-attendees')).not.toBeVisible({ timeout: 10000 })

      await context.close()
    })
  })
})
