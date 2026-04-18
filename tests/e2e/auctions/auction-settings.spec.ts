import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, contextAs, uid, futureDates, formatLocal } from '../helpers/auth'
import {
  adminApi,
  createEventApi,
  configureAuctionApi,
  startAuctionApi,
  type ApiContext,
} from '../helpers/auction'

test.describe('Auction settings', () => {
  // ── Positive: admin configures auction settings ──────────────────────────

  test.describe('admin configuration', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('admin enables auction and settings persist after reload', async ({
      page,
      baseURL,
      browser,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id: eventId } = await createEventApi(api)
      createdEvents.push(eventId)
      await api.close()

      // Navigate to auction settings
      await page.goto(`${baseURL}/events/${eventId}/auction/settings`)
      await page.getByTestId('auction-settings-form').waitFor({ state: 'visible', timeout: 20000 })

      // Fill schedule
      const now = new Date()
      const startsAt = new Date(now.getTime() + 3_600_000) // +1h
      const endsAt = new Date(now.getTime() + 7_200_000) // +2h
      await page.getByTestId('auction-starts-at').fill(formatLocal(startsAt))
      await page.getByTestId('auction-latest-ends-at').fill(formatLocal(endsAt))

      // Set min increment
      await page.getByTestId('auction-min-increment-input').fill('5')

      // Submission mode: AllAttendees
      await page.getByTestId('auction-submission-mode-all').click()

      // Enable buyout
      await page.getByTestId('auction-allow-buyout-toggle').check()

      // Enable anonymous history
      await page.getByTestId('auction-anonymous-history-toggle').check()

      // Save
      const saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}/auction`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('auction-settings-save-btn').click()
      const resp = await saveResp
      expect(resp.ok()).toBeTruthy()

      // Reload and verify persistence
      await page.reload()
      await page.getByTestId('auction-settings-form').waitFor({ state: 'visible', timeout: 20000 })

      await expect(page.getByTestId('auction-min-increment-input')).toHaveValue('5')
      await expect(page.getByTestId('auction-allow-buyout-toggle')).toBeChecked()
      await expect(page.getByTestId('auction-anonymous-history-toggle')).toBeChecked()
    })
  })

  // ── Negative: non-admin denied ───────────────────────────────────────────

  test.describe('non-admin denied', () => {
    test('non-admin cannot access auction settings page', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      // Admin creates an event
      const api = await adminApi(browser, baseURL!)
      const { id: eventId } = await createEventApi(api)
      createdEvents.push(eventId)
      await api.close()

      // Alice (non-admin for this event) tries to access settings
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(`${baseURL}/events/${eventId}/auction/settings`)
      await alicePage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

      // The settings form should not be visible; either 403 or redirect away
      await expect(alicePage.getByTestId('auction-settings-form')).not.toBeVisible({ timeout: 5000 })

      // Direct API call from Alice also returns 403
      const aliceApi = await import('../helpers/auction').then((m) => m.userApi(browser, 'alice', baseURL!))
      const resp = await aliceApi.request.put(`${aliceApi.baseURL}/api/events/${eventId}/auction`, {
        headers: aliceApi.headers,
        data: JSON.stringify({
          enabled: true,
          status: 1,
          startsAt: new Date().toISOString(),
          latestEndsAt: new Date(Date.now() + 3_600_000).toISOString(),
          veiledCloseWindow: '00:05:00',
          submissionMode: 2,
          itemModerationPolicy: 1,
          minBidIncrement: 1,
          allowBuyout: false,
          anonymousBidHistory: false,
        }),
      })
      expect(resp.status()).toBe(403)

      await aliceApi.close()
      await aliceCtx.close()
    })
  })

  // ── Veiled window validation ─────────────────────────────────────────────

  test.describe('veiled window validation', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('veiled window > half auction length shows error and disables save', async ({
      page,
      baseURL,
      browser,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id: eventId } = await createEventApi(api)
      createdEvents.push(eventId)
      await api.close()

      await page.goto(`${baseURL}/events/${eventId}/auction/settings`)
      await page.getByTestId('auction-settings-form').waitFor({ state: 'visible', timeout: 20000 })

      // 1h auction (3600s) → max veil is 1800s
      const now = new Date()
      const startsAt = new Date(now.getTime() + 3_600_000)
      const endsAt = new Date(now.getTime() + 7_200_000)
      await page.getByTestId('auction-starts-at').fill(formatLocal(startsAt))
      await page.getByTestId('auction-latest-ends-at').fill(formatLocal(endsAt))
      await page.getByTestId('auction-min-increment-input').fill('1')

      // Enter veil > half the duration (e.g. 2000s for 3600s auction)
      await page.getByTestId('auction-veiled-window-input').fill('2000')
      await expect(page.getByTestId('auction-veil-validation-error')).toBeVisible()
      await expect(page.getByTestId('auction-settings-save-btn')).toBeDisabled()

      // Reduce to valid value (1800s = half)
      await page.getByTestId('auction-veiled-window-input').fill('1800')
      await expect(page.getByTestId('auction-veil-validation-error')).not.toBeVisible()
      await expect(page.getByTestId('auction-settings-save-btn')).toBeEnabled()
    })
  })

  // ── After start, most fields lock ────────────────────────────────────────

  test.describe('fields lock after auction starts', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('live auction locks most fields but allows anonymous history + moderation', async ({
      page,
      baseURL,
      browser,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id: eventId } = await createEventApi(api)
      createdEvents.push(eventId)

      // Configure and start
      const now = new Date()
      await configureAuctionApi(api, eventId, {
        startsAt: new Date(now.getTime() - 1000).toISOString(),
        latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
      })
      await startAuctionApi(api, eventId)
      await api.close()

      await page.goto(`${baseURL}/events/${eventId}/auction/settings`)
      await page.getByTestId('auction-settings-form').waitFor({ state: 'visible', timeout: 20000 })

      // Schedule fields should be disabled
      await expect(page.getByTestId('auction-starts-at')).toBeDisabled()
      await expect(page.getByTestId('auction-latest-ends-at')).toBeDisabled()
      await expect(page.getByTestId('auction-min-increment-input')).toBeDisabled()
      await expect(page.getByTestId('auction-allow-buyout-toggle')).toBeDisabled()

      // These remain editable while live
      await expect(page.getByTestId('auction-anonymous-history-toggle')).toBeEnabled()
      await expect(page.getByTestId('auction-moderation-policy')).toBeEnabled()
    })
  })
})
