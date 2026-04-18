import { test, expect } from '../helpers/fixtures'
import { contextAs } from '../helpers/auth'
import {
  adminApi,
  userApi,
  setupLiveAuction,
  placeBidApi,
  buyoutApi,
} from '../helpers/auction'

test.describe('Buyout', () => {
  test('buyout button visible when allowed, confirm completes purchase', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      auctionSettings: { allowBuyout: true },
      itemOpts: { startingBid: 10, buyoutPrice: 100 },
    })
    createdEvents.push(eventId)
    await api.close()

    // Alice views the item
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/${itemId}`)
    await alicePage.getByTestId('buyout-btn').waitFor({ state: 'visible', timeout: 20000 })

    // Click buyout
    await alicePage.getByTestId('buyout-btn').click()
    await alicePage.getByTestId('buyout-confirm-modal').waitFor({ state: 'visible' })
    await alicePage.getByTestId('buyout-confirm-yes').click()

    // Item should become Sold
    await expect(alicePage.locator('text=/sold/i')).toBeVisible({ timeout: 15000 })

    // Bid panel should be gone
    await expect(alicePage.getByTestId('bid-amount-input')).not.toBeVisible({ timeout: 3000 })
    await expect(alicePage.getByTestId('buyout-btn')).not.toBeVisible({ timeout: 3000 })

    await aliceCtx.close()
  })

  test('after buyout, further bid attempts are rejected via API', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      auctionSettings: { allowBuyout: true },
      itemOpts: { startingBid: 10, buyoutPrice: 100 },
    })
    createdEvents.push(eventId)

    // Alice buys out via API
    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const buyResult = await buyoutApi(aliceApi, eventId, itemId)
    expect(buyResult.ok).toBeTruthy()

    // Bob tries to bid → should be rejected (item is Sold / not Live)
    const bobApi = await userApi(browser, 'bob', baseURL!)
    const bidResult = await placeBidApi(bobApi, eventId, itemId, 50)
    expect(bidResult.ok).toBeFalsy()
    expect(bidResult.status).toBe(400)

    await aliceApi.close()
    await bobApi.close()
    await api.close()
  })

  test('buyout cancel does not complete purchase', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      auctionSettings: { allowBuyout: true },
      itemOpts: { startingBid: 10, buyoutPrice: 100 },
    })
    createdEvents.push(eventId)
    await api.close()

    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/${itemId}`)
    await alicePage.getByTestId('buyout-btn').waitFor({ state: 'visible', timeout: 20000 })

    await alicePage.getByTestId('buyout-btn').click()
    await alicePage.getByTestId('buyout-confirm-modal').waitFor({ state: 'visible' })
    await alicePage.getByTestId('buyout-confirm-cancel').click()

    await expect(alicePage.getByTestId('buyout-confirm-modal')).not.toBeVisible()
    // Buyout button still present — not sold
    await expect(alicePage.getByTestId('buyout-btn')).toBeVisible()

    await aliceCtx.close()
  })
})
