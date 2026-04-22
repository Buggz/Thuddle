import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { auctionApi } from '@/api'
import { useApi } from '@/shared/composables/useApi'
import { useRealtime, RealtimeEvents } from '@/shared/composables/useRealtime'

/**
 * Auction store, keyed by `eventId`.
 *
 * State for an auction lives in three maps (all keyed by eventId, then itemId
 * where applicable) so we never have to worry about which event owns what
 * when the user moves between event pages.
 *
 * Realtime payloads from the server are *authoritative* — when we get a
 * payload that contains the new state we replace local state with it. When the
 * payload only carries identifiers (e.g. AuctionItemAdded), we refetch the
 * authoritative shape from the server.
 */
export const useAuctionStore = defineStore('auction', () => {
  const { authFetch } = useApi()
  const realtime = useRealtime()

  // eventId → settings DTO (or { configured: false })
  const settingsByEvent = ref({})
  // eventId → itemId → item DTO
  const itemsByEvent = ref({})
  // eventId → itemId → bids[]
  const bidsByItem = ref({})
  // eventId → itemId → item
  const myItemsByEvent = ref({})
  const loadingMyItemsByEvent = ref({})
  // eventId → items array
  const moderationQueueByEvent = ref({})
  const loadingModerationByEvent = ref({})
  // eventId → server time anchor (ISO string)
  const serverTimeByEvent = shallowRef({})
  // per-event loading flags
  const loadingByEvent = ref({})
  // last error per event
  const errorByEvent = ref({})

  // Realtime subscription bookkeeping
  const subscribedEvents = new Set()
  let realtimeInstalled = false

  function getItems(eventId) {
    return itemsByEvent.value[eventId] || {}
  }

  function setItem(eventId, item) {
    if (!itemsByEvent.value[eventId]) itemsByEvent.value[eventId] = {}
    itemsByEvent.value[eventId] = { ...itemsByEvent.value[eventId], [item.id]: item }
  }

  function removeItem(eventId, itemId) {
    if (!itemsByEvent.value[eventId]) return
    const next = { ...itemsByEvent.value[eventId] }
    delete next[itemId]
    itemsByEvent.value[eventId] = next
  }

  function setError(eventId, message) {
    errorByEvent.value = { ...errorByEvent.value, [eventId]: message }
  }

  // ── Loaders ───────────────────────────────────────────────────────────

  async function loadMyItems(eventId) {
    loadingMyItemsByEvent.value = { ...loadingMyItemsByEvent.value, [eventId]: true }
    try {
      const resp = await auctionApi.getItems(authFetch, eventId, { mine: true, pageSize: 100 }).catch(() => ({ items: [] }))
      const map = {}
      for (const it of resp.items || []) map[it.id] = it
      myItemsByEvent.value = { ...myItemsByEvent.value, [eventId]: map }
    } catch (err) {
      setError(eventId, err.message || 'Failed to load user items.')
    } finally {
      loadingMyItemsByEvent.value = { ...loadingMyItemsByEvent.value, [eventId]: false }
    }
  }

  async function loadModerationQueue(eventId) {
    loadingModerationByEvent.value = { ...loadingModerationByEvent.value, [eventId]: true }
    try {
      const resp = await auctionApi.getModerationQueue(authFetch, eventId)
      // Usually backend wraps in { items: [...] } but instructions said "array of items" so fallback included
      const queue = Array.isArray(resp) ? resp : (resp.items || [])
      moderationQueueByEvent.value = { ...moderationQueueByEvent.value, [eventId]: queue }
    } catch (err) {
      setError(eventId, err.message || 'Failed to load moderation queue.')
    } finally {
      loadingModerationByEvent.value = { ...loadingModerationByEvent.value, [eventId]: false }
    }
  }

  async function loadAuction(eventId) {
    loadingByEvent.value = { ...loadingByEvent.value, [eventId]: true }
    setError(eventId, null)
    try {
      const [settings, itemsResp] = await Promise.all([
        auctionApi.getSettings(authFetch, eventId),
        auctionApi.getItems(authFetch, eventId, { pageSize: 100 }).catch(() => ({ items: [] }))
      ])
      settingsByEvent.value = { ...settingsByEvent.value, [eventId]: settings }
      if (settings?.serverTime) {
        serverTimeByEvent.value = { ...serverTimeByEvent.value, [eventId]: settings.serverTime }
      }
      const map = {}
      for (const it of itemsResp.items || []) map[it.id] = it
      itemsByEvent.value = { ...itemsByEvent.value, [eventId]: map }
    } catch (err) {
      setError(eventId, err.message || 'Failed to load auction.')
    } finally {
      loadingByEvent.value = { ...loadingByEvent.value, [eventId]: false }
    }
  }

  async function loadItem(eventId, itemId) {
    try {
      const item = await auctionApi.getItem(authFetch, eventId, itemId)
      setItem(eventId, item)
      return item
    } catch (err) {
      setError(eventId, err.message || 'Failed to load item.')
      return null
    }
  }

  async function loadBids(eventId, itemId) {
    try {
      const resp = await auctionApi.getBids(authFetch, eventId, itemId, { pageSize: 100 })
      bidsByItem.value = { ...bidsByItem.value, [itemId]: resp.items || [] }
      return resp.items
    } catch (err) {
      setError(eventId, err.message || 'Failed to load bids.')
      return []
    }
  }

  // ── Mutations ─────────────────────────────────────────────────────────

  async function saveDraft(eventId, body) {
    return auctionApi.createItem(authFetch, eventId, body)
  }

  async function uploadItemImages(eventId, itemId, files) {
    const results = []
    for (const file of files) {
      const r = await auctionApi.uploadItemImage(authFetch, eventId, itemId, file)
      results.push(r)
    }
    return results
  }

  async function updateItem(eventId, itemId, body) {
    const r = await auctionApi.updateItem(authFetch, eventId, itemId, body)
    await loadItem(eventId, itemId)
    return r
  }

  async function publishItem(eventId, itemId) {
    try {
      const item = await auctionApi.publishItem(authFetch, eventId, itemId)
      if (myItemsByEvent.value[eventId]) {
        myItemsByEvent.value[eventId] = { ...myItemsByEvent.value[eventId], [item.id]: item }
      }
      if (['Scheduled', 'Live', 'Sold', 'Unsold'].includes(item.status)) {
        setItem(eventId, item)
      }
      return item
    } catch (err) {
      throw new Error(err.message || 'Failed to publish item')
    }
  }

  async function unpublishItem(eventId, itemId) {
    try {
      const item = await auctionApi.unpublishItem(authFetch, eventId, itemId)
      if (myItemsByEvent.value[eventId]) {
        myItemsByEvent.value[eventId] = { ...myItemsByEvent.value[eventId], [item.id]: item }
      }
      removeItem(eventId, itemId)
      return item
    } catch (err) {
      throw new Error(err.message || 'Failed to unpublish item')
    }
  }

  async function resubmitItem(eventId, itemId) {
    try {
      const item = await auctionApi.resubmitItem(authFetch, eventId, itemId)
      if (myItemsByEvent.value[eventId]) {
        myItemsByEvent.value[eventId] = { ...myItemsByEvent.value[eventId], [item.id]: item }
      }
      return item
    } catch (err) {
      throw new Error(err.message || 'Failed to resubmit item')
    }
  }

  async function withdrawItem(eventId, itemId) {
    await auctionApi.deleteItem(authFetch, eventId, itemId)
    removeItem(eventId, itemId)
  }

  async function approveItem(eventId, itemId) {
    await auctionApi.approveItem(authFetch, eventId, itemId)
    await loadItem(eventId, itemId)
    if (moderationQueueByEvent.value[eventId]) {
      await loadModerationQueue(eventId)
    }
  }

  async function rejectItem(eventId, itemId, { reason, allowResubmit }) {
    try {
      await auctionApi.rejectItem(authFetch, eventId, itemId, { reason, allowResubmit })
      await loadItem(eventId, itemId)
      if (moderationQueueByEvent.value[eventId]) {
        await loadModerationQueue(eventId)
      }
    } catch (err) {
      throw new Error(err.message || 'Failed to reject item')
    }
  }

  async function placeBid(eventId, itemId, amount, idempotencyKey) {
    return auctionApi.placeBid(authFetch, eventId, itemId, amount, idempotencyKey)
  }

  async function buyout(eventId, itemId, idempotencyKey) {
    return auctionApi.buyout(authFetch, eventId, itemId, idempotencyKey)
  }

  async function updateSettings(eventId, body) {
    const r = await auctionApi.upsertSettings(authFetch, eventId, body)
    await loadAuction(eventId)
    return r
  }

  async function startAuction(eventId) {
    const r = await auctionApi.start(authFetch, eventId)
    await loadAuction(eventId)
    return r
  }

  async function setSubmitters(eventId, userIds) {
    return auctionApi.setSubmitters(authFetch, eventId, userIds)
  }

  async function getSubmitters(eventId) {
    return auctionApi.getSubmitters(authFetch, eventId)
  }

  // ── Realtime ──────────────────────────────────────────────────────────

  function installRealtime() {
    if (realtimeInstalled) return
    realtimeInstalled = true
    realtime.ensureStarted().catch(() => { /* best-effort */ })
    realtime.on(RealtimeEvents.AuctionSettingsChanged, ({ eventId }) => {
      if (subscribedEvents.has(eventId)) loadAuction(eventId)
    })
    realtime.on(RealtimeEvents.AuctionStatusChanged, ({ eventId, status }) => {
      const current = settingsByEvent.value[eventId]
      if (current) {
        settingsByEvent.value = {
          ...settingsByEvent.value,
          [eventId]: { ...current, status }
        }
      }
      if (subscribedEvents.has(eventId)) loadAuction(eventId)
    })
    realtime.on(RealtimeEvents.AuctionItemAdded, ({ eventId, itemId }) => {
      if (subscribedEvents.has(eventId)) loadItem(eventId, itemId)
    })
    realtime.on(RealtimeEvents.AuctionItemUpdated, ({ eventId, itemId }) => {
      if (subscribedEvents.has(eventId)) loadItem(eventId, itemId)
      if (moderationQueueByEvent.value[eventId]) loadModerationQueue(eventId)
    })
    realtime.on(RealtimeEvents.AuctionItemRemoved, ({ eventId, itemId }) => {
      removeItem(eventId, itemId)
      if (moderationQueueByEvent.value[eventId]) loadModerationQueue(eventId)
    })
    realtime.on(RealtimeEvents.AuctionBidPlaced, ({ eventId, itemId, currentBid, bidCount, serverTime }) => {
      const items = itemsByEvent.value[eventId]
      if (items && items[itemId]) {
        setItem(eventId, { ...items[itemId], currentBid, bidCount })
      }
      if (serverTime) {
        serverTimeByEvent.value = { ...serverTimeByEvent.value, [eventId]: serverTime }
      }
    })
    realtime.on(RealtimeEvents.AuctionItemSold, ({ eventId, itemId }) => {
      if (subscribedEvents.has(eventId)) loadItem(eventId, itemId)
    })
    realtime.on(RealtimeEvents.AuctionEnded, ({ eventId }) => {
      if (subscribedEvents.has(eventId)) loadAuction(eventId)
    })
  }

  async function subscribeRealtime(eventId) {
    installRealtime()
    if (subscribedEvents.has(eventId)) return
    subscribedEvents.add(eventId)
    await realtime.subscribeEvents([eventId])
  }

  async function unsubscribeRealtime(eventId) {
    if (!subscribedEvents.has(eventId)) return
    subscribedEvents.delete(eventId)
    await realtime.unsubscribeEvents([eventId])
  }

  return {
    // state
    settingsByEvent,
    itemsByEvent,
    myItemsByEvent,
    loadingMyItemsByEvent,
    moderationQueueByEvent,
    loadingModerationByEvent,
    bidsByItem,
    serverTimeByEvent,
    loadingByEvent,
    errorByEvent,
    // getters
    getItems,
    // loaders
    loadAuction,
    loadMyItems,
    loadModerationQueue,
    loadItem,
    loadBids,
    // mutations
    saveDraft,
    publishItem,
    unpublishItem,
    resubmitItem,
    uploadItemImages,
    rejectItem,
    updateItem,
    withdrawItem,
    approveItem,
    placeBid,
    buyout,
    updateSettings,
    startAuction,
    setSubmitters,
    getSubmitters,
    // realtime
    subscribeRealtime,
    unsubscribeRealtime
  }
})
