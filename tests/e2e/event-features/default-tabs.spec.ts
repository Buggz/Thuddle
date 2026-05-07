import { test, expect } from '../helpers/fixtures'
import { contextAs } from '../helpers/auth'
import { adminApi, createEventApi } from '../helpers/api'

/**
 * Issue #11 — A freshly created event must have NO Raffles, Auction, or
 * Activities tabs for either host or participant. The base tabs (about,
 * discussion, attendees) remain.
 */

test.describe('Event default tabs', () => {
  test('fresh event has no Raffles, Auction or Activities tabs for host or participant', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await api.close()

    // Admin viewer.
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await adminPage.goto(`${baseURL}/events/${eventId}`)
    await adminPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await expect(adminPage.getByTestId('event-tab-discussion')).toBeVisible()
    await expect(adminPage.getByTestId('event-tab-attendees')).toBeVisible()
    await expect(adminPage.getByTestId('event-tab-raffles')).toHaveCount(0)
    await expect(adminPage.getByTestId('event-tab-auction')).toHaveCount(0)
    await expect(adminPage.getByTestId('event-tab-activities')).toHaveCount(0)
    await adminCtx.close()

    // Alice viewer (joined participant).
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    await expect(alicePage.getByTestId('event-tab-discussion')).toBeVisible()
    await expect(alicePage.getByTestId('event-tab-attendees')).toBeVisible()
    await expect(alicePage.getByTestId('event-tab-raffles')).toHaveCount(0)
    await expect(alicePage.getByTestId('event-tab-auction')).toHaveCount(0)
    await expect(alicePage.getByTestId('event-tab-activities')).toHaveCount(0)
    await aliceCtx.close()
  })
})
