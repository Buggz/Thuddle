import { defineStore } from 'pinia'
import { ref } from 'vue'
import { activityApi } from '@/api'
import { useApi } from '@/shared/composables/useApi'
import { useRealtime, RealtimeEvents } from '@/shared/composables/useRealtime'
import { useEventFeaturesStore } from '@/features/events/stores/eventFeatures'
import { usePermissionsStore } from '@/features/auth/stores/permissions'

/**
 * Activities store, keyed by activityId.
 *
 * Write-sequence guard: every local cache write to a given activity bumps its
 * counter. Each fetch captures the counter at start and discards its response
 * if a newer write has landed in the meantime. Mirrors the pattern from raffles.js.
 *
 * No synchronous self-calls to realtime handlers from actions — avoids the
 * double-fetch race documented in raffles.js comments.
 */
export const useActivitiesStore = defineStore('activities', () => {
  const { authFetch } = useApi()
  const realtime = useRealtime()

  // eventId → activityId[] (ordered by startsAt as returned by the API)
  const activitiesByEvent = ref(new Map())
  // activityId → ActivityDto
  const activities = ref(new Map())
  // activityId → ParticipantDto[] (only populated when owner/co-host fetches detail)
  const participants = ref(new Map())

  // Per-activity write-sequence guard. Mirrors raffleSeq in raffles.js.
  const activitySeq = new Map()
  function bumpActivitySeq(activityId) {
    activitySeq.set(activityId, (activitySeq.get(activityId) ?? 0) + 1)
  }
  function getActivitySeq(activityId) {
    return activitySeq.get(activityId) ?? 0
  }

  let realtimeInstalled = false

  // ── Realtime installation ────────────────────────────────────────────────

  function installRealtime() {
    if (realtimeInstalled) return
    realtimeInstalled = true
    realtime.ensureStarted().catch(() => { /* best-effort */ })
    realtime.on(RealtimeEvents.ActivityCreated, applyRealtimeCreated)
    realtime.on(RealtimeEvents.ActivityUpdated, applyRealtimeUpdated)
    realtime.on(RealtimeEvents.ActivityDeleted, applyRealtimeDeleted)
    realtime.on(RealtimeEvents.ActivityParticipantChanged, applyRealtimeParticipantChanged)
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async function fetchActivities(eventId) {
    installRealtime()
    const seqsAtStart = new Map()
    const existing = activitiesByEvent.value.get(eventId)
    if (existing) for (const id of existing) seqsAtStart.set(id, getActivitySeq(id))
    const list = await activityApi.list(authFetch, eventId)
    const ids = []
    for (const a of list) {
      const startSeq = seqsAtStart.get(a.id) ?? 0
      if (getActivitySeq(a.id) === startSeq) {
        activities.value.set(a.id, { ...a, eventId })
      }
      ids.push(a.id)
    }
    activitiesByEvent.value.set(eventId, ids)
    return list
  }

  async function fetchActivity(eventId, activityId) {
    installRealtime()
    const seqAtStart = getActivitySeq(activityId)
    const data = await activityApi.get(authFetch, eventId, activityId)
    if (getActivitySeq(activityId) !== seqAtStart) return data
    activities.value.set(activityId, {
      id: data.id,
      eventId: data.eventId ?? eventId,
      title: data.title,
      description: data.description,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      maxParticipants: data.maxParticipants,
      participantCount: data.participantCount,
      isFull: data.isFull,
      mySignupAt: data.mySignupAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    })
    bumpActivitySeq(activityId)
    if (data.participants != null) {
      participants.value.set(activityId, data.participants)
    }
    return data
  }

  async function createActivity(eventId, body) {
    const result = await activityApi.create(authFetch, eventId, body)
    // Optimistically enable the activities feature so the tab appears immediately
    // for the owner without waiting for the EventFeatureEnabled broadcast.
    const featuresStore = useEventFeaturesStore()
    if (!featuresStore.isEnabled(eventId, 'activities')) {
      featuresStore.applyEnabled({ eventId, key: 'activities' })
    }
    return result
    // ActivityCreated SignalR broadcast → applyRealtimeCreated → fetchActivities
  }

  async function updateActivity(eventId, activityId, body) {
    const result = await activityApi.update(authFetch, eventId, activityId, body)
    const current = activities.value.get(activityId)
    if (current) {
      activities.value.set(activityId, { ...current, ...body })
      bumpActivitySeq(activityId)
    }
    // ActivityUpdated broadcast will reconcile to canonical state
    return result
  }

  async function deleteActivity(eventId, activityId) {
    await activityApi.remove(authFetch, eventId, activityId)
    // ActivityDeleted broadcast handles cleanup
  }

  async function signup(eventId, activityId) {
    const result = await activityApi.signup(authFetch, eventId, activityId)
    const current = activities.value.get(activityId)
    if (current) {
      const newCount = result.participantCount ?? (current.participantCount + 1)
      activities.value.set(activityId, {
        ...current,
        participantCount: newCount,
        mySignupAt: result.signedUpAt ?? new Date().toISOString(),
        isFull: current.maxParticipants != null && newCount >= current.maxParticipants
      })
      bumpActivitySeq(activityId)
    }
    return result
  }

  async function withdraw(eventId, activityId) {
    await activityApi.withdraw(authFetch, eventId, activityId)
    const current = activities.value.get(activityId)
    if (current) {
      const newCount = Math.max(0, current.participantCount - 1)
      activities.value.set(activityId, {
        ...current,
        participantCount: newCount,
        mySignupAt: null,
        isFull: false
      })
      bumpActivitySeq(activityId)
    }
  }

  async function removeParticipant(eventId, activityId, userId) {
    await activityApi.removeParticipant(authFetch, eventId, activityId, userId)
    const currentParticipants = participants.value.get(activityId)
    if (currentParticipants) {
      participants.value.set(activityId, currentParticipants.filter((p) => p.userId !== userId))
    }
    const current = activities.value.get(activityId)
    if (current) {
      const newCount = Math.max(0, current.participantCount - 1)
      activities.value.set(activityId, {
        ...current,
        participantCount: newCount,
        isFull: false
      })
      bumpActivitySeq(activityId)
    }
  }

  // ── Realtime handlers ────────────────────────────────────────────────────

  async function applyRealtimeCreated({ eventId }) {
    try { await fetchActivities(eventId) } catch { /* best-effort */ }
  }

  async function applyRealtimeUpdated({ eventId, activityId }) {
    try { await fetchActivity(eventId, activityId) } catch { /* best-effort */ }
  }

  async function applyRealtimeDeleted({ eventId, activityId }) {
    activities.value.delete(activityId)
    participants.value.delete(activityId)
    try { await fetchActivities(eventId) } catch { /* best-effort */ }
  }

  async function applyRealtimeParticipantChanged({ eventId, activityId, userId, joined, participantCount }) {
    const permissions = usePermissionsStore()
    const current = activities.value.get(activityId)
    if (current) {
      const isMe = userId === permissions.userId
      const mySignupPatch = isMe
        ? joined
          ? { mySignupAt: new Date().toISOString() }
          : { mySignupAt: null, isFull: false }
        : {}
      activities.value.set(activityId, {
        ...current,
        participantCount,
        isFull: current.maxParticipants != null && participantCount >= current.maxParticipants,
        ...mySignupPatch
      })
      bumpActivitySeq(activityId)
    }
    if (joined) {
      // Broadcast doesn't include displayName — refetch to populate participant list
      if (participants.value.has(activityId)) {
        fetchActivity(eventId, activityId).catch(() => {})
      }
    } else {
      const currentParticipants = participants.value.get(activityId)
      if (currentParticipants) {
        participants.value.set(activityId, currentParticipants.filter((p) => p.userId !== userId))
      }
    }
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  function activitiesFor(eventId) {
    const ids = activitiesByEvent.value.get(eventId) ?? []
    return ids.map((id) => activities.value.get(id)).filter(Boolean)
  }

  return {
    activitiesByEvent,
    activities,
    participants,
    activitiesFor,
    fetchActivities,
    fetchActivity,
    createActivity,
    updateActivity,
    deleteActivity,
    signup,
    withdraw,
    removeParticipant,
    applyRealtimeCreated,
    applyRealtimeUpdated,
    applyRealtimeDeleted,
    applyRealtimeParticipantChanged,
    installRealtime
  }
})
