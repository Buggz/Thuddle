import { useAuthStore } from '@/features/auth/stores/auth'
import { apiUrl } from '@/api'

export function useApi() {
  const auth = useAuthStore()

  async function authFetch(path, options = {}) {
    const token = await auth.getAccessToken()
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
