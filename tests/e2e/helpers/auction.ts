/**
 * Shared API helpers for auction e2e tests.
 *
 * Follows the same token-capture pattern used in realtime/realtime.spec.ts.
 */
import { type Browser, type BrowserContext, type APIRequestContext, type Page } from '@playwright/test'
import { STORAGE_STATE, uid, futureDates } from './auth'
import { randomUUID } from 'crypto'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ApiContext {
  close: () => Promise<void>
  request: APIRequestContext
  headers: Record<string, string>
  baseURL: string
  page: Page
  context: BrowserContext
}

export interface AuctionSettingsInput {
  enabled: boolean
  status: number // 0=Draft, 1=Scheduled, 2=Live, 3=Ended
  startsAt: string | null
  latestEndsAt: string | null
  veiledCloseWindow: string // "HH:MM:SS"
  submissionMode: number // 0=AdminsOnly, 1=SelectedAttendees, 2=AllAttendees
  itemModerationPolicy: number // 0=RequireApproval, 1=AutoApprove
  minBidIncrement: number
  allowBuyout: boolean
  anonymousBidHistory: boolean
}

// ── Token capture ──────────────────────────────────────────────────────────

/** Open a browser context, capture a Bearer token, and return an API handle. */
export async function userApi(
  browser: Browser,
  user: keyof typeof STORAGE_STATE,
  baseURL: string,
): Promise<ApiContext> {
  const context = await browser.newContext({ storageState: STORAGE_STATE[user] })
  const page = await context.newPage()
  let token = ''
  page.on('request', (req) => {
    const auth = req.headers()['authorization']
    if (auth?.startsWith('Bearer ')) token = auth.substring(7)
  })
  await page.goto(baseURL)
  await page.waitForResponse(
    (r) =>
      r.url().includes('/api/profile') &&
      r.status() === 200 &&
      (r.request().headers()['authorization'] ?? '').startsWith('Bearer '),
    { timeout: 20000 },
  )
  if (!token) throw new Error(`Failed to capture ${String(user)} Bearer token.`)
  return {
    close: () => context.close(),
    request: page.request,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    baseURL,
    page,
    context,
  }
}

/** Shorthand for admin API context. */
export function adminApi(browser: Browser, baseURL: string) {
  return userApi(browser, 'admin', baseURL)
}

// ── Event helpers ──────────────────────────────────────────────────────────

export async function createEventApi(
  api: ApiContext,
  opts: { title?: string; currency?: string; cost?: number | null } = {},
): Promise<{ id: string; title: string }> {
  const title = opts.title ?? `Auction ${uid()}`
  const dates = futureDates(10)
  const resp = await api.request.post(`${api.baseURL}/api/events`, {
    headers: api.headers,
    data: JSON.stringify({
      title,
      location: 'Auction Venue',
      description: null,
      start: new Date(dates.start).toISOString(),
      end: new Date(dates.end).toISOString(),
      visibility: 0,
      joinMode: 0,
      capacity: null,
      cost: opts.cost ?? null,
      currency: opts.currency ?? 'EUR',
    }),
  })
  if (resp.status() !== 201) throw new Error(`Create event failed: ${resp.status()} ${await resp.text()}`)
  const body = await resp.json()
  return { id: body.id, title }
}

export async function deleteEventApi(api: ApiContext, eventId: string): Promise<void> {
  await api.request.delete(`${api.baseURL}/api/events/${eventId}`, {
    headers: api.headers,
  }).catch(() => {})
}

export async function updateEventApi(
  api: ApiContext,
  eventId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const getResp = await api.request.get(`${api.baseURL}/api/events/${eventId}`, {
    headers: api.headers,
  })
  if (!getResp.ok()) throw new Error(`Get event failed: ${getResp.status()}`)
  const current = await getResp.json()
  const resp = await api.request.put(`${api.baseURL}/api/events/${eventId}`, {
    headers: api.headers,
    data: JSON.stringify({ ...current, ...updates }),
  })
  if (!resp.ok()) throw new Error(`Update event failed: ${resp.status()} ${await resp.text()}`)
}

// ── Auction settings helpers ───────────────────────────────────────────────

export async function configureAuctionApi(
  api: ApiContext,
  eventId: string,
  opts: Partial<AuctionSettingsInput> = {},
): Promise<Record<string, unknown>> {
  const now = new Date()
  const defaults: AuctionSettingsInput = {
    enabled: true,
    status: 1, // Scheduled
    startsAt: new Date(now.getTime() + 60_000).toISOString(),
    latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
    veiledCloseWindow: '00:05:00',
    submissionMode: 2, // AllAttendees
    itemModerationPolicy: 1, // AutoApprove
    minBidIncrement: 1,
    allowBuyout: false,
    anonymousBidHistory: false,
  }
  const body = { ...defaults, ...opts }
  const resp = await api.request.put(`${api.baseURL}/api/events/${eventId}/auction`, {
    headers: api.headers,
    data: JSON.stringify(body),
  })
  if (!resp.ok()) throw new Error(`Configure auction failed: ${resp.status()} ${await resp.text()}`)
  return resp.json()
}

export async function startAuctionApi(api: ApiContext, eventId: string): Promise<Record<string, unknown>> {
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/auction/start`, {
    headers: api.headers,
  })
  if (!resp.ok()) throw new Error(`Start auction failed: ${resp.status()} ${await resp.text()}`)
  return resp.json()
}

export async function getAuctionSettingsApi(
  api: ApiContext,
  eventId: string,
): Promise<Record<string, unknown>> {
  const resp = await api.request.get(`${api.baseURL}/api/events/${eventId}/auction`, {
    headers: api.headers,
  })
  if (!resp.ok()) throw new Error(`Get auction settings failed: ${resp.status()} ${await resp.text()}`)
  return resp.json()
}

// ── Item helpers ───────────────────────────────────────────────────────────

export async function createItemApi(
  api: ApiContext,
  eventId: string,
  opts: { name?: string; description?: string; startingBid?: number; buyoutPrice?: number | null } = {},
): Promise<{ id: string; name: string; status: string }> {
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/auction/items`, {
    headers: api.headers,
    data: JSON.stringify({
      name: opts.name ?? `Item ${uid()}`,
      description: opts.description ?? 'Test item description',
      startingBid: opts.startingBid ?? 10,
      buyoutPrice: opts.buyoutPrice ?? null,
    }),
  })
  if (resp.status() !== 201) throw new Error(`Create item failed: ${resp.status()} ${await resp.text()}`)
  return resp.json()
}

export async function approveItemApi(api: ApiContext, eventId: string, itemId: string): Promise<void> {
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/auction/items/${itemId}/approve`, {
    headers: api.headers,
  })
  if (!resp.ok()) throw new Error(`Approve item failed: ${resp.status()} ${await resp.text()}`)
}

export async function uploadItemImageApi(
  api: ApiContext,
  eventId: string,
  itemId: string,
  filePath: string,
): Promise<{ Id: string; BlobUrl: string; SortOrder: number }> {
  const fs = await import('fs')
  const buffer = fs.readFileSync(filePath)
  const resp = await api.request.post(
    `${api.baseURL}/api/events/${eventId}/auction/items/${itemId}/images`,
    {
      headers: { Authorization: api.headers.Authorization },
      multipart: {
        image: { name: 'test.png', mimeType: 'image/png', buffer },
      },
    },
  )
  if (!resp.ok()) throw new Error(`Upload image failed: ${resp.status()} ${await resp.text()}`)
  return resp.json()
}

// ── Bidding helpers ────────────────────────────────────────────────────────

export async function placeBidApi(
  api: ApiContext,
  eventId: string,
  itemId: string,
  amount: number,
): Promise<{ id: string; amount: number; isBuyout: boolean; ok: boolean; status: number; error?: string }> {
  const resp = await api.request.post(
    `${api.baseURL}/api/events/${eventId}/auction/items/${itemId}/bids`,
    {
      headers: api.headers,
      data: JSON.stringify({ amount, idempotencyKey: randomUUID() }),
    },
  )
  const body = await resp.json().catch(() => ({}))
  return { ...body, ok: resp.ok(), status: resp.status() }
}

export async function buyoutApi(
  api: ApiContext,
  eventId: string,
  itemId: string,
): Promise<{ ok: boolean; status: number; [key: string]: unknown }> {
  const resp = await api.request.post(
    `${api.baseURL}/api/events/${eventId}/auction/items/${itemId}/buyout`,
    {
      headers: api.headers,
      data: JSON.stringify({ amount: 0, idempotencyKey: randomUUID() }),
    },
  )
  const body = await resp.json().catch(() => ({}))
  return { ...body, ok: resp.ok(), status: resp.status() }
}

export async function getBidsApi(
  api: ApiContext,
  eventId: string,
  itemId: string,
): Promise<{ items: Array<{ id: string; amount: number; bidderName?: string; bidderUserId?: string }> }> {
  const resp = await api.request.get(
    `${api.baseURL}/api/events/${eventId}/auction/items/${itemId}/bids`,
    { headers: api.headers },
  )
  if (!resp.ok()) throw new Error(`Get bids failed: ${resp.status()} ${await resp.text()}`)
  return resp.json()
}

// ── Submitter helpers ──────────────────────────────────────────────────────

export async function setSubmittersApi(
  api: ApiContext,
  eventId: string,
  userIds: string[],
): Promise<void> {
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/auction/submitters`, {
    headers: api.headers,
    data: JSON.stringify({ userIds }),
  })
  if (!resp.ok()) throw new Error(`Set submitters failed: ${resp.status()} ${await resp.text()}`)
}

// ── User identity helper ───────────────────────────────────────────────────

/** Call POST /api/profile/init to get the user's GUID from the database. */
export async function getUserIdApi(api: ApiContext): Promise<string> {
  const resp = await api.request.post(`${api.baseURL}/api/profile/init`, {
    headers: api.headers,
  })
  if (!resp.ok()) throw new Error(`Init profile failed: ${resp.status()} ${await resp.text()}`)
  const body = await resp.json()
  return body.id
}

// ── Composite setup helpers ────────────────────────────────────────────────

/**
 * Create an event + configure + start a live auction with one item.
 * Returns IDs needed by most tests. Uses the admin API context.
 */
export async function setupLiveAuction(
  api: ApiContext,
  opts: {
    auctionSettings?: Partial<AuctionSettingsInput>
    itemOpts?: { name?: string; startingBid?: number; buyoutPrice?: number | null }
  } = {},
): Promise<{ eventId: string; itemId: string; itemName: string }> {
  const { id: eventId } = await createEventApi(api)
  const now = new Date()
  await configureAuctionApi(api, eventId, {
    startsAt: new Date(now.getTime() - 1000).toISOString(),
    latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
    ...opts.auctionSettings,
  })
  await startAuctionApi(api, eventId)
  const item = await createItemApi(api, eventId, opts.itemOpts)
  return { eventId, itemId: item.id, itemName: item.name }
}
