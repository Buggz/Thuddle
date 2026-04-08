<script setup>
import { RouterView } from 'vue-router'
import { useKeycloak } from '@josempgon/vue-keycloak'
import AppNavbar from '@/features/layout/AppNavbar.vue'

const { isPending } = useKeycloak()
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <AppNavbar />
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div v-if="isPending" class="text-center py-12 text-gray-400">Loading...</div>
      <RouterView v-else />
    </main>
  </div>
</template>
