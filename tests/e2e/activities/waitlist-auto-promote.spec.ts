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
  withdrawActivityApi,
} from '../helpers/api'
import { gotoActivitiesTab } from '../helpers/events'
import { openWithRealtime, clearNotificationsApi } from '../helpers/notifications'

/**
 * Activities — auto-promote on withdraw + realtime + notification.
 *
 *  - max=1 activity, alice signs up; bob waitlists.
 *  - Bob is sitting on the activities tab with a fully-ready realtime hub.
 *  - Alice withdraws (via UI) → backend auto-promotes bob into the seat,
 *    fires ActivityParticipantChanged + ActivityWaitlistChanged broadcasts,
 *    and posts a "PromotedFromWaitlist" notification on bob's account.
 *  - Bob's UI flips from waitlist-leave to withdraw button without a reload.
 *  - Bob's notification bell reflects the new row.
 */

test.describe('Activities — waitlist auto-promote on withdraw', () => {
  test('withdrawing seat auto-promotes earliest waitlist entry, updates UI live, and notifies them', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // ── Arrange: event + max=1 activity ──────────────────────────────────────
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const title = `AutoPromote ${uid()}`
    const { id: activityId } = await createActivityApi(api, eventId, {
      title,
      maxParticipants: 1,
    })
    await api.close()

    // Alice (A) signs up, fills the seat.
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    expect((await signupActivityApi(aliceApi, eventId, activityId)).ok).toBe(true)
    await aliceApi.close()

    // Bob (B) joins event + waitlist; reset bell so post-promote unread is provably new.
    const bobApi = await userApi(browser, baseURL!, 'bob')
    await joinEventApi(bobApi, eventId)
    expect((await joinWaitlistApi(bobApi, eventId, activityId)).ok).toBe(true)
    await clearNotificationsApi(bobApi)
    await bobApi.close()

    // ── Bob: open the activities tab and wait for the realtime hub to be ready ──
    const { context: bobCtx, page: bobPage } = await openWithRealtime(
      browser,
      'bob',
      `${baseURL}/events/${eventId}`,
    )
    await bobPage.getByTestId('event-tab-activities').click()
    await bobPage
      .getByTestId('activities-section')
      .waitFor({ state: 'visible', timeout: 15000 })

    const bobCard = bobPage.getByTestId(`activity-card-${activityId}`)
    await expect(bobCard).toBeVisible({ timeout: 10000 })
    // Sanity: bob currently sees the leave-waitlist control, not signup/withdraw.
    await expect(bobPage.getByTestId(`activity-waitlist-leave-${activityId}`)).toBeVisible({
      timeout: 10000,
    })
    await expect(bobCard.getByTestId('activity-card-capacity')).toContainText('1 / 1')

    // ── Alice withdraws via the UI ───────────────────────────────────────────
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await gotoActivitiesTab(alicePage, baseURL!, eventId)
    await alicePage.getByTestId(`activity-withdraw-button-${activityId}`).click()

    // Alice's own button flips back to "Sign up" — proves the action committed.
    await expect(
      alicePage.getByTestId(`activity-signup-button-${activityId}`),
    ).toBeVisible({ timeout: 15000 })
    await aliceCtx.close()

    // ── Bob: realtime promotes him without a reload ─────────────────────────
    // The waitlist controls go away, the participant control appears, and the
    // waitlist disclosure (which only renders when waitlistCount > 0) collapses.
    await expect(
      bobPage.getByTestId(`activity-withdraw-button-${activityId}`),
    ).toBeVisible({ timeout: 15000 })
    await expect(
      bobPage.getByTestId(`activity-waitlist-leave-${activityId}`),
    ).toHaveCount(0, { timeout: 15000 })
    await expect(
      bobPage.getByTestId(`activity-waitlist-position-${activityId}`),
    ).toHaveCount(0)
    await expect(
      bobPage.getByTestId(`activity-waitlist-toggle-${activityId}`),
    ).toHaveCount(0, { timeout: 15000 })
    await expect(bobCard.getByTestId('activity-card-capacity')).toContainText('1 / 1')

    // ── Bob's notification: "PromotedFromWaitlist" row arrives ──────────────
    const bell = bobPage.getByTestId('notification-bell')
    await expect(bell).toBeVisible({ timeout: 10000 })
    await expect(bobPage.getByTestId('notification-bell-badge')).toBeVisible({
      timeout: 15000,
    })
    await bell.click()
    await expect(bobPage.getByTestId('notification-bell-panel')).toBeVisible()

    // Title format from NotificationService.NotifyPromotedFromWaitlist:
    //   title:   `You're in! {activityTitle}`
    //   message: `You were promoted from the waitlist for "{activityTitle}".`
    const promotedTitle = bobPage
      .locator('[data-testid^="notification-row-title-"]')
      .filter({ hasText: title })
      .first()
    await expect(promotedTitle).toBeVisible({ timeout: 10000 })
    const promotedBody = bobPage
      .locator('[data-testid^="notification-row-body-"]')
      .filter({ hasText: /promoted from the waitlist/i })
      .first()
    await expect(promotedBody).toBeVisible({ timeout: 10000 })

    await bobCtx.close()
  })
})
