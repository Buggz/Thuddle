import { test, expect } from '../helpers/fixtures'
import { contextAs, uid } from '../helpers/auth'
import { adminApi, createEventApi } from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'
import path from 'path'

const TEST_IMAGE = path.join(__dirname, '..', 'helpers', 'test-avatar.png')

/**
 * Test file: Raffle description image upload
 * - Verifies the RichTextEditor image button is wired up inside the
 *   raffle editor dialog and that uploads insert + persist an <img>.
 */

test.describe('Raffle description image upload', () => {
  test('host can upload an image into the raffle description and it persists', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Admin creates event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await api.close()

    // Admin opens the raffle creation dialog
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    // Image button must be wired up inside the description editor
    const descEditor = adminPage.locator('[data-testid="raffle-description-input"]')
    await expect(descEditor.locator('[data-testid="rte-btn-image"]')).toBeVisible()

    // Click the image button, attach a file via the ad-hoc <input type="file">
    const fileChooserPromise = adminPage.waitForEvent('filechooser')
    await descEditor.locator('[data-testid="rte-btn-image"]').click()
    const fileChooser = await fileChooserPromise

    const uploadResp = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/images`) &&
        r.request().method() === 'POST',
    )
    await fileChooser.setFiles(TEST_IMAGE)
    const resp = await uploadResp
    expect(resp.status()).toBe(200)

    // <img> appears in the editor with a non-empty src.
    // Wait for the editor's ProseMirror to actually contain the img node
    // (TipTap inserts the node asynchronously after the upload promise resolves),
    // then wait for the browser to finish loading it so we capture a stable src.
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

    // Fill name and save
    const raffleName = `Image Raffle ${uid()}`
    await adminPage.getByTestId('raffle-name-input').fill(raffleName)

    const createResp = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/raffles`) &&
        r.request().method() === 'POST',
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    expect(createResult.status()).toBe(201)
    const raffleId = (await createResult.json()).id

    await adminPage.getByTestId('manage-raffles-tab').waitFor({ state: 'visible', timeout: 10000 })

    // Reload the page to prove persistence, then reopen the editor
    await adminPage.reload()
    await adminPage.getByTestId('manage-tab-raffles').waitFor({ state: 'visible', timeout: 20000 })
    await adminPage.getByTestId('manage-tab-raffles').click()
    await adminPage.getByTestId('manage-raffles-tab').waitFor({ state: 'visible', timeout: 15000 })

    const raffleCard = adminPage.getByTestId(`raffle-card-${raffleId}`)

    // Auto-expand may already have fetched the single raffle. Click the card
    // only if the expanded body (containing the edit button's panel) isn't
    // already visible — otherwise the click would collapse it.
    const editBtn = adminPage.getByTestId(`raffle-edit-btn-${raffleId}`)
    await expect(editBtn).toBeVisible({ timeout: 15000 })

    // Trigger a fresh fetch of the single raffle to ensure description is hydrated.
    // Either auto-expand already fired this, or we click the card to fetch.
    const raffleDetailGet = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/raffles/${raffleId}`) &&
        r.request().method() === 'GET' &&
        r.status() === 200,
      { timeout: 5000 },
    ).catch(() => undefined)
    // If the body is already expanded, skip the click; otherwise click to expand.
    const drawStageBtn = adminPage.getByTestId('raffle-draw-stage-btn')
    if (!(await drawStageBtn.isVisible().catch(() => false))) {
      await raffleCard.click()
    }
    await raffleDetailGet

    // Pre-arm the wait for the inline image GET so we don't miss it if the
    // browser fetches it the moment TipTap hydrates the description.
    const imageGet = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/images`) &&
        r.request().method() === 'GET' &&
        r.status() >= 200 &&
        r.status() < 300,
      { timeout: 15000 },
    )

    const saveBtn = adminPage.getByTestId('raffle-save-btn')

    await editBtn.click()

    // The raffle detail was already fetched by the card click above and is
    // cached in the store, so the editor opens with the description already
    // hydrated — no loading overlay is shown. Save should be enabled
    // immediately.
    await expect(saveBtn).toBeEnabled()

    // Wait for the editor dialog to be fully open and the ProseMirror to hydrate
    // with the persisted description before asserting on its contents.
    const persistedEditor = adminPage.locator(
      '[data-testid="raffle-description-input"] .ProseMirror',
    )
    await expect(persistedEditor).toBeVisible({ timeout: 15000 })

    // The <img> should still be present in the description editor with the persisted src.
    const persistedImg = persistedEditor.locator('img')
    await expect(persistedImg).toHaveCount(1, { timeout: 15000 })
    await expect(persistedImg).toBeVisible({ timeout: 10000 })

    // Wait for the browser's GET of the inline image to complete with a 2xx,
    // and for the <img> to have actually loaded pixels. This closes the race
    // between TipTap content hydration and the image network fetch.
    await imageGet.catch(() => undefined)
    await expect
      .poll(async () => persistedImg.evaluate((el: HTMLImageElement) => el.naturalWidth), {
        timeout: 15000,
      })
      .toBeGreaterThan(0)

    const persistedSrc = await persistedImg.getAttribute('src')
    expect(persistedSrc).toBe(insertedSrc)

    await adminCtx.close()
  })
})
