import { test, expect } from '../helpers/fixtures'
import { contextAs, uid } from '../helpers/auth'
import { adminApi, createEventApi, enableEventFeature } from '../helpers/api'
import { gotoManageActivitiesTab, gotoActivitiesTab } from '../helpers/events'
import path from 'path'

const TEST_IMAGE = path.join(__dirname, '..', 'helpers', 'test-avatar.png')

/**
 * Activities — description image upload. Mirrors the raffle description image
 * upload spec, but verifies the new `/api/events/{eventId}/activities/description-images`
 * endpoint and that the image renders inside the activity card description.
 */

test.describe('Activities — description image upload', () => {
  test('host uploads an image into the description and it renders on the card', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Arrange — admin creates event + enables activities (no activity yet).
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'activities')
    await api.close()

    // Admin opens the manage activities tab and the create-activity editor.
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageActivitiesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('activity-create-button').click()
    await expect(adminPage.getByTestId('activity-form-title')).toBeVisible({ timeout: 10000 })

    // Title + dates + capacity (must be filled to enable submit).
    const title = `Image Activity ${uid()}`
    await adminPage.getByTestId('activity-form-title').fill(title)
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    await adminPage
      .getByTestId('activity-form-starts-at')
      .fill(fmt(new Date(Date.now() + 60 * 60 * 1000)))
    await adminPage
      .getByTestId('activity-form-ends-at')
      .fill(fmt(new Date(Date.now() + 3 * 60 * 60 * 1000)))
    await adminPage.getByTestId('activity-form-max-participants').fill('4')

    // Image button must be wired up inside the description editor.
    const descEditor = adminPage.locator('[data-testid="activity-form-description"]')
    await expect(descEditor.locator('[data-testid="rte-btn-image"]')).toBeVisible()

    // Click the image button → file chooser → upload → POST description-images.
    const fileChooserPromise = adminPage.waitForEvent('filechooser')
    await descEditor.locator('[data-testid="rte-btn-image"]').click()
    const fileChooser = await fileChooserPromise

    const uploadResp = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/activities/description-images`) &&
        r.request().method() === 'POST',
    )
    await fileChooser.setFiles(TEST_IMAGE)
    const upload = await uploadResp
    expect(upload.status()).toBe(200)

    // <img> appears in the editor with a non-empty src and actually loads.
    const insertedImg = descEditor.locator('.ProseMirror img')
    await expect(insertedImg).toHaveCount(1, { timeout: 10000 })
    await expect(insertedImg).toBeVisible({ timeout: 10000 })
    await expect
      .poll(async () => insertedImg.evaluate((el: HTMLImageElement) => el.naturalWidth), {
        timeout: 10000,
      })
      .toBeGreaterThan(0)
    const insertedSrc = await insertedImg.getAttribute('src')
    expect(insertedSrc).toBeTruthy()

    // Save the activity.
    const createResp = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/activities`) &&
        r.request().method() === 'POST' &&
        !r.url().includes('description-images'),
    )
    await adminPage.getByTestId('activity-form-submit').click()
    const createResult = await createResp
    expect(createResult.status()).toBe(201)
    const activityId = (await createResult.json()).id

    await adminCtx.close()

    // Verify a participant sees the image inside the activity card description.
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'admin')
    await gotoActivitiesTab(alicePage, baseURL!, eventId)
    const card = alicePage.getByTestId(`activity-card-${activityId}`)
    await expect(card).toBeVisible({ timeout: 10000 })
    const cardImg = card.locator('[data-testid="expandable-html"] img')
    await expect(cardImg).toHaveCount(1, { timeout: 10000 })
    await expect(cardImg).toBeVisible({ timeout: 10000 })
    await expect
      .poll(async () => cardImg.evaluate((el: HTMLImageElement) => el.naturalWidth), {
        timeout: 15000,
      })
      .toBeGreaterThan(0)
    expect(await cardImg.getAttribute('src')).toBe(insertedSrc)

    await aliceCtx.close()
  })
})
