import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, uid, futureDates, contextAs } from '../helpers/auth'

/** Admin creates a public open event and returns its URL + id. */
async function createEvent(
  browser: import('@playwright/test').Browser,
  baseURL: string,
): Promise<{ eventUrl: string; eventId: string }> {
  const title = `Participants ${uid()}`
  const { context, page } = await contextAs(browser, 'admin')

  await page.goto(baseURL)
  await page.getByTestId('event-create-btn').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('event-create-btn').click()

  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-location-input').fill('Participants Venue')

  const dates = futureDates(7)
  await page.getByTestId('event-start-input').fill(dates.start)
  await page.getByTestId('event-end-input').fill(dates.end)

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/api/events') && r.request().method() === 'POST',
  )
  await page.getByTestId('event-submit-btn').click()
  const resp = await responsePromise
  const body = await resp.json()

  await context.close()
  return { eventUrl: `${baseURL}/events/${body.id}`, eventId: body.id }
}

test.describe('Participants tab', () => {
  test('shows empty state when no one has joined', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)

    const { context, page } = await contextAs(browser, 'alice')
    await page.goto(eventUrl)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    await page.getByTestId('event-tab-attendees').click()
    await expect(page.getByTestId('participants-empty')).toBeVisible()

    await context.close()
  })

  test('shows participant after user joins event', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Alice joins
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    await aliceCtx.close()

    // Bob visits the event and checks the attendees tab
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await bobPage.goto(eventUrl)
    await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    await bobPage.getByTestId('event-tab-attendees').click()

    await expect(bobPage.getByTestId('participants-list')).toBeVisible()
    const items = bobPage.getByTestId('participant-item')
    await expect(items).toHaveCount(1)

    await bobCtx.close()
  })

  test('participant count badge updates after joining', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)

    const { context, page } = await contextAs(browser, 'alice')
    await page.goto(eventUrl)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    // Count should be 0 before joining
    await expect(page.getByTestId('event-tab-attendees')).toContainText('0')

    // Join
    await page.getByTestId('event-join-btn').click()
    await expect(page.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    // Count should now be 1
    await expect(page.getByTestId('event-tab-attendees')).toContainText('1')

    await context.close()
  })

  test('multiple participants appear in the list', async ({ browser, baseURL, createdEvents }) => {
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Alice joins
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    await aliceCtx.close()

    // Bob joins
    const { context: bobCtx, page: bobPage } = await contextAs(browser, 'bob')
    await bobPage.goto(eventUrl)
    await bobPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await bobPage.getByTestId('event-join-btn').click()
    await expect(bobPage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    await bobCtx.close()

    // Charlie views the attendees tab
    const { context: charlieCtx, page: charliePage } = await contextAs(browser, 'charlie')
    await charliePage.goto(eventUrl)
    await charliePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    await charliePage.getByTestId('event-tab-attendees').click()

    await expect(charliePage.getByTestId('participants-list')).toBeVisible()
    await expect(charliePage.getByTestId('participant-item')).toHaveCount(2)

    await charlieCtx.close()
  })

  test('anonymous user can view participants on public event', async ({ page, baseURL, createdEvents }) => {
    // Need an event with a participant — use admin context for setup, then anonymous page
    const browser = page.context().browser()!
    const { eventUrl, eventId } = await createEvent(browser, baseURL!)
    createdEvents.push(eventId)

    // Alice joins
    const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
    await alicePage.goto(eventUrl)
    await alicePage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })
    await alicePage.getByTestId('event-join-btn').click()
    await expect(alicePage.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })
    await aliceCtx.close()

    // Anonymous user views the event
    const anonContext = await browser.newContext()
    const anonPage = await anonContext.newPage()
    await anonPage.goto(eventUrl)
    await anonPage.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 20000 })

    await anonPage.getByTestId('event-tab-attendees').click()
    await expect(anonPage.getByTestId('participants-list')).toBeVisible()
    await expect(anonPage.getByTestId('participant-item')).toHaveCount(1)

    await anonContext.close()
  })
})
