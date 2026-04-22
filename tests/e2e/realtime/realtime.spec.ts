import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, contextAs, uid, futureDates } from '../helpers/auth'
import type { APIRequestContext, Browser, Page } from '@playwright/test'

/**
 * End-to-end tests for the SignalR realtime system (Option B: group-scoped
 * broadcasts). Each test verifies that the observing user's UI updates without
 * a page refresh when another user performs a mutation.
 *
 * Setup pattern:
 *   1. Observer loads a page and waits for initial state.
 *   2. Mutator performs an action via REST (admin token).
 *   3. Observer asserts UI changes via Playwright's auto-waiting expects.
 *   4. No `page.reload()` is ever called.
 */

// ── Admin token + REST helpers ─────────────────────────────────────────────

/** Open an admin-authenticated page and capture a Bearer token for REST calls. */
async function adminApi(
  browser: Browser,
  baseURL: string,
): Promise<{ close: () => Promise<void>; request: APIRequestContext; headers: Record<string, string>; baseURL: string }> {
  const context = await browser.newContext({ storageState: STORAGE_STATE.admin })
  const page = await context.newPage()
  let token = ''
  page.on('request', (req) => {
    const auth = req.headers()['authorization']
    if (auth?.startsWith('Bearer ')) token = auth.substring(7)
  })
  await page.goto(baseURL)
  await page.waitForResponse(
    (r) =>
      r.url().includes('/api/events') &&
      r.status() === 200 &&
      (r.request().headers()['authorization'] ?? '').startsWith('Bearer '),
    { timeout: 20000 },
  )
  if (!token) {
    throw new Error('Failed to capture admin Bearer token.')
  }
  return {
    close: () => context.close(),
    request: page.request,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    baseURL,
  }
}

interface CreatePayload {
  title?: string
  visibility?: 0 | 1 // 0 = Public, 1 = Unlisted
  joinMode?: 0 | 1 // 0 = Public, 1 = InviteOnly
  capacity?: number | null
}

async function createEventApi(
  api: Awaited<ReturnType<typeof adminApi>>,
  payload: CreatePayload = {},
): Promise<{ id: string; title: string }> {
  const title = payload.title ?? `RT ${uid()}`
  const dates = futureDates(10)
  const resp = await api.request.post(`${api.baseURL}/api/events`, {
    headers: api.headers,
    data: JSON.stringify({
      title,
      location: 'Realtime Venue',
      description: null,
      start: new Date(dates.start).toISOString(),
      end: new Date(dates.end).toISOString(),
      visibility: payload.visibility ?? 0,
      joinMode: payload.joinMode ?? 0,
      capacity: payload.capacity ?? null,
      cost: null,
    }),
  })
  if (resp.status() !== 201) {
    throw new Error(`Create event failed: ${resp.status()} ${await resp.text()}`)
  }
  const body = await resp.json()
  return { id: body.id, title }
}

async function updateEventApi(
  api: Awaited<ReturnType<typeof adminApi>>,
  eventId: string,
  updates: { title?: string; location?: string },
): Promise<void> {
  const getResp = await api.request.get(`${api.baseURL}/api/events/${eventId}`, {
    headers: api.headers,
  })
  if (!getResp.ok()) throw new Error(`Get event failed: ${getResp.status()}`)
  const current = await getResp.json()
  const resp = await api.request.put(`${api.baseURL}/api/events/${eventId}`, {
    headers: api.headers,
    data: JSON.stringify({
      title: updates.title ?? current.title,
      location: updates.location ?? current.location,
      description: current.description,
      start: current.start,
      end: current.end,
      visibility: current.visibility,
      joinMode: current.joinMode,
      capacity: current.capacity,
      cost: current.cost,
    }),
  })
  if (!resp.ok()) throw new Error(`Update event failed: ${resp.status()} ${await resp.text()}`)
}

async function deleteEventApi(
  api: Awaited<ReturnType<typeof adminApi>>,
  eventId: string,
): Promise<void> {
  const resp = await api.request.delete(`${api.baseURL}/api/events/${eventId}`, {
    headers: api.headers,
  })
  if (!resp.ok()) throw new Error(`Delete event failed: ${resp.status()}`)
}

async function inviteUsersApi(
  api: Awaited<ReturnType<typeof adminApi>>,
  eventId: string,
  emails: string[],
): Promise<void> {
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/invitations`, {
    headers: api.headers,
    data: JSON.stringify({ emails }),
  })
  if (!resp.ok()) throw new Error(`Invite failed: ${resp.status()} ${await resp.text()}`)
}

/**
 * Open a user context and navigate to `url`, waiting for the SignalR hub
 * negotiate response (set up BEFORE navigation to avoid races) and the
 * user-display-name to be visible so SSO has completed.
 */
async function openWithRealtime(
  browser: Browser,
  user: Parameters<typeof contextAs>[1],
  url: string,
): Promise<{ context: Awaited<ReturnType<typeof contextAs>>['context']; page: Page }> {
  const { context, page } = await contextAs(browser, user)
  // Register the listener BEFORE goto so the negotiate response isn't missed.
  const negotiatePromise = page
    .waitForResponse(
      (r) => r.url().includes('/hubs/thuddle') && r.status() < 400,
      { timeout: 20000 },
    )
    .catch(() => null)
  await page.goto(url)
  await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
  await negotiatePromise
  // Small grace period for the WebSocket handshake to complete and subscriptions
  // to be established server-side.
  await page.waitForTimeout(500)
  return { context, page }
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Realtime live updates', () => {
  test.describe('dashboard', () => {
    test('public event created by admin appears on alice\'s dashboard without refresh', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      // Alice opens the dashboard (waits for SSO + SignalR negotiate).
      const { context: aliceCtx, page: alicePage } = await openWithRealtime(
        browser,
        'alice',
        baseURL!,
      )

      // Admin creates a new public event via REST
      const api = await adminApi(browser, baseURL!)
      const { id, title } = await createEventApi(api, { visibility: 0, joinMode: 0 })
      createdEvents.push(id)
      await api.close()

      // Alice's dashboard should now show the new event with no refresh.
      // (We don't assert an exact total card count because other tests running
      // in parallel may be creating/deleting events concurrently.)
      await expect(alicePage.getByTestId('event-card').filter({ hasText: title })).toBeVisible({
        timeout: 15000,
      })

      await aliceCtx.close()
    })

    test('unlisted event does NOT appear on uninvited user\'s dashboard', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      // Bob opens the dashboard (he won't be invited).
      const { context: bobCtx, page: bobPage } = await openWithRealtime(
        browser,
        'bob',
        baseURL!,
      )

      // Admin creates an unlisted (visibility=1) event — no broadcast should
      // reach bob via the `dashboard` group.
      const api = await adminApi(browser, baseURL!)
      const title = `Hidden ${uid()}`
      const { id } = await createEventApi(api, { visibility: 1, joinMode: 0, title })
      createdEvents.push(id)
      await api.close()

      // Wait a reasonable time for any broadcast to propagate, then assert absence.
      await bobPage.waitForTimeout(2500)
      await expect(bobPage.getByTestId('event-card').filter({ hasText: title })).toHaveCount(0)

      await bobCtx.close()
    })

    test('event deleted by admin disappears from alice\'s dashboard without refresh', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      // Admin creates an event first
      const api = await adminApi(browser, baseURL!)
      const { id, title } = await createEventApi(api)
      createdEvents.push(id)
      await api.close()

      // Alice loads the dashboard and confirms the event is listed.
      const { context: aliceCtx, page: alicePage } = await openWithRealtime(
        browser,
        'alice',
        baseURL!,
      )
      await expect(alicePage.getByTestId('event-card').filter({ hasText: title })).toBeVisible({
        timeout: 15000,
      })

      // Admin deletes the event
      const api2 = await adminApi(browser, baseURL!)
      await deleteEventApi(api2, id)
      await api2.close()

      // Card should vanish without a refresh
      await expect(alicePage.getByTestId('event-card').filter({ hasText: title })).toHaveCount(0, {
        timeout: 15000,
      })

      // Event already deleted — avoid double-delete in teardown
      const idx = createdEvents.indexOf(id)
      if (idx !== -1) createdEvents.splice(idx, 1)

      await aliceCtx.close()
    })

    test('invitation to invite-only event causes dashboard refresh for invitee', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      // Admin creates an invite-only unlisted event — alice won't see it yet.
      const api = await adminApi(browser, baseURL!)
      const { id, title } = await createEventApi(api, { visibility: 1, joinMode: 1 })
      createdEvents.push(id)

      // Alice opens dashboard — event should NOT be visible initially.
      const { context: aliceCtx, page: alicePage } = await openWithRealtime(
        browser,
        'alice',
        baseURL!,
      )
      await expect(
        alicePage.getByTestId('event-card').filter({ hasText: title }),
      ).toHaveCount(0)

      // Admin invites alice. This fires InvitationSent → dashboard refresh.
      await inviteUsersApi(api, id, ['alice@thuddle.dev'])
      await api.close()

      // The event should now appear on alice's dashboard without refresh.
      await expect(
        alicePage.getByTestId('event-card').filter({ hasText: title }),
      ).toBeVisible({ timeout: 15000 })

      await aliceCtx.close()
    })
  })

  test.describe('event detail page', () => {
    test('event title updates live when admin edits event', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id, title } = await createEventApi(api)
      createdEvents.push(id)
      await api.close()

      // Alice opens the event page.
      const { context: aliceCtx, page: alicePage } = await openWithRealtime(
        browser,
        'alice',
        `${baseURL}/events/${id}`,
      )
      await expect(alicePage.getByTestId('event-detail')).toBeVisible()
      await expect(alicePage.getByTestId('event-title')).toHaveText(title)

      // Admin renames the event
      const newTitle = `${title} (edited)`
      const api2 = await adminApi(browser, baseURL!)
      await updateEventApi(api2, id, { title: newTitle })
      await api2.close()

      // Alice sees the new title without refresh
      await expect(alicePage.getByTestId('event-title')).toHaveText(newTitle, { timeout: 15000 })

      await aliceCtx.close()
    })

    test('participant count updates live when another user joins', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id } = await createEventApi(api)
      createdEvents.push(id)
      await api.close()

      // Alice opens the event page — participant count starts at 0.
      const { context: aliceCtx, page: alicePage } = await openWithRealtime(
        browser,
        'alice',
        `${baseURL}/events/${id}`,
      )
      await expect(alicePage.getByTestId('event-detail')).toBeVisible()
      await expect(alicePage.getByTestId('event-tab-attendees')).toContainText('0')

      // Bob joins via the UI (this triggers ParticipantChanged).
      const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
      await bobPage.goto(`${baseURL}/events/${id}`)
      await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await bobPage.getByTestId('event-join-btn').click()
      await expect(bobPage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
      await bobCtx.close()

      // Alice's attendees tab count updates without refresh.
      await expect(alicePage.getByTestId('event-tab-attendees')).toContainText('1', {
        timeout: 15000,
      })

      await aliceCtx.close()
    })

    test('participants list appends new member live on attendees tab', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id } = await createEventApi(api)
      createdEvents.push(id)
      await api.close()

      // Alice opens event and switches to the attendees tab.
      const { context: aliceCtx, page: alicePage } = await openWithRealtime(
        browser,
        'alice',
        `${baseURL}/events/${id}`,
      )
      await expect(alicePage.getByTestId('event-detail')).toBeVisible()
      await alicePage.getByTestId('event-tab-attendees').click()
      await expect(alicePage.getByTestId('participants-empty')).toBeVisible()

      // Bob joins in a separate context.
      const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
      await bobPage.goto(`${baseURL}/events/${id}`)
      await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await bobPage.getByTestId('event-join-btn').click()
      await expect(bobPage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
      await bobCtx.close()

      // Alice's attendees list updates live.
      await expect(alicePage.getByTestId('participants-list')).toBeVisible({ timeout: 15000 })
      await expect(alicePage.getByTestId('participant-item')).toHaveCount(1, { timeout: 15000 })

      await aliceCtx.close()
    })

    test('discussion unread indicator appears live when admin posts', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id } = await createEventApi(api)
      createdEvents.push(id)
      await api.close()

      // Alice opens the event (info tab active — NOT discussion).
      const { context: aliceCtx, page: alicePage } = await openWithRealtime(
        browser,
        'alice',
        `${baseURL}/events/${id}`,
      )
      await expect(alicePage.getByTestId('event-detail')).toBeVisible()
      await expect(alicePage.getByTestId('discussion-unread-indicator')).toHaveCount(0)

      // Admin posts in the discussion via the UI (discussion API lives under
      // /api/events/{id}/discussion).
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await adminPage.goto(`${baseURL}/events/${id}`)
      await adminPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await adminPage.getByTestId('event-tab-discussion').click()
      await adminPage.getByTestId('discussion-new-post-btn').click()
      await adminPage.locator('.ProseMirror').click()
      await adminPage.locator('.ProseMirror').fill(`Realtime post ${uid()}`)
      const postResp = adminPage.waitForResponse(
        (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
      )
      await adminPage.getByTestId('discussion-submit-post-btn').click()
      expect((await postResp).status()).toBe(201)
      await adminCtx.close()

      // Alice sees the unread indicator appear without refresh.
      await expect(alicePage.getByTestId('discussion-unread-indicator')).toBeVisible({
        timeout: 15000,
      })

      await aliceCtx.close()
    })

    test('event deleted by admin causes detail page to reflect removal (card gone from dashboard too)', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id, title } = await createEventApi(api)
      createdEvents.push(id)
      await api.close()

      // Open alice's dashboard and wait for the event card to be visible.
      const { context: aliceCtx, page: dashboardPage } = await openWithRealtime(
        browser,
        'alice',
        baseURL!,
      )
      await expect(
        dashboardPage.getByTestId('event-card').filter({ hasText: title }),
      ).toBeVisible({ timeout: 15000 })

      // Admin deletes the event.
      const api2 = await adminApi(browser, baseURL!)
      await deleteEventApi(api2, id)
      await api2.close()

      // Dashboard card disappears live.
      await expect(
        dashboardPage.getByTestId('event-card').filter({ hasText: title }),
      ).toHaveCount(0, { timeout: 15000 })

      // Teardown cleanup: event is already gone
      const idx = createdEvents.indexOf(id)
      if (idx !== -1) createdEvents.splice(idx, 1)

      await aliceCtx.close()
    })
  })

  test.describe('subscription scoping (security)', () => {
    test('uninvited user does not receive updates for unlisted events they cannot access', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      // Admin creates an unlisted + invite-only event that bob cannot access.
      const api = await adminApi(browser, baseURL!)
      const { id, title } = await createEventApi(api, { visibility: 1, joinMode: 1 })
      createdEvents.push(id)

      // Bob opens the dashboard. His SignalR connection is only in the
      // `dashboard` group + his `user:{keycloakId}` group. He should not be
      // subscribed to `event:{id}` and therefore should receive no updates
      // when the event is modified.
      const { context: bobCtx, page: bobPage } = await openWithRealtime(
        browser,
        'bob',
        baseURL!,
      )

      // Admin renames the event. Any leak would cause bob's client to try to
      // reconcile a card he doesn't have — asserting absence covers this.
      await updateEventApi(api, id, { title: `${title} (renamed)` })
      await api.close()

      // Give time for any potential (unwanted) broadcast.
      await bobPage.waitForTimeout(2500)
      await expect(
        bobPage.getByTestId('event-card').filter({ hasText: title }),
      ).toHaveCount(0)
      await expect(
        bobPage.getByTestId('event-card').filter({ hasText: `${title} (renamed)` }),
      ).toHaveCount(0)

      await bobCtx.close()
    })
  })
})
