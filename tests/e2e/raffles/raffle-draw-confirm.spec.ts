import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, expectJson, getAuthHeadersFromPage } from '../helpers/auth'
import {
  adminApi,
  createEventApi,
  createRaffleApi,
  addRaffleEntryApi,
  startRaffleApi,
} from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Raffle draw confirmation dialog (issue #12)
 * - Drawing a winner now goes through a confirmation dialog. Cancel must
 *   close the dialog without producing a winner; confirm must perform the
 *   draw and surface the winner in the existing draw history list.
 *
 * Setup is lifted from start-and-draw.spec.ts: alice joins via GUI, the
 * raffle is created/seeded/started via API, then the host drives the draw UI.
 */

test.describe('Raffle draw confirmation', () => {
  test('cancel closes dialog without drawing; confirm draws a winner', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Admin creates the event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await api.close()

    // Alice joins via GUI so she becomes an event participant
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    const { headers: aliceHeaders } = await getAuthHeadersFromPage(alicePage, baseURL!)
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    const aliceProfileResp = await alicePage.request.get(`${baseURL}/api/profile`, {
      headers: aliceHeaders,
    })
    const aliceProfile = await expectJson<{ id: string }>(aliceProfileResp)
    const aliceUserId = aliceProfile.id
    await aliceCtx.close()

    // Admin creates raffle, gives alice tickets, and starts it -> Drawing
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Confirm Draw Raffle ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 5 })
    await startRaffleApi(adminApiCtx, eventId, raffleId)
    await adminApiCtx.close()

    // Admin navigates to the raffle and opens it
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    // Sanity: history should be empty before any draw
    const historyList = adminPage.getByTestId('raffle-history-list')
    // The history list may not render at all when there are no draws; either
    // hidden or empty is acceptable. We just need to know there is no row.
    await expect(historyList.locator('[data-testid^="raffle-history-row-"]')).toHaveCount(0)

    // Click Draw -> confirm dialog appears
    await adminPage.getByTestId('raffle-draw-btn').click()
    const dialog = adminPage.getByTestId('confirm-dialog-confirm')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Cancel -> dialog goes away, no draw occurred
    await adminPage.getByTestId('confirm-dialog-cancel').click()
    await expect(dialog).toHaveCount(0)
    await expect(historyList.locator('[data-testid^="raffle-history-row-"]')).toHaveCount(0)

    // Click Draw again -> dialog reappears
    await adminPage.getByTestId('raffle-draw-btn').click()
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Confirm -> wait for the draw API call, then assert a winner appears
    const drawResp = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/draw`) &&
        r.request().method() === 'POST' &&
        r.status() === 200,
    )
    await adminPage.getByTestId('confirm-dialog-confirm').click()
    const drawBody = await expectJson<{ drawId: string }>(await drawResp)

    // History list should now contain that draw row (matches start-and-draw.spec.ts)
    await expect(historyList).toBeVisible({ timeout: 5000 })
    await expect(adminPage.getByTestId(`raffle-history-row-${drawBody.drawId}`)).toBeVisible({
      timeout: 5000,
    })

    await adminCtx.close()
  })
})
