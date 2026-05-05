import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, expectJson, STORAGE_STATE } from '../helpers/auth'
import {
  adminApi,
  createEventApi,
  createRaffleApi,
  addRaffleEntryApi,
} from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Raffle entries filter (issue #12)
 * - The host-side entries editor (RaffleEntries.vue) gains a filter input
 *   keyed by participant display name. Typing narrows the list; the clear
 *   button restores it; an empty match shows an empty-state message.
 */

type UserKey = 'alice' | 'bob' | 'charlie'

async function joinAndGetUserId(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  user: UserKey,
  eventId: string,
): Promise<string> {
  const ctx = await browser.newContext({ storageState: STORAGE_STATE[user] })
  const page = await ctx.newPage()
  let token = ''
  page.on('request', (req) => {
    const auth = req.headers()['authorization']
    if (auth?.startsWith('Bearer ')) token = auth.substring(7)
  })

  await page.goto(`${baseURL}/events/${eventId}`)
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
  await page.getByTestId('event-join-btn').click()
  await expect(page.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

  if (!token) throw new Error(`Failed to capture bearer token for ${user}`)
  const profileResp = await page.request.get(`${baseURL}/api/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const profile = await expectJson<{ id: string }>(profileResp)

  await ctx.close()
  return profile.id
}

test.describe('Raffle entries filter', () => {
  test('filter narrows the entries list, clears on demand, and shows an empty state', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Admin sets up event + raffle via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `Filter Raffle ${uid()}`,
      price: 5,
    })
    await api.close()

    // Three participants join the event so they can be added as raffle entries
    const aliceId = await joinAndGetUserId(browser, baseURL!, 'alice', eventId)
    const bobId = await joinAndGetUserId(browser, baseURL!, 'bob', eventId)
    const charlieId = await joinAndGetUserId(browser, baseURL!, 'charlie', eventId)

    // Admin adds each one as a raffle entry via API
    const adminCtxApi = await adminApi(browser, baseURL!)
    await addRaffleEntryApi(adminCtxApi, eventId, raffleId, { userId: aliceId, tickets: 2 })
    await addRaffleEntryApi(adminCtxApi, eventId, raffleId, { userId: bobId, tickets: 2 })
    await addRaffleEntryApi(adminCtxApi, eventId, raffleId, { userId: charlieId, tickets: 2 })
    await adminCtxApi.close()

    // Admin opens the manage Raffles tab and expands the raffle to reveal the entries editor
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    const aliceRow = adminPage.getByTestId(`raffle-entry-row-${aliceId}`)
    const bobRow = adminPage.getByTestId(`raffle-entry-row-${bobId}`)
    const charlieRow = adminPage.getByTestId(`raffle-entry-row-${charlieId}`)

    // All three rows should be visible to start with
    await expect(aliceRow).toBeVisible({ timeout: 10000 })
    await expect(bobRow).toBeVisible()
    await expect(charlieRow).toBeVisible()

    // Type "ali" -> only Alice's row remains visible
    const filter = adminPage.getByTestId('raffle-entries-filter')
    await filter.fill('ali')

    await expect(aliceRow).toBeVisible()
    await expect(bobRow).toHaveCount(0)
    await expect(charlieRow).toHaveCount(0)

    // Clear -> all three return
    await adminPage.getByTestId('raffle-entries-filter-clear').click()

    await expect(aliceRow).toBeVisible()
    await expect(bobRow).toBeVisible()
    await expect(charlieRow).toBeVisible()

    // No matches -> empty state visible, no rows visible
    await filter.fill('zzznomatch')
    await expect(adminPage.getByTestId('raffle-entries-empty-filter')).toBeVisible({ timeout: 5000 })
    await expect(aliceRow).toHaveCount(0)
    await expect(bobRow).toHaveCount(0)
    await expect(charlieRow).toHaveCount(0)

    await adminCtx.close()
  })
})
