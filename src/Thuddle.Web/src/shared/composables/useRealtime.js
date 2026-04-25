import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { useAuthStore } from '@/features/auth/stores/auth'
import { API_BASE } from '@/api'

// Event name constants — keep in sync with Thuddle.Api/Realtime/RealtimeEvents.cs
export const RealtimeEvents = Object.freeze({
  EventCreated: 'EventCreated',
  EventUpdated: 'EventUpdated',
  EventDeleted: 'EventDeleted',
  ParticipantChanged: 'ParticipantChanged',
  DiscussionActivity: 'DiscussionActivity',
  CommentCountChanged: 'CommentCountChanged',
  InvitationSent: 'InvitationSent',
  // Auction
  AuctionSettingsChanged: 'AuctionSettingsChanged',
  AuctionStatusChanged: 'AuctionStatusChanged',
  AuctionItemAdded: 'AuctionItemAdded',
  AuctionItemUpdated: 'AuctionItemUpdated',
  AuctionItemRemoved: 'AuctionItemRemoved',
  AuctionBidPlaced: 'AuctionBidPlaced',
  AuctionItemSold: 'AuctionItemSold',
  AuctionEnded: 'AuctionEnded',
  // Notifications
  NotificationCreated: 'NotificationCreated',
  // Raffle
  RaffleCreated: 'RaffleCreated',
  RaffleUpdated: 'RaffleUpdated',
  RaffleDeleted: 'RaffleDeleted',
  RaffleEntryChanged: 'RaffleEntryChanged',
  RaffleStarted: 'RaffleStarted',
  RaffleWinnerRevealed: 'RaffleWinnerRevealed'
})

let connection = null
let startPromise = null
const resyncHandlers = new Set()

// Tracks the set of event ids we've asked the hub to subscribe us to. Kept so
// we can re-subscribe transparently after a reconnect.
const subscribedEventIds = new Set()

function buildConnection() {
  const auth = useAuthStore()
  const hubUrl = `${API_BASE}/hubs/thuddle`

  const conn = new HubConnectionBuilder()
    .withUrl(hubUrl, {
      accessTokenFactory: async () => {
        if (!auth.isAuthenticated) return ''
        try {
          return (await auth.getAccessToken()) ?? ''
        } catch {
          return ''
        }
      }
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()

  conn.onreconnected(async () => {
    // Re-establish event subscriptions server-side after reconnect.
    if (subscribedEventIds.size > 0) {
      try {
        await conn.invoke('SubscribeEvents', Array.from(subscribedEventIds))
      } catch (err) {
        console.warn('[realtime] resubscribe after reconnect failed', err)
      }
    }
    resyncHandlers.forEach((fn) => {
      try { fn() } catch (err) { console.error('[realtime] resync handler failed', err) }
    })
  })

  return conn
}

export function useRealtime() {
  function ensureStarted() {
    if (!connection) connection = buildConnection()
    if (connection.state === HubConnectionState.Connected) return Promise.resolve()
    if (startPromise) return startPromise
    startPromise = connection.start().catch((err) => {
      console.error('[realtime] failed to start hub connection', err)
      startPromise = null
      throw err
    })
    return startPromise
  }

  function on(eventName, handler) {
    if (!connection) connection = buildConnection()
    connection.on(eventName, handler)
  }

  function off(eventName, handler) {
    if (!connection) return
    connection.off(eventName, handler)
  }

  function onResync(handler) {
    resyncHandlers.add(handler)
    return () => resyncHandlers.delete(handler)
  }

  /**
   * Ask the server to start sending us updates for the given event ids.
   * The server returns the subset we're authorized for; any ids it doesn't
   * grant are dropped from our local tracking so we won't resubscribe after
   * a reconnect. Safe to call with ids we're already subscribed to.
   */
  async function subscribeEvents(eventIds) {
    if (!eventIds || eventIds.length === 0) return []
    const unique = Array.from(new Set(eventIds))
    await ensureStarted()
    try {
      const granted = await connection.invoke('SubscribeEvents', unique) ?? []
      granted.forEach((id) => subscribedEventIds.add(id))
      return granted
    } catch (err) {
      console.warn('[realtime] SubscribeEvents failed', err)
      return []
    }
  }

  async function unsubscribeEvents(eventIds) {
    if (!eventIds || eventIds.length === 0) return
    const toRemove = eventIds.filter((id) => subscribedEventIds.has(id))
    if (toRemove.length === 0) return
    toRemove.forEach((id) => subscribedEventIds.delete(id))
    if (!connection || connection.state !== HubConnectionState.Connected) return
    try {
      await connection.invoke('UnsubscribeEvents', toRemove)
    } catch (err) {
      console.warn('[realtime] UnsubscribeEvents failed', err)
    }
  }

  async function stop() {
    if (!connection) return
    try { await connection.stop() } catch { /* ignore */ }
    subscribedEventIds.clear()
    connection = null
    startPromise = null
  }

  return { ensureStarted, on, off, onResync, subscribeEvents, unsubscribeEvents, stop }
}
