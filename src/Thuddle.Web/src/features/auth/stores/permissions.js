import { ref, readonly } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '@/shared/composables/useApi'

export const usePermissionsStore = defineStore('permissions', () => {
    // Ensure user exists in DB on first login
    async function ensureUserInitialized() {
      try {
        await authFetch('/api/profile/init', { method: 'POST' })
      } catch (e) {
        // Ignore errors (user may already exist or be unauthorized)
      }
    }
  const permissions = ref([])
  const loaded = ref(false)
  const profileComplete = ref(true)
  const hasDisplayName = ref(true)
  const hasProfilePicture = ref(true)
  const displayName = ref('')

  const { authFetch } = useApi()

  async function load() {
    try {
      await ensureUserInitialized()
      const res = await authFetch('/api/profile')
      const data = await res.json()
      permissions.value = data.permissions || []
      displayName.value = data.displayName || ''
      hasDisplayName.value = !!data.displayName
      hasProfilePicture.value = !!data.hasProfilePicture
      profileComplete.value = hasDisplayName.value
    } catch {
      permissions.value = []
      profileComplete.value = true
      hasDisplayName.value = true
      hasProfilePicture.value = true
    } finally {
      loaded.value = true
    }
  }

  function hasPermission(permission) {
    return permissions.value.includes(permission)
  }

  function markProfileComplete() {
    profileComplete.value = true
    hasDisplayName.value = true
  }

  function updateDisplayName(name) {
    displayName.value = name
    hasDisplayName.value = !!name
    profileComplete.value = hasDisplayName.value
  }

  function markProfilePictureUploaded() {
    hasProfilePicture.value = true
  }

  return {
    permissions: readonly(permissions),
    loaded: readonly(loaded),
    profileComplete: readonly(profileComplete),
    hasDisplayName: readonly(hasDisplayName),
    hasProfilePicture: readonly(hasProfilePicture),
    displayName: readonly(displayName),
    load,
    hasPermission,
    markProfileComplete,
    updateDisplayName,
    markProfilePictureUploaded,
    ensureUserInitialized
  }
})
