import { test, expect } from '../helpers/fixtures'
import { contextAs, uid } from '../helpers/auth'
import {
  adminApi,
  userApi,
  createEventApi,
  enableEventFeature,
  createActivityApi,
  joinEventApi,
  signupActivityApi,
} from '../helpers/api'
import { gotoActivitiesTab } from '../helpers/events'

/**
 * Issue #11 — Activity hits its capacity limit. Once full:
 *  - the Full badge appears for all viewers
 *  - the signup button vanishes (or is disabled)
 *  - direct API signup attempts return 409
 */

test.describe('Activities — capacity limit', () => {
  test('activity fills up; next would-be signup sees Full badge and disabled signup', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: `Tournament ${uid()}`,
      maxParticipants: 2,
    })
    await api.close()

    // Three participants join the event so they're all eligible to sign up.
    for (const u of ['alice', 'bob', 'charlie'] as const) {
      const ctx = await userApi(browser, baseURL!, u)
      await joinEventApi(ctx, eventId)
      await ctx.close()
    }

    // Alice signs up via UI.
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await gotoActivitiesTab(alicePage, baseURL!, eventId)
    await alicePage.getByTestId(`activity-signup-button-${activityId}`).click()
    await expect(
      alicePage.getByTestId(`activity-card-${activityId}`).getByTestId('activity-card-capacity'),
    ).toContainText('1 / 2', { timeout: 10000 })
    await aliceCtx.close()

    // Bob signs up via UI; capacity becomes 2 / 2 + Full badge appears.
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await gotoActivitiesTab(bobPage, baseURL!, eventId)
    await bobPage.getByTestId(`activity-signup-button-${activityId}`).click()
    await expect(
      bobPage.getByTestId(`activity-card-${activityId}`).getByTestId('activity-card-capacity'),
    ).toContainText('2 / 2', { timeout: 10000 })
    // Bob is signed up, so he sees the Withdraw branch (mutually exclusive with the Full badge).
    await expect(bobPage.getByTestId(`activity-withdraw-button-${activityId}`)).toBeVisible()
    await bobCtx.close()

    // Carol opens the activity tab — sees full badge + no signup button.
    const { context: carolCtx, page: carolPage } = await contextAs(browser, 'charlie')
    await gotoActivitiesTab(carolPage, baseURL!, eventId)
    await expect(carolPage.getByTestId(`activity-full-badge-${activityId}`)).toBeVisible({
      timeout: 10000,
    })
    await expect(carolPage.getByTestId(`activity-signup-button-${activityId}`)).toHaveCount(0)
    await carolCtx.close()

    // Carol attempts API signup directly → expect 409.
    const carolApi = await userApi(browser, baseURL!, 'charlie')
    const result = await signupActivityApi(carolApi, eventId, activityId)
    expect(result.status).toBe(409)
    await carolApi.close()
  })
})
