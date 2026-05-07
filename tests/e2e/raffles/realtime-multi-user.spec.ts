import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, expectJson, getAuthHeadersFromPage } from '../helpers/auth'
import { adminApi, createEventApi, createRaffleApi, addRaffleEntryApi, startRaffleApi } from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Realtime multi-user
 * - Two contexts (admin + alice, both event participants)
 * - Admin draws → both see raffle-winner-reveal and same winner name within timeout
 * - Admin sets alice's tickets → alice's view updates without reload
 * - Admin starts the raffle → alice's UI locks
 */

test.describe('Realtime multi-user raffle updates', () => {
  test('admin draws, both users see winner reveal with same winner name', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    // Alice joins via GUI (needs to be participant for realtime)
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

    // Admin creates raffle, adds alice with 3 tickets, starts via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Realtime Raffle ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 3 })
    await startRaffleApi(adminApiCtx, eventId, raffleId)
    await adminApiCtx.close()

    // Admin navigates directly to the presentation view (host has draw button)
    await adminPage.goto(`${baseURL}/events/${eventId}/raffles/${raffleId}/present`)
    await expect(adminPage.getByTestId('raffle-present-view')).toBeVisible({ timeout: 10000 })

    // Alice (participant) opens presentation via the public event raffles tab
    await alicePage.getByTestId('event-tab-raffles').click()
    await alicePage.goto(`${baseURL}/events/${eventId}/raffles/${raffleId}/present`)
    await expect(alicePage.getByTestId('raffle-present-view')).toBeVisible({ timeout: 10000 })

    // Give Alice's SignalR SubscribeEvents call a moment to complete before admin draws.
    // loadEvent fires subscribeEvents without awaiting it — without this wait, the broadcast
    // may be sent before Alice's connection has joined the event group.
    await alicePage.waitForTimeout(750)

    // Admin draws
    await adminPage.getByTestId('raffle-present-draw-btn').click()
    const drawResp = await adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/draw`)
        && r.request().method() === 'POST'
        && r.status() === 200
    )
    const drawBody = await drawResp.json() as { displayName: string }

    // Both should see winner reveal
    await expect(adminPage.getByTestId('raffle-winner-reveal')).toBeVisible({ timeout: 10000 })
    await expect(alicePage.getByTestId('raffle-winner-reveal')).toBeVisible({ timeout: 10000 })

    // Both should see the same winner name
    const adminWinnerName = await adminPage.getByTestId('raffle-winner-name').textContent()
    const aliceWinnerName = await alicePage.getByTestId('raffle-winner-name').textContent()
    expect(adminWinnerName).toBe(aliceWinnerName)
    expect(adminWinnerName).toContain(drawBody.displayName)

    await adminCtx.close()
    await aliceCtx.close()
  })

  test('admin sets alice tickets, alice sees update without reload', async ({ browser, baseURL, createdEvents }) => {
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
    const aliceProfile = await aliceProfileResp.json() as { id: string }
    const aliceUserId = aliceProfile.id

    // Admin creates raffle with self-report enabled, adds alice via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Realtime Entry Raffle ${uid()}`,
      price: 5,
      allowSelfReport: true,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 1 })

    // Alice navigates to raffles tab on public event view (observes realtime updates)
    await alicePage.getByTestId('event-tab-raffles').click()
    await expect(alicePage.getByTestId('raffles-section')).toBeVisible()
    // Single raffle is auto-expanded — do NOT click (would collapse it).
    await expect(alicePage.getByTestId(`raffle-card-${raffleId}`)).toBeVisible({ timeout: 10000 })

    // Admin sets tickets to 7 via API
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 7 })
    await adminApiCtx.close()

    // Alice's self-tickets input (RaffleParticipantView) should update to 7 via realtime
    const aliceTicketsInput = alicePage.getByTestId('raffle-self-tickets-input')
    await expect(aliceTicketsInput).toHaveValue('7', { timeout: 10000 })

    await adminCtx.close()
    await aliceCtx.close()
  })

  test('admin starts raffle, alice UI locks', async ({ browser, baseURL, createdEvents }) => {
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
    const aliceProfile = await aliceProfileResp.json() as { id: string }
    const aliceUserId = aliceProfile.id

    // Admin creates raffle with self-report enabled, adds alice via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Realtime Lock Raffle ${uid()}`,
      price: 5,
      allowSelfReport: true,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 1 })

    // Alice navigates to raffles tab on public event view (observes self-tickets input before start)
    await alicePage.getByTestId('event-tab-raffles').click()
    await alicePage.getByTestId(`raffle-card-${raffleId}`).click()

    // Alice's self-tickets input is visible & enabled (raffle Open + selfReport on)
    const aliceTicketsInput = alicePage.getByTestId('raffle-self-tickets-input')
    await expect(aliceTicketsInput).toBeVisible({ timeout: 10000 })
    await expect(aliceTicketsInput).toBeEnabled()

    // Admin starts the raffle via API
    await startRaffleApi(adminApiCtx, eventId, raffleId)
    await adminApiCtx.close()

    // Alice's self-tickets input should disappear (RaffleParticipantView swaps to "Drawing in progress" badge)
    await expect(aliceTicketsInput).toHaveCount(0, { timeout: 10000 })

    await adminCtx.close()
    await aliceCtx.close()
  })
})
