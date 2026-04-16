import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates, contextAs } from '../helpers/auth'

/** Helper: admin creates a public open event and returns the event URL + id. */
async function createEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  name: string,
): Promise<{ eventUrl: string; eventId: string }> {
  const { context, page } = await contextAs(browser, 'admin')
  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(name)
  await page.getByTestId('event-location-input').fill('Discussion Venue')

  const dates = futureDates(7)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const response = await responsePromise
  const body = await response.json()

  await context.close()
  return { eventUrl: `${baseURL}/events/${body.id}`, eventId: body.id }
}

/** Navigate to the discussion tab of an event. */
async function goToDiscussion(page: import('@playwright/test').Page, eventUrl: string) {
  await page.goto(eventUrl)
  await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-tab-discussion').click()
}

test.describe('Discussion', () => {
  test.describe('positive - posting', () => {
    test('admin can create a discussion post', async ({ browser, baseURL, createdEvents }) => {
      const name = `Disc ${uid()}`
      const { eventUrl, eventId } = await createEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToDiscussion(page, eventUrl)

      await page.getByTestId('discussion-new-post-btn').click()
      // Type into the TipTap rich text editor
      await page.locator('.ProseMirror').click()
      const postText = `Hello from admin ${uid()}`
      await page.locator('.ProseMirror').fill(postText)

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
      )
      await page.getByTestId('discussion-submit-post-btn').click()
      const response = await responsePromise
      expect(response.status()).toBe(201)

      // Post appears in the list
      await expect(page.getByTestId('discussion-post')).toBeVisible()
      await expect(page.getByTestId('discussion-post-content')).toContainText(postText)

      await context.close()
    })

    test('member can create a discussion post after joining', async ({ browser, baseURL, createdEvents }) => {
      const name = `DiscJoin ${uid()}`
      const { eventUrl, eventId } = await createEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      // Alice joins the event first
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await alicePage.getByTestId('event-join-btn').click()
      await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

      // Navigate to discussion tab
      await alicePage.getByTestId('event-tab-discussion').click()

      await alicePage.getByTestId('discussion-new-post-btn').click()
      await alicePage.locator('.ProseMirror').click()
      const postText = `Hello from alice ${uid()}`
      await alicePage.locator('.ProseMirror').fill(postText)

      const responsePromise = alicePage.waitForResponse(
        (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
      )
      await alicePage.getByTestId('discussion-submit-post-btn').click()
      const response = await responsePromise
      expect(response.status()).toBe(201)

      await expect(alicePage.getByTestId('discussion-post-content')).toContainText(postText)

      await aliceCtx.close()
    })
  })

  test.describe('positive - comments', () => {
    test('user can add a comment to a post', async ({ browser, baseURL, createdEvents }) => {
      const name = `DiscComment ${uid()}`
      const { eventUrl, eventId } = await createEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      // Admin creates a post
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToDiscussion(adminPage, eventUrl)

      await adminPage.getByTestId('discussion-new-post-btn').click()
      await adminPage.locator('.ProseMirror').click()
      await adminPage.locator('.ProseMirror').fill(`Post for comments ${uid()}`)

      const postResponse = adminPage.waitForResponse(
        (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
      )
      await adminPage.getByTestId('discussion-submit-post-btn').click()
      await postResponse
      await expect(adminPage.getByTestId('discussion-post')).toBeVisible()
      await adminCtx.close()

      // Alice joins and comments
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await alicePage.getByTestId('event-join-btn').click()
      await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

      await alicePage.getByTestId('event-tab-discussion').click()
      await expect(alicePage.getByTestId('discussion-post')).toBeVisible()

      // Expand comments
      await alicePage.getByTestId('discussion-toggle-comments-btn').click()

      const commentText = `Great event! ${uid()}`
      await alicePage.getByTestId('discussion-comment-input').fill(commentText)

      const commentResponse = alicePage.waitForResponse(
        (r) => r.url().includes('/comments') && r.request().method() === 'POST',
      )
      await alicePage.getByTestId('discussion-comment-reply-btn').click()
      const resp = await commentResponse
      expect(resp.status()).toBe(201)

      // Comment appears
      await expect(alicePage.getByText(commentText)).toBeVisible()

      await aliceCtx.close()
    })
  })

  test.describe('positive - admin actions', () => {
    test('admin can delete a post', async ({ browser, baseURL, createdEvents }) => {
      const name = `DiscDel ${uid()}`
      const { eventUrl, eventId } = await createEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      // Admin creates a post
      const { context, page } = await contextAs(browser, 'admin')
      await goToDiscussion(page, eventUrl)

      await page.getByTestId('discussion-new-post-btn').click()
      await page.locator('.ProseMirror').click()
      const postText = `Delete me ${uid()}`
      await page.locator('.ProseMirror').fill(postText)

      const createResponse = page.waitForResponse(
        (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
      )
      await page.getByTestId('discussion-submit-post-btn').click()
      await createResponse
      await expect(page.getByTestId('discussion-post')).toBeVisible()

      // Delete the post
      await page.getByTestId('discussion-delete-post-btn').click()
      await page.getByTestId('confirm-dialog-confirm').click()

      // Wait for the delete API response
      await expect(page.getByTestId('discussion-post')).toBeHidden({ timeout: 10000 })
      await expect(page.getByTestId('discussion-empty')).toBeVisible()

      await context.close()
    })
  })

  test.describe('negative', () => {
    test('non-member sees denied message when posting is restricted', async ({ browser, baseURL, createdEvents }) => {
      const name = `DiscDenied ${uid()}`
      const { eventUrl, eventId } = await createEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      // Bob visits the event discussion without joining
      const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
      await goToDiscussion(bobPage, eventUrl)

      // By default, non-members can't post — should see the denied message or no post button
      const newPostBtn = bobPage.getByTestId('discussion-new-post-btn')
      const deniedMsg = bobPage.getByTestId('discussion-denied-msg')

      // Either the write button is hidden (non-members can't post) or a denied message is shown
      const hasDenied = await deniedMsg.isVisible().catch(() => false)
      const hasPostBtn = await newPostBtn.isVisible().catch(() => false)

      // Non-member should not have a post button (unless allowNonMemberPosts is true)
      expect(hasDenied || !hasPostBtn).toBeTruthy()

      await bobCtx.close()
    })

    test('post button is disabled when content is empty', async ({ browser, baseURL, createdEvents }) => {
      const name = `DiscEmpty ${uid()}`
      const { eventUrl, eventId } = await createEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToDiscussion(page, eventUrl)

      await page.getByTestId('discussion-new-post-btn').click()
      // Don't type anything — the submit button should be disabled
      await expect(page.getByTestId('discussion-submit-post-btn')).toBeDisabled()

      await context.close()
    })

    test('cancel button hides the post form', async ({ browser, baseURL, createdEvents }) => {
      const name = `DiscCancel ${uid()}`
      const { eventUrl, eventId } = await createEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToDiscussion(page, eventUrl)

      await page.getByTestId('discussion-new-post-btn').click()
      await expect(page.getByTestId('discussion-submit-post-btn')).toBeVisible()

      await page.getByTestId('discussion-cancel-post-btn').click()
      await expect(page.getByTestId('discussion-submit-post-btn')).toBeHidden()
      await expect(page.getByTestId('discussion-new-post-btn')).toBeVisible()

      await context.close()
    })

    test('anonymous user sees empty discussion without post controls', async ({ browser, baseURL, createdEvents }) => {
      const name = `DiscAnon ${uid()}`
      const { eventUrl, eventId } = await createEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const page = await context.newPage()
      await goToDiscussion(page, eventUrl)

      // No new post button for anonymous
      await expect(page.getByTestId('discussion-new-post-btn')).toBeHidden()

      await context.close()
    })
  })
})
