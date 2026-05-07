import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, contextAs } from '../helpers/auth'
import {
  adminApi,
  userApi,
  createEventApi,
  configureAuctionApi,
  startAuctionApi,
  joinEventApi,
  createItemApi,
  publishItemApi,
} from '../helpers/auction'
import { enableEventFeature } from '../helpers/api'
import { setFeatureFlagOverride } from '../helpers/featureFlags'

test.describe('Auction moderation queue', () => {
  test.beforeEach(async ({ page }) => {
    await setFeatureFlagOverride(page, 'VITE_FEATURE_AUCTIONS', true)
  })

  test.describe('moderation link visibility', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('admin sees moderation queue link', async ({ page, browser, baseURL, createdEvents }) => {
      const api = await adminApi(browser, baseURL!)
      const now = new Date()
      const eventStart = new Date(now.getTime() - 60_000).toISOString()
      const eventEnd = new Date(now.getTime() + 8 * 60 * 60_000).toISOString()
      const { id: eventId } = await createEventApi(api, { start: eventStart, end: eventEnd })
      createdEvents.push(eventId)
      await enableEventFeature(api, eventId, 'auction')

      await configureAuctionApi(api, eventId, {
        itemModerationPolicy: 0, // RequireApproval
        startsAt: new Date(now.getTime() + 3_600_000).toISOString(),
        latestEndsAt: new Date(now.getTime() + 7_200_000).toISOString(),
        minBidIncrement: 1,
      })
      await startAuctionApi(api, eventId)

      await page.goto(`${baseURL}/events/${eventId}/auction`)
      await expect(page.getByTestId('auction-moderation-link')).toBeVisible({ timeout: 10000 })

      await api.close()
    })
  })

  test('non-admin does not see moderation link', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event
    const adminCtx = await adminApi(browser, baseURL!)
    const now = new Date()
    const eventStart = new Date(now.getTime() - 60_000).toISOString()
    const eventEnd = new Date(now.getTime() + 8 * 60 * 60_000).toISOString()
    const { id: eventId } = await createEventApi(adminCtx, { start: eventStart, end: eventEnd })
    createdEvents.push(eventId)
    await enableEventFeature(adminCtx, eventId, 'auction')

    await configureAuctionApi(adminCtx, eventId, {
      itemModerationPolicy: 0, // RequireApproval
      startsAt: new Date(now.getTime() + 3_600_000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 7_200_000).toISOString(),
      minBidIncrement: 1,
    })
    await startAuctionApi(adminCtx, eventId)

    // Alice joins and checks
    const aliceCtx = await userApi(browser, 'alice', baseURL!)
    await joinEventApi(aliceCtx, eventId)

    await aliceCtx.page.goto(`${baseURL}/events/${eventId}/auction`)
    await expect(aliceCtx.page.getByTestId('auction-moderation-link')).toHaveCount(0)

    await adminCtx.close()
    await aliceCtx.close()
  })

  test.describe('queue display', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('empty queue shows empty state', async ({ page, browser, baseURL, createdEvents }) => {
      const api = await adminApi(browser, baseURL!)
      const now = new Date()
      const eventStart = new Date(now.getTime() - 60_000).toISOString()
      const eventEnd = new Date(now.getTime() + 8 * 60 * 60_000).toISOString()
      const { id: eventId } = await createEventApi(api, { start: eventStart, end: eventEnd })
      createdEvents.push(eventId)
      await enableEventFeature(api, eventId, 'auction')

      await configureAuctionApi(api, eventId, {
        itemModerationPolicy: 0, // RequireApproval
        startsAt: new Date(now.getTime() + 3_600_000).toISOString(),
        latestEndsAt: new Date(now.getTime() + 7_200_000).toISOString(),
        minBidIncrement: 1,
      })
      await startAuctionApi(api, eventId)

      await page.goto(`${baseURL}/events/${eventId}/auction/moderation`)
      await expect(page.getByTestId('moderation-queue-empty')).toBeVisible({ timeout: 10000 })

      await api.close()
    })

    test('pending items appear in queue and admin can approve', async ({
      page,
      browser,
      baseURL,
      createdEvents,
    }) => {
      // ── Setup ──
      const adminCtx = await adminApi(browser, baseURL!)
      const now = new Date()
      const eventStart = new Date(now.getTime() - 60_000).toISOString()
      const eventEnd = new Date(now.getTime() + 8 * 60 * 60_000).toISOString()
      const { id: eventId } = await createEventApi(adminCtx, { start: eventStart, end: eventEnd })
      createdEvents.push(eventId)
      await enableEventFeature(adminCtx, eventId, 'auction')

      await configureAuctionApi(adminCtx, eventId, {
        itemModerationPolicy: 0, // RequireApproval
        submissionMode: 2, // AllAttendees
        startsAt: new Date(now.getTime() - 1000).toISOString(), // Already Live
        latestEndsAt: new Date(now.getTime() + 7_200_000).toISOString(),
        minBidIncrement: 1,
      })
      await startAuctionApi(adminCtx, eventId)

      // Alice creates and publishes item via API
      const aliceCtx = await userApi(browser, 'alice', baseURL!)
      await joinEventApi(aliceCtx, eventId)
      const item = await createItemApi(aliceCtx, eventId, { name: 'Wingspan', startingBid: 15 })
      await publishItemApi(aliceCtx, eventId, item.id)

      // ── Admin navigates to moderation view ──
      await page.goto(`${baseURL}/events/${eventId}/auction/moderation`)
      await expect(page.getByTestId(`moderation-item-${item.id}`)).toBeVisible({ timeout: 10000 })

      // ── Admin approves item ──
      const approveResp = page.waitForResponse(
        (r) => r.url().includes(`/auction/items/${item.id}/approve`) && r.request().method() === 'POST',
      )
      await page.getByTestId(`moderation-item-${item.id}`).getByTestId('moderation-approve-btn').click()
      await approveResp

      // Item row stays in the queue (admins can still reject scheduled/live items),
      // but the Approve button should be gone since it's only for Pending items.
      await expect(
        page.getByTestId(`moderation-item-${item.id}`).getByTestId('moderation-approve-btn')
      ).toHaveCount(0, { timeout: 5000 })

      // ── Bob can now see the item on the public auction page ──
      const bobCtx = await userApi(browser, 'bob', baseURL!)
      await joinEventApi(bobCtx, eventId)
      await bobCtx.page.goto(`${baseURL}/events/${eventId}/auction`)
      await expect(bobCtx.page.getByText('Wingspan')).toBeVisible({ timeout: 10000 })
      await bobCtx.close()

      await adminCtx.close()
      await aliceCtx.close()
    })
  })
})
