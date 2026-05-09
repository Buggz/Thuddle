import { test, expect } from '../helpers/fixtures'
import { contextAs, uid } from '../helpers/auth'
import {
  adminApi,
  userApi,
  createEventApi,
  enableEventFeature,
  createActivityApi,
  joinEventApi,
} from '../helpers/api'
import { gotoActivitiesTab } from '../helpers/events'

/**
 * Issue #11 — Activity sign-up broadcasts via SignalR. With two viewers on
 * the Activities tab, when one signs up the other sees the count update
 * without any reload.
 */

test.describe('Activities — realtime signup updates', () => {
  test('two contexts: A signs up, B sees count update without reload', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: `Realtime ${uid()}`,
      maxParticipants: 6,
    })
    await api.close()

    // Both alice and bob join the event so they have participant access.
    for (const u of ['alice', 'bob'] as const) {
      const ctx = await userApi(browser, baseURL!, u)
      await joinEventApi(ctx, eventId)
      await ctx.close()
    }

    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')

    await gotoActivitiesTab(alicePage, baseURL!, eventId)
    await gotoActivitiesTab(bobPage, baseURL!, eventId)

    const aliceCard = alicePage.getByTestId(`activity-card-${activityId}`)
    const bobCard = bobPage.getByTestId(`activity-card-${activityId}`)

    await expect(aliceCard.getByTestId('activity-card-capacity')).toContainText('0 / 6')
    await expect(bobCard.getByTestId('activity-card-capacity')).toContainText('0 / 6')

    // Alice signs up.
    await alicePage.getByTestId(`activity-signup-button-${activityId}`).click()
    await expect(aliceCard.getByTestId('activity-card-capacity')).toContainText('1 / 6', {
      timeout: 10000,
    })

    // Bob sees the live count change without reloading.
    await expect(bobCard.getByTestId('activity-card-capacity')).toContainText('1 / 6', {
      timeout: 15000,
    })

    await aliceCtx.close()
    await bobCtx.close()
  })
})
