import { test, expect } from '../helpers/fixtures'
import { contextAs } from '../helpers/auth'
import {
  adminApi,
  userApi,
  setupLiveAuction,
  placeBidApi,
} from '../helpers/auction'

test.describe('Bid race condition', () => {
  test('two simultaneous bids: exactly one wins, both contexts reconcile', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      auctionSettings: { minBidIncrement: 1 },
      itemOpts: { startingBid: 10 },
    })
    createdEvents.push(eventId)
    await api.close()

    // Two independent user API contexts
    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const bobApi = await userApi(browser, 'bob', baseURL!)

    // Both bid the same amount simultaneously
    const bidAmount = 10 // Starting bid
    const results = await Promise.allSettled([
      placeBidApi(aliceApi, eventId, itemId, bidAmount),
      placeBidApi(bobApi, eventId, itemId, bidAmount),
    ])

    // Count successes and failures
    const outcomes = results.map((r) => (r.status === 'fulfilled' ? r.value : null))
    const successes = outcomes.filter((o) => o?.ok === true)
    const failures = outcomes.filter((o) => o !== null && o.ok === false)

    // At least one should succeed — the other either fails with 400 (too low)
    // or 409 (amount conflict). Both are acceptable race outcomes.
    expect(successes.length).toBeGreaterThanOrEqual(1)
    // At most one succeeds at the same amount (unique constraint on ItemId+Amount)
    expect(successes.length).toBeLessThanOrEqual(1)
    if (failures.length > 0) {
      // The losing bid should get a clean error (400 or 409), not a 500
      for (const f of failures) {
        expect(f!.status).toBeLessThan(500)
      }
    }

    // Both browser contexts see the same final state via UI (realtime reconciliation)
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')

    await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/${itemId}`)
    await bobPage.goto(`${baseURL}/events/${eventId}/auction/items/${itemId}`)

    await alicePage.getByTestId('auction-item-current-bid').waitFor({ state: 'visible', timeout: 15000 })
    await bobPage.getByTestId('auction-item-current-bid').waitFor({ state: 'visible', timeout: 15000 })

    const aliceSees = await alicePage.getByTestId('auction-item-current-bid').textContent()
    const bobSees = await bobPage.getByTestId('auction-item-current-bid').textContent()
    expect(aliceSees).toBe(bobSees)

    const aliceCount = await alicePage.getByTestId('auction-item-bid-count').textContent()
    const bobCount = await bobPage.getByTestId('auction-item-bid-count').textContent()
    expect(aliceCount).toBe(bobCount)

    await aliceCtx.close()
    await bobCtx.close()
    await aliceApi.close()
    await bobApi.close()
  })
})
