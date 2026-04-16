import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates, contextAs } from '../helpers/auth'

/** Helper: admin creates a public open event and returns the event URL. */
async function createPublicEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  name: string,
): Promise<{ eventUrl: string; eventId: string }> {
  const { context, page } = await contextAs(browser, 'admin')
  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(name)
  await page.getByTestId('event-location-input').fill('Open Venue')

  const dates = futureDates(4)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const response = await responsePromise
  const body = await response.json()
  const eventUrl = `${baseURL}/events/${body.id}`

  await context.close()
  return { eventUrl, eventId: body.id }
}

/** Helper: admin creates an invite-only event and returns the event URL. */
async function createInviteOnlyEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
  name: string,
): Promise<{ eventUrl: string; eventId: string }> {
  const { context, page } = await contextAs(browser, 'admin')
  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(name)
  await page.getByTestId('event-location-input').fill('Private Venue')

  const dates = futureDates(6, 16)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)
  await page.getByTestId('event-joinmode-select').selectOption('1')

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const response = await responsePromise
  const body = await response.json()
  const eventUrl = `${baseURL}/events/${body.id}`

  await context.close()
  return { eventUrl, eventId: body.id }
}

test.describe('Join event', () => {
  test.describe('positive', () => {
    test('authenticated user can join a public open event', async ({ browser, baseURL, createdEvents }) => {
      const name = `Join ${uid()}`
      const { eventUrl, eventId } = await createPublicEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      // Alice joins
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(eventUrl)
      await alicePage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

      await alicePage.getByTestId('event-join-btn').click()
      await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

      await aliceCtx.close()
    })
  })

  test.describe('negative', () => {
    test('anonymous user sees disabled join button', async ({ browser, baseURL, createdEvents }) => {
      const name = `AnonJoin ${uid()}`
      const { eventUrl, eventId } = await createPublicEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const page = await context.newPage()
      await page.goto(eventUrl)

      await expect(page.getByTestId('event-join-btn-disabled')).toBeVisible()

      await context.close()
    })

    test('uninvited user sees invite-only message', async ({ browser, baseURL, createdEvents }) => {
      const name = `InvOnly ${uid()}`
      const { eventUrl, eventId } = await createInviteOnlyEvent(browser, baseURL!, name)
      createdEvents.push(eventId)

      // Bob (not invited) visits
      const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
      await bobPage.goto(eventUrl)
      await bobPage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

      await expect(bobPage.getByTestId('event-invite-only-msg')).toBeVisible()

      await bobCtx.close()
    })
  })
})
