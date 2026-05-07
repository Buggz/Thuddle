import { devices } from '@playwright/test'
import { test, expect } from '../helpers/fixtures'
import { contextAs } from '../helpers/auth'
import { adminApi, createEventApi, enableEventFeature } from '../helpers/api'
import { gotoManageFeaturesTab } from '../helpers/events'
import { setFeatureFlagOverride } from '../helpers/featureFlags'

/**
 * Issue #11 — Mobile-specific feature UI behaviour.
 *
 * Playwright config has no dedicated mobile project, so we apply the iPhone 13
 * device profile per-file via test.use(). The chromium project still runs us.
 */

test.use({ ...devices['iPhone 13'] })

test.describe('Mobile feature UI', () => {
  test('tab strip scrolls horizontally on mobile when many features enabled', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await enableEventFeature(api, eventId, 'auction')
    await enableEventFeature(api, eventId, 'activities')
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    // Auction tab requires the global feature flag to be on.
    await setFeatureFlagOverride(adminPage, 'VITE_FEATURE_AUCTIONS', true)
    await adminPage.goto(`${baseURL}/events/${eventId}`)
    await adminPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })

    // All five tabs are present in the DOM.
    await expect(adminPage.getByTestId('event-tab-discussion')).toBeVisible()
    await expect(adminPage.getByTestId('event-tab-attendees')).toBeVisible()
    await expect(adminPage.getByTestId('event-tab-raffles')).toBeVisible()
    await expect(adminPage.getByTestId('event-tab-auction')).toBeVisible()
    await expect(adminPage.getByTestId('event-tab-activities')).toBeVisible()

    // The nav element that hosts the tabs must overflow horizontally on mobile.
    const tab = adminPage.getByTestId('event-tab-activities')
    const overflows = await tab.evaluate((el) => {
      // Walk up to the nearest horizontal scroll container.
      let node: HTMLElement | null = el as HTMLElement
      while (node && node !== document.body) {
        const style = getComputedStyle(node)
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
          return node.scrollWidth > node.clientWidth
        }
        node = node.parentElement
      }
      return false
    })
    expect(overflows).toBe(true)

    // The right-most feature tab should still be reachable via scroll-into-view.
    await tab.scrollIntoViewIfNeeded()
    await tab.click()
    await expect(adminPage.getByTestId('activities-section')).toBeVisible({ timeout: 10000 })

    await adminCtx.close()
  })

  test('feature picker modal is full-screen on mobile', async ({
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
    await adminPage.getByTestId('event-feature-add-btn').click()

    const modal = adminPage.getByTestId('feature-picker-modal')
    await expect(modal).toBeVisible()

    const viewport = adminPage.viewportSize()
    expect(viewport).not.toBeNull()
    const box = await modal.boundingBox()
    expect(box).not.toBeNull()
    if (box && viewport) {
      expect(box.width).toBe(viewport.width)
      expect(box.height).toBeGreaterThanOrEqual(viewport.height - 100)
    }

    await adminCtx.close()
  })
})
