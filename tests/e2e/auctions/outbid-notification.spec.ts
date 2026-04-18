import { test, expect } from '../helpers/fixtures'
import { contextAs } from '../helpers/auth'
import {
  adminApi,
  userApi,
  setupLiveAuction,
  placeBidApi,
} from '../helpers/auction'

test.describe('Outbid notification', () => {
  test('outbid user receives notification, clicks through, badge clears', async ({
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

    // Alice places initial bid
    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const bid1 = await placeBidApi(aliceApi, eventId, itemId, 10)
    expect(bid1.ok).toBeTruthy()
    await aliceApi.close()

    // Alice opens the app and waits for UI to load
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}`)
    await alicePage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

    // Bob outbids Alice
    const bobApi = await userApi(browser, 'bob', baseURL!)
    const bid2 = await placeBidApi(bobApi, eventId, itemId, 11)
    expect(bid2.ok).toBeTruthy()
    await bobApi.close()

    // Alice should see the notification badge
    await expect(alicePage.getByTestId('notification-unread-badge')).toBeVisible({ timeout: 15000 })
    await expect(alicePage.getByTestId('notification-unread-badge')).toContainText('1')

    // Click the bell to open dropdown
    await alicePage.getByTestId('notification-bell').click()
    await alicePage.getByTestId('notification-dropdown').waitFor({ state: 'visible' })

    // Click the notification row (first one) — should navigate to the item
    const notificationRow = alicePage.getByTestId('notification-dropdown').locator('[data-testid^="notification-row-"]').first()
    await notificationRow.click()

    // Should navigate to the auction item page
    await alicePage.waitForURL(`**/events/${eventId}/auction/items/${itemId}`, { timeout: 10000 })

    // After clicking, badge should disappear (notification marked as read)
    await alicePage.goto(`${baseURL}`)
    await alicePage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
    await expect(alicePage.getByTestId('notification-unread-badge')).not.toBeVisible({ timeout: 10000 })

    await aliceCtx.close()
  })
})
