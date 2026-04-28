import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, expectJson, getAuthHeadersFromPage } from '../helpers/auth'
import { adminApi, createEventApi, createRaffleApi, addRaffleEntryApi, startRaffleApi } from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Start and draw
 * - Start transitions Open → Drawing
 * - Draw produces a winner and decrements that user's tickets by 1
 * - Draw history grows
 * - When total tickets reach 0, second draw API returns 409 and the no-tickets message appears in presentation view
 * - Second start API call returns 409
 */

test.describe('Start and draw raffle', () => {
  test('start transitions Open to Drawing', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event and raffle via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `Start Raffle ${uid()}`,
      price: 10,
    })
    await api.close()

    // Admin navigates to event manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    // Status should be Open
    await expect(adminPage.locator('text=/Open/i')).toBeVisible()

    // Click start
    await adminPage.getByTestId('raffle-start-btn').click()
    const startResp = await adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/start`) && r.status() === 200
    )
    const startBody = await expectJson<{ started: boolean; status: string }>(startResp)
    expect(startBody.status).toBe('Drawing')

    // Status should update to Drawing
    await adminPage.waitForTimeout(1000)
    await expect(adminPage.getByTestId(`raffle-status-badge-${raffleId}`)).toHaveText(/Drawing/i)

    await adminCtx.close()
  })

  test('draw produces a winner and decrements tickets by 1', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
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
    const aliceProfile = await expectJson<{ id: string }>(aliceProfileResp)
    const aliceUserId = aliceProfile.id
    await aliceCtx.close()

    // Admin creates raffle, adds alice with 5 tickets, starts via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Draw Raffle ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 5 })
    await startRaffleApi(adminApiCtx, eventId, raffleId)
    await adminApiCtx.close()

    // Admin navigates to raffle (re-open manage tab so the new raffle is in view)
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    // Draw
    await adminPage.getByTestId('raffle-draw-btn').click()
    const drawResp = await adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/draw`)
        && r.request().method() === 'POST'
        && r.status() === 200
    )
    const drawBody = await expectJson<{ drawId: string; winnerUserId: string; displayName: string; ticketsBefore: number; ticketsAfter: number }>(drawResp)

    expect(drawBody.winnerUserId).toBe(aliceUserId)
    expect(drawBody.ticketsBefore).toBe(5)
    expect(drawBody.ticketsAfter).toBe(4)

    await adminCtx.close()
  })

  test('draw history grows with each draw', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
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
    const aliceProfile = await expectJson<{ id: string }>(aliceProfileResp)
    const aliceUserId = aliceProfile.id
    await aliceCtx.close()

    // Admin creates raffle, adds alice with 3 tickets, starts via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `History Raffle ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 3 })
    await startRaffleApi(adminApiCtx, eventId, raffleId)
    await adminApiCtx.close()

    // Admin navigates to raffle (re-open manage tab so the new raffle is in view)
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    // Draw 1
    await adminPage.getByTestId('raffle-draw-btn').click()
    const draw1Resp = await adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/draw`)
        && r.request().method() === 'POST'
        && r.status() === 200
    )
    const draw1Body = await expectJson<{ drawId: string }>(draw1Resp)

    // History should have 1 item
    await adminPage.waitForTimeout(500)
    await expect(adminPage.getByTestId('raffle-history-list')).toBeVisible()
    await expect(adminPage.getByTestId(`raffle-history-row-${draw1Body.drawId}`)).toBeVisible()

    // Draw 2
    await adminPage.getByTestId('raffle-draw-btn').click()
    const draw2Resp = await adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/draw`)
        && r.request().method() === 'POST'
        && r.status() === 200
    )
    const draw2Body = await expectJson<{ drawId: string }>(draw2Resp)

    // History should have 2 items
    await adminPage.waitForTimeout(500)
    await expect(adminPage.getByTestId(`raffle-history-row-${draw1Body.drawId}`)).toBeVisible()
    await expect(adminPage.getByTestId(`raffle-history-row-${draw2Body.drawId}`)).toBeVisible()

    await adminCtx.close()
  })

  test('when total tickets reach 0, draw returns 409 with no-tickets message', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
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
    const aliceProfile = await expectJson<{ id: string }>(aliceProfileResp)
    const aliceUserId = aliceProfile.id
    await aliceCtx.close()

    // Admin creates raffle, adds alice with 1 ticket, starts, draws via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Single Ticket Raffle ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 1 })
    await startRaffleApi(adminApiCtx, eventId, raffleId)

    // Draw once via API
    await adminApiCtx.request.post(
      `${adminApiCtx.baseURL}/api/events/${eventId}/raffles/${raffleId}/draw`,
      { headers: adminApiCtx.headers }
    )

    // Try to draw again — should get 409
    const draw2Resp = await adminApiCtx.request.post(
      `${adminApiCtx.baseURL}/api/events/${eventId}/raffles/${raffleId}/draw`,
      { headers: adminApiCtx.headers }
    )
    expect(draw2Resp.status()).toBe(409)
    const errorBody = await draw2Resp.json() as { error: string }
    expect(errorBody.error.toLowerCase()).toContain('no tickets')
    await adminApiCtx.close()

    await adminCtx.close()
  })

  test('second start API call returns 409', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event, raffle, and starts via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `Double Start Raffle ${uid()}`,
      price: 10,
    })
    await startRaffleApi(api, eventId, raffleId)

    // Try to start again via API
    const start2Resp = await api.request.post(
      `${api.baseURL}/api/events/${eventId}/raffles/${raffleId}/start`,
      { headers: api.headers }
    )
    expect(start2Resp.status()).toBe(409)
    await api.close()
  })
})
