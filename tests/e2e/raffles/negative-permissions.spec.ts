import { test, expect } from '../helpers/fixtures'
import { contextAs, uid } from '../helpers/auth'
import { adminApi, createEventApi, createRaffleApi, startRaffleApi } from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Negative permissions tests
 * - Anonymous → presentation route redirects to login
 * - Bob (non-participant) gets 404/403 from raffle endpoints
 * - Non-host cannot start/draw via API
 * - Deleting a raffle in Drawing state returns 409
 */

test.describe('Negative permissions and error cases', () => {
  test('anonymous user redirected to login when accessing presentation route', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await api.close()

    // Admin creates raffle via GUI on the manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    const raffleName = `Anon Raffle ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)

    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles`) && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    const createBody = await createResult.json()
    const raffleId = createBody.id

    await adminCtx.close()

    // Anonymous user navigates directly to presentation route
    const anonCtx = await browser.newContext()
    const anonPage = await anonCtx.newPage()
    await anonPage.goto(`${baseURL}/events/${eventId}/raffles/${raffleId}/present`)

    // Should redirect to login page (Keycloak)
    await anonPage.waitForURL((url) => url.toString().includes('/realms/'), { timeout: 10000 })
    expect(anonPage.url()).toContain('/realms/')

    await anonCtx.close()
  })

  test('non-participant (bob) gets 403 from raffle endpoints', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates invite-only event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { joinMode: 1 })
    createdEvents.push(eventId)
    await api.close()

    // Admin creates raffle via GUI on the manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    const raffleName = `Bob Test Raffle ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)

    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles`) && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    const createBody = await createResult.json()
    const raffleId = createBody.id

    await adminCtx.close()

    // Bob (not invited) tries to list raffles
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    let bobToken = ''
    bobPage.on('request', (req) => {
      const auth = req.headers()['authorization']
      if (auth?.startsWith('Bearer ')) bobToken = auth.substring(7)
    })
    await bobPage.goto(baseURL!)
    await bobPage.waitForResponse((r) => r.url().includes('/api/profile') && r.status() === 200, { timeout: 10000 })

    const listResp = await bobPage.request.get(
      `${baseURL}/api/events/${eventId}/raffles`,
      {
        headers: { Authorization: `Bearer ${bobToken}` },
      }
    )

    expect(listResp.status()).toBe(403)

    // Try to get specific raffle
    const getResp = await bobPage.request.get(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}`,
      {
        headers: { Authorization: `Bearer ${bobToken}` },
      }
    )

    expect(getResp.status()).toBe(403)

    await bobCtx.close()
  })

  test('non-host cannot start or draw via API', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates public event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await api.close()

    // Alice joins
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Admin creates raffle via GUI on the manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    const raffleName = `Non-Host Raffle ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)
    await adminPage.getByTestId('raffle-price-input').fill('5')

    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles`) && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    const createBody = await createResult.json()
    const raffleId = createBody.id

    await adminCtx.close()

    // Alice tries to start the raffle
    let aliceToken = ''
    alicePage.on('request', (req) => {
      const auth = req.headers()['authorization']
      if (auth?.startsWith('Bearer ')) aliceToken = auth.substring(7)
    })
    await alicePage.reload()
    await alicePage.waitForResponse((r) => r.url().includes('/api/profile') && r.status() === 200, { timeout: 10000 })

    const startResp = await alicePage.request.post(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}/start`,
      {
        headers: { Authorization: `Bearer ${aliceToken}` },
      }
    )

    expect(startResp.status()).toBe(403)

    // Alice tries to draw
    const drawResp = await alicePage.request.post(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}/draw`,
      {
        headers: { Authorization: `Bearer ${aliceToken}` },
      }
    )

    expect(drawResp.status()).toBe(403)

    await aliceCtx.close()
  })

  test('soft-deleting a raffle in Drawing state succeeds and marks it deleted', async ({ browser, baseURL, createdEvents }) => {
    // Soft-delete is allowed in any state (incl. Drawing) so hosts can review draws/refunds.
    // Admin creates event, raffle, and starts via API (no UI start button anymore).
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `Delete Test Raffle ${uid()}`,
    })
    await startRaffleApi(api, eventId, raffleId)

    // First delete: soft-deletes successfully
    const deleteResp = await api.request.delete(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}`,
      { headers: api.headers }
    )
    expect(deleteResp.status()).toBe(204)

    // Second delete: 409 because already deleted
    const deleteResp2 = await api.request.delete(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}`,
      { headers: api.headers }
    )
    expect(deleteResp2.status()).toBe(409)
    const errorBody = await deleteResp2.json() as { error: string }
    expect(errorBody.error.toLowerCase()).toContain('deleted')

    await api.close()
  })

  test('non-host visiting /events/:id/manage cannot author raffles', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates a public event
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await api.close()

    // Alice joins the event but is NOT a host / co-admin
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // The host-only Manage link must not be offered on the public event view
    await expect(alicePage.getByTestId('event-manage-link')).toHaveCount(0)

    // Even if she navigates directly to the manage URL, host-authoring controls
    // for raffles must not be exposed to her.
    await alicePage.goto(`${baseURL}/events/${eventId}/manage`)
    await alicePage.waitForLoadState('networkidle')
    await expect(alicePage.getByTestId('manage-raffles-tab')).toHaveCount(0)
    await expect(alicePage.getByTestId('raffle-create-btn')).toHaveCount(0)

    await aliceCtx.close()
  })
})
