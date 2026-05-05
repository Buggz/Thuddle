import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, expectJson, STORAGE_STATE } from '../helpers/auth'
import {
  adminApi,
  createEventApi,
  createRaffleApi,
  addRaffleEntryApi,
  startRaffleApi,
} from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Host can edit raffle entries after Start (status = Drawing).
 *
 * Backend (House) and frontend (Poirot) loosen the host-side gate so the
 * tickets editor and per-row remove button stay enabled at any raffle status,
 * letting hosts fix mistakes mid-draw or post-draw.
 */

type UserKey = 'alice' | 'bob'

async function joinAndGetUserId(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  user: UserKey,
  eventId: string,
): Promise<string> {
  const ctx = await browser.newContext({ storageState: STORAGE_STATE[user] })
  const page = await ctx.newPage()
  let token = ''
  page.on('request', (req) => {
    const auth = req.headers()['authorization']
    if (auth?.startsWith('Bearer ')) token = auth.substring(7)
  })

  await page.goto(`${baseURL}/events/${eventId}`)
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
  await page.getByTestId('event-join-btn').click()
  await expect(page.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

  if (!token) throw new Error(`Failed to capture bearer token for ${user}`)
  const profileResp = await page.request.get(`${baseURL}/api/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const profile = await expectJson<{ id: string }>(profileResp)

  await ctx.close()
  return profile.id
}

test.describe('Host edits tickets after raffle start', () => {
  test('host can edit a ticket count and remove an entry while raffle is Drawing', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await api.close()

    // Alice + Bob join the event so they can be added as raffle entries
    const aliceId = await joinAndGetUserId(browser, baseURL!, 'alice', eventId)
    const bobId = await joinAndGetUserId(browser, baseURL!, 'bob', eventId)

    // Admin creates raffle, seeds entries, starts it -> Drawing
    const adminCtxApi = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminCtxApi, eventId, {
      name: `Edit-After-Start Raffle ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminCtxApi, eventId, raffleId, { userId: aliceId, tickets: 3 })
    await addRaffleEntryApi(adminCtxApi, eventId, raffleId, { userId: bobId, tickets: 2 })
    await startRaffleApi(adminCtxApi, eventId, raffleId)
    await adminCtxApi.close()

    // Admin navigates to the manage Raffles tab and expands the raffle
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    // Status badge confirms we are in Drawing
    await expect(adminPage.getByTestId(`raffle-status-badge-${raffleId}`)).toHaveText(/Drawing/i, {
      timeout: 10000,
    })

    // Tickets inputs render and are enabled even though status is Drawing
    const aliceTickets = adminPage.getByTestId(`raffle-tickets-input-${aliceId}`)
    const bobTickets = adminPage.getByTestId(`raffle-tickets-input-${bobId}`)
    await expect(aliceTickets).toBeVisible({ timeout: 10000 })
    await expect(aliceTickets).toBeEnabled()
    await expect(bobTickets).toBeVisible()
    await expect(bobTickets).toBeEnabled()

    // Edit alice's tickets from 3 -> 5
    const updateRespPromise = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/entries/${aliceId}`) &&
        r.request().method() === 'PUT',
      { timeout: 10000 },
    )
    await aliceTickets.fill('5')
    await aliceTickets.press('Tab')
    const updateResp = await updateRespPromise
    expect(updateResp.status()).toBe(200)

    // New value reflected on next render
    await expect(aliceTickets).toHaveValue('5')

    // Remove bob's entry via the per-row remove button -> confirm dialog -> confirm
    const deleteRespPromise = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/entries/${bobId}`) &&
        r.request().method() === 'DELETE',
      { timeout: 10000 },
    )
    await adminPage.getByTestId(`raffle-entry-remove-${bobId}`).click()
    await adminPage.getByTestId('confirm-dialog-confirm').click()
    const deleteResp = await deleteRespPromise
    expect(deleteResp.status()).toBe(204)

    // Bob's row is gone, alice still there
    await expect(adminPage.getByTestId(`raffle-entry-row-${bobId}`)).toHaveCount(0, { timeout: 10000 })
    await expect(adminPage.getByTestId(`raffle-entry-row-${aliceId}`)).toBeVisible()

    await adminCtx.close()
  })
})
