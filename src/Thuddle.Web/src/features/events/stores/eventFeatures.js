import { defineStore } from 'pinia'
import { ref } from 'vue'
import { eventFeatureApi, apiUrl } from '@/api'
import { useApi } from '@/shared/composables/useApi'
import { useRealtime, RealtimeEvents } from '@/shared/composables/useRealtime'
import { useAuthStore } from '@/features/auth/stores/auth'

export const useEventFeaturesStore = defineStore('eventFeatures', () => {
  const { authFetch } = useApi()
  const realtime = useRealtime()
  const auth = useAuthStore()

  // eventId → Set<key>
  const enabledByEvent = ref(new Map())

  // Per-event write-sequence guard — prevents a stale GET from clobbering a
  // newer optimistic or realtime update (mirrors the raffleSeq pattern).
  const eventSeq = new Map()
  function bumpEventSeq(eventId) {
    eventSeq.set(eventId, (eventSeq.get(eventId) ?? 0) + 1)
  }
  function getEventSeq(eventId) {
    return eventSeq.get(eventId) ?? 0
  }

  let realtimeInstalled = false

  // ── Realtime installation ───────────────────────────────────────────────

  function installRealtime() {
    if (realtimeInstalled) return
    realtimeInstalled = true
    realtime.ensureStarted().catch(() => { /* best-effort */ })
    realtime.on(RealtimeEvents.EventFeatureEnabled, applyEnabled)
    realtime.on(RealtimeEvents.EventFeatureDisabled, applyDisabled)
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  async function fetchFeatures(eventId) {
    installRealtime()
    const seqAtStart = getEventSeq(eventId)
    let list
    if (auth.isAuthenticated) {
      list = await eventFeatureApi.list(authFetch, eventId)
    } else {
      const res = await fetch(apiUrl(`/api/events/${eventId}/features`))
      list = res.ok ? await res.json() : []
    }
    if (getEventSeq(eventId) !== seqAtStart) return list
    enabledByEvent.value.set(eventId, new Set(list.map((f) => f.key)))
    return list
  }

  async function enableFeature(eventId, key) {
    const result = await eventFeatureApi.enable(authFetch, eventId, key)
    const existing = enabledByEvent.value.get(eventId) ?? new Set()
    const next = new Set(existing)
    next.add(key)
    enabledByEvent.value.set(eventId, next)
    bumpEventSeq(eventId)
    return result
  }

  async function disableFeature(eventId, key) {
    // Throws on non-OK (e.g. 409 content-orphan). authFetch surfaces data.error.
    await eventFeatureApi.disable(authFetch, eventId, key)
    const existing = enabledByEvent.value.get(eventId)
    if (existing) {
      const next = new Set(existing)
      next.delete(key)
      enabledByEvent.value.set(eventId, next)
      bumpEventSeq(eventId)
    }
  }

  // ── Realtime handlers ───────────────────────────────────────────────────

  function applyEnabled({ eventId, key }) {
    const existing = enabledByEvent.value.get(eventId) ?? new Set()
    const next = new Set(existing)
    next.add(key)
    enabledByEvent.value.set(eventId, next)
    bumpEventSeq(eventId)
  }

  function applyDisabled({ eventId, key }) {
    const existing = enabledByEvent.value.get(eventId)
    if (!existing) return
    const next = new Set(existing)
    next.delete(key)
    enabledByEvent.value.set(eventId, next)
    bumpEventSeq(eventId)
  }

  // ── Getters ─────────────────────────────────────────────────────────────

  function isEnabled(eventId, key) {
    return enabledByEvent.value.get(eventId)?.has(key) ?? false
  }

  return {
    enabledByEvent,
    fetchFeatures,
    enableFeature,
    disableFeature,
    isEnabled,
    applyEnabled,
    applyDisabled,
    installRealtime
  }
})
