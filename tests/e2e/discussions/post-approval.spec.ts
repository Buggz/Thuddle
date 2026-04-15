import { test, expect } from '../helpers/fixtures'
import { uid, futureDates, contextAs } from '../helpers/auth'

/** Admin creates event, sets member post policy to require approval. */
async function createModerationEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string; manageUrl: string }> {
  const title = `Approval ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Approval Venue')

  const dates = futureDates(7)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const createResp = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await createResp
  const body = await resp.json()

  const eventUrl = `${baseURL}/events/${body.id}`
  const manageUrl = `${eventUrl}/manage`

  // Set member post policy to require approval
  await page.goto(manageUrl)
  await page.getByTestId('manage-tab-discussion').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('manage-tab-discussion').click()
  await page.getByTestId('manage-member-post-policy').selectOption('0')

  const saveResp = page.waitForResponse(
    (r) => r.url().includes('/discussion-settings') && r.request().method() === 'PUT',
  )
  await page.getByTestId('manage-save-discussion-btn').click()
  await saveResp

  await context.close()
  return { eventUrl, eventId: body.id, manageUrl }
}

/** Helper: alice joins event and creates a post (which will be pending). Returns the post content. */
async function aliceJoinsAndPosts(
  browser: import('@playwright/test').Browser,
  eventUrl: string,
): Promise<{ postContent: string }> {
  const postContent = `Pending post ${uid()}`
  const { context, page } = await contextAs(browser, 'alice')

  await page.goto(eventUrl)
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-join-btn').click()
  await expect(page.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

  await page.getByTestId('event-tab-discussion').click()
  await page.getByTestId('discussion-new-post-btn').click()
  await page.locator('.ProseMirror').click()
  await page.locator('.ProseMirror').fill(postContent)

  const postResp = page.waitForResponse(
    (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
  )
  await page.getByTestId('discussion-submit-post-btn').click()
  await postResp

  await context.close()
  return { postContent }
}

test.describe('Post approval', () => {
  test('pending post shows pending badge for admin', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createModerationEvent(browser, baseURL!)
    createdEvents.push(eventId)
    await aliceJoinsAndPosts(browser, eventUrl)

    // Admin views the discussion
    const { context, page } = await contextAs(browser, 'admin')
    await page.goto(eventUrl)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('event-tab-discussion').click()

    // Pending badge should be visible
    await expect(page.getByTestId('discussion-pending-badge')).toBeVisible()
    // Approve button should say "Approve"
    await expect(page.getByTestId('discussion-approve-btn')).toHaveText('Approve')

    await context.close()
  })

  test('admin can unapprove a previously approved post', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createModerationEvent(browser, baseURL!)
    createdEvents.push(eventId)
    await aliceJoinsAndPosts(browser, eventUrl)

    const { context, page } = await contextAs(browser, 'admin')
    await page.goto(eventUrl)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('event-tab-discussion').click()

    // Approve the post
    const approveResp = page.waitForResponse(
      (r) => r.url().includes('/approve') && r.request().method() === 'PUT',
    )
    await page.getByTestId('discussion-approve-btn').click()
    await approveResp
    await expect(page.getByTestId('discussion-approve-btn')).toHaveText('Unapprove')
    await expect(page.getByTestId('discussion-pending-badge')).toBeHidden()

    // Now unapprove it
    const unapproveResp = page.waitForResponse(
      (r) => r.url().includes('/approve') && r.request().method() === 'PUT',
    )
    await page.getByTestId('discussion-approve-btn').click()
    await unapproveResp
    await expect(page.getByTestId('discussion-approve-btn')).toHaveText('Approve')
    await expect(page.getByTestId('discussion-pending-badge')).toBeVisible()

    await context.close()
  })

  test('pending post is hidden from other non-admin users', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createModerationEvent(browser, baseURL!)
    createdEvents.push(eventId)
    await aliceJoinsAndPosts(browser, eventUrl)

    // Bob joins and checks discussion — should NOT see alice's pending post
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await bobPage.goto(eventUrl)
    await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await bobPage.getByTestId('event-join-btn').click()
    await expect(bobPage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    await bobPage.getByTestId('event-tab-discussion').click()
    // No posts should be visible to bob
    await expect(bobPage.getByTestId('discussion-empty')).toBeVisible()

    await bobCtx.close()
  })

  test('author can see their own pending post', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createModerationEvent(browser, baseURL!)
    createdEvents.push(eventId)
    const { postContent } = await aliceJoinsAndPosts(browser, eventUrl)

    // Alice revisits — she should see her own pending post
    const { context, page } = await contextAs(browser, 'alice')
    await page.goto(eventUrl)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('event-tab-discussion').click()

    await expect(page.getByTestId('discussion-post')).toBeVisible()
    await expect(page.getByTestId('discussion-post-content')).toContainText(postContent)
    // Author sees pending badge but NOT the approve button (only admin sees it)
    await expect(page.getByTestId('discussion-pending-badge')).toBeVisible()
    await expect(page.getByTestId('discussion-approve-btn')).toBeHidden()

    await context.close()
  })

  test('admin posts are always auto-approved regardless of policy', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createModerationEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Admin creates a post — should be auto-approved
    const { context, page } = await contextAs(browser, 'admin')
    await page.goto(eventUrl)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('event-tab-discussion').click()

    await page.getByTestId('discussion-new-post-btn').click()
    await page.locator('.ProseMirror').click()
    await page.locator('.ProseMirror').fill(`Admin post ${uid()}`)

    const postResp = page.waitForResponse(
      (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
    )
    await page.getByTestId('discussion-submit-post-btn').click()
    const resp = await postResp
    const body = await resp.json()

    // Admin's post should be auto-approved
    expect(body.isApproved).toBe(true)
    // No pending badge on the post
    await expect(page.getByTestId('discussion-pending-badge')).toBeHidden()

    await context.close()
  })

  test('approved post becomes visible to other users', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createModerationEvent(browser, baseURL!)
    createdEvents.push(eventId)
    const { postContent } = await aliceJoinsAndPosts(browser, eventUrl)

    // Admin approves the post
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await adminPage.goto(eventUrl)
    await adminPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await adminPage.getByTestId('event-tab-discussion').click()

    const approveResp = adminPage.waitForResponse(
      (r) => r.url().includes('/approve') && r.request().method() === 'PUT',
    )
    await adminPage.getByTestId('discussion-approve-btn').click()
    await approveResp
    await adminCtx.close()

    // Bob joins and can now see the approved post
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await bobPage.goto(eventUrl)
    await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await bobPage.getByTestId('event-join-btn').click()
    await expect(bobPage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    await bobPage.getByTestId('event-tab-discussion').click()
    await expect(bobPage.getByTestId('discussion-post')).toBeVisible()
    await expect(bobPage.getByTestId('discussion-post-content')).toContainText(postContent)

    await bobCtx.close()
  })
})
