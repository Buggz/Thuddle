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
import { gotoActivitiesTab, gotoManageActivitiesTab } from '../helpers/events'

/**
 * Activities — promote-with-overflow dialog.
 *
 *  - max=1 activity, alice signs up → 1/1 full.
 *  - bob (event participant) joins the waitlist via the UI.
 *  - admin opens manage panel, expands the activity, clicks promote → backend
 *    returns 409 (`activity_full`) → `ActivityFullPromoteDialog` opens.
 *  - `activity-promote-cancel` closes the dialog and leaves the waitlist intact.
 *  - Re-opening + clicking `activity-promote-force` raises the cap by 1
 *    (MaxParticipants 1 → 2), bob joins as a participant, and the card shows "2 / 2".
 */

test.describe('Activities — promote with overflow', () => {
  test('cancel keeps waitlist; force-promote raises cap by 1 and adds the user', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // ── Arrange: max=1 activity, alice fills it, bob joins event ─────────────
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: `Overflow ${uid()}`,
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

    // Bob joins the waitlist via the UI.
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await gotoActivitiesTab(bobPage, baseURL!, eventId)
    await bobPage.getByTestId(`activity-waitlist-join-${activityId}`).click()
    await expect(bobPage.getByTestId(`activity-waitlist-leave-${activityId}`)).toBeVisible({
      timeout: 10000,
    })
    await bobCtx.close()

    // ── Admin: open manage view, expand activity, click promote ──────────────
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageActivitiesTab(adminPage, baseURL!, eventId)
    const adminCard = adminPage.getByTestId(`activity-card-${activityId}`)
    await expect(adminCard).toBeVisible({ timeout: 10000 })
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('1 / 1')
    await adminCard.getByRole('button', { name: /participant/i }).click()

    const promoteBtn = adminPage.getByTestId(`activity-waitlist-promote-${bobUserId}`)
    await expect(promoteBtn).toBeVisible({ timeout: 10000 })

    // First click → backend returns 409 → overflow dialog opens.
    await promoteBtn.click()
    const cancelBtn = adminPage.getByTestId('activity-promote-cancel')
    await expect(cancelBtn).toBeVisible({ timeout: 10000 })

    // Cancel → dialog closes, waitlist entry + capacity unchanged, bob still waitlisted.
    await cancelBtn.click()
    await expect(cancelBtn).toHaveCount(0, { timeout: 5000 })
    await expect(promoteBtn).toBeVisible()
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('1 / 1')

    // Second click → dialog opens again → force-promote → cap raises to 2, bob joins.
    await promoteBtn.click()
    const forceBtn = adminPage.getByTestId('activity-promote-force')
    await expect(forceBtn).toBeVisible({ timeout: 10000 })
    await forceBtn.click()

    await expect(forceBtn).toHaveCount(0, { timeout: 5000 })
    await expect(promoteBtn).toHaveCount(0, { timeout: 10000 })
    await expect(adminPage.getByTestId(`activity-participant-${bobUserId}`)).toBeVisible({
      timeout: 10000,
    })
    // New cap = 2, both alice and bob counted → "2 / 2".
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('2 / 2', {
      timeout: 15000,
    })

    await adminCtx.close()
  })
})
