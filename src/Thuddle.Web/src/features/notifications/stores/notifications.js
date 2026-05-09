import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import { notificationApi } from '@/api'
import { useApi } from '@/shared/composables/useApi'
import { useRealtime, RealtimeEvents } from '@/shared/composables/useRealtime'

/**
 * Notifications store. Loads paged inbox + tracks unread count.
 *
 * `NotificationCreated` — server only sends the id; refetch page 1 so the
 * shape is authoritative and the unread badge updates with no guesswork.
 *
 * `NotificationRead` / `NotificationsAllRead` — idempotent in-place updates
 * that sync read state across devices with no refetch.
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const { authFetch } = useApi()
  const realtime = useRealtime()

  const list = ref([])
  const totalCount = shallowRef(0)
  const page = shallowRef(1)
  const pageSize = shallowRef(20)
  const loading = shallowRef(false)
  const error = shallowRef(null)

  let realtimeInstalled = false
  let started = false

  const unreadCount = computed(() => list.value.filter((n) => !n.readAt).length)

  async function load(opts = {}) {
    loading.value = true
    error.value = null
    try {
      const targetPage = opts.page ?? page.value
      const data = await notificationApi.list(authFetch, {
        page: targetPage,
        pageSize: pageSize.value
      })
      list.value = data.items || []
      totalCount.value = data.totalCount ?? list.value.length
      page.value = targetPage
    } catch (err) {
      error.value = err.message || 'Failed to load notifications.'
    } finally {
      loading.value = false
    }
  }

  async function markRead(id) {
    const idx = list.value.findIndex((n) => n.id === id)
    if (idx === -1) return
    if (list.value[idx].readAt) return
    // Optimistic — mark in-place; the server state is the same shape, just
    // with a server-generated timestamp.
    const optimistic = { ...list.value[idx], readAt: new Date().toISOString() }
    list.value.splice(idx, 1, optimistic)
    try {
      await notificationApi.markRead(authFetch, id)
    } catch (err) {
      // Roll back on failure so the unread badge stays honest
      list.value.splice(idx, 1, { ...optimistic, readAt: null })
      error.value = err.message || 'Failed to mark notification read.'
    }
  }

  async function markAllRead() {
    const now = new Date().toISOString()
    const previous = list.value.slice()
    list.value = list.value.map((n) => (n.readAt ? n : { ...n, readAt: now }))
    try {
      await notificationApi.markAllRead(authFetch)
    } catch (err) {
      list.value = previous
      error.value = err.message || 'Failed to mark all read.'
    }
  }

  function installRealtime() {
    if (realtimeInstalled) return
    realtimeInstalled = true
    realtime.on(RealtimeEvents.NotificationCreated, () => {
      // Server only sends the id; refetch the first page so the shape is
      // authoritative and the unread badge updates with no guesswork.
      load({ page: 1 })
    })
    realtime.on(RealtimeEvents.NotificationRead, ({ notificationId }) => {
      const idx = list.value.findIndex((n) => n.id === notificationId)
      if (idx === -1 || list.value[idx].readAt) return
      list.value.splice(idx, 1, { ...list.value[idx], readAt: new Date().toISOString() })
    })
    realtime.on(RealtimeEvents.NotificationsAllRead, ({ readAt }) => {
      const ts = readAt ?? new Date().toISOString()
      list.value = list.value.map((n) => (n.readAt ? n : { ...n, readAt: ts }))
    })
    realtime.onResync(() => load({ page: 1 }))
  }

  async function subscribeRealtime() {
    if (started) return
    started = true
    installRealtime()
    try {
      await realtime.ensureStarted()
    } catch { /* best-effort; load() still works */ }
    await load({ page: 1 })
  }

  function reset() {
    list.value = []
    totalCount.value = 0
    page.value = 1
    started = false
    error.value = null
  }

  return {
    list,
    totalCount,
    page,
    pageSize,
    loading,
    error,
    unreadCount,
    load,
    markRead,
    markAllRead,
    subscribeRealtime,
    reset
  }
})
