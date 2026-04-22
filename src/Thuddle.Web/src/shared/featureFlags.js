import { computed } from 'vue'

const localFlag = (name) => {
  try {
    const stored = window.localStorage.getItem(`thuddle:flag:${name}`)
    const lower = (stored ?? '').toLowerCase()
    if (lower === 'true' || lower === 'false') return lower
  } catch {
    // localStorage unavailable (e.g. private mode) — fall through to env
  }
  return null
}

const envFlag = (name) =>
  (localFlag(name) ?? (import.meta.env[name] ?? 'false').toString().toLowerCase()) === 'true'

export function useFeatureFlags() {
  return {
    auctions: computed(() => envFlag('VITE_FEATURE_AUCTIONS')),
    notifications: computed(() => envFlag('VITE_FEATURE_NOTIFICATIONS'))
  }
}
