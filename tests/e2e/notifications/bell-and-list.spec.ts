/**
 * Notifications: bell + list flag-removal regression.
 *
 * The `notifications` feature flag is gone — the bell must be visible to every
 * authenticated user on first paint, with no env or localStorage toggling.
 */
import { test, expect } from '../helpers/fixtures'
import { setupOutbidScenario, openWithRealtime } from '../helpers/notifications'

test.describe('notifications · bell and list', () => {
  test('bell is visible immediately for an authenticated user (no flag)', async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await openWithRealtime(browser, 'bob', baseURL!)
    await expect(page.getByTestId('notification-bell')).toBeVisible({ timeout: 10000 })
    await context.close()
  })

  test('outbid notification arrives via realtime and renders title + body', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const scenario = await setupOutbidScenario(browser, baseURL!)
    createdEvents.push(scenario.eventId)

    // Victim opens the dashboard and waits for the realtime hub to be ready
    // BEFORE the rival places their outbid — otherwise we'd race the broadcast.
    const { context, page } = await openWithRealtime(browser, scenario.victim, baseURL!)
    await expect(page.getByTestId('notification-bell')).toBeVisible()
    // No badge yet — the victim has no unread notifications
    await expect(page.getByTestId('notification-bell-badge')).toHaveCount(0)

    // Trigger the outbid — backend fires NotificationCreated to the victim.
    await scenario.triggerOutbid()

    // Badge appears via SignalR (no reload).
    await expect(page.getByTestId('notification-bell-badge')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('notification-bell-badge')).toHaveText('1')

    // Open the panel and assert the new row's title + body render correctly.
    await page.getByTestId('notification-bell').click()
    await expect(page.getByTestId('notification-bell-panel')).toBeVisible()

    const titleRow = page.locator('[data-testid^="notification-row-title-"]').first()
    const bodyRow = page.locator('[data-testid^="notification-row-body-"]').first()
    await expect(titleRow).toHaveText(/outbid/i)
    await expect(bodyRow).toContainText(scenario.itemName)

    await context.close()
    await scenario.cleanup()
  })
})
