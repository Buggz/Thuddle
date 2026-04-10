import { ref, readonly } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '@/shared/composables/useApi'

export const usePermissionsStore = defineStore('permissions', () => {
  const permissions = ref([])
  const loaded = ref(false)
  const profileComplete = ref(true)

  const { authFetch } = useApi()

  async function load() {
    try {
      const res = await authFetch('/api/profile')
      const data = await res.json()
      permissions.value = data.permissions || []
      profileComplete.value = !!data.displayName
    } catch {
      permissions.value = []
      profileComplete.value = true
    } finally {
      loaded.value = true
    }
  }

  function hasPermission(permission) {
    return permissions.value.includes(permission)
  }

  function markProfileComplete() {
    profileComplete.value = true
  }

  return {
    permissions: readonly(permissions),
    loaded: readonly(loaded),
    profileComplete: readonly(profileComplete),
    load,
    hasPermission,
    markProfileComplete
  }
})
