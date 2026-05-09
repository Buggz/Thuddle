import { test, expect } from '../helpers/fixtures'
import { contextAs, uid } from '../helpers/auth'
import type { APIRequestContext } from '@playwright/test'
import {
  adminApi,
  userApi,
  createEventApi,
  enableEventFeature,
  createActivityApi,
  joinEventApi,
} from '../helpers/api'
import { gotoActivitiesTab, gotoManageActivitiesTab } from '../helpers/events'

/**
 * Issue #11 — Activity sign-up + withdraw flow with realtime propagation
 * to the host's manage view.
 */

async function getMyUserId(api: {
  request: APIRequestContext
  headers: Record<string, string>
  baseURL: string
}): Promise<string> {
  const resp = await api.request.get(`${api.baseURL}/api/profile`, { headers: api.headers })
  if (!resp.ok()) throw new Error(`profile failed: ${resp.status()} ${await resp.text()}`)
  const body = await resp.json()
  return body.id
}

test.describe('Activities — signup and withdraw', () => {
  test('attendee signs up and withdraws; counts and badges update for both viewers live', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // ── Setup ──
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const title = `Workshop ${uid()}`
    const { id: activityId } = await createActivityApi(api, eventId, {
      title,
      maxParticipants: 4,
    })
    await api.close()

    // Alice joins event + grabs her userId for later assertions.
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    const aliceUserId = await getMyUserId(aliceApi)
    await aliceApi.close()

    // Alice opens the public Activities tab.
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await gotoActivitiesTab(alicePage, baseURL!, eventId)
    const aliceCard = alicePage.getByTestId(`activity-card-${activityId}`)
    await expect(aliceCard).toBeVisible({ timeout: 10000 })
    await expect(aliceCard.getByTestId('activity-card-capacity')).toContainText('0 / 4')
    await expect(alicePage.getByTestId(`activity-signup-button-${activityId}`)).toBeVisible()

    // Admin opens the Manage > Activities tab in a separate browser context.
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageActivitiesTab(adminPage, baseURL!, eventId)
    const adminCard = adminPage.getByTestId(`activity-card-${activityId}`)
    await expect(adminCard).toBeVisible({ timeout: 10000 })
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('0 / 4')

    // Alice signs up.
    await alicePage.getByTestId(`activity-signup-button-${activityId}`).click()
    await expect(aliceCard.getByTestId('activity-card-capacity')).toContainText('1 / 4', {
      timeout: 10000,
    })
    await expect(alicePage.getByTestId(`activity-withdraw-button-${activityId}`)).toBeVisible()
    await expect(alicePage.getByTestId(`activity-signup-button-${activityId}`)).toHaveCount(0)

    // Admin's view updates live: count goes 1/4 and Alice appears in roster.
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('1 / 4', {
      timeout: 15000,
    })
    // Expand the participants disclosure on the admin view to surface the roster.
    await adminCard.getByRole('button', { name: /participant/i }).click()
    await expect(adminPage.getByTestId(`activity-participant-${aliceUserId}`)).toBeVisible({
      timeout: 10000,
    })

    // Alice withdraws.
    await alicePage.getByTestId(`activity-withdraw-button-${activityId}`).click()
    await expect(aliceCard.getByTestId('activity-card-capacity')).toContainText('0 / 4', {
      timeout: 10000,
    })
    await expect(alicePage.getByTestId(`activity-signup-button-${activityId}`)).toBeVisible()

    // Admin view: roster removes alice + count returns to 0/4 live.
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('0 / 4', {
      timeout: 15000,
    })
    await expect(adminPage.getByTestId(`activity-participant-${aliceUserId}`)).toHaveCount(0, {
      timeout: 10000,
    })

    await aliceCtx.close()
    await adminCtx.close()
  })
})
