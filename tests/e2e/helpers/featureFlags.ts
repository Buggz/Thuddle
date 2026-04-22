import type { Page } from '@playwright/test'

export type FeatureFlagName = 'VITE_FEATURE_AUCTIONS' | 'VITE_FEATURE_NOTIFICATIONS'

/**
 * Seeds a feature-flag override into localStorage BEFORE the SPA boots.
 * Must be called before page.goto().
 */
export async function setFeatureFlagOverride(
  page: Page,
  name: FeatureFlagName,
  value: boolean,
): Promise<void> {
  await page.addInitScript(
    ([k, v]) => {
      try {
        window.localStorage.setItem(`thuddle:flag:${k}`, v ? 'true' : 'false')
      } catch {
        /* ignore */
      }
    },
    [name, value] as const,
  )
}

/** Clears any flag overrides for the next navigation. */
export async function clearFeatureFlagOverrides(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      const keys: string[] = []
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('thuddle:flag:')) keys.push(k)
      }
      keys.forEach((k) => window.localStorage.removeItem(k))
    } catch {
      /* ignore */
    }
  })
}
