/**
 * Helpers for setting up notification scenarios in e2e tests.
 *
 * The cheapest realistic notification to generate end-to-end is the
 * `OutbidOnAuctionItem` notification. Three non-admin users are required:
 *   - submitter: creates and publishes the auction item (cannot bid on own item)
 *   - victim:    places the initial bid; will receive the outbid notification
 *   - rival:     places the higher bid that triggers the notification
 * Admins cannot bid, so they cannot stand in for victim or rival.
 */
import type { Browser, BrowserContext, Page } from '@playwright/test'
import {
  adminApi,
  userApi,
  createEventApi,
  configureAuctionApi,
  startAuctionApi,
  joinEventApi,
  createItemApi,
  publishItemApi,
  placeBidApi,
  type ApiContext,
} from './auction'
import { enableEventFeature } from './api'
import { STORAGE_STATE, contextAs, uid } from './auth'

/**
 * Open a browser context as `user`, navigate to `url`, and wait for the
 * SignalR hub to finish its server-side handshake. Mirrors the pattern in
 * `realtime/realtime.spec.ts` — required so that realtime-driven assertions
 * are not racing the connection setup.
 */
export async function openWithRealtime(
  browser: Browser,
  user: keyof typeof STORAGE_STATE,
  url: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const { context, page } = await contextAs(browser, user)
  const negotiate = page
    .waitForResponse((r) => r.url().includes('/hubs/thuddle') && r.status() < 400, {
      timeout: 20000,
    })
    .catch(() => null)
  await page.goto(url)
  await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
  await negotiate
  await page.waitForFunction(
    () =>
      (window as unknown as { __thuddleRealtimeReady?: Promise<void> }).__thuddleRealtimeReady !=
      null,
    null,
    { timeout: 20000 },
  )
  await page.evaluate(
    () => (window as unknown as { __thuddleRealtimeReady: Promise<void> }).__thuddleRealtimeReady,
  )
  return { context, page }
}

export type NotifUser = Exclude<keyof typeof STORAGE_STATE, 'admin'>

export interface OutbidScenario {
  eventId: string
  itemId: string
  itemName: string
  victim: NotifUser
  rival: NotifUser
  initialBid: number
  outbidAmount: number
  /** Place the rival's higher bid, which generates the notification on the victim. */
  triggerOutbid: (amount?: number) => Promise<void>
  /** Close all internal API contexts. Push eventId into `createdEvents` for fixture teardown. */
  cleanup: () => Promise<void>
}

/**
 * Arrange a live auction with one published item where `victim` is the current
 * high bidder. Returns `triggerOutbid()` so the test can fire the notification
 * at the moment the observer page is ready.
 */
export async function setupOutbidScenario(
  browser: Browser,
  baseURL: string,
  opts: { submitter?: NotifUser; victim?: NotifUser; rival?: NotifUser } = {},
): Promise<OutbidScenario> {
  const submitter = opts.submitter ?? 'alice'
  const victim = opts.victim ?? 'bob'
  const rival = opts.rival ?? 'charlie'
  if (submitter === victim || submitter === rival || victim === rival) {
    throw new Error('setupOutbidScenario requires three distinct users')
  }
  const initialBid = 15

  const adminCtx = await adminApi(browser, baseURL)
  const now = new Date()
  const start = new Date(now.getTime() - 60_000).toISOString()
  const end = new Date(now.getTime() + 8 * 60 * 60_000).toISOString()
  const { id: eventId } = await createEventApi(adminCtx, { start, end })
  await enableEventFeature(adminCtx, eventId, 'auction')
  await configureAuctionApi(adminCtx, eventId, {
    itemModerationPolicy: 1, // AutoApprove
    submissionMode: 2, // AllAttendees
    startsAt: new Date(now.getTime() - 1000).toISOString(),
    latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
    minBidIncrement: 1,
  })
  await startAuctionApi(adminCtx, eventId)

  const submitterCtx = await userApi(browser, submitter, baseURL)
  await joinEventApi(submitterCtx, eventId)
  const item = await createItemApi(submitterCtx, eventId, {
    name: `Notif Item ${uid()}`,
    startingBid: 10,
  })
  await publishItemApi(submitterCtx, eventId, item.id)

  const victimCtx = await userApi(browser, victim, baseURL)
  await joinEventApi(victimCtx, eventId)
  const initial = await placeBidApi(victimCtx, eventId, item.id, initialBid)
  if (!initial.ok) {
    throw new Error(`Initial bid failed: ${initial.status} ${initial.error ?? ''}`)
  }

  const rivalCtx = await userApi(browser, rival, baseURL)
  await joinEventApi(rivalCtx, eventId)

  let nextAmount = initialBid + 10
  const contexts: ApiContext[] = [submitterCtx, victimCtx, rivalCtx, adminCtx]

  return {
    eventId,
    itemId: item.id,
    itemName: item.name,
    victim,
    rival,
    initialBid,
    outbidAmount: nextAmount,
    triggerOutbid: async (amount?: number) => {
      const a = amount ?? nextAmount
      nextAmount = a + 10
      const res = await placeBidApi(rivalCtx, eventId, item.id, a)
      if (!res.ok) throw new Error(`Outbid failed: ${res.status} ${res.error ?? ''}`)
    },
    cleanup: async () => {
      for (const c of contexts) await c.close().catch(() => {})
    },
  }
}
