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
import { clearNotificationsApi } from '../helpers/notifications'

/**
 * Activities — admin "Replace with…" flow on the participant list.
 *
 * The Replace/Remove button on `ActivityCard.vue`'s "Joined" disclosure has
 * a conditional testid:
 *   - `activity-replace-${userId}`  when the activity is full AND has a waitlist
 *     → opens `ReplaceFromWaitlistDialog` (testid: `replace-from-waitlist-dialog`).
 *   - `activity-remove-${userId}`   otherwise
 *     → opens `RemoveParticipantDialog` (testid: `remove-participant-dialog`).
 *
 * Spec covers both the replace flow (positive) and the remove-cancel flow (negative).
 */

test.describe('Activities — admin replace-from-waitlist flow', () => {
  test('admin replaces participant with selected waitlist user; both notified', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // ── Arrange: max=1 activity, alice signs up, bob waitlists ───────────────
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const title = `Replace ${uid()}`
    const { id: activityId } = await createActivityApi(api, eventId, {
      title,
      maxParticipants: 1,
    })
    await api.close()

    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    const aliceUserId = await getUserIdApi(aliceApi)
    expect((await signupActivityApi(aliceApi, eventId, activityId)).ok).toBe(true)
    await clearNotificationsApi(aliceApi)
    await aliceApi.close()

    const bobApi = await userApi(browser, baseURL!, 'bob')
    await joinEventApi(bobApi, eventId)
    const bobUserId = await getUserIdApi(bobApi)
    expect((await joinWaitlistApi(bobApi, eventId, activityId)).ok).toBe(true)
    await clearNotificationsApi(bobApi)
    await bobApi.close()

    // ── Admin: open activities tab, expand "Joined", click Replace on alice ─
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoActivitiesTab(adminPage, baseURL!, eventId)

    const adminCard = adminPage.getByTestId(`activity-card-${activityId}`)
    await expect(adminCard).toBeVisible({ timeout: 10000 })
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('1 / 1')

    // Expand the "Joined" disclosure — Replace/Remove buttons render inside it.
    await adminPage.getByTestId(`activity-joined-toggle-${activityId}`).click()
    await expect(
      adminPage.getByTestId(`activity-joined-list-${activityId}`),
    ).toBeVisible({ timeout: 10000 })

    // Activity is full with a waitlist → testid is `activity-replace-${userId}`.
    const replaceBtn = adminPage.getByTestId(`activity-replace-${aliceUserId}`)
    await expect(replaceBtn).toBeVisible({ timeout: 10000 })
    await expect(replaceBtn).toContainText(/replace with/i)
    await replaceBtn.click()

    // ── Replace dialog: pick bob, confirm ────────────────────────────────────
    const dialog = adminPage.getByTestId('replace-from-waitlist-dialog')
    await expect(dialog).toBeVisible({ timeout: 10000 })

    const choose = adminPage.getByTestId(`activity-waitlist-choose-${bobUserId}`)
    await expect(choose).toBeVisible({ timeout: 10000 })
    await choose.click()

    await adminPage.getByTestId('replace-from-waitlist-confirm').click()
    await expect(dialog).toHaveCount(0, { timeout: 10000 })

    // ── Result on admin's view ───────────────────────────────────────────────
    // Capacity stays 1/1 (alice out, bob in). Alice is no longer in the joined
    // list, bob is. Waitlist is now empty so the Joined button on bob is the
    // simple Remove (no Replace, no waitlist toggle).
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('1 / 1', {
      timeout: 15000,
    })
    await expect(adminPage.getByTestId(`activity-replace-${aliceUserId}`)).toHaveCount(0, {
      timeout: 10000,
    })
    await expect(adminPage.getByTestId(`activity-remove-${aliceUserId}`)).toHaveCount(0)
    await expect(adminPage.getByTestId(`activity-remove-${bobUserId}`)).toBeVisible({
      timeout: 10000,
    })
    await expect(
      adminPage.getByTestId(`activity-waitlist-toggle-${activityId}`),
    ).toHaveCount(0, { timeout: 10000 })

    await adminCtx.close()

    // ── Alice's notification: removed from activity ─────────────────────────
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(baseURL!)
    await alicePage
      .getByTestId('user-display-name')
      .waitFor({ state: 'visible', timeout: 20000 })
    const aliceBell = alicePage.getByTestId('notification-bell')
    await expect(aliceBell).toBeVisible({ timeout: 10000 })
    await expect(alicePage.getByTestId('notification-bell-badge')).toBeVisible({
      timeout: 15000,
    })
    await aliceBell.click()
    await expect(alicePage.getByTestId('notification-bell-panel')).toBeVisible()
    await expect(
      alicePage
        .locator('[data-testid^="notification-row-title-"]')
        .filter({ hasText: /removed from activity/i })
        .first(),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      alicePage
        .locator('[data-testid^="notification-row-body-"]')
        .filter({ hasText: title })
        .first(),
    ).toBeVisible({ timeout: 10000 })
    await aliceCtx.close()

    // ── Bob's notification: promoted from waitlist ──────────────────────────
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await bobPage.goto(baseURL!)
    await bobPage
      .getByTestId('user-display-name')
      .waitFor({ state: 'visible', timeout: 20000 })
    const bobBell = bobPage.getByTestId('notification-bell')
    await expect(bobBell).toBeVisible({ timeout: 10000 })
    await expect(bobPage.getByTestId('notification-bell-badge')).toBeVisible({
      timeout: 15000,
    })
    await bobBell.click()
    await expect(bobPage.getByTestId('notification-bell-panel')).toBeVisible()
    // Title format: `You're in! {activityTitle}`; body contains "promoted from the waitlist".
    await expect(
      bobPage
        .locator('[data-testid^="notification-row-title-"]')
        .filter({ hasText: title })
        .first(),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      bobPage
        .locator('[data-testid^="notification-row-body-"]')
        .filter({ hasText: /promoted from the waitlist/i })
        .first(),
    ).toBeVisible({ timeout: 10000 })
    await bobCtx.close()
  })

  test('not full / no waitlist → Remove button opens simple dialog; cancelling makes no change', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // ── Arrange: max=4 activity (room to spare), alice signs up, NO waitlist ─
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: `Remove Cancel ${uid()}`,
      maxParticipants: 4,
    })
    await api.close()

    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    const aliceUserId = await getUserIdApi(aliceApi)
    expect((await signupActivityApi(aliceApi, eventId, activityId)).ok).toBe(true)
    await aliceApi.close()

    // ── Admin opens activities tab, expands Joined, clicks Remove ───────────
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoActivitiesTab(adminPage, baseURL!, eventId)

    const adminCard = adminPage.getByTestId(`activity-card-${activityId}`)
    await expect(adminCard).toBeVisible({ timeout: 10000 })
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('1 / 4')

    await adminPage.getByTestId(`activity-joined-toggle-${activityId}`).click()
    await expect(
      adminPage.getByTestId(`activity-joined-list-${activityId}`),
    ).toBeVisible({ timeout: 10000 })

    // Not full → testid is `activity-remove-${userId}`, not `activity-replace-…`.
    await expect(adminPage.getByTestId(`activity-replace-${aliceUserId}`)).toHaveCount(0)
    const removeBtn = adminPage.getByTestId(`activity-remove-${aliceUserId}`)
    await expect(removeBtn).toBeVisible({ timeout: 10000 })
    await expect(removeBtn).toHaveText(/^remove$/i)
    await removeBtn.click()

    // The simple confirmation dialog appears (NOT the replace dialog).
    const dialog = adminPage.getByTestId('remove-participant-dialog')
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await expect(adminPage.getByTestId('replace-from-waitlist-dialog')).toHaveCount(0)

    // Cancel → dialog closes, alice still listed, capacity unchanged.
    await adminPage.getByTestId('remove-participant-cancel').click()
    await expect(dialog).toHaveCount(0, { timeout: 5000 })
    await expect(adminPage.getByTestId(`activity-remove-${aliceUserId}`)).toBeVisible()
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('1 / 4')

    await adminCtx.close()
  })
})
