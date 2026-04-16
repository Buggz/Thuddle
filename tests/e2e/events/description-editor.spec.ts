import { test, expect } from '../helpers/fixtures'
import { uid, futureDates, contextAs } from '../helpers/auth'
import path from 'path'

const TEST_IMAGE = path.join(__dirname, '..', 'helpers', 'test-avatar.png')

/** Admin creates a public event and returns its IDs/URLs. */
async function createEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventId: string; eventUrl: string; manageUrl: string }> {
  const title = `Desc ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Desc Venue')

  const dates = futureDates(5)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const createResp = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await createResp
  const body = await resp.json()
  const eventId = body.id

  await context.close()
  return {
    eventId,
    eventUrl: `${baseURL}/events/${eventId}`,
    manageUrl: `${baseURL}/events/${eventId}/manage`,
  }
}

/** Navigate to the manage page About tab. */
async function goToAboutTab(page: import('@playwright/test').Page, manageUrl: string) {
  await page.goto(manageUrl)
  await page.getByTestId('manage-tab-about').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('manage-tab-about').click()
}

/** Get the TipTap ProseMirror editable area inside the description editor. */
function getEditor(page: import('@playwright/test').Page) {
  return page.getByTestId('manage-description-editor').locator('.ProseMirror')
}

/** Upload an image via the RTE image button and wait for the API response. */
async function uploadDescriptionImage(page: import('@playwright/test').Page) {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByTestId('rte-btn-image').click()
  const fileChooser = await fileChooserPromise
  const uploadResp = page.waitForResponse(
    (r) => r.url().includes('/images') && r.request().method() === 'POST',
  )
  await fileChooser.setFiles(TEST_IMAGE)
  const resp = await uploadResp
  expect(resp.status()).toBe(200)
  return resp
}

/** Save the event and wait for the API response. */
async function saveEvent(page: import('@playwright/test').Page) {
  const saveResp = page.waitForResponse(
    (r) => r.url().includes('/api/events/') && r.request().method() === 'PUT',
  )
  await page.getByTestId('manage-save-btn').click()
  const resp = await saveResp
  expect(resp.status()).toBe(200)
  await expect(page.getByTestId('manage-save-success')).toBeVisible({ timeout: 5000 })
}

test.describe('Event description editor', () => {
  test.describe('formatting', () => {
    test('heading, bold, italic, underline and strikethrough render on event detail page', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const { eventId, eventUrl, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAboutTab(page, manageUrl)

      const editor = getEditor(page)
      await editor.waitFor({ state: 'visible', timeout: 10000 })
      await editor.click()

      // Use keyboard shortcuts to avoid focus-loss from toolbar button clicks.
      // TipTap StarterKit shortcuts: Ctrl+Alt+1/2/3 for headings,
      // Ctrl+B bold, Ctrl+I italic, Ctrl+U underline, Ctrl+Shift+X strike.

      // --- H1 ---
      await editor.press('Control+Alt+1')
      await editor.pressSequentially('Heading One')
      await editor.press('Enter')

      // --- H2 ---
      await editor.press('Control+Alt+2')
      await editor.pressSequentially('Heading Two')
      await editor.press('Enter')

      // --- H3 ---
      await editor.press('Control+Alt+3')
      await editor.pressSequentially('Heading Three')
      await editor.press('Enter')

      // --- Bold paragraph ---
      await editor.press('Control+b')
      await editor.pressSequentially('Bold text')
      await editor.press('Control+b') // toggle off
      await editor.press('Enter')

      // --- Italic ---
      await editor.press('Control+i')
      await editor.pressSequentially('Italic text')
      await editor.press('Control+i')
      await editor.press('Enter')

      // --- Underline ---
      await editor.press('Control+u')
      await editor.pressSequentially('Underlined text')
      await editor.press('Control+u')
      await editor.press('Enter')

      // --- Strikethrough (no reliable keyboard shortcut, use toolbar) ---
      await page.getByTestId('rte-btn-strike').click()
      await editor.pressSequentially('Struck text')
      await page.getByTestId('rte-btn-strike').click()

      // Save
      await saveEvent(page)
      await context.close()

      // Verify on event detail page
      const { context: viewCtx, page: viewPage } = await contextAs(browser, 'admin')
      await viewPage.goto(eventUrl)

      const desc = viewPage.getByTestId('event-description')
      await desc.waitFor({ state: 'visible', timeout: 10000 })

      // Headings
      await expect(desc.locator('h1')).toHaveText('Heading One')
      await expect(desc.locator('h2')).toHaveText('Heading Two')
      await expect(desc.locator('h3')).toHaveText('Heading Three')

      // Inline formatting
      await expect(desc.locator('strong')).toHaveText('Bold text')
      await expect(desc.locator('em')).toHaveText('Italic text')
      await expect(desc.locator('u')).toHaveText('Underlined text')
      await expect(desc.locator('s')).toHaveText('Struck text')

      await viewCtx.close()
    })
  })

  test.describe('images', () => {
    test('single inline image uploads and appears in saved description', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const { eventId, eventUrl, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAboutTab(page, manageUrl)

      const editor = getEditor(page)
      await editor.waitFor({ state: 'visible', timeout: 10000 })

      // Type some text, insert image, type more text
      await editor.pressSequentially('Before the image')
      await editor.press('Enter')

      await uploadDescriptionImage(page)

      // Wait for image to appear in editor
      await expect(editor.locator('img')).toBeVisible({ timeout: 10000 })

      await editor.press('Enter')
      await editor.pressSequentially('After the image')

      // Save
      await saveEvent(page)
      await context.close()

      // Verify on event detail page
      const { context: viewCtx, page: viewPage } = await contextAs(browser, 'admin')
      await viewPage.goto(eventUrl)

      const desc = viewPage.getByTestId('event-description')
      await desc.waitFor({ state: 'visible', timeout: 10000 })

      // Should have the image
      await expect(desc.locator('img')).toBeVisible()
      const imgSrc = await desc.locator('img').getAttribute('src')
      expect(imgSrc).toBeTruthy()

      // Text around the image
      await expect(desc).toContainText('Before the image')
      await expect(desc).toContainText('After the image')

      await viewCtx.close()
    })

    test('multiple images with text between them', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const { eventId, eventUrl, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAboutTab(page, manageUrl)

      const editor = getEditor(page)
      await editor.waitFor({ state: 'visible', timeout: 10000 })

      // --- First section: text + image ---
      await editor.pressSequentially('Section one text')
      await editor.press('Enter')

      await uploadDescriptionImage(page)
      await expect(editor.locator('img')).toHaveCount(1, { timeout: 10000 })

      // --- Middle text between images ---
      await editor.press('Enter')
      await editor.pressSequentially('Middle section between images')
      await editor.press('Enter')

      // --- Second image ---
      await uploadDescriptionImage(page)
      await expect(editor.locator('img')).toHaveCount(2, { timeout: 10000 })

      // --- Trailing text ---
      await editor.press('Enter')
      await editor.pressSequentially('Final section text')

      // Save
      await saveEvent(page)
      await context.close()

      // Verify on event detail page
      const { context: viewCtx, page: viewPage } = await contextAs(browser, 'admin')
      await viewPage.goto(eventUrl)

      const desc = viewPage.getByTestId('event-description')
      await desc.waitFor({ state: 'visible', timeout: 10000 })

      // Should have 2 images
      await expect(desc.locator('img')).toHaveCount(2)

      // All text sections should be present
      await expect(desc).toContainText('Section one text')
      await expect(desc).toContainText('Middle section between images')
      await expect(desc).toContainText('Final section text')

      // Images should have src attributes
      const images = desc.locator('img')
      const src0 = await images.nth(0).getAttribute('src')
      const src1 = await images.nth(1).getAttribute('src')
      expect(src0).toBeTruthy()
      expect(src1).toBeTruthy()

      await viewCtx.close()
    })

    test('image combined with formatted text renders correctly', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      const { eventId, eventUrl, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAboutTab(page, manageUrl)

      const editor = getEditor(page)
      await editor.waitFor({ state: 'visible', timeout: 10000 })

      // H2 heading
      await page.getByTestId('rte-btn-h2').click()
      await editor.pressSequentially('Event Schedule')
      await editor.press('Enter')

      // Paragraph with bold text
      await page.getByTestId('rte-btn-paragraph').click()
      await page.getByTestId('rte-btn-bold').click()
      await editor.pressSequentially('Important:')
      await page.getByTestId('rte-btn-bold').click()
      await editor.pressSequentially(' Check the images below')
      await editor.press('Enter')

      // First image
      await uploadDescriptionImage(page)
      await expect(editor.locator('img')).toHaveCount(1, { timeout: 10000 })

      // Italic caption
      await editor.press('Enter')
      await page.getByTestId('rte-btn-italic').click()
      await editor.pressSequentially('Photo from last year')
      await page.getByTestId('rte-btn-italic').click()
      await editor.press('Enter')

      // Second image
      await uploadDescriptionImage(page)
      await expect(editor.locator('img')).toHaveCount(2, { timeout: 10000 })

      // Save
      await saveEvent(page)
      await context.close()

      // Verify on event detail page
      const { context: viewCtx, page: viewPage } = await contextAs(browser, 'admin')
      await viewPage.goto(eventUrl)

      const desc = viewPage.getByTestId('event-description')
      await desc.waitFor({ state: 'visible', timeout: 10000 })

      // Heading
      await expect(desc.locator('h2')).toHaveText('Event Schedule')

      // Bold text
      await expect(desc.locator('strong')).toHaveText('Important:')

      // Italic caption
      await expect(desc.locator('em')).toHaveText('Photo from last year')

      // Two images present
      await expect(desc.locator('img')).toHaveCount(2)

      // Text content
      await expect(desc).toContainText('Check the images below')

      await viewCtx.close()
    })
  })
})
