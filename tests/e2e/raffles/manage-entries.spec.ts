import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, expectJson, getAuthHeadersFromPage } from '../helpers/auth'
import { adminApi, createEventApi, createRaffleApi, addRaffleEntryApi, startRaffleApi } from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Manage raffle entries
 * - Host adds participants and sets tickets
 * - Participant without self-report cannot edit own count
 * - Participant with self-report can edit own count
 * - Non-participant API call to set someone else's tickets is rejected
 * - Entries become read-only once Drawing
 */

test.describe('Manage raffle entries', () => {
  test('host adds participants and sets their ticket counts', async ({ browser, baseURL, createdEvents }) => {
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
    await aliceCtx.close()

    // Admin creates a raffle on the manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    const { headers: adminHeaders } = await getAuthHeadersFromPage(adminPage, baseURL!)
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    const raffleName = `Entry Raffle ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)
    await adminPage.getByTestId('raffle-price-input').fill('5')

    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles`) && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    const createBody = await createResult.json()
    const raffleId = createBody.id

    // Newly-created raffle auto-expands once handleSave's fetchRaffles refresh
    // settles (single raffle on this page). Wait for the search input rather
    // than racing the auto-expand watcher with a manual click.
    const searchInput = adminPage.locator('[data-testid="raffle-entry-add-btn"] input')
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    // Add alice via the UserSearchComboBox — wait for the search request rather than a fixed debounce
    const searchRespPromise = adminPage.waitForResponse(
      (r) => r.url().includes('/api/users/search') && r.status() === 200,
      { timeout: 10000 },
    )
    await searchInput.fill('alice')
    await searchRespPromise

    const combobox = adminPage.getByTestId('user-search-combobox')
    await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
    await combobox.getByTestId('user-search-result').filter({ hasText: 'alice' }).first().click()

    // Alice should now appear in the entries list
    // Wait for the API call to complete
    await adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/entries`) && r.request().method() === 'PUT',
      { timeout: 10000 }
    )

    // Load raffle detail to get alice's userId
    const raffleResp = await adminPage.request.get(`${baseURL}/api/events/${eventId}/raffles/${raffleId}`, { headers: adminHeaders })
    const raffleData = await expectJson<{ entries: Array<{ userId: string; displayName: string; tickets: number }> }>(raffleResp)
    const aliceEntry = raffleData.entries.find((e) => e.displayName.toLowerCase().includes('alice'))
    expect(aliceEntry).toBeDefined()
    const aliceUserId = aliceEntry!.userId

    // Set alice's tickets to 5
    const ticketsInput = adminPage.getByTestId(`raffle-tickets-input-${aliceUserId}`)
    await ticketsInput.fill('5')
    await ticketsInput.press('Tab') // trigger save on blur

    await adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/entries/${aliceUserId}`) && r.request().method() === 'PUT',
      { timeout: 10000 }
    )

    // Verify the count updated
    await expect(ticketsInput).toHaveValue('5')

    await adminCtx.close()
  })

  test('participant without self-report cannot edit own ticket count', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API (self-report disabled on raffle)
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await api.close()

    // Admin creates raffle via GUI on manage view with self-report OFF
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    const raffleName = `No Self-Report Raffle ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)
    await adminPage.getByTestId('raffle-price-input').fill('5')
    // self-report is OFF by default

    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles`) && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    const createBody = await createResult.json()
    const raffleId = createBody.id

    await adminCtx.close()

    // Alice joins and navigates to raffle
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    const { token: aliceToken, headers: aliceHeaders } = await getAuthHeadersFromPage(alicePage, baseURL!)
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    await alicePage.getByTestId('event-tab-raffles').click()

    // Expand the raffle
    await alicePage.getByTestId(`raffle-card-${raffleId}`).click()

    // Get alice's userId from profile

    const profileResp = await alicePage.request.get(`${baseURL}/api/profile`, { headers: aliceHeaders })
    const profileData = await expectJson<{ id: string }>(profileResp)
    const aliceUserId = profileData.id

    // Try to set alice's own tickets via API (should fail because self-report is disabled)
    const setResp = await alicePage.request.put(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}/entries/${aliceUserId}`,
      {
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        data: { tickets: 10 },
      }
    )

    // Should be forbidden
    expect(setResp.status()).toBe(403)

    await aliceCtx.close()
  })

  test('participant with self-report can edit own ticket count', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API (self-report enabled on raffle)
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await api.close()

    // Admin creates raffle via GUI on manage view with self-report ON
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    const raffleName = `Self-Report Raffle ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)
    await adminPage.getByTestId('raffle-price-input').fill('5')
    await adminPage.getByTestId('raffle-selfreport-toggle').click() // enable self-reporting

    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles`) && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    const createBody = await createResult.json()
    const raffleId = createBody.id

    await adminCtx.close()

    // Alice joins and sets her own tickets
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    const { token: aliceToken, headers: aliceHeaders } = await getAuthHeadersFromPage(alicePage, baseURL!)
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Capture alice token

    const profileResp = await alicePage.request.get(`${baseURL}/api/profile`, { headers: aliceHeaders })
    const profileData = await expectJson<{ id: string }>(profileResp)
    const aliceUserId = profileData.id

    // Alice sets her own tickets
    const setResp = await alicePage.request.put(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}/entries/${aliceUserId}`,
      {
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        data: { tickets: 7 },
      }
    )

    expect(setResp.status()).toBe(200)
    const setBody = await expectJson<{ updated: boolean; tickets: number }>(setResp)
    expect(setBody.tickets).toBe(7)

    await aliceCtx.close()
  })

  test('during Drawing: host can still edit entries; participant cannot edit anyone elses', async ({ browser, baseURL, createdEvents }) => {
    // Hosts retain full control of entries during Drawing (UI + API).
    // Participants never see other entries' edit controls in RaffleParticipantView.
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await api.close()

    // Alice + Bob join the event
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    const { token: aliceToken, headers: aliceHeaders } = await getAuthHeadersFromPage(alicePage, baseURL!)
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    const aliceProfileResp = await alicePage.request.get(`${baseURL}/api/profile`, { headers: aliceHeaders })
    const aliceProfile = await expectJson<{ id: string }>(aliceProfileResp)
    const aliceUserId = aliceProfile.id
    await aliceCtx.close()

    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    const { headers: bobHeaders } = await getAuthHeadersFromPage(bobPage, baseURL!)
    await bobPage.goto(`${baseURL}/events/${eventId}`)
    await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await bobPage.getByTestId('event-join-btn').click()
    await expect(bobPage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    const bobProfileResp = await bobPage.request.get(`${baseURL}/api/profile`, { headers: bobHeaders })
    const bobProfile = await expectJson<{ id: string }>(bobProfileResp)
    const bobUserId = bobProfile.id
    await bobCtx.close()

    // Admin creates raffle, seeds entries, starts it -> Drawing (all via API)
    const adminApiCtx = await adminApi(browser, baseURL!)
    const { id: raffleId } = await createRaffleApi(adminApiCtx, eventId, {
      name: `Drawing Editable ${uid()}`,
      price: 5,
    })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: aliceUserId, tickets: 3 })
    await addRaffleEntryApi(adminApiCtx, eventId, raffleId, { userId: bobUserId, tickets: 2 })
    await startRaffleApi(adminApiCtx, eventId, raffleId)
    await adminApiCtx.close()

    // ── Host page: edit + remove still work in Drawing ─────────────────────
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await expect(adminPage.getByTestId(`raffle-status-badge-${raffleId}`)).toHaveText(/Drawing/i, { timeout: 10000 })

    // Single raffle is auto-expanded — do NOT click the card (would collapse it).
    const aliceTickets = adminPage.getByTestId(`raffle-tickets-input-${aliceUserId}`)
    await expect(aliceTickets).toBeVisible({ timeout: 10000 })
    await expect(aliceTickets).toBeEnabled()

    // Edit alice's tickets 3 -> 4
    const updateRespPromise = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/entries/${aliceUserId}`) &&
        r.request().method() === 'PUT',
      { timeout: 10000 },
    )
    await aliceTickets.fill('4')
    await aliceTickets.press('Tab')
    const updateResp = await updateRespPromise
    expect(updateResp.status()).toBe(200)
    await expect(aliceTickets).toHaveValue('4')

    // Remove bob's entry
    const deleteRespPromise = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/entries/${bobUserId}`) &&
        r.request().method() === 'DELETE',
      { timeout: 10000 },
    )
    await adminPage.getByTestId(`raffle-entry-remove-${bobUserId}`).click()
    await adminPage.getByTestId('confirm-dialog-confirm').click()
    const deleteResp = await deleteRespPromise
    expect(deleteResp.status()).toBe(204)
    await expect(adminPage.getByTestId(`raffle-entry-row-${bobUserId}`)).toHaveCount(0, { timeout: 10000 })
    await expect(adminPage.getByTestId(`raffle-entry-row-${aliceUserId}`)).toBeVisible()
    await adminCtx.close()

    // ── Alice page: participant view never exposes other entries' edit controls ──
    const { context: aliceCtx2, page: alicePage2 } = await contextAs(browser, 'alice')
    await alicePage2.goto(`${baseURL}/events/${eventId}`)
    await alicePage2.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage2.getByTestId('event-tab-raffles').click()
    await alicePage2.getByTestId(`raffle-card-${raffleId}`).click()

    // Participant view (RaffleParticipantView) does not render per-entry rows or
    // tickets-input controls for any user (host or other participants).
    await expect(alicePage2.getByTestId(`raffle-tickets-input-${aliceUserId}`)).toHaveCount(0)
    await expect(alicePage2.getByTestId(`raffle-entry-row-${aliceUserId}`)).toHaveCount(0)
    // Whatever bob's userId would have been
    await expect(alicePage2.getByTestId(`raffle-entry-remove-${aliceUserId}`)).toHaveCount(0)

    // And the API rejects a participant trying to PUT another user's entry
    const aliceWriteOther = await alicePage2.request.put(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}/entries/${aliceUserId}`,
      {
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        data: { tickets: 99 },
      },
    )
    // Self-reporting is disabled on this raffle so even her own entry is forbidden
    expect(aliceWriteOther.status()).toBe(403)

    await aliceCtx2.close()
  })
})

