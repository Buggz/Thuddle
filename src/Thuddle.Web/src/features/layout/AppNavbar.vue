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
  <nav class="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <!-- Logo -->
        <div class="flex items-center">
          <RouterLink to="/" class="flex items-center gap-3 pr-2 group">
            <img src="@/assets/logo.svg" alt="Thuddle Logo" class="w-10 h-10 group-hover:scale-105 transition-transform drop-shadow-sm" />
            <span class="text-2xl font-extrabold text-purple-700 tracking-tight">
              Thuddle
            </span>
          </RouterLink>
        </div>

        <!-- Right Side Nav -->
        <div class="flex items-center gap-4">
          <RouterLink
            data-testid="event-create-btn"
            v-if="auth.isAuthenticated && permissionsStore.hasPermission('events:write')"
            to="/events/create"
            class="hidden sm:inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-indigo-500 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Event
          </RouterLink>

          <template v-if="auth.isAuthenticated">
            <div class="hidden md:block w-px h-6 bg-gray-200"></div>
            
            <!-- User Menu -->
            <div class="relative flex items-center gap-3">
              <span data-testid="user-display-name" class="hidden sm:block text-sm font-semibold text-gray-700">
                {{ permissionsStore.displayName || auth.userName }}
              </span>
              
              <div>
                <button
                  data-testid="nav-menu-btn"
                  @click="toggleMenu"
                  class="flex items-center gap-1.5 rounded-full p-1 border border-transparent hover:bg-gray-100 hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  title="Menu"
                >
                  <img
                    v-if="auth.keycloakId && !pictureFailed"
                    :src="apiUrl(`/api/profile/picture/${auth.keycloakId}?v=${profile.pictureVersion}`)"
                    alt=""
                    class="w-8 h-8 rounded-full object-cover ring-2 ring-white shadow-sm"
                    @error="pictureFailed = true"
                  />
                  <div
                    v-else
                    class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-sm ring-2 ring-white"
                  >
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                    </svg>
                  </div>
                  <svg class="w-4 h-4 text-gray-400 mr-1" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                
                <div
                  v-if="menuOpen"
                  @click="closeMenu"
                  class="fixed inset-0 z-40"
                />
                
                <Transition
                  enter-active-class="transition ease-out duration-100"
                  enter-from-class="transform opacity-0 scale-95 origin-top-right"
                  enter-to-class="transform opacity-100 scale-100 origin-top-right"
                  leave-active-class="transition ease-in duration-75"
                  leave-from-class="transform opacity-100 scale-100 origin-top-right"
                  leave-to-class="transform opacity-0 scale-95 origin-top-right"
                >
                  <div
                    v-if="menuOpen"
                    class="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 ring-1 ring-black/5 z-50 p-2"
                  >
                    <RouterLink
                      data-testid="nav-profile-link"
                      to="/profile"
                      class="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                      @click="closeMenu"
                    >
                      <svg class="w-4 h-4 opacity-70" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                      </svg>
                      Profile Options
                    </RouterLink>
                    
                    <div class="h-px bg-gray-100 my-1"></div>
                    
                    <button
                      data-testid="auth-logout-btn"
                      @click="auth.logout()"
                      class="flex items-center gap-2 w-full text-left px-3 py-2 text-sm font-medium text-rose-600 rounded-xl hover:bg-rose-50 transition-colors"
                    >
                      <svg class="w-4 h-4 opacity-70" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
          </template>
          
          <template v-else>
            <button
              data-testid="auth-login-btn"
              @click="auth.login()"
              class="bg-indigo-600 text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:bg-indigo-500 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Sign In
            </button>
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>
