<script setup>
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/features/auth/stores/auth'
import { useProfileStore } from '@/features/profile/stores/profile'
import { usePermissionsStore } from '@/features/auth/stores/permissions'
import { apiUrl } from '@/api'

const auth = useAuthStore()
const profile = useProfileStore()
const permissionsStore = usePermissionsStore()
const menuOpen = ref(false)
const pictureFailed = ref(false)

watch(() => profile.pictureVersion, () => {
  pictureFailed.value = false
})

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function closeMenu() {
  menuOpen.value = false
}
</script>

<template>
  <nav class="bg-white shadow-sm border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-16">
        <div class="flex items-center">
          <RouterLink to="/" class="text-xl font-bold text-indigo-600">
            Thuddle
          </RouterLink>
        </div>
        <div class="flex items-center">
          <RouterLink
            data-testid="event-create-btn"
            v-if="auth.isAuthenticated && permissionsStore.hasPermission('events:write')"
            to="/events/create"
            class="mr-4 inline-flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-indigo-700 transition"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Event
          </RouterLink>
          <template v-if="auth.isAuthenticated">
            <span data-testid="user-display-name" class="text-sm text-gray-600 mr-3">{{ permissionsStore.displayName || auth.userName }}</span>
            <div class="relative">
              <button
                data-testid="nav-menu-btn"
                @click="toggleMenu"
                class="flex items-center gap-1 rounded-full p-0.5 hover:ring-2 hover:ring-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                title="Menu"
              >
                <img
                  v-if="auth.keycloakId && !pictureFailed"
                  :src="apiUrl(`/api/profile/picture/${auth.keycloakId}?v=${profile.pictureVersion}`)"
                  alt=""
                  class="w-8 h-8 rounded-full object-cover"
                  @error="pictureFailed = true"
                />
                <svg
                  v-else
                  class="w-8 h-8 text-gray-300 rounded-full bg-gray-100 p-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <div
                v-if="menuOpen"
                @click="closeMenu"
                class="fixed inset-0 z-10"
              />
              <div
                v-if="menuOpen"
                class="absolute right-0 mt-2 w-40 bg-white rounded-md shadow-lg ring-1 ring-black/5 z-20 py-1"
              >
                <RouterLink
                  data-testid="nav-profile-link"
                  to="/profile"
                  class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  @click="closeMenu"
                >
                  Profile
                </RouterLink>
                <button
                  data-testid="auth-logout-btn"
                  @click="auth.logout()"
                  class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </template>
          <template v-else>
            <button
              data-testid="auth-login-btn"
              @click="auth.login()"
              class="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm hover:bg-indigo-700"
            >
              Sign In
            </button>
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>
