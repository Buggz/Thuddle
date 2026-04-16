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
    const resp = await authFetch('/api/admin/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, permission }),
    })
    const data = await resp.json()
    entries.value.push({
      userId: data.id,
      email: data.email,
      displayName: data.displayName,
      permission: data.permission,
      grantedAt: new Date().toISOString(),
    })
    entries.value.sort((a, b) => a.email.localeCompare(b.email) || a.permission.localeCompare(b.permission))
    return data
  }

  async function revokePermission(userId, permission) {
    await authFetch(`/api/admin/permissions/${userId}/${encodeURIComponent(permission)}`, {
      method: 'DELETE',
    })
    entries.value = entries.value.filter(
      (e) => !(e.userId === userId && e.permission === permission),
    )
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
