/**
 * Notifications: deep-link resolution.
 *
 * One assertion per resolvable entityType. Only `AuctionItem` is generated end
 * to end here — the other entity types (DiscussionPost, DiscussionComment,
 * EventInvitation, ContactGroup, Raffle) are stubbed because there is not yet
 * a cheap helper to generate them as real notifications. They're tracked as
 * `test.skip` placeholders so they show up when listed.
 */
import { test, expect } from '../helpers/fixtures'
import { setupOutbidScenario, openWithRealtime } from '../helpers/notifications'

test.describe('notifications · deep links', () => {
  test('auction-item notification navigates to the item page and marks read', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const scenario = await setupOutbidScenario(browser, baseURL!, {
      submitter: 'alice',
      victim: 'charlie',
      rival: 'diana',
    })
    createdEvents.push(scenario.eventId)

    const { context, page } = await openWithRealtime(browser, scenario.victim, baseURL!)
    // Auction routes are gated by the `auctions` feature flag. The flag is
    // re-read from localStorage on each access, so setting it on the live
    // page is enough — no full reload required.
    await page.evaluate(() =>
      window.localStorage.setItem('thuddle:flag:VITE_FEATURE_AUCTIONS', 'true'),
    )

    await scenario.triggerOutbid()
    await expect(page.getByTestId('notification-bell-badge')).toHaveText('1', { timeout: 15000 })

    await page.getByTestId('notification-bell').click()
    const row = page.locator('[data-testid^="notification-row-"][data-read]').first()
    await expect(row).toBeVisible()

    await row.click()

    // The resolver currently can't deep-link into an auction item without the
    // event slug — see resolveTarget.js: AuctionItem maps to the `event-by-id`
    // route, which the redirect shim then rewrites to the slug URL. So the
    // post-click URL should be `/events/{slug}`, never the guid, and never
    // (yet) the `/auction/items/{id}` deep path.
    await page.waitForURL(
      (u) => /\/events\/[^/?#]+(?:[?#].*)?$/.test(u.pathname + u.search + u.hash) && !u.pathname.includes(scenario.eventId),
      { timeout: 10000 },
    )
    await expect(page.getByTestId('event-detail')).toBeVisible({ timeout: 10000 })

    // Click also marks the notification read — bell badge must disappear.
    await expect(page.getByTestId('notification-bell-badge')).toHaveCount(0, { timeout: 10000 })

    await context.close()
    await scenario.cleanup()
  })

  // ── Stubs ────────────────────────────────────────────────────────────────
  // The following entityTypes are mapped by `resolveNotificationTarget` but no
  // cheap e2e helper exists yet to *generate* a real notification of these
  // kinds. Add tests once the relevant backend flows expose generation paths
  // (or once direct-insert helpers are added to the test seed API).

  test.skip('discussion-post notification scrolls to #post-{id}', () => {
    // TODO: needs a way to trigger a DiscussionPost notification (e.g. admin
    // posts in a discussion subscribed-to by the observer).
  })

  test.skip('discussion-comment notification scrolls to #comment-{id} and is in viewport', () => {
    // TODO: needs a way to trigger a DiscussionComment notification (e.g.
    // someone replies to the observer's post). Once available, assert
    // `await expect(page.locator('#comment-' + id)).toBeInViewport()`.
  })

  test.skip('event-invitation notification navigates to the event', () => {
    // TODO: invite the observer; backend currently routes via a separate
    // invitation flow — wire this up once a notification of kind
    // EventInvitation is reliably emitted on POST /events/:id/invitations.
  })

  test.skip('contact-group notification navigates to /groups', () => {
    // TODO: needs a ContactGroup-generating action (e.g. group invite).
  })

  test.skip('raffle notification navigates to event with #raffles hash', () => {
    // TODO: needs a Raffle-generating action (e.g. winner announcement).
  })
})
