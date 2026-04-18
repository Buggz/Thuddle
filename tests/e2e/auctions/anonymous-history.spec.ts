import { test, expect } from '../helpers/fixtures'
import { contextAs } from '../helpers/auth'
import {
  adminApi,
  userApi,
  setupLiveAuction,
  placeBidApi,
  getBidsApi,
} from '../helpers/auction'

test.describe('Anonymous bid history', () => {
  test('anonymousBidHistory=true: non-admin sees Bidder #N aliases; admin sees real names', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      auctionSettings: { anonymousBidHistory: true, minBidIncrement: 1 },
      itemOpts: { startingBid: 10 },
    })
    createdEvents.push(eventId)

    // 3 distinct bidders
    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const bobApi = await userApi(browser, 'bob', baseURL!)
    const charlieApi = await userApi(browser, 'charlie', baseURL!)

    await placeBidApi(aliceApi, eventId, itemId, 10)
    await placeBidApi(bobApi, eventId, itemId, 11)
    await placeBidApi(charlieApi, eventId, itemId, 12)

    // Non-admin (alice) views bid history via API
    const aliceBids = await getBidsApi(aliceApi, eventId, itemId)
    const aliceNames = aliceBids.items.map((b) => b.bidderName)
    // Should see aliases like "Bidder #1", "Bidder #2", "Bidder #3"
    expect(aliceNames.every((n) => /Bidder #\d+/.test(n!))).toBeTruthy()
    // No real names
    expect(aliceNames.every((n) => !n!.includes('@'))).toBeTruthy()
    // Stable: distinct bidders get distinct numbers
    const uniqueNames = new Set(aliceNames)
    expect(uniqueNames.size).toBe(3)

    // Admin views bid history — sees real display names
    const adminBids = await getBidsApi(api, eventId, itemId)
    const adminNames = adminBids.items.map((b) => b.bidderName)
    // Admin should see real names (not "Bidder #N")
    expect(adminNames.some((n) => !/Bidder #\d+/.test(n!))).toBeTruthy()

    // Also verify via UI: non-admin sees aliases
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/${itemId}`)
    await alicePage.getByTestId('bid-history-list').waitFor({ state: 'visible', timeout: 15000 })

    // Check first few history rows contain "Bidder #"
    const row0Text = await alicePage.getByTestId('bid-history-row-0').textContent()
    expect(row0Text).toMatch(/Bidder #\d+/)

    await aliceCtx.close()
    await aliceApi.close()
    await bobApi.close()
    await charlieApi.close()
    await api.close()
  })

  test('anonymousBidHistory=false: all viewers see real display names', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { eventId, itemId } = await setupLiveAuction(api, {
      auctionSettings: { anonymousBidHistory: false, minBidIncrement: 1 },
      itemOpts: { startingBid: 10 },
    })
    createdEvents.push(eventId)

    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const bobApi = await userApi(browser, 'bob', baseURL!)

    await placeBidApi(aliceApi, eventId, itemId, 10)
    await placeBidApi(bobApi, eventId, itemId, 11)

    // Non-admin (alice) should see real names, not aliases
    const aliceBids = await getBidsApi(aliceApi, eventId, itemId)
    const aliceNames = aliceBids.items.map((b) => b.bidderName)
    expect(aliceNames.some((n) => !/Bidder #\d+/.test(n!))).toBeTruthy()

    await aliceApi.close()
    await bobApi.close()
    await api.close()
  })
})
