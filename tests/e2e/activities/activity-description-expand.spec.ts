import { test, expect } from '../helpers/fixtures'
import { contextAs, uid } from '../helpers/auth'
import {
  adminApi,
  userApi,
  createEventApi,
  enableEventFeature,
  createActivityApi,
  joinEventApi,
} from '../helpers/api'
import { gotoActivitiesTab } from '../helpers/events'

/**
 * Activities — long descriptions collapse with a `expandable-html-toggle`
 * (See more / See less). Short descriptions don't show the toggle at all.
 */

const longHtml = Array.from(
  { length: 12 },
  (_, i) =>
    `<p>Paragraph ${i + 1}: ${'lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(8)}</p>`,
).join('\n')

const shortHtml = '<p>Just one short line.</p>'

test.describe('Activities — description expandable', () => {
  test('long description shows toggle that expands/collapses; short description shows none', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    const { id: longId } = await createActivityApi(api, eventId, {
      title: `Long ${uid()}`,
      description: longHtml,
      maxParticipants: 4,
    })
    const { id: shortId } = await createActivityApi(api, eventId, {
      title: `Short ${uid()}`,
      description: shortHtml,
      maxParticipants: 4,
    })
    await api.close()

    // Alice joins so she has participant access to view the activities tab.
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    await joinEventApi(aliceApi, eventId)
    await aliceApi.close()

    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await gotoActivitiesTab(alicePage, baseURL!, eventId)

    const longCard = alicePage.getByTestId(`activity-card-${longId}`)
    const shortCard = alicePage.getByTestId(`activity-card-${shortId}`)
    await expect(longCard).toBeVisible({ timeout: 10000 })
    await expect(shortCard).toBeVisible({ timeout: 10000 })

    // Long card: toggle shows "See more" + aria-expanded=false.
    const longToggle = longCard.locator('[data-testid="expandable-html-toggle"]')
    await expect(longToggle).toBeVisible({ timeout: 10000 })
    await expect(longToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(longToggle).toHaveText(/see more/i)

    // Click → expanded, aria-expanded=true, label flips to "See less".
    await longToggle.click()
    await expect(longToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(longToggle).toHaveText(/see less/i)

    // Short card: no toggle at all.
    await expect(shortCard.locator('[data-testid="expandable-html-toggle"]')).toHaveCount(0)

    await aliceCtx.close()
  })
})
