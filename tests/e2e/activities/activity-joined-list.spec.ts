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
  getUserIdApi,
} from '../helpers/api'
import { gotoActivitiesTab } from '../helpers/events'

/**
 * Activities — joined-list disclosure on the public card.
 *
 *  - Event participants see `activity-joined-toggle-{id}` and (after expand)
 *    `participant-chip-{userId}` entries ordered by sign-up time.
 *  - A signed-in user who is NOT joined to the event sees only the count
 *    badge — no toggle, no list.
 */

test.describe('Activities — joined participants list', () => {
  test('event participants see chips ordered by signup time; non-participant sees no toggle', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Arrange: event + activity (admin via API).
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: `Joined List ${uid()}`,
      maxParticipants: 8,
    })
    await api.close()

    // alice, bob, charlie all join the event. alice + bob sign up (alice first).
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    const aliceUserId = await getUserIdApi(aliceApi)
    const aliceSignup = await signupActivityApi(aliceApi, eventId, activityId)
    expect(aliceSignup.ok).toBe(true)
    await aliceApi.close()

    // Tiny delay between sign-ups so the order is deterministic.
    await new Promise((r) => setTimeout(r, 50))

    const bobApi = await userApi(browser, baseURL!, 'bob')
    await joinEventApi(bobApi, eventId)
    const bobUserId = await getUserIdApi(bobApi)
    const bobSignup = await signupActivityApi(bobApi, eventId, activityId)
    expect(bobSignup.ok).toBe(true)
    await bobApi.close()

    const charlieApi = await userApi(browser, baseURL!, 'charlie')
    await joinEventApi(charlieApi, eventId)
    await charlieApi.close()

    // ── Charlie (event participant, not signed up) opens the joined list ──
    const { context: charlieCtx, page: charliePage } = await contextAs(browser, 'charlie')
    await gotoActivitiesTab(charliePage, baseURL!, eventId)
    const card = charliePage.getByTestId(`activity-card-${activityId}`)
    await expect(card).toBeVisible({ timeout: 10000 })

    const toggle = charliePage.getByTestId(`activity-joined-toggle-${activityId}`)
    await expect(toggle).toBeVisible({ timeout: 10000 })
    await expect(toggle).toContainText('2') // count badge
    await toggle.click()

    const list = charliePage.getByTestId(`activity-joined-list-${activityId}`)
    await expect(list).toBeVisible({ timeout: 10000 })
    await expect(list.getByTestId(`participant-chip-${aliceUserId}`)).toBeVisible({
      timeout: 10000,
    })
    await expect(list.getByTestId(`participant-chip-${bobUserId}`)).toBeVisible()

    // Order: alice signed up first, so her chip should be the first child of the list.
    const chipIds = await list
      .locator('[data-testid^="participant-chip-"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid))
    expect(chipIds).toEqual([
      `participant-chip-${aliceUserId}`,
      `participant-chip-${bobUserId}`,
    ])

    await charlieCtx.close()

    // ── Diana — signed in but NOT joined to this event — sees count, no toggle ──
    const { context: dianaCtx, page: dianaPage } = await contextAs(browser, 'diana')
    await dianaPage.goto(`${baseURL}/events/${eventId}`)
    await dianaPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })

    const dianaActivitiesTab = dianaPage.getByTestId('event-tab-activities')
    await expect(dianaActivitiesTab).toBeVisible({ timeout: 10000 })
    await dianaActivitiesTab.click()

    const dianaCard = dianaPage.getByTestId(`activity-card-${activityId}`)
    await expect(dianaCard).toBeVisible({ timeout: 10000 })
    // Capacity badge still reflects the count for everyone.
    await expect(dianaCard.getByTestId('activity-card-capacity')).toContainText('2 /')
    // But the joined disclosure is hidden — no toggle, no list.
    await expect(
      dianaPage.getByTestId(`activity-joined-toggle-${activityId}`),
    ).toHaveCount(0)
    await expect(
      dianaPage.getByTestId(`activity-joined-list-${activityId}`),
    ).toHaveCount(0)

    await dianaCtx.close()
  })
})
