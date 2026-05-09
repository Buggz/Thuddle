import type { Page } from '@playwright/test'

/**
 * Navigate to the manage view of an event and open the Raffles tab.
 * Host-authoring controls (raffle-create-btn, edit/delete on cards, start/draw/present)
 * only render here — `EventView.vue` mounts `<RafflesSection :can-author="false" />`.
 */
export async function gotoManageRafflesTab(page: Page, baseURL: string, eventId: string): Promise<void> {
  await page.goto(`${baseURL}/events/${eventId}/manage`)
  await page.getByTestId('manage-tab-raffles').click()
  await page.getByTestId('manage-raffles-tab').waitFor({ state: 'visible', timeout: 15000 })
}

/**
 * Navigate to the manage view of an event and open the Activities tab.
 * The tab itself is feature-driven (only renders when 'activities' is enabled),
 * so callers must `enableEventFeature(api, eventId, 'activities')` first
 * (or rely on the auto-enable on first activity create).
 */
export async function gotoManageActivitiesTab(page: Page, baseURL: string, eventId: string): Promise<void> {
  await page.goto(`${baseURL}/events/${eventId}/manage`)
  await page.getByTestId('manage-tab-activities').click()
  await page.getByTestId('manage-activities-tab').waitFor({ state: 'visible', timeout: 15000 })
}

/**
 * Navigate to the manage view of an event and open the Features tab,
 * where `EventFeaturesManager` renders the chips + add-feature picker.
 */
export async function gotoManageFeaturesTab(page: Page, baseURL: string, eventId: string): Promise<void> {
  await page.goto(`${baseURL}/events/${eventId}/manage`)
  await page.getByTestId('manage-tab-features').click()
  await page.getByTestId('event-features-manager').waitFor({ state: 'visible', timeout: 15000 })
}

/**
 * Navigate any user to the public Activities tab on an event detail page.
 * The tab is feature-driven AND requires the viewer to have participant access
 * (joined or admin), so callers must ensure both prerequisites are met first.
 */
export async function gotoActivitiesTab(page: Page, baseURL: string, eventId: string): Promise<void> {
  await page.goto(`${baseURL}/events/${eventId}`)
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
  await page.getByTestId('event-tab-activities').click()
  await page.getByTestId('activities-section').waitFor({ state: 'visible', timeout: 15000 })
}
