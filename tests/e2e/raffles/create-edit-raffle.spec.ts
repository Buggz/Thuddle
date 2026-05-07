import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, getAuthHeadersFromPage } from '../helpers/auth'
import { adminApi, createEventApi , enableEventFeature } from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Create and edit raffle
 * - Host creates a raffle
 * - Non-host cannot see "Add raffle" button
 * - Host edits name + description while Open
 * - After start, name/price/self-report inputs are disabled but description still editable
 * - Non-host PATCH rejected at API (direct request → expect non-2xx)
 */

test.describe('Create and edit raffle', () => {
  test('host creates a raffle with all fields', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await api.close()

    // Admin navigates to the event manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    // Host should see "Add Raffle" button
    await expect(adminPage.getByTestId('raffle-create-btn')).toBeVisible()

    // Open raffle editor
    await adminPage.getByTestId('raffle-create-btn').click()

    // Fill raffle form
    const raffleName = `Mystery Box ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)
    await adminPage.locator('[data-testid="raffle-description-input"] .ProseMirror').click()
    await adminPage.locator('[data-testid="raffle-description-input"] .ProseMirror').fill('A wonderful surprise awaits!')
    await adminPage.getByTestId('raffle-price-input').fill('5.50')
    await adminPage.getByTestId('raffle-selfreport-toggle').click() // enable self-reporting

    // Save
    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles`) && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    await createResp

    // Raffle should appear in the list
    await adminPage.getByTestId('manage-raffles-tab').waitFor({ state: 'visible', timeout: 10000 })
    await expect(adminPage.locator('[data-testid^="raffle-card-"]').first()).toBeVisible()

    await adminCtx.close()
  })

  test('non-host cannot see "Add raffle" button', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates public event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await api.close()

    // Alice joins as a participant
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Navigate to Raffles tab
    await alicePage.getByTestId('event-tab-raffles').click()
    await expect(alicePage.getByTestId('raffles-section')).toBeVisible()

    // Non-host should NOT see "Add Raffle" button
    await expect(alicePage.getByTestId('raffle-create-btn')).toHaveCount(0)

    // Non-host should also not see the Manage link on the event header
    await expect(alicePage.getByTestId('event-manage-link')).toHaveCount(0)

    await aliceCtx.close()
  })

  test('host edits name and description while Open, then only description after start', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await api.close()

    // Admin navigates to the manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    // Capture admin auth headers BEFORE navigating to the manage view: the
    // helper reloads the page, which would reset ManageEventView's activeTab
    // back to 'about' and unmount the raffles tab (and its status badge).
    const { headers: adminHeaders } = await getAuthHeadersFromPage(adminPage, baseURL!)
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    const raffleName = `Editable Raffle ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)
    await adminPage.getByTestId('raffle-price-input').fill('10')

    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles`) && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    const createBody = await createResult.json()
    const raffleId = createBody.id

    await adminPage.getByTestId('manage-raffles-tab').waitFor({ state: 'visible', timeout: 10000 })

    // Single raffle auto-expands after save -> fetchRaffles. Edit button lives in
    // the always-visible card header so we don't need to expand explicitly.
    const editBtn = adminPage.getByTestId(`raffle-edit-btn-${raffleId}`)
    await expect(editBtn).toBeVisible({ timeout: 10000 })
    await editBtn.click()

    // Edit name and description while Open
    await adminPage.getByTestId('raffle-name-input').fill('Updated Name')
    await adminPage.locator('[data-testid="raffle-description-input"] .ProseMirror').click()
    await adminPage.locator('[data-testid="raffle-description-input"] .ProseMirror').fill('Updated description while Open')

    const patchResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}`) && r.request().method() === 'PATCH'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    await patchResp

    // Start the raffle via API (no UI start button anymore). Headers were
    // captured before navigating to the manage view to avoid a reload.
    const startResp = await adminPage.request.post(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}/start`,
      { headers: adminHeaders },
    )
    expect(startResp.status()).toBe(200)

    // Wait for status badge to update to Drawing on the manage page
    await expect(adminPage.getByTestId(`raffle-status-badge-${raffleId}`)).toHaveText(/Drawing/i, {
      timeout: 10000,
    })

    // Try to edit again
    await editBtn.click()

    // Name and price should be disabled
    await expect(adminPage.getByTestId('raffle-name-input')).toBeDisabled()
    await expect(adminPage.getByTestId('raffle-price-input')).toBeDisabled()

    // Description should still be editable
    await adminPage.locator('[data-testid="raffle-description-input"] .ProseMirror').click()
    await adminPage.locator('[data-testid="raffle-description-input"] .ProseMirror').fill('Updated description while Drawing')

    const patchResp2 = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}`) && r.request().method() === 'PATCH'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const patchResult = await patchResp2
    expect(patchResult.status()).toBe(200)

    await adminCtx.close()
  })

  test('non-host PATCH is rejected by API', async ({ browser, baseURL, createdEvents }) => {
    // Admin creates event + raffle via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await api.close()

    // Admin creates raffle via GUI on the manage view
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    const raffleName = `API Test Raffle ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)

    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles`) && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    const createBody = await createResult.json()
    const raffleId = createBody.id

    await adminCtx.close()

    // Alice joins
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Capture alice token
    let aliceToken = ''
    alicePage.on('request', (req) => {
      const auth = req.headers()['authorization']
      if (auth?.startsWith('Bearer ')) aliceToken = auth.substring(7)
    })
    await alicePage.reload()
    await alicePage.waitForResponse((r) => r.url().includes('/api/profile') && r.status() === 200, { timeout: 10000 })

    // Alice tries to PATCH the raffle
    const patchResp = await alicePage.request.patch(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}`,
      {
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        data: { name: 'Hacked Name' },
      }
    )

    // Should be rejected
    expect(patchResp.status()).toBe(403)

    await aliceCtx.close()
  })
})
