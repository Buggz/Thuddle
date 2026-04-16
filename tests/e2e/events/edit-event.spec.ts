import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates, contextAs } from '../helpers/auth'

/**
 * Admin creates a public open event and returns its manage URL + id.
 */
async function createEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventId: string; manageUrl: string; eventUrl: string }> {
  const title = `Edit ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Original Location')

  const dates = futureDates(5)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await responsePromise
  const body = await resp.json()

  await context.close()
  return {
    eventId: body.id,
    manageUrl: `${baseURL}/events/${body.id}/manage`,
    eventUrl: `${baseURL}/events/${body.id}`,
  }
}

/** Navigate to the manage page and wait for the About tab to load. */
async function goToManageAbout(page: import('@playwright/test').Page, manageUrl: string) {
  await page.goto(manageUrl)
  await page.getByTestId('manage-tab-about').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('manage-tab-about').click()
  await page.getByTestId('manage-title-input').waitFor({ state: 'visible', timeout: 10000 })
}

test.describe('Edit event details', () => {
  test.describe('positive', () => {
    test('owner can update event title', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl, eventUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const newTitle = `Updated ${uid()}`
      const { context, page } = await contextAs(browser, 'admin')
      await goToManageAbout(page, manageUrl)

      await page.getByTestId('manage-title-input').clear()
      await page.getByTestId('manage-title-input').fill(newTitle)

      const saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-save-btn').click()
      const resp = await saveResp
      expect(resp.status()).toBe(200)

      await expect(page.getByTestId('manage-save-success')).toBeVisible({ timeout: 5000 })

      // Verify the updated title is reflected on the event page
      await page.goto(eventUrl)
      await expect(page.getByTestId('event-title')).toHaveText(newTitle, { timeout: 10000 })

      await context.close()
    })

    test('owner can update location', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const newLocation = `New Venue ${uid()}`
      const { context, page } = await contextAs(browser, 'admin')
      await goToManageAbout(page, manageUrl)

      await page.getByTestId('manage-location-input').clear()
      await page.getByTestId('manage-location-input').fill(newLocation)

      const saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-save-btn').click()
      const resp = await saveResp
      expect(resp.status()).toBe(200)

      await expect(page.getByTestId('manage-save-success')).toBeVisible({ timeout: 5000 })

      await context.close()
    })

    test('owner can update dates', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const newDates = futureDates(10, 14)
      const { context, page } = await contextAs(browser, 'admin')
      await goToManageAbout(page, manageUrl)

      await page.getByTestId('manage-start-input').fill(newDates.start)
      await page.getByTestId('manage-end-input').fill(newDates.end)

      const saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-save-btn').click()
      const resp = await saveResp
      expect(resp.status()).toBe(200)

      await expect(page.getByTestId('manage-save-success')).toBeVisible({ timeout: 5000 })

      await context.close()
    })

    test('owner can change visibility to unlisted', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToManageAbout(page, manageUrl)

      await page.getByTestId('manage-visibility-select').selectOption('1') // Unlisted

      // Join mode should auto-switch to InviteOnly when unlisted
      await expect(page.getByTestId('manage-joinmode-select')).toBeDisabled()

      const saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-save-btn').click()
      const resp = await saveResp
      expect(resp.status()).toBe(200)

      await expect(page.getByTestId('manage-save-success')).toBeVisible({ timeout: 5000 })

      await context.close()
    })

    test('owner can set capacity and cost', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const { context, page } = await contextAs(browser, 'admin')
      await goToManageAbout(page, manageUrl)

      await page.getByTestId('manage-capacity-input').fill('25')
      await page.getByTestId('manage-cost-input').fill('9.99')

      const saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-save-btn').click()
      const resp = await saveResp
      expect(resp.status()).toBe(200)
      const body = await resp.json()
      expect(body.capacity).toBe(25)
      expect(body.cost).toBe(9.99)

      await expect(page.getByTestId('manage-save-success')).toBeVisible({ timeout: 5000 })

      await context.close()
    })

    test('owner can update multiple fields at once', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl, eventUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const newTitle = `Multi ${uid()}`
      const newLocation = `Multi Venue ${uid()}`
      const newDates = futureDates(7, 16)

      const { context, page } = await contextAs(browser, 'admin')
      await goToManageAbout(page, manageUrl)

      await page.getByTestId('manage-title-input').clear()
      await page.getByTestId('manage-title-input').fill(newTitle)
      await page.getByTestId('manage-location-input').clear()
      await page.getByTestId('manage-location-input').fill(newLocation)
      await page.getByTestId('manage-start-input').fill(newDates.start)
      await page.getByTestId('manage-end-input').fill(newDates.end)
      await page.getByTestId('manage-capacity-input').fill('50')

      const saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-save-btn').click()
      const resp = await saveResp
      expect(resp.status()).toBe(200)
      const body = await resp.json()
      expect(body.title).toBe(newTitle)
      expect(body.capacity).toBe(50)

      await expect(page.getByTestId('manage-save-success')).toBeVisible({ timeout: 5000 })

      // Verify on event detail page
      await page.goto(eventUrl)
      await expect(page.getByTestId('event-title')).toHaveText(newTitle, { timeout: 10000 })

      await context.close()
    })

    test('saved changes persist after page reload', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const newTitle = `Persist ${uid()}`
      const { context, page } = await contextAs(browser, 'admin')
      await goToManageAbout(page, manageUrl)

      await page.getByTestId('manage-title-input').clear()
      await page.getByTestId('manage-title-input').fill(newTitle)

      const saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('manage-save-btn').click()
      await saveResp
      await expect(page.getByTestId('manage-save-success')).toBeVisible({ timeout: 5000 })

      // Reload and verify the value stuck
      await page.reload()
      await page.getByTestId('manage-title-input').waitFor({ state: 'visible', timeout: 10000 })
      await expect(page.getByTestId('manage-title-input')).toHaveValue(newTitle)

      await context.close()
    })
  })

  test.describe('negative', () => {
    test('non-owner cannot access manage page', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      // Alice (non-owner) tries to access the manage page
      const { context, page } = await contextAs(browser, 'alice')
      await page.goto(manageUrl)

      // Should not see the manage form — expect error or redirect
      await expect(page.getByTestId('manage-title-input')).not.toBeVisible({ timeout: 10000 })

      await context.close()
    })

    test('anonymous user is redirected to login when accessing manage page', async ({ browser, baseURL, createdEvents }) => {
      const { eventId, manageUrl } = await createEvent(browser, baseURL!)
      createdEvents.push(eventId)

      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const page = await context.newPage()
      await page.goto(manageUrl)

      // Should be redirected to Keycloak login
      await expect(page).toHaveURL(/\/realms\/Thuddle\/protocol\/openid-connect\/auth/, { timeout: 15000 })

      await context.close()
    })
  })
})
