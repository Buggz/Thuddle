import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, contextAs, uid } from '../helpers/auth'
import {
  adminApi,
  userApi,
  createEventApi,
  configureAuctionApi,
  startAuctionApi,
  createItemApi,
  approveItemApi,
  setSubmittersApi,
  getUserIdApi,
  uploadItemImageApi,
} from '../helpers/auction'
import path from 'path'

const TEST_IMAGE = path.join(__dirname, '../helpers/test-avatar.png')

test.describe('Submit auction item', () => {
  // ── AllAttendees: attendee can submit ────────────────────────────────────

  test('AllAttendees: attendee submits item via UI and it appears on auction page', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    const now = new Date()
    await configureAuctionApi(api, eventId, {
      submissionMode: 2, // AllAttendees
      itemModerationPolicy: 1, // AutoApprove
      startsAt: new Date(now.getTime() - 1000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
    })
    await startAuctionApi(api, eventId)
    await api.close()

    // Alice submits an item via the UI
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    const itemName = `Widget ${uid()}`

    await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/new`)
    await alicePage.getByTestId('submit-item-form').waitFor({ state: 'visible', timeout: 20000 })

    await alicePage.getByTestId('submit-item-name').fill(itemName)
    await alicePage.getByTestId('submit-item-description').fill('A wonderful widget')
    await alicePage.getByTestId('submit-item-starting-bid').fill('25')

    const createResp = alicePage.waitForResponse(
      (r) => r.url().includes('/auction/items') && r.request().method() === 'POST' && !r.url().includes('/images'),
    )
    await alicePage.getByTestId('submit-item-save-btn').click()
    const resp = await createResp
    expect(resp.status()).toBe(201)

    // Navigate to auction browse page and verify item appears
    await alicePage.goto(`${baseURL}/events/${eventId}/auction`)
    await expect(alicePage.getByText(itemName)).toBeVisible({ timeout: 10000 })

    await aliceCtx.close()
  })

  // ── AdminsOnly: attendee blocked ─────────────────────────────────────────

  test('AdminsOnly: attendee sees no submit CTA and direct navigation is denied', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    const now = new Date()
    await configureAuctionApi(api, eventId, {
      submissionMode: 0, // AdminsOnly
      startsAt: new Date(now.getTime() - 1000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
    })
    await startAuctionApi(api, eventId)
    await api.close()

    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')

    // Browse auction — no submit CTA
    await alicePage.goto(`${baseURL}/events/${eventId}/auction`)
    await alicePage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
    await expect(alicePage.getByTestId('submit-item-form')).not.toBeVisible({ timeout: 3000 })

    // Direct navigation to submit form
    await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/new`)
    await alicePage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

    // Either a friendly denial message or the form is hidden
    const formVisible = await alicePage.getByTestId('submit-item-form').isVisible().catch(() => false)
    if (formVisible) {
      // If form renders, saving should fail
      await alicePage.getByTestId('submit-item-name').fill('Blocked Item')
      await alicePage.getByTestId('submit-item-starting-bid').fill('10')
      await alicePage.getByTestId('submit-item-save-btn').click()
      // Expect the API to reject
      await expect(alicePage.locator('text=/denied|forbidden|not allowed/i')).toBeVisible({ timeout: 5000 })
    }

    // Also verify via direct API
    const aliceApiCtx = await userApi(browser, 'alice', baseURL!)
    const resp = await aliceApiCtx.request.post(
      `${aliceApiCtx.baseURL}/api/events/${eventId}/auction/items`,
      {
        headers: aliceApiCtx.headers,
        data: JSON.stringify({ name: 'Sneaky', description: null, startingBid: 5, buyoutPrice: null }),
      },
    )
    expect(resp.status()).toBe(403)
    await aliceApiCtx.close()
    await aliceCtx.close()
  })

  // ── SelectedAttendees: only allow-listed users ───────────────────────────

  test('SelectedAttendees: only allow-listed users can submit', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    // Get Alice's user ID
    const aliceApiCtx = await userApi(browser, 'alice', baseURL!)
    const aliceUserId = await getUserIdApi(aliceApiCtx)

    const now = new Date()
    await configureAuctionApi(api, eventId, {
      submissionMode: 1, // SelectedAttendees
      startsAt: new Date(now.getTime() - 1000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
    })
    // Add Alice to submitters list
    await setSubmittersApi(api, eventId, [aliceUserId])
    await startAuctionApi(api, eventId)

    // Alice can submit
    const aliceItem = await createItemApi(aliceApiCtx, eventId, { name: `Alice Item ${uid()}` })
    expect(aliceItem.id).toBeTruthy()

    // Bob cannot submit
    const bobApiCtx = await userApi(browser, 'bob', baseURL!)
    const resp = await bobApiCtx.request.post(
      `${bobApiCtx.baseURL}/api/events/${eventId}/auction/items`,
      {
        headers: bobApiCtx.headers,
        data: JSON.stringify({ name: 'Bob Item', description: null, startingBid: 5, buyoutPrice: null }),
      },
    )
    expect(resp.status()).toBe(403)

    await aliceApiCtx.close()
    await bobApiCtx.close()
    await api.close()
  })

  // ── RequireApproval moderation ───────────────────────────────────────────

  test('RequireApproval: submitted item is PendingApproval and hidden from non-admins', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    const now = new Date()
    await configureAuctionApi(api, eventId, {
      submissionMode: 2, // AllAttendees
      itemModerationPolicy: 0, // RequireApproval
      startsAt: new Date(now.getTime() - 1000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
    })
    await startAuctionApi(api, eventId)

    // Alice submits an item
    const aliceApiCtx = await userApi(browser, 'alice', baseURL!)
    const itemName = `Pending ${uid()}`
    const item = await createItemApi(aliceApiCtx, eventId, { name: itemName })
    expect(item.status).toBe('PendingApproval')

    // Bob cannot see the pending item
    const bobApiCtx = await userApi(browser, 'bob', baseURL!)
    const bobItems = await bobApiCtx.request.get(
      `${bobApiCtx.baseURL}/api/events/${eventId}/auction/items`,
      { headers: bobApiCtx.headers },
    )
    const bobBody = await bobItems.json()
    const bobSees = (bobBody.items || []).find((i: { name: string }) => i.name === itemName)
    expect(bobSees).toBeUndefined()

    // Admin approves the item
    await approveItemApi(api, eventId, item.id)

    // Now Bob can see it
    const bobItems2 = await bobApiCtx.request.get(
      `${bobApiCtx.baseURL}/api/events/${eventId}/auction/items`,
      { headers: bobApiCtx.headers },
    )
    const bobBody2 = await bobItems2.json()
    const bobSees2 = (bobBody2.items || []).find((i: { name: string }) => i.name === itemName)
    expect(bobSees2).toBeDefined()

    await aliceApiCtx.close()
    await bobApiCtx.close()
    await api.close()
  })

  // ── Multi-image upload ───────────────────────────────────────────────────

  test('multi-image upload: 3 images show in carousel with navigation', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)

    const now = new Date()
    await configureAuctionApi(api, eventId, {
      startsAt: new Date(now.getTime() - 1000).toISOString(),
      latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
    })
    await startAuctionApi(api, eventId)

    // Create item and upload 3 images via API
    const item = await createItemApi(api, eventId, { name: `Gallery ${uid()}` })
    await uploadItemImageApi(api, eventId, item.id, TEST_IMAGE)
    await uploadItemImageApi(api, eventId, item.id, TEST_IMAGE)
    await uploadItemImageApi(api, eventId, item.id, TEST_IMAGE)
    await api.close()

    // View item as Alice
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/${item.id}`)
    await alicePage.getByTestId('auction-image-carousel').waitFor({ state: 'visible', timeout: 15000 })

    // Verify 3 thumbnails
    await expect(alicePage.getByTestId('auction-image-thumbnail-0')).toBeVisible()
    await expect(alicePage.getByTestId('auction-image-thumbnail-1')).toBeVisible()
    await expect(alicePage.getByTestId('auction-image-thumbnail-2')).toBeVisible()

    // Navigate forward and back
    await alicePage.getByTestId('auction-image-next').click()
    await alicePage.getByTestId('auction-image-next').click()
    await alicePage.getByTestId('auction-image-prev').click()

    await aliceCtx.close()
  })
})
