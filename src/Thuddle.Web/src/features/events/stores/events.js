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
  // True while a dashboard view is mounted (loadDashboard called, releaseDashboard not yet).
  // Used so realtime EventCreated/InvitationSent still refresh the list when it's empty.
  let dashboardActive = false
  const realtime = useRealtime()

  // Event ids we've asked the hub to subscribe us to, grouped by origin so
  // we can release them independently (e.g. leaving an event page should not
  // unsubscribe dashboard cards for the same event).
  const dashboardSubs = new Set()
  const detailSubs = new Set()

  function syncSubscriptions(nextIds, tracker) {
    const next = new Set(nextIds)
    const toAdd = []
    const toRemove = []
    next.forEach((id) => { if (!tracker.has(id)) toAdd.push(id) })
    tracker.forEach((id) => { if (!next.has(id)) toRemove.push(id) })

    toRemove.forEach((id) => tracker.delete(id))
    toAdd.forEach((id) => tracker.add(id))

    // Only tell the hub to unsubscribe if no other tracker still needs that id.
    const unsubscribable = toRemove.filter((id) => !dashboardSubs.has(id) && !detailSubs.has(id))
    if (unsubscribable.length > 0) realtime.unsubscribeEvents(unsubscribable)
    if (toAdd.length > 0) realtime.subscribeEvents(toAdd)
  }

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
    dashboardActive = true
    loadingDashboard.value = true
    dashboardError.value = null
    page.value = targetPage
    pageSize.value = size
    try {
      const data = await fetchJson(`/api/events?page=${targetPage}&pageSize=${size}`)
      items.value = data.items
      totalPages.value = data.totalPages
      installRealtime()
      syncSubscriptions(items.value.map((e) => e.id), dashboardSubs)
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
      syncSubscriptions([id, ...detailSubs].filter((x, i, arr) => arr.indexOf(x) === i), detailSubs)
      return data
    } catch (err) {
      eventError.value = err.message || 'Failed to load event.'
      return null
    } finally {
      loadingById.value.delete(id)
    }
  }

  /**
   * Call when leaving an event detail view to release its subscription if no
   * dashboard card still needs it.
   */
  function releaseEvent(id) {
    if (!id || !detailSubs.has(id)) return
    syncSubscriptions(Array.from(detailSubs).filter((x) => x !== id), detailSubs)
  }

  /** Release all dashboard-origin subscriptions (e.g. when leaving the dashboard). */
  function releaseDashboard() {
    dashboardActive = false
    if (dashboardSubs.size === 0) return
    syncSubscriptions([], dashboardSubs)
  }

  // ── Realtime integration ────────────────────────────────────────────────

  function installRealtime() {
    if (realtimeInstalled) return
    realtimeInstalled = true
    realtime.ensureStarted().catch(() => { /* best-effort; store still works via REST */ })
    realtime.on(RealtimeEvents.EventCreated, handleEventCreated)
    realtime.on(RealtimeEvents.EventUpdated, handleEventUpdated)
    realtime.on(RealtimeEvents.EventDeleted, handleEventDeleted)
    realtime.on(RealtimeEvents.ParticipantChanged, handleParticipantChanged)
    realtime.on(RealtimeEvents.DiscussionActivity, handleDiscussionActivity)
    realtime.on(RealtimeEvents.InvitationSent, handleInvitationSent)
    realtime.onResync(() => {
      if (dashboardActive) loadDashboard({ page: page.value })
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
    // A new event may or may not match our visibility filter; safest to reload
    // whenever a dashboard view is currently mounted (even if it's empty).
    if (dashboardActive) {
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
    if (dashboardActive) {
      loadDashboard({ page: page.value })
    }
  }

  // ── Optimistic mutations ────────────────────────────────────────────────

  async function joinEvent(eventId) {
    await authFetch(`/api/events/${eventId}/join`, { method: 'POST' })
    // Do NOT bump participantCount optimistically. The server broadcasts an
    // authoritative ParticipantChanged over SignalR, and that frame can arrive
    // *during* the await above. If we then do `count + 1` after the await, we
    // double-count (authoritative 1 + optimistic 1 = 2). `hasJoined`/`canJoin`
    // are viewer-scoped and aren't broadcast, so those we still update locally.
    const detail = byId.value[eventId]
    if (detail) {
      byId.value[eventId] = {
        ...detail,
        hasJoined: true,
        canJoin: false
      }
    }
    const idx = items.value.findIndex((e) => e.id === eventId)
    if (idx !== -1) {
      const current = items.value[idx]
      items.value.splice(idx, 1, {
        ...current,
        hasJoined: true,
        canJoin: false
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
    releaseEvent,
    releaseDashboard,
    joinEvent,
    markDiscussionRead
  }
})
