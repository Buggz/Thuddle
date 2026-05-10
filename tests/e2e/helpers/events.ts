import type { Page } from '@playwright/test'

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export type EventRef = string | { slug?: string | null; id: string }

/**
 * Build a URL to an event's detail page (or a sub-path under it).
 *
 * - Pass a slug string for a direct slug URL.
 * - Pass a guid string to intentionally exercise the legacy `/events/{guid}`
 *   redirect shim served by `EventByIdView.vue` — the browser will replace
 *   the URL with the slug version once the event loads.
 * - Pass `{ slug, id }` to prefer the slug when present and fall back to id.
 *
 * NOTE: the redirect shim only fires for the bare `/events/{guid}` path.
 * Nested guid paths like `/events/{guid}/manage` will be matched by the
 * `:slug` route and the API will look up the guid as a slug (404). For
 * helpers that build sub-paths, prefer passing a slug or an `EventRef`.
 */
export function eventUrl(baseURL: string, ref: EventRef, subPath: string = ''): string {
  let segment: string
  if (typeof ref === 'string') {
    segment = ref
  } else {
    segment = ref.slug ?? ref.id
  }
  const tail = subPath ? (subPath.startsWith('/') ? subPath : `/${subPath}`) : ''
  return `${baseURL}/events/${segment}${tail}`
}

function isGuid(s: string): boolean {
  return GUID_RE.test(s)
}

// Re-export for callers that want to introspect.
export { isGuid as _isGuid }

/**
 * Navigate to the manage view of an event and open the Raffles tab.
 * Host-authoring controls (raffle-create-btn, edit/delete on cards, start/draw/present)
 * only render here — `EventView.vue` mounts `<RafflesSection :can-author="false" />`.
 */
export async function gotoManageRafflesTab(page: Page, baseURL: string, eventRef: EventRef): Promise<void> {
  await page.goto(eventUrl(baseURL, eventRef, 'manage'))
  await page.getByTestId('manage-tab-raffles').click()
  await page.getByTestId('manage-raffles-tab').waitFor({ state: 'visible', timeout: 15000 })
}

/**
 * Navigate to the manage view of an event and open the Activities tab.
 * The tab itself is feature-driven (only renders when 'activities' is enabled),
 * so callers must `enableEventFeature(api, eventId, 'activities')` first
 * (or rely on the auto-enable on first activity create).
 */
export async function gotoManageActivitiesTab(page: Page, baseURL: string, eventRef: EventRef): Promise<void> {
  await page.goto(eventUrl(baseURL, eventRef, 'manage'))
  await page.getByTestId('manage-tab-activities').click()
  await page.getByTestId('manage-activities-tab').waitFor({ state: 'visible', timeout: 15000 })
}

/**
 * Navigate to the manage view of an event and open the Features tab,
 * where `EventFeaturesManager` renders the chips + add-feature picker.
 */
export async function gotoManageFeaturesTab(page: Page, baseURL: string, eventRef: EventRef): Promise<void> {
  await page.goto(eventUrl(baseURL, eventRef, 'manage'))
  await page.getByTestId('manage-tab-features').click()
  await page.getByTestId('event-features-manager').waitFor({ state: 'visible', timeout: 15000 })
}

/**
 * Navigate any user to the public Activities tab on an event detail page.
 * The tab is feature-driven AND requires the viewer to have participant access
 * (joined or admin), so callers must ensure both prerequisites are met first.
 */
export async function gotoActivitiesTab(page: Page, baseURL: string, eventRef: EventRef): Promise<void> {
  await page.goto(eventUrl(baseURL, eventRef))
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
  await page.getByTestId('event-tab-activities').click()
  await page.getByTestId('activities-section').waitFor({ state: 'visible', timeout: 15000 })
}
