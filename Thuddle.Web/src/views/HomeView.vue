<script setup>
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="text-center py-12">
    <h1 class="text-4xl font-bold text-gray-900 mb-4">Welcome to Thuddle</h1>
    <p class="text-lg text-gray-600 mb-8">
      A modern application built with .NET Aspire, Vue.js, and Keycloak.
    </p>
    <button
      v-if="!auth.isAuthenticated"
      @click="auth.login()"
      class="bg-indigo-600 text-white px-6 py-3 rounded-lg text-lg hover:bg-indigo-700 transition"
    >
      Get Started
    </button>
    <div v-else class="text-gray-600">
      <p>You are signed in as <strong>{{ auth.userName }}</strong>.</p>
      <RouterLink
        to="/dashboard"
        class="mt-4 inline-block bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition"
      >
        Go to Dashboard
      </RouterLink>
    </div>
  </div>
</template>
