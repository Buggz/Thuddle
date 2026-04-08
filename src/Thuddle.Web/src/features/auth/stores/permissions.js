import { ref, readonly } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '@/shared/composables/useApi'

export const usePermissionsStore = defineStore('permissions', () => {
  const permissions = ref([])
  const loaded = ref(false)

  const { authFetch } = useApi()

  async function load() {
    try {
      const res = await authFetch('/api/profile')
      const data = await res.json()
      permissions.value = data.permissions || []
    } catch {
      permissions.value = []
    } finally {
      loaded.value = true
    }
  }

  function hasPermission(permission) {
    return permissions.value.includes(permission)
  }

  return {
    permissions: readonly(permissions),
    loaded: readonly(loaded),
    load,
    hasPermission
  }
})
