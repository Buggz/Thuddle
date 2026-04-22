import { ref, readonly, computed } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '@/shared/composables/useApi'

export const usePermissionsStore = defineStore('permissions', () => {
    // Ensure user exists in DB on first login
    async function ensureUserInitialized() {
      try {
        await authFetch('/api/profile/init', { method: 'POST' })
      } catch {
        // Ignore errors (user may already exist or be unauthorized)
      }
    }
  const permissions = ref([])
  const loaded = ref(false)
  const profileComplete = ref(true)
  const hasDisplayName = ref(true)
  const profilePictureUrl = ref(null)
  const displayName = ref('')
  const userId = ref(null)

  const hasProfilePicture = computed(() => !!profilePictureUrl.value)

  const { authFetch } = useApi()

  async function load() {
    try {
      await ensureUserInitialized()
      const res = await authFetch('/api/profile')
      const data = await res.json()
      permissions.value = data.permissions || []
      displayName.value = data.displayName || ''
      hasDisplayName.value = !!data.displayName
      profilePictureUrl.value = data.profilePictureUrl || null
      profileComplete.value = hasDisplayName.value
      userId.value = data.id || null
    } catch {
      permissions.value = []
      profileComplete.value = true
      hasDisplayName.value = true
      profilePictureUrl.value = null
      userId.value = null
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

  function markProfilePictureUploaded(url) {
    profilePictureUrl.value = url
  }

  return {
    permissions: readonly(permissions),
    loaded: readonly(loaded),
    profileComplete: readonly(profileComplete),
    hasDisplayName: readonly(hasDisplayName),
    hasProfilePicture,
    profilePictureUrl: readonly(profilePictureUrl),
    displayName: readonly(displayName),
    userId: readonly(userId),
    load,
    hasPermission,
    markProfileComplete,
    updateDisplayName,
    markProfilePictureUploaded,
    ensureUserInitialized
  }
})
