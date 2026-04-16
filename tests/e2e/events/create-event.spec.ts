import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates, pastDates } from '../helpers/auth'

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

      await expect(page.getByTestId('event-visibility-select')).toHaveValue('0')
      await expect(page.getByTestId('event-joinmode-select')).toHaveValue('0')

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
      await page.getByTestId('event-joinmode-select').selectOption('1')

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

    test('admin can create an event with a cost', async ({ page, baseURL, createdEvents }) => {
      const name = `Paid ${uid()}`

      await page.goto(baseURL!)
      await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('event-create-btn').click()

      await page.getByTestId('event-title-input').fill(name)
      await page.getByTestId('event-location-input').fill('Paid Venue')

      const dates = futureDates(3, 14)
      await page.getByTestId('event-start-input').fill(dates.start)
      await page.getByTestId('event-end-input').fill(dates.end)
      await page.getByTestId('event-cost-input').fill('25.50')

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
      )
      await page.getByTestId('event-submit-btn').click()
      const response = await responsePromise
      expect(response.status()).toBe(201)
      const body = await response.json()
      createdEvents.push(body.id)
      expect(body.cost).toBe(25.5)

      // Verify cost shows on the event detail page
      await page.goto(`${baseURL}/events/${body.id}`)
      await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })
      await expect(page.getByTestId('event-detail')).toContainText('25.5')
    })

    test('event created without cost defaults to free', async ({ page, baseURL, createdEvents }) => {
      const name = `Free ${uid()}`

      await page.goto(baseURL!)
      await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('event-create-btn').click()

      await page.getByTestId('event-title-input').fill(name)
      await page.getByTestId('event-location-input').fill('Free Venue')

      const dates = futureDates(4, 10)
      await page.getByTestId('event-start-input').fill(dates.start)
      await page.getByTestId('event-end-input').fill(dates.end)

      // Leave cost empty
      await expect(page.getByTestId('event-cost-input')).toHaveValue('')

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
      )
      await page.getByTestId('event-submit-btn').click()
      const response = await responsePromise
      expect(response.status()).toBe(201)
      const body = await response.json()
      createdEvents.push(body.id)
      expect(body.cost).toBeNull()
    })

    test('admin can create an event with a description', async ({ page, baseURL, createdEvents }) => {
      const name = `Described ${uid()}`
      const descText = `This is a test description ${uid()}`

      await page.goto(baseURL!)
      await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('event-create-btn').click()

      await page.getByTestId('event-title-input').fill(name)
      await page.getByTestId('event-location-input').fill('Description Venue')

      // Type into the WYSIWYG editor
      const editor = page.getByTestId('event-description-editor').locator('.ProseMirror')
      await editor.click()
      await editor.fill(descText)

      const dates = futureDates(4, 10)
      await page.getByTestId('event-start-input').fill(dates.start)
      await page.getByTestId('event-end-input').fill(dates.end)

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/events') && r.request().method() === 'POST'
      )
      await page.getByTestId('event-submit-btn').click()
      const response = await responsePromise
      expect(response.status()).toBe(201)
      const body = await response.json()
      createdEvents.push(body.id)
      expect(body.description).toContain(descText)

      // Verify description on the event detail page
      await page.goto(`${baseURL}/events/${body.id}`)
      await expect(page.getByTestId('event-description')).toContainText(descText, { timeout: 10000 })
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

    test('submit button is disabled when start is in the past', async ({ page, baseURL }) => {
      await page.goto(baseURL!)
      await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
      await page.getByTestId('event-create-btn').click()

      await page.getByTestId('event-title-input').fill('Past Event')
      const past = pastDates(3)
      await page.getByTestId('event-start-input').fill(past.start)
      await page.getByTestId('event-end-input').fill(past.end)

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
