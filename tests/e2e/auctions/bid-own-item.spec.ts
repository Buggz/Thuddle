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
} from '../helpers/auction'
import { randomUUID } from 'crypto'

test.describe('Bid on own item', () => {
  test('submitter cannot see bid panel on their own item', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    const now = new Date()
    await configureAuctionApi(api, eventId, {
      submissionMode: 2, // AllAttendees
      itemModerationPolicy: 1, // AutoApprove
      startsAt: new Date(now.getTime() - 1000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
    })
    await startAuctionApi(api, eventId)

    // Alice submits an item
    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const item = await createItemApi(aliceApi, eventId, { name: `Alice Own ${randomUUID().slice(0, 8)}` })
    await aliceApi.close()
    await api.close()

    // Alice views her own item — bid panel should be hidden
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/${item.id}`)
    await alicePage.getByTestId('auction-item-name').waitFor({ state: 'visible', timeout: 20000 })

    await expect(alicePage.getByTestId('bid-amount-input')).not.toBeVisible({ timeout: 3000 })
    await expect(alicePage.getByTestId('bid-place-btn')).not.toBeVisible({ timeout: 3000 })

    await aliceCtx.close()
  })

  test('direct API bid on own item returns 403', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    const now = new Date()
    await configureAuctionApi(api, eventId, {
      submissionMode: 2,
      itemModerationPolicy: 1,
      startsAt: new Date(now.getTime() - 1000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
    })
    await startAuctionApi(api, eventId)

    const aliceApi = await userApi(browser, 'alice', baseURL!)
    const item = await createItemApi(aliceApi, eventId, { name: `Own Bid ${randomUUID().slice(0, 8)}` })

    // Alice tries to bid on her own item via direct API call
    const result = await placeBidApi(aliceApi, eventId, item.id, item.startingBid ?? 10)
    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(403)

    await aliceApi.close()
    await api.close()
  })
})
