<script setup>
import { computed, watch } from 'vue'
import { RouterView } from 'vue-router'
import { useKeycloak } from '@josempgon/vue-keycloak'
import AppNavbar from '@/features/layout/AppNavbar.vue'
import AppLoadingScreen from '@/shared/components/AppLoadingScreen.vue'
import { usePermissionsStore } from '@/features/auth/stores/permissions'
import { useNotificationsStore } from '@/features/notifications/stores/notifications'

const { isPending, isAuthenticated } = useKeycloak()
const permissionsStore = usePermissionsStore()
const notificationsStore = useNotificationsStore()

watch(isAuthenticated, (authenticated) => {
  if (authenticated) {
    permissionsStore.load()
    notificationsStore.subscribeRealtime()
  } else {
    notificationsStore.reset()
  }
}, { immediate: true })

const appReady = computed(() => {
  if (isPending.value) return false
  if (isAuthenticated.value && !permissionsStore.loaded) return false
  return true
})
</script>

<template>
  <AppLoadingScreen v-if="!appReady" />
  <div v-else class="min-h-screen bg-gray-50">
    <AppNavbar />
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <RouterView />
    </main>
  </div>
</template>
