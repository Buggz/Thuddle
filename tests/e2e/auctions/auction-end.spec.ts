import { test, expect } from '../helpers/fixtures'
import { contextAs } from '../helpers/auth'
import {
  adminApi,
  userApi,
  createEventApi,
  configureAuctionApi,
  startAuctionApi,
  createItemApi,
  placeBidApi,
  getAuctionSettingsApi,
} from '../helpers/auction'

test.describe('Auction end', () => {
  // This test waits for the AuctionLifecycleWorker to finalise the auction.
  test.slow()

  test('auction ends: item sold, winner notified, loser not', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    // Very short auction: ~15s, no veil
    const now = new Date()
    await configureAuctionApi(api, eventId, {
      startsAt: new Date(now.getTime() - 2000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 15_000).toISOString(),
      veiledCloseWindow: '00:00:00',
    })
    await startAuctionApi(api, eventId)
    const item = await createItemApi(api, eventId, { startingBid: 5 })

    // User A (alice) places a bid
    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const bid = await placeBidApi(aliceApi, eventId, item.id, 5)
    expect(bid.ok).toBeTruthy()

    // Wait for the auction to end. The lifecycle worker checks periodically.
    // Poll the item status via API until it flips to Sold (or Unsold).
    await expect.poll(
      async () => {
        const resp = await api.request.get(
          `${api.baseURL}/api/events/${eventId}/auction/items/${item.id}`,
          { headers: api.headers },
        )
        if (!resp.ok()) return 'error'
        const body = await resp.json()
        return body.status
      },
      { message: 'Waiting for item to be finalised', timeout: 90_000, intervals: [3000] },
    ).toBe('Sold')

    // Verify item details
    const itemResp = await api.request.get(
      `${api.baseURL}/api/events/${eventId}/auction/items/${item.id}`,
      { headers: api.headers },
    )
    const finalItem = await itemResp.json()
    expect(finalItem.finalPrice).toBe(5)

    // Auction settings should show Ended
    const settings = await getAuctionSettingsApi(api, eventId)
    expect(settings.status).toBe('Ended')

    // User A should get an AuctionWonItem notification
    const aliceNotifResp = await aliceApi.request.get(
      `${aliceApi.baseURL}/api/notifications?unreadOnly=true`,
      { headers: aliceApi.headers },
    )
    const aliceNotifs = await aliceNotifResp.json()
    const wonNotif = (aliceNotifs.items || []).find(
      (n: { kind: string; entityId: string }) => n.kind === 'AuctionWonItem' && n.entityId === item.id,
    )
    expect(wonNotif).toBeDefined()

    // User B (bob) should NOT get a "won" notification
    const bobApi = await userApi(browser, 'bob', baseURL!)
    const bobNotifResp = await bobApi.request.get(
      `${bobApi.baseURL}/api/notifications?unreadOnly=true`,
      { headers: bobApi.headers },
    )
    const bobNotifs = await bobNotifResp.json()
    const bobWon = (bobNotifs.items || []).find(
      (n: { kind: string; entityId: string }) => n.kind === 'AuctionWonItem' && n.entityId === item.id,
    )
    expect(bobWon).toBeUndefined()

    await aliceApi.close()
    await bobApi.close()
    await api.close()
  })
})
