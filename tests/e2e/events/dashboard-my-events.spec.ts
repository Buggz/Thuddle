import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid } from '../helpers/auth'
import { adminApi, userApi, createEventApi, joinEventApi } from '../helpers/api'

/**
 * My events tab restricts the dashboard to events the caller has joined.
 * The sub-filter pill toggles between Upcoming / Past / All for that subset.
 *
 * Past events can't be created via the public API (validators reject past dates),
 * so for the "past joined" sub-filter assertion we create an event with End a
 * few seconds in the future, alice joins it, and we wait for it to age out.
 */
test.describe('Dashboard — my events tab', () => {
  test.use({ storageState: STORAGE_STATE.alice })

  test('my events shows only events alice joined, with sub-filter for upcoming/past/all', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const tag = uid()
    const myFutureTitle = `My Future ${tag}`
    const notMineTitle = `Not Mine ${tag}`
    const myPastTitle = `My Past ${tag}`

    let myFutureId = ''
    let notMineId = ''
    let myPastId = ''

    // Create three events as admin.
    const adminCtx = await adminApi(browser, baseURL!)
    try {
      const now = Date.now()
      const myFuture = await createEventApi(adminCtx, {
        title: myFutureTitle,
        start: new Date(now + 2 * 24 * 3600 * 1000).toISOString(),
        end: new Date(now + 3 * 24 * 3600 * 1000).toISOString(),
      })
      myFutureId = myFuture.id
      createdEvents.push(myFutureId)

      const notMine = await createEventApi(adminCtx, {
        title: notMineTitle,
        start: new Date(now + 4 * 24 * 3600 * 1000).toISOString(),
        end: new Date(now + 5 * 24 * 3600 * 1000).toISOString(),
      })
      notMineId = notMine.id
      createdEvents.push(notMineId)

      const myPast = await createEventApi(adminCtx, {
        title: myPastTitle,
        start: new Date(now).toISOString(),
        end: new Date(now + 4_000).toISOString(),
      })
      myPastId = myPast.id
      createdEvents.push(myPastId)
    } finally {
      await adminCtx.close()
    }

    // Alice joins the two she should see; she does NOT join Not Mine.
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    try {
      await joinEventApi(aliceApi, myFutureId)
      await joinEventApi(aliceApi, myPastId)
    } finally {
      await aliceApi.close()
    }

    // Wait for the soon-past event to slip behind UtcNow.
    await new Promise((r) => setTimeout(r, 6_000))

    const ctx = await browser.newContext({ storageState: STORAGE_STATE.alice })
    const page = await ctx.newPage()
    try {
      await page.goto(baseURL!)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20_000 })

      // Switch to My events tab — default sub-filter is Upcoming.
      await page.getByTestId('dashboard-tab-my-events').click()
      await expect(page).toHaveURL(/[?&]view=my(?:&|$)/)
      await expect(page.getByTestId('my-events-filter-upcoming')).toBeVisible()

      const myCards = page.getByTestId('event-card').filter({ hasText: tag })

      // Upcoming sub-filter (default): only My Future visible.
      await expect(myCards.filter({ hasText: myFutureTitle })).toHaveCount(1)
      await expect(myCards.filter({ hasText: notMineTitle })).toHaveCount(0)
      await expect(myCards.filter({ hasText: myPastTitle })).toHaveCount(0)

      // Past sub-filter: only My Past visible.
      await page.getByTestId('my-events-filter-past').click()
      await expect(myCards.filter({ hasText: myPastTitle })).toHaveCount(1)
      await expect(myCards.filter({ hasText: myFutureTitle })).toHaveCount(0)
      await expect(myCards.filter({ hasText: notMineTitle })).toHaveCount(0)

      // All sub-filter: both joined events visible, Not Mine still excluded.
      await page.getByTestId('my-events-filter-all').click()
      await expect(myCards.filter({ hasText: myFutureTitle })).toHaveCount(1)
      await expect(myCards.filter({ hasText: myPastTitle })).toHaveCount(1)
      await expect(myCards.filter({ hasText: notMineTitle })).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })
})
