import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { apiUrl } from '@/api'
import { useApi } from '@/shared/composables/useApi'
import { useAuthStore } from '@/features/auth/stores/auth'
import { useRealtime, RealtimeEvents } from '@/shared/composables/useRealtime'

const DEFAULT_PAGE_SIZE = 12

export const useEventsStore = defineStore('events', () => {
  const { authFetch } = useApi()
  const auth = useAuthStore()

  // Dashboard list
  const items = ref([])
  const page = shallowRef(1)
  const pageSize = shallowRef(DEFAULT_PAGE_SIZE)
  const totalPages = shallowRef(1)
  const loadingDashboard = shallowRef(false)
  const dashboardError = shallowRef(null)

  // Single-event cache
  const byId = ref({})
  const loadingById = ref(new Set())
  const eventError = shallowRef(null)

  let realtimeInstalled = false

  async function fetchJson(path) {
    if (auth.isAuthenticated) {
      const res = await authFetch(path)
      return res.json()
    }
    const res = await fetch(apiUrl(path))
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    return res.json()
  }

  async function loadDashboard({ page: targetPage = page.value, pageSize: size = pageSize.value } = {}) {
    loadingDashboard.value = true
    dashboardError.value = null
    page.value = targetPage
    pageSize.value = size
    try {
      const data = await fetchJson(`/api/events?page=${targetPage}&pageSize=${size}`)
      items.value = data.items
      totalPages.value = data.totalPages
      installRealtime()
    } catch (err) {
      dashboardError.value = err.message || 'Failed to load events.'
    } finally {
      loadingDashboard.value = false
    }
  }

  async function loadEvent(id) {
    if (!id) return null
    loadingById.value.add(id)
    eventError.value = null
    try {
      const data = await fetchJson(`/api/events/${id}`)
      byId.value[id] = data
      installRealtime()
      return data
    } catch (err) {
      eventError.value = err.message || 'Failed to load event.'
      return null
    } finally {
      loadingById.value.delete(id)
    }
  }

  // ── Realtime integration ────────────────────────────────────────────────

  function installRealtime() {
    if (realtimeInstalled) return
    realtimeInstalled = true
    const realtime = useRealtime()
    realtime.ensureStarted().catch(() => { /* best-effort; store still works via REST */ })
    realtime.on(RealtimeEvents.EventCreated, handleEventCreated)
    realtime.on(RealtimeEvents.EventUpdated, handleEventUpdated)
    realtime.on(RealtimeEvents.EventDeleted, handleEventDeleted)
    realtime.on(RealtimeEvents.ParticipantChanged, handleParticipantChanged)
    realtime.on(RealtimeEvents.DiscussionActivity, handleDiscussionActivity)
    realtime.on(RealtimeEvents.InvitationSent, handleInvitationSent)
    realtime.onResync(() => {
      if (items.value.length > 0) loadDashboard({ page: page.value })
      Object.keys(byId.value).forEach((id) => refreshEventInPlace(id))
    })
  }

  async function refreshEventInPlace(id) {
    try {
      const data = await fetchJson(`/api/events/${id}`)
      byId.value[id] = data
      patchListItemFromDetail(id, data)
    } catch { /* ignore transient fetch errors */ }
  }

  // The single-event DTO shape differs from the list item shape; copy only the
  // fields the dashboard renders.
  function patchListItemFromDetail(id, detail) {
    const idx = items.value.findIndex((e) => e.id === id)
    if (idx === -1) return
    const current = items.value[idx]
    items.value.splice(idx, 1, {
      ...current,
      title: detail.title,
      location: detail.location,
      description: detail.description,
      picturePath: detail.picturePath,
      start: detail.start,
      end: detail.end,
      visibility: detail.visibility,
      joinMode: detail.joinMode,
      capacity: detail.capacity,
      cost: detail.cost,
      participantCount: detail.participantCount,
      postCount: detail.postCount,
      hasUnreadDiscussion: detail.hasUnreadDiscussion,
      hasJoined: detail.hasJoined,
      canJoin: detail.canJoin,
      isAdmin: detail.isAdmin,
      pendingPostCount: detail.pendingPostCount
    })
  }

  function handleEventCreated() {
    // A new event may or may not match our visibility filter; safest to reload.
    if (items.value.length > 0 || loadingDashboard.value) {
      loadDashboard({ page: page.value })
    }
  }

  function handleEventUpdated({ eventId }) {
    const inList = items.value.some((e) => e.id === eventId)
    const inCache = byId.value[eventId] != null
    if (inList || inCache) refreshEventInPlace(eventId)
  }

  function handleEventDeleted({ eventId }) {
    const idx = items.value.findIndex((e) => e.id === eventId)
    if (idx !== -1) items.value.splice(idx, 1)
    if (byId.value[eventId]) delete byId.value[eventId]
  }

  function handleParticipantChanged({ eventId, participantCount }) {
    const idx = items.value.findIndex((e) => e.id === eventId)
    if (idx !== -1) {
      const current = items.value[idx]
      items.value.splice(idx, 1, { ...current, participantCount })
    }
    if (byId.value[eventId]) {
      byId.value[eventId] = { ...byId.value[eventId], participantCount }
    }
  }

  function handleDiscussionActivity({ eventId }) {
    // Refetch so server-computed hasUnreadDiscussion & postCount are correct
    // (the read receipt is author-specific).
    if (items.value.some((e) => e.id === eventId) || byId.value[eventId]) {
      refreshEventInPlace(eventId)
    }
  }

  function handleInvitationSent() {
    // A new invitation may have added an event to our visible set.
    if (items.value.length > 0 || loadingDashboard.value) {
      loadDashboard({ page: page.value })
    }
  }

  // ── Optimistic mutations ────────────────────────────────────────────────

  async function joinEvent(eventId) {
    await authFetch(`/api/events/${eventId}/join`, { method: 'POST' })
    const detail = byId.value[eventId]
    if (detail) {
      byId.value[eventId] = {
        ...detail,
        hasJoined: true,
        canJoin: false,
        participantCount: (detail.participantCount ?? 0) + 1
      }
    }
    const idx = items.value.findIndex((e) => e.id === eventId)
    if (idx !== -1) {
      const current = items.value[idx]
      items.value.splice(idx, 1, {
        ...current,
        hasJoined: true,
        canJoin: false,
        participantCount: (current.participantCount ?? 0) + 1
      })
    }
  }

  function markDiscussionRead(eventId) {
    const detail = byId.value[eventId]
    if (detail?.hasUnreadDiscussion) {
      byId.value[eventId] = { ...detail, hasUnreadDiscussion: false }
    }
    const idx = items.value.findIndex((e) => e.id === eventId)
    if (idx !== -1 && items.value[idx].hasUnreadDiscussion) {
      items.value.splice(idx, 1, { ...items.value[idx], hasUnreadDiscussion: false })
    }
  }

  return {
    // state
    items,
    page,
    pageSize,
    totalPages,
    loadingDashboard,
    dashboardError,
    byId,
    eventError,
    // actions
    loadDashboard,
    loadEvent,
    joinEvent,
    markDiscussionRead
  }
})
