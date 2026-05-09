/**
 * Notifications: single-user read-receipt flow.
 *
 * Verifies that read state is reflected in the bell badge live, persists across
 * a page reload (so the server actually stored it), and that "mark all read"
 * from the list view zeroes the badge — also persisting.
 */
import { test, expect } from '../helpers/fixtures'
import { setupOutbidScenario, openWithRealtime } from '../helpers/notifications'

test.describe('notifications · read receipts (single user)', () => {
  test('clicking a row marks it read; reload preserves; mark-all-read zeroes the badge', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const scenario = await setupOutbidScenario(browser, baseURL!)
    createdEvents.push(scenario.eventId)

    const { context, page } = await openWithRealtime(browser, scenario.victim, baseURL!)
    await expect(page.getByTestId('notification-bell-badge')).toHaveCount(0)

    await scenario.triggerOutbid()
    await expect(page.getByTestId('notification-bell-badge')).toHaveText('1', { timeout: 15000 })

    // Open the bell panel and grab the notification id from the row testid.
    await page.getByTestId('notification-bell').click()
    const row = page.locator('[data-testid^="notification-row-"][data-read]').first()
    await expect(row).toBeVisible()
    const testId = await row.getAttribute('data-testid')
    if (!testId) throw new Error('notification row missing data-testid')
    const notificationId = testId.replace('notification-row-', '')

    // Click the row — fires POST /api/notifications/{id}/read.
    const readResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/notifications/${notificationId}/read`) &&
        r.request().method() === 'POST',
    )
    await row.click()
    await readResp

    // Badge decrements (no reload).
    await expect(page.getByTestId('notification-bell-badge')).toHaveCount(0, { timeout: 10000 })

    // Reload — the read state must persist server-side.
    await page.reload()
    await page.getByTestId('notification-bell').waitFor({ state: 'visible', timeout: 15000 })
    await expect(page.getByTestId('notification-bell-badge')).toHaveCount(0)

    // Generate a second notification and use the list view's mark-all-read.
    await scenario.triggerOutbid()
    await expect(page.getByTestId('notification-bell-badge')).toHaveText('1', { timeout: 15000 })

    await page.goto(`${baseURL}/notifications`)
    await expect(page.getByTestId('notifications-view')).toBeVisible({ timeout: 10000 })

    const markAllResp = page.waitForResponse(
      (r) =>
        r.url().includes('/api/notifications/read-all') && r.request().method() === 'POST',
    )
    await page.getByTestId('notifications-mark-all-read-btn').click()
    await markAllResp

    await expect(page.getByTestId('notification-bell-badge')).toHaveCount(0, { timeout: 10000 })

    // Reload — still zero.
    await page.reload()
    await page.getByTestId('notification-bell').waitFor({ state: 'visible', timeout: 15000 })
    await expect(page.getByTestId('notification-bell-badge')).toHaveCount(0)

    await context.close()
    await scenario.cleanup()
  })
})
