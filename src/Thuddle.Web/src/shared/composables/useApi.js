import { useAuthStore } from '@/features/auth/stores/auth'
import { apiUrl } from '@/api'

export function useApi() {
  const auth = useAuthStore()

  async function authFetch(path, options = {}) {
    // Wait briefly for a token in case Keycloak is still refreshing.
    // getToken() in @josempgon/vue-keycloak normally awaits init/refresh, but a
    // refresh that's mid-flight can transiently return undefined. Retry a handful
    // of times before giving up rather than firing `Authorization: Bearer undefined`
    // and getting an unhelpful 401.
    let token = await auth.getAccessToken()
    for (let attempt = 0; !token && attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 50))
      token = await auth.getAccessToken()
    }
    if (!token) {
      throw new Error(`Auth token unavailable for ${path}`)
    }
    const headers = {
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
    const response = await fetch(apiUrl(path), { ...options, headers })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${response.status}`)
    }
    return response
  }

  return { authFetch }
}
