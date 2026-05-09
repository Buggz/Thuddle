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
  signupActivityApi,
} from '../helpers/api'
import { gotoActivitiesTab, gotoManageActivitiesTab } from '../helpers/events'

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

async function clearNotifications(api: {
  request: APIRequestContext
  headers: Record<string, string>
  baseURL: string
}): Promise<void> {
  await api.request.post(`${api.baseURL}/api/notifications/read-all`, { headers: api.headers })
}

test.describe('Activities — remove participant', () => {
  test('cancelling the confirmation dialog keeps the participant', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: `Cancel Remove ${uid()}`,
      maxParticipants: 4,
    })
    await api.close()

    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    const aliceUserId = await getMyUserId(aliceApi)
    const signup = await signupActivityApi(aliceApi, eventId, activityId)
    expect(signup.ok).toBe(true)
    await aliceApi.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageActivitiesTab(adminPage, baseURL!, eventId)
    const adminCard = adminPage.getByTestId(`activity-card-${activityId}`)
    await expect(adminCard).toBeVisible({ timeout: 10000 })
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('1 / 4')

    await adminCard.getByRole('button', { name: /participant/i }).click()
    await expect(adminPage.getByTestId(`activity-participant-${aliceUserId}`)).toBeVisible({
      timeout: 10000,
    })

    await adminPage.getByTestId(`activity-remove-participant-${aliceUserId}`).click()

    const cancelBtn = adminPage.getByTestId('confirm-dialog-cancel')
    await expect(cancelBtn).toBeVisible({ timeout: 5000 })
    await cancelBtn.click()

    await expect(adminPage.getByTestId(`activity-participant-${aliceUserId}`)).toBeVisible()
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('1 / 4')

    await adminCtx.close()
  })

  test('confirming removes participant, flips removed user UI live, and notifies them', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const title = `Removable ${uid()}`
    const { id: activityId } = await createActivityApi(api, eventId, {
      title,
      maxParticipants: 4,
    })
    await api.close()

    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    const aliceUserId = await getMyUserId(aliceApi)
    const signup = await signupActivityApi(aliceApi, eventId, activityId)
    expect(signup.ok).toBe(true)
    // Start Alice with a clean notification slate so we can assert the new row.
    await clearNotifications(aliceApi)
    await aliceApi.close()

    // Alice on the public Activities tab.
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await gotoActivitiesTab(alicePage, baseURL!, eventId)
    const aliceCard = alicePage.getByTestId(`activity-card-${activityId}`)
    await expect(aliceCard).toBeVisible({ timeout: 10000 })
    await expect(aliceCard.getByTestId('activity-card-capacity')).toContainText('1 / 4')
    await expect(alicePage.getByTestId(`activity-withdraw-button-${activityId}`)).toBeVisible()

    // Admin on Manage > Activities tab.
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageActivitiesTab(adminPage, baseURL!, eventId)
    const adminCard = adminPage.getByTestId(`activity-card-${activityId}`)
    await expect(adminCard).toBeVisible({ timeout: 10000 })
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('1 / 4')
    await adminCard.getByRole('button', { name: /participant/i }).click()
    await expect(adminPage.getByTestId(`activity-participant-${aliceUserId}`)).toBeVisible({
      timeout: 10000,
    })

    // Admin removes Alice — confirm in the dialog.
    await adminPage.getByTestId(`activity-remove-participant-${aliceUserId}`).click()
    const confirmBtn = adminPage.getByTestId('confirm-dialog-confirm')
    await expect(confirmBtn).toBeVisible({ timeout: 5000 })
    await confirmBtn.click()

    // Admin view: roster row gone, capacity reset.
    await expect(adminPage.getByTestId(`activity-participant-${aliceUserId}`)).toHaveCount(0, {
      timeout: 10000,
    })
    await expect(adminCard.getByTestId('activity-card-capacity')).toContainText('0 / 4', {
      timeout: 15000,
    })

    // Alice's view (the realtime regression bit): capacity drops + button flips
    // from "Withdraw" back to "Sign up" without a reload.
    await expect(aliceCard.getByTestId('activity-card-capacity')).toContainText('0 / 4', {
      timeout: 15000,
    })
    await expect(alicePage.getByTestId(`activity-withdraw-button-${activityId}`)).toHaveCount(0, {
      timeout: 15000,
    })
    await expect(alicePage.getByTestId(`activity-signup-button-${activityId}`)).toBeVisible({
      timeout: 15000,
    })

    // Notification: open the bell and assert a row whose body mentions the activity title.
    const bell = alicePage.getByTestId('notification-bell')
    await expect(bell).toBeVisible({ timeout: 10000 })
    await expect(alicePage.getByTestId('notification-bell-badge')).toBeVisible({ timeout: 15000 })
    await bell.click()
    await expect(alicePage.getByTestId('notification-bell-panel')).toBeVisible()

    const removalTitle = alicePage
      .locator('[data-testid^="notification-row-title-"]')
      .filter({ hasText: /removed from activity/i })
      .first()
    await expect(removalTitle).toBeVisible({ timeout: 10000 })
    const removalBody = alicePage
      .locator('[data-testid^="notification-row-body-"]')
      .filter({ hasText: title })
      .first()
    await expect(removalBody).toBeVisible({ timeout: 10000 })

    await aliceCtx.close()
    await adminCtx.close()
  })
})
