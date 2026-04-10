import { ref, readonly } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '@/shared/composables/useApi'

export const usePermissionsStore = defineStore('permissions', () => {
  const permissions = ref([])
  const loaded = ref(false)
  const profileComplete = ref(true)
  const hasDisplayName = ref(true)
  const hasProfilePicture = ref(true)

  const { authFetch } = useApi()

  async function load() {
    try {
      const res = await authFetch('/api/profile')
      const data = await res.json()
      permissions.value = data.permissions || []
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

  function markProfilePictureUploaded() {
    hasProfilePicture.value = true
  }

  return {
    permissions: readonly(permissions),
    loaded: readonly(loaded),
    profileComplete: readonly(profileComplete),
    hasDisplayName: readonly(hasDisplayName),
    hasProfilePicture: readonly(hasProfilePicture),
    load,
    hasPermission,
    markProfileComplete,
    markProfilePictureUploaded
  }
})
