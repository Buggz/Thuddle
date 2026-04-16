import { test as base, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates, contextAs } from '../helpers/auth'
import type { Browser, Page } from '@playwright/test'

/**
 * Extends the base fixture with automatic cleanup of contact groups created during a test.
 */
const test = base.extend<{ createdGroups: string[] }>({
  createdGroups: async ({ browser, baseURL }, use) => {
    const ids: string[] = []
    await use(ids)
    if (ids.length === 0) return

    const ctx = await browser.newContext({ storageState: STORAGE_STATE.admin })
    const page = await ctx.newPage()
    let token = ''
    page.on('request', (req) => {
      const auth = req.headers()['authorization']
      if (auth?.startsWith('Bearer ')) token = auth.substring(7)
    })
    await page.goto(baseURL!)
    await page.waitForResponse((r) => r.url().includes('/api/events') && r.status() === 200)
    for (const id of ids) {
      await page.request.delete(`${baseURL}/api/groups/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    await ctx.close()
  },
})

/** Navigate to the Groups hub and wait for it to load. */
async function goToGroupsHub(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/groups`)
  await page.getByTestId('groups-heading').waitFor({ state: 'visible', timeout: 20000 })
}

/** Create a new group via the sidebar form and return its id (from the API response). */
async function createGroupInHub(page: Page, name: string): Promise<string> {
  await page.getByTestId('groups-new-name-input').fill(name)
  const createResp = page.waitForResponse(
    (r) => r.url().endsWith('/api/groups') && r.request().method() === 'POST',
  )
  await page.getByTestId('groups-create-btn').click()
  const resp = await createResp
  const body = await resp.json()
  return body.id as string
}

/** Create an invite-only event and return its manage URL/id (admin user). */
async function createInviteOnlyEvent(
  browser: Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string; manageUrl: string }> {
  const title = `Groups ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')
  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()
  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Private Venue')
  const dates = futureDates(5)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)
  await page.getByTestId('event-joinmode-select').selectOption('1')
  const resp = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const r = await resp
  const body = await r.json()
  await context.close()
  return {
    eventUrl: `${baseURL}/events/${body.id}`,
    eventId: body.id,
    manageUrl: `${baseURL}/events/${body.id}/manage`,
  }
}

/** As `user`, join a public or invited event. */
async function joinEventAs(browser: Browser, user: keyof typeof STORAGE_STATE, eventUrl: string) {
  const { context, page } = await contextAs(browser, user)
  await page.goto(eventUrl)
  await page.getByTestId('event-join-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-join-btn').click()
  await page.getByTestId('event-joined-badge').waitFor({ state: 'visible', timeout: 10000 })
  await context.close()
}

/** Invite a user (by test-user storage key) to an invite-only event. */
async function inviteUser(page: Page, manageUrl: string, searchText: string, resultText: string) {
  await page.goto(manageUrl)
  await page.getByTestId('manage-tab-attendees').click()
  const combobox = page.getByTestId('user-search-combobox').first()
  await combobox.getByTestId('user-search-input').fill(searchText)
  await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
  await combobox.getByTestId('user-search-result').filter({ hasText: resultText }).click()
  const resp = page.waitForResponse(
    (r) => r.url().includes('/invitations') && r.request().method() === 'POST',
  )
  await page.getByTestId('manage-invite-send-btn').click()
  await resp
}

test.describe('Contact Groups', () => {
  test.describe('groups hub', () => {
    test('admin can create a new empty group from the hub', async ({ browser, baseURL, createdGroups }) => {
      const name = `Crew ${uid()}`
      const { context, page } = await contextAs(browser, 'admin')
      await goToGroupsHub(page, baseURL!)

      const id = await createGroupInHub(page, name)
      createdGroups.push(id)

      // The sidebar shows the new group and the main pane opens it as selected
      await expect(page.getByTestId('groups-sidebar-item').filter({ hasText: name })).toBeVisible()
      await expect(page.getByTestId('groups-title')).toHaveText(name)
      await expect(page.getByTestId('groups-members-empty')).toBeVisible()

      await context.close()
    })

    test('admin can rename a group inline via click-to-edit title', async ({ browser, baseURL, createdGroups }) => {
      const oldName = `Old ${uid()}`
      const newName = `New ${uid()}`
      const { context, page } = await contextAs(browser, 'admin')
      await goToGroupsHub(page, baseURL!)

      const id = await createGroupInHub(page, oldName)
      createdGroups.push(id)

      await page.getByTestId('groups-title').click()
      const input = page.getByTestId('groups-title-input')
      await input.waitFor({ state: 'visible' })
      await input.fill(newName)

      const resp = page.waitForResponse(
        (r) => r.url().includes(`/api/groups/${id}`) && r.request().method() === 'PUT',
      )
      await input.press('Enter')
      await resp

      await expect(page.getByTestId('groups-title')).toHaveText(newName)
      await expect(page.getByTestId('groups-sidebar-item').filter({ hasText: newName })).toBeVisible()

      await context.close()
    })

    test('admin can add a person to a group via the search combobox', async ({ browser, baseURL, createdGroups }) => {
      const name = `Friends ${uid()}`
      const { context, page } = await contextAs(browser, 'admin')
      await goToGroupsHub(page, baseURL!)

      const id = await createGroupInHub(page, name)
      createdGroups.push(id)

      // Use the search combobox inside the selected group pane
      const combobox = page.getByTestId('user-search-combobox').first()
      await combobox.getByTestId('user-search-input').fill('alice')
      await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
      const resp = page.waitForResponse(
        (r) => r.url().includes(`/api/groups/${id}/members`) && r.request().method() === 'POST',
      )
      await combobox.getByTestId('user-search-result').filter({ hasText: 'alice@thuddle.dev' }).click()
      await resp

      await expect(page.getByTestId('groups-members-list').getByTestId('groups-member-row')).toHaveCount(1)
      await expect(page.getByTestId('groups-members-list')).toContainText('alice@thuddle.dev')

      await context.close()
    })

    test('admin can remove a member from a group', async ({ browser, baseURL, createdGroups }) => {
      const name = `Team ${uid()}`
      const { context, page } = await contextAs(browser, 'admin')
      await goToGroupsHub(page, baseURL!)

      const id = await createGroupInHub(page, name)
      createdGroups.push(id)

      // Add alice
      const combobox = page.getByTestId('user-search-combobox').first()
      await combobox.getByTestId('user-search-input').fill('alice')
      await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
      await combobox.getByTestId('user-search-result').filter({ hasText: 'alice@thuddle.dev' }).click()
      await expect(page.getByTestId('groups-member-row')).toHaveCount(1)

      // Remove her
      const resp = page.waitForResponse(
        (r) => r.url().includes(`/api/groups/${id}/members`) && r.request().method() === 'DELETE',
      )
      await page.getByTestId('groups-member-remove-btn').click()
      await resp

      await expect(page.getByTestId('groups-members-empty')).toBeVisible()

      await context.close()
    })

    test('admin can delete a group via confirm dialog', async ({ browser, baseURL, createdGroups }) => {
      const name = `Temp ${uid()}`
      const { context, page } = await contextAs(browser, 'admin')
      await goToGroupsHub(page, baseURL!)

      const id = await createGroupInHub(page, name)
      // Note: we DON'T push this one into createdGroups — the test deletes it.
      // If the test fails mid-way, add a best-effort cleanup: the teardown only runs for pushed ids.
      createdGroups.push(id)

      await page.getByTestId('groups-delete-btn').click()
      const resp = page.waitForResponse(
        (r) => r.url().includes(`/api/groups/${id}`) && r.request().method() === 'DELETE',
      )
      await page.getByTestId('confirm-dialog-confirm').click()
      await resp

      await expect(page.getByTestId('groups-sidebar-item').filter({ hasText: name })).toHaveCount(0)

      await context.close()
    })
  })

  test.describe('negative', () => {
    test('cannot create a group with a duplicate name', async ({ browser, baseURL, createdGroups }) => {
      const name = `Dup ${uid()}`
      const { context, page } = await contextAs(browser, 'admin')
      await goToGroupsHub(page, baseURL!)

      const id = await createGroupInHub(page, name)
      createdGroups.push(id)

      await page.getByTestId('groups-new-name-input').fill(name)
      const resp = page.waitForResponse(
        (r) => r.url().endsWith('/api/groups') && r.request().method() === 'POST',
      )
      await page.getByTestId('groups-create-btn').click()
      const r = await resp
      expect(r.status()).toBe(409)

      // Error message surfaces in the UI
      await expect(page.getByTestId('groups-error')).toBeVisible()

      await context.close()
    })

    test('cannot create a group with an empty name', async ({ browser, baseURL }) => {
      const { context, page } = await contextAs(browser, 'admin')
      await goToGroupsHub(page, baseURL!)

      // Button is disabled when the input is empty
      await expect(page.getByTestId('groups-create-btn')).toBeDisabled()

      await context.close()
    })
  })

  test.describe('attendee integration', () => {
    test('admin can add a single attendee to a new group from the attendee row', async ({ browser, baseURL, createdEvents, createdGroups }) => {
      const groupName = `EventCrew ${uid()}`
      const { manageUrl, eventId, eventUrl } = await createInviteOnlyEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Invite + join alice
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await inviteUser(adminPage, manageUrl, 'alice', 'alice@thuddle.dev')
      await adminCtx.close()
      await joinEventAs(browser, 'alice', eventUrl)

      // Admin opens the attendees tab and adds alice to a new group
      const { context, page } = await contextAs(browser, 'admin')
      await page.goto(manageUrl)
      await page.getByTestId('manage-tab-attendees').click()

      const row = page.getByTestId('manage-attendee-row').first()
      await row.hover()
      await row.getByTestId('manage-attendee-add-to-group-btn').click()

      const popover = page.getByTestId('group-selector-popover')
      await popover.waitFor({ state: 'visible' })
      await popover.getByTestId('group-selector-input').fill(groupName)

      const createResp = page.waitForResponse(
        (r) => r.url().endsWith('/api/groups') && r.request().method() === 'POST',
      )
      await popover.getByTestId('group-selector-create-option').click()
      const resp = await createResp
      const body = await resp.json()
      createdGroups.push(body.id)

      await expect(page.getByTestId('manage-group-toast')).toContainText(groupName)

      await context.close()
    })

    test('admin can save the whole attendee list as a group (with dedup)', async ({ browser, baseURL, createdEvents, createdGroups }) => {
      const groupName = `Wholelist ${uid()}`
      const { manageUrl, eventId, eventUrl } = await createInviteOnlyEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Invite + join alice & bob
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await inviteUser(adminPage, manageUrl, 'alice', 'alice@thuddle.dev')
      await inviteUser(adminPage, manageUrl, 'bob', 'bob@thuddle.dev')
      await adminCtx.close()
      await joinEventAs(browser, 'alice', eventUrl)
      await joinEventAs(browser, 'bob', eventUrl)

      // Admin saves list as a new group
      const { context, page } = await contextAs(browser, 'admin')
      await page.goto(manageUrl)
      await page.getByTestId('manage-tab-attendees').click()
      await page.getByTestId('manage-save-attendees-as-group-btn').click()

      const popover = page.getByTestId('group-selector-popover')
      await popover.waitFor({ state: 'visible' })
      await popover.getByTestId('group-selector-input').fill(groupName)

      const createResp = page.waitForResponse(
        (r) => r.url().endsWith('/api/groups') && r.request().method() === 'POST',
      )
      await popover.getByTestId('group-selector-create-option').click()
      const resp = await createResp
      const body = await resp.json()
      createdGroups.push(body.id)

      // Toast confirms both members added
      await expect(page.getByTestId('manage-group-toast')).toContainText('2')

      // Adding the same list again into the same existing group dedupes (0 added)
      await page.getByTestId('manage-save-attendees-as-group-btn').click()
      const popover2 = page.getByTestId('group-selector-popover')
      await popover2.waitFor({ state: 'visible' })
      await popover2.getByTestId('group-selector-input').fill(groupName)
      const addResp = page.waitForResponse(
        (r) => r.url().includes(`/api/groups/${body.id}/members`) && r.request().method() === 'POST',
      )
      await popover2.getByTestId('group-selector-option').filter({ hasText: groupName }).click()
      const addR = await addResp
      const addBody = await addR.json()
      expect(addBody.added).toBe(0)
      expect(addBody.skipped).toBe(2)

      await context.close()
    })
  })

  test.describe('invite flow', () => {
    test('typing a group name in the invite combobox explodes into member chips', async ({ browser, baseURL, createdEvents, createdGroups }) => {
      const groupName = `Invitees ${uid()}`
      const { context, page } = await contextAs(browser, 'admin')

      // Seed: create a group that contains alice + bob
      await goToGroupsHub(page, baseURL!)
      const id = await createGroupInHub(page, groupName)
      createdGroups.push(id)

      // Add alice
      const combobox = page.getByTestId('user-search-combobox').first()
      await combobox.getByTestId('user-search-input').fill('alice')
      await combobox.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
      await combobox.getByTestId('user-search-result').filter({ hasText: 'alice@thuddle.dev' }).click()

      // Add bob
      const combobox2 = page.getByTestId('user-search-combobox').first()
      await combobox2.getByTestId('user-search-input').fill('bob')
      await combobox2.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
      await combobox2.getByTestId('user-search-result').filter({ hasText: 'bob@thuddle.dev' }).click()
      await expect(page.getByTestId('groups-member-row')).toHaveCount(2)

      await context.close()

      // Now: on an event, typing the group name shows a group result, clicking explodes to chips
      const { manageUrl, eventId } = await createInviteOnlyEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context: ctx2, page: page2 } = await contextAs(browser, 'admin')
      await page2.goto(manageUrl)
      await page2.getByTestId('manage-tab-attendees').click()

      const invCombo = page2.getByTestId('user-search-combobox').first()
      await invCombo.getByTestId('user-search-input').fill(groupName.slice(0, 5))
      await invCombo.getByTestId('user-search-results').waitFor({ state: 'visible', timeout: 10000 })
      await invCombo.getByTestId('user-search-group-result').filter({ hasText: groupName }).click()

      // Two individual chips should appear, both annotated with the group name
      await expect(page2.getByTestId('manage-invite-chip')).toHaveCount(2)
      const chips = page2.getByTestId('manage-invite-chip')
      await expect(chips.first()).toHaveAttribute('data-from-group', groupName)

      // Host can remove one chip (the "-minus one" behavior)
      await chips.first().getByTestId('manage-invite-chip-remove').click()
      await expect(page2.getByTestId('manage-invite-chip')).toHaveCount(1)

      // Send invites for the remaining chip
      const inviteResp = page2.waitForResponse(
        (r) => r.url().includes('/invitations') && r.request().method() === 'POST',
      )
      await page2.getByTestId('manage-invite-send-btn').click()
      const ir = await inviteResp
      const body = await ir.json()
      expect(body.invited).toBe(1)

      await ctx2.close()
    })
  })
})
