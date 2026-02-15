import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import keycloak from '@/plugins/keycloak'

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false)
  const user = ref(null)
  const token = ref(null)

  const userName = computed(() => {
    if (!user.value) return ''
    return user.value.email || ''
  })

  const keycloakId = computed(() => {
    return user.value?.sub || user.value?.sid || user.value?.email || ''
  })

  async function init() {
    try {
      const authenticated = await keycloak.init({
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
        pkceMethod: 'S256'
      })

      isAuthenticated.value = authenticated

      if (authenticated) {
        user.value = keycloak.tokenParsed
        token.value = keycloak.token
      }

      // Auto-refresh token
      setInterval(async () => {
        if (keycloak.authenticated) {
          try {
            const refreshed = await keycloak.updateToken(30)
            if (refreshed) {
              token.value = keycloak.token
            }
          } catch {
            console.warn('Token refresh failed')
          }
        }
      }, 10000)
    } catch (error) {
      console.error('Keycloak init failed:', error)
    }
  }

  function login() {
    keycloak.login()
  }

  function logout() {
    keycloak.logout({ redirectUri: window.location.origin })
  }

  function getToken() {
    return keycloak.token
  }

  return {
    isAuthenticated,
    user,
    token,
    userName,
    keycloakId,
    init,
    login,
    logout,
    getToken
  }
})
