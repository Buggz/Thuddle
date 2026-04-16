import { test, expect } from '@playwright/test'
import { STORAGE_STATE, uid, contextAs } from '../helpers/auth'
import path from 'path'

test.describe('Profile', () => {
  test.describe('positive - display name', () => {
    test.use({ storageState: STORAGE_STATE.alice })

    test('user can view profile page', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/profile`)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

      await expect(page.getByTestId('profile-heading')).toHaveText('Profile')
      await expect(page.getByTestId('profile-displayname-input')).toBeVisible()
      await expect(page.getByTestId('profile-displayname-save-btn')).toBeVisible()
    })

    test('save button is disabled when name has not changed', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/profile`)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

      await expect(page.getByTestId('profile-displayname-save-btn')).toBeDisabled()
    })

    test('user can update display name', async ({ page, baseURL }) => {
      const newName = `Alice ${uid()}`

      await page.goto(`${baseURL}/profile`)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

      await page.getByTestId('profile-displayname-input').fill(newName)
      await expect(page.getByTestId('profile-displayname-save-btn')).toBeEnabled()

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/profile/displayname') && r.request().method() === 'PUT',
      )
      await page.getByTestId('profile-displayname-save-btn').click()
      const response = await responsePromise
      expect(response.status()).toBe(200)

      await expect(page.getByTestId('profile-success-msg')).toContainText('Display name saved')
      await expect(page.getByTestId('profile-displayname-save-btn')).toBeDisabled()
    })
  })

  test.describe('positive - profile picture', () => {
    test('user can upload a profile picture', async ({ browser, baseURL }) => {
      const { context, page } = await contextAs(browser, 'bob')
      await page.goto(`${baseURL}/profile`)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

      // Set a file on the hidden file input
      const filePath = path.join(__dirname, '..', 'helpers', 'test-avatar.png')
      await page.getByTestId('profile-picture-upload').setInputFiles(filePath)

      // Cropper dialog should appear
      await expect(page.getByTestId('cropper-crop-btn')).toBeVisible({ timeout: 5000 })

      const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/profile/picture') && r.request().method() === 'POST',
      )
      await page.getByTestId('cropper-crop-btn').click()
      const response = await responsePromise
      expect(response.status()).toBe(200)

      await expect(page.getByTestId('profile-success-msg')).toContainText('Profile picture uploaded')
      await expect(page.getByTestId('profile-picture-img')).toBeVisible()

      await context.close()
    })

    test('user can cancel the crop dialog', async ({ browser, baseURL }) => {
      const { context, page } = await contextAs(browser, 'charlie')
      await page.goto(`${baseURL}/profile`)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

      const filePath = path.join(__dirname, '..', 'helpers', 'test-avatar.png')
      await page.getByTestId('profile-picture-upload').setInputFiles(filePath)

      await expect(page.getByTestId('cropper-crop-btn')).toBeVisible({ timeout: 5000 })
      await page.getByTestId('cropper-cancel-btn').click()

      // Cropper should be gone
      await expect(page.getByTestId('cropper-crop-btn')).not.toBeVisible()

      await context.close()
    })
  })

  test.describe('negative - anonymous', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('anonymous user is redirected to Keycloak when accessing /profile', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/profile`)
      await expect(page).toHaveURL(/\/realms\/Thuddle\/protocol\/openid-connect\/auth/)
    })
  })

  test.describe('negative - validation', () => {
    test.use({ storageState: STORAGE_STATE.charlie })

    test('save button enables when display name is changed', async ({ page, baseURL }) => {
      await page.goto(`${baseURL}/profile`)
      await page.getByTestId('user-display-name').waitFor({ state: 'visible', timeout: 20000 })

      // Wait for profile data to load (input gets populated)
      await expect(page.getByTestId('profile-displayname-save-btn')).toBeDisabled({ timeout: 10000 })

      // Changing it enables the button
      const current = await page.getByTestId('profile-displayname-input').inputValue()
      await page.getByTestId('profile-displayname-input').fill(current + 'x')
      await expect(page.getByTestId('profile-displayname-save-btn')).toBeEnabled()
    })
  })
})
