import { test, expect } from '../helpers/fixtures'
import { contextAs } from '../helpers/auth'
import {
  adminApi,
  createEventApi,
  enableEventFeature,
  createRaffleApi,
} from '../helpers/api'
import { gotoManageFeaturesTab } from '../helpers/events'

/**
 * Issue #11 — Event Feature registry: enable/disable flow + live propagation.
 *
 * Covers:
 *  - host adds raffles via picker, the tab appears live for both host and a
 *    participant (alice) without page reload
 *  - host removes a feature with no content; tab disappears live for both
 *  - host cannot remove raffles when raffles exist; sees inline 409 message
 *  - unknown feature key returns 400 (API only)
 */

test.describe('Event features registry — enable/disable', () => {
  test('host adds raffles via picker, tab appears for host and participant live', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Admin creates event via API. No features enabled yet.
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await api.close()

    // Alice joins so she has participant access (raffles tab requires it).
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Initial state: alice does NOT see a raffles tab.
    await expect(alicePage.getByTestId('event-tab-raffles')).toHaveCount(0)

    // Admin opens Manage > Features and verifies empty state.
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageFeaturesTab(adminPage, baseURL!, eventId)
    await expect(adminPage.getByTestId('event-features-empty')).toBeVisible()

    // Admin opens picker and adds raffles.
    await adminPage.getByTestId('event-feature-add-btn').click()
    await expect(adminPage.getByTestId('feature-picker-modal')).toBeVisible()
    await adminPage.getByTestId('feature-picker-add-raffles').click()

    // Modal closes, chip appears.
    await expect(adminPage.getByTestId('feature-picker-modal')).toHaveCount(0, { timeout: 5000 })
    await expect(adminPage.getByTestId('event-feature-chip-raffles')).toBeVisible()

    // Admin opens a fresh page on the public event view — raffles tab is now there.
    const adminEventPage = await adminCtx.newPage()
    await adminEventPage.goto(`${baseURL}/events/${eventId}`)
    await adminEventPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await expect(adminEventPage.getByTestId('event-tab-raffles')).toBeVisible({ timeout: 10000 })

    // Alice's already-open page sees the raffles tab appear live (no reload).
    await expect(alicePage.getByTestId('event-tab-raffles')).toBeVisible({ timeout: 15000 })

    await adminEventPage.close()
    await adminCtx.close()
    await aliceCtx.close()
  })

  test('host removes feature with no content; tab disappears live', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Setup: admin creates event, enables raffles via API.
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await api.close()

    // Alice joins; sees the raffles tab.
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    await expect(alicePage.getByTestId('event-tab-raffles')).toBeVisible({ timeout: 10000 })

    // Admin opens manage > features; sees the raffles chip.
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageFeaturesTab(adminPage, baseURL!, eventId)
    await expect(adminPage.getByTestId('event-feature-chip-raffles')).toBeVisible()

    // Admin opens public event page in a separate tab — also sees the tab.
    const adminEventPage = await adminCtx.newPage()
    await adminEventPage.goto(`${baseURL}/events/${eventId}`)
    await adminEventPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await expect(adminEventPage.getByTestId('event-tab-raffles')).toBeVisible()

    // Admin removes raffles via the chip's remove button + confirms.
    await adminPage.getByTestId('event-feature-remove-raffles').click()
    await adminPage.getByTestId('confirm-dialog-confirm').click()

    // Chip disappears.
    await expect(adminPage.getByTestId('event-feature-chip-raffles')).toHaveCount(0, { timeout: 10000 })

    // Both viewers' raffles tab disappears without reload.
    await expect(adminEventPage.getByTestId('event-tab-raffles')).toHaveCount(0, { timeout: 15000 })
    await expect(alicePage.getByTestId('event-tab-raffles')).toHaveCount(0, { timeout: 15000 })

    await adminEventPage.close()
    await adminCtx.close()
    await aliceCtx.close()
  })

  test('host cannot remove raffles when raffles exist; sees inline 409 error', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Setup: admin creates event, enables raffles, creates a raffle via API.
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await createRaffleApi(api, eventId, { name: 'Sentinel raffle' })
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageFeaturesTab(adminPage, baseURL!, eventId)
    await expect(adminPage.getByTestId('event-feature-chip-raffles')).toBeVisible()

    // Trigger the remove flow.
    await adminPage.getByTestId('event-feature-remove-raffles').click()
    await adminPage.getByTestId('confirm-dialog-confirm').click()

    // Chip stays + inline error visible (server returned 409 content gate).
    await expect(adminPage.getByTestId('event-feature-chip-raffles')).toBeVisible()
    await expect(adminPage.getByTestId('event-feature-remove-error-raffles')).toBeVisible({
      timeout: 10000,
    })

    await adminCtx.close()
  })

  test('unknown feature key returns 400 (API only)', async ({ browser, baseURL, createdEvents }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/features`, {
      headers: api.headers,
      data: JSON.stringify({ key: 'nope' }),
    })
    expect(resp.status()).toBe(400)

    await api.close()
  })
})
