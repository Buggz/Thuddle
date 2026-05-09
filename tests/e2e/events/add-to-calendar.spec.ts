import { test, expect } from '../helpers/fixtures'
import { contextAs, uid } from '../helpers/auth'
import {
  adminApi,
  userApi,
  createEventApi,
  enableEventFeature,
  createActivityApi,
} from '../helpers/api'
import { gotoActivitiesTab } from '../helpers/events'

/**
 * "Add to Calendar" feature — issue #?? (client-side ICS generation).
 *
 * Tests are split read/write style:
 *   • Visibility tests verify the v-if guards (no joining/signing-up — set up state via API).
 *   • Download tests drive the GUI to click the button, capture the download via Playwright,
 *     and assert the produced ICS body conforms to RFC 5545 essentials.
 *
 * No backend endpoint is involved; the button creates a Blob via a temp <a download>.
 */

// ── ICS parsing helpers (kept local — Columbo's pocket notebook) ──────────────

/** Unfold RFC 5545 line continuations: a CRLF followed by a single space/tab. */
function unfoldIcs(text: string): string {
  return text.replace(/\r\n[ \t]/g, '')
}

/**
 * Extract the raw value of a single-line ICS field (after unfolding).
 * Returns null when the field is absent.
 */
function extractField(text: string, fieldName: string): string | null {
  const unfolded = unfoldIcs(text)
  const re = new RegExp('^' + fieldName + ':(.*)$', 'm')
  const m = unfolded.match(re)
  return m ? m[1].replace(/\r$/, '') : null
}

test.describe('Add to calendar', () => {
  // ── Event button ──────────────────────────────────────────────────────────

  test('event button is hidden before the user joins', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const adminCtxApi = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(adminCtxApi, {
      title: `AddCal Hidden ${uid()}`,
    })
    createdEvents.push(eventId)
    await adminCtxApi.close()

    const { context, page } = await contextAs(browser, 'alice')
    await page.goto(`${baseURL}/events/${eventId}`)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })

    // v-if guard means the element should not be in the DOM at all.
    await expect(page.getByTestId('event-add-to-calendar-btn')).toHaveCount(0)

    await context.close()
  })

  test('event button appears after joining and downloads a valid ICS file', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const title = `AddCal Join ${uid()}`
    const location = `Venue ${uid()}`

    const adminCtxApi = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(adminCtxApi, { title, location })
    createdEvents.push(eventId)
    await adminCtxApi.close()

    const { context, page } = await contextAs(browser, 'alice')
    await page.goto(`${baseURL}/events/${eventId}`)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })

    // Hidden before join.
    await expect(page.getByTestId('event-add-to-calendar-btn')).toHaveCount(0)

    // Join via GUI; wait for state to settle.
    await page.getByTestId('event-join-btn').click()
    await expect(page.getByTestId('event-joined-badge')).toBeVisible({ timeout: 10000 })

    const calendarBtn = page.getByTestId('event-add-to-calendar-btn')
    await expect(calendarBtn).toBeVisible({ timeout: 10000 })

    // Trigger and capture the download.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      calendarBtn.click(),
    ])

    // Filename matches the documented pattern.
    expect(download.suggestedFilename()).toMatch(
      /^thuddle-event-[0-9a-fA-F-]{36}\.ics$/,
    )

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString('utf-8')

    // Must use CRLF line endings per RFC 5545.
    expect(body).toContain('\r\n')

    // Required envelope/structure tokens.
    for (const needle of [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Thuddle//Add to Calendar//EN',
      'BEGIN:VEVENT',
      'UID:event-',
      'DTSTAMP:',
      'DTSTART:',
      'DTEND:',
      `SUMMARY:${title}`,
      `LOCATION:${location}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]) {
      expect(unfoldIcs(body)).toContain(needle)
    }

    const dtStart = extractField(body, 'DTSTART')
    const dtEnd = extractField(body, 'DTEND')
    expect(dtStart).toMatch(/^\d{8}T\d{6}Z$/)
    expect(dtEnd).toMatch(/^\d{8}T\d{6}Z$/)

    await context.close()
  })

  // ── Activity button ───────────────────────────────────────────────────────

  test('activity button is hidden before the user signs up', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const adminCtxApi = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(adminCtxApi, {
      title: `AddCal Act Hidden ${uid()}`,
      location: 'Hidden Hall',
    })
    createdEvents.push(eventId)
    await enableEventFeature(adminCtxApi, eventId, 'activities')
    const { id: activityId } = await createActivityApi(adminCtxApi, eventId, {
      title: `Workshop ${uid()}`,
      maxParticipants: 4,
    })
    await adminCtxApi.close()

    // Alice joins via API so she can see the Activities tab, but does NOT sign up.
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    const joinResp = await aliceApi.request.post(
      `${aliceApi.baseURL}/api/events/${eventId}/join`,
      { headers: aliceApi.headers },
    )
    expect(joinResp.ok()).toBeTruthy()
    await aliceApi.close()

    const { context, page } = await contextAs(browser, 'alice')
    await gotoActivitiesTab(page, baseURL!, eventId)
    await expect(page.getByTestId(`activity-card-${activityId}`)).toBeVisible({
      timeout: 10000,
    })

    await expect(
      page.getByTestId(`activity-add-to-calendar-btn-${activityId}`),
    ).toHaveCount(0)

    await context.close()
  })

  test('activity button appears after signup and downloads ICS with parent event location', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const eventLocation = `Parent Venue ${uid()}`
    const activityTitle = `Workshop ${uid()}`

    const adminCtxApi = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(adminCtxApi, {
      title: `AddCal Act ${uid()}`,
      location: eventLocation,
    })
    createdEvents.push(eventId)
    await enableEventFeature(adminCtxApi, eventId, 'activities')
    const { id: activityId } = await createActivityApi(adminCtxApi, eventId, {
      title: activityTitle,
      maxParticipants: 4,
    })
    await adminCtxApi.close()

    // Alice joins event via API; she'll sign up to the activity via GUI.
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    const joinResp = await aliceApi.request.post(
      `${aliceApi.baseURL}/api/events/${eventId}/join`,
      { headers: aliceApi.headers },
    )
    expect(joinResp.ok()).toBeTruthy()
    await aliceApi.close()

    const { context, page } = await contextAs(browser, 'alice')
    await gotoActivitiesTab(page, baseURL!, eventId)

    const card = page.getByTestId(`activity-card-${activityId}`)
    await expect(card).toBeVisible({ timeout: 10000 })

    await page.getByTestId(`activity-signup-button-${activityId}`).click()
    await expect(page.getByTestId(`activity-withdraw-button-${activityId}`)).toBeVisible({
      timeout: 10000,
    })

    const calendarBtn = page.getByTestId(`activity-add-to-calendar-btn-${activityId}`)
    await expect(calendarBtn).toBeVisible({ timeout: 10000 })

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      calendarBtn.click(),
    ])

    expect(download.suggestedFilename()).toMatch(
      /^thuddle-activity-[0-9a-fA-F-]{36}\.ics$/,
    )

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString('utf-8')
    const unfolded = unfoldIcs(body)

    for (const needle of [
      'BEGIN:VEVENT',
      `UID:activity-${activityId}@thuddle.app`,
      `SUMMARY:${activityTitle}`,
      `LOCATION:${eventLocation}`,
    ]) {
      expect(unfolded).toContain(needle)
    }

    await context.close()
  })

  // ── HTML stripping in DESCRIPTION ────────────────────────────────────────

  test('event description HTML is stripped & entities decoded in the ICS', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const title = `AddCal HTMLDesc ${uid()}`
    const description =
      '<p>Hello <strong>world</strong> &amp; friends</p><br/>Line 2'

    const adminCtxApi = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(adminCtxApi, {
      title,
      description,
      location: 'HTML Hall',
    })
    createdEvents.push(eventId)
    await adminCtxApi.close()

    // Alice joins via API to expose the button without re-testing the join flow.
    const aliceApi = await userApi(browser, baseURL!, 'alice')
    const joinResp = await aliceApi.request.post(
      `${aliceApi.baseURL}/api/events/${eventId}/join`,
      { headers: aliceApi.headers },
    )
    expect(joinResp.ok()).toBeTruthy()
    await aliceApi.close()

    const { context, page } = await contextAs(browser, 'alice')
    await page.goto(`${baseURL}/events/${eventId}`)
    await page.getByTestId('event-detail').waitFor({ state: 'visible', timeout: 15000 })

    const calendarBtn = page.getByTestId('event-add-to-calendar-btn')
    await expect(calendarBtn).toBeVisible({ timeout: 10000 })

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      calendarBtn.click(),
    ])

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString('utf-8')
    const unfolded = unfoldIcs(body)

    const descValue = extractField(body, 'DESCRIPTION')
    expect(descValue, 'DESCRIPTION line should be present').not.toBeNull()

    // Words from inside the HTML survive.
    for (const word of ['Hello', 'world', 'friends', 'Line 2']) {
      expect(descValue!).toContain(word)
    }

    // No raw tag characters anywhere in the unfolded DESCRIPTION line.
    expect(descValue).not.toMatch(/[<>]/)

    // &amp; was decoded to & (or its ICS-escaped form — never the raw entity).
    expect(descValue).not.toContain('&amp;')
    // Either a literal '&' or the escaped ',' separator should NOT contain &amp;
    expect(unfolded).not.toContain('&amp;')

    await context.close()
  })
})
