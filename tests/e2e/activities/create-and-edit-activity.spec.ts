import { test, expect } from '../helpers/fixtures'
import { contextAs, uid } from '../helpers/auth'
import {
  adminApi,
  createEventApi,
  enableEventFeature,
  createActivityApi,
  listEventFeatures,
} from '../helpers/api'
import { gotoManageActivitiesTab, gotoManageFeaturesTab } from '../helpers/events'

/**
 * Issue #11 — Activities: create and edit flows. Verifies the auto-enable
 * path (creating the first activity also enables the feature on the event)
 * and the standard create-via-UI path through the picker.
 */

test.describe('Activities — create and edit', () => {
  test('host creates an activity through the UI after enabling activities via picker', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageFeaturesTab(adminPage, baseURL!, eventId)

    // Activities tab is not yet present — feature is off.
    await expect(adminPage.getByTestId('manage-tab-activities')).toHaveCount(0)

    // Add Activities via picker.
    await adminPage.getByTestId('event-feature-add-btn').click()
    await expect(adminPage.getByTestId('feature-picker-modal')).toBeVisible()
    await adminPage.getByTestId('feature-picker-add-activities').click()
    await expect(adminPage.getByTestId('event-feature-chip-activities')).toBeVisible({ timeout: 10000 })

    // Switch to the (now-visible) Activities tab.
    await adminPage.getByTestId('manage-tab-activities').click()
    await expect(adminPage.getByTestId('manage-activities-tab')).toBeVisible()

    // Open editor + fill form.
    await adminPage.getByTestId('activity-create-button').click()
    const title = `Quiz Night ${uid()}`
    await adminPage.getByTestId('activity-form-title').fill(title)

    const startsAt = new Date(Date.now() + 60 * 60 * 1000) // +1h
    const endsAt = new Date(Date.now() + 3 * 60 * 60 * 1000) // +3h
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    await adminPage.getByTestId('activity-form-starts-at').fill(fmt(startsAt))
    await adminPage.getByTestId('activity-form-ends-at').fill(fmt(endsAt))
    await adminPage.getByTestId('activity-form-max-participants').fill('8')

    const createResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/activities`) && r.request().method() === 'POST',
    )
    await adminPage.getByTestId('activity-form-submit').click()
    await createResp

    await expect(adminPage.getByTestId('activities-list')).toBeVisible({ timeout: 10000 })
    await expect(adminPage.getByTestId('activities-list')).toContainText(title)

    await adminCtx.close()
  })

  test('host creates first activity directly via API; activities feature is auto-enabled', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    // Sanity: features list starts empty.
    let features = await listEventFeatures(api, eventId)
    expect(features.find((f) => f.key === 'activities')).toBeUndefined()

    // Direct API: POST /activities — no enable-feature call.
    await createActivityApi(api, eventId, { title: `Auto-enable ${uid()}`, maxParticipants: 4 })

    features = await listEventFeatures(api, eventId)
    expect(features.find((f) => f.key === 'activities')).toBeDefined()

    await api.close()
  })

  test('host edits and deletes an activity', async ({ browser, baseURL, createdEvents }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const original = `Original ${uid()}`
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: original,
      maxParticipants: 6,
    })
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageActivitiesTab(adminPage, baseURL!, eventId)
    await expect(adminPage.getByTestId(`activity-card-${activityId}`)).toBeVisible({ timeout: 10000 })

    // Edit
    await adminPage.getByTestId(`activity-edit-button-${activityId}`).click()
    const updated = `${original} (edited)`
    await adminPage.getByTestId('activity-form-title').fill(updated)
    const editResp = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/activities/${activityId}`) &&
        r.request().method() === 'PUT',
    )
    await adminPage.getByTestId('activity-form-submit').click()
    await editResp

    await expect(adminPage.getByTestId(`activity-card-${activityId}`)).toContainText(updated, {
      timeout: 10000,
    })

    // Delete
    await adminPage.getByTestId(`activity-delete-button-${activityId}`).click()
    await adminPage.getByTestId('confirm-dialog-confirm').click()

    await expect(adminPage.getByTestId(`activity-card-${activityId}`)).toHaveCount(0, {
      timeout: 10000,
    })

    await adminCtx.close()
  })
})
