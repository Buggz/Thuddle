<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/features/auth/stores/auth'
import { apiUrl } from '@/api'

const auth = useAuthStore()
const menuOpen = ref(false)

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
          <RouterLink
            v-if="auth.isAuthenticated"
            to="/dashboard"
            class="ml-8 text-gray-600 hover:text-gray-900"
          >
            Dashboard
          </RouterLink>
        </div>
        <div class="flex items-center">
          <template v-if="auth.isAuthenticated">
            <span class="text-sm text-gray-600 mr-3">{{ auth.userName }}</span>
            <div class="relative">
              <button
                @click="toggleMenu"
                class="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 hover:bg-gray-100 transition focus:outline-none"
                title="Menu"
              >
                <img
                  v-if="auth.keycloakId"
                  :src="apiUrl(`/api/profile/picture/${auth.keycloakId}`)"
                  alt=""
                  class="w-8 h-8 rounded-full object-cover"
                  @error="$event.target.style.display='none'"
                />
                <svg
                  v-else
                  class="w-8 h-8 text-gray-300 rounded-full bg-gray-100 p-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                </svg>
                <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <circle cx="12" cy="12" r="3" />
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
                  to="/profile"
                  class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  @click="closeMenu"
                >
                  Profile
                </RouterLink>
                <button
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
