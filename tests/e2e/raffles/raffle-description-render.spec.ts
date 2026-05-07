import { test, expect } from '../helpers/fixtures'
import { contextAs, uid } from '../helpers/auth'
import { adminApi, createEventApi, createRaffleApi , enableEventFeature } from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'
import path from 'path'

const TEST_IMAGE = path.join(__dirname, '..', 'helpers', 'test-avatar.png')

/**
 * Test file: Raffle description rendering on the participant side
 * Issue #12 (Raffle improvements): the raffle description authored via the
 * rich text editor should render for participants with both inline text and
 * any embedded images. Authoring + image upload setup is lifted from
 * raffle-description-image.spec.ts; this spec asserts the *rendered* output.
 */

test.describe('Raffle description rendering (participant)', () => {
  test('participant sees description text and inline image', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Admin creates a public event via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    await api.close()

    // Admin authors a raffle through the GUI: type some plain text into the
    // rich text editor and upload an inline image (lifted from the image spec).
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)
    await adminPage.getByTestId('raffle-create-btn').click()

    const raffleName = `Described Raffle ${uid()}`
    const descriptionText = `Bring snacks please ${uid()}`

    await adminPage.getByTestId('raffle-name-input').fill(raffleName)
    await adminPage.getByTestId('raffle-price-input').fill('5')

    // Type description into the ProseMirror editor
    const descEditor = adminPage.locator('[data-testid="raffle-description-input"]')
    const proseMirror = descEditor.locator('.ProseMirror')
    await proseMirror.click()
    await proseMirror.pressSequentially(descriptionText, { delay: 10 })

    // Insert an inline image via the image button (same approach as raffle-description-image.spec.ts)
    const fileChooserPromise = adminPage.waitForEvent('filechooser')
    await descEditor.locator('[data-testid="rte-btn-image"]').click()
    const fileChooser = await fileChooserPromise

    const uploadResp = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/images`) &&
        r.request().method() === 'POST',
    )
    await fileChooser.setFiles(TEST_IMAGE)
    await uploadResp

    // Wait for img to appear in the editor
    await expect(descEditor.locator('.ProseMirror img')).toHaveCount(1, { timeout: 10000 })

    // Save the raffle
    const createResp = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/events/${eventId}/raffles`) &&
        r.request().method() === 'POST',
    )
    await adminPage.getByTestId('raffle-save-btn').click()
    const createResult = await createResp
    expect(createResult.status()).toBe(201)
    const raffleId = (await createResult.json()).id
    await adminCtx.close()

    // Alice (a participant) joins the event and opens it
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // RafflesSection only mounts when the Raffles tab is active on the participant view
    await alicePage.getByTestId('event-tab-raffles').click()

    // The single raffle is auto-expanded on initial load (issue #12) — do NOT click,
    // that would collapse it. Just wait for an expanded-only marker.
    const raffleCard = alicePage.getByTestId(`raffle-card-${raffleId}`)
    await raffleCard.scrollIntoViewIfNeeded()
    await expect(alicePage.getByTestId('raffle-price-display')).toBeVisible({ timeout: 10000 })

    // Description block should be present, contain the text, and contain an <img>
    const descBlock = alicePage.locator('[data-testid="raffle-description"]')
    await expect(descBlock).toBeVisible({ timeout: 10000 })
    await expect(descBlock).toContainText(descriptionText)
    await expect(descBlock.locator('img')).toHaveCount(1, { timeout: 10000 })

    await aliceCtx.close()
  })

  test('raffle without a description does not render the description block', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    // Admin creates event + raffle with no description, all via API
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { visibility: 0 })
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `No Desc Raffle ${uid()}`,
      price: 5,
      // description omitted -> null
    })
    await api.close()

    // Alice joins and expands the raffle
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(`${baseURL}/events/${eventId}`)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // RafflesSection only mounts when the Raffles tab is active on the participant view
    await alicePage.getByTestId('event-tab-raffles').click()

    const raffleCard = alicePage.getByTestId(`raffle-card-${raffleId}`)
    await expect(raffleCard).toBeVisible({ timeout: 10000 })
    await raffleCard.scrollIntoViewIfNeeded()

    // With a single raffle the auto-expand from issue #12 will already have
    // expanded it; clicking once more would collapse it. Use a stable
    // expanded-only marker (price display) to confirm we're expanded before
    // asserting the absence of the description block.
    const priceDisplay = alicePage.getByTestId('raffle-price-display')
    if (!(await priceDisplay.isVisible().catch(() => false))) {
      await raffleCard.click()
    }
    await expect(priceDisplay).toBeVisible({ timeout: 10000 })

    // Description block must not be in the DOM
    await expect(alicePage.locator('[data-testid="raffle-description"]')).toHaveCount(0)

    await aliceCtx.close()
  })
})
