import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates } from '../helpers/auth'

test.describe('Create event', () => {
  test.describe('positive', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('admin can create a public open event', async ({ page, baseURL, createdEvents }) => {
      const name = `Public ${uid()}`

      await page.goto(baseURL!)
      await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('event-create-btn').click()

      await page.getByTestId('event-title-input').fill(name)
      await page.getByTestId('event-location-input').fill('Test Location')

      const dates = futureDates(1)
      await page.getByTestId('event-start-input').fill(dates.start)
      await page.getByTestId('event-end-input').fill(dates.end)

      await expect(page.getByTestId('event-visibility-select')).toHaveValue('Public')
      await expect(page.getByTestId('event-joinmode-select')).toHaveValue('Open')

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/events') && r.request().method() === 'POST'
      )
      await page.getByTestId('event-submit-btn').click()
      const response = await responsePromise
      expect(response.status()).toBe(201)
      const body = await response.json()
      createdEvents.push(body.id)

      await expect(page).toHaveURL(baseURL!, { timeout: 15000 })
    })

    test('admin can create an invite-only event', async ({ page, baseURL, createdEvents }) => {
      const name = `InviteOnly ${uid()}`

      await page.goto(baseURL!)
      await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('event-create-btn').click()

      await page.getByTestId('event-title-input').fill(name)
      await page.getByTestId('event-location-input').fill('Secret Location')

      const dates = futureDates(2, 14)
      await page.getByTestId('event-start-input').fill(dates.start)
      await page.getByTestId('event-end-input').fill(dates.end)
      await page.getByTestId('event-joinmode-select').selectOption('InviteOnly')

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/events') && r.request().method() === 'POST'
      )
      await page.getByTestId('event-submit-btn').click()
      const response = await responsePromise
      expect(response.status()).toBe(201)
      const body2 = await response.json()
      createdEvents.push(body2.id)

      await expect(page).toHaveURL(baseURL!, { timeout: 15000 })
    })

    test('admin can create an event with capacity', async ({ page, baseURL, createdEvents }) => {
      const name = `Capacity ${uid()}`

      await page.goto(baseURL!)
      await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('event-create-btn').click()

      await page.getByTestId('event-title-input').fill(name)
      await page.getByTestId('event-location-input').fill('Small Venue')

      const dates = futureDates(3, 18)
      await page.getByTestId('event-start-input').fill(dates.start)
      await page.getByTestId('event-end-input').fill(dates.end)
      await page.getByTestId('event-capacity-input').fill('5')

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/events') && r.request().method() === 'POST'
      )
      await page.getByTestId('event-submit-btn').click()
      const response = await responsePromise
      expect(response.status()).toBe(201)
      const body3 = await response.json()
      createdEvents.push(body3.id)

      await expect(page).toHaveURL(baseURL!, { timeout: 15000 })
    })
  })

  test.describe('negative', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('submit button is disabled when required fields are empty', async ({ page, baseURL }) => {
      await page.goto(baseURL!)
      await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('event-create-btn').click()

      await expect(page.getByTestId('event-submit-btn')).toBeDisabled()
    })

    test('submit button is disabled when end is before start', async ({ page, baseURL }) => {
      await page.goto(baseURL!)
      await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('event-create-btn').click()

      await page.getByTestId('event-title-input').fill('Bad Dates Event')
      const dates = futureDates(1, 18)
      await page.getByTestId('event-start-input').fill(dates.end)
      await page.getByTestId('event-end-input').fill(dates.start)

      await expect(page.getByTestId('event-submit-btn')).toBeDisabled()
    })
  })

  test.describe('negative - anonymous', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('anonymous user is redirected to login when accessing create event', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/events/create`)
      await expect(page).toHaveURL(/\/realms\/Thuddle\/protocol\/openid-connect\/auth/)
    })
  })
})
