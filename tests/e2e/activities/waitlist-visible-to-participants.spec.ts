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
  joinWaitlistApi,
  getUserIdApi,
} from '../helpers/api'
import { gotoActivitiesTab } from '../helpers/events'

/**
 * Activities — waitlist disclosure visibility.
 *
 *  - max=1 activity, alice signs up; bob then charlie join the waitlist
 *    (with a small delay so JoinedWaitlistAt ordering is deterministic →
 *    bob = position 1, charlie = position 2).
 *  - Charlie (event participant) expands the disclosure on the activity
 *    card and sees both entries in order with position badges 1 and 2.
 *  - Diana is NOT a participant of the event and must not see the
 *    waitlist toggle even if she can reach the activity card.
 */

test.describe('Activities — waitlist disclosure visibility', () => {
  test('participants see ordered waitlist; non-participant cannot', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // ── Arrange: event + max=1 activity ──────────────────────────────────────
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: `Waitlist Visibility ${uid()}`,
      maxParticipants: 1,
    })
    await api.close()

    // Alice (A) joins event + signs up → fills the slot.
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    expect((await signupActivityApi(aliceApi, eventId, activityId)).ok).toBe(true)
    await aliceApi.close()

    // Bob (B) joins event and waitlists → position 1.
    const bobApi = await userApi(browser, baseURL!, 'bob')
    await joinEventApi(bobApi, eventId)
    const bobUserId = await getUserIdApi(bobApi)
    expect((await joinWaitlistApi(bobApi, eventId, activityId)).ok).toBe(true)
    await bobApi.close()

    // Small delay so JoinedWaitlistAt strictly orders bob before charlie.
    await new Promise((r) => setTimeout(r, 1100))

    // Charlie (C) joins event and waitlists → position 2.
    const charlieApi = await userApi(browser, baseURL!, 'charlie')
    await joinEventApi(charlieApi, eventId)
    const charlieUserId = await getUserIdApi(charlieApi)
    expect((await joinWaitlistApi(charlieApi, eventId, activityId)).ok).toBe(true)
    await charlieApi.close()

    // Diana (D) is intentionally NOT joined to the event.

    // ── Charlie's view: open activity card, expand waitlist disclosure ───────
    const { context: charlieCtx, page: charliePage } = await contextAs(browser, 'charlie')
    await gotoActivitiesTab(charliePage, baseURL!, eventId)

    const charlieCard = charliePage.getByTestId(`activity-card-${activityId}`)
    await expect(charlieCard).toBeVisible({ timeout: 10000 })
    await expect(charlieCard.getByTestId('activity-card-capacity')).toContainText('1 / 1', {
      timeout: 10000,
    })

    const waitlistToggle = charliePage.getByTestId(`activity-waitlist-toggle-${activityId}`)
    await expect(waitlistToggle).toBeVisible({ timeout: 10000 })
    await expect(waitlistToggle).toContainText('Waitlist')
    await waitlistToggle.click()

    const waitlistList = charliePage.getByTestId(`activity-waitlist-list-${activityId}`)
    await expect(waitlistList).toBeVisible({ timeout: 10000 })

    // Two entries present, in joinedWaitlistAt order: bob first, charlie second.
    const entries = waitlistList.locator('[data-testid^="activity-waitlist-entry-"]')
    await expect(entries).toHaveCount(2, { timeout: 10000 })
    await expect(entries.nth(0)).toHaveAttribute(
      'data-testid',
      `activity-waitlist-entry-${bobUserId}`,
    )
    await expect(entries.nth(1)).toHaveAttribute(
      'data-testid',
      `activity-waitlist-entry-${charlieUserId}`,
    )

    // Position badges show the right ordinals next to each user.
    await expect(
      charliePage.getByTestId(`activity-waitlist-position-badge-${bobUserId}`),
    ).toHaveText('1')
    await expect(
      charliePage.getByTestId(`activity-waitlist-position-badge-${charlieUserId}`),
    ).toHaveText('2')

    await charlieCtx.close()

    // ── Diana's view: not a participant → no waitlist toggle ─────────────────
    const { context: dianaCtx, page: dianaPage } = await contextAs(browser, 'diana')
    await dianaPage.goto(`${baseURL}/events/${eventId}`)
    await dianaPage
      .getByTestId('event-detail')
      .waitFor({ state: 'visible', timeout: 15000 })

    // The Activities tab may render for non-participants (it does for
    // hiddenFromNonParticipants=false activities); if so, expand it.
    const activitiesTab = dianaPage.getByTestId('event-tab-activities')
    if ((await activitiesTab.count()) > 0) {
      await activitiesTab.click()
      // Either the activities-section never renders (no participant access),
      // or the card is visible without waitlist controls.
      const card = dianaPage.getByTestId(`activity-card-${activityId}`)
      // Allow a brief moment for any realtime broadcast that might add UI.
      await dianaPage.waitForTimeout(1000)
      if ((await card.count()) > 0) {
        await expect(card).toBeVisible()
      }
    }

    // The crux: regardless of how much of the page Diana can see, the
    // waitlist toggle (which contains the names of waiting users) must
    // never be exposed to a non-participant.
    await expect(
      dianaPage.getByTestId(`activity-waitlist-toggle-${activityId}`),
    ).toHaveCount(0)
    await expect(
      dianaPage.getByTestId(`activity-waitlist-list-${activityId}`),
    ).toHaveCount(0)

    await dianaCtx.close()
  })
})
