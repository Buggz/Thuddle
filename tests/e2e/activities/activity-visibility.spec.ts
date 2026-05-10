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

/**
 * Activities — visibility of `hiddenFromNonParticipants` activities.
 *
 *  - Anonymous viewers + signed-in non-participants see only the visible activity.
 *  - Once they join the event they see both.
 *  - Admins always see both (and additionally a `activity-hidden-badge-{id}` chip on the manage view).
 */

test.describe('Activities — hidden-from-non-participants visibility', () => {
  test('only visible activity shown to anonymous viewers, non-participants; both shown after joining', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // ── Arrange (admin via API) ──────────────────────────────────────────────
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 }) // Public
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')

    const visibleTitle = `Visible Activity ${uid()}`
    const hiddenTitle = `Hidden Activity ${uid()}`
    const { id: visibleId } = await createActivityApi(api, eventId, {
      title: visibleTitle,
      maxParticipants: 8,
    })
    const { id: hiddenId } = await createActivityApi(api, eventId, {
      title: hiddenTitle,
      maxParticipants: 8,
      hiddenFromNonParticipants: true,
    })
    await api.close()

    // ── Anonymous viewer ─────────────────────────────────────────────────────
    const anonCtx = await browser.newContext()
    const anonPage = await anonCtx.newPage()
    await anonPage.goto(`${baseURL}/events/${eventId}`)
    await anonPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })

    // Try to open the activities tab if present.
    const anonActivitiesTab = anonPage.getByTestId('event-tab-activities')
    if ((await anonActivitiesTab.count()) > 0) {
      await anonActivitiesTab.click()
      await expect(anonPage.getByTestId(`activity-card-${visibleId}`)).toBeVisible({
        timeout: 10000,
      })
      await expect(anonPage.getByTestId(`activity-card-${hiddenId}`)).toHaveCount(0)
    }
    await anonCtx.close()

    // ── Signed-in non-participant (alice has not joined) ─────────────────────
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })

    const aliceActivitiesTab = alicePage.getByTestId('event-tab-activities')
    await expect(aliceActivitiesTab).toBeVisible({ timeout: 10000 })
    await aliceActivitiesTab.click()
    await expect(alicePage.getByTestId(`activity-card-${visibleId}`)).toBeVisible({
      timeout: 10000,
    })
    await expect(alicePage.getByTestId(`activity-card-${hiddenId}`)).toHaveCount(0)

    // ── Alice joins the event → both activities now visible ─────────────────
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    await aliceApi.close()

    await alicePage.reload()
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-tab-activities').click()
    await expect(alicePage.getByTestId(`activity-card-${visibleId}`)).toBeVisible({
      timeout: 10000,
    })
    await expect(alicePage.getByTestId(`activity-card-${hiddenId}`)).toBeVisible({
      timeout: 10000,
    })

    await aliceCtx.close()
  })
})
