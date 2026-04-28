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
