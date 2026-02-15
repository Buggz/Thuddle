<script setup>
import { RouterView, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="min-h-screen bg-gray-50">
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
              <span class="text-sm text-gray-600 mr-4">{{ auth.userName }}</span>
              <button
                @click="auth.logout()"
                class="bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-200"
              >
                Sign Out
              </button>
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
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <RouterView />
    </main>
  </div>
</template>
