import { defineStore } from 'pinia'
import { ref } from 'vue'
import { raffleApi } from '@/api'
import { useApi } from '@/shared/composables/useApi'
import { useRealtime, RealtimeEvents } from '@/shared/composables/useRealtime'

/**
 * Raffles store, keyed by raffleId.
 *
 * State maps use raffleId as the key throughout. A secondary
 * rafflesByEvent Map lets the section component quickly get the ordered
 * list of raffle ids for a given event.
 *
 * De-dupe rule for pendingReveal: both the host's drawWinner() call and the
 * incoming RaffleWinnerRevealed SignalR event try to set pendingReveal. The
 * store ignores the duplicate by comparing drawId so the host sees exactly
 * one animation.
 */
export const useRafflesStore = defineStore('raffles', () => {
  const { authFetch } = useApi()
  const realtime = useRealtime()

  // raffleId → summary (id, name, status, entryCount, totalTickets, pricePerTicket, selfReportingEnabled, eventId)
  const raffles = ref(new Map())
  // raffleId → entry[] ({ userId, displayName, tickets })
  const entries = ref(new Map())
  // raffleId → draw[] ({ id, winnerUserId, displayName, drawnAt, ticketsBefore, ticketsAfter })
  const draws = ref(new Map())
  // raffleId → reveal payload | null
  const pendingReveal = ref(new Map())
  // eventId → raffleId[] (ordered)
  const rafflesByEvent = ref(new Map())

  let realtimeInstalled = false

  // ── Realtime installation ───────────────────────────────────────────────

  function installRealtime() {
    if (realtimeInstalled) return
    realtimeInstalled = true
    realtime.ensureStarted().catch(() => { /* best-effort */ })
    realtime.on(RealtimeEvents.RaffleCreated, applyRealtimeCreated)
    realtime.on(RealtimeEvents.RaffleUpdated, applyRealtimeUpdated)
    realtime.on(RealtimeEvents.RaffleDeleted, applyRealtimeDeleted)
    realtime.on(RealtimeEvents.RaffleEntryChanged, applyRealtimeEntryChanged)
    realtime.on(RealtimeEvents.RaffleStarted, applyRealtimeStarted)
    realtime.on(RealtimeEvents.RaffleWinnerRevealed, applyRealtimeWinnerRevealed)
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  async function fetchRaffles(eventId) {
    installRealtime()
    const list = await raffleApi.list(authFetch, eventId)
    const ids = []
    for (const r of list) {
      raffles.value.set(r.id, { ...r, eventId })
      ids.push(r.id)
    }
    rafflesByEvent.value.set(eventId, ids)
    return list
  }

  async function fetchRaffle(eventId, raffleId) {
    installRealtime()
    const data = await raffleApi.get(authFetch, eventId, raffleId)
    const ents = data.entries || []
    raffles.value.set(raffleId, {
      id: data.id,
      name: data.name,
      description: data.description,
      status: data.status,
      pricePerTicket: data.pricePerTicket,
      selfReportingEnabled: data.selfReportingEnabled,
      deletedAt: data.deletedAt ?? null,
      drawCount: data.drawCount,
      entryCount: ents.length,
      totalTickets: ents.reduce((s, e) => s + e.tickets, 0),
      eventId
    })
    entries.value.set(raffleId, ents)
    return data
  }

  async function fetchEntries(eventId, raffleId) {
    const data = await raffleApi.get(authFetch, eventId, raffleId)
    entries.value.set(raffleId, data.entries || [])
    return data.entries || []
  }

  async function fetchDraws(eventId, raffleId) {
    const list = await raffleApi.draws(authFetch, eventId, raffleId)
    draws.value.set(raffleId, list)
    return list
  }

  async function createRaffle(eventId, body) {
    return raffleApi.create(authFetch, eventId, body)
    // RaffleCreated SignalR → applyRealtimeCreated → fetchRaffles
  }

  async function patchRaffle(eventId, raffleId, body) {
    return raffleApi.patch(authFetch, eventId, raffleId, body)
    // RaffleUpdated SignalR → applyRealtimeUpdated → fetchRaffle
  }

  async function deleteRaffle(eventId, raffleId) {
    await raffleApi.remove(authFetch, eventId, raffleId)
    // RaffleDeleted SignalR → applyRealtimeDeleted
  }

  async function setEntryTickets(eventId, raffleId, userId, tickets) {
    return raffleApi.setTickets(authFetch, eventId, raffleId, userId, tickets)
    // RaffleEntryChanged SignalR → applyRealtimeEntryChanged
  }

  async function removeEntry(eventId, raffleId, userId) {
    await raffleApi.removeEntry(authFetch, eventId, raffleId, userId)
    // RaffleEntryChanged SignalR with tickets=0 → applyRealtimeEntryChanged
  }

  async function startDraw(eventId, raffleId) {
    return raffleApi.start(authFetch, eventId, raffleId)
    // RaffleStarted SignalR → applyRealtimeStarted
  }

  /**
   * Draw a winner. Can throw Error("No tickets remaining.") on 409.
   * Sets pendingReveal with de-dupe guard so the host sees exactly one animation.
   */
  async function drawWinner(eventId, raffleId) {
    const result = await raffleApi.draw(authFetch, eventId, raffleId)
    // De-dupe: SignalR RaffleWinnerRevealed may arrive before or after this resolves.
    // Both paths share the same guard: first to arrive wins.
    const current = pendingReveal.value.get(raffleId)
    if (!current || current.drawId !== result.drawId) {
      pendingReveal.value.set(raffleId, { ...result, eventId, raffleId })
    }
    await fetchDraws(eventId, raffleId).catch(() => {})
    return result
  }

  /** Clear the pending reveal after the animation component has consumed it. */
  function consumeReveal(raffleId) {
    pendingReveal.value.set(raffleId, null)
  }

  // ── Realtime handlers ───────────────────────────────────────────────────

  async function applyRealtimeCreated({ eventId }) {
    try { await fetchRaffles(eventId) } catch { /* best-effort */ }
  }

  async function applyRealtimeUpdated({ eventId, raffleId }) {
    try { await fetchRaffle(eventId, raffleId) } catch { /* best-effort */ }
  }

  async function applyRealtimeDeleted({ eventId, raffleId }) {
    // Hosts retain a soft-deleted view of the raffle (for refunds review),
    // participants no longer see it. Refetch so the API decides what to return.
    entries.value.delete(raffleId)
    draws.value.delete(raffleId)
    pendingReveal.value.delete(raffleId)
    try { await fetchRaffles(eventId) } catch { /* best-effort */ }
  }

  function applyRealtimeEntryChanged({ eventId, raffleId, userId, tickets }) {
    const current = entries.value.get(raffleId)
    const currentRaffle = raffles.value.get(raffleId)
    if (!current) {
      // Entries not yet loaded — fetch them so the view is up to date
      fetchEntries(eventId, raffleId).catch(() => {})
      if (currentRaffle) fetchRaffle(eventId, raffleId).catch(() => {})
      return
    }
    const idx = current.findIndex((e) => e.userId === userId)
    let nextEntries = [...current]
    
    if (tickets === 0) {
      if (idx !== -1) {
        nextEntries = current.filter((e) => e.userId !== userId)
        entries.value.set(raffleId, nextEntries)
      }
    } else if (idx !== -1) {
      nextEntries[idx] = { ...nextEntries[idx], tickets }
      entries.value.set(raffleId, nextEntries)
    } else {
      // New entry — we need the displayName, so refetch
      fetchEntries(eventId, raffleId).catch(() => {})
      if (currentRaffle) fetchRaffle(eventId, raffleId).catch(() => {})
      return
    }

    // Live update total tickets in the raffle summary
    if (currentRaffle) {
      raffles.value.set(raffleId, {
        ...currentRaffle,
        entryCount: nextEntries.length,
        totalTickets: nextEntries.reduce((s, e) => s + e.tickets, 0)
      })
    }
  }

  function applyRealtimeStarted({ raffleId }) {
    const raffle = raffles.value.get(raffleId)
    if (raffle) raffles.value.set(raffleId, { ...raffle, status: 'Drawing' })
  }

  function applyRealtimeWinnerRevealed(payload) {
    const { raffleId, drawId, eventId } = payload
    const current = pendingReveal.value.get(raffleId)
    // De-dupe: if drawWinner already set this, skip
    if (current && current.drawId === drawId) return
    pendingReveal.value.set(raffleId, payload)
    // Refresh draws so history stays in sync for all clients
    if (eventId && raffleId) fetchDraws(eventId, raffleId).catch(() => {})
  }

  return {
    raffles,
    entries,
    draws,
    pendingReveal,
    rafflesByEvent,
    fetchRaffles,
    fetchRaffle,
    fetchEntries,
    fetchDraws,
    createRaffle,
    patchRaffle,
    deleteRaffle,
    setEntryTickets,
    removeEntry,
    startDraw,
    drawWinner,
    consumeReveal,
    applyRealtimeCreated,
    applyRealtimeUpdated,
    applyRealtimeDeleted,
    applyRealtimeEntryChanged,
    applyRealtimeStarted,
    applyRealtimeWinnerRevealed,
    installRealtime
  }
})
