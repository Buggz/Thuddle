import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, contextAs, uid } from '../helpers/auth'
import { adminApi, createEventApi, updateEventApi, deleteEventApi, inviteUsersApi } from '../helpers/api'
import type { Browser, Page } from '@playwright/test'

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

/**
 * Open a user context and navigate to `url`, waiting for the SignalR hub to
 * be fully ready (negotiate response received AND server-side OnConnectedAsync
 * has finished establishing initial group memberships, signalled via the
 * 'Ready' message exposed as `window.__thuddleRealtimeReady`).
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
  // Wait for the server's 'Ready' handshake message — this guarantees the
  // connection has been added to the dashboard (and user) groups server-side
  // and any subsequent broadcast will reach this client. Avoids the prior
  // race where a fixed sleep wasn't always long enough on slower CI runners.
  await page.waitForFunction(
    () => (window as unknown as { __thuddleRealtimeReady?: Promise<void> }).__thuddleRealtimeReady != null,
    null,
    { timeout: 20000 },
  )
  await page.evaluate(
    () => (window as unknown as { __thuddleRealtimeReady: Promise<void> }).__thuddleRealtimeReady,
  )
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
