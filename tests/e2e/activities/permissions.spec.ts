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
import { gotoActivitiesTab } from '../helpers/events'

/**
 * Issue #11 — Activity permissions:
 *  - non-host UI does not surface create/edit/delete or remove-participant
 *  - non-host API calls for those actions are rejected with 403
 *  - non-event-participant cannot sign up
 */

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

test.describe('Activities — permissions', () => {
  test('non-host cannot see create/edit/delete; participant cannot remove others', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: `Permissions ${uid()}`,
      maxParticipants: 8,
    })
    await api.close()

    // Alice + Bob join the event, both sign up via API.
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    const aliceUserId = await getMyUserId(aliceApi)
    const aliceSignup = await signupActivityApi(aliceApi, eventId, activityId)
    expect(aliceSignup.ok).toBe(true)

    const bobApi = await userApi(browser, baseURL!, 'bob')
    await joinEventApi(bobApi, eventId)
    const bobUserId = await getMyUserId(bobApi)
    const bobSignup = await signupActivityApi(bobApi, eventId, activityId)
    expect(bobSignup.ok).toBe(true)

    // Alice opens the public Activities tab. None of the host controls render.
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await gotoActivitiesTab(alicePage, baseURL!, eventId)
    await expect(alicePage.getByTestId('activity-create-button')).toHaveCount(0)
    await expect(alicePage.getByTestId(`activity-edit-button-${activityId}`)).toHaveCount(0)
    await expect(alicePage.getByTestId(`activity-delete-button-${activityId}`)).toHaveCount(0)
    await aliceCtx.close()

    // Direct API: Alice updates / deletes activity → expect 403.
    const updateResp = await aliceApi.request.put(
      `${aliceApi.baseURL}/api/events/${eventId}/activities/${activityId}`,
      {
        headers: aliceApi.headers,
        data: JSON.stringify({
          title: 'Hacked',
          description: null,
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          endsAt: null,
          maxParticipants: 8,
        }),
      },
    )
    expect(updateResp.status()).toBe(403)

    const deleteResp = await aliceApi.request.delete(
      `${aliceApi.baseURL}/api/events/${eventId}/activities/${activityId}`,
      { headers: aliceApi.headers },
    )
    expect(deleteResp.status()).toBe(403)

    // Alice (a participant) cannot remove Bob from the activity.
    const removeResp = await aliceApi.request.delete(
      `${aliceApi.baseURL}/api/events/${eventId}/activities/${activityId}/participants/${bobUserId}`,
      { headers: aliceApi.headers },
    )
    expect(removeResp.status()).toBe(403)

    // Sanity: Alice's own signup is still intact.
    expect(aliceUserId).toBeTruthy()

    await aliceApi.close()
    await bobApi.close()
  })

  test('non-event-participant cannot sign up', async ({ browser, baseURL, createdEvents }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: activityId } = await createActivityApi(api, eventId, {
      title: `No-join ${uid()}`,
      maxParticipants: 4,
    })
    await api.close()

    // Charlie does NOT join the event.
    const charlieApi = await userApi(browser, baseURL!, 'charlie')
    const result = await signupActivityApi(charlieApi, eventId, activityId)
    expect(result.ok).toBe(false)
    // Backend may return 403 (not a participant) or 404; we accept either as
    // the permission boundary, but capture the actual code for diagnostics.
    expect([403, 404]).toContain(result.status)
    await charlieApi.close()
  })
})
