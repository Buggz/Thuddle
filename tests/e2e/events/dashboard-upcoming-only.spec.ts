import { test, expect } from '../helpers/fixtures'
import { uid } from '../helpers/auth'
import { adminApi, createEventApi } from '../helpers/api'

/**
 * Dashboard default tab (Upcoming) shows only events whose End >= now.
 * Past events cannot be created via the API (validators reject past Start/End),
 * so we simulate "past" by giving the event an End a few seconds in the future
 * and waiting for it to age out.
 */
test.describe('Dashboard — upcoming tab (default)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('only events with End >= now appear under Upcoming', async ({ browser, baseURL, createdEvents }) => {
    const tag = uid()
    const futureTitle = `Future Con ${tag}`
    const pastTitle = `Past Con ${tag}`

    const api = await adminApi(browser, baseURL!)
    try {
      const now = Date.now()
      // Future event: well into the future.
      const future = await createEventApi(api, {
        title: futureTitle,
        start: new Date(now + 2 * 24 * 3600 * 1000).toISOString(),
        end: new Date(now + 3 * 24 * 3600 * 1000).toISOString(),
      })
      createdEvents.push(future.id)

      // "Past" event: ends 4s from now. We will wait it out before asserting.
      const soonPast = await createEventApi(api, {
        title: pastTitle,
        start: new Date(now).toISOString(),
        end: new Date(now + 4_000).toISOString(),
      })
      createdEvents.push(soonPast.id)
    } finally {
      await api.close()
    }

    // Wait for the "past" event's End to slip behind UtcNow.
    await new Promise((r) => setTimeout(r, 6_000))

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      await page.goto(baseURL!)
      await expect(page.getByTestId('dashboard-tab-upcoming')).toBeVisible()
      await expect(page.getByTestId('event-list')).toBeVisible()

      const cards = page.getByTestId('event-card')
      await expect(cards.filter({ hasText: futureTitle })).toHaveCount(1)
      await expect(cards.filter({ hasText: pastTitle })).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })
})
