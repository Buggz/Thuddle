import { useAuthStore } from '@/features/auth/stores/auth'
import { apiUrl } from '@/api'

export function useApi() {
  const auth = useAuthStore()

  async function authFetch(path, options = {}) {
    // Wait briefly for a token in case Keycloak is still finishing init.
    // getToken() in @josempgon/vue-keycloak normally awaits init, but the SPA
    // can mount and fire `authFetch` before the wrapper is ready. Retry a few
    // times before giving up rather than firing `Authorization: Bearer undefined`
    // and getting an unhelpful 401.
    let token = await auth.getAccessToken()
    for (let attempt = 0; !token && attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 50))
      token = await auth.getAccessToken()
    }
    if (!token) {
      throw new Error(`Auth token unavailable for ${path}`)
    }

    let response = await fetch(apiUrl(path), {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers }
    })

    // If the server rejects the token (expired, stale signing key), force a
    // refresh and retry exactly once before surfacing the error.
    if (response.status === 401) {
      const freshToken = await auth.refreshAccessToken()
      if (freshToken && freshToken !== token) {
        response = await fetch(apiUrl(path), {
          ...options,
          headers: { Authorization: `Bearer ${freshToken}`, ...options.headers }
        })
      }
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${response.status}`)
    }
    return response
  }

  return { authFetch }
}
