import { test, expect } from '../helpers/fixtures'
import { uid, futureDates, contextAs, expectJson } from '../helpers/auth'

/** Admin creates a public open event and returns its URL + id. */
async function createEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string; manageUrl: string }> {
  const title = `Settings ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Settings Venue')

  const dates = futureDates(7)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await responsePromise
  const body = await expectJson<{ id: string }>(resp)

  await context.close()
  return {
    eventUrl: `${baseURL}/events/${body.id}`,
    eventId: body.id,
    manageUrl: `${baseURL}/events/${body.id}/manage`,
  }
}

/** Navigate to the manage page's Discussion settings tab. */
async function goToDiscussionSettings(page: import('@playwright/test').Page, manageUrl: string) {
  await page.goto(manageUrl)
  await page.getByTestId('manage-tab-discussion').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('manage-tab-discussion').click()
}

test.describe('Discussion settings', () => {
  test.describe('positive - save settings', () => {
    test('admin can change member post policy to require approval', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventUrl, eventId } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToDiscussionSettings(page, manageUrl)

      // Default is "Post freely" (value=1). Change to "Require approval" (value=0)
      await page.getByTestId('manage-member-post-policy').selectOption('0')

      const saveResp = page.waitForResponse(
        (r) => r.url().includes('/discussion-settings') && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-save-discussion-btn').click()
      await saveResp

      await expect(page.getByTestId('manage-discussion-save-success')).toBeVisible()

      // Reload and verify the setting persisted
      await goToDiscussionSettings(page, manageUrl)
      await expect(page.getByTestId('manage-member-post-policy')).toHaveValue('0')

      await context.close()
    })

    test('admin can enable non-member posts and set policy', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventId } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToDiscussionSettings(page, manageUrl)

      // Non-member post dropdown should be disabled by default (allowNonMemberPosts is false)
      await expect(page.getByTestId('manage-nonmember-post-policy')).toBeDisabled()

      // Enable non-member posts checkbox
      await page.getByTestId('manage-allow-nonmember-posts').check()

      // Now the dropdown should be enabled
      await expect(page.getByTestId('manage-nonmember-post-policy')).toBeEnabled()

      // Set non-member policy to "Require approval"
      await page.getByTestId('manage-nonmember-post-policy').selectOption('0')

      const saveResp = page.waitForResponse(
        (r) => r.url().includes('/discussion-settings') && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-save-discussion-btn').click()
      await saveResp

      await expect(page.getByTestId('manage-discussion-save-success')).toBeVisible()

      // Reload and verify
      await goToDiscussionSettings(page, manageUrl)
      await expect(page.getByTestId('manage-allow-nonmember-posts')).toBeChecked()
      await expect(page.getByTestId('manage-nonmember-post-policy')).toHaveValue('0')

      await context.close()
    })

    test('admin can toggle allow non-member comments', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventId } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToDiscussionSettings(page, manageUrl)

      // Default: unchecked
      await expect(page.getByTestId('manage-allow-nonmember-comments')).not.toBeChecked()

      // Enable
      await page.getByTestId('manage-allow-nonmember-comments').check()

      const saveResp = page.waitForResponse(
        (r) => r.url().includes('/discussion-settings') && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-save-discussion-btn').click()
      await saveResp

      await expect(page.getByTestId('manage-discussion-save-success')).toBeVisible()

      // Reload and verify persisted
      await goToDiscussionSettings(page, manageUrl)
      await expect(page.getByTestId('manage-allow-nonmember-comments')).toBeChecked()

      await context.close()
    })
  })

  test.describe('positive - moderation effects', () => {
    test('member post requires approval when policy is set', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventUrl, eventId } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Admin sets member post policy to "Require approval"
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToDiscussionSettings(adminPage, manageUrl)
      await adminPage.getByTestId('manage-member-post-policy').selectOption('0')

      const saveResp = adminPage.waitForResponse(
        (r) => r.url().includes('/discussion-settings') && r.request().method() === 'PUT',
      )
      await adminPage.getByTestId('manage-save-discussion-btn').click()
      await saveResp
      await adminCtx.close()

      // Alice joins the event
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await alicePage.getByTestId('event-join-btn').click()
      await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

      // Alice posts in the discussion
      await alicePage.getByTestId('event-tab-discussion').click()
      await alicePage.getByTestId('discussion-new-post-btn').click()
      await alicePage.locator('.ProseMirror').click()
      await alicePage.locator('.ProseMirror').fill(`Pending post ${uid()}`)

      const postResp = alicePage.waitForResponse(
        (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
      )
      await alicePage.getByTestId('discussion-submit-post-btn').click()
      const resp = await postResp
      const postBody = await resp.json()

      // The post should show but NOT be approved (alice sees her own unapproved post)
      expect(postBody.isApproved).toBe(false)

      await aliceCtx.close()

      // Admin views discussion and sees the post as pending with approve button
      const { context: admin2Ctx, page: admin2Page } = await contextAs(browser, 'admin')
      await admin2Page.goto(eventUrl)
      await admin2Page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await admin2Page.getByTestId('event-tab-discussion').click()

      // Find the pending post (it will have amber border + "Pending" badge)
      const approveBtn = admin2Page.getByTestId('discussion-approve-btn')
      await expect(approveBtn).toBeVisible()

      // Approve it
      const approveResp = admin2Page.waitForResponse(
        (r) => r.url().includes('/approve') && r.request().method() === 'PUT',
      )
      await approveBtn.click()
      await approveResp

      // Button text should change to "Unapprove"
      await expect(approveBtn).toHaveText('Unapprove')

      await admin2Ctx.close()
    })

    test('non-member cannot post when allowNonMemberPosts is disabled', async ({ browser, baseURL, createdEvents }) => {
      const { eventUrl, eventId } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Bob does NOT join — visits discussion directly
      const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
      await bobPage.goto(eventUrl)
      await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await bobPage.getByTestId('event-tab-discussion').click()

      // Should see the denied message, not the new post button
      await expect(bobPage.getByTestId('discussion-denied-msg')).toBeVisible()
      await expect(bobPage.getByTestId('discussion-new-post-btn')).toBeHidden()

      await bobCtx.close()
    })

    test('non-member can post when allowNonMemberPosts is enabled', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventUrl, eventId } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Admin enables non-member posts
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToDiscussionSettings(adminPage, manageUrl)
      await adminPage.getByTestId('manage-allow-nonmember-posts').check()

      const saveResp = adminPage.waitForResponse(
        (r) => r.url().includes('/discussion-settings') && r.request().method() === 'PUT',
      )
      await adminPage.getByTestId('manage-save-discussion-btn').click()
      await saveResp
      await adminCtx.close()

      // Bob (non-member) visits discussion
      const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
      await bobPage.goto(eventUrl)
      await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await bobPage.getByTestId('event-tab-discussion').click()

      // Should see the new post button (not the denied message)
      await expect(bobPage.getByTestId('discussion-new-post-btn')).toBeVisible()
      await expect(bobPage.getByTestId('discussion-denied-msg')).toBeHidden()

      // Bob can successfully create a post
      await bobPage.getByTestId('discussion-new-post-btn').click()
      await bobPage.locator('.ProseMirror').click()
      await bobPage.locator('.ProseMirror').fill(`Non-member post ${uid()}`)

      const postResp = bobPage.waitForResponse(
        (r) => r.url().includes('/discussion') && r.request().method() === 'POST',
      )
      await bobPage.getByTestId('discussion-submit-post-btn').click()
      await postResp

      await expect(bobPage.getByTestId('discussion-post')).toBeVisible()

      await bobCtx.close()
    })
  })

  test.describe('negative - access control', () => {
    test('non-admin cannot access discussion settings', async ({ browser, baseURL, createdEvents }) => {
      const { manageUrl, eventUrl, eventId } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Alice joins the event
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await alicePage.getByTestId('event-join-btn').click()
      await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

      // Alice should NOT see the "Manage Event" button
      await expect(alicePage.getByTestId('event-manage-btn')).toBeHidden()

      // Even if Alice navigates to the manage URL directly, the settings API should return 403
      const settingsResp = alicePage.waitForResponse(
        (r) => r.url().includes('/discussion-settings') && r.status() === 403,
      )
      await alicePage.goto(manageUrl)
      // The page loads but the settings endpoint returns 403
      await settingsResp

      await aliceCtx.close()
    })
  })
})
