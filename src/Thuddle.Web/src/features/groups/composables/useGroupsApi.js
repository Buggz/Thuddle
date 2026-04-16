import { ref } from 'vue'
import { useApi } from '@/shared/composables/useApi'

/**
 * Shared reactive cache of the current user's contact groups.
 * Any component that reads/writes groups through `useGroupsApi` sees the same list,
 * so adding a user in one place reflects in every open popover.
 */
const groups = ref([])
const loaded = ref(false)
const loading = ref(false)

export function useGroupsApi() {
  const { authFetch } = useApi()

  async function load(force = false) {
    if (loading.value) return
    if (loaded.value && !force) return
    loading.value = true
    try {
      const res = await authFetch('/api/groups')
      groups.value = await res.json()
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  async function createGroup(name, userIds = []) {
    const res = await authFetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, userIds })
    })
    const data = await res.json()
    await load(true)
    return data
  }

  async function renameGroup(id, name) {
    const res = await authFetch(`/api/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    const data = await res.json()
    const existing = groups.value.find(g => g.id === id)
    if (existing) existing.name = data.name
    return data
  }

  async function deleteGroup(id) {
    await authFetch(`/api/groups/${id}`, { method: 'DELETE' })
    groups.value = groups.value.filter(g => g.id !== id)
  }

  async function addMembers(groupId, userIds) {
    const res = await authFetch(`/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds })
    })
    const data = await res.json()
    await load(true)
    return data
  }

  async function removeMember(groupId, userId) {
    await authFetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
    const group = groups.value.find(g => g.id === groupId)
    if (group) {
      group.members = (group.members || []).filter(m => m.userId !== userId)
      group.memberCount = group.members.length
    }
  }

  async function importAttendees(groupId, eventId) {
    const res = await authFetch(`/api/groups/${groupId}/import-attendees/${eventId}`, {
      method: 'POST'
    })
    const data = await res.json()
    await load(true)
    return data
  }

  function reset() {
    groups.value = []
    loaded.value = false
  }

  return {
    groups,
    loaded,
    loading,
    load,
    createGroup,
    renameGroup,
    deleteGroup,
    addMembers,
    removeMember,
    importAttendees,
    reset
  }
}
