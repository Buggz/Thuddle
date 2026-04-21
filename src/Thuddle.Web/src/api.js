export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export function apiUrl(path) {
  return `${API_BASE}${path}`
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
