import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, expectJson, getAuthHeadersFromPage } from '../helpers/auth'
import { adminApi, createEventApi, createRaffleApi, addRaffleEntryApi, startRaffleApi , enableEventFeature } from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Presentation mode
 * - Host opens Present, sees Draw button + Exit button
 * - Participant opens Present, `raffle-present-draw-btn` has count 0
 * - Esc exits
 * - Exit button exits
 * - Winners list updates after a draw with the new `raffle-winners-row-{drawId}`
 */

test.describe('Presentation mode', () => {
  test('host opens presentation view, sees Draw and Exit buttons', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    // Alice joins via GUI
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    const { headers: aliceHeaders } = await getAuthHeadersFromPage(alicePage, baseURL!)
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Get alice's userId
    const aliceProfileResp = await alicePage.request.get(`${baseURL}/api/profile`, { headers: aliceHeaders })
    const aliceProfile = await aliceProfileResp.json() as { id: string }
    const aliceUserId = aliceProfile.id
    await aliceCtx.close()

    // Admin creates raffle, adds alice with 3 tickets, starts via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Present Raffle ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 3 })
    await startRaffleApi(adminApiCtx, eventId, raffleId)
    await adminApiCtx.close()

    // Admin navigates to manage > raffles and opens presentation
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    // Auto-expand fires for the single raffle. Only click the card if not already expanded.
    const drawStageBtn = adminPage.getByTestId('raffle-draw-stage-btn')
    if (!(await drawStageBtn.isVisible().catch(() => false))) {
      await adminPage.getByTestId(`raffle-card-${raffleId}`).click()
    }
    await expect(drawStageBtn).toBeVisible({ timeout: 10000 })

    // Click Open Draw Stage — raffle is already in Drawing, so this only navigates
    await drawStageBtn.click()
    await adminPage.waitForURL(new RegExp(`/events/[^/]+/raffles/${raffleId}/present`), { timeout: 10000 })

    // Should navigate to presentation view
    await expect(adminPage.getByTestId('raffle-present-view')).toBeVisible({ timeout: 10000 })

    // Host should see Draw button and Exit button
    await expect(adminPage.getByTestId('raffle-present-draw-btn')).toBeVisible()
    await expect(adminPage.getByTestId('raffle-present-exit-btn')).toBeVisible()

    await adminCtx.close()
  })

  test('participant opens presentation view, Draw button has count 0', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event and raffle via API, starts it
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `Participant View Raffle ${uid()}`,
      price: 5,
    })
    await startRaffleApi(api, eventId, raffleId)
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    // Start
    await adminCtx.close()

    // Alice joins and navigates to presentation view
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 10000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Navigate directly to presentation route
    await alicePage.goto(`${baseURL}/events/${eventId}/raffles/${raffleId}/present`)
    await expect(alicePage.getByTestId('raffle-present-view')).toBeVisible({ timeout: 10000 })

    // Draw button should NOT be rendered (count 0)
    await expect(alicePage.getByTestId('raffle-present-draw-btn')).toHaveCount(0)

    // Exit button should be visible
    await expect(alicePage.getByTestId('raffle-present-exit-btn')).toBeVisible()

    await aliceCtx.close()
  })

  test('Esc key exits presentation view', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event, raffle, and starts via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `Esc Raffle ${uid()}`,
    })
    await startRaffleApi(api, eventId, raffleId)
    await api.close()

    // Admin navigates to event manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    const drawStageBtn = adminPage.getByTestId('raffle-draw-stage-btn')
    if (!(await drawStageBtn.isVisible().catch(() => false))) {
      await adminPage.getByTestId(`raffle-card-${raffleId}`).click()
    }
    await expect(drawStageBtn).toBeVisible({ timeout: 10000 })

    await drawStageBtn.click()
    await adminPage.waitForURL(new RegExp(`/events/[^/]+/raffles/${raffleId}/present`), { timeout: 10000 })
    await expect(adminPage.getByTestId('raffle-present-view')).toBeVisible({ timeout: 10000 })

    // Press Escape
    await adminPage.keyboard.press('Escape')

    // Should navigate back to event detail
    await adminPage.waitForURL((url) => !/\/raffles\/.+\/present/.test(url.toString()), { timeout: 10000 })
    await expect(adminPage.getByTestId('raffle-present-view')).toHaveCount(0)

    await adminCtx.close()
  })

  test('Exit button exits presentation view', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event, raffle, and starts via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `Exit Button Raffle ${uid()}`,
    })
    await startRaffleApi(api, eventId, raffleId)
    await api.close()

    // Admin navigates to event manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    const drawStageBtn = adminPage.getByTestId('raffle-draw-stage-btn')
    if (!(await drawStageBtn.isVisible().catch(() => false))) {
      await adminPage.getByTestId(`raffle-card-${raffleId}`).click()
    }
    await expect(drawStageBtn).toBeVisible({ timeout: 10000 })

    await drawStageBtn.click()
    await adminPage.waitForURL(new RegExp(`/events/[^/]+/raffles/${raffleId}/present`), { timeout: 10000 })
    await expect(adminPage.getByTestId('raffle-present-view')).toBeVisible({ timeout: 10000 })

    // Click Exit button
    await adminPage.getByTestId('raffle-present-exit-btn').click()

    // Should navigate back to event detail
    await adminPage.waitForURL((url) => !/\/raffles\/.+\/present/.test(url.toString()), { timeout: 10000 })
    await expect(adminPage.getByTestId('raffle-present-view')).toHaveCount(0)

    await adminCtx.close()
  })

  test('winners list updates after a draw with raffle-winners-row-{drawId}', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    // Alice joins via GUI
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    const { headers: aliceHeaders } = await getAuthHeadersFromPage(alicePage, baseURL!)
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Get alice's userId
    const aliceProfileResp = await alicePage.request.get(`${baseURL}/api/profile`, { headers: aliceHeaders })
    const aliceProfile = await aliceProfileResp.json() as { id: string }
    const aliceUserId = aliceProfile.id
    await aliceCtx.close()

    // Admin creates raffle, adds alice with 2 tickets, starts via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Winners Raffle ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 2 })
    await startRaffleApi(adminApiCtx, eventId, raffleId)
    await adminApiCtx.close()

    // Admin navigates to raffle on manage view and opens presentation
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    const drawStageBtn = adminPage.getByTestId('raffle-draw-stage-btn')
    if (!(await drawStageBtn.isVisible().catch(() => false))) {
      await adminPage.getByTestId(`raffle-card-${raffleId}`).click()
    }
    await expect(drawStageBtn).toBeVisible({ timeout: 10000 })

    await drawStageBtn.click()
    await adminPage.waitForURL(new RegExp(`/events/[^/]+/raffles/${raffleId}/present`), { timeout: 10000 })
    await expect(adminPage.getByTestId('raffle-present-view')).toBeVisible({ timeout: 10000 })

    // Draw
    await adminPage.getByTestId('raffle-present-draw-btn').click()
    const drawResp = await adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/draw`)
        && r.request().method() === 'POST'
        && r.status() === 200
    )
    const drawBody = await expectJson<{ drawId: string }>(drawResp)

    // Winner animation should appear
    await expect(adminPage.getByTestId('raffle-winner-reveal')).toBeVisible({ timeout: 10000 })

    // Winners list should now contain the draw (poll — reveal animation may delay it)
    await expect(adminPage.getByTestId(`raffle-winners-row-${drawBody.drawId}`)).toBeVisible({ timeout: 15000 })
    await expect(adminPage.getByTestId('raffle-winners-list')).toBeVisible()

    await adminCtx.close()
  })
})
