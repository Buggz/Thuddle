import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useKeycloak, getToken } from '@josempgon/vue-keycloak'

export const useAuthStore = defineStore('auth', () => {
  const { keycloak, isAuthenticated, decodedToken } = useKeycloak()

  const userName = computed(() => decodedToken.value?.email || '')

  const keycloakId = computed(() =>
    decodedToken.value?.sub || decodedToken.value?.sid || decodedToken.value?.email || ''
  )

  function login(returnPath) {
    const redirectUri = window.location.origin + (returnPath || window.location.pathname)
    keycloak.value?.login({ redirectUri })
  }

  function logout() {
    keycloak.value?.logout({ redirectUri: window.location.origin })
  }

  async function getAccessToken() {
    return await getToken()
  }

  return {
    isAuthenticated,
    decodedToken,
    userName,
    keycloakId,
    login,
    logout,
    getAccessToken
  }
})
