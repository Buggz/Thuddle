import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, expectJson, STORAGE_STATE } from '../helpers/auth'
import {
  adminApi,
  createEventApi,
  createRaffleApi,
  addRaffleEntryApi,
  startRaffleApi,
  enableEventFeature,
} from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Drawing happens only from the presentation view.
 *
 * The Draw Winner button has been removed from the manage tab. The new
 * "Open Draw Stage" button on the manage card navigates to the presentation
 * route, where the actual draw happens via raffle-present-draw-btn.
 */

async function joinAndGetUserId(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  eventId: string,
): Promise<string> {
  const ctx = await browser.newContext({ storageState: STORAGE_STATE.alice })
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

  if (!token) throw new Error('Failed to capture bearer token for alice')
  const profileResp = await page.request.get(`${baseURL}/api/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const profile = await expectJson<{ id: string }>(profileResp)

  await ctx.close()
  return profile.id
}

test.describe('Draw only from presentation view', () => {
  test('manage tab has no draw button; Open Draw Stage navigates to presentation where draw happens', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await api.close()

    // Alice joins so she can be a raffle entry
    const aliceId = await joinAndGetUserId(browser, baseURL!, eventId)

    // Admin creates raffle, seeds entries, starts it -> Drawing
    const adminCtxApi = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminCtxApi, eventId, {
      name: `Presentation-Only Draw Raffle ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminCtxApi, eventId, raffleId, { userId: aliceId, tickets: 3 })
    await startRaffleApi(adminCtxApi, eventId, raffleId)
    await adminCtxApi.close()

    // Admin opens the manage tab and expands the raffle
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    // The old Draw Winner button must not be present anywhere on the page
    await expect(adminPage.getByTestId('raffle-draw-btn')).toHaveCount(0)

    // The new draw-stage button is visible and labelled "Open Draw Stage"
    const drawStageBtn = adminPage.getByTestId('raffle-draw-stage-btn')
    await expect(drawStageBtn).toBeVisible()
    await expect(drawStageBtn).toHaveText(/Open Draw Stage/i)

    // Click it -> navigates to the presentation route
    await drawStageBtn.click()
    await adminPage.waitForURL(
      new RegExp(`/events/[^/]+/raffles/${raffleId}/present`),
      { timeout: 10000 },
    )
    await expect(adminPage.getByTestId('raffle-present-view')).toBeVisible({ timeout: 10000 })

    // Draw button on the presentation view is visible
    const presentDrawBtn = adminPage.getByTestId('raffle-present-draw-btn')
    await expect(presentDrawBtn).toBeVisible()

    // Click it and assert a winner row appears (same pattern as presentation-mode.spec.ts)
    await presentDrawBtn.click()
    const drawResp = await adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/draw`) &&
        r.request().method() === 'POST' &&
        r.status() === 200,
    )
    const drawBody = await expectJson<{ drawId: string }>(drawResp)

    await expect(adminPage.getByTestId('raffle-winner-reveal')).toBeVisible({ timeout: 10000 })
    // Wait for the reveal animation to settle and the winners list to render
    await adminPage.waitForTimeout(4000)
    await expect(adminPage.getByTestId('raffle-winners-list')).toBeVisible()
    await expect(adminPage.getByTestId(`raffle-winners-row-${drawBody.drawId}`)).toBeVisible()

    await adminCtx.close()
  })
})
