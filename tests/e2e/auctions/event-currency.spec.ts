import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates } from '../helpers/auth'
import { adminApi, createEventApi, getAuctionSettingsApi } from '../helpers/auction'

test.describe('Event currency', () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test('pick NOK from currency select → cost displays with NOK', async ({
    page,
    baseURL,
    browser,
    createdEvents,
  }) => {
    const name = `Currency ${uid()}`

    await page.goto(baseURL!)
    await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
    await page.getByTestId('event-create-btn').click()

    await page.getByTestId('event-title-input').fill(name)
    await page.getByTestId('event-location-input').fill('Oslo')

    const dates = futureDates(5)
    await page.getByTestId('event-start-input').fill(dates.start)
    await page.getByTestId('event-end-input').fill(dates.end)
    await page.getByTestId('event-cost-input').fill('100')

    // Select NOK
    await page.getByTestId('event-currency-select').selectOption('NOK')

    const createResp = page.waitForResponse(
      (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
    )
    await page.getByTestId('event-submit-btn').click()
    const resp = await createResp
    expect(resp.status()).toBe(201)
    const body = await resp.json()
    createdEvents.push(body.id)

    // Verify cost on event page shows NOK
    await page.goto(`${baseURL}/events/${body.id}`)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await expect(page.getByTestId('event-detail')).toContainText('NOK')
  })

  test('switch to Custom currency (SEK) → cost displays with SEK', async ({
    page,
    baseURL,
    browser,
    createdEvents,
  }) => {
    // Create event with default currency first
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { cost: 50, currency: 'EUR' })
    createdEvents.push(eventId)
    await api.close()

    // Edit the event — switch to custom currency
    await page.goto(`${baseURL}/events/${eventId}/manage`)
    await page.getByTestId('event-title-input').waitFor({ state: 'visible', timeout: 20000 })

    // Select Custom
    await page.getByTestId('event-currency-select').selectOption('Custom')
    await page.getByTestId('event-currency-custom-input').waitFor({ state: 'visible' })
    await page.getByTestId('event-currency-custom-input').fill('SEK')

    const saveResp = page.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}`) && r.request().method() === 'PUT',
    )
    await page.getByTestId('event-submit-btn').click()
    const resp = await saveResp
    expect(resp.ok()).toBeTruthy()

    // Verify cost on event page shows SEK
    await page.goto(`${baseURL}/events/${eventId}`)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
    await expect(page.getByTestId('event-detail')).toContainText('SEK')
  })

  test('auction settings page shows currency from event, no currency picker on settings', async ({
    page,
    baseURL,
    browser,
    createdEvents,
  }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api, { currency: 'SEK' })
    createdEvents.push(eventId)
    await api.close()

    await page.goto(`${baseURL}/events/${eventId}/auction/settings`)
    await page.getByTestId('auction-settings-form').waitFor({ state: 'visible', timeout: 20000 })

    // Should display "SEK" somewhere on the settings page
    await expect(page.getByTestId('auction-settings-form')).toContainText('SEK')

    // There should be NO currency picker on the auction settings form
    await expect(page.getByTestId('event-currency-select')).not.toBeVisible({ timeout: 2000 })
  })
})
