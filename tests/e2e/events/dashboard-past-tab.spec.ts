import { test, expect } from '../helpers/fixtures'
import { uid } from '../helpers/auth'
import { adminApi, createEventApi } from '../helpers/api'

/**
 * Past tab shows events with End < now, ordered End desc (most recently ended first).
 * Past events can't be created via the API (validators reject past dates), so we
 * stagger End values a few seconds out and wait for all three to slip into the past.
 */
test.describe('Dashboard — past tab', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('past events render in End-desc order', async ({ browser, baseURL, createdEvents }) => {
    const tag = uid()
    const titles = {
      earliest: `PastA ${tag}`, // smallest End → ended first → should appear LAST
      middle: `PastB ${tag}`,
      latest: `PastC ${tag}`,   // largest End → ended last → should appear FIRST
    }

    const api = await adminApi(browser, baseURL!)
    try {
      const now = Date.now()
      const a = await createEventApi(api, {
        title: titles.earliest,
        start: new Date(now).toISOString(),
        end: new Date(now + 3_000).toISOString(),
      })
      createdEvents.push(a.id)

      const b = await createEventApi(api, {
        title: titles.middle,
        start: new Date(now).toISOString(),
        end: new Date(now + 5_000).toISOString(),
      })
      createdEvents.push(b.id)

      const c = await createEventApi(api, {
        title: titles.latest,
        start: new Date(now).toISOString(),
        end: new Date(now + 7_000).toISOString(),
      })
      createdEvents.push(c.id)
    } finally {
      await api.close()
    }

    // Wait until all three are past UtcNow.
    await new Promise((r) => setTimeout(r, 9_000))

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      await page.goto(baseURL!)
      await page.getByTestId('dashboard-tab-past').click()

      await expect(page).toHaveURL(/[?&]view=past(?:&|$)/)

      // Filter cards down to the three this test created (uid suffix in title).
      const myCards = page.getByTestId('event-card').filter({ hasText: tag })
      await expect(myCards).toHaveCount(3)

      const orderedTexts = await myCards.allTextContents()
      // End desc → latest first.
      expect(orderedTexts[0]).toContain(titles.latest)
      expect(orderedTexts[1]).toContain(titles.middle)
      expect(orderedTexts[2]).toContain(titles.earliest)
    } finally {
      await ctx.close()
    }
  })
})
