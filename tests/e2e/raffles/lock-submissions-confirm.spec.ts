import { test, expect } from '../helpers/fixtures'
import { contextAs, uid, getAuthHeadersFromPage } from '../helpers/auth'
import { adminApi, createEventApi, createRaffleApi , enableEventFeature } from '../helpers/api'
import { gotoManageRafflesTab } from '../helpers/events'

/**
 * Test file: Lock User Submissions confirmation dialog.
 *
 * Locking submissions is a one-way gate from the host's perspective, so the
 * action is now wrapped in a ConfirmDialog (warning variant). These tests
 * verify the confirm and cancel paths and that no PATCH fires on cancel.
 */

test.describe('Lock User Submissions confirmation', () => {
  test('cancel keeps selfReporting enabled and fires no PATCH', async ({ browser, baseURL, createdEvents }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `CancelLock ${uid()}`,
      allowSelfReport: true,
    })
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    const { headers: adminHeaders } = await getAuthHeadersFromPage(adminPage, baseURL!)
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    const lockBtn = adminPage.getByTestId('raffle-lock-submissions-btn')
    await expect(lockBtn).toBeVisible()

    // Track any PATCH attempts to the raffle endpoint
    let patchSeen = false
    adminPage.on('request', (req) => {
      if (req.method() === 'PATCH' && req.url().includes(`/api/events/${eventId}/raffles/${raffleId}`)) {
        patchSeen = true
      }
    })

    await lockBtn.click()
    const cancelBtn = adminPage.getByTestId('confirm-dialog-cancel')
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()

    // Dialog should be gone and lock button still present
    await expect(adminPage.getByTestId('confirm-dialog-cancel')).toBeHidden()
    await expect(lockBtn).toBeVisible()

    // Give any rogue PATCH a moment to fire (should not happen)
    await adminPage.waitForTimeout(250)
    expect(patchSeen).toBe(false)

    // Verify via API that selfReporting is still on
    const verifyResp = await adminPage.request.get(
      `${baseURL}/api/events/${eventId}/raffles/${raffleId}`,
      { headers: adminHeaders },
    )
    const verifyBody = (await verifyResp.json()) as { selfReportingEnabled: boolean }
    expect(verifyBody.selfReportingEnabled).toBe(true)

    await adminCtx.close()
  })

  test('confirm locks submissions and replaces lock button with Open Draw Stage', async ({ browser, baseURL, createdEvents }) => {
    const api = await adminApi(browser, baseURL!)
    const { id: eventId } = await createEventApi(api)
    createdEvents.push(eventId)
    await enableEventFeature(api, eventId, 'raffles')
    const { id: raffleId } = await createRaffleApi(api, eventId, {
      name: `ConfirmLock ${uid()}`,
      allowSelfReport: true,
    })
    await api.close()

    const { context: adminCtx, page: adminPage } = await contextAs(browser, 'admin')
    await gotoManageRafflesTab(adminPage, baseURL!, eventId)

    const lockBtn = adminPage.getByTestId('raffle-lock-submissions-btn')
    await expect(lockBtn).toBeVisible()
    await lockBtn.click()

    const confirmBtn = adminPage.getByTestId('confirm-dialog-confirm')
    await expect(confirmBtn).toBeVisible()

    const patchResp = adminPage.waitForResponse(
      (r) => r.url().includes(`/api/events/${eventId}/raffles/${raffleId}`) && r.request().method() === 'PATCH',
    )
    await confirmBtn.click()
    const patchResult = await patchResp
    expect(patchResult.status()).toBe(200)

    // After locking, the showLock branch flips off → lock button gone, Open Draw Stage shown
    await expect(adminPage.getByTestId('raffle-lock-submissions-btn')).toBeHidden()
    await expect(adminPage.getByTestId('raffle-draw-stage-btn')).toBeVisible()

    await adminCtx.close()
  })
})
