import { test, expect } from '@playwright/test'
import { uid, futureDates, contextAs } from '../helpers/auth'

/** Helper: admin creates a public event, posts in its discussion, returns eventUrl. */
async function createEventWithPost(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string; title: string }> {
  const title = `ReadReceipt ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  // Create event
  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Receipt Venue')

  const dates = futureDates(8)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const createResp = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await createResp
  const body = await resp.json()
  const eventUrl = `${baseURL}/events/${body.id}`

  // Navigate to event discussion and create a post
  await page.goto(eventUrl)
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-tab-discussion').click()

  await page.getByTestId('discussion-new-post-btn').click()
  await page.locator('.ProseMirror').click()
  await page.locator('.ProseMirror').fill(`First post ${uid()}`)

  const postResp = page.waitForResponse(
    (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
  )
  await page.getByTestId('discussion-submit-post-btn').click()
  await postResp
  await expect(page.getByTestId('discussion-post')).toBeVisible()

  await context.close()
  return { eventUrl, eventId: body.id, title }
}

test.describe('Discussion read receipts', () => {
  test('unread indicator shows on discussion tab for user who has not read', async ({ browser, baseURL }) => {
    const { eventUrl } = await createEventWithPost(browser, baseURL!)

    // Alice joins then navigates to the event detail
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Reload to get fresh hasUnreadDiscussion from API
    await alicePage.reload()
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    // Discussion tab should show unread indicator (dot next to "Discussion")
    await expect(alicePage.getByTestId('discussion-unread-indicator')).toBeVisible()

    await aliceCtx.close()
  })

  test('opening discussion tab clears the unread indicator', async ({ browser, baseURL }) => {
    const { eventUrl } = await createEventWithPost(browser, baseURL!)

    // Alice joins
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Reload and verify unread indicator is present
    await alicePage.reload()
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await expect(alicePage.getByTestId('discussion-unread-indicator')).toBeVisible()

    // Click the discussion tab — this creates the read receipt via GET /discussion
    const discussionResp = alicePage.waitForResponse(
      (r) => r.url().includes('/discussion') && r.request().method() === 'GET',
    )
    await alicePage.getByTestId('event-tab-discussion').click()
    await discussionResp

    // Unread indicator should be gone (hides when activeTab === 'discussion')
    await expect(alicePage.getByTestId('discussion-unread-indicator')).toBeHidden()

    // Reload the event page — indicator should stay gone since we have a read receipt now
    await alicePage.reload()
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await expect(alicePage.getByTestId('discussion-unread-indicator')).toBeHidden()

    await aliceCtx.close()
  })

  test('new post after read creates a new unread indicator', async ({ browser, baseURL }) => {
    const { eventUrl } = await createEventWithPost(browser, baseURL!)

    // Alice joins and reads the discussion
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Open discussion tab to create read receipt
    await alicePage.reload()
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    const readResp = alicePage.waitForResponse(
      (r) => r.url().includes('/discussion') && r.request().method() === 'GET',
    )
    await alicePage.getByTestId('event-tab-discussion').click()
    await readResp
    await aliceCtx.close()

    // Admin creates another post
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await adminPage.goto(eventUrl)
    await adminPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await adminPage.getByTestId('event-tab-discussion').click()

    await adminPage.getByTestId('discussion-new-post-btn').click()
    await adminPage.locator('.ProseMirror').click()
    await adminPage.locator('.ProseMirror').fill(`Second post ${uid()}`)

    const postResp = adminPage.waitForResponse(
      (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
    )
    await adminPage.getByTestId('discussion-submit-post-btn').click()
    await postResp
    await adminCtx.close()

    // Alice revisits the event — should see unread indicator again
    const { context: alice2Ctx, page: alice2Page } = await contextAs(browser, 'alice')
    await alice2Page.goto(eventUrl)
    await alice2Page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await expect(alice2Page.getByTestId('discussion-unread-indicator')).toBeVisible()

    await alice2Ctx.close()
  })
})
