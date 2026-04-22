import { test, expect } from '../helpers/fixtures'
import { uid, futureDates, contextAs } from '../helpers/auth'
import { adminApi, createEventApi } from '../helpers/auction'

/**
 * Helper: admin creates an open event via API and returns URLs + id.
 */
async function createOpenEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventId: string; eventUrl: string; manageUrl: string }> {
  const api = await adminApi(browser, baseURL)
  const { id } = await createEventApi(api, { title: `Kick ${uid()}` })
  await api.close()
  return {
    eventId: id,
    eventUrl: `${baseURL}/events/${id}`,
    manageUrl: `${baseURL}/events/${id}/manage`,
  }
}

/**
 * Helper: admin creates an invite-only event via UI and returns URLs + id.
 */
async function createInviteOnlyEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventId: string; eventUrl: string; manageUrl: string }> {
  const { context, page } = await contextAs(browser, 'admin')
  const title = `Kick ${uid()}`

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Private Venue')

  const dates = futureDates(5)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)
  await page.getByTestId('event-joinmode-select').selectOption('1') // InviteOnly

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await responsePromise
  const body = await resp.json()

  await context.close()
  return {
    eventId: body.id,
    eventUrl: `${baseURL}/events/${body.id}`,
    manageUrl: `${baseURL}/events/${body.id}/manage`,
  }
}

/**
 * Helper: admin invites a user via API.
 */
async function inviteUserApi(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  eventId: string,
  email: string,
): Promise<void> {
  const api = await adminApi(browser, baseURL)
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/invitations`, {
    headers: api.headers,
    data: JSON.stringify({ emails: [email] }),
  })
  if (!resp.ok()) throw new Error(`Invite failed: ${resp.status()} ${await resp.text()}`)
  await api.close()
}

/**
 * Helper: user joins an event and returns their userId from the API response.
 */
async function joinEvent(
  browser: import('@playwright/test').Browser,
  user: 'alice' | 'bob' | 'charlie',
  eventUrl: string,
): Promise<string> {
  const { context, page } = await contextAs(browser, user)
  await page.goto(eventUrl)
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

  const joinResp = page.waitForResponse(
    (r) => r.url().includes('/join') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-join-btn').click()
  const resp = await joinResp
  const body = await resp.json()
  await expect(page.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

  await context.close()
  return body.userId
}

/** Navigate to manage page attendees tab. */
async function goToAttendeesTab(page: import('@playwright/test').Page, manageUrl: string) {
  await page.goto(manageUrl)
  await page.getByTestId('manage-tab-attendees').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('manage-tab-attendees').click()
}

/**
 * Helper: admin promotes a user to co-admin via API.
 */
async function promoteToCoAdminApi(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  eventId: string,
  email: string,
): Promise<void> {
  const api = await adminApi(browser, baseURL)
  const resp = await api.request.post(`${api.baseURL}/api/events/${eventId}/co-admins`, {
    headers: api.headers,
    data: JSON.stringify({ email }),
  })
  if (!resp.ok()) throw new Error(`Promote co-admin failed: ${resp.status()} ${await resp.text()}`)
  await api.close()
}

test.describe('Kick attendee', () => {
  test('open event: kick with deny-reentry checked (default) — alice cannot rejoin and sees blocked message', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const { eventId, eventUrl, manageUrl } = await createOpenEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Alice joins
    const aliceUserId = await joinEvent(browser, 'alice', eventUrl)

    // Admin navigates to manage → Attendees tab
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await goToAttendeesTab(adminPage, manageUrl)

    // Click kick button for alice
    await adminPage.getByTestId(`manage-kick-btn-${aliceUserId}`).click()

    // Kick dialog appears
    await expect(adminPage.getByTestId('kick-dialog')).toBeVisible({ timeout: 10000 })

    // Verify deny-reentry checkbox is visible and CHECKED by default
    const denyCheckbox = adminPage.getByTestId('kick-deny-reentry-checkbox')
    await expect(denyCheckbox).toBeVisible()
    await expect(denyCheckbox).toBeChecked()

    // Verify revoke-invitation checkbox does NOT exist
    await expect(adminPage.getByTestId('kick-revoke-invitation-checkbox')).toHaveCount(0)

    // Click confirm without unchecking (default behavior: deny reentry)
    await adminPage.getByTestId('kick-confirm-btn').click()

    // Alice should no longer be in the attendee list
    await expect(adminPage.getByTestId(`manage-kick-btn-${aliceUserId}`)).toHaveCount(0, {
      timeout: 10000,
    })

    await adminCtx.close()

    // Switch to alice's context — she should see blocked message and cannot rejoin
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await expect(alicePage.getByTestId('event-blocked-msg')).toBeVisible()
    await expect(alicePage.getByTestId('event-join-btn')).toHaveCount(0)
    await expect(alicePage.getByTestId('event-invite-only-msg')).toHaveCount(0)

    await aliceCtx.close()
  })

  test('open event: kick with deny-reentry UNCHECKED — alice can rejoin', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const { eventId, eventUrl, manageUrl } = await createOpenEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Alice joins
    const aliceUserId = await joinEvent(browser, 'alice', eventUrl)

    // Admin navigates to manage → Attendees tab
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await goToAttendeesTab(adminPage, manageUrl)

    // Click kick button for alice
    await adminPage.getByTestId(`manage-kick-btn-${aliceUserId}`).click()

    // Kick dialog appears
    await expect(adminPage.getByTestId('kick-dialog')).toBeVisible({ timeout: 10000 })

    // Uncheck deny-reentry checkbox
    const denyCheckbox = adminPage.getByTestId('kick-deny-reentry-checkbox')
    await expect(denyCheckbox).toBeChecked()
    await denyCheckbox.uncheck()

    // Click confirm
    await adminPage.getByTestId('kick-confirm-btn').click()

    // Alice should no longer be in the attendee list
    await expect(adminPage.getByTestId(`manage-kick-btn-${aliceUserId}`)).toHaveCount(0, {
      timeout: 10000,
    })

    await adminCtx.close()

    // Switch to alice's context — she should be able to rejoin
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await expect(alicePage.getByTestId('event-join-btn')).toBeVisible()
    await expect(alicePage.getByTestId('event-blocked-msg')).toHaveCount(0)

    // Optionally re-join to verify the round trip
    const rejoinResp = alicePage.waitForResponse(
      (r) => r.url().includes('/join') && r.request().method() === 'POST',
    )
    await alicePage.getByTestId('event-join-btn').click()
    await rejoinResp
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    await aliceCtx.close()
  })

  test('invite-only event: kick WITHOUT revoking invitation — attendee can rejoin', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const { eventId, eventUrl, manageUrl } = await createInviteOnlyEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Admin invites alice
    await inviteUserApi(browser, baseURL!, eventId, 'alice@thuddle.dev')

    // Alice joins
    const aliceUserId = await joinEvent(browser, 'alice', eventUrl)

    // Admin navigates to manage → Attendees tab
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await goToAttendeesTab(adminPage, manageUrl)

    // Click kick button for alice
    await adminPage.getByTestId(`manage-kick-btn-${aliceUserId}`).click()

    // Kick dialog appears
    await expect(adminPage.getByTestId('kick-dialog')).toBeVisible({ timeout: 10000 })

    // Verify the revoke-invitation checkbox is visible and unchecked
    const checkbox = adminPage.getByTestId('kick-revoke-invitation-checkbox')
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toBeChecked()

    // Verify deny-reentry checkbox does NOT exist
    await expect(adminPage.getByTestId('kick-deny-reentry-checkbox')).toHaveCount(0)

    // Click confirm without checking the box
    await adminPage.getByTestId('kick-confirm-btn').click()

    // Alice should no longer be in the attendee list
    await expect(adminPage.getByTestId(`manage-kick-btn-${aliceUserId}`)).toHaveCount(0, {
      timeout: 10000,
    })

    await adminCtx.close()

    // Switch to alice's context — she should still be able to rejoin (invitation preserved)
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await expect(alicePage.getByTestId('event-join-btn')).toBeVisible()
    await expect(alicePage.getByTestId('event-invite-only-msg')).toHaveCount(0)

    await aliceCtx.close()
  })

  test('invite-only event: kick WITH revoking invitation — attendee cannot rejoin', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const { eventId, eventUrl, manageUrl } = await createInviteOnlyEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Admin invites alice
    await inviteUserApi(browser, baseURL!, eventId, 'alice@thuddle.dev')

    // Alice joins
    const aliceUserId = await joinEvent(browser, 'alice', eventUrl)

    // Admin navigates to manage → Attendees tab
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await goToAttendeesTab(adminPage, manageUrl)

    // Click kick button for alice
    await adminPage.getByTestId(`manage-kick-btn-${aliceUserId}`).click()

    // Kick dialog appears
    await expect(adminPage.getByTestId('kick-dialog')).toBeVisible({ timeout: 10000 })

    // Check the revoke-invitation checkbox
    const checkbox = adminPage.getByTestId('kick-revoke-invitation-checkbox')
    await expect(checkbox).toBeVisible()
    await checkbox.check()

    // Click confirm
    await adminPage.getByTestId('kick-confirm-btn').click()

    // Alice should no longer be in the attendee list
    await expect(adminPage.getByTestId(`manage-kick-btn-${aliceUserId}`)).toHaveCount(0, {
      timeout: 10000,
    })

    await adminCtx.close()

    // Switch to alice's context — she should see the invite-only message (no rejoin)
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await expect(alicePage.getByTestId('event-invite-only-msg')).toBeVisible()
    await expect(alicePage.getByTestId('event-join-btn')).toHaveCount(0)

    await aliceCtx.close()
  })

  test('owner cannot be kicked (verified via API)', async ({ browser, baseURL, createdEvents }) => {
    const { eventId } = await createOpenEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Capture admin's userId from profile
    const api = await adminApi(browser, baseURL!)
    const profileResp = await api.request.get(`${api.baseURL}/api/profile`, {
      headers: api.headers,
    })
    expect(profileResp.status()).toBe(200)
    const profile = await profileResp.json()
    const ownerId = profile.id

    // Attempt to kick the owner via API
    const kickResp = await api.request.delete(
      `${api.baseURL}/api/events/${eventId}/attendees/${ownerId}`,
      { headers: api.headers },
    )
    expect(kickResp.status()).toBe(400) // Owner cannot be kicked

    await api.close()
  })

  test('co-host cannot be kicked (verified via API)', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const { eventId, eventUrl } = await createOpenEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Alice joins
    const aliceUserId = await joinEvent(browser, 'alice', eventUrl)

    // Admin promotes alice to co-admin
    await promoteToCoAdminApi(browser, baseURL!, eventId, 'alice@thuddle.dev')

    // Attempt to kick alice via API
    const api = await adminApi(browser, baseURL!)
    const kickResp = await api.request.delete(
      `${api.baseURL}/api/events/${eventId}/attendees/${aliceUserId}`,
      { headers: api.headers },
    )
    expect(kickResp.status()).toBe(400) // Co-host cannot be kicked

    await api.close()
  })

  test('open event: deny-reentry against invite-only event is rejected (API)', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const { eventId, eventUrl } = await createInviteOnlyEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Admin invites alice
    await inviteUserApi(browser, baseURL!, eventId, 'alice@thuddle.dev')

    // Alice joins
    const aliceUserId = await joinEvent(browser, 'alice', eventUrl)

    // Attempt to kick with denyReentry=true on an invite-only event
    const api = await adminApi(browser, baseURL!)
    const kickResp = await api.request.delete(
      `${api.baseURL}/api/events/${eventId}/attendees/${aliceUserId}?denyReentry=true`,
      { headers: api.headers },
    )
    expect(kickResp.status()).toBe(400) // denyReentry not allowed on invite-only events

    await api.close()
  })
})
