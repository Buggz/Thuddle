export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export function apiUrl(path) {
  return `${API_BASE}${path}`
}

export function getEventBySlug(authFetch, slug) {
  return authFetch(`/api/events/by-slug/${encodeURIComponent(slug)}`).then((r) => r.json())
}

// ─── Auction API ────────────────────────────────────────────────────────────
//
// Each function accepts the caller's `authFetch` (from `useApi()`) so the
// store keeps a single source of truth for endpoint paths while the API
// surface stays trivially mockable.

export const auctionApi = {
  async getSettings(authFetch, eventId) {
    const res = await authFetch(`/api/events/${eventId}/auction`)
    return res.json()
  },

  async upsertSettings(authFetch, eventId, body) {
    const res = await authFetch(`/api/events/${eventId}/auction`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return res.json()
  },

  async start(authFetch, eventId) {
    const res = await authFetch(`/api/events/${eventId}/auction/start`, { method: 'POST' })
    return res.json()
  },

  async getSubmitters(authFetch, eventId) {
    const res = await authFetch(`/api/events/${eventId}/auction/submitters`)
    return res.json()
  },

  async setSubmitters(authFetch, eventId, userIds) {
    const res = await authFetch(`/api/events/${eventId}/auction/submitters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds })
    })
    return res.json()
  },

  async getItems(authFetch, eventId, opts = {}) {
    const params = new URLSearchParams()
    if (opts.page) params.set('page', String(opts.page))
    if (opts.pageSize) params.set('pageSize', String(opts.pageSize))
    if (opts.mine) params.set('mine', 'true')
    const qs = params.toString()
    const res = await authFetch(`/api/events/${eventId}/auction/items${qs ? `?${qs}` : ''}`)
    return res.json()
  },

  async getItem(authFetch, eventId, itemId) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}`)
    return res.json()
  },

  async createItem(authFetch, eventId, body) {
    const res = await authFetch(`/api/events/${eventId}/auction/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return res.json()
  },

  async updateItem(authFetch, eventId, itemId, body) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return res.json()
  },

  async deleteItem(authFetch, eventId, itemId) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}`, {
      method: 'DELETE'
    })
    return res.json()
  },

  async uploadItemImage(authFetch, eventId, itemId, file) {
    const fd = new FormData()
    fd.append('image', file, file.name || 'image')
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}/images`, {
      method: 'POST',
      body: fd
    })
    return res.json()
  },

  async deleteItemImage(authFetch, eventId, itemId, imageId) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}/images/${imageId}`, {
      method: 'DELETE'
    })
    return res.json()
  },

  async approveItem(authFetch, eventId, itemId) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}/approve`, {
      method: 'POST'
    })
    return res.json()
  },

  async publishItem(authFetch, eventId, itemId) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}/publish`, {
      method: 'POST'
    })
    return res.json()
  },

  async unpublishItem(authFetch, eventId, itemId) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}/unpublish`, {
      method: 'POST'
    })
    return res.json()
  },

  async resubmitItem(authFetch, eventId, itemId) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}/resubmit`, {
      method: 'POST'
    })
    return res.json()
  },

  async rejectItem(authFetch, eventId, itemId, { reason, allowResubmit }) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason ?? null, allowResubmit })
    })
    return res.json()
  },

  async getModerationQueue(authFetch, eventId) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/moderation`)
    return res.json()
  },

  async placeBid(authFetch, eventId, itemId, amount, idempotencyKey) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, idempotencyKey })
    })
    return res.json()
  },

  async buyout(authFetch, eventId, itemId, idempotencyKey) {
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}/buyout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 0, idempotencyKey })
    })
    return res.json()
  },

  async getBids(authFetch, eventId, itemId, opts = {}) {
    const params = new URLSearchParams()
    if (opts.page) params.set('page', String(opts.page))
    if (opts.pageSize) params.set('pageSize', String(opts.pageSize))
    const qs = params.toString()
    const res = await authFetch(`/api/events/${eventId}/auction/items/${itemId}/bids${qs ? `?${qs}` : ''}`)
    return res.json()
  }
}

// ─── Notification API ───────────────────────────────────────────────────────

export const notificationApi = {
  async list(authFetch, opts = {}) {
    const params = new URLSearchParams()
    if (opts.page) params.set('page', String(opts.page))
    if (opts.pageSize) params.set('pageSize', String(opts.pageSize))
    if (opts.unreadOnly) params.set('unreadOnly', 'true')
    const qs = params.toString()
    const res = await authFetch(`/api/notifications${qs ? `?${qs}` : ''}`)
    return res.json()
  },

  async markRead(authFetch, id) {
    const res = await authFetch(`/api/notifications/${id}/read`, { method: 'POST' })
    return res.json()
  },

  async markAllRead(authFetch) {
    const res = await authFetch(`/api/notifications/read-all`, { method: 'POST' })
    return res.json()
  }
}

// ─── Board Game API ─────────────────────────────────────────────────────────

export const boardGameApi = {
  async search(query, limit = 10, includeExpansions = false) {
    const params = new URLSearchParams({ q: query, limit: String(limit) })
    if (includeExpansions) params.set('includeExpansions', 'true')
    const res = await fetch(apiUrl(`/api/boardgames/search?${params}`))
    return res.json()
  },

  async getDetail(authFetch, bggId) {
    const res = await authFetch(`/api/boardgames/${bggId}`)
    return res.json()
  },

  async importCsv(authFetch, file) {
    const fd = new FormData()
    fd.append('file', file)
    const res = await authFetch('/api/admin/boardgames/import', {
      method: 'POST',
      body: fd
    })
    return res.json()
  },

  async getStats(authFetch) {
    const res = await authFetch('/api/admin/boardgames/stats')
    return res.json()
  }
}

// ─── Events API ──────────────────────────────────────────────────────────────

export async function leaveEvent(authFetch, eventId) {
  const res = await authFetch(`/api/events/${eventId}/participants/me`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
}

export async function kickAttendee(authFetch, eventId, userId, { revokeInvitation = false, denyReentry = false } = {}) {
  const params = new URLSearchParams()
  if (revokeInvitation) params.set('revokeInvitation', 'true')
  if (denyReentry) params.set('denyReentry', 'true')
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await authFetch(`/api/events/${eventId}/attendees/${userId}${qs}`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function rescindInvitation(authFetch, eventId, email) {
  const res = await authFetch(`/api/events/${eventId}/invitations?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return res.json().catch(() => ({}))
}

// ─── Raffle API ──────────────────────────────────────────────────────────────

export const raffleApi = {
  async list(authFetch, eventId) {
    const res = await authFetch(`/api/events/${eventId}/raffles`)
    return res.json()
  },

  async get(authFetch, eventId, raffleId) {
    const res = await authFetch(`/api/events/${eventId}/raffles/${raffleId}`)
    return res.json()
  },

  async create(authFetch, eventId, body) {
    const res = await authFetch(`/api/events/${eventId}/raffles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return res.json()
  },

  async patch(authFetch, eventId, raffleId, body) {
    const res = await authFetch(`/api/events/${eventId}/raffles/${raffleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return res.json()
  },

  async remove(authFetch, eventId, raffleId) {
    await authFetch(`/api/events/${eventId}/raffles/${raffleId}`, { method: 'DELETE' })
  },

  async setTickets(authFetch, eventId, raffleId, userId, tickets) {
    const res = await authFetch(`/api/events/${eventId}/raffles/${raffleId}/entries/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickets })
    })
    return res.json()
  },

  async removeEntry(authFetch, eventId, raffleId, userId) {
    await authFetch(`/api/events/${eventId}/raffles/${raffleId}/entries/${userId}`, { method: 'DELETE' })
  },

  async start(authFetch, eventId, raffleId) {
    const res = await authFetch(`/api/events/${eventId}/raffles/${raffleId}/start`, { method: 'POST' })
    return res.json()
  },

  async draw(authFetch, eventId, raffleId) {
    const res = await authFetch(`/api/events/${eventId}/raffles/${raffleId}/draw`, { method: 'POST' })
    return res.json()
  },

  async draws(authFetch, eventId, raffleId) {
    const res = await authFetch(`/api/events/${eventId}/raffles/${raffleId}/draws`)
    return res.json()
  }
}

// ─── Event Feature API ───────────────────────────────────────────────────────

export const eventFeatureApi = {
  // Public endpoint — authFetch used when the caller is authenticated.
  // Anonymous callers should use plain fetch(apiUrl(...)) directly (see store).
  async list(authFetch, eventId) {
    const res = await authFetch(`/api/events/${eventId}/features`)
    return res.json()
  },

  async enable(authFetch, eventId, key) {
    const res = await authFetch(`/api/events/${eventId}/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    })
    return res.json()
  },

  async disable(authFetch, eventId, key) {
    // Returns 204 No Content on success; authFetch throws on non-OK (e.g. 409).
    await authFetch(`/api/events/${eventId}/features/${encodeURIComponent(key)}`, {
      method: 'DELETE'
    })
  }
}

// ─── Activity API ─────────────────────────────────────────────────────────────

export const activityApi = {
  async list(authFetch, eventId) {
    const res = await authFetch(`/api/events/${eventId}/activities`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    return res.json()
  },

  async get(authFetch, eventId, activityId) {
    const res = await authFetch(`/api/events/${eventId}/activities/${activityId}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    return res.json()
  },

  async create(authFetch, eventId, body) {
    const res = await authFetch(`/api/events/${eventId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    return res.json()
  },

  async update(authFetch, eventId, activityId, body) {
    const res = await authFetch(`/api/events/${eventId}/activities/${activityId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    return res.json()
  },

  async remove(authFetch, eventId, activityId) {
    const res = await authFetch(`/api/events/${eventId}/activities/${activityId}`, {
      method: 'DELETE'
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
  },

  async signup(authFetch, eventId, activityId) {
    const res = await authFetch(`/api/events/${eventId}/activities/${activityId}/signup`, {
      method: 'POST'
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    return res.json()
  },

  async withdraw(authFetch, eventId, activityId) {
    const res = await authFetch(`/api/events/${eventId}/activities/${activityId}/signup`, {
      method: 'DELETE'
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
  },

  async removeParticipant(authFetch, eventId, activityId, userId) {
    const res = await authFetch(
      `/api/events/${eventId}/activities/${activityId}/participants/${userId}`,
      { method: 'DELETE' }
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
  },

  async uploadDescriptionImage(authFetch, eventId, file) {
    const fd = new FormData()
    fd.append('image', file, file.name || 'image')
    const res = await authFetch(`/api/events/${eventId}/activities/description-images`, {
      method: 'POST',
      body: fd
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    const data = await res.json()
    return data.url
  },

  async joinWaitlist(authFetch, eventId, activityId) {
    const res = await authFetch(`/api/events/${eventId}/activities/${activityId}/waitlist`, {
      method: 'POST'
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    return res.json()
  },

  async leaveWaitlist(authFetch, eventId, activityId) {
    const res = await authFetch(`/api/events/${eventId}/activities/${activityId}/waitlist`, {
      method: 'DELETE'
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
  },

  async promoteFromWaitlist(authFetch, eventId, activityId, userId, allowOverflow) {
    const res = await authFetch(
      `/api/events/${eventId}/activities/${activityId}/waitlist/promote`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, allowOverflow })
      }
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const err = new Error(data.error || `HTTP ${res.status}`)
      err.code = data.code ?? null
      throw err
    }
    return res.json()
  }
}
