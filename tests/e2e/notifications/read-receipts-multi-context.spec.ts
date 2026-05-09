/**
 * Notifications: cross-device read sync.
 *
 * Open the *same* user in two browser contexts (call them "phone" and
 * "laptop"). When a third user triggers a notification both contexts see the
 * unread badge. Marking read in one context must propagate to the other via
 * the new SignalR `NotificationRead` and `NotificationsAllRead` events.
 */
import { test, expect } from '../helpers/fixtures'
import { setupOutbidScenario, openWithRealtime } from '../helpers/notifications'

test.describe('notifications · cross-device read sync', () => {
  test('NotificationRead and NotificationsAllRead propagate to a second context of the same user', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const scenario = await setupOutbidScenario(browser, baseURL!)
    createdEvents.push(scenario.eventId)

    // Two contexts, same user (victim). Both authenticate via the shared
    // storageState file, so the keycloak identity is identical and they land
    // in the same SignalR user group.
    const phone = await openWithRealtime(browser, scenario.victim, baseURL!)
    const laptop = await openWithRealtime(browser, scenario.victim, baseURL!)

    // ── First outbid: both contexts must show the badge ──
    await scenario.triggerOutbid()

    await expect(phone.page.getByTestId('notification-bell-badge')).toHaveText('1', {
      timeout: 15000,
    })
    await expect(laptop.page.getByTestId('notification-bell-badge')).toHaveText('1', {
      timeout: 15000,
    })

    // Phone marks the notification as read.
    await phone.page.getByTestId('notification-bell').click()
    const phoneRow = phone.page.locator('[data-testid^="notification-row-"][data-read]').first()
    await expect(phoneRow).toBeVisible()
    await phoneRow.click()

    // Laptop's badge must clear without any local interaction or reload —
    // proves the server broadcast NotificationRead to the user group.
    await expect(laptop.page.getByTestId('notification-bell-badge')).toHaveCount(0, {
      timeout: 15000,
    })

    // ── Second outbid + mark-all-read from the list view ──
    await scenario.triggerOutbid()
    await expect(phone.page.getByTestId('notification-bell-badge')).toHaveText('1', {
      timeout: 15000,
    })
    await expect(laptop.page.getByTestId('notification-bell-badge')).toHaveText('1', {
      timeout: 15000,
    })

    await phone.page.goto(`${baseURL}/notifications`)
    await expect(phone.page.getByTestId('notifications-view')).toBeVisible({ timeout: 10000 })
    await phone.page.getByTestId('notifications-mark-all-read-btn').click()

    // Laptop mirrors via NotificationsAllRead.
    await expect(laptop.page.getByTestId('notification-bell-badge')).toHaveCount(0, {
      timeout: 15000,
    })

    await phone.context.close()
    await laptop.context.close()
    await scenario.cleanup()
  })
})
