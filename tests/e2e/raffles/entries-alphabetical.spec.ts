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
 * Test file: Raffle entries are rendered alphabetically by display name
 * (case-insensitive). The server now returns entries pre-sorted; this spec
 * verifies the host's entries editor preserves and displays that order even
 * when entries were added in a non-alphabetical sequence.
 *
 * Fixture-user constraint: storage states exist for alice, bob, charlie,
 * diana (display names assumed to match the username, capitalised by the
 * server). To prove the sort, entries are added in deliberately reversed
 * order: Charlie -> Bob -> Alice. If display names ever shift away from
 * those usernames, update the `expectedSortedNames` derivation accordingly.
 */

type UserKey = 'alice' | 'bob' | 'charlie'

async function joinAndGetProfile(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  user: UserKey,
  eventId: string,
): Promise<{ id: string; displayName: string }> {
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
  const profile = await expectJson<{ id: string; displayName: string }>(profileResp)

  await ctx.close()
  return { id: profile.id, displayName: profile.displayName }
}

test.describe('Raffle entries rendered alphabetically', () => {
  test('entries appear in alphabetical (case-insensitive) order regardless of insertion order', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Admin sets up event + raffle via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `Alpha Order Raffle ${uid()}`,
      price: 5,
    })
    await api.close()

    // Three users join — so they can be added as raffle entries
    const alice = await joinAndGetProfile(browser, baseURL!, 'alice', eventId)
    const bob = await joinAndGetProfile(browser, baseURL!, 'bob', eventId)
    const charlie = await joinAndGetProfile(browser, baseURL!, 'charlie', eventId)

    // Add entries in deliberately non-alphabetical order: Charlie -> Bob -> Alice
    const adminCtxApi = await adminApi(browser, baseURL!)
    await addRaffleEntryApi(adminCtxApi, eventId, raffleId, { userId: charlie.id, tickets: 1 })
    await addRaffleEntryApi(adminCtxApi, eventId, raffleId, { userId: bob.id, tickets: 1 })
    await addRaffleEntryApi(adminCtxApi, eventId, raffleId, { userId: alice.id, tickets: 1 })
    await adminCtxApi.close()

    // Admin opens manage Raffles tab and expands the raffle
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId(`raffle-card-${raffleId}`).click()

    // Wait for at least one entry row to render before reading the order
    await expect(adminPage.getByTestId(`raffle-entry-row-${alice.id}`)).toBeVisible({ timeout: 10000 })

    // Read the order of rendered entry rows by their userId-suffixed test ids
    const rowLocators = adminPage.locator('[data-testid^="raffle-entry-row-"]')
    const renderedTestIds = await rowLocators.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).getAttribute('data-testid') ?? ''),
    )
    const renderedUserIds = renderedTestIds.map((id) => id.replace('raffle-entry-row-', ''))

    // Map userIds back to display names using the profiles we captured above
    const idToName = new Map<string, string>([
      [alice.id, alice.displayName],
      [bob.id, bob.displayName],
      [charlie.id, charlie.displayName],
    ])
    const renderedNames = renderedUserIds.map((uid) => idToName.get(uid) ?? '__unknown__')

    // Sanity check: all three of our entries rendered
    expect(renderedNames).toHaveLength(3)
    expect(renderedNames).not.toContain('__unknown__')

    // Expected: same names sorted case-insensitively
    const expectedSortedNames = [...renderedNames].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    )

    expect(renderedNames).toEqual(expectedSortedNames)

    await adminCtx.close()
  })
})
