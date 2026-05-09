import type { APIRequestContext, Browser } from '@playwright/test'
import { STORAGE_STATE } from './auth'
import { futureDates } from './auth'

/**
 * Shared API helpers for test setup. Always prefer API setup over GUI setup
 * for the "Arrange" phase of tests per the e2e-testing skill.
 */

interface ApiContext {
  close: () => Promise<void>
  request: APIRequestContext
  headers: Record<string, string>
  baseURL: string
}

/**
 * Open an authenticated page and capture a Bearer token for REST calls.
 * Waits for the /api/profile response to ensure SSO has completed and token is captured.
 */
export async function userApi(
  browser: Browser,
  baseURL: string,
  user: keyof typeof STORAGE_STATE,
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
  if (!token) {
    throw new Error(`Failed to capture Bearer token for user ${user}.`)
  }
  return {
    close: () => context.close(),
    request: page.request,
    get headers() {
      return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    },
    baseURL,
  }
}

/**
 * Open an admin-authenticated page and capture a Bearer token for REST calls.
 * Convenience wrapper around userApi.
 */
export async function adminApi(browser: Browser, baseURL: string): Promise<ApiContext> {
  return userApi(browser, baseURL, 'admin')
}

// ── Event API helpers ────────────────────────────────────────────────────────

export interface CreateEventPayload {
  title?: string
  location?: string
  description?: string | null
  start?: string
  end?: string
  visibility?: 0 | 1 // 0 = Public, 1 = Unlisted
  joinMode?: 0 | 1 // 0 = Public, 1 = InviteOnly
  capacity?: number | null
  cost?: number | null
}

export async function createEventApi(
  api: ApiContext,
  payload: CreateEventPayload = {},
): Promise<{ id: string; title: string }> {
  const title = payload.title ?? `Event ${Date.now()}`
  const dates = futureDates(10)
  const resp = await api.request.post(`${api.baseURL}/api/events`, {
    headers: api.headers,
    data: JSON.stringify({
      title,
      location: payload.location ?? 'Test Venue',
      description: payload.description ?? null,
      start: payload.start ?? new Date(dates.start).toISOString(),
      end: payload.end ?? new Date(dates.end).toISOString(),
      visibility: payload.visibility ?? 0,
      joinMode: payload.joinMode ?? 0,
      capacity: payload.capacity ?? null,
      cost: payload.cost ?? null,
    }),
  })
  if (resp.status() !== 201) {
    throw new Error(`Create event failed: ${resp.status()} ${await resp.text()}`)
  }
  const body = await resp.json()
  return { id: body.id, title }
}

export async function updateEventApi(
  api: ApiContext,
  eventId: string,
  updates: { title?: string; location?: string },
): Promise<void> {
  const getResp = await api.request.get(`${api.baseURL}/api/events/${eventId}`, {
    headers: api.headers,
  })
  if (!getResp.ok()) throw new Error(`Get event failed: ${getResp.status()}`)
  const current = await getResp.json()
  const resp = await api.request.put(`${api.baseURL}/api/events/${eventId}`, {
    headers: api.headers,
    data: JSON.stringify({
      title: updates.title ?? current.title,
      location: updates.location ?? current.location,
      description: current.description,
      start: current.start,
      end: current.end,
      visibility: current.visibility,
      joinMode: current.joinMode,
      capacity: current.capacity,
      cost: current.cost,
    }),
  })
  if (!resp.ok()) throw new Error(`Update event failed: ${resp.status()} ${await resp.text()}`)
}

export async function deleteEventApi(api: ApiContext, eventId: string): Promise<void> {
  const resp = await api.request.delete(`${api.baseURL}/api/events/${eventId}`, {
    headers: api.headers,
  })
  if (!resp.ok()) throw new Error(`Delete event failed: ${resp.status()}`)
}

export async function inviteUsersApi(
  api: ApiContext,
  eventId: string,
  emails: string[],
): Promise<void> {
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/invitations`, {
    headers: api.headers,
    data: JSON.stringify({ emails }),
  })
  if (!resp.ok()) throw new Error(`Invite failed: ${resp.status()} ${await resp.text()}`)
}

// ── Raffle API helpers ───────────────────────────────────────────────────────

export interface CreateRafflePayload {
  name: string
  description?: string | null
  price?: number | null
  allowSelfReport?: boolean
}

export async function createRaffleApi(
  api: ApiContext,
  eventId: string,
  payload: CreateRafflePayload,
): Promise<{ id: string }> {
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/raffles`, {
    headers: api.headers,
    data: JSON.stringify({
      name: payload.name,
      description: payload.description ?? null,
      pricePerTicket: payload.price ?? null,
      selfReportingEnabled: payload.allowSelfReport ?? false,
    }),
  })
  if (resp.status() !== 201) {
    throw new Error(`Create raffle failed: ${resp.status()} ${await resp.text()}`)
  }
  const body = await resp.json()
  return { id: body.id }
}

export interface AddRaffleEntryPayload {
  tickets: number
  userId: string
}

export async function addRaffleEntryApi(
  api: ApiContext,
  eventId: string,
  raffleId: string,
  payload: AddRaffleEntryPayload,
): Promise<void> {
  const resp = await api.request.put(
    `${api.baseURL}/api/events/${eventId}/raffles/${raffleId}/entries/${payload.userId}`,
    {
      headers: api.headers,
      data: JSON.stringify({ tickets: payload.tickets }),
    },
  )
  if (!resp.ok())
    throw new Error(`Add raffle entry failed: ${resp.status()} ${await resp.text()}`)
}

export async function startRaffleApi(
  api: ApiContext,
  eventId: string,
  raffleId: string,
): Promise<void> {
  const resp = await api.request.post(
    `${api.baseURL}/api/events/${eventId}/raffles/${raffleId}/start`,
    {
      headers: api.headers,
    },
  )
  if (!resp.ok()) throw new Error(`Start raffle failed: ${resp.status()} ${await resp.text()}`)
}

// ── Event Feature registry helpers ───────────────────────────────────────────

/**
 * Minimal duck-typed shape for any helper API context (works with both
 * `helpers/api.ts` and `helpers/auction.ts` ApiContext variants).
 */
type FeatureApiContext = {
  request: APIRequestContext
  headers: Record<string, string>
  baseURL: string
}

export type EventFeatureKey = 'raffles' | 'auction' | 'activities'

/**
 * Enable a feature on an event (owner/co-host only). Most newly created events
 * have NO features enabled — call this immediately after `createEventApi`
 * in tests that exercise raffles, auction, or activities UI.
 */
export async function enableEventFeature(
  api: FeatureApiContext,
  eventId: string,
  key: EventFeatureKey,
): Promise<void> {
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/features`, {
    headers: api.headers,
    data: JSON.stringify({ key }),
  })
  if (!resp.ok()) {
    throw new Error(`Enable feature ${key} failed: ${resp.status()} ${await resp.text()}`)
  }
}

export async function disableEventFeature(
  api: FeatureApiContext,
  eventId: string,
  key: EventFeatureKey,
): Promise<{ ok: boolean; status: number; body: string }> {
  const resp = await api.request.delete(
    `${api.baseURL}/api/events/${eventId}/features/${key}`,
    { headers: api.headers },
  )
  return { ok: resp.ok(), status: resp.status(), body: await resp.text() }
}

export async function listEventFeatures(
  api: FeatureApiContext,
  eventId: string,
): Promise<Array<{ key: string }>> {
  const resp = await api.request.get(`${api.baseURL}/api/events/${eventId}/features`, {
    headers: api.headers,
  })
  if (!resp.ok()) throw new Error(`List features failed: ${resp.status()}`)
  return resp.json()
}

// ── Activity API helpers ─────────────────────────────────────────────────────

export interface CreateActivityPayload {
  title: string
  description?: string | null
  startsAt?: string
  endsAt?: string | null
  maxParticipants: number
}

export async function createActivityApi(
  api: FeatureApiContext,
  eventId: string,
  payload: CreateActivityPayload,
): Promise<{ id: string }> {
  const startsAt = payload.startsAt ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  const endsAt = payload.endsAt ?? new Date(Date.now() + 26 * 3600 * 1000).toISOString()
  const resp = await api.request.post(
    `${api.baseURL}/api/events/${eventId}/activities`,
    {
      headers: api.headers,
      data: JSON.stringify({
        title: payload.title,
        description: payload.description ?? null,
        startsAt,
        endsAt,
        maxParticipants: payload.maxParticipants,
      }),
    },
  )
  if (resp.status() !== 201) {
    throw new Error(`Create activity failed: ${resp.status()} ${await resp.text()}`)
  }
  const body = await resp.json()
  return { id: body.id }
}

export async function signupActivityApi(
  api: FeatureApiContext,
  eventId: string,
  activityId: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const resp = await api.request.post(
    `${api.baseURL}/api/events/${eventId}/activities/${activityId}/signup`,
    { headers: api.headers },
  )
  return { ok: resp.ok(), status: resp.status(), body: await resp.text() }
}

export async function joinEventApi(
  api: FeatureApiContext,
  eventId: string,
): Promise<void> {
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/join`, {
    headers: api.headers,
  })
  if (!resp.ok() && resp.status() !== 409) {
    throw new Error(`Join event failed: ${resp.status()} ${await resp.text()}`)
  }
}
