/**
 * Slugged event URLs (issue #5, task 4).
 *
 * Verifies the user-visible contract:
 *   - POST /api/events returns a slug derived from the title.
 *   - GET /api/events/by-slug/{slug} resolves the event detail page.
 *   - Title collisions get -2/-3 suffixes.
 *   - Diacritics and punctuation are stripped/folded.
 *   - Visiting /events/{guid} transparently replaces the URL with the slug.
 *   - Renaming an event re-derives the slug.
 *
 * The slugify algorithm itself is covered by C# unit tests; this spec only
 * asserts the contract surface end-to-end.
 */
import { test, expect } from '../helpers/fixtures'
import { uid } from '../helpers/auth'
import { adminApi, createEventApi, updateEventApi } from '../helpers/api'
import { eventUrl } from '../helpers/events'

test.describe('events · slugged URLs', () => {
  test('slug is derived from a simple title', async ({ browser, baseURL, createdEvents }) => {
    const tag = uid()
    const title = `Oslo Summer Con ${tag}`
    const api = await adminApi(browser, baseURL!)
    try {
      const evt = await createEventApi(api, { title })
      createdEvents.push(evt.id)

      // Slug is derived from the title (lower-case + hyphenated). The unique
      // tag suffix means we don't need to fight collisions from past runs.
      const expected = `oslo-summer-con-${tag.toLowerCase()}`
      expect(evt.slug).toBe(expected)
    } finally {
      await api.close()
    }
  })

  test('slug URL loads the event detail page', async ({ browser, baseURL, createdEvents }) => {
    const tag = uid()
    const title = `Slug Nav ${tag}`
    const api = await adminApi(browser, baseURL!)
    let slug = ''
    try {
      const evt = await createEventApi(api, { title })
      createdEvents.push(evt.id)
      slug = evt.slug
    } finally {
      await api.close()
    }

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      await page.goto(eventUrl(baseURL!, slug))
      await expect(page.getByTestId('event-detail')).toBeVisible({ timeout: 15000 })
      await expect(page.getByTestId('event-title')).toHaveText(title)
      expect(page.url()).toContain(`/events/${slug}`)
    } finally {
      await ctx.close()
    }
  })

  test('duplicate titles get -2 (and beyond) discriminators, both URLs resolve', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const tag = uid()
    const title = `Twins ${tag}`
    const api = await adminApi(browser, baseURL!)
    let firstSlug = ''
    let secondSlug = ''
    let firstTitle = ''
    let secondTitle = ''
    try {
      const first = await createEventApi(api, { title })
      createdEvents.push(first.id)
      firstSlug = first.slug
      firstTitle = first.title

      const second = await createEventApi(api, { title })
      createdEvents.push(second.id)
      secondSlug = second.slug
      secondTitle = second.title
    } finally {
      await api.close()
    }

    expect(firstSlug).not.toBe(secondSlug)
    expect(secondSlug).toBe(`${firstSlug}-2`)

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      await page.goto(eventUrl(baseURL!, firstSlug))
      await expect(page.getByTestId('event-title')).toHaveText(firstTitle)

      await page.goto(eventUrl(baseURL!, secondSlug))
      await expect(page.getByTestId('event-title')).toHaveText(secondTitle)
    } finally {
      await ctx.close()
    }
  })

  test('diacritics and punctuation are folded out of the slug', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const tag = uid()
    const title = `Café & Co. — ${tag}!`
    const api = await adminApi(browser, baseURL!)
    let slug = ''
    try {
      const evt = await createEventApi(api, { title })
      createdEvents.push(evt.id)
      slug = evt.slug
    } finally {
      await api.close()
    }

    // Don't pin the exact transformation — just the user-visible invariants.
    expect(slug).toBe(slug.toLowerCase())
    expect(slug.length).toBeGreaterThan(0)
    expect(slug.length).toBeLessThanOrEqual(80)
    // Hyphenated word characters only — no diacritics, no punctuation, no spaces.
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    // The unique tag (alphanumeric) survives, proving the title was actually used.
    expect(slug).toContain(tag.toLowerCase())
    // The strippable bits should be gone.
    expect(slug).not.toMatch(/[é&.!—]/)
  })

  test('visiting /events/{guid} redirects to the slug URL', async ({
    browser,
    baseURL,
    createdEvents,
  }) => {
    const tag = uid()
    const title = `Redirect ${tag}`
    const api = await adminApi(browser, baseURL!)
    let id = ''
    let slug = ''
    try {
      const evt = await createEventApi(api, { title })
      createdEvents.push(evt.id)
      id = evt.id
      slug = evt.slug
    } finally {
      await api.close()
    }

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      // eventUrl() with a guid intentionally hits the legacy redirect shim.
      await page.goto(eventUrl(baseURL!, id))
      await page.waitForURL(`**/events/${slug}`, { timeout: 10000 })
      await expect(page.getByTestId('event-detail')).toBeVisible()
      expect(page.url()).not.toContain(id)
    } finally {
      await ctx.close()
    }
  })

  test('renaming an event re-derives the slug', async ({ browser, baseURL, createdEvents }) => {
    const tag = uid()
    const original = `Original ${tag}`
    const renamed = `Renamed ${tag}`
    const api = await adminApi(browser, baseURL!)
    try {
      const evt = await createEventApi(api, { title: original })
      createdEvents.push(evt.id)
      const originalSlug = evt.slug
      expect(originalSlug).toContain('original')

      await updateEventApi(api, evt.id, { title: renamed })

      const resp = await api.request.get(`${api.baseURL}/api/events/${evt.id}`, {
        headers: api.headers,
      })
      expect(resp.ok()).toBeTruthy()
      const body = await resp.json()
      expect(body.slug).not.toBe(originalSlug)
      expect(body.slug).toContain('renamed')
    } finally {
      await api.close()
    }
  })
})
