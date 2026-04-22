import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, contextAs } from '../helpers/auth'
import {
  adminApi,
  userApi,
  createEventApi,
  configureAuctionApi,
  startAuctionApi,
  joinEventApi,
  createItemApi,
  publishItemApi,
  placeBidApi,
} from '../helpers/auction'

test.describe('Auction moderation: reject', () => {
  test.describe('admin panel rejection', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('admin rejects with reason and allows resubmit', async ({ page, browser, baseURL, createdEvents }) => {
      // ── Setup ──
      const adminCtx = await adminApi(browser, baseURL!)
      const now = new Date()
      const eventStart = new Date(now.getTime() - 60_000).toISOString()
      const eventEnd = new Date(now.getTime() + 8 * 60 * 60_000).toISOString()
      const { id: eventId } = await createEventApi(adminCtx, { start: eventStart, end: eventEnd })
      createdEvents.push(eventId)

      await configureAuctionApi(adminCtx, eventId, {
        itemModerationPolicy: 0, // RequireApproval
        submissionMode: 2, // AllAttendees
        startsAt: new Date(now.getTime() + 3_600_000).toISOString(),
        latestEndsAt: new Date(now.getTime() + 7_200_000).toISOString(),
        minBidIncrement: 1,
      })
      await startAuctionApi(adminCtx, eventId)

      // Alice creates and publishes item
      const aliceCtx = await userApi(browser, 'alice', baseURL!)
      await joinEventApi(aliceCtx, eventId)
      const item = await createItemApi(aliceCtx, eventId, { name: 'Scythe', startingBid: 20 })
      await publishItemApi(aliceCtx, eventId, item.id)

      // ── Admin opens moderation queue ──
      await page.goto(`${baseURL}/events/${eventId}/auction/moderation`)
      await expect(page.getByTestId(`moderation-item-${item.id}`)).toBeVisible({ timeout: 10000 })

      // ── Admin clicks reject button ──
      await page.getByTestId(`moderation-item-${item.id}`).getByTestId('moderation-reject-btn').click()

      // ── Reject dialog is visible ──
      await expect(page.getByTestId('reject-dialog')).toBeVisible({ timeout: 5000 })

      // ── Admin fills reason, ensures allow-resubmit is checked, confirms ──
      await page.getByTestId('reject-reason-input').fill('Please add more detail')
      await expect(page.getByTestId('reject-allow-resubmit')).toBeChecked() // Should be checked by default
      
      const rejectResp = page.waitForResponse(
        (r) => r.url().includes(`/auction/items/${item.id}/reject`) && r.request().method() === 'POST',
      )
      await page.getByTestId('reject-confirm-btn').click()
      await rejectResp

      // ── Item disappears from moderation queue ──
      await expect(page.getByTestId(`moderation-item-${item.id}`)).not.toBeVisible({ timeout: 5000 })

      // ── Alice navigates to her item's detail page ──
      const alicePage = aliceCtx.page
      await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/${item.id}`)

      // ── Rejection reason is visible ──
      await expect(alicePage.getByTestId('rejection-reason')).toBeVisible({ timeout: 5000 })
      await expect(alicePage.getByTestId('rejection-reason')).toContainText('Please add more detail')

      // ── Resubmit button is visible ──
      await expect(alicePage.getByTestId('resubmit-button')).toBeVisible()

      // ── Alice clicks resubmit ──
      const resubmitResp = alicePage.waitForResponse(
        (r) => r.url().includes(`/auction/items/${item.id}/resubmit`) && r.request().method() === 'POST',
      )
      await alicePage.getByTestId('resubmit-button').click()
      await resubmitResp

      // Alice lands on the edit form (SubmitAuctionItemView) where she can save a fresh draft.
      await expect(alicePage.getByTestId('save-draft-button')).toBeVisible({ timeout: 10000 })

      await adminCtx.close()
      await aliceCtx.close()
    })

    test('admin rejects without allowing resubmit', async ({ page, browser, baseURL, createdEvents }) => {
      // ── Setup ──
      const adminCtx = await adminApi(browser, baseURL!)
      const now = new Date()
      const eventStart = new Date(now.getTime() - 60_000).toISOString()
      const eventEnd = new Date(now.getTime() + 8 * 60 * 60_000).toISOString()
      const { id: eventId } = await createEventApi(adminCtx, { start: eventStart, end: eventEnd })
      createdEvents.push(eventId)

      await configureAuctionApi(adminCtx, eventId, {
        itemModerationPolicy: 0, // RequireApproval
        submissionMode: 2, // AllAttendees
        startsAt: new Date(now.getTime() + 3_600_000).toISOString(),
        latestEndsAt: new Date(now.getTime() + 7_200_000).toISOString(),
        minBidIncrement: 1,
      })
      await startAuctionApi(adminCtx, eventId)

      // Alice creates and publishes item
      const aliceCtx = await userApi(browser, 'alice', baseURL!)
      await joinEventApi(aliceCtx, eventId)
      const item = await createItemApi(aliceCtx, eventId, { name: 'Terraforming Mars', startingBid: 25 })
      await publishItemApi(aliceCtx, eventId, item.id)

      // ── Admin opens moderation queue and rejects ──
      await page.goto(`${baseURL}/events/${eventId}/auction/moderation`)
      await expect(page.getByTestId(`moderation-item-${item.id}`)).toBeVisible({ timeout: 10000 })
      await page.getByTestId(`moderation-item-${item.id}`).getByTestId('moderation-reject-btn').click()

      await expect(page.getByTestId('reject-dialog')).toBeVisible({ timeout: 5000 })

      // ── Admin unchecks allow-resubmit ──
      await page.getByTestId('reject-reason-input').fill('Off-topic')
      await page.getByTestId('reject-allow-resubmit').uncheck()

      const rejectResp = page.waitForResponse(
        (r) => r.url().includes(`/auction/items/${item.id}/reject`) && r.request().method() === 'POST',
      )
      await page.getByTestId('reject-confirm-btn').click()
      await rejectResp

      // ── Alice navigates to her item ──
      const alicePage = aliceCtx.page
      await alicePage.goto(`${baseURL}/events/${eventId}/auction/items/${item.id}`)

      // ── Rejection reason is visible ──
      await expect(alicePage.getByTestId('rejection-reason')).toBeVisible({ timeout: 5000 })

      // ── Resubmit button is NOT present ──
      await expect(alicePage.getByTestId('resubmit-button')).toHaveCount(0)

      await adminCtx.close()
      await aliceCtx.close()
    })
  })

  test.describe('item detail view rejection', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('admin can reject directly from item detail view', async ({ page, browser, baseURL, createdEvents }) => {
      // ── Setup with auto-approve so item goes Live ──
      const adminCtx = await adminApi(browser, baseURL!)
      const now = new Date()
      const eventStart = new Date(now.getTime() - 60_000).toISOString()
      const eventEnd = new Date(now.getTime() + 8 * 60 * 60_000).toISOString()
      const { id: eventId } = await createEventApi(adminCtx, { start: eventStart, end: eventEnd })
      createdEvents.push(eventId)

      await configureAuctionApi(adminCtx, eventId, {
        itemModerationPolicy: 1, // AutoApprove
        submissionMode: 2, // AllAttendees
        startsAt: new Date(now.getTime() + 3_600_000).toISOString(),
        latestEndsAt: new Date(now.getTime() + 7_200_000).toISOString(),
        minBidIncrement: 1,
      })
      await startAuctionApi(adminCtx, eventId)

      // Alice creates, publishes item — it goes live
      const aliceCtx = await userApi(browser, 'alice', baseURL!)
      await joinEventApi(aliceCtx, eventId)
      const item = await createItemApi(aliceCtx, eventId, { name: 'Root', startingBid: 30 })
      await publishItemApi(aliceCtx, eventId, item.id)

      // Bob places a bid
      const bobCtx = await userApi(browser, 'bob', baseURL!)
      await joinEventApi(bobCtx, eventId)
      await placeBidApi(bobCtx, eventId, item.id, 35)

      // ── Admin navigates to the item detail page ──
      await page.goto(`${baseURL}/events/${eventId}/auction/items/${item.id}`)

      // ── Admin clicks reject button ──
      await expect(page.getByTestId('item-reject-btn')).toBeVisible({ timeout: 10000 })
      await page.getByTestId('item-reject-btn').click()

      // ── Dialog opens ──
      await expect(page.getByTestId('reject-dialog')).toBeVisible({ timeout: 5000 })

      // ── Admin types reason and confirms ──
      await page.getByTestId('reject-reason-input').fill('Withdrawn by host')
      
      const rejectResp = page.waitForResponse(
        (r) => r.url().includes(`/auction/items/${item.id}/reject`) && r.request().method() === 'POST',
      )
      await page.getByTestId('reject-confirm-btn').click()
      await rejectResp

      // ── Verify item no longer appears on public auction page ──
      const bobPage = bobCtx.page
      await bobPage.goto(`${baseURL}/events/${eventId}/auction`)
      await expect(bobPage.getByText('Root')).not.toBeVisible({ timeout: 5000 })

      await adminCtx.close()
      await aliceCtx.close()
      await bobCtx.close()
    })
  })
})
