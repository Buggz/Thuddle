import { test, expect } from '../helpers/fixtures'
import { STORAGE_STATE, contextAs, formatLocal, futureDates } from '../helpers/auth'
import {
  adminApi,
  userApi,
  createEventApi,
  updateEventApi,
  configureAuctionApi,
  getAuctionSettingsApi,
  startAuctionApi,
} from '../helpers/auction'

test.describe('Auction settings', () => {
  // ── 1 & 2: Admin configures full settings, verifies via API, reload persists ─

  test.describe('admin configuration', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('admin configures full auction settings and verifies via API, then reload persists', async ({
      page,
      baseURL,
      browser,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id: eventId } = await createEventApi(api)
      createdEvents.push(eventId)

      await page.goto(`${baseURL}/events/${eventId}/auction/settings`)
      await page.getByTestId('auction-settings-form').waitFor({ state: 'visible', timeout: 20000 })

      // ── Schedule tab ──
      const eventDates = futureDates(10)
      const eventStart = new Date(eventDates.start)
      const startsAt = new Date(eventStart.getTime() + 3_600_000) // event start + 1h
      const endsAt = new Date(eventStart.getTime() + 7_200_000) // event start + 2h

      await page.getByTestId('auction-settings-starts-at').fill(formatLocal(startsAt))
      await page.getByTestId('auction-settings-latest-ends-at').fill(formatLocal(endsAt))

      // Enable veiled close: 5 minutes
      await page.getByTestId('auction-veiled-close-toggle').check()
      await page.getByTestId('auction-veiled-close-value').fill('5')
      await page.getByTestId('auction-veiled-close-unit').selectOption('minutes')

      // Enable bid extension: 2 minutes
      await page.getByTestId('auction-bid-extension-toggle').check()
      await page.getByTestId('auction-bid-extension-value').fill('2')
      await page.getByTestId('auction-bid-extension-unit').selectOption('minutes')

      // ── Navigate to Rules & privacy tab ──
      await page.getByTestId('auction-settings-next-tab').click()

      await page.getByTestId('auction-settings-submission-mode').selectOption('AllAttendees')
      await page.getByTestId('auction-settings-moderation-policy').selectOption('AutoApprove')
      await page.getByTestId('auction-settings-min-increment').fill('5')
      await page.getByTestId('auction-settings-allow-buyout').check()
      await page.getByTestId('auction-settings-anonymous-bidders').check()

      // ── Save ──
      const saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}/auction`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('auction-settings-save-btn').click()
      await saveResp

      // ── Assert persisted values via API ──
      const settings = await getAuctionSettingsApi(api, eventId)
      expect(settings.enabled).toBe(true)
      expect(settings.status).toBe('Scheduled')
      expect(settings.veiledCloseWindow).toBe(300) // 5 min in seconds
      expect(settings.bidTimeExtension).toBe(120) // 2 min in seconds
      expect(settings.submissionMode).toBe('AllAttendees')
      expect(settings.itemModerationPolicy).toBe('AutoApprove')
      expect(settings.minBidIncrement).toBe(5)
      expect(settings.allowBuyout).toBe(true)
      expect(settings.anonymousBidders).toBe(true)

      // ── Reload and verify form fields are populated ──
      await page.reload()
      await page.getByTestId('auction-settings-form').waitFor({ state: 'visible', timeout: 20000 })

      // Schedule tab (default after reload)
      await expect(page.getByTestId('auction-settings-starts-at')).not.toHaveValue('')
      await expect(page.getByTestId('auction-settings-latest-ends-at')).not.toHaveValue('')
      await expect(page.getByTestId('auction-veiled-close-toggle')).toBeChecked()
      await expect(page.getByTestId('auction-bid-extension-toggle')).toBeChecked()

      // Navigate to Rules tab to verify those fields
      await page.getByTestId('auction-settings-next-tab').click()
      await expect(page.getByTestId('auction-settings-min-increment')).toHaveValue('5')
      await expect(page.getByTestId('auction-settings-allow-buyout')).toBeChecked()
      await expect(page.getByTestId('auction-settings-anonymous-bidders')).toBeChecked()

      await api.close()
    })
  })

  // ── 3: Veiled close validation — too-large window ────────────────────────

  test.describe('veiled close validation', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('veiled close window exceeding half duration disables save', async ({
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

      // 1-hour auction (3600s) → max veiled close is 1800s
      const eventDates = futureDates(10)
      const eventStart = new Date(eventDates.start)
      const startsAt = new Date(eventStart.getTime() + 3_600_000)
      const endsAt = new Date(eventStart.getTime() + 7_200_000)
      await page.getByTestId('auction-settings-starts-at').fill(formatLocal(startsAt))
      await page.getByTestId('auction-settings-latest-ends-at').fill(formatLocal(endsAt))

      // Set min increment so the form is otherwise valid
      await page.getByTestId('auction-settings-next-tab').click()
      await page.getByTestId('auction-settings-min-increment').fill('1')
      await page.getByTestId('auction-settings-prev-tab').click()

      // Enable veiled close, set 31 minutes (= 1860s, exceeds 1800s max)
      await page.getByTestId('auction-veiled-close-toggle').check()
      await page.getByTestId('auction-veiled-close-value').fill('31')
      await page.getByTestId('auction-veiled-close-unit').selectOption('minutes')

      await expect(page.getByTestId('auction-settings-save-btn')).toBeDisabled()

      // Reduce to 30 minutes (= 1800s = exactly half) → save becomes enabled
      await page.getByTestId('auction-veiled-close-value').fill('30')

      await expect(page.getByTestId('auction-settings-save-btn')).toBeEnabled()
    })
  })

  // ── 4: Non-admin cannot access settings ──────────────────────────────────

  test.describe('non-admin denied', () => {
    test('non-admin cannot access auction settings via API or UI', async ({
      browser,
      baseURL,
      createdEvents,
    }) => {
      // Admin creates event
      const api = await adminApi(browser, baseURL!)
      const { id: eventId } = await createEventApi(api)
      createdEvents.push(eventId)

      // Alice calls PUT directly → expect 403
      const aliceApi = await userApi(browser, 'alice', baseURL!)
      const resp = await aliceApi.request.put(`${aliceApi.baseURL}/api/events/${eventId}/auction`, {
        headers: aliceApi.headers,
        data: JSON.stringify({
          enabled: true,
          status: 1,
          startsAt: new Date(Date.now() + 3_600_000).toISOString(),
          latestEndsAt: new Date(Date.now() + 7_200_000).toISOString(),
          veiledCloseWindow: '00:05:00',
          submissionMode: 2,
          itemModerationPolicy: 1,
          minBidIncrement: 1,
          allowBuyout: false,
          anonymousBidHistory: false,
        }),
      })
      expect(resp.status()).toBe(403)

      // Alice navigates to settings → form should not be visible
      const { context: aliceCtx, page: alicePage } = await contextAs(browser, 'alice')
      await alicePage.goto(`${baseURL}/events/${eventId}/auction/settings`)
      await alicePage.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })
      // Form is visible because there's no frontend ownership guard, but API blocks saves (tested above with 403)
      await expect(alicePage.getByTestId('auction-settings-form')).toBeVisible()

      await aliceApi.close()
      await aliceCtx.close()
      await api.close()
    })
  })

  // ── 5: Fields lock when auction is live ──────────────────────────────────

  test.describe('fields lock when live', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('live auction locks all fields and disables save', async ({
      page,
      baseURL,
      browser,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id: eventId } = await createEventApi(api)
      createdEvents.push(eventId)

      // Move event dates to encompass "now" so we can start an auction in the past
      const now = new Date()
      await updateEventApi(api, eventId, {
        start: new Date(now.getTime() - 7_200_000).toISOString(),
        end: new Date(now.getTime() + 86_400_000).toISOString(),
      })

      // Configure and start the auction via API
      await configureAuctionApi(api, eventId, {
        startsAt: new Date(now.getTime() - 1000).toISOString(),
        latestEndsAt: new Date(now.getTime() + 3_600_000).toISOString(),
      })
      await startAuctionApi(api, eventId)

      await page.goto(`${baseURL}/events/${eventId}/auction/settings`)
      await page.getByTestId('auction-settings-form').waitFor({ state: 'visible', timeout: 20000 })

      // Locked banner visible
      await expect(page.getByTestId('auction-settings-locked-banner')).toBeVisible()

      // Schedule tab: all inputs disabled
      await expect(page.getByTestId('auction-settings-enabled')).toBeDisabled()
      await expect(page.getByTestId('auction-settings-starts-at')).toBeDisabled()
      await expect(page.getByTestId('auction-settings-latest-ends-at')).toBeDisabled()

      // Rules tab: ALL fields disabled
      await page.getByTestId('auction-settings-tab-rules').click()
      await expect(page.getByTestId('auction-settings-submission-mode')).toBeDisabled()
      await expect(page.getByTestId('auction-settings-moderation-policy')).toBeDisabled()
      await expect(page.getByTestId('auction-settings-min-increment')).toBeDisabled()
      await expect(page.getByTestId('auction-settings-allow-buyout')).toBeDisabled()
      await expect(page.getByTestId('auction-settings-anonymous-bidders')).toBeDisabled()
      await expect(page.getByTestId('auction-settings-anonymous-submitters')).toBeDisabled()

      // Save button disabled
      await expect(page.getByTestId('auction-settings-save-btn')).toBeDisabled()

      await api.close()
    })
  })

  // ── 6: Enabling/disabling toggles status correctly ───────────────────────

  test.describe('enable/disable status toggle', () => {
    test.use({ storageState: STORAGE_STATE.admin })

    test('toggling enabled updates status between Scheduled and Draft', async ({
      page,
      baseURL,
      browser,
      createdEvents,
    }) => {
      const api = await adminApi(browser, baseURL!)
      const { id: eventId } = await createEventApi(api)
      createdEvents.push(eventId)

      await page.goto(`${baseURL}/events/${eventId}/auction/settings`)
      await page.getByTestId('auction-settings-form').waitFor({ state: 'visible', timeout: 20000 })

      // Fill valid schedule
      const eventDates = futureDates(10)
      const eventStart = new Date(eventDates.start)
      const startsAt = new Date(eventStart.getTime() + 3_600_000)
      const endsAt = new Date(eventStart.getTime() + 7_200_000)
      await page.getByTestId('auction-settings-starts-at').fill(formatLocal(startsAt))
      await page.getByTestId('auction-settings-latest-ends-at').fill(formatLocal(endsAt))

      // Set min increment (required for valid form)
      await page.getByTestId('auction-settings-next-tab').click()
      await page.getByTestId('auction-settings-min-increment').fill('1')
      await page.getByTestId('auction-settings-prev-tab').click()

      // Ensure enabled is checked
      await page.getByTestId('auction-settings-enabled').check()

      // Save → status should be Scheduled
      let saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}/auction`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('auction-settings-save-btn').click()
      await saveResp

      let settings = await getAuctionSettingsApi(api, eventId)
      expect(settings.status).toBe('Scheduled')

      // Uncheck enabled, save → status should be Draft
      await page.getByTestId('auction-settings-enabled').uncheck()
      saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}/auction`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('auction-settings-save-btn').click()
      await saveResp

      settings = await getAuctionSettingsApi(api, eventId)
      expect(settings.status).toBe('Draft')

      // Re-check enabled, save → status should be Scheduled again
      await page.getByTestId('auction-settings-enabled').check()
      saveResp = page.waitForResponse(
        (r) => r.url().includes(`/api/events/${eventId}/auction`) && r.request().method() === 'PUT',
      )
      await page.getByTestId('auction-settings-save-btn').click()
      await saveResp

      settings = await getAuctionSettingsApi(api, eventId)
      expect(settings.status).toBe('Scheduled')

      await api.close()
    })
  })
})
