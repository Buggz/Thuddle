import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates, contextAs } from '../helpers/auth'

/** Admin creates a public open event and returns its URL + id. */
async function createEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string }> {
  const title = `DelComment ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Comment Venue')

  const dates = futureDates(7)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await responsePromise
  const body = await resp.json()

  await context.close()
  return { eventUrl: `${baseURL}/events/${body.id}`, eventId: body.id }
}

/** Navigate to the discussion tab. */
async function goToDiscussion(page: import('@playwright/test').Page, eventUrl: string) {
  await page.goto(eventUrl)
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-tab-discussion').click()
}

/** Admin creates a post and alice adds a comment. Returns the comment text. */
async function createPostAndComment(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  eventUrl: string,
): Promise<string> {
  // Admin creates a post
  const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
  await goToDiscussion(adminPage, eventUrl)

  await adminPage.getByTestId('discussion-new-post-btn').click()
  await adminPage.locator('.ProseMirror').click()
  await adminPage.locator('.ProseMirror').fill(`Post ${uid()}`)

  const postResp = adminPage.waitForResponse(
    (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
  )
  await adminPage.getByTestId('discussion-submit-post-btn').click()
  await postResp
  await expect(adminPage.getByTestId('discussion-post')).toBeVisible()
  await adminCtx.close()

  // Alice joins and adds a comment
  const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
  await alicePage.goto(eventUrl)
  await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
  await alicePage.getByTestId('event-join-btn').click()
  await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

  await alicePage.getByTestId('event-tab-discussion').click()
  await expect(alicePage.getByTestId('discussion-post')).toBeVisible()

  await alicePage.getByTestId('discussion-toggle-comments-btn').click()

  const commentText = `Comment ${uid()}`
  await alicePage.getByTestId('discussion-comment-input').fill(commentText)

  const commentResp = alicePage.waitForResponse(
    (r) => r.url().includes('/comments') && r.request().method() === 'POST',
  )
  await alicePage.getByTestId('discussion-comment-reply-btn').click()
  await commentResp
  await expect(alicePage.getByText(commentText)).toBeVisible()

  await aliceCtx.close()
  return commentText
}

test.describe('Delete comment', () => {
  test('admin can delete a comment', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)
    const commentText = await createPostAndComment(browser, baseURL!, eventUrl)

    // Admin opens discussion and expands comments
    const { context, page } = await contextAs(browser, 'admin')
    await goToDiscussion(page, eventUrl)
    await expect(page.getByTestId('discussion-post')).toBeVisible()
    await page.getByTestId('discussion-toggle-comments-btn').click()
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 })

    // Click delete on the comment
    const deleteResp = page.waitForResponse(
      (r) => r.url().includes('/comments/') && r.request().method() === 'DELETE',
    )
    await page.getByTestId('discussion-delete-comment-btn').click()

    // Confirm the dialog
    await page.getByTestId('confirm-dialog-confirm').click()
    await deleteResp

    // Comment disappears from the comments section
    await expect(page.getByTestId('discussion-post').getByText(commentText)).toBeHidden({ timeout: 10000 })

    await context.close()
  })

  test('admin can cancel delete comment via confirm dialog', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)
    const commentText = await createPostAndComment(browser, baseURL!, eventUrl)

    const { context, page } = await contextAs(browser, 'admin')
    await goToDiscussion(page, eventUrl)
    await expect(page.getByTestId('discussion-post')).toBeVisible()
    await page.getByTestId('discussion-toggle-comments-btn').click()
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 })

    // Click delete then cancel
    await page.getByTestId('discussion-delete-comment-btn').click()
    await page.getByTestId('confirm-dialog-cancel').click()

    // Confirm dialog closes
    await expect(page.getByTestId('confirm-dialog-cancel')).toBeHidden({ timeout: 5000 })

    // Comment is still there
    await expect(page.getByTestId('discussion-post').getByText(commentText)).toBeVisible()

    await context.close()
  })

  test('non-admin member does not see delete comment button', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)
    const commentText = await createPostAndComment(browser, baseURL!, eventUrl)

    // Alice (non-admin member) views the comment
    const { context, page } = await contextAs(browser, 'alice')
    await goToDiscussion(page, eventUrl)
    await expect(page.getByTestId('discussion-post')).toBeVisible()
    await page.getByTestId('discussion-toggle-comments-btn').click()
    await expect(page.getByText(commentText)).toBeVisible({ timeout: 10000 })

    // Delete button should not be visible
    await expect(page.getByTestId('discussion-delete-comment-btn')).toHaveCount(0)

    await context.close()
  })

  test('comment count decreases after deletion', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)
    const commentText = await createPostAndComment(browser, baseURL!, eventUrl)

    const { context, page } = await contextAs(browser, 'admin')
    await goToDiscussion(page, eventUrl)
    await expect(page.getByTestId('discussion-post')).toBeVisible()

    // Verify "1 comment" is shown
    await expect(page.getByTestId('discussion-toggle-comments-btn')).toContainText('1 comment')

    // Expand, delete the comment
    await page.getByTestId('discussion-toggle-comments-btn').click()
    await expect(page.getByTestId('discussion-post').getByText(commentText)).toBeVisible({ timeout: 10000 })

    const deleteResp = page.waitForResponse(
      (r) => r.url().includes('/comments/') && r.request().method() === 'DELETE',
    )
    await page.getByTestId('discussion-delete-comment-btn').click()
    await page.getByTestId('confirm-dialog-confirm').click()
    await deleteResp
    await expect(page.getByTestId('discussion-post').getByText(commentText)).toBeHidden({ timeout: 10000 })

    // Count should now show "0 comments"
    await expect(page.getByTestId('discussion-toggle-comments-btn')).toContainText('0 comments')

    await context.close()
  })
})
