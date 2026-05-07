import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, expectJson, getAuthHeadersFromPage } from '../helpers/auth'
import { adminApi, createEventApi, createRaffleApi, addRaffleEntryApi, userApi, startRaffleApi } from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Recent raffle improvements
 *
 * Covers features added after the initial raffle test suite:
 * - Winners list visible to non-host participants (RaffleParticipantView)
 * - Lock-submissions banner toggles selfReporting off
 * - Profile picture URLs included in entry/draw/winner-reveal payloads
 * - Live entry-count updates pushed to participant view via SignalR
 */

test.describe('Raffle improvements (winners visibility, lock toggle, avatars, live counts)', () => {
  test('participant sees Winners list under raffle card after a draw', async ({ browser, baseURL, createdEvents }) => {
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

    // Admin creates raffle, adds alice with 3 tickets, starts, draws via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Winners Show ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 3 })
    await startRaffleApi(adminApiCtx, eventId, raffleId)

    // Draw via API
    const drawResp = await adminApiCtx.request.post(
      `${adminApiCtx.baseURL}/api/events/${eventId}/raffles/${raffleId}/draw`,
      { headers: adminApiCtx.headers }
    )
    const drawBody = await drawResp.json() as { drawId: string; profilePictureUrl: string | null }
    await adminApiCtx.close()

    // Admin opens the manage view raffles tab to confirm the raffle is there
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    await adminCtx.close()

    // Alice navigates to raffle and should see the winners list on the card.
    const { context: aliceCtx2, page: alicePage2 } = await contextAs(browser, 'alice')
    await alicePage2.goto(`${baseURL}/events/${eventId}`)
    await alicePage2.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 10000 })
    await alicePage2.getByTestId('event-tab-raffles').click()
    await alicePage2.getByTestId(`raffle-card-${raffleId}`).click()

    await expect(alicePage2.getByTestId('raffle-participant-winners')).toBeVisible({ timeout: 10000 })
    await expect(alicePage2.getByTestId(`raffle-participant-winner-${drawBody.drawId}`)).toBeVisible()

    await aliceCtx2.close()
  })

  test('lock-submissions button disables selfReporting on the raffle', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event and raffle via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `Lockable ${uid()}`,
      allowSelfReport: true,
    })
    await api.close()

    // Admin navigates to manage view raffles tab
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    const { headers: adminHeaders } = await getAuthHeadersFromPage(adminPage, baseURL!)
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    // Single raffle is auto-expanded — no card click needed (would collapse it).
    // Lock submissions banner should be visible
    const lockBtn = adminPage.getByTestId('raffle-lock-submissions-btn')
    await expect(lockBtn).toBeVisible({ timeout: 10000 })

    // Clicking the lock button now opens a confirmation dialog
    await lockBtn.click()
    const confirmBtn = adminPage.getByTestId('confirm-dialog-confirm')
    await expect(confirmBtn).toBeVisible()

    const patchResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}`) && r.request().method() === 'PATCH'
    )
    await confirmBtn.click()
    const patchResult = await patchResp
    expect(patchResult.status()).toBe(200)

    // Verify via API
    const verifyResp = await adminPage.request.get(`${baseURL}/api/events/${eventId}/raffles/${raffleId}`, { headers: adminHeaders })
    const verifyBody = await verifyResp.json() as { selfReportingEnabled: boolean }
    expect(verifyBody.selfReportingEnabled).toBe(false)

    await adminCtx.close()
  })

  test('raffle entry payload includes profilePictureUrl field', async ({ browser, baseURL, createdEvents }) => {
    // Pure payload contract check — no manage-view UI interaction needed
    // (the auto-expand watcher in RafflesSection has a tendency to interfere
    //  with raffle state if a stray click reaches raffle-draw-stage-btn).
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await api.close()

    // Alice joins via UI (only way to become a participant)
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    const { headers: aliceHeaders } = await getAuthHeadersFromPage(alicePage, baseURL!)
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 10000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    const aliceProfileResp = await alicePage.request.get(`${baseURL}/api/profile`, { headers: aliceHeaders })
    const aliceProfile = await aliceProfileResp.json() as { id: string }
    const aliceUserId = aliceProfile.id
    await aliceCtx.close()

    // Admin creates raffle, adds alice, starts, draws — all via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Avatar Raffle ${uid()}`,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 1 })

    // GET raffle should include profilePictureUrl key on each entry (may be null)
    const raffleResp = await adminApiCtx.request.get(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}`,
      { headers: adminApiCtx.headers },
    )
    const raffleData = await raffleResp.json() as {
      entries: Array<{ userId: string; displayName: string; profilePictureUrl: string | null; tickets: number }>
    }
    expect(raffleData.entries.length).toBeGreaterThan(0)
    for (const entry of raffleData.entries) {
      expect(entry).toHaveProperty('profilePictureUrl')
    }

    await startRaffleApi(adminApiCtx, eventId, raffleId)
    const drawResp = await adminApiCtx.request.post(
      `${adminApiCtx.baseURL}/api/events/${eventId}/raffles/${raffleId}/draw`,
      { headers: adminApiCtx.headers }
    )
    const drawBody = await drawResp.json()
    expect(drawBody).toHaveProperty('profilePictureUrl')

    // Draws list endpoint should also include the field
    const drawsResp = await adminApiCtx.request.get(
      `${adminApiCtx.baseURL}/api/events/${eventId}/raffles/${raffleId}/draws`,
      { headers: adminApiCtx.headers },
    )
    const drawsBody = await drawsResp.json() as Array<{ id: string; profilePictureUrl: string | null }>
    expect(drawsBody.length).toBeGreaterThan(0)
    for (const draw of drawsBody) {
      expect(draw).toHaveProperty('profilePictureUrl')
    }
    await adminApiCtx.close()
  })

  test('participant raffle card live-updates entry count when admin adds a participant', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    // Alice joins event
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

    // Admin creates raffle via API
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Live Raffle ${uid()}`,
    })

    // Alice opens raffles tab BEFORE admin adds her - should see 0 entries
    await alicePage.getByTestId('event-tab-raffles').click()
    await expect(alicePage.getByTestId(`raffle-card-${raffleId}`)).toBeVisible({ timeout: 10000 })

    // Admin adds alice via API (realtime test - alice observes the update)
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 1 })
    await adminApiCtx.close()

    // Alice's raffle card should reflect 1 entry via realtime within a few seconds
    const aliceCard = alicePage.getByTestId(`raffle-card-${raffleId}`)
    await expect(aliceCard).toContainText(/1/, { timeout: 10000 })

    await aliceCtx.close()
    await adminCtx.close()
  })
})
