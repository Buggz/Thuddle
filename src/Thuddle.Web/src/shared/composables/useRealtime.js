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
  InvitationSent: 'InvitationSent'
})

let connection = null
let startPromise = null
const resyncHandlers = new Set()

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

  conn.onreconnected(() => {
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

  async function stop() {
    if (!connection) return
    try { await connection.stop() } catch { /* ignore */ }
    connection = null
    startPromise = null
  }

  return { ensureStarted, on, off, onResync, stop }
}
