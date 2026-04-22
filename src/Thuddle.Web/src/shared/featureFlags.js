import { computed } from 'vue'

const envFlag = (name) =>
  (import.meta.env[name] ?? 'false').toString().toLowerCase() === 'true'

export function useFeatureFlags() {
  return {
    auctions: computed(() => envFlag('VITE_FEATURE_AUCTIONS')),
    notifications: computed(() => envFlag('VITE_FEATURE_NOTIFICATIONS'))
  }
}
