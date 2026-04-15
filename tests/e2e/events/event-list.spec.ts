import { test, expect } from '@playwright/test'
import { STORAGE_STATE, uid, futureDates, contextAs } from '../helpers/auth'

test.describe('Event list (dashboard)', () => {
  test.describe('positive - anonymous', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('anonymous user can see public events on the dashboard', async ({ page, baseURL }) => {
      await page.goto(baseURL!)
      await expect(page.getByTestId('events-heading')).toBeVisible()
      await expect(page.getByTestId('event-list')).toBeVisible()
    })
  })

  test.describe('positive - authenticated', () => {
    test.use({ storageState: STORAGE_STATE.alice })

    test('authenticated user can see events on the dashboard', async ({ page, baseURL }) => {
      await page.goto(baseURL!)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
      await expect(page.getByTestId('events-heading')).toBeVisible()
      await expect(page.getByTestId('event-list')).toBeVisible()
    })
  })

  test('event detail page renders after create', async ({ browser, baseURL }) => {
    const name = `Detail ${uid()}`

    // Create event as admin
    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await adminPage.goto(baseURL!)
    await adminPage.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
    await adminPage.getByTestId('event-create-btn').click()

    await adminPage.getByTestId('event-title-input').fill(name)
    await adminPage.getByTestId('event-location-input').fill('Detail Location')

    const dates = futureDates(5)
    await adminPage.getByTestId('event-start-input').fill(dates.start)
    await adminPage.getByTestId('event-end-input').fill(dates.end)

    const responsePromise = adminPage.waitForResponse(
      (r) => r.url().includes('/api/events') && r.request().method() === 'POST'
    )
    await adminPage.getByTestId('event-submit-btn').click()
    const response = await responsePromise
    const body = await response.json()
    const eventId = body.id

    // Navigate directly to event detail
    await adminPage.goto(`${baseURL}/events/${eventId}`)
    await expect(adminPage.getByTestId('event-title')).toHaveText(name)

    await adminCtx.close()
  })
})
