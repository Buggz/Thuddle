import { test, expect } from '../helpers/fixtures'
import { contextAs } from '../helpers/auth'
import {
  adminApi,
  createEventApi,
  configureAuctionApi,
  startAuctionApi,
  createItemApi,
} from '../helpers/auction'

test.describe('Auction timeline', () => {
  // These tests use short durations and rely on time passing.
  test.slow()

  test('veil activates once now crosses earliestEndsAt', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    // 90s total, 30s veil → earliestEndsAt = latestEndsAt - 30s = now + 60s
    const now = new Date()
    const startsAt = new Date(now.getTime() - 1000).toISOString()
    const latestEndsAt = new Date(now.getTime() + 90_000).toISOString() // +90s

    await configureAuctionApi(api, eventId, {
      startsAt,
      latestEndsAt,
      veiledCloseWindow: '00:00:30', // 30s
    })
    await startAuctionApi(api, eventId)
    await createItemApi(api, eventId)
    await api.close()

    // Open item view
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}/auction`)
    await alicePage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

    // Initially veil should be inactive
    const timeline = alicePage.getByTestId('auction-timeline')
    await timeline.waitFor({ state: 'visible', timeout: 15000 })
    await expect(timeline).toHaveAttribute('data-veil-active', 'false', { timeout: 10000 })

    // Time remaining should match HH:MM:SS or MM:SS pattern
    await expect(alicePage.getByTestId('auction-time-remaining-text')).toHaveText(/\d{1,2}:\d{2}(:\d{2})?/)

    // Wait for veil to activate (~60s from start).
    // We use expect.poll so Playwright retries automatically.
    await expect.poll(
      async () => timeline.getAttribute('data-veil-active'),
      { message: 'Waiting for veil to activate', timeout: 75_000, intervals: [2000] },
    ).toBe('true')

    // Text wording should change to indicate the veil
    await expect(alicePage.getByTestId('auction-time-remaining-text')).toContainText(/veil/i, { timeout: 5000 })

    await aliceCtx.close()
  })

  test('veiledCloseWindow=0 keeps veil inactive for entire auction', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    const now = new Date()
    await configureAuctionApi(api, eventId, {
      startsAt: new Date(now.getTime() - 1000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 30_000).toISOString(), // 30s auction
      veiledCloseWindow: '00:00:00', // no veil
    })
    await startAuctionApi(api, eventId)
    await createItemApi(api, eventId)
    await api.close()

    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}/auction`)
    const timeline = alicePage.getByTestId('auction-timeline')
    await timeline.waitFor({ state: 'visible', timeout: 15000 })

    // Should remain false throughout
    await expect(timeline).toHaveAttribute('data-veil-active', 'false')

    // Wait 10s and verify still false
    await alicePage.waitForTimeout(10_000)
    await expect(timeline).toHaveAttribute('data-veil-active', 'false')

    await aliceCtx.close()
  })
})
