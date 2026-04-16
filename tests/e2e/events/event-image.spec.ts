import { test, expect } from '../helpers/fixtures'
import { uid, futureDates, contextAs } from '../helpers/auth'
import path from 'path'

const TEST_IMAGE = path.join(__dirname, '..', 'helpers', 'test-avatar.png')

/** Admin creates a public event and returns its URLs + id. */
async function createEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventId: string; eventUrl: string; manageUrl: string }> {
  const title = `Image ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Image Venue')

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

test.describe('Event image upload', () => {
  test.describe('positive', () => {
    test('owner can upload an event image', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAboutTab(page, manageUrl)

      // Upload image file
      await page.getByTestId('manage-event-image-input').setInputFiles(TEST_IMAGE)

      // Cropper should appear
      await expect(page.getByTestId('cropper-crop-btn')).toBeVisible({ timeout: 5000 })

      // Confirm crop and wait for API response
      const uploadResp = page.waitForResponse(
        (r) => r.url().includes('/picture') && r.request().method() === 'POST',
      )
      await page.getByTestId('cropper-crop-btn').click()
      const resp = await uploadResp
      expect(resp.status()).toBe(200)

      // Image should now be visible on the manage page
      await expect(page.getByTestId('manage-event-image')).toBeVisible({ timeout: 10000 })

      await context.close()
    })

    test('uploaded image appears on event detail page', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, eventUrl, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Upload image via manage page
      const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
      await goToAboutTab(adminPage, manageUrl)

      await adminPage.getByTestId('manage-event-image-input').setInputFiles(TEST_IMAGE)
      await expect(adminPage.getByTestId('cropper-crop-btn')).toBeVisible({ timeout: 5000 })

      const uploadResp = adminPage.waitForResponse(
        (r) => r.url().includes('/picture') && r.request().method() === 'POST',
      )
      await adminPage.getByTestId('cropper-crop-btn').click()
      await uploadResp
      await expect(adminPage.getByTestId('manage-event-image')).toBeVisible({ timeout: 10000 })
      await adminCtx.close()

      // Visit event detail page and verify the hero image is shown
      const { context, page } = await contextAs(browser, 'alice')
      await page.goto(eventUrl)
      await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
      await expect(page.getByTestId('event-hero-image')).toBeVisible()

      await context.close()
    })

    test('owner can change an existing event image', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAboutTab(page, manageUrl)

      // Upload first image
      await page.getByTestId('manage-event-image-input').setInputFiles(TEST_IMAGE)
      await expect(page.getByTestId('cropper-crop-btn')).toBeVisible({ timeout: 5000 })
      const firstUpload = page.waitForResponse(
        (r) => r.url().includes('/picture') && r.request().method() === 'POST',
      )
      await page.getByTestId('cropper-crop-btn').click()
      const firstResp = await firstUpload
      expect(firstResp.status()).toBe(200)
      await expect(page.getByTestId('manage-event-image')).toBeVisible({ timeout: 10000 })

      // Upload second image via the "Change" button input
      await page.getByTestId('manage-event-image-input').setInputFiles(TEST_IMAGE)
      await expect(page.getByTestId('cropper-crop-btn')).toBeVisible({ timeout: 5000 })
      const secondUpload = page.waitForResponse(
        (r) => r.url().includes('/picture') && r.request().method() === 'POST',
      )
      await page.getByTestId('cropper-crop-btn').click()
      const secondResp = await secondUpload
      expect(secondResp.status()).toBe(200)

      // Image should still be visible after replacing
      await expect(page.getByTestId('manage-event-image')).toBeVisible({ timeout: 10000 })

      await context.close()
    })

    test('image persists after page reload', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAboutTab(page, manageUrl)

      // Upload image
      await page.getByTestId('manage-event-image-input').setInputFiles(TEST_IMAGE)
      await expect(page.getByTestId('cropper-crop-btn')).toBeVisible({ timeout: 5000 })
      const uploadResp = page.waitForResponse(
        (r) => r.url().includes('/picture') && r.request().method() === 'POST',
      )
      await page.getByTestId('cropper-crop-btn').click()
      await uploadResp
      await expect(page.getByTestId('manage-event-image')).toBeVisible({ timeout: 10000 })

      // Reload and verify
      await page.reload()
      await goToAboutTab(page, manageUrl)
      await expect(page.getByTestId('manage-event-image')).toBeVisible({ timeout: 10000 })

      await context.close()
    })

    test('user can cancel the crop dialog', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToAboutTab(page, manageUrl)

      await page.getByTestId('manage-event-image-input').setInputFiles(TEST_IMAGE)
      await expect(page.getByTestId('cropper-crop-btn')).toBeVisible({ timeout: 5000 })

      // Cancel the cropper
      await page.getByTestId('cropper-cancel-btn').click()
      await expect(page.getByTestId('cropper-crop-btn')).not.toBeVisible()

      // No image should appear (still showing "Upload image")
      await expect(page.getByTestId('manage-event-image')).not.toBeVisible()

      await context.close()
    })
  })

  test.describe('negative', () => {
    test('non-owner cannot access manage page to upload image', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'bob')
      await page.goto(manageUrl)

      // Should not see manage tabs
      await expect(page.getByTestId('manage-tab-about')).not.toBeVisible({ timeout: 10000 })

      await context.close()
    })
  })
})
