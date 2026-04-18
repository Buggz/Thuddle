import { test, expect } from '../helpers/fixtures'
import { contextAs } from '../helpers/auth'
import {
  adminApi,
  userApi,
  setupLiveAuction,
  placeBidApi,
  createItemApi,
} from '../helpers/auction'

test.describe('Place bid', () => {
  // ── Happy path ───────────────────────────────────────────────────────────

  test('bidder places a valid bid through the UI confirm flow', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      auctionSettings: { minBidIncrement: 5 },
      itemOpts: { startingBid: 10 },
    })
    createdEvents.push(eventId)
    await api.close()

    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/${itemId}`)
    await alicePage.getByTestId('bid-amount-input').waitFor({ state: 'visible', timeout: 20000 })

    // First bid must be >= startingBid (10)
    await alicePage.getByTestId('bid-amount-input').fill('15')
    await alicePage.getByTestId('bid-place-btn').click()

    // Confirm modal
    await alicePage.getByTestId('bid-confirm-modal').waitFor({ state: 'visible' })
    await expect(alicePage.getByTestId('bid-confirm-amount')).toContainText('15')
    await alicePage.getByTestId('bid-confirm-yes').click()

    // Wait for update
    await expect(alicePage.getByTestId('auction-item-current-bid')).toContainText('15', { timeout: 10000 })
    await expect(alicePage.getByTestId('auction-item-bid-count')).toContainText('1')

    await aliceCtx.close()
  })

  // ── Cancel in confirm modal ──────────────────────────────────────────────

  test('cancel in confirm modal does not place bid', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      itemOpts: { startingBid: 10 },
    })
    createdEvents.push(eventId)
    await api.close()

    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/${itemId}`)
    await alicePage.getByTestId('bid-amount-input').waitFor({ state: 'visible', timeout: 20000 })

    await alicePage.getByTestId('bid-amount-input').fill('10')
    await alicePage.getByTestId('bid-place-btn').click()

    await alicePage.getByTestId('bid-confirm-modal').waitFor({ state: 'visible' })
    await alicePage.getByTestId('bid-confirm-cancel').click()

    // Modal closes, no bid placed
    await expect(alicePage.getByTestId('bid-confirm-modal')).not.toBeVisible()
    // Bid count should still be 0 (or "—")
    await expect(alicePage.getByTestId('auction-item-bid-count')).not.toContainText('1', { timeout: 3000 })

    await aliceCtx.close()
  })

  // ── Below minimum increment → rejected ───────────────────────────────────

  test('bid below currentBid + minIncrement is rejected', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      auctionSettings: { minBidIncrement: 5 },
      itemOpts: { startingBid: 10 },
    })
    createdEvents.push(eventId)

    // Alice places a valid first bid via API
    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const firstBid = await placeBidApi(aliceApi, eventId, itemId, 10)
    expect(firstBid.ok).toBeTruthy()

    // Bob tries to bid currentBid(10) + 2 (< minIncrement of 5) → rejected
    const bobApi = await userApi(browser, 'bob', baseURL!)
    const lowBid = await placeBidApi(bobApi, eventId, itemId, 12)
    expect(lowBid.ok).toBeFalsy()
    expect(lowBid.status).toBe(400)

    await aliceApi.close()
    await bobApi.close()
    await api.close()
  })

  // ── Bid below starting bid (no prior bids) ──────────────────────────────

  test('bid below starting bid with no prior bids is rejected', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      itemOpts: { startingBid: 50 },
    })
    createdEvents.push(eventId)

    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const lowBid = await placeBidApi(aliceApi, eventId, itemId, 30)
    expect(lowBid.ok).toBeFalsy()
    expect(lowBid.status).toBe(400)

    await aliceApi.close()
    await api.close()
  })

  // ── Min increment enforced in UI ─────────────────────────────────────────

  test('min increment: bid current+2 rejected, bid current+5 accepted', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      auctionSettings: { minBidIncrement: 5 },
      itemOpts: { startingBid: 10 },
    })
    createdEvents.push(eventId)

    // Alice bids 10
    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const b1 = await placeBidApi(aliceApi, eventId, itemId, 10)
    expect(b1.ok).toBeTruthy()

    // Bob in UI
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await bobPage.goto(`${baseURL}/events/${eventId}/auction/items/${itemId}`)
    await bobPage.getByTestId('bid-amount-input').waitFor({ state: 'visible', timeout: 20000 })

    // Try 12 (current 10 + 2 < 5 increment)
    await bobPage.getByTestId('bid-amount-input').fill('12')
    await bobPage.getByTestId('bid-place-btn').click()
    await bobPage.getByTestId('bid-confirm-modal').waitFor({ state: 'visible' })
    await bobPage.getByTestId('bid-confirm-yes').click()
    await expect(bobPage.getByTestId('bid-error-message')).toBeVisible({ timeout: 10000 })

    // Try 15 (current 10 + 5 = min)
    await bobPage.getByTestId('bid-amount-input').fill('15')
    await bobPage.getByTestId('bid-place-btn').click()
    await bobPage.getByTestId('bid-confirm-modal').waitFor({ state: 'visible' })
    await bobPage.getByTestId('bid-confirm-yes').click()

    await expect(bobPage.getByTestId('auction-item-current-bid')).toContainText('15', { timeout: 10000 })

    await bobCtx.close()
    await aliceApi.close()
    await api.close()
  })
})
