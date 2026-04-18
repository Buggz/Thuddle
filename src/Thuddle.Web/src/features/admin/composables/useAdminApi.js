import { ref } from 'vue'
import { useApi } from '@/shared/composables/useApi'

const entries = ref([])
const knownPermissions = ref([])
const loaded = ref(false)

export function useAdminApi() {
  const { authFetch } = useApi()

  async function loadPermissions() {
    const [permsResp, knownResp] = await Promise.all([
      authFetch('/api/admin/permissions'),
      authFetch('/api/admin/permissions/known'),
    ])
    entries.value = await permsResp.json()
    knownPermissions.value = await knownResp.json()
    loaded.value = true
  }

  async function grantPermission(email, permission) {
    await authFetch('/api/admin/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, permission }),
    })
    await loadPermissions()
  }

  async function revokePermission(userId, permission) {
    await authFetch(`/api/admin/permissions/${userId}/${encodeURIComponent(permission)}`, {
      method: 'DELETE',
    })
    await loadPermissions()
  }

  return {
    entries,
    knownPermissions,
    loaded,
    loadPermissions,
    grantPermission,
    revokePermission,
  }
}
