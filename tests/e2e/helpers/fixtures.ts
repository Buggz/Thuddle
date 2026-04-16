import { test as base } from '@playwright/test'
import { STORAGE_STATE } from './auth'

/**
 * Extended Playwright test that tracks created events and deletes them in teardown.
 * Tests push event IDs into the `createdEvents` array; cleanup happens automatically.
 */
export const test = base.extend<{ createdEvents: string[] }>({
  createdEvents: async ({ browser, baseURL }, use) => {
    const ids: string[] = []
    await use(ids)

    // Teardown: open an authenticated page, capture the Bearer token, and delete events
    if (ids.length > 0) {
      const ctx = await browser.newContext({ storageState: STORAGE_STATE.admin })
      const page = await ctx.newPage()

      let token = ''
      page.on('request', (req) => {
        const auth = req.headers()['authorization']
        if (auth?.startsWith('Bearer ')) token = auth.substring(7)
      })

      await page.goto(baseURL!)
      await page.waitForResponse((r) => r.url().includes('/api/events') && r.status() === 200)

      for (const id of ids) {
        await page.request.delete(`${baseURL}/api/events/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {})
      }

      await ctx.close()
    }
  },
})

export { expect } from '@playwright/test'
