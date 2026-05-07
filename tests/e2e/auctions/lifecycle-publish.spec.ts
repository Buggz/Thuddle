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

test.describe('Auction item lifecycle: publish', () => {
  test('auto-approve mode: submitter publishes → item goes Live immediately', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // ── Setup: admin creates event, configures auction with auto-approve, starts it ──
    const adminCtx = await adminApi(browser, baseURL!)
    const now = new Date()
    const eventStart = new Date(now.getTime() - 60_000).toISOString()
    const eventEnd = new Date(now.getTime() + 8 * 60 * 60_000).toISOString()
    const { id: eventId } = await createEventApi(adminCtx, { start: eventStart, end: eventEnd })
    createdEvents.push(eventId)
    await enableEventFeature(adminCtx, eventId, 'auction')

    await configureAuctionApi(adminCtx, eventId, {
      itemModerationPolicy: 1, // AutoApprove
      submissionMode: 2, // AllAttendees
      startsAt: new Date(now.getTime() + 3_600_000).toISOString(), // +1h
      latestEndsAt: new Date(now.getTime() + 7_200_000).toISOString(), // +2h
      minBidIncrement: 1,
    })
    await startAuctionApi(adminCtx, eventId)

    // ── Alice creates and publishes item via API ──
    const aliceCtx = await userApi(browser, 'alice', baseURL!)
    await joinEventApi(aliceCtx, eventId)
    const item = await createItemApi(aliceCtx, eventId, { name: 'Brass: Birmingham', startingBid: 5 })
    await publishItemApi(aliceCtx, eventId, item.id)

    // ── Bob verifies item appears on public auction page ──
    const bobCtx = await userApi(browser, 'bob', baseURL!)
    await joinEventApi(bobCtx, eventId)
    await bobCtx.page.goto(`${baseURL}/events/${eventId}/auction`)
    await expect(bobCtx.page.getByText('Brass: Birmingham')).toBeVisible({ timeout: 10000 })
    await bobCtx.close()

    await adminCtx.close()
    await aliceCtx.close()
  })

  test('require-approval mode: submitter publishes → item is PendingApproval, not visible to others', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // ── Setup: admin creates event, configures auction with RequireApproval, starts it ──
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
      startsAt: new Date(now.getTime() + 3_600_000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 7_200_000).toISOString(),
      minBidIncrement: 1,
    })
    await startAuctionApi(adminCtx, eventId)

    // ── Alice creates and publishes item via API ──
    const aliceCtx = await userApi(browser, 'alice', baseURL!)
    await joinEventApi(aliceCtx, eventId)
    const item = await createItemApi(aliceCtx, eventId, { name: 'Gloomhaven', startingBid: 10 })
    await publishItemApi(aliceCtx, eventId, item.id)

    // ── Bob (different user) navigates to public auction → item NOT visible ──
    const bobCtx = await userApi(browser, 'bob', baseURL!)
    await joinEventApi(bobCtx, eventId)
    await bobCtx.page.goto(`${baseURL}/events/${eventId}/auction`)
    // Ensure we're on the auction page (not redirected to home by feature-flag gate)
    // by waiting for the AuctionView's "Bidding floor" heading to render.
    await bobCtx.page
      .getByRole('heading', { name: 'Bidding floor' })
      .waitFor({ state: 'visible', timeout: 20000 })
    await expect(bobCtx.page.getByText('Gloomhaven')).toHaveCount(0)
    await bobCtx.close()

    await adminCtx.close()
    await aliceCtx.close()
  })
})
