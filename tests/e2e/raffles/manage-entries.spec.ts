import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, expectJson, getAuthHeadersFromPage } from '../helpers/auth'
import { adminApi, createEventApi } from '../helpers/api'
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

    // Expand the raffle card
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    // Add alice via the UserSearchComboBox
    // The testid "raffle-entry-add-btn" wraps the input
    const searchInput = adminPage.locator('[data-testid="raffle-entry-add-btn"] input')
    await searchInput.fill('alice')
    await adminPage.waitForTimeout(500) // wait for debounce
    await adminPage.locator('text=/alice/i').first().click()

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

  test('entries become read-only once Drawing', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
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

    // Admin creates raffle on manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    const { token: adminToken, headers: adminHeaders } = await getAuthHeadersFromPage(adminPage, baseURL!)
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    const raffleName = `Read-Only Test ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)
    await adminPage.getByTestId('raffle-price-input').fill('5')

    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles`) && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    const createBody = await createResult.json()
    const raffleId = createBody.id

    // Expand raffle
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    // Add alice
    const searchInput = adminPage.locator('[data-testid="raffle-entry-add-btn"] input')
    await searchInput.fill('alice')
    await adminPage.waitForTimeout(500)
    await adminPage.locator('text=/alice/i').first().click()
    await adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/entries`) && r.request().method() === 'PUT',
      { timeout: 10000 }
    )

    // Get alice's userId
    const raffleResp = await adminPage.request.get(`${baseURL}/api/events/${eventId}/raffles/${raffleId}`, { headers: adminHeaders })
    const raffleData = await expectJson<{ entries: Array<{ userId: string; displayName: string; tickets: number }> }>(raffleResp)
    const aliceEntry = raffleData.entries.find((e) => e.displayName.toLowerCase().includes('alice'))
    const aliceUserId = aliceEntry!.userId

    // Set tickets to 3
    const ticketsInput = adminPage.getByTestId(`raffle-tickets-input-${aliceUserId}`)
    const setTicketsResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/entries/${aliceUserId}`) && r.request().method() === 'PUT',
      { timeout: 10000 }
    )
    await ticketsInput.fill('3')
    await ticketsInput.press('Enter')
    await setTicketsResp

    // Start the raffle
    await adminPage.getByTestId('raffle-start-btn').click()
    await adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}/start`) && r.status() === 200
    )
    await adminPage.waitForTimeout(1000)

    // In Drawing state RaffleEntries.vue unmounts the input (v-if isOpen()) and shows
    // the ticket count read-only, so the input must be gone, not merely disabled.
    await expect(ticketsInput).toHaveCount(0)

    // API call to modify entry should fail with 409
    const setResp = await adminPage.request.put(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}/entries/${aliceUserId}`,
      {
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        data: { tickets: 10 },
      }
    )

    expect(setResp.status()).toBe(409)

    await adminCtx.close()
  })
})

