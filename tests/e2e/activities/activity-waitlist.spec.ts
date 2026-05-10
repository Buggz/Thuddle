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
  withdrawActivityApi,
  getUserIdApi,
} from '../helpers/api'
import { gotoActivitiesTab, gotoManageActivitiesTab } from '../helpers/events'

/**
 * Activities — waitlist join + position + host promote (no overflow).
 *
 *  - max=1 activity, alice signs up → 1/1 full.
 *  - bob (event participant) sees `activity-waitlist-join`, joins → sees
 *    `activity-waitlist-leave` and `activity-waitlist-position` showing "1".
 *  - admin opens manage panel, expands the activity, clicks
 *    `activity-waitlist-promote-{bob}` → bob becomes a participant; the
 *    waitlist entry disappears and bob's card flips to participant view.
 */

test.describe('Activities — waitlist (join, position, promote)', () => {
  test('bob waitlists a full activity, host promotes him into the participant slot', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // ── Arrange: event + max=1 activity, alice fills the only slot ───────────
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: `Waitlist ${uid()}`,
      maxParticipants: 1,
    })
    await api.close()

    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    expect((await signupActivityApi(aliceApi, eventId, activityId)).ok).toBe(true)
    await aliceApi.close()

    const bobApi = await userApi(browser, baseURL!, 'bob')
    await joinEventApi(bobApi, eventId)
    const bobUserId = await getUserIdApi(bobApi)
    await bobApi.close()

    // ── Bob: card is full → join waitlist, see leave button + position 1 ─────
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await gotoActivitiesTab(bobPage, baseURL!, eventId)
    const bobCard = bobPage.getByTestId(`activity-card-${activityId}`)
    await expect(bobCard).toBeVisible({ timeout: 10000 })
    await expect(bobCard.getByTestId('activity-card-capacity')).toContainText('1 / 1', {
      timeout: 10000,
    })
    // Full → no signup button, only the join-waitlist button.
    await expect(bobPage.getByTestId(`activity-signup-button-${activityId}`)).toHaveCount(0)
    const joinWaitlistBtn = bobPage.getByTestId(`activity-waitlist-join-${activityId}`)
    await expect(joinWaitlistBtn).toBeVisible({ timeout: 10000 })
    await joinWaitlistBtn.click()

    await expect(bobPage.getByTestId(`activity-waitlist-leave-${activityId}`)).toBeVisible({
      timeout: 10000,
    })
    await expect(
      bobPage.getByTestId(`activity-waitlist-position-${activityId}`),
    ).toContainText('1', { timeout: 10000 })

    // Alice withdraws via API → activity has a free slot, so promote needs no overflow.
    const aliceApi2 = await userApi(browser, baseURL!, 'alice')
    expect((await withdrawActivityApi(aliceApi2, eventId, activityId)).ok).toBe(true)
    await aliceApi2.close()

    // ── Admin: open manage view, expand the card, promote bob ────────────────
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageActivitiesTab(adminPage, baseURL!, eventId)
    const adminCard = adminPage.getByTestId(`activity-card-${activityId}`)
    await expect(adminCard).toBeVisible({ timeout: 10000 })
    await adminCard.getByRole('button', { name: /participant/i }).click()

    const promoteBtn = adminPage.getByTestId(`activity-waitlist-promote-${bobUserId}`)
    await expect(promoteBtn).toBeVisible({ timeout: 10000 })
    await promoteBtn.click()

    // Promote button (and bob's waitlist row) gone; bob is a participant.
    await expect(promoteBtn).toHaveCount(0, { timeout: 10000 })
    await expect(
      adminPage.getByTestId(`activity-participant-${bobUserId}`),
    ).toBeVisible({ timeout: 10000 })

    // ── Bob's view flips to participant: withdraw button visible, no waitlist UI ─
    await expect(
      bobPage.getByTestId(`activity-withdraw-button-${activityId}`),
    ).toBeVisible({ timeout: 15000 })
    await expect(
      bobPage.getByTestId(`activity-waitlist-leave-${activityId}`),
    ).toHaveCount(0, { timeout: 10000 })
    await expect(
      bobPage.getByTestId(`activity-waitlist-position-${activityId}`),
    ).toHaveCount(0)

    await bobCtx.close()
    await adminCtx.close()
  })
})
